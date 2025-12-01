import { useState, useEffect, useRef, useCallback } from 'react';
import { LogicalCube } from '../engine/LogicalCube';

export enum TimerState {
    IDLE = 'IDLE',
    INSPECTION = 'INSPECTION',
    RUNNING = 'RUNNING',
    STOPPED = 'STOPPED'
}

interface GameLoopResult {
    timerState: TimerState;
    time: number;
    inspectionTime: number;
    penalty: string | null;
    startInspection: () => void;
    reset: () => void;
    recenter: () => void;
    stop: (timestamp?: number, solutionMoves?: string[]) => void;
    lastSolutionMoves: React.MutableRefObject<string[]>;
    isScrambled: boolean;
}

/**
 * useGameLoop Hook
 * 
 * Single Source of Truth for the Timer Logic.
 * - Auto-starts Inspection when scramble is complete.
 * - Counts down Inspection (15s) with WCA penalties.
 * - Starts Timer on first hardware move during Inspection.
 * - Stops Timer on hardware solve.
 */
export function useGameLoop(): GameLoopResult {
    const [timerState, setTimerState] = useState<TimerState>(TimerState.IDLE);
    const [time, setTime] = useState(0);
    const [inspectionTime, setInspectionTime] = useState(15);
    const [penalty, setPenalty] = useState<string | null>(null);
    const [isScrambled, setIsScrambled] = useState(false);
    
    const startTimeRef = useRef<number>(0);
    const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const inspectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Audio Alerts (Helper)
    const speak = (text: string) => {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            window.speechSynthesis.speak(utterance);
        }
    };

    // Inspection Logic
    useEffect(() => {
        if (timerState === TimerState.INSPECTION) {
            inspectionIntervalRef.current = setInterval(() => {
                setInspectionTime(prev => {
                    const next = prev - 1;
                    // Audio Alerts
                    if (next === 7) speak("Eight Seconds");
                    if (next === 3) speak("Twelve Seconds");
                    
                    // Penalties
                    if (next === -1) setPenalty('+2');
                    if (next === -3) setPenalty('DNF');
                    
                    return next;
                });
            }, 1000);
        } else {
            if (inspectionIntervalRef.current) {
                clearInterval(inspectionIntervalRef.current);
                inspectionIntervalRef.current = null;
            }
        }
        return () => {
            if (inspectionIntervalRef.current) clearInterval(inspectionIntervalRef.current);
        };
    }, [timerState]);

    // Timer Logic
    useEffect(() => {
        if (timerState === TimerState.RUNNING) {
            timerIntervalRef.current = setInterval(() => {
                setTime(Date.now() - startTimeRef.current);
            }, 10);
        } else {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        }
        return () => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, [timerState]);

    const startInspection = useCallback(() => {
        console.log('[GameLoop] Starting Inspection');
        // Disable scramble tracking when inspection starts
        LogicalCube.getInstance().then(cube => cube.resetScrambleTracking());
        setTimerState(TimerState.INSPECTION);
        setInspectionTime(15);
        setPenalty(null);
    }, []);

    const startTimer = useCallback((timestamp?: number) => {
        if (timerState !== TimerState.IDLE && timerState !== TimerState.INSPECTION) return;
        
        // If starting from IDLE (no inspection), clear the scramble moves.
        // If starting from INSPECTION, keep any moves made during inspection (e.g. alignment).
        if (timerState === TimerState.IDLE) {
             LogicalCube.getInstance().then(cube => cube.clearSolutionMoves());
        }

        console.log('[GameLoop] Starting Timer');
        setTimerState(TimerState.RUNNING);
        startTimeRef.current = timestamp || Date.now();
        setPenalty(null); // Reset penalty
        
        // Clear inspection interval if running
        if (inspectionIntervalRef.current) {
            clearInterval(inspectionIntervalRef.current);
            inspectionIntervalRef.current = null;
        }
    }, [timerState]);

    const stopTimer = useCallback((timestamp?: number, solutionMoves?: string[]) => {
        if (timerState !== TimerState.RUNNING && timerState !== TimerState.INSPECTION) return;

        const endTime = timestamp || Date.now();
        // If we have a start time, calculate precise delta
        if (startTimeRef.current) {
            const delta = endTime - startTimeRef.current;
            setTime(delta);
        }
        
        // Update ref with solution moves if provided
        if (solutionMoves) {
            lastSolutionMoves.current = solutionMoves;
        }
        
        setTimerState(TimerState.STOPPED);
        
        // Return the solution data for the consumer to use
        return { time: startTimeRef.current ? endTime - startTimeRef.current : 0, solutionMoves };
    }, [timerState]);

    const reset = useCallback(() => {
        setTimerState(TimerState.IDLE);
        setTime(0);
        setInspectionTime(0);
        setPenalty(null);
        setIsScrambled(false);
        startTimeRef.current = 0;
    }, []);

    const recenter = useCallback(async () => {
        const engine = await LogicalCube.getInstance();
        engine.recenter();
        // Also reset timer state
        reset();
    }, [reset]);

    // Hardware Event Listeners
    useEffect(() => {
        let cleanupFn: (() => void) | null = null;
        let isMounted = true;

        const handleUpdate = ({ move, timestamp }: { move: string, timestamp?: number }) => {
            // START LATCH: First Move Start
            if (timerState === TimerState.INSPECTION) {
                console.log('[GameLoop] Auto-Start Triggered by Move:', move);
                startTimer(timestamp);
            }
        };

        const handleSolved = ({ timestamp, solutionMoves }: { timestamp?: number, solutionMoves?: string[] }) => {
            console.log('[GameLoop] Solved Event Received. State:', timerState);
            // STOP LATCH: Auto-Stop on Solve
            if (timerState === TimerState.RUNNING) {
                stopTimer(timestamp, solutionMoves);
            }
        };
        
        const handleScrambleProgress = ({ isComplete }: { isComplete: boolean }) => {
             setIsScrambled(isComplete);
             // Allow start if IDLE or STOPPED (after previous solve)
             if (isComplete && (timerState === TimerState.IDLE || timerState === TimerState.STOPPED)) {
                 console.log('[GameLoop] Scramble Complete. Starting Inspection.');
                 startInspection();
             }
        };

        const init = async () => {
            const engine = await LogicalCube.getInstance();
            if (!isMounted) return;

            engine.on('update', handleUpdate);
            engine.on('solved', handleSolved);
            engine.on('scramble_progress', handleScrambleProgress);
            
            cleanupFn = () => {
                engine.off('update', handleUpdate);
                engine.off('solved', handleSolved);
                engine.off('scramble_progress', handleScrambleProgress);
            };
        };

        init();

        return () => {
            isMounted = false;
            if (cleanupFn) cleanupFn();
        };
    }, [timerState, startInspection, startTimer, stopTimer]);

    // Store last solution moves in a ref so it persists across renders without triggering them
    const lastSolutionMoves = useRef<string[]>([]);

    // Update ref when stopTimer is called (via side effect or direct call)
    // Actually, stopTimer is called inside handleSolved. We need to capture the moves there.
    
    // Let's modify handleSolved to update the ref.
    
    return { timerState, time, inspectionTime, penalty, startInspection, reset, recenter, stop: stopTimer, lastSolutionMoves, isScrambled };
}
