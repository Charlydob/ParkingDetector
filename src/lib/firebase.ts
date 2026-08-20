import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getEnvValue } from "../utils/env";

const firebaseConfig = {
  apiKey: getEnvValue(
    "VITE_FIREBASE_API_KEY",
    "AIzaSyAZ3tJfi-wyW11OWJLpBx2I1rFKr9gTq7Q",
  ),
  authDomain: getEnvValue(
    "VITE_FIREBASE_AUTH_DOMAIN",
    "parkingdetector-4ac76.firebaseapp.com",
  ),
  databaseURL: getEnvValue(
    "VITE_FIREBASE_DATABASE_URL",
    "https://parkingdetector-4ac76-default-rtdb.europe-west1.firebasedatabase.app/",
  ),
  projectId: getEnvValue("VITE_FIREBASE_PROJECT_ID", "parkingdetector-4ac76"),
  storageBucket: getEnvValue(
    "VITE_FIREBASE_STORAGE_BUCKET",
    "parkingdetector-4ac76.firebasestorage.app",
  ),
  messagingSenderId: getEnvValue("VITE_FIREBASE_MESSAGING_SENDER_ID", "141696751478"),
  appId: getEnvValue(
    "VITE_FIREBASE_APP_ID",
    "1:141696751478:web:c81807bec8e141c1480c57",
  ),
};

export const firebaseApp = initializeApp(firebaseConfig);
export const database = getDatabase(firebaseApp);
