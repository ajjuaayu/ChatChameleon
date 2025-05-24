import { initializeApp, getApp, getApps } from "firebase/app";
import { getDatabase } from "firebase/database";

// !!! URGENT: Firebase Configuration Incomplete !!!
// YOU MUST REPLACE THE PLACEHOLDER VALUES BELOW WITH YOUR ACTUAL
// FIREBASE PROJECT'S CONFIGURATION DETAILS.
//
// To find these values:
// 1. Go to your Firebase project console (https://console.firebase.google.com/).
// 2. Select your project.
// 3. Go to Project settings (click the gear icon near "Project Overview").
// 4. In the "General" tab, under "Your apps", find your web app.
// 5. If you haven't registered a web app, create one.
// 6. Click on "Config" (or the SDK setup and configuration snippet, often looks like </>).
// 7. Copy the firebaseConfig object values here.
//
// THE `databaseURL` IS CRITICAL. It should look like:
// `https://<YOUR-PROJECT-ID>-default-rtdb.firebaseio.com`
// or for some regions/older projects:
// `https://<YOUR-PROJECT-ID>-default-rtdb.<REGION>.firebasedatabase.app`
// `https://<YOUR-PROJECT-ID>.firebaseio.com`
// Ensure you use the correct one provided by your Firebase project settings.
//
const firebaseConfig = {
  apiKey: "YOUR_API_KEY", // REPLACE THIS with your actual apiKey
  authDomain: "YOUR_AUTH_DOMAIN", // REPLACE THIS e.g., your-project-id.firebaseapp.com
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com", // REPLACE THIS e.g., https://your-project-id-default-rtdb.firebaseio.com
  projectId: "YOUR_PROJECT_ID", // REPLACE THIS e.g., your-project-id
  storageBucket: "YOUR_STORAGE_BUCKET", // REPLACE THIS e.g., your-project-id.appspot.com
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID", // REPLACE THIS e.g., 123456789012
  appId: "YOUR_APP_ID" // REPLACE THIS e.g., 1:123456789012:web:abcdef1234567890abcdef
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
