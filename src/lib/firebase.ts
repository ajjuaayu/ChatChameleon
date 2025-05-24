import { initializeApp, getApp, getApps } from "firebase/app";
import { getDatabase } from "firebase/database";

// !!! URGENT: Firebase Configuration Incomplete !!!
// You MUST replace the placeholder values below with your actual
// Firebase project's configuration details.
//
// To find these values:
// 1. Go to your Firebase project console (https://console.firebase.google.com/).
// 2. Select your project.
// 3. Go to Project settings (click the gear icon near "Project Overview").
// 4. In the "General" tab, under "Your apps", find your web app.
// 5. Click on "Config" (or the SDK setup and configuration snippet).
// 6. Copy the firebaseConfig object values here.
//
// Make sure the databaseURL is specifically for the Realtime Database,
// usually in the format: https://<YOUR-PROJECT-ID>-default-rtdb.firebaseio.com
// or https://<YOUR-PROJECT-ID>.firebaseio.com (for older projects).
const firebaseConfig = {
  apiKey: "YOUR_API_KEY", // REPLACE THIS
  authDomain: "YOUR_AUTH_DOMAIN", // REPLACE THIS
  databaseURL: "YOUR_DATABASE_URL", // REPLACE THIS - e.g., https://your-project-id-default-rtdb.firebaseio.com
  projectId: "YOUR_PROJECT_ID", // REPLACE THIS
  storageBucket: "YOUR_STORAGE_BUCKET", // REPLACE THIS
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID", // REPLACE THIS
  appId: "YOUR_APP_ID" // REPLACE THIS
};

// Initialize Firebase
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const database = getDatabase(app);

export { app, database };
