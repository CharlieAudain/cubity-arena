# Changelog

## [Unreleased] - 2025-12-14

### Added
- **Arena Stats Tracking**: Arena solves are now saved to your history with a distinct 'Arena' mode.
- **Solve Reconstruction**: Arena matches now save full move sequences, viewable in the Stats page with 3D playback.
- **Stats View Enhancements**:
    - Added "Arena" filter tab.
    - Added Swords icon for arena solves.
    - Improved chronological sorting (handles mixed timestamp formats).
    - Fixed stats calculation to include all loaded solves, not just visible ones.
- **Server-Side Elo Updates**:
    - Refactored `match_finished`, `leave_room`, and `disconnect` events to use Firebase Admin SDK for secure, reliable Elo updates.
    - Implemented auto-forfeit logic: Disconnecting or leaving a match in progress now correctly deducts Elo and awards a win to the opponent.

### Fixed
- **Moyu Driver**: Fixed `Uint8Array` type error in `MoyuDriver.ts`.
- **Matchmaking**: Corrected `roomData` mapping in `useMatchmaking.js`.
- **BattleRoom**:
    - Fixed `undefined` opponent name error by adding a fallback.
    - Fixed timestamp format mismatch (using ISO String now).
- **SmartCube3D**: Removed redundant "Reset View" button.
- **Server**: Replaced `cubing/scramble` with `scrambo` for reliable server-side scramble generation.

### Changed
- **Profile Sync**: Switched client-side profile fetching to `onSnapshot` for real-time Elo updates in the UI.
