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
           
            setStatus('found');
            setRoomId(data.roomId);
            
            // Determine roles based on uid
            const p1 = data.players.p1;
            const p2 = data.players.p2;
            
            // Note: Server determines roles. We just map them to roomData.
            // But we need to keep the structure expected by BattleRoom.
            // BattleRoom expects player1 and player2 objects.
            
            // Check if I am Player 1
            const iAmP1 = user.uid === p1.id;
            
            setRoomData({
                id: data.roomId,
                player1: { uid: p1.id, displayName: p1.name, elo: p1.elo }, 
                player2: { uid: p2.id, displayName: p2.name, elo: p2.elo },
                scramble: data.scramble,
                type: '3x3',
                isHost: iAmP1 // Explicitly set host flag for BattleRoom
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
