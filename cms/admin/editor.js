// Visual editor for the Portfolio CMS: a document-style editor with text
// styles, sizes, colours, alignment, free image placement (drag to move,
// drag the corner to resize, wrap text left/right), tables, code blocks,
// callouts, spec cards, two-column layouts and YouTube videos.
// Everything it produces uses a fixed set of classes that the public site's
// stylesheet understands, so pages look the same in the editor and online.
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const SIZES = [['', 'Normal'], ['fs-sm', 'Small'], ['fs-lg', 'Large'], ['fs-xl', 'Huge']];
  const COLORS = [
    ['', 'Default', '#d7eaf6'], ['c-white', 'White', '#ffffff'], ['c-accent', 'Cyan', '#00d0ff'], ['c-blue', 'Blue', '#2aa0ff'],
    ['c-muted', 'Grey', '#95a3b3'], ['c-green', 'Green', '#3ee6a0'], ['c-amber', 'Amber', '#ffc65c'], ['c-red', 'Red', '#ff6b7a'],
  ];
  const WIDTHS = [25, 33, 50, 66, 75, 100];
  const LAYOUTS = ['img-left', 'img-center', 'img-right', 'img-wide'];
  const BLOCK_TAGS = 'p,h2,h3,h4,blockquote,pre,li';
  const SENTINEL = '#fe0001';

  let ctx = null; // the mounted editor

  // ---------- Toolbar ----------
  const icon = {
    left: '<svg viewBox="0 0 16 16"><path d="M2 3h12M2 6.5h8M2 10h12M2 13.5h8"/></svg>',
    center: '<svg viewBox="0 0 16 16"><path d="M2 3h12M4 6.5h8M2 10h12M4 13.5h8"/></svg>',
    right: '<svg viewBox="0 0 16 16"><path d="M2 3h12M6 6.5h8M2 10h12M6 13.5h8"/></svg>',
    justify: '<svg viewBox="0 0 16 16"><path d="M2 3h12M2 6.5h12M2 10h12M2 13.5h12"/></svg>',
    ul: '<svg viewBox="0 0 16 16"><circle cx="2.5" cy="4" r="1"/><circle cx="2.5" cy="8" r="1"/><circle cx="2.5" cy="12" r="1"/><path d="M6 4h8M6 8h8M6 12h8"/></svg>',
    ol: '<svg viewBox="0 0 16 16"><text x="0.5" y="5.5" font-size="5">1</text><text x="0.5" y="13.5" font-size="5">2</text><path d="M6 4h8M6 8h8M6 12h8"/></svg>',
    indent: '<svg viewBox="0 0 16 16"><path d="M2 3h12M7 6.5h7M7 10h7M2 13.5h12M2 6l3 2-3 2z"/></svg>',
    outdent: '<svg viewBox="0 0 16 16"><path d="M2 3h12M7 6.5h7M7 10h7M2 13.5h12M5 6L2 8l3 2z"/></svg>',
    link: '<svg viewBox="0 0 16 16"><path d="M6.5 9.5l3-3M7 4.5l1.2-1.2a2.5 2.5 0 013.5 3.5L10.5 8M9 11.5l-1.2 1.2a2.5 2.5 0 01-3.5-3.5L5.5 8"/></svg>',
    undo: '<svg viewBox="0 0 16 16"><path d="M5 3L2 6l3 3M2 6h7a4 4 0 010 8H6"/></svg>',
    redo: '<svg viewBox="0 0 16 16"><path d="M11 3l3 3-3 3M14 6H7a4 4 0 000 8h3"/></svg>',
    clear: '<svg viewBox="0 0 16 16"><path d="M3 3h9M7.5 3L5 13M10 9l4 4M14 9l-4 4"/></svg>',
  };

  function toolbarHtml() {
    const sw = COLORS.map(([cls, name, hex]) => `<button type="button" class="swatch" data-color="${cls}" title="${name}" aria-label="${name}" style="--sw:${hex}"></button>`).join('');
    return `
    <div class="toolbar" role="toolbar" aria-label="Formatting">
      <select data-ctl="block" aria-label="Text style" title="Text style">
        <option value="p">Paragraph</option>
        <option value="h2">Section heading</option>
        <option value="h3">Heading</option>
        <option value="h4">Small heading</option>
        <option value="blockquote">Quote</option>
        <option value="pre">Code block</option>
      </select>
      <select data-ctl="size" aria-label="Text size" title="Text size">
        ${SIZES.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}
      </select>
      <span class="sep"></span>
      <button type="button" data-cmd="bold" title="Bold (Ctrl+B)" aria-label="Bold"><b>B</b></button>
      <button type="button" data-cmd="italic" title="Italic (Ctrl+I)" aria-label="Italic"><i>I</i></button>
      <button type="button" data-cmd="underline" title="Underline (Ctrl+U)" aria-label="Underline"><u>U</u></button>
      <button type="button" data-cmd="strikeThrough" title="Strikethrough" aria-label="Strikethrough"><s>S</s></button>
      <div class="menu-wrap">
        <button type="button" data-menu="color" title="Text colour" aria-label="Text colour" aria-haspopup="true"><span class="a-color">A</span><span class="caret">▾</span></button>
        <div class="menu swatches" data-menu-for="color" hidden>${sw}</div>
      </div>
      <button type="button" data-act="mark" title="Highlight" aria-label="Highlight"><span class="hl">ab</span></button>
      <button type="button" data-act="code" title="Inline code" aria-label="Inline code"><code>&lt;/&gt;</code></button>
      <button type="button" data-cmd="superscript" title="Superscript" aria-label="Superscript">x<sup>2</sup></button>
      <button type="button" data-cmd="subscript" title="Subscript" aria-label="Subscript">x<sub>2</sub></button>
      <span class="sep"></span>
      <button type="button" data-align="" title="Align left" aria-label="Align left">${icon.left}</button>
      <button type="button" data-align="ta-center" title="Centre" aria-label="Centre">${icon.center}</button>
      <button type="button" data-align="ta-right" title="Align right" aria-label="Align right">${icon.right}</button>
      <button type="button" data-align="ta-justify" title="Justify" aria-label="Justify">${icon.justify}</button>
      <span class="sep"></span>
      <button type="button" data-cmd="insertUnorderedList" title="Bulleted list" aria-label="Bulleted list">${icon.ul}</button>
      <button type="button" data-cmd="insertOrderedList" title="Numbered list" aria-label="Numbered list">${icon.ol}</button>
      <button type="button" data-cmd="outdent" title="Decrease indent (Shift+Tab)" aria-label="Decrease indent">${icon.outdent}</button>
      <button type="button" data-cmd="indent" title="Increase indent (Tab)" aria-label="Increase indent">${icon.indent}</button>
      <span class="sep"></span>
      <button type="button" data-act="link" title="Link (Ctrl+K)" aria-label="Link">${icon.link}</button>
      <div class="menu-wrap">
        <button type="button" class="insert" data-menu="insert" aria-haspopup="true">＋ Insert <span class="caret">▾</span></button>
        <div class="menu insert-menu" data-menu-for="insert" hidden>
          <button type="button" data-insert="image"><b>Image or video</b><span>Upload, or pick one you have</span></button>
          <button type="button" data-insert="gallery"><b>Image gallery</b><span>A row of images</span></button>
          <button type="button" data-insert="youtube"><b>YouTube video</b><span>Paste a link</span></button>
          <button type="button" data-insert="pdf"><b>PDF or report</b><span>Upload a PDF to download or read in the page</span></button>
          <button type="button" data-insert="table"><b>Table</b><span>Rows and columns</span></button>
          <button type="button" data-insert="code"><b>Code block</b><span>Firmware, scripts, commands</span></button>
          <button type="button" data-insert="specs"><b>Spec cards</b><span>Key numbers, like range or mass</span></button>
          <button type="button" data-insert="columns"><b>Two columns</b><span>Side-by-side text or images</span></button>
          <button type="button" data-insert="callout"><b>Callout</b><span>A highlighted cyan box</span></button>
          <button type="button" data-insert="success"><b>Success box</b><span>Green, for results that worked</span></button>
          <button type="button" data-insert="warning"><b>Warning box</b><span>Amber, for gotchas and caveats</span></button>
          <button type="button" data-insert="button"><b>Button</b><span>A link styled as a button</span></button>
          <button type="button" data-insert="details"><b>Collapsible section</b><span>Hidden until the reader clicks</span></button>
          <button type="button" data-insert="note"><b>Note</b><span>A quiet side note</span></button>
          <button type="button" data-insert="quote"><b>Quote</b></button>
          <button type="button" data-insert="hr"><b>Divider</b></button>
        </div>
      </div>
      <span class="sep"></span>
      <button type="button" data-act="clear" title="Clear formatting" aria-label="Clear formatting">${icon.clear}</button>
      <button type="button" data-cmd="undo" title="Undo (Ctrl+Z)" aria-label="Undo">${icon.undo}</button>
      <button type="button" data-cmd="redo" title="Redo (Ctrl+Y)" aria-label="Redo">${icon.redo}</button>
    </div>`;
  }

  // ---------- Selection helpers ----------
  let savedRange = null;
  function saveSelection() {
    const sel = getSelection();
    if (sel.rangeCount && ctx.doc.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange();
  }
  function restoreSelection() {
    const { doc } = ctx;
    doc.focus({ preventScroll: true });
    const sel = getSelection();
    if (savedRange && doc.contains(savedRange.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(savedRange);
    } else if (!sel.rangeCount || !doc.contains(sel.anchorNode)) {
      const r = document.createRange();
      r.selectNodeContents(doc);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }
  function currentRange() {
    const sel = getSelection();
    if (sel.rangeCount && ctx.doc.contains(sel.anchorNode)) return sel.getRangeAt(0);
    return savedRange;
  }
  function placeCaret(node, atStart = true) {
    const r = document.createRange();
    r.selectNodeContents(node);
    r.collapse(atStart);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    savedRange = r.cloneRange();
  }
  const exec = (cmd, val = null) => document.execCommand(cmd, false, val);

  // Blocks touched by the selection (paragraphs, headings, list items...).
  function selectedBlocks(selector = BLOCK_TAGS) {
    const r = currentRange();
    if (!r) return [];
    const start = (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement);
    const first = start && start.closest(selector);
    const list = $$(selector, ctx.doc).filter((b) => r.intersectsNode(b) && !b.closest('[contenteditable="false"]'));
    // Prefer the innermost blocks (a li rather than the blockquote around it).
    const inner = list.filter((b) => !list.some((o) => o !== b && b.contains(o)));
    if (!inner.length && first && ctx.doc.contains(first)) return [first];
    return inner;
  }

  // ---------- Inline styles (size, colour, highlight, code) ----------
  // The browser's foreColor command splits the selection into clean pieces;
  // each piece is then swapped for a span with our own class.
  function wrapSelection(make) {
    restoreSelection();
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) { ctx.toast('Select some text first.'); return []; }
    exec('styleWithCSS', false);
    exec('foreColor', SENTINEL);
    const made = [];
    $$('font', ctx.doc).forEach((f) => {
      const c = (f.getAttribute('color') || '').toLowerCase();
      if (c !== SENTINEL) return;
      const el = make();
      el.append(...f.childNodes);
      f.replaceWith(el);
      made.push(el);
    });
    // Some browsers write a style instead of a <font>.
    $$('span[style]', ctx.doc).forEach((s) => {
      if (!/rgb\(254,\s*0,\s*1\)/.test(s.getAttribute('style'))) return;
      const el = make();
      el.append(...s.childNodes);
      s.replaceWith(el);
      made.push(el);
    });
    if (made.length) {
      const r = document.createRange();
      r.setStartBefore(made[0]);
      r.setEndAfter(made[made.length - 1]);
      sel.removeAllRanges();
      sel.addRange(r);
      savedRange = r.cloneRange();
    }
    return made;
  }

  function stripGroup(el, group) {
    // Remove a class group from the element's descendants, unwrapping spans left bare.
    $$('span', el).forEach((s) => {
      group.forEach((g) => g && s.classList.remove(g));
      if (!s.classList.length) unwrap(s);
    });
  }

  function unwrap(el) {
    el.replaceWith(...el.childNodes);
  }

  function applyClass(cls, group) {
    const made = wrapSelection(() => document.createElement('span'));
    // Remember the edges so the text stays selected for the next action.
    const texts = (el) => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const out = []; while (w.nextNode()) out.push(w.currentNode); return out; };
    const first = made.length ? texts(made[0])[0] : null;
    const last = made.length ? texts(made[made.length - 1]).pop() : null;
    made.forEach((span) => {
      stripGroup(span, group);
      // If the whole of an ancestor span is covered, change it instead of nesting.
      const parent = span.parentElement;
      if (parent && parent.tagName === 'SPAN' && parent.textContent === span.textContent) {
        group.forEach((g) => g && parent.classList.remove(g));
        if (cls) parent.classList.add(cls);
        unwrap(span);
        if (!parent.classList.length) unwrap(parent);
        return;
      }
      if (cls) span.className = cls;
      else unwrap(span);
    });
    if (first && last && first.isConnected && last.isConnected) {
      const r = document.createRange();
      r.setStart(first, 0);
      r.setEnd(last, last.length);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      savedRange = r.cloneRange();
    }
    ctx.markDirty();
  }

  function toggleTag(tag) {
    const r = currentRange();
    const at = r && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement);
    const existing = at && at.closest(tag);
    if (existing && ctx.doc.contains(existing)) { unwrap(existing); ctx.markDirty(); return; }
    const made = wrapSelection(() => document.createElement(tag));
    made.forEach((el) => $$(tag, el).forEach(unwrap));
    ctx.markDirty();
  }

  // ---------- Blocks ----------
  function setBlock(tag) {
    restoreSelection();
    let blocks = selectedBlocks('p,h2,h3,h4,blockquote,pre');
    if (!blocks.length) {
      exec('formatBlock', `<${tag}>`);
      ctx.markDirty();
      return;
    }
    const made = blocks.map((b) => {
      const el = document.createElement(tag);
      const align = [...b.classList].filter((c) => c.startsWith('ta-'));
      if (tag === 'pre') {
        const code = document.createElement('code');
        code.textContent = b.innerText.replace(/\n$/, '');
        el.appendChild(code);
      } else if (b.tagName === 'PRE') {
        b.textContent.split('\n').forEach((line, i) => { if (i) el.appendChild(document.createElement('br')); el.append(line); });
      } else {
        el.append(...b.childNodes);
        // Flatten any blocks that ended up inside (a heading can't hold paragraphs).
        $$(':scope > p, :scope > div', el).forEach((inner, i) => {
          if (i) inner.before(document.createElement('br'));
          unwrap(inner);
        });
      }
      if (tag !== 'pre') align.forEach((a) => el.classList.add(a));
      b.replaceWith(el);
      return el;
    });
    const r = document.createRange();
    r.setStart(made[0], 0);
    r.setEnd(made[made.length - 1], made[made.length - 1].childNodes.length);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    savedRange = r.cloneRange();
    ctx.markDirty();
  }

  function align(cls) {
    restoreSelection();
    const fig = ctx.selectedFigure;
    if (fig) { setFigureLayout(fig, cls === 'ta-center' ? 'img-center' : cls === 'ta-right' ? 'img-right' : cls === '' ? 'img-left' : 'img-wide'); return; }
    const blocks = selectedBlocks('p,h2,h3,h4,blockquote,li,figcaption,td,th');
    blocks.forEach((b) => {
      b.classList.remove('ta-center', 'ta-right', 'ta-justify');
      if (cls) b.classList.add(cls);
      if (!b.classList.length) b.removeAttribute('class');
    });
    ctx.markDirty();
    updateState();
  }

  // Insert a block after the top-level block holding the caret.
  function insertBlock(html, { focusSelector } = {}) {
    restoreSelection();
    const { doc } = ctx;
    const r = currentRange();
    let node = r ? r.startContainer : null;
    // Stay inside a column when the caret is in one.
    const container = node && (node.nodeType === 1 ? node : node.parentElement).closest('.split > div') || doc;
    while (node && node.parentNode !== container) node = node.parentNode;
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const nodes = [...tpl.content.childNodes];
    if (node && node !== container && container.contains(node)) {
      const empty = node.nodeType === 1 && node.tagName === 'P' && !node.textContent.trim() && !node.querySelector('img');
      node.after(tpl.content);
      if (empty) node.remove();
    } else {
      container.appendChild(tpl.content);
    }
    const target = focusSelector ? nodes.map((n) => n.nodeType === 1 && (n.matches(focusSelector) ? n : n.querySelector(focusSelector))).find(Boolean) : null;
    const last = nodes[nodes.length - 1];
    if (target) placeCaret(target, true);
    else if (last && last.nodeType === 1) placeCaret(last, true);
    prepare(doc);
    ctx.markDirty();
  }

  // ---------- Media ----------
  function mediaHtml(p) {
    const src = esc(encodeURI(p));
    const alt = esc(p.split('/').pop().replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
    return /\.(mp4|webm)$/i.test(p)
      ? `<video src="${src}" controls loop muted playsinline></video>`
      : `<img src="${src}" alt="${alt}">`;
  }
  const figureHtml = (p, cls = 'img-wide') => `<figure${cls ? ` class="${cls}"` : ''}>${mediaHtml(p)}</figure>`;
  const galleryHtml = (paths) => `<div class="md-gallery">${paths.map((p) => figureHtml(p, '')).join('')}</div>`;

  async function insertMedia(kind) {
    saveSelection();
    const picked = await ctx.pickMedia({ multiple: kind === 'gallery', title: kind === 'gallery' ? 'Choose images for a gallery' : 'Add an image or video' });
    if (!picked || !picked.length) return;
    const html = kind === 'gallery' && picked.length > 1 ? galleryHtml(picked) : picked.map((p) => figureHtml(p)).join('');
    insertBlock(html + '<p><br></p>');
  }

  async function uploadFiles(files, at) {
    const pdf = files.find((f) => /\.pdf$/i.test(f.name));
    if (pdf) {
      if (at) { getSelection().removeAllRanges(); getSelection().addRange(at); saveSelection(); }
      await insertPdf(pdf);
      files = files.filter((f) => f !== pdf);
      if (!files.length) return;
    }
    try {
      const paths = [];
      for (const f of files) paths.push(await ctx.upload(f));
      if (at) { getSelection().removeAllRanges(); getSelection().addRange(at); saveSelection(); }
      insertBlock((paths.length > 1 ? galleryHtml(paths) : figureHtml(paths[0])) + '<p><br></p>');
    } catch (err) { ctx.toast(err.message, true); }
  }

  // A small dialog with a few big choices; resolves to the chosen key, or null.
  function choose(title, options) {
    return new Promise((resolve) => {
      const dlg = document.createElement('dialog');
      dlg.className = 'choose-dialog';
      dlg.innerHTML = `<div class="dialog-head"><h2>${esc(title)}</h2><button class="close-x" type="button" aria-label="Close">×</button></div>
        <div class="dialog-body stack">${options.map(([key, label, help]) =>
          `<button type="button" class="choice" data-key="${esc(key)}"><b>${esc(label)}</b><span>${esc(help || '')}</span></button>`).join('')}</div>`;
      document.body.appendChild(dlg);
      let done = false;
      const finish = (v) => { if (done) return; done = true; dlg.close(); dlg.remove(); resolve(v); };
      dlg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (b) finish(b.dataset.key || null);
      });
      dlg.addEventListener('cancel', () => finish(null));
      dlg.showModal();
      const first = dlg.querySelector('.choice');
      if (first) first.focus();
    });
  }

  // PDFs: a download card, plus an optional reader shown inside the page.
  function choosePdf() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/pdf,.pdf';
      input.onchange = () => resolve(input.files[0] || null);
      input.click();
    });
  }

  async function insertPdf(file) {
    saveSelection();
    file = file || await choosePdf();
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) { ctx.toast('Please choose a PDF file.', true); return; }
    let p;
    try { p = await ctx.upload(file); } catch (err) { ctx.toast(err.message, true); return; }
    const guess = file.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ');
    const label = await ctx.ask('PDF added', 'Link text', guess, 'What readers click to open or download it, like "Full project report".');
    if (label === null) return;
    const showInline = await choose('How should it appear?', [
      ['both', 'Download link + reader in the page', 'Readers can scroll through it right on the page'],
      ['link', 'Just a download link', 'A neat card that opens the PDF'],
    ]);
    if (!showInline) return;
    const href = esc(encodeURI(p));
    const kb = file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
    let html = `<p><a class="file-card" href="${href}">${esc(label.trim() || guess)} (PDF, ${kb})</a></p>`;
    if (showInline === 'both') html += `<div class="pdf-embed" data-pdf="${href}"></div>`;
    insertBlock(html + '<p><br></p>');
  }

  function youtubeId(url) {
    const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
    return m ? m[1] : (/^[\w-]{11}$/.test(url.trim()) ? url.trim() : null);
  }

  // ---------- Insert menu ----------
  async function insert(kind) {
    closeMenus();
    if (kind === 'image' || kind === 'gallery') return insertMedia(kind);
    if (kind === 'pdf') return insertPdf();
    saveSelection();
    if (kind === 'youtube') {
      const url = await ctx.ask('YouTube video', 'Video link', '', 'Paste the address of the video, like https://youtu.be/…');
      if (!url) return;
      const id = youtubeId(url);
      if (!id) { ctx.toast("That doesn't look like a YouTube link.", true); return; }
      return insertBlock(`<div class="embed" data-youtube="${id}"></div><p><br></p>`);
    }
    if (kind === 'button') {
      const label = await ctx.ask('Add a button', 'Button text', 'View on GitHub');
      if (!label) return;
      const url = await ctx.ask('Add a button', 'Where it goes', 'https://', 'A web address, or a page like project_nimbus.html');
      if (!url || !/^(https?:\/\/|mailto:|[\w./-]+\.html)/i.test(url.trim())) { if (url) ctx.toast('That link needs to start with https:// or be a page like project_nimbus.html', true); return; }
      return insertBlock(`<p><a class="btn-link" href="${esc(url.trim())}">${esc(label.trim())}</a></p><p><br></p>`);
    }
    if (kind === 'table') {
      const size = await ctx.ask('Insert a table', 'Columns × rows', '3 x 3', 'For example 3 x 4 means 3 columns and 4 rows. The first row is the header.');
      if (!size) return;
      const m = size.match(/(\d+)\s*[x×*,]\s*(\d+)/i);
      const cols = Math.min(Math.max(m ? +m[1] : 3, 1), 10);
      const rows = Math.min(Math.max(m ? +m[2] : 3, 1), 40);
      const head = `<thead><tr>${Array.from({ length: cols }, (_, i) => `<th>Heading ${i + 1}</th>`).join('')}</tr></thead>`;
      const body = `<tbody>${Array.from({ length: Math.max(rows - 1, 1) }, () => `<tr>${'<td><br></td>'.repeat(cols)}</tr>`).join('')}</tbody>`;
      insertBlock(`<table>${head}${body}</table><p><br></p>`, { focusSelector: 'th' });
      selectContents();
      return;
    }
    const blocks = {
      code: ['<pre><code>// Your code here</code></pre><p><br></p>', 'code'],
      specs: ['<div class="spec-grid"><div class="spec"><div class="k">Mass</div><div class="v">1.2 kg</div></div><div class="spec"><div class="k">Range</div><div class="v">5 km</div></div><div class="spec"><div class="k">Power</div><div class="v">12 W</div></div></div><p><br></p>', '.k'],
      columns: ['<div class="split"><div><p>Left column</p></div><div><p>Right column</p></div></div><p><br></p>', '.split p'],
      callout: ['<p class="callout">Something worth pointing out.</p><p><br></p>', '.callout'],
      success: ['<p class="callout callout-ok">This worked.</p><p><br></p>', '.callout'],
      warning: ['<p class="callout callout-warn">Watch out for this.</p><p><br></p>', '.callout'],
      details: ['<details open><summary>Click to expand</summary><p>Hidden content goes here.</p></details><p><br></p>', 'summary'],
      note: ['<p class="note">A short side note.</p><p><br></p>', '.note'],
      quote: ['<blockquote>Quote</blockquote><p><br></p>', 'blockquote'],
      hr: ['<hr><p><br></p>', 'p'],
    };
    const [html, focus] = blocks[kind];
    insertBlock(html, { focusSelector: focus });
    if (kind !== 'hr') selectContents();
  }

  // Select the placeholder text at the caret so typing replaces it.
  function selectContents() {
    const sel = getSelection();
    if (!sel.rangeCount) return;
    const el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    const r = document.createRange();
    r.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(r);
    savedRange = r.cloneRange();
  }

  async function addLink() {
    saveSelection();
    const r = currentRange();
    const at = r && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement);
    const existing = at && at.closest('a');
    const hasText = r && !r.collapsed;
    const url = await ctx.ask(existing ? 'Edit link' : 'Add a link', 'Web address', existing ? existing.getAttribute('href') : 'https://',
      existing ? 'Clear the box to remove the link.' : hasText ? '' : 'Tip: select some text first to turn it into a link.');
    if (url === null) return;
    restoreSelection();
    if (existing && !url.trim()) { unwrap(existing); ctx.markDirty(); return; }
    if (!/^(https?:\/\/|mailto:|#|\.?\/|[\w./-]+\.html)/i.test(url.trim())) {
      ctx.toast('Links need to start with https://, mailto:, or be a page like project_nimbus.html', true);
      return;
    }
    if (existing) existing.setAttribute('href', url.trim());
    else if (hasText) exec('createLink', url.trim());
    else exec('insertHTML', `<a href="${esc(url.trim())}">${esc(url.trim())}</a>`);
    ctx.markDirty();
  }

  // ---------- Figures: select, layout, resize, drag ----------
  function figureClasses(fig) {
    return {
      layout: LAYOUTS.find((c) => fig.classList.contains(c)) || (fig.closest('.md-gallery') ? null : 'img-wide'),
      width: WIDTHS.find((w) => fig.classList.contains(`w-${w}`)),
    };
  }

  function setFigureLayout(fig, layout) {
    LAYOUTS.concat('img-small').forEach((c) => fig.classList.remove(c));
    fig.classList.add(layout);
    if (layout === 'img-wide') WIDTHS.forEach((w) => fig.classList.remove(`w-${w}`));
    if ((layout === 'img-left' || layout === 'img-right') && !figureClasses(fig).width) fig.classList.add('w-50');
    if (layout === 'img-center' && !figureClasses(fig).width) fig.classList.add('w-75');
    ctx.markDirty();
    selectFigure(fig);
  }

  function setFigureWidth(fig, w) {
    WIDTHS.forEach((x) => fig.classList.remove(`w-${x}`));
    fig.classList.remove('img-small');
    if (w === 100) { setFigureLayout(fig, 'img-wide'); return; }
    fig.classList.add(`w-${w}`);
    if (fig.classList.contains('img-wide')) { fig.classList.remove('img-wide'); fig.classList.add('img-center'); }
    ctx.markDirty();
    selectFigure(fig);
  }

  function figureBarHtml() {
    return `
      <div class="bar-group" data-only="single">
        <button type="button" data-fl="img-left" title="Left, text wraps on the right">◧ Left</button>
        <button type="button" data-fl="img-center" title="Centred">▣ Centre</button>
        <button type="button" data-fl="img-right" title="Right, text wraps on the left">◨ Right</button>
        <button type="button" data-fl="img-wide" title="Full width">▭ Full</button>
      </div>
      <div class="bar-group" data-only="single">
        ${WIDTHS.slice(0, 5).map((w) => `<button type="button" data-fw="${w}">${w}%</button>`).join('')}
      </div>
      <div class="bar-group">
        <button type="button" data-fa="caption">Caption</button>
        <button type="button" data-fa="alt" data-only="img">Alt text</button>
        <button type="button" data-fa="replace">Replace</button>
        <button type="button" data-fa="up" aria-label="Move up" title="Move up">↑</button>
        <button type="button" data-fa="down" aria-label="Move down" title="Move down">↓</button>
        <button type="button" data-fa="remove" class="danger">Remove</button>
      </div>`;
  }

  function selectFigure(fig) {
    const { doc, figBar, handle } = ctx;
    $$('.selected', doc).forEach((f) => f.classList.remove('selected'));
    hideBlockBar();
    ctx.selectedFigure = fig;
    fig.classList.add('selected');
    const inGallery = !!fig.closest('.md-gallery');
    const isEmbed = fig.classList.contains('embed') || fig.classList.contains('pdf-embed');
    $$('[data-only="single"]', figBar).forEach((g) => { g.hidden = inGallery; });
    $$('[data-only="img"]', figBar).forEach((b) => { b.hidden = !fig.querySelector('img') || isEmbed; });
    $$('[data-fa="caption"], [data-fa="replace"]', figBar).forEach((b) => { b.hidden = isEmbed; });
    const { layout, width } = figureClasses(fig);
    $$('[data-fl]', figBar).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fl === layout)));
    $$('[data-fw]', figBar).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.fw) === width)));
    figBar.hidden = false;
    positionBars();
    handle.hidden = inGallery || isEmbed;
  }

  function deselectFigure() {
    if (!ctx) return;
    $$('.selected', ctx.doc).forEach((f) => f.classList.remove('selected'));
    ctx.selectedFigure = null;
    ctx.figBar.hidden = true;
    ctx.handle.hidden = true;
  }

  function positionBars() {
    if (!ctx) return;
    const tb = $('.toolbar', ctx.toolbar);
    const minTop = tb ? tb.getBoundingClientRect().bottom + 6 : 70;
    const fig = ctx.selectedFigure;
    if (fig && fig.isConnected) {
      const r = fig.getBoundingClientRect();
      const bar = ctx.figBar;
      bar.style.top = `${scrollY + Math.max(r.top - bar.offsetHeight - 6, minTop)}px`;
      bar.style.left = `${scrollX + Math.max(8, Math.min(r.left, innerWidth - bar.offsetWidth - 8))}px`;
      ctx.handle.style.top = `${scrollY + r.bottom - 9}px`;
      ctx.handle.style.left = `${scrollX + r.right - 9}px`;
    }
    const blk = ctx.activeBlock;
    if (blk && blk.isConnected && !ctx.blockBar.hidden) {
      const r = blk.getBoundingClientRect();
      const bar = ctx.blockBar;
      bar.style.top = `${scrollY + Math.max(r.top - bar.offsetHeight - 6, minTop)}px`;
      bar.style.left = `${scrollX + Math.max(8, Math.min(r.left, innerWidth - bar.offsetWidth - 8))}px`;
    }
  }

  async function figureAction(act) {
    const fig = ctx.selectedFigure;
    if (!fig) return;
    if (act === 'caption') {
      const cur = fig.querySelector('figcaption');
      const text = await ctx.ask('Caption', 'Shown under the image', cur ? cur.textContent : '');
      if (text === null) return;
      if (!text.trim()) { if (cur) cur.remove(); } else if (cur) cur.textContent = text.trim();
      else { const c = document.createElement('figcaption'); c.textContent = text.trim(); fig.appendChild(c); }
    }
    if (act === 'alt') {
      const img = fig.querySelector('img');
      const text = await ctx.ask('Describe the image', 'Alt text', img.alt, 'Read aloud by screen readers and used by Google. Say what the image shows.');
      if (text === null) return;
      img.alt = text.trim();
    }
    if (act === 'replace') {
      const picked = await ctx.pickMedia({ multiple: false, title: 'Replace with…' });
      if (!picked || !picked.length) return;
      const old = fig.querySelector('img, video');
      const tpl = document.createElement('template');
      tpl.innerHTML = mediaHtml(picked[0]);
      const media = tpl.content.firstChild;
      if (old.alt && media.tagName === 'IMG') media.alt = old.alt;
      old.replaceWith(media);
    }
    if (act === 'up' || act === 'down') {
      const gallery = fig.closest('.md-gallery');
      const unit = gallery && gallery.children.length > 1 ? fig : (gallery || fig);
      const sib = act === 'up' ? unit.previousElementSibling : unit.nextElementSibling;
      if (sib) { if (act === 'up') sib.before(unit); else sib.after(unit); }
    }
    if (act === 'remove') {
      const gallery = fig.closest('.md-gallery');
      fig.remove();
      if (gallery && !gallery.querySelector('figure')) gallery.remove();
      deselectFigure();
      ctx.markDirty();
      return;
    }
    ctx.markDirty();
    selectFigure(fig);
  }

  // Drag the round handle at the corner to resize; it snaps to sensible widths.
  function startResize(e) {
    const fig = ctx.selectedFigure;
    if (!fig) return;
    e.preventDefault();
    const box = (fig.closest('.split > div') || ctx.doc).getBoundingClientRect();
    const left = fig.getBoundingClientRect().left;
    const tip = ctx.resizeTip;
    tip.hidden = false;
    const move = (ev) => {
      const pct = ((ev.clientX - left) / box.width) * 100;
      const snap = WIDTHS.reduce((a, b) => (Math.abs(b - pct) < Math.abs(a - pct) ? b : a));
      tip.textContent = `${snap}%`;
      tip.style.top = `${scrollY + ev.clientY + 14}px`;
      tip.style.left = `${scrollX + ev.clientX + 14}px`;
      if (!fig.classList.contains(`w-${snap}`) && !(snap === 100 && fig.classList.contains('img-wide'))) setFigureWidth(fig, snap);
    };
    const up = () => {
      tip.hidden = true;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  // Figures, videos and other blocks can be dragged to any spot in the article.
  let dragging = null;
  function onDragStart(e) {
    const el = e.target.closest && e.target.closest('figure, .embed, .pdf-embed, .md-gallery, table, .spec-grid');
    if (!el || !ctx.doc.contains(el)) return;
    const unit = el.tagName === 'FIGURE' && el.closest('.md-gallery') && e.altKey ? el.closest('.md-gallery') : el;
    dragging = unit;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/x-cms-block', '1');
    unit.classList.add('dragging');
  }
  function dropTarget(e) {
    // Find the block under the pointer and whether to drop before or after it.
    const { doc } = ctx;
    let el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || !doc.contains(el) || el === doc) {
      const kids = [...doc.children];
      const last = kids[kids.length - 1];
      return last ? { ref: last, after: true } : null;
    }
    // Dropping onto an image inside a gallery moves it within the gallery.
    const galleryFig = el.closest('.md-gallery > figure');
    if (galleryFig && dragging && dragging.tagName === 'FIGURE' && dragging !== galleryFig) {
      const r = galleryFig.getBoundingClientRect();
      return { ref: galleryFig, after: e.clientX > r.left + r.width / 2 };
    }
    const column = el.closest('.split > div');
    const parent = column && doc.contains(column) ? column : doc;
    while (el.parentElement && el.parentElement !== parent) el = el.parentElement;
    if (el === dragging || (dragging && dragging.contains(el))) return null;
    const r = el.getBoundingClientRect();
    return { ref: el, after: e.clientY > r.top + r.height / 2 };
  }
  function onDragOver(e) {
    const types = [...e.dataTransfer.types];
    if (types.includes('Files')) { e.preventDefault(); return; }
    if (!dragging) return;
    e.preventDefault();
    const t = dropTarget(e);
    const line = ctx.dropLine;
    if (!t) { line.hidden = true; return; }
    const r = t.ref.getBoundingClientRect();
    const horizontal = t.ref.parentElement && t.ref.parentElement.classList.contains('md-gallery');
    line.hidden = false;
    line.classList.toggle('vertical', horizontal);
    if (horizontal) {
      line.style.top = `${scrollY + r.top}px`;
      line.style.left = `${scrollX + (t.after ? r.right + 4 : r.left - 6)}px`;
      line.style.width = '3px';
      line.style.height = `${r.height}px`;
    } else {
      line.style.top = `${scrollY + (t.after ? r.bottom + 4 : r.top - 6)}px`;
      line.style.left = `${scrollX + r.left}px`;
      line.style.width = `${r.width}px`;
      line.style.height = '3px';
    }
  }
  function onDrop(e) {
    ctx.dropLine.hidden = true;
    const files = [...e.dataTransfer.files].filter((f) => /^(image|video)\//.test(f.type) || /\.pdf$/i.test(f.name));
    if (files.length) {
      e.preventDefault();
      const pos = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
      uploadFiles(files, pos);
      return;
    }
    if (!dragging) return;
    e.preventDefault();
    const t = dropTarget(e);
    const moved = dragging;
    endDrag();
    if (!t) return;
    const oldGallery = moved.closest('.md-gallery');
    if (t.after) t.ref.after(moved); else t.ref.before(moved);
    // A figure pulled out of a gallery becomes a normal image again.
    if (moved.tagName === 'FIGURE' && !moved.closest('.md-gallery') && !figureClasses(moved).layout) moved.classList.add('img-wide');
    if (moved.tagName === 'FIGURE' && moved.closest('.md-gallery')) LAYOUTS.concat(WIDTHS.map((w) => `w-${w}`)).forEach((c) => moved.classList.remove(c));
    if (oldGallery && oldGallery !== moved && !oldGallery.querySelector('figure')) oldGallery.remove();
    ensureTrailingParagraph();
    ctx.markDirty();
    if (moved.tagName === 'FIGURE') selectFigure(moved);
  }
  function endDrag() {
    if (dragging) dragging.classList.remove('dragging');
    dragging = null;
    if (ctx) ctx.dropLine.hidden = true;
  }

  // ---------- Block bar: tables, spec cards, columns ----------
  function blockBarFor(el) {
    if (el.closest('table')) {
      return { el: el.closest('table'), html: `
        <button type="button" data-ba="row-above">＋ Row above</button><button type="button" data-ba="row-below">＋ Row below</button>
        <button type="button" data-ba="col-left">＋ Col left</button><button type="button" data-ba="col-right">＋ Col right</button>
        <button type="button" data-ba="row-del">− Row</button><button type="button" data-ba="col-del">− Col</button>
        <button type="button" data-ba="head">Header row</button>
        <button type="button" data-ba="remove" class="danger">Delete table</button>` };
    }
    if (el.closest('.spec-grid')) {
      return { el: el.closest('.spec-grid'), html: `
        <button type="button" data-ba="spec-add">＋ Spec</button><button type="button" data-ba="spec-del">− This spec</button>
        <button type="button" data-ba="remove" class="danger">Delete cards</button>` };
    }
    if (el.closest('.split')) {
      return { el: el.closest('.split'), html: `
        <button type="button" data-ba="swap">⇄ Swap columns</button>
        <button type="button" data-ba="unsplit">Back to one column</button>
        <button type="button" data-ba="remove" class="danger">Delete columns</button>` };
    }
    if (el.closest('pre')) {
      return { el: el.closest('pre'), html: `
        <span class="bar-label">Code block · Tab indents</span>
        <button type="button" data-ba="exit">Continue below ↵</button>
        <button type="button" data-ba="remove" class="danger">Delete</button>` };
    }
    return null;
  }

  function showBlockBar(el) {
    const info = blockBarFor(el);
    const bar = ctx.blockBar;
    if (!info) { hideBlockBar(); return; }
    if (ctx.activeBlock === info.el && !bar.hidden) { positionBars(); return; }
    ctx.activeBlock = info.el;
    bar.innerHTML = info.html;
    bar.hidden = false;
    positionBars();
  }

  function hideBlockBar() {
    if (!ctx) return;
    ctx.blockBar.hidden = true;
    ctx.activeBlock = null;
  }

  function blockAction(act) {
    const blk = ctx.activeBlock;
    if (!blk) return;
    const r = currentRange();
    const at = r && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement);
    if (act === 'remove') {
      const next = blk.nextElementSibling;
      blk.remove();
      hideBlockBar();
      if (next) placeCaret(next);
      ensureTrailingParagraph();
      ctx.markDirty();
      return;
    }
    if (blk.tagName === 'TABLE') {
      const cell = at && at.closest('td,th');
      const row = cell ? cell.parentElement : blk.querySelector('tr');
      const index = cell ? [...row.children].indexOf(cell) : 0;
      const cols = row.children.length;
      const rows = $$('tr', blk);
      if (act === 'row-above' || act === 'row-below') {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td><br></td>'.repeat(cols);
        if (row.parentElement.tagName === 'THEAD') blk.tBodies[0] ? blk.tBodies[0].prepend(tr) : blk.appendChild(tr);
        else if (act === 'row-above') row.before(tr); else row.after(tr);
        placeCaret(tr.children[Math.min(index, cols - 1)]);
      }
      if (act === 'col-left' || act === 'col-right') {
        rows.forEach((tr) => {
          const ref = tr.children[index];
          const c = document.createElement(tr.parentElement.tagName === 'THEAD' ? 'th' : 'td');
          c.innerHTML = '<br>';
          if (act === 'col-left') ref.before(c); else ref.after(c);
        });
      }
      if (act === 'row-del' && rows.length > 1) { row.remove(); }
      if (act === 'col-del' && cols > 1) rows.forEach((tr) => tr.children[index] && tr.children[index].remove());
      if (act === 'head') {
        const thead = blk.tHead;
        if (thead) {
          const tr = thead.rows[0];
          const nr = document.createElement('tr');
          [...tr.children].forEach((th) => { const td = document.createElement('td'); td.append(...th.childNodes); nr.appendChild(td); });
          (blk.tBodies[0] || blk.createTBody()).prepend(nr);
          thead.remove();
        } else {
          const first = blk.querySelector('tr');
          const th = document.createElement('thead');
          const nr = document.createElement('tr');
          [...first.children].forEach((td) => { const h = document.createElement('th'); h.append(...td.childNodes); nr.appendChild(h); });
          th.appendChild(nr);
          first.remove();
          blk.prepend(th);
        }
      }
    }
    if (blk.classList.contains('spec-grid')) {
      if (act === 'spec-add') {
        const s = document.createElement('div');
        s.className = 'spec';
        s.innerHTML = '<div class="k">Label</div><div class="v">Value</div>';
        blk.appendChild(s);
        const r2 = document.createRange();
        r2.selectNodeContents(s.firstChild);
        getSelection().removeAllRanges();
        getSelection().addRange(r2);
      }
      if (act === 'spec-del') {
        const spec = at && at.closest('.spec');
        if (spec) spec.remove();
        if (!blk.querySelector('.spec')) { blk.remove(); hideBlockBar(); }
      }
    }
    if (blk.classList.contains('split')) {
      const [a, b] = blk.children;
      if (act === 'swap' && a && b) blk.insertBefore(b, a);
      if (act === 'unsplit') {
        const frag = document.createDocumentFragment();
        [...blk.children].forEach((col) => frag.append(...col.childNodes));
        blk.replaceWith(frag);
        hideBlockBar();
      }
    }
    if (blk.tagName === 'PRE' && act === 'exit') {
      let next = blk.nextElementSibling;
      if (!next || next.tagName !== 'P') { next = document.createElement('p'); next.innerHTML = '<br>'; blk.after(next); }
      placeCaret(next);
      hideBlockBar();
    }
    ctx.markDirty();
    positionBars();
  }

  // ---------- Toolbar state ----------
  function updateState() {
    if (!ctx) return;
    const sel = getSelection();
    if (!sel.rangeCount || !ctx.doc.contains(sel.anchorNode)) return;
    saveSelection();
    const el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    const tb = ctx.toolbar;
    const block = el.closest('h2,h3,h4,blockquote,pre,p,li');
    const tag = block ? block.tagName.toLowerCase() : 'p';
    $('[data-ctl="block"]', tb).value = ['h2', 'h3', 'h4', 'blockquote', 'pre'].includes(tag) ? tag : 'p';
    const sizeEl = el.closest('.fs-sm,.fs-lg,.fs-xl');
    $('[data-ctl="size"]', tb).value = sizeEl && ctx.doc.contains(sizeEl) ? SIZES.find(([c]) => c && sizeEl.classList.contains(c))[0] : '';
    for (const cmd of ['bold', 'italic', 'underline', 'strikeThrough', 'superscript', 'subscript', 'insertUnorderedList', 'insertOrderedList']) {
      const b = $(`[data-cmd="${cmd}"]`, tb);
      if (b) b.setAttribute('aria-pressed', String(document.queryCommandState(cmd)));
    }
    const alignEl = el.closest('p,h2,h3,h4,blockquote,li,td,th');
    const a = alignEl ? ['ta-center', 'ta-right', 'ta-justify'].find((c) => alignEl.classList.contains(c)) || '' : '';
    $$('[data-align]', tb).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.align === a)));
    const colorEl = el.closest(COLORS.filter(([c]) => c).map(([c]) => `.${c}`).join(','));
    const color = colorEl ? COLORS.find(([c]) => c && colorEl.classList.contains(c)) : COLORS[0];
    $('.a-color', tb).style.borderBottomColor = color[2];
    $('[data-act="mark"]', tb).setAttribute('aria-pressed', String(!!el.closest('mark')));
    $('[data-act="code"]', tb).setAttribute('aria-pressed', String(!!el.closest('code:not(pre code)')));
    if (!ctx.selectedFigure) showBlockBar(el);
  }

  function closeMenus() {
    if (!ctx) return;
    $$('.menu', ctx.toolbar).forEach((m) => { m.hidden = true; });
    $$('[data-menu]', ctx.toolbar).forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }

  // Typing "## " at the start of a line makes a heading, "- " a list, and so on.
  function markdownShortcut(at) {
    const p = at && at.closest('p');
    if (!p || p.closest('li,td,th,.callout,.note,summary,details') || p.classList.length) return false;
    const r = currentRange();
    if (!r || !r.collapsed) return false;
    const before = document.createRange();
    before.selectNodeContents(p);
    before.setEnd(r.startContainer, r.startOffset);
    const typed = before.toString();
    const map = { '#': 'h2', '##': 'h3', '###': 'h4', '>': 'blockquote', '-': 'ul', '*': 'ul', '1.': 'ol', '```': 'pre', '---': 'hr' };
    const tag = map[typed];
    if (!tag || p.textContent !== typed) return false;
    p.textContent = '';
    p.innerHTML = '<br>';
    placeCaret(p);
    if (tag === 'ul') exec('insertUnorderedList');
    else if (tag === 'ol') exec('insertOrderedList');
    else if (tag === 'hr') { const hr = document.createElement('hr'); p.before(hr); }
    else setBlock(tag);
    ctx.markDirty();
    return true;
  }

  // ---------- Clean-up ----------
  const KEEP = new Set(['DETAILS', 'SUMMARY', 'P', 'H2', 'H3', 'H4', 'STRONG', 'EM', 'U', 'S', 'A', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'HR', 'BR', 'FIGURE', 'FIGCAPTION', 'IMG', 'VIDEO', 'DIV', 'SPAN', 'MARK', 'SUP', 'SUB', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD']);
  const RENAME = { B: 'strong', I: 'em', H1: 'h2', H5: 'h4', H6: 'h4', STRIKE: 's', DEL: 's' };
  const DROP = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'IFRAME', 'OBJECT', 'SVG', 'NOSCRIPT', 'TEMPLATE', 'FORM', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT']);
  const ATTRS = { A: ['href'], DETAILS: ['open'], IMG: ['src', 'alt'], VIDEO: ['src', 'controls', 'loop', 'muted', 'playsinline', 'autoplay', 'poster', 'aria-label'], DIV: ['data-youtube', 'data-pdf'] };
  const CLASS_OK = /^(md-gallery|img-(wide|left|right|center|small)|w-(25|33|50|66|75|100)|fs-(sm|lg|xl)|c-(accent|blue|muted|white|green|amber|red)|ta-(center|right|justify)|callout|callout-ok|callout-warn|btn-link|file-card|pdf-embed|note|spec-grid|spec|k|v|split|media-box|embed|tag|muted)$/;

  function cleanHtml(html) {
    const d = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 8) { child.remove(); continue; }
        if (child.nodeType !== 1) continue;
        if (DROP.has(child.tagName)) { child.remove(); continue; }
        walk(child);
        let el = child;
        if (RENAME[el.tagName]) {
          const n = d.createElement(RENAME[el.tagName]);
          n.append(...el.childNodes);
          [...el.attributes].forEach((a) => n.setAttribute(a.name, a.value));
          el.replaceWith(n);
          el = n;
        }
        const style = el.getAttribute('style') || '';
        if (el.tagName === 'SPAN' && /font-weight:\s*(bold|[6-9]00)/.test(style)) {
          const n = d.createElement('strong'); n.append(...el.childNodes); el.replaceWith(n); el = n;
        } else if (el.tagName === 'SPAN' && /font-style:\s*italic/.test(style)) {
          const n = d.createElement('em'); n.append(...el.childNodes); el.replaceWith(n); el = n;
        }
        if (!KEEP.has(el.tagName)) { el.replaceWith(...el.childNodes); continue; }
        const allowed = ATTRS[el.tagName] || [];
        const classes = (el.getAttribute('class') || '').split(/\s+/).filter((c) => CLASS_OK.test(c));
        for (const a of [...el.attributes]) if (!allowed.includes(a.name)) el.removeAttribute(a.name);
        if (classes.length) el.className = classes.join(' ');
        if (el.tagName === 'SPAN' && !el.classList.length) { el.replaceWith(...el.childNodes); continue; }
        if (el.tagName === 'DIV' && !el.classList.length && !(el.parentElement && el.parentElement.classList.contains('split'))) {
          const hasBlocks = [...el.children].some((c) => /^(P|H[2-4]|UL|OL|BLOCKQUOTE|PRE|FIGURE|DIV|TABLE|HR)$/.test(c.tagName));
          if (hasBlocks) { el.replaceWith(...el.childNodes); continue; }
          const p = d.createElement('p'); p.append(...el.childNodes); el.replaceWith(p); el = p;
        }
        if (el.tagName === 'A' && /^\s*javascript:/i.test(el.getAttribute('href') || '')) el.removeAttribute('href');
      }
    };
    walk(d.body);
    return d.body.innerHTML;
  }

  // Repair structure the browser sometimes produces (paragraphs inside headings,
  // stray text, empty styling spans) so the saved page stays tidy.
  function normalize(root) {
    $$('h2,h3,h4,p', root).forEach((h) => {
      const blocks = $$(':scope > p, :scope > div, :scope > h2, :scope > h3, :scope > h4, :scope > ul, :scope > ol, :scope > blockquote', h);
      if (blocks.length) h.replaceWith(...h.childNodes);
    });
    [...root.childNodes].forEach((n) => {
      if (n.nodeType === 3 && n.textContent.trim()) {
        const p = document.createElement('p');
        n.replaceWith(p);
        p.appendChild(n);
      }
    });
    $$('span:not([class])', root).forEach(unwrap);
    $$('font', root).forEach(unwrap);
  }

  function ensureTrailingParagraph() {
    const last = ctx.doc.lastElementChild;
    if (!last || last.tagName !== 'P') {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      ctx.doc.appendChild(p);
    }
  }

  // Editor-only decoration: non-editable media blocks, drag handles, video previews.
  function prepare(root) {
    $$('figure', root).forEach((f) => { f.setAttribute('contenteditable', 'false'); f.setAttribute('draggable', 'true'); });
    $$('.md-gallery', root).forEach((g) => g.setAttribute('contenteditable', 'false'));
    $$('details', root).forEach((d) => d.setAttribute('open', ''));
    $$('table, .spec-grid', root).forEach((t) => t.setAttribute('draggable', 'false'));
    $$('video', root).forEach((v) => { v.muted = true; v.removeAttribute('autoplay'); });
    $$('.pdf-embed', root).forEach((pe) => {
      pe.setAttribute('contenteditable', 'false');
      pe.setAttribute('draggable', 'true');
      if (!pe.querySelector('[data-preview]')) {
        pe.innerHTML = `<span class="pdf-label" data-preview>📄 PDF shown in the page: ${esc(decodeURI(pe.getAttribute('data-pdf') || '').replace(/^files\//, ''))}</span>`;
      }
    });
    $$('.embed', root).forEach((em) => {
      em.setAttribute('contenteditable', 'false');
      em.setAttribute('draggable', 'true');
      const id = em.getAttribute('data-youtube');
      if (!em.querySelector('img') && id) {
        em.innerHTML = `<img src="https://img.youtube.com/vi/${esc(id)}/hqdefault.jpg" alt="" data-preview><span class="embed-label" data-preview>▶ YouTube video</span>`;
      }
    });
  }

  function getHTML() {
    const clone = ctx.doc.cloneNode(true);
    $$('[contenteditable]', clone).forEach((el) => el.removeAttribute('contenteditable'));
    $$('[draggable]', clone).forEach((el) => el.removeAttribute('draggable'));
    $$('[data-preview]', clone).forEach((el) => el.remove());
    $$('details', clone).forEach((d) => d.removeAttribute('open'));
    $$('.selected, .dragging', clone).forEach((el) => el.classList.remove('selected', 'dragging'));
    $$('[class=""]', clone).forEach((el) => el.removeAttribute('class'));
    normalize(clone);
    // Drop empty trailing paragraphs.
    while (clone.lastElementChild && clone.lastElementChild.tagName === 'P' && !clone.lastElementChild.textContent.trim() && !clone.lastElementChild.querySelector('img')) {
      clone.lastElementChild.remove();
    }
    return cleanHtml(clone.innerHTML);
  }

  // ---------- Mount ----------
  function mount(opts) {
    unmount();
    const { doc, toolbar } = opts;
    toolbar.innerHTML = toolbarHtml();
    const figBar = document.createElement('div');
    figBar.className = 'float-bar figure-bar';
    figBar.setAttribute('role', 'toolbar');
    figBar.setAttribute('aria-label', 'Image options');
    figBar.hidden = true;
    figBar.innerHTML = figureBarHtml();
    const blockBar = document.createElement('div');
    blockBar.className = 'float-bar block-bar';
    blockBar.setAttribute('role', 'toolbar');
    blockBar.hidden = true;
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    handle.title = 'Drag to resize';
    handle.hidden = true;
    const resizeTip = document.createElement('div');
    resizeTip.className = 'resize-tip';
    resizeTip.hidden = true;
    const dropLine = document.createElement('div');
    dropLine.className = 'drop-line';
    dropLine.hidden = true;
    document.body.append(figBar, blockBar, handle, resizeTip, dropLine);

    ctx = { ...opts, figBar, blockBar, handle, resizeTip, dropLine, selectedFigure: null, activeBlock: null, listeners: [] };
    const on = (target, type, fn, o) => { target.addEventListener(type, fn, o); ctx.listeners.push([target, type, fn, o]); };

    const tmp = document.createElement('div');
    tmp.innerHTML = cleanHtml(opts.html || '');
    normalize(tmp);
    doc.innerHTML = tmp.innerHTML || '<p><br></p>';
    prepare(doc);
    ensureTrailingParagraph();
    exec('defaultParagraphSeparator', 'p');
    exec('styleWithCSS', false);

    // Toolbar buttons keep the text selection (mousedown is cancelled).
    on(toolbar, 'mousedown', (e) => { if (e.target.closest('button') && !e.target.closest('select')) e.preventDefault(); });
    on(figBar, 'mousedown', (e) => e.preventDefault());
    on(blockBar, 'mousedown', (e) => e.preventDefault());

    on(toolbar, 'click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.menu) {
        const menu = $(`[data-menu-for="${b.dataset.menu}"]`, toolbar);
        const open = menu.hidden;
        closeMenus();
        saveSelection();
        menu.hidden = !open;
        b.setAttribute('aria-expanded', String(open));
        return;
      }
      if (b.dataset.color !== undefined) { closeMenus(); applyClass(b.dataset.color, COLORS.map(([c]) => c)); return; }
      if (b.dataset.insert) { insert(b.dataset.insert); return; }
      if (b.dataset.align !== undefined) { align(b.dataset.align); return; }
      if (b.dataset.cmd) {
        restoreSelection();
        if ((b.dataset.cmd === 'indent' || b.dataset.cmd === 'outdent') && !selectedBlocks('li').length) {
          ctx.toast('Indenting works inside lists.');
          return;
        }
        exec(b.dataset.cmd);
        ctx.markDirty();
        updateState();
        return;
      }
      const act = b.dataset.act;
      if (act === 'link') addLink();
      if (act === 'mark') toggleTag('mark');
      if (act === 'code') toggleTag('code');
      if (act === 'clear') {
        restoreSelection();
        exec('removeFormat');
        const made = wrapSelection(() => document.createElement('span'));
        made.forEach((s) => { $$('span, mark, code', s).forEach(unwrap); unwrap(s); });
        ctx.markDirty();
      }
    });
    on(toolbar, 'change', (e) => {
      const ctl = e.target.dataset.ctl;
      if (ctl === 'block') setBlock(e.target.value);
      if (ctl === 'size') applyClass(e.target.value, SIZES.map(([c]) => c));
      doc.focus({ preventScroll: true });
    });
    on(document, 'click', (e) => { if (!e.target.closest('.menu-wrap')) closeMenus(); });

    on(figBar, 'click', (e) => {
      const b = e.target.closest('button');
      if (!b || !ctx.selectedFigure) return;
      if (b.dataset.fl) setFigureLayout(ctx.selectedFigure, b.dataset.fl);
      if (b.dataset.fw) setFigureWidth(ctx.selectedFigure, Number(b.dataset.fw));
      if (b.dataset.fa) figureAction(b.dataset.fa);
    });
    on(blockBar, 'click', (e) => { const b = e.target.closest('button'); if (b && b.dataset.ba) blockAction(b.dataset.ba); });
    on(handle, 'pointerdown', startResize);

    on(doc, 'click', (e) => {
      const fig = e.target.closest('figure, .embed, .pdf-embed');
      if (fig && doc.contains(fig)) { e.preventDefault(); selectFigure(fig); return; }
      deselectFigure();
      updateState();
    });
    on(doc, 'input', () => { ctx.markDirty(); positionBars(); });
    on(document, 'selectionchange', () => { if (ctx && document.activeElement === doc) updateState(); });
    on(window, 'scroll', positionBars, { passive: true });
    on(window, 'resize', positionBars);

    on(doc, 'keydown', (e) => {
      const r = currentRange();
      const at = r && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement);
      const pre = at && at.closest('pre');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); addLink(); return; }
      if (ctx.selectedFigure && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); figureAction('remove'); return; }
      if (pre && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); exec('insertText', '\n'); return; }
      if (e.key === ' ' && !pre && markdownShortcut(at)) { e.preventDefault(); return; }
      // Clicking a summary in the editor shouldn't fold the section away.
      if (e.key === 'Enter' && at && at.closest('summary')) { e.preventDefault(); const d = at.closest('details'); const p = d.querySelector(':scope > p') || d.appendChild(Object.assign(document.createElement('p'), { innerHTML: '<br>' })); placeCaret(p); return; }
      if (e.key === 'Tab') {
        if (pre) { e.preventDefault(); exec('insertText', '  '); return; }
        const cell = at && at.closest('td,th');
        if (cell) {
          e.preventDefault();
          const cells = $$('td,th', cell.closest('table'));
          const next = cells[cells.indexOf(cell) + (e.shiftKey ? -1 : 1)];
          if (next) placeCaret(next);
          return;
        }
        if (at && at.closest('li')) { e.preventDefault(); exec(e.shiftKey ? 'outdent' : 'indent'); ctx.markDirty(); }
      }
    });

    on(doc, 'paste', (e) => {
      const cd = e.clipboardData;
      const files = [...cd.files].filter((f) => /^(image|video)\//.test(f.type) || /\.pdf$/i.test(f.name));
      e.preventDefault();
      if (files.length) { uploadFiles(files); return; }
      const r = currentRange();
      const inPre = r && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement).closest('pre');
      const text = cd.getData('text/plain').trim();
      // A YouTube link pasted on its own line becomes an embedded video.
      const block = r && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement).closest('p');
      if (!inPre && youtubeId(text) && /^https?:\/\//.test(text) && block && !block.textContent.trim()) {
        insertBlock(`<div class="embed" data-youtube="${youtubeId(text)}"></div><p><br></p>`);
        return;
      }
      const html = cd.getData('text/html');
      if (html && !inPre) {
        const tmpDiv = document.createElement('div');
        tmpDiv.innerHTML = cleanHtml(html);
        normalize(tmpDiv);
        exec('insertHTML', tmpDiv.innerHTML);
        prepare(doc);
      } else {
        exec('insertText', cd.getData('text/plain'));
      }
      ctx.markDirty();
    });

    on(doc, 'dragstart', onDragStart);
    on(doc, 'dragover', onDragOver);
    on(doc, 'drop', onDrop);
    on(document, 'dragend', endDrag);

    return { getHTML };
  }

  function unmount() {
    if (!ctx) return;
    ctx.listeners.forEach(([t, type, fn, o]) => t.removeEventListener(type, fn, o));
    [ctx.figBar, ctx.blockBar, ctx.handle, ctx.resizeTip, ctx.dropLine].forEach((el) => el.remove());
    ctx = null;
    savedRange = null;
  }

  window.CMSEditor = { mount, unmount };
})();
