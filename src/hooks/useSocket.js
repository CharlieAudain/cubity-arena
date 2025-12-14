import { io } from 'socket.io-client';

// Use environment variable for production, fallback to localhost for development
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

import { auth } from '../lib/firebase'; // Import auth instance

// Initialize socket outside component to prevent multiple connections
export const socket = io(SOCKET_URL, {
    autoConnect: false,
    withCredentials: true,
    // Critical: Use callback to refresh token on every reconnection attempt
    auth: async (cb) => {
        const user = auth.currentUser;
        if (user) {
            try {
                // Force refresh token (true) to prevent 1-hour expiration issues
                const token = await user.getIdToken(true);
                
                cb({ token });
            } catch (e) {
                console.error('[Socket] Failed to refresh token:', e);
                cb({});
            }
        } else {
            console.warn('[Socket] No user found during connection attempt');
            cb({});
        }
    }
});

// Log connection status
socket.on('connect', () => {
    
});

socket.on('disconnect', () => {
    
});

socket.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error.message);
});

export const useSocket = () => {
    return socket;
};
