import React, { useState, useEffect } from 'react';
import { Shield, Users, Swords, X, RefreshCw, Trash2, ArrowRight, Ban, UserX } from 'lucide-react';
import { collection, getDocs, doc, deleteDoc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const AdminDashboard = ({ user, onClose }) => {
    const [activeTab, setActiveTab] = useState('rooms');
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Username Transfer State
    const [oldUsername, setOldUsername] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [transferLoading, setTransferLoading] = useState(false);

    // Ban User State
    const [banUsername, setBanUsername] = useState('');
    const [banReason, setBanReason] = useState('');
    const [banLoading, setBanLoading] = useState(false);
    const [bannedUsers, setBannedUsers] = useState([]);

    // Load active rooms from API
    const loadRooms = async () => {
        setLoading(true);
        setError('');
        try {
            // Use production URL if in production, otherwise localhost
            const API_URL = import.meta.env.PROD ? 'https://cubity-arena-production.up.railway.app' : 'http://localhost:3001';
            const res = await fetch(`${API_URL}/api/rooms`);
            if (!res.ok) throw new Error('Failed to fetch rooms');
            const roomsList = await res.json();
            setRooms(roomsList);
        } catch (err) {
            console.error('Error loading rooms:', err);
            setError('Failed to load rooms: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // Close a room (API + Firestore Cleanup)
    const [confirmAction, setConfirmAction] = useState(null); // { type: 'close'|'unban', id: string }

    const closeRoom = async (roomId) => {
        if (confirmAction?.type !== 'close' || confirmAction?.id !== roomId) {
            setConfirmAction({ type: 'close', id: roomId });
            setTimeout(() => setConfirmAction(null), 3000); // Reset after 3s
            return;
        }
        
        try {
            const API_URL = import.meta.env.PROD ? 'https://cubity-arena-production.up.railway.app' : 'http://localhost:3001';
            
            // 1. Call API to force close
            await fetch(`${API_URL}/api/rooms/${roomId}`, { method: 'DELETE' });
            
            // 2. Cleanup Firestore (just in case)
            try {
                const roomRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'rooms', roomId);
                await deleteDoc(roomRef);
            } catch (e) { console.warn("Firestore room cleanup failed (might be already gone):", e); }

            setSuccess(`Room ${roomId} closed successfully`);
            setConfirmAction(null);
            loadRooms(); // Reload rooms
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            console.error('Error closing room:', err);
            setError('Failed to close room: ' + err.message);
        }
    };

    // ... (Transfer Username logic remains same) ...

    // Unban a user
    const unbanUser = async (username) => {
        if (confirmAction?.type !== 'unban' || confirmAction?.id !== username) {
            setConfirmAction({ type: 'unban', id: username });
            setTimeout(() => setConfirmAction(null), 3000); // Reset after 3s
            return;
        }

        try {
            const bannedRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'banned_users', username.toLowerCase());
            await deleteDoc(bannedRef);
            setSuccess(`✅ User "${username}" has been unbanned`);
            setConfirmAction(null);
            loadBannedUsers();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            console.error('Error unbanning user:', err);
            setError('Failed to unban user: ' + err.message);
        }
    };

    // ... (Effect and Render) ...

                    {/* Room Monitor Tab */}
                    {activeTab === 'rooms' && (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-white">Active Rooms (Live)</h3>
                                <button
                                    onClick={loadRooms}
                                    disabled={loading}
                                    className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors disabled:opacity-50"
                                >
                                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                    Refresh
                                </button>
                            </div>

                            {loading ? (
                                <div className="text-center py-12 text-slate-400">
                                    <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                                    Loading rooms...
                                </div>
                            ) : rooms.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    No active rooms
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {rooms.map(room => (
                                        <div key={room.id} className="bg-slate-800/50 border border-white/10 rounded-xl p-4">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="font-mono text-sm text-purple-400">
                                                            {room.id}
                                                        </span>
                                                        <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded">
                                                            {room.type || '3x3'}
                                                        </span>
                                                        <span className="text-xs text-slate-500">
                                                            {new Date(room.startTime).toLocaleTimeString()}
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                                        <div>
                                                            <span className="text-slate-500">Player 1:</span>
                                                            <span className="text-white ml-2">{room.player1?.name || 'Unknown'}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-slate-500">Player 2:</span>
                                                            <span className="text-white ml-2">{room.player2?.name || 'Waiting...'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => closeRoom(room.id)}
                                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${
                                                        confirmAction?.type === 'close' && confirmAction?.id === room.id
                                                            ? 'bg-red-600 text-white animate-pulse'
                                                            : 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                                                    }`}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                    {confirmAction?.type === 'close' && confirmAction?.id === room.id ? 'Confirm Close' : 'Close'}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Username Transfer Tab */}
                    {activeTab === 'username' && (
                        <div>
                            <h3 className="text-lg font-bold text-white mb-4">Transfer Username</h3>
                            <p className="text-slate-400 text-sm mb-6">
                                Transfer a username from one user to another. This will update the username registry and user profile.
                            </p>

                            <div className="space-y-4">
                                {/* Old Username */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Current Username
                                    </label>
                                    <input
                                        type="text"
                                        value={oldUsername}
                                        onChange={(e) => setOldUsername(e.target.value)}
                                        placeholder="old-username"
                                        className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                                    />
                                </div>

                                {/* Arrow */}
                                <div className="flex justify-center">
                                    <ArrowRight className="w-6 h-6 text-purple-400" />
                                </div>

                                {/* New Username */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        New Username
                                    </label>
                                    <input
                                        type="text"
                                        value={newUsername}
                                        onChange={(e) => setNewUsername(e.target.value)}
                                        placeholder="new-username"
                                        className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                                    />
                                </div>

                                {/* Transfer Button */}
                                <button
                                    onClick={transferUsername}
                                    disabled={transferLoading || !oldUsername || !newUsername}
                                    className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                                >
                                    {transferLoading ? (
                                        <>
                                            <RefreshCw className="w-5 h-5 animate-spin" />
                                            Transferring...
                                        </>
                                    ) : (
                                        <>
                                            <ArrowRight className="w-5 h-5" />
                                            Transfer Username
                                        </>
                                    )}
                                </button>

                                {/* Warning */}
                                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                                    <p className="text-yellow-400 text-sm">
                                        ⚠️ <strong>Warning:</strong> This action will permanently transfer the username. Make sure you have the correct usernames before proceeding.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Ban Users Tab */}
                    {activeTab === 'bans' && (
                        <div>
                            <h3 className="text-lg font-bold text-white mb-4">Ban User Management</h3>
                            
                            {/* Ban User Form */}
                            <div className="mb-8 p-6 bg-slate-800/50 border border-white/10 rounded-xl">
                                <h4 className="text-md font-bold text-white mb-4">Ban a User</h4>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">
                                            Username to Ban
                                        </label>
                                        <input
                                            type="text"
                                            value={banUsername}
                                            onChange={(e) => setBanUsername(e.target.value)}
                                            placeholder="username"
                                            className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-red-500 transition-colors"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">
                                            Reason (Optional)
                                        </label>
                                        <textarea
                                            value={banReason}
                                            onChange={(e) => setBanReason(e.target.value)}
                                            placeholder="Reason for ban..."
                                            rows={3}
                                            className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-red-500 transition-colors resize-none"
                                        />
                                    </div>

                                    <button
                                        onClick={banUser}
                                        disabled={banLoading || !banUsername}
                                        className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                                    >
                                        {banLoading ? (
                                            <>
                                                <RefreshCw className="w-5 h-5 animate-spin" />
                                                Banning...
                                            </>
                                        ) : (
                                            <>
                                                <Ban className="w-5 h-5" />
                                                Ban User
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Banned Users List */}
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="text-md font-bold text-white">Banned Users ({bannedUsers.length})</h4>
                                    <button
                                        onClick={loadBannedUsers}
                                        disabled={loading}
                                        className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                        Refresh
                                    </button>
                                </div>

                                {loading ? (
                                    <div className="text-center py-12 text-slate-400">
                                        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                                        Loading banned users...
                                    </div>
                                ) : bannedUsers.length === 0 ? (
                                    <div className="text-center py-12 text-slate-400">
                                        No banned users
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {bannedUsers.map(banned => (
                                            <div key={banned.username} className="bg-slate-800/50 border border-red-500/20 rounded-xl p-4">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <UserX className="w-4 h-4 text-red-400" />
                                                            <span className="font-bold text-white">
                                                                {banned.username}
                                                            </span>
                                                            <span className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded">
                                                                BANNED
                                                            </span>
                                                        </div>
                                                        <div className="text-sm space-y-1">
                                                            <div>
                                                                <span className="text-slate-500">Reason:</span>
                                                                <span className="text-slate-300 ml-2">{banned.reason}</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-slate-500">Banned by:</span>
                                                                <span className="text-slate-300 ml-2">{banned.bannedBy}</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-slate-500">Date:</span>
                                                                <span className="text-slate-300 ml-2">
                                                                    {new Date(banned.bannedAt).toLocaleString()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => unbanUser(banned.username)}
                                                        className="flex items-center gap-2 px-3 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors"
                                                    >
                                                        <RefreshCw className="w-4 h-4" />
                                                        Unban
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
