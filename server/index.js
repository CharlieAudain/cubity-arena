import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";
import admin from 'firebase-admin';
import validator from 'validator';
import { isValidUsername, isValidRoomId, sanitizeMessage, isValidMove } from './utils/validation.js';
import { calculateEloChange } from '../src/utils/elo.js';
import { MatchQueue } from './utils/MatchMaker.js';
import Scrambo from 'scrambo';

// Load environment variables
dotenv.config();

const app = express();

// Initialize Firebase (Client SDK on Server)
// We use the client SDK because we are accessing public data (banned_users)
// and don't have the Admin SDK service account key configured.
const firebaseConfig = {
  apiKey: process.env.VITE_API_KEY,
  authDomain: process.env.VITE_AUTH_DOMAIN,
  projectId: process.env.VITE_PROJECT_ID,
  storageBucket: process.env.VITE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_APP_ID,
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Initialize Firebase Admin
let serviceAccount;

try {
  // Try to load from file (Local Development)
  serviceAccount = require("./service-account.json");
} catch (e) {
  // Fallback to Environment Variable (Production/Container)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (parseError) {
      console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable");
      process.exit(1);
    }
  } else {
    console.error("❌ service-account.json not found and FIREBASE_SERVICE_ACCOUNT not set");
    console.error("   Please ensure you have either the file or the environment variable configured.");
    process.exit(1);
  }
}

// Initialize the Admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("🔥 Firebase Admin Initialized");
}

// CORS Configuration - Whitelist allowed origins
const ALLOWED_ORIGINS = process.env.NODE_ENV === 'production' 
    ? [
        'https://cubity-arena.vercel.app',
        'https://cubity.app',
        'https://www.cubity.app'
      ]
    : [
        'http://localhost:5175',
        'http://localhost:3000',
        'http://localhost:5173',
        "https://cubity.app",       // <--- NEW
  "https://www.cubity.app"    // <--- NEW
      ];

