import { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, EmailAuthProvider, linkWithCredential } from 'firebase/auth';
import { auth } from '../lib/firebase';

const EmailPasswordAuth = ({ onClose, user }) => {
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const isGuest = user?.isAnonymous;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (user) {
                // Link credential to existing account (Guest or Google user)
                const credential = EmailAuthProvider.credential(email, password);
                await linkWithCredential(user, credential);
                console.log('✅ Account linked with email/password');
            } else if (isSignUp) {
                // New user signing up
                await createUserWithEmailAndPassword(auth, email, password);
            } else {
                // Existing user signing in
                await signInWithEmailAndPassword(auth, email, password);
            }
            onClose();
        } catch (err) {
            console.error('Auth error:', err);
            
            // User-friendly error messages
            if (err.code === 'auth/email-already-in-use') {
                setError('Email already in use. Try signing in instead.');
            } else if (err.code === 'auth/credential-already-in-use') {
                setError('This email is already linked to another account.');
            } else if (err.code === 'auth/weak-password') {
                setError('Password should be at least 6 characters.');
            } else if (err.code === 'auth/invalid-email') {
                setError('Invalid email address.');
            } else if (err.code === 'auth/user-not-found') {
                setError('No account found. Try signing up instead.');
            } else if (err.code === 'auth/wrong-password') {
                setError('Incorrect password.');
            } else if (err.code === 'auth/provider-already-linked') {
                setError('Account already linked. Try signing in instead.');
            } else {
                setError(err.message);
            }
        } finally {
            setLoading(false);
        }
    };

    const getTitle = () => {
        if (isGuest) return 'Convert Guest to Full Account';
        if (user) return 'Set Account Password';
        return isSignUp ? 'Create Account' : 'Sign In';
    };

    const getButtonText = () => {
        if (loading) return 'Loading...';
        if (isGuest) return 'Convert Account';
        if (user) return 'Set Password';
        return isSignUp ? 'Create Account' : 'Sign In';
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-md w-full">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-white">
                        {getTitle()}
                    </h2>
                    <button 
                        onClick={onClose}
                        className="text-slate-400 hover:text-white text-2xl"
                    >
                        ×
                    </button>
                </div>

                {/* Guest Conversion Notice */}
                {isGuest && (
                    <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                        <p className="text-blue-400 text-sm">
                            🎉 You're currently a guest. Create an email/password to save your progress permanently!
                        </p>
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Email */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Email
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@email.com"
                            required
                            className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>

                    {/* Password */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            minLength={6}
                            className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Minimum 6 characters
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
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
                    >
                        {getButtonText()}
                    </button>
                </form>

                {/* Toggle Sign Up / Sign In (only if not guest) */}
                {!isGuest && (
                    <div className="mt-6 text-center">
                        <button
                            onClick={() => {
                                setIsSignUp(!isSignUp);
                                setError('');
                            }}
                            className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
                        >
                            {isSignUp 
                                ? 'Already have an account? Sign in' 
                                : "Don't have an account? Sign up"}
                        </button>
                    </div>
                )}

                {/* Test Credentials (Development Only) */}
                {import.meta.env.DEV && !isGuest && (
                    <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                        <p className="text-yellow-400 text-xs font-bold mb-2">
                            🧪 Test Credentials (Dev Only)
                        </p>
                        <p className="text-yellow-300 text-xs font-mono">
                            Email: test@cubity.gg<br />
                            Password: test123
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EmailPasswordAuth;
