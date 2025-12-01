import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './useSocket';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

const verifyEncryption = async (pc) => {
  try {
    const stats = await pc.getStats();
    let isEncrypted = false;

    stats.forEach((report) => {
      if (report.type === 'transport') {
        const dtlsState = report.dtlsState;
        if (dtlsState === 'connected') {
            isEncrypted = true;
        }
      }
    });

    if (!isEncrypted) {
        console.warn('[Security] ⚠️ WebRTC connection is NOT fully encrypted (DTLS state invalid).');
    } else {
        console.log('[Security] 🔒 WebRTC DTLS Encryption Verified.');
    }

    return isEncrypted;
  } catch (e) {
    console.error('[Security] Failed to verify encryption:', e);
    return false;
  }
};

export const useWebRTC = (roomId, userId, isHost) => {
    const [status, setStatus] = useState('DISCONNECTED'); // DISCONNECTED, CONNECTING, CONNECTED, FAILED
    const [lastMessage, setLastMessage] = useState(null);
    
    const peerRef = useRef(null);
    const channelRef = useRef(null);
    const socket = useSocket();
    const candidatesProcessed = useRef(new Set()); 

    // Initialize Peer Connection
    useEffect(() => {
        if (!roomId || !userId || !socket) return;

        const initializePeer = async () => {
            setStatus('CONNECTING');
            console.log(`[WebRTC] Initializing as ${isHost ? 'HOST' : 'GUEST'}`);

            const peer = new RTCPeerConnection(ICE_SERVERS);
            peerRef.current = peer;

            // Handle ICE Candidates
            peer.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('signal', {
                        roomId,
                        signalData: { type: 'candidate', candidate: event.candidate }
                    });
                }
            };

            peer.onconnectionstatechange = async () => {
                console.log("[WebRTC] Connection State:", peer.connectionState);
                if (peer.connectionState === 'connected') {
                    const isSecure = await verifyEncryption(peer);
                    if (isSecure) {
                        setStatus('CONNECTED');
                    } else {
                        console.error('[Security] Connection insecure. Closing.');
                        peer.close();
                        setStatus('FAILED');
                    }
                }
                if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') setStatus('FAILED');
            };

            // DATA CHANNEL
            if (isHost) {
                const channel = peer.createDataChannel("moves");
                setupChannel(channel);
                // Wait for 'ready' signal to create offer
            } else {
                peer.ondatachannel = (event) => {
                    setupChannel(event.channel);
                };
            }
        };

        initializePeer();

        return () => {
            if (peerRef.current) peerRef.current.close();
            if (channelRef.current) channelRef.current.close();
        };
    }, [roomId, userId, isHost, socket]);

    const candidateQueue = useRef([]);
    const hasReceivedOffer = useRef(false);

    // Socket Signaling Listener
    useEffect(() => {
        if (!socket || !peerRef.current) return;

        const handleSignal = async (data) => {
            const peer = peerRef.current;
            try {
                if (data.type === 'ready') {
                    if (!isHost) return;
                    console.log("[WebRTC] Received Ready from Guest -> Sending Offer");
                    
                    // Create and Send Offer (Idempotent-ish, or check if already doing it)
                    // For simplicity, we can recreate or just resend if we stored it.
                    // Let's just create a new one to be safe and fresh.
                    // Check if we already have a stable connection? 
                    if (peer.signalingState === 'stable' && peer.connectionState === 'connected') return;

                    const offer = await peer.createOffer();
                    await peer.setLocalDescription(offer);
                    socket.emit('signal', {
                        roomId,
                        signalData: { type: 'offer', sdp: offer.sdp }
                    });

                } else if (data.type === 'offer') {
                    if (isHost) return; 
                    console.log("[WebRTC] Received Offer");
                    hasReceivedOffer.current = true; // Stop sending ready

                    // If we already have a remote description, maybe this is a re-offer?
                    // For now, assume fresh or restart.
                    if (peer.signalingState !== 'stable' && peer.signalingState !== 'have-local-offer') {
                         // Reset if needed? Standard handling:
                    }
                    
                    await peer.setRemoteDescription(new RTCSessionDescription(data));
                    
                    // Process Queued Candidates
                    while (candidateQueue.current.length > 0) {
                        const candidate = candidateQueue.current.shift();
                        await peer.addIceCandidate(new RTCIceCandidate(candidate));
                    }

                    const answer = await peer.createAnswer();
                    await peer.setLocalDescription(answer);
                    socket.emit('signal', {
                        roomId,
                        signalData: { type: 'answer', sdp: answer.sdp }
                    });
                } else if (data.type === 'answer') {
                    if (!isHost) return; 
                    console.log("[WebRTC] Received Answer");
                    await peer.setRemoteDescription(new RTCSessionDescription(data));

                    // Process Queued Candidates
                    while (candidateQueue.current.length > 0) {
                        const candidate = candidateQueue.current.shift();
                        await peer.addIceCandidate(new RTCIceCandidate(candidate));
                    }
                } else if (data.type === 'candidate') {
                    console.log("[WebRTC] Received Candidate");
                    if (peer.remoteDescription) {
                        await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
                    } else {
                        console.log("[WebRTC] Queuing Candidate (No Remote Description)");
                        candidateQueue.current.push(data.candidate);
                    }
                }
            } catch (err) {
                console.error("[WebRTC] Signal Error:", err);
            }
        };

        socket.on('signal', handleSignal);

        // Guest: Send Ready Loop
        let readyInterval;
        if (!isHost) {
            readyInterval = setInterval(() => {
                if (hasReceivedOffer.current) {
                    clearInterval(readyInterval);
                    return;
                }
                console.log("[WebRTC] Sending Ready...");
                socket.emit('signal', { roomId, signalData: { type: 'ready' } });
            }, 1000);
        }

        return () => {
            socket.off('signal', handleSignal);
            if (readyInterval) clearInterval(readyInterval);
        };
    }, [socket, roomId, isHost]);

    const setupChannel = (channel) => {
        console.log("[WebRTC] Channel Created:", channel.label);
        channelRef.current = channel;
        
        channel.onopen = () => {
            console.log("[WebRTC] Data Channel OPEN");
            setStatus('CONNECTED');
        };
        
        channel.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                setLastMessage(msg);
            } catch (e) {
                console.warn("Failed to parse WebRTC msg:", event.data);
            }
        };
    };

    const sendMessage = useCallback((data) => {
        if (channelRef.current && channelRef.current.readyState === 'open') {
            channelRef.current.send(JSON.stringify(data));
        }
    }, []);

    return { status, sendMessage, lastMessage };
};
