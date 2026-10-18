// Small Markdown renderer covering what the portfolio needs:
// headings, paragraphs, lists, blockquotes, code, rules, links, images,
// emphasis and raw HTML blocks. Paragraphs made only of images become
// a clickable gallery that opens in the page's lightbox.

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const encodeUrl = (u) => escapeHtml(u.trim().replace(/ /g, '%20'));

const IMAGE_RE = /!\[([^\]]*)\]\(([^)"]+?)(?:\s+"([^"]*)")?\)/g;

function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${escapeHtml(c)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = escapeHtml(s);
  s = s.replace(/&lt;br\s*\/?&gt;/g, '<br>');
  s = s.replace(/!\[([^\]]*)\]\(([^)"]+?)(?:\s+&quot;([^"]*?)&quot;)?\)/g, (_, alt, src) =>
    `<img src="${encodeUrl(src)}" alt="${alt}" loading="lazy">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const external = /^https?:\/\//.test(href);
    return `<a href="${encodeUrl(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^\w*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w])_([^_\s][^_]*)_(?=[^\w]|$)/g, '$1<em>$2</em>');
  s = s.replace(/ {2,}\n/g, '<br>\n');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[i]);
}

function imageOnly(text) {
  return text.replace(IMAGE_RE, '').trim() === '' && /!\[[^\]]*\]\(/.test(text);
}

function gallery(text) {
  const imgs = [...text.matchAll(IMAGE_RE)];
  const items = imgs.map(([, alt, src, title]) => {
    const url = encodeUrl(src);
    const caption = title ? `<figcaption>${escapeHtml(title)}</figcaption>` : '';
    return `<figure${imgs.length === 1 ? ' class="img-wide"' : ''}><img src="${url}" alt="${escapeHtml(alt)}">${caption}</figure>`;
  });
  return imgs.length === 1 ? items[0] : `<div class="md-gallery">${items.join('')}</div>`;
}

const BLOCK_HTML = /^<\/?(div|section|figure|table|video|iframe|details|aside|p|ul|ol|blockquote|pre|h[1-6]|hr|picture|!--)/i;

function render(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fence = line.match(/^```\s*(\w*)/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      const lang = fence[1] ? ` class="language-${fence[1]}"` : '';
      out.push(`<pre><code${lang}>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    if (BLOCK_HTML.test(line.trim())) {
      const buf = [];
      while (i < lines.length && lines[i].trim()) buf.push(lines[i++]);
      out.push(buf.join('\n'));
      continue;
    }

    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${render(buf.join('\n'))}</blockquote>`);
      continue;
    }

    const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+/);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[2]);
      const itemRe = ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(itemRe);
        if (m) { items.push(m[1]); i++; continue; }
        // indented continuation of the previous item
        if (items.length && /^\s{2,}\S/.test(lines[i])) { items[items.length - 1] += ' ' + lines[i].trim(); i++; continue; }
        break;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }

    const buf = [];
    while (i < lines.length && lines[i].trim() &&
      !/^(#{1,6}\s|```|>\s?|\s*([-*+]|\d+[.)])\s+)/.test(lines[i]) &&
      !BLOCK_HTML.test(lines[i].trim())) {
      buf.push(lines[i++]);
    }
    const text = buf.join('\n');
    out.push(imageOnly(text) ? gallery(text) : `<p>${inline(text)}</p>`);
  }
  return out.join('\n');
}

// Split a document into [{ heading, body }] at each "## " line (outside code fences).
function splitSections(src) {
  const sections = [{ heading: null, lines: [] }];
  let inFence = false;
  for (const line of String(src).replace(/\r\n?/g, '\n').split('\n')) {
    if (/^```/.test(line)) inFence = !inFence;
    const m = !inFence && line.match(/^##\s+(.*?)\s*#*$/);
    if (m) sections.push({ heading: m[1], lines: [] });
    else sections[sections.length - 1].lines.push(line);
  }
  return sections
    .map((s) => ({ heading: s.heading, body: s.lines.join('\n').trim() }))
    .filter((s) => s.heading || s.body);
}

module.exports = { render, inline, escapeHtml, splitSections };
