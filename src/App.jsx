import React, { useState, useEffect } from "react";
import {
  Trophy,
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
} from "lucide-react";
import {
  onAuthStateChanged,
  signInAnonymously,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  linkWithPopup,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "./lib/firebase";

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("arena");
  const [onlineCount, setOnlineCount] = useState(1240);
  const [error, setError] = useState(null);

  // New State for editing username
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState("");

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
              // New user (Guest or Google) -> Create Profile
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

  // 2. ACTION: Guest Login
  const handleGuestLogin = async () => {
    setLoading(true);
    try {
      await signInAnonymously(auth);
    } catch (err) {
      setError("Guest Login Failed");
      setLoading(false);
    }
  };

  // 3. ACTION: Google Login (or Link)
  const handleGoogleLogin = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      if (user && user.isAnonymous) {
        // Upgrade flow: Link Google to Guest
        await linkWithPopup(user, provider);
      } else {
        // Standard Login
        await signInWithPopup(auth, provider);
      }
    } catch (err) {
      console.error("Google Login Error:", err);
      // "credential-already-in-use" means this Google account is already used.
      // In a real app, you'd handle merging. For now, we just catch it.
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

  // 4. ACTION: Update Username
  const saveName = async () => {
    if (!user || !tempName.trim()) return;
    try {
      const userRef = doc(
        db,
        "artifacts",
        "cubity-v1",
        "users",
        user.uid,
        "profile",
        "main"
      );
      await updateDoc(userRef, { displayName: tempName });
      setUserData((prev) => ({ ...prev, displayName: tempName }));
      setIsEditingName(false);
    } catch (err) {
      console.error("Name Update Error:", err);
    }
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
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold">CUBITY</span>
        </div>

        <div>
          {user ? (
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 bg-slate-900 border border-white/10 px-3 py-1 rounded-full hover:bg-slate-800"
            >
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
                  user.isAnonymous ? "bg-slate-700" : "bg-green-600"
                }`}
              >
                {userData?.displayName?.[0]?.toUpperCase() || "G"}
              </div>
            </button>
          ) : (
            <button
              onClick={handleGoogleLogin}
              className="flex items-center gap-2 text-sm font-bold text-slate-900 bg-white hover:bg-slate-200 px-4 py-2 rounded-lg"
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

        {/* HERO CARD */}
        <div className="mb-8 p-8 rounded-2xl bg-slate-900 border border-white/10 relative overflow-hidden">
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
                <div className="flex items-center gap-3">
                  {isEditingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        className="bg-slate-800 border border-blue-500 text-2xl font-bold text-white px-2 py-1 rounded outline-none w-48"
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
                      <h1 className="text-3xl font-bold text-white">
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
              </div>
            ) : (
              <>
                <h1 className="text-3xl font-bold mb-2">
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
                  className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2"
                >
                  <Zap className="w-5 h-5" /> Start Guest Session
                </button>
                <button
                  onClick={handleGoogleLogin}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 border border-white/10"
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

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-5 bg-slate-900/50 rounded-xl border border-white/5 hover:border-purple-500/30 hover:bg-slate-900 transition-all group cursor-pointer relative overflow-hidden">
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                <Trophy className="w-6 h-6" />
              </div>
              <span className="text-xs font-mono text-slate-500 bg-slate-800 px-2 py-1 rounded">
                RES: 14h
              </span>
            </div>
            <h3 className="font-bold text-lg mb-1 text-slate-200 group-hover:text-white">
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
            <h3 className="font-bold text-lg mb-1 text-slate-200 group-hover:text-white">
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
            <h3 className="font-bold text-lg mb-1 text-slate-200 group-hover:text-white">
              Smart Cube
            </h3>
            <p className="text-sm text-slate-500 group-hover:text-slate-400">
              Connect your GAN or GoCube via Bluetooth.
            </p>
          </div>
        </div>
      </main>

      {/* BOTTOM NAV */}
      <nav className="fixed bottom-0 w-full bg-slate-950/90 backdrop-blur-xl border-t border-white/5 pb-safe px-6 py-2 flex justify-between items-center z-50 md:hidden h-20">
        <NavIcon
          icon={Trophy}
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
        className={`absolute inset-0 bg-blue-500/20 blur-xl rounded-full transition-opacity duration-300 ${
          active ? "opacity-100" : "opacity-0"
        }`}
      ></div>
      <Icon
        className={`w-6 h-6 relative z-10 ${active ? "fill-blue-500/20" : ""}`}
      />
      <span className="text-[10px] font-bold relative z-10">{label}</span>
      {active && (
        <div className="absolute -bottom-2 w-1 h-1 rounded-full bg-blue-500"></div>
      )}
    </button>
  );
}
