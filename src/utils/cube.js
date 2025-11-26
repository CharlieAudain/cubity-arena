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

// --- UTILS: CUBE ENGINE ---
export const getInitialState = (type) => {
  const size = type === '2x2' ? 2 : type === '4x4' ? 4 : 3;
  return getSolvedState(size);
};

export const getSolvedState = (size) => {
  const stickersPerFace = size * size;
  const colors = ['#ffffff', '#ef4444', '#22c55e', '#eab308', '#f97316', '#3b82f6'];
  return colors.map(c => Array(stickersPerFace).fill(c));
};

const rotateFace = (face, size) => {
  const newFace = [...face];
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      newFace[j * size + (size - 1 - i)] = face[i * size + j];
    }
  }
  return newFace;
};

const rotateFaceCounter = (face, size) => {
  let f = face;
  f = rotateFace(f, size);
  f = rotateFace(f, size);
  f = rotateFace(f, size);
  return f;
};

export const applyCubeMove = (state, move, type) => {
  const size = type === '2x2' ? 2 : type === '4x4' ? 4 : 3;
  let newState = state.map(f => [...f]); 
  
  const base = move.replace(/['2w]/g, '');
  const isPrime = move.includes("'");
  const isDouble = move.includes("2");
  
  const getRow = (faceIdx, rowIdx) => {
    const start = rowIdx * size;
    return newState[faceIdx].slice(start, start + size);
  };
  const setRow = (faceIdx, rowIdx, data) => {
    const start = rowIdx * size;
    for(let i=0; i<size; i++) newState[faceIdx][start+i] = data[i];
  };
  
  const getCol = (faceIdx, colIdx) => {
    let col = [];
    for(let i=0; i<size; i++) col.push(newState[faceIdx][i * size + colIdx]);
    return col;
  };
  const setCol = (faceIdx, colIdx, data) => {
    for(let i=0; i<size; i++) newState[faceIdx][i * size + colIdx] = data[i];
  };

  const cycle = (arrs, rev = false) => {
    if (rev) {
      const temp = arrs[3];
      arrs[3] = arrs[2];
      arrs[2] = arrs[1];
      arrs[1] = arrs[0];
      arrs[0] = temp;
    } else {
      const temp = arrs[0];
      arrs[0] = arrs[1];
      arrs[1] = arrs[2];
      arrs[2] = arrs[3];
      arrs[3] = temp;
    }
    return arrs;
  };

  const turns = isDouble ? 2 : 1;

  for (let t = 0; t < turns; t++) {
    if (base === 'U') {
      newState[0] = isPrime ? rotateFaceCounter(newState[0], size) : rotateFace(newState[0], size);
      let sides = [getRow(2,0), getRow(4,0), getRow(5,0), getRow(1,0)]; 
      sides = cycle(sides, !isPrime);
      setRow(2,0, sides[0]); setRow(4,0, sides[1]); setRow(5,0, sides[2]); setRow(1,0, sides[3]);
    }
    else if (base === 'D') {
      newState[3] = isPrime ? rotateFaceCounter(newState[3], size) : rotateFace(newState[3], size);
      let sides = [getRow(2, size-1), getRow(1, size-1), getRow(5, size-1), getRow(4, size-1)];
      sides = cycle(sides, !isPrime);
      setRow(2, size-1, sides[0]); setRow(1, size-1, sides[1]); setRow(5, size-1, sides[2]); setRow(4, size-1, sides[3]);
    }
    else if (base === 'F') {
      newState[2] = isPrime ? rotateFaceCounter(newState[2], size) : rotateFace(newState[2], size);
      let uRow = getRow(0, size-1);
      let rCol = getCol(1, 0);
      let dRow = getRow(3, 0);
      let lCol = getCol(4, size-1);
      
      if (!isPrime) {
        setCol(1, 0, uRow);
        setRow(3, 0, rCol.reverse());
        setCol(4, size-1, dRow);
        setRow(0, size-1, lCol.reverse());
      } else {
        setCol(4, size-1, uRow.reverse());
        setRow(3, 0, lCol);
        setCol(1, 0, dRow.reverse());
        setRow(0, size-1, rCol);
      }
    }
    else if (base === 'B') {
      newState[5] = isPrime ? rotateFaceCounter(newState[5], size) : rotateFace(newState[5], size);
      let uRow = getRow(0, 0);
      let lCol = getCol(4, 0);
      let dRow = getRow(3, size-1);
      let rCol = getCol(1, size-1);

      if (!isPrime) {
        setCol(4, 0, uRow.reverse());
        setRow(3, size-1, lCol);
        setCol(1, size-1, dRow.reverse());
        setRow(0, 0, rCol);
      } else {
        setCol(1, size-1, uRow);
        setRow(3, size-1, rCol.reverse());
        setCol(4, 0, dRow);
        setRow(0, 0, lCol.reverse());
      }
    }
    else if (base === 'R') {
      newState[1] = isPrime ? rotateFaceCounter(newState[1], size) : rotateFace(newState[1], size);
      let uCol = getCol(0, size-1);
      let bCol = getCol(5, 0); 
      let dCol = getCol(3, size-1);
      let fCol = getCol(2, size-1);

      if (!isPrime) {
        setCol(5, 0, uCol.reverse());
        setCol(3, size-1, bCol.reverse());
        setCol(2, size-1, dCol);
        setCol(0, size-1, fCol);
      } else {
        setCol(2, size-1, uCol);
        setCol(3, size-1, fCol);
        setCol(5, 0, dCol.reverse());
        setCol(0, size-1, bCol.reverse());
      }
    }
    else if (base === 'L') {
      newState[4] = isPrime ? rotateFaceCounter(newState[4], size) : rotateFace(newState[4], size);
      let uCol = getCol(0, 0);
      let fCol = getCol(2, 0);
      let dCol = getCol(3, 0);
      let bCol = getCol(5, size-1);

      if (!isPrime) {
        setCol(2, 0, uCol);
        setCol(3, 0, fCol);
        setCol(5, size-1, dCol.reverse());
        setCol(0, 0, bCol.reverse());
      } else {
        setCol(5, size-1, uCol.reverse());
        setCol(3, 0, bCol.reverse());
        setCol(2, 0, dCol);
        setCol(0, 0, fCol);
      }
    }
  }
  
  return newState;
};

export const getInverseMove = (move) => {
  if (move.includes("2")) return move; // R2' is just R2
  if (move.includes("'")) return move.replace("'", ""); // R' -> R
  return move + "'"; // R -> R'
};

export const simplifyMoveStack = (stack, newMove) => {
    if (stack.length === 0) return [newMove];

    const lastMove = stack[stack.length - 1];
    
    // Helper to get base (e.g. "R", "Rw", "F")
    const getBase = (m) => m.replace(/['2]/g, '');
    
    const base1 = getBase(lastMove);
    const base2 = getBase(newMove);

    // Different bases? Just push.
    if (base1 !== base2) return [...stack, newMove];

    // Same base: Merge
    const getPower = (m) => {
        if (m.includes("2")) return 2;
        if (m.includes("'")) return -1;
        return 1;
    };

    const p1 = getPower(lastMove);
    const p2 = getPower(newMove);
    let sum = (p1 + p2) % 4;
    if (sum <= -2) sum += 4; // Handle negative wrap
    if (sum === 3 || sum === -1) sum = -1; // Standardize '
    
    if (sum === 0) {
        // Cancel out
        return stack.slice(0, -1);
    }

    const newSuffix = sum === 2 ? "2" : sum === -1 ? "'" : "";
    const mergedMove = base1 + newSuffix;
    
    return [...stack.slice(0, -1), mergedMove];
};
