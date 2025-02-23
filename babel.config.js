module.exports = function config(api) {
  api.cache(true);
  return {
    plugins: [
      ["@babel/plugin-transform-runtime"]
    ],
    sourceMaps: "inline",
    retainLines: true,
    overrides: [
      {
        test: /\.(tsx)$/,
        presets: [
          [
            "@babel/preset-react",
            {
              development: !process.argv.includes('--prod'),
              useBuiltIns: true,
              runtime: "automatic",
            },
          ],
        ]
      }
    ]
  };
};
