import React, { useState, useEffect } from 'react';
import { Swords, Search, Trophy, Loader2, Crown, Frown, Activity } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore'; 
import { db } from '../lib/firebase'; 
import { useMatchmaking } from '../hooks/useMatchmaking';
import TimerView from './TimerView';

const blurOnUI = (e) => {
  e.currentTarget.blur();
};

import BattleRoom from './BattleRoom';

const ArenaView = ({ user, smartCube }) => {
  const { status, roomId, roomData, findMatch, cancelSearch, error } = useMatchmaking(user);
  const [queueType, setQueueType] = useState('3x3'); 

  if (status === 'found' && roomData) {
      return <BattleRoom user={user} roomData={roomData} roomId={roomId} onExit={cancelSearch} smartCube={smartCube} />;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col items-center justify-center h-[60vh] text-center px-4">
      {status === 'idle' && (
        <>
          <div className="w-24 h-24 bg-blue-600/10 rounded-full flex items-center justify-center mb-6 border border-blue-500/20 group">
            <Swords className="w-12 h-12 text-blue-500 group-hover:scale-110 transition-transform duration-300" />
          </div>
          <h2 className="text-3xl font-black italic text-white mb-2 tracking-tight">THE ARENA</h2>
          <p className="text-slate-400 max-w-md mb-8">Race against cubers worldwide in real-time. 1v1 Ranked Battles.</p>
          <div className="flex bg-slate-900 p-1 rounded-lg border border-white/10 mb-8">
            <button onMouseUp={blurOnUI} onClick={() => setQueueType('2x2')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${queueType==='2x2' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}>2x2</button>
            <button onMouseUp={blurOnUI} onClick={() => setQueueType('3x3')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${queueType==='3x3' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}>3x3</button>
            <button onMouseUp={blurOnUI} onClick={() => setQueueType('4x4')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${queueType==='4x4' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}>4x4</button>
          </div>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button onClick={() => findMatch(queueType)} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-4 rounded-xl font-bold shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-95">
              <Swords className="w-5 h-5" /> FIND MATCH ({queueType})
            </button>
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
          </div>
        </>
      )}
      {status === 'searching' && (
        <div className="flex flex-col items-center">
          <div className="relative mb-8">
            <div className="w-24 h-24 bg-blue-600/10 rounded-full flex items-center justify-center border border-blue-500/20 animate-pulse">
              <Search className="w-10 h-10 text-blue-500" />
            </div>
            <div className="absolute inset-0 rounded-full border-4 border-blue-500/20 animate-ping"></div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Searching for opponent...</h2>
          <p className="text-slate-500 text-sm mb-8">Queue: {queueType}</p>
          <button onClick={cancelSearch} className="text-slate-400 hover:text-white text-sm font-bold uppercase tracking-wider border border-white/10 px-6 py-2 rounded-full">
            Cancel
          </button>
        </div>
      )}
      {status === 'found' && (
        <div className="flex flex-col items-center animate-in zoom-in duration-300">
          <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center mb-6 border border-green-500/20">
            <Trophy className="w-12 h-12 text-green-500" />
          </div>
          <h2 className="text-3xl font-black italic text-white mb-2 tracking-tight">MATCH FOUND!</h2>
          <p className="text-slate-400 mb-8">Entering Room: <span className="font-mono text-white bg-white/10 px-2 py-1 rounded">{roomId?.slice(0,6)}</span></p>
          <button className="bg-green-600 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 animate-pulse">
            <Loader2 className="w-5 h-5 animate-spin" /> CONNECTING
          </button>
        </div>
      )}
    </div>
  );
};

export default ArenaView;
