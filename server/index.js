import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import admin from 'firebase-admin';
import validator from 'validator';
import { isValidUsername, isValidRoomId, sanitizeMessage, isValidMove } from './utils/validation.js';
import { randomScrambleForEvent } from "cubing/scramble";

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

// Debug Config (Masked)
console.log('Firebase Config:', {
    ...firebaseConfig,
    apiKey: firebaseConfig.apiKey ? '***' : 'MISSING',
    projectId: firebaseConfig.projectId || 'MISSING'
});

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Initialize Firebase Admin
// Load the key
const serviceAccount = require("./service-account.json");

// Initialize the Admin SDK
if (admin.apps.length === 0) {
  // Verify Service Account
  if (!serviceAccount.project_id) {
      console.error("🚨 SERVICE ACCOUNT JSON IS MISSING 'project_id'. Firestore will fail.");
  }

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

// Rate Limiting Middleware
const rateLimits = new Map(); // socketId -> { count, start }
const RATE_LIMIT = 50; // Max messages per second

const rateLimiter = (socket, packet, next) => {
  const now = Date.now();
  
  // Initialize or Get Record
  if (!rateLimits.has(socket.id)) {
    rateLimits.set(socket.id, { count: 0, start: now });
  }
  
  const record = rateLimits.get(socket.id);
  
  // Reset window if > 1 second has passed
  if (now - record.start > 1000) {
    record.count = 0;
    record.start = now;
  }
  
  // Increment & Check
  record.count++;
  
  if (record.count > RATE_LIMIT) {
    console.warn(`[Security] ⚡ Rate limit exceeded for ${socket.id} (${record.count}/${RATE_LIMIT})`);
    // Optional: Emit warning to client
    if (record.count === RATE_LIMIT + 1) {
        socket.emit('error', { message: 'Rate limit exceeded. Slow down.' });
    }
    // Block the packet
    return; 
  }
  
  next();
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
// Guest Cleanup Manager
const guestCleanupTimers = new Map(); // uid -> timeoutId

const scheduleCleanup = (uid) => {
    if (guestCleanupTimers.has(uid)) return; // Already scheduled

    console.log(`[Cleanup] ⏳ Scheduling deletion for guest ${uid} in 60s`);
    const timer = setTimeout(async () => {
        try {
            console.log(`[Cleanup] 🧹 Deleting guest ${uid} (Expired)`);
            
            // 1. Delete from Auth (if possible via Admin SDK)
            await admin.auth().deleteUser(uid);
            
            // 2. Delete from Firestore
            await admin.firestore().collection('users').doc(uid).delete();
            
            console.log(`[Cleanup] ✅ Guest ${uid} deleted successfully`);
        } catch (err) {
            console.error(`[Cleanup] ❌ Error deleting guest ${uid}:`, err);
        } finally {
            guestCleanupTimers.delete(uid);
        }
    }, 60000); // 60 seconds

    guestCleanupTimers.set(uid, timer);
};

const cancelCleanup = (uid) => {
    if (guestCleanupTimers.has(uid)) {
        clearTimeout(guestCleanupTimers.get(uid));
        guestCleanupTimers.delete(uid);
        console.log(`[Cleanup] ↩️ Cancelled deletion for ${uid} (Reconnected)`);
    }
};

// Socket.IO Middleware
const verifySocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      console.warn(`[Auth] 🛑 Rejected connection from ${socket.id}: No token`);
      return next(new Error("Authentication error: No token"));
    }

    // 1. Verify Token
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // 2. CRITICAL CHECK: Ensure UID exists
    if (!decodedToken || !decodedToken.uid) {
      console.error(`[Auth] 🚨 Token verified but UID is missing!`, decodedToken);
      return next(new Error("Authentication error: Invalid token payload"));
    }

    const uid = decodedToken.uid;
    const isAnonymous = decodedToken.firebase.sign_in_provider === 'anonymous';

    // CANCEL CLEANUP if reconnecting
    if (isAnonymous) {
        cancelCleanup(uid);
    }

    // 3. Fetch User Profile (Safe Query)
    // Wrap in try/catch specifically for Firestore to isolate issues
    try {
        const userDoc = await admin.firestore().collection('users').doc(uid).get();
        
        if (userDoc.exists && userDoc.data().isBanned) {
             console.warn(`[Auth] 🚫 Banned user tried to connect: ${uid}`);
             return next(new Error("Connection rejected: Account banned"));
        }
        
        // 4. Success
        socket.user = {
          uid: uid,
          email: decodedToken.email,
          username: (userDoc.exists ? userDoc.data().username : null) || 'Anonymous',
          isAnonymous: isAnonymous
        };
        
        next();

    } catch (dbError) {
        console.error(`[Auth] ⚠️ Firestore check failed for ${uid}:`, dbError.message);
        // Decide: Do we allow connection if DB fails? 
        // For now, let's allow it but log the error so gameplay isn't blocked by a DB glitch.
        socket.user = { uid, email: decodedToken.email, username: 'Unknown', isAnonymous: isAnonymous };
        next();
    }

  } catch (err) {
    console.error(`[Auth] ❌ ID Token Verification Failed for ${socket.id}:`, err.message);
    next(new Error("Authentication error"));
  }
};

