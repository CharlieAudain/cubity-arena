
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Trophy, Swords, RotateCcw, Grid2x2, Box, Grid3x3, Unplug, RefreshCw, Edit2 } from 'lucide-react';
import { getSolvedState, getInverseMove, simplifyMoveStack, SOLVED_FACELETS } from '../utils/cube';
import { generateScramble, getDailySeed } from '../utils/scramble';
import { calculateAverage } from '../utils/stats';
import SmartCube3D from './SmartCube3D';
import { ErrorBoundary } from './ErrorBoundary';

import { LogicalCube } from '../engine/LogicalCube';
import { useGameLoop, TimerState } from '../hooks/useGameLoop';

// --- UTILS: HELPER TO PREVENT FOCUS STEALING ---
const blurOnUI = (e) => {
  e.currentTarget.blur();
};

const TimerView = ({ 
  user, 
  userData, 
  onSolveComplete, 
  dailyMode = false, 
  recentSolves = [], 
  forcedScramble = null, 
  forcedType = null, 
  disableScrambleGen = false, 
  isBattle = false, 
  smartCube = null,
  onMove = null,        // NEW: Callback for every move
  onStatusChange = null // NEW: Callback for status changes
}) => {
  // Use the new Game Loop Hook (Single Source of Truth)
  const { timerState, time, inspectionTime, penalty, startInspection, reset, recenter, stop, lastSolutionMoves, isScrambled } = useGameLoop();
  
  // Calibration State
  const [hasCalibrated, setHasCalibrated] = useState(false);
  const [showCalibrationPrompt, setShowCalibrationPrompt] = useState(false);
  
  // Reset calibration on connect
  useEffect(() => {
      if (smartCube?.isConnected) {
          // If we just connected, prompt for calibration
          setShowCalibrationPrompt(true);
          setHasCalibrated(false);
      } else {
          setShowCalibrationPrompt(false);
      }
  }, [smartCube?.isConnected]);

  const handleCalibration = () => {
      console.log('[TimerView] User marked as solved. Calibration complete.');
      recenter();
      setHasCalibrated(true);
      setShowCalibrationPrompt(false);
  };

  const [cubeType, setCubeType] = useState('3x3'); 
  const [scramble, setScramble] = useState(forcedScramble || '');
  const [syncTrigger, setSyncTrigger] = useState(0); // Manual sync trigger
  const [showSyncPrompt, setShowSyncPrompt] = useState(false);

  
  const lastProcessedMoveId = useRef(0); // Track processed moves to avoid missing any

  // Scramble Tracking
  const [movesDone, setMovesDone] = useState(0);
  const [wrongMoves, setWrongMoves] = useState([]);
  const [scrambleLost, setScrambleLost] = useState(false);
  const [scrambleComplete, setScrambleComplete] = useState(false);
  const [showSolvePrompt, setShowSolvePrompt] = useState(false);
  const [showScrambleInput, setShowScrambleInput] = useState(false); // NEW: State for custom scramble input
  
  // Activity Feed
  const [activityLog, setActivityLog] = useState([]);
  
  // Solution Tracking
  const [solutionMoves, setSolutionMoves] = useState([]);

  // Notify parent of status changes
  useEffect(() => {
      if (onStatusChange) onStatusChange(timerState);
  }, [timerState, onStatusChange]);

  // --- SMART CUBE INTEGRATION ---
  useEffect(() => {
    if (smartCube && smartCube.isConnected) {
        setShowSyncPrompt(true); // Show one-time sync prompt

        if (smartCube.moveHistory && smartCube.moveHistory.length > 0) {
            // Process all new moves from history
            const newMoves = smartCube.moveHistory.filter(m => m.id > lastProcessedMoveId.current);
            
            if (newMoves.length > 0) {
                console.log(`[TimerView] Processing ${newMoves.length} new move(s):`, newMoves.map(m => m.move).join(', '));
                
                newMoves.forEach((moveData) => {
                    // Notify Parent (BattleRoom)
                    if (onMove) onMove(moveData.move);

                    // Track Solution Moves
                    // Allow if RUNNING or if STOPPED (to catch the solving move)
                    if (timerState === TimerState.RUNNING || timerState === TimerState.STOPPED) {
                        setSolutionMoves(prev => [...prev, moveData.move]);
                    }
                    
                    lastProcessedMoveId.current = moveData.id;
                });
            }
        }
    } else {
        // Reset processed ID on disconnect
        lastProcessedMoveId.current = 0;
    }
  }, [smartCube, smartCube?.isConnected, smartCube?.moveHistory, onMove, timerState]);

  // Initialize state when scramble changes
  useEffect(() => {
      if (scramble) {
          getSolvedState(cubeType === '2x2' ? 2 : cubeType === '4x4' ? 4 : 3).then(initialState => {
              // ... setup if needed ...
          });
      }
  }, [scramble, cubeType]);

  useEffect(() => {
    if (forcedType) setCubeType(forcedType);
  }, [forcedType]);

  useEffect(() => {
    if (!disableScrambleGen && !forcedScramble) {
      generateScramble(cubeType).then(setScramble);
    }
  }, [cubeType, dailyMode, disableScrambleGen, forcedScramble]);

  // Mock Social Feed
  useEffect(() => {
      const interval = setInterval(() => {
          if (Math.random() > 0.7) { // 30% chance every 10s
              const names = ["Alex", "Sarah", "Mike", "Emma", "David", "Lisa"];
              const name = names[Math.floor(Math.random() * names.length)];
              const time = (Math.random() * 10 + 5).toFixed(2);
              
              const newLog = {
                  id: Date.now(),
                  type: 'SOCIAL',
                  message: `${name} got a NEW PB: ${time}s!`,
                  isSmart: true // Treat as relevant content
              };
              setActivityLog(prev => [newLog, ...prev].slice(0, 20));
              
              // Trigger fade out after 7s
              setTimeout(() => {
                  setActivityLog(prev => prev.map(l => l.id === newLog.id ? { ...l, isFading: true } : l));
              }, 7000);

              // Remove after 8s
              setTimeout(() => {
                  setActivityLog(prev => prev.filter(l => l.id !== newLog.id));
              }, 8000);
          }
      }, 8000);
      return () => clearInterval(interval);
  }, []);

  const ao5 = calculateAverage(recentSolves, 5);
  const ao12 = calculateAverage(recentSolves, 12);
  
  const getTimerColor = () => {
    switch(timerState) {
      case TimerState.IDLE: return dailyMode ? 'text-indigo-300' : 'text-white';
      case TimerState.INSPECTION: return inspectionTime < 0 ? 'text-red-500' : 'text-orange-400';
      case TimerState.RUNNING: return 'text-white'; 
      case TimerState.STOPPED: return 'text-blue-400';
      default: return 'text-white'; 
    }
  };

  // Handle Solve Completion (Transition to STOPPED)
  const prevTimerState = useRef(timerState);
  useEffect(() => {
      if (prevTimerState.current !== TimerState.STOPPED && timerState === TimerState.STOPPED) {
          // Timer just stopped!
          // Use authoritative solution moves from LogicalCube if available
          const finalSolutionMoves = lastSolutionMoves.current.length > 0 
              ? lastSolutionMoves.current 
              : solutionMoves;

          console.log('[TimerView] Timer Stopped. Saving solve:', { time, solution: finalSolutionMoves });
          
          const timeInSeconds = time / 1000;
          
          // Construct Detailed Data
          // Ensure we have the latest moves. If solutionMoves is stale, we might miss the last one.
          // But the effect above updates solutionMoves. 
          // However, this effect might run BEFORE the solutionMoves update effect?
          // No, solutionMoves is a dependency. If solutionMoves updates, this effect runs again?
          // No, we only want to run this ONCE when transitioning to STOPPED.
          
          // Wait for solutionMoves to settle? 
          // Or use a ref for solutionMoves?
          
          // Better: The parent (BattleRoom/App) handles the save.
          // We just pass the data.
          
          // If we are missing the last move, we can try to grab it from smartCube.moveHistory?
          // But that's complex.
          
          // Let's rely on solutionMoves being updated.
          // The issue is that setSolutionMoves is async.
          // If we trigger onSolveComplete immediately, solutionMoves might be old.
          
          // We can use a timeout? Or a separate effect that watches for STOPPED and solutionMoves stability?
          
          // For now, let's just pass the current solutionMoves.
          // The fix above (allowing STOPPED state to add moves) should help.
          
          const detailedData = {
              solution: finalSolutionMoves.join(' '),
              splits: null 
          };

          // Notify Parent
          if (onSolveComplete) {
              onSolveComplete(timeInSeconds, scramble, dailyMode, cubeType, penalty, detailedData);
          }
          
          // Generate new scramble
          if (!disableScrambleGen) {
              generateScramble(cubeType).then(setScramble);
          }
      }
      prevTimerState.current = timerState;
  }, [timerState, time, scramble, solutionMoves, cubeType, dailyMode, penalty, onSolveComplete, disableScrambleGen]);

  // Callback from SmartCube3D when solved (Legacy/Redundant? No, SmartCube3D might trigger 'onSolved' prop)
  // But useGameLoop handles 'solved' event from LogicalCube directly.
  // SmartCube3D 'onSolved' prop is triggered by TwistyPlayer logic?
  // If SmartCube3D triggers it, we might want to ensure timer stops.
  // But useGameLoop should handle it via LogicalCube.
  // We'll keep it as a backup or for visual feedback.
  const handleSolved = useCallback(() => {
      // useGameLoop handles the stop.
      // We just ensure UI state is clean.
      if (scrambleLost || wrongMoves.length > 0) {
          setScrambleLost(false);
          setWrongMoves([]);
          setMovesDone(0);
          
          // Reset LogicalCube tracking
          LogicalCube.getInstance().then(engine => {
              if (engine.resetScrambleTracking) {
                  engine.resetScrambleTracking();
              }
          });
      }
  }, [scrambleLost, wrongMoves.length]);

  const resetTimer = () => {
      if (smartCube && smartCube.isConnected && smartCube.facelets && smartCube.facelets !== SOLVED_FACELETS) {
          // If connected but software thinks it's scrambled, FORCE RECENTER
          // This handles the case where hardware state is desynced.
          console.log('[TimerView] Force Recentering Cube State');
          handleCalibration(); // Use new handler
          setSolutionMoves([]); 
          if (!disableScrambleGen) generateScramble(cubeType).then(setScramble);
          return;
      }

      // Enforce Calibration
      if (smartCube?.isConnected && !hasCalibrated) {
          setShowCalibrationPrompt(true);
          return;
      }

      reset(); // Hook reset (just timer state)
      setSolutionMoves([]); // Reset solution tracking
      
      // Set to latest move ID to skip re-processing old moves
      if (smartCube?.moveHistory && smartCube.moveHistory.length > 0) {
        lastProcessedMoveId.current = smartCube.moveHistory[smartCube.moveHistory.length - 1].id;
      }
      if (!disableScrambleGen) generateScramble(cubeType).then(setScramble);
  };

  useEffect(() => {
      if (scramble) {
          setMovesDone(0);
          setWrongMoves([]);
          setScrambleLost(false);
          setScrambleComplete(false);
          
          // Update LogicalCube target
          LogicalCube.getInstance().then(engine => {
              engine.setTargetScramble(scramble);
          });
      }
  }, [scramble]);

  // Track Scramble Progress via LogicalCube Events
  useEffect(() => {
      const handleProgress = ({ movesDone, wrongMoves, isComplete }) => {
          // Only track scramble when IDLE
          if (timerState !== TimerState.IDLE) return;

          setMovesDone(movesDone);
          setWrongMoves(wrongMoves);
          setScrambleComplete(isComplete);
          
          if (wrongMoves.length > 6) {
              setScrambleLost(true);
          } else {
              setScrambleLost(false);
          }
      };

      LogicalCube.getInstance().then(engine => {
          engine.on('scramble_progress', handleProgress);
      });

      return () => {
          LogicalCube.getInstance().then(engine => {
              engine.off('scramble_progress', handleProgress);
          });
      };
  }, []);

  // Render Interactive Scramble
  const renderScramble = () => {
      if (!smartCube || !smartCube.isConnected) return scramble;

      if (scrambleLost) {
          return (
              <div className="flex flex-col items-center animate-pulse">
                  <div className="text-red-500 font-black text-4xl mb-2">⚠️ LOST SCRAMBLE</div>
                  <div className="text-slate-400 text-sm">Please solve the cube to reset.</div>
              </div>
          );
      }

      const moves = scramble.split(/\s+/).filter(m => m);
      const done = moves.slice(0, movesDone);
      const remaining = moves.slice(movesDone);
      
      // Calculate Correction Moves (Inverse of wrong moves, reversed)
      const rawCorrections = [...wrongMoves].reverse().map(m => getInverseMove(m));
      // Compress corrections (e.g. U U -> U2)
      const corrections = rawCorrections.reduce((acc, move) => simplifyMoveStack(acc, move), []);

      return (
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-2 items-center">
              {/* Done Moves (Green) */}
              {done.map((move, i) => (
                  <span key={`done-${i}`} className="font-mono text-green-500/50 scale-90 transition-all duration-200">
                      {move}
                  </span>
              ))}

              {/* Correction Moves (Red) */}
              {corrections.map((move, i) => (
                  <span key={`corr-${i}`} className="font-mono text-red-500 font-bold scale-110 mx-1 transition-all duration-200 animate-pulse">
                      {move}
                  </span>
              ))}

              {/* Remaining Moves (Grey) */}
              {remaining.map((move, i) => (
                  <span key={`rem-${i}`} className={`font-mono text-slate-300 transition-all duration-200 ${i === 0 && corrections.length === 0 ? 'text-blue-400 font-bold scale-125 mx-2' : ''}`}>
                      {move}
                  </span>
              ))}
          </div>
      );
  };

  return (
    <div 
      className="flex flex-col items-center justify-center min-h-[50vh] outline-none select-none touch-none relative"
    >


      {/* Scramble Display */}
      <div className="text-center mb-12 relative group">
        <div className="text-2xl md:text-3xl font-mono font-bold text-white tracking-wider leading-relaxed break-words max-w-4xl mx-auto drop-shadow-lg">
          {renderScramble()}
        </div>
        
        {/* Scramble Status Indicator */}
        {smartCube?.isConnected && timerState === TimerState.IDLE && (
            <div className={`mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${isScrambled ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'}`}>
                <div className={`w-2 h-2 rounded-full ${isScrambled ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                {isScrambled ? 'Scrambled & Ready' : 'Scramble Required'}
            </div>
        )}

        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
          {!isBattle && (
            <>
              <button onMouseUp={blurOnUI} onClick={() => generateScramble(cubeType).then(setScramble)} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"><RefreshCw className="w-5 h-5" /></button>
              <button onMouseUp={blurOnUI} onClick={() => setShowScrambleInput(true)} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"><Edit2 className="w-5 h-5" /></button>
            </>
          )}
        </div>
      </div>
          <div className="flex justify-center gap-4 mt-4 items-center">


          {smartCube && smartCube.isConnected && !isBattle && (
            <>
              <button onMouseUp={blurOnUI} onClick={() => {
                  // Call driver reset
                  if (smartCube.markAsSolved) smartCube.markAsSolved();
                  
                  // Reset UI state
                  setSyncTrigger(prev => prev + 1);
                  setMovesDone(0);
                  setWrongMoves([]);
                  setScrambleLost(false);
                  setScrambleComplete(false);
                  
                  // Reset LogicalCube tracking
                  LogicalCube.getInstance().then(engine => {
                      if (engine.resetScrambleTracking) {
                          engine.resetScrambleTracking();
                      }
                  });
                  
                  // Reset Timer (if stopped)
                  resetTimer();
              }} className="text-xs font-bold px-6 py-2 rounded-full border border-green-500/20 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors flex items-center gap-2">
                  <RotateCcw className="w-3 h-3" /> Mark as Solved
              </button>
            </>
          )}
        </div>

        {/* Sync Prompt */}
        {showSyncPrompt && smartCube && smartCube.isConnected && (
            <div className="absolute top-[-60px] left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-xl text-xs font-bold whitespace-nowrap z-50 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
                <span>Please ensure your physical cube is solved to sync.</span>
                <button onClick={() => setShowSyncPrompt(false)} className="bg-white/20 hover:bg-white/30 rounded px-2 py-0.5">OK</button>
            </div>
        )}

        {/* Solve Prompt */}
        {showSolvePrompt && (
            <div className="absolute top-[-60px] left-1/2 transform -translate-x-1/2 bg-orange-600 text-white px-4 py-2 rounded-lg shadow-xl text-xs font-bold whitespace-nowrap z-50 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
                <span>Please solve the cube to get a new scramble.</span>
                <button onClick={() => setShowSolvePrompt(false)} className="bg-white/20 hover:bg-white/30 rounded px-2 py-0.5">OK</button>
            </div>
        )}



      {/* 3D CUBE (Always Visible) */}
      <div className="mb-8 relative z-10 w-full max-w-lg mx-auto h-48 md:h-64">
          <ErrorBoundary fallback={<div className="text-slate-500 flex items-center justify-center h-full border border-slate-700 rounded-lg">3D Cube Failed to Load</div>}>
            <SmartCube3D 
                scramble={scramble} 
                type={cubeType} 
                moveHistory={smartCube?.isConnected ? smartCube.moveHistory : null} 
                gyro={smartCube?.gyro}
                facelets={smartCube?.facelets}
                lastAction={smartCube?.lastAction}
                onSolved={handleSolved}
                isConnected={smartCube?.isConnected}
                syncTrigger={syncTrigger}
                className="h-full w-full"
            />
          </ErrorBoundary>
      </div>

      <div className={`text-[6rem] md:text-[12rem] font-black font-mono tabular-nums leading-none tracking-tighter transition-colors duration-100 ${getTimerColor()} flex flex-col items-center`}>
        {/* State Label */}
        {timerState === TimerState.INSPECTION && (
            <div className="text-sm md:text-base font-bold tracking-[0.5em] text-orange-500 mb-[-1rem] animate-pulse">
                INSPECTION
            </div>
        )}
        {timerState === TimerState.RUNNING && (
            <div className="text-sm md:text-base font-bold tracking-[0.5em] text-green-500/50 mb-[-1rem]">
                SOLVING
            </div>
        )}

        {timerState === TimerState.INSPECTION ? (
            <span className={`${inspectionTime < 0 ? 'text-red-500' : 'text-orange-400'}`}>
                {Math.abs(inspectionTime)}
            </span>
        ) : (
            (time / 1000).toFixed(2)
        )}
      </div>
      
      {/* Penalty Indicator */}
      {penalty && timerState !== TimerState.IDLE && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[10rem] text-red-600/20 font-black pointer-events-none z-0">
              {penalty}
          </div>
      )}

      {/* Session Stats Overlay */}
      {!disableScrambleGen && !isBattle && (
        <div className={`mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 w-full max-w-2xl transition-opacity duration-300 ${timerState === TimerState.RUNNING ? 'opacity-0' : 'opacity-100'}`}>
          <div className="text-center">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">ao5</div>
            <div className="text-xl font-mono font-bold text-white">{ao5}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">ao12</div>
            <div className="text-xl font-mono font-bold text-white">{ao12}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">count</div>
            <div className="text-xl font-mono font-bold text-white">{recentSolves.length}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">best</div>
            <div className="text-xl font-mono font-bold text-white">
              {recentSolves.length > 0 
                ? Math.min(...recentSolves.filter(s=>s.penalty!=='DNF').map(s => s.time + (s.penalty===2?2:0))).toFixed(2) 
                : '--'}
            </div>
          </div>
        </div>
      )}

      <div className={`absolute bottom-[-3rem] md:bottom-[-4rem] text-slate-600 text-xs font-bold tracking-widest uppercase animate-pulse ${timerState === TimerState.RUNNING ? 'hidden' : 'block'}`}>
        {smartCube?.isConnected 
            ? (timerState === TimerState.STOPPED ? 'Press Reset Button' : 'Scramble Cube to Start') 
            : (timerState === TimerState.STOPPED ? 'Press Space to Reset' : 'Hold Space / Touch / Turn to Start')}
      </div>
      <div className="absolute bottom-[-5rem] text-slate-800 text-[10px] font-mono">v2.0 (WCA Auto-Start)</div>

      {/* Activity Feed */}
      <div className="fixed top-20 left-4 right-4 md:top-auto md:bottom-4 md:left-4 md:right-auto md:w-72 flex flex-col md:flex-col-reverse gap-2 pointer-events-none z-50">
          {activityLog.map(log => (
              <div key={log.id} className={`
                  backdrop-blur border p-4 rounded-xl shadow-2xl flex items-center gap-4 transition-all
                  ${log.isFading ? 'animate-out fade-out slide-out-to-top-10 duration-1000' : 'animate-in slide-in-from-top-10 md:slide-in-from-bottom-10 fade-in duration-500'}
                  ${log.type === 'SOCIAL' ? 'bg-blue-950/80 border-blue-500/30' : 'bg-slate-900/90 border-white/10'}
              `}>
                  {log.type === 'SOCIAL' ? (
                      <div className="flex items-center gap-3">
                          <div className="bg-blue-500/20 p-2 rounded-full">
                              <Trophy className="w-4 h-4 text-blue-400" />
                          </div>
                          <div className="text-xs font-bold text-blue-200">
                              {log.message}
                          </div>
                      </div>
                  ) : (
                      <>
                        <div className="text-2xl font-mono font-bold text-white">
                            {log.time.toFixed(2)}
                            {log.penalty && <span className="text-red-500 text-sm ml-1">{log.penalty}</span>}
                        </div>
                        {log.grade && (
                            <div className={`text-xl font-black italic ${log.grade === '!!' ? 'text-green-400' : 'text-red-400'}`}>
                                {log.grade}
                            </div>
                        )}
                      </>
                  )}
              </div>
          ))}
      </div>


      {/* Custom Scramble Input Modal */}
      {showScrambleInput && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm rounded-3xl">
            <div className="bg-slate-900 border border-white/10 p-6 rounded-2xl max-w-md w-full shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-4">Edit Scramble</h3>
                <textarea 
                    autoFocus
                    className="w-full bg-slate-950 border border-white/10 rounded-lg p-3 text-white font-mono text-sm mb-4 focus:outline-none focus:border-indigo-500"
                    rows={3}
                    defaultValue={scramble}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            setScramble(e.currentTarget.value);
                            setShowScrambleInput(false);
                        }
                    }}
                />
                <div className="flex justify-end gap-2">
                    <button onClick={() => setShowScrambleInput(false)} className="px-4 py-2 text-slate-400 hover:text-white font-bold transition-colors">Cancel</button>
                    <button onClick={(e) => {
                        const textarea = e.currentTarget.parentElement.previousElementSibling;
                        setScramble(textarea.value);
                        setShowScrambleInput(false);
                    }} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-colors">Save</button>
                </div>
            </div>
        </div>
      )}

      {/* Calibration Prompt Overlay */}
      {showCalibrationPrompt && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm rounded-3xl">
          <div className="bg-slate-900 border border-blue-500/30 p-8 rounded-2xl max-w-md text-center shadow-2xl">
            <h3 className="text-2xl font-black text-white mb-4">⚠️ Calibration Required</h3>
            <p className="text-slate-300 mb-6">
              Please ensure your physical cube is <strong>SOLVED</strong>, then click the button below to sync.
            </p>
            <button 
              onClick={handleCalibration}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-lg transition-all shadow-lg hover:shadow-blue-500/20"
            >
              Mark as Solved
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimerView;
