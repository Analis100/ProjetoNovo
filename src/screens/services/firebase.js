// src/screens/services/firebase.js

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // 👈 ADICIONAR

// 🔥 Configuração do Firebase (do seu projeto)
const firebaseConfig = {
  apiKey: "AIZaSyAZahVM6uNn1xZLepYa04s9ymxkYBBLfc",
  authDomain: "drd-empresarial.firebaseapp.com",
  projectId: "drd-empresarial",
  storageBucket: "drd-empresarial.appspot.com",
  messagingSenderId: "289236610506",
  appId: "1:289236610506:web:7b554de2962a54232db333",
};

// 🚀 Inicializa a instância do Firebase
const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
// 🔥 NOVO
export const storage = getStorage(app);
