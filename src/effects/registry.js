// Pure canvas effects. Runtime owns visibility, clocks, cancellation and reduced motion.
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const ease = t => 1 - Math.pow(1 - t, 3);
export const openings = {
  soft: { duration: 380, draw(g, w, h, t, c) { g.globalAlpha = (1 - t) * .25; g.fillStyle = c.a; g.fillRect(0, 0, w, h); } },

  bloom: {
    duration: 1100,
    setup: (w, h, c) => ({ sparks: Array.from({ length: 40 }, () => ({ angle: rand(0, TAU), speed: rand(.15, .55), size: rand(1, 3), color: Math.random() < .5 ? c.a : c.b })) }),
    draw(g, w, h, t, c, s) {
      const cx = w / 2, cy = h / 2, r = Math.hypot(w, h) / 2;
      for (let i = 0; i < 3; i++) {
        const k = ease(Math.max(0, Math.min(1, t * 1.4 - i * .15)));
        if (!k || k >= 1) continue;
        g.globalAlpha = (1 - k) * .8; g.strokeStyle = i % 2 ? c.b : c.a; g.lineWidth = 2 + (1 - k) * 6;
        g.shadowColor = g.strokeStyle; g.shadowBlur = 18; g.beginPath(); g.arc(cx, cy, k * r, 0, TAU); g.stroke();
      }
      g.shadowBlur = 0;
      for (const p of s.sparks) {
        const d = ease(t) * p.speed * r; g.globalAlpha = 1 - t; g.fillStyle = p.color;
        star(g, cx + Math.cos(p.angle) * d, cy + Math.sin(p.angle) * d, p.size * (2 - t));
      }
    },
  },

  explosion: {
    duration: 1600, shake: 9, flashes: 1,
    setup: (w, h) => {
      const cx = w / 2, cy = h * .55;
      return {
        cx, cy,
        fire: Array.from({ length: 140 }, () => { const a = rand(0, TAU), v = rand(40, 360) * Math.min(1.6, w / 500); return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v * .75 - rand(0, 60), size: rand(10, 34), life: rand(.45, 1) }; }),
        sparks: Array.from({ length: 70 }, () => { const a = rand(0, TAU), v = rand(260, 720); return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 140, life: rand(.4, .95) }; }),
        smoke: Array.from({ length: 18 }, () => { const a = rand(0, TAU), v = rand(20, 110); return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v * .5 - rand(20, 60), size: rand(30, 70) }; }),
        embers: Array.from({ length: 18 }, (_, i) => ({ x: cx + rand(-w * .42, w * .42), y: -24 - rand(0, 30), vy: rand(20, 95), size: rand(1.4, 2.6), phase: i * .7 })),
      };
    },
    draw(g, w, h, t, c, s, dt) {
      // Flash, then a fireball of additive flame, debris sparks with gravity,
      // a heat shockwave and smoke that lingers as the flames cool.
      if (t < .14) { g.globalAlpha = (1 - t / .14) * .7; g.fillStyle = '#fff3d6'; g.fillRect(0, 0, w, h); }
      const ring = ease(Math.min(1, t * 2.2));
      if (ring < 1) { g.globalAlpha = (1 - ring) * .9; g.strokeStyle = '#ffd59a'; g.lineWidth = 3 + 10 * (1 - ring); g.shadowColor = '#ff8a2b'; g.shadowBlur = 24; g.beginPath(); g.ellipse(s.cx, s.cy, ring * w * .75, ring * h * .6, 0, 0, TAU); g.stroke(); g.shadowBlur = 0; }
      g.globalCompositeOperation = 'source-over';
      for (const p of s.smoke) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.size += 26 * dt;
        const a = Math.max(0, Math.min(.35, (t - .15) * 1.2) * (1 - t));
        if (!a) continue; g.globalAlpha = a; g.fillStyle = radial(g, p.x, p.y, p.size, '#3a2a24', '#1a121000'); g.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      }
      g.globalCompositeOperation = 'lighter';
      for (const p of s.fire) {
        const age = t / p.life; if (age >= 1) continue;
        p.vx *= 1 - 2.6 * dt; p.vy = p.vy * (1 - 2.6 * dt) - 50 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        const size = p.size * (1 + age * 1.6), color = age < .2 ? '#fff6d0' : age < .45 ? '#ffc23d' : age < .7 ? '#ff6a1f' : '#a8200c';
        g.globalAlpha = (1 - age) * .55; g.fillStyle = radial(g, p.x, p.y, size, color, color + '00'); g.fillRect(p.x - size, p.y - size, size * 2, size * 2);
      }
      g.lineCap = 'round';
      for (const p of s.sparks) {
        const age = t / p.life; if (age >= 1) continue;
        p.vy += 520 * dt; p.vx *= 1 - .9 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        g.globalAlpha = 1 - age; g.strokeStyle = age < .4 ? '#fff1b8' : '#ff9a2b'; g.lineWidth = 2 - age;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * .03, p.y - p.vy * .03); g.stroke();
      }
      // A thin heat shimmer follows the fireball without filtering terminal pixels.
      if (t > .42 && t < .94) {
        const k = (t - .42) / .52, y = s.cy + (t - .42) * h * .22;
        g.globalAlpha = Math.sin(k * Math.PI) * .2; g.strokeStyle = '#ffb24a'; g.lineWidth = 1.2;
        g.beginPath();
        for (let x = 0; x <= w; x += 12) {
          const yy = y + Math.sin(x * .035 + t * 30) * (2 + k * 2);
          x ? g.lineTo(x, yy) : g.moveTo(x, yy);
        }
        g.stroke();
      }
      // Fine embers drift back and settle along the console header edge.
      for (const p of s.embers) {
        const start = .48, settle = .86, k = Math.max(0, Math.min(1, (t - start) / (settle - start)));
        if (!k || t > .99) continue;
        const y = -24 + ease(k) * 49 + Math.sin(t * 10 + p.phase) * (1 - k) * 3;
        g.globalAlpha = (t < .9 ? .75 : (1 - t) * 7) * (.7 + .3 * Math.sin(t * 12 + p.phase));
        g.fillStyle = '#ffd78a'; g.shadowColor = '#ff6a24'; g.shadowBlur = 6;
        g.beginPath(); g.arc(p.x, y, p.size, 0, TAU); g.fill();
      }
      g.shadowBlur = 0;
    },
  },

  frost: {
    duration: 1500,
    setup: (w, h) => {
      // Fractal ice branches grow inward from every corner, then shatter.
      const branches = [];
      const grow = (x, y, angle, length, depth) => {
        const x2 = x + Math.cos(angle) * length, y2 = y + Math.sin(angle) * length;
        branches.push({ x, y, x2, y2, depth, at: (4 - depth) * .11 + rand(0, .06) });
        if (depth > 0) for (const turn of [-.55, .55, 0]) if (turn || Math.random() < .5) grow(x2, y2, angle + turn + rand(-.15, .15), length * rand(.5, .68), depth - 1);
      };
      const reach = Math.min(w, h) * .32;
      for (const [x, y, a] of [[0, 0, .78], [w, 0, 2.36], [0, h, -.78], [w, h, -2.36]]) grow(x, y, a, reach, 4);
      for (let i = 0; i < 4; i++) grow(rand(.2, .8) * w, i % 2 ? h : 0, i % 2 ? -1.57 : 1.57, reach * .6, 3);
      const shards = Array.from({ length: 46 }, () => ({ x: rand(0, w), y: rand(0, h), vx: rand(-60, 60), vy: rand(-40, 90), r: rand(0, TAU), vr: rand(-6, 6), size: rand(3, 9) }));
      return { branches, shards };
    },
    draw(g, w, h, t, c, s, dt) {
      const vignette = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .2, w / 2, h / 2, Math.hypot(w, h) / 2);
      vignette.addColorStop(0, '#bff4ff00'); vignette.addColorStop(1, '#c9f6ff');
      g.globalAlpha = Math.sin(Math.min(1, t * 1.4) * Math.PI) * .3; g.fillStyle = vignette; g.fillRect(0, 0, w, h);
      const fade = t < .7 ? 1 : 1 - (t - .7) / .3;
      g.strokeStyle = '#e8fcff'; g.shadowColor = c.a; g.shadowBlur = 8; g.lineCap = 'round';
      for (const b of s.branches) {
        const k = Math.max(0, Math.min(1, (t - b.at) / .18)); if (!k) continue;
        g.globalAlpha = fade * (.45 + b.depth * .12); g.lineWidth = .6 + b.depth * .45;
        g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x + (b.x2 - b.x) * k, b.y + (b.y2 - b.y) * k); g.stroke();
      }
      g.shadowBlur = 0;
      if (t > .62) {
        const k = (t - .62) / .38;
        for (const p of s.shards) {
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; p.r += p.vr * dt;
          g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.globalAlpha = (1 - k) * .9; g.fillStyle = k < .3 ? '#ffffff' : c.a;
          g.beginPath(); g.moveTo(0, -p.size); g.lineTo(p.size * .45, 0); g.lineTo(0, p.size); g.lineTo(-p.size * .45, 0); g.fill(); g.restore();
        }
      }
    },
  },

  lightning: {
    duration: 1100, flashes: 1,
    setup: (w, h) => ({ bolts: Array.from({ length: 4 }, (_, i) => ({ at: i * .12 + rand(0, .05), path: bolt(rand(.15, .85) * w, 0, rand(.2, .8) * w, rand(.55, 1) * h) })) }),
    draw(g, w, h, t, c, s) {
      for (const b of s.bolts) {
        const k = (t - b.at) / .3; if (k < 0 || k > 1) continue;
        // Four bolts can share one restrained flash; there are never four panel flashes.
        if (b === s.bolts[0] && k < .15) { g.globalAlpha = .18 * (1 - k / .15); g.fillStyle = '#dfefff'; g.fillRect(0, 0, w, h); }
        g.globalAlpha = 1 - k; g.strokeStyle = '#f2f8ff'; g.shadowColor = c.a; g.shadowBlur = 22;
        for (const [width, color] of [[5, c.b], [2, '#ffffff']]) { g.lineWidth = width; g.strokeStyle = color; g.beginPath(); b.path.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); }
      }
      g.shadowBlur = 0;
      // Charge runs around the frame edge.
      const p = ease(t), perimeter = 2 * (w + h), len = perimeter * .18, at = p * perimeter;
      g.globalAlpha = 1 - t; g.strokeStyle = c.a; g.lineWidth = 3; g.shadowColor = c.a; g.shadowBlur = 14;
      g.setLineDash([len, perimeter]); g.lineDashOffset = -at; g.strokeRect(1.5, 1.5, w - 3, h - 3); g.setLineDash([]); g.shadowBlur = 0;
    },
  },

  portal: {
    duration: 1400,
    setup: (w, h) => ({ motes: Array.from({ length: 90 }, () => ({ angle: rand(0, TAU), radius: rand(.3, 1), size: rand(1, 3) })) }),
    draw(g, w, h, t, c, s) {
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * .55;
      const pull = t < .55 ? ease(t / .55) : 1, burst = t < .55 ? 0 : ease((t - .55) / .45);
      for (const m of s.motes) {
        const angle = m.angle + pull * 5 * (1.2 - m.radius), d = (m.radius * (1 - pull * .9) + burst * 1.4) * r;
        g.globalAlpha = (1 - burst) * .9; g.fillStyle = m.radius > .6 ? c.a : c.b;
        g.beginPath(); g.arc(cx + Math.cos(angle) * d, cy + Math.sin(angle) * d * .7, m.size, 0, TAU); g.fill();
      }
      for (let i = 0; i < 3; i++) {
        g.globalAlpha = (t < .55 ? pull : 1 - burst) * .7; g.strokeStyle = i % 2 ? c.b : c.a; g.lineWidth = 2; g.shadowColor = c.a; g.shadowBlur = 16;
        const rr = (.18 + i * .1) * r * (t < .55 ? pull : 1 + burst * 3);
        g.beginPath(); g.ellipse(cx, cy, rr, rr * .7, t * 4 + i, i, i + 4.2); g.stroke();
      }
      g.shadowBlur = 0;
    },
  },

  implode: {
    duration: 1500,
    setup: (w, h) => ({ dust: Array.from({ length: 110 }, () => ({ angle: rand(0, TAU), radius: rand(.45, 1.1), size: rand(.6, 2) })) }),
    draw(g, w, h, t, c, s) {
      // Darkness collapses to a singularity, then a dark shockwave reveals the console.
      const cx = w / 2, cy = h / 2, R = Math.hypot(w, h) / 2;
      const collapse = Math.min(1, t / .5), wave = t < .5 ? 0 : ease((t - .5) / .5);
      g.globalAlpha = t < .5 ? .75 * collapse : .75 * (1 - wave); g.fillStyle = '#000000'; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      for (const d of s.dust) {
        const rr = d.radius * R * (1 - ease(collapse) * .96) + wave * R * 1.2, angle = d.angle + collapse * 3;
        g.globalAlpha = (t < .5 ? collapse : 1 - wave) * .8; g.fillStyle = d.radius > .8 ? c.a : '#b9b0ff';
        g.fillRect(cx + Math.cos(angle) * rr, cy + Math.sin(angle) * rr, d.size, d.size);
      }
      const hole = (t < .5 ? collapse : 1 - wave) * Math.min(w, h) * .07;
      g.globalAlpha = 1; g.strokeStyle = c.a; g.lineWidth = 2; g.shadowColor = c.a; g.shadowBlur = 20;
      g.beginPath(); g.ellipse(cx, cy, hole * 2.2, hole * .8, -.3, 0, TAU); g.stroke(); g.shadowBlur = 0;
      g.globalCompositeOperation = 'source-over'; g.fillStyle = '#000'; g.beginPath(); g.arc(cx, cy, hole, 0, TAU); g.fill();
      if (wave) { g.globalAlpha = 1 - wave; g.strokeStyle = c.b; g.lineWidth = 14 * (1 - wave); g.beginPath(); g.arc(cx, cy, wave * R, 0, TAU); g.stroke(); }
    },
  },

  neon: {
    duration: 1400, flashes: 1,
    setup: () => ({ glitter: Array.from({ length: 60 }, () => ({ angle: rand(0, TAU), speed: rand(.2, .7), size: rand(1.5, 4), heart: Math.random() < .55, white: Math.random() < .25 })) }),
    draw(g, w, h, t, c, s) {
      // Neon tube traces the frame, flickers once, then adds a glitter burst.
      const trace = ease(Math.min(1, t / .45)), perimeter = 2 * (w + h);
      const flicker = t > .45 && t < .54 ? (t < .49 ? 1 : .3) : 1;
      g.globalAlpha = flicker; g.lineWidth = 3; g.strokeStyle = c.a; g.shadowColor = c.a; g.shadowBlur = 20;
      g.setLineDash([perimeter * trace, perimeter]); g.strokeRect(4, 4, w - 8, h - 8);
      g.strokeStyle = c.b; g.lineWidth = 1.5; g.strokeRect(9, 9, w - 18, h - 18); g.setLineDash([]); g.shadowBlur = 0;
      if (t > .45) {
        const k = (t - .45) / .55, cx = w / 2, cy = h / 2, r = Math.hypot(w, h) / 2;
        if (k < .12) { g.globalAlpha = .2 * (1 - k / .12); g.fillStyle = c.a; g.fillRect(0, 0, w, h); }
        for (const p of s.glitter) {
          const d = ease(k) * p.speed * r, x = cx + Math.cos(p.angle) * d, y = cy + Math.sin(p.angle) * d + k * k * 40;
          g.globalAlpha = 1 - k; g.fillStyle = p.heart ? c.a : p.white ? '#ffffff' : c.b;
          if (p.heart) heart(g, x, y, p.size * 1.6); else star(g, x, y, p.size);
        }
      }
      g.globalAlpha = 1;
    },
  },

  redline: {
    duration: 1100,
    setup: (w, h) => ({
      corners: [[14, 2], [w - 14, h - 2]].map(([x, y], corner) => ({
        x, y,
        sparks: Array.from({ length: 7 }, (_, i) => {
          const angle = (corner ? Math.PI : 0) + (i / 7 - .5) * Math.PI;
          return { angle, speed: rand(20, 58), at: rand(0, .12), size: rand(1, 2.2) };
        }),
      })),
    }),
    draw(g, w, h, t, c, s) {
      // A short inspection beam follows the clipped perimeter; sparks mark
      // the two cut corners without sending streaks across terminal text.
      const sweep = ease(Math.min(1, t / .78));
      const inset = 1.5, cut = 14;
      const points = [[cut, inset], [w - inset, inset], [w - inset, h - cut], [w - cut, h - inset], [inset, h - inset], [inset, cut], [cut, inset]];
      const lengths = points.slice(1).map((point, i) => Math.hypot(point[0] - points[i][0], point[1] - points[i][1]));
      const perimeter = lengths.reduce((sum, length) => sum + length, 0);
      g.lineCap = 'square'; g.lineWidth = 3; g.shadowColor = c.a; g.shadowBlur = 9;
      g.strokeStyle = c.a; g.setLineDash([Math.max(1, perimeter * .12), perimeter]);
      g.lineDashOffset = -sweep * perimeter;
      g.beginPath(); points.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
      g.setLineDash([]); g.shadowBlur = 0;
      for (const corner of s.corners) for (const spark of corner.sparks) {
        const age = (t - spark.at) / .34;
        if (age < 0 || age >= 1) continue;
        const distance = spark.speed * age, x = corner.x + Math.cos(spark.angle) * distance, y = corner.y + Math.sin(spark.angle) * distance;
        g.globalAlpha = (1 - age) * .9; g.fillStyle = '#ffe6dc'; g.shadowColor = c.a; g.shadowBlur = 6;
        g.beginPath(); g.arc(x, y, spark.size * (1 - age * .45), 0, TAU); g.fill();
      }
      g.globalAlpha = 1; g.shadowBlur = 0;
    },
  },

  glitch: {
    duration: 1200,
    setup: (w, h) => ({ columns: Array.from({ length: Math.ceil(w / 14) }, (_, i) => ({ x: i * 14, speed: rand(.6, 1.4), offset: rand(-.4, 0), glyphs: Array.from({ length: 22 }, () => String.fromCharCode(0x30a0 + Math.floor(rand(0, 96)))) })), slices: Array.from({ length: 6 }, () => ({ y: rand(0, h), h: rand(4, 18), dx: rand(-30, 30), at: rand(.1, .6) })) }),
    draw(g, w, h, t, c, s) {
      g.font = '12px Consolas, monospace'; g.textBaseline = 'top';
      for (const col of s.columns) {
        const head = (t * col.speed + col.offset) * (h + 200);
        col.glyphs.forEach((glyph, i) => {
          const y = head - i * 14; if (y < -14 || y > h) return;
          g.globalAlpha = (1 - i / col.glyphs.length) * (1 - t) * .8; g.fillStyle = i ? c.a : '#ffffff'; g.fillText(glyph, col.x, y);
        });
      }
      for (const sl of s.slices) {
        const k = (t - sl.at) / .12; if (k < 0 || k > 1) continue;
        g.globalAlpha = .5; g.fillStyle = k < .5 ? c.a : c.b; g.fillRect(sl.dx, sl.y, w, sl.h);
      }
      const scan = ease(t) * h; g.globalAlpha = (1 - t) * .9; g.fillStyle = c.a; g.fillRect(0, scan, w, 2);
      g.globalAlpha = (1 - t) * .15; g.fillRect(0, 0, w, scan);
    },
  },

  spectrum: {
    duration: 1400,
    setup: (w, h) => ({ confetti: Array.from({ length: 90 }, () => { const a = rand(0, TAU), v = rand(120, 520); return { x: w / 2, y: h / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, hue: rand(0, 360), r: rand(0, TAU), size: rand(3, 7) }; }) }),
    draw(g, w, h, t, c, s, dt) {
      const cx = w / 2, cy = h / 2, R = Math.hypot(w, h) / 2;
      for (let i = 0; i < 6; i++) {
        const k = ease(Math.max(0, Math.min(1, t * 1.6 - i * .06))); if (!k || k >= 1) continue;
        g.globalAlpha = (1 - k) * .85; g.strokeStyle = `hsl(${i * 60 + t * 200} 100% 65%)`; g.lineWidth = 5 * (1 - k) + 1;
        g.beginPath(); g.arc(cx, cy, k * R, 0, TAU); g.stroke();
      }
      for (const p of s.confetti) {
        p.vy += 380 * dt; p.vx *= 1 - .8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += 8 * dt;
        g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.globalAlpha = 1 - t; g.fillStyle = `hsl(${p.hue + t * 120} 100% 65%)`;
        g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); g.restore();
      }
    },
  },
};
export const dissolve = {
  duration: 700,
  setup: (w, h, c, kind) => ({ kind, bits: Array.from({ length: 70 }, () => ({ x: rand(0, w), y: rand(0, h), vx: rand(-40, 40), vy: kind === 'embers' ? rand(-140, -40) : kind === 'snow' ? rand(30, 110) : rand(-80, 40), size: rand(1.5, 4), tone: Math.random() < .5 })) }),
  draw(g, w, h, t, c, s, dt) {
    g.globalCompositeOperation = 'lighter';
    for (const p of s.bits) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      g.globalAlpha = (1 - t) * .9; g.fillStyle = p.tone ? c.a : c.b; star(g, p.x, p.y, p.size * (1 - t * .5));
    }
  },
};

