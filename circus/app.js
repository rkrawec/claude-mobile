'use strict';

/* An unofficial fan tribute: a WarioWare-style gauntlet set in a digital big
 * top. The Ringmaster barks an adventure, you get a few seconds to work out
 * what it wants, and everything speeds up until you run out of lives.
 *
 * Every sprite here is drawn with canvas primitives — there are no image
 * assets, so the whole app is a few kilobytes and works offline.
 *
 * localStorage is shared across the whole github.io origin, so this key must be
 * prefixed with the app's folder name to avoid colliding with sibling apps. */
const STORAGE_KEY = 'circus.v1';

/* Fixed play field. Everything is authored in these units and letterboxed into
   the screen, so a microgame is laid out identically on every phone. */
const FW = 400;
const FH = 640;
const PLAY_TOP = 96;
const PLAY_BOT = 566;

/* The curtain hangs from the top of the *screen*, not the play field, so on a
   phone with no letterbox it reaches this far down into the field. The HUD has
   to clear it or the life icons get swallowed by the valance. */
const CURTAIN_BAND = 20;
const CURTAIN_SCALLOP = 36;
const CURTAIN_BOTTOM = -4 + CURTAIN_BAND + CURTAIN_SCALLOP / 2;
const HUD_LIVES_Y = 62;
const HUD_LIVES_SCALE = 0.72;
const HUD_LIVES_TOP = HUD_LIVES_Y - 27 * HUD_LIVES_SCALE; // cap horns and bell
const HUD_SCORE_Y = 52;
const HUD_SCORE_SIZE = 30;

const C = {
  ink: '#fff3fb',
  bg0: '#3a0d55',
  bg1: '#1b0630',
  bg2: '#0d0218',
  pink: '#ff3d81',
  magenta: '#d81b7a',
  yellow: '#ffd23f',
  cyan: '#35e0e8',
  green: '#4ef08a',
  red: '#ff4d5e',
  purple: '#8b46d6',
  cream: '#ffe9d6',
};

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');

let scale = 1;
let offX = 0;
let offY = 0;
let bleedX = 0;
let bleedY = 0;

/* ---------- storage ---------- */

function loadBest() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    const v = parsed && typeof parsed.best === 'number' ? parsed.best : 0;
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  } catch (err) {
    console.warn('Could not read the saved best score.', err);
    return 0;
  }
}

function saveBest() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ best }));
  } catch (err) {
    console.warn('Could not save the best score.', err);
  }
}

/* ---------- layout ---------- */

function resize() {
  const rect = stage.getBoundingClientRect();
  const cssW = Math.max(1, rect.width);
  const cssH = Math.max(1, rect.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);

  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  scale = Math.min(cssW / FW, cssH / FH);
  offX = (cssW - FW * scale) / 2;
  offY = (cssH - FH * scale) / 2;
  // How far the background must reach past the field to fill the letterbox.
  bleedX = offX / scale;
  bleedY = offY / scale;

  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offX, dpr * offY);
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

/* ---------- small helpers ---------- */

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[randInt(0, arr.length - 1)];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function text(str, x, y, size, opts = {}) {
  const {
    color = C.ink, align = 'center', baseline = 'middle',
    weight = 900, stroke = null, strokeW = 6, alpha = 1, rotate = 0,
  } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (rotate) ctx.rotate(rotate);
  ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.lineJoin = 'round';
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeW;
    ctx.strokeText(str, 0, 0);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, 0, 0);
  ctx.restore();
}

function circle(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
}

