import { useState, useRef, useEffect } from 'react';
import { applyMoveToFacelets, SOLVED_FACELETS } from '../utils/cube';

export const useCubeSync = () => {
    // 1. The Visual State (Optimistic - what the user sees instantly)
    // We use the Kociemba facelet string as the source of truth for the UI.
    const [visualState, setVisualState] = useState(SOLVED_FACELETS);
    const [lastAction, setLastAction] = useState(null); // { type: 'MOVE'|'ROLLBACK'|'RESET', ... }
    
    // 2. The Logical State (The math behind the moves)
    // We track this internally to compare against hardware.
    const logicalState = useRef(SOLVED_FACELETS);
    
    // 3. The Audit Log (For WCA Credibility/Anti-Cheat)
    const auditLog = useRef([]);

    /**
     * CORE LOGIC: Handle Incoming Data
     * We separate 'Move' events (fast) from 'Facelet' events (accurate).
     */
    const handleBluetoothData = (eventType, data) => {
        const timestamp = Date.now();

        if (eventType === 'MOVE') {
            // --- OPTIMISTIC PATH (ZERO LATENCY) ---
            // 1. Apply move to logical state immediately
            const newState = applyMoveToFacelets(logicalState.current, data.move);
            logicalState.current = newState;
            
            // 2. Update UI immediately
            setVisualState(newState);
            setLastAction({ type: 'MOVE', move: data.move, timestamp });
            
            // 3. Log it
            auditLog.current.push({ t: timestamp, type: 'MOVE', val: data.move, state: newState });

        } else if (eventType === 'FACELETS') {
            // --- AUTHORITATIVE PATH (VERIFICATION) ---
            // 1. Hardware state is already decrypted and mapped by GanProtocol
            const hardwareString = data.facelets;
            const currentLogicalString = logicalState.current;

            // 2. COMPARE (The Reconciliation)
            if (hardwareString !== currentLogicalString) {
                // Ignore if hardware string is invalid/empty
                if (!hardwareString || hardwareString.length !== 54) return;

                console.warn(`⚠️ STATE MISMATCH DETECTED`);
                console.warn(`Local:    ${currentLogicalString}`);
                console.warn(`Hardware: ${hardwareString}`);

                // 3. ROLLBACK (Snap to Truth)
                // We trust the hardware (facelets) over the move stream (packets)
                // because packets can be dropped, but the sensor state is absolute.
                
                // Reset logical cube to the hardware state
                logicalState.current = hardwareString;
                
                // Snap the UI to match
                setVisualState(hardwareString);
                setLastAction({ type: 'ROLLBACK', from: currentLogicalString, to: hardwareString, timestamp });
                
                // 4. LOG THE CORRECTION (Crucial for Anti-Cheat)
                auditLog.current.push({ 
                    t: timestamp, 
                    type: 'ROLLBACK', 
                    from: currentLogicalString, 
                    to: hardwareString 
                });
            }
        } else if (eventType === 'RESET') {
            logicalState.current = SOLVED_FACELETS;
            setVisualState(SOLVED_FACELETS);
            setLastAction({ type: 'RESET', timestamp });
            auditLog.current.push({ t: timestamp, type: 'RESET' });
        }
    };

    /**
     * WCA VERIFICATION EXPORT
     * Call this at the end of a solve to generate a hash for the leaderboard.
     */
    const generateVerificationHash = () => {
        const rollbacks = auditLog.current.filter(e => e.type === 'ROLLBACK').length;
        const totalMoves = auditLog.current.filter(e => e.type === 'MOVE').length;
        
        // If rollbacks > 5% of moves, flag for manual review (hardware might be faulty or tampered)
        // Avoid division by zero
        const reliabilityScore = totalMoves > 0 ? 1 - (rollbacks / totalMoves) : 1.0;
        
        return {
            isValid: reliabilityScore > 0.95,
            log: auditLog.current,
            reliability: reliabilityScore,
            totalMoves,
            rollbacks
        };
    };

    const resetSync = () => {
        logicalState.current = SOLVED_FACELETS;
        setVisualState(SOLVED_FACELETS);
        setLastAction({ type: 'RESET', timestamp: Date.now() });
        auditLog.current = [];
    };

    return { visualState, lastAction, handleBluetoothData, generateVerificationHash, resetSync };
};
