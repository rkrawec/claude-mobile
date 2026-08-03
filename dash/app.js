'use strict';

/* localStorage is shared across the whole github.io origin, so this key must be
   prefixed with the app's folder name to avoid colliding with sibling apps. */
const STORAGE_KEY = 'dash.v1';

/* The world is drawn in virtual units and scaled to fit, so the jump arc clears
   the same obstacles on every screen.
 *
 * Scaling by height alone would be wrong: a phone held upright is narrow, so a
 * fixed virtual height leaves only a sliver of world visible ahead of the
 * player and obstacles arrive with no warning. Scale by whichever axis is
 * tighter instead, so both a minimum forward view and enough headroom for the
 * jump are guaranteed in portrait and landscape alike. */
const VIEW_W = 400;      // minimum world units visible across
const VIEW_H = 300;      // minimum world units visible top to bottom

const SZ = 32;           // player size
const PLAYER_X = 92;     // player's fixed distance from the left edge
const GRAVITY = 2600;
const JUMP_V = -760;
const SPEED_MIN = 250;
const SPEED_MAX = 400;
const RAMP = 3000;       // distance over which speed reaches its maximum

/* A jump lasts this long; obstacle spacing is derived from the ground it
   covers, so a run is always physically clearable. */
const AIRTIME = (2 * -JUMP_V) / GRAVITY;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const els = {
  stage: document.getElementById('stage'),
  hudScore: document.getElementById('hud-score'),
  hudBest: document.getElementById('hud-best'),
  overlay: document.getElementById('overlay'),
  ovAttempt: document.getElementById('ov-attempt'),
  ovTitle: document.getElementById('ov-title'),
  ovSub: document.getElementById('ov-sub'),
  ovHint: document.getElementById('ov-hint'),
};

let VW = VIEW_W;
let VH = VIEW_H;
let groundY = 200;
let scale = 1;

/** @type {'ready'|'playing'|'dead'|'paused'} */
let state = 'ready';
let attempts = 0;
let best = loadBest();

const player = { y: 0, vy: 0, onGround: true, angle: 0 };
let distance = 0;
let speed = SPEED_MIN;
let obstacles = [];
let particles = [];
let spawnCursor = 0;
let shake = 0;

/* ---------- storage ---------- */

function loadBest() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    const value = parsed && typeof parsed.best === 'number' ? parsed.best : 0;
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
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
  const rect = els.stage.getBoundingClientRect();
  const cssW = Math.max(1, rect.width);
  const cssH = Math.max(1, rect.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);

  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  scale = Math.min(cssW / VIEW_W, cssH / VIEW_H);
  VW = cssW / scale;
  VH = cssH / scale;

  /* Sit the ground about two thirds down, but always keep enough sky for the
     jump and enough ground below it that the screen bottom is not bare. */
  const wasOnGround = player.onGround;
  groundY = Math.min(VH - 60, Math.max(150, VH * 0.68));
  if (wasOnGround) player.y = groundY - SZ;

  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

/* ---------- level generation ---------- */

function difficulty() {
  return Math.min(1, distance / RAMP);
}

function currentSpeed() {
  return SPEED_MIN + (SPEED_MAX - SPEED_MIN) * difficulty();
}

function pick(d) {
  const options = [
    { type: 'spike', count: 1, weight: 3 },
    { type: 'spike', count: 2, weight: d > 0.12 ? 2.5 : 0 },
    { type: 'spike', count: 3, weight: d > 0.5 ? 1.6 : 0 },
    { type: 'block', height: 40, weight: d > 0.2 ? 2 : 0 },
    { type: 'block', height: 80, weight: d > 0.6 ? 1.2 : 0 },
  ].filter((o) => o.weight > 0);

  let roll = Math.random() * options.reduce((sum, o) => sum + o.weight, 0);
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) return option;
  }
  return options[0];
}

function spawnAhead() {
  const horizon = distance + VW + 300;
  while (spawnCursor < horizon) {
    const d = difficulty();
    const option = pick(d);
    let width;

    if (option.type === 'spike') {
      width = option.count * 26;
      for (let i = 0; i < option.count; i++) {
        obstacles.push({ type: 'spike', x: spawnCursor + i * 26, w: 26, h: 30 });
      }
    } else {
      width = 44;
      obstacles.push({ type: 'block', x: spawnCursor, w: width, h: option.height });
    }

    /* Spacing always exceeds the horizontal reach of one jump, so the player
       lands on flat ground between obstacles rather than onto the next one. */
    const reach = AIRTIME * currentSpeed();
    let gap = reach * 1.15 + 30 + Math.random() * 60;
    if (option.type === 'block') gap += 50; // room to drop off before the next
    spawnCursor += width + gap;
  }
}

/* ---------- lifecycle ---------- */

function reset() {
  distance = 0;
  speed = SPEED_MIN;
  obstacles = [];
  particles = [];
  shake = 0;
  player.y = groundY - SZ;
  player.vy = 0;
  player.onGround = true;
  player.angle = 0;
  spawnCursor = VW + 140; // a short runway before the first obstacle
  spawnAhead();
}

function score() {
  return Math.floor(distance / 10);
}

function start() {
  reset();
  attempts += 1;
  state = 'playing';
  showOverlay(false);
}

function die() {
  state = 'dead';
  shake = 1;
  burst();

  const final = score();
  const isBest = final > best;
  if (isBest) {
    best = final;
    saveBest();
  }

  els.ovAttempt.hidden = false;
  els.ovAttempt.textContent = `Attempt ${attempts}`;
  els.ovTitle.textContent = `${final} m`;
  els.ovTitle.classList.add('small');
  els.ovSub.textContent = isBest ? 'New best!' : `Best ${best} m`;
  els.ovSub.classList.toggle('best', isBest);
  els.ovHint.textContent = 'Tap to try again';
  showOverlay(true);
}

function showOverlay(visible) {
  els.overlay.hidden = !visible;
}

function press() {
  if (state === 'ready' || state === 'dead') {
    els.ovTitle.classList.remove('small');
    els.ovSub.classList.remove('best');
    start();
    return;
  }
  if (state === 'paused') {
    state = 'playing';
    showOverlay(false);
    return;
  }
  if (player.onGround) {
    player.vy = JUMP_V;
    player.onGround = false;
  }
}

/* ---------- simulation ---------- */

function update(dt) {
  speed = currentSpeed();
  distance += speed * dt;

  const prevBottom = player.y + SZ;
  player.vy += GRAVITY * dt;
  player.y += player.vy * dt;

  let grounded = false;
  if (player.y + SZ >= groundY) {
    player.y = groundY - SZ;
    player.vy = 0;
    grounded = true;
  }

  const px = distance + PLAYER_X;
  const left = px;
  const right = px + SZ;

  for (const o of obstacles) {
    if (o.x + o.w < left || o.x > right) continue;

    if (o.type === 'spike') {
      /* Forgiving hitbox: the visible triangle is mostly empty near its base
         corners, so only the middle of it kills. */
      const hx = o.x + o.w * 0.26;
      const hw = o.w * 0.48;
      const hy = groundY - o.h * 0.86;
      if (right > hx && left < hx + hw && player.y + SZ > hy) {
        die();
        return;
      }
    } else {
      const top = groundY - o.h;
      if (player.vy >= 0 && prevBottom <= top + 2 && player.y + SZ >= top) {
        player.y = top - SZ;
        player.vy = 0;
        grounded = true;
      } else if (player.y + SZ > top) {
        die(); // ran into the side of the block
        return;
      }
    }
  }

  if (grounded && !player.onGround) {
    // Land square, not mid-tumble.
    player.angle = Math.round(player.angle / (Math.PI / 2)) * (Math.PI / 2);
  }
  player.onGround = grounded;

  if (!grounded) player.angle += (Math.PI / AIRTIME) * dt;

  if (grounded && Math.random() < dt * 34) {
    particles.push({
      x: px + 2, y: player.y + SZ - 2,
      vx: -speed * 0.35 - Math.random() * 60, vy: -Math.random() * 90,
      life: 0.5, size: 2 + Math.random() * 3,
    });
  }

  stepParticles(dt);

  obstacles = obstacles.filter((o) => o.x + o.w > distance - 60);
  spawnAhead();
}

function burst() {
  const px = distance + PLAYER_X + SZ / 2;
  const py = player.y + SZ / 2;
  for (let i = 0; i < 26; i++) {
    const a = (Math.PI * 2 * i) / 26 + Math.random() * 0.3;
    const sp = 120 + Math.random() * 260;
    particles.push({
      x: px, y: py,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
      life: 0.7, size: 3 + Math.random() * 4,
    });
  }
}

function stepParticles(dt) {
  for (const p of particles) {
    p.life -= dt;
    p.vy += GRAVITY * 0.45 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  particles = particles.filter((p) => p.life > 0);
}

/* ---------- rendering ---------- */

function draw() {
  ctx.save();
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * 9 * shake, (Math.random() - 0.5) * 9 * shake);
  }

  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, '#141c3a');
  sky.addColorStop(0.75, '#0d1226');
  sky.addColorStop(1, '#0a0e20');
  ctx.fillStyle = sky;
  ctx.fillRect(-20, -20, VW + 40, groundY + 20);

  drawStars();
  drawParallax();
  drawGround();

  for (const o of obstacles) {
    const x = o.x - distance;
    if (x + o.w < -40 || x > VW + 40) continue;
    if (o.type === 'spike') drawSpike(x, o);
    else drawBlock(x, o);
  }

  drawParticles();
  if (state !== 'dead') drawPlayer();

  ctx.restore();
}

/* A deterministic starfield, scrolled slowly, so the sky above the action is
   not a flat void on a tall phone screen. */
function drawStars() {
  ctx.save();
  ctx.fillStyle = '#9fb4e8';
  const spacing = 160;
  const offset = (distance * 0.06) % spacing;
  for (let i = 0; i < 26; i++) {
    const seedX = ((i * 97) % 13) / 13;
    const seedY = ((i * 61) % 17) / 17;
    const x = ((i * spacing) / 2 - offset + VW) % (VW + spacing) - spacing / 2;
    const y = 20 + seedY * (groundY - 150);
    ctx.globalAlpha = 0.12 + seedX * 0.22;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();
}

function drawParallax() {
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#1d2748';
  ctx.lineWidth = 2;
  const spacing = 150;
  const offset = (distance * 0.35) % spacing;
  const height = Math.min(170, groundY - 40);
  for (let x = -offset; x < VW + spacing; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.lineTo(x + 70, groundY - height);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGround() {
  // Fill to well past the bottom of the screen, whatever the aspect ratio.
  ctx.fillStyle = '#080c1a';
  ctx.fillRect(-20, groundY, VW + 40, VH - groundY + 40);

  ctx.fillStyle = '#3ddc84';
  ctx.fillRect(-20, groundY - 3, VW + 40, 3);

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#3ddc84';
  const spacing = 44;
  const offset = distance % spacing;
  for (let x = -offset; x < VW + spacing; x += spacing) {
    ctx.fillRect(x, groundY + 12, 22, 2);
  }
  ctx.restore();
}

function drawSpike(x, o) {
  ctx.beginPath();
  ctx.moveTo(x + 1, groundY);
  ctx.lineTo(x + o.w / 2, groundY - o.h);
  ctx.lineTo(x + o.w - 1, groundY);
  ctx.closePath();
  ctx.fillStyle = '#f45d7a';
  ctx.fill();
  ctx.strokeStyle = '#ffd0da';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawBlock(x, o) {
  const top = groundY - o.h;
  ctx.fillStyle = '#2a3766';
  roundRect(x, top, o.w, o.h, 5);
  ctx.fill();
  ctx.fillStyle = '#6f86d6';
  ctx.fillRect(x, top, o.w, 3);
}

function drawPlayer() {
  const cx = PLAYER_X + SZ / 2;
  const cy = player.y + SZ / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(player.angle);

  ctx.fillStyle = '#3ddc84';
  roundRect(-SZ / 2, -SZ / 2, SZ, SZ, 7);
  ctx.fill();

  ctx.fillStyle = '#0b1020';
  roundRect(-7, -7, 14, 14, 3);
  ctx.fill();

  ctx.restore();
}

function drawParticles() {
  ctx.fillStyle = '#3ddc84';
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6));
    ctx.fillRect(p.x - distance, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- loop ---------- */

let last = 0;

function frame(now) {
  requestAnimationFrame(frame);

  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 0;
  last = now;

  if (state === 'playing') update(dt);
  if (shake > 0) shake = Math.max(0, shake - dt * 3);
  if (state === 'dead') stepParticles(dt);

  draw();

  els.hudScore.textContent = `${score()} m`;
  els.hudBest.textContent = `Best ${best} m`;
}

/* ---------- input ---------- */

/* pointerdown rather than click: it fires on touch-down, so the jump happens
   the instant the finger lands instead of ~100ms later. */
els.stage.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  press();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault();
    press();
  }
});

// Stop iOS treating a fast second tap as a zoom gesture.
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') {
    state = 'paused';
    els.ovAttempt.hidden = true;
    els.ovTitle.textContent = 'Paused';
    els.ovTitle.classList.add('small');
    els.ovSub.textContent = `${score()} m`;
    els.ovSub.classList.remove('best');
    els.ovHint.textContent = 'Tap to resume';
    showOverlay(true);
  }
});

/* ---------- boot ---------- */

resize();
reset();
els.hudBest.textContent = `Best ${best} m`;
requestAnimationFrame(frame);

/* Test hook: lets an automated player read the world and drive input. */
window.__dash = {
  get state() { return state; },
  get score() { return score(); },
  get best() { return best; },
  get attempts() { return attempts; },
  get onGround() { return player.onGround; },
  get speed() { return currentSpeed(); },
  get view() { return { VW, VH, groundY, scale }; },
  get obstacleCount() { return obstacles.length; },
  get next() {
    const front = distance + PLAYER_X + SZ;
    let nearest = null;
    for (const o of obstacles) {
      const dx = o.x - front;
      if (dx < -o.w) continue;
      if (!nearest || dx < nearest.dx) nearest = { dx, type: o.type, h: o.h, w: o.w };
    }
    return nearest;
  },
  get reach() { return AIRTIME * currentSpeed(); },
  press,
};

/* ---------- offline support ---------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration failed; app still works online.', err);
    });
  });
}
