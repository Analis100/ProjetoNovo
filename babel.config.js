// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Adicione outros plugins aqui se precisar (ex: 'module-resolver')
      "react-native-reanimated/plugin", // ⚡ Sempre por último!
    ],
  };
};
