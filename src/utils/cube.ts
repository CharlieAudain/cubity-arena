import { puzzles } from "cubing/puzzles";
import { Alg } from "cubing/alg";
// Scramble logic moved to src/utils/scramble.ts

// --- UTILS: CUBE ENGINE (Refactored to use cubing.js) ---

export const getInitialState = async (type: string) => {
  // Return the default pattern for the puzzle type
  const puzzleId = type === '2x2' ? '2x2x2' : type === '4x4' ? '4x4x4' : '3x3x3';
  const puzzle = puzzles[puzzleId];
  const kp = await puzzle.kpuzzle();
  return kp.defaultPattern();
};

export const getSolvedState = async (size: number) => {
  // Helper to get solved state based on size (mapped to type)
  const type = size === 2 ? '2x2' : size === 4 ? '4x4' : '3x3';
  return getInitialState(type);
};



// --- LOGICAL CUBE ENGINE ---
// Lightweight state tracking using Kociemba facelet strings.

const PERMUTATIONS: Record<string, { cycles: number[][] }> = {
    U: { cycles: [[0, 2, 8, 6], [1, 5, 7, 3], [9, 36, 27, 18], [10, 37, 28, 19], [11, 38, 29, 20]] },
    L: { cycles: [[9, 11, 17, 15], [10, 14, 16, 12], [0, 18, 45, 36], [3, 21, 48, 39], [6, 24, 51, 42]] },
    F: { cycles: [[18, 20, 26, 24], [19, 23, 25, 21], [6, 27, 47, 17], [7, 30, 46, 14], [8, 33, 45, 11]] },
    R: { cycles: [[27, 29, 35, 33], [28, 32, 34, 30], [8, 44, 53, 26], [5, 41, 50, 23], [2, 38, 47, 20]] },
    B: { cycles: [[36, 38, 44, 42], [37, 41, 43, 39], [2, 9, 51, 35], [1, 12, 52, 32], [0, 15, 53, 29]] },
    D: { cycles: [[45, 47, 53, 51], [46, 50, 52, 48], [15, 24, 33, 42], [16, 25, 34, 43], [17, 26, 35, 44]] }
};

const applyCycles = (str: string, cycles: number[][], inverse: boolean = false): string => {
    if (!str) return str;
    const arr = str.split('');
    const newArr = [...arr];
    cycles.forEach(cycle => {
        const len = cycle.length;
        for (let i = 0; i < len; i++) {
            const from = cycle[i];
            const to = cycle[(i + (inverse ? -1 : 1) + len) % len];
            newArr[to] = arr[from];
        }
    });
    return newArr.join('');
};

export const applyMoveToFacelets = (facelets: string, move: string): string => {
    if (!facelets) return facelets;
    const baseMove = move.replace("'", "").replace("2", "");
    const isInverse = move.includes("'");
    const isDouble = move.includes("2");

    if (!PERMUTATIONS[baseMove]) return facelets;

    let state = facelets;
    if (isDouble) {
        state = applyCycles(state, PERMUTATIONS[baseMove].cycles, false);
        state = applyCycles(state, PERMUTATIONS[baseMove].cycles, false);
    } else {
        state = applyCycles(state, PERMUTATIONS[baseMove].cycles, isInverse);
    }
    return state;
};

// Initial Solved State (Kociemba Order: U R F D L B)
export const SOLVED_FACELETS = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

export const isStateSolved = (state: any): boolean => {
  if (!state) return false;
  
  try {
    // Use isIdentical - this is the reliable method confirmed by testing
    const puzzle = state.kpuzzle;
    const defaultPattern = puzzle.defaultPattern();
    const result = state.isIdentical(defaultPattern);
    
    // Diagnostic logging for failed checks
    if (!result) {
      console.log("[cube.ts] isStateSolved: FALSE");
      // console.log("  Current state EDGES pieces:", state.patternData?.EDGES?.pieces?.slice(0, 4));
      // console.log("  Solved state EDGES pieces:", defaultPattern.patternData?.EDGES?.pieces?.slice(0, 4));
    }
    
    return result;
  } catch (e) {
    console.error("[cube.ts] isStateSolved error:", e);
    return false;
  }
};

export const applyCubeMove = (state: any, move: string, type?: string): any => {
  if (!state) return null;
  
  try {
    if (state.apply) {
        const alg = new Alg(move);
        return state.apply(alg);
    }
    console.warn("[cube.ts] state.apply is missing. State:", state);
    return state;
  } catch (e: any) {
    console.error(`[cube.ts] Failed to apply move "${move}":`, e.message);
    return state;
  }
};

export const getInverseMove = (move: string): string => {
  if (move.includes("2")) return move; // R2' is just R2
  if (move.includes("'")) return move.replace("'", ""); // R' -> R
  return move + "'"; // R -> R'
};

const areIndependent = (b1: string, b2: string): boolean => {
    const pairs = [['R','L'], ['U','D'], ['F','B']];
    return pairs.some(p => (p[0] === b1 && p[1] === b2) || (p[0] === b2 && p[1] === b1));
};

export const simplifyMoveStack = (stack: string[], newMove: string): string[] => {
    // 1. Add new move
    let moves = [...stack, newMove];
    
    // 2. Optimize iteratively until no changes
    let changed = true;
    while (changed) {
        changed = false;
        const newMoves: string[] = [];
        
        for (let i = 0; i < moves.length; i++) {
            if (i === moves.length - 1) {
                newMoves.push(moves[i]);
                break;
            }

            const m1 = moves[i];
            const m2 = moves[i+1];
            
            const base1 = m1.replace(/['2]/g, '');
            const base2 = m2.replace(/['2]/g, '');
            
            // Same base? Merge.
            if (base1 === base2) {
                const getPower = (m: string) => {
                    if (m.includes("2")) return 2;
                    if (m.includes("'")) return -1;
                    return 1;
                };
                let sum = (getPower(m1) + getPower(m2)) % 4;
                if (sum <= -2) sum += 4;
                if (sum === 3 || sum === -1) sum = -1;
                
                if (sum === 0) {
                    // Cancelled out completely
                    i++; // Skip both
                    changed = true;
                } else {
                    // Merged
                    const suffix = sum === 2 ? "2" : sum === -1 ? "'" : "";
                    newMoves.push(base1 + suffix);
                    i++; // Skip both (replaced by one)
                    changed = true;
                }
            } 
            // Independent axes? Check if we can swap to merge with next
            else if (areIndependent(base1, base2)) {
                // Look ahead to i+2
                if (i + 2 < moves.length) {
                    const m3 = moves[i+2];
                    const base3 = m3.replace(/['2]/g, '');
                    if (base1 === base3) {
                        // m1 and m3 can merge! Swap m1 and m2.
                        // We don't merge here, just swap and let next iteration handle merge
                        newMoves.push(m2);
                        newMoves.push(m1);
                        i++; // Skip m2 (pushed m2 then m1)
                        changed = true;
                        // Continue loop from i+2 next time? 
                        // Actually we just swapped. m1 is now at i+1.
                        // Let's just restart the loop or let the next pass handle it.
                        // Pushing m2, m1 effectively swaps them in the new array.
                        // The loop continues processing from i+2.
                    } else {
                        newMoves.push(m1);
                    }
                } else {
                    newMoves.push(m1);
                }
            } else {
                newMoves.push(m1);
            }
        }
        moves = newMoves;
    }
    return moves;
};
