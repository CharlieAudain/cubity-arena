import { io } from 'socket.io-client';

// Use environment variable for production, fallback to localhost for development
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

// Initialize socket outside component to prevent multiple connections
export const socket = io(SOCKET_URL, {
    autoConnect: false,
    withCredentials: true
});

// Log connection status
socket.on('connect', () => {
    console.log('[Socket] Connected to server:', SOCKET_URL);
});

socket.on('disconnect', () => {
    console.log('[Socket] Disconnected from server');
});

socket.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error.message);
});

export const useSocket = () => {
    return socket;
};
