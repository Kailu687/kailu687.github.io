// Portfolio CMS dashboard. Plain JavaScript, no build step.
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const view = $('#view');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TYPE_LABEL = { projects: ['Project', 'Projects'], blog: ['Blog post', 'Blog'] };
  const STATUS = {
    draft: ['Draft', 'Only you can see it, here in the dashboard.'],
    'coming-soon': ['Coming soon', 'A card shows on the home page, without a page yet.'],
    published: ['Published', 'Gets its own page on the site when you publish.'],
  };

  let state = { site: {}, projects: [], blog: [] };
  let dirty = false;
  let leaveGuard = null;

  // ---------- API ----------
  async function api(method, url, body, raw) {
    const opts = { method, headers: { 'X-CMS': '1' }, credentials: 'same-origin' };
    if (raw) { opts.body = raw; opts.headers['Content-Type'] = 'application/octet-stream'; }
    else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function toast(msg, isErr) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('err', !!isErr);
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), isErr ? 6000 : 2800);
  }

  function reportBuild(build) {
    if (!build) return;
    if (build.error) toast(`Saved, but the site could not be rebuilt: ${build.error}`, true);
    else if (build.skipped && build.skipped.length) toast(`Saved. Not written: ${build.skipped.join('; ')}`, true);
  }

  async function refresh() {
    state = await api('GET', '/api/overview');
    refreshPublishCount();
  }

  async function refreshPublishCount() {
    try {
      const st = await api('GET', '/api/publish');
      const n = st.ok ? st.files.filter((f) => f.publish).length + (st.ahead ? 1 : 0) : 0;
      const badge = $('#publish-count');
      badge.hidden = !n;
      badge.textContent = n;
      $('#publish-btn').title = n ? `${n} change${n > 1 ? 's' : ''} waiting to go live` : 'Everything is live';
    } catch { /* git not available yet */ }
  }

  // ---------- Router ----------
  const routes = [
    [/^#?\/?$/, renderDashboard],
    [/^#\/(projects|blog)$/, (m) => renderList(m[1])],
    [/^#\/(projects|blog)\/new$/, (m) => renderEditor(m[1], null)],
    [/^#\/(projects|blog)\/edit\/([a-z0-9_-]+)$/, (m) => renderEditor(m[1], m[2])],
    [/^#\/settings$/, renderSettings],
    [/^#\/home$/, renderHome],
  ];

  async function route() {
    if (leaveGuard && !leaveGuard()) return;
    leaveGuard = null;
    dirty = false;
    if (window.CMSEditor) CMSEditor.unmount();
    document.body.classList.remove('focus-mode');
    const hash = location.hash || '#/';
    $$('.topnav a').forEach((a) => {
      const target = a.getAttribute('href');
      const on = target === '#/' ? hash === '#/' || hash === '' : hash.startsWith(target);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    for (const [re, fn] of routes) {
      const m = hash.match(re);
      if (m) {
        try { await fn(m); } catch (err) { view.innerHTML = `<div class="notice err">${esc(err.message)}</div>`; }
        view.focus({ preventScroll: true });
        return;
      }
    }
    location.hash = '#/';
  }

  let lastHash = location.hash;
  window.addEventListener('hashchange', (e) => {
    if (dirty && !confirm('You have unsaved changes. Leave without saving?')) {
      history.replaceState(null, '', lastHash || '#/');
      return;
    }
    dirty = false;
    lastHash = location.hash;
    route();
  });
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- Dashboard ----------
  async function renderDashboard() {
    await refresh();
    const all = [...state.projects, ...state.blog];
    const count = (s) => all.filter((e) => e.status === s).length;
    const site = state.site;
    view.innerHTML = `
      <div class="page-title"><div><h1>Hey ${esc(site.author || 'there')} 👋</h1><p>What are you documenting today?</p></div></div>
      <div class="grid">
        <a class="card big-action" href="#/projects/new"><strong>＋ New project</strong><span class="muted">Specs, build logs, images, diagrams and GIFs.</span></a>
        <a class="card big-action" href="#/blog/new"><strong>＋ New blog post</strong><span class="muted">Write it like a document, drop images anywhere.</span></a>
        <a class="card big-action" href="#/home"><strong>✎ Edit home page</strong><span class="muted">Tagline, typing phrases, About, contact links.</span></a>
        <div class="card"><h2>Your content</h2>
          <p><b style="color:#fff">${count('published')}</b> published · <b style="color:#fff">${count('coming-soon')}</b> coming soon · <b style="color:#fff">${count('draft')}</b> drafts</p>
          <div class="row" style="margin-top:12px"><a class="btn small" href="#/projects">Projects</a><a class="btn small" href="#/blog">Blog</a></div>
        </div>
      </div>

      <div class="grid section-gap">
        <div class="card stack"><h2>Analytics</h2>
          <p>Your site reports visits to Google Analytics as <code>${esc(site.gaId || 'not set')}</code>. Reports open in Google's own dashboard, so no Google password is ever stored here.</p>
          <div class="row">
            <a class="btn small" href="${esc(site.analyticsUrl || 'https://analytics.google.com/')}" target="_blank" rel="noopener">Open Analytics</a>
            <a class="btn small ghost" href="${esc(site.searchConsoleUrl || 'https://search.google.com/search-console')}" target="_blank" rel="noopener">Search Console</a>
          </div>
        </div>
        <div class="card stack"><h2>Site check</h2><ul class="checks" id="health"><li class="bad">Checking…</li></ul></div>
        <div class="card stack"><h2>Going live</h2>
          <p><b style="color:#fff">Save</b> keeps your work on this laptop. <b style="color:#fff">Preview</b> shows the page exactly as visitors will see it. <b style="color:#fff">Publish</b> sends everything to <a href="${esc(site.siteUrl)}" target="_blank" rel="noopener">${esc((site.siteUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>.</p>
          <div class="row"><button class="btn small primary" type="button" data-open-publish>Review and publish</button></div>
        </div>
      </div>

      <h2 class="section-gap" style="color:#fff;font-size:18px;margin-bottom:12px">Recently edited</h2>
      <div class="entries">${entriesHtml(all.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6))}</div>`;
    $('[data-open-publish]', view).addEventListener('click', openPublish);
    loadHealth();
  }

  async function loadHealth() {
    const box = $('#health');
    try {
      const h = await api('GET', '/api/health');
      box.innerHTML = h.checks.map((c) => `<li class="${c.ok ? '' : 'bad'}">${esc(c.text)}</li>`).join('');
    } catch (err) {
      box.innerHTML = `<li class="bad">${esc(err.message)}</li>`;
    }
  }

  function entriesHtml(list) {
    if (!list.length) return '<div class="empty">Nothing here yet.</div>';
    return list.map((e) => {
      const live = e.status === 'published' ? `<a class="btn small ghost" href="/site/${esc(e.slug)}.html" target="_blank" rel="noopener">Local page</a>` : '';
      return `<div class="entry">
        <div class="info"><a href="#/${e.type}/edit/${esc(e.slug)}">${esc(e.title)}</a><p>${esc(TYPE_LABEL[e.type][0])}${e.date ? ' · ' + esc(e.date) : ''}${e.summary ? ' · ' + esc(e.summary) : ''}</p></div>
        <span class="chip ${e.status}">${STATUS[e.status][0]}</span>
        <a class="btn small ghost" href="/preview/${e.type}/${esc(e.slug)}" target="_blank" rel="noopener">Preview</a>
        ${live}
        <a class="btn small" href="#/${e.type}/edit/${esc(e.slug)}">Edit</a>
      </div>`;
    }).join('');
  }

  // ---------- Lists ----------
  async function renderList(type) {
    await refresh();
    const [one, many] = TYPE_LABEL[type];
    view.innerHTML = `
      <div class="page-title"><div><h1>${many}</h1><p>${type === 'projects'
        ? 'Cards show on the home page in this order. Set "Order" in a project to move it.'
        : 'Newest posts show first on the home page.'}</p></div>
        <a class="btn primary" href="#/${type}/new">＋ New ${one.toLowerCase()}</a></div>
      <div class="entries">${entriesHtml(state[type])}</div>`;
  }

  // ---------- Home page ----------
  async function renderHome() {
    await refresh();
    const h = await api('GET', '/api/home');
    const contacts = h.contacts || [];
    const lines = (a) => esc((a || []).join('\n'));
    view.innerHTML = `
      <div class="page-title"><div><h1>Home page</h1><p>Everything visitors see first. Projects and blog cards update by themselves from your posts.</p></div>
        <div class="row"><a class="btn ghost" href="/site/" target="_blank" rel="noopener">View local site</a><button class="btn primary" type="button" id="home-save">Save</button></div></div>
      <div class="home-grid">
        <section class="card stack">
          <h2>Top of the page</h2>
          <label class="field"><span class="label">Tagline</span><input class="input" id="h-eyebrow" value="${esc(h.eyebrow)}" maxlength="160"><small>The small line above the big heading.</small></label>
          <label class="field"><span class="label">Typing phrases</span><textarea class="input" id="h-typing" rows="5">${lines(h.typing)}</textarea><small>One per line. The heading types each one out in turn.</small></label>
          <label class="field"><span class="label">Intro</span><textarea class="input" id="h-lead" rows="3" maxlength="400">${esc(h.lead)}</textarea></label>
          <label class="field"><span class="label">Loading screen messages</span><textarea class="input" id="h-loader" rows="5">${lines(h.loader)}</textarea><small>One per line, shown on the terminal-style loader.</small></label>
        </section>
        <section class="card stack">
          <h2>About</h2>
          <div id="toolbar-slot"></div>
          <div id="doc" class="doc doc-small" contenteditable="true" role="textbox" aria-multiline="true" aria-label="About text"></div>
          <label class="field"><span class="label">Interests</span><input class="input" id="h-interests" value="${esc((h.interests || []).join(', '))}"><small>Separate with commas. They show as tags under the About text.</small></label>
        </section>
        <section class="card stack">
          <h2>Contact</h2>
          <label class="field"><span class="label">Intro line</span><input class="input" id="h-contact-intro" value="${esc(h.contactIntro)}" maxlength="300"></label>
          <div class="field"><span class="label">Ways to reach you</span>
            <div id="contacts" class="contacts"></div>
            <button class="btn small" type="button" id="add-contact">＋ Add a link</button>
            <small>Links can be https://…, mailto:you@example.com or tel:+91….</small>
          </div>
        </section>
        <section class="card stack">
          <h2>Search and sharing</h2>
          <label class="field"><span class="label">Page title</span><input class="input" id="h-title" value="${esc(h.pageTitle)}" maxlength="120"><small>Shown in the browser tab and as the Google headline.</small></label>
          <label class="field"><span class="label">Google description</span><textarea class="input" id="h-desc" rows="3" maxlength="320">${esc(h.description)}</textarea></label>
          <label class="field"><span class="label">Link preview text</span><textarea class="input" id="h-share" rows="2" maxlength="320">${esc(h.shareDescription)}</textarea><small>Shown when the site is shared on LinkedIn or WhatsApp.</small></label>
        </section>
      </div>`;

    const markDirty = () => { dirty = true; };
    leaveGuard = () => !dirty || confirm('You have unsaved changes. Leave without saving?');
    const editor = CMSEditor.mount({ doc: $('#doc'), toolbar: $('#toolbar-slot'), html: h.about || '', markDirty, pickMedia, upload, ask, toast });

    const box = $('#contacts');
    const row = (c = {}) => {
      const d = document.createElement('div');
      d.className = 'contact-row';
      d.innerHTML = `<input class="input" data-k="label" placeholder="Label" value="${esc(c.label)}" aria-label="Label">
        <input class="input" data-k="text" placeholder="What it shows" value="${esc(c.text)}" aria-label="Text shown">
        <input class="input" data-k="link" placeholder="https://…" value="${esc(c.link)}" aria-label="Link">
        <button class="btn small ghost" type="button" data-up title="Move up" aria-label="Move up">↑</button>
        <button class="btn small danger" type="button" data-del title="Remove" aria-label="Remove">✕</button>`;
      d.querySelector('[data-del]').onclick = () => { d.remove(); markDirty(); };
      d.querySelector('[data-up]').onclick = () => { if (d.previousElementSibling) { d.previousElementSibling.before(d); markDirty(); } };
      box.appendChild(d);
    };
    contacts.forEach(row);
    $('#add-contact').onclick = () => { row(); markDirty(); };
    view.addEventListener('input', markDirty);

    const save = async () => {
      const split = (id) => $(id).value.split('\n').map((s) => s.trim()).filter(Boolean);
      const data = {
        eyebrow: $('#h-eyebrow').value, typing: split('#h-typing'), lead: $('#h-lead').value, loader: split('#h-loader'),
        about: editor.getHTML(), interests: $('#h-interests').value.split(',').map((s) => s.trim()).filter(Boolean),
        contactIntro: $('#h-contact-intro').value,
        contacts: $$('.contact-row', box).map((r) => Object.fromEntries($$('input', r).map((i) => [i.dataset.k, i.value.trim()]))),
        pageTitle: $('#h-title').value, description: $('#h-desc').value, shareDescription: $('#h-share').value,
      };
      $('#home-save').disabled = true;
      try {
        const r = await api('PUT', '/api/home', data);
        dirty = false;
        reportBuild(r.build);
        toast('Home page saved. Publish when you are ready.');
        refreshPublishCount();
      } catch (err) { toast(err.message, true); } finally { $('#home-save').disabled = false; }
    };
    $('#home-save').onclick = save;
    document.onkeydown = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's' && $('#home-save')) { e.preventDefault(); save(); } };
  }

  // ---------- Settings ----------
  async function renderSettings() {
    await refresh();
    const s = state.site;
    const field = (k, label, help) => `<label class="field"><span class="label">${label}</span><input class="input" name="${k}" value="${esc(s[k] || '')}">${help ? `<small>${help}</small>` : ''}</label>`;
    view.innerHTML = `
      <div class="page-title"><div><h1>Settings</h1><p>Used on every generated page.</p></div></div>
      <form class="card stack" id="settings" style="max-width:640px">
        ${field('siteUrl', 'Site address', 'Used for search engines and link previews.')}
        ${field('author', 'Your name')}
        ${field('brand', 'Logo text')}
        ${field('brandSubtitle', 'Logo subtitle')}
        <label class="field"><span class="label">Default description</span><textarea class="input" name="description">${esc(s.description || '')}</textarea><small>Shown by Google when a page has no summary.</small></label>
        ${field('gaId', 'Google Analytics ID', 'Starts with G-.')}
        <div class="row"><button class="btn primary" type="submit">Save settings</button></div>
      </form>`;
    $('#settings').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      try {
        const r = await api('PUT', '/api/site', data);
        reportBuild(r.build);
        toast('Settings saved');
        refreshPublishCount();
      } catch (err) { toast(err.message, true); }
    });
  }

  // ---------- Editor ----------
  async function renderEditor(type, slug) {
    if (!state.site.siteUrl) await refresh();
    const isNew = !slug;
    const entry = isNew
      ? { type, slug: '', title: '', summary: '', subtitle: '', tags: [], date: new Date().toISOString().slice(0, 10), status: 'draft', order: null, cover: '', coverAlt: '', logo: '', logoAlt: '', seoTitle: '', description: '', body: '' }
      : await api('GET', `/api/entry/${type}/${slug}`);
    const [one] = TYPE_LABEL[type];
    const siteHost = (state.site.siteUrl || 'https://kailashamarnath.me/').replace(/\/?$/, '/');

    view.innerHTML = `
      <div class="editor-layout">
        <div>
          <label class="sr-only" for="title">Title</label>
          <input id="title" class="title-input" placeholder="${one} title" value="${esc(entry.title)}" autocomplete="off">
          <div id="toolbar-slot"></div>
          <div id="doc" class="doc" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${one} content"
            data-placeholder="Start writing… Use “Section heading” to start each new panel, like Overview or The Problem."></div>
          <div class="doc-meta"><span id="wordcount"></span><span class="row"><button class="btn ghost small" type="button" id="focus-btn" title="Hide everything but the writing (Esc to leave)">Focus mode</button><button class="btn ghost small" type="button" id="help-btn">Shortcuts</button></span></div>
          <p class="editor-help">Click an image to place or resize it, drag it to move it anywhere, or drag its round corner to resize. Drop or paste images straight into the text. Each “Section heading” starts a new panel on the page.</p>
        </div>

        <aside class="side">
          <div class="card stack">
            <div class="row" style="justify-content:space-between">
              <span class="save-state" id="save-state">${isNew ? 'Not saved yet' : 'Saved'}</span>
              <span class="chip ${entry.status}" id="status-chip">${STATUS[entry.status][0]}</span>
            </div>
            <div class="row">
              <button class="btn primary" type="button" id="save">Save</button>
              <button class="btn" type="button" id="preview" ${isNew ? 'disabled title="Save first"' : ''}>Preview</button>
            </div>
            <small class="muted">Saving keeps it on this laptop. Use <b>Publish</b> at the top to put it online.</small>
          </div>

          <div class="card stack">
            <div class="field"><span class="label">Visibility</span>
              <div class="status-pick" role="radiogroup">
                ${Object.entries(STATUS).map(([k, [label, help]]) => `
                  <label><input type="radio" name="status" value="${k}" ${entry.status === k ? 'checked' : ''}><span><b>${label}</b><span>${help}</span></span></label>`).join('')}
              </div>
            </div>
            <label class="field"><span class="label">Summary</span>
              <textarea class="input" id="summary" maxlength="600" placeholder="One or two sentences">${esc(entry.summary)}</textarea>
              <small><span id="summary-count"></span> Shown on the home page card and in Google results.</small></label>
            <label class="field"><span class="label">Tags</span>
              <input class="input" id="tags" value="${esc((entry.tags || []).join(', '))}" placeholder="Avionics, Drones, PCB" autocomplete="off">
              <small>Separate with commas. The first two show on the card.</small></label>
            <label class="field"><span class="label">Page address</span>
              <input class="input" id="slug" value="${esc(entry.slug)}" ${isNew ? '' : 'readonly'} placeholder="my-new-project" autocomplete="off" spellcheck="false">
              <small id="slug-help">${esc(siteHost)}<span id="slug-preview">${esc(entry.slug || '…')}</span>.html${isNew ? '' : ' · fixed after the first save so links keep working'}</small></label>
          </div>

          <details class="card stack">
            <summary style="cursor:pointer;font-weight:600;color:#fff">More options</summary>
            <label class="field" style="margin-top:12px"><span class="label">Subtitle</span><input class="input" id="subtitle" value="${esc(entry.subtitle)}" placeholder="Shown under the title"></label>
            <label class="field"><span class="label">Date</span><input class="input" type="date" id="date" value="${esc(entry.date)}"></label>
            ${type === 'projects' ? `<label class="field"><span class="label">Order on home page</span><input class="input" type="number" id="order" min="0" value="${entry.order ?? ''}" placeholder="1 = first"></label>` : ''}
            ${imageField('logo', 'Logo (top right of the page)', entry.logo)}
            <label class="field"><span class="label">Logo description</span><input class="input" id="logoAlt" value="${esc(entry.logoAlt)}" placeholder="What the logo shows"></label>
            ${imageField('cover', 'Share image (link previews)', entry.cover)}
            <label class="field"><span class="label">Share image description</span><input class="input" id="coverAlt" value="${esc(entry.coverAlt)}" placeholder="What the image shows"></label>
            <label class="field"><span class="label">Google title</span><input class="input" id="seoTitle" maxlength="120" value="${esc(entry.seoTitle)}" placeholder="${esc(entry.title || 'Defaults to the title')}"><small>Optional. A longer title for search results; your name is added after it.</small></label>
            <label class="field"><span class="label">Google description</span><textarea class="input" id="description" maxlength="320" placeholder="Defaults to the summary">${esc(entry.description)}</textarea></label>
            ${isNew ? '' : '<button class="btn danger small" type="button" id="delete">Delete</button>'}
          </details>
        </aside>
      </div>`;

    const doc = $('#doc');
    // The visual editor lives in editor.js; it fills the toolbar slot and the document area.
    document.execCommand('defaultParagraphSeparator', false, 'p');
    let current = entry;
    let slugTouched = !isNew;

    const markDirty = () => {
      dirty = true;
      const s = $('#save-state');
      s.textContent = 'Unsaved changes';
      s.className = 'save-state dirty';
    };
    leaveGuard = () => !dirty || confirm('You have unsaved changes. Leave without saving?');

    const slugify = (t) => t.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60);
    $('#title').addEventListener('input', (e) => {
      if (isNew && !slugTouched) { $('#slug').value = slugify(e.target.value); $('#slug-preview').textContent = $('#slug').value || '…'; }
      markDirty();
    });
    $('#slug').addEventListener('input', (e) => { slugTouched = true; $('#slug-preview').textContent = e.target.value || '…'; markDirty(); });
    const countSummary = () => {
      const n = $('#summary').value.length;
      $('#summary-count').textContent = `${n}/350.`;
      $('#summary-count').style.color = n > 350 ? 'var(--warn)' : '';
    };
    countSummary();
    $('#summary').addEventListener('input', () => { countSummary(); markDirty(); });
    $$('.side input, .side textarea').forEach((el) => el.addEventListener('change', markDirty));
    $$('input[name="status"]').forEach((r) => r.addEventListener('change', () => {
      const chip = $('#status-chip');
      chip.className = `chip ${r.value}`;
      chip.textContent = STATUS[r.value][0];
    }));
    doc.addEventListener('input', markDirty);

    $$('[data-pick]').forEach((btn) => btn.addEventListener('click', async () => {
      const picked = await pickMedia({ multiple: false, imagesOnly: true, title: 'Choose an image' });
      if (!picked) return;
      setImageField(btn.dataset.pick, picked[0]);
      markDirty();
    }));
    $$('[data-clear]').forEach((btn) => btn.addEventListener('click', () => { setImageField(btn.dataset.clear, ''); markDirty(); }));

    const editor = CMSEditor.mount({ doc, toolbar: $('#toolbar-slot'), html: entry.body, markDirty, pickMedia, upload, ask, toast });

    // Word count and reading time.
    const countWords = () => {
      const n = (doc.innerText.match(/\S+/g) || []).length;
      $('#wordcount').textContent = `${n} word${n === 1 ? '' : 's'} · ${Math.max(1, Math.round(n / 200))} min read`;
    };
    countWords();
    doc.addEventListener('input', countWords);

    // Focus mode hides the sidebar and menus so only the writing is on screen.
    const setFocus = (on) => { document.body.classList.toggle('focus-mode', on); $('#focus-btn').textContent = on ? 'Exit focus mode' : 'Focus mode'; };
    $('#focus-btn').addEventListener('click', () => setFocus(!document.body.classList.contains('focus-mode')));
    $('#help-btn').addEventListener('click', () => showShortcuts());

    // A safety copy in this browser every few seconds, in case the laptop or browser closes before you save.
    const backupKey = `cms-backup:${type}:${slug || 'new'}`;
    try {
      const saved = JSON.parse(localStorage.getItem(backupKey) || 'null');
      if (saved && saved.body && saved.body !== editor.getHTML() && saved.at > Date.now() - 7 * 864e5) {
        const when = new Date(saved.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
        if (confirm(`There's unsaved writing for this page from ${when}. Bring it back?`)) {
          CMSEditor.mount({ doc, toolbar: $('#toolbar-slot'), html: saved.body, markDirty, pickMedia, upload, ask, toast });
          if (saved.title) $('#title').value = saved.title;
          markDirty();
          countWords();
        } else localStorage.removeItem(backupKey);
      }
    } catch { /* browser storage unavailable */ }
    const backupTimer = setInterval(() => {
      if (!$('#doc')) { clearInterval(backupTimer); return; }
      if (!dirty) return;
      try { localStorage.setItem(backupKey, JSON.stringify({ at: Date.now(), title: $('#title').value, body: editor.getHTML() })); } catch { /* full or blocked */ }
    }, 5000);
    const clearBackup = () => { try { localStorage.removeItem(backupKey); } catch { /* ignore */ } };

    const save = async () => {
      const payload = {
        slug: $('#slug').value.trim(),
        title: $('#title').value.trim(),
        summary: $('#summary').value.trim(),
        subtitle: $('#subtitle').value.trim(),
        tags: $('#tags').value,
        date: $('#date').value,
        status: $('input[name="status"]:checked').value,
        order: $('#order') ? $('#order').value : '',
        logo: $('#logo').value,
        logoAlt: $('#logoAlt').value.trim(),
        cover: $('#cover').value,
        coverAlt: $('#coverAlt').value.trim(),
        seoTitle: $('#seoTitle').value.trim(),
        description: $('#description').value.trim(),
        body: editor.getHTML(),
      };
      if (!payload.title) { toast('Give it a title first.', true); $('#title').focus(); return; }
      $('#save').disabled = true;
      try {
        const r = isNew && !current.slug
          ? await api('POST', `/api/entry/${type}`, payload)
          : await api('PUT', `/api/entry/${type}/${current.slug}`, payload);
        current = r.entry;
        dirty = false;
        clearBackup();
        const s = $('#save-state');
        s.textContent = `Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        s.className = 'save-state saved';
        reportBuild(r.build);
        if (!(r.build && (r.build.error || (r.build.skipped || []).length))) toast('Saved');
        refreshPublishCount();
        if (isNew) {
          leaveGuard = null;
          lastHash = `#/${type}/edit/${current.slug}`;
          history.replaceState(null, '', lastHash);
          renderEditor(type, current.slug);
        }
      } catch (err) {
        toast(err.message, true);
      } finally {
        if ($('#save')) $('#save').disabled = false;
      }
    };
    $('#save').addEventListener('click', save);
    $('#preview').addEventListener('click', async () => {
      if (dirty) await save();
      window.open(`/preview/${type}/${current.slug}`, '_blank', 'noopener');
    });
    const del = $('#delete');
    if (del) del.addEventListener('click', async () => {
      if (!confirm(`Delete “${current.title}”? It moves to cms/content/.trash, and its page leaves the site on your next publish.`)) return;
      try {
        const r = await api('DELETE', `/api/entry/${type}/${current.slug}`);
        reportBuild(r.build);
        dirty = false;
        toast('Deleted');
        location.hash = `#/${type}`;
      } catch (err) { toast(err.message, true); }
    });

    document.onkeydown = (e) => {
      if (!(e.ctrlKey || e.metaKey) || !$('#doc')) return;
      if (e.key === 's') { e.preventDefault(); save(); }
    };
    if (isNew) $('#title').focus();
  }

  function imageField(key, label, value) {
    return `<div class="field"><span class="label">${label}</span>
      <div class="image-field">
        <div class="thumb" id="${key}-thumb" style="${value ? `background-image:url('/${esc(encodeURI(value).replace(/'/g, '%27'))}')` : ''}"></div>
        <input type="hidden" id="${key}" value="${esc(value)}">
        <div class="row"><button class="btn small" type="button" data-pick="${key}">Choose</button><button class="btn small ghost" type="button" data-clear="${key}">Clear</button></div>
      </div></div>`;
  }

  function setImageField(key, value) {
    $(`#${key}`).value = value;
    $(`#${key}-thumb`).style.backgroundImage = value ? `url('/${encodeURI(value).replace(/'/g, '%27')}')` : '';
  }

  // ---------- Shortcuts ----------
  function showShortcuts() {
    let dlg = $('#shortcuts-dialog');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'shortcuts-dialog';
      const rows = [
        ['Ctrl + S', 'Save'], ['Ctrl + B / I / U', 'Bold, italic, underline'], ['Ctrl + K', 'Add or edit a link'],
        ['Ctrl + Z / Y', 'Undo, redo'], ['Tab / Shift + Tab', 'Indent a list item, next table cell, or indent code'],
        ['# then space', 'Section heading (## heading, ### small heading)'], ['- then space', 'Bulleted list (1. for numbered)'],
        ['> then space', 'Quote'], ['``` then space', 'Code block'], ['--- then space', 'Divider'],
        ['Paste a YouTube link', 'On an empty line it becomes a video'], ['Drop or paste images', 'They upload and appear where you are'],
        ['Click an image', 'Place it left, centre or right, resize, caption'], ['Drag an image', 'Move it anywhere'],
        ['Delete', 'Removes the selected image'], ['Esc', 'Leave focus mode'],
      ];
      dlg.innerHTML = `<div class="dialog-head"><h2>Keyboard shortcuts</h2><button class="close-x" type="button" aria-label="Close">×</button></div>
        <div class="dialog-body"><table class="shortcuts">${rows.map(([k, v]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(v)}</td></tr>`).join('')}</table></div>`;
      dlg.querySelector('.close-x').onclick = () => dlg.close();
      document.body.appendChild(dlg);
    }
    dlg.showModal();
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('focus-mode') && !document.querySelector('dialog[open]')) {
      document.body.classList.remove('focus-mode');
      const b = $('#focus-btn');
      if (b) b.textContent = 'Focus mode';
    }
  });

  // ---------- Prompt dialog ----------
  function ask(title, label, value = '', help = '') {
    const dlg = $('#prompt-dialog');
    $('#prompt-title').textContent = title;
    $('#prompt-label').textContent = label;
    $('#prompt-help').textContent = help;
    const input = $('#prompt-input');
    input.value = value;
    dlg.returnValue = '';
    dlg.showModal();
    input.select();
    // Resolve on the button press itself (the dialog's close event can arrive late).
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; form.removeEventListener('submit', onSubmit); resolve(v); };
      const form = dlg.querySelector('form');
      const onSubmit = (e) => finish(e.submitter && e.submitter.value === 'ok' ? input.value : null);
      form.addEventListener('submit', onSubmit);
      dlg.addEventListener('close', () => finish(dlg.returnValue === 'ok' ? input.value : null), { once: true });
    });
  }

  // ---------- Media picker ----------
  async function upload(file) {
    if (file.size > 60 * 1024 * 1024) throw new Error(`${file.name} is larger than 60 MB.`);
    toast(`Uploading ${file.name}…`);
    const r = await api('POST', `/api/upload?name=${encodeURIComponent(file.name)}`, undefined, file);
    if (file.size > 2 * 1024 * 1024 && /^image\//.test(file.type)) {
      toast(`${file.name} is ${(file.size / 1048576).toFixed(1)} MB. It will load slowly; consider a smaller image.`, true);
    }
    return r.path;
  }

  function pickMedia({ multiple, imagesOnly = false, title }) {
    const dlg = $('#media-dialog');
    $('#media-title').textContent = title;
    const lib = $('#library');
    const insert = $('#media-insert');
    const hint = $('#media-hint');
    const chosen = [];
    const update = () => {
      insert.disabled = !chosen.length;
      hint.textContent = chosen.length ? `${chosen.length} selected` : (multiple ? 'Select one or more' : '');
      $$('button', lib).forEach((b) => b.setAttribute('aria-pressed', String(chosen.includes(b.dataset.path))));
    };
    const toggle = (p) => {
      if (!multiple) chosen.length = 0;
      const i = chosen.indexOf(p);
      if (i >= 0) chosen.splice(i, 1); else chosen.push(p);
      update();
    };
    const renderLib = async () => {
      const items = (await api('GET', '/api/images')).filter((i) => !imagesOnly || !/\.(mp4|webm)$/i.test(i.path));
      lib.innerHTML = items.map((i) => {
        const src = '/' + encodeURI(i.path);
        const media = /\.(mp4|webm)$/i.test(i.path) ? `<video src="${esc(src)}" muted preload="metadata"></video>` : `<img src="${esc(src)}" alt="" loading="lazy">`;
        return `<button type="button" data-path="${esc(i.path)}" aria-pressed="false" title="${esc(i.path)}">${media}<span>${esc(i.path.replace(/^Images\//, ''))}</span></button>`;
      }).join('') || '<p class="muted">No images yet.</p>';
      update();
    };
    lib.onclick = (e) => { const b = e.target.closest('button[data-path]'); if (b) toggle(b.dataset.path); };
    lib.ondblclick = (e) => { const b = e.target.closest('button[data-path]'); if (b && !multiple) { chosen.length = 0; chosen.push(b.dataset.path); done(chosen.slice()); } };

    const fileInput = $('#file-input');
    fileInput.multiple = multiple;
    fileInput.accept = imagesOnly ? 'image/png,image/jpeg,image/gif,image/webp' : 'image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm';
    const handleFiles = async (files) => {
      try {
        for (const f of files) {
          const p = await upload(f);
          if (!multiple) chosen.length = 0;
          chosen.push(p);
        }
        await renderLib();
        if (!multiple && chosen.length) done(chosen.slice());
      } catch (err) { toast(err.message, true); }
    };
    fileInput.onchange = () => { handleFiles([...fileInput.files]); fileInput.value = ''; };
    const dz = $('#dropzone');
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
    dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); handleFiles([...e.dataTransfer.files]); };

    let resolver;
    const done = (val) => { resolver(val); resolver = () => {}; dlg.close(); };
    insert.onclick = () => done(chosen.slice());
    $$('[data-close]', dlg).forEach((b) => { b.onclick = () => done(null); });
    dlg.oncancel = () => done(null);
    renderLib();
    dlg.showModal();
    return new Promise((resolve) => { resolver = resolve; });
  }

  // ---------- Publish ----------
  $('#publish-btn').addEventListener('click', openPublish);

  async function openPublish() {
    if (dirty) { toast('Save your changes first, then publish.', true); return; }
    const dlg = $('#publish-dialog');
    const body = $('#publish-body');
    const foot = $('#publish-foot');
    body.innerHTML = '<p class="muted">Checking what has changed…</p>';
    foot.innerHTML = '<button class="btn ghost" type="button" data-close>Close</button>';
    $$('[data-close]', dlg).forEach((b) => { b.onclick = () => dlg.close(); });
    if (!dlg.open) dlg.showModal();

    let st;
    try { st = await api('GET', '/api/publish?fetch=1'); } catch (err) { body.innerHTML = `<div class="notice err">${esc(err.message)}</div>`; return; }
    if (!st.ok) { body.innerHTML = `<div class="notice err">${esc(st.reason)}</div>`; return; }

    const pub = st.files.filter((f) => f.publish);
    const priv = st.files.filter((f) => !f.publish);
    const stateLabel = { new: 'new', changed: 'changed', deleted: 'removed' };
    body.innerHTML = `
      ${st.behind ? `<div class="notice">GitHub has ${st.behind} change${st.behind > 1 ? 's' : ''} this laptop doesn't have yet. Get them first so nothing is overwritten.</div>` : ''}
      ${!pub.length && !st.ahead ? '<div class="notice ok">Everything is already live. Nothing to publish.</div>' : ''}
      ${st.ahead ? `<div class="notice">${st.ahead} saved change${st.ahead > 1 ? 's are' : ' is'} waiting to be sent to GitHub.</div>` : ''}
      ${pub.length ? `<p style="margin-top:12px">These files will go live on <b>${esc((state.site.siteUrl || '').replace(/^https?:\/\//, ''))}</b>:</p>
        <div class="files">${pub.map((f) => `<label><input type="checkbox" checked value="${esc(f.file)}"> <code>${esc(f.file)}</code> <span class="muted">${stateLabel[f.state]}</span></label>`).join('')}</div>` : ''}
      ${priv.length ? `<details style="margin-top:14px"><summary class="muted" style="cursor:pointer">${priv.length} private file${priv.length > 1 ? 's' : ''} stay on this laptop</summary>
        <div class="files">${priv.map((f) => `<label class="off"><code>${esc(f.file)}</code></label>`).join('')}</div></details>` : ''}
      ${pub.length ? `<label class="field" style="margin-top:16px"><span class="label">What changed? (optional)</span><input class="input" id="publish-msg" placeholder="Add SecureBeam project"></label>` : ''}
      <div id="publish-result"></div>`;
    foot.innerHTML = `
      <button class="btn ghost" type="button" data-close>Close</button>
      ${st.behind ? '<button class="btn" type="button" id="pull-btn">Get latest from GitHub</button>' : ''}
      ${(pub.length || st.ahead) && !st.behind ? '<button class="btn primary" type="button" id="go-live">Publish now</button>' : ''}`;
    $$('[data-close]', dlg).forEach((b) => { b.onclick = () => dlg.close(); });

    const pull = $('#pull-btn');
    if (pull) pull.onclick = async () => {
      pull.disabled = true;
      try { await api('POST', '/api/pull'); toast('Up to date with GitHub'); openPublish(); }
      catch (err) { $('#publish-result').innerHTML = `<div class="notice err" style="margin-top:12px">${esc(err.message)}</div>`; pull.disabled = false; }
    };
    const go = $('#go-live');
    if (go) go.onclick = async () => {
      const files = $$('.files input:checked', body).map((i) => i.value);
      if (!files.length && !st.ahead) { toast('Select at least one file.', true); return; }
      go.disabled = true;
      go.textContent = 'Publishing…';
      try {
        const r = await api('POST', '/api/publish', { files, message: ($('#publish-msg') || {}).value });
        $('#publish-result').innerHTML = r.pushed
          ? `<div class="notice ok" style="margin-top:12px">Published. GitHub Pages usually updates the live site within a minute or two.</div>`
          : `<div class="notice err" style="margin-top:12px">${esc(r.error)}</div>`;
        go.remove();
        refreshPublishCount();
      } catch (err) {
        $('#publish-result').innerHTML = `<div class="notice err" style="margin-top:12px">${esc(err.message)}</div>`;
        go.disabled = false;
        go.textContent = 'Publish now';
      }
    };
  }

  route();
})();
