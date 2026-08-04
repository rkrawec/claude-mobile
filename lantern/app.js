'use strict';

/* A paper lantern rises up a wind-blown canyon. Drag to steer; touch a wall and
 * the run ends. The whole world is painted with canvas primitives — gradients,
 * silhouettes and pre-rendered soft sprites — so there are no image assets and
 * it all works offline.
 *
 * localStorage is shared across the whole github.io origin, so this key must be
 * prefixed with the app's folder name to avoid colliding with sibling apps. */
const STORAGE_KEY = 'lantern.v1';

/* Scale to whichever axis is tighter, so both a minimum width of canyon and a
   minimum height of sky are guaranteed in portrait and landscape alike. */
const VIEW_W = 400;
const VIEW_H = 620;

const COL = 400;          // world x range the canyon lives in
const LR = 13;            // lantern collision radius
const RAMP = 2600;        // altitude over which difficulty reaches its peak
const SY_FRAC = 0.62;     // where the lantern sits down the screen

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');

let VW = VIEW_W;
let VH = VIEW_H;
let SY = 380;
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
    console.warn('Could not read the saved best altitude.', err);
    return 0;
  }
}

function saveBest() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ best }));
  } catch (err) {
    console.warn('Could not save the best altitude.', err);
  }
}

/* ---------- helpers ---------- */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;

function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function mix(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function rgba(c, a) {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}

/* Interpolate a keyframed palette by altitude. */
function sample(anchors, alt) {
  if (alt <= anchors[0].alt) return anchors[0].rgb;
  const last = anchors[anchors.length - 1];
  if (alt >= last.alt) return last.rgb;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (alt <= b.alt) {
      const t = (alt - a.alt) / (b.alt - a.alt);
      return a.rgb.map((c, j) => mix(c, b.rgb[j], t));
    }
  }
  return last.rgb;
}

function prep(anchors) {
  for (const a of anchors) a.rgb = a.stops.map(hex);
  return anchors;
}

/* The journey: dusk valley, then twilight, night, the aurora, and thin air. */
const SKY = prep([
  { alt: 0,    stops: ['#3d5391', '#b9675e', '#f2ab68'] },
  { alt: 700,  stops: ['#2b2c62', '#71427f', '#c9707e'] },
  { alt: 1500, stops: ['#141a44', '#28265e', '#4d3070'] },
  { alt: 2400, stops: ['#070c26', '#0d1642', '#12454e'] },
  { alt: 3600, stops: ['#02030f', '#050b22', '#081030'] },
]);

/* Stop 0 is the face beside the channel, which catches the lantern; stop 1 is
   the deep rock out at the screen edge. Too dark and every bit of strata and
   fissure detail is swallowed, so the walls read as flat black cut-outs. */
const ROCK = prep([
  { alt: 0,    stops: ['#4c3243', '#241627'] },
  { alt: 1500, stops: ['#2e2a4c', '#14122a'] },
  { alt: 3000, stops: ['#1a1c3e', '#080a1e'] },
]);

/* ---------- pre-rendered sprites ----------
 * Soft shapes are expensive to build per frame, so they are drawn once into
 * offscreen canvases and blitted afterwards. */

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function makeGlow(size, inner, mid) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, mid);
  grad.addColorStop(1, 'rgba(255,180,90,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/* A cloud is a handful of overlapping soft blobs baked into one sprite. */
function makeCloud(size, tint) {
  const c = makeCanvas(size, size / 2);
  const g = c.getContext('2d');
  const blobs = 9;
  for (let i = 0; i < blobs; i++) {
    const t = i / (blobs - 1);
    const bx = size * (0.13 + t * 0.74) + rand(-size * 0.04, size * 0.04);
    const lump = Math.sin(t * Math.PI);
    const by = size * 0.3 - lump * size * 0.06 + rand(-size * 0.01, size * 0.01);
    const br = size * (0.09 + lump * 0.115);
    const grad = g.createRadialGradient(bx, by, 0, bx, by, br);
    grad.addColorStop(0, `rgba(${tint},0.5)`);
    grad.addColorStop(0.55, `rgba(${tint},0.26)`);
    grad.addColorStop(1, `rgba(${tint},0)`);
    g.fillStyle = grad;
    g.fillRect(bx - br, by - br, br * 2, br * 2);
  }
  return c;
}

/* An aurora curtain, baked once. Filling a polygon under a screen-space
   gradient leaves a hard edge wherever the shape's boundary crosses the
   gradient; building it from soft vertical strips gives it feathered edges on
   both sides, which is what makes it read as light rather than a painted slab. */
function makeAurora(w, h, tint) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const cols = 72;
  const cw = w / cols + 2;
  for (let i = 0; i < cols; i++) {
    const x = (i / cols) * w;
    const cy = h * 0.5 + Math.sin(i * 0.27) * h * 0.15 + Math.sin(i * 0.13 + 1.7) * h * 0.09;
    const hh = h * 0.30 + Math.sin(i * 0.21 + 0.6) * h * 0.07;
    const grad = g.createLinearGradient(0, cy - hh, 0, cy + hh);
    grad.addColorStop(0, `rgba(${tint},0)`);
    grad.addColorStop(0.42, `rgba(${tint},0.42)`);
    grad.addColorStop(0.62, `rgba(${tint},0.30)`);
    grad.addColorStop(1, `rgba(${tint},0)`);
    g.fillStyle = grad;
    g.fillRect(x, cy - hh, cw, hh * 2);
  }
  return c;
}

