import { puzzles } from "cubing/puzzles";
import { KPuzzle } from "cubing/kpuzzle";
import { Alg } from "cubing/alg";

(async () => {
    try {
       
        const def = await puzzles["3x3x3"].kpuzzle();
        
        
     
        const puzzle = new KPuzzle(def.definition);
        
       
        const pattern = puzzle.defaultPattern();
        
        
        
        const alg = new Alg("R");
       
        
        const transformation = puzzle.algToTransformation(alg);
      
        
        if (pattern.apply) {
            const newPattern = pattern.apply(transformation);
            
        }

    } catch (e) {
        console.error("Error:", e);
    }
})();