io.use(verifySocket);

// Validation Middleware Wrapper
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
    // Apply Rate Limiter
    socket.use((packet, next) => rateLimiter(socket, packet, next));

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

    // Send Move
    const handleSendMove = (socket, moveData) => {
        // moveData might be object { move: "R", timestamp: ... } or string "R"
        
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
        // Rate limit handled by middleware

        const { queueType, user } = data;
        console.log(`User ${user.displayName} (${socket.id}) attempting to join ${queueType} queue`);

        // 1. Server-Side Ban Check
        try {
            // Check if username is in banned_users collection
            // Note: We use the username as the document ID for banned_users
            const username = user.displayName;
            
            if (username && isValidUsername(username)) {
                const bannedRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'banned_users', username.toLowerCase());
                const bannedSnap = await getDoc(bannedRef);

                if (bannedSnap.exists()) {
                    console.warn(`🚫 BLOCKED BANNED USER: ${username} tried to join queue.`);
                    socket.emit('error', { message: 'You are banned from matchmaking.' });
                    socket.disconnect(); // Force disconnect
                    return;
                }
            } else {
                console.warn(`⚠️ Skipped ban check for invalid username: "${username}"`);
                // Optional: Reject connection if username is invalid?
                // For now, we allow it but log warning (or maybe we should block?)
                // If username is invalid, they shouldn't be here.
            }
        } catch (err) {
            console.error('Error checking ban status:', err);
            // Fail open or closed? For now, log error and proceed.
        }

        // Remove from queue if already there to prevent duplicates
        queue3x3 = queue3x3.filter(s => s.socket.id !== socket.id); 

        queue3x3.push({ socket, userData: user }); // Push userData

        // Check for Match
        if (queue3x3.length >= 2) {
            const p1 = queue3x3.shift();
            const p2 = queue3x3.shift();

            const roomId = `room_${uuidv4().slice(0, 8)}`;
            
            // Join Room
            p1.socket.join(roomId);
            p2.socket.join(roomId);
            
            // Track Rooms
            socketRooms[p1.socket.id] = roomId;
            socketRooms[p2.socket.id] = roomId;

            // Add to Active Rooms
            activeRooms[roomId] = {
                id: roomId,
                type: '3x3',
                player1: { 
                    id: p1.userData.uid, 
                    name: p1.userData.displayName, 
                    socketId: p1.socket.id 
                },
                player2: { 
                    id: p2.userData.uid, 
                    name: p2.userData.displayName, 
                    socketId: p2.socket.id 
                },
                startTime: Date.now()
            };

            console.log(`Match Found! Room: ${roomId} | ${p1.userData.displayName} vs ${p2.userData.displayName}`);

            // Generate Scramble (Server-Side)
            let scramble = "R U R' U' R U R' U' R U R' U'"; // Fallback
            try {
                const s = await randomScrambleForEvent("333");
                scramble = s.toString();
            } catch (e) {
                console.error("Failed to generate scramble:", e);
            }

            // Notify Players
            p1.socket.emit('match_found', { 
                roomId, 
                opponent: p2.userData, 
                isHost: true,
                scramble: scramble
            });

            p2.socket.emit('match_found', { 
                roomId, 
                opponent: p1.user, 
                isHost: false,
                scramble: scramble
            });
        }
    });

    // SIGNALING (Relay WebRTC messages)
    socket.on('signal', (data) => {
        // Rate limit handled by middleware

        const { roomId, signalData } = data;
        // Broadcast to everyone else in the room (which is just the opponent)
        socket.to(roomId).emit('signal', signalData);
    });

    // LEAVE QUEUE
    socket.on('leave_queue', () => {
        const index = queue3x3.findIndex(s => s.socket.id === socket.id);
        if (index !== -1) {
            queue3x3.splice(index, 1);
            console.log(`[Matchmaking] User ${socket.id} removed from queue`);
        }
    });

    // LEAVE ROOM
    socket.on('leave_room', async (data) => {
        if (!checkRateLimit(socket)) return;

        const { roomId } = data;
        console.log(`User ${socket.id} left room ${roomId}`);
        socket.to(roomId).emit('opponent_left');
        
        // Force Leave
        socket.leave(roomId);
        delete socketRooms[socket.id];
        
        // Remove from active rooms
        if (activeRooms[roomId]) {
            const room = activeRooms[roomId];
            
            // Remove player reference
            if (room.player1.socketId === socket.id) room.player1.socketId = null;
            if (room.player2.socketId === socket.id) room.player2.socketId = null;

            // Check if room is empty
            const socketsInRoom = await io.in(roomId).fetchSockets();
            if (socketsInRoom.length === 0) {
                console.log(`[Rooms] 🗑️ Room ${roomId} deleted (Empty)`);
                
                // 1. Clear Intervals
                if (room.gameInterval) clearInterval(room.gameInterval);
                
                // 2. Delete from Memory
                delete activeRooms[roomId];
                
                // 3. Delete from Firestore
                try {
                    await admin.firestore().collection('artifacts').doc('cubity-v1').collection('public').doc('data').collection('rooms').doc(roomId).delete();
                    console.log(`[Rooms] 🗑️ Room ${roomId} deleted from Firestore`);
                } catch (err) {
                    console.error(`[Rooms] Error deleting room ${roomId} from Firestore:`, err);
                }
            }
        }
    });

    // LEAVE / DISCONNECT
    socket.on('disconnect', async () => {
        console.log(`User Disconnected: ${socket.id}`);
        
        // Schedule Cleanup for Guests
        if (socket.user && socket.user.isAnonymous) {
            scheduleCleanup(socket.user.uid);
        }

        // Remove from Queue
        const qIndex = queue3x3.findIndex(s => s.socket.id === socket.id);
        if (qIndex !== -1) {
            queue3x3.splice(qIndex, 1);
            console.log(`[Matchmaking] User ${socket.id} removed from queue (Disconnect)`);
        }
        
        const roomId = socketRooms[socket.id];
        if (roomId) {
            console.log(`User ${socket.id} disconnected from room ${roomId}`);
            socket.to(roomId).emit('opponent_left');
            
            // Force Leave
            socket.leave(roomId);
            delete socketRooms[socket.id];
            
            // Check if room is empty
            const socketsInRoom = await io.in(roomId).fetchSockets();
            if (socketsInRoom.length === 0) {
                if (activeRooms[roomId]) {
                    const room = activeRooms[roomId];
                    console.log(`[Rooms] 🗑️ Room ${roomId} deleted (Empty/Disconnect)`);
                    
                    // 1. Clear Intervals
                    if (room.gameInterval) clearInterval(room.gameInterval);

                    // 2. Delete from Memory
                    delete activeRooms[roomId];
                    
                    // 3. Delete from Firestore
                    try {
                        await admin.firestore().collection('artifacts').doc('cubity-v1').collection('public').doc('data').collection('rooms').doc(roomId).delete();
                        console.log(`[Rooms] 🗑️ Room ${roomId} deleted from Firestore`);
                    } catch (err) {
                        console.error(`[Rooms] Error deleting room ${roomId} from Firestore:`, err);
                    }
                }
            } else {
                 // If room not empty, nullify player ref
                 if (activeRooms[roomId]) {
                    const room = activeRooms[roomId];
                    if (room.player1.socketId === socket.id) room.player1.socketId = null;
                    if (room.player2.socketId === socket.id) room.player2.socketId = null;
                 }
            }
        }
        rateLimits.delete(socket.id);
    });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
    console.log(`SERVER RUNNING ON PORT ${PORT}`);
});
