/* Epoch releases, read live from GitHub Releases. Change REPO to point at another repository. */
(function () {
  var REPO = 'kailu687/portfolio';
  var API = 'https://api.github.com/repos/' + REPO + '/releases';
  var PAGE = 'https://github.com/' + REPO + '/releases';
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text; // textContent only: release data is untrusted
    return e;
  }
  function size(b) { return b > 1048576 ? (b / 1048576).toFixed(0) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function date(s) { try { return new Date(s).toISOString().slice(0, 10); } catch (e) { return ''; } }
  function pick(assets) {
    var a = (assets || []).filter(function (x) { return /\.(exe|msi|zip)$/i.test(x.name); });
    return a[0] || null;
  }
  function get(url) {
    return fetch(url, { headers: { Accept: 'application/vnd.github+json' } }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // Every [data-latest-stable] link/button points straight at the latest STABLE release file.
  var latestEls = document.querySelectorAll('[data-latest-stable]');
  if (latestEls.length) {
    get(API + '/latest').then(function (rel) { // GitHub's "latest" never returns prereleases or drafts
      var a = rel && pick(rel.assets);
      latestEls.forEach(function (b) {
        var note = b.parentNode.querySelector('[data-latest-note]') || document.querySelector('[data-latest-note]');
        if (a) {
          b.href = a.browser_download_url;
          b.textContent = 'Download Epoch ' + rel.tag_name.replace(/^v/, '') + ' for Windows';
          b.setAttribute('download', '');
          if (note) note.textContent = 'Latest stable release · ' + size(a.size) + ' · ' + date(rel.published_at);
        } else {
          b.href = '/epoch/releases/';
          b.textContent = 'See available builds';
          if (note) note.textContent = 'There is no stable release yet. Development builds, if any, are listed on the releases page.';
        }
      });
    }).catch(function () {
      latestEls.forEach(function (b) { b.href = PAGE; b.textContent = 'Open the releases page'; });
    });
  }

  // Releases list with an expandable entry per version.
  var list = $('#release-list');
  if (list) {
    get(API + '?per_page=30').then(function (rels) {
      list.textContent = '';
      rels = (rels || []).filter(function (r) { return !r.draft; });
      if (!rels.length) { list.appendChild(el('p', null, 'No releases have been published yet.')); return; }
      rels.forEach(function (r, i) {
        var d = el('details');
        if (i === 0) d.open = true;
        var s = el('summary');
        s.appendChild(el('strong', null, r.name || r.tag_name));
        var chip = el('span', 'status ' + (r.prerelease ? 'wip' : 'done'), r.prerelease ? 'Development build' : 'Stable');
        chip.style.marginLeft = '10px';
        s.appendChild(chip);
        s.appendChild(el('span', 'rel-date', ' ' + date(r.published_at)));
        d.appendChild(s);
        var body = el('div');
        if (r.prerelease) body.appendChild(el('p', 'note', 'Development build: unsigned and for evaluation. It may be missing features described on the Epoch page.'));
        (r.body || 'No release notes.').split(/\n{2,}/).forEach(function (para) {
          var lines = para.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
          if (lines.every(function (l) { return /^[-*] /.test(l); })) {
            var ul = el('ul');
            lines.forEach(function (l) { ul.appendChild(el('li', null, l.replace(/^[-*] /, ''))); });
            body.appendChild(ul);
          } else {
            body.appendChild(el('p', null, lines.join(' ').replace(/^#+\s*/, '')));
          }
        });
        (r.assets || []).forEach(function (a) {
          var row = el('p');
          var link = el('a', 'btn', 'Download ' + a.name + ' (' + size(a.size) + ')');
          link.href = a.browser_download_url;
          row.appendChild(link);
          body.appendChild(row);
          if (a.digest) { var h = el('p', 'hash', 'SHA-256: ' + String(a.digest).replace(/^sha256:/, '')); body.appendChild(h); }
        });
        d.appendChild(body);
        list.appendChild(d);
      });
    }).catch(function () {
      list.textContent = '';
      var p = el('p', null, 'Releases could not be loaded right now. ');
      var a = el('a', null, 'Open them on GitHub.');
      a.href = PAGE;
      p.appendChild(a);
      list.appendChild(p);
    });
  }
})();
