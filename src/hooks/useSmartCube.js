import { useState, useRef } from 'react';
import { connectGanCube } from 'gan-web-bluetooth';


// --- HOOK: WEB BLUETOOTH SMART CUBE ---
export const useSmartCube = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState(null);
  const [deviceMAC, setDeviceMAC] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [facelets, setFacelets] = useState(null);
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
          setLastMove({ move: event.move, time: Date.now() });
        }
        if (event.type === 'FACELETS') {
            setFacelets(event.facelets);
        }
        if (event.type === 'DISCONNECT') {
            setIsConnected(false);
            setDeviceName(null);
            setFacelets(null);
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
          if (savedMac) {
              console.log("Auto-retrying with saved MAC:", savedMac);
              await retryWithMac(savedMac);
          } else {
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
    }
  };

  const retryWithMac = async (macAddress) => {
      setError(null);
      try {
          // connectGanCube expects a provider function, not a string
          const conn = await connectGanCube(async () => macAddress);
          setupConnection(conn);
      } catch (err) {
          console.error("Retry Error:", err);
          setError("Failed to connect with MAC: " + err.message);
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

  return { isConnected, deviceName, deviceMAC, connectCube, disconnectCube, lastMove, facelets, error, isMacRequired, retryWithMac };
};
