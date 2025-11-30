import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Trophy, Swords, RotateCcw, Grid2x2, Box, Grid3x3, Activity, Unplug } from 'lucide-react';
import { generateScramble, getDailySeed, getSolvedState, getInverseMove, simplifyMoveStack, SOLVED_FACELETS } from '../utils/cube';
import { calculateAverage } from '../utils/stats';
import SmartCube3D from './SmartCube3D';
import DebugOverlay from './DebugOverlay';
import { LogicalCube } from '../engine/LogicalCube';

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
  const [time, setTime] = useState(0);
  const [timerState, setTimerState] = useState('IDLE'); 
  const [cubeType, setCubeType] = useState('3x3'); 
  const [scramble, setScramble] = useState(forcedScramble || '');
  const [syncTrigger, setSyncTrigger] = useState(0); // Manual sync trigger
  const [showSyncPrompt, setShowSyncPrompt] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  
  // Inspection State
  const [inspectionTime, setInspectionTime] = useState(15);
  const [penalty, setPenalty] = useState(null); // null, '+2', 'DNF'
  const inspectionIntervalRef = useRef(null);
  const lastMoveAtInspectionStart = useRef(null); // Track move that started inspection
  const lastProcessedMoveId = useRef(0); // Track processed moves to avoid missing any

  // Scramble Tracking
  // Scramble Tracking
  const [movesDone, setMovesDone] = useState(0);
  const [wrongMoves, setWrongMoves] = useState([]);
  const [scrambleLost, setScrambleLost] = useState(false);
  const [scrambleComplete, setScrambleComplete] = useState(false);
  const [showSolvePrompt, setShowSolvePrompt] = useState(false);
  
  // Activity Feed
  const [activityLog, setActivityLog] = useState([]);
  
  // Solution Tracking
  const [solutionMoves, setSolutionMoves] = useState([]);

  const timerRef = useRef(null);
  const startTimeRef = useRef(0);

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
                    if (timerState === 'RUNNING') {
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
              let state = initialState;
              const moves = scramble.split(' ');
              moves.forEach(move => {
                  if (!move) return;
                  // state = applyCubeMove(state, move, cubeType); // No longer needed
              });
              // setCurrentCubeState(state);
          });
      }
  }, [scramble, cubeType]);

  useEffect(() => {
    if (forcedType) setCubeType(forcedType);
  }, [forcedType]);

  useEffect(() => {
    if (!disableScrambleGen && !forcedScramble) {
      setScramble(generateScramble(cubeType, dailyMode ? getDailySeed() : null));
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
      case 'HOLDING': return 'text-red-500';
      case 'READY': return 'text-green-500';
      case 'RUNNING': return 'text-white'; 
      case 'STOPPED': return 'text-blue-400';
      case 'INSPECTION': return inspectionTime < 0 ? 'text-red-500' : 'text-orange-400';
      default: return dailyMode ? 'text-indigo-300' : 'text-white'; 
    }
  };

  const startTimer = useCallback(() => {
    if (timerState === 'IDLE' || timerState === 'INSPECTION') {
      console.log(`[TimerView] Starting Timer (Previous State: ${timerState})`);
      setTimerState('RUNNING');
      startTimeRef.current = Date.now(); // Keep using ref for interval
      setSolutionMoves([]); // Reset solution moves
      
      // Hide sync prompt when timer starts
      setShowSyncPrompt(false);

      timerRef.current = setInterval(() => {
        setTime(Date.now() - startTimeRef.current);
      }, 10);
    }
  }, [timerState]);

  const stopTimer = useCallback(() => {
    if (timerState === 'RUNNING') {
      console.log("[TimerView] Stopping Timer");
      
      if (timerRef.current) clearInterval(timerRef.current);
      
      setTimerState('STOPPED');
      const endTime = Date.now();
      const elapsedMs = endTime - startTimeRef.current;
      setTime(elapsedMs); // Set local state in milliseconds for display
      
      const timeInSeconds = elapsedMs / 1000;
      
      // Construct Detailed Data
      const detailedData = {
          solution: solutionMoves.join(' '),
          splits: null // Placeholder for future CFOP analysis
      };

      // Notify Parent
      if (onSolveComplete) {
          onSolveComplete(timeInSeconds, scramble, dailyMode, cubeType, penalty, detailedData);
      }
      
      // Generate new scramble
      const nextScramble = generateScramble(cubeType);
      setScramble(nextScramble);
    }
  }, [timerState, scramble, solutionMoves, cubeType, dailyMode, penalty, onSolveComplete]);

  // Callback from SmartCube3D when solved
  const handleSolved = useCallback(() => {
      console.log(`[TimerView] handleSolved called. TimerState: ${timerState}`);
      
      // Always clear lost scramble state if solved
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

      if (timerState === 'RUNNING') {
          console.log("🎉 CUBE SOLVED (via TwistyPlayer)! Stopping timer...");
          stopTimer();
      } else {
          console.warn(`[TimerView] Solved event ignored because timer is not RUNNING (State: ${timerState})`);
      }
  }, [timerState, stopTimer, scrambleLost, wrongMoves.length]);

  const resetTimer = () => {
      // If connected, ensure cube is solved before getting new scramble
      if (smartCube && smartCube.isConnected && smartCube.facelets && smartCube.facelets !== SOLVED_FACELETS) {
          setShowSolvePrompt(true);
          // Auto-hide after 3s
          setTimeout(() => setShowSolvePrompt(false), 3000);
          return;
      }

  setTimerState('IDLE');
  setTime(0);
  setSolutionMoves([]); // Reset solution tracking
  // Set to latest move ID to skip re-processing old moves
  if (smartCube?.moveHistory && smartCube.moveHistory.length > 0) {
    lastProcessedMoveId.current = smartCube.moveHistory[smartCube.moveHistory.length - 1].id;
  }
  if (!disableScrambleGen) setScramble(generateScramble(cubeType));
};

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        e.preventDefault(); 
        // Allow reset even if smart cube is connected
        if (timerState === 'STOPPED') {
            resetTimer();
            return;
        }

        // NO MANUAL START if smart cube is connected
        if (smartCube?.isConnected) return; 

        if (timerState === 'IDLE') {
          setTimerState('HOLDING');
          setTimeout(() => setTimerState(prev => prev === 'HOLDING' ? 'READY' : prev), 300);
        } else if (timerState === 'RUNNING') stopTimer();
      }
    };
    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        if (smartCube?.isConnected) return; // Disable manual controls
        if (timerState === 'READY') startTimer();
        else if (timerState === 'HOLDING') setTimerState('IDLE'); 
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [timerState, stopTimer, cubeType, smartCube?.isConnected]); 



  // Inspection State
  // (State declared at top of component)

  // Audio Alerts
  const speak = (text) => {
      if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(text);
          window.speechSynthesis.speak(utterance);
      }
  };

  const startInspection = () => {
      setTimerState('INSPECTION');
      setInspectionTime(15);
      setPenalty(null);
      
      // Record the move that triggered inspection so we don't immediately start solving
      if (smartCube?.lastMove) {
          lastMoveAtInspectionStart.current = smartCube.lastMove;
      }

      inspectionIntervalRef.current = setInterval(() => {
          setInspectionTime(prev => prev - 1);
      }, 1000);
  };

  // Audio Alerts Effect
  useEffect(() => {
      if (timerState === 'INSPECTION') {
          if (inspectionTime === 8) speak("Eight Seconds"); // 7s remaining (15-8=7? No, wait. 15-7=8 elapsed)
          // Wait, logic was: next === 7 (8s elapsed). 
          // If inspectionTime counts DOWN from 15:
          // 15, 14, ... 8 (7s elapsed), 7 (8s elapsed).
          // WCA rule: "8 seconds" call at 8s elapsed (7s remaining).
          if (inspectionTime === 7) speak("Eight Seconds"); 
          
          // "12 seconds" call at 12s elapsed (3s remaining).
          if (inspectionTime === 3) speak("Twelve Seconds");

          // Penalties
          if (inspectionTime === -1) setPenalty('+2'); // 16s elapsed
          if (inspectionTime === -3) setPenalty('DNF'); // 18s elapsed
      }
  }, [inspectionTime, timerState]);

  const stopInspection = () => {
      if (inspectionIntervalRef.current) clearInterval(inspectionIntervalRef.current);
  };

  // Auto-start inspection on scramble complete
  // Auto-start inspection on scramble complete
  useEffect(() => {
      if (scrambleComplete && timerState === 'IDLE' && !scrambleLost) {
          // Only auto-start if connected to smart cube
          if (smartCube && smartCube.isConnected) {
              startInspection();
          }
      }
  }, [scrambleComplete, timerState, smartCube?.isConnected, scrambleLost]);

  // Handle move during inspection -> Start Solve
  useEffect(() => {
      if (timerState === 'INSPECTION' && smartCube?.lastMove) {
          // Ignore the move that started inspection
          if (smartCube.lastMove === lastMoveAtInspectionStart.current) return;

          stopInspection();
          if (penalty === 'DNF') {
              setTimerState('STOPPED');
              onSolveComplete(0, scramble, dailyMode, cubeType, 'DNF');
          } else {
              startTimer();
          }
      }
  }, [smartCube?.lastMove, timerState, penalty]);

  // Cleanup
  useEffect(() => {
      return () => stopInspection();
  }, []);

  const handleTouchStart = () => {
    // Allow reset even if smart cube is connected
    if (timerState === 'STOPPED') {
        resetTimer();
        return;
    }

    if (smartCube?.isConnected) return; // Disable manual controls for other states

    if (timerState === 'IDLE') {
      setTimerState('HOLDING');
      setTimeout(() => setTimerState(prev => prev === 'HOLDING' ? 'READY' : prev), 300);
    } else if (timerState === 'RUNNING') stopTimer();
    else if (timerState === 'INSPECTION') {
        setTimerState('HOLDING');
        stopInspection();
        setTimeout(() => setTimerState(prev => prev === 'HOLDING' ? 'READY' : prev), 300);
    }
  };

  const handleTouchEnd = () => {
    if (smartCube?.isConnected) return; // Disable manual controls
    if (timerState === 'READY') startTimer();
    else if (timerState === 'HOLDING') {
        if (inspectionTime > 0) {
             setTimerState('IDLE');
        } else {
             setTimerState('IDLE');
        }
    }
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

  // Track Scramble Progress
  // Track Scramble Progress via LogicalCube Events
  useEffect(() => {
      const handleProgress = ({ movesDone, wrongMoves, isComplete }) => {
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
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >


      <div className={`text-center mb-8 transition-opacity duration-300 ${timerState === 'RUNNING' ? 'opacity-0' : 'opacity-100'} w-full mt-16 relative`}>
        <div className="flex items-center justify-center gap-2 mb-4 text-slate-500 text-xs font-bold uppercase tracking-widest">
          {dailyMode ? <span className="text-indigo-400 flex gap-2 items-center"><Trophy className="w-4 h-4" /> DAILY CHALLENGE</span> : !isBattle && <><Swords className="w-4 h-4" /> {cubeType} Scramble</>}
        </div>
        <div className="text-xl md:text-3xl font-mono font-medium text-slate-300 max-w-3xl leading-relaxed px-4 text-center mx-auto min-h-[3rem] flex items-center justify-center">
          {renderScramble()}
        </div>
        




        <div className="flex justify-center gap-4 mt-4 items-center">
          {!dailyMode && !disableScrambleGen && <button onMouseUp={blurOnUI} onClick={resetTimer} className="text-slate-600 hover:text-white transition-colors"><RotateCcw className="w-5 h-5" /></button>}

          {smartCube && smartCube.isConnected && (
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

      </div>

      {/* 3D CUBE (Always Visible) */}
      <div className="mb-8 relative z-10 w-full max-w-lg mx-auto h-48 md:h-64">
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
      </div>

      <div className={`text-[6rem] md:text-[12rem] font-black font-mono tabular-nums leading-none tracking-tighter transition-colors duration-100 ${getTimerColor()} flex flex-col items-center`}>
        {/* State Label */}
        {timerState === 'INSPECTION' && (
            <div className="text-sm md:text-base font-bold tracking-[0.5em] text-orange-500 mb-[-1rem] animate-pulse">
                INSPECTION
            </div>
        )}
        {timerState === 'RUNNING' && (
            <div className="text-sm md:text-base font-bold tracking-[0.5em] text-green-500/50 mb-[-1rem]">
                SOLVING
            </div>
        )}

        {timerState === 'INSPECTION' ? (
            <span className={`${inspectionTime < 0 ? 'text-red-500' : 'text-orange-400'}`}>
                {Math.abs(inspectionTime)}
            </span>
        ) : (
            (time / 1000).toFixed(2)
        )}
      </div>
      
      {/* Penalty Indicator */}
      {penalty && timerState !== 'IDLE' && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[10rem] text-red-600/20 font-black pointer-events-none z-0">
              {penalty}
          </div>
      )}

      {/* Session Stats Overlay */}
      {!disableScrambleGen && !isBattle && (
        <div className={`mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 w-full max-w-2xl transition-opacity duration-300 ${timerState === 'RUNNING' ? 'opacity-0' : 'opacity-100'}`}>
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

      <div className={`absolute bottom-[-3rem] md:bottom-[-4rem] text-slate-600 text-xs font-bold tracking-widest uppercase animate-pulse ${timerState === 'RUNNING' ? 'hidden' : 'block'}`}>
        {smartCube?.isConnected 
            ? (timerState === 'STOPPED' ? 'Press Reset Button' : 'Turn Cube to Start') 
            : (timerState === 'STOPPED' ? 'Press Space to Reset' : 'Hold Space / Touch / Turn to Start')}
      </div>
      <div className="absolute bottom-[-5rem] text-slate-800 text-[10px] font-mono">v1.1 (Auto-Stop Fix)</div>

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

      {/* Debug Overlay Toggle */}
      <button 
        onClick={() => setShowDebug(!showDebug)}
        className="fixed top-4 right-4 p-2 bg-slate-800/50 hover:bg-slate-700 text-slate-400 rounded-full transition-colors z-50"
        title="Toggle Debug Mode"
      >
        <Activity className="w-4 h-4" />
      </button>

      {/* Debug Overlay */}
      {showDebug && smartCube && (
        <DebugOverlay logs={smartCube.debugLog || []} onClose={() => setShowDebug(false)} />
      )}
    </div>
  );
};

export default TimerView;
