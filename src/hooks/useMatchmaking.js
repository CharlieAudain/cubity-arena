import { useState, useEffect } from 'react';
import { useSocket } from './useSocket';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';

export const useMatchmaking = (user) => {
    const [status, setStatus] = useState('idle'); // idle, searching, found
    const [roomId, setRoomId] = useState(null);
    const [roomData, setRoomData] = useState(null);
    const [error, setError] = useState(null);
    
    const socket = useSocket();

    useEffect(() => {
        if (!socket) return;

        // Listen for Match Found
        socket.on('match_found', (data) => {
            console.log("MATCH FOUND!", data);
            setStatus('found');
            setRoomId(data.roomId);
            
            // Construct roomData similar to what Firestore provided
            setRoomData({
                id: data.roomId,
                player1: data.isHost ? user : data.opponent,
                player2: data.isHost ? data.opponent : user,
                scramble: data.scramble,
                type: '3x3',
                isHost: data.isHost // Helper for WebRTC
            });
        });

        // Listen for Errors (e.g. Banned)
        socket.on('error', (data) => {
            console.error("Socket Error:", data);
            setError(data.message);
            setStatus('idle');

            // Force Logout if Banned
            if (data.message && data.message.toLowerCase().includes('banned')) {
                signOut(auth).then(() => {
                    window.location.reload(); // Force reload to clear state
                });
            }
        });

        return () => {
            socket.off('match_found');
            socket.off('error');

            // If user leaves the page while searching, remove them from queue
            // We can't access current 'status' state here directly due to closure staleness 
            // unless we add it to dependency array.
            // But adding 'status' to dependency array re-runs effect on status change.
            // Better approach: Use a ref or separate effect.
        };
    }, [socket, user]);

    // Separate effect for cleanup on unmount if searching
    useEffect(() => {
        return () => {
            if (status === 'searching' && socket) {
                console.log("Navigating away, leaving queue...");
                socket.emit('leave_queue');
            }
        };
    }, [status, socket]);

    const findMatch = (queueType) => {
        if (!user) {
            setError("You must be logged in to play.");
            return;
        }
        
        setStatus('searching');
        setError(null);
        
        socket.emit('join_queue', { 
            queueType, 
            user: { 
                uid: user.uid, 
                displayName: user.displayName, 
                elo: user.elo || 800 
            } 
        });
    };

    const cancelSearch = () => {
        setStatus('idle');
        socket.emit('leave_queue'); // Server should handle this (or just filter by socket id on disconnect)
    };

    return { status, roomId, roomData, findMatch, cancelSearch, error };
};
