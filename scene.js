(function () {
  'use strict';

  console.log('[scene.js] Script loaded ✓');

  /* ─── Config — DEBUG mode (exaggerated; restore after confirming) ─────── */
  const DEBUG = false;

  const CFG = {
    /* Parallax */
    parallaxStrength : DEBUG ? 45  : 12,
    lerpSpeed        : DEBUG ? 0.07 : 0.035,

    /* Ambient drift */
    driftAmplX  : DEBUG ? 22   : 4,
    driftAmplY  : DEBUG ? 14   : 2.5,
    driftSpeedX : DEBUG ? 4e-4 : 1.7e-4,
    driftSpeedY : DEBUG ? 2.5e-4 : 1.1e-4,

    /* Scale buffer */
    imageScale  : DEBUG ? 1.14 : 1.08,

    /* Light pulse */
    pulseAmpl   : DEBUG ? 0.14 : 0.025,
    pulseSpeed  : DEBUG ? 6e-4 : 1.9e-4,

    /* Particles */
    particleCount   : DEBUG ? 90  : 48,
    particleMinR    : DEBUG ? 5   : 1.4,
    particleMaxR    : DEBUG ? 12  : 3.6,
    particleMinLife : DEBUG ? 2500 : 4500,
    particleMaxLife : DEBUG ? 5000 : 8500,
    particleMinVY   : DEBUG ? 0.04 : 0.010,
    particleMaxVY   : DEBUG ? 0.09 : 0.026,
    particleOpacity : DEBUG ? 0.75 : 0.16,

    particleColors : [
      [245, 195, 105],
      [255, 215, 145],
      [225, 178, 112],
      [240, 200, 128],
      [230, 185,  95],
    ],
  };

  /* ─── Elements ───────────────────────────────────────────────────────── */
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  console.log('[scene.js] prefers-reduced-motion:', reduced);

  const plate  = document.getElementById('mill-scene');
  const img    = document.getElementById('mill-img');
  const canvas = document.getElementById('mill-canvas');

  console.log('[scene.js] Elements:', {
    plate : plate  ? `found (${plate.offsetWidth}×${plate.offsetHeight}px)` : '⚠ MISSING',
    img   : img    ? 'found' : '⚠ MISSING',
    canvas: canvas ? 'found' : '⚠ MISSING',
  });

  if (!plate || !img || !canvas) {
    console.error('[scene.js] ⛔ Missing required elements — aborting');
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('[scene.js] ⛔ Canvas 2D context unavailable');
    return;
  }

  /* DEBUG: force plate visible + red canvas outline */
  if (DEBUG) {
    /* .reveal starts at opacity:0 — override so we can inspect without scrolling */
    plate.style.opacity   = '1';
    plate.style.transform = 'none';
    canvas.style.outline  = '3px solid rgba(255,60,60,0.85)';
    /* CSS now gives canvas z-index:3; no inline override needed */
    console.log('[scene.js] DEBUG: forced plate opacity=1, transform=none');
  }

  /* ─── Prepare image ──────────────────────────────────────────────────── */
  img.style.transformOrigin = '50% 50%';
  img.style.willChange      = 'transform, filter';
  img.style.transition      = 'none';
  img.style.transform       = `scale(${CFG.imageScale})`;
  console.log('[scene.js] Image base transform applied: scale(' + CFG.imageScale + ')');

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
  let animating = false, rafId = null, frameCount = 0;

  function resize() {
    const newW = plate.offsetWidth;
    const newH = plate.offsetHeight;

    if (newW === 0 || newH === 0) {
      /* Plate hasn't been laid out yet — defer one frame */
      console.warn('[scene.js] resize(): plate has zero dimensions, retrying...');
      requestAnimationFrame(resize);
      return;
    }

    W = newW;
    H = newH;
    console.log('[scene.js] Canvas resized to', W, '×', H);
    canvas.width  = W;
    canvas.height = H;
    const now = performance.now();
    particles = Array.from({ length: CFG.particleCount }, () => {
      const p = spawnParticle(now);
      p.born = now - rand(0, 5000); /* stagger initial births */
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
  function startLoop() {
    if (animating) return;
    console.log('[scene.js] ▶ Loop started');
    animating = true;
    prevT = null;
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (!animating) return;
    console.log('[scene.js] ⏸ Loop paused (section off-screen)');
    animating = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  /* Keep IO reference to prevent GC; pause loop when section is off-screen */
  const sceneIO = new IntersectionObserver(([entry]) => {
    console.log('[scene.js] IO:', entry.isIntersecting ? '▶ in view' : '⏸ out of view');
    entry.isIntersecting ? startLoop() : stopLoop();
  }, { threshold: 0.01 });
  sceneIO.observe(plate);

  /* Start immediately — don't wait for IO (which fires async) */
  startLoop();

  /* ─── Main loop ──────────────────────────────────────────────────────── */
  let prevT = null;

  function tick(now) {
    if (!animating) return;

    frameCount++;
    if (frameCount <= 3) console.log('[scene.js] Frame', frameCount, '— W=' + W + ' H=' + H + ' reduced=' + reduced);

    const dt = prevT ? Math.min(now - prevT, 80) : 16;
    prevT = now;

    ctx.clearRect(0, 0, W, H);

    if (DEBUG) {
      /* Draw a status banner so we can confirm canvas is rendering */
      ctx.fillStyle = 'rgba(255,60,60,0.7)';
      ctx.fillRect(0, 0, W, 36);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(`scene.js ✓  frame ${frameCount}  W=${W}  H=${H}  reduced=${reduced}`, 12, 22);
    }

    if (reduced) {
      /* Motion off — static image, no particles */
      if (DEBUG) {
        ctx.fillStyle = 'rgba(255,200,0,0.8)';
        ctx.fillRect(0, 36, W, 28);
        ctx.fillStyle = '#000';
        ctx.font = '12px monospace';
        ctx.fillText('⚠ prefers-reduced-motion is ON — animation disabled', 12, 54);
      }
      rafId = requestAnimationFrame(tick);
      return;
    }

    /* ── Lerp parallax ── */
    cX += (tX - cX) * CFG.lerpSpeed;
    cY += (tY - cY) * CFG.lerpSpeed;

    /* ── Ambient drift ── */
    const dX = Math.sin(now * CFG.driftSpeedX) * CFG.driftAmplX;
    const dY = Math.sin(now * CFG.driftSpeedY) * CFG.driftAmplY;

    img.style.transform = `translate(${(cX + dX).toFixed(2)}px,${(cY + dY).toFixed(2)}px) scale(${CFG.imageScale})`;

    /* ── Light pulse ── */
    const bri = 1 + Math.sin(now * CFG.pulseSpeed) * CFG.pulseAmpl;
    img.style.filter = `brightness(${bri.toFixed(4)})`;

    /* ── Particles ── */
    ctx.save();
    ctx.filter = 'blur(2px)';

    for (let i = 0; i < particles.length; i++) {
      const p   = particles[i];
      const age = now - p.born;

      if (age >= p.life) {
        particles[i] = spawnParticle(now);
        continue;
      }

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

  console.log('[scene.js] Init complete — loop starting');

})();
