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
  apiKey: "AIzaSyCpfwRS03gBaRoF_5HuLsDmOgbHBvUIZTU",
  authDomain: "chatchameleon-efe35.firebaseapp.com",
  databaseURL: "https://chatchameleon-efe35-default-rtdb.firebaseio.com", // Added based on projectId
  projectId: "chatchameleon-efe35",
  storageBucket: "chatchameleon-efe35.appspot.com", // Corrected from firebasestorage.app
  messagingSenderId: "1028835741426",
  appId: "1:1028835741426:web:ef1e6aaf7a30aad15b4a6b",
  measurementId: "G-W4K41098XQ"
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
