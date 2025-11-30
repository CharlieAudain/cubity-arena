import { useState, useEffect, useRef } from 'react';
import { LogicalCube } from '../engine/LogicalCube';

export enum TimerState {
    IDLE = 0,
    INSPECTION = 1,
    READY = 2,
    RUNNING = 3,
    STOPPED = 4,
    FINISHED = 5
}

interface GameLoopResult {
    timerState: TimerState;
    time: number;
    startInspection: () => void;
    reset: () => void;
}

/**
 * useGameLoop Hook
 * 
 * Implements the Hardware-Controlled Timer logic.
 * - Starts timer on first move (if READY/INSPECTION).
 * - Stops timer on solve (if RUNNING).
 */
export function useGameLoop(isScrambleValid: boolean): GameLoopResult {
    const [timerState, setTimerState] = useState<TimerState>(TimerState.IDLE);
    const [time, setTime] = useState(0);
    const startTimeRef = useRef<number>(0);
    const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Timer Tick
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

    // Hardware Event Listeners
    useEffect(() => {
        let engine: LogicalCube | null = null;

        const handleUpdate = ({ move }: { move: string }) => {
            // START LATCH: First Move Start
            // If Inspection or Ready, start the timer
            if (timerState === TimerState.INSPECTION || timerState === TimerState.READY) {
                // Only start if scramble is valid (Anti-Cheat)
                if (isScrambleValid) {
                    console.log('[GameLoop] 🟢 Timer Started by Hardware Move');
                    startTimeRef.current = Date.now();
                    setTimerState(TimerState.RUNNING);
                } else {
                    console.warn('[GameLoop] ⚠️ Move detected but Scramble Invalid. Timer not started.');
                }
            }
        };

        const handleSolved = () => {
            // STOP LATCH: Auto-Stop on Solve
            if (timerState === TimerState.RUNNING) {
                console.log('[GameLoop] 🏁 Timer Stopped by Hardware Solve');
                setTimerState(TimerState.STOPPED);
                // Final time update
                setTime(Date.now() - startTimeRef.current);
            }
        };

        const init = async () => {
            engine = await LogicalCube.getInstance();
            engine.on('update', handleUpdate);
            engine.on('solved', handleSolved);
            engine.on('scramble_progress', ({ isComplete }) => {
                if (isComplete && timerState === TimerState.IDLE) {
                    startInspection();
                }
            });
        };

        init();

        return () => {
            if (engine) {
                engine.off('update', handleUpdate);
                engine.off('solved', handleSolved);
            }
        };
    }, [timerState, isScrambleValid]);

    const startInspection = () => {
        setTimerState(TimerState.INSPECTION);
        setTime(0);
    };

    const reset = () => {
        setTimerState(TimerState.IDLE);
        setTime(0);
    };

    return {
        timerState,
        time,
        startInspection,
        reset
    };
}
