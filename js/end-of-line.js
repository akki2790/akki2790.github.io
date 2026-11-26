/*
 * "End of line" easter egg.
 *
 * When the visitor reaches the bottom of the page (the Tron GIF is fully in
 * view), the GIF is restarted from its first frame and a timer runs for the
 * GIF's exact length (88 frames x 50ms = 4.4s). If the visitor stays until the
 * countdown ring in the GIF finishes, the page "explodes" with a particle burst
 * from the ring's position. Scrolling away or switching tabs cancels it.
 *
 * Skipped entirely for visitors who prefer reduced motion.
 */
(function () {
  'use strict';

  var gif = document.getElementById('end-of-line-gif');
  if (!gif || !('IntersectionObserver' in window)) return;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion && reduceMotion.matches) return;

  var GIF_DURATION_MS = 4400;
  // Centre of the countdown ring, as a fraction of the GIF's width/height (498x280).
  var RING = { x: 276 / 498, y: 93 / 280 };
  // Colours chosen to contrast with the orange (#E99A38) page: white-hot core,
  // pale gold, and the Tron cyan from the GIF, plus dark charcoal debris.
  var SPARK_COLORS = ['#FFFFFF', '#FFF6D5', '#FFE9A8', '#7DF9FF', '#00E5FF', '#B8FCFF'];
  var DEBRIS_COLORS = ['#1E1B18', '#2B241D', '#3A2E22'];

  var baseSrc = gif.getAttribute('src');
  var gifBlob = null;
  var currentObjectUrl = null;
  var timer = null;
  var runId = 0;
  var exploded = false;
  var inView = false;

  // Keep the GIF's bytes in memory so restarting it doesn't re-download it.
  if (window.fetch && window.URL && URL.createObjectURL) {
    fetch(baseSrc)
      .then(function (res) { return res.ok ? res.blob() : null; })
      .then(function (blob) { gifBlob = blob; })
      .catch(function () { /* fall back to a cache-busting URL */ });
  }

  // Restart the GIF from frame 0, then call onStarted once it is showing.
  function restartGif(onStarted) {
    var url = gifBlob
      ? URL.createObjectURL(gifBlob)
      : baseSrc + (baseSrc.indexOf('?') === -1 ? '?' : '&') + 'restart=' + Date.now();

    function handleLoad() {
      gif.removeEventListener('load', handleLoad);
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = gifBlob ? url : null;
      onStarted();
    }
    gif.addEventListener('load', handleLoad);
    gif.src = url;
  }

  function startCountdown() {
    if (exploded || timer !== null || document.hidden) return;
    var id = ++runId;
    timer = 'starting';
    restartGif(function () {
      if (id !== runId) return; // cancelled while the GIF was restarting
      timer = setTimeout(function () {
        timer = null;
        if (id === runId && inView && !document.hidden) explode();
      }, GIF_DURATION_MS);
    });
  }

  function cancelCountdown() {
    runId++;
    if (typeof timer === 'number') clearTimeout(timer);
    timer = null;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      inView = entry.intersectionRatio >= 0.95;
      if (inView) startCountdown();
      else cancelCountdown();
    });
  }, { threshold: [0, 0.95] });
  observer.observe(gif);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) cancelCountdown();
    else if (inView) startCountdown();
  });

  // ---------------------------------------------------------------- explosion

  function explode() {
    exploded = true;

    var rect = gif.getBoundingClientRect();
    var ox = rect.left + rect.width * RING.x;
    var oy = rect.top + rect.height * RING.y;

    var layer = document.createElement('div');
    layer.className = 'eol-layer';
    layer.style.setProperty('--eol-x', ox + 'px');
    layer.style.setProperty('--eol-y', oy + 'px');
    layer.innerHTML =
      '<div class="eol-dark"></div>' +
      '<canvas class="eol-canvas" aria-hidden="true"></canvas>' +
      '<div class="eol-flash"></div>' +
      '<div class="eol-card" role="dialog" aria-label="End of line">' +
      '  <h2 class="eol-title">END OF LINE.</h2>' +
      '  <p class="eol-text">This page has been derezzed.</p>' +
      '  <button type="button" class="eol-rez">Rez</button>' +
      '</div>';
    document.body.appendChild(layer);
    document.documentElement.classList.add('eol-exploding');

    runParticles(layer.querySelector('.eol-canvas'), ox, oy);

    var button = layer.querySelector('.eol-rez');
    setTimeout(function () {
      layer.classList.add('eol-show-card');
      button.focus({ preventScroll: true });
    }, 2200);

    function onKey(e) { if (e.key === 'Escape') rez(); }
    function rez() {
      document.removeEventListener('keydown', onKey);
      layer.remove();
      document.documentElement.classList.remove('eol-exploding');
      window.scrollTo(0, 0);
      exploded = false;
    }
    button.addEventListener('click', rez);
    document.addEventListener('keydown', onKey);
  }

  function runParticles(canvas, ox, oy) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = window.innerWidth;
    var H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    var reach = Math.hypot(Math.max(ox, W - ox), Math.max(oy, H - oy));
    var pick = function (arr) { return arr[(Math.random() * arr.length) | 0]; };
    var particles = [];

    // Glowing sparks, drawn as streaks.
    function burstSparks(count, maxSpeed) {
      for (var i = 0; i < count; i++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 2 + Math.pow(Math.random(), 1.5) * maxSpeed;
        particles.push({
          x: ox, y: oy,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          life: 0, max: 50 + Math.random() * 90,
          size: 1 + Math.random() * 3,
          color: pick(SPARK_COLORS), debris: false
        });
      }
    }
    // Dark tumbling debris.
    function burstDebris(count) {
      for (var i = 0; i < count; i++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 3 + Math.random() * 18;
        particles.push({
          x: ox, y: oy,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 4,
          life: 0, max: 90 + Math.random() * 60,
          size: 3 + Math.random() * 8,
          rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.5,
          color: pick(DEBRIS_COLORS), debris: true
        });
      }
    }
    // Main blast now; a second, smaller blast follows (see tick()).
    burstSparks(950, 32);
    burstDebris(130);

    // Shockwave rings, echoing the countdown ring.
    var waves = [
      { delay: 0, r: 0, speed: reach / 24, width: 22, color: '255,255,255' },
      { delay: 4, r: 0, speed: reach / 30, width: 10, color: '125,249,255' },
      { delay: 9, r: 0, speed: reach / 36, width: 5, color: '255,233,168' },
      { delay: 16, r: 0, speed: reach / 26, width: 12, color: '0,229,255' }
    ];

    var frame = 0;
    function tick() {
      frame++;
      if (frame === 27) { // ~0.45s, in step with the shake's aftershock
        burstSparks(450, 26);
        burstDebris(40);
      }
      ctx.clearRect(0, 0, W, H);
      var alive = false;

      ctx.globalCompositeOperation = 'lighter';
      waves.forEach(function (w) {
        if (frame < w.delay) { alive = true; return; }
        w.r += w.speed;
        var a = 1 - w.r / reach;
        if (a <= 0) return;
        alive = true;
        ctx.beginPath();
        ctx.arc(ox, oy, w.r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(' + w.color + ',' + (a * 0.9).toFixed(3) + ')';
        ctx.lineWidth = w.width * a + 1;
        ctx.stroke();
      });

      particles.forEach(function (p) {
        if (p.life >= p.max) return;
        alive = true;
        p.life++;
        p.vx *= p.debris ? 0.98 : 0.965;
        p.vy = p.vy * (p.debris ? 0.98 : 0.965) + (p.debris ? 0.35 : 0.12);
        p.x += p.vx;
        p.y += p.vy;
        var a = 1 - p.life / p.max;

        if (p.debris) {
          ctx.globalCompositeOperation = 'source-over';
          p.rot += p.spin;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          ctx.restore();
          ctx.globalAlpha = 1;
        } else {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      });

      if (alive) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W, H);
    }
    requestAnimationFrame(tick);
  }
})();