function capsule(x1, y1, x2, y2, w) {
  ctx.lineCap = 'round';
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/* ---------- characters ---------- */

/* The Jester: the player stand-in. A pale face under a two-horned cap. */
function drawJester(x, y, s, opts = {}) {
  const { panic = 0, tilt = 0 } = opts;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(s, s);

  // Cap horns.
  ctx.strokeStyle = C.pink;
  capsule(-2, -6, -17, -20, 9);
  ctx.strokeStyle = C.cyan;
  capsule(2, -6, 17, -20, 9);

  ctx.fillStyle = C.yellow;
  circle(-19, -22, 5); ctx.fill();
  circle(19, -22, 5); ctx.fill();

  // Face.
  ctx.fillStyle = C.cream;
  circle(0, 0, 15); ctx.fill();

  // Cap band.
  ctx.fillStyle = C.pink;
  ctx.beginPath();
  ctx.moveTo(-15, -5);
  ctx.quadraticCurveTo(0, -18, 15, -5);
  ctx.quadraticCurveTo(0, -11, -15, -5);
  ctx.closePath();
  ctx.fill();

  // Eyes: calm dots normally, spirals of alarm when panicking.
  ctx.fillStyle = '#2b0b3f';
  const eyeR = 2.6 + panic * 2.4;
  circle(-5.5, 2, eyeR); ctx.fill();
  circle(5.5, 2, eyeR); ctx.fill();

  ctx.strokeStyle = '#2b0b3f';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (panic > 0.4) {
    ctx.arc(0, 10, 4, Math.PI, 0); // worried little O
  } else {
    ctx.arc(0, 7, 4.5, 0.15 * Math.PI, 0.85 * Math.PI);
  }
  ctx.stroke();

  ctx.restore();
}

/* The Ringmaster: a floating grin that announces the adventures. */
function drawRingmaster(x, y, s, opts = {}) {
  const { t = 0 } = opts;
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 2) * 3);
  ctx.scale(s, s);

  // Top hat.
  ctx.fillStyle = '#1b0630';
  roundRect(-13, -40, 26, 22, 3); ctx.fill();
  roundRect(-20, -21, 40, 6, 3); ctx.fill();
  ctx.fillStyle = C.pink;
  ctx.fillRect(-13, -25, 26, 5);

  // Head: a tall tooth-like block with a huge grin.
  ctx.fillStyle = C.cream;
  roundRect(-18, -18, 36, 40, 12); ctx.fill();

  // Eyes.
  ctx.fillStyle = '#fff';
  circle(-8, -6, 6.5); ctx.fill();
  circle(8, -6, 6.5); ctx.fill();
  ctx.fillStyle = '#1b0630';
  const look = Math.sin(t * 1.7) * 1.8;
  circle(-8 + look, -5, 3); ctx.fill();
  circle(8 + look, -5, 3); ctx.fill();

  // Grin.
  ctx.fillStyle = '#1b0630';
  ctx.beginPath();
  ctx.moveTo(-13, 6);
  ctx.quadraticCurveTo(0, 20, 13, 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  for (let i = -2; i <= 2; i++) {
    ctx.fillRect(i * 4.4 - 1.6, 6, 3.2, 3.4);
  }

  // Floating gloves, held clear of the head so they don't read as ears.
  ctx.fillStyle = '#fff';
  circle(-34, 10 + Math.sin(t * 3) * 4, 6); ctx.fill();
  circle(34, 10 + Math.cos(t * 3) * 4, 6); ctx.fill();

  ctx.restore();
}

