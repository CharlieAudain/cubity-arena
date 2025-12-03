import { randomScrambleForEvent } from "cubing/scramble";

export const generateScramble = async (type: string = '3x3'): Promise<string> => {
    // Map UI types to WCA Event IDs
    const eventMap: Record<string, string> = {
        '3x3': '333',
        '2x2': '222',
        '4x4': '444',
        'Pyraminx': 'pyr',
        'Megaminx': 'minx',
        'Skewb': 'skewb'
    };

    const eventId = eventMap[type] || '333';
    
    try {
        // Generate WCA-compliant random-state scramble
        const scramble = await randomScrambleForEvent(eventId);
        return scramble.toString();
    } catch (e) {
        console.error("Scramble generation failed", e);
        return "R U R' U'"; // Fail-safe fallback
    }
};

export const getDailySeed = (): number => {
  const now = new Date();
  return parseInt(`${now.getFullYear()}${now.getMonth() + 1}${now.getDate()}`);
};
