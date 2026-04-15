// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // adicione outros plugins aqui (se tiver)
      "react-native-reanimated/plugin",
    ],
  };
};