export const stateEffects = {
  ready: {
    duration: 720,
    setup: (w, h, colors, kind, theme) => ({ hearts: Array.from({ length: 12 }, (_, i) => ({ x: w * (.12 + (i % 6) * .15), y: h * (.78 + (i % 2) * .08), drift: -rand(22, 68), size: rand(4, 7), phase: i * .63 })), theme }),
    draw(g, w, h, t, c, s) {
      const k = ease(t), alpha = Math.sin(Math.min(1, t * 1.45) * Math.PI);
      if (s.theme === 'blue') {
        // One narrow arc runs along the trim, with no panel flash.
        const x = w * (.08 + .84 * k), y = 5.5 + Math.sin(t * 18) * 1.2;
        g.globalAlpha = alpha * .95; g.strokeStyle = '#eaf7ff'; g.lineWidth = 2; g.shadowColor = c.a; g.shadowBlur = 12;
        g.beginPath(); g.moveTo(x - 18, y + 5); g.lineTo(x - 7, y); g.lineTo(x, y + 4); g.lineTo(x + 10, y - 3); g.lineTo(x + 18, y); g.stroke(); g.shadowBlur = 0;
      } else if (s.theme === 'hot-pink') {
        for (const p of s.hearts) {
          const y = p.y + p.drift * t, x = p.x + Math.sin(t * 8 + p.phase) * 5;
          g.globalAlpha = (1 - t) * .9; g.fillStyle = p.phase % 1 > .5 ? c.a : '#fff0fa'; heart(g, x, y, p.size);
        }
      } else if (s.theme === 'icy') {
        // Breath mist drifts upward in two soft, short-lived ribbons.
        for (let i = 0; i < 3; i++) {
          const x = w * (.25 + i * .24), y = h * (.82 - t * .42), r = h * (.08 + t * .11);
          g.globalAlpha = alpha * .28; g.fillStyle = radial(g, x, y, r, '#d9f8ff', '#d9f8ff00');
          g.beginPath(); g.ellipse(x, y, r * 1.7, r * .55, -.08, 0, TAU); g.fill();
        }
      }
    },
  },
  error: {
    duration: 520,
    draw(g, w, h, t, c) {
      // A restrained red trace marks the error without obscuring output.
      const alpha = Math.sin(t * Math.PI) * .8, inset = 2 + t * 4;
      g.globalAlpha = alpha; g.strokeStyle = '#ff7676'; g.lineWidth = 2; g.shadowColor = '#ff4545'; g.shadowBlur = 10;
      g.strokeRect(inset, inset, w - inset * 2, h - inset * 2); g.shadowBlur = 0;
    },
  },
  output: {
    duration: 360,
    draw(g, w, h, t, c) {
      const line = ease(t), y = line * h;
      g.globalAlpha = (1 - t) * .85; g.fillStyle = c.a; g.fillRect(0, y, w, 2);
      g.globalAlpha = (1 - t) * .12; g.fillRect(0, Math.max(0, y - 8), w, 8);
      if (t < .45) {
        g.globalAlpha = (1 - t / .45) * .18; g.fillStyle = c.b;
        g.fillRect((t * 38) % 8 - 4, h * .3, w, 3);
      }
    },
  },
};