function makeGrain(size) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

let sprites = null;
let overlay = null;

/* The vignette and film grain never change, so they are baked into one image at
   the canvas's own resolution and blitted once per frame. Rebuilding the
   gradient and blending a grain tile over the full screen every frame was the
   single most expensive thing this game did. */
function buildOverlay() {
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) return;
  overlay = makeCanvas(w, h);
  const g = overlay.getContext('2d');

  const grad = g.createRadialGradient(w / 2, h * 0.5, h * 0.28, w / 2, h * 0.5, h * 0.84);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.16)');
  grad.addColorStop(1, 'rgba(0,0,0,0.58)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  g.globalAlpha = 0.05;
  const tile = sprites.grain;
  for (let y = 0; y < h; y += tile.height) {
    for (let x = 0; x < w; x += tile.width) g.drawImage(tile, x, y);
  }
}

function buildSprites() {
  sprites = {
    glow: makeGlow(512, 'rgba(255,226,170,0.95)', 'rgba(255,168,70,0.36)'),
    halo: makeGlow(256, 'rgba(255,240,200,0.9)', 'rgba(255,190,110,0.3)'),
    cloudLight: [makeCloud(420, '255,232,226'), makeCloud(420, '255,238,236'), makeCloud(420, '246,228,240')],
    cloudDark: [makeCloud(460, '26,16,34'), makeCloud(460, '18,12,28')],
    aurora: [makeAurora(640, 300, '126,236,190'), makeAurora(640, 300, '110,186,255')],
    grain: makeGrain(160),
  };
}

/* ---------- the canyon ----------
 * Terrain is a pure function of altitude, so collision is exact and no history
 * has to be stored: sample it anywhere, at any resolution, and it agrees. */

let seed = {};

function reseed() {
  seed = {
    p1: rand(0, 6.28), p2: rand(0, 6.28), p3: rand(0, 6.28),
    p4: rand(0, 6.28), p5: rand(0, 6.28), p6: rand(0, 6.28),
  };
}

function difficultyAt(y) {
  return clamp(y / RAMP, 0, 1);
}

function channelAt(y) {
  const d = difficultyAt(y);
  const wander = 200
    + 70 * Math.sin(y * 0.0032 + seed.p1)
    + 34 * Math.sin(y * 0.0071 + seed.p2)
    + 16 * Math.sin(y * 0.0143 + seed.p3);
  const half = (134 - 68 * d) + 12 * Math.sin(y * 0.0055 + seed.p4);
  // Keep the full width inside the column rather than pinching it at the edges.
  const c = clamp(wander, 14 + half, COL - 14 - half);
  return { c, half, left: c - half, right: c + half };
}

function windAt(y) {
  const d = difficultyAt(y);
  const amp = 12 + 78 * d;
  return amp * (0.7 * Math.sin(y * 0.0021 + seed.p5) + 0.5 * Math.sin(y * 0.0047 + seed.p6));
}

function riseAt(y) {
  return 118 + 132 * difficultyAt(y);
}

/* ---------- state ---------- */

let best = loadBest();
let state = 'menu';       // menu | flying | dead
let alt = 0;
let maxAlt = 0;
let lantern = { x: 200, vx: 0, tilt: 0 };
let target = 200;
let steering = false;
let fireflies = [];
let embers = [];
let sparks = [];
let stars = [];
let clouds = [];
let caught = 0;
let flash = 0;
let deadT = 0;
let nextFly = 0;
let nextCloud = 0;

