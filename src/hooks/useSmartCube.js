import { useState, useRef } from 'react';

// --- HOOK: WEB BLUETOOTH SMART CUBE ---
export const useSmartCube = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [error, setError] = useState(null);
  const deviceRef = useRef(null);

  const connectCube = async () => {
    setError(null);
    try {
      if (!navigator.bluetooth) {
        throw new Error("Web Bluetooth is not supported in this browser.");
      }

      // Request Bluetooth Device - Filter for common cube UUIDs if known, or allow all devices for now
      // Note: GAN/GoCube have specific Service UUIDs. Using a generic approach for this demo.
      // In production, you'd list specific services like: filters: [{ services: ['0000aadb-0000-1000-8000-00805f9b34fb'] }]
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['0000180f-0000-1000-8000-00805f9b34fb'] // Battery service as example, usually cube services differ
      });

      const server = await device.gatt.connect();
      deviceRef.current = device;
      setDeviceName(device.name);
      setIsConnected(true);
      
      device.addEventListener('gattserverdisconnected', () => {
        setIsConnected(false);
        setDeviceName(null);
      });
      
      // NOTE: Real cube move parsing requires detailed protocol knowledge of GAN/GoCube.
      // For this Unicorn MVP, we will simulate the "Connected" state enabling the timer.
      // In a real implementation, we'd subscribe to characteristicvaluechanged here.

    } catch (err) {
      console.error("Bluetooth Error:", err);
      setError(err.message);
    }
  };

  const disconnectCube = () => {
    if (deviceRef.current && deviceRef.current.gatt.connected) {
      deviceRef.current.gatt.disconnect();
    }
    setIsConnected(false);
    setDeviceName(null);
  };

  return { isConnected, deviceName, connectCube, disconnectCube, lastMove, error };
};
