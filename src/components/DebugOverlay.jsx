import React from 'react';
import { X, Activity, Terminal } from 'lucide-react';

const DebugOverlay = ({ logs, onClose }) => {
  return (
    <div className="fixed bottom-4 right-4 w-96 h-96 bg-slate-900/95 border border-slate-700 rounded-lg shadow-2xl z-50 flex flex-col font-mono text-xs overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2 text-slate-300 font-bold">
          <Terminal className="w-4 h-4 text-green-400" />
          <span>SMART CUBE DIAGNOSTICS</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Logs Area */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {logs.length === 0 && (
          <div className="text-slate-500 italic text-center mt-10">No events captured yet...</div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex gap-2 hover:bg-slate-800/50 p-1 rounded">
            <span className="text-slate-500 shrink-0">
              {new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
            </span>
            <div className="flex-1 break-all">
              <span className={`font-bold mr-2 ${
                log.type === 'MOVE' ? 'text-blue-400' :
                log.type === 'GYRO' ? 'text-purple-400' :
                log.type === 'FACELETS' ? 'text-yellow-400' :
                log.type.includes('ERROR') ? 'text-red-500' :
                'text-green-400'
              }`}>
                [{log.type}]
              </span>
              <span className="text-slate-300">{log.data}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DebugOverlay;
