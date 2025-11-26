import React, { useEffect, useRef } from 'react';
import { TwistyPlayer } from 'cubing/twisty';

const SmartCube3D = ({ scramble, type = '3x3', customState, onInit, isConnected }) => {
  const containerRef = useRef(null);
  const playerRef = useRef(null);

  useEffect(() => {
    // Initialize player
    if (containerRef.current && !playerRef.current) {
      const player = new TwistyPlayer({
        puzzle: type === '2x2' ? '2x2x2' : type === '4x4' ? '4x4x4' : '3x3x3',
        visualization: 'PG3D',
        alg: scramble || '',
        background: 'none',
        controlPanel: 'none',
        hintFacelets: 'none',
        experimentalSetupAnchor: 'start',
      });
      
      // Style it
      player.style.width = '100%';
      player.style.height = '100%';
      
      containerRef.current.appendChild(player);
      playerRef.current = player;
      
      if (onInit) onInit(player);
    }
    
    return () => {
      if (containerRef.current && playerRef.current) {
        containerRef.current.innerHTML = '';
        playerRef.current = null;
      }
    };
  }, []); // Run once on mount

  // Handle Scramble Updates
  useEffect(() => {
    if (playerRef.current) {
        // If connected, we want to start from solved (or current state) so the user can scramble.
        // If NOT connected, we show the scramble to be solved.
        if (isConnected) {
            playerRef.current.alg = ""; // Reset to solved
            playerRef.current.jumpToEnd();
        } else if (!customState) {
            playerRef.current.alg = scramble || '';
            playerRef.current.jumpToEnd();
        }
    }
  }, [scramble, isConnected]);

  // Handle Live Moves
  useEffect(() => {
      if (playerRef.current && customState && customState.move) {
          // Apply the move to the player
          playerRef.current.experimentalAddMove(customState.move);
      }
  }, [customState]);
  
  return (
    <div ref={containerRef} className="w-full h-48 md:h-80 flex items-center justify-center" />
  );
};

export default SmartCube3D;
