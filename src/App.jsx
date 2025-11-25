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
} from "lucide-react";
import "./index.css";

// Mock Data for Preview/Guest Mode
const MOCK_USER = {
  uid: "x5_speedcuber",
  displayName: "Guest_User",
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("arena");
  const [onlineCount, setOnlineCount] = useState(1240);

  // Simulate Initial Load
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Simulate Online Count Fluctuation
  useEffect(() => {
    const interval = setInterval(() => {
      setOnlineCount((prev) => prev + Math.floor(Math.random() * 5) - 2);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Simulate Login
  const handleGuestLogin = async () => {
    setLoading(true);
    setTimeout(() => {
      setUser(MOCK_USER);
      setLoading(false);
    }, 600);
  };

  const handleLogout = () => {
    setUser(null);
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-950 text-blue-500 gap-4">
        <Activity className="w-10 h-10 animate-spin" />
        <span className="text-slate-400 text-sm font-mono animate-pulse">
          CONNECTING TO LOBBY...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500 selection:text-white pb-24 md:pb-0">
      {/* --- TOP NAVIGATION --- */}
      <header className="fixed top-0 w-full z-50 bg-slate-950/80 backdrop-blur-md border-b border-white/5 h-16 flex items-center justify-between px-4 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/10">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-tight leading-none text-white">
              CUBITY
            </span>
            <span className="text-[10px] text-blue-400 font-bold tracking-wider">
              ARENA
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 md:gap-6">
          {/* Online Counter (Hidden on tiny screens) */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-full border border-white/5">
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </div>
            <span className="text-xs font-medium text-slate-400 tabular-nums">
              {onlineCount.toLocaleString()} Online
            </span>
          </div>

          {/* User Status */}
          {user ? (
            <button
              onClick={handleLogout}
              className="group flex items-center gap-3 pl-3 pr-1 py-1 rounded-full bg-slate-900 border border-white/10 hover:border-white/20 transition-all"
            >
              <div className="flex flex-col items-end mr-1">
                <span className="text-xs font-bold text-slate-200">
                  Diamond II
                </span>
                <span className="text-[10px] text-slate-500">ELO 1642</span>
              </div>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center text-xs font-bold ring-2 ring-transparent group-hover:ring-blue-500/50 transition-all">
                {user.uid.slice(0, 2).toUpperCase()}
              </div>
            </button>
          ) : (
            <button
              onClick={handleGuestLogin}
              className="flex items-center gap-2 text-sm font-bold text-blue-400 hover:text-white transition-colors bg-blue-500/10 hover:bg-blue-500/20 px-4 py-2 rounded-lg"
            >
              <LogIn className="w-4 h-4" />
              <span>Login</span>
            </button>
          )}
        </div>
      </header>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="pt-24 px-4 max-w-lg mx-auto md:max-w-4xl lg:max-w-6xl">
        {/* Welcome / Stats Card */}
        <div className="mb-8 relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
          <div className="relative p-6 sm:p-8 rounded-2xl bg-slate-900 border border-white/10 overflow-hidden">
            {/* Background Decor */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  {user && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                      SEASON 4
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-xs font-medium text-slate-400">
                    <Flame className="w-3 h-3 text-orange-500" /> Daily Streak:{" "}
                    {user ? "12" : "0"}
                  </span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 tracking-tight">
                  {user ? "Ready to Race, Speed?" : "Welcome to the Arena"}
                </h1>
                <p className="text-slate-400 max-w-md text-sm sm:text-base leading-relaxed">
                  Global Daily Scramble #42 is live. Current world record is{" "}
                  <span className="text-white font-bold">4.23s</span> by{" "}
                  <em>MaxPark</em>.
                </p>
              </div>

              <div className="flex flex-col gap-3 w-full md:w-auto">
                <button
                  onClick={user ? () => {} : handleGuestLogin}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-bold shadow-lg shadow-blue-500/25 transition-all active:scale-95 flex items-center justify-center gap-2 w-full md:w-auto"
                >
                  <Zap className="w-5 h-5 fill-current" />
                  {user ? "FIND MATCH" : "START GUEST SESSION"}
                </button>
                <div className="text-center">
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest">
                    Est. Wait: 4s
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card 1: Daily Scramble */}
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

          {/* Card 2: Solo Timer */}
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

          {/* Card 3: Hardware */}
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

        {/* Live Ticker (Decoration) */}
        <div className="mt-8 pt-6 border-t border-white/5">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
            Live Arena Feed
          </h4>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm p-3 rounded-lg bg-slate-900/30 border border-white/5"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span className="text-slate-300">
                    Player{" "}
                    <span className="text-white font-bold">
                      Ghost_{900 + i}
                    </span>{" "}
                    just solved in{" "}
                    <span className="text-emerald-400 font-mono">12.4{i}s</span>
                  </span>
                </div>
                <span className="text-slate-600 text-xs">Just now</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* --- BOTTOM NAVIGATION (Mobile Only) --- */}
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

// Helper Component for Navigation
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
