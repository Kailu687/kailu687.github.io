// Publishing through git. The CMS never stores GitHub credentials: pushes use
// whatever sign-in git already has on this computer (Git Credential Manager or
// GitHub Desktop). Drafts (cms/content), the dashboard key, the old Website CMS
// folder and secrets are never staged, even if they show up as changed.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { SITE_DIR } = require('./build');

const NEVER_PUBLISH = [/^cms\/content\//, /^cms\/\.key$/, /^Website CMS\//, /^\.claude\//, /(^|\/)\.env/, /(^|\/)node_modules\//, /\.tmp$/];

let gitPath = null;
function findGit() {
  if (gitPath) return gitPath;
  const exe = process.platform === 'win32' ? 'git.exe' : 'git';
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const candidate = path.join(dir, exe);
    if (dir && fs.existsSync(candidate)) return (gitPath = candidate);
  }
  const candidates = [
    'C:\\Program Files\\Git\\cmd\\git.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'cmd', 'git.exe'),
  ];
  const desktop = path.join(process.env.LOCALAPPDATA || '', 'GitHubDesktop');
  if (fs.existsSync(desktop)) {
    const apps = fs.readdirSync(desktop).filter((d) => /^app-[\d.]+$/.test(d))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const a of apps) candidates.push(path.join(desktop, a, 'resources', 'app', 'git', 'cmd', 'git.exe'));
  }
  return (gitPath = candidates.find((c) => fs.existsSync(c)) || null);
}

function git(args, { timeout = 30000 } = {}) {
  const exe = findGit();
  if (!exe) return Promise.reject(new Error('Git was not found on this computer. Install Git for Windows or GitHub Desktop.'));
  return new Promise((resolve, reject) => {
    execFile(exe, args, {
      cwd: SITE_DIR,
      timeout,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    }, (err, stdout, stderr) => {
      if (err) {
        err.message = (stderr || stdout || err.message).trim();
        return reject(err);
      }
      resolve(stdout);
    });
  });
}

const publishable = (file) => !NEVER_PUBLISH.some((re) => re.test(file));

async function status({ fetch = false } = {}) {
  if (!findGit()) return { ok: false, reason: 'Git was not found on this computer. Install Git for Windows or GitHub Desktop.' };
  if (!fs.existsSync(path.join(SITE_DIR, '.git'))) {
    return { ok: false, reason: 'The Portfolio folder is not connected to GitHub yet (it is not a git clone).' };
  }
  if (fetch) await git(['fetch', '--quiet', 'origin']).catch(() => {});
  const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  const remote = (await git(['remote', 'get-url', 'origin']).catch(() => '')).trim();
  let ahead = 0;
  let behind = 0;
  try {
    const counts = (await git(['rev-list', '--left-right', '--count', 'HEAD...@{u}'])).trim().split(/\s+/);
    ahead = Number(counts[0]);
    behind = Number(counts[1]);
  } catch { /* no upstream */ }

  const raw = await git(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const files = [];
  const parts = raw.split('\0').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i].slice(0, 2);
    const file = parts[i].slice(3);
    if (code[0] === 'R' || code[0] === 'C') i++; // skip the rename source
    const state = code === '??' ? 'new' : code.includes('D') ? 'deleted' : 'changed';
    files.push({ file, state, publish: publishable(file) });
  }
  return { ok: true, branch, remote, ahead, behind, files };
}

async function publish({ files, message }) {
  const st = await status({ fetch: true });
  if (!st.ok) throw new Error(st.reason);
  if (st.behind > 0) {
    throw new Error('GitHub has changes this computer does not have yet. Click "Get latest from GitHub" first, then publish.');
  }
  const allowed = new Set(st.files.filter((f) => f.publish).map((f) => f.file));
  const chosen = (files || []).filter((f) => allowed.has(f));
  const log = [];
  if (chosen.length) {
    await git(['add', '-A', '--', ...chosen]);
    const msg = (message || '').trim() || 'Update site content';
    log.push((await git(['commit', '-m', msg, '--', ...chosen])).trim());
  } else if (!st.ahead) {
    throw new Error('Nothing selected to publish.');
  }
  try {
    log.push((await git(['push', 'origin', 'HEAD'], { timeout: 120000 })).trim() || 'Pushed to GitHub.');
    return { pushed: true, log };
  } catch (err) {
    return {
      pushed: false,
      log,
      error: `Saved the changes locally but could not push to GitHub: ${err.message}\n` +
        'Open GitHub Desktop and click "Push origin" to finish publishing.',
    };
  }
}

async function pull() {
  return (await git(['pull', '--ff-only', 'origin'], { timeout: 120000 })).trim();
}

module.exports = { status, publish, pull, findGit };
