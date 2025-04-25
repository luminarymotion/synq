// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyCOezunDP8H_q1QYvBChcj3IztTp_dbhlE",
    authDomain: "synq-9e501.firebaseapp.com",
    projectId: "synq-9e501",
    storageBucket: "synq-9e501.firebasestorage.app",
    messagingSenderId: "230173706276",
    appId: "1:230173706276:web:8ae4d6a642ab58aa47b0b1",
    measurementId: "G-RQ2MKXMS58"
  };
  

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };