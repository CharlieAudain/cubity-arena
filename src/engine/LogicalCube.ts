import mathlib from '../lib/cstimer/mathlib.js';
import { getInverseMove, simplifyMoveStack } from '../utils/cube.ts';

// Extract CubieCube class and type from the default export
const CubieCube = mathlib.CubieCube;
type CubieCube = InstanceType<typeof mathlib.CubieCube>;

type Listener = (data: any) => void;

/**
 * LogicalCube Engine
 * 
 * Maintains the authoritative state of the cube using mathlib.js (from cstimer).
 * This ensures our state tracking matches the verification logic in bluetoothutil.js.
 * 
 * Uses mathlib.CubieCube and CubeMult for 100% accurate move application.
 */
export class LogicalCube {
    private static instance: LogicalCube;
    private rawState: CubieCube;
    private anchorInv: CubieCube;
    private anchor: CubieCube;
    private hasAnchored: boolean = false;

    private listeners: Record<string, Set<Listener>> = {};
    
    // Scramble Tracking
    // Scramble Tracking
    private scrambleMoves: string[] = [];
    private progressIndex: number = 0;
    private wrongMoves: string[] = [];
    private partialMove: string | null = null;
    
    // Solution Tracking
    private currentSolutionMoves: string[] = [];

    private constructor() {
        this.rawState = new CubieCube();
        this.anchorInv = new CubieCube();
        this.anchor = new CubieCube();
        this.reset();
    }

    public static async getInstance(): Promise<LogicalCube> {
        if (!LogicalCube.instance) {
            LogicalCube.instance = new LogicalCube();
        }
        return LogicalCube.instance;
    }

    private targetFacelets: string | null = null;

    /**
     * Reset the cube to solved state
     */
    public reset() {
        this.rawState = new CubieCube();
        this.anchorInv = new CubieCube(); // Identity
        this.anchor = new CubieCube(); // Identity
        this.hasAnchored = false;
        
        this.emitUpdate();
    }

    /**
     * Set the target scramble for validation.
     * Calculates the expected facelet string for the given scramble.
     */
    public setTargetScramble(scrambleAlg: string) {
        // 1. Create a temporary cube
        const tempCube = new CubieCube();
        
        // 2. Apply scramble
        if (typeof scrambleAlg !== 'string') {
            console.warn('[LogicalCube] Invalid scramble received:', scrambleAlg);
            return;
        }
        const moves = scrambleAlg.split(/\s+/).filter(m => m);
        
        // Reset tracking
        // Reset tracking
        this.scrambleMoves = [...moves];
        this.progressIndex = 0;
        this.wrongMoves = [];
        this.wrongMoves = [];
        this.partialMove = null;
        this.currentSolutionMoves = []; // Reset solution tracking
        
        moves.forEach(move => {
            if (!move) return;
            const moveIdx = this.getMoveIndex(move);
            if (moveIdx !== -1) {
                const nextState = new CubieCube();
                CubieCube.CubeMult(tempCube, CubieCube.moveCube[moveIdx], nextState);
                tempCube.init(nextState.ca, nextState.ea);
            }
        });
        
        // 3. Store target facelets
        this.targetFacelets = tempCube.toFaceCube();
        console.log(`[LogicalCube] 🎯 Target Scramble Set: ${this.targetFacelets}`);
    }

    /**
     * Reset scramble tracking state (e.g. when user solves cube to reset)
     */
    public resetScrambleTracking() {
        this.scrambleMoves = [];
        this.progressIndex = 0;
        this.wrongMoves = [];
        this.partialMove = null;
        this.currentSolutionMoves = [];
        this.emit('scramble_progress', {
            movesDone: 0,
            wrongMoves: [],
            isComplete: false
        });
    }

    /**
     * Clear the current solution moves.
     * Call this when the timer starts to ensure only solving moves are recorded.
     */
    public clearSolutionMoves() {
        this.currentSolutionMoves = [];
    }

