// Released products (content/products.json) and the Products card grid in index.html.
// A product is a link to its own site, like kailashamarnath.me/Aurora/, so it has
// no generated page; only the cards between <!-- cms:products:start/end --> change.

const fs = require('fs');
const path = require('path');
const { escapeHtml } = require('./markdown');
const { httpError, CONTENT_DIR } = require('./content');

const FILE = path.join(CONTENT_DIR, 'products.json');
const STATUSES = ['released', 'coming-soon', 'hidden'];
const attr = (s) => escapeHtml(s || '');
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, max) : '');

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return null; }
}

// https:// links, or a path on this site (Aurora/, Images/x.png).
function safeUrl(u, what) {
  const url = str(u, 300);
  if (!url) return '';
  if (/^https?:\/\/[^\s"'<>]+$/i.test(url)) return url;
  if (/^[\w./#%-]+$/.test(url) && !/^\/\//.test(url) && !/\.\./.test(url)) return url;
  throw httpError(400, `"${url}" isn't a ${what} the site can use. Start it with https://.`);
}

function write(data) {
  const products = (Array.isArray(data.products) ? data.products : []).slice(0, 30).map((p) => ({
    name: str(p.name, 80),
    summary: str(p.summary, 400),
    link: safeUrl(p.link, 'link'),
    tags: (Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(','))
      .map((t) => str(t, 30)).filter(Boolean).slice(0, 3),
    icon: safeUrl(p.icon, 'picture'),
    cta: str(p.cta, 40),
    status: STATUSES.includes(p.status) ? p.status : 'released',
  })).filter((p) => p.name);
  const missing = products.find((p) => p.status === 'released' && !p.link);
  if (missing) throw httpError(400, `Add a link for ${missing.name}, or set it to Coming soon.`);
  const out = { products };
  fs.writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
  return out;
}

const encodePath = (p) => (/^https?:/i.test(p) ? p : p.split('/').map((s) => {
  try { return encodeURIComponent(decodeURIComponent(s)); } catch { return encodeURIComponent(s); }
}).join('/'));

function cardsHtml(list) {
  const pad = '          ';
  const shown = list.filter((p) => p.status !== 'hidden');
  if (!shown.length) return `\n${pad}<p class="muted">Products coming soon.</p>\n${pad}`;
  const cards = shown.map((p) => {
    const icon = p.icon ? `<img class="product-icon" src="${attr(encodePath(p.icon))}" alt="" width="56" height="56" loading="lazy">` : '';
    const tags = p.status === 'coming-soon'
      ? '<span class="tag muted">Coming soon</span>'
      : p.tags.map((t, i) => `<span class="tag${i ? ' muted' : ''}">${attr(t)}</span>`).join('');
    const head = `\n${pad}  <div class="product-head">${icon}<div>${tags ? `<div class="tag-row">${tags}</div>` : ''}<h3>${attr(p.name)}</h3></div></div>`;
    const summary = p.summary ? `\n${pad}  <p>${attr(p.summary)}</p>` : '';
    if (p.status === 'coming-soon' || !p.link) {
      return `<div class="project-card product-card is-soon">${head}${summary}\n${pad}</div>`;
    }
    return `<a href="${attr(encodePath(p.link))}" class="project-card product-card">${head}${summary}\n${pad}  <span class="card-cta">${attr(p.cta || `Open ${p.name}`)} →</span>\n${pad}</a>`;
  });
  return `\n${pad}` + cards.join(`\n${pad}`) + `\n${pad}`;
}

function apply(html) {
  const data = read();
  if (!data) return html;
  const start = '<!-- cms:products:start -->';
  const end = '<!-- cms:products:end -->';
  const s = html.indexOf(start);
  const e = html.indexOf(end);
  if (s === -1 || e < s) return html;
  return html.slice(0, s + start.length) + cardsHtml(data.products || []) + html.slice(e);
}

module.exports = { read, write, apply, STATUSES };