function drawMask(x, y, r, happy, colorA, colorB) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = colorA;
  circle(0, 0, r); ctx.fill();
  ctx.fillStyle = colorB;
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#1b0630';
  circle(-r * 0.34, -r * 0.18, r * 0.14); ctx.fill();
  circle(r * 0.34, -r * 0.18, r * 0.14); ctx.fill();

  ctx.strokeStyle = '#1b0630';
  ctx.lineWidth = r * 0.15;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (happy) ctx.arc(0, r * 0.12, r * 0.42, 0.15 * Math.PI, 0.85 * Math.PI);
  else ctx.arc(0, r * 0.78, r * 0.42, 1.15 * Math.PI, 1.85 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawRabbit(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = C.purple;
  roundRect(-9, -22, 6, 20, 3); ctx.fill();
  roundRect(3, -22, 6, 20, 3); ctx.fill();
  circle(0, 0, 15); ctx.fill();
  ctx.fillStyle = '#1b0630';
  circle(-5.5, -2, 2.6); ctx.fill();
  circle(5.5, -2, 2.6); ctx.fill();
  ctx.strokeStyle = '#1b0630';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 3, 6, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

/* ---------- background ---------- */

let bgT = 0;

function drawBackground() {
  const x0 = -bleedX - 4;
  const y0 = -bleedY - 4;
  const w = FW + bleedX * 2 + 8;
  const h = FH + bleedY * 2 + 8;

  const g = ctx.createRadialGradient(FW / 2, 120, 40, FW / 2, FH * 0.6, FH * 0.95);
  g.addColorStop(0, C.bg0);
  g.addColorStop(0.55, C.bg1);
  g.addColorStop(1, C.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, w, h);

  // Slowly turning spotlight fans from the top of the tent.
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = C.pink;
  ctx.translate(FW / 2, 40);
  for (let i = 0; i < 8; i++) {
    ctx.rotate((Math.PI * 2) / 8);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 900, bgT * 0.06, bgT * 0.06 + 0.16);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Checkerboard floor receding to the bottom.
  ctx.save();
  ctx.globalAlpha = 0.16;
  const rows = 7;
  for (let r = 0; r < rows; r++) {
    const yA = PLAY_BOT + (r / rows) * (FH + bleedY - PLAY_BOT);
    const yB = PLAY_BOT + ((r + 1) / rows) * (FH + bleedY - PLAY_BOT);
    const cols = 6 + r * 2;
    for (let c = 0; c < cols; c++) {
      if ((r + c) % 2) continue;
      ctx.fillStyle = C.cream;
      ctx.fillRect(x0 + (c / cols) * w, yA, w / cols + 1, yB - yA + 1);
    }
  }
  ctx.restore();

  /* Curtain scallops along the top. Kept shallow: the HUD sits just below it,
     and a deeper valance clips the life icons on a screen with no letterbox. */
  ctx.save();
  ctx.fillStyle = C.magenta;
  ctx.globalAlpha = 0.9;
  const scallop = CURTAIN_SCALLOP;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0 + w, y0);
  ctx.lineTo(x0 + w, y0 + CURTAIN_BAND);
  for (let x = x0 + w; x > x0; x -= scallop) {
    ctx.arc(x - scallop / 2, y0 + CURTAIN_BAND, scallop / 2, 0, Math.PI);
  }
  ctx.lineTo(x0, y0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // CRT scanlines: this is a digital world, after all.
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#000';
  for (let y = y0; y < y0 + h; y += 4) ctx.fillRect(x0, y, w, 2);
  ctx.restore();
}

function drawVignette() {
  const x0 = -bleedX - 4;
  const y0 = -bleedY - 4;
  const w = FW + bleedX * 2 + 8;
  const h = FH + bleedY * 2 + 8;
  const g = ctx.createRadialGradient(FW / 2, FH / 2, FH * 0.3, FW / 2, FH / 2, FH * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, w, h);
}

/* A cheap glitch: coloured slices torn across the screen. */
function drawGlitch(intensity) {
  if (intensity <= 0) return;
  ctx.save();
  const n = Math.ceil(intensity * 7);
  for (let i = 0; i < n; i++) {
    const y = rand(-bleedY, FH + bleedY);
    const h = rand(3, 22);
    ctx.globalAlpha = rand(0.15, 0.5) * intensity;
    ctx.fillStyle = pick([C.cyan, C.pink, C.yellow, '#fff']);
    ctx.fillRect(-bleedX + rand(-30, 30), y, FW + bleedX * 2, h);
  }
  ctx.restore();
}

/* ---------- particles ---------- */

let confetti = [];

function spawnConfetti(n, x, y, spread) {
  for (let i = 0; i < n; i++) {
    confetti.push({
      x, y,
      vx: rand(-spread, spread),
      vy: rand(-320, -80),
      rot: rand(0, 6.28),
      vr: rand(-9, 9),
      size: rand(5, 11),
      life: rand(0.7, 1.4),
      color: pick([C.pink, C.yellow, C.cyan, C.green, C.cream]),
    });
  }
}

function stepConfetti(dt) {
  for (const p of confetti) {
    p.life -= dt;
    p.vy += 780 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
  }
  confetti = confetti.filter((p) => p.life > 0);
}

function drawConfetti() {
  for (const p of confetti) {
    ctx.save();
    ctx.globalAlpha = clamp(p.life * 1.4, 0, 1);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    ctx.restore();
  }
}

/* ---------- the adventures ----------
 * Each one gets a scratch object `g`. Set g.result to 'win' or 'lose' the
 * moment it is decided; otherwise `timeout` settles it when the clock runs out.
 */

const GAMES = [

  { // Find the way out.
    name: 'FIND THE EXIT',
    duration: 3.2,
    timeout: 'lose',
    init(g) {
      const cells = shuffle([0, 1, 2, 3, 4, 5]).slice(0, 5);
      g.doors = cells.map((cell, i) => ({
        x: 60 + (cell % 3) * 140 + rand(-8, 8),
        y: 208 + Math.floor(cell / 3) * 200 + rand(-8, 8),
        exit: i === 0,
      }));
      g.doors = shuffle(g.doors);
    },
    press(g, x, y) {
      for (const d of g.doors) {
        if (Math.abs(x - d.x) < 44 && Math.abs(y - d.y) < 58) {
          g.result = d.exit ? 'win' : 'lose';
          g.hit = d;
          return;
        }
      }
    },
    draw(g, t) {
      for (const d of g.doors) {
        ctx.save();
        ctx.translate(d.x, d.y);
        if (d.exit) {
          ctx.shadowColor = C.green;
          ctx.shadowBlur = 18 + Math.sin(t * 8) * 8;
        }
        ctx.fillStyle = d.exit ? '#1d5f3a' : '#3a1d55';
        roundRect(-38, -52, 76, 104, 8); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = d.exit ? C.green : C.purple;
        ctx.lineWidth = 4;
        roundRect(-38, -52, 76, 104, 8); ctx.stroke();
        ctx.fillStyle = d.exit ? C.green : C.purple;
        circle(22, 6, 4.5); ctx.fill();
        if (d.exit) text('EXIT', 0, -22, 19, { color: C.green, stroke: '#06331c', strokeW: 5 });
        ctx.restore();
      }
    },
  },

  { // Pop every balloon.
    name: 'POP THEM ALL',
    duration: 4.0,
    timeout: 'lose',
    init(g) {
      g.balloons = [];
      for (let i = 0; i < 5; i++) {
        g.balloons.push({
          x: 60 + i * 70 + rand(-14, 14),
          y: rand(220, 460),
          r: 26,
          phase: rand(0, 6.28),
          color: pick([C.pink, C.yellow, C.cyan, C.green, C.magenta]),
          popped: false,
        });
      }
    },
    update(g, dt, t) {
      for (const b of g.balloons) b.y -= 26 * dt;
      if (g.balloons.every((b) => b.popped)) g.result = 'win';
    },
    press(g, x, y) {
      for (const b of g.balloons) {
        if (b.popped) continue;
        if (Math.hypot(x - b.x, y - b.y) < b.r + 14) {
          b.popped = true;
          spawnConfetti(10, b.x, b.y, 150);
          // Settle on the tap itself, so the last pop reads as instant.
          if (g.balloons.every((o) => o.popped)) g.result = 'win';
          return;
        }
      }
    },
    draw(g, t) {
      for (const b of g.balloons) {
        if (b.popped) continue;
        const sway = Math.sin(t * 2 + b.phase) * 7;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x + sway, b.y + b.r);
        ctx.quadraticCurveTo(b.x + sway - 8, b.y + b.r + 26, b.x + sway + 4, b.y + b.r + 48);
        ctx.stroke();
        ctx.fillStyle = b.color;
        ctx.save();
        ctx.translate(b.x + sway, b.y);
        ctx.scale(1, 1.18);
        circle(0, 0, b.r); ctx.fill();
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        circle(b.x + sway - 8, b.y - 10, 6); ctx.fill();
      }
    },
  },

  { // Stay out from under the falling abstraction.
    name: 'DODGE!',
    duration: 4.2,
    timeout: 'win',
    init(g) {
      g.px = FW / 2;
      g.target = FW / 2;
      g.blobs = [];
      g.spawn = 0.25; // a beat to react before the first one drops
    },
    update(g, dt, t) {
      g.px += (g.target - g.px) * Math.min(1, dt * 14);
      g.spawn -= dt;
      if (g.spawn <= 0) {
        /* Blobs have to arrive far enough apart that there is always a gap to
           step into — packed tighter, even perfect play loses most rounds.
           Spread that thin, though, and standing still becomes a decent bet,
           so most of them are aimed at wherever the player is loitering. */
        g.spawn = rand(0.38, 0.58);
        const aimed = Math.random() < 0.45;
        const bx = aimed ? clamp(g.px + rand(-75, 75), 40, FW - 40) : rand(40, FW - 40);
        g.blobs.push({ x: bx, y: PLAY_TOP - 20, r: rand(15, 23), vy: rand(210, 290), seed: rand(0, 6.28) });
      }
      for (const b of g.blobs) b.y += b.vy * dt;
      g.blobs = g.blobs.filter((b) => b.y < PLAY_BOT + 60);
      for (const b of g.blobs) {
        if (Math.hypot(b.x - g.px, b.y - (PLAY_BOT - 34)) < b.r + 12) g.result = 'lose';
      }
    },
    press(g, x) { g.target = clamp(x, 30, FW - 30); },
    move(g, x) { g.target = clamp(x, 30, FW - 30); },
    draw(g, t) {
      for (const b of g.blobs) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.fillStyle = '#120320';
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const rr = b.r * (1 + Math.sin(a * 3 + t * 9 + b.seed) * 0.16);
          const px = Math.cos(a) * rr;
          const py = Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = C.cyan;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.75;
        ctx.stroke();
        ctx.restore();
      }
      drawJester(g.px, PLAY_BOT - 34, 1.15, { panic: 0.7, tilt: (g.target - g.px) * 0.004 });
    },
  },

  { // Whack the troublemaker.
    name: 'WHACK THE RABBIT',
    duration: 4.4,
    timeout: 'lose',
    init(g) {
      g.holes = [];
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 3; c++) {
          g.holes.push({ x: 76 + c * 124, y: 230 + r * 170 });
        }
      }
      g.active = randInt(0, 5);
      g.timer = 0.6;
      g.hits = 0;
      g.need = 3;
      g.pop = 0;
    },
    update(g, dt) {
      g.pop = Math.min(1, g.pop + dt * 7);
      g.timer -= dt;
      if (g.timer <= 0) {
        let next = randInt(0, 5);
        if (next === g.active) next = (next + 1) % 6;
        g.active = next;
        g.timer = 0.58;
        g.pop = 0;
      }
    },
    press(g, x, y) {
      const h = g.holes[g.active];
      if (Math.hypot(x - h.x, y - (h.y - 16)) < 40) {
        g.hits++;
        spawnConfetti(8, h.x, h.y - 20, 120);
        if (g.hits >= g.need) { g.result = 'win'; return; }
        let next = randInt(0, 5);
        if (next === g.active) next = (next + 1) % 6;
        g.active = next;
        g.timer = 0.58;
        g.pop = 0;
      }
    },
    draw(g, t) {
      for (let i = 0; i < g.holes.length; i++) {
        const h = g.holes[i];
        ctx.fillStyle = '#150425';
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.scale(1, 0.4);
        circle(0, 0, 42); ctx.fill();
        ctx.restore();
        if (i === g.active) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(h.x - 44, h.y - 90, 88, 92);
          ctx.clip();
          drawRabbit(h.x, h.y - 6 - g.pop * 30, 1.15);
          ctx.restore();
        }
      }
      text(`${g.hits} / ${g.need}`, FW / 2, PLAY_BOT - 6, 22, { color: C.yellow, stroke: '#3a0d55', strokeW: 5 });
    },
  },

  { // Match the mask the Ringmaster is holding up.
    name: 'MATCH THE MASK',
    duration: 3.2,
    timeout: 'lose',
    init(g) {
      g.happy = Math.random() < 0.5;
      g.correct = randInt(0, 3);
      g.slots = [];
      for (let i = 0; i < 4; i++) {
        g.slots.push({
          x: 96 + (i % 2) * 208,
          y: 350 + Math.floor(i / 2) * 150,
          happy: i === g.correct ? g.happy : !g.happy,
        });
      }
    },
    press(g, x, y) {
      for (let i = 0; i < g.slots.length; i++) {
        const s = g.slots[i];
        if (Math.hypot(x - s.x, y - s.y) < 62) {
          g.result = i === g.correct ? 'win' : 'lose';
          return;
        }
      }
    },
    draw(g, t) {
      drawMask(FW / 2, 220, 52, g.happy, C.cream, C.yellow);
      text('MATCH THIS', FW / 2, 288, 17, { color: C.ink, alpha: 0.75 });
      for (const s of g.slots) {
        drawMask(s.x, s.y, 48, s.happy, C.cream, s.happy ? C.pink : C.cyan);
      }
    },
  },

  { // Keep the abstraction meter down by tapping.
    name: 'TAP! STAY REAL!',
    duration: 4.2,
    timeout: 'win',
    init(g) {
      g.meter = 0.5;
      g.rate = 0.4;
      g.shake = 0;
    },
    update(g, dt) {
      g.meter += g.rate * dt;
      g.shake = Math.max(0, g.shake - dt * 4);
      if (g.meter >= 1) { g.meter = 1; g.result = 'lose'; }
    },
    press(g) {
      g.meter = Math.max(0, g.meter - 0.105);
      g.shake = 1;
      spawnConfetti(3, FW / 2, 470, 90);
    },
    draw(g, t) {
      const wobble = g.meter * 6;
      drawJester(
        FW / 2 + Math.sin(t * 30) * wobble * 0.4,
        330 + Math.sin(t * 24) * wobble * 0.3,
        2.6 + g.shake * 0.12,
        { panic: g.meter, tilt: Math.sin(t * 11) * g.meter * 0.14 },
      );

      const bw = 250;
      const bx = (FW - bw) / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      roundRect(bx, 470, bw, 30, 15); ctx.fill();
      const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      grad.addColorStop(0, C.green);
      grad.addColorStop(0.6, C.yellow);
      grad.addColorStop(1, C.red);
      ctx.fillStyle = grad;
      ctx.save();
      roundRect(bx, 470, bw, 30, 15); ctx.clip();
      ctx.fillRect(bx, 470, bw * g.meter, 30);
      ctx.restore();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 3;
      roundRect(bx, 470, bw, 30, 15); ctx.stroke();
      text('ABSTRACTION', FW / 2, 518, 15, { color: C.ink, alpha: 0.7 });

      if (g.meter > 0.7) drawGlitch((g.meter - 0.7) * 2.6);
    },
  },

  { // Keep it in the air.
    name: 'KEEP IT UP',
    duration: 4.6,
    timeout: 'lose',
    init(g) {
      g.ball = { x: FW / 2, y: 240, vx: rand(-40, 40), vy: 0 };
      g.taps = 0;
      g.need = 3;
    },
    update(g, dt) {
      const b = g.ball;
      b.vy += 900 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < 46) { b.x = 46; b.vx = Math.abs(b.vx); }
      if (b.x > FW - 46) { b.x = FW - 46; b.vx = -Math.abs(b.vx); }
      if (b.y > PLAY_BOT - 20) g.result = 'lose';
    },
    press(g, x, y) {
      const b = g.ball;
      if (Math.hypot(x - b.x, y - b.y) < 62) {
        b.vy = -470;
        b.vx += (b.x - x) * 2.2;
        b.vx = clamp(b.vx, -190, 190);
        g.taps++;
        spawnConfetti(6, b.x, b.y, 110);
        if (g.taps >= g.need) g.result = 'win';
      }
    },
    draw(g, t) {
      const b = g.ball;
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000';
      ctx.translate(b.x, PLAY_BOT - 6);
      ctx.scale(1, 0.28);
      circle(0, 0, 26); ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(t * 3);
      ctx.fillStyle = C.pink;
      circle(0, 0, 26); ctx.fill();
      ctx.fillStyle = C.cream;
      ctx.beginPath();
      ctx.arc(0, 0, 26, -0.4, 0.9);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.cyan;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 2.2, 3.5);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      text(`${g.taps} / ${g.need}`, FW / 2, PLAY_BOT - 6, 22, { color: C.yellow, stroke: '#3a0d55', strokeW: 5 });
    },
  },

  { // The classic trap: sometimes the right move is to sit still.
    name: 'RINGMASTER SAYS',
    duration: 2.8,
    init(g) {
      g.tap = Math.random() < 0.5;
      g.title = g.tap ? 'TAP!' : "DON'T TAP!";
      g.timeout = g.tap ? 'lose' : 'win';
    },
    press(g) {
      g.result = g.tap ? 'win' : 'lose';
    },
    draw(g, t) {
      drawRingmaster(FW / 2, 300, 3.1, { t });
      text(g.tap ? 'TAP!' : "DON'T TAP!", FW / 2, 470, 44, {
        color: g.tap ? C.yellow : C.red, stroke: '#1b0630', strokeW: 9,
      });
    },
  },

  { // One of these is not like the others.
    name: 'ODD ONE OUT',
    duration: 3.4,
    timeout: 'lose',
    init(g) {
      g.cols = 4;
      g.rows = 5;
      g.odd = randInt(0, g.cols * g.rows - 1);
      g.happy = Math.random() < 0.5;
    },
    press(g, x, y) {
      const cw = 300 / g.cols;
      const ch = 300 / g.rows;
      const ox = (FW - 300) / 2;
      const oy = 180;
      const c = Math.floor((x - ox) / cw);
      const r = Math.floor((y - oy) / ch);
      if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return;
      g.result = (r * g.cols + c) === g.odd ? 'win' : 'lose';
    },
    draw(g, t) {
      const cw = 300 / g.cols;
      const ch = 300 / g.rows;
      const ox = (FW - 300) / 2;
      const oy = 180;
      for (let r = 0; r < g.rows; r++) {
        for (let c = 0; c < g.cols; c++) {
          const i = r * g.cols + c;
          const cx = ox + c * cw + cw / 2;
          const cy = oy + r * ch + ch / 2;
          drawMask(cx, cy, cw * 0.36, i === g.odd ? !g.happy : g.happy, C.cream, C.purple);
        }
      }
      text('SPOT THE ODD FACE', FW / 2, 520, 18, { color: C.ink, alpha: 0.8 });
    },
  },
];

