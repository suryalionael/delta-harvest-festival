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

// Cinematic interlude slideshows with dynamic captions
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  ['.smith-slide', '.mill-slide', '.hall-slide', '.mill-venue-slide', '.hall-venue-slide', '.mh-slide'].forEach(function (selector) {
    const slides = Array.from(document.querySelectorAll(selector));
    if (!slides.length) return;

    const plate = slides[0].closest('.plate');
    const captionEl = plate ? plate.querySelector('.slide-caption') : null;

    function renderCaption(slide) {
      if (!captionEl) return;
      var cap  = slide.dataset.caption || '';
      var cred = slide.dataset.credit  || '';
      captionEl.innerHTML = cap + (cred ? '<span class="slide-credit">' + cred + '</span>' : '');
    }

    renderCaption(slides[0]);

    let current = 0;
    setInterval(function () {
      slides[current].classList.remove('active');
      current = (current + 1) % slides.length;
      slides[current].classList.add('active');
      if (captionEl) {
        captionEl.style.opacity = '0';
        setTimeout(function () {
          renderCaption(slides[current]);
          captionEl.style.opacity = '1';
        }, 600);
      }
    }, 5500);
  });
})();