function buildStars() {
  stars = [];
  for (let i = 0; i < 130; i++) {
    stars.push({
      x: rand(-120, COL + 120),
      y: rand(0, 1400),
      r: rand(0.6, 1.7),
      phase: rand(0, 6.28),
      speed: rand(0.6, 2.2),
    });
  }
}

function reset() {
  reseed();
  alt = 0;
  maxAlt = 0;
  lantern = { x: channelAt(0).c, vx: 0, tilt: 0 };
  target = lantern.x;
  fireflies = [];
  embers = [];
  sparks = [];
  clouds = [];
  caught = 0;
  flash = 0;
  deadT = 0;
  nextFly = 220;
  nextCloud = 120;
  buildStars();
}

function metres() {
  return Math.floor(maxAlt / 10);
}

function start() {
  reset();
  state = 'flying';
}

function die() {
  if (state !== 'flying') return;
  state = 'dead';
  deadT = 0;
  flash = 1;
  for (let i = 0; i < 40; i++) {
    const a = rand(0, 6.28);
    const s = rand(40, 260);
    sparks.push({
      x: lantern.x, y: alt,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(0.5, 1.3), size: rand(1.5, 4), warm: true,
    });
  }
  if (metres() > best) { best = metres(); saveBest(); }
}

/* ---------- simulation ---------- */

function update(dt) {
  if (state === 'dead') {
    deadT += dt;
    flash = Math.max(0, flash - dt * 2.4);
    stepParticles(dt);
    return;
  }
  if (state !== 'flying') {
    // Idle drift on the menu keeps the scene alive.
    alt += 14 * dt;
    lantern.x = channelAt(alt).c + Math.sin(alt * 0.01) * 14;
    spawnEmber(dt);
    stepParticles(dt);
    cullAndSpawn();
    return;
  }

  const rise = riseAt(alt);
  alt += rise * dt;
  maxAlt = Math.max(maxAlt, alt);

  /* A lantern should feel light: a soft spring toward the finger, with the wind
     pushing it off line the whole way.
     Damping is set near critical (zeta ~0.65). Lower is floatier but overshoots
     roughly a quarter of the way past the finger, so aiming at a gap close to
     the rock would sail you straight into it — the control itself killed you. */
  const wind = windAt(alt);
  lantern.vx += (target - lantern.x) * 15 * dt;
  lantern.vx += wind * dt;
  lantern.vx *= Math.exp(-5.0 * dt);
  lantern.x += lantern.vx * dt;
  lantern.tilt += (clamp(lantern.vx * 0.0016, -0.32, 0.32) - lantern.tilt) * Math.min(1, dt * 6);

  const ch = channelAt(alt);
  if (lantern.x - LR < ch.left || lantern.x + LR > ch.right) {
    lantern.x = clamp(lantern.x, ch.left + LR * 0.4, ch.right - LR * 0.4);
    die();
    return;
  }

  for (const f of fireflies) {
    if (f.taken) continue;
    if (Math.hypot(f.x - lantern.x, f.y - alt) < 22) {
      f.taken = true;
      caught++;
      maxAlt += 60; // a firefly is worth a little height
      for (let i = 0; i < 12; i++) {
        const a = rand(0, 6.28);
        sparks.push({
          x: f.x, y: f.y,
          vx: Math.cos(a) * rand(20, 90), vy: Math.sin(a) * rand(20, 90),
          life: rand(0.3, 0.8), size: rand(1, 2.6), warm: true,
        });
      }
    }
  }

  spawnEmber(dt);
  stepParticles(dt);
  cullAndSpawn();
}

function spawnEmber(dt) {
  if (Math.random() > dt * 26) return;
  embers.push({
    x: lantern.x + rand(-5, 5),
    y: alt - rand(6, 14),
    vx: rand(-14, 14),
    vy: rand(-26, -6),
    life: rand(0.8, 1.9),
    size: rand(1, 2.4),
  });
}

function stepParticles(dt) {
  for (const e of embers) {
    e.life -= dt;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.vx *= 0.99;
  }
  embers = embers.filter((e) => e.life > 0);

  for (const s of sparks) {
    s.life -= dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= 0.97;
    s.vy = s.vy * 0.97 - 30 * dt;
  }
  sparks = sparks.filter((s) => s.life > 0);

  for (const f of fireflies) {
    f.t += dt;
    f.x = f.baseX + Math.sin(f.t * f.rate + f.phase) * f.sway;
    f.y = f.baseY + Math.cos(f.t * f.rate * 0.7 + f.phase) * (f.sway * 0.5);
  }
}

