import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import admin from 'firebase-admin';

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
// Load the key
const serviceAccount = require("./service-account.json");

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

io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

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
            if (username) {
                const bannedRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'banned_users', username.toLowerCase());
                const bannedSnap = await getDoc(bannedRef);

                if (bannedSnap.exists()) {
                    console.warn(`🚫 BLOCKED BANNED USER: ${username} tried to join queue.`);
                    socket.emit('error', { message: 'You are banned from matchmaking.' });
                    socket.disconnect(); // Force disconnect
                    return;
                }
            }
        } catch (err) {
            console.error('Error checking ban status:', err);
            // Fail open or closed? For now, log error and proceed, but in strict mode we might block.
        }

        // Remove from queue if already there to prevent duplicates
        queue3x3 = queue3x3.filter(s => s.id !== socket.id);

        queue3x3.push({ socket, user });

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
                    id: p1.user.uid, 
                    name: p1.user.displayName, 
                    socketId: p1.socket.id 
                },
                player2: { 
                    id: p2.user.uid, 
                    name: p2.user.displayName, 
                    socketId: p2.socket.id 
                },
                startTime: Date.now()
            };

            console.log(`Match Found! Room: ${roomId} | ${p1.user.displayName} vs ${p2.user.displayName}`);

            // Notify Players
            p1.socket.emit('match_found', { 
                roomId, 
                opponent: p2.user, 
                isHost: true,
                scramble: "R U R' U' R U R' U' R U R' U'" // Generate real scramble later
            });

            p2.socket.emit('match_found', { 
                roomId, 
                opponent: p1.user, 
                isHost: false,
                scramble: "R U R' U' R U R' U' R U R' U'"
            });
        }
    });

    // SIGNALING (Relay WebRTC messages)
    socket.on('signal', (data) => {
        if (!checkRateLimit(socket)) return;

        const { roomId, signalData } = data;
        // Broadcast to everyone else in the room (which is just the opponent)
        socket.to(roomId).emit('signal', signalData);
    });

    // LEAVE ROOM
    socket.on('leave_room', (data) => {
        if (!checkRateLimit(socket)) return;

        const { roomId } = data;
        console.log(`User ${socket.id} left room ${roomId}`);
        socket.to(roomId).emit('opponent_left');
        socket.leave(roomId);
        delete socketRooms[socket.id];
        
        // Remove from active rooms if empty or just mark as partial?
        // For now, if anyone leaves, we consider the match over/room invalid for monitoring
        if (activeRooms[roomId]) {
            delete activeRooms[roomId];
        }
    });

    // LEAVE / DISCONNECT
    socket.on('disconnect', () => {
        console.log(`User Disconnected: ${socket.id}`);
        queue3x3 = queue3x3.filter(s => s.id !== socket.id);
        
        const roomId = socketRooms[socket.id];
        if (roomId) {
            console.log(`User ${socket.id} disconnected from room ${roomId}`);
            socket.to(roomId).emit('opponent_left');
            delete socketRooms[socket.id];
            
            // Remove from active rooms
            if (activeRooms[roomId]) {
                delete activeRooms[roomId];
            }
        }
        delete rateLimits[socket.id];
    });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
    console.log(`SERVER RUNNING ON PORT ${PORT}`);
});
