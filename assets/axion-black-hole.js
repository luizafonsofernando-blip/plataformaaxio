const mounted = new WeakSet();

function mountBlackHole(screen) {
  if (!screen || mounted.has(screen)) return;
  mounted.add(screen);

  const host = document.createElement("div");
  host.className = "axion-black-hole-bg";
  host.setAttribute("aria-hidden", "true");
  const canvas = document.createElement("canvas");
  host.appendChild(canvas);
  screen.prepend(host);

  const ctx = canvas.getContext("2d", { alpha: true });
  const stars = [];
  const dust = [];
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let time = 0;
  let frame = 0;

  function resize() {
    const rect = host.getBoundingClientRect();
    width = Math.max(1, Math.floor(rect.width || window.innerWidth));
    height = Math.max(1, Math.floor(rect.height || window.innerHeight));
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    seedParticles();
  }

  function seedParticles() {
    stars.length = 0;
    dust.length = 0;
    const starCount = width < 720 ? 140 : 260;
    const dustCount = width < 720 ? 90 : 150;

    for (let i = 0; i < starCount; i += 1) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.25 + 0.25,
        a: Math.random() * 0.56 + 0.22,
        t: Math.random() * Math.PI * 2,
        c: Math.random() > 0.72 ? "125, 211, 252" : "219, 234, 254",
      });
    }

    for (let i = 0; i < dustCount; i += 1) {
      dust.push({
        angle: Math.random() * Math.PI * 2,
        radius: Math.random() * 0.46 + 0.34,
        speed: Math.random() * 0.12 + 0.05,
        size: Math.random() * 1.2 + 0.35,
        alpha: Math.random() * 0.34 + 0.1,
      });
    }
  }

  function drawBackground() {
    const bg = ctx.createRadialGradient(width * 0.5, height * 0.48, 0, width * 0.5, height * 0.52, Math.max(width, height) * 0.78);
    bg.addColorStop(0, "#071d49");
    bg.addColorStop(0.36, "#06173a");
    bg.addColorStop(1, "#020712");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width * 0.52, height * 0.54, 0, width * 0.52, height * 0.54, width * 0.54);
    glow.addColorStop(0, "rgba(30, 136, 255, 0.18)");
    glow.addColorStop(0.5, "rgba(4, 25, 64, 0.22)");
    glow.addColorStop(1, "rgba(2, 7, 18, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

  function drawStars() {
    for (const star of stars) {
      const pulse = Math.sin(time * 0.0025 + star.t) * 0.22 + 0.78;
      ctx.beginPath();
      ctx.fillStyle = `rgba(${star.c}, ${star.a * pulse})`;
      ctx.arc(star.x, star.y, star.r * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function ellipsePoint(cx, cy, rx, ry, angle, tilt = 0) {
    const x = Math.cos(angle) * rx;
    const y = Math.sin(angle) * ry;
    const cos = Math.cos(tilt);
    const sin = Math.sin(tilt);
    return { x: cx + x * cos - y * sin, y: cy + x * sin + y * cos };
  }

  function drawDust(cx, cy, rx, ry, tilt) {
    for (const particle of dust) {
      const angle = particle.angle + time * 0.0008 * particle.speed * 42;
      const point = ellipsePoint(cx, cy, rx * particle.radius, ry * particle.radius, angle, tilt);
      const fade = 0.3 + Math.max(0, Math.sin(angle)) * 0.7;
      ctx.beginPath();
      ctx.fillStyle = `rgba(125, 211, 252, ${particle.alpha * fade})`;
      ctx.arc(point.x, point.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawArc(cx, cy, rx, ry, tilt, lineWidth, strokeStyle, start, end) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.scale(1, ry / rx);
    ctx.beginPath();
    ctx.arc(0, 0, rx, start, end);
    ctx.restore();
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokeStyle;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  function drawBlackHole() {
    const cx = width * 0.54;
    const cy = height * 0.48;
    const size = Math.min(width, height);
    const coreRadius = Math.max(58, size * 0.13);
    const rx = Math.max(240, width * 0.33);
    const ry = Math.max(70, height * 0.12);
    const tilt = -0.1;
    const rotation = time * 0.00018;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    drawDust(cx, cy, rx, ry, tilt + rotation);

    for (let i = 0; i < 8; i += 1) {
      const alpha = 0.16 - i * 0.014;
      drawArc(cx, cy, rx + i * 14, ry + i * 4, tilt + rotation * (1 + i * 0.04), 1.2, `rgba(125, 211, 252, ${alpha})`, Math.PI * 0.05, Math.PI * 1.95);
    }

    drawArc(cx, cy, rx, ry, tilt + rotation, 28, "rgba(30, 136, 255, 0.18)", Math.PI * 0.02, Math.PI * 1.98);
    drawArc(cx, cy, rx * 0.98, ry * 0.98, tilt + rotation, 12, "rgba(125, 211, 252, 0.34)", Math.PI * 0.05, Math.PI * 1.95);
    drawArc(cx, cy, rx * 0.92, ry * 0.92, tilt + rotation, 5, "rgba(255, 255, 255, 0.78)", Math.PI * 0.08, Math.PI * 1.92);
    drawArc(cx, cy, rx * 0.7, ry * 0.7, tilt - rotation * 0.8, 3, "rgba(30, 136, 255, 0.42)", Math.PI * 0.15, Math.PI * 1.85);

    const coreGlow = ctx.createRadialGradient(cx, cy, coreRadius * 0.5, cx, cy, coreRadius * 3.1);
    coreGlow.addColorStop(0, "rgba(0, 0, 0, 0)");
    coreGlow.addColorStop(0.36, "rgba(30, 136, 255, 0.2)");
    coreGlow.addColorStop(0.7, "rgba(125, 211, 252, 0.08)");
    coreGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = coreGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, coreRadius * 3.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius * 1.08);
    core.addColorStop(0, "#000000");
    core.addColorStop(0.72, "#000000");
    core.addColorStop(1, "rgba(2, 7, 18, 0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, coreRadius * 1.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const rim = ctx.createRadialGradient(cx, cy, coreRadius * 0.94, cx, cy, coreRadius * 1.42);
    rim.addColorStop(0, "rgba(0, 0, 0, 0)");
    rim.addColorStop(0.44, "rgba(255, 255, 255, 0.55)");
    rim.addColorStop(0.62, "rgba(30, 136, 255, 0.36)");
    rim.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(cx, cy, coreRadius * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function animate(now = 0) {
    if (!document.body.contains(host)) return;
    time = now;
    drawBackground();
    drawStars();
    drawBlackHole();
    frame = requestAnimationFrame(animate);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  window.addEventListener("resize", resize);
  resize();
  animate();

  screen.addEventListener("axion:black-hole:dispose", () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    window.removeEventListener("resize", resize);
  });
}

function scan() {
  document.querySelectorAll(".login-screen").forEach(mountBlackHole);
}

scan();
new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