/* ---------- game flow ---------- */

let best = loadBest();
let state = 'menu';        // menu | announce | play | result | speedup | over
let phaseT = 0;
let round = 0;
let lives = 3;
let score = 0;
let speedMul = 1;
let mg = null;
let g = null;
let title = '';
let timeLeft = 0;
let duration = 1;
let lastResult = null;
let glitch = 0;
let lastIndex = -1;

function startGame() {
  round = 0;
  lives = 3;
  score = 0;
  speedMul = 1;
  confetti = [];
  nextRound();
}

function nextRound() {
  round++;
  speedMul = Math.min(1.85, 1 + Math.floor((round - 1) / 4) * 0.13);

  let idx = randInt(0, GAMES.length - 1);
  if (idx === lastIndex) idx = (idx + 1) % GAMES.length;
  lastIndex = idx;

  mg = GAMES[idx];
  g = { result: null };
  if (mg.init) mg.init(g);
  title = g.title || mg.name;
  duration = mg.duration / speedMul;

  if (round > 1 && (round - 1) % 4 === 0) {
    state = 'speedup';
  } else {
    state = 'announce';
  }
  phaseT = 0;
}

function beginPlay() {
  state = 'play';
  phaseT = 0;
  timeLeft = duration;
}

/* Record the moment a score is reached, not when the run ends. Waiting until
   death meant a great run that was still in progress never got saved. */
