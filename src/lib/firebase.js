
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// 1. Safety Check: Ensure keys are loaded
const apiKey = import.meta.env.VITE_API_KEY;

if (!apiKey) {
  console.error(
    "🔥 FIREBASE ERROR: API Key is missing! Check your .env.local file."
  );
}

const firebaseConfig = {
  apiKey: apiKey,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
};

// 2. Initialize the connection
const app = initializeApp(firebaseConfig);

// 3. Export the tools (Auth and Database)
export const auth = getAuth(app);
export const db = getFirestore(app);
