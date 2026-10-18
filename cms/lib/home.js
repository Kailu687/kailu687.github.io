// Home page content (content/home.json) and how it is written into index.html.
// Only the parts between <!-- cms:NAME:start --> and <!-- cms:NAME:end --> markers,
// plus the page title and descriptions in <head>, are ever changed.

const fs = require('fs');
const path = require('path');
const { escapeHtml } = require('./markdown');
const { sanitize } = require('./sanitize');
const { httpError, CONTENT_DIR } = require('./content');

const FILE = path.join(CONTENT_DIR, 'home.json');
const attr = (s) => escapeHtml(s || '');
// JSON inside a single-quoted HTML attribute.
const jsonAttr = (v) => JSON.stringify(v).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;');

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return null; }
}

const str = (v, max) => (typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, max) : '');
const list = (v, max, maxLen) => (Array.isArray(v) ? v : String(v || '').split('\n'))
  .map((s) => str(s, maxLen)).filter(Boolean).slice(0, max);

function safeLink(u) {
  const url = str(u, 300);
  if (!url) return '';
  if (/^(https?:\/\/|mailto:|tel:\+?[\d\s()-]+$)/i.test(url)) return url;
  if (/^[\w./#-]+$/.test(url) && !/^\/\//.test(url)) return url; // a page on the site, like project_nimbus.html
  throw httpError(400, `"${url}" isn't a link the site can use. Start it with https://, mailto: or tel:.`);
}

function write(data) {
  const home = {
    pageTitle: str(data.pageTitle, 120),
    description: str(data.description, 320),
    shareDescription: str(data.shareDescription, 320),
    eyebrow: str(data.eyebrow, 160),
    typing: list(data.typing, 12, 120),
    lead: str(data.lead, 400),
    loader: list(data.loader, 10, 60),
    about: sanitize(typeof data.about === 'string' ? data.about : ''),
    interests: list(Array.isArray(data.interests) ? data.interests : String(data.interests || '').split(','), 20, 40),
    contactIntro: str(data.contactIntro, 300),
    contacts: (Array.isArray(data.contacts) ? data.contacts : []).slice(0, 12)
      .map((c) => ({ label: str(c.label, 30), text: str(c.text, 120), link: safeLink(c.link) }))
      .filter((c) => c.label || c.text),
  };
  if (!home.typing.length) throw httpError(400, 'Add at least one typing phrase.');
  fs.writeFileSync(FILE, JSON.stringify(home, null, 2) + '\n', 'utf8');
  return home;
}

function regions(home) {
  const pad = '          ';
  const first = home.typing[0] || '';
  return {
    loader: `<div id="terminal-text" data-lines='${jsonAttr(home.loader)}'></div>`,
    hero: [
      '',
      `${pad}<p class="eyebrow">${attr(home.eyebrow)}</p>`,
      `${pad}<h1 id="hero-heading">`,
      `${pad}  <span class="sr-only">${attr(first)}</span>`,
      `${pad}  <span id="typing" aria-hidden="true" data-phrases='${jsonAttr(home.typing)}'></span><span class="cursor" aria-hidden="true">|</span>`,
      `${pad}</h1>`,
      home.lead ? `${pad}<p class="lead">${attr(home.lead)}</p>` : '',
      pad,
    ].filter((l, i, a) => l !== '' || i === 0 || i === a.length - 1).join('\n'),
    about: [
      '',
      `        ${sanitize(home.about)}`,
      home.interests.length
        ? `        <ul class="chips" aria-label="Interests">\n${home.interests.map((t) => `          <li class="tag">${attr(t)}</li>`).join('\n')}\n        </ul>`
        : '',
      '        ',
    ].join('\n'),
    contact: [
      '',
      home.contactIntro ? `        <p>${attr(home.contactIntro)}</p>` : '',
      '        <ul class="contact-list">',
      ...home.contacts.map((c) => {
        const external = /^https?:/i.test(c.link);
        const inner = `<span class="label">${attr(c.label)}</span>${attr(c.text)}`;
        return c.link
          ? `          <li><a href="${attr(c.link)}"${external ? ' target="_blank" rel="noopener"' : ''}>${inner}</a></li>`
          : `          <li><span>${inner}</span></li>`;
      }),
      '        </ul>',
      '        ',
    ].join('\n'),
  };
}

function replaceBetween(html, name, inner) {
  const start = `<!-- cms:${name}:start -->`;
  const end = `<!-- cms:${name}:end -->`;
  const s = html.indexOf(start);
  const e = html.indexOf(end);
  if (s === -1 || e < s) return html;
  return html.slice(0, s + start.length) + inner + html.slice(e);
}

function apply(html) {
  const home = read();
  if (!home) return html;
  for (const [name, inner] of Object.entries(regions(home))) html = replaceBetween(html, name, inner);
  const setMeta = (re, value) => { if (value) html = html.replace(re, (m, a, b) => `${a}${attr(value)}${b}`); };
  setMeta(/(<title>)[^<]*(<\/title>)/, home.pageTitle);
  setMeta(/(<meta name="description" content=")[^"]*(">)/, home.description);
  setMeta(/(<meta property="og:title" content=")[^"]*(">)/, home.pageTitle);
  setMeta(/(<meta property="og:description" content=")[^"]*(">)/, home.shareDescription || home.description);
  return html;
}

module.exports = { read, write, apply };