    /**
     * Check if the hardware state matches the target scramble.
     * Compares RAW hardware state against target.
     */
    public checkScrambleStatus(hardwareFacelets: string): boolean {
        if (!this.targetFacelets) return true; // No target set, assume ready
        
        return hardwareFacelets === this.targetFacelets;
    }

    /**
     * Validate if a move string is mathematically possible/valid.
     * Currently checks standard notation.
     */
    public validateMove(moveStr: string): boolean {
        return this.getMoveIndex(moveStr) !== -1;
    }

    /**
     * Apply a move string (e.g., "R", "U'", "F2")
     */
    public applyMove(moveStr: string, timestamp?: number) {
        if (!moveStr) return;

        // VALIDATION:
        if (!this.validateMove(moveStr)) {
            return;
        }

        // SCRAMBLE TRACKING:
        if (this.scrambleMoves.length > 0) {
            console.log(`[LogicalCube] Scramble Track: Move=${moveStr}, Index=${this.progressIndex}, Expected=${this.scrambleMoves[this.progressIndex]}`);
            
            // 1. Check Correction (Undo) or Wrong Move Accumulation
            if (this.wrongMoves.length > 0) {
                this.wrongMoves = simplifyMoveStack(this.wrongMoves, moveStr);
                console.log(`[LogicalCube]   -> Wrong Moves Stack: ${this.wrongMoves.join(' ')}`);
                // If stack becomes empty, we are back on track!
            } 
            // 2. Check Partial Move Progress
            else if (this.partialMove) {
                const combined = simplifyMoveStack([this.partialMove], moveStr);
                console.log(`[LogicalCube]   -> Partial Combine: ${this.partialMove} + ${moveStr} = ${combined.join(' ')}`);
                
                if (combined.length === 0) {
                    // Cancelled (e.g. R then R')
                    this.partialMove = null;
                } else if (combined.length === 1) {
                    const res = combined[0];
                    if (res === this.scrambleMoves[this.progressIndex]) {
                         // Completed the double move!
                         this.progressIndex++;
                         this.partialMove = null;
                         console.log(`[LogicalCube]   -> Partial Completed! Next Index=${this.progressIndex}`);
                    } else {
                         // Still partial? 
                         // Only if it's a valid partial for the target.
                         // e.g. Target R2. We had R. User did R2. Result R'. 
                         // R' is valid partial for R2.
                         // But simplifyMoveStack might return R'.
                         
                         // Check if 'res' is a valid partial for target
                         const target = this.scrambleMoves[this.progressIndex];
                         if (target.includes("2") && res[0] === target[0] && !res.includes("2")) {
                             this.partialMove = res;
                             console.log(`[LogicalCube]   -> Still Partial: ${res}`);
                         } else {
                             // Wrong!
                             this.wrongMoves = combined;
                             this.partialMove = null;
                             console.log(`[LogicalCube]   -> Partial Failed -> Wrong: ${this.wrongMoves.join(' ')}`);
                         }
                    }
                } else {
                    // Became multiple moves (e.g. R then U) -> Wrong
                    this.wrongMoves = combined;
                    this.partialMove = null;
                    console.log(`[LogicalCube]   -> Partial Broken -> Wrong: ${this.wrongMoves.join(' ')}`);
                }
            }
            // 3. Check New Move Progress
            else {
                if (this.progressIndex < this.scrambleMoves.length) {
                    const expected = this.scrambleMoves[this.progressIndex];
                    
                    if (moveStr === expected) {
                        // Exact match
                        this.progressIndex++;
                        console.log(`[LogicalCube]   -> Match! Next Index=${this.progressIndex}`);
                    } else if (expected.includes("2") && moveStr[0] === expected[0] && !moveStr.includes("2")) {
                        // Partial match (e.g. R for R2)
                        this.partialMove = moveStr;
                        console.log(`[LogicalCube]   -> Partial Start: ${moveStr} (Target: ${expected})`);
                    } else {
                        // Wrong move
                        this.wrongMoves.push(moveStr);
                        console.log(`[LogicalCube]   -> Wrong Move: ${moveStr} (Expected: ${expected})`);
                    }
                } else {
                    // Scramble done, extra move
                    this.wrongMoves.push(moveStr);
                    console.log(`[LogicalCube]   -> Extra Move: ${moveStr}`);
                }
            }
            
            this.emit('scramble_progress', {
                movesDone: this.progressIndex,
                wrongMoves: this.wrongMoves,
                isComplete: this.progressIndex === this.scrambleMoves.length && this.wrongMoves.length === 0 && !this.partialMove
            });
        }


        
        // Track Solution Move (if not part of scramble)
        // We track ALL moves applied after scramble setup
        this.currentSolutionMoves.push(moveStr);

        const moveIdx = this.getMoveIndex(moveStr);
        if (moveIdx === -1) return; 

        // 1. Update the RAW hardware state
        const nextRaw = new CubieCube();
        CubieCube.CubeMult(this.rawState, CubieCube.moveCube[moveIdx], nextRaw);
        
        // Idempotency Check (Optional but good)
        // if (nextRaw.isEqual(this.rawState)) return;

        this.rawState = nextRaw;

        // 2. Emit the RELATIVE state to the UI
        this.emitUpdate(moveStr, timestamp);
    }

