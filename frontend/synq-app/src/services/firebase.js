// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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

// Set persistence to LOCAL (persists even after browser restart)
setPersistence(auth, browserLocalPersistence)
  .catch((error) => {
    console.error("Auth persistence error:", error);
  });

export { auth, db };