function cullAndSpawn() {
  const top = alt + SY;              // world y at the top of the screen
  const bottom = alt + SY - VH;      // ...and at the bottom

  while (nextFly < top + 260) {
    const ch = channelAt(nextFly);
    const baseX = clamp(ch.c + rand(-ch.half * 0.55, ch.half * 0.55), ch.left + 26, ch.right - 26);
    fireflies.push({
      baseX, baseY: nextFly, x: baseX, y: nextFly,
      t: 0, phase: rand(0, 6.28), sway: rand(8, 20), rate: rand(0.7, 1.5),
      taken: false,
    });
    nextFly += rand(240, 460);
  }
  fireflies = fireflies.filter((f) => f.baseY > bottom - 120 && !f.taken);

  while (nextCloud < top + 400) {
    clouds.push({
      y: nextCloud,
      x: rand(-80, COL + 80),
      scale: rand(0.55, 1.5),
      alpha: rand(0.25, 0.75),
      depth: rand(0.25, 0.6),
      sprite: (Math.random() * 3) | 0,
      drift: rand(-8, 8),
    });
    nextCloud += rand(250, 480);
  }
  clouds = clouds.filter((c) => c.y > bottom - 340);
}

/* ---------- painting ---------- */

function screenY(worldY) {
  return SY + (alt - worldY);
}

function paintSky() {
  const stops = sample(SKY, alt);
  const g = ctx.createLinearGradient(0, -bleedY, 0, VH + bleedY);
  g.addColorStop(0, rgba(stops[0], 1));
  g.addColorStop(0.55, rgba(stops[1], 1));
  g.addColorStop(1, rgba(stops[2], 1));
  ctx.fillStyle = g;
  ctx.fillRect(-bleedX - 4, -bleedY - 4, VW + bleedX * 2 + 8, VH + bleedY * 2 + 8);
}

function paintStars(t) {
  const a = clamp((alt - 420) / 900, 0, 1);
  if (a <= 0.01) return;
  ctx.save();
  for (const s of stars) {
    // Stars sit almost at infinity, so they barely move as the lantern climbs.
    let sy = screenY(s.y * 0.06 + alt * 0.94) % (VH + 200);
    sy = ((sy % (VH + 200)) + VH + 200) % (VH + 200) - 100;
    const tw = 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
    ctx.globalAlpha = a * tw * 0.9;
    ctx.fillStyle = '#fff6e8';
    ctx.fillRect(s.x, sy, s.r, s.r);
  }
  ctx.restore();
}

function paintAurora(t) {
  const a = clamp((alt - 1500) / 900, 0, 1);
  if (a <= 0.01) return;
  const w = VW + bleedX * 2 + 160;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a * 0.62;
  ctx.drawImage(sprites.aurora[0], -bleedX - 80 + Math.sin(t * 0.09) * 34, VH * 0.06, w, VH * 0.34);
  ctx.globalAlpha = a * 0.40;
  ctx.drawImage(sprites.aurora[1], -bleedX - 80 + Math.cos(t * 0.065) * 44, VH * 0.20, w, VH * 0.30);
  ctx.restore();
}

function paintSun() {
  const a = clamp(1 - alt / 620, 0, 1);
  if (a <= 0.01) return;
  /* Anchored low in the frame and sinking as the lantern climbs. Placing it in
     world space put it below the horizon before the first frame was drawn. */
  const sx = COL * 0.70;
  const sy = VH * 0.68 + alt * 0.33;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(sprites.glow, sx - 260, sy - 260, 520, 520);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = a * 0.9;
  ctx.fillStyle = 'rgba(255,228,178,0.95)';
  ctx.beginPath();
  ctx.arc(sx, sy, 46, 0, 6.2832);
  ctx.fill();
  ctx.restore();
}

