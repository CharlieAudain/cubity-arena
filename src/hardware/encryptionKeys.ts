/**
 * Encryption keys for smart cube protocols.
 * 
 * These keys are used for AES encryption/decryption of Bluetooth data.
 * Different cube manufacturers use different encryption schemes:
 * - GAN: MAC-based key derivation (V2/V3/V4)
 * - Moyu: MAC-based key derivation
 * - QiYi: MAC-based key derivation
 * - GoCube: No encryption (plaintext protocol)
 */

/**
 * GAN Cube Encryption Keys (Compressed)
 * They must be decompressed using LZString before use.
 */
export const GAN_KEYS = [
  "NoRgnAHANATADDWJYwMxQOxiiEcfYgSK6Hpr4TYCs0IG1OEAbDszALpA",
  "NoNg7ANATFIQnARmogLBRUCs0oAYN8U5J45EQBmFADg0oJAOSlUQF0g",
  "NoRgNATGBs1gLABgQTjCeBWSUDsYBmKbCeMADjNnXxHIoIF0g",
  "NoRg7ANAzBCsAMEAsioxBEIAc0Cc0ATJkgSIYhXIjhMQGxgC6QA",
  "NoVgNAjAHGBMYDYCcdJgCwTFBkYVgAY9JpJYUsYBmAXSA",
  "NoRgNAbAHGAsAMkwgMyzClH0LFcArHnAJzIqIBMGWEAukA"
];

/**
 * GAN Cube Encryption Keys (Decompressed)
 * 
 * These are the decompressed keys for reference.
 * GanDriver uses the compressed GAN_KEYS and decompresses them.
 * 
 * Key indices:
 * - [0]: GAN V1 Key
 * - [1]: GAN V1 IV  
 * - [2]: GAN V2/V3/V4 Key
 * - [3]: GAN V2/V3/V4 IV
 * - [4]: AiCube Key
 * - [5]: AiCube IV
 */
export const GAN_ENCRYPTION_KEYS: number[][] = [
  [198, 202, 21, 223, 79, 110, 19, 182, 119, 13, 230, 89, 58, 175, 186, 162], // 0: V1 Key
  [67, 226, 91, 214, 125, 220, 120, 216, 7, 96, 163, 218, 130, 60, 1, 241],   // 1: V1 IV
  [1, 2, 66, 40, 49, 145, 22, 7, 32, 5, 24, 84, 66, 17, 18, 83],              // 2: V2/V3/V4 Key
  [17, 3, 50, 40, 33, 1, 118, 39, 32, 149, 120, 20, 50, 18, 2, 67],           // 3: V2/V3/V4 IV
  [5, 18, 2, 69, 2, 1, 41, 86, 18, 120, 18, 118, 129, 1, 8, 3],               // 4: AiCube Key
  [1, 68, 40, 6, 134, 33, 34, 40, 81, 5, 8, 49, 130, 2, 33, 6],               // 5: AiCube IV
];

/**
 * Moyu Cube Encryption Keys
 * TODO: Extract from cstimerMoyu.js
 */
export const MOYU_ENCRYPTION_KEYS: number[][] = [
  // Placeholder - to be populated
];

/**
 * QiYi Cube Encryption Keys
 * TODO: Extract from cstimerQiyi.js
 */
export const QIYI_ENCRYPTION_KEYS: number[][] = [
  // Placeholder - to be populated
];

/**
 * Derive an encryption key from a base key and MAC address.
 * This is the standard key derivation algorithm used by GAN, Moyu, and QiYi cubes.
 * 
 * @param baseKey - The base encryption key (16 bytes)
 * @param baseIV - The base initialization vector (16 bytes)
 * @param macBytes - The MAC address as an array of 6 bytes
 * @returns Object containing the derived key and IV
 * 
 * @example
 * ```typescript
 * const macBytes = [0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF];
 * const { key, iv } = deriveKey(GAN_ENCRYPTION_KEYS[2], GAN_ENCRYPTION_KEYS[3], macBytes);
 * ```
 */
export function deriveKey(
  baseKey: number[],
  baseIV: number[],
  macBytes: number[]
): { key: number[]; iv: number[] } {
  const key = [...baseKey];
  const iv = [...baseIV];

  // XOR the first 6 bytes of the key/IV with the MAC address (reversed)
  for (let i = 0; i < 6; i++) {
    key[i] = (key[i] + macBytes[5 - i]) % 255;
    iv[i] = (iv[i] + macBytes[5 - i]) % 255;
  }

  return { key, iv };
}

/**
 * Parse a MAC address string into an array of bytes.
 * 
 * @param mac - MAC address string (format: "AA:BB:CC:DD:EE:FF")
 * @returns Array of 6 bytes
 * 
 * @example
 * ```typescript
 * const macBytes = parseMacAddress("AA:BB:CC:DD:EE:FF");
 * // Returns: [170, 187, 204, 221, 238, 255]
 * ```
 */
export function parseMacAddress(mac: string): number[] {
  return mac.split(':').map((byte) => parseInt(byte, 16));
}