function recordBest() {
  if (score > best) {
    best = score;
    saveBest();
  }
}

function settle(result) {
  lastResult = result;
  state = 'result';
  phaseT = 0;
  if (result === 'win') {
    score++;
    recordBest();
    spawnConfetti(46, FW / 2, 300, 260);
  } else {
    lives = Math.max(0, lives - 1);
    glitch = 1;
    recordBest();
  }
}

function afterResult() {
  if (lastResult === 'lose' && lives <= 0) {
    recordBest();
    state = 'over';
    phaseT = 0;
    return;
  }
  nextRound();
}

function update(dt, t) {
  bgT += dt;
  stepConfetti(dt);
  glitch = Math.max(0, glitch - dt * 1.6);
  phaseT += dt;

  if (state === 'speedup') {
    if (phaseT > 0.95) { state = 'announce'; phaseT = 0; }
    return;
  }

  if (state === 'announce') {
    if (phaseT > Math.max(0.62, 1.05 / speedMul)) beginPlay();
    return;
  }

  if (state === 'play') {
    if (mg.update) mg.update(g, dt, t);
    if (g.result) { settle(g.result); return; }
    timeLeft -= dt;
    if (timeLeft <= 0) settle(g.timeout || mg.timeout || 'lose');
    return;
  }

  if (state === 'result') {
    if (phaseT > 0.85) afterResult();
  }
}

/* ---------- HUD and overlays ---------- */

function drawHud() {
  /* Everything here clears the curtain valance above, which reaches y≈34 on a
     screen with no letterbox to hide it. */
  for (let i = 0; i < 3; i++) {
    const x = 34 + i * 38; // wide enough that the cap bells do not touch
    ctx.save();
    ctx.globalAlpha = i < lives ? 1 : 0.22;
    drawJester(x, HUD_LIVES_Y, HUD_LIVES_SCALE);
    ctx.restore();
  }

  text(`${score}`, FW - 26, HUD_SCORE_Y, HUD_SCORE_SIZE,
    { align: 'right', color: C.yellow, stroke: '#3a0d55', strokeW: 6 });
  text(`BEST ${best}`, FW - 26, 76, 13, { align: 'right', color: C.ink, alpha: 0.65 });

  if (state === 'play') {
    const frac = clamp(timeLeft / duration, 0, 1);
    const bw = FW - 48;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(24, PLAY_BOT + 24, bw, 14, 7); ctx.fill();
    ctx.fillStyle = frac < 0.3 ? C.red : C.cyan;
    ctx.save();
    roundRect(24, PLAY_BOT + 24, bw, 14, 7); ctx.clip();
    ctx.fillRect(24, PLAY_BOT + 24, bw * frac, 14);
    ctx.restore();
  }
}

function drawBanner(str, color, sub) {
  const pop = clamp(phaseT * 7, 0, 1);
  const s = 0.7 + pop * 0.3;
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = '#0d0218';
  ctx.fillRect(-bleedX - 4, FH / 2 - 78, FW + bleedX * 2 + 8, 156);
  ctx.restore();

  ctx.save();
  ctx.translate(FW / 2, FH / 2 - (sub ? 14 : 0));
  ctx.scale(s, s);
  const size = str.length > 13 ? 38 : 46;
  text(str, 0, 0, size, { color, stroke: '#1b0630', strokeW: 10 });
  ctx.restore();
  if (sub) text(sub, FW / 2, FH / 2 + 40, 18, { color: C.ink, alpha: 0.8 });
}

function drawMenu(t) {
  drawRingmaster(FW / 2, 210, 3.4, { t });
  drawJester(96, 372, 2.1, { tilt: Math.sin(t * 1.4) * 0.1 });
  drawJester(FW - 96, 372, 2.1, { tilt: -Math.sin(t * 1.4) * 0.1 });

  text('DIGITAL', FW / 2, 446, 50, { color: C.yellow, stroke: '#1b0630', strokeW: 10 });
  text('CIRCUS', FW / 2, 504, 50, { color: C.pink, stroke: '#1b0630', strokeW: 10 });
  text('TAP TO ENTER', FW / 2, 556, 20, {
    color: C.ink, alpha: 0.6 + Math.sin(t * 4) * 0.35,
  });
  if (best > 0) text(`BEST ${best}`, FW / 2, 592, 16, { color: C.cyan, alpha: 0.8 });
}

function drawOver(t) {
  drawRingmaster(FW / 2, 220, 3.2, { t });
  text("THE SHOW'S", FW / 2, 380, 34, { color: C.ink, stroke: '#1b0630', strokeW: 8 });
  text('OVER', FW / 2, 422, 44, { color: C.red, stroke: '#1b0630', strokeW: 9 });
  text(`${score} ADVENTURES`, FW / 2, 480, 24, { color: C.yellow, stroke: '#3a0d55', strokeW: 6 });
  text(`BEST ${best}`, FW / 2, 512, 17, { color: C.cyan, alpha: 0.85 });
  text('TAP TO TRY AGAIN', FW / 2, 566, 19, {
    color: C.ink, alpha: 0.55 + Math.sin(t * 4) * 0.35,
  });
}

/* ---------- frame ---------- */

let last = 0;
let clock = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 0;
  last = now;
  clock += dt;

  update(dt, clock);

  drawBackground();

  if (state === 'menu') {
    drawMenu(clock);
  } else if (state === 'over') {
    drawOver(clock);
    drawConfetti();
  } else {
    if (state === 'play' || state === 'result') mg.draw(g, clock);
    drawConfetti();
    drawHud();

    if (state === 'speedup') {
      drawBanner('SPEED UP!', C.cyan);
    } else if (state === 'announce') {
      drawRingmaster(FW / 2, 210, 2.6, { t: clock });
      drawBanner(title, C.yellow);
    } else if (state === 'result') {
      if (lastResult === 'win') drawBanner('NICE!', C.green);
      else drawBanner('OUCH!', C.red, lives > 0 ? `${lives} left` : 'no lives left');
    }
  }

  drawGlitch(glitch);
  drawVignette();
}

/* ---------- input ---------- */

function toField(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left - offX) / scale,
    y: (e.clientY - rect.top - offY) / scale,
  };
}

function onPress(x, y) {
  if (state === 'menu') { startGame(); return; }
  if (state === 'over') { startGame(); return; }
  if (state === 'play' && mg.press) mg.press(g, x, y);
}

stage.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const p = toField(e);
  onPress(p.x, p.y);
});

stage.addEventListener('pointermove', (e) => {
  if (state !== 'play' || !mg.move) return;
  if (e.pressure === 0 && e.pointerType === 'mouse' && e.buttons === 0) return;
  const p = toField(e);
  mg.move(g, p.x, p.y);
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    onPress(FW / 2, FH / 2);
  }
});

document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

/* Losing a run to a phone call would be unfair, so bail out to the menu
   rather than letting the clock run down in the background. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (state === 'play' || state === 'announce' || state === 'speedup')) {
    recordBest();
    state = 'over';
    phaseT = 0;
  }
});

/* ---------- boot ---------- */

resize();
requestAnimationFrame(frame);

/* Test hook: lets an automated player read the round and drive input. */
window.__circus = {
  get state() { return state; },
  get score() { return score; },
  get best() { return best; },
  get lives() { return lives; },
  get round() { return round; },
  get title() { return title; },
  get names() { return GAMES.map((m) => m.name); },
  get view() { return { FW, FH, scale, offX, offY }; },
  get layout() {
    return {
      curtainBottom: CURTAIN_BOTTOM,
      livesTop: HUD_LIVES_TOP,
      scoreTop: HUD_SCORE_Y - HUD_SCORE_SIZE * 0.5,
      playTop: PLAY_TOP,
    };
  },
  press: onPress,
  force(name) {
    const idx = GAMES.findIndex((m) => m.name === name);
    if (idx < 0) return false;
    mg = GAMES[idx];
    g = { result: null };
    if (mg.init) mg.init(g);
    title = g.title || mg.name;
    duration = mg.duration;
    beginPlay();
    return true;
  },
  get scratch() { return g; },
};

/* ---------- offline support ---------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration failed; app still works online.', err);
    });
  });
}
