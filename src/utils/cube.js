// --- UTILS: SCRAMBLE GENERATORS ---
export const generateScramble = (type = '3x3', seed = null) => {
  const moves3x3 = ['R', 'L', 'U', 'D', 'F', 'B'];
  const moves2x2 = ['R', 'U', 'F']; 
  const moves4x4 = ['R', 'L', 'U', 'D', 'F', 'B', 'Rw', 'Lw', 'Uw', 'Dw', 'Fw', 'Bw']; 
  const modifiers = ['', "'", '2'];
  
  let moves = moves3x3;
  let length = 20;

  if (type === '2x2') { moves = moves2x2; length = 9; }
  if (type === '4x4') { moves = moves4x4; length = 40; }

  let scramble = [];
  let lastMove = '';
  let secondLastMove = '';

  const pseudoRandom = () => {
    if (seed) {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    }
    return Math.random();
  };

  const getBaseMove = (m) => m.replace(/[w']/g, '');

  for (let i = 0; i < length; i++) {
    let moveIndex = Math.floor(pseudoRandom() * moves.length);
    let move = moves[moveIndex];
    
    while (
      getBaseMove(move) === getBaseMove(lastMove) || 
      (getBaseMove(move) === getBaseMove(secondLastMove) && isOpposite(getBaseMove(move), getBaseMove(lastMove)))
    ) {
      moveIndex = Math.floor(pseudoRandom() * moves.length);
      move = moves[moveIndex];
    }
    
    const mod = modifiers[Math.floor(pseudoRandom() * modifiers.length)];
    scramble.push(move + mod);
    secondLastMove = lastMove;
    lastMove = move;
  }
  return scramble.join(' ');
};

const isOpposite = (m1, m2) => {
  const pairs = { R: 'L', L: 'R', U: 'D', D: 'U', F: 'B', B: 'F', Rw: 'Lw', Lw: 'Rw', Uw: 'Dw', Dw: 'Uw', Fw: 'Bw', Bw: 'Fw' };
  return pairs[m1] === m2;
};

export const getDailySeed = () => {
  const now = new Date();
  return parseInt(`${now.getFullYear()}${now.getMonth() + 1}${now.getDate()}`);
};

import { puzzles } from "cubing/puzzles";

// --- UTILS: CUBE ENGINE (Refactored to use cubing.js) ---

export const getInitialState = async (type) => {
  // Return the default pattern for the puzzle type
  const puzzleId = type === '2x2' ? '2x2x2' : type === '4x4' ? '4x4x4' : '3x3x3';
  const puzzle = puzzles[puzzleId];
  const kp = await puzzle.kpuzzle();
  return kp.defaultPattern();
};

export const getSolvedState = async (size) => {
  // Helper to get solved state based on size (mapped to type)
  const type = size === 2 ? '2x2' : size === 4 ? '4x4' : '3x3';
  return getInitialState(type);
};

export const isStateSolved = (state) => {
  if (!state) return false;
  
  try {
    const puzzle = state.kpuzzle;
    
    // Use the puzzle's built-in solved check if available
    if (puzzle.definition?.experimentalIsPatternSolved && state.patternData) {
      try {
        return puzzle.definition.experimentalIsPatternSolved(state.patternData, {
          ignorePuzzleOrientation: true
        });
      } catch (expError) {
        // Fall through to isIdentical
      }
    }
    
    // Fallback to isIdentical
    const defaultPattern = puzzle.defaultPattern();
    return state.isIdentical(defaultPattern);
  } catch (e) {
    console.error("[isStateSolved] Error:", e);
    return false;
  }
};

export const applyCubeMove = (state, move, type) => {
  if (!state) return null;
  // Apply move to the KPattern
  try {
      // cubing.js expects moves like "R", "R'", "R2"
      // Our move input is already in standard notation.
      return state.applyAlg(move);
  } catch (e) {
      console.error("Invalid move applied:", move, e);
      return state;
  }
};

export const getInverseMove = (move) => {
  if (move.includes("2")) return move; // R2' is just R2
  if (move.includes("'")) return move.replace("'", ""); // R' -> R
  return move + "'"; // R -> R'
};

export const simplifyMoveStack = (stack, newMove) => {
    // 1. Add new move
    let moves = [...stack, newMove];
    
    // 2. Optimize iteratively until no changes
    let changed = true;
    while (changed) {
        changed = false;
        const newMoves = [];
        
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
                const getPower = (m) => {
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

const areIndependent = (b1, b2) => {
    const pairs = [['R','L'], ['U','D'], ['F','B']];
    return pairs.some(p => (p[0] === b1 && p[1] === b2) || (p[0] === b2 && p[1] === b1));
};
