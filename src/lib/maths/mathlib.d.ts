export class CubieCube {
    ca: number[]; // Corner Array (0-7)
    ea: number[]; // Edge Array (0-11)
    constructor();
    init(ca: number[], ea: number[]): void;
    toFaceCube(): string; // Returns 54-char string "UUU..."
    fromFacelet(facelet: string): CubieCube | number; // Returns this or -1
    isEqual(c: CubieCube): boolean;
    verify(): number; // Returns 0 if valid
    invFrom(cc: CubieCube): CubieCube; // Inverts cc into this
    
    // Static properties
    static moveCube: CubieCube[]; // Array of 18 basic moves
    static CubeMult(a: CubieCube, b: CubieCube, prod: CubieCube): void;
}

declare const mathlib: {
    CubieCube: typeof CubieCube;
    SOLVED_FACELET: string;
};

export default mathlib;
