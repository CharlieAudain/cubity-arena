import { randomScrambleForEvent } from "cubing/scramble";

async function testScramble() {
    try {
        const scramble = await randomScrambleForEvent("333");
        console.log("Scramble generated:", scramble.toString());
    } catch (e) {
        console.error("Scramble generation failed:", e);
        process.exit(1);
    }
}

testScramble();