/* Distant ridges, only near the ground. */
function paintHills() {
  const a = clamp(1 - alt / 760, 0, 1);
  if (a <= 0.01) return;
  const layers = [
    { par: 0.05, amp: 26, freq: 0.006, base: 120, tint: 0.30 },
    { par: 0.10, amp: 34, freq: 0.009, base: 66, tint: 0.48 },
    { par: 0.17, amp: 30, freq: 0.014, base: 16, tint: 0.68 },
  ];
  const rock = sample(ROCK, alt);
  ctx.save();
  ctx.globalAlpha = a;
  for (const L of layers) {
    const yBase = screenY(-alt * (1 - L.par)) - L.base;
    ctx.fillStyle = rgba(mix(rock[0], [40, 26, 44], 1 - L.tint), 0.55 + L.tint * 0.45);
    ctx.beginPath();
    ctx.moveTo(-bleedX - 10, VH + bleedY + 10);
    for (let x = -bleedX - 10; x <= VW + bleedX + 10; x += 16) {
      const y = yBase
        - Math.abs(Math.sin(x * L.freq + L.par * 9)) * L.amp
        - Math.sin(x * L.freq * 2.3 + 1.7) * L.amp * 0.4;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(VW + bleedX + 10, VH + bleedY + 10);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function paintClouds(layer) {
  for (const c of clouds) {
    const isBack = c.depth < 0.42;
    if ((layer === 'back') !== isBack) continue;
    const sy = screenY(c.y) * 1 + (1 - c.depth) * 0;
    const py = SY + (alt - c.y) * (0.55 + c.depth * 0.45);
    if (py < -260 || py > VH + 260) continue;
    const sprite = isBack
      ? sprites.cloudLight[c.sprite % sprites.cloudLight.length]
      : sprites.cloudDark[c.sprite % sprites.cloudDark.length];
    const w = 420 * c.scale * (isBack ? 1 : 1.35);
    const h = w / 2;
    ctx.save();
    ctx.globalAlpha = c.alpha * (isBack ? clamp(1 - alt / 3000, 0.15, 1) : 0.85);
    ctx.drawImage(sprite, c.x - w / 2 + c.drift, py - h / 2, w, h);
    ctx.restore();
    void sy;
  }
}

/* The canyon: two silhouettes with a lit inner edge and strata. */
function paintCanyon() {
  const rock = sample(ROCK, alt);
  const step = 16;
  const yTop = -30;
  const yBot = VH + 30;

  const leftPts = [];
  const rightPts = [];
  for (let sy = yTop; sy <= yBot; sy += step) {
    const wy = alt + SY - sy;
    const ch = channelAt(wy);
    leftPts.push([ch.left, sy]);
    rightPts.push([ch.right, sy]);
  }

  // A second canyon receding behind the playable one, hazed toward the sky.
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = rgba(mix(rock[0], sample(SKY, alt)[1], 0.5), 1);
  ctx.beginPath();
  ctx.moveTo(-bleedX - 10, yTop);
  for (const [x, y] of leftPts) ctx.lineTo(x - 78 - 16 * Math.sin(y * 0.007), y);
  ctx.lineTo(-bleedX - 10, yBot);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(VW + bleedX + 10, yTop);
  for (const [x, y] of rightPts) ctx.lineTo(x + 78 + 16 * Math.sin(y * 0.006 + 2), y);
  ctx.lineTo(VW + bleedX + 10, yBot);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  for (const side of ['left', 'right']) {
    const pts = side === 'left' ? leftPts : rightPts;
    const edgeX = side === 'left' ? -bleedX - 10 : VW + bleedX + 10;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(edgeX, yTop);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(edgeX, yBot);
    ctx.closePath();

    const g = ctx.createLinearGradient(side === 'left' ? 0 : VW, 0, side === 'left' ? 180 : VW - 180, 0);
    g.addColorStop(0, rgba(rock[1], 1));
    g.addColorStop(1, rgba(rock[0], 1));
    ctx.fillStyle = g;
    ctx.fill();

    ctx.clip();

    // Strata: horizontal banding, thicker and thinner, clipped inside the rock.
    const bandStep = 34;
    const off = (alt * 0.5) % bandStep;
    let bi = Math.floor((alt * 0.5) / bandStep);
    for (let y = -bandStep + off; y < VH + bandStep; y += bandStep, bi++) {
      const thick = 1.5 + 3 * Math.abs(Math.sin(bi * 1.31 + seed.p2));
      ctx.globalAlpha = 0.10 + 0.10 * Math.abs(Math.sin(bi * 2.17 + seed.p3));
      ctx.fillStyle = rgba(mix(rock[0], [255, 224, 198], 0.34), 1);
      ctx.fillRect(-bleedX - 10, y, VW + bleedX * 2 + 20, thick);
    }

    // Fissures running back from the lip, so the face has some relief.
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(mix(rock[1], [0, 0, 0], 0.5), 1);
    const dir = side === 'left' ? -1 : 1;
    for (let i = 2; i < pts.length; i += 4) {
      const [x, y] = pts[i];
      const len = 16 + 30 * Math.abs(Math.sin(i * 1.7 + seed.p1));
      ctx.beginPath();
      ctx.moveTo(x + dir * 3, y);
      ctx.lineTo(x + dir * (3 + len), y + 12 + 16 * Math.sin(i * 2.3 + seed.p4));
      ctx.stroke();
    }

    ctx.restore();
  }

  /* The lantern pooling light on the stone, clipped to both walls at once so it
     lights the rock without washing out the open channel. One pass over a box
     around the lantern, rather than a full-screen fill per wall. */
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-bleedX - 10, yTop);
  for (const [x, y] of leftPts) ctx.lineTo(x, y);
  ctx.lineTo(-bleedX - 10, yBot);
  ctx.closePath();
  ctx.moveTo(VW + bleedX + 10, yTop);
  for (const [x, y] of rightPts) ctx.lineTo(x, y);
  ctx.lineTo(VW + bleedX + 10, yBot);
  ctx.closePath();
  ctx.clip();

  const R = 260;
  const pool = ctx.createRadialGradient(lantern.x, SY, 8, lantern.x, SY, R);
  pool.addColorStop(0, 'rgba(255,186,116,0.52)');
  pool.addColorStop(0.42, 'rgba(255,150,88,0.21)');
  pool.addColorStop(1, 'rgba(255,140,80,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = pool;
  ctx.fillRect(lantern.x - R, SY - R, R * 2, R * 2);
  ctx.restore();

  /* Lit edge: brightness falls off with distance from the lantern, which is
     what sells the lantern as the light source in the scene. */
  for (const side of ['left', 'right']) {
    const pts = side === 'left' ? leftPts : rightPts;
    ctx.save();
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    /* Quantise the falloff into a few brightness bands and stroke each as a
       single path. Stroking every segment separately is the same picture at
       ten times the draw calls. */
    const BANDS = 5;
    for (let b = 0; b < BANDS; b++) {
      const mid = (b + 0.5) / BANDS;
      ctx.globalAlpha = 0.13 + mid * 0.72;
      ctx.strokeStyle = rgba(mix([120, 110, 150], [255, 196, 120], mid), 1);
      ctx.beginPath();
      let any = false;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        const d = Math.hypot((x0 + x1) / 2 - lantern.x, (y0 + y1) / 2 - SY);
        const lit = clamp(1 - d / 260, 0, 0.999);
        if (Math.floor(lit * BANDS) !== b) continue;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        any = true;
      }
      if (any) ctx.stroke();
    }
    ctx.restore();
  }
}

function paintFireflies(t) {
  ctx.save();
  for (const f of fireflies) {
    if (f.taken) continue;
    const sy = screenY(f.y);
    if (sy < -40 || sy > VH + 40) continue;
    const pulse = 0.55 + 0.45 * Math.sin(t * 2.6 + f.phase);

    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.7 * pulse;
    ctx.drawImage(sprites.halo, f.x - 40, sy - 40, 80, 80);

    /* The core is painted normally: added on top of the lantern's own glow it
       saturates to a flat white dot and stops reading as a warm mote. */
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = '#ffc861';
    ctx.beginPath();
    ctx.arc(f.x, sy, 3.2, 0, 6.2832);
    ctx.fill();
  }
  ctx.restore();
}

function paintParticles() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const e of embers) {
    const sy = screenY(e.y);
    ctx.globalAlpha = clamp(e.life * 0.6, 0, 0.8);
    ctx.fillStyle = '#ffb257';
    ctx.fillRect(e.x, sy, e.size, e.size);
  }
  for (const s of sparks) {
    const sy = screenY(s.y);
    ctx.globalAlpha = clamp(s.life, 0, 1);
    ctx.fillStyle = '#ffd79a';
    ctx.fillRect(s.x, sy, s.size, s.size);
  }
  ctx.restore();
}

