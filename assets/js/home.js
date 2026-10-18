/* Homepage only: terminal loader, hero typewriter and particle field. */
(function(){
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const loader = document.getElementById('loader-screen');
  const page = document.getElementById('page-wrap');

  /* ---------- Loader ----------
     Plays once per browser session. Returning within the same session,
     or with reduced motion on, goes straight to the page. */
  let seen = false;
  try { seen = sessionStorage.getItem('loaderSeen') === '1'; } catch (e) {}

  function showPage(){
    if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
    document.body.classList.remove('loading');
    page.classList.add('ready');
    if (window.startReveal) window.startReveal();
    heroTypeLoop();
  }

  function runLoader(){
    const termText = document.getElementById('terminal-text');
    const bar = document.getElementById('progress-bar');
    const percent = document.getElementById('progress-percent');
    const progress = document.getElementById('progress');
    // Messages come from the page (set in the CMS), with the originals as a fallback.
    let lines = ['Preparing systems...', 'Optimizing modules...', 'Starting engines...', 'Final checks...', 'Ready.'];
    try { const d = JSON.parse(termText.dataset.lines || 'null'); if (Array.isArray(d) && d.length) lines = d; } catch (e) {}
    let l = 0, c = 0, p = 0;

    function step(amount){
      p = Math.min(100, p + amount);
      bar.style.width = p + '%';
      percent.textContent = Math.round(p) + '%';
      progress.setAttribute('aria-valuenow', String(Math.round(p)));
    }
    function type(){
      if (l < lines.length) {
        const cur = lines[l];
        if (c < cur.length) { termText.textContent += cur.charAt(c); c++; step(0.6); setTimeout(type, 10); }
        else { termText.textContent += '\n'; l++; c = 0; step(6); setTimeout(type, 140); }
      } else {
        const fin = setInterval(() => {
          if (p >= 100) { clearInterval(fin); fadeOut(); return; }
          step(6);
        }, 80);
      }
    }
    function fadeOut(){
      try { sessionStorage.setItem('loaderSeen', '1'); } catch (e) {}
      loader.classList.add('done');
      setTimeout(showPage, 600);
    }
    // Any key or tap skips the intro.
    function skip(){ if (loader.parentNode) { loader.classList.add('done'); setTimeout(showPage, 200); } }
    loader.addEventListener('click', skip, { once: true });
    document.addEventListener('keydown', skip, { once: true });
    type();
  }

  if (!loader || seen || reduceMotion) showPage();
  else runLoader();

  /* ---------- Hero typewriter ---------- */
  function heroTypeLoop(){
    const el = document.getElementById('typing');
    if (!el || el.dataset.running) return;
    el.dataset.running = '1';
    let texts = [
      'ECE undergrad by choice. Aviator by passion.',
      'Still figuring things out — trying, making and breaking.',
      'Building cool things one failure at a time.',
      'Engineering my own flight path.'
    ];
    try { const d = JSON.parse(el.dataset.phrases || 'null'); if (Array.isArray(d) && d.length) texts = d; } catch (e) {}
    if (reduceMotion) { el.textContent = texts[0]; return; }
    let i = 0, j = 0, deleting = false;
    function loop(){
      const current = texts[i];
      let delay = deleting ? 45 : 55;
      if (!deleting) {
        el.textContent = current.substring(0, ++j);
        if (j === current.length) { deleting = true; delay = 1600; }
      } else {
        el.textContent = current.substring(0, --j);
        if (j === 0) { deleting = false; i = (i + 1) % texts.length; delay = 300; }
      }
      setTimeout(loop, delay);
    }
    loop();
  }

  /* ---------- Particle field ---------- */
  const canvas = document.getElementById('particle-field');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, particles = [], running = false, visible = true;
  const mouse = { x: null, y: null };

  function build(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Scale particle count with area so phones stay light.
    const count = Math.max(40, Math.min(120, Math.round(w * h / 2600)));
    particles = Array.from({ length: count }, () => {
      const x = Math.random() * w, y = Math.random() * h;
      return { x, y, ox: x, oy: y, vx: (Math.random() - .5) * .4, vy: (Math.random() - .5) * .4, size: 1 + Math.random() * 2 };
    });
  }

  function draw(){
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,200,255,0.85)';
    for (const p of particles) {
      if (mouse.x !== null) {
        const dx = mouse.x - p.x, dy = mouse.y - p.y, dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 200 && dist > 0) {
          const force = (200 - dist) / 200;
          p.vx += (dx / dist) * force * 0.12;
          p.vy += (dy / dist) * force * 0.12;
        }
      }
      p.vx += (p.ox - p.x) * 0.002;
      p.vy += (p.oy - p.y) * 0.002;
      p.vx *= 0.92; p.vy *= 0.92;
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) { p.vx *= -0.6; p.x = Math.max(0, Math.min(w, p.x)); }
      if (p.y < 0 || p.y > h) { p.vy *= -0.6; p.y = Math.max(0, Math.min(h, p.y)); }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.lineWidth = 0.7;
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j], dx = a.x - b.x, dy = a.y - b.y;
        if (dx > 140 || dx < -140 || dy > 140 || dy < -140) continue;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 140) {
          ctx.strokeStyle = 'rgba(0,180,255,' + (1 - d / 140) + ')';
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
  }

  function frame(){
    if (!running) return;
    draw();
    requestAnimationFrame(frame);
  }
  function setRunning(){
    const should = visible && !document.hidden && !reduceMotion;
    if (should && !running) { running = true; requestAnimationFrame(frame); }
    else if (!should) running = false;
  }

  build();
  draw();
  setRunning();

  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { build(); draw(); }, 150); });
  document.addEventListener('visibilitychange', setRunning);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; setRunning(); }).observe(canvas);
  }

  function setPointer(e){
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  }
  canvas.addEventListener('pointermove', setPointer);
  canvas.addEventListener('pointerdown', setPointer);
  canvas.addEventListener('pointerleave', () => { mouse.x = mouse.y = null; });
})();
