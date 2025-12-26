import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB_tysiEg90rU_vEjBZIxba7X1Vw1eMHCg",
  authDomain: "justwave-74759.firebaseapp.com",
  projectId: "justwave-74759",
  storageBucket: "justwave-74759.firebasestorage.app",
  messagingSenderId: "757112502336",
  appId: "1:757112502336:web:ea5015e936bec979f847a5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Cloud Firestore with settings optimized for dev environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

enableIndexedDbPersistence(db).catch(() => {
  // Ignore persistence errors (e.g., multiple tabs)
});

export default app;
