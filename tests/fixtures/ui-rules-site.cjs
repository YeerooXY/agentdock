'use strict';
// One small shop page in two versions. "good" follows every rule in docs/ui-rules.md; "bad" breaks each one once.
// Both share the same markup and content so the checks can be compared directly.
const zlib = require('node:zlib');

function productPng(size = 96) {
  // White studio background with a dark product shape; rows are filter byte + RGB.
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - size / 2, y - size / 2), o = y * (size * 3 + 1) + 1 + x * 3;
    const shade = d < size * 0.3 ? 40 : d < size * 0.36 ? 90 : 255;
    raw[o] = raw[o + 1] = raw[o + 2] = shade;
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), sum = Buffer.alloc(4); len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, sum]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const icon = stroke => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 12h16M12 4v16" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round"/></svg>`;

function css(bad) {
  return `${bad ? `:root { --bg: hsl(36 40% 95%); --surface: hsl(36 30% 98%); --ink: hsl(220 25% 18%); --muted: hsl(220 10% 45%); --accent: hsl(24 85% 55%); --line: #d9d9d9; }
html.dark { --bg: hsl(220 15% 12%); --surface: hsl(220 15% 12%); --ink: hsl(220 15% 92%); --line: #3a3a3a; }`
  : `:root { --bg: oklch(96% 0.012 80); --surface: oklch(98.5% 0.006 80); --ink: oklch(25% 0.02 260); --muted: oklch(48% 0.02 260); --accent: oklch(64% 0.17 45); --line: rgb(0 0 0 / 0.12); }
html.dark { --bg: oklch(18% 0.012 260); --surface: oklch(26% 0.014 260); --ink: oklch(95% 0.01 260); --muted: oklch(72% 0.02 260); --line: rgb(255 255 255 / 0.14); }`}
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.5 system-ui, sans-serif; background: var(--bg); color: var(--ink); ${bad ? '' : 'padding-bottom: 24px;'} }
header { ${bad ? 'position: fixed; top: 0; left: 0; right: 0; height: 140px;' : 'position: sticky; top: 0; height: 56px;'} display: flex; align-items: center; gap: 16px; padding: 0 16px; background: var(--surface); border-bottom: 1px solid var(--line); z-index: 2; }
.checkout-bar { ${bad ? 'position: fixed; bottom: 0; left: 0; right: 0; height: 160px; background: var(--surface); border-top: 1px solid var(--line);' : 'display: none;'} }
nav a { color: var(--ink); text-decoration: none; }
${bad ? '' : 'nav { display: flex; gap: 16px; } .signup { display: flex; gap: 8px; } .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }'}
a.more { color: var(--accent); }
${bad ? '' : 'button, label, nav, header, .tabs { -webkit-user-select: none; user-select: none; }'}
a, button, input, select, textarea, summary, dialog, [role=tooltip] { ${bad ? '' : 'transition: background-color .15s ease-out, color .15s ease-out, opacity .2s ease-out, transform .15s ease-out;'} }
${bad ? 'button:focus, a:focus { outline: 2px solid var(--accent); }\na.more { outline: none; }' : ':focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }'}
button { display: inline-flex; align-items: center; gap: 8px; ${bad ? '' : 'min-height: 40px;'} font: 600 15px system-ui, sans-serif; padding: 10px 16px; border: 0; border-radius: 999px; background: var(--accent); color: white; cursor: pointer; }
button:hover { background: color-mix(in oklch, var(--accent), black 10%); }
.hero { min-height: 100vh; ${bad ? '' : 'min-height: 100dvh;'} display: grid; place-items: center; padding: ${bad ? '160px' : '40px'} 24px; background: ${bad ? 'linear-gradient(90deg, blue, orange)' : 'linear-gradient(90deg in oklch, blue, orange)'}; color: white; }
.hero h1 { font-size: 40px; margin: 0; animation: rise .6s ease-out both; }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } }
main { max-width: 960px; margin: 0 auto; padding: 24px 16px; display: grid; gap: 24px; }
.panel { ${bad ? 'border: 1px solid var(--line); border-radius: 24px; padding: 16px;' : ''} }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 12px; ${bad ? 'box-shadow: 0 8px 24px rgb(0 0 0 / .5);' : 'box-shadow: 0 8px 24px rgb(0 0 0 / .08);'} }
.card .frame { ${bad ? 'border: 1px solid var(--line); border-radius: 12px; padding: 8px;' : ''} }
.card img { display: block; width: 100%; max-width: 240px; border-radius: ${bad ? '20px' : '8px'}; ${bad ? '' : 'mix-blend-mode: multiply;'} }
.choices { display: flex; gap: 12px; }
.choice { ${bad ? 'display: block;' : 'display: flex; flex-direction: column; gap: 2px;'} padding: 10px 12px; border-radius: 12px; background: var(--surface); }
.choice.stacked { display: flex; flex-direction: column; }
.fine { font-size: ${bad ? '11px' : '12px'}; color: var(--muted); }
input { font: inherit; padding: 8px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink); }
${bad ? '#search { border-radius: 0; background: #eeeeee; }' : ''}
.rail { display: flex; gap: 12px; overflow-x: auto; padding: 4px 0 12px; ${bad ? '' : 'mask-image: linear-gradient(90deg, transparent, black 15% 85%, transparent); -webkit-mask-image: linear-gradient(90deg, transparent, black 15% 85%, transparent);'} }
.rail .item { flex: 0 0 200px; height: 120px; border-radius: 16px; background: var(--surface); display: grid; place-items: center; }
.tip { position: relative; }
[role=tooltip] { position: absolute; top: 100%; left: 0; padding: 4px 8px; border-radius: 6px; background: var(--ink); color: var(--bg); font-size: 12px; opacity: 0; pointer-events: none; }
.tip:hover [role=tooltip], .tip:focus-within [role=tooltip] { opacity: 1; }
dialog { border: 0; border-radius: 16px; ${bad ? '' : 'opacity: 1;'} }
${bad ? '' : '@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }'}`;
}

function html(bad) {
  const toggle = bad
    ? `<span id="fav-slot"><button id="fav" aria-pressed="false" onclick="this.parentElement.innerHTML = this.parentElement.innerHTML.replace('aria-pressed=&quot;false&quot;', 'aria-pressed=&quot;true&quot;')">Save</button></span>`
    : `<button id="fav" aria-pressed="false" onclick="this.setAttribute('aria-pressed', String(this.getAttribute('aria-pressed') !== 'true'))">Save</button>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Loma Audio</title>
