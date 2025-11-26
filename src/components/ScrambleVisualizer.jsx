import React, { useState, useEffect } from 'react';
import { getSolvedState, applyCubeMove } from '../utils/cube';

const ScrambleVisualizer = ({ scramble, type }) => {
  const size = type === '2x2' ? 2 : type === '4x4' ? 4 : 3;
  const [state, setState] = useState(getSolvedState(size));

  useEffect(() => {
    let currentState = getSolvedState(size);
    if (scramble) {
      const moves = scramble.split(' ');
      moves.forEach(move => {
        if (!move) return;
        currentState = applyCubeMove(currentState, move, type);
      });
    }
    setState(currentState);
  }, [scramble, type, size]);
  
  const renderFace = (faceIndex, x, y) => {
    const stickerSize = 100 / size;
    return (
      <g transform={`translate(${x * 100 + (x * 4)}, ${y * 100 + (y * 4)})`}> 
        {state[faceIndex].map((color, i) => (
          <rect
            key={i}
            x={(i % size) * stickerSize}
            y={Math.floor(i / size) * stickerSize}
            width={stickerSize}
            height={stickerSize}
            fill={color}
            stroke="black"
            strokeWidth={size === 4 ? 1 : 2}
          />
        ))}
        <rect x="0" y="0" width="100" height="100" fill="none" stroke="black" strokeWidth="3" />
      </g>
    );
  };

  const scale = type === '4x4' ? 0.5 : 0.6;

  return (
    <div className="flex justify-center mt-6 pointer-events-none select-none">
      <svg width="320" height="240" viewBox="0 0 400 300">
        <g transform={`scale(${scale}) translate(80, 10)`}>
          {renderFace(0, 1, 0)} 
          {renderFace(4, 0, 1)} 
          {renderFace(2, 1, 1)} 
          {renderFace(1, 2, 1)} 
          {renderFace(5, 3, 1)} 
          {renderFace(3, 1, 2)} 
        </g>
      </svg>
    </div>
  );
};

export default ScrambleVisualizer;
