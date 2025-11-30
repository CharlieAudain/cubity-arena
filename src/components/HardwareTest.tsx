/**
 * Test page for the new Hardware Abstraction Layer.
 * Use this to verify the GanDriver is working correctly.
 */

import React from 'react';
import { useHardwareDriver } from '../hooks/useHardwareDriver';

export const HardwareTest = () => {
  const {
    isConnected,
    deviceName,
    deviceMAC,
    connectCube,
    disconnectCube,
    lastMove,
    moveHistory,
    error,
    batteryLevel,
    isMacRequired,
    retryWithMac,
  } = useHardwareDriver();

  const [manualMac, setManualMac] = React.useState('');

  const handleManualMacSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualMac) {
      retryWithMac(manualMac.trim());
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Hardware Driver Test</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={connectCube} 
          disabled={isConnected}
          style={{ padding: '10px 20px', marginRight: '10px' }}
        >
          Connect Cube
        </button>
        <button 
          onClick={disconnectCube} 
          disabled={!isConnected}
          style={{ padding: '10px 20px' }}
        >
          Disconnect
        </button>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <strong>Status:</strong> {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
      </div>

      {deviceName && (
        <div style={{ marginBottom: '10px' }}>
          <strong>Device:</strong> {deviceName}
        </div>
      )}

      {deviceMAC && (
        <div style={{ marginBottom: '10px' }}>
          <strong>MAC:</strong> {deviceMAC}
        </div>
      )}

      {batteryLevel > 0 && (
        <div style={{ marginBottom: '10px' }}>
          <strong>Battery:</strong> {batteryLevel}%
        </div>
      )}

      {error && (
        <div style={{ color: 'red', marginBottom: '10px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* MAC Address Input Modal */}
      {isMacRequired && (
        <div style={{ 
          position: 'fixed', 
          inset: 0, 
          backgroundColor: 'rgba(0,0,0,0.8)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          zIndex: 1000 
        }}>
          <div style={{ 
            backgroundColor: '#1e293b', 
            padding: '30px', 
            borderRadius: '10px', 
            maxWidth: '400px',
            color: 'white'
          }}>
            <h3>Enter Cube MAC Address</h3>
            <p style={{ fontSize: '14px', color: '#94a3b8' }}>
              Your browser cannot detect the cube's MAC address automatically.
              Please enter it manually (e.g., AA:BB:CC:11:22:33).
            </p>
            <form onSubmit={handleManualMacSubmit}>
              <input 
                type="text"
                value={manualMac}
                onChange={(e) => setManualMac(e.target.value)}
                placeholder="AA:BB:CC:11:22:33"
                style={{ 
                  width: '100%', 
                  padding: '10px', 
                  marginBottom: '15px',
                  fontFamily: 'monospace',
                  textTransform: 'uppercase'
                }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  type="button"
                  onClick={disconnectCube}
                  style={{ flex: 1, padding: '10px' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  style={{ flex: 1, padding: '10px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '5px' }}
                >
                  Connect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {lastMove && (
        <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f0f0f0' }}>
          <h3>Last Move</h3>
          <div><strong>Move:</strong> {lastMove.move}</div>
          <div><strong>Time Delta:</strong> {lastMove.timeDelta}ms</div>
          <div><strong>State:</strong> {lastMove.state.substring(0, 20)}...</div>
        </div>
      )}

      {moveHistory.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h3>Move History ({moveHistory.length})</h3>
          <div style={{ maxHeight: '200px', overflow: 'auto', backgroundColor: '#f9f9f9', padding: '10px' }}>
            {moveHistory.slice().reverse().map((move, idx) => (
              <div key={idx} style={{ marginBottom: '5px' }}>
                {move.move} ({move.timeDelta}ms)
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default HardwareTest;
