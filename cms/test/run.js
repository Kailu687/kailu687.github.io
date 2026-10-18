// Basic checks for the sanitizer, markdown renderer and the server's locks.
// Run with `npm test` (server checks need the CMS running: CMS_PORT, CMS_KEY).
const assert = require('assert');
const http = require('http');
const { sanitize } = require('../lib/sanitize');
const { render } = require('../lib/markdown');

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('  ok', name); };

check('drops scripts and their contents', () => {
  assert.strictEqual(sanitize('<p>a</p><script>alert(1)</script><p>b</p>'), '<p>a</p><p>b</p>');
});
check('drops event handlers and styles', () => {
  assert.strictEqual(sanitize('<p onclick="x()" style="color:red">hi</p>'), '<p>hi</p>');
});
check('blocks javascript: links, including hidden tabs', () => {
  assert.strictEqual(sanitize('<a href="javascript:alert(1)">x</a>'), '<a>x</a>');
  assert.strictEqual(sanitize('<a href="java\tscript:alert(1)">x</a>'), '<a>x</a>');
  assert.strictEqual(sanitize('<img src="data:image/png;base64,AAA">'), '');
});
check('keeps allowed layout classes only', () => {
  assert.strictEqual(sanitize('<figure class="img-left evil"><img src="Images/a.png" alt="a"></figure>'),
    '<figure class="img-left"><img src="Images/a.png" alt="a"></figure>');
});
check('opens external links safely', () => {
  assert.strictEqual(sanitize('<a href="https://x.com">x</a>'), '<a href="https://x.com" target="_blank" rel="noopener">x</a>');
});
check('unwraps unknown tags but keeps text', () => {
  assert.strictEqual(sanitize('<p><span class="a">hi</span> <font>there</font></p>'), '<p>hi there</p>');
});
check('drops iframes and svg', () => {
  assert.strictEqual(sanitize('<iframe src="x"></iframe><svg><script>1</script></svg><p>ok</p>'), '<p>ok</p>');
});
check('markdown images become a gallery', () => {
  assert.ok(render('![a](Images/a.png) ![b](Images/b b.png)').includes('class="md-gallery"'));
  assert.ok(render('![b](Images/b b.png)').includes('Images/b%20b.png'));
});
check('markdown escapes raw text', () => {
  assert.strictEqual(render('a <b> & c'), '<p>a &lt;b&gt; &amp; c</p>');
});

function req(opts, body) {
  return new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port: process.env.CMS_PORT, ...opts }, (res) => resolve(res.statusCode));
    r.on('error', () => resolve(0));
    r.end(body);
  });
}

(async () => {
  if (process.env.CMS_PORT && process.env.CMS_KEY) {
    const port = process.env.CMS_PORT;
    const cookie = `cms_key=${process.env.CMS_KEY}`;
    assert.strictEqual(await req({ path: '/api/overview' }), 401); passed++;
    assert.strictEqual(await req({ path: '/api/overview', headers: { cookie, host: `evil.com:${port}` } }), 421); passed++;
    assert.strictEqual(await req({ path: '/api/build', method: 'POST', headers: { cookie } }), 403); passed++;
    assert.strictEqual(await req({ path: '/api/build', method: 'POST', headers: { cookie, 'x-cms': '1', origin: 'https://evil.com' } }), 403); passed++;
    assert.strictEqual(await req({ path: '/site/cms/.key', headers: { cookie } }), 404); passed++;
    assert.strictEqual(await req({ path: '/site/..%2fcms%2f.key', headers: { cookie } }), 404); passed++;
    assert.strictEqual(await req({ path: '/api/upload?name=x.html', method: 'POST', headers: { cookie, 'x-cms': '1' } }, 'hi'), 400); passed++;
    assert.strictEqual(await req({ path: '/api/upload?name=x.png', method: 'POST', headers: { cookie, 'x-cms': '1' } }, '<svg>'), 400); passed++;
    assert.strictEqual(await req({ path: '/api/overview', headers: { cookie } }), 200); passed++;
    console.log('  ok server locks (9 checks)');
  }
  console.log(`\n${passed} checks passed`);
})();
