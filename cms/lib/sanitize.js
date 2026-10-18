// Allowlist sanitizer for HTML coming out of the visual editor (including
// anything pasted into it). Unknown tags are unwrapped, dangerous ones are
// dropped with their contents, and only safe attributes and URLs survive.

const ALLOWED = {
  p: ['class'], h2: ['class'], h3: ['class'], h4: ['class'], strong: [], b: [], em: [], i: [], u: [], s: [],
  mark: [], sup: [], sub: [],
  details: [], summary: [],
  a: ['href', 'title', 'class'], ul: [], ol: [], li: ['class'], blockquote: ['class'], pre: [], code: [],
  hr: [], br: [], figure: ['class'], figcaption: ['class'], div: ['class', 'data-youtube', 'data-pdf'], span: ['class'],
  img: ['src', 'alt', 'width', 'height'],
  video: ['src', 'controls', 'loop', 'muted', 'autoplay', 'playsinline', 'poster', 'aria-label'],
  table: [], thead: [], tbody: [], tr: [], th: ['class'], td: ['class'],
};
const VOID = new Set(['hr', 'br', 'img']);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'form', 'textarea', 'select', 'head', 'title']);
// Layout pieces the site's stylesheet knows how to draw.
// Keep in step with CLASS_OK in admin/editor.js and with assets/css/content.css.
const CLASSES = new Set([
  'md-gallery', 'md-figure', 'img-wide', 'img-left', 'img-right', 'img-center', 'img-small',
  'w-25', 'w-33', 'w-50', 'w-66', 'w-75', 'w-100',
  'fs-sm', 'fs-lg', 'fs-xl',
  'c-accent', 'c-blue', 'c-muted', 'c-white', 'c-green', 'c-amber', 'c-red',
  'ta-center', 'ta-right', 'ta-justify',
  'callout', 'callout-ok', 'callout-warn', 'btn-link', 'file-card', 'pdf-embed', 'note', 'spec-grid', 'spec', 'k', 'v', 'split', 'media-box', 'embed', 'tag', 'muted',
]);
const RENAME = { b: 'strong', i: 'em', h1: 'h2', h5: 'h4', h6: 'h4', strike: 's', del: 's' };

// Browsers ignore tabs, newlines and control characters inside URLs, so strip
// them before checking the scheme ("java\tscript:" must not slip through).
function safeUrl(u, { image = false } = {}) {
  const url = u.replace(/[\u0000- \u007f]/g, (c) => (c === ' ' ? ' ' : '')).trim();
  if (/^(https?:|#|\/(?!\/))/i.test(url)) return url;
  if (!image && /^mailto:/i.test(url)) return url;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith('//')) return url; // relative path
  return null;
}

function decodeAttr(v) {
  return v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function encodeAttr(v) {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cleanAttrs(name, raw) {
  const out = [];
  const allowed = ALLOWED[name] || [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(raw))) {
    const key = m[1].toLowerCase();
    if (!allowed.includes(key)) continue;
    let val = decodeAttr(m[3] ?? m[4] ?? m[5] ?? '');
    if (key === 'href') val = safeUrl(val);
    if (key === 'src' || key === 'poster') val = safeUrl(val, { image: true });
    if (key === 'class') val = val.split(/\s+/).filter((c) => CLASSES.has(c)).join(' ');
    if ((key === 'width' || key === 'height') && !/^\d{1,4}$/.test(val)) val = null;
    if (key === 'data-youtube' && !/^[\w-]{11}$/.test(val)) val = null;
    if (key === 'data-pdf' && !/^files\/[\w.%-]+\.pdf$/i.test(val)) val = null;
    if (val === null || (key === 'class' && !val)) continue;
    const boolean = ['controls', 'loop', 'muted', 'autoplay', 'playsinline'].includes(key);
    out.push(boolean ? key : `${key}="${encodeAttr(val)}"`);
  }
  if (name === 'a' && /href="https?:/.test(out.join(' '))) out.push('target="_blank"', 'rel="noopener"');
  return out.length ? ' ' + out.join(' ') : '';
}

function sanitize(html) {
  const src = String(html || '').replace(/<!--[\s\S]*?-->/g, '');
  let out = '';
  let dropDepth = 0;
  let dropTag = null;
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    const text = src.slice(last, m.index);
    if (!dropDepth) out += text.replace(/</g, '&lt;');
    last = re.lastIndex;
    const closing = m[1] === '/';
    let name = m[2].toLowerCase();

    if (dropDepth) {
      if (name === dropTag) dropDepth += closing ? -1 : 1;
      continue;
    }
    if (DROP_WITH_CONTENT.has(name)) {
      if (!closing && !/\/\s*$/.test(m[3])) { dropDepth = 1; dropTag = name; }
      continue;
    }
    name = RENAME[name] || name;
    if (!ALLOWED[name]) continue; // unwrap: keep the text, lose the tag
    if (closing) { if (!VOID.has(name)) out += `</${name}>`; continue; }
    if (name === 'img' && !/\bsrc\s*=/.test(m[3])) continue;
    const attrs = cleanAttrs(name, m[3]);
    if (name === 'img' && !/ src="/.test(attrs)) continue;
    out += `<${name}${attrs}>`;
  }
  if (!dropDepth) out += src.slice(last).replace(/</g, '&lt;');
  return tidy(out);
}

// Remove empty paragraphs and spans of whitespace the editor leaves behind.
function tidy(html) {
  // Spans only matter when they carry an allowed class.
  let prev;
  do {
    prev = html;
    html = html.replace(/<span>((?:(?!<\/?span\b)[\s\S])*)<\/span>/g, '$1');
  } while (html !== prev);
  // A heading can't hold paragraphs; if the editor produced one, keep the paragraphs.
  html = html.replace(/<(h[2-4])(?:\s[^>]*)?>\s*(<(?:p|div|ul|ol|blockquote|pre|figure|table)[\s>][\s\S]*?)<\/\1>/g, '$2');
  return html
    .replace(/<p>(\s|&nbsp;|<br>)*<\/p>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { sanitize };