// Express CORS middleware
app.use(cors({
    origin: (origin, callback) => {
        // In development, allow requests with no origin (Postman, curl, etc.)
        if (!origin && process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        
        // In production, reject requests with no origin
        if (!origin) {
            console.warn('CORS blocked: No origin header');
            return callback(new Error('Origin header required'));
        }
        
        if (ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

const httpServer = createServer(app);

// Socket.IO CORS configuration
// Socket.IO CORS configuration
const io = new Server(httpServer, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Matchmaking Queue
let queue3x3 = [];

// Map socketId -> roomId
const socketRooms = {};

// API: Create a test match (for Admin Dashboard)
// API: Create a test match (DISABLED FOR PRODUCTION)
/*
app.post('/api/test-match', (req, res) => {
    const roomId = `test-${uuidv4().slice(0, 8)}`;
    
    activeRooms[roomId] = {
        id: roomId,
        type: 'TEST',
        startTime: Date.now(),
        player1: { 
            id: 'test-p1', 
            name: 'Test Player 1', 
            socketId: 'test-s1' 
        },
        player2: { 
            id: 'test-p2', 
            name: 'Test Player 2', 
            socketId: 'test-s2' 
        },
        scramble: "R U R' U'",
        status: 'active'
    };

    console.log(`[TEST] Created test room ${roomId}`);
    res.json({ success: true, roomId });
});
*/

// Active Rooms (Source of Truth for Admin)
const activeRooms = {}; // { roomId: { id, type, player1, player2, startTime } }

// Rate Limiting
const rateLimits = {}; // { socketId: { count: 0, lastReset: Date.now() } }
const RATE_LIMIT = 50; // Max messages per second

const checkRateLimit = (socket) => {
    const now = Date.now();
    if (!rateLimits[socket.id]) {
        rateLimits[socket.id] = { count: 1, lastReset: now };
        return true;
    }

    const limit = rateLimits[socket.id];
    if (now - limit.lastReset > 1000) {
        limit.count = 1;
        limit.lastReset = now;
        return true;
    }

    limit.count++;
    if (limit.count > RATE_LIMIT) {
        console.warn(`RATE LIMIT EXCEEDED: ${socket.id} (${limit.count} msgs/s) - DISCONNECTING`);
        socket.disconnect();
        return false;
    }
    return true;
};

// API Endpoints for Admin
app.get('/api/rooms', (req, res) => {
    res.json(Object.values(activeRooms));
});

app.delete('/api/rooms/:roomId', (req, res) => {
    const { roomId } = req.params;
    const room = activeRooms[roomId];
    
    if (room) {
        console.log(`Admin force-closing room ${roomId}`);
        
        // Disconnect players
        const p1Socket = io.sockets.sockets.get(room.player1.socketId);
        const p2Socket = io.sockets.sockets.get(room.player2.socketId);
        
        if (p1Socket) {
            p1Socket.emit('room_closed_by_admin');
            p1Socket.leave(roomId);
            delete socketRooms[p1Socket.id];
        }
        
        if (p2Socket) {
            p2Socket.emit('room_closed_by_admin');
            p2Socket.leave(roomId);
            delete socketRooms[p2Socket.id];
        }
        
        delete activeRooms[roomId];
        res.json({ success: true, message: `Room ${roomId} closed` });
    } else {
        res.status(404).json({ error: 'Room not found' });
    }
});

// Socket.IO Middleware
io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
        return next(new Error("Authentication error: No token provided"));
    }

    try {
        // 1. Verify Token
        const decodedToken = await admin.auth().verifyIdToken(token);
        socket.user = decodedToken;

        // 2. Check Ban Status (users collection)
        // We use Admin SDK for this check
        if (admin.apps.length > 0) {
            const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                if (userData.isBanned === true || userData.status === 'banned') {
                     return next(new Error("Account banned"));
                }
            }
        }
        
        next();
    } catch (err) {
        console.error("Socket Auth Error:", err);
        next(new Error("Authentication error"));
    }
});


// Validation Middleware Wrapper
const validate = (socket, schemaFn, handler) => (data) => {
    // 1. Sanitize (if string)
    if (typeof data === 'string') {
        data = validator.trim(data);
    }
    
    // 2. Validate
    if (!schemaFn(data)) {
        console.warn(`[Security] 🛡️ Blocked invalid input from ${socket.id}:`, JSON.stringify(data));
        socket.emit('error', { message: 'Invalid input format' });
        return;
    }
    
    // 3. Pass to Handler
    return handler(socket, data);
};

io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    // --- VALIDATED EVENTS ---

    // Join Room
    const handleJoinRoom = (socket, roomId) => {
        socket.join(roomId);
        socketRooms[socket.id] = roomId;
        console.log(`User ${socket.id} joined room ${roomId}`);
        
        // Notify others
        // socket.user is set in middleware (decoded token)
        const userData = socket.user ? {
            uid: socket.user.uid,
            displayName: socket.user.name || socket.user.displayName || 'Opponent',
            photoURL: socket.user.picture
        } : { userId: socket.id };

        socket.to(roomId).emit('user_joined', { userId: socket.id, userData });
    };
    socket.on('join_room', validate(socket, isValidRoomId, handleJoinRoom));
});

// Matchmaking Queue
const matchQueue = new MatchQueue();
const socketToUserMap = {}; // Helper to retrieve user data for match payload

// Matchmaking Loop (Runs every 1 second)
setInterval(async () => {
    // Debug log only if queue has players
    if (matchQueue.queue.length > 0) {
        console.log(`[MatchMaker] Queue Size: ${matchQueue.queue.length}. Searching...`);
    }

    const match = matchQueue.findMatch();
    
    if (match) {
        const { player1, player2 } = match;
        console.log(`[MatchMaker] Match Proposed: ${player1.socketId} vs ${player2.socketId}`);
        
        // Generate Server-Side Scramble
        let scrambleString = "R U R' U'"; // Fallback
        try {
            // Use Scrambo for reliable server-side generation
            const scrambler = new Scrambo();
            scrambleString = scrambler.type('333').get()[0];
            console.log(`[MatchMaker] Generated Scramble: ${scrambleString}`);
        } catch (e) {
            console.error("Failed to generate scramble:", e);
        }

        const roomId = `room_${uuidv4().slice(0, 8)}`;
        
        // Retrieve Sockets
        const socket1 = io.sockets.sockets.get(player1.socketId);
        const socket2 = io.sockets.sockets.get(player2.socketId);

        // Retrieve User Data
        const user1Data = socketToUserMap[player1.socketId];
        const user2Data = socketToUserMap[player2.socketId];

        if (socket1 && socket2 && user1Data && user2Data) {
            // Join Room
            socket1.join(roomId);
            socket2.join(roomId);
            
            // Track Rooms
            socketRooms[player1.socketId] = roomId;
            socketRooms[player2.socketId] = roomId;

            // Add to Active Rooms
            activeRooms[roomId] = {
                id: roomId,
                type: '3x3',
                player1: { 
                    id: user1Data.uid, 
                    name: user1Data.displayName, 
                    socketId: player1.socketId 
                },
                player2: { 
                    id: user2Data.uid, 
                    name: user2Data.displayName, 
                    socketId: player2.socketId 
                },
                startTime: Date.now(),
                scramble: scrambleString
            };

            console.log(`[MatchMaker] Match Starting: ${user1Data.displayName} vs ${user2Data.displayName} in ${roomId}`);
            
            io.to(roomId).emit('match_found', { 
                roomId, 
                players: {
                    p1: { id: user1Data.uid, name: user1Data.displayName, elo: user1Data.elo || 800 },
                    p2: { id: user2Data.uid, name: user2Data.displayName, elo: user2Data.elo || 800 }
                },
                scramble: scrambleString 
            });

            // Emit match_start immediately (redundant but safe)
            io.to(roomId).emit('match_start', { scramble: scrambleString, startTime: Date.now() });

        } else {
             console.error(`[MatchMaker] Failed to start match ${roomId}:`);
             if (!socket1) console.error(` - Missing Socket 1 (${player1.socketId})`);
             if (!socket2) console.error(` - Missing Socket 2 (${player2.socketId})`);
             if (!user1Data) console.error(` - Missing User Data 1 (${player1.socketId})`);
             if (!user2Data) console.error(` - Missing User Data 2 (${player2.socketId})`);
             
             // Cleanup invalid players from queue?
             // Maybe remove them so they don't block the queue forever?
             if (!socket1) matchQueue.removePlayer(player1.socketId);
             if (!socket2) matchQueue.removePlayer(player2.socketId);
        }
    }
}, 1000);

// Socket Connection
io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);
    
    // Rate Limiter
    if (!rateLimits[socket.id]) rateLimits[socket.id] = { count: 0, lastReset: Date.now() };

    // Clean up queue on disconnect if needed (MatchQueue.removePlayer handled later)

    // Send Move
    const handleSendMove = (socket, moveData) => {
        if (!checkRateLimit(socket)) return;
        
        // ... (existing move handler) ...
        let move = moveData;
        let timestamp = Date.now();
        let state = null;
        
        if (typeof moveData === 'object') {
            move = moveData.move;
            if (moveData.timestamp) timestamp = moveData.timestamp;
            if (moveData.state) state = moveData.state;
        }

        const roomId = socketRooms[socket.id];
        if (roomId) {
            // console.log(`[Server] Relaying move ${move} from ${socket.id} to ${roomId}`);
            socket.to(roomId).emit('opponent_move', { move, state, userId: socket.id, timestamp });
        }
    };
    // Custom schema for move object/string
    const validateMovePayload = (data) => {
        if (typeof data === 'string') return isValidMove(data);
        if (typeof data === 'object') return isValidMove(data.move);
        return false;
    };
    socket.on('send_move', validate(socket, validateMovePayload, handleSendMove));

    // Chat Message
    const handleChatMessage = (socket, msg) => {
        const roomId = socketRooms[socket.id];
        if (roomId) {
            const cleanMsg = sanitizeMessage(msg);
            if (cleanMsg.length > 0) {
                io.to(roomId).emit('chat_message', { userId: socket.id, message: cleanMsg });
            }
        }
    };
    // For chat, we validate it's a string and length check
    const isValidChat = (msg) => typeof msg === 'string' && msg.length > 0 && msg.length <= 200;
    socket.on('chat_message', validate(socket, isValidChat, handleChatMessage));

    // --- UNVALIDATED / LEGACY EVENTS (To be migrated) ---

    // JOIN QUEUE
    socket.on('join_queue', async (data) => {
        if (!checkRateLimit(socket)) return;

        const { queueType, user } = data;
        console.log(`User ${user.displayName} (${socket.id}) attempting to join ${queueType} queue`);

        // 1. Server-Side Ban Check
        try {
            // Check if username is in banned_users collection
            // Note: We use the username as the document ID for banned_users
            const username = user.displayName;
            if (username && typeof username === 'string') {
                const cleanUsername = username.trim().toLowerCase();
                
                if (cleanUsername.length > 0 && !cleanUsername.includes('/')) {
                     // console.log(`[BanCheck] Checking username: '${cleanUsername}'`);
                     const bannedRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'banned_users', cleanUsername);
                     const bannedSnap = await getDoc(bannedRef);
    
                     if (bannedSnap.exists()) {
                         console.warn(`🚫 BLOCKED BANNED USER: ${username} tried to join queue.`);
                         socket.emit('error', { message: 'You are banned from matchmaking.' });
                         socket.disconnect(); 
                         return;
                     }
                } else {
                     console.warn(`[BanCheck] Invalid username format: '${username}'`);
                }
            } else {
                 // console.warn(`[BanCheck] No username provided or invalid type:`, user);
            }
        } catch (err) {
            console.error('Error checking ban status:', err);
            // Fail open or closed? For now, log error and proceed, but in strict mode we might block.
        }

        // Store user data
        socketToUserMap[socket.id] = user;

        // Add to MatchQueue
        // Assuming user.elo exists, otherwise default
        const elo = user.elo || 800; // Default Elo
        matchQueue.addPlayer({ socketId: socket.id, elo });
    });

    // SIGNALING (Relay WebRTC messages)
    socket.on('signal', (data) => {
        if (!checkRateLimit(socket)) return;

        const { roomId, signalData } = data;
        // Broadcast to everyone else in the room (which is just the opponent)
        socket.to(roomId).emit('signal', signalData);
    });

    // LEAVE ROOM
    socket.on('leave_room', async (data) => {
        if (!checkRateLimit(socket)) return;

        const { roomId } = data;
        const room = activeRooms[roomId];

        if (room && !room.processed) {
            console.log(`User ${socket.id} forfeited match ${roomId}`);
            
            // Determine winner (the one who didn't leave)
            let winnerId = null;
            if (socket.id === room.player1.socketId) winnerId = room.player2.id;
            else if (socket.id === room.player2.socketId) winnerId = room.player1.id;

            if (winnerId) {
                
                
                try {
                    room.processed = true; // Mark processed

                    const adminDb = admin.firestore();
                    const user1Ref = adminDb.doc(`artifacts/cubity-v1/users/${room.player1.id}/profile/main`); 
                    const user2Ref = adminDb.doc(`artifacts/cubity-v1/users/${room.player2.id}/profile/main`);
                    
                    const [user1Snap, user2Snap] = await Promise.all([user1Ref.get(), user2Ref.get()]);

                    if (user1Snap.exists && user2Snap.exists) {
                        const user1Data = user1Snap.data();
                        const user2Data = user2Snap.data();
                        const rating1 = user1Data.elo || 800;
                        const rating2 = user2Data.elo || 800;

                        let scoreP1 = 0.5;
                        if (winnerId === room.player1.id) scoreP1 = 1;
                        else if (winnerId === room.player2.id) scoreP1 = 0;

                        const { newRatingA, newRatingB } = calculateEloChange(rating1, rating2, scoreP1);

                        await Promise.all([
                            user1Ref.update({ elo: newRatingA }),
                            user2Ref.update({ elo: newRatingB })
                        ]);

                        io.to(roomId).emit('update_user_stats', {
                            [room.player1.id]: newRatingA,
                            [room.player2.id]: newRatingB
                        });
                        console.log(`[FORFEIT] Elo Updated: ${newRatingA} / ${newRatingB} (Admin SDK)`);
                    }
                } catch (e) {
                    console.error("Error processing forfeit:", e);
                }

            }
        }

        console.log(`User ${socket.id} left room ${roomId}`);
        socket.to(roomId).emit('opponent_left');
        socket.leave(roomId);
        delete socketRooms[socket.id];
        
        if (activeRooms[roomId]) {
            delete activeRooms[roomId];
        }
    });

    // LEAVE / DISCONNECT
    socket.on('disconnect', async () => {
        console.log(`User Disconnected: ${socket.id}`);
        // queue3x3 = queue3x3.filter(s => s.id !== socket.id); // LEGACY
        matchQueue.removePlayer(socket.id); // Remove from queue
        
        const roomId = socketRooms[socket.id];
        if (roomId) {
            const room = activeRooms[roomId];
            
            // Auto-Forfeit Logic (Duplicate of leave_room but for disconnect)
            if (room && !room.processed) {
                console.log(`User ${socket.id} disconnected during match ${roomId} (Forfeit)`);
                
                let winnerId = null;
                if (socket.id === room.player1.socketId) winnerId = room.player2.id;
                else if (socket.id === room.player2.socketId) winnerId = room.player1.id;

                if (winnerId) {
                     try {
                        room.processed = true; 

                        const adminDb = admin.firestore();
                        const user1Ref = adminDb.doc(`artifacts/cubity-v1/users/${room.player1.id}/profile/main`); 
                        const user2Ref = adminDb.doc(`artifacts/cubity-v1/users/${room.player2.id}/profile/main`);
                        
                        const [user1Snap, user2Snap] = await Promise.all([user1Ref.get(), user2Ref.get()]);

                        if (user1Snap.exists && user2Snap.exists) {
                            const user1Data = user1Snap.data();
                            const user2Data = user2Snap.data();
                            const rating1 = user1Data.elo || 800;
                            const rating2 = user2Data.elo || 800;

                            let scoreP1 = 0.5;
                            if (winnerId === room.player1.id) scoreP1 = 1;
                            else if (winnerId === room.player2.id) scoreP1 = 0;

                            const { newRatingA, newRatingB } = calculateEloChange(rating1, rating2, scoreP1);

                            await Promise.all([
                                user1Ref.update({ elo: newRatingA }),
                                user2Ref.update({ elo: newRatingB })
                            ]);

                            // Emit only to remaining socket since this one is dead
                            // Actually io.to(roomId) still works for the other guy
                            io.to(roomId).emit('update_user_stats', {
                                [room.player1.id]: newRatingA,
                                [room.player2.id]: newRatingB
                            });
                             console.log(`[DISCONNECT FORFEIT] Elo Updated: ${newRatingA} / ${newRatingB} (Admin SDK)`);
                        }
                    } catch (e) {
                        console.error("Error processing disconnect forfeit:", e);
                    }
                }
            }

            console.log(`User ${socket.id} disconnected from room ${roomId}`);
            socket.to(roomId).emit('opponent_left');
            delete socketRooms[socket.id];
            
            if (activeRooms[roomId]) {
                delete activeRooms[roomId];
            }
        }
        delete rateLimits[socket.id];
    });

    // MATCH FINISHED - ELO CALCULATION
    socket.on('match_finished', async (data) => {
        if (!checkRateLimit(socket)) return;

        const { roomId, winnerId } = data;
        
        // --- DEBUG ROOM HANDLING ---
        if (roomId.startsWith('debug-room')) {
             console.log(`[DEBUG] Processing match for ${roomId}`);
             // Just mirror the update back to the sender for testing
             // We can't update both if one is fake.
             // We'll update only the sender (socket.user)
             const senderUser = socketToUserMap[socket.id];
             if (senderUser) {
                 // Fetch actual current Elo
                 const userRef = doc(db, 'users', senderUser.uid);
                 const userSnap = await getDoc(userRef);
                 if (userSnap.exists()) {
                     const currentElo = userSnap.data().elo || 800;
                     const opponentElo = 800;
                     // Assume we are Player 1
                     let score = 0.5;
                     if (winnerId === senderUser.uid) score = 1;
                     else if (winnerId !== 'DRAW') score = 0;
                     
                     const { newRatingA } = calculateEloChange(currentElo, opponentElo, score);
                     await updateDoc(userRef, { elo: newRatingA });
                     
                     socket.emit('update_user_stats', {
                         [senderUser.uid]: newRatingA
                     });
                     console.log(`[DEBUG] Updated Elo for ${senderUser.displayName}: ${currentElo} -> ${newRatingA}`);
                 }
             }
             return;
        }

        const room = activeRooms[roomId];

        if (!room) {
             console.warn(`[MatchFinished] Room ${roomId} not found or active.`);
             return;
        }
        if (room.processed) {
             console.log(`[MatchFinished] Room ${roomId} already processed. Skipping.`);
             return; // Idempotency check
        }

        try {
            console.log(`[MatchFinished] Processing result for ${roomId}. Winner: ${winnerId}`);
            room.processed = true; // Mark as processed immediately

const adminDb = admin.firestore();

// ... inside match_finished logic
            // 1. Fetch Players from DB (Using Admin SDK)
            const user1Ref = adminDb.doc(`artifacts/cubity-v1/users/${room.player1.id}/profile/main`); 
            const user2Ref = adminDb.doc(`artifacts/cubity-v1/users/${room.player2.id}/profile/main`);
            
            const [user1Snap, user2Snap] = await Promise.all([
                user1Ref.get(),
                user2Ref.get()
            ]);

            if (!user1Snap.exists) console.error(`[ELO] User 1 (${room.player1.id}) profile not found!`);
            if (!user2Snap.exists) console.error(`[ELO] User 2 (${room.player2.id}) profile not found!`);
            
            if (!user1Snap.exists || !user2Snap.exists) {
                console.error('[ELO] Cannot update Elo: One or more users not found in DB');
                return;
            }

            const user1Data = user1Snap.data();
            const user2Data = user2Snap.data();

            // Default to 800 if undefined
            const rating1 = user1Data.elo || 800;
            const rating2 = user2Data.elo || 800;
            
            console.log(`[ELO] Current Ratings: ${rating1} vs ${rating2}`);

            // 2. Calculate Actual Score for Player 1
            let scoreP1 = 0.5;
            if (winnerId === room.player1.id) scoreP1 = 1;
            else if (winnerId === room.player2.id) scoreP1 = 0;
            
            console.log(`[ELO] Score P1: ${scoreP1} (Winner: ${winnerId})`);

            // 3. Calculate Elo Change
            const { newRatingA, newRatingB } = calculateEloChange(rating1, rating2, scoreP1);
            
            console.log(`[ELO] New Ratings: ${newRatingA} vs ${newRatingB}`);

            // 4. Update Database (Using Admin SDK)
            await Promise.all([
                user1Ref.update({ elo: newRatingA }),
                user2Ref.update({ elo: newRatingB })
            ]);
            
            console.log(`[ELO] Firestore Updated Successfully (Admin).`);

            // 5. Emit Real-time Update
            io.to(roomId).emit('update_user_stats', {
                [room.player1.id]: newRatingA,
                [room.player2.id]: newRatingB
            });
            console.log(`[ELO] Emitted update_user_stats.`);

            
            console.log(`[MATCH] ${roomId} Finished. Elo Update: ${user1Data.displayName} (${rating1}->${newRatingA}) vs ${user2Data.displayName} (${rating2}->${newRatingB})`);


            
            // Clean up room after delay
            setTimeout(() => {
                delete activeRooms[roomId];
            }, 5000);

        } catch (err) {
            console.error('Error updating Elo ratings:', err);
            socket.emit('error', { message: 'Failed to update match results.' });
            room.processed = false; // Revert if failed
        }
    });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
    console.log(`SERVER RUNNING ON PORT ${PORT}`);
});
