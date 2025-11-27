import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

const app = express();

// CORS Configuration - Whitelist allowed origins
const ALLOWED_ORIGINS = process.env.NODE_ENV === 'production' 
    ? [
        'https://cubity-arena.vercel.app',
        'https://cubity.gg',
        'https://www.cubity.gg',
        process.env.RAILWAY_URL, // Railway server URL
        ...(process.env.CUSTOM_ORIGINS ? process.env.CUSTOM_ORIGINS.split(',') : [])
      ].filter(Boolean) // Remove undefined values
    : [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://127.0.0.1:5173',
        'http://localhost:5174' // Vite preview
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
const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            // In development, allow requests with no origin
            if (!origin && process.env.NODE_ENV !== 'production') {
                return callback(null, true);
            }
            
            // In production, reject requests with no origin
            if (!origin) {
                console.warn('Socket.IO CORS blocked: No origin header');
                return callback(new Error('Origin header required'));
            }
            
            if (ALLOWED_ORIGINS.includes(origin)) {
                callback(null, true);
            } else {
                console.warn(`Socket.IO CORS blocked origin: ${origin}`);
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Matchmaking Queue
let queue3x3 = [];

// Map socketId -> roomId
const socketRooms = {};

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

io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    // JOIN QUEUE
    socket.on('join_queue', (data) => {
        if (!checkRateLimit(socket)) return;

        const { queueType, user } = data;
        console.log(`User ${user.displayName} (${socket.id}) joining ${queueType} queue`);

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
