'use strict';
// Craft hints for rendered pages; see docs/ui-rules.md. inspectCraft runs inside the page and must stay self-contained.
// These are style recommendations, reported as hints rather than defects.

function inspectCraft() {
  const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility === 'visible' && Number(s.opacity) > 0; };
  const name = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : [...el.classList].slice(0, 2).map(c => '.' + c).join(''));
  // Returns { rgb: [0-1 x3] | null, lum: relative luminance, a: alpha } for rgb(), color(srgb) and oklch/oklab values.
  const color = value => {
    if (!value || value === 'transparent') return { rgb: null, lum: 0, a: 0 };
    const parts = (value.match(/\(([^)]*)\)/)?.[1] || '').split(/[\s,/]+/).filter(Boolean);
    const alpha = parts.length > 3 ? parseFloat(parts[3]) / (parts[3].endsWith('%') ? 100 : 1) : 1;
    let rgb = null;
    if (/^rgba?\(/.test(value)) rgb = parts.slice(0, 3).map(v => parseFloat(v) / 255);
    else if (/^color\(srgb/.test(value)) rgb = parts.slice(1, 4).map(Number);
    else if (/^okl(?:ch|ab)\(/.test(value)) { const l = parseFloat(parts[0]) / (parts[0].endsWith('%') ? 100 : 1); return { rgb: null, lum: l ** 3, a: alpha, chroma: /^oklch/.test(value) ? parseFloat(parts[1]) : Math.hypot(parseFloat(parts[1]), parseFloat(parts[2])) }; }
    if (!rgb || rgb.some(Number.isNaN)) return { rgb: null, lum: null, a: alpha };
    const lin = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    return { rgb, lum: 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]), a: alpha, chroma: Math.max(...rgb) - Math.min(...rgb) };
  };
  const backdrop = el => { for (let n = el; n; n = n.parentElement) { const c = color(getComputedStyle(n).backgroundColor); if (c.a > 0.5 && c.lum !== null) return c.lum; } return 1; };
  const findings = [];
  const report = (id, items, message) => { if (items.length) findings.push({ id, level: 'hint', count: items.length, message, samples: [...new Set(items)].slice(0, 8) }); };
  const all = [...document.querySelectorAll('body *')].filter(el => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName) && visible(el));
  const radius = el => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  const painted = el => { const s = getComputedStyle(el); return color(s.backgroundColor).a > 0.05 || parseFloat(s.borderTopWidth) > 0 || el.tagName === 'IMG' || s.backgroundImage !== 'none'; };

  // Nested rounded corners: inner radius should equal outer radius minus the inset.
  const corners = [];
  for (const el of all) {
    if (!painted(el) || getComputedStyle(el).borderTopLeftRadius.includes('%')) continue;
    let parent = el.parentElement; while (parent && parent !== document.body && !(radius(parent) > 0 && painted(parent))) parent = parent.parentElement;
    if (!parent || parent === document.body) continue;
    const outer = radius(parent), inner = radius(el), a = el.getBoundingClientRect(), b = parent.getBoundingClientRect();
    const dx = a.left - b.left, dy = a.top - b.top, inset = Math.min(dx, dy);
    if (outer < 8 || dx <= 0 || dy <= 0 || dx > 32 || dy > 32) continue;
    const expected = Math.max(0, outer - inset);
    if (Math.abs(inner - expected) > Math.max(3, expected * 0.3)) corners.push(`${name(el)} ${Math.round(inner)}px in ${name(parent)} ${Math.round(outer)}px, inset ${Math.round(inset)}px: use about ${Math.round(expected)}px`);
  }
  report('nested-radius', corners, 'Inner corners do not follow the outer corner. Make the inner radius the outer radius minus the padding.');

  // Neutral borders as solid colours instead of translucent ones that blend into any surface.
  report('opaque-borders', all.filter(el => {
    const s = getComputedStyle(el); if (!(parseFloat(s.borderTopWidth) > 0) || s.borderTopStyle === 'none') return false;
    const c = color(s.borderTopColor); return c.a === 1 && c.chroma !== undefined && c.chroma < 0.08;
  }).map(name), 'Neutral borders use solid colours. Use a translucent colour such as rgb(0 0 0 / 0.12) so they suit any background.');

  // Icon stroke should match the weight of the neighbouring text.
  const strokes = [];
  for (const svg of all.filter(el => el.tagName === 'svg')) {
    const shape = svg.querySelector('path,line,circle,rect,polyline,polygon'); if (!shape) continue;
    const s = getComputedStyle(shape); if (s.stroke === 'none' || !(parseFloat(s.strokeWidth) > 0)) continue;
    // The text beside an icon shares its parent, e.g. a button or a labelled row.
    const host = svg.parentElement; if (!host || !host.textContent.trim()) continue;
    const view = svg.viewBox?.baseVal, scale = view?.width ? svg.getBoundingClientRect().width / view.width : 1;
    const t = getComputedStyle(host), size = parseFloat(t.fontSize), weight = parseFloat(t.fontWeight) || 400;
    const stem = size * (0.088 + (weight - 400) * 0.00021), ratio = parseFloat(s.strokeWidth) * scale / stem;
    if (ratio < 0.6 || ratio > 1.7) strokes.push(`${name(svg)} stroke ${(parseFloat(s.strokeWidth) * scale).toFixed(1)}px next to ${weight} weight text (about ${stem.toFixed(1)}px)`);
  }
  report('icon-stroke-weight', strokes, 'Icon stroke width does not match the weight of the text beside it.');

  // Horizontal scrollers without faded edges.
  report('carousel-edge-fade', all.filter(el => {
    const s = getComputedStyle(el);
    return /auto|scroll/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 4 && el.children.length >= 3 && !['PRE', 'CODE', 'TABLE', 'TEXTAREA'].includes(el.tagName)
      && (s.maskImage || 'none') === 'none' && (s.webkitMaskImage || 'none') === 'none';
  }).map(name), 'Horizontal scrollers end abruptly. Fade the edges with mask-image: linear-gradient(90deg, transparent, black 15% 85%, transparent).');

  // Dark mode depth: raised surfaces should be lighter than what they sit on.
  if (backdrop(document.body) < 0.1) {
    report('dark-depth', all.filter(el => {
      const s = getComputedStyle(el); if (s.boxShadow === 'none' || /\b0px 0px 0px/.test(s.boxShadow)) return false;
      const own = color(s.backgroundColor); return own.a > 0.5 && own.lum !== null && el.parentElement && own.lum <= backdrop(el.parentElement) + 0.002;
    }).map(name), 'In dark mode these raised surfaces rely on shadows. Make them lighter than the surface below to show depth.');
  }

  // Product shots with a white background on a light, non-white page.
  const page = backdrop(document.body), white = [];
  if (page > 0.6 && page < 0.98) for (const img of all.filter(el => el.tagName === 'IMG' && el.complete && el.naturalWidth >= 64)) {
    if (getComputedStyle(img).mixBlendMode === 'multiply' || backdrop(img.parentElement) >= 0.98) continue;
    try {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 8;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, 8, 8);
      const px = ctx.getImageData(0, 0, 8, 8).data, corner = i => px[i] > 245 && px[i + 1] > 245 && px[i + 2] > 245;
      if ([0, 7 * 4, 56 * 4, 63 * 4].every(corner)) white.push(name(img));
    } catch { /* Cross-origin images cannot be sampled. */ }
  }
  report('white-image-background', white, 'Images with white backgrounds show as white boxes on this tinted page. Use mix-blend-mode: multiply.');
  return { findings };
}

module.exports = { inspectCraft };
