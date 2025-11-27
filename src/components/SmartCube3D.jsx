import React, { useEffect, useRef } from 'react';
import { TwistyPlayer } from 'cubing/twisty';
import * as THREE from 'three';

const SmartCube3D = ({ scramble, type = '3x3', moveHistory, gyro, onInit, onSolved, isConnected, syncTrigger, className = "h-48 md:h-64" }) => {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const twistySceneRef = useRef(null);
  const twistyVantageRef = useRef(null);
  
  // Gyro State
  const basisRef = useRef(null);
  const cubeQuaternion = useRef(new THREE.Quaternion());
  const homeOrientation = useRef(new THREE.Quaternion().setFromEuler(new THREE.Euler(15 * Math.PI / 180, -20 * Math.PI / 180, 0)));

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
      player.tempoScale = 5; // Speed up animations
      
      containerRef.current.appendChild(player);
      playerRef.current = player;
      
      // Solved Detection Listener
      if (onSolved) {
        player.experimentalModel.currentPattern.addFreshListener(async (kpattern) => {
             // Check if solved
             // We can compare with default pattern
             const puzzle = await player.experimentalPuzzle();
             const defaultPattern = await puzzle.defaultPattern();
             if (kpattern.isIdentical(defaultPattern)) {
                 onSolved();
             }
        });
      }
      
      if (onInit) onInit(player);
    }
    
    return () => {
      if (containerRef.current && playerRef.current) {
        containerRef.current.innerHTML = '';
        playerRef.current = null;
      }
    };
  }, []); // Run once on mount

  // Gyro Animation Loop
  useEffect(() => {
      let animationFrameId;

      const animate = async () => {
          if (playerRef.current) {
              if (!twistySceneRef.current || !twistyVantageRef.current) {
                  const vantageList = await playerRef.current.experimentalCurrentVantages();
                  twistyVantageRef.current = [...vantageList][0];
                  if (twistyVantageRef.current) {
                      twistySceneRef.current = await twistyVantageRef.current.scene.scene();
                  }
              }

              if (twistySceneRef.current) {
                  // Slerp for smooth rotation
                  twistySceneRef.current.quaternion.slerp(cubeQuaternion.current, 0.25);
                  twistyVantageRef.current.render();
              }
          }
          animationFrameId = requestAnimationFrame(animate);
      };

      animate();

      return () => {
          cancelAnimationFrame(animationFrameId);
      };
  }, []);

  // Handle Gyro Updates
  useEffect(() => {
      if (gyro && isConnected) {
          const { x, y, z, w } = gyro;
          const quat = new THREE.Quaternion(x, z, -y, w).normalize();
          
          if (!basisRef.current) {
              basisRef.current = quat.clone().conjugate();
          }
          
          cubeQuaternion.current.copy(quat.premultiply(basisRef.current).premultiply(homeOrientation.current));
      }
  }, [gyro, isConnected]);

  // Handle Scramble Updates
  useEffect(() => {
    if (playerRef.current) {
        if (isConnected) {
            playerRef.current.alg = ""; // Reset to solved
            playerRef.current.jumpToEnd();
        } else if (!moveHistory) {
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
          await playerRef.current.experimentalAddMove(move); 
      } catch (e) {
          console.error("Animation error:", e);
          await new Promise(r => setTimeout(r, 150)); 
      }

      isAnimating.current = false;
      processQueue(); 
  };

  // Handle Manual Sync Trigger
  useEffect(() => {
      if (playerRef.current && isConnected && syncTrigger > 0) {
          playerRef.current.alg = ""; // Reset to solved
          playerRef.current.jumpToEnd();
          moveQueue.current = []; // Clear queue
          basisRef.current = null; // Reset gyro basis
      }
  }, [syncTrigger, isConnected]);

  // Handle Live Moves
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
  
  return (
    <div ref={containerRef} className={`w-full flex items-center justify-center ${className}`} />
  );
};

export default SmartCube3D;
