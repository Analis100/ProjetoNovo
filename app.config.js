import "dotenv/config";

export default ({ config }) => {
  const extraBase = config.extra ?? {};

  return {
    expo: {
      name: "DRD-Financeiro",
      slug: "ProjetoNovo",
      owner: "analistis",

      version: "1.0.13",
      runtimeVersion: "1.0.13",

      orientation: "portrait",
      userInterfaceStyle: "light",
      icon: "./assets/icon.png",

      splash: {
        image: "./assets/splash.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff",
      },

      assetBundlePatterns: ["**/*"],

      plugins: [
        "expo-notifications",
        "expo-updates",
        "expo-mail-composer",
        "expo-web-browser",
        "expo-secure-store",
      ],

      android: {
        package: "com.diario.drdfinanceiro",
        versionCode: 35,
        permissions: ["POST_NOTIFICATIONS"],
        adaptiveIcon: {
          foregroundImage: "./assets/adaptive-icon.png",
          backgroundColor: "#ffffff",
        },
        googleServicesFile: "./google-services.json",
      },

      ios: {
        bundleIdentifier: "com.diario.drdfinanceiro",
        supportsTablet: true,
        googleServicesFile: "./GoogleService-Info.plist",
        infoPlist: {
          ITSAppUsesNonExemptEncryption: false,
          NSUserNotificationUsageDescription:
            "O DRD-Financeiro usa notificações para lembrar vencimentos, compromissos e movimentações importantes.",
        },
      },

      updates: {
        url: "https://u.expo.dev/b1f0b01e-d335-44f3-8fd4-bcf7b7a9239f",
      },

      extra: {
        ...extraBase,
        eas: {
          projectId: "b1f0b01e-d335-44f3-8fd4-bcf7b7a9239f",
        },
      },
    },
  };
};
