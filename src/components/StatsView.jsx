import React, { useState, useEffect } from 'react';
import { 
  X, Trash2, Calendar, Box, TrendingUp, Grid2x2, Grid3x3, ChevronRight, Play, Pause, SkipBack, SkipForward 
} from 'lucide-react';
import { 
  doc, updateDoc, deleteDoc, collection, query, orderBy, limit, onSnapshot 
} from 'firebase/firestore'; 
import { db } from '../lib/firebase'; 
import { calculateAverage, calculateBestAverage } from '../utils/stats';
import { simplifyMoveStack, getSolvedState, applyCubeMove } from '../utils/cube';
import SmartCube3D from './SmartCube3D';

const blurOnUI = (e) => {
  e.currentTarget.blur();
};

const StatsView = ({ userId }) => {
  const [solves, setSolves] = useState([]);
  const [filteredSolves, setFilteredSolves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewLimit, setViewLimit] = useState(20); 
  const [selectedSolve, setSelectedSolve] = useState(null); 
  const [filterType, setFilterType] = useState('all'); 
  const [statsMode, setStatsMode] = useState('current'); 
  
  // Playback State
  const [optimizedSolution, setOptimizedSolution] = useState([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackState, setPlaybackState] = useState(null); // Current cube state for playback 

  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, 'artifacts', 'cubity-v1', 'users', userId, 'solves'), orderBy('timestamp', 'desc'), limit(200));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSolves(history);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [userId]);

  useEffect(() => {
    let filtered = solves;
    if (filterType !== 'all') {
      filtered = solves.filter(s => s.type === filterType || (filterType === '3x3' && !s.type)); 
    }
    setFilteredSolves(filtered.slice(0, viewLimit));
  }, [solves, filterType, viewLimit]);

  // Optimize Solution when selected
  useEffect(() => {
      if (selectedSolve && selectedSolve.solution) {
          const rawMoves = selectedSolve.solution.split(' ');
          // Optimize: reduce redundant moves (e.g. R R -> R2)
          // We can use simplifyMoveStack iteratively
          let optimized = [];
          rawMoves.forEach(move => {
              optimized = simplifyMoveStack(optimized, move);
          });
          setOptimizedSolution(optimized);
          setPlaybackIndex(0);
          setIsPlaying(false);
          
          // Initialize playback state (Scrambled)
          let state = getSolvedState(3); // Start solved
          // Apply scramble
          if (selectedSolve.scramble) {
              selectedSolve.scramble.split(' ').forEach(m => {
                  state = applyCubeMove(state, m, '3x3');
              });
          }
          setPlaybackState(state);
      }
  }, [selectedSolve]);

  // Handle Playback Tick
  useEffect(() => {
      let interval;
      if (isPlaying && playbackIndex < optimizedSolution.length) {
          interval = setInterval(() => {
              setPlaybackIndex(prev => {
                  if (prev >= optimizedSolution.length - 1) {
                      setIsPlaying(false);
                      return prev + 1;
                  }
                  return prev + 1;
              });
          }, 500); // 2 moves per second
      }
      return () => clearInterval(interval);
  }, [isPlaying, playbackIndex, optimizedSolution]);

  // Construct Current Algorithm for Playback
  // Instead of calculating state manually, we pass the full alg string (scramble + moves so far)
  // This allows TwistyPlayer to handle the state and transitions natively
  const currentPlaybackAlg = React.useMemo(() => {
      if (!selectedSolve) return "";
      
      const scramble = selectedSolve.scramble || "";
      const movesSoFar = optimizedSolution.slice(0, playbackIndex).join(" ");
      
      return `${scramble} ${movesSoFar}`.trim();
  }, [selectedSolve, optimizedSolution, playbackIndex]);

  const displayAo5 = statsMode === 'current' 
    ? calculateAverage(filteredSolves, 5) 
    : calculateBestAverage(solves.filter(s => filterType === 'all' || s.type === filterType), 5);

  const displayAo12 = statsMode === 'current' 
    ? calculateAverage(filteredSolves, 12) 
    : calculateBestAverage(solves.filter(s => filterType === 'all' || s.type === filterType), 12);

  const bestSingle = filteredSolves.length > 0 
    ? Math.min(...filteredSolves.filter(s => s.penalty !== 'DNF').map(s => s.time + (s.penalty === 2 ? 2 : 0))).toFixed(2) 
    : "--";
  const formatDate = (isoString) => new Date(isoString).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });



  const deleteSolve = async () => {
    if (!selectedSolve || !userId) return;
    if (!window.confirm("Delete this solve?")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', 'cubity-v1', 'users', userId, 'solves', selectedSolve.id));
      setSelectedSolve(null);
    } catch (err) { console.error("Delete failed", err); }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
      {selectedSolve && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setSelectedSolve(null)}>
          <div className="bg-slate-900 border border-white/10 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start p-6 border-b border-white/5 bg-white/5">
              <div>
                <div className="text-xs font-bold text-blue-400 uppercase mb-1">Solve Details</div>
                <div className={`text-4xl font-black font-mono tracking-tight flex items-baseline gap-2 ${selectedSolve.penalty === 'DNF' ? 'text-red-500' : 'text-white'}`}>
                  {selectedSolve.penalty === 'DNF' ? 'DNF' : <>{(selectedSolve.time + (selectedSolve.penalty === 2 ? 2 : 0)).toFixed(2)}s{selectedSolve.penalty === 2 && <span className="text-lg text-red-400 font-bold">(+2)</span>}</>}
                </div>
              </div>
              <button onClick={() => setSelectedSolve(null)} onMouseUp={blurOnUI} className="p-2 bg-white/5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-6">

              <div className="flex items-center gap-6 text-sm text-slate-400">
                <div className="flex items-center gap-2"><Calendar className="w-4 h-4" />{formatDate(selectedSolve.timestamp)}</div>
                <div className="flex items-center gap-2 text-slate-500"><Box className="w-4 h-4" /> {selectedSolve.type || '3x3'}</div>
              </div>
              <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                <div className="text-xs font-bold text-slate-500 uppercase mb-2">Scramble</div>
                <div className="font-mono text-white break-words text-lg">{selectedSolve.scramble}</div>
              </div>

              {selectedSolve.solution && (
                  <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                    <div className="flex justify-between items-center mb-4">
                        <div className="text-xs font-bold text-blue-400 uppercase">Reconstruction</div>
                        <div className="flex gap-2">
                            <button onClick={() => { setPlaybackIndex(0); setIsPlaying(false); }} className="p-1 hover:bg-white/10 rounded"><SkipBack className="w-4 h-4 text-slate-400" /></button>
                            <button onClick={() => setIsPlaying(!isPlaying)} className="p-1 hover:bg-white/10 rounded">
                                {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white" />}
                            </button>
                            <button onClick={() => setPlaybackIndex(optimizedSolution.length)} className="p-1 hover:bg-white/10 rounded"><SkipForward className="w-4 h-4 text-slate-400" /></button>
                        </div>
                    </div>
                    
                    {/* 3D Cube Preview */}
                    <div className="mb-4 relative">
                        <SmartCube3D 
                            scramble={currentPlaybackAlg} 
                            lastMove={null} // No live moves
                            isConnected={false}
                            className="h-32"
                        />
                    </div>

                    {/* Moves List */}
                    <div className="font-mono text-blue-100 break-words text-sm leading-relaxed tracking-wide max-h-32 overflow-y-auto p-2 bg-black/20 rounded">
                        {optimizedSolution.map((move, i) => (
                            <span key={i} className={`inline-block mr-2 px-1 rounded ${i === playbackIndex - 1 ? 'bg-blue-500 text-white font-bold' : 'text-slate-400'}`}>
                                {move}
                            </span>
                        ))}
                    </div>
                  </div>
              )}

              {selectedSolve.splits && (
                  <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                    <div className="text-xs font-bold text-green-400 uppercase mb-2">Splits</div>
                    <div className="font-mono text-slate-400 text-xs">
                        {JSON.stringify(selectedSolve.splits, null, 2)}
                    </div>
                  </div>
              )}
              <button onMouseUp={blurOnUI} onClick={deleteSolve} className="w-full py-3 bg-red-500/10 text-red-400 rounded-lg font-bold border border-red-500/20 flex justify-center gap-2 hover:bg-red-500/20"><Trash2 className="w-4 h-4" /> Delete Solve</button>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black italic text-white flex items-center gap-2"><TrendingUp className="w-6 h-6 text-blue-500" /> STATISTICS</h2>
        <div className="flex bg-slate-800 p-1 rounded-lg border border-white/10">
           <button onMouseUp={blurOnUI} onClick={() => setStatsMode('current')} className={`px-3 py-1 text-[10px] font-bold uppercase rounded transition-all ${statsMode === 'current' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>Current</button>
           <button onMouseUp={blurOnUI} onClick={() => setStatsMode('best')} className={`px-3 py-1 text-[10px] font-bold uppercase rounded transition-all ${statsMode === 'best' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>Best</button>
        </div>
      </div>
      
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        <button onMouseUp={blurOnUI} onClick={() => setFilterType('all')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-colors ${filterType==='all' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>All</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-900 border border-white/10 p-4 rounded-xl relative overflow-hidden group">
          <span className="text-xs text-slate-500 font-bold uppercase">Solves</span>
          <div className="text-2xl font-black text-white mt-1">{filteredSolves.length}</div>
        </div>
        <div className="bg-slate-900 border border-white/10 p-4 rounded-xl relative overflow-hidden group">
          <span className="text-xs text-slate-500 font-bold uppercase">Best Single</span>
          <div className="text-2xl font-black text-white mt-1">{bestSingle}s</div>
        </div>
        <div className="bg-slate-900 border border-white/10 p-4 rounded-xl relative overflow-hidden group">
          <span className="text-xs text-slate-500 font-bold uppercase">{statsMode} Ao5</span>
          <div className="text-2xl font-black text-white mt-1">{displayAo5}s</div>
        </div>
        <div className="bg-slate-900 border border-white/10 p-4 rounded-xl relative overflow-hidden group">
          <span className="text-xs text-slate-500 font-bold uppercase">{statsMode} Ao12</span>
          <div className="text-2xl font-black text-white mt-1">{displayAo12}s</div>
        </div>
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center">
          <h3 className="font-bold text-white italic">History</h3>
          <div className="text-xs text-slate-500 font-mono">Showing {filteredSolves.length}</div>
        </div>
        <div className="divide-y divide-white/5">
          {filteredSolves.map(solve => (
            <div key={solve.id} onClick={() => setSelectedSolve(solve)} className="flex justify-between px-6 py-4 hover:bg-white/5 cursor-pointer group transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-1 h-8 rounded-full ${solve.penalty === 'DNF' ? 'bg-red-500' : solve.penalty === 2 ? 'bg-yellow-500' : 'bg-blue-600'}`}></div>
                <div>
                  <div className={`font-mono font-bold text-lg ${solve.penalty === 'DNF' ? 'text-red-500' : 'text-white'}`}>
                    {solve.penalty === 'DNF' ? 'DNF' : (solve.time + (solve.penalty === 2 ? 2 : 0)).toFixed(2) + (solve.penalty === 2 ? '+' : 's')}
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    {solve.type === '2x2' && <Grid2x2 className="w-3 h-3" />}
                    {solve.type === '4x4' && <Grid3x3 className="w-3 h-3" />}
                    {(!solve.type || solve.type === '3x3') && <Box className="w-3 h-3" />}
                    {new Date(solve.timestamp).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-white transition-colors" />
            </div>
          ))}
        </div>
        {solves.length > viewLimit && (
          <button onMouseUp={blurOnUI} onClick={() => setViewLimit(prev => prev + 50)} className="w-full py-4 text-xs font-bold uppercase text-slate-500 hover:text-white hover:bg-white/5 transition-colors border-t border-white/5">
            Load More
          </button>
        )}
      </div>
    </div>
  );
};

export default StatsView;
