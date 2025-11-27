import { useState } from 'react';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User, Check } from 'lucide-react';

const UsernameSetup = ({ user, onComplete, isAdmin }) => {
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const cleanUsername = username.trim();
            const usernameId = cleanUsername.toLowerCase();

            // Validation
            if (cleanUsername.length < 3) {
                setError('Username must be at least 3 characters');
                setLoading(false);
                return;
            }

            if (cleanUsername.length > 20) {
                setError('Username must be 20 characters or less');
                setLoading(false);
                return;
            }

            if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
                setError('Username can only contain letters, numbers, hyphens, and underscores');
                setLoading(false);
                return;
            }

            // Check if username is available
            const usernameRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'usernames', usernameId);
            const usernameSnap = await getDoc(usernameRef);

            if (usernameSnap.exists()) {
                setError('Username is already taken');
                setLoading(false);
                return;
            }

            // Create username entry
            await setDoc(usernameRef, { uid: user.uid });

            // Create/update user profile
            const userProfileRef = doc(db, 'artifacts', 'cubity-v1', 'users', user.uid, 'profile', 'main');
            await setDoc(userProfileRef, {
                displayName: cleanUsername,
                createdAt: new Date().toISOString(),
                lastUsernameChange: new Date().toISOString()
            }, { merge: true });

            onComplete(cleanUsername);
        } catch (err) {
            console.error('Error setting username:', err);
            setError('Failed to set username: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-md w-full">
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
                        <User className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white">Choose Your Username</h2>
                        <p className="text-sm text-slate-400">This will be your display name</p>
                    </div>
                </div>

                {/* Info */}
                <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                    <p className="text-blue-400 text-sm">
                        ✨ Choose wisely! {isAdmin ? 'As an admin, you can change this anytime.' : 'You can only change your username once per month.'}
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Username
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="your-username"
                            required
                            minLength={3}
                            maxLength={20}
                            className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                            autoFocus
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            3-20 characters, letters, numbers, hyphens, and underscores only
                        </p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                            <p className="text-red-400 text-sm">{error}</p>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading || !username}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            'Setting username...'
                        ) : (
                            <>
                                <Check className="w-5 h-5" />
                                Set Username
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default UsernameSetup;
