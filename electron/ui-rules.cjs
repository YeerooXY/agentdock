'use strict';
// Deterministic interface rules; see docs/ui-rules.md. inspectInterface and look run inside the page and must stay self-contained.

function inspectInterface() {
  const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility === 'visible' && Number(s.opacity) > 0; };
  const name = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : [...el.classList].slice(0, 2).map(c => '.' + c).join(''));
  const alpha = color => {
    if (!color || color === 'transparent') return 0;
    const slash = color.match(/\/\s*([\d.]+)(%?)\s*\)$/); if (slash) return parseFloat(slash[1]) / (slash[2] ? 100 : 1);
    const rgba = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/); return rgba ? parseFloat(rgba[1]) : 1;
  };
  const boxed = s => ['Top', 'Right', 'Bottom', 'Left'].every(side => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== 'none' && alpha(s[`border${side}Color`]) > 0.05)
    || s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 && alpha(s.outlineColor) > 0.05
    || /\b0px 0px 0px [\d.]*[1-9][\d.]*px/.test(s.boxShadow);
  const moves = s => s && (s.animationName !== 'none' && s.animationDuration.split(',').some(v => parseFloat(v) > 0)
    || s.transitionProperty !== 'none' && s.transitionDuration.split(',').some(v => parseFloat(v) > 0));
  const textRects = el => { const range = document.createRange(); range.selectNodeContents(el); return [...range.getClientRects()].filter(r => r.width > 0); };
  const ownText = el => [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
  const findings = [];
  const report = (id, items, message, threshold) => { if (items.length) findings.push({ id, count: items.length, ...(threshold ? { threshold } : {}), message, samples: [...new Set(items)].slice(0, 8) }); };
  const all = [...document.querySelectorAll('body *')].filter(el => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName) && visible(el));

  const boxes = new Set(all.filter(el => boxed(getComputedStyle(el))));
  const depth = el => { let d = 0; for (let n = el; n && n !== document.body; n = n.parentElement) if (boxes.has(n)) d++; return d; };
  const innermost = [...boxes].filter(el => ![...el.querySelectorAll('*')].some(child => boxes.has(child)));
  report('nested-boxes', innermost.filter(el => depth(el) >= 3).map(el => `${name(el)} (${depth(el)} levels)`), 'Bordered or outlined boxes are nested three or more levels deep. Remove frames that add no grouping.', 3);

  const controls = all.filter(el => el.matches('button,a[href],[role=button],[role=tab],[role=menuitem],[role=option],[role=switch],summary,select,textarea,input:not([type=hidden])'));
  report('unanimated-controls', controls.filter(el => !moves(getComputedStyle(el))).map(name), 'Controls change state with no transition or animation. Add a short hover, press or focus transition.');
  const overlays = [...document.querySelectorAll('dialog,[popover],[role=dialog],[role=alertdialog],[role=menu],[role=listbox],[role=tooltip]')];
  report('unanimated-overlays', overlays.filter(el => !moves(getComputedStyle(el)) && !(el.tagName === 'DIALOG' && moves(getComputedStyle(el, '::backdrop')))).map(name),
    'Dialogs, menus or popovers appear with no transition or animation.');

  const chrome = 'button,label,summary,[role=button],[role=tab],[role=menuitem],[role=option],[role=switch],nav,header,[role=toolbar],[role=tablist],[role=menubar]';
  report('selectable-controls', all.filter(el => ownText(el) && el.closest(chrome) && !el.closest('a[href],input,textarea,select,[contenteditable]:not([contenteditable=false])')
    && ![getComputedStyle(el).userSelect, getComputedStyle(el).webkitUserSelect].includes('none')).map(name), 'Text in controls, navigation or toolbars can be highlighted by clicking or dragging. Set user-select: none on interface chrome.');

  const touching = [];
  for (const parent of all) {
    const kids = [...parent.children].filter(k => visible(k) && k.textContent.trim());
    for (let i = 1; i < kids.length; i++) {
      if (kids[i - 1].nextElementSibling !== kids[i]) continue;
      const a = textRects(kids[i - 1]).pop(), b = textRects(kids[i])[0];
      if (!a || !b) continue;
      const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top), gap = b.left - a.right;
      if (overlap > Math.min(a.height, b.height) / 2 && gap > -1 && gap < 1.5) touching.push(`${name(kids[i - 1])} + ${name(kids[i])} in ${name(parent)}`);
    }
  }
  report('touching-text', touching, 'Neighbouring text runs together with no gap on the same line.', 1.5);

  const stack = el => {
    const kids = [...el.children].filter(visible); if (kids.length < 2) return null;
    const [a, b] = kids.map(k => k.getBoundingClientRect());
    return Math.abs(a.top - b.top) < 4 ? 'row' : a.bottom <= b.top + 2 ? 'column' : 'overlapping';
  };
  const groups = new Map();
  for (const el of all) {
    if (!el.classList.length || !el.parentElement) continue;
    const key = [...el.classList].sort().join('.'), list = groups.get(el.parentElement)?.get(key) || [];
    if (!groups.has(el.parentElement)) groups.set(el.parentElement, new Map());
    groups.get(el.parentElement).set(key, [...list, el]);
  }
  const mismatched = [];
  for (const byClass of groups.values()) for (const members of byClass.values()) {
    if (members.length < 2) continue;
    const layouts = members.map(el => ({ el, layout: stack(el) })).filter(x => x.layout);
    if (new Set(layouts.map(x => x.layout)).size > 1) mismatched.push(layouts.map(x => `${name(x.el)} ${x.layout}`).join(' / '));
  }
  report('sibling-layout', mismatched, 'Elements that share a class and parent lay out their content differently.');

  // Chrome share: how much of the viewport height never scrolls. Uses the largest scroll container, or fixed/sticky bars over the document.
  const scrollers = all.filter(el => /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1)
    .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
  const scroller = scrollers[0] || null;
  const bars = all.filter(el => /fixed|sticky/.test(getComputedStyle(el).position) && el.getBoundingClientRect().width >= innerWidth / 2 && !(scroller && scroller.contains(el)));
  const covered = new Array(Math.ceil(innerHeight)).fill(false);
  const cover = (top, bottom) => { for (let y = Math.max(0, Math.floor(top)); y < Math.min(innerHeight, Math.ceil(bottom)); y++) covered[y] = true; };
  if (scroller) { const r = scroller.getBoundingClientRect(); cover(0, r.top); cover(r.bottom, innerHeight); }
  for (const bar of bars) { const r = bar.getBoundingClientRect(); if (r.top <= 1 || r.bottom >= innerHeight - 1) cover(r.top, r.bottom); }
  const share = covered.filter(Boolean).length / innerHeight;
  if (share > 0.35) findings.push({ id: 'chrome-share', count: 1, threshold: 0.35, message: `Fixed bars take ${Math.round(share * 100)}% of the viewport height, leaving ${Math.round((1 - share) * 100)}% for content.`, samples: bars.slice(0, 8).map(name) });

  // At the end of scrolling, the last content must not sit under a fixed bar.
  const target = scroller || document.scrollingElement, saved = target.scrollTop;
  target.scrollTop = target.scrollHeight;
  const last = [...(scroller || document.body).querySelectorAll('*')].filter(el => visible(el) && !bars.some(bar => bar.contains(el)) && (ownText(el) || el.matches('button,a[href],input,select,textarea'))).pop();
  if (last && last.getBoundingClientRect().top < innerHeight) {
    const r = last.getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, Math.min(r.top + r.height / 2, innerHeight - 1));
    if (top && !last.contains(top) && !top.contains(last)) report('covered-content', [`${name(last)} under ${name(top)}`], 'After scrolling to the end, the last content is still covered. Add bottom padding equal to the fixed bar height.');
  }
  target.scrollTop = saved;

  // Text fields should share one look.
  const fields = all.filter(el => el.matches('input:not([type]),input[type=text],input[type=search],input[type=email],input[type=password],input[type=number],input[type=url],input[type=tel],textarea,select'));
  const signature = el => { const s = getComputedStyle(el); return [s.borderRadius, s.borderTopWidth, s.borderTopStyle, s.backgroundColor, s.fontSize].join(' '); };
  const looks = new Map();
  for (const field of fields) looks.set(signature(field), [...looks.get(signature(field)) || [], field]);
  if (looks.size > 1) {
    const ranked = [...looks.values()].sort((a, b) => b.length - a.length);
    report('input-style-outliers', ranked.slice(1).flat().map(el => `${name(el)} differs from ${name(ranked[0][0])}`), 'Text fields use different border, radius, background or size. Use one field style.');
  }
  const native = document.querySelectorAll('[title]:not(svg [title])').length, custom = document.querySelectorAll('[role=tooltip],[data-tooltip]').length;
  if (native && custom) findings.push({ id: 'mixed-tooltips', count: native, message: `Hover text mixes ${native} native title tooltips with ${custom} custom tooltips. Use one tooltip style.`, samples: [] });
  return { findings };
}