    /**
     * Apply a scramble string (sequence of moves)
     */
    public applyScramble(scramble: string) {
        this.reset();
        const moves = scramble.split(/\s+/);
        moves.forEach(move => {
            if (move) this.applyMove(move);
        });
    }

    /**
     * Get the current DISPLAY state as a 54-character facelet string
     * (Relative to anchor)
     */
    public getFaceletString(): string {
        const temp = new CubieCube();
        CubieCube.CubeMult(this.anchorInv, this.rawState, temp);
        const displayState = new CubieCube();
        CubieCube.CubeMult(temp, this.anchor, displayState);
        return displayState.toFaceCube();
    }

    /**
     * Compare current RAW state with hardware facelets
     * Returns true if they match
     */
    public compareState(hardwareFacelets: string): boolean {
        const localRaw = this.rawState.toFaceCube();
        
        if (localRaw !== hardwareFacelets) {
            console.warn(`[LogicalCube] ⚠️ State Mismatch!`);
            console.warn(`  Local Raw: ${localRaw}`);
            console.warn(`  Hardware:  ${hardwareFacelets}`);
            return false;
        }
        return true;
    }
    
    /**
     * Set the hardware state directly from a facelet string
     * (Called by driver on initial connection/sync)
     */
    public setHardwareState(facelets: string) {
        const newRaw = new CubieCube();
        const result = newRaw.fromFacelet(facelets);
        
        if (result === -1) {
            console.error('[LogicalCube] Failed to parse facelet string:', facelets);
            return;
        }
        
        // 1. Load hardware state
        this.rawState = newRaw;
        
        // 2. Calculate the Inverse (The Anchor)
        // DISABLED: We assume the hardware reports absolute facelets correctly.
        // Auto-anchoring causes issues if connected while scrambled.
        /*
        if (!this.hasAnchored) {
            this.anchorInv = new CubieCube();
            this.anchorInv.invFrom(this.rawState);
            this.anchor = new CubieCube();
            this.anchor.init(this.rawState.ca, this.rawState.ea);
            this.hasAnchored = true;
            console.log('[LogicalCube] ⚓ Anchor set. Display should be solved.');
        } else {
            console.log('[LogicalCube] 🔄 Syncing raw state (preserving anchor).');
        }
        */
        console.log('[LogicalCube] 🔄 Syncing raw state (Absolute Mode).');
        
        // 3. Update UI (Emit reset to snap visualizer)
        // 3. Update UI (Emit reset to snap visualizer)
        // 3. Update UI (Emit reset to snap visualizer)
        const temp = new CubieCube();
        CubieCube.CubeMult(this.anchorInv, this.rawState, temp);
        const dispState = new CubieCube();
        CubieCube.CubeMult(temp, this.anchor, dispState);
        const displayFacelets = dispState.toFaceCube();
        
        this.emit('reset', { state: displayFacelets });
        
        // Check if solved immediately
        if (this.isSolved(displayFacelets)) {
            this.emit('solved', {});
        }
    }

    /**
     * Force the current state to be treated as SOLVED.
     * Sets the anchor to the current raw state.
     */
    public recenter() {
        console.log('[LogicalCube] 🎯 Recentering (Setting current state as Solved).');
        this.anchorInv = new CubieCube();
        this.anchorInv.invFrom(this.rawState);
        
        // Set anchor to Identity (Standard Orientation)
        // This ensures the display state becomes purely the relative moves from this point.
        this.anchor = new CubieCube(); 
        
        this.hasAnchored = true;
        
        // Emit update to snap UI
        this.emitUpdate();
    }

    /**
     * Check if the facelet string represents a solved cube (monochromatic faces)
     * Handles any orientation.
     */
    private isSolved(facelets: string): boolean {
        // Check each of the 6 faces (9 stickers each)
        for (let i = 0; i < 54; i += 9) {
            const face = facelets.slice(i, i + 9);
            const first = face[0];
            for (let j = 1; j < 9; j++) {
                if (face[j] !== first) {
                    // DEBUG: Log why it failed
                    console.log(`[LogicalCube] Not Solved: Face ${i/9} has mixed colors: ${face}`);
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Emit update event with current state
     */
    private emitUpdate(moveStr?: string, timestamp?: number) {
        // Calculate Display State: AnchorInv * RawState * Anchor (Conjugation)
        const temp = new CubieCube();
        CubieCube.CubeMult(this.anchorInv, this.rawState, temp);
        const displayState = new CubieCube();
        CubieCube.CubeMult(temp, this.anchor, displayState);
        
        const facelets = displayState.toFaceCube();
        
        // DEBUG: Log facelets to see why it's not matching
        const solved = this.isSolved(facelets);
        if (solved) {
             console.log(`[LogicalCube] ✅ SOLVED DETECTED!`);
        } else {
             console.log(`[LogicalCube] State: ${facelets}`);
        }
        
        // Emit to listeners
        if (this.listeners['update']) {
            // console.log(`[LogicalCube] Emitting update: move=${moveStr}, timestamp=${timestamp}`);
            this.listeners['update'].forEach(listener => listener({
                move: moveStr,
                state: facelets,
                timestamp: timestamp || Date.now()
            }));
        }
        // Check solved on DISPLAY state
        if (solved) {
            this.emit('solved', { 
                timestamp: timestamp || Date.now(),
                solutionMoves: [...this.currentSolutionMoves]
            });
        }
    }

    /**
     * Convert move string to mathlib move index (0-17)
     * Mapping: U=0, R=3, F=6, D=9, L=12, B=15
     * Power: None=0, 2=1, '=2
     */
    private getMoveIndex(moveStr: string): number {
        const face = moveStr.charAt(0);
        const suffix = moveStr.substring(1);
        
        let base = -1;
        switch (face) {
            case 'U': base = 0; break;
            case 'R': base = 3; break;
            case 'F': base = 6; break;
            case 'D': base = 9; break;
            case 'L': base = 12; break;
            case 'B': base = 15; break;
        }
        
        if (base === -1) return -1;
        
        let power = 0;
        if (suffix === '2') power = 1;
        else if (suffix === "'") power = 2;
        
        return base + power;
    }

    // --- Event Emitter Implementation ---

    public on(event: string, callback: Listener) {
        if (!this.listeners[event]) {
            this.listeners[event] = new Set();
        }
        this.listeners[event].add(callback);
    }

    public off(event: string, callback: Listener) {
        if (this.listeners[event]) {
            this.listeners[event].delete(callback);
        }
    }

    private emit(event: string, data: any) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error(`[LogicalCube] Error in listener for ${event}:`, e);
                }
            });
        }
    }
}
