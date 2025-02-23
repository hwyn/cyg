const fs = require('fs');
const path = require('path');
const { serializableAssets } = require('@hwy-fm/core/micro');

const microName = 'record-root';
const chromeOutput = path.join(process.cwd(), 'chrome-extension');
const extensionPwd = path.join(process.cwd(), 'src/record/chrome-extension');

const assets = JSON.parse(fs.readFileSync(path.join(chromeOutput, 'static/assets.json'), 'utf-8'));
const staticAssets = serializableAssets(assets, ['main', 'timeout']);

const shadBox = { document: null, window: null, global: null, self: null };
const formatSourceCode = (source) => {
  return `${Object.keys(shadBox).map((k) => `var ${k}=shadBox.${k};`).join('')}var setTimeout=window.setTimeout;${source}\n`;
}

const linkToStyles = staticAssets.links.map((link) => fs.readFileSync(path.join(chromeOutput, link), 'utf-8'));

const funNames = [];
const jsNames = [];
staticAssets.js.forEach((js) => {
  const source = formatSourceCode(fs.readFileSync(path.join(chromeOutput, js), 'utf-8'));
  const funName = `__symbol__${microName.replace(/[\s|-]+/g, '')}_45757`;
  const jsName = js.replace(/([^\.]+).js$/, 'extension.$1.js');
  fs.writeFileSync(path.join(chromeOutput, jsName), `window.${funName}=function(shadBox, microStore, fetchCacheData){${source}}`);
  funNames.push(funName);
  jsNames.push(jsName);
});

if (!fs.existsSync(chromeOutput)) fs.mkdirSync(chromeOutput);
const template = fs.readFileSync(path.join(extensionPwd, 'chrome-cache.template'), 'utf-8')
  .replace('{{linkToStyles}}', JSON.stringify(linkToStyles))
  .replace('{{staticAssets}}', JSON.stringify({ ...staticAssets, funNames: funNames }));

const manifest = fs.readFileSync(path.join(extensionPwd, 'manifest.template'), 'utf-8')
  .replace('{{content_scripts}}', JSON.stringify(['javascript/chrome-cache.js', '/javascript/di.dll.js', '/javascript/record.dll.js', ...jsNames, ...assets.main.js]))
  .replace('{{timeout_scripts}}', JSON.stringify(['/javascript/di.dll.js', ...assets.timeout.js]));

fs.writeFileSync(path.join(chromeOutput, 'manifest.json'), manifest);
fs.writeFileSync(path.join(chromeOutput, 'javascript/chrome-cache.js'), template);
fs.copyFileSync(path.join(extensionPwd, 'background.js'), path.join(chromeOutput, 'background.js'));