module.exports = function (platform) {
  return { __dirname: platform.outputPath, URLSearchParams };
};
