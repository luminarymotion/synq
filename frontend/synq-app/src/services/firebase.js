// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { getPerformance } from 'firebase/performance';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyCOezunDP8H_q1QYvBChcj3IztTp_dbhlE",
  authDomain: "synq-9e501.firebaseapp.com",
  projectId: "synq-9e501",
  storageBucket: "synq-9e501.firebasestorage.app",
  messagingSenderId: "230173706276",
  appId: "1:230173706276:web:468e2f4ed427ba1d47b0b1",
  measurementId: "G-1PJ96X7MN8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
console.log("Firebase app initialized:", app.name);

// Initialize Firebase Authentication and get a reference to the service
const auth = getAuth(app);
console.log("Auth object properties:", {
  app: auth.app.name,
  config: auth.app.options,
  currentUser: auth.currentUser,
  settings: auth.settings,
  languageCode: auth.languageCode,
  tenantId: auth.tenantId
});

// Initialize Firestore
const db = getFirestore(app);

// Initialize Analytics
let analytics = null;
try {
  analytics = getAnalytics(app);
  console.log("Firebase Analytics initialized");
} catch (error) {
  console.log("Analytics not available:", error.message);
}

// Initialize Performance Monitoring
let performance = null;
try {
  performance = getPerformance(app);
  console.log("Firebase Performance Monitoring initialized");
} catch (error) {
  console.log("Performance Monitoring not available:", error.message);
}

// Initialize Cloud Functions
let functions = null;
try {
  functions = getFunctions(app);
  console.log("Firebase Functions initialized");
} catch (error) {
  console.log("Functions not available:", error.message);
}

// Set persistence to LOCAL (persists even after browser restart)
setPersistence(auth, browserLocalPersistence)
  .catch((error) => {
    console.error("Auth persistence error:", error);
  });

export { auth, db, analytics, performance, functions, logEvent };