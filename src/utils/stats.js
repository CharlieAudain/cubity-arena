// --- UTILS: STATS CALCULATOR ---
export const calculateAverage = (solves, size) => {
  if (solves.length < size) return "--";
  const window = solves.slice(0, size);
  const dnfCount = window.filter(s => s.penalty === 'DNF').length;
  if (dnfCount > 1) return "DNF";
  const times = window.map(s => {
    if (s.penalty === 'DNF') return Infinity;
    return s.time + (s.penalty === 2 ? 2 : 0);
  });
  times.sort((a, b) => a - b);
  let sum = 0;
  for(let i = 1; i < size - 1; i++) { sum += times[i]; }
  return (sum / (size - 2)).toFixed(2);
};

export const calculateBestAverage = (solves, size) => {
  if (solves.length < size) return "--";
  let best = Infinity;
  for(let i = 0; i <= solves.length - size; i++) {
    const window = solves.slice(i, i + size);
    const dnfCount = window.filter(s => s.penalty === 'DNF').length;
    if (dnfCount <= 1) {
       const times = window.map(s => {
          if (s.penalty === 'DNF') return Infinity;
          return s.time + (s.penalty === 2 ? 2 : 0);
       });
       times.sort((a, b) => a - b);
       let sum = 0;
       for(let j = 1; j < size - 1; j++) { sum += times[j]; }
       const avg = sum / (size - 2);
       if (avg < best) best = avg;
    }
  }
  return best === Infinity ? "DNF" : best.toFixed(2);
};
