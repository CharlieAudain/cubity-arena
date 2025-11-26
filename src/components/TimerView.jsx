import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Trophy, Swords, RotateCcw, Grid2x2, Box, Grid3x3 } from 'lucide-react';
import { generateScramble, getDailySeed, getSolvedState, applyCubeMove } from '../utils/cube';
import { calculateAverage } from '../utils/stats';
import ScrambleVisualizer from './ScrambleVisualizer';
import SmartCube3D from './SmartCube3D';

// --- UTILS: HELPER TO PREVENT FOCUS STEALING ---
const blurOnUI = (e) => {
  e.currentTarget.blur();
};

const TimerView = ({ user, userData, onSolveComplete, dailyMode = false, recentSolves = [], forcedScramble = null, forcedType = null, disableScrambleGen = false, isBattle = false, smartCube }) => {
  const [time, setTime] = useState(0);
  const [timerState, setTimerState] = useState('IDLE'); 
  const [cubeType, setCubeType] = useState('3x3'); 
  const [show2D, setShow2D] = useState(false);
  const [scramble, setScramble] = useState(forcedScramble || '');
  const [currentCubeState, setCurrentCubeState] = useState(null); // Live cube state
  const [syncTrigger, setSyncTrigger] = useState(0); // Manual sync trigger
  const [showSyncPrompt, setShowSyncPrompt] = useState(false);
  const timerRef = useRef(null);
  const startTimeRef = useRef(0);

  // --- SMART CUBE INTEGRATION ---
  useEffect(() => {
    if (smartCube && smartCube.isConnected) {
        setShow2D(true); // Auto-show visualizer on connection
        setShowSyncPrompt(true); // Show one-time sync prompt
        
        if (smartCube.lastMove && currentCubeState) {
            // Update live state on move
            const newState = applyCubeMove(currentCubeState, smartCube.lastMove.move, cubeType);
            setCurrentCubeState(newState);
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
    onSolveComplete(finalTime, scramble, dailyMode, cubeType); 
  }, [scramble, onSolveComplete, dailyMode, cubeType]);

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

  const handleTouchStart = () => {
    if (timerState === 'IDLE' || timerState === 'STOPPED') {
      if (timerState === 'STOPPED') resetTimer();
      setTimerState('HOLDING');
      setTimeout(() => setTimerState(prev => prev === 'HOLDING' ? 'READY' : prev), 300);
    } else if (timerState === 'RUNNING') stopTimer();
  };

  const handleTouchEnd = () => {
    if (timerState === 'READY') startTimer();
    else if (timerState === 'HOLDING') setTimerState('IDLE');
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
        <div className="text-xl md:text-3xl font-mono font-medium text-slate-300 max-w-3xl leading-relaxed px-4 text-center mx-auto">
          {scramble}
        </div>
        




        <div className="flex justify-center gap-4 mt-4 items-center">
          {!dailyMode && !disableScrambleGen && <button onMouseUp={blurOnUI} onClick={resetTimer} className="text-slate-600 hover:text-white transition-colors"><RotateCcw className="w-5 h-5" /></button>}
          {(!smartCube || !smartCube.isConnected) && (
              <button onMouseUp={blurOnUI} onClick={() => setShow2D(!show2D)} className={`text-xs font-bold px-3 py-1 rounded-full border ${show2D ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'text-slate-600 border-white/5'}`}>
                {show2D ? 'Hide Net' : 'Show Net'}
              </button>
          )}
          {smartCube && smartCube.isConnected && (
              <button onMouseUp={blurOnUI} onClick={() => {
                  setSyncTrigger(prev => prev + 1);
                  setCurrentCubeState(getSolvedState(3)); // Reset internal state to solved
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
        {show2D && (
            <div className="absolute top-24 right-[-120px] hidden xl:block opacity-50 hover:opacity-100 transition-opacity">
                 <ScrambleVisualizer scramble={scramble} type={cubeType} customState={currentCubeState} />
            </div>
        )}
        {/* Mobile/Tablet 2D Fallback if needed, or just show below */}
        {show2D && <div className="xl:hidden"><ScrambleVisualizer scramble={scramble} type={cubeType} customState={currentCubeState} /></div>}
      </div>

      <div className={`text-[6rem] md:text-[12rem] font-black font-mono tabular-nums leading-none tracking-tighter transition-colors duration-100 ${getTimerColor()}`}>
        {(time / 1000).toFixed(2)}
      </div>

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
    </div>
  );
};

export default TimerView;
