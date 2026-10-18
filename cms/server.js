// Portfolio CMS: a private dashboard that runs only on this computer.
// Start it with `npm run cms` (or `node server.js`) inside the cms folder.
//
// Security model
//   - Listens on 127.0.0.1 only, so nothing else on the network can reach it.
//   - Every request needs a secret key cookie, set by opening the link printed
//     at start-up. Other websites open in your browser cannot use the API
//     (SameSite=Strict cookie, Host and Origin checks).
//   - Uploads are limited to image and video types, checked by content.
//   - No GitHub token is stored; publishing uses git's own sign-in.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const content = require('./lib/content');
const { build, renderPage, SITE_DIR } = require('./lib/build');
const { sanitize } = require('./lib/sanitize');
const git = require('./lib/git');
const home = require('./lib/home');

const PORT = Number(process.env.CMS_PORT) || 4321;
const ADMIN_DIR = path.join(__dirname, 'admin');
const KEY_FILE = path.join(__dirname, '.key');
const UPLOAD_DIR = path.join(SITE_DIR, 'Images');
const MAX_JSON = 5 * 1024 * 1024;
const MAX_UPLOAD = 60 * 1024 * 1024;

const KEY = (() => {
  try {
    const k = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (/^[a-f0-9]{48}$/.test(k)) return k;
  } catch { /* first run */ }
  const k = crypto.randomBytes(24).toString('hex');
  fs.writeFileSync(KEY_FILE, k + '\n', { mode: 0o600 });
  return k;
})();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.xml': 'application/xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf', '.woff2': 'font/woff2',
};

