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

    // Load active rooms
    const loadRooms = async () => {
        setLoading(true);
        setError('');
        try {
            const roomsRef = collection(db, 'artifacts', 'cubity-v1', 'public', 'data', 'rooms');
            const snapshot = await getDocs(roomsRef);
            const roomsList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setRooms(roomsList);
        } catch (err) {
            console.error('Error loading rooms:', err);
            setError('Failed to load rooms: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // Close a room
    const closeRoom = async (roomId) => {
        if (!confirm(`Are you sure you want to close room ${roomId}?`)) return;
        
        try {
            const roomRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'rooms', roomId);
            await deleteDoc(roomRef);
            setSuccess(`Room ${roomId} closed successfully`);
            loadRooms(); // Reload rooms
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            console.error('Error closing room:', err);
            setError('Failed to close room: ' + err.message);
        }
    };

    // Transfer username
    const transferUsername = async () => {
        setTransferLoading(true);
        setError('');
        setSuccess('');

        try {
            const oldUsernameId = oldUsername.toLowerCase().trim();
            const newUsernameId = newUsername.toLowerCase().trim();

            if (!oldUsernameId || !newUsernameId) {
                setError('Both usernames are required');
                setTransferLoading(false);
                return;
            }

            if (oldUsernameId === newUsernameId) {
                setError('Old and new usernames cannot be the same');
                setTransferLoading(false);
                return;
            }

            // Check if old username exists
            const oldUsernameRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'usernames', oldUsernameId);
            const oldUsernameSnap = await getDoc(oldUsernameRef);

            if (!oldUsernameSnap.exists()) {
                setError(`Username "${oldUsername}" does not exist`);
                setTransferLoading(false);
                return;
            }

            // Get the UID from old username (user who will receive the new username)
            const recipientUid = oldUsernameSnap.data().uid;

            // Check if new username is taken
            const newUsernameRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'usernames', newUsernameId);
            const newUsernameSnap = await getDoc(newUsernameRef);

            let displacedUid = null;
            let displacedUsername = null;

            if (newUsernameSnap.exists()) {
                // New username is taken - need to displace that user
                displacedUid = newUsernameSnap.data().uid;
                
                // Generate unique member# username
                let memberNumber = Math.floor(Math.random() * 1000000);
                let memberUsername = `member${memberNumber}`;
                let memberUsernameId = memberUsername.toLowerCase();
                
                // Keep trying until we find an available member# username
                let attempts = 0;
                while (attempts < 100) {
                    const memberRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'usernames', memberUsernameId);
                    const memberSnap = await getDoc(memberRef);
                    
                    if (!memberSnap.exists()) {
                        // Found available member# username
                        displacedUsername = memberUsername;
                        break;
                    }
                    
                    // Try next number
                    memberNumber++;
                    memberUsername = `member${memberNumber}`;
                    memberUsernameId = memberUsername.toLowerCase();
                    attempts++;
                }
                
                if (!displacedUsername) {
                    setError('Failed to generate unique member# username');
                    setTransferLoading(false);
                    return;
                }
                
                // Create member# username for displaced user
                const displacedUsernameRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'usernames', memberUsernameId);
                await setDoc(displacedUsernameRef, { uid: displacedUid });
                
                // Update displaced user's profile
                const displacedProfileRef = doc(db, 'artifacts', 'cubity-v1', 'users', displacedUid, 'profile', 'main');
                await setDoc(displacedProfileRef, {
                    displayName: displacedUsername,
                    lastUsernameChange: new Date().toISOString(),
                    displacedBy: user.email,
                    displacedAt: new Date().toISOString()
                }, { merge: true });
            }

            // Transfer new username to recipient
            await setDoc(newUsernameRef, { uid: recipientUid });

            // Delete old username entry
            await deleteDoc(oldUsernameRef);

            // Update recipient's profile
            const recipientProfileRef = doc(db, 'artifacts', 'cubity-v1', 'users', recipientUid, 'profile', 'main');
            await setDoc(recipientProfileRef, {
                displayName: newUsername,
                lastUsernameChange: new Date().toISOString()
            }, { merge: true });

            if (displacedUsername) {
                setSuccess(`✅ Username transferred from "${oldUsername}" to "${newUsername}". Previous owner of "${newUsername}" was reassigned to "${displacedUsername}"`);
            } else {
                setSuccess(`✅ Username transferred from "${oldUsername}" to "${newUsername}"`);
            }
            
            setOldUsername('');
            setNewUsername('');
        } catch (err) {
            console.error('Error transferring username:', err);
            setError('Failed to transfer username: ' + err.message);
        } finally {
            setTransferLoading(false);
        }
    };

    // Load banned users
    const loadBannedUsers = async () => {
        setLoading(true);
        setError('');
        try {
            const bannedRef = collection(db, 'artifacts', 'cubity-v1', 'public', 'data', 'banned_users');
            const snapshot = await getDocs(bannedRef);
            const banned = snapshot.docs.map(doc => ({
                username: doc.id,
                ...doc.data()
            }));
            setBannedUsers(banned);
        } catch (err) {
            console.error('Error loading banned users:', err);
            setError('Failed to load banned users: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // Ban a user
    const banUser = async () => {
        setBanLoading(true);
        setError('');
        setSuccess('');

        try {
            const usernameId = banUsername.toLowerCase().trim();

            if (!usernameId) {
                setError('Username is required');
                setBanLoading(false);
                return;
            }

            // Check if username exists
            const usernameRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'usernames', usernameId);
            const usernameSnap = await getDoc(usernameRef);

            if (!usernameSnap.exists()) {
                setError(`Username "${banUsername}" does not exist`);
                setBanLoading(false);
                return;
            }

            const uid = usernameSnap.data().uid;

            // Add to banned users collection
            const bannedRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'banned_users', usernameId);
            await setDoc(bannedRef, {
                uid: uid,
                username: banUsername,
                reason: banReason || 'No reason provided',
                bannedAt: new Date().toISOString(),
                bannedBy: user.email
            });

            setSuccess(`✅ User "${banUsername}" has been banned`);
            setBanUsername('');
            setBanReason('');
            loadBannedUsers();
        } catch (err) {
            console.error('Error banning user:', err);
            setError('Failed to ban user: ' + err.message);
        } finally {
            setBanLoading(false);
        }
    };

    // Unban a user
    const unbanUser = async (username) => {
        if (!confirm(`Are you sure you want to unban ${username}?`)) return;

        try {
            const bannedRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'banned_users', username.toLowerCase());
            await deleteDoc(bannedRef);
            setSuccess(`✅ User "${username}" has been unbanned`);
            loadBannedUsers();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            console.error('Error unbanning user:', err);
            setError('Failed to unban user: ' + err.message);
        }
    };

    useEffect(() => {
        if (activeTab === 'rooms') {
            loadRooms();
        } else if (activeTab === 'bans') {
            loadBannedUsers();
        }
    }, [activeTab]);

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-purple-500/20 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10 bg-gradient-to-r from-purple-900/20 to-transparent">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                            <Shield className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white">Admin Dashboard</h2>
                            <p className="text-sm text-purple-400">Cubity Arena Management</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="text-slate-400 hover:text-white text-2xl transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 p-4 border-b border-white/10 bg-slate-900/50">
                    <button
                        onClick={() => setActiveTab('rooms')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                            activeTab === 'rooms' 
                                ? 'bg-purple-600 text-white' 
                                : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                    >
                        <Swords className="w-4 h-4" />
                        Room Monitor
                    </button>
                    <button
                        onClick={() => setActiveTab('username')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                            activeTab === 'username' 
                                ? 'bg-purple-600 text-white' 
                                : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                    >
                        <Users className="w-4 h-4" />
                        Username Transfer
                    </button>
                    <button
                        onClick={() => setActiveTab('bans')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                            activeTab === 'bans' 
                                ? 'bg-purple-600 text-white' 
                                : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                    >
                        <Ban className="w-4 h-4" />
                        Ban Users
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Error/Success Messages */}
                    {error && (
                        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="mb-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400">
                            {success}
                        </div>
                    )}

                    {/* Room Monitor Tab */}
                    {activeTab === 'rooms' && (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-white">Active Rooms</h3>
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
                                                    className="flex items-center gap-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                    Close
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
