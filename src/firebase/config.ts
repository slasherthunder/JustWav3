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
// Force long polling for better Safari compatibility and to avoid CORS issues with WebSocket
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true, // Force long polling (better for Safari, avoids WebSocket CORS issues)
});

// Try to enable persistence, but don't fail if it's not supported or if there are issues
enableIndexedDbPersistence(db).catch((err) => {
  // Ignore persistence errors (e.g., multiple tabs, CORS issues, Safari limitations)
  if (err.code === 'failed-precondition') {
    // Multiple tabs open, ignore
    console.log('Firestore persistence disabled: multiple tabs open');
  } else if (err.code === 'unimplemented') {
    // Browser doesn't support persistence, ignore
    console.log('Firestore persistence disabled: browser not supported');
  } else {
    // Other errors (including CORS), log but don't fail - app will work without offline support
    console.warn('Firestore persistence error (continuing without offline support):', err.code || err.message);
  }
});

export default app;
