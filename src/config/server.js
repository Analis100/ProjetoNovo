// src/config/server.js
const PROD = "https://mp-server-ivda.onrender.com"; // ⬅️ sua URL do Render
const DEV = "http://localhost:3001";

// Use isto no app:
export const SERVER_URL =
  typeof __DEV__ !== "undefined" && __DEV__ ? DEV : PROD;

// Se quiser forçar produção sempre (mesmo em dev), troque por:
// export const SERVER_URL = PROD;
