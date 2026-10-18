// Upgrades plain editor images and videos into the site's fast, zoomable markup:
//   <img>   -> button.zoomable > picture (WebP when a .webp copy exists) > img with size
//   <video> -> <source> for WebM and MP4 when both exist, lazy-loaded
// Reading image sizes from file headers lets the browser reserve space
// before the image loads, so the page doesn't jump around.

const fs = require('fs');
const path = require('path');

function imageSize(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, b, 0, b.length, 0);
    if (b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (b.toString('latin1', 0, 3) === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
      const chunk = b.toString('latin1', 12, 16);
      if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
      if (chunk === 'VP8L') {
        const bits = b.readUInt32LE(21);
        return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
      }
      if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < n) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1];
        const len = b.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
        }
        i += 2 + len;
      }
    }
  } catch { /* missing or unreadable file */ } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return null;
}

const attrOf = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
};

function localFile(siteDir, src) {
  if (/^([a-z]+:|\/\/)/i.test(src)) return null;
  try { return path.join(siteDir, decodeURIComponent(src.split(/[?#]/)[0]).replace(/^\//, '')); } catch { return null; }
}

function enhance(html, siteDir) {
  // Galleries use the site's media grid.
  html = html.replace(/<div class="md-gallery">/g, '<div class="media-grid media-block">');

  // YouTube blocks become privacy-friendly embeds (no cookies until played).
  html = html.replace(/<div (?=[^>]*class="embed")(?=[^>]*data-youtube="([\w-]{11})")[^>]*>\s*<\/div>/g, (_, id) =>
    `<div class="embed"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="YouTube video" loading="lazy" ` +
    'allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ' +
    'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>');

  // Wide tables scroll sideways on phones instead of squashing.
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');

  html = html.replace(/<img\b[^>]*>/g, (tag) => {
    const src = attrOf(tag, 'src');
    if (!src) return tag;
    const alt = attrOf(tag, 'alt') || '';
    const file = localFile(siteDir, src);
    let width = attrOf(tag, 'width');
    let height = attrOf(tag, 'height');
    if (file && (!width || !height)) {
      const size = imageSize(file);
      if (size) ({ width, height } = { width: String(size.width), height: String(size.height) });
    }
    const dims = width && height ? ` width="${width}" height="${height}"` : '';
    const img = `<img src="${src}" alt="${alt}"${dims} loading="lazy" decoding="async">`;
    let picture = img;
    if (file && !/\.webp$/i.test(file)) {
      const webp = file.replace(/\.[^.\\/]+$/, '.webp');
      if (webp !== file && fs.existsSync(webp)) {
        const webpSrc = src.replace(/\.[^.\/]+$/, '.webp');
        picture = `<picture><source srcset="${webpSrc}" type="image/webp">${img}</picture>`;
      }
    }
    const label = `Enlarge image${alt ? `: ${alt}` : ''}`;
    return `<button class="zoomable" type="button" data-full="${src}" aria-label="${label}">${picture}</button>`;
  });

  html = html.replace(/<video\b([^>]*)><\/video>/g, (all, attrs) => {
    const src = attrOf(all, 'src');
    if (!src) return all;
    const rest = attrs.replace(/\ssrc="[^"]*"/, '');
    const file = localFile(siteDir, src);
    const sources = [];
    const base = src.replace(/\.(mp4|webm)$/i, '');
    const baseFile = file ? file.replace(/\.(mp4|webm)$/i, '') : null;
    if (baseFile && fs.existsSync(baseFile + '.webm')) sources.push(`<source src="${base}.webm" type="video/webm">`);
    if (baseFile && fs.existsSync(baseFile + '.mp4')) sources.push(`<source src="${base}.mp4" type="video/mp4">`);
    if (!sources.length) sources.push(`<source src="${src}">`);
    const preload = /\sautoplay\b/.test(rest) ? '' : ' preload="metadata"';
    return `<video${rest}${preload}>${sources.join('')}</video>`;
  });
  return html;
}

module.exports = { enhance, imageSize };
