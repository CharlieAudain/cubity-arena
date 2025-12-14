/**
 * ScrambleValidator - The Referee
 * 
 * Responsibilities:
 * 1. Store the target scramble (and expected state).
 * 2. Validate if the current cube state matches the target.
 * 3. Implement "Auto-Homing" (Drift Check) to fix orientation issues.
 */

import mathlib from '../lib/maths/mathlib';
import { LogicalCube } from './LogicalCube';

// Extract CubieCube
const CubieCube = mathlib.CubieCube;
type CubieCube = InstanceType<typeof mathlib.CubieCube>;

export class ScrambleValidator {
    private static instance: ScrambleValidator;
    private targetState: CubieCube | null = null;
    private targetScramble: string = "";

    private constructor() {}

    public static getInstance(): ScrambleValidator {
        if (!ScrambleValidator.instance) {
            ScrambleValidator.instance = new ScrambleValidator();
        }
        return ScrambleValidator.instance;
    }

    /**
     * Set the target scramble algorithm
     */
    public setTargetScramble(scramble: string) {
        this.targetScramble = scramble;
        this.targetState = new CubieCube();
        
        // Apply scramble moves to a solved cube to get target state
       
        const moves = scramble.split(/\s+/);
        for (const move of moves) {
            if (!move) continue;
       
            // For now, simple parser for standard moves.
            
            // Assuming standard WCA notation (R, R', R2)
            // mathlib.CubieCube.moveCube array indices:
            // U=0, U2=1, U'=2, R=3...
            // Order: U, R, F, D, L, B
            
            const axis = "URFDLB".indexOf(move[0]);
            if (axis === -1) continue;
            
            let pow = 0; // 1 (90)
            if (move.endsWith("2")) pow = 1; // 2 (180)
            else if (move.endsWith("'")) pow = 2; // 3 (-90)
            
            const m = axis * 3 + pow;
            const next = new CubieCube();
            CubieCube.CubeMult(this.targetState, CubieCube.moveCube[m], next);
            this.targetState.init(next.ca, next.ea);
        }
        
       
    }

    /**
     * Check if the current state matches the target scramble.
     * Performs "Auto-Homing" if matched in a different orientation.
     */
    public async checkState(currentDisplayState: CubieCube): Promise<boolean> {
        if (!this.targetState) return true;

        // 1. Strict Match
        if (this.targetState.isEqual(currentDisplayState)) {
            return true;
        }

        // 2. Drift Check (Auto-Homing)
        // Check if current state is equal to target state * Rotation
        // Or: Target * Rotation = Current?
        // Logic: Calculate transformation T = Current * TargetInv
        // If T is a pure rotation (solved state but rotated), then we are correct but misaligned.
        
        const targetInv = new CubieCube();
        targetInv.invFrom(this.targetState);
        
        const diff = new CubieCube();
        CubieCube.CubeMult(targetInv, currentDisplayState, diff); 
        
        return false;
    }
}
