import { puzzles } from "cubing/puzzles";

async function testApplyAlg() {
    const kp = await puzzles['3x3x3'].kpuzzle();
    
    console.log("=== TEST: applyAlg preserves patternData ===\n");
    
    // Get initial solved state
    const solved = kp.defaultPattern();
    console.log("1. Solved pattern has patternData?", !!solved.patternData);
    console.log("   Keys:", Object.keys(solved));
    
    // Apply a single move
    const afterR = solved.applyAlg("R");
    console.log("\n2. After applying 'R':");
    console.log("   Has patternData?", !!afterR.patternData);
    console.log("   Keys:", Object.keys(afterR));
    console.log("   Type:", afterR.constructor.name);
    
    // Apply inverse to return to solved
    const backToSolved = afterR.applyAlg("R'");
    console.log("\n3. After applying \"R'\" (should be solved):");
    console.log("   Has patternData?", !!backToSolved.patternData);
    console.log("   IsIdentical to solved?", backToSolved.isIdentical(solved));
    
    // Test experimentalIsPatternSolved
    console.log("\n4. Testing experimentalIsPatternSolved:");
    try {
        if (backToSolved.patternData) {
            const isSolved = kp.definition.experimentalIsPatternSolved(backToSolved.patternData, {
                ignorePuzzleOrientation: true
            });
            console.log("   Result:", isSolved);
        } else {
            console.log("   ❌ Cannot test - patternData is undefined!");
        }
    } catch (e) {
        console.log("   ❌ Error:", e.message);
    }
}

testApplyAlg();
