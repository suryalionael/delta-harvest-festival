// Scroll-reveal: slow editorial fade-in
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }
}, { threshold: 0.05, rootMargin: '0px 0px -60px 0px' });

document.querySelectorAll('.reveal').forEach(el => io.observe(el));

// Countdown to 26 Sept 2026, 10:00 AM
(function () {
  const target = new Date('2026-09-26T10:00:00');
  const d = document.getElementById('cd-d');
  const h = document.getElementById('cd-h');
  const m = document.getElementById('cd-m');
  const s = document.getElementById('cd-s');

  const pad = n => n.toString().padStart(2, '0');

  function tick() {
    const now = new Date();
    let diff = Math.max(0, target - now);
    const days = Math.floor(diff / 86400000); diff -= days * 86400000;
    const hrs  = Math.floor(diff / 3600000);  diff -= hrs * 3600000;
    const mins = Math.floor(diff / 60000);    diff -= mins * 60000;
    const secs = Math.floor(diff / 1000);
    d.textContent = days;
    h.textContent = pad(hrs);
    m.textContent = pad(mins);
    s.textContent = pad(secs);
  }

  tick();
  setInterval(tick, 1000);
})();

// Cinematic interlude slideshows
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  ['.smith-slide', '.mill-slide', '.hall-slide', '.mill-venue-slide', '.hall-venue-slide'].forEach(function (selector) {
    const slides = Array.from(document.querySelectorAll(selector));
    if (!slides.length) return;
    let current = 0;
    setInterval(function () {
      slides[current].classList.remove('active');
      current = (current + 1) % slides.length;
      slides[current].classList.add('active');
    }, 5500);
  });
})();