// Uploads: allowed extensions and the bytes each file type must start with.
const UPLOAD_TYPES = {
  '.png': (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  '.jpg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  '.jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  '.gif': (b) => b.slice(0, 4).toString('latin1') === 'GIF8',
  '.webp': (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP',
  '.mp4': (b) => b.slice(4, 8).toString('latin1') === 'ftyp',
  '.webm': (b) => b.slice(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
  '.pdf': (b) => b.slice(0, 5).toString('latin1') === '%PDF-',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

function send(res, status, body, type = 'application/json') {
  const data = type === 'application/json' ? JSON.stringify(body) : body;
  res.writeHead(status, { 'Content-Type': type, ...SECURITY_HEADERS });
  res.end(data);
}

function fail(res, err) {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  send(res, status, { error: err.message || 'Something went wrong' });
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(content.httpError(413, 'That file is too large.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req, MAX_JSON);
  try { return JSON.parse(buf.toString('utf8') || '{}'); } catch { throw content.httpError(400, 'Bad request'); }
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function serveFile(res, file, extraHeaders = {}) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found', 'text/plain');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, ...SECURITY_HEADERS, ...extraHeaders });
    fs.createReadStream(file).pipe(res);
  });
}

// Resolve a URL path inside root, refusing anything that escapes it or is private.
function within(root, urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
  if (/(^|[\\/])(\.|cms([\\/]|$)|Website CMS([\\/]|$)|node_modules)/i.test(rel)) return null;
  const full = path.resolve(root, rel);
  return full.startsWith(path.resolve(root) + path.sep) ? full : null;
}

// PDFs (reports, papers) go in files/; images and videos in Images/uploads/.
const uploadFolder = (ext) => (ext === '.pdf'
  ? { dir: path.join(SITE_DIR, 'files'), web: 'files' }
  : { dir: path.join(UPLOAD_DIR, 'uploads'), web: 'Images/uploads' });

function safeUploadName(name) {
  const ext = path.extname(name).toLowerCase();
  if (!UPLOAD_TYPES[ext]) {
    throw content.httpError(400, 'Only PNG, JPG, GIF, WebP, MP4, WebM and PDF files can be uploaded.');
  }
  const base = path.basename(name, path.extname(name))
    .normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'image';
  let candidate = `${base}${ext}`;
  for (let n = 2; fs.existsSync(path.join(uploadFolder(ext).dir, candidate)); n++) candidate = `${base}-${n}${ext}`;
  return candidate;
}

function listImages() {
  const out = [];
  const walk = (dir, rel) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.name.startsWith('.')) continue;
      if (f.isDirectory()) walk(path.join(dir, f.name), `${rel}${f.name}/`);
      else if (/\.(png|jpe?g|gif|webp|mp4|webm)$/i.test(f.name) && !/^favicon/i.test(f.name)) {
        out.push({ path: `Images/${rel}${f.name}`, size: fs.statSync(path.join(dir, f.name)).size });
      }
    }
  };
  walk(UPLOAD_DIR, '');
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// Quick checks over the public pages, shown on the dashboard.
function health() {
  const site = content.readSite();
  const pages = fs.readdirSync(SITE_DIR).filter((f) => f.endsWith('.html'));
  const noGa = [];
  const noDesc = [];
  const broken = new Set();
  let missingAlt = 0;
  for (const page of pages) {
    const html = fs.readFileSync(path.join(SITE_DIR, page), 'utf8');
    if (site.gaId && !html.includes(`gtag('config', '${site.gaId}')`) && !html.includes(`gtag("config", "${site.gaId}")`)) noGa.push(page);
    if (!/<meta\s+name="description"\s+content="[^"]+"/i.test(html)) noDesc.push(page);
    missingAlt += (html.match(/<img\b(?![^>]*\balt=)[^>]*>/gi) || []).length;
    for (const m of html.matchAll(/\b(?:href|src|poster)="([^"]+)"/g)) {
      const ref = m[1];
      if (/^([a-z][a-z0-9+.-]*:|#|\/\/|data:)/i.test(ref) || ref.includes('${')) continue;
      let rel;
      try { rel = decodeURIComponent(ref.split(/[?#]/)[0]); } catch { rel = ref; }
      if (rel && !fs.existsSync(path.join(SITE_DIR, rel.replace(/^\//, '')))) broken.add(`${page} → ${rel}`);
    }
  }
  const list = (arr) => arr.slice(0, 4).join(', ') + (arr.length > 4 ? ` and ${arr.length - 4} more` : '');
  const checks = [
    { ok: !noGa.length, text: noGa.length ? `Analytics tag missing on ${list(noGa)}` : `Analytics tag on all ${pages.length} pages` },
    { ok: !noDesc.length, text: noDesc.length ? `No search description on ${list(noDesc)}` : 'Every page has a search description' },
    { ok: !broken.size, text: broken.size ? `Broken links or images: ${list([...broken])}` : 'No broken links or images' },
    { ok: !missingAlt, text: missingAlt ? `${missingAlt} image${missingAlt > 1 ? 's have' : ' has'} no alt text` : 'All images have alt text' },
    { ok: fs.existsSync(path.join(SITE_DIR, 'sitemap.xml')), text: fs.existsSync(path.join(SITE_DIR, 'sitemap.xml')) ? 'Sitemap is up to date' : 'No sitemap yet (one is made on your next save)' },
  ];
  return { checks };
}

function cleanEntryInput(body) {
  const pick = (k, max = 300) => (typeof body[k] === 'string' ? body[k].slice(0, max) : undefined);
  const data = {
    title: pick('title', 160),
    summary: pick('summary', 600),
    subtitle: pick('subtitle', 160),
    tags: (Array.isArray(body.tags) ? body.tags.join(', ') : pick('tags', 200) || '')
      .split(',').map((t) => t.trim().replace(/[\r\n]/g, '')).filter(Boolean).slice(0, 6).join(', '),
    date: /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : '',
    status: content.STATUSES.includes(body.status) ? body.status : 'draft',
    order: Number.isFinite(Number(body.order)) && body.order !== '' && body.order !== null ? String(Number(body.order)) : '',
    cover: pick('cover'),
    coverAlt: pick('coverAlt', 200),
    logo: pick('logo'),
    logoAlt: pick('logoAlt', 200),
    seoTitle: pick('seoTitle', 120),
    description: pick('description', 320),
    body: sanitize(typeof body.body === 'string' ? body.body : ''),
  };
  if (!data.title || !data.title.trim()) throw content.httpError(400, 'Give it a title first.');
  return data;
}

function rebuild() {
  try { return build(); } catch (err) { console.error(err); return { error: err.message }; }
}

function overview() {
  const site = content.readSite();
  const strip = ({ body, ...rest }) => rest;
  return {
    site,
    projects: content.list('projects').map(strip),
    blog: content.list('blog').map(strip),
  };
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const [resource, type, slug] = parts;
  const m = req.method;

  if (resource === 'overview' && m === 'GET') return send(res, 200, overview());

  if (resource === 'entry') {
    if (m === 'GET' && slug) return send(res, 200, content.get(type, slug));
    if (m === 'POST' && type && !slug) {
      const body = await readJson(req);
      const newSlug = String(body.slug || '').trim().toLowerCase();
      content.assertSlug(newSlug);
      const entry = content.save(type, newSlug, cleanEntryInput(body), { isNew: true });
      return send(res, 201, { entry, build: rebuild() });
    }
    if (m === 'PUT' && slug) {
      const entry = content.save(type, slug, cleanEntryInput(await readJson(req)));
      return send(res, 200, { entry, build: rebuild() });
    }
    if (m === 'DELETE' && slug) {
      content.remove(type, slug);
      return send(res, 200, { build: rebuild() });
    }
  }

  if (resource === 'site') {
    if (m === 'GET') return send(res, 200, content.readSite());
    if (m === 'PUT') {
      const site = content.writeSite(await readJson(req));
      return send(res, 200, { site, build: rebuild() });
    }
  }

  if (resource === 'home') {
    if (m === 'GET') return send(res, 200, home.read() || {});
    if (m === 'PUT') {
      const saved = home.write(await readJson(req));
      return send(res, 200, { home: saved, build: rebuild() });
    }
  }

  if (resource === 'images' && m === 'GET') return send(res, 200, listImages());

  if (resource === 'health' && m === 'GET') return send(res, 200, health());

  if (resource === 'upload' && m === 'POST') {
    const name = safeUploadName(url.searchParams.get('name') || '');
    const buf = await readBody(req, MAX_UPLOAD);
    if (!UPLOAD_TYPES[path.extname(name)](buf)) {
      throw content.httpError(400, "That file's contents don't match its type, so it wasn't uploaded.");
    }
    const folder = uploadFolder(path.extname(name));
    fs.mkdirSync(folder.dir, { recursive: true });
    fs.writeFileSync(path.join(folder.dir, name), buf);
    return send(res, 201, { path: `${folder.web}/${name}`, size: buf.length });
  }

  if (resource === 'build' && m === 'POST') return send(res, 200, rebuild());

  if (resource === 'publish') {
    if (m === 'GET') return send(res, 200, await git.status({ fetch: url.searchParams.has('fetch') }));
    if (m === 'POST') {
      const body = await readJson(req);
      const built = rebuild();
      if (built.error) throw content.httpError(500, `The site could not be built: ${built.error}`);
      return send(res, 200, await git.publish({ files: body.files, message: body.message }));
    }
  }

  if (resource === 'pull' && m === 'POST') {
    const out = await git.pull();
    return send(res, 200, { log: out, build: rebuild() });
  }

  send(res, 404, { error: 'Not found' });
}

function preview(res, type, slug) {
  const entry = content.get(type, slug);
  const html = renderPage(entry, content.readSite(), { preview: true })
    .replace('<head>', '<head>\n<base href="/site/">');
  send(res, 200, html, 'text/html; charset=utf-8');
}

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || '';
    if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) return send(res, 421, 'Wrong host', 'text/plain');
    const url = new URL(req.url, `http://${host}`);

    if (url.searchParams.has('key')) {
      if (!safeEqual(url.searchParams.get('key'), KEY)) return send(res, 403, 'That link is out of date. Use the one shown when the CMS started.', 'text/plain');
      res.writeHead(302, {
        'Set-Cookie': `cms_key=${KEY}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`,
        Location: url.pathname,
        ...SECURITY_HEADERS,
      });
      return res.end();
    }

    if (!safeEqual(cookies(req).cms_key || '', KEY)) {
      return send(res, 401, '<!doctype html><meta charset="utf-8"><title>Portfolio CMS</title><body style="background:#000814;color:#d7eaf6;font:16px Inter,system-ui;padding:40px">' +
        '<h1 style="color:#fff">Portfolio CMS is locked</h1><p>Open the link printed in the terminal when you ran <code>npm run cms</code>.</p>', 'text/html; charset=utf-8');
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.origin;
      if (origin && origin !== `http://${host}`) return send(res, 403, { error: 'Cross-site request blocked' });
      if (req.headers['x-cms'] !== '1') return send(res, 403, { error: 'Missing CMS header' });
    }

    const p = url.pathname;
    if (p.startsWith('/api/')) return await api(req, res, url);
    if (p === '/' || p === '/index.html') return serveFile(res, path.join(ADMIN_DIR, 'index.html'));
    if (p.startsWith('/admin/')) {
      const f = within(ADMIN_DIR, p.slice('/admin/'.length));
      return f ? serveFile(res, f) : send(res, 404, 'Not found', 'text/plain');
    }
    const pv = p.match(/^\/preview\/(projects|blog)\/([a-z0-9_-]+)$/);
    if (pv) return preview(res, pv[1], pv[2]);
    // The editor shows images with the same relative paths the site uses.
    if (p.startsWith('/files/')) {
      const f = within(path.join(SITE_DIR, 'files'), p.slice('/files/'.length));
      return f ? serveFile(res, f) : send(res, 404, 'Not found', 'text/plain');
    }
    if (p.startsWith('/Images/')) {
      const f = within(UPLOAD_DIR, p.slice('/Images/'.length));
      return f ? serveFile(res, f) : send(res, 404, 'Not found', 'text/plain');
    }
    if (p === '/site' || p === '/site/') return serveFile(res, path.join(SITE_DIR, 'index.html'));
    if (p.startsWith('/site/')) {
      const f = within(SITE_DIR, p.slice('/site/'.length));
      return f ? serveFile(res, f) : send(res, 404, 'Not found', 'text/plain');
    }
    send(res, 404, 'Not found', 'text/plain');
  } catch (err) {
    fail(res, err);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const link = `http://127.0.0.1:${PORT}/?key=${KEY}`;
  console.log('\n  Portfolio CMS is running on this computer only.');
  console.log(`  Open: ${link}\n`);
  console.log('  Press Ctrl+C to stop it.\n');
  if (!process.argv.includes('--no-open')) {
    if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', link], { windowsHide: true });
    else execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [link]);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is busy. The CMS may already be running; otherwise set CMS_PORT to another number.\n`);
    process.exit(1);
  }
  throw err;
});