<link rel="stylesheet" href="styles.css"><script>if (new URLSearchParams(location.search).get('theme') === 'dark') document.documentElement.classList.add('dark');</script></head>
<body><header><strong>Loma Audio</strong><nav><a href="#shop">Shop</a> <a href="#care">Care</a></nav></header>
<section class="hero"><h1>Quiet, all day</h1></section>
<main id="shop">
  <section class="panel"><article class="card"><div class="frame"><img src="product.png" alt="Loma One headphones"></div>
    <h2>Loma One</h2><p class="fine">Ships in 2 days. Free returns for 30 days.</p>
    <div class="actions"><button type="button">${icon(bad ? 1 : 2.4)}Add to bag</button> ${toggle}<a class="more" href="#care">Care guide</a></div></article></section>
  <div class="choices"><label class="choice"><strong>Pickup</strong><small>Today</small></label><label class="choice${bad ? ' stacked' : ''}"><strong>Delivery</strong><small>Tomorrow</small></label></div>
  <form class="signup"><input id="email" type="email" placeholder="Email" aria-label="Email"> <input id="search" type="search" placeholder="Search" aria-label="Search"></form>
  <div class="rail" aria-label="More products">${Array.from({ length: 6 }, (_, i) => `<div class="item">Model ${i + 1}</div>`).join('')}</div>
  <p class="tip"${bad ? ' title="Two-year warranty"' : ''}><span tabindex="0">Warranty</span><span role="tooltip">Two-year warranty</span></p>
  <dialog id="news"><p>Get news about new models.</p></dialog>
  <p id="care">Clean the ear pads with a dry cloth.</p>
</main><div class="checkout-bar"></div></body></html>`;
}

const build = variant => ({ 'index.html': html(variant === 'bad'), 'styles.css': css(variant === 'bad'), 'product.png': productPng() });

module.exports = { build };
