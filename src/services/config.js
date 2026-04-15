// services/config.js

// 🌐 Backend do DRD-Financeiro (Render)
export const BASE_URL = "https://mp-server-ivda2.onrender.com";

// 💳 Plano padrão usado no Paywall / textos
export const DEFAULT_PLAN = {
  tier: "INDIVIDUAL", // ou "COLABORADORES" se mudar no futuro
  period: "mensal", // "mensal" ou "anual"
  price: 39.9, // usado apenas para exibição no front
};

// 🔓 MODO TESTE INTERNO
// true = libera comportamentos de teste
// false = produção
export const INTERNAL_TEST_MODE = false;
