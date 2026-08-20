import { initializeApp, getApps } from "firebase/app";
import { get, getDatabase, push, ref, set, update } from "firebase/database";

const FIREBASE_DEFAULTS = {
  VITE_FIREBASE_API_KEY: "AIzaSyAZ3tJfi-wyW11OWJLpBx2I1rFKr9gTq7Q",
  VITE_FIREBASE_AUTH_DOMAIN: "parkingdetector-4ac76.firebaseapp.com",
  VITE_FIREBASE_DATABASE_URL:
    "https://parkingdetector-4ac76-default-rtdb.europe-west1.firebasedatabase.app/",
  VITE_FIREBASE_PROJECT_ID: "parkingdetector-4ac76",
  VITE_FIREBASE_STORAGE_BUCKET: "parkingdetector-4ac76.firebasestorage.app",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "141696751478",
  VITE_FIREBASE_APP_ID: "1:141696751478:web:c81807bec8e141c1480c57",
};

function getEnvValue(name) {
  return process.env[name] || FIREBASE_DEFAULTS[name] || "";
}

function removeUndefinedValues(value) {
  if (Array.isArray(value)) {
    return value.map(removeUndefinedValues);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, fieldValue]) => fieldValue !== undefined)
        .map(([key, fieldValue]) => [key, removeUndefinedValues(fieldValue)]),
    );
  }

  return value;
}

function snapshotCollection(snapshot) {
  const value = snapshot.val();

  if (!value) {
    return [];
  }

  return Object.entries(value).map(([id, item]) => ({
    ...item,
    id,
  }));
}

export function createFirebaseClient() {
  const config = {
    apiKey: getEnvValue("VITE_FIREBASE_API_KEY"),
    authDomain: getEnvValue("VITE_FIREBASE_AUTH_DOMAIN"),
    databaseURL: getEnvValue("VITE_FIREBASE_DATABASE_URL"),
    projectId: getEnvValue("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: getEnvValue("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: getEnvValue("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: getEnvValue("VITE_FIREBASE_APP_ID"),
  };

  const app = getApps()[0] ?? initializeApp(config);
  const database = getDatabase(app);

  return {
    async createDetection(detection) {
      const newDetectionRef = push(ref(database, "detections"));
      const firebaseDetection = removeUndefinedValues(detection);

      await set(newDetectionRef, firebaseDetection);

      return {
        ...detection,
        id: newDetectionRef.key,
      };
    },
    async getDetections() {
      return snapshotCollection(await get(ref(database, "detections")));
    },
    async updateDetection(detectionId, patch) {
      await update(ref(database, `detections/${detectionId}`), removeUndefinedValues(patch));
    },
    async createCheckIn(checkIn) {
      const newCheckInRef = push(ref(database, "checkIns"));
      const firebaseCheckIn = removeUndefinedValues(checkIn);

      await set(newCheckInRef, firebaseCheckIn);

      return {
        ...checkIn,
        id: newCheckInRef.key,
      };
    },
    async getCheckIns() {
      return snapshotCollection(await get(ref(database, "checkIns")));
    },
    async updateStripeDiagnostic(diagnostic) {
      await update(ref(database, "diagnostics/stripe"), removeUndefinedValues(diagnostic));
    },
    async testConnection() {
      await get(ref(database, ".info/connected"));
      return true;
    },
  };
}
