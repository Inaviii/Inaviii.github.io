import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAq3lP9kl5RUZOaUE2oLwXsny9btQ_bYDU",
  authDomain: "latintype.firebaseapp.com",
  projectId: "latintype",
  storageBucket: "latintype.firebasestorage.app",
  messagingSenderId: "159091519526",
  appId: "1:159091519526:web:a2dbc48f77aec56b7a76e7",
  measurementId: "G-QM8B49NC52"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
