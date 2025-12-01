import validator from 'validator';

/**
 * Validate Username
 * Alphanumeric, 3-16 characters
 */
export const isValidUsername = (name) => {
    if (!name || typeof name !== 'string') return false;
    // Allow alphanumeric and spaces
    return /^[a-zA-Z0-9 ]+$/.test(name) && validator.isLength(name, { min: 3, max: 20 });
};

/**
 * Validate Room ID
 * Alphanumeric, 5-10 characters
 */
export const isValidRoomId = (id) => {
    if (!id || typeof id !== 'string') return false;
    return validator.isAlphanumeric(id) && validator.isLength(id, { min: 5, max: 10 });
};

/**
 * Sanitize Chat Message
 * Trim, escape HTML, max 200 chars
 */
export const sanitizeMessage = (msg) => {
    if (!msg || typeof msg !== 'string') return '';
    const trimmed = validator.trim(msg);
    const escaped = validator.escape(trimmed);
    return escaped.substring(0, 200); // Max length
};

/**
 * Validate Cube Move (WCA Notation)
 * Matches standard moves like R, U', F2, Rw, M, x, etc.
 */
export const isValidMove = (move) => {
    if (!move || typeof move !== 'string') return false;
    // Regex for WCA notation:
    // [URFDLB]w? : Basic faces + optional wide (Rw)
    // [EMSyxz]   : Slices and rotations
    // ['2]?      : Optional modifier (' or 2)
    const moveRegex = /^([URFDLB]w?|[EMSyxz])['2]?$/;
    return moveRegex.test(move);
};
