// Turns content files into the public static site:
//   - one <slug>.html page per published project or post
//   - the Projects and Blog card grids inside index.html
//   - sitemap.xml
// Only files this generator wrote (marked with its generator meta tag) are
// ever overwritten or removed, so hand-written pages are never clobbered.

const fs = require('fs');
const path = require('path');
const content = require('./content');
const { render, escapeHtml } = require('./markdown');
const { sanitize } = require('./sanitize');
const { enhance } = require('./media');

// CMS_SITE_DIR lets tests build into a copy of the site instead of the real one.
const SITE_DIR = path.resolve(process.env.CMS_SITE_DIR || path.join(__dirname, '..', '..'));
const TEMPLATE = path.join(__dirname, '..', 'templates', 'page.html');
const MANIFEST = process.env.CMS_SITE_DIR
  ? path.join(SITE_DIR, '.cms-generated.json')
  : path.join(__dirname, '..', '.generated.json');
const GENERATOR = '<meta name="generator" content="portfolio-cms">';
const SECTION = {
  projects: { id: 'projects', label: 'Projects', back: 'All projects', cta: 'Read the project →' },
  blog: { id: 'blog', label: 'Blog', back: 'All posts', cta: 'Read the post →' },
};

const attr = (s) => escapeHtml(s || '');
const encodePath = (p) => p.split('/').map((s) => encodeURIComponent(decodeURIComponentSafe(s))).join('/');

