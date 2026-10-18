/* Shared behaviour for every public page: mobile nav, scroll reveal,
   footer year and the image lightbox. Loaded with `defer`. */
(function(){
  document.documentElement.classList.remove('no-js');

  // Mobile navigation toggle
  const toggle = document.querySelector('.nav-toggle');
  const links = document.getElementById('nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    links.addEventListener('click', e => {
      if (e.target.closest('a')) {
        links.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Footer year
  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

  // Reveal on scroll. The homepage defers this until its loader finishes.
  window.startReveal = function(){
    const els = document.querySelectorAll('.reveal:not(.visible)');
    if (!('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('visible')); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('visible'); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -60px 0px' });
    els.forEach(el => io.observe(el));
  };
  if (!document.body.classList.contains('loading')) window.startReveal();

  // Looping videos (used instead of heavy GIFs): no autoplay for reduced motion.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('video[autoplay]').forEach(v => { v.removeAttribute('autoplay'); v.pause(); v.controls = true; });
  }

  // Lightbox for any <button class="zoomable" data-full="...">
  const zoomables = document.querySelectorAll('.zoomable');
  if (zoomables.length) {
    const box = document.createElement('div');
    box.className = 'lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Enlarged image');
    box.innerHTML = '<button class="lightbox-close" type="button" aria-label="Close image">&times;</button><img alt="">';
    document.body.appendChild(box);
    const img = box.querySelector('img');
    const close = box.querySelector('.lightbox-close');
    let opener = null;

    function hide(){
      box.classList.remove('open');
      img.removeAttribute('src');
      document.body.style.overflow = '';
      if (opener) opener.focus();
    }
    zoomables.forEach(btn => btn.addEventListener('click', () => {
      const inner = btn.querySelector('img');
      opener = btn;
      img.src = btn.dataset.full || (inner && inner.currentSrc) || '';
      img.alt = inner ? inner.alt : '';
      box.classList.add('open');
      document.body.style.overflow = 'hidden';
      close.focus();
    }));
    box.addEventListener('click', e => { if (e.target !== img) hide(); });
    document.addEventListener('keydown', e => {
      if (!box.classList.contains('open')) return;
      if (e.key === 'Escape') hide();
      if (e.key === 'Tab') { e.preventDefault(); close.focus(); }
    });
  }
})();