function paintLantern(t) {
  if (state === 'dead' && deadT > 0.15) return;
  const x = lantern.x;
  const y = SY;
  const flicker = 0.92 + Math.sin(t * 11) * 0.05 + Math.sin(t * 23.3) * 0.03;

  // Light thrown into the scene.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Kept modest: the rock now carries its own pool of light, and a big glow
  // here just blows out the open channel and flattens the stone.
  ctx.globalAlpha = 0.4 * flicker;
  ctx.drawImage(sprites.glow, x - 190, y - 190, 380, 380);
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lantern.tilt);

  // Tassel, trailing against the tilt.
  ctx.strokeStyle = 'rgba(60,32,30,0.9)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, 15);
  ctx.quadraticCurveTo(-lantern.tilt * 26, 25, -lantern.tilt * 40, 34);
  ctx.stroke();
  ctx.fillStyle = '#c0562f';
  ctx.beginPath();
  ctx.ellipse(-lantern.tilt * 40, 37, 2.6, 5.5, 0, 0, 6.2832);
  ctx.fill();

  // Paper body: a lit barrel, brightest at its middle.
  const body = ctx.createLinearGradient(-14, 0, 14, 0);
  body.addColorStop(0, 'rgba(214,108,58,0.96)');
  body.addColorStop(0.42, `rgba(255,214,150,${flicker})`);
  body.addColorStop(0.62, 'rgba(255,236,196,1)');
  body.addColorStop(1, 'rgba(198,92,52,0.96)');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-8, -13);
  ctx.bezierCurveTo(-16, -6, -16, 6, -8, 13);
  ctx.lineTo(8, 13);
  ctx.bezierCurveTo(16, 6, 16, -6, 8, -13);
  ctx.closePath();
  ctx.fill();

  // Ribs.
  ctx.strokeStyle = 'rgba(150,64,36,0.34)';
  ctx.lineWidth = 1;
  for (const rx of [-7, 0, 7]) {
    ctx.beginPath();
    ctx.moveTo(rx, -12.4);
    ctx.quadraticCurveTo(rx * 1.5, 0, rx, 12.4);
    ctx.stroke();
  }

  // Caps.
  ctx.fillStyle = '#4a2320';
  ctx.fillRect(-9, -15.5, 18, 3.2);
  ctx.fillRect(-7.5, 12.4, 15, 2.8);

  // The flame inside, showing through the paper.
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.75 * flicker;
  ctx.drawImage(sprites.halo, -22, -24, 44, 44);
  ctx.restore();
}

