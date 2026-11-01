
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCdo8honZ3DMqlFR4H659_y1u9a2GRoeTo",
  authDomain: "amigos-league.firebaseapp.com",
  databaseURL: "https://amigos-league-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "amigos-league",
  storageBucket: "amigos-league.firebasestorage.app",
  messagingSenderId: "841410613618",
  appId: "1:841410613618:web:a66cc89ff32f4a56f78deb",
  measurementId: "G-S08W6NY5L2"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
