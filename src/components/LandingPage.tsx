import React from 'react';
import { Activity, Trophy, Swords, Cpu } from 'lucide-react';

export default function LandingPage({ onLogin }) {
  return (
    <main className="fixed inset-0 z-50 w-full h-full overflow-y-auto bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/40 via-slate-950 to-slate-950 text-white font-sans selection:bg-indigo-500/30">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 relative overflow-hidden w-full">
        
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-96 bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-cyan-600/10 blur-[100px] rounded-full pointer-events-none"></div>

        <div className="relative z-10 max-w-6xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-indigo-300 text-xs font-bold uppercase tracking-widest mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <Activity className="w-3 h-3" /> Live Beta
            </div>

            <h1 className="text-5xl md:text-8xl font-black tracking-tighter text-white mb-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
            CUBITY <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">ARENA</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-slate-400 max-w-3xl mx-auto mb-12 leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
            The world's first eSports platform for speedcubing. Connect your Smart Cube and battle players worldwide in real-time.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
            <button onClick={onLogin} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-full font-bold text-lg transition-all shadow-lg shadow-indigo-500/20 hover:scale-105 hover:shadow-indigo-500/40 active:scale-95">
                Enter the Arena
            </button>
            <a href="https://discord.gg/cubity" target="_blank" rel="noopener noreferrer" className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-full font-bold text-lg transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-2 hover:scale-105 active:scale-95">
                Join Discord
            </a>
            </div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-32 max-w-7xl mx-auto w-full px-4 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-500">
          <FeatureCard 
            icon={<Swords className="w-8 h-8" />} 
            title="Ranked Battles" 
            desc="Compete in real-time 1v1 matches with ELO matchmaking and instant replays." 
          />
          <FeatureCard 
            icon={<Cpu className="w-8 h-8" />} 
            title="Universal Hardware" 
            desc="Zero-latency synchronization for GAN, Moyu, QiYi, and GoCube via Web Bluetooth." 
          />
          <FeatureCard 
            icon={<Trophy className="w-8 h-8" />} 
            title="WCA Compliance" 
            desc="Official random-state scrambles and hardware-verified timing for fair play." 
          />
        </div>
      </div>

      <footer className="p-8 text-center text-slate-600 text-sm font-mono">
        &copy; 2025 Cubity Arena. Built for speed.
      </footer>
    </main>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div className="p-8 bg-slate-900/40 border border-white/5 rounded-3xl hover:bg-slate-900/60 hover:border-indigo-500/30 transition-all duration-300 group text-left">
      <div className="text-indigo-400 mb-6 bg-indigo-500/10 w-16 h-16 rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all duration-300">{icon}</div>
      <h3 className="text-xl font-bold mb-3 text-white group-hover:text-indigo-300 transition-colors">{title}</h3>
      <p className="text-slate-400 leading-relaxed">{desc}</p>
    </div>
  );
}
