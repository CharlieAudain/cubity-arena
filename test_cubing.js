import { puzzles } from "cubing/puzzles";

const p = puzzles['3x3x3'];
console.log("KPuzzle Type:", typeof p.kpuzzle);

try {
    const kpPromise = p.kpuzzle();
    kpPromise.then(kp => {
        console.log("Resolved KPuzzle:", kp);
        console.log("Keys:", Object.keys(kp));
        console.log("Definition Keys:", Object.keys(kp.definition));
        // Try to find defaultPattern
        if (typeof kp.defaultPattern === 'function') {
            console.log("kp.defaultPattern() result:", kp.defaultPattern());
        } else {
            console.log("kp.defaultPattern is:", kp.defaultPattern);
        }
    });
} catch (e) {
    console.log("KPuzzle() failed:", e.message);
}

try {
    const kp = new p.kpuzzle();
    console.log("new KPuzzle() result:", kp);
    console.log("Has defaultPattern?", kp.defaultPattern);
} catch (e) {
    console.log("new KPuzzle() failed:", e.message);
}
