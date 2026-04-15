// screens/services/paymentsConfig.js

// 🔑 Chave PIX
export const PIX_KEY = "appdemonst@gmail.com";

// 🔗 Links Mercado Pago (coloque os checkouts reais)
// Mensal
export const MP_LINK_INDIVIDUAL_MENSAL = "https://mpago.la/1gM50bK"; // R$ 34,90
export const MP_LINK_COLABORADORES_MENSAL = "https://mpago.la/2JiquaH"; // R$ 49,90

// Anual (configure no Mercado Pago para permitir até 3x no cartão)
export const MP_LINK_INDIVIDUAL_ANUAL = "https://mpago.la/abc123"; // R$ 349,00 em até 3x
export const MP_LINK_COLABORADORES_ANUAL = "https://mpago.la/def456"; // R$ 499,00 em até 3x

// 💰 Preços para exibir no app
// screens/services/paymentsConfig.js

export const PRECO = {
  INDIVIDUAL: {
    mensal: 39.9, // R$ 39,90
    anual: 478.8, // 39,90 x 12 = 478,80
  },
  COLABORADORES: {
    mensal: 49.9, // R$ 49,90
    anual: 598.8, // 49,90 x 12 = 598,80
  },
};
