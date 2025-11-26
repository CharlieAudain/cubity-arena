import React, { useState, useEffect } from 'react';
import { 
  Users, Zap, Settings, Timer, LogIn, Activity, Bluetooth, Flame, LogOut, Swords, AlertCircle, TrendingUp, Trophy 
} from 'lucide-react';
import { 
  onAuthStateChanged, signInAnonymously, signOut, GoogleAuthProvider, signInWithPopup, linkWithPopup 
} from 'firebase/auth'; 
import { 
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, query, orderBy, limit, onSnapshot 
} from 'firebase/firestore'; 
import { auth, db } from './lib/firebase'; 

import TimerView from './components/TimerView';
import StatsView from './components/StatsView';
import ArenaView from './components/ArenaView';
import LogoVelocity from './components/LogoVelocity';
import { useSmartCube } from './hooks/useSmartCube';
import { blurOnUI } from './utils/ui';

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

  // SMART CUBE HOOK
  const smartCube = useSmartCube();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        try {
          const userRef = doc(db, 'artifacts', 'cubity-v1', 'users', currentUser.uid, 'profile', 'main');
          const userSnap = await getDoc(userRef);

          const todayStr = new Date().toDateString();
          const dailyRef = doc(db, 'artifacts', 'cubity-v1', 'users', currentUser.uid, 'daily_log', todayStr);
          const dailySnap = await getDoc(dailyRef);
          setDailyCompleted(dailySnap.exists());

          if (userSnap.exists()) {
            const data = userSnap.data();
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
            const newProfile = {
              displayName: currentUser.displayName || 'Guest Cuber',
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

  const handleLogout = async () => {
    await signOut(auth);
    setUserData(null);
  };

  const saveName = async () => {
    setNameError(null);
    const cleanName = tempName.trim();
    const cleanId = cleanName.toLowerCase(); 
    if (!user || cleanName.length < 3) { setNameError("Name must be 3+ chars."); return; }
    if (cleanName === userData.displayName) { setIsEditingName(false); return; }

    try {
      const usernameRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'usernames', cleanId);
      const usernameSnap = await getDoc(usernameRef);
      if (usernameSnap.exists()) { setNameError("Username is taken!"); return; }
      await setDoc(usernameRef, { uid: user.uid });
      if (userData.displayName && userData.displayName !== "Guest Cuber") {
        try {
          const oldId = userData.displayName.toLowerCase();
          if (oldId !== cleanId) await deleteDoc(doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'usernames', oldId));
        } catch (deleteErr) { console.warn("Delete old name err:", deleteErr); }
      }
      const userRef = doc(db, 'artifacts', 'cubity-v1', 'users', user.uid, 'profile', 'main');
      await updateDoc(userRef, { displayName: cleanName });
      setUserData(prev => ({ ...prev, displayName: cleanName }));
      setIsEditingName(false);
    } catch (err) { console.error("Name Update Error:", err); setNameError("Save failed."); }
  };

  const onSolveComplete = async (time, scramble, isDaily, type = '3x3') => {
    if (!user) return;
    const now = new Date();
    try {
      await addDoc(collection(db, 'artifacts', 'cubity-v1', 'users', user.uid, 'solves'), {
        time: parseFloat(time),
        scramble: scramble,
        timestamp: now.toISOString(),
        penalty: 0,
        type: isDaily ? 'daily' : type // Save type!
      });

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
          </nav>
        </div>

        <div>
          {/* SMART CUBE CONNECT BUTTON */}
          <button 
            onClick={smartCube.isConnected ? smartCube.disconnectCube : smartCube.connectCube} 
            className={`mr-4 px-4 py-2 rounded-lg text-xs font-bold uppercase transition-colors flex items-center gap-2 ${smartCube.isConnected ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            <Bluetooth className="w-4 h-4" /> {smartCube.isConnected ? 'Connected' : 'Connect Cube'}
          </button>

          {user ? (
            <div className="relative group z-50 inline-block">
              <button className="flex items-center gap-3 bg-slate-900 border border-white/10 px-3 py-1 rounded-full hover:bg-slate-800 transition-colors">
                <div className="text-right hidden sm:block">
                  <span className="block text-xs font-bold text-slate-200">{user.isAnonymous ? "Guest" : "Member"}</span>
                  <span className="block text-[10px] text-slate-500 font-mono">{userData?.displayName?.slice(0, 10) || "Cuber"}</span>
                </div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${user.isAnonymous ? 'bg-slate-700' : 'bg-blue-600'}`}>
                  {userData?.displayName?.[0]?.toUpperCase() || "G"}
                </div>
              </button>
              <div className="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-white/10 rounded-xl shadow-xl opacity-0 invisible transform -translate-y-2 scale-95 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:scale-100 transition-all duration-200 ease-out origin-top-right overflow-hidden z-50">
                <div className="p-1">
                  <button onMouseUp={blurOnUI} onClick={handleLogout} className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg transition-colors font-medium">
                    <LogOut className="w-4 h-4" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button onMouseUp={blurOnUI} onClick={handleGoogleLogin} className="flex items-center gap-2 text-sm font-bold text-slate-900 bg-white hover:bg-slate-200 px-4 py-2 rounded-lg transition-colors">
              <LogIn className="w-4 h-4" />
              <span>Sign In</span>
            </button>
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
                            smartCube.retryWithMac(mac.trim());
                        }
                    }}>
                        <input 
                            name="mac" 
                            type="text" 
                            placeholder="XX:XX:XX:XX:XX:XX" 
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white font-mono mb-4 focus:outline-none focus:border-blue-500"
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
        
        {activeTab === 'arena' && user && <ArenaView user={user} smartCube={smartCube} />}

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
      </main>

      <nav className="fixed bottom-0 w-full bg-slate-950/90 backdrop-blur-xl border-t border-white/5 pb-safe px-6 py-2 flex justify-between items-center z-50 md:hidden h-20">
        <NavIcon icon={Timer} label="Timer" active={activeTab === 'timer'} onClick={() => setActiveTab('timer')} />
        <NavIcon icon={Swords} label="Arena" active={activeTab === 'arena'} onClick={() => setActiveTab('arena')} />
        <NavIcon icon={TrendingUp} label="Stats" active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} />
        <NavIcon icon={Settings} label="More" active={activeTab === 'more'} onClick={() => setActiveTab('more')} />
      </nav>

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