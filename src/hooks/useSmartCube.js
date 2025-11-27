import { useState, useRef } from 'react';
import { connectGanCube } from 'gan-web-bluetooth';


// --- HOOK: WEB BLUETOOTH SMART CUBE ---
export const useSmartCube = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState(null);
  const [deviceMAC, setDeviceMAC] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [moveHistory, setMoveHistory] = useState([]); // Rolling buffer of last 50 moves
  const [facelets, setFacelets] = useState(null);
  const [gyro, setGyro] = useState(null);
  const [error, setError] = useState(null);
  const [isMacRequired, setIsMacRequired] = useState(false); // New state
  const connRef = useRef(null);
  const subRef = useRef(null);

  const setupConnection = (conn) => {
      connRef.current = conn;
      setDeviceName(conn.deviceName || "GAN Cube");
      setDeviceMAC(conn.deviceMAC);
      setIsConnected(true);
      setIsMacRequired(false); // Reset on success

      subRef.current = conn.events$.subscribe((event) => {
        if (event.type === 'MOVE') {
          const newMove = { move: event.move, time: Date.now(), id: Date.now() + Math.random() };
          setLastMove(newMove);
          setMoveHistory(prev => [...prev.slice(-49), newMove]);
        }
        if (event.type === 'GYRO') {
            setGyro(event.quaternion);
        }
        if (event.type === 'FACELETS') {
            setFacelets(event.facelets);
        }
        if (event.type === 'DISCONNECT') {
            setIsConnected(false);
            setDeviceName(null);
            setFacelets(null);
            setGyro(null);
        }
      });
  };

  const connectCube = async (savedMac = null) => {
    setError(null);
    setIsMacRequired(false);
    try {
      if (!navigator.bluetooth) {
        throw new Error("Web Bluetooth is not supported in this browser.");
      }

      const conn = await connectGanCube();
      setupConnection(conn);

    } catch (err) {
      console.error("Bluetooth Error:", err);
      // Check for specific MAC address error from library
      if (err.message && (err.message.includes("MAC") || err.message.includes("determine"))) {
          if (savedMac && typeof savedMac === 'string') {
              console.log("Auto-retrying with saved MAC:", savedMac);
              await retryWithMac(savedMac);
          } else {
              console.warn("Invalid or missing saved MAC:", savedMac);
              setIsMacRequired(true);
              setError("Browser cannot read MAC address. Please enter it manually.");
          }
      } else {
          setError(err.message || "Failed to connect");
      }
      // Do not set isConnected(false) here if we are retrying, 
      // but retryWithMac will handle success/fail.
      // If we didn't retry, we are indeed disconnected/failed.
      if (!savedMac) setIsConnected(false);
      
      // Auto-clear error after 20 seconds
      setTimeout(() => setError(null), 20000);
    }
  };

  const retryWithMac = async (macAddress) => {
      setError(null);
      try {
          // Sanitize MAC: Remove colons, dashes, spaces, ensure uppercase
          const cleanMac = macAddress.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
          console.log("Retrying with sanitized MAC:", cleanMac);

          if (cleanMac.length !== 12) {
              throw new Error(`Invalid MAC length: ${cleanMac.length} chars (expected 12 hex chars)`);
          }

          // connectGanCube expects the MAC address as a string with colons (AA:BB:CC:11:22:33)
          // It uses .split(':') internally to derive the 6-byte salt.
          const formattedMac = cleanMac.match(/.{1,2}/g).join(':');
          console.log("Retrying with formatted MAC:", formattedMac);

          const conn = await connectGanCube(async () => formattedMac);
          setupConnection(conn);
      } catch (err) {
          console.error("Retry Error:", err);
          setError("Failed to connect with MAC: " + err.message);
          // Auto-clear error after 20 seconds
          setTimeout(() => setError(null), 20000);
      }
  };

  const disconnectCube = () => {
    if (connRef.current) {
      connRef.current.disconnect();
    }
    if (subRef.current) {
        subRef.current.unsubscribe();
    }
    setIsConnected(false);
    setDeviceName(null);
    setIsMacRequired(false);
  };

  const connectMockCube = () => {
      setIsConnected(true);
      setDeviceName("Mock Cube");
      setDeviceMAC("MOCK-00-00");
      
      // Simulate random moves
      const moves = ["R", "R'", "L", "L'", "U", "U'", "D", "D'", "F", "F'", "B", "B'"];
      const interval = setInterval(() => {
          const randomMove = moves[Math.floor(Math.random() * moves.length)];
          const newMove = { move: randomMove, time: Date.now(), id: Date.now() + Math.random() };
          setLastMove(newMove);
          setMoveHistory(prev => [...prev.slice(-49), newMove]);
      }, 1500);

      // Store interval to clear on disconnect
      connRef.current = { 
          disconnect: () => clearInterval(interval),
          deviceName: "Mock Cube"
      };
  };

  return { isConnected, deviceName, deviceMAC, connectCube, disconnectCube, connectMockCube, lastMove, moveHistory, facelets, gyro, error, isMacRequired, retryWithMac };
};
