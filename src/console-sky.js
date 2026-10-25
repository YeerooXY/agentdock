import { consoleTheme } from './console-themes.js';

// Ambient particles behind every console, drawn on one canvas per panel.
// A single animation loop runs at most 24 frames per second, pauses while the
// window is hidden or a dialog is open, and draws one still frame when motion
// is off. Particles never cover terminal text: the terminal sits above.
const skies = new Set();
const density = [0, 22, 48, 90, 150]; // particles per 100 000 px²
const particleBudget = 1450;
const TAU = Math.PI * 2;
let frame = 0, last = 0, level = 2, moving = true;
const sprites = new Map();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function sprite(color, soft) {
  const key = color + soft;
  if (sprites.has(key)) return sprites.get(key);
  const size = 32, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const g = canvas.getContext('2d'), r = size / 2, fill = g.createRadialGradient(r, r, 0, r, r, r);
  fill.addColorStop(0, '#ffffff'); fill.addColorStop(soft ? .12 : .18, color);
  fill.addColorStop(soft ? .45 : .32, color + '55'); fill.addColorStop(1, color + '00');
  g.fillStyle = fill; g.fillRect(0, 0, size, size);
  sprites.set(key, canvas); return canvas;
}
const hex = value => {
  const v = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) return '#' + [...v.slice(1)].map(c => c + c).join('');
  const m = v.match(/rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/);
  return m ? '#' + m.slice(1, 4).map(n => Number(n).toString(16).padStart(2, '0')).join('') : '#c8d4ff';
};
function seeded(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

class Sky {
  constructor(host, slot) {
    this.host = host; this.slot = slot;
    this.canvas = document.createElement('canvas'); this.canvas.className = 'panel-sky'; this.canvas.setAttribute('aria-hidden', 'true');
    this.context = this.canvas.getContext('2d'); this.particles = []; this.colors = ['#89b4ff', '#f19cda']; this.colorAge = 0;
    this.random = seeded(slot * 9301 + 49297); this.elapsed = 0;
    this.shooting = null; this.nextShot = 4000 + Math.random() * 9000;
  }
  get theme() { return this.host.dataset.frame || this.host.closest('[data-frame]')?.dataset.frame || 'classic'; }
  get style() { return consoleTheme(this.theme).sky; }
  measure() {
    const ratio = Math.min(devicePixelRatio || 1, 2), w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return false;
    if (w !== this.w || h !== this.h || ratio !== this.ratio) {
      // Keep the same field through resizes; transforms do not change its layout size.
      if (this.w && this.h) {
        for (const p of this.particles) { p.x *= w / this.w; p.y *= h / this.h; }
        if (this.shooting) { this.shooting.x *= w / this.w; this.shooting.y *= h / this.h; }
      }
      this.w = w; this.h = h; this.ratio = ratio;
      this.canvas.width = w * ratio; this.canvas.height = h * ratio;
    }
    this.kind = this.style;
    // Retain the bounded pool when density falls (including Off). Only new particles are seeded.
    const random = this.random;
    while (this.particles.length < this.count) {
      this.particles.push({
        x: random() * w, y: random() * h, depth: .25 + random() * .75, size: .6 + random() * 1.6,
        phase: random() * Math.PI * 2, speed: .6 + random() * 1.8, tone: this.particles.length % 3, bright: random() < .14,
      });
    }
    return true;
  }
  draw(now, dt) {
    if (!this.measure()) return;
    if (this.theme !== this.colorTheme || now - this.colorAge > 400) {
      const style = getComputedStyle(this.host); this.colorAge = now; this.colorTheme = this.theme;
      this.colors = [hex(style.getPropertyValue('--frame-a')), hex(style.getPropertyValue('--frame-b'))];
    }
    this.elapsed += dt * 1000;
    const g = this.context, { w, h } = this, kind = this.kind, t = this.elapsed / 1000;
    g.setTransform(this.ratio, 0, 0, this.ratio, 0, 0); g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    const prominence = .55 + level * .14;
    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i];
      // Drift: stars and dust glide sideways with parallax, snow falls, embers rise.
      const v = p.depth * dt;
      if (kind === 'snow') { p.y += v * 14; p.x += Math.sin(t * .8 + p.phase) * v * 6; }
      else if (kind === 'embers') { p.y -= v * 16; p.x += Math.sin(t * 1.3 + p.phase) * v * 8; }
      else if (kind === 'data') p.y += v * 22;
      else if (kind === 'streaks') p.x -= v * 40;
      else if (kind === 'glitter' && p.tone === 1) { p.y -= v * 7; p.x += Math.sin(t * .9 + p.phase) * v * 4; }
      else { p.x += v * 3.2; p.y -= v * 1.1; }
      if (p.x > w + 6) p.x -= w + 12; if (p.x < -6) p.x += w + 12;
      if (p.y > h + 6) p.y -= h + 12; if (p.y < -6) p.y += h + 12;
      let x = p.x, y = p.y;
      if (this.theme === 'void' && this.host.matches('.session-card.empty')) {
        const dx = x - w / 2, dy = y - h / 2, radius = Math.hypot(dx, dy);
        if (radius > 9 && radius < 94) {
          const bend = .2 * (1 - (radius - 9) / 85), cosine = Math.cos(bend), sine = Math.sin(bend);
          x = w / 2 + dx * cosine - dy * sine;
          y = h / 2 + dx * sine + dy * cosine;
        }
      }
      const twinkle = .55 + .45 * Math.sin(t * p.speed + p.phase);
      const alpha = Math.min(1, (p.bright ? .95 : .45 + p.depth * .35) * twinkle * prominence);
      const color = kind === 'rainbow' ? `hsl(${(p.x / w * 360 + t * 40) % 360} 95% 70%)` : p.tone === 2 ? '#ffffff' : this.colors[p.tone];
      g.globalAlpha = alpha;
      if (kind === 'data') { g.fillStyle = this.colors[p.tone % 2]; g.fillRect(x, y, 1.5, 3 + p.depth * 4); continue; }
      if (kind === 'streaks') { g.fillStyle = this.colors[p.tone % 2]; g.fillRect(x, y, 6 + p.depth * 18, 1); continue; }
      // Hot pink: every other pink particle is a small floating heart.
      if (kind === 'glitter' && p.tone === 1) {
        const r = (2.2 + p.size * 1.6) * (p.bright ? 1.5 : 1);
        g.fillStyle = this.colors[0]; g.shadowColor = this.colors[0]; g.shadowBlur = p.bright ? 8 : 0;
        g.beginPath(); g.moveTo(x, y + r); g.bezierCurveTo(x - r * 1.6, y - r * .2, x - r * .6, y - r * 1.4, x, y - r * .4); g.bezierCurveTo(x + r * .6, y - r * 1.4, x + r * 1.6, y - r * .2, x, y + r); g.fill();
        g.shadowBlur = 0; continue;
      }
      if (kind === 'glitter' && p.bright) {
        g.strokeStyle = this.colors[p.tone % 2]; g.lineWidth = 1; const s = 2 + p.size * 2 * twinkle;
        g.beginPath(); g.moveTo(x - s, y); g.lineTo(x + s, y); g.moveTo(x, y - s); g.lineTo(x, y + s); g.stroke();
      }
      const size = (p.bright ? 7 : 3.5) * p.size * (kind === 'dust' ? .7 : 1) * (.85 + twinkle * .3);
      const image = sprite(hex(color.startsWith('hsl') ? this.colors[0] : color), kind === 'embers' || kind === 'snow');
      if (color.startsWith('hsl')) { g.fillStyle = color; g.beginPath(); g.arc(p.x, p.y, p.size * (p.bright ? 1.3 : .8), 0, 7); g.fill(); }
      else g.drawImage(image, x - size / 2, y - size / 2, size, size);
    }
    if (kind === 'dust' && this.theme === 'void' && this.host.matches('.session-card.empty')) {
      g.globalCompositeOperation = 'source-over';
      const x = w / 2, y = h / 2, r = Math.min(17, Math.min(w, h) * .08);
      const halo = g.createRadialGradient(x, y, 0, x, y, r * 1.8);
      halo.addColorStop(0, 'rgba(52,37,91,.32)'); halo.addColorStop(1, 'rgba(5,4,10,0)');
      g.fillStyle = halo; g.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
      g.strokeStyle = '#8872cf44'; g.lineWidth = 1; g.beginPath(); g.ellipse(x, y, r * 1.45, r * .6, -.25, 0, TAU); g.stroke();
      g.fillStyle = '#020106c0'; g.beginPath(); g.arc(x, y, r * .52, 0, TAU); g.fill();
      g.globalCompositeOperation = 'lighter';
    }
    // An occasional shooting star crosses starry skies.
    if (['stars', 'dust', 'glitter', 'rainbow'].includes(kind) && level > 1) {
      if (!this.shooting && this.elapsed > this.nextShot) this.shooting = {
        x: Math.random() * w * .6, y: Math.random() * h * .4,
        angle: (20 + Math.random() * 15) * Math.PI / 180,
        speed: 220 + Math.random() * 100, start: this.elapsed,
      };
      if (this.shooting) {
        const age = (this.elapsed - this.shooting.start) / 1000, duration = .9;
        if (age >= duration) { this.shooting = null; this.nextShot = this.elapsed + 6000 + Math.random() * 14000; }
        else {
          const dx = Math.cos(this.shooting.angle), dy = Math.sin(this.shooting.angle);
          const x = this.shooting.x + dx * this.shooting.speed * age;
          const y = this.shooting.y + dy * this.shooting.speed * age;
          const tailX = x - dx * 80, tailY = y - dy * 80;
          const fade = Math.max(0, 1 - age / duration), trail = g.createLinearGradient(tailX, tailY, x, y);
          trail.addColorStop(0, '#ffffff00'); trail.addColorStop(.68, this.colors[0] + '88'); trail.addColorStop(1, '#ffffffff');
          g.globalAlpha = fade; g.strokeStyle = trail; g.lineWidth = 2.2; g.lineCap = 'round';
          g.beginPath(); g.moveTo(tailX, tailY); g.lineTo(x, y); g.stroke();
          g.shadowColor = this.colors[0]; g.shadowBlur = 8; g.fillStyle = '#ffffff';
          g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
        }
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
}

function paused() {
  const body = document.body.dataset;
  return !moving || document.hidden || body.ambient === 'off' || body.visualPaused === 'true' || reducedMotion.matches || !!document.querySelector('dialog[open]');
}
function visible(sky) {
  if (!sky.canvas.getClientRects().length || getComputedStyle(sky.host).visibility === 'hidden') return false;
  if (document.body.classList.contains('console-expanded') && sky.host.matches('#sidebar,#consoles-page')) return false;
  return true;
}
function rebalance() {
  const entries = [];
  for (const sky of skies) {
    if (!sky.canvas.isConnected) { skies.delete(sky); sky.count = 0; continue; }
    const shown = visible(sky);
    const w = sky.canvas.clientWidth, h = sky.canvas.clientHeight;
    const requested = shown && level ? Math.min(700, Math.round(w * h / 100000 * density[level])) : 0;
    entries.push({ sky, requested, exact: 0, count: 0 });
  }
  const total = entries.reduce((sum, entry) => sum + entry.requested, 0);
  const scale = total > particleBudget ? particleBudget / total : 1;
  let allocated = 0;
  for (const entry of entries) {
    entry.exact = entry.requested * scale;
    entry.count = Math.floor(entry.exact);
    allocated += entry.count;
  }
  const spare = Math.min(particleBudget, total) - allocated;
  entries.sort((a, b) => (b.exact - b.count) - (a.exact - a.count));
  for (let i = 0; i < spare; i++) entries[i].count++;
  for (const { sky, count } of entries) sky.count = count;
}
function tick(now) {
  frame = 0;
  if (paused() || level === 0) return;
  if (now - last >= 42) {
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    rebalance();
    for (const sky of skies) {
      if (!sky.canvas.isConnected) { skies.delete(sky); continue; }
      if (visible(sky)) sky.draw(now, dt);
    }
  }
  if (!paused() && level > 0) frame = requestAnimationFrame(tick);
}
function wake() { if (!frame && skies.size && level > 0 && !paused()) { last = performance.now(); frame = requestAnimationFrame(tick); } }
function still() { rebalance(); for (const sky of skies) if (sky.canvas.isConnected && visible(sky)) sky.draw(performance.now(), 0); }
function syncMotion() {
  if (paused() || level === 0) { cancelAnimationFrame(frame); frame = 0; }
  else wake();
}

export function mountSky(host, slot) {
  let canvas = host.querySelector(':scope > .panel-sky');
  if (canvas) return canvas;
  const sky = new Sky(host, slot); skies.add(sky);
  host.prepend(sky.canvas); rebalance(); requestAnimationFrame(() => { still(); wake(); });
  return sky.canvas;
}
export function refreshSky() { still(); syncMotion(); }
export function setSkyLevel(next, motion = true) {
  const changed = next !== level || motion !== moving; level = next; moving = motion;
  if (!changed) return;
  still(); syncMotion();
}
document.addEventListener('visibilitychange', () => { rebalance(); syncMotion(); });
reducedMotion.addEventListener('change', syncMotion);
addEventListener('resize', still);
new MutationObserver(records => {
  // Recolor before the next paint, even when ambient or reduced motion pauses the loop.
  if (records.some(record => record.attributeName === 'data-frame')) {
    const now = performance.now();
    for (const sky of skies) {
      if (!sky.canvas.isConnected) { skies.delete(sky); continue; }
      if (sky.theme !== sky.colorTheme && visible(sky)) sky.draw(now, 0);
    }
  }
  syncMotion();
}).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['open', 'data-ambient', 'data-visual-paused', 'data-frame'] });
