import React, { useState, useEffect, useRef, useCallback } from "react";
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
  TrendingUp,
  Calendar,
  Clock,
  ChevronRight,
  LayoutGrid,
  X,
  Share2,
  Trash2,
  RotateCcw,
  Trophy,
  Construction,
  Grid3x3,
  Grid2x2,
  Box,
} from "lucide-react";
import {
  onAuthStateChanged,
  signInAnonymously,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  linkWithPopup,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { auth, db } from "./lib/firebase";

// --- UTILS: SCRAMBLE GENERATORS ---
const generateScramble = (type = "3x3", seed = null) => {
  const moves3x3 = ["R", "L", "U", "D", "F", "B"];
  const moves2x2 = ["R", "U", "F"];
  const moves4x4 = [
    "R",
    "L",
    "U",
    "D",
    "F",
    "B",
    "Rw",
    "Lw",
    "Uw",
    "Dw",
    "Fw",
    "Bw",
  ];
  const modifiers = ["", "'", "2"];

  let moves = moves3x3;
  let length = 20;

  if (type === "2x2") {
    moves = moves2x2;
    length = 9;
  }
  if (type === "4x4") {
    moves = moves4x4;
    length = 40;
  }

  let scramble = [];
  let lastMove = "";
  let secondLastMove = "";

  const pseudoRandom = () => {
    if (seed) {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    }
    return Math.random();
  };

  const getBaseMove = (m) => m.replace(/[w']/g, "");

  for (let i = 0; i < length; i++) {
    let moveIndex = Math.floor(pseudoRandom() * moves.length);
    let move = moves[moveIndex];

    while (
      getBaseMove(move) === getBaseMove(lastMove) ||
      (getBaseMove(move) === getBaseMove(secondLastMove) &&
        isOpposite(getBaseMove(move), getBaseMove(lastMove)))
    ) {
      moveIndex = Math.floor(pseudoRandom() * moves.length);
      move = moves[moveIndex];
    }

    const mod = modifiers[Math.floor(pseudoRandom() * modifiers.length)];
    scramble.push(move + mod);
    secondLastMove = lastMove;
    lastMove = move;
  }
  return scramble.join(" ");
};

const isOpposite = (m1, m2) => {
  const pairs = {
    R: "L",
    L: "R",
    U: "D",
    D: "U",
    F: "B",
    B: "F",
    Rw: "Lw",
    Lw: "Rw",
    Uw: "Dw",
    Dw: "Uw",
    Fw: "Bw",
    Bw: "Fw",
  };
  return pairs[m1] === m2;
};

const getDailySeed = () => {
  const now = new Date();
  return parseInt(`${now.getFullYear()}${now.getMonth() + 1}${now.getDate()}`);
};

// --- UTILS: CUBE SOLVER / VISUALIZER LOGIC (Simplified 2D Net) ---
const getInitialState = (type) => {
  const size = type === "2x2" ? 2 : type === "4x4" ? 4 : 3;
  const stickersPerFace = size * size;
  const colors = [
    "#ffffff",
    "#ef4444",
    "#22c55e",
    "#eab308",
    "#f97316",
    "#3b82f6",
  ];
  return colors.map((c) => Array(stickersPerFace).fill(c));
};

// --- COMPONENT: SCRAMBLE VISUALIZER ---
const ScrambleVisualizer = ({ scramble, type }) => {
  const size = type === "2x2" ? 2 : type === "4x4" ? 4 : 3;
  const state = getInitialState(type);

  const renderFace = (faceIndex, x, y) => {
    const stickerSize = 100 / size;
    return (
      <g transform={`translate(${x * 100}, ${y * 100})`}>
        {state[faceIndex].map((color, i) => (
          <rect
            key={i}
            x={(i % size) * stickerSize}
            y={Math.floor(i / size) * stickerSize}
            width={stickerSize}
            height={stickerSize}
            fill={color}
            stroke="black"
            strokeWidth="2"
          />
        ))}
      </g>
    );
  };

  const scale = type === "4x4" ? 0.6 : 0.8;

  return (
    <svg viewBox="0 0 400 300" className="w-full max-w-xs mx-auto h-32 md:h-40">
      <g transform={`scale(${scale}) translate(50, 10)`}>
        {renderFace(0, 1, 0)} {/* U */}
        {renderFace(4, 0, 1)} {/* L */}
        {renderFace(2, 1, 1)} {/* F */}
        {renderFace(1, 2, 1)} {/* R */}
        {renderFace(5, 3, 1)} {/* B */}
        {renderFace(3, 1, 2)} {/* D */}
      </g>
    </svg>
  );
};

// --- UTILS: STATS CALCULATOR ---
const calculateAverage = (solves, size) => {
  if (solves.length < size) return "--";
  const window = solves.slice(0, size);
  const dnfCount = window.filter((s) => s.penalty === "DNF").length;
  if (dnfCount > 1) return "DNF";
  const times = window.map((s) => {
    if (s.penalty === "DNF") return Infinity;
    return s.time + (s.penalty === 2 ? 2 : 0);
  });
  times.sort((a, b) => a - b);
  let sum = 0;
  for (let i = 1; i < size - 1; i++) {
    sum += times[i];
  }
  return (sum / (size - 2)).toFixed(2);
};

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
    <path d="M4 8l8-4 8 4-8 4-8-4z" />
    <path d="M4 8v8l8 4" />
    <path d="M12 20v-8" />
    <path d="M15 11l5 2.5" className="opacity-50" />
    <path d="M17 15l3 1.5" className="opacity-75" />
    <path d="M12 16l8 4" />
  </svg>
);

// --- SUB-COMPONENT: ARENA VIEW (WIP) ---
const ArenaView = () => {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col items-center justify-center h-[60vh] text-center px-4">
      <div className="w-24 h-24 bg-blue-600/10 rounded-full flex items-center justify-center mb-6 border border-blue-500/20">
        <Swords className="w-12 h-12 text-blue-500" />
      </div>
      <h2 className="text-3xl font-black italic text-white mb-2 tracking-tight">
        THE ARENA
      </h2>
      <p className="text-slate-400 max-w-md mb-8">
        Multiplayer battles are currently under construction. Prepare to race
        against cubers worldwide.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          disabled
          className="bg-slate-800 text-slate-500 px-6 py-4 rounded-xl font-bold border border-white/5 flex items-center justify-center gap-2 cursor-not-allowed"
        >
          <Construction className="w-5 h-5" /> Under Construction
        </button>
      </div>
    </div>
  );
};

// --- SUB-COMPONENT: STATS VIEW ---
const StatsView = ({ userId }) => {
  const [solves, setSolves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewAll, setViewAll] = useState(false);
  const [selectedSolve, setSelectedSolve] = useState(null);

  useEffect(() => {
    if (!userId) return;
    const limitCount = viewAll ? 100 : 20;
    const q = query(
      collection(db, "artifacts", "cubity-v1", "users", userId, "solves"),
      orderBy("timestamp", "desc"),
      limit(limitCount)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const history = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setSolves(history);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [userId, viewAll]);

  const currentAo5 = calculateAverage(solves, 5);
  const currentAo12 = calculateAverage(solves, 12);
  const bestSingle =
    solves.length > 0
      ? Math.min(
          ...solves
            .filter((s) => s.penalty !== "DNF")
            .map((s) => s.time + (s.penalty === 2 ? 2 : 0))
        ).toFixed(2)
      : "--";
  const formatDate = (isoString) =>
    new Date(isoString).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const togglePenalty = async (type) => {
    if (!selectedSolve || !userId) return;
    let newPenalty = 0;
    if (type === "2") newPenalty = selectedSolve.penalty === 2 ? 0 : 2;
    else if (type === "DNF")
      newPenalty = selectedSolve.penalty === "DNF" ? 0 : "DNF";

    setSelectedSolve((prev) => ({ ...prev, penalty: newPenalty }));
    try {
      const solveRef = doc(
        db,
        "artifacts",
        "cubity-v1",
        "users",
        userId,
        "solves",
        selectedSolve.id
      );
      await updateDoc(solveRef, { penalty: newPenalty });
    } catch (err) {
      console.error("Penalty update failed", err);
    }
  };

  const deleteSolve = async () => {
    if (!selectedSolve || !userId) return;
    if (!window.confirm("Delete this solve?")) return;
    try {
      await deleteDoc(
        doc(
          db,
          "artifacts",
          "cubity-v1",
          "users",
          userId,
          "solves",
          selectedSolve.id
        )
      );
      setSelectedSolve(null);
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
      {selectedSolve && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          onClick={() => setSelectedSolve(null)}
        >
          <div
            className="bg-slate-900 border border-white/10 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start p-6 border-b border-white/5 bg-white/5">
              <div>
                <div className="text-xs font-bold text-blue-400 uppercase mb-1">
                  Solve Details
                </div>
                <div
                  className={`text-4xl font-black font-mono tracking-tight flex items-baseline gap-2 ${
                    selectedSolve.penalty === "DNF"
                      ? "text-red-500"
                      : "text-white"
                  }`}
                >
                  {selectedSolve.penalty === "DNF" ? (
                    "DNF"
                  ) : (
                    <>
                      {(
                        selectedSolve.time +
                        (selectedSolve.penalty === 2 ? 2 : 0)
                      ).toFixed(2)}
                      s
                      {selectedSolve.penalty === 2 && (
                        <span className="text-lg text-red-400 font-bold">
                          (+2)
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedSolve(null)}
                className="p-2 bg-white/5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex gap-3">
                <button
                  onClick={() => togglePenalty("2")}
                  className={`flex-1 py-3 rounded-xl font-bold border transition-all ${
                    selectedSolve.penalty === 2
                      ? "bg-yellow-600 border-yellow-500 text-white"
                      : "bg-slate-800 text-slate-400 border-white/5 hover:text-white"
                  }`}
                >
                  +2
                </button>
                <button
                  onClick={() => togglePenalty("DNF")}
                  className={`flex-1 py-3 rounded-xl font-bold border transition-all ${
                    selectedSolve.penalty === "DNF"
                      ? "bg-red-600 border-red-500 text-white"
                      : "bg-slate-800 text-slate-400 border-white/5 hover:text-white"
                  }`}
                >
                  DNF
                </button>
              </div>
              <div className="flex items-center gap-6 text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {formatDate(selectedSolve.timestamp)}
                </div>
              </div>
              <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                <div className="text-xs font-bold text-slate-500 uppercase mb-2">
                  Scramble
                </div>
                <div className="font-mono text-white break-words text-lg">
                  {selectedSolve.scramble}
                </div>
              </div>
              <button
                onClick={deleteSolve}
                className="w-full py-3 bg-red-500/10 text-red-400 rounded-lg font-bold border border-red-500/20 flex justify-center gap-2 hover:bg-red-500/20"
              >
                <Trash2 className="w-4 h-4" /> Delete Solve
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 className="text-2xl font-black italic text-white mb-6 flex items-center gap-2">
        <TrendingUp className="w-6 h-6 text-blue-500" /> STATISTICS
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-900 border border-white/10 p-4 rounded-xl relative overflow-hidden group">
          <span className="text-xs text-slate-500 font-bold uppercase">
            Solves
          </span>
          <div className="text-2xl font-black text-white mt-1">
            {solves.length}
          </div>
        </div>
        <div className="bg-slate-900 border border-white/10 p-4 rounded-xl relative overflow-hidden group">
          <span className="text-xs text-slate-500 font-bold uppercase">
            Best Single
          </span>
          <div className="text-2xl font-black text-white mt-1">
            {bestSingle}s
          </div>
        </div>
        <div className="bg-slate-900 border border-white/10 p-4 rounded-xl relative overflow-hidden group">
          <span className="text-xs text-slate-500 font-bold uppercase">
            Current Ao5
          </span>
          <div className="text-2xl font-black text-white mt-1">
            {currentAo5}s
          </div>
        </div>
        <div className="bg-slate-900 border border-white/10 p-4 rounded-xl relative overflow-hidden group">
          <span className="text-xs text-slate-500 font-bold uppercase">
            Current Ao12
          </span>
          <div className="text-2xl font-black text-white mt-1">
            {currentAo12}s
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center">
          <h3 className="font-bold text-white italic">History</h3>
          <button
            onClick={() => setViewAll(!viewAll)}
            className="text-xs text-blue-400 hover:text-blue-300 font-bold uppercase transition-colors"
          >
            {viewAll ? "Show Less" : "View All"}
          </button>
        </div>
        <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
          {solves.map((solve) => (
            <div
              key={solve.id}
              onClick={() => setSelectedSolve(solve)}
              className="flex justify-between px-6 py-4 hover:bg-white/5 cursor-pointer group transition-colors"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-1 h-8 rounded-full ${
                    solve.penalty === "DNF"
                      ? "bg-red-500"
                      : solve.penalty === 2
                      ? "bg-yellow-500"
                      : "bg-blue-600"
                  }`}
                ></div>
                <div>
                  <div
                    className={`font-mono font-bold text-lg ${
                      solve.penalty === "DNF" ? "text-red-500" : "text-white"
                    }`}
                  >
                    {solve.penalty === "DNF"
                      ? "DNF"
                      : (solve.time + (solve.penalty === 2 ? 2 : 0)).toFixed(
                          2
                        ) + (solve.penalty === 2 ? "+" : "s")}
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    {solve.type === "2x2" && <Grid2x2 className="w-3 h-3" />}
                    {solve.type === "4x4" && <Grid3x3 className="w-3 h-3" />}
                    {(!solve.type || solve.type === "3x3") && (
                      <Box className="w-3 h-3" />
                    )}
                    {new Date(solve.timestamp).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-white transition-colors" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- SUB-COMPONENT: TIMER VIEW ---
const TimerView = ({
  user,
  userData,
  onSolveComplete,
  dailyMode = false,
  recentSolves = [],
}) => {
  const [time, setTime] = useState(0);
  const [timerState, setTimerState] = useState("IDLE");
  const [cubeType, setCubeType] = useState("3x3"); // 2x2, 3x3, 4x4
  const [showVis, setShowVis] = useState(false);
  const [scramble, setScramble] = useState("");
  const timerRef = useRef(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    setScramble(generateScramble(cubeType, dailyMode ? getDailySeed() : null));
  }, [cubeType, dailyMode]);

  const ao5 = calculateAverage(recentSolves, 5);
  const ao12 = calculateAverage(recentSolves, 12);

  const getTimerColor = () => {
    switch (timerState) {
      case "HOLDING":
        return "text-red-500";
      case "READY":
        return "text-green-500";
      case "RUNNING":
        return "text-white";
      case "STOPPED":
        return "text-blue-400";
      default:
        return dailyMode ? "text-indigo-300" : "text-white";
    }
  };

  const startTimer = () => {
    setTimerState("RUNNING");
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setTime(Date.now() - startTimeRef.current);
    }, 10);
  };

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const finalTime = (Date.now() - startTimeRef.current) / 1000;
    setTimerState("STOPPED");
    onSolveComplete(finalTime, scramble, dailyMode, cubeType); // Pass cube type to save
  }, [scramble, onSolveComplete, dailyMode, cubeType]);

  const resetTimer = () => {
    setTimerState("IDLE");
    setTime(0);
    if (!dailyMode) setScramble(generateScramble(cubeType));
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (timerState === "IDLE" || timerState === "STOPPED") {
          if (timerState === "STOPPED") resetTimer();
          setTimerState("HOLDING");
          setTimeout(
            () =>
              setTimerState((prev) => (prev === "HOLDING" ? "READY" : prev)),
            300
          );
        } else if (timerState === "RUNNING") stopTimer();
      }
    };
    const handleKeyUp = (e) => {
      if (e.code === "Space") {
        if (timerState === "READY") startTimer();
        else if (timerState === "HOLDING") setTimerState("IDLE");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [timerState, stopTimer, cubeType]);

  const handleTouchStart = () => {
    if (timerState === "IDLE" || timerState === "STOPPED") {
      if (timerState === "STOPPED") resetTimer();
      setTimerState("HOLDING");
      setTimeout(
        () => setTimerState((prev) => (prev === "HOLDING" ? "READY" : prev)),
        300
      );
    } else if (timerState === "RUNNING") stopTimer();
  };

  const handleTouchEnd = () => {
    if (timerState === "READY") startTimer();
    else if (timerState === "HOLDING") setTimerState("IDLE");
  };

  return (
    <div
      className="flex flex-col items-center justify-center min-h-[50vh] outline-none select-none touch-none relative"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Cube Selector (Hidden during run) */}
      <div
        className={`absolute top-0 right-0 transition-opacity ${
          timerState === "RUNNING" ? "opacity-0" : "opacity-100"
        }`}
      >
        {!dailyMode && (
          <div className="flex bg-slate-900 p-1 rounded-lg border border-white/10">
            <button
              onClick={() => setCubeType("2x2")}
              className={`p-2 rounded ${
                cubeType === "2x2"
                  ? "bg-blue-600 text-white"
                  : "text-slate-500 hover:text-white"
              }`}
            >
              <Grid2x2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCubeType("3x3")}
              className={`p-2 rounded ${
                cubeType === "3x3"
                  ? "bg-blue-600 text-white"
                  : "text-slate-500 hover:text-white"
              }`}
            >
              <Box className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCubeType("4x4")}
              className={`p-2 rounded ${
                cubeType === "4x4"
                  ? "bg-blue-600 text-white"
                  : "text-slate-500 hover:text-white"
              }`}
            >
              <Grid3x3 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Scramble */}
      <div
        className={`text-center mb-8 transition-opacity duration-300 ${
          timerState === "RUNNING" ? "opacity-0" : "opacity-100"
        } w-full`}
      >
        <div className="flex items-center justify-center gap-2 mb-4 text-slate-500 text-xs font-bold uppercase tracking-widest">
          {dailyMode ? (
            <span className="text-indigo-400 flex gap-2 items-center">
              <Trophy className="w-4 h-4" /> DAILY CHALLENGE
            </span>
          ) : (
            <>
              <Swords className="w-4 h-4" /> {cubeType} Scramble
            </>
          )}
        </div>
        <div className="text-xl md:text-3xl font-mono font-medium text-slate-300 max-w-3xl leading-relaxed px-4 text-center mx-auto">
          {scramble}
        </div>

        <div className="flex justify-center gap-4 mt-4">
          {!dailyMode && (
            <button
              onClick={resetTimer}
              className="text-slate-600 hover:text-white transition-colors"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => setShowVis(!showVis)}
            className={`text-xs font-bold px-3 py-1 rounded-full border ${
              showVis
                ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                : "text-slate-600 border-white/5"
            }`}
          >
            {showVis ? "Hide Net" : "Show Net"}
          </button>
        </div>

        {showVis && <ScrambleVisualizer scramble={scramble} type={cubeType} />}
      </div>

      {/* Main Timer */}
      <div
        className={`text-[6rem] md:text-[12rem] font-black font-mono tabular-nums leading-none tracking-tighter transition-colors duration-100 ${getTimerColor()}`}
      >
        {(time / 1000).toFixed(2)}
      </div>

      {/* Session Stats Overlay */}
      <div
        className={`mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 w-full max-w-2xl transition-opacity duration-300 ${
          timerState === "RUNNING" ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className="text-center">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
            ao5
          </div>
          <div className="text-xl font-mono font-bold text-white">{ao5}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
            ao12
          </div>
          <div className="text-xl font-mono font-bold text-white">{ao12}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
            count
          </div>
          <div className="text-xl font-mono font-bold text-white">
            {recentSolves.length}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
            best
          </div>
          <div className="text-xl font-mono font-bold text-white">
            {recentSolves.length > 0
              ? Math.min(
                  ...recentSolves
                    .filter((s) => s.penalty !== "DNF")
                    .map((s) => s.time + (s.penalty === 2 ? 2 : 0))
                ).toFixed(2)
              : "--"}
          </div>
        </div>
      </div>

      <div
        className={`absolute bottom-[-3rem] md:bottom-[-4rem] text-slate-600 text-xs font-bold tracking-widest uppercase animate-pulse ${
          timerState === "RUNNING" ? "hidden" : "block"
        }`}
      >
        {timerState === "STOPPED"
          ? "Press Space to Reset"
          : "Hold Space to Start"}
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("timer");
  const [activeMode, setActiveMode] = useState("normal");
  const [onlineCount, setOnlineCount] = useState(1240);
  const [error, setError] = useState(null);

  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState("");
  const [nameError, setNameError] = useState(null);
  const [dailyCompleted, setDailyCompleted] = useState(false);
  const [recentSolves, setRecentSolves] = useState([]);

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

            const todayStr = new Date().toDateString();
            const dailyRef = doc(
              db,
              "artifacts",
              "cubity-v1",
              "users",
              currentUser.uid,
              "daily_log",
              todayStr
            );
            const dailySnap = await getDoc(dailyRef);
            setDailyCompleted(dailySnap.exists());

            if (userSnap.exists()) {
              const data = userSnap.data();
              const lastActive = data.lastActive
                ? new Date(data.lastActive)
                : new Date(0);
              const now = new Date();
              const isSameDay =
                lastActive.toDateString() === now.toDateString();
              const isYesterday =
                new Date(now.setDate(now.getDate() - 1)).toDateString() ===
                lastActive.toDateString();
              let newStreak = data.streak;
              if (
                !isSameDay &&
                !isYesterday &&
                data.joinedAt !== data.lastActive
              ) {
                newStreak = 0;
                await updateDoc(userRef, { streak: 0 });
              }
              setUserData({ ...data, streak: newStreak });
              setTempName(data.displayName);
            } else {
              const newProfile = {
                displayName: currentUser.displayName || "Guest Cuber",
                rank: "Beginner",
                elo: 800,
                streak: 0,
                joinedAt: new Date().toISOString(),
                lastActive: new Date().toISOString(),
              };
              await setDoc(userRef, newProfile);
              setUserData(newProfile);
              setTempName(newProfile.displayName);
            }

            const solvesQ = query(
              collection(
                db,
                "artifacts",
                "cubity-v1",
                "users",
                currentUser.uid,
                "solves"
              ),
              orderBy("timestamp", "desc"),
              limit(20)
            );
            onSnapshot(solvesQ, (snapshot) => {
              setRecentSolves(
                snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
              );
            });
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
          ? "Account linked to another user."
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
          if (oldId !== cleanId)
            await deleteDoc(
              doc(
                db,
                "artifacts",
                "cubity-v1",
                "public",
                "data",
                "usernames",
                oldId
              )
            );
        } catch (deleteErr) {
          console.warn("Delete old name err:", deleteErr);
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
      setNameError("Save failed.");
    }
  };

  const onSolveComplete = async (time, scramble, isDaily, type = "3x3") => {
    if (!user) return;
    const now = new Date();
    try {
      await addDoc(
        collection(db, "artifacts", "cubity-v1", "users", user.uid, "solves"),
        {
          time: parseFloat(time),
          scramble: scramble,
          timestamp: now.toISOString(),
          penalty: 0,
          type: isDaily ? "daily" : type, // Save type!
        }
      );

      const userRef = doc(
        db,
        "artifacts",
        "cubity-v1",
        "users",
        user.uid,
        "profile",
        "main"
      );
      const lastActiveDate = new Date(userData.lastActive);
      let newStreak = userData.streak;
      if (lastActiveDate.toDateString() !== now.toDateString()) newStreak += 1;

      await updateDoc(userRef, {
        lastActive: now.toISOString(),
        streak: newStreak,
      });
      setUserData((prev) => ({
        ...prev,
        streak: newStreak,
        lastActive: now.toISOString(),
      }));

      if (isDaily) {
        const todayStr = now.toDateString();
        await setDoc(
          doc(
            db,
            "artifacts",
            "cubity-v1",
            "users",
            user.uid,
            "daily_log",
            todayStr
          ),
          { completed: true, time: time }
        );
        setDailyCompleted(true);
        setActiveMode("normal");
      }
    } catch (err) {
      console.error("Save Solve Error:", err);
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
      <header className="fixed top-0 w-full z-50 bg-slate-950/80 backdrop-blur-md border-b border-white/5 h-16 flex items-center justify-between px-4 lg:px-8">
        <div className="flex items-center gap-8">
          <div
            onClick={() => setActiveTab("timer")}
            className="flex items-center gap-3 group cursor-pointer"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/10 group-hover:scale-105 transition-transform duration-300">
              <LogoVelocity className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black tracking-tighter leading-none text-white italic">
                CUBITY
              </span>
              <span className="text-[10px] text-blue-400 font-bold tracking-widest uppercase">
                Velocity
              </span>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => setActiveTab("timer")}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
                activeTab === "timer"
                  ? "text-white bg-white/10"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Timer className="w-4 h-4" /> Timer
            </button>
            <button
              onClick={() => setActiveTab("arena")}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
                activeTab === "arena"
                  ? "text-white bg-white/10"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Swords className="w-4 h-4" /> Arena
            </button>
            <button
              onClick={() => setActiveTab("stats")}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
                activeTab === "stats"
                  ? "text-white bg-white/10"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <TrendingUp className="w-4 h-4" /> Stats
            </button>
          </nav>
        </div>

        <div>
          {user ? (
            <div className="relative group z-50">
              <button className="flex items-center gap-3 bg-slate-900 border border-white/10 px-3 py-1 rounded-full hover:bg-slate-800 transition-colors">
                <div className="text-right hidden sm:block">
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
              <div className="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-white/10 rounded-xl shadow-xl opacity-0 invisible transform -translate-y-2 scale-95 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:scale-100 transition-all duration-200 ease-out origin-top-right overflow-hidden z-50">
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

      <main className="pt-24 px-4 max-w-4xl mx-auto">
        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-500/20 rounded-xl text-red-400">
            {error}
          </div>
        )}

        {activeTab === "stats" && user && <StatsView userId={user.uid} />}

        {activeTab === "arena" && user && <ArenaView />}

        {activeTab === "timer" &&
          (user ? (
            <>
              <div className="mb-8">
                <div className="flex items-center justify-center gap-4 mb-4 text-slate-400 text-sm">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-orange-500" /> Streak:{" "}
                    {userData?.streak}
                  </div>
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-500" /> ELO:{" "}
                    {userData?.elo || 800}
                  </div>
                </div>

                {!dailyCompleted && activeMode === "normal" && (
                  <div className="flex justify-center mb-6">
                    <button
                      onClick={() => setActiveMode("daily")}
                      className="bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-4 py-2 rounded-full text-xs font-bold hover:bg-indigo-600/30 transition-colors flex items-center gap-2"
                    >
                      <Trophy className="w-3 h-3" /> PLAY DAILY CHALLENGE
                    </button>
                  </div>
                )}
                {activeMode === "daily" && (
                  <div className="flex justify-center mb-6">
                    <button
                      onClick={() => setActiveMode("normal")}
                      className="text-slate-500 hover:text-white text-xs font-bold transition-colors"
                    >
                      CANCEL DAILY
                    </button>
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
                  dailyMode={activeMode === "daily"}
                  recentSolves={recentSolves}
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
              <h1 className="text-5xl font-black italic text-white mb-4 tracking-tighter">
                CUBITY <span className="text-blue-500">ARENA</span>
              </h1>
              <p className="text-slate-400 text-lg mb-8 max-w-md mx-auto">
                The fastest, most competitive speedcubing platform on the web.
                Join the race.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={handleGuestLogin}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all hover:scale-105"
                >
                  <Zap className="w-5 h-5" /> Start Guest Session
                </button>
                <button
                  onClick={handleGoogleLogin}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-4 rounded-xl font-bold border border-white/10 flex items-center justify-center gap-2 transition-all hover:scale-105"
                >
                  <Users className="w-5 h-5" /> Sign in with Google
                </button>
              </div>
            </div>
          ))}
      </main>

      <nav className="fixed bottom-0 w-full bg-slate-950/90 backdrop-blur-xl border-t border-white/5 pb-safe px-6 py-2 flex justify-between items-center z-50 md:hidden h-20">
        <NavIcon
          icon={Timer}
          label="Timer"
          active={activeTab === "timer"}
          onClick={() => setActiveTab("timer")}
        />
        <NavIcon
          icon={Swords}
          label="Arena"
          active={activeTab === "arena"}
          onClick={() => setActiveTab("arena")}
        />
        <NavIcon
          icon={TrendingUp}
          label="Stats"
          active={activeTab === "stats"}
          onClick={() => setActiveTab("stats")}
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
