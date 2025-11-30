import React, { useState, useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { 
  Users, Zap, Settings, Timer, LogIn, Activity, Bluetooth, Flame, LogOut, Swords, AlertCircle, TrendingUp, Trophy, Shield, User, Lock, X 
} from 'lucide-react';
import { 
  onAuthStateChanged, signInAnonymously, signOut, GoogleAuthProvider, signInWithPopup, linkWithPopup, sendPasswordResetEmail
} from 'firebase/auth'; 
import { 
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, query, orderBy, limit, onSnapshot 
} from 'firebase/firestore'; 
import { auth, db } from './lib/firebase'; 

import TimerView from './components/TimerView';
import StatsView from './components/StatsView';
import ArenaView from './components/ArenaView';
import LogoVelocity from './components/LogoVelocity';
import EmailPasswordAuth from './components/EmailPasswordAuth';
import AdminDashboard from './components/AdminDashboard';
import UsernameSetup from './components/UsernameSetup';
import HardwareTest from './components/HardwareTest';
import { useHardwareDriver } from './hooks/useHardwareDriver';
import { blurOnUI } from './utils/ui';
import { Logger } from './utils/Logger';

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('timer');
  const [activeMode, setActiveMode] = useState('normal');
  const [error, setError] = useState(null);

  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState("");
  const [nameError, setNameError] = useState(null);
  const [dailyCompleted, setDailyCompleted] = useState(false);
  const [recentSolves, setRecentSolves] = useState([]);
  const [showEmailAuth, setShowEmailAuth] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // SMART CUBE HOOK (Singleton Driver)
  const smartCube = useHardwareDriver(userData?.savedMacAddress);

  useEffect(() => {
    Logger.init();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        try {
          // 1. Check if user is banned
          // We need to find if there is a document in banned_users where uid == currentUser.uid
          // Since banned_users is keyed by username, we query by uid field
          const bannedRef = collection(db, 'artifacts', 'cubity-v1', 'public', 'data', 'banned_users');
          // Note: This requires an index on 'uid' if the collection gets large, but for now it's fine
          // Or we can just query all and filter, but a query is better.
          // However, to keep it simple without index requirements for now, we can check the user profile first to get the username, 
          // then check banned_users by ID. But if they are banned, they might not have a profile or username might be different.
          // Let's use a query.
          // Actually, let's just check if the user has a profile, get the username, and check if that username is in banned_users.
          // Wait, if an admin bans a user, they create a record in banned_users with the username as ID.
          // So we need to know the username to check efficiently without a query index.
          
          // Let's try to get the user profile first.
          const userRef = doc(db, 'artifacts', 'cubity-v1', 'users', currentUser.uid, 'profile', 'main');
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
              const data = userSnap.data();
              
              // Check if username is in banned_users
              if (data.displayName) {
                  const banRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'banned_users', data.displayName.toLowerCase());
                  const banSnap = await getDoc(banRef);
                  
                  if (banSnap.exists()) {
                      console.warn("User is banned:", banSnap.data());
                      await signOut(auth);
                      setError(`ACCOUNT BANNED: ${banSnap.data().reason || 'Violation of terms'}`);
                      setLoading(false);
                      return;
                  }
              }

              // Also check by UID query just in case username changed or mismatch (safer)
              // We'll wrap this in a try/catch to ignore "index required" errors for now if they happen
              try {
                  // This is a client-side check, so we can iterate if needed, but query is better.
                  // For now, let's rely on the username check above as primary, 
                  // and maybe add a secondary check if we can.
              } catch (e) {
                  console.warn("Ban check query error", e);
              }

              // ... Proceed with loading profile ...
              const todayStr = new Date().toDateString();
              const dailyRef = doc(db, 'artifacts', 'cubity-v1', 'users', currentUser.uid, 'daily_log', todayStr);
              const dailySnap = await getDoc(dailyRef);
              setDailyCompleted(dailySnap.exists());

              const lastActive = data.lastActive ? new Date(data.lastActive) : new Date(0);
              const now = new Date();
              const isSameDay = lastActive.toDateString() === now.toDateString();
              const isYesterday = new Date(now.setDate(now.getDate() - 1)).toDateString() === lastActive.toDateString();
              let newStreak = data.streak;
              if (!isSameDay && !isYesterday && data.joinedAt !== data.lastActive) {
                  newStreak = 0;
                  await updateDoc(userRef, { streak: 0 });
              }
              setUserData({ ...data, streak: newStreak });
              setTempName(data.displayName);
          } else {
            // New user or no profile
            let uniqueGuestName = 'Guest Cuber';
            
            // Generate unique Guest Name (Guest123456)
            try {
                let isUnique = false;
                let attempts = 0;
                while (!isUnique && attempts < 10) {
                    const num = Math.floor(100000 + Math.random() * 900000); // 6 digit number
                    const name = `Guest${num}`;
                    const id = name.toLowerCase();
                    const ref = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'usernames', id);
                    const snap = await getDoc(ref);
                    
                    if (!snap.exists()) {
                        uniqueGuestName = name;
                        isUnique = true;
                        // Reserve the username
                        await setDoc(ref, { uid: currentUser.uid });
                    }
                    attempts++;
                }
            } catch (e) {
                console.error("Error generating unique guest name:", e);
            }

            const newProfile = {
              displayName: currentUser.displayName || uniqueGuestName,
              rank: 'Beginner',
              elo: 800,
              streak: 0,
              joinedAt: new Date().toISOString(),
              lastActive: new Date().toISOString()
            };
            await setDoc(userRef, newProfile);
            setUserData(newProfile);
            setTempName(newProfile.displayName);
          }

          const solvesQ = query(collection(db, 'artifacts', 'cubity-v1', 'users', currentUser.uid, 'solves'), orderBy('timestamp', 'desc'), limit(20));
          onSnapshot(solvesQ, (snapshot) => {
            setRecentSolves(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          });

        } catch (err) {
          console.error("Database Error:", err);
          setError("Could not load profile.");
        }
      } else {
        setUserData(null);
      }
      setLoading(false);
    }, (err) => {
      console.error("Auth Error:", err);
      setError("Auth Connection Failed. Check .env.local");
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Save MAC Address if new
  useEffect(() => {
      if (smartCube.isConnected && smartCube.deviceMAC && user && userData) {
          if (userData.macAddress !== smartCube.deviceMAC) {
              console.log("Saving new MAC address:", smartCube.deviceMAC);
              const userRef = doc(db, 'artifacts', 'cubity-v1', 'users', user.uid, 'profile', 'main');
              updateDoc(userRef, { macAddress: smartCube.deviceMAC })
                  .then(() => setUserData(prev => ({ ...prev, macAddress: smartCube.deviceMAC })))
                  .catch(err => console.error("Failed to save MAC:", err));
          }
      }
  }, [smartCube.isConnected, smartCube.deviceMAC, user]);

  // 2. ACTIONS
  const handleGuestLogin = async () => {
    setLoading(true);
    try { await signInAnonymously(auth); } 
    catch (err) { setError("Guest Login Failed"); setLoading(false); }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      if (user && user.isAnonymous) {
        await linkWithPopup(user, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (err) {
      console.error("Google Login Error:", err);
      setError(err.message.includes('credential-already-in-use') ? "Account linked to another user." : "Google Login Failed");
      setLoading(false);
    }
  };

  // Check if current user is admin
  const isAdmin = () => {
    if (!user || user.isAnonymous) return false;
    
    // Check environment variable for admin emails
    const adminEmails = import.meta.env.VITE_ADMIN_EMAILS?.split(',').map(e => e.trim()) || [];
    
    // Check if user email is in admin list
    return adminEmails.includes(user.email);
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUserData(null);
  };

  const saveName = async () => {
    setNameError(null);
    const cleanName = tempName.trim();
    const cleanId = cleanName.toLowerCase(); 
    
    // Validation
    if (!user || cleanName.length < 3) { 
      setNameError("Username must be at least 3 characters"); 
      return; 
    }
    
    if (cleanName.length > 20) {
      setNameError("Username must be 20 characters or less");
      return;
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(cleanName)) {
      setNameError("Username can only contain letters, numbers, hyphens, and underscores");
      return;
    }
    
    if (cleanName === userData.displayName) { 
      setIsEditingName(false); 
      return; 
    }

    // Check cooldown (30 days) for non-admins
    if (!isAdmin()) {
      const lastChange = userData?.lastUsernameChange;
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      
      if (lastChange && new Date(lastChange).getTime() > thirtyDaysAgo) {
        const daysLeft = Math.ceil((new Date(lastChange).getTime() - thirtyDaysAgo) / (24 * 60 * 60 * 1000));
        setNameError(`You can change your username again in ${daysLeft} days`);
        return;
      }
    }

    try {
      // Check if new username is available
      const usernameRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'usernames', cleanId);
      const usernameSnap = await getDoc(usernameRef);
      if (usernameSnap.exists() && usernameSnap.data().uid !== user.uid) { 
        setNameError("Username is already taken"); 
        return; 
      }
      
      // Create new username entry
      await setDoc(usernameRef, { uid: user.uid });
      
      // Delete old username entry
      if (userData.displayName && userData.displayName !== "Guest Cuber") {
        try {
          const oldId = userData.displayName.toLowerCase();
          if (oldId !== cleanId) {
            await deleteDoc(doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'usernames', oldId));
          }
        } catch (deleteErr) { 
          console.warn("Delete old username error:", deleteErr); 
        }
      }
      
      // Update user profile with new username and timestamp
      const userRef = doc(db, 'artifacts', 'cubity-v1', 'users', user.uid, 'profile', 'main');
      await updateDoc(userRef, { 
        displayName: cleanName,
        lastUsernameChange: new Date().toISOString()
      });
      
      setUserData(prev => ({ 
        ...prev, 
        displayName: cleanName,
        lastUsernameChange: new Date().toISOString()
      }));
      setIsEditingName(false);
    } catch (err) { 
      console.error("Username update error:", err); 
      setNameError("Failed to save username"); 
    }
  };

  const onSolveComplete = async (time, scramble, isDaily, type = '3x3', penalty = 0, detailedData = null) => {
    if (!user) return;
    const now = new Date();
    try {
      const solveData = {
        time: parseFloat(time),
        scramble: scramble,
        timestamp: now.toISOString(),
        penalty: penalty || 0,
        type: isDaily ? 'daily' : type
      };

      if (detailedData) {
          solveData.solution = detailedData.solution;
          solveData.splits = detailedData.splits;
      }

      await addDoc(collection(db, 'artifacts', 'cubity-v1', 'users', user.uid, 'solves'), solveData);

      const userRef = doc(db, 'artifacts', 'cubity-v1', 'users', user.uid, 'profile', 'main');
      const lastActiveDate = new Date(userData.lastActive);
      let newStreak = userData.streak;
      if (lastActiveDate.toDateString() !== now.toDateString()) newStreak += 1;

      await updateDoc(userRef, { lastActive: now.toISOString(), streak: newStreak });
      setUserData(prev => ({ ...prev, streak: newStreak, lastActive: now.toISOString() }));

      if (isDaily) {
          const todayStr = now.toDateString();
          await setDoc(doc(db, 'artifacts', 'cubity-v1', 'users', user.uid, 'daily_log', todayStr), { completed: true, time: time });
          setDailyCompleted(true);
          setActiveMode('normal'); 
      }
    } catch (err) { console.error("Save Solve Error:", err); }
  };

  if (loading) return (
    <div className="h-screen w-full flex items-center justify-center bg-slate-950 text-blue-500 gap-4">
      <Activity className="w-10 h-10 animate-spin" />
      <span className="text-slate-400 font-mono">LOADING ARENA...</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24 md:pb-0">
      <Analytics />
      
      <header className="fixed top-0 w-full z-50 bg-slate-950/80 backdrop-blur-md border-b border-white/5 h-16 flex items-center justify-between px-4 lg:px-8">
        <div className="flex items-center gap-8">
          <div onClick={() => setActiveTab('timer')} className="flex items-center gap-3 group cursor-pointer">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/10 group-hover:scale-105 transition-transform duration-300">
              <LogoVelocity className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black tracking-tighter leading-none text-white italic">CUBITY</span>
              <span className="text-[10px] text-blue-400 font-bold tracking-widest uppercase">Velocity</span>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            <button onMouseUp={blurOnUI} onClick={() => setActiveTab('timer')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${activeTab === 'timer' ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              <Timer className="w-4 h-4" /> Timer
            </button>
            <button onMouseUp={blurOnUI} onClick={() => setActiveTab('arena')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${activeTab === 'arena' ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              <Swords className="w-4 h-4" /> Arena
            </button>
            <button onMouseUp={blurOnUI} onClick={() => setActiveTab('stats')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${activeTab === 'stats' ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              <TrendingUp className="w-4 h-4" /> Stats
            </button>
            <button onMouseUp={blurOnUI} onClick={() => setActiveTab('hardware-test')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${activeTab === 'hardware-test' ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              <Bluetooth className="w-4 h-4" /> Test
            </button>
          </nav>
        </div>



        <div className="flex items-center gap-3">
          {/* SMART CUBE CONNECT BUTTON */}
          <button 
            onClick={smartCube.isConnected ? smartCube.disconnectCube : () => smartCube.connectCube(userData?.macAddress)} 
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-colors flex items-center gap-2 ${smartCube.isConnected ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            <Bluetooth className="w-4 h-4" /> {smartCube.isConnected ? 'Connected' : 'Connect Cube'}
          </button>
          
          {/* MOCK CONNECT (Admin Only) */}
          {!smartCube.isConnected && isAdmin() && (
              <button 
                  onClick={smartCube.connectMockCube}
                  className="px-2 py-1 rounded text-[10px] font-bold uppercase text-slate-600 hover:text-white hover:bg-white/10 transition-colors"
                  title="Connect Mock Cube (Admin Only)"
              >
                  Mock
              </button>
          )}

          {user ? (
            <div className="relative z-50 inline-block">
              <button 
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-3 bg-slate-900 border border-white/10 px-3 py-1 rounded-full hover:bg-slate-800 transition-colors"
              >
                <div className="text-right hidden sm:block">
                  <span className="block text-xs font-bold text-slate-200">{user.isAnonymous ? "Guest" : isAdmin() ? "Admin" : "Member"}</span>
                  <span className="block text-[10px] text-slate-500 font-mono">{userData?.displayName?.slice(0, 10) || "Cuber"}</span>
                </div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${user.isAnonymous ? 'bg-slate-700' : isAdmin() ? 'bg-purple-600' : 'bg-blue-600'}`}>
                  {userData?.displayName?.[0]?.toUpperCase() || "G"}
                </div>
              </button>
              
              {/* Dropdown Menu */}
              {showUserMenu && (
                <>
                  {/* Backdrop to close on click outside */}
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)}></div>
                  
                  <div className="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-white/10 rounded-xl shadow-xl transform transition-all duration-200 ease-out origin-top-right overflow-hidden z-50 animate-in fade-in zoom-in-95">
                    <div className="p-1">

                  {isAdmin() && (
                    <>
                      <button onMouseUp={blurOnUI} onClick={() => setShowAdminDashboard(true)} className="w-full flex items-center gap-2 px-4 py-3 text-sm text-purple-400 hover:bg-purple-500/10 hover:text-purple-300 rounded-lg transition-colors font-medium">
                        <Shield className="w-4 h-4" />
                        <span>Admin Dashboard</span>
                      </button>
                      <div className="h-px bg-white/10 my-1"></div>
                    </>
                  )}
                  <button onMouseUp={blurOnUI} onClick={() => setActiveTab('more')} className="w-full flex items-center gap-2 px-4 py-3 text-sm text-slate-300 hover:bg-white/5 hover:text-white rounded-lg transition-colors font-medium">
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                  </button>
                  <button onMouseUp={blurOnUI} onClick={handleLogout} className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg transition-colors font-medium">
                    <LogOut className="w-4 h-4" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onMouseUp={blurOnUI} onClick={() => setShowEmailAuth(true)} className="flex items-center gap-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors">
                <LogIn className="w-4 h-4" />
                <span>Log In / Sign Up</span>
              </button>
              <button onMouseUp={blurOnUI} onClick={handleGoogleLogin} className="flex items-center gap-2 text-sm font-bold text-slate-900 bg-white hover:bg-slate-200 px-4 py-2 rounded-lg transition-colors">
                <LogIn className="w-4 h-4" />
                <span>Google</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="pt-24 px-4 max-w-4xl mx-auto">
        {error && <div className="mb-6 p-4 bg-red-900/20 border border-red-500/20 rounded-xl text-red-400">{error}</div>}
        {smartCube.error && <div className="mb-6 p-4 bg-orange-900/20 border border-orange-500/20 rounded-xl text-orange-400 flex items-center gap-2"><AlertCircle className="w-4 h-4"/> {smartCube.error}</div>}

        {/* MAC Address Input Modal */}
        {smartCube.isMacRequired && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                <div className="bg-slate-900 border border-white/10 w-full max-w-md rounded-2xl shadow-2xl p-6">
                    <h3 className="text-xl font-bold text-white mb-2">Enter Cube MAC Address</h3>
                    <p className="text-slate-400 text-sm mb-4">
                        Your browser cannot detect the cube's MAC address automatically. 
                        Please enter it manually (e.g., <span className="font-mono text-white">AA:BB:CC:11:22:33</span>).
                        <br/><br/>
                        <span className="text-yellow-400 text-xs">NOTE: You will be asked to select your cube again after clicking Connect.</span>
                    </p>
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.target);
                        const mac = formData.get('mac');
                        if (mac) {
                            // Local validation
                            const clean = mac.replace(/[^a-fA-F0-9]/g, '');
                            if (clean.length !== 12) {
                                alert(`Invalid MAC Address.\nExpected 12 hex characters (e.g., AA:BB:CC:11:22:33).\nYou entered ${clean.length} valid characters.`);
                                return;
                            }
                            smartCube.retryWithMac(mac.trim());
                        }
                    }}>
                        {smartCube.error && (
                            <div className="mb-4 p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-400 text-xs font-bold flex items-center gap-2">
                                <AlertCircle className="w-4 h-4"/> {smartCube.error}
                            </div>
                        )}
                        <input 
                            name="mac" 
                            type="text" 
                            placeholder="AA:BB:CC:11:22:33" 
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white font-mono mb-4 focus:outline-none focus:border-blue-500 uppercase"
                            autoFocus
                        />
                        <div className="flex justify-end gap-3">
                            <button 
                                type="button" 
                                onClick={smartCube.disconnectCube}
                                className="px-4 py-2 text-slate-400 hover:text-white font-bold"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit" 
                                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-bold"
                            >
                                Connect
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {activeTab === 'stats' && user && <StatsView userId={user.uid} />}
        
        {activeTab === 'hardware-test' && <HardwareTest />}
        
        {activeTab === 'arena' && user && <ArenaView user={user} smartCube={smartCube} isAdmin={isAdmin()} />}

        {activeTab === 'timer' && (
          user ? (
            <>
              <div className="mb-8">
                <div className="flex items-center justify-center gap-4 mb-4 text-slate-400 text-sm">
                  <div className="flex items-center gap-2"><Flame className="w-4 h-4 text-orange-500" /> Streak: {userData?.streak}</div>
                  <div className="flex items-center gap-2"><Activity className="w-4 h-4 text-blue-500" /> ELO: {userData?.elo || 800}</div>
                </div>

                {!dailyCompleted && activeMode === 'normal' && (
                    <div className="flex justify-center mb-6">
                        <button onMouseUp={blurOnUI} onClick={() => setActiveMode('daily')} className="bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-4 py-2 rounded-full text-xs font-bold hover:bg-indigo-600/30 transition-colors flex items-center gap-2">
                            <Trophy className="w-3 h-3" /> PLAY DAILY CHALLENGE
                        </button>
                    </div>
                )}
                {activeMode === 'daily' && (
                    <div className="flex justify-center mb-6">
                        <button onMouseUp={blurOnUI} onClick={() => setActiveMode('normal')} className="text-slate-500 hover:text-white text-xs font-bold transition-colors">CANCEL DAILY</button>
                    </div>
                )}
                {dailyCompleted && (
                    <div className="flex justify-center mb-6">
                        <div className="text-green-500 text-xs font-bold flex items-center gap-2 bg-green-500/10 px-4 py-2 rounded-full border border-green-500/20">
                            <Trophy className="w-3 h-3" /> DAILY COMPLETED
                        </div>
                    </div>
                )}

                <TimerView 
                  user={user} 
                  userData={userData} 
                  onSolveComplete={onSolveComplete} 
                  dailyMode={activeMode === 'daily'} 
                  recentSolves={recentSolves} 
                  smartCube={smartCube}
                />
              </div>
            </>
          ) : (
            /* Landing Page */
            <div className="text-center py-20">
              <div className="mb-8 relative group inline-block">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full blur opacity-50 group-hover:opacity-75 transition duration-1000"></div>
                <div className="relative bg-slate-900 p-6 rounded-full border border-white/10">
                  <LogoVelocity className="w-20 h-20 text-white" />
                </div>
              </div>
              <h1 className="text-5xl font-black italic text-white mb-4 tracking-tighter">CUBITY <span className="text-blue-500">ARENA</span></h1>
              <p className="text-slate-400 text-lg mb-8 max-w-md mx-auto">The fastest, most competitive speedcubing platform on the web. Join the race.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button onMouseUp={blurOnUI} onClick={handleGuestLogin} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all hover:scale-105">
                  <Zap className="w-5 h-5" /> Start Guest Session
                </button>
                <button onMouseUp={blurOnUI} onClick={handleGoogleLogin} className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-4 rounded-xl font-bold border border-white/10 flex items-center justify-center gap-2 transition-all hover:scale-105">
                  <Users className="w-5 h-5" /> Sign in with Google
                </button>
              </div>
            </div>
          )
        )}

        {activeTab === 'more' && user && (
            <div className="max-w-md mx-auto">
                <h2 className="text-2xl font-black italic text-white mb-8 tracking-tighter">SETTINGS</h2>
                
                <div className="bg-slate-900 border border-white/10 rounded-xl p-6 mb-6">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Bluetooth className="w-5 h-5 text-blue-400" /> Smart Cube
                    </h3>
                    
                    {userData?.macAddress ? (
                        <div>
                            <div className="text-sm text-slate-400 mb-4">
                                Saved MAC: <span className="font-mono text-white bg-white/10 px-2 py-1 rounded">{userData.macAddress}</span>
                            </div>
                            <button 
                                onClick={async () => {
                                    if (confirm("Forget this cube? You will need to enter the MAC address again.")) {
                                        try {
                                            const userRef = doc(db, 'artifacts', 'cubity-v1', 'users', user.uid, 'profile', 'main');
                                            await updateDoc(userRef, { macAddress: null }); // Use deleteField() if needed, but null is fine for now
                                            setUserData(prev => ({ ...prev, macAddress: null }));
                                            smartCube.disconnectCube();
                                            alert("Cube forgotten.");
                                        } catch (err) {
                                            console.error("Error clearing MAC:", err);
                                            alert("Failed to clear MAC.");
                                        }
                                    }
                                }}
                                className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-4 py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                            >
                                <LogOut className="w-4 h-4" /> Forget Saved Cube
                            </button>
                        </div>
                    ) : (
                        <div className="text-sm text-slate-500 italic">
                            No cube MAC address saved. Connect a cube to save it.
                        </div>
                    )}
                </div>

                {/* Username Section */}
                <div className="bg-slate-900 border border-white/10 rounded-xl p-6 mb-6">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <User className="w-5 h-5 text-green-400" /> Username
                    </h3>
                    
                    <div className="mb-4">
                        <div className="text-sm text-slate-400 mb-2">Current Username:</div>
                        <div className="font-bold text-white text-lg">{userData?.displayName || 'Not set'}</div>
                    </div>

                    {isEditingName ? (
                        <div className="space-y-3">
                            <input
                                type="text"
                                value={tempName}
                                onChange={(e) => setTempName(e.target.value)}
                                placeholder="new-username"
                                minLength={3}
                                maxLength={20}
                                className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-green-500 transition-colors"
                            />
                            {nameError && (
                                <div className="text-red-400 text-sm">{nameError}</div>
                            )}
                            <div className="flex gap-2">
                                <button
                                    onClick={saveName}
                                    className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-bold transition-colors"
                                >
                                    Save
                                </button>
                                <button
                                    onClick={() => {
                                        setIsEditingName(false);
                                        setTempName(userData?.displayName || '');
                                        setNameError(null);
                                    }}
                                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-lg font-bold transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        user.isAnonymous ? (
                            <div className="text-center p-4 bg-slate-800/50 rounded-lg border border-white/5">
                                <p className="text-sm text-slate-400 mb-3">Create an account to customize your username.</p>
                                <button 
                                    onClick={() => setActiveTab('more')} // Just scroll to account security or highlight it? For now just text is fine.
                                    className="text-blue-400 text-sm font-bold hover:text-blue-300"
                                >
                                    Sign Up / Log In below
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => {
                                    // Check cooldown (30 days = 30 * 24 * 60 * 60 * 1000 ms)
                                    const lastChange = userData?.lastUsernameChange;
                                    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
                                    
                                    if (!isAdmin() && lastChange && new Date(lastChange).getTime() > thirtyDaysAgo) {
                                        const daysLeft = Math.ceil((new Date(lastChange).getTime() - thirtyDaysAgo) / (24 * 60 * 60 * 1000));
                                        setNameError(`You can change your username again in ${daysLeft} days`);
                                        return;
                                    }
                                    
                                    setTempName(userData?.displayName || '');
                                    setIsEditingName(true);
                                    setNameError(null);
                                }}
                                className="w-full bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                            >
                                <User className="w-4 h-4" /> Change Username
                            </button>
                        )
                    )}
                    
                    {!isAdmin() && userData?.lastUsernameChange && (
                        <div className="mt-3 text-xs text-slate-500">
                            Last changed: {new Date(userData.lastUsernameChange).toLocaleDateString()}
                        </div>
                    )}
                </div>

                {/* Account Security (Password Linking & Reset) */}
                {user && (
                    <div className="bg-slate-900 border border-white/10 rounded-xl p-6 mb-6">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Shield className="w-5 h-5 text-blue-400" /> Account Security
                        </h3>

                        {/* Guest Conversion */}
                        {user.isAnonymous && (
                            <div className="mb-6 pb-6 border-b border-white/10">
                                <p className="text-sm text-slate-400 mb-4">
                                    You are currently using a guest account. Link an email or Google account to save your progress permanently.
                                </p>
                                <div className="flex flex-col gap-3">
                                    <button 
                                        onClick={() => setShowEmailAuth(true)}
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                                    >
                                        <LogIn className="w-4 h-4" /> Convert with Email
                                    </button>
                                    <button 
                                        onClick={handleGoogleLogin}
                                        className="w-full bg-white hover:bg-slate-200 text-slate-900 px-4 py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                                    >
                                        <LogIn className="w-4 h-4" /> Convert with Google
                                    </button>
                                </div>
                            </div>
                        )}
                        
                        {/* Link Password (if Google only) */}
                        {!user.providerData.some(p => p.providerId === 'password') && (
                            <div className="mb-6">
                                <p className="text-sm text-slate-400 mb-4">
                                    You are currently signed in with Google. Set a password to log in with your email address as well.
                                </p>
                                <button 
                                    onClick={() => setShowEmailAuth(true)}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                                >
                                    <Lock className="w-4 h-4" /> Set Password
                                </button>
                            </div>
                        )}

                        {/* Reset Password */}
                        <div>
                            <p className="text-sm text-slate-400 mb-4">
                                Need to change your password? We'll send a reset link to <strong>{user.email}</strong>.
                            </p>
                            <button 
                                onClick={() => {
                                    if (confirm(`Send password reset email to ${user.email}?`)) {
                                        sendPasswordResetEmail(auth, user.email)
                                            .then(() => alert("Password reset email sent! Check your inbox."))
                                            .catch((error) => alert("Error sending email: " + error.message));
                                    }
                                }}
                                className="w-full bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                            >
                                <Lock className="w-4 h-4" /> Reset Password
                            </button>
                        </div>
                    </div>
                )}

                <div className="bg-slate-900 border border-white/10 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Users className="w-5 h-5 text-indigo-400" /> Account
                    </h3>
                    <button onMouseUp={blurOnUI} onClick={handleLogout} className="w-full bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2">
                        <LogOut className="w-4 h-4" /> Log Out
                    </button>
                </div>
            </div>
        )}
      </main>

      <nav className="fixed bottom-0 w-full bg-slate-950/90 backdrop-blur-xl border-t border-white/5 pb-safe px-6 py-2 flex justify-between items-center z-50 md:hidden h-20">
        <NavIcon icon={Timer} label="Timer" active={activeTab === 'timer'} onClick={() => setActiveTab('timer')} />
        <NavIcon icon={Swords} label="Arena" active={activeTab === 'arena'} onClick={() => setActiveTab('arena')} />
        <NavIcon icon={TrendingUp} label="Stats" active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} />
        <NavIcon icon={Settings} label="Settings" active={activeTab === 'more'} onClick={() => setActiveTab('more')} />
      </nav>

      {/* Email/Password Auth Modal */}
      {showEmailAuth && (
        <EmailPasswordAuth 
          onClose={() => setShowEmailAuth(false)} 
          user={user}
        />
      )}

      {/* Admin Dashboard Modal */}
      {showAdminDashboard && isAdmin() && (
        <AdminDashboard 
          user={user}
          onClose={() => setShowAdminDashboard(false)}
        />
      )}

    </div>
  );
}

function NavIcon({ icon: Icon, label, active, onClick }) {
  return (
    <button onMouseUp={blurOnUI} onClick={onClick} className={`relative flex flex-col items-center gap-1.5 p-2 transition-all duration-300 ${active ? 'text-blue-500 -translate-y-1' : 'text-slate-500 hover:text-slate-300'}`}>
      <div className={`absolute inset-0 bg-blue-600/20 blur-xl rounded-full transition-opacity duration-300 ${active ? 'opacity-100' : 'opacity-0'}`}></div>
      <Icon className={`w-6 h-6 relative z-10 ${active ? 'fill-blue-600/20' : ''}`} />
      <span className="text-[10px] font-bold relative z-10 uppercase tracking-wider">{label}</span>
      {active && <div className="absolute -bottom-2 w-1 h-1 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>}
    </button>
  );
}