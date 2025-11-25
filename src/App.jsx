import React, { useState, useEffect } from "react";
import {
  Users,
  Zap,
  Settings,
  History,
  Timer,
  LogIn,
  Activity,
  Bluetooth,
  Flame,
  LogOut,
  Edit2,
  Save,
  Swords,
  AlertCircle,
} from "lucide-react";
import {
  onAuthStateChanged,
  signInAnonymously,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  linkWithPopup,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { auth, db } from "./lib/firebase";

// --- BRAND OPTION 1: VELOCITY CUBE LOGO ---
const LogoVelocity = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M4 8l8-4 8 4-8 4-8-4z" /> {/* Top Face */}
    <path d="M4 8v8l8 4" /> {/* Left Face */}
    <path d="M12 20v-8" /> {/* Center Line */}
    {/* Speed Lines replacing the right face - implies motion */}
    <path d="M15 11l5 2.5" className="opacity-50" />
    <path d="M17 15l3 1.5" className="opacity-75" />
    <path d="M12 16l8 4" />
  </svg>
);

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("arena");
  const [onlineCount, setOnlineCount] = useState(1240);
  const [error, setError] = useState(null);

  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState("");
  const [nameError, setNameError] = useState(null);

  // 1. LISTEN: Auth & Database
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        setUser(currentUser);

        if (currentUser) {
          try {
            const userRef = doc(
              db,
              "artifacts",
              "cubity-v1",
              "users",
              currentUser.uid,
              "profile",
              "main"
            );
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
              setUserData(userSnap.data());
              setTempName(userSnap.data().displayName);
            } else {
              const newProfile = {
                displayName: currentUser.displayName || "Guest Cuber",
                rank: "Beginner",
                elo: 800,
                streak: 0,
                joinedAt: new Date().toISOString(),
              };
              await setDoc(userRef, newProfile);
              setUserData(newProfile);
              setTempName(newProfile.displayName);
            }
          } catch (err) {
            console.error("Database Error:", err);
            setError("Could not load profile.");
          }
        } else {
          setUserData(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Auth Error:", err);
        setError("Auth Connection Failed. Check .env.local");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // 2. ACTIONS
  const handleGuestLogin = async () => {
    setLoading(true);
    try {
      await signInAnonymously(auth);
    } catch (err) {
      setError("Guest Login Failed");
      setLoading(false);
    }
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
      setError(
        err.message.includes("credential-already-in-use")
          ? "This Google account is already linked to another user."
          : "Google Login Failed"
      );
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

    if (!user || cleanName.length < 3) {
      setNameError("Name must be 3+ chars.");
      return;
    }

    if (cleanName === userData.displayName) {
      setIsEditingName(false);
      return;
    }

    try {
      const usernameRef = doc(
        db,
        "artifacts",
        "cubity-v1",
        "public",
        "data",
        "usernames",
        cleanId
      );
      const usernameSnap = await getDoc(usernameRef);

      if (usernameSnap.exists()) {
        setNameError("Username is taken!");
        return;
      }

      await setDoc(usernameRef, { uid: user.uid });

      if (userData.displayName && userData.displayName !== "Guest Cuber") {
        try {
          const oldId = userData.displayName.toLowerCase();
          if (oldId !== cleanId) {
            const oldNameRef = doc(
              db,
              "artifacts",
              "cubity-v1",
              "public",
              "data",
              "usernames",
              oldId
            );
            await deleteDoc(oldNameRef);
          }
        } catch (deleteErr) {
          console.warn("Could not delete old username:", deleteErr);
        }
      }

      const userRef = doc(
        db,
        "artifacts",
        "cubity-v1",
        "users",
        user.uid,
        "profile",
        "main"
      );
      await updateDoc(userRef, { displayName: cleanName });

      setUserData((prev) => ({ ...prev, displayName: cleanName }));
      setIsEditingName(false);
    } catch (err) {
      console.error("Name Update Error:", err);
      setNameError("Save failed. Try again.");
    }
  };

  const handleFindMatch = () => {
    alert("Searching for opponent... (Matchmaking coming in next sprint)");
  };

  if (loading)
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-950 text-blue-500 gap-4">
        <Activity className="w-10 h-10 animate-spin" />
        <span className="text-slate-400 font-mono">LOADING ARENA...</span>
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24 md:pb-0">
      {/* HEADER */}
      <header className="fixed top-0 w-full z-50 bg-slate-950/80 backdrop-blur-md border-b border-white/5 h-16 flex items-center justify-between px-4">
        <div className="flex items-center gap-3 group cursor-pointer">
          {/* BRAND LOGO CONTAINER: Electric Blue Gradient */}
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/10 group-hover:scale-105 transition-transform duration-300">
            <LogoVelocity className="w-6 h-6 text-white" />
          </div>
          <div className="flex flex-col">
            {/* BRAND NAME: Italic for velocity */}
            <span className="text-xl font-black tracking-tighter leading-none text-white italic">
              CUBITY
            </span>
            <span className="text-[10px] text-blue-400 font-bold tracking-widest uppercase">
              Velocity
            </span>
          </div>
        </div>

        <div>
          {user ? (
            <div className="relative group z-50">
              <button className="flex items-center gap-3 bg-slate-900 border border-white/10 px-3 py-1 rounded-full hover:bg-slate-800 transition-colors">
                <div className="text-right">
                  <span className="block text-xs font-bold text-slate-200">
                    {user.isAnonymous ? "Guest" : "Member"}
                  </span>
                  <span className="block text-[10px] text-slate-500 font-mono">
                    {userData?.displayName?.slice(0, 10) || "Cuber"}
                  </span>
                </div>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                    user.isAnonymous ? "bg-slate-700" : "bg-blue-600"
                  }`}
                >
                  {userData?.displayName?.[0]?.toUpperCase() || "G"}
                </div>
              </button>

              <div
                className="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-white/10 rounded-xl shadow-xl 
                opacity-0 invisible transform -translate-y-2 scale-95
                group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:scale-100
                transition-all duration-200 ease-out origin-top-right overflow-hidden z-50"
              >
                <div className="p-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg transition-colors font-medium"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={handleGoogleLogin}
              className="flex items-center gap-2 text-sm font-bold text-slate-900 bg-white hover:bg-slate-200 px-4 py-2 rounded-lg transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </header>

      {/* MAIN */}
      <main className="pt-24 px-4 max-w-4xl mx-auto">
        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-500/20 rounded-xl text-red-400">
            {error}
          </div>
        )}

        {/* HERO CARD: Adjusted gradient to match new brand colors */}
        <div className="mb-8 relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
          <div className="relative p-8 rounded-2xl bg-slate-900 border border-white/10 overflow-hidden">
            <div className="relative z-10">
              {user && userData ? (
                <div className="mb-4">
                  <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                    <Flame className="w-4 h-4 text-orange-500" />
                    <span>Streak: {userData.streak}</span>
                    <span className="mx-2">•</span>
                    <span>Rank: {userData.rank}</span>
                  </div>

                  {/* Editable Name */}
                  <div className="flex flex-col gap-2 mb-6">
                    <div className="flex items-center gap-3">
                      {isEditingName ? (
                        <div className="flex items-center gap-2">
                          <input
                            value={tempName}
                            onChange={(e) => {
                              setTempName(e.target.value);
                              setNameError(null);
                            }}
                            onKeyDown={(e) => e.key === "Enter" && saveName()}
                            autoFocus
                            placeholder="Username"
                            className={`bg-slate-800 border ${
                              nameError ? "border-red-500" : "border-blue-500"
                            } text-2xl font-bold text-white px-2 py-1 rounded outline-none w-48 italic`}
                          />
                          <button
                            onClick={saveName}
                            className="p-2 bg-blue-600 rounded-lg text-white hover:bg-blue-500"
                          >
                            <Save className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 group">
                          <h1 className="text-3xl font-black italic tracking-tight text-white">
                            {userData.displayName}
                          </h1>
                          <button
                            onClick={() => setIsEditingName(true)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-white transition-opacity"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    {nameError && (
                      <span className="text-red-400 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {nameError}
                      </span>
                    )}
                  </div>

                  {/* FIND MATCH BUTTON */}
                  <button
                    onClick={handleFindMatch}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-bold shadow-lg shadow-blue-500/25 transition-all active:scale-95 flex items-center justify-center gap-3 w-full sm:w-auto animate-pulse hover:animate-none group/btn"
                  >
                    <Swords className="w-6 h-6 fill-current group-hover/btn:rotate-12 transition-transform" />
                    <span className="tracking-wide italic">FIND MATCH</span>
                  </button>
                  <p className="mt-3 text-xs text-slate-500 font-mono">
                    EST. WAIT: 4s • 1,240 ONLINE
                  </p>
                </div>
              ) : (
                <>
                  <h1 className="text-3xl font-bold mb-2 italic">
                    Welcome to the Arena
                  </h1>
                  <p className="text-slate-400 mb-6">
                    Compete in the global daily scramble.
                  </p>
                </>
              )}

              {!user ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleGuestLogin}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all hover:scale-105 active:scale-95"
                  >
                    <Zap className="w-5 h-5" /> Start Guest Session
                  </button>
                  <button
                    onClick={handleGoogleLogin}
                    className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 border border-white/10 transition-all hover:scale-105 active:scale-95"
                  >
                    <Users className="w-5 h-5" /> Sign in with Google
                  </button>
                </div>
              ) : (
                user.isAnonymous && (
                  <div className="mt-6 p-4 bg-blue-900/20 border border-blue-500/20 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="text-sm text-blue-200">
                      <strong>You are a Guest.</strong> Link your Google account
                      to save your stats permanently.
                    </div>
                    <button
                      onClick={handleGoogleLogin}
                      className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold whitespace-nowrap"
                    >
                      Link Google Account
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-5 bg-slate-900/50 rounded-xl border border-white/5 hover:border-purple-500/30 hover:bg-slate-900 transition-all group cursor-pointer relative overflow-hidden">
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                {/* Using new logo as feature icon */}
                <LogoVelocity className="w-6 h-6" />
              </div>
              <span className="text-xs font-mono text-slate-500 bg-slate-800 px-2 py-1 rounded">
                RES: 14h
              </span>
            </div>
            <h3 className="font-bold text-lg mb-1 text-slate-200 group-hover:text-white italic">
              Daily Scramble
            </h3>
            <p className="text-sm text-slate-500 group-hover:text-slate-400">
              Compete against the world on the exact same shuffle.
            </p>
          </div>
          <div className="p-5 bg-slate-900/50 rounded-xl border border-white/5 hover:border-emerald-500/30 hover:bg-slate-900 transition-all group cursor-pointer relative overflow-hidden">
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                <Timer className="w-6 h-6" />
              </div>
              <span className="text-xs font-mono text-slate-500 bg-slate-800 px-2 py-1 rounded">
                LOCAL
              </span>
            </div>
            <h3 className="font-bold text-lg mb-1 text-slate-200 group-hover:text-white italic">
              Solo Practice
            </h3>
            <p className="text-sm text-slate-500 group-hover:text-slate-400">
              Standard timer with Ao5/Ao12 tracking.
            </p>
          </div>
          <div className="p-5 bg-slate-900/50 rounded-xl border border-white/5 hover:border-orange-500/30 hover:bg-slate-900 transition-all group cursor-pointer relative overflow-hidden">
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div className="p-2 bg-orange-500/10 rounded-lg text-orange-400 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                <Bluetooth className="w-6 h-6" />
              </div>
              <span className="text-xs font-mono text-slate-500 bg-slate-800 px-2 py-1 rounded">
                OFFLINE
              </span>
            </div>
            <h3 className="font-bold text-lg mb-1 text-slate-200 group-hover:text-white italic">
              Smart Cube
            </h3>
            <p className="text-sm text-slate-500 group-hover:text-slate-400">
              Connect your GAN or GoCube via Bluetooth.
            </p>
          </div>
        </div>
      </main>

      {/* BOTTOM NAV: Using the new Logo as the 'Home' icon */}
      <nav className="fixed bottom-0 w-full bg-slate-950/90 backdrop-blur-xl border-t border-white/5 pb-safe px-6 py-2 flex justify-between items-center z-50 md:hidden h-20">
        <NavIcon
          icon={LogoVelocity}
          label="Arena"
          active={activeTab === "arena"}
          onClick={() => setActiveTab("arena")}
        />
        <NavIcon
          icon={History}
          label="Stats"
          active={activeTab === "stats"}
          onClick={() => setActiveTab("stats")}
        />
        <NavIcon
          icon={Users}
          label="Social"
          active={activeTab === "social"}
          onClick={() => setActiveTab("social")}
        />
        <NavIcon
          icon={Settings}
          label="More"
          active={activeTab === "more"}
          onClick={() => setActiveTab("more")}
        />
      </nav>
    </div>
  );
}

// Updated Helper with sharper blue accent
function NavIcon({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center gap-1.5 p-2 transition-all duration-300 ${
        active
          ? "text-blue-500 -translate-y-1"
          : "text-slate-500 hover:text-slate-300"
      }`}
    >
      <div
        className={`absolute inset-0 bg-blue-600/20 blur-xl rounded-full transition-opacity duration-300 ${
          active ? "opacity-100" : "opacity-0"
        }`}
      ></div>
      <Icon
        className={`w-6 h-6 relative z-10 ${active ? "fill-blue-600/20" : ""}`}
      />
      <span className="text-[10px] font-bold relative z-10 uppercase tracking-wider">
        {label}
      </span>
      {active && (
        <div className="absolute -bottom-2 w-1 h-1 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
      )}
    </button>
  );
}
