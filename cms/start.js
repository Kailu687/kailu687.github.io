// Starts the CMS and restarts it automatically whenever its own code changes,
// so an update to the CMS takes effect without you having to stop and start it.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const WATCH = ['server.js', 'lib', 'templates'].map((p) => path.join(__dirname, p));
let child = null;
let opened = false;
let timer = null;

function start() {
  const args = [path.join(__dirname, 'server.js'), ...process.argv.slice(2)];
  if (opened && !args.includes('--no-open')) args.push('--no-open');
  child = spawn(process.execPath, args, { stdio: 'inherit' });
  opened = true;
  child.on('exit', (code) => {
    if (child && child.restarting) return;
    process.exit(code || 0);
  });
}

function restart() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    console.log('\n  The CMS was updated, restarting it...\n');
    if (!child) return start();
    child.restarting = true;
    child.once('exit', start);
    child.kill();
  }, 400);
}

for (const target of WATCH) {
  try {
    fs.watch(target, { recursive: fs.statSync(target).isDirectory() }, (_, file) => {
      if (file && /\.(js|html|json)$/.test(file)) restart();
    });
  } catch { /* watching is a convenience; carry on without it */ }
}

process.on('SIGINT', () => { if (child) child.kill(); process.exit(0); });
start();