function paintVignetteAndGrain() {
  if (overlay) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // the overlay is authored in device pixels
    ctx.drawImage(overlay, 0, 0);
    ctx.restore();
  }

  if (flash > 0) {
    ctx.fillStyle = `rgba(255,214,160,${flash * 0.5})`;
    ctx.fillRect(-bleedX - 4, -bleedY - 4, VW + bleedX * 2 + 8, VH + bleedY * 2 + 8);
  }
}

/* ---------- type ---------- */

function text(str, x, y, size, opts = {}) {
  const { color = 'rgba(255,244,230,0.95)', align = 'center', weight = 600,
          alpha = 1, spacing = 0, shadow = true } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 1;
  }
  ctx.fillStyle = color;
  if (spacing) {
    // Manual letter-spacing: ctx.letterSpacing is not available everywhere.
    const chars = [...str];
    const widths = chars.map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    ctx.textAlign = 'left';
    chars.forEach((c, i) => {
      ctx.fillText(c, cx, y);
      cx += widths[i] + spacing;
    });
  } else {
    ctx.fillText(str, x, y);
  }
  ctx.restore();
}

function paintHud() {
  if (state === 'menu') return;
  text(`${metres()}`, VW / 2, 46, 40, { weight: 300 });
  text('METRES', VW / 2, 76, 11, { alpha: 0.5, spacing: 3.4, weight: 600 });
  if (caught > 0) {
    text(`✦ ${caught}`, VW - 26, 46, 15, { align: 'right', alpha: 0.7, weight: 500 });
  }
}

function paintMenu(t) {
  const bob = Math.sin(t * 1.1) * 6;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(sprites.glow, VW / 2 - 240, VH * 0.34 + bob - 240, 480, 480);
  ctx.restore();

  text('LANTERN', VW / 2, VH * 0.6, 46, { weight: 200, spacing: 11 });
  text('drag to steer', VW / 2, VH * 0.6 + 44, 16, { alpha: 0.62, weight: 400 });
  text('TAP TO RISE', VW / 2, VH * 0.6 + 104, 13, {
    alpha: 0.45 + Math.sin(t * 2.6) * 0.25, spacing: 4, weight: 600,
  });
  if (best > 0) {
    text(`best ${best} m`, VW / 2, VH * 0.6 + 150, 13, { alpha: 0.4, weight: 500 });
  }
}

