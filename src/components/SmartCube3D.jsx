import React, { useEffect, useRef } from 'react';
import { TwistyPlayer } from 'cubing/twisty';

const SmartCube3D = ({ scramble, type = '3x3', customState, onInit, isConnected, syncTrigger, className = "h-48 md:h-64" }) => {
  // ... (refs and effects)

  return (
    <div ref={containerRef} className={`w-full flex items-center justify-center ${className}`} />
  );
};

  useEffect(() => {
    // Initialize player
    if (containerRef.current && !playerRef.current) {
      const player = new TwistyPlayer({
        puzzle: type === '2x2' ? '2x2x2' : type === '4x4' ? '4x4x4' : '3x3x3',
        visualization: 'PG3D',
        alg: scramble || '',
        background: 'none',
        hintFacelets: 'none',
        experimentalSetupAnchor: 'start',
      });
      
      // Style it
      player.style.width = '100%';
      player.style.height = '100%';
      player.setAttribute('control-panel', 'none');
      player.setAttribute('background', 'none');
      player.tempoScale = 5; // Speed up animations to prevent skipping
      
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

  // Move Queue
  const moveQueue = useRef([]);
  const isAnimating = useRef(false);

  const processQueue = async () => {
      if (isAnimating.current || moveQueue.current.length === 0 || !playerRef.current) return;

      isAnimating.current = true;
      const move = moveQueue.current.shift();

      try {
          // experimentalAddMove returns a promise that resolves when the animation is done
          await playerRef.current.experimentalAddMove(move); 
      } catch (e) {
          console.error("Animation error:", e);
          // Fallback: just wait a bit if it failed or didn't return a promise
          await new Promise(r => setTimeout(r, 150)); 
      }

      isAnimating.current = false;
      processQueue(); // Process next move
  };

  // Handle Manual Sync Trigger
  useEffect(() => {
      if (playerRef.current && isConnected && syncTrigger > 0) {
          playerRef.current.alg = ""; // Reset to solved
          playerRef.current.jumpToEnd();
          moveQueue.current = []; // Clear queue
      }
  }, [syncTrigger, isConnected]);

  // Handle Live Moves
  useEffect(() => {
      if (customState && customState.move) {
          moveQueue.current.push(customState.move);
          processQueue();
      }
  }, [customState]);
  
  return (
    <div ref={containerRef} className={`w-full flex items-center justify-center ${className}`} />
  );
};

export default SmartCube3D;