function decodeURIComponentSafe(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

function absolute(site, rel) {
  if (!rel) return '';
  if (/^https?:\/\//.test(rel)) return rel;
  return site.siteUrl.replace(/\/?$/, '/') + encodePath(rel.replace(/^\//, ''));
}

function bodyHtml(entry) {
  const html = entry.format === 'md' ? render(entry.body) : sanitize(entry.body);
  return enhance(html, SITE_DIR);
}

const slugify = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'section';

// Each <h2> starts a new glass panel, matching the hand-built pages.
function sectionize(html) {
  const used = new Set();
  const parts = html.split(/(?=<h2[\s>])/i).map((p) => p.trim()).filter(Boolean);
  return parts.map((p) => {
    const h = p.match(/^<h2>([\s\S]*?)<\/h2>/);
    if (!h) return `    <section class="panel reveal">\n${p}\n    </section>`;
    let id = slugify(h[1]);
    for (let n = 2; used.has(id) || ['main', 'nav-links'].includes(id); n++) id = `${slugify(h[1])}-${n}`;
    used.add(id);
    const body = p.replace(/^<h2>/, `<h2 id="${id}">`);
    return `    <section class="panel reveal" aria-labelledby="${id}">\n${body}\n    </section>`;
  }).join('\n\n');
}

function analytics(site) {
  if (!/^G-[A-Z0-9]{4,}$/.test(site.gaId || '')) return '';
  return `
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${site.gaId}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${site.gaId}');
  </script>
`;
}

function tagsHtml(tags, cls) {
  if (!tags.length) return '';
  return `<div class="${cls}">${tags.map((t, i) => `<span class="tag${i ? ' muted' : ''}">${attr(t)}</span>`).join('')}</div>`;
}

function renderPage(entry, site, { preview = false } = {}) {
  const sec = SECTION[entry.type];
  const url = absolute(site, `${entry.slug}.html`);
  const description = entry.description || entry.summary || site.description || '';
  const imagePath = entry.cover || entry.logo || site.defaultImage || '';
  const image = absolute(site, imagePath);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': entry.type === 'blog' ? 'BlogPosting' : 'CreativeWork',
        name: entry.title,
        headline: entry.title,
        description,
        url,
        ...(image ? { image } : {}),
        author: { '@type': 'Person', name: site.author, url: site.siteUrl },
        ...(entry.date ? { datePublished: entry.date } : {}),
        ...(entry.tags.length ? { keywords: entry.tags.join(', ') } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: site.siteUrl },
          { '@type': 'ListItem', position: 2, name: sec.label, item: `${site.siteUrl.replace(/\/?$/, '/')}#${sec.id}` },
          { '@type': 'ListItem', position: 3, name: entry.title },
        ],
      },
    ],
  };
  const date = entry.date && entry.type === 'blog'
    ? `<span class="tag muted"><time datetime="${attr(entry.date)}">${formatDate(entry.date)}</time></span>` : '';
  const words = bodyHtml(entry).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const readTime = entry.type === 'blog' && words > 120 ? `<span class="tag muted">${Math.max(1, Math.round(words / 200))} min read</span>` : '';
  const tags = entry.tags.map((t, i) => `<span class="tag${i ? ' muted' : ''}">${attr(t)}</span>`).join('') + readTime;
  const values = {
    pageTitle: attr(`${entry.seoTitle || entry.title} — ${site.author}`),
    title: attr(entry.title),
    description: attr(description),
    author: attr(site.author),
    canonical: attr(url),
    ogType: 'article',
    ogImage: image
      ? `  <meta property="og:image" content="${attr(image)}">\n  <meta property="og:image:alt" content="${attr((entry.cover && entry.coverAlt) || entry.title)}">` : '',
    analytics: preview ? '' : analytics(site),
    jsonLd: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
    brand: attr(site.brand),
    brandLabel: attr(`${site.brand.charAt(0)}${site.brand.slice(1).toLowerCase()}, home`),
    brandSubtitle: attr(site.brandSubtitle),
    currentProjects: entry.type === 'projects' ? ' aria-current="page"' : '',
    currentBlog: entry.type === 'blog' ? ' aria-current="page"' : '',
    section: sec.id,
    sectionLabel: sec.label,
    backLabel: sec.back,
    subtitleHtml: entry.subtitle ? `        <p class="page-subtitle">${attr(entry.subtitle)}</p>` : '',
    metaRow: tags || date ? `        <div class="meta-row">${date}${tags}</div>` : '',
    logoHtml: entry.logo ? `      <div class="logo-box">\n        ${logoImg(entry)}\n      </div>` : '',
    body: sectionize(bodyHtml(entry)),
    year: String(new Date().getFullYear()),
    previewBanner: preview
      ? `  <div class="preview-banner" role="status">Preview · ${entry.status === 'published' ? 'Published' : entry.status === 'coming-soon' ? 'Coming soon (only the card shows)' : 'Draft (not on the site)'}</div>\n` : '',
  };
  const tpl = fs.readFileSync(TEMPLATE, 'utf8');
  return tpl
    .replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  ${GENERATOR}`)
    .replace(/\{\{(\w+)\}\}/g, (_, k) => (k in values ? values[k] : ''));
}

// The logo uses the same picture/WebP treatment as body images, without zoom.
function logoImg(entry) {
  const src = attr(entry.logo.split('/').map((s) => encodeURIComponent(decodeURIComponentSafe(s))).join('/'));
  const html = enhance(`<img src="${src}" alt="${attr(entry.logoAlt || `${entry.title} logo`)}">`, SITE_DIR);
  return html.replace(/^<button[^>]*>|<\/button>$/g, '').replace(' loading="lazy"', '');
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return attr(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function cardsHtml(type) {
  const entries = content.list(type).filter((e) => e.status !== 'draft');
  const pad = '          ';
  if (!entries.length) {
    return `\n${pad}<p class="muted">${type === 'blog' ? 'First post coming soon.' : 'Projects coming soon.'}</p>\n${pad}`;
  }
  const cards = entries.map((e) => {
    const summary = e.summary ? `\n${pad}  <p>${attr(e.summary)}</p>` : '';
    if (e.status === 'coming-soon') {
      return `<div class="project-card is-soon">\n${pad}  <div class="tag-row"><span class="tag muted">Coming soon</span></div>\n${pad}  <h3>${attr(e.title)}</h3>${summary}\n${pad}</div>`;
    }
    const tags = tagsHtml(e.tags.slice(0, 2), 'tag-row');
    return `<a href="${attr(e.slug)}.html" class="project-card">${tags ? `\n${pad}  ${tags}` : ''}\n${pad}  <h3>${attr(e.title)}</h3>${summary}\n${pad}  <span class="card-cta">${SECTION[type].cta}</span>\n${pad}</a>`;
  });
  return `\n${pad}` + cards.join(`\n${pad}`) + `\n${pad}`;
}

// Replace what sits between <!-- cms:NAME:start --> and <!-- cms:NAME:end -->.
// If the markers are missing, wrap the inside of the grid div that has gridClass.
function replaceRegion(html, name, gridClass, inner) {
  const start = `<!-- cms:${name}:start -->`;
  const end = `<!-- cms:${name}:end -->`;
  const s = html.indexOf(start);
  const e = html.indexOf(end);
  if (s !== -1 && e > s) return html.slice(0, s + start.length) + inner + html.slice(e);

  const open = html.match(new RegExp(`<div[^>]*class="[^"]*\\b${gridClass}\\b[^"]*"[^>]*>`));
  if (!open) return html;
  const from = open.index + open[0].length;
  let depth = 1;
  const re = /<(\/?)div\b[^>]*>/g;
  re.lastIndex = from;
  let m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (!depth) return html.slice(0, from) + start + inner + end + '\n        ' + html.slice(m.index);
  }
  return html;
}

function readManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { return []; }
}

function isGenerated(file) {
  try { return fs.readFileSync(file, 'utf8').includes(GENERATOR); } catch { return false; }
}

function writeIfChanged(file, data) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === data) return false;
  fs.writeFileSync(file, data, 'utf8');
  return true;
}

// Lists the home page plus every other top-level page, hand-written or generated.
function sitemap(site) {
  const files = fs.readdirSync(SITE_DIR)
    .filter((f) => f.endsWith('.html') && f !== 'index.html' && !/^(404|google[0-9a-f]+)\.html$/i.test(f))
    .sort();
  const lastmod = (f) => fs.statSync(path.join(SITE_DIR, f)).mtime.toISOString().slice(0, 10);
  const urls = [
    { loc: site.siteUrl.replace(/\/?$/, '/'), file: 'index.html', priority: '1.0' },
    ...files.map((f) => ({ loc: absolute(site, f), file: f, priority: '0.8' })),
  ];
  const body = urls.map((u) => [
    '  <url>',
    `    <loc>${attr(u.loc)}</loc>`,
    ...(fs.existsSync(path.join(SITE_DIR, u.file)) ? [`    <lastmod>${lastmod(u.file)}</lastmod>`] : []),
    `    <priority>${u.priority}</priority>`,
    '  </url>',
  ].join('\n')).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// adopt: slugs whose existing hand-written page may be replaced (one-time migration).
function build({ adopt = [] } = {}) {
  const site = content.readSite();
  const result = { written: [], removed: [], skipped: [], indexUpdated: false };
  const pages = [];

  for (const type of content.TYPES) {
    for (const entry of content.list(type)) {
      if (entry.status !== 'published') continue;
      const file = `${entry.slug}.html`;
      const full = path.join(SITE_DIR, file);
      if (fs.existsSync(full) && !isGenerated(full) && !adopt.includes(entry.slug)) {
        result.skipped.push(`${file} (a hand-written page with this name already exists)`);
        continue;
      }
      pages.push({ file, slug: entry.slug });
      if (writeIfChanged(full, renderPage(entry, site))) result.written.push(file);
    }
  }

  const keep = new Set(pages.map((p) => p.file));
  for (const file of readManifest()) {
    const full = path.join(SITE_DIR, file);
    if (!keep.has(file) && isGenerated(full)) {
      fs.unlinkSync(full);
      result.removed.push(file);
    }
  }
  fs.writeFileSync(MANIFEST, JSON.stringify([...keep].sort(), null, 2) + '\n');

  const indexFile = path.join(SITE_DIR, 'index.html');
  if (fs.existsSync(indexFile)) {
    let html = fs.readFileSync(indexFile, 'utf8');
    html = replaceRegion(html, 'projects', 'card-grid', cardsHtml('projects'));
    html = replaceRegion(html, 'blog', 'card-grid', cardsHtml('blog'));
    result.indexUpdated = writeIfChanged(indexFile, html);
  }

  if (writeIfChanged(path.join(SITE_DIR, 'sitemap.xml'), sitemap(site))) result.written.push('sitemap.xml');
  return result;
}

module.exports = { build, renderPage, SITE_DIR };

if (require.main === module) {
  const adopt = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const r = build({ adopt });
  console.log(JSON.stringify(r, null, 2));
}
