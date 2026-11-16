/* Initial Paddock snapshot provenance. Canonical shared source; edit this package.
Paddock themes/manifest.json sha256=624d75a19a2de098dbccb2749fcff01f9a9c8d4f14accc6f4160bccc841cb6c3
Paddock src/styles.css sha256=373820adfe65492a6f029f0f68ed892e2e2687e508a50a0c98da24351c1db73e
Paddock src/style.css sha256=efa80abc4a2e3af1e81e63a8a882a2ecc3185a07bbf949ed3d981c1d7f9203f6
Paddock src/mobile.css sha256=7b070d46533aeb73fe3cc274581e8737e22da1ca786e3571dcc4d7c27d75fc76
Paddock src/workbench.css sha256=c32c9bd18c26a4522abb4a1c811ca5964fec0054754d4107c7f61648e953a3bf
Paddock src/console-polish.css sha256=585cbd44d6d30be7ce77b2fa98f3f0f8e40d17c6fff922e6145cbc7faf262765
Paddock src/setup.css sha256=ee2921f280684ea61c299498ef1223db957ec76dc77edcd459e0a491a304c451
Paddock src/projects.css sha256=7024f82b24c8dd12a355fda76b55b7c48575db7deee18a7fe62583a3167aad41
Paddock src/worker-composer.css sha256=7452052f1438d350dde6d067f1dc57b5719ebadcde0898b3a2cc72df1407219f
Paddock src/review-panel.css sha256=be429ca463276250bee4e183a72fafc753623f182cbd756574810ae3659c3133
Paddock src/task-loop.css sha256=59b3b487e4f23b2764cf58973dc76b45d29150b9b5ad70479730168d3cb3c3ce
Paddock src/ssh.css sha256=915ed1e6a3a360c4fb438415b4dd6984ba2403b8587a9f8d0d86e23c7d7cb70c
Paddock src/account-usage.css sha256=7775340afeed2eb3ca0763151eef87ed9e9c9cd94bbee8f6bfe393c9a6960f1d
Paddock src/usage-page.css sha256=1c00a6d2887da480af49b4462de1bcc0ea3a59870b2a3d64482d2c4d60752e6f
Paddock src/console-trim.css sha256=e585e39c17372595fa3d383f6ed3a1005708b6c86452345c29084de284a91c88
Paddock src/console-themes.css sha256=73b5db2b572596b8dfc352b0417753b19bb689b2729fa17ef70fd4c51753ff54
Paddock src/theme-palette.css sha256=61caafd5252b1d9d9fd45dd39a4deb6be28d06cfce6e520aa469b7fd58aad7ce
Paddock src/theme-system.css sha256=a72917ce4f7461b8c9a4a95f38b4690f27f02e6b50f1925649afa76068057074
Paddock src/navigation-rail.css sha256=37984db3ea0540a393f9dd546e550301b0b7d4893917617a83e7a26626462272
Paddock src/page-layout.css sha256=f4551e2392f44a177026a96930e0278baf24c3bb8cba8364412d392660a33659
Paddock src/workspace-glass.css sha256=6d5e6b21bd6b8efc9ea8dd3d2433731350c1d918ce8e26f73ba38f67aa262863
Paddock src/usage-glass.css sha256=663370c0927a7ef7a06e48afbddea03dbafbb78ebba47c2e9a15dc65954b1a18
Paddock src/console-sky.js sha256=0b53e2a36140568813a7a28c8321a6390cf7204627fb6a9e3395572576a4d5ce */
(() => {
'use strict';
const themeData = [{"id":"classic","label":"Paddock","detail":"Pastel glass, blooming rings","opening":"bloom","sky":"stars","a":"#89b4ff","b":"#f19cda","background":"#090b15","foreground":"#f0f0fb","cursor":"#f19cda","selection":"#6e548680"},{"id":"hot-pink","label":"Hot pink","detail":"Neon tubes, hearts and glitter","opening":"neon","sky":"glitter","a":"#ff6ad5","b":"#c13cff","background":"#14060f","foreground":"#fff0fa","cursor":"#ff6ad5","selection":"#a13b7e80"},{"id":"blue","label":"Blue","detail":"Steel rails, lightning strike","opening":"lightning","sky":"stars","a":"#80c7ff","b":"#4f7bff","background":"#060d1b","foreground":"#edf5ff","cursor":"#80c7ff","selection":"#356ca480"},{"id":"violet","label":"Violet","detail":"Arcane arcs, spiral portal","opening":"portal","sky":"stars","a":"#c7a3ff","b":"#8f5bff","background":"#0e091b","foreground":"#f4edff","cursor":"#c7a3ff","selection":"#7650a280"},{"id":"void","label":"Void","detail":"Near black, collapsing star","opening":"implode","sky":"dust","a":"#7b6cff","b":"#35246e","background":"#020205","foreground":"#d9d6ea","cursor":"#9a8cff","selection":"#3a2f6e80"},{"id":"redline","label":"Redline","detail":"Black weave, red slash trim","opening":"redline","sky":"dust","a":"#ff2a3d","b":"#b0001a","background":"#040404","foreground":"#f4f4f4","cursor":"#ff2a3d","selection":"#8a001a80"},{"id":"cyber","label":"Cyber","detail":"Cut corners, glyph rain","opening":"glitch","sky":"data","a":"#00e1ff","b":"#cc55ff","background":"#080b17","foreground":"#f0f4fc","cursor":"#00e1ff","selection":"#007c9980"},{"id":"icy","label":"Arctic","detail":"Ice facets, spreading frost","opening":"frost","sky":"snow","a":"#7fe9ff","b":"#4f9dff","background":"#05121e","foreground":"#edfaff","cursor":"#7fe9ff","selection":"#287ba580"},{"id":"fiery","label":"Inferno","detail":"Ember glow, fireball blast","opening":"explosion","sky":"embers","a":"#ff6a2b","b":"#ffb700","background":"#160906","foreground":"#fff2ec","cursor":"#ffb700","selection":"#a64d2680"},{"id":"gamer","label":"RGB","detail":"Spectrum edge, rainbow shockwave","opening":"spectrum","sky":"rainbow","a":"#73eaff","b":"#ff5db4","background":"#090c12","foreground":"#ffffff","cursor":"#73eaff","selection":"#6553a580"},{"id":"normal","label":"Plain","detail":"Quiet frame, soft fade","opening":"soft","sky":"stars","a":"#b9c6d8","b":"#8392a8","background":"#090b10","foreground":"#e7ebf2","cursor":"#b9c6d8","selection":"#52658280"}];
const consoleTheme = id => themeData.find(theme => theme.id === id) || themeData[0];


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
  sprites.set(key, canvas);
  if (sprites.size > 32) sprites.delete(sprites.keys().next().value);
  return canvas;
}
// Optical star profiles: broad faint bloom, a small white core and four soft rays.
// Cached stamps keep the frame loop to drawImage calls rather than per-star filters.
function starSprite(color, flare) {
  const key = `star:${color}:${flare}`;
  if (sprites.has(key)) return sprites.get(key);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
  const g = canvas.getContext('2d'), r = 48;
  const halo = g.createRadialGradient(r, r, 0, r, r, r);
  halo.addColorStop(0, '#ffffff'); halo.addColorStop(.035, '#ffffff');
  halo.addColorStop(.09, color + 'de'); halo.addColorStop(.22, color + '48');
  halo.addColorStop(.5, color + '10'); halo.addColorStop(1, color + '00');
  g.fillStyle = halo; g.fillRect(0, 0, 96, 96);
  if (flare) {
    g.globalCompositeOperation = 'lighter';
    for (let axis = 0; axis < 2; axis++) {
      g.save(); g.translate(r, r); g.rotate(axis * Math.PI / 2);
      const ray = g.createLinearGradient(-r, 0, r, 0);
      ray.addColorStop(0, color + '00'); ray.addColorStop(.4, color + '38');
      ray.addColorStop(.5, '#ffffffb0'); ray.addColorStop(.6, color + '38'); ray.addColorStop(1, color + '00');
      g.fillStyle = ray; g.fillRect(-r, -0.65, r * 2, 1.3); g.restore();
    }
  }
  sprites.set(key, canvas);
  if (sprites.size > 64) sprites.delete(sprites.keys().next().value);
  return canvas;
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
      const twinkle = kind === 'stars'
        ? .84 + .16 * Math.sin(t * p.speed * .55 + p.phase)
        : .55 + .45 * Math.sin(t * p.speed + p.phase);
      const alpha = Math.min(1, (p.bright ? .95 : .45 + p.depth * .35) * twinkle * prominence);
      const color = kind === 'rainbow' ? `hsl(${(p.x / w * 360 + t * 40) % 360} 95% 70%)` : p.tone === 2 ? '#ffffff' : this.colors[p.tone];
      g.globalAlpha = alpha;
      if (kind === 'stars') {
        const near = p.bright && p.depth > .62;
        const radius = near ? 20 + p.depth * 13 : 3 + p.depth * p.depth * 11;
        g.globalAlpha = Math.min(1, (near ? 1 : .28 + p.depth * .68) * twinkle * prominence);
        g.drawImage(starSprite(color, near), x - radius / 2, y - radius / 2, radius, radius);
        continue;
      }
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
  if (!skies.size || paused() || level === 0) return;
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
  if (paused() || level === 0) { cancelAnimationFrame(frame); frame = 0; rebalance(); }
  else wake();
}

function mountSky(host, slot) {
  let canvas = host.querySelector(':scope > .panel-sky');
  if (canvas) return canvas;
  const sky = new Sky(host, slot); skies.add(sky);
  host.prepend(sky.canvas); rebalance(); requestAnimationFrame(() => { still(); wake(); });
  return sky.canvas;
}
function refreshSky() { still(); syncMotion(); }
function setSkyLevel(next, motion = true) {
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


let host;
const aliases = {stars:'classic',black:'normal',pink:'hot-pink',purple:'violet'};
window.PaddockEffects = {
  mountSky, refreshSky, setSkyLevel,
  themes: themeData.map(({id,label}) => ({id,label})),
  apply(theme = 'classic', starsEnabled = true) {
    theme = aliases[theme] || theme;
    if (!themeData.some(item => item.id === theme)) theme = 'classic';
    document.body.dataset.theme = theme;
    document.body.dataset.trim = theme;
    document.body.dataset.stars = starsEnabled ? 'on' : 'off';
    if (!host) {
      host = document.createElement('div'); host.id = 'paddock-background';
      host.setAttribute('aria-hidden','true'); document.body.prepend(host);
    }
    host.dataset.frame = theme;
    mountSky(host, 1);
    setSkyLevel(starsEnabled ? 2 : 0, true);
    refreshSky();
    return theme;
  }
};
// Preserve the chosen palette on hide/show while avoiding hidden RGB work.
document.addEventListener('visibilitychange', () => {
  document.body.dataset.visualPaused = document.hidden ? 'true' : 'false';
});

})();