function paintDead(t) {
  const a = clamp(deadT * 1.4, 0, 1);
  ctx.save();
  ctx.globalAlpha = a * 0.62;
  ctx.fillStyle = '#0b0716';
  ctx.fillRect(-bleedX - 4, -bleedY - 4, VW + bleedX * 2 + 8, VH + bleedY * 2 + 8);
  ctx.restore();

  const isBest = metres() >= best && metres() > 0;
  text('you drifted', VW / 2, VH * 0.4, 16, { alpha: a * 0.6, weight: 400 });
  text(`${metres()} m`, VW / 2, VH * 0.4 + 52, 54, { alpha: a, weight: 200 });
  if (caught > 0) {
    text(`${caught} ${caught === 1 ? 'firefly' : 'fireflies'} gathered`, VW / 2, VH * 0.4 + 96, 14,
      { alpha: a * 0.55, weight: 400 });
  }
  text(isBest ? 'a new best' : `best ${best} m`, VW / 2, VH * 0.4 + 132, 13, {
    alpha: a * (isBest ? 0.85 : 0.45), spacing: 2, weight: 600,
    color: isBest ? 'rgba(255,214,150,0.95)' : undefined,
  });
  if (deadT > 0.7) {
    text('TAP TO FLY AGAIN', VW / 2, VH * 0.4 + 200, 13, {
      alpha: (0.4 + Math.sin(t * 2.6) * 0.25), spacing: 4, weight: 600,
    });
  }
}

/* ---------- layout ---------- */

function resize() {
  const rect = stage.getBoundingClientRect();
  const cssW = Math.max(1, rect.width);
  const cssH = Math.max(1, rect.height);
  /* Capped at 2: this scene is soft gradients and glow, where the third pixel
     of a 3x display buys almost nothing and costs 55% more fill. */
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  scale = Math.min(cssW / VIEW_W, cssH / VIEW_H);
  VW = cssW / scale;
  VH = cssH / scale;
  SY = VH * SY_FRAC;

  // The canyon is authored in a 400-unit column; centre it in a wider view.
  offX = (cssW - COL * scale) / 2;
  offY = 0;
  bleedX = offX / scale;
  bleedY = 0;

  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offX, dpr * offY);
  if (sprites) buildOverlay();
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

/* ---------- frame ---------- */

let last = 0;
let clock = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 0;
  last = now;
  clock += dt;

  update(dt);

  paintSky();
  paintStars(clock);
  paintAurora(clock);
  paintSun();
  paintClouds('back');
  paintHills();
  paintCanyon();
  paintFireflies(clock);
  paintLantern(clock);
  paintParticles();
  paintClouds('front');
  paintVignetteAndGrain();

  if (state === 'menu') paintMenu(clock);
  else if (state === 'dead') paintDead(clock);
  paintHud();
}

/* ---------- input ---------- */

function toWorldX(e) {
  const rect = canvas.getBoundingClientRect();
  return (e.clientX - rect.left - offX) / scale;
}

function press(x) {
  if (state === 'menu') { start(); target = x; return; }
  if (state === 'dead') { if (deadT > 0.45) { start(); target = x; } return; }
  steering = true;
  target = clamp(x, 10, COL - 10);
}

stage.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  press(toWorldX(e));
});

stage.addEventListener('pointermove', (e) => {
  if (!steering || state !== 'flying') return;
  target = clamp(toWorldX(e), 10, COL - 10);
});

const release = () => { steering = false; };
stage.addEventListener('pointerup', release);
stage.addEventListener('pointercancel', release);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    press(lantern.x);
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    target = clamp(target - 26, 10, COL - 10);
  } else if (e.code === 'ArrowRight') {
    e.preventDefault();
    target = clamp(target + 26, 10, COL - 10);
  }
});

document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

/* Drifting into a wall because the phone rang would be a poor way to lose. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'flying') die();
});

/* ---------- boot ---------- */

buildSprites();
resize();
reset();
requestAnimationFrame(frame);

/* Test hook: lets an automated pilot read the canyon and steer. */
window.__lantern = {
  get state() { return state; },
  get metres() { return metres(); },
  get best() { return best; },
  get alt() { return alt; },
  get caught() { return caught; },
  get x() { return lantern.x; },
  get view() { return { VW, VH, SY, scale, offX, COL, LR }; },
  channelAt,
  windAt,
  riseAt,
  steer(x) { target = clamp(x, 10, COL - 10); },
  press,
  get fireflyCount() { return fireflies.length; },
};

/* ---------- offline support ---------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration failed; app still works online.', err);
    });
  });
}
