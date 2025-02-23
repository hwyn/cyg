const path = require('path');
const treeKill = require('tree-kill');
const { spawn } = require('child_process');

let cp;
const env = { NODE_ENV: 'development', env: process.env, PATH: path.join(process.cwd(), `/node_modules/.bin:${process.env.PATH}`) };

const stdioPipe = (cp, pro) => {
  const stdio = (fnName) => (callback) => cp[fnName].on('data', (data) => pro[fnName].write(callback ? callback(data) || data : data));
  return {
    stdout: stdio('stdout'),
    stderr: stdio('stderr'),
  };
};

function hotHandler() {
  if (cp) treeKill(cp.pid);
  cp = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'electron .'], env);
  const stdio = stdioPipe(cp, process);
  stdio.stdout();
  stdio.stderr();
}

module.exports = function (platform) {
  const { electron } = platform.configurations;
  return { ...electron ? { hotHandler } : {}, __dirname: platform.sourceRoot, URLSearchParams };
};
