import mathlib from '../lib/cstimer/mathlib';

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
    private wrongMoveCount: number = 0;
    private expectedMoveSequence: string[] = [];

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
        const moves = scrambleAlg.split(/\s+/).filter(m => m);
        
        // Reset tracking
        this.wrongMoveCount = 0;
        this.expectedMoveSequence = [...moves];
        
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
    public applyMove(moveStr: string) {
        if (!moveStr) return;

        // VALIDATION:
        if (!this.validateMove(moveStr)) {
            console.warn(`[LogicalCube] ❌ Invalid move rejected: ${moveStr}`);
            return;
        }

        // SCRAMBLE TRACKING:
        if (this.expectedMoveSequence.length > 0) {
            const expected = this.expectedMoveSequence[0];
            if (moveStr === expected) {
                // Correct move!
                this.expectedMoveSequence.shift();
                this.wrongMoveCount = 0;
            } else {
                // Wrong move
                this.wrongMoveCount++;
            }
            
            this.emit('scramble_progress', {
                wrongMoves: this.wrongMoveCount,
                remainingMoves: this.expectedMoveSequence.length,
                isComplete: this.expectedMoveSequence.length === 0
            });
        }

        const moveIdx = this.getMoveIndex(moveStr);
        if (moveIdx === -1) return; 

        // 1. Update the RAW hardware state
        const nextRaw = new CubieCube();
        CubieCube.CubeMult(this.rawState, CubieCube.moveCube[moveIdx], nextRaw);
        
        // Idempotency Check (Optional but good)
        // if (nextRaw.isEqual(this.rawState)) return;

        this.rawState = nextRaw;

        // 2. Emit the RELATIVE state to the UI
        this.emitUpdate(moveStr);
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
        // Only set anchor on FIRST connection/sync to establish orientation.
        // Subsequent syncs should preserve the anchor to maintain relative state.
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
        if (displayFacelets === "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB") {
            this.emit('solved', {});
        }
    }

    /**
     * Emit update event with current state
     */
    private emitUpdate(moveStr?: string) {
        // Calculate Display State: AnchorInv * RawState * Anchor (Conjugation)
        const temp = new CubieCube();
        CubieCube.CubeMult(this.anchorInv, this.rawState, temp);
        const displayState = new CubieCube();
        CubieCube.CubeMult(temp, this.anchor, displayState);
        
        const facelets = displayState.toFaceCube();
        
        // Emit to listeners
        if (this.listeners['update']) {
            this.listeners['update'].forEach(listener => listener({
                move: moveStr,
                state: facelets
            }));
        }
        // Check solved on DISPLAY state
        if (facelets === "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB") {
            this.emit('solved', {});
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
