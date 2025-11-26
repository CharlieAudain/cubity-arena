import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Trophy, Swords, RotateCcw, Grid2x2, Box, Grid3x3 } from 'lucide-react';
import { generateScramble, getDailySeed, getSolvedState, applyCubeMove, getInverseMove, simplifyMoveStack, isStateSolved } from '../utils/cube';
import { calculateAverage } from '../utils/stats';
import SmartCube3D from './SmartCube3D';

// --- UTILS: HELPER TO PREVENT FOCUS STEALING ---
const blurOnUI = (e) => {
  e.currentTarget.blur();
};

const TimerView = ({ user, userData, onSolveComplete, dailyMode = false, recentSolves = [], forcedScramble = null, forcedType = null, disableScrambleGen = false, isBattle = false, smartCube }) => {
  const [time, setTime] = useState(0);
  const [timerState, setTimerState] = useState('IDLE'); 
  const [cubeType, setCubeType] = useState('3x3'); 
  const [scramble, setScramble] = useState(forcedScramble || '');
  const [currentCubeState, setCurrentCubeState] = useState(null); // Live cube state
  const [syncTrigger, setSyncTrigger] = useState(0); // Manual sync trigger
  const [showSyncPrompt, setShowSyncPrompt] = useState(false);
  
  // Inspection State
  const [inspectionTime, setInspectionTime] = useState(15);
  const [penalty, setPenalty] = useState(null); // null, '+2', 'DNF'
  const inspectionIntervalRef = useRef(null);
  const lastMoveAtInspectionStart = useRef(null); // Track move that started inspection

  // Scramble Tracking
  const [scrambleIndex, setScrambleIndex] = useState(0);
  const [scrambleMoves, setScrambleMoves] = useState([]);
  const [correctionStack, setCorrectionStack] = useState([]); // Stack of moves to undo
  const [partialMove, setPartialMove] = useState(null); // Track halfway state of double moves (e.g. "R" of "R2")
  
  // Activity Feed
  const [activityLog, setActivityLog] = useState([]);

  const timerRef = useRef(null);
  const startTimeRef = useRef(0);

  // --- SMART CUBE INTEGRATION ---
  useEffect(() => {
    if (smartCube && smartCube.isConnected) {
        setShowSyncPrompt(true); // Show one-time sync prompt
        
        // Force internal state to SOLVED on connection to ensure sync
        setCurrentCubeState(getSolvedState(cubeType === '2x2' ? 2 : cubeType === '4x4' ? 4 : 3));

        if (smartCube.lastMove && currentCubeState) {
            // Update live state on move
            const newState = applyCubeMove(currentCubeState, smartCube.lastMove.move, cubeType);
            setCurrentCubeState(newState);
            
            // Check for Solved State (Auto-Stop)
            if (timerState === 'RUNNING') {
                // Rely on internal state tracking (more reliable than raw facelets which can be affected by gyro drift)
                const isSolved = isStateSolved(newState);
                
                if (isSolved) {
                    stopTimer();
                }
            }
        }
    }
  }, [smartCube?.isConnected, smartCube?.lastMove]);

  // Initialize state when scramble changes
  useEffect(() => {
      if (scramble) {
          let state = getSolvedState(cubeType === '2x2' ? 2 : cubeType === '4x4' ? 4 : 3);
          const moves = scramble.split(' ');
          moves.forEach(move => {
              if (!move) return;
              state = applyCubeMove(state, move, cubeType);
          });
          setCurrentCubeState(state);
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

  const startTimer = () => {
    setTimerState('RUNNING');
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setTime(Date.now() - startTimeRef.current);
    }, 10);
  };

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const finalTime = (Date.now() - startTimeRef.current) / 1000;
    setTimerState('STOPPED');
    
    // Calculate Grade
    let grade = '';
    const currentAo5 = calculateAverage(recentSolves, 5); // Recalculate or pass in? 
    // Note: recentSolves here is the OLD list (before this solve). That's actually good for comparison.
    const numAo5 = parseFloat(currentAo5);
    
    if (!isNaN(numAo5) && numAo5 > 0) {
        if (finalTime < numAo5 * 0.85) grade = '!!';
        else if (finalTime > numAo5 * 1.15) grade = '??';
    }

    // Add to Activity Feed
    const newLog = { id: Date.now(), time: finalTime, grade, penalty };
    setActivityLog(prev => [newLog, ...prev]);
    
    // Auto-remove after 5s
    setTimeout(() => {
        setActivityLog(prev => prev.filter(l => l.id !== newLog.id));
    }, 5000);

    onSolveComplete(finalTime, scramble, dailyMode, cubeType, penalty); 
  }, [scramble, onSolveComplete, dailyMode, cubeType, penalty, recentSolves]);

  const resetTimer = () => {
    setTimerState('IDLE');
    setTime(0);
    if (!disableScrambleGen) setScramble(generateScramble(cubeType));
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        e.preventDefault(); 
        if (timerState === 'IDLE' || timerState === 'STOPPED') {
          if (timerState === 'STOPPED') resetTimer();
          setTimerState('HOLDING');
          setTimeout(() => setTimerState(prev => prev === 'HOLDING' ? 'READY' : prev), 300);
        } else if (timerState === 'RUNNING') stopTimer();
      }
    };
    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
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
  }, [timerState, stopTimer, cubeType]); 



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
  useEffect(() => {
      if (scrambleMoves.length > 0 && scrambleIndex === scrambleMoves.length && timerState === 'IDLE') {
          // Only auto-start if connected to smart cube
          if (smartCube && smartCube.isConnected) {
              startInspection();
          }
      }
  }, [scrambleIndex, scrambleMoves.length, timerState, smartCube?.isConnected]);

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
    if (timerState === 'IDLE' || timerState === 'STOPPED') {
      if (timerState === 'STOPPED') resetTimer();
      setTimerState('HOLDING');
      setTimeout(() => setTimerState(prev => prev === 'HOLDING' ? 'READY' : prev), 300);
    } else if (timerState === 'RUNNING') stopTimer();
    // Inspection touch handling? Usually inspection is hands-off until start.
    // If user holds space/touch during inspection, they are preparing to start.
    else if (timerState === 'INSPECTION') {
        setTimerState('HOLDING');
        stopInspection();
        setTimeout(() => setTimerState(prev => prev === 'HOLDING' ? 'READY' : prev), 300);
    }
  };

  const handleTouchEnd = () => {
    if (timerState === 'READY') startTimer();
    else if (timerState === 'HOLDING') {
        // If they let go too early during inspection, resume inspection?
        // Or go back to IDLE? WCA rules say if you start, you start.
        // If they abort the hold, we should probably resume inspection or just go IDLE.
        // Let's go back to INSPECTION for now if possible, or just IDLE.
        if (inspectionTime > 0) {
             // Resume inspection? Complex. Let's just reset to IDLE for simplicity or keep INSPECTION running if we didn't stop it fully.
             // Actually, we stopped it in touchStart.
             // Let's just go to IDLE.
             setTimerState('IDLE');
        } else {
             setTimerState('IDLE');
        }
    }
  };



  useEffect(() => {
      if (scramble) {
          setScrambleMoves(scramble.split(" ").filter(m => m));
          setScrambleIndex(0);
          setCorrectionStack([]);
          setPartialMove(null);
      }
  }, [scramble]);

  // Track Scramble Progress
  useEffect(() => {
      if (smartCube && smartCube.isConnected && smartCube.lastMove && scrambleMoves.length > 0) {
          // Stop tracking if scramble is already complete
          if (scrambleIndex >= scrambleMoves.length) return;

          const userMove = smartCube.lastMove.move;
          
          // 1. Check Correction Stack first
          if (correctionStack.length > 0) {
              const requiredCorrection = correctionStack[correctionStack.length - 1];
              if (userMove === requiredCorrection) {
                  // Correct correction! Pop from stack.
                  setCorrectionStack(prev => prev.slice(0, -1));
              } else {
                  // Wrong move while correcting? Add to stack with simplification!
                  setCorrectionStack(prev => simplifyMoveStack(prev, getInverseMove(userMove)));
              }
              return;
          }

          // 2. Check Normal Scramble Progress
          const targetMove = scrambleMoves[scrambleIndex];
          
          // Helper to check if move is the first half of a double move
          // e.g. target "R2", user "R" -> true. User "R'" -> true (since R' + R' = R2)
          const isPartialMatch = (target, user) => {
              if (!target) return false; // Guard against undefined
              if (!target.includes("2")) return false;
              // Must be same face
              if (target[0] !== user[0]) return false;
              // Any move on that face (R or R') is a valid start for R2
              return true;
          };

          if (partialMove) {
              // We are halfway through a double move (e.g. at "R", needing another "R" for "R2")
              if (userMove === partialMove) {
                  // Completed the double move!
                  setPartialMove(null);
                  setScrambleIndex(prev => Math.min(prev + 1, scrambleMoves.length));
              } else if (userMove === getInverseMove(partialMove)) {
                  // User undid the partial move (e.g. R then R')
                  // Just clear partial state, back to start of this move
                  setPartialMove(null);
              } else {
                  // Wrong move during partial!
                  // Need to undo THIS move AND the partial move.
                  // e.g. Partial "R", User "U" -> Stack ["U'", "R'"]
                  const undoPartial = getInverseMove(partialMove);
                  const undoUser = getInverseMove(userMove);
                  setCorrectionStack([undoUser, undoPartial]);
                  setPartialMove(null);
              }
          } else {
              // Standard check
              if (targetMove === userMove) {
                  // Exact match (e.g. R2 -> R2, or R -> R)
                  setScrambleIndex(prev => Math.min(prev + 1, scrambleMoves.length));
              } else if (isPartialMatch(targetMove, userMove)) {
                  // Partial match (e.g. R2 -> R)
                  setPartialMove(userMove);
              } else {
                  // Wrong move!
                  setCorrectionStack([getInverseMove(userMove)]);
              }
          }
      }
  }, [smartCube?.lastMove]);

  // Render Interactive Scramble
  const renderScramble = () => {
      if (!smartCube || !smartCube.isConnected) return scramble;

      return (
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-2 items-center">
              {/* Render Correction Moves if any */}
              {correctionStack.length > 0 && (
                  <div className="flex gap-2 mr-4 animate-pulse">
                      <span className="text-red-500 font-bold text-sm uppercase tracking-widest">UNDO:</span>
                      {/* Show stack in reverse order (LIFO) - actually we just need to show the top one prominently */}
                      {[...correctionStack].reverse().map((move, idx) => (
                          <span key={`corr-${idx}`} className="text-red-400 font-bold text-2xl border border-red-500/50 rounded px-2 bg-red-900/20">
                              {move}
                          </span>
                      ))}
                  </div>
              )}

              {scrambleMoves.map((move, idx) => {
                  const isDone = idx < scrambleIndex;
                  const isCurrent = idx === scrambleIndex;
                  // If correcting, dim the current move
                  const isDimmed = correctionStack.length > 0 && isCurrent;
                  // If partial, show yellow
                  const isPartial = partialMove && isCurrent;

                  return (
                      <span key={idx} className={`
                          font-mono transition-all duration-200
                          ${isDone ? 'text-green-500/30 scale-90' : ''}
                          ${isCurrent && !isDimmed ? 'text-blue-400 font-bold scale-125 mx-2' : ''}
                          ${isPartial ? 'text-yellow-400' : ''}
                          ${!isDone && !isCurrent ? 'text-slate-500' : ''}
                          ${isDimmed ? 'text-slate-600 opacity-50' : ''}
                      `}>
                          {move}
                      </span>
                  );
              })}
          </div>
      );
  };

  return (
    <div 
      className="flex flex-col items-center justify-center min-h-[50vh] outline-none select-none touch-none relative"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className={`absolute top-0 right-0 transition-opacity ${timerState === 'RUNNING' ? 'opacity-0' : 'opacity-100'}`}>
        {!dailyMode && !disableScrambleGen && !isBattle && (!smartCube || !smartCube.isConnected) && (
          <div className="flex bg-slate-900 p-1 rounded-lg border border-white/10">
            <button onMouseUp={blurOnUI} onClick={() => setCubeType('2x2')} className={`p-2 rounded ${cubeType==='2x2' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}><Grid2x2 className="w-4 h-4"/></button>
            <button onMouseUp={blurOnUI} onClick={() => setCubeType('3x3')} className={`p-2 rounded ${cubeType==='3x3' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}><Box className="w-4 h-4"/></button>
            <button onMouseUp={blurOnUI} onClick={() => setCubeType('4x4')} className={`p-2 rounded ${cubeType==='4x4' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}><Grid3x3 className="w-4 h-4"/></button>
          </div>
        )}
      </div>

      <div className={`text-center mb-8 transition-opacity duration-300 ${timerState === 'RUNNING' ? 'opacity-0' : 'opacity-100'} w-full mt-16 relative`}>
        <div className="flex items-center justify-center gap-2 mb-4 text-slate-500 text-xs font-bold uppercase tracking-widest">
          {dailyMode ? <span className="text-indigo-400 flex gap-2 items-center"><Trophy className="w-4 h-4" /> DAILY CHALLENGE</span> : <><Swords className="w-4 h-4" /> {cubeType} Scramble</>}
        </div>
        <div className="text-xl md:text-3xl font-mono font-medium text-slate-300 max-w-3xl leading-relaxed px-4 text-center mx-auto min-h-[3rem] flex items-center justify-center">
          {renderScramble()}
        </div>
        




        <div className="flex justify-center gap-4 mt-4 items-center">
          {!dailyMode && !disableScrambleGen && <button onMouseUp={blurOnUI} onClick={resetTimer} className="text-slate-600 hover:text-white transition-colors"><RotateCcw className="w-5 h-5" /></button>}

          {smartCube && smartCube.isConnected && (
              <button onMouseUp={blurOnUI} onClick={() => {
                  setSyncTrigger(prev => prev + 1);
                  setCurrentCubeState(getSolvedState(3)); // Reset internal state to solved
                  // Reset scramble progress
                  setScrambleIndex(0);
                  setCorrectionStack([]);
                  setPartialMove(null);
              }} className="text-xs font-bold px-3 py-1 rounded-full border border-green-500/20 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors">
                  Mark as Solved
              </button>
          )}
        </div>

        {/* Sync Prompt */}
        {showSyncPrompt && smartCube && smartCube.isConnected && (
            <div className="absolute top-[-60px] left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-xl text-xs font-bold whitespace-nowrap z-50 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
                <span>Please ensure your physical cube is solved to sync.</span>
                <button onClick={() => setShowSyncPrompt(false)} className="bg-white/20 hover:bg-white/30 rounded px-2 py-0.5">OK</button>
            </div>
        )}

        {/* 3D CUBE (Main View) */}
        <div className="mt-4 relative z-10">
            <SmartCube3D 
                scramble={scramble} 
                type={cubeType} 
                customState={smartCube?.isConnected && smartCube?.lastMove ? smartCube.lastMove : null} 
                isConnected={smartCube?.isConnected}
                syncTrigger={syncTrigger}
            />
        </div>

        {/* 2D NET (Optional Side View) */}

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
        {timerState === 'STOPPED' ? 'Press Space to Reset' : 'Hold Space / Touch / Turn to Start'}
      </div>
      <div className="absolute bottom-[-5rem] text-slate-800 text-[10px] font-mono">v1.1 (Auto-Stop Fix)</div>

      {/* Activity Feed */}
      <div className="absolute bottom-4 left-4 flex flex-col-reverse gap-2 pointer-events-none">
          {activityLog.map(log => (
              <div key={log.id} className="bg-slate-900/80 backdrop-blur border border-white/10 p-3 rounded-lg shadow-xl animate-in slide-in-from-bottom-4 fade-in duration-300 flex items-center gap-3">
                  <div className="text-2xl font-mono font-bold text-white">
                      {log.time.toFixed(2)}
                      {log.penalty && <span className="text-red-500 text-sm ml-1">{log.penalty}</span>}
                  </div>
                  {log.grade && (
                      <div className={`text-xl font-black italic ${log.grade === '!!' ? 'text-green-400' : 'text-red-400'}`}>
                          {log.grade}
                      </div>
                  )}
              </div>
          ))}
      </div>
    </div>
  );
};

export default TimerView;
