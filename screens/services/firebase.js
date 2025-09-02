// services/firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 🔽 cole aqui exatamente os valores que o Console mostrou pra você
const firebaseConfig = {
  apiKey: "SUA_API_KEY_AQUI",
  authDomain: "SEU_AUTH_DOMAIN_AQUI",
  projectId: "SEU_PROJECT_ID_AQUI",
  storageBucket: "SEU_STORAGE_BUCKET_AQUI",
  messagingSenderId: "SEU_MESSAGING_SENDER_ID_AQUI",
  appId: "SEU_APP_ID_AQUI",
};

// evita erro: Firebase App '[DEFAULT]' already exists (Fast Refresh)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