function radial(g, x, y, r, inner, outer) { const f = g.createRadialGradient(x, y, 0, x, y, Math.max(1, r)); f.addColorStop(0, inner); f.addColorStop(1, outer); return f; }
function star(g, x, y, r) { g.beginPath(); g.moveTo(x, y - r * 2); g.lineTo(x + r * .5, y - r * .5); g.lineTo(x + r * 2, y); g.lineTo(x + r * .5, y + r * .5); g.lineTo(x, y + r * 2); g.lineTo(x - r * .5, y + r * .5); g.lineTo(x - r * 2, y); g.lineTo(x - r * .5, y - r * .5); g.fill(); }
function heart(g, x, y, r) { g.beginPath(); g.moveTo(x, y + r); g.bezierCurveTo(x - r * 1.6, y - r * .2, x - r * .6, y - r * 1.4, x, y - r * .4); g.bezierCurveTo(x + r * .6, y - r * 1.4, x + r * 1.6, y - r * .2, x, y + r); g.fill(); }
function bolt(x1, y1, x2, y2) {
  let points = [[x1, y1], [x2, y2]];
  for (let depth = 0; depth < 5; depth++) {
    const next = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1], [bx, by] = points[i], spread = Math.hypot(bx - ax, by - ay) * .28;
      next.push([(ax + bx) / 2 + rand(-spread, spread), (ay + by) / 2 + rand(-spread * .3, spread * .3)], [bx, by]);
    }
    points = next;
  }
  return points;
}
