(function () {
  'use strict';

  function init() {

  // Block pinch-zoom gestures (best-effort). Requires meta viewport change too.
  window.addEventListener('touchmove', function(e) {
    if (e.touches && e.touches.length > 1) {
      e.preventDefault();
    }
  }, { passive: false });
  window.addEventListener('gesturestart', function(e) { e.preventDefault(); });
  window.addEventListener('gesturechange', function(e) { e.preventDefault(); });

  const host = document.createElement('div');
  Object.assign(host.style, {
    position:      'fixed',
    top:           '0',
    left:          '0',
    width:         '100vw',
    height:        '100vh',
    overflow:      'hidden',
    pointerEvents: 'none',
    zIndex:        '99999',
    margin:        '0',
    padding:       '0',
    border:        'none',
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  Object.assign(canvas.style, {
    position:      'absolute',
    top:           '0',
    left:          '0',
    width:         '100%',
    height:        '100%',
    pointerEvents: 'none',
    display:       'block',
    margin:        '0',
    padding:       '0',
    border:        'none',
  });

  host.appendChild(canvas);
  document.documentElement.appendChild(host);

  // Usa visualViewport si está disponible — ignora el zoom del navegador
  // y siempre devuelve el tamaño físico visible real en CSS px
  function vw() {
    return (window.visualViewport ? window.visualViewport.width  : window.innerWidth);
  }
  function vh() {
    return (window.visualViewport ? window.visualViewport.height : window.innerHeight);
  }

  // El canvas también debe posicionarse según el offset del visualViewport
  // (cuando el usuario hace zoom y scrollea, el viewport se desplaza)
  function syncPosition() {
    const vp = window.visualViewport;
    if (!vp) return;
    host.style.left = vp.offsetLeft + 'px';
    host.style.top  = vp.offsetTop  + 'px';
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = vw();
    const h = vh();
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    syncPosition();
  }

  resize();

  const scriptSrc = (document.currentScript || {}).src || '';
  const baseUrl   = scriptSrc.substring(0, scriptSrc.lastIndexOf('/') + 1);

  // preload multiple ball sprites named b1.webp .. b10.webp
  const BALL_SPRITE_COUNT = 11;
  const ballImages = [];
  for (let i = 1; i <= BALL_SPRITE_COUNT; i++) {
    const img = new Image();
    img.src = baseUrl + `assets/webpballs/b${i}.webp`;
    ballImages.push(img);
  }
  let ballSpriteIndex = 0;
  const ballImg = ballImages[ballSpriteIndex];

  const G      = 0.45;
  const DRAG   = 0.98;
  const BOUNCE = 0.9;
  const RADIUS = 25;

  function randomBall() {
    const x  = RADIUS + Math.random() * (vw() - RADIUS * 2);
    const vel = (Math.random() * 3 + 1) * (Math.random() < 0.5 ? 1 : -1);
    return { x, y: -RADIUS, vx: vel, vy: 2, r: RADIUS, rotation: 0, dead: false };
  }

  let ball    = randomBall();
  let touches = 0;
  // Record persisted en localStorage
  let record = 0;
  try { record = parseInt(localStorage.getItem('ballRecord')) || 0; } catch (e) { record = 0; }
  let showCounter = true; // set to true to display the score counter

  function drawShading(x, y, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    const grd = ctx.createRadialGradient(
      x - r * 0.15, y - r * 0.2, r * 0.1,
      x,             y,           r
    );
    grd.addColorStop(0,    'rgba(0,0,0,0)');
    grd.addColorStop(0.55, 'rgba(0,0,0,0)');
    grd.addColorStop(1,    'rgba(0,0,0,0.45)');
    ctx.fillStyle = grd;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  function draw() {
    const W = vw(), H = vh();
    ctx.clearRect(0, 0, W, H);

    if (showCounter) {
      ctx.save();
        let counterAlpha = 0;
        if (touches === 0) {
          counterAlpha = 0;
        } else if (touches >= 5) {
          counterAlpha = 0.45; // higher opacity when score >= 5
        } else {
          counterAlpha = 0.05;
        }
        // dibujar contador grande y centrado usando fillStyle con alpha
        ctx.font        = 'bold 96px Arial';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur  = 8;
        const scoreText = String(touches);
        const scoreMetrics = ctx.measureText(scoreText);
        const scoreX = (W / 2) - (scoreMetrics.width / 2);
        const scoreY = (H / 2) + 24; // approximate vertical center baseline
        ctx.fillStyle = `rgba(0,0,0,${counterAlpha})`;
        ctx.fillText(scoreText, scoreX, scoreY);

        ctx.font = '12px Arial';
        ctx.shadowBlur = 1;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(record + '★', 10, 32);
      ctx.restore();
    }

      ctx.save();
      // apply reduced opacity when the ball is 'dead'
      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = ball.dead ? 0.5 : 1.0;
      ctx.translate(ball.x, ball.y);
      ctx.rotate(ball.rotation);
      const currentImg = ballImages[ballSpriteIndex] || ballImg;
      // draw circular clipped image so sprite looks round and integrated
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(currentImg, -ball.r, -ball.r, ball.r * 2, ball.r * 2);
      // subtle inner shadow (darker toward bottom-right)
      const innerGrad = ctx.createRadialGradient(-ball.r*0.2, -ball.r*0.25, ball.r*0.05, 0, 0, ball.r);
      innerGrad.addColorStop(0, 'rgba(0,0,0,0)');
      innerGrad.addColorStop(0.7, 'rgba(0,0,0,0)');
      innerGrad.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = innerGrad;
      ctx.fillRect(-ball.r, -ball.r, ball.r * 2, ball.r * 2);
      // rim highlight (soft)
      const rim = ctx.createRadialGradient(-ball.r*0.25, -ball.r*0.35, ball.r*0.05, 0, 0, ball.r);
      rim.addColorStop(0, 'rgba(255,255,255,0.45)');
      rim.addColorStop(0.6, 'rgba(255,255,255,0.08)');
      rim.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rim;
      ctx.fillRect(-ball.r, -ball.r, ball.r * 2, ball.r * 2);
      ctx.restore();
      ctx.globalAlpha = prevAlpha;
      ctx.restore();

      drawShading(ball.x, ball.y, ball.r);
  }

  function update() {
    const W = vw(), H = vh();

    ball.vy += G;
    ball.vx *= DRAG;
    ball.vy *= DRAG;

    ball.x += ball.vx;
    ball.y += ball.vy;

    if (!ball.dead) {
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      if (speed > 0.5) {
        const dir = ball.vx >= 0 ? 1 : -1;
        ball.rotation += dir * speed * 0.008;
      }
    }

    if (ball.y + ball.r >= H) {
      ball.y  = H - ball.r;
      ball.vy = -ball.vy * BOUNCE;
      // Reiniciar el puntaje cuando toca el suelo (guardar récord si aplica)
      try { if (touches > record) { record = touches; localStorage.setItem('ballRecord', String(record)); } } catch (e) { }
      touches = 0;
      if (Math.abs(ball.vy) < 0.5) {
        ball.vy   = 0;
        ball.vx   = 0;
        ball.dead = true;
      }
    }
    if (ball.y - ball.r <= 0) { ball.y = ball.r; ball.vy = -ball.vy * BOUNCE; }
    if (ball.x - ball.r <= 0) { ball.x = ball.r; ball.vx = -ball.vx * BOUNCE; }
    if (ball.x + ball.r >= W) { ball.x = W - ball.r; ball.vx = -ball.vx * BOUNCE; }
  }

  function animate() {
    update();
    draw();
    requestAnimationFrame(animate);
  }

  function handleTouch(e) {
    const vp    = window.visualViewport;
    const scale = vp ? vp.scale : 1;
    const touch = e.touches[0];

    // Convertir coordenadas de touch al espacio del canvas (sin zoom)
    const x = (touch.clientX - (vp ? vp.offsetLeft : 0)) / scale;
    const y = (touch.clientY - (vp ? vp.offsetTop  : 0)) / scale;

    const dx   = x - ball.x;
    const dy   = y - ball.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= ball.r * 2.2) {
      e.preventDefault();
      e.stopPropagation();
      ball.dead = false;
      const power = 7.5;
      ball.vx = -(dx / dist) * power;
      ball.vy = -16;
      touches++;
      // no actualizar récord aquí; se guarda al tocar el suelo
      if (touches % 2 === 0) {
        ballSpriteIndex = (ballSpriteIndex + 1) % BALL_SPRITE_COUNT;
      }
    }
  }

  function onViewportChange() {
    const W = vw(), H = vh();
    // Reubicar el balón proporcionalmente
    const rx = ball.x / (canvas._lastW || W);
    const ry = ball.y / (canvas._lastH || H);
    resize();
    ball.x = rx * vw();
    ball.y = ry * vh();
    canvas._lastW = vw();
    canvas._lastH = vh();
  }

  canvas._lastW = vw();
  canvas._lastH = vh();

  // Escuchar cambios en visualViewport (zoom, scroll, rotación)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onViewportChange);
    window.visualViewport.addEventListener('scroll', syncPosition);
  }
  window.addEventListener('resize', onViewportChange);

  window.addEventListener('touchstart', handleTouch, { passive: false, capture: true });

  animate();

  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

})();