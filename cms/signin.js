// One-time GitHub sign-in for publishing. Runs `git push` interactively so
// Git Credential Manager can open GitHub's own sign-in page in the browser.
// The login is saved by Windows Credential Manager, never by the CMS.
const { spawnSync } = require('child_process');
const { findGit } = require('./lib/git');
const { SITE_DIR } = require('./lib/build');

const git = findGit();
if (!git) {
  console.error('Git was not found. Install Git for Windows or GitHub Desktop first.');
  process.exit(1);
}
console.log('\nOpening GitHub sign-in (a browser window may appear)...\n');
const r = spawnSync(git, ['push', 'origin', 'HEAD'], {
  cwd: SITE_DIR,
  stdio: 'inherit',
  env: { ...process.env, GCM_INTERACTIVE: 'always' },
});
console.log(r.status === 0
  ? '\nSigned in and up to date. The CMS Publish button will work from now on.\n'
  : '\nSign-in or push did not finish. Try again, or push from GitHub Desktop.\n');
process.exit(r.status || 0);
