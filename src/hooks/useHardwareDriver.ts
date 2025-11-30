/**
 * React hook for smart cube hardware - Singleton Pattern
 * 
 * This hook provides a React-friendly interface to the singleton DriverManager.
 * The actual driver lives outside React's lifecycle, preventing Strict Mode issues.
 */

import { useState, useEffect, useCallback } from 'react';
import { ConnectionStatus, CubeMove } from '../hardware/types';
import { useCubeSync } from './useCubeSync';
import * as DriverManager from '../hardware/DriverManager';
import { Logger } from '../utils/Logger';

export const useHardwareDriver = (savedMacAddress?: string | null) => {
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [deviceMAC, setDeviceMAC] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<CubeMove | null>(null);
  const [moveHistory, setMoveHistory] = useState<CubeMove[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [batteryLevel, setBatteryLevel] = useState(0);
  const [isMacRequired, setIsMacRequired] = useState(false);
  const [isResetRequired, setIsResetRequired] = useState(false);

  // WCA Sync Engine
  const { visualState, lastAction, handleBluetoothData, generateVerificationHash, resetSync } = useCubeSync();

    // Register event listeners
    // CRITICAL: We MUST unsubscribe listeners on unmount to prevent leaks,
    // but we MUST NOT disconnect the driver (Singleton pattern).
    useEffect(() => {
      Logger.log('Hooks', 'Registering event listeners');
  
      const unsubMove = DriverManager.onMove((move: CubeMove) => {
        Logger.log('Hooks', 'Move:', move.move);
        setLastMove(move);
        setMoveHistory(prev => [...prev.slice(-49), move]);
        handleBluetoothData('MOVE', { move: move.move });
      });
  
      const unsubStatus = DriverManager.onStatus((status: ConnectionStatus) => {
        Logger.log('Hooks', 'Status:', status);
        setIsConnected(status === ConnectionStatus.CONNECTED);
        
        if (status === ConnectionStatus.CONNECTED) {
          const deviceInfo = DriverManager.getDeviceInfo();
          if (deviceInfo) {
            setDeviceName(deviceInfo.name);
            setDeviceMAC(deviceInfo.macAddress);
            setBatteryLevel(deviceInfo.batteryLevel);
          }
        } else if (status === ConnectionStatus.DISCONNECTED) {
          setDeviceName(null);
          setDeviceMAC(null);
        }
      });
  
      const unsubBattery = DriverManager.onBattery((level: number) => {
        Logger.log('Hooks', 'Battery:', level);
        setBatteryLevel(level);
      });
      
      const unsubFacelets = DriverManager.onFacelets((facelets: string) => {
          // Optional: handle facelet updates if needed directly
      });

      const unsubError = DriverManager.onError((err: Error) => {
          Logger.error('Hooks', 'Driver Error:', err);
          if (err.message === 'DECRYPTION_FAILED') {
              setIsMacRequired(true);
              setError('Decryption failed. Please verify your MAC address.');
          } else if (err.message === 'RESET_REQUIRED') {
              setIsResetRequired(true);
              setError('Synchronization lost. Please solve your cube and confirm.');
          }
      });
  
      return () => {
        Logger.log('Hooks', 'Component unmounting - Cleaning up listeners (Connection kept alive)');
        unsubMove();
        unsubStatus();
        unsubBattery();
        unsubFacelets();
        unsubError();
      };
    }, [handleBluetoothData]);

  const [manualMac, setManualMac] = useState('');

  /**
   * Connect to a smart cube with manual MAC
   */
  const connectCube = useCallback(async () => {
    setError(null);

    // Check if already connected
    const status = DriverManager.getStatus();
    if (status === ConnectionStatus.CONNECTING || status === ConnectionStatus.CONNECTED) {
      Logger.log('Hooks', '🔄 Already connecting/connected');
      return;
    }

    // Use manual MAC if provided, otherwise fallback to saved MAC
    const targetMac = manualMac || savedMacAddress;

    // If no MAC available, show prompt
    if (!targetMac) {
      setIsMacRequired(true);
      setError('MAC address required. Please enter it manually.');
      return;
    }

    try {
      await DriverManager.connectWithMac(targetMac);
    } catch (err: any) {
      Logger.error('Hooks', 'Connection error:', err);
      if (err.message === 'MAC_REQUIRED' || err.message === 'DECRYPTION_FAILED') {
          setIsMacRequired(true);
          setError('Decryption failed. Please verify your MAC address.');
      } else {
          setError(err.message || 'Failed to connect');
      }
      throw err;
    }
  }, [savedMacAddress, manualMac]);

  /**
   * Retry connection with manually entered MAC address
   */
  const retryWithMac = useCallback(async (macAddress: string) => {
    setError(null);
    setIsMacRequired(false);
    setManualMac(macAddress); // Update state for consistency

    try {
      await DriverManager.connectWithMac(macAddress);
    } catch (err: any) {
      Logger.error('Hooks', 'Manual MAC connection error:', err);
      if (err.message === 'MAC_REQUIRED' || err.message === 'DECRYPTION_FAILED') {
          setIsMacRequired(true);
          setError('Decryption failed. Please verify your MAC address.');
      } else {
          setError(err.message || 'Failed to connect with manual MAC');
      }
      throw err;
    }
  }, []);

  /**
   * Disconnect from the smart cube
   */
  const disconnectCube = useCallback(() => {
    DriverManager.disconnect();
    setMoveHistory([]);
    setLastMove(null);
    setIsMacRequired(false);
  }, []);

  /**
   * Reset the driver state
   */
  const resetHardware = useCallback(() => {
    DriverManager.reset();
    resetSync();
  }, [resetSync]);

  const markAsSolved = useCallback(async () => {
      await DriverManager.markAsSolved();
      setIsResetRequired(false);
      setError(null);
  }, []);

  return {
    isConnected,
    deviceName,
    deviceMAC,
    connectCube,
    disconnectCube,
    lastMove,
    moveHistory,
    facelets: visualState,
    lastAction,
    error,
    batteryLevel,
    generateVerificationHash,
    resetHardware,
    isMacRequired,
    retryWithMac,
    manualMac,
    setManualMac,
    isResetRequired,
    markAsSolved,
  };
};
