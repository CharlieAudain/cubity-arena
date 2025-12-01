# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2025-12-01

### Security Blitz & Scramble Fix
This release focuses on hardening the application security, ensuring competitive integrity with WCA-compliant scrambles, and cleaning up the codebase for production.

#### 🔒 Security
- **Rate Limiting**: Implemented a leaky bucket rate limiter for Socket.IO (50 msgs/sec/socket).
- **WebRTC Encryption**: Added explicit DTLS verification to prevent unencrypted connections.
- **Input Validation**: Added server-side validation for all socket events using `validator.js`.
- **Firestore Rules**: Secured `rooms` and `users` collections with strict read/write rules.
- **Dependency Management**: Configured `Dependabot` for weekly security updates.
- **Audit**: Achieved 0 vulnerabilities in `npm audit` for both root and server.

#### 🎲 Competitive Integrity
- **WCA Scrambles**: Replaced placeholder scrambles with the official `cubing/scramble` library.
- **Server-Side Generation**: Scrambles are now generated on the server for matches to ensure fairness.
- **Move Synchronization**: Switched to state-based sync (sending full facelet strings) to prevent desyncs.

#### 🛠 Stability & Performance
- **Memory Leaks**: Implemented "Deep Cleanup" in `server/index.js` to properly clear intervals and socket references.
- **Error Boundaries**: Added React Error Boundaries around `SmartCube3D` to prevent app crashes.
- **Guest Cleanup**: Implemented automatic deletion of anonymous accounts 60s after disconnection.

#### 💅 UI/UX
- **Discord Integration**: Added "Join Discord" buttons to Landing Page and User Menu.
- **Production Cleanup**: Removed development-only "Test" navigation and "Debug Overlay".
- **Visual Polish**: Improved Timer View layout and removed clutter.

#### 🐛 Bug Fixes
- Fixed "Invalid resource field value" Firestore errors.
- Fixed "Unsupported stickering" errors in `SmartCube3D`.
- Fixed "Ghost Users" in matchmaking queue.
