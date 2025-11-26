import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Allow all origins for dev
        methods: ["GET", "POST"]
    }
});

// Matchmaking Queue
let queue3x3 = [];

// Map socketId -> roomId
const socketRooms = {};

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
        }
        delete rateLimits[socket.id];
    });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
    console.log(`SERVER RUNNING ON PORT ${PORT}`);
});
