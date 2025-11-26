import React, { useState, useEffect } from 'react';
import { Swords, Search, Trophy, Loader2, Crown, Frown, Activity } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore'; 
import { db } from '../lib/firebase'; 
import { useMatchmaking } from '../hooks/useMatchmaking';
import TimerView from './TimerView';

const blurOnUI = (e) => {
  e.currentTarget.blur();
};

// --- SUB-COMPONENT: BATTLE ROOM ---
const BattleRoom = ({ user, roomData, roomId, onExit, smartCube }) => {
    const [myTime, setMyTime] = useState(null);
    const [opponentTime, setOpponentTime] = useState(null);
    const [result, setResult] = useState(null); 

    const amIPlayer1 = user.uid === roomData.player1.uid;
    const opponentName = amIPlayer1 ? roomData.player2?.name : roomData.player1.name;
    const myResultField = amIPlayer1 ? 'result1' : 'result2';
    const opResultField = amIPlayer1 ? 'result2' : 'result1';

    useEffect(() => {
        const myRes = roomData[myResultField];
        const opRes = roomData[opResultField];
        
        if (myRes) setMyTime(myRes);
        if (opRes) setOpponentTime(opRes);

        if (myRes && opRes) {
            if (myRes < opRes) setResult('win');
            else if (myRes > opRes) setResult('loss');
            else setResult('draw');
        }
    }, [roomData, myResultField, opResultField]);

    const onBattleSolveComplete = async (time) => {
        const roomRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'rooms', roomId);
        await updateDoc(roomRef, {
            [myResultField]: parseFloat(time)
        });
    };

    return (
        <div className="w-full max-w-3xl mx-auto">
            <div className="flex justify-between items-center mb-8 p-4 bg-slate-900/50 border border-white/10 rounded-xl">
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <div className="text-xs text-slate-500 font-bold uppercase">YOU</div>
                        <div className="text-white font-bold">{user.displayName || 'Guest'}</div>
                    </div>
                </div>
                <div className="text-2xl font-black italic text-slate-700">VS</div>
                <div className="flex items-center gap-3">
                    <div className="text-left">
                        <div className="text-xs text-slate-500 font-bold uppercase">OPPONENT</div>
                        <div className="text-white font-bold">{opponentName || 'Connecting...'}</div>
                    </div>
                </div>
            </div>

            {!myTime ? (
                <div className="mb-8">
                    <div className="text-center mb-4 text-indigo-400 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                        <Swords className="w-4 h-4" /> BATTLE SCRAMBLE
                    </div>
                    <TimerView 
                        user={user} 
                        userData={{}} 
                        onSolveComplete={onBattleSolveComplete} 
                        dailyMode={false} 
                        isBattle={true}
                        forcedScramble={roomData.scramble}
                        forcedType={roomData.type || '3x3'}
                        disableScrambleGen={true}
                        smartCube={smartCube} 
                    />
                </div>
            ) : (
                <div className="text-center py-12 animate-in zoom-in duration-300">
                    {result ? (
                        <>
                            {result === 'win' && <Crown className="w-20 h-20 text-yellow-500 mx-auto mb-4" />}
                            {result === 'loss' && <Frown className="w-20 h-20 text-slate-500 mx-auto mb-4" />}
                            <h1 className="text-5xl font-black italic text-white mb-2">
                                {result === 'win' ? 'VICTORY!' : result === 'loss' ? 'DEFEAT' : 'DRAW'}
                            </h1>
                            <div className="flex justify-center gap-8 mt-8">
                                <div>
                                    <div className="text-xs text-slate-500 uppercase font-bold">You</div>
                                    <div className="text-3xl font-mono text-white">{myTime}s</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500 uppercase font-bold">{opponentName}</div>
                                    <div className="text-3xl font-mono text-white">{opponentTime}s</div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <Activity className="w-16 h-16 text-blue-500 animate-pulse mx-auto mb-4" />
                            <h2 className="text-2xl font-bold text-white">Waiting for opponent...</h2>
                            <p className="text-slate-500 mt-2">You finished in {myTime}s</p>
                        </>
                    )}
                    {result && (
                        <button onClick={onExit} className="mt-12 bg-slate-800 hover:bg-slate-700 text-white px-8 py-3 rounded-xl font-bold transition-colors">
                            Leave Match
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

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
