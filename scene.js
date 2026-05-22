(function () {
  'use strict';

  const DEBUG = false;

  const CFG = {
    /* Parallax */
    parallaxStrength : 12,
    lerpSpeed        : 0.035,

    /* Ambient drift */
    driftAmplX  : 4,
    driftAmplY  : 2.5,
    driftSpeedX : 1.7e-4,
    driftSpeedY : 1.1e-4,

    /* Scale buffer */
    imageScale  : 1.08,

    /* Light pulse */
    pulseAmpl   : 0.025,
    pulseSpeed  : 1.9e-4,

    /* Particles */
    particleCount   : 48,
    particleMinR    : 1.4,
    particleMaxR    : 3.6,
    particleMinLife : 4500,
    particleMaxLife : 8500,
    particleMinVY   : 0.010,
    particleMaxVY   : 0.026,
    particleOpacity : 0.16,

    particleColors : [
      [245, 195, 105],
      [255, 215, 145],
      [225, 178, 112],
      [240, 200, 128],
      [230, 185,  95],
    ],

    /* Slideshow */
    slideInterval : 5500,   /* ms between advances */
  };

  /* ─── Elements ───────────────────────────────────────────────────────── */
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const plate  = document.getElementById('mill-scene');
  const slides = document.getElementById('mill-slides');
  const canvas = document.getElementById('mill-canvas');

  if (!plate || !slides || !canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  /* ─── Prepare slides container ───────────────────────────────────────── */
  slides.style.transformOrigin = '50% 50%';
  slides.style.transform       = `scale(${CFG.imageScale})`;

  /* ─── Slideshow rotation ─────────────────────────────────────────────── */
  if (!reduced) {
    const slideEls = Array.from(plate.querySelectorAll('.hero-slide'));
    let current = 0;

    function advance() {
      slideEls[current].classList.remove('active');
      current = (current + 1) % slideEls.length;
      slideEls[current].classList.add('active');
    }

    setInterval(advance, CFG.slideInterval);
  }

  /* ─── Particle helpers ───────────────────────────────────────────────── */
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  function spawnParticle(now) {
    const [r, g, b] = pick(CFG.particleColors);
    return {
      x      : rand(0, W),
      y      : rand(0, H),
      radius : rand(CFG.particleMinR, CFG.particleMaxR),
      vx     : rand(-0.007, 0.007),
      vy     : -rand(CFG.particleMinVY, CFG.particleMaxVY),
      life   : rand(CFG.particleMinLife, CFG.particleMaxLife),
      born   : now,
      r, g, b,
    };
  }

  /* ─── Canvas + particle pool ─────────────────────────────────────────── */
  let W = 0, H = 0, particles = [];
  let animating = false, rafId = null;

  function resize() {
    const newW = plate.offsetWidth;
    const newH = plate.offsetHeight;
    if (newW === 0 || newH === 0) { requestAnimationFrame(resize); return; }
    W = newW; H = newH;
    canvas.width  = W;
    canvas.height = H;
    const now = performance.now();
    particles = Array.from({ length: CFG.particleCount }, () => {
      const p = spawnParticle(now);
      p.born = now - rand(0, 5000);
      return p;
    });
  }

  const ro = new ResizeObserver(resize);
  ro.observe(plate);
  resize();

  /* ─── Mouse / touch parallax ─────────────────────────────────────────── */
  let tX = 0, tY = 0, cX = 0, cY = 0;

  function applyPointer(clientX, clientY, scale = 1) {
    const rect = plate.getBoundingClientRect();
    if (rect.bottom < -100 || rect.top > window.innerHeight + 100) return;
    tX = ((clientX - rect.left  - rect.width  * 0.5) / (rect.width  * 0.5)) * -CFG.parallaxStrength * scale;
    tY = ((clientY - rect.top   - rect.height * 0.5) / (rect.height * 0.5)) * -CFG.parallaxStrength * scale;
  }

  document.addEventListener('mousemove', e => applyPointer(e.clientX, e.clientY), { passive: true });
  document.addEventListener('touchmove', e => {
    if (e.touches.length) applyPointer(e.touches[0].clientX, e.touches[0].clientY, 0.5);
  }, { passive: true });

  /* ─── Loop control ───────────────────────────────────────────────────── */
  let prevT = null;

  function startLoop() {
    if (animating) return;
    animating = true;
    prevT = null;
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (!animating) return;
    animating = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  const sceneIO = new IntersectionObserver(([entry]) => {
    entry.isIntersecting ? startLoop() : stopLoop();
  }, { threshold: 0.01 });
  sceneIO.observe(plate);

  startLoop();

  /* ─── Main loop ──────────────────────────────────────────────────────── */
  function tick(now) {
    if (!animating) return;

    const dt = prevT ? Math.min(now - prevT, 80) : 16;
    prevT = now;

    ctx.clearRect(0, 0, W, H);

    if (reduced) {
      rafId = requestAnimationFrame(tick);
      return;
    }

    /* ── Lerp parallax ── */
    cX += (tX - cX) * CFG.lerpSpeed;
    cY += (tY - cY) * CFG.lerpSpeed;

    /* ── Ambient drift ── */
    const dX = Math.sin(now * CFG.driftSpeedX) * CFG.driftAmplX;
    const dY = Math.sin(now * CFG.driftSpeedY) * CFG.driftAmplY;

    slides.style.transform = `translate(${(cX + dX).toFixed(2)}px,${(cY + dY).toFixed(2)}px) scale(${CFG.imageScale})`;

    /* ── Light pulse ── */
    const bri = 1 + Math.sin(now * CFG.pulseSpeed) * CFG.pulseAmpl;
    slides.style.filter = `brightness(${bri.toFixed(4)})`;

    /* ── Particles ── */
    ctx.save();
    ctx.filter = 'blur(2px)';

    for (let i = 0; i < particles.length; i++) {
      const p   = particles[i];
      const age = now - p.born;

      if (age >= p.life) { particles[i] = spawnParticle(now); continue; }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.y < -p.radius * 3) { p.y = H + p.radius; p.x = rand(0, W); }
      if (p.x < -p.radius * 3)   p.x = W + p.radius;
      if (p.x > W + p.radius * 3) p.x = -p.radius;

      const lifeRatio = age / p.life;
      let alpha = CFG.particleOpacity;
      if      (lifeRatio < 0.15) alpha *= lifeRatio / 0.15;
      else if (lifeRatio > 0.75) alpha *= (1 - lifeRatio) / 0.25;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha.toFixed(3)})`;
      ctx.fill();
    }

    ctx.restore();

    rafId = requestAnimationFrame(tick);
  }

})();
