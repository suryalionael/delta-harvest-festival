/* old-town-hall.js — A History of the Old Town Hall · Delta, Ontario */

(function () {
  'use strict';

  const nav = document.getElementById('nav');
  const bar = document.getElementById('bar');

  // collect both real images and placeholder art for parallax
  const parallaxEls = () =>
    document.querySelectorAll('.parallax-frame .ph, .parallax-frame .frame-img');

  function onScroll() {
    const y = window.scrollY;

    // sticky nav state
    if (nav) nav.classList.toggle('scrolled', y > 40);

    // reading progress bar
    if (bar) {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      bar.style.width = max > 0 ? (y / max * 100) + '%' : '0%';
    }

    // gentle parallax on all image/placeholder frames
    parallaxEls().forEach(function (el) {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      if (r.bottom < 0 || r.top > vh) return;
      const progress = (vh - r.top) / (vh + r.height); // 0..1
      const shift = (progress - 0.5) * 14; // –7..+7 px
      el.style.transform = 'translate3d(0,' + shift + 'px,0) scale(1.04)';
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // reveal on scroll (IntersectionObserver)
  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

  document.querySelectorAll('.reveal').forEach(function (el) {
    io.observe(el);
  });
})();
