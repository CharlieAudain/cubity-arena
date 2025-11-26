import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, updateDoc, deleteDoc, collection, addDoc, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { generateScramble } from '../utils/cube';

// --- HOOK: MATCHMAKING ---
export const useMatchmaking = (user) => {
  const [status, setStatus] = useState('idle'); 
  const [roomId, setRoomId] = useState(null);
  const [roomData, setRoomData] = useState(null); 
  const [error, setError] = useState(null);
  const searchRef = useRef(null);
  const roomIdRef = useRef(null);
  const statusRef = useRef('idle'); 

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const findMatch = async (queueType = '3x3') => {
    if (!user) return;
    setStatus('searching');
    setError(null);

    try {
      const roomsRef = collection(db, 'artifacts', 'cubity-v1', 'public', 'data', 'rooms');
      const snapshot = await getDocs(roomsRef); 
      
      const waitingRoom = snapshot.docs.find(doc => {
        const data = doc.data();
        return data.status === 'waiting' && data.player1.uid !== user.uid && (data.type === queueType || (!data.type && queueType === '3x3'));
      });

      if (waitingRoom) {
        const roomRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'rooms', waitingRoom.id);
        await updateDoc(roomRef, {
          status: 'playing',
          player2: { uid: user.uid, name: user.displayName || 'Guest' }
        });
        setRoomId(waitingRoom.id);
        roomIdRef.current = waitingRoom.id; 
        
        const unsubscribe = onSnapshot(roomRef, (docSnap) => {
             if(docSnap.exists()) {
                 setRoomData(docSnap.data());
                 if (docSnap.data().status === 'playing') setStatus('found');
             }
        });
        searchRef.current = unsubscribe;
      } else {
        const newRoom = await addDoc(roomsRef, {
          status: 'waiting',
          createdAt: new Date().toISOString(),
          player1: { uid: user.uid, name: user.displayName || 'Guest' },
          scramble: generateScramble(queueType),
          type: queueType 
        });
        setRoomId(newRoom.id);
        roomIdRef.current = newRoom.id; 
        
        const unsubscribe = onSnapshot(newRoom, (docSnap) => {
          if (docSnap.exists()) {
             setRoomData(docSnap.data());
             if (docSnap.data().status === 'playing') setStatus('found');
          }
        });
        searchRef.current = unsubscribe;
      }
    } catch (err) {
      console.error("Matchmaking failed:", err);
      setError("Could not connect to arena.");
      setStatus('idle');
    }
  };

  const cancelSearch = async () => {
    if (searchRef.current) searchRef.current(); 
    if (roomIdRef.current && statusRef.current === 'searching') {
        try {
            const roomRef = doc(db, 'artifacts', 'cubity-v1', 'public', 'data', 'rooms', roomIdRef.current);
            const snap = await getDoc(roomRef);
            if (snap.exists() && snap.data().status === 'waiting' && snap.data().player1.uid === user.uid) {
                await deleteDoc(roomRef);
            }
        } catch (e) { console.warn("Cleanup ignored:", e); }
    }
    setStatus('idle');
    setRoomId(null);
    setRoomData(null);
    roomIdRef.current = null;
  };

  useEffect(() => {
      return () => {
          if (statusRef.current === 'searching') {
              cancelSearch();
          }
      }
  }, []); 

  return { status, roomId, roomData, findMatch, cancelSearch, error };
};
