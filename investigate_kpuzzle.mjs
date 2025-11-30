import { puzzles } from "cubing/puzzles";
import { KPuzzle } from "cubing/kpuzzle";
import { Alg } from "cubing/alg";

(async () => {
    try {
        console.log("Loading 3x3x3 puzzle...");
        const def = await puzzles["3x3x3"].kpuzzle();
        console.log("Definition keys:", Object.keys(def));
        
        console.log("Creating KPuzzle instance with def.definition...");
        const puzzle = new KPuzzle(def.definition);
        
        console.log("Getting default pattern...");
        const pattern = puzzle.defaultPattern();
        
        console.log("Pattern toJSON:", JSON.stringify(pattern.toJSON(), null, 2));
        
        const alg = new Alg("R");
        console.log("Alg:", alg.toString());
        
        const transformation = puzzle.algToTransformation(alg);
        console.log("Transformation created.");
        
        if (pattern.apply) {
            console.log("Applying transformation to pattern...");
            const newPattern = pattern.apply(transformation);
            console.log("New Pattern created.");
            console.log("New Pattern toJSON:", JSON.stringify(newPattern.toJSON(), null, 2));
        }

    } catch (e) {
        console.error("Error:", e);
    }
})();
