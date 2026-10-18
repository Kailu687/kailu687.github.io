// Content storage: each project or post is one file in content/<type>/<slug>.html
// (or .md) with a small "key: value" header between --- lines, then the body.

const fs = require('fs');
const path = require('path');

const CONTENT_DIR = path.join(__dirname, '..', 'content');
const TYPES = ['projects', 'blog'];
const STATUSES = ['draft', 'coming-soon', 'published'];
const FIELDS = ['title', 'summary', 'subtitle', 'tags', 'date', 'status', 'order', 'cover', 'coverAlt', 'logo', 'logoAlt', 'seoTitle', 'description'];
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/;
// Slugs become top-level page names, so keep them clear of the site's own files.
const RESERVED = new Set(['index', '404', 'admin', 'cms', 'images', 'script', 'styles']);

function assertType(type) {
  if (!TYPES.includes(type)) throw httpError(400, `Unknown content type "${type}"`);
}

function assertSlug(slug) {
  if (!SLUG_RE.test(slug) || RESERVED.has(slug)) {
    throw httpError(400, 'Use lowercase letters, numbers, - or _ for the page address (for example "securebeam").');
  }
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function parse(raw) {
  const text = raw.replace(/^ï»¿/, '').replace(/\r\n?/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = {};
  if (m) {
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^([a-zA-Z]+):\s*(.*)$/);
      if (kv) meta[kv[1]] = kv[2].trim();
    }
  }
  return { meta, body: m ? text.slice(m[0].length) : text };
}

function serialize(meta, body) {
  const head = FIELDS
    .filter((k) => meta[k] !== undefined && meta[k] !== '')
    .map((k) => `${k}: ${String(meta[k]).replace(/[\r\n]+/g, ' ').trim()}`)
    .join('\n');
  return `---\n${head}\n---\n${body.trim()}\n`;
}

function normalize(type, slug, meta, body, format) {
  return {
    type,
    slug,
    format,
    title: meta.title || slug,
    summary: meta.summary || '',
    subtitle: meta.subtitle || '',
    tags: (meta.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
    date: meta.date || '',
    status: STATUSES.includes(meta.status) ? meta.status : 'draft',
    order: meta.order !== undefined && meta.order !== '' ? Number(meta.order) : null,
    cover: meta.cover || '',
    coverAlt: meta.coverAlt || '',
    logo: meta.logo || '',
    logoAlt: meta.logoAlt || '',
    seoTitle: meta.seoTitle || '',
    description: meta.description || '',
    body,
  };
}

function fileFor(type, slug) {
  for (const ext of ['.html', '.md']) {
    const f = path.join(CONTENT_DIR, type, slug + ext);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

function list(type) {
  assertType(type);
  const dir = path.join(CONTENT_DIR, type);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /\.(html|md)$/.test(f))
    .map((f) => {
      const slug = f.replace(/\.(html|md)$/, '');
      const { meta, body } = parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      return normalize(type, slug, meta, body, path.extname(f).slice(1));
    })
    .sort(compareEntries);
}

function compareEntries(a, b) {
  const ao = a.order ?? Infinity;
  const bo = b.order ?? Infinity;
  if (ao !== bo) return ao - bo;
  return (b.date || '').localeCompare(a.date || '') || a.title.localeCompare(b.title);
}

function get(type, slug) {
  assertType(type);
  assertSlug(slug);
  const f = fileFor(type, slug);
  if (!f) throw httpError(404, 'Not found');
  const { meta, body } = parse(fs.readFileSync(f, 'utf8'));
  return normalize(type, slug, meta, body, path.extname(f).slice(1));
}

function save(type, slug, data, { isNew = false } = {}) {
  assertType(type);
  assertSlug(slug);
  const existing = fileFor(type, slug);
  if (isNew) {
    const clash = TYPES.some((t) => fileFor(t, slug));
    if (clash) throw httpError(409, `Something called "${slug}" already exists. Pick another page address.`);
  } else if (!existing) {
    throw httpError(404, 'Not found');
  }
  const file = existing || path.join(CONTENT_DIR, type, `${slug}.html`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (existing) backup(existing);
  const meta = {};
  for (const k of FIELDS) if (data[k] !== undefined && data[k] !== null) meta[k] = data[k];
  if (!STATUSES.includes(meta.status)) meta.status = 'draft';
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, serialize(meta, data.body || ''), 'utf8');
  fs.renameSync(tmp, file);
  return get(type, slug);
}

// Deleting moves the file into content/.trash so nothing is lost by a misclick.
function remove(type, slug) {
  assertType(type);
  assertSlug(slug);
  const f = fileFor(type, slug);
  if (!f) throw httpError(404, 'Not found');
  const trash = path.join(CONTENT_DIR, '.trash');
  fs.mkdirSync(trash, { recursive: true });
  fs.renameSync(f, path.join(trash, `${type}-${stamp()}-${path.basename(f)}`));
}

// Keep the last 20 saved versions of each file in content/.history.
function backup(file) {
  const dir = path.join(CONTENT_DIR, '.history');
  fs.mkdirSync(dir, { recursive: true });
  const base = `${path.basename(path.dirname(file))}-${path.basename(file)}`;
  fs.copyFileSync(file, path.join(dir, `${stamp()}-${base}`));
  const old = fs.readdirSync(dir).filter((f) => f.endsWith(base)).sort();
  for (const f of old.slice(0, Math.max(0, old.length - 20))) fs.unlinkSync(path.join(dir, f));
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
}

function readSite() {
  return JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'site.json'), 'utf8'));
}

function writeSite(data) {
  const current = readSite();
  const allowed = ['siteUrl', 'author', 'gaId', 'brand', 'brandSubtitle', 'description'];
  for (const k of allowed) if (typeof data[k] === 'string') current[k] = data[k].trim();
  fs.writeFileSync(path.join(CONTENT_DIR, 'site.json'), JSON.stringify(current, null, 2) + '\n', 'utf8');
  return current;
}

module.exports = {
  TYPES, STATUSES, CONTENT_DIR, list, get, save, remove, readSite, writeSite, httpError, assertSlug,
};

