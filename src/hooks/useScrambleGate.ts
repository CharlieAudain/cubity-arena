import { useState, useEffect } from 'react';
import { LogicalCube } from '../engine/LogicalCube';

interface ScrambleGateResult {
    isReadyToStart: boolean;
    scrambleStatus: 'READY' | 'INVALID';
    targetFacelets: string | null;
}

/**
 * useScrambleGate Hook
 * 
 * Acts as a gatekeeper for the game start.
 * Ensures the physical cube matches the target scramble before allowing the game to begin.
 * 
 * @param scrambleAlg - The target scramble algorithm string
 * @param currentHardwareFacelets - The current facelet string from the hardware driver
 */
export function useScrambleGate(scrambleAlg: string, currentHardwareFacelets: string | null): ScrambleGateResult {
    const [status, setStatus] = useState<'READY' | 'INVALID'>('INVALID');
    const [targetFacelets, setTargetFacelets] = useState<string | null>(null);

    // 1. Update Target Scramble when Alg Changes
    useEffect(() => {
        if (!scrambleAlg) return;

        const updateTarget = async () => {
            const cube = await LogicalCube.getInstance();
            cube.setTargetScramble(scrambleAlg);
            // We can't easily get the target facelets back from LogicalCube without exposing a getter
            // But checkScrambleStatus handles the comparison internally.
            // Let's assume we trust the internal state.
            
            // Trigger an initial check
            if (currentHardwareFacelets) {
                const isReady = cube.checkScrambleStatus(currentHardwareFacelets);
                setStatus(isReady ? 'READY' : 'INVALID');
            }
        };
        
        updateTarget();
    }, [scrambleAlg]);

    // 2. Continuous Check on Hardware Update
    useEffect(() => {
        if (!currentHardwareFacelets) return;

        const check = async () => {
            const cube = await LogicalCube.getInstance();
            const isReady = cube.checkScrambleStatus(currentHardwareFacelets);
            const newStatus = isReady ? 'READY' : 'INVALID';
            
            // Only update state if changed to prevent render loops
            if (newStatus !== status) {
                setStatus(newStatus);
                console.log(`[ScrambleGate] Status changed to: ${newStatus}`);
            }
        };
        
        check();
    }, [currentHardwareFacelets, status]);

    return {
        isReadyToStart: status === 'READY',
        scrambleStatus: status,
        targetFacelets // Currently null as we don't expose it, but could be useful for UI
    };
}
