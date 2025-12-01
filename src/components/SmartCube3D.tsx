import React, { useEffect, useRef } from 'react';
import { TwistyPlayer } from 'cubing/twisty';
import { Alg } from 'cubing/alg';
// @ts-ignore
import { solve } from 'cube-solver';
import * as DriverManager from '../hardware/DriverManager';
import { LogicalCube } from '../engine/LogicalCube';
import { CubeMove } from '../hardware/types';
import { Logger } from '../utils/Logger';

interface SmartCube3DProps {
  scramble?: string;
  type?: '2x2' | '3x3' | '4x4';
  moveHistory?: { id: number; move: string }[];
  onInit?: (player: TwistyPlayer) => void;
  isConnected?: boolean;
  syncTrigger?: number;
  className?: string;
  facelets?: string;
  lastAction?: { type: string };
}

const SmartCube3D: React.FC<SmartCube3DProps> = ({ 
  scramble, 
  type = '3x3', 
  moveHistory, 
  onInit, 
  isConnected, 
  syncTrigger, 
  className = "h-48 md:h-64", 
  facelets, 
  lastAction 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<TwistyPlayer | null>(null);
  const moveQueue = useRef<string[]>([]);
  const isAnimating = useRef(false);
  
  // --- STRICT SYNC: RESET ON CONNECT ---
  useEffect(() => {
    if (isConnected && playerRef.current) {
        Logger.log('UI', 'Connected: Resetting to SOLVED state');
        playerRef.current.alg = ""; // Reset to solved
        playerRef.current.jumpToEnd();
        moveQueue.current = [];
    }
  }, [isConnected]);

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
      // @ts-ignore - tempoScale is missing in types but exists in API
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

  // Logical Cube (Shadow Engine)
  // Logical Cube (Shadow Engine)
  // Logical Cube (Shadow Engine)
  // LogicalCube (Shadow Engine)
  useEffect(() => {
    if (!isConnected) return;

    let engine: LogicalCube | null = null;
    let isMounted = true;
    
    const handleUpdate = ({ move }: { move: string }) => {
        // ANIMATION SMOOTHING:
        // Instead of applying immediately, push to queue.
        moveQueue.current.push(move);
        processQueue();
    };



  const handleReset = async ({ state }: { state: string }) => {
      if (playerRef.current) {
          // Reset alg to empty
          playerRef.current.alg = "";
          playerRef.current.jumpToEnd();

          // Apply state directly using experimentalStickering
          // This avoids solving/inverting which can be buggy with different facelet definitions
          // @ts-ignore
          playerRef.current.experimentalStickering = state;
      }
  };

    const initEngine = async () => {
        const instance = await LogicalCube.getInstance();
        if (!isMounted) return; // Component unmounted while waiting
        
        engine = instance;
        engine.on('update', handleUpdate);
        engine.on('reset', handleReset);
    };
    
    initEngine();
    
    return () => {
        isMounted = false;
        if (engine) {
            engine.off('update', handleUpdate);
            engine.off('reset', handleReset);
        }
    };
  }, [isConnected]); // Re-run if connection status changes

  // Handle Scramble Updates
  useEffect(() => {
    if (playerRef.current) {
        // If connected, we want to start from solved (or current state) so the user can scramble.
        // If NOT connected, we show the scramble to be solved.
        if (isConnected) {
            // Do nothing, let the connection effect handle reset
        } else if (!moveHistory) {
            playerRef.current.alg = scramble || '';
            playerRef.current.jumpToEnd();
        }
    }
  }, [scramble, isConnected]);

  // Handle Facelets Prop Updates (for remote/opponent view)
  useEffect(() => {
    if (playerRef.current && facelets) {
        // Apply facelets directly
        // @ts-ignore
        playerRef.current.experimentalStickering = facelets;
    }
  }, [facelets]);



  const processQueue = async () => {
      if (isAnimating.current || moveQueue.current.length === 0 || !playerRef.current) return;

      isAnimating.current = true;
      const move = moveQueue.current.shift();

      // Validate move before attempting to render
      if (!move || typeof move !== 'string' || move.trim() === '') {
          Logger.warn('UI', '⚠️ Skipping invalid move in queue:', move);
          isAnimating.current = false;
          processQueue(); // Continue to next move
          return;
      }

      try {
          // experimentalAddMove returns a promise that resolves when the animation is done
          await playerRef.current.experimentalAddMove(move); 
          
          // SMOOTHING DELAY:
          // Add a small delay between moves to make "fast-forward" look smooth but distinct
          await new Promise(r => setTimeout(r, 30));
          
      } catch (e: any) {
          Logger.error('UI', '❌ Animation error for move "' + move + '":', e.message);
          // Don't crash - continue to next move
          await new Promise(r => setTimeout(r, 100)); 
      }

      isAnimating.current = false;
      processQueue(); // Process next move
  };

  // Handle Manual Sync Trigger
  useEffect(() => {
      if (playerRef.current && isConnected && syncTrigger && syncTrigger > 0) {
          playerRef.current.alg = ""; // Reset to solved
          playerRef.current.jumpToEnd();
          moveQueue.current = []; // Clear queue
      }
  }, [syncTrigger, isConnected]);

  // Handle Live Moves from moveHistory prop (legacy)
  // REMOVED: Duplicate listener. Moves are now handled by LogicalCube events.
  /*
  const lastProcessedMoveId = useRef(0);

  useEffect(() => {
      if (moveHistory && moveHistory.length > 0) {
          const newMoves = moveHistory.filter(m => m.id > lastProcessedMoveId.current);
          
          newMoves.forEach(moveData => {
              moveQueue.current.push(moveData.move);
              lastProcessedMoveId.current = moveData.id;
          });

          if (newMoves.length > 0) {
              processQueue();
          }
      }
  }, [moveHistory]);
  */


  
  const handleResetOrientation = async () => {
    Logger.log('UI', '🔄 Unified Reset Triggered');
    
    // 1. Reset Driver (Clears history, buffers, and internal state)
    const driver = DriverManager.getDriver();
    if (driver) {
        driver.reset();
        
        // 2. Sync State (Fetch actual facelets from hardware)
        // This ensures that if the cube is scrambled, we get the correct state
        // instead of blindly assuming solved.
        await driver.syncState();
    }

    // 3. Reset Visualizer
    if (playerRef.current) {
      playerRef.current.alg = "";
      playerRef.current.jumpToEnd();
    }
    
    // 4. Clear Queue
    moveQueue.current = [];
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center">
      <div ref={containerRef} className={`w-full flex items-center justify-center ${className}`} />
      
      {isConnected && (
        <button 
          onClick={handleResetOrientation}
          className="absolute bottom-2 right-2 bg-gray-800/80 text-white text-xs px-2 py-1 rounded hover:bg-gray-700 transition-colors z-10"
        >
          Reset View
        </button>
      )}
    </div>
  );
};

export default SmartCube3D;
