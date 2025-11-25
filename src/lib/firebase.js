import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export services for use in the app
export const auth = getAuth(app);/home/dainz/cubity-arena/src/lib/firebase.js$0
export const db = getFirestore(app);