const look = el => { const s = getComputedStyle(el); return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderTopColor, s.backgroundColor, s.textDecorationLine].join('|'); };
const label = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : [...el.classList].slice(0, 2).map(c => '.' + c).join(''));

// Keyboard and mouse probes for desktop Chromium. Runs after animations are disabled so styles settle immediately.
async function probeInteraction(page) {
  const findings = [], report = (id, items, message) => { if (items.length) findings.push({ id, count: items.length, message, samples: [...new Set(items)].slice(0, 8) }); };
  const viewport = page.viewportSize();
  await page.evaluate(() => document.activeElement?.blur());
  const unmarked = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const handle = await page.evaluateHandle(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement || el.dataset.paddockTab) return null;
      el.dataset.paddockTab = '1'; return el;
    });
    const el = handle.asElement();
    if (!el) break;
    const focused = await el.evaluate(look);
    await el.evaluate(node => node.blur());
    const plain = await el.evaluate(look);
    await el.evaluate(node => node.focus({ preventScroll: true }));
    if (focused === plain) unmarked.push(await el.evaluate(label));
  }
  await page.evaluate(() => document.querySelectorAll('[data-paddock-tab]').forEach(el => delete el.dataset.paddockTab));
  report('no-focus-indicator', unmarked, 'Keyboard focus does not change how these controls look. Add a :focus-visible outline.');

  const ringed = [];
  let checked = 0;
  for (const handle of (await page.$$('button:not([disabled])')).slice(0, 60)) {
    if (checked >= 12) break;
    const box = await handle.boundingBox();
    if (!box || box.width < 4 || box.y < 0 || box.y + box.height > viewport.height) continue;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    if (!await handle.evaluate((el, [px, py]) => el.contains(document.elementFromPoint(px, py)), [x, y])) continue;
    checked++;
    await page.mouse.move(0, 0); await page.evaluate(() => document.activeElement?.blur());
    const plain = await handle.evaluate(look);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(0, 0); await page.mouse.up();
    if (await handle.evaluate(el => document.activeElement === el) && await handle.evaluate(look) !== plain) ringed.push(await handle.evaluate(label));
  }
  await page.evaluate(() => document.activeElement?.blur());
  report('mouse-focus-ring', ringed, 'A focus ring shows after pressing with the mouse. Style :focus-visible instead of :focus.');

  const lost = [];
  for (const handle of (await page.$$('button[aria-pressed],[role=switch],input[type=checkbox]')).slice(0, 8)) {
    if (!await handle.isVisible()) continue;
    await handle.focus();
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('Space');
      if (await page.evaluate(() => !document.activeElement || document.activeElement === document.body)) { lost.push(await handle.evaluate(label)); break; }
    }
  }
  report('focus-lost', lost, 'Toggling with Space moved focus to the page body.');
  return { findings, checked: { buttons: checked } };
}

module.exports = { inspectInterface, probeInteraction };
