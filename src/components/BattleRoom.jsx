import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Swords, Crown, Frown, Activity, Clock, Zap, X } from 'lucide-react';
import TimerView from './TimerView';
import SmartCube3D from './SmartCube3D';
import { getSolvedState, applyMoveToFacelets, SOLVED_FACELETS } from '../utils/cube';
import { LogicalCube } from '../engine/LogicalCube';
import { useWebRTC } from '../hooks/useWebRTC';
import { useSocket } from '../hooks/useSocket';
import { doc, deleteDoc, setDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';

const BattleRoom = ({ user, userData, roomData, roomId, onExit, smartCube }) => {
    const [myTime, setMyTime] = useState(null);
    const [opponentTime, setOpponentTime] = useState(null);
    const [result, setResult] = useState(null); 
    
    // Live Sync State
    const [opponentState, setOpponentState] = useState(null); // { status, lastMove, timestamp }
    const [opponentCubeState, setOpponentCubeState] = useState(SOLVED_FACELETS);

    // Determine Host Status (Prefer explicit flag from server, fallback to UID check)
    const amIPlayer1 = roomData.isHost !== undefined ? roomData.isHost : (user.uid === roomData.player1.uid);
    const opponent = amIPlayer1 ? roomData.player2 : roomData.player1;

    const [opponentName, setOpponentName] = useState(
        opponent?.displayName || opponent?.name
    );

    const socket = useSocket();
    const lastOpTimestamp = useRef(0);
    const solutionMoves = useRef([]); // Track moves for reconstruction
    


    // WebRTC Integration
    const { status: rtcStatus, sendMessage: sendRtcMessage, lastMessage: rtcMessage } = useWebRTC(roomId, user.uid, amIPlayer1);

    // Handle Socket Events (Opponent Left & Moves & Join)
    useEffect(() => {
        if (!socket) return;
        
        socket.on('user_joined', ({ userId, userData }) => {
            
            if (userData && userData.displayName) {
                setOpponentName(userData.displayName);
            }
        });

        socket.on('opponent_left', () => {
           
            
            // Give opponent 15 seconds to rejoin before auto-leaving
            const disconnectTimer = setTimeout(async () => {
              
                alert("Opponent disconnected and did not rejoin.");
                await handleLeave();
            }, 15000); // 15 seconds

            // If component unmounts, clear the timer
            return () => clearTimeout(disconnectTimer);
        });

        // Socket.IO Fallback/Primary for Moves
        socket.on('opponent_move', (data) => {
            // data = { move: "R", state: "UUU...", userId: "...", timestamp: ... }
            // console.log('Socket Opponent Move:', data);
            
            // Deduplication: Ignore if we've already processed this timestamp or newer
            if (data.timestamp && data.timestamp <= lastOpTimestamp.current) {
                return;
            }
            if (data.timestamp) lastOpTimestamp.current = data.timestamp;

            if (data.state) {
                 setOpponentCubeState(data.state);
            } else if (data.move) {
                 setOpponentCubeState(prev => applyMoveToFacelets(prev, data.move));
            }
                 
            // Also update status if needed
            setOpponentState(prev => ({ ...prev, status: 'SOLVING', timestamp: data.timestamp || Date.now() }));
        });

        return () => {
            socket.off('opponent_left');
            socket.off('opponent_move');
        };
    }, [socket]);

    // Handle WebRTC Messages
    useEffect(() => {
        if (rtcMessage) {
            // console.log("WebRTC Message:", rtcMessage);
            const { type, data } = rtcMessage;
            
            if (type === 'UPDATE_OPPONENT') {
                const opState = data;
                
                if (opState.timestamp > lastOpTimestamp.current) {
                    lastOpTimestamp.current = opState.timestamp;
                    setOpponentState(opState);
                    
                    if (opState.state) {
                        setOpponentCubeState(opState.state);
                    } else if (opState.move) {
                        setOpponentCubeState(prev => applyMoveToFacelets(prev, opState.move));
                    }
                    if (opState.reset) {
                         setOpponentCubeState(SOLVED_FACELETS);
                    }
                }
            } else if (type === 'RESULT_OPPONENT') {
                setOpponentTime(data.time);
            }
        }
    }, [rtcMessage]);

    // Check for Result
    // Check for Result & Emit to Server (Host Only)
    useEffect(() => {
        if (myTime && opponentTime && !result) {
            let cx = 'draw';
            if (myTime < opponentTime) cx = 'win';
            else if (myTime > opponentTime) cx = 'loss';
            
            setResult(cx); 

            // Host handles the official reporting
            if (amIPlayer1 && socket) {
                let winnerId = 'DRAW';
                if (cx === 'win') winnerId = user.uid;
                else if (cx === 'loss') winnerId = roomData.player2?.uid || 'opponent';
                
               
                socket.emit('match_finished', { roomId, winnerId });
            }
        }
    }, [myTime, opponentTime, result, amIPlayer1, socket, user.uid, roomData.player2?.uid, roomId]);

    // Handle My Moves -> Sync via WebRTC AND Socket
    // Subscribe to LogicalCube updates directly
    useEffect(() => {
        let engine = null;

        const handleUpdate = ({ move, state, timestamp }) => {
            if (!move || typeof move !== 'string') return; // Ignore updates without valid moves

            // Track for reconstruction
            solutionMoves.current.push(move);

            // console.log(`[BattleRoom] Sending Move: ${move}`);
            const updateData = { move, state, timestamp: timestamp || Date.now(), status: 'SOLVING' }; 
            
            // 1. WebRTC (Fastest, P2P)
            if (rtcStatus === 'CONNECTED') {
                 sendRtcMessage({ type: 'UPDATE_OPPONENT', data: updateData });
            }
    
            // 2. Socket.IO (Reliable, Server-Relayed)
            if (socket) {
                socket.emit('send_move', { move, state, timestamp: updateData.timestamp });
            }
        };

        const init = async () => {
            engine = await LogicalCube.getInstance();
            engine.on('update', handleUpdate);

            // Create Room in Firestore (Host Only) - Required for Security Rules
            if (amIPlayer1) {
                try {
                    const roomRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'rooms', roomId);
                    await setDoc(roomRef, {
                        createdBy: user.uid,
                        createdAt: Date.now(),
                        roomId: roomId,
                        players: [roomData.player1?.uid, roomData.player2?.uid].filter(Boolean)
                    });
                   
                } catch (err) {
                    console.error("Error creating room in Firestore:", err);
                }
            }
        };

        init();

        return () => {
            if (engine) engine.off('update', handleUpdate);
        };
    }, [rtcStatus, sendRtcMessage, socket]);

    // Handle My Status -> Sync via WebRTC
    const handleMyStatus = useCallback(async (status) => {
        const timestamp = Date.now();
        const updateData = { status, timestamp };
        if (status === 'IDLE') updateData.reset = true;

        if (rtcStatus === 'CONNECTED') {
            sendRtcMessage({ type: 'UPDATE_OPPONENT', data: updateData });
        }
    }, [rtcStatus, sendRtcMessage]);


    const onBattleSolveComplete = useCallback(async (time) => {
        const timeNum = parseFloat(time);
        if (rtcStatus === 'CONNECTED') {
            sendRtcMessage({ 
                type: 'RESULT_OPPONENT', 
                data: { time: timeNum } 
            });
        }
        setMyTime(timeNum);

        // Save Solve to Stats
        try {
            if (user) {
                await addDoc(collection(db, 'artifacts', 'cubity-v1', 'users', user.uid, 'solves'), {
                    time: timeNum,
                    scramble: roomData.scramble,
                    timestamp: new Date().toISOString(),
                    type: roomData.type || '3x3',
                    mode: 'arena',
                    opponent: opponentName || 'Opponent',
                    roomId: roomId,
                    solution: solutionMoves.current.join(' '), // Save reconstruction
                });
              
            }
        } catch (e) {
            console.error("Failed to save solve stats:", e);
        }
    }, [rtcStatus, sendRtcMessage, user, roomData, opponentName, roomId]);

    const handleLeave = async () => {
        try {
            // Delete room from Firestore
            const roomRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'rooms', roomId);
            await deleteDoc(roomRef);
            
        } catch (err) {
            console.error('Error deleting room:', err);
        }
        
        socket.emit('leave_room', { roomId });
        onExit();
    };

    // Auto-cleanup: Delete room 30s after winner is decided
    useEffect(() => {
        if (result) {
           
            const timer = setTimeout(async () => {
                console.log(`🗑️ Auto-deleting room ${roomId} after 30s`);
                await handleLeave();
            }, 30000); // 30 seconds

            return () => clearTimeout(timer);
        }
    }, [result, roomId]);

    return (
        <div className="w-full max-w-6xl mx-auto px-4">
            {/* Header */}
            <div className="flex justify-between items-center mb-8 p-4 bg-slate-900/50 border border-white/10 rounded-xl relative">
                {roomId.includes('debug') && (
                    <button 
                        onClick={() => setOpponentTime((Math.random() * 20 + 10).toFixed(2))}
                        className="absolute top-[-20px] right-0 text-[10px] bg-red-500/20 text-red-400 px-2 py-1 rounded hover:bg-red-500/30"
                    >
                        DEBUG: FINISH OPPONENT
                    </button>
                )}
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <div className="text-xs text-slate-500 font-bold uppercase">YOU</div>
                        <div className="text-white font-bold text-lg">{userData?.displayName || user.displayName || 'Guest'}</div>
                        <div className="text-xs font-mono text-yellow-500 flex items-center justify-end gap-1">
                            <Crown className="w-3 h-3" /> 
                            {userData?.elo || user.elo || 800} ELO
                        </div>
                    </div>
                </div>
                <div className="flex flex-col items-center">
                    <div className="text-2xl font-black italic text-slate-700">VS</div>
                    <div className={`text-[10px] font-mono px-2 py-0.5 rounded-full mt-1 border ${
                        rtcStatus === 'CONNECTED' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 
                        rtcStatus === 'CONNECTING' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20 animate-pulse' :
                        'bg-red-500/10 text-red-500 border-red-500/20'
                    }`}>
                        {rtcStatus === 'CONNECTED' ? '🟢 P2P LIVE' : 
                         rtcStatus === 'CONNECTING' ? '🟡 CONNECTING' : 
                         '🔴 DISCONNECTED'}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-left">
                        <div className="text-xs text-slate-500 font-bold uppercase">OPPONENT</div>
                        <div className="text-white font-bold text-lg">{opponentName || 'Connecting...'}</div>
                        <div className="text-xs font-mono text-slate-400 flex items-center gap-1">
                            <Crown className="w-3 h-3" /> 
                            {opponent?.elo || 800} ELO
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* LEFT: MY VIEW */}
                <div className="relative">
                    {!myTime ? (
                        <div className="mb-8">
                            <TimerView 
                                user={user} 
                                userData={{}} 
                                onSolveComplete={onBattleSolveComplete} 
                                dailyMode={false} 
                                isBattle={true}
                                forcedScramble={roomData.scramble}
                                forcedType={roomData.type || '3x3'}
                                disableScrambleGen={true}
                                smartCube={smartCube} 
                                onStatusChange={handleMyStatus}
                            />
                        </div>
                    ) : (
                        <div className="text-center py-12 animate-in zoom-in duration-300 bg-slate-900/50 rounded-2xl border border-white/5">
                            <h2 className="text-xl font-bold text-white mb-2">You Finished!</h2>
                            <div className="text-5xl font-mono font-black text-green-400">{myTime}s</div>
                        </div>
                    )}
                </div>

                {/* RIGHT: OPPONENT VIEW */}
                <div className="bg-slate-900/30 border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center relative overflow-hidden">
                    <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
                        {/* Opponent Status Badge */}
                        <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2
                            ${opponentState?.status === 'SOLVING' ? 'bg-green-500/20 text-green-400 border border-green-500/20 animate-pulse' : 
                              opponentState?.status === 'INSPECTION' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/20' :
                              opponentState?.status === 'FINISHED' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20' :
                              'bg-slate-800 text-slate-500 border border-white/5'}`}>
                            {opponentState?.status === 'SOLVING' && <Zap className="w-3 h-3" />}
                            {opponentState?.status === 'INSPECTION' && <Clock className="w-3 h-3" />}
                            {opponentState?.status || 'WAITING'}
                        </div>
                    </div>

                    {/* Opponent Cube */}
                    <div className="w-full h-64 md:h-80 relative opacity-80 hover:opacity-100 transition-opacity">
                        <SmartCube3D 
                            facelets={opponentCubeState} 
                            isConnected={false} // It's a remote representation
                            className="h-full"
                        />
                    </div>

                    {/* Opponent Result (if done) */}
                    {opponentTime && (
                        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-10 animate-in fade-in">
                            <div className="text-center">
                                <div className="text-sm text-slate-500 font-bold uppercase mb-1">Opponent Time</div>
                                <div className="text-4xl font-mono font-black text-white">{opponentTime}s</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Result Overlay */}
            {result && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-500">
                    <div className="text-center">
                        {result === 'win' && <Crown className="w-32 h-32 text-yellow-500 mx-auto mb-8 animate-bounce" />}
                        {result === 'loss' && <Frown className="w-32 h-32 text-slate-500 mx-auto mb-8" />}
                        <h1 className="text-8xl font-black italic text-white mb-4 tracking-tighter">
                            {result === 'win' ? 'VICTORY!' : result === 'loss' ? 'DEFEAT' : 'DRAW'}
                        </h1>
                        <div className="flex justify-center gap-12 mt-12">
                            <div>
                                <div className="text-sm text-slate-500 uppercase font-bold mb-2">You</div>
                                <div className="text-5xl font-mono text-white font-bold">{myTime}s</div>
                            </div>
                            <div>
                                <div className="text-sm text-slate-500 uppercase font-bold mb-2">{opponentName}</div>
                                <div className="text-5xl font-mono text-white font-bold">{opponentTime}s</div>
                            </div>
                        </div>
                        <button onClick={handleLeave} className="mt-16 bg-white text-slate-900 hover:bg-slate-200 px-12 py-4 rounded-full font-black text-xl uppercase tracking-widest transition-all hover:scale-105">
                            Leave Arena
                        </button>
                    </div>
                </div>
            )}
            
            {/* Leave Button - Desktop & Mobile */}
            {!result && (
                <>
                    {/* Desktop: Top-right corner */}
                    <button 
                        onClick={handleLeave} 
                        className="hidden md:flex fixed top-24 right-6 items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-4 py-3 rounded-xl font-bold transition-colors z-50"
                    >
                        <X className="w-4 h-4" />
                        Leave Match
                    </button>
                    
                    {/* Mobile: Bottom button */}
                    <button 
                        onClick={handleLeave} 
                        className="md:hidden fixed bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-6 py-3 rounded-full font-bold transition-colors z-50 shadow-lg"
                    >
                        <X className="w-4 h-4" />
                        Leave
                    </button>
                </>
            )}
        </div>
    );
};

export default BattleRoom;
