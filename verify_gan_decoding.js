
// Mocking the decoding logic from GanDriver.ts
function parseMove(decrypted) {
    // Convert to bit string (mocking toBitString)
    let bits = "";
    for (let i = 0; i < decrypted.length; i++) {
        bits += decrypted[i].toString(2).padStart(8, '0');
    }

    // Decoding Logic
    // const pow = parseInt(bits.slice(64, 66), 2);
    // const axisRaw = parseInt(bits.slice(66, 72), 2);
    
    // Wait, bits index is global.
    // Byte 0: 0-7
    // Byte 8: 64-71
    // Byte 9: 72-79
    
    // bits.slice(64, 66) is the first 2 bits of Byte 8.
    // bits.slice(66, 72) is the next 6 bits of Byte 8.
    
    // So Byte 8 contains both Power and Axis?
    // Let's verify:
    // Byte 8 = [P P A A A A A A] ? No, 2+6=8.
    // Yes.
    
    const byte8 = decrypted[8];
    const pow = (byte8 >> 6) & 0x03; // Top 2 bits
    const axisRaw = byte8 & 0x3F;    // Bottom 6 bits
    
    // GanDriver uses string slicing which is safer if endianness/bit order is weird,
    // but let's check if my bitwise logic matches the string slicing.
    // bits string is Big Endian per byte? "00000000"
    // bits.slice(0, 8) is Byte 0.
    // bits.slice(64, 72) is Byte 8.
    // bits.slice(64, 66) is top 2 bits of Byte 8.
    // bits.slice(66, 72) is bottom 6 bits of Byte 8.
    // So yes, my bitwise logic is correct assuming standard byte packing.

    const axisMap = [2, 32, 8, 1, 16, 4];
    const axis = axisMap.indexOf(axisRaw);
    
    if (axis === -1) return "INVALID_AXIS";
    
    const moveChar = "URFDLB".charAt(axis);
    const powerChar = " '".charAt(pow); // 0='', 1=' (Wait, 2 is '2'?)
    
    // GanDriver: " '".charAt(pow)
    // If pow is 2, charAt(2) is empty string?
    // Wait. " '".length is 2. Index 0 is ' ', Index 1 is "'".
    // What about double moves?
    
    // Let's check GanDriver again.
    // if (pow < 0 || pow > 2) return null;
    // const moveStr = "URFDLB".charAt(axis) + " '".charAt(pow);
    
    // If pow=0 -> " " (trim -> "") -> "U"
    // If pow=1 -> "'" -> "U'"
    // If pow=2 -> "" (charAt(2) is empty) -> "U" ???
    
    // THIS LOOKS LIKE A BUG!
    // If pow=2 (Double move), it returns "U".
    // It should be "2".
    
    let suffix = "";
    if (pow === 0) suffix = "";
    else if (pow === 1) suffix = "'";
    else if (pow === 2) suffix = "2";
    else return "INVALID_POW";

    return moveChar + suffix;
}

// Test Cases
const AXIS_CODES = {
    U: 2,
    R: 32,
    F: 8,
    D: 1,
    L: 16,
    B: 4
};

const POW_CODES = {
    CW: 0,
    CCW: 1,
    DOUBLE: 2
};

console.log("--- Verifying GAN V4 Move Decoding ---");

let failures = 0;

for (const [axisName, axisCode] of Object.entries(AXIS_CODES)) {
    for (const [powName, powCode] of Object.entries(POW_CODES)) {
        const byte8 = (powCode << 6) | axisCode;
        const decrypted = new Uint8Array(20);
        decrypted[8] = byte8;
        
        const result = parseMove(decrypted);
        
        let expectedSuffix = "";
        if (powName === 'CCW') expectedSuffix = "'";
        if (powName === 'DOUBLE') expectedSuffix = "2";
        
        const expected = axisName + expectedSuffix;
        
        if (result === expected) {
            console.log(`✅ ${axisName} ${powName} -> ${result}`);
        } else {
            console.error(`❌ ${axisName} ${powName} -> Expected ${expected}, Got ${result}`);
            failures++;
        }
    }
}

if (failures === 0) {
    console.log("\n✅ All tests passed!");
} else {
    console.error(`\n❌ ${failures} tests failed.`);
}
