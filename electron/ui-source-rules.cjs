'use strict';
// Source-level interface rules; see docs/ui-rules.md. Reads files only.
const fs = require('node:fs');
const path = require('node:path');

const SKIP = new Set(['node_modules', '.git', 'bin', 'obj', 'dist', 'build', '.build', '.local', 'release', 'vendor', 'coverage']);
const EXTENSIONS = new Set(['.css', '.scss', '.cs', '.js', '.cjs', '.mjs', '.ts']);
const MAX_FILES = 4000, MAX_BYTES = 1 << 20;

function sourceFiles(root) {
  const files = [], pending = [root];
  while (pending.length && files.length < MAX_FILES) {
    const dir = pending.pop();
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      // wwwroot/lib holds copied third-party packages such as Bootstrap.
      if (entry.isDirectory()) { if (!SKIP.has(entry.name) && !entry.name.startsWith('.') && !(entry.name === 'lib' && path.basename(dir) === 'wwwroot')) pending.push(full); }
      else if (EXTENSIONS.has(path.extname(entry.name)) && !/\.min\.(?:js|css)$/.test(entry.name)) files.push(full);
    }
  }
  return files.sort();
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;
// Blank comments without moving line numbers.
const stripComments = text => text.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '));

// Greys (equal red, green and blue, any alpha) cannot drift through grey, so fades between them are exempt.
function grey(colour) {
  let hex = colour.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex) { if (hex.length <= 4) hex = [...hex].map(x => x + x).join(''); return hex.slice(0, 2) === hex.slice(2, 4) && hex.slice(2, 4) === hex.slice(4, 6); }
  const rgb = colour.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  return !!rgb && rgb[1] === rgb[2] && rgb[2] === rgb[3];
}

function cssFindings(file, text) {
  const found = [], css = stripComments(text);
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim(), body = rule[2], line = lineOf(css, rule.index + rule[0].length - rule[2].length - 1);
    const plainFocus = selector.split(',').some(part => /:focus(?![-\w])/.test(part) && !/:focus:not\(:focus-visible\)/.test(part));
    if (plainFocus && /(?:^|;)\s*(?:outline\s*:\s*(?!none|0\b)[^;]+|box-shadow\s*:\s*(?!none)[^;]+)/.test(body)) found.push({ id: 'focus-without-visible', line, detail: selector.slice(0, 120) });
    for (const size of body.matchAll(/font-size\s*:\s*([\d.]+)(px|rem|em)\b/g)) {
      const px = parseFloat(size[1]) * (size[2] === 'px' ? 1 : 16);
      if (px < 12) found.push({ id: 'small-font', line, detail: `${size[1]}${size[2]} in ${selector.slice(0, 80)}` });
    }
  }
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim().slice(0, 80), body = rule[2], line = lineOf(css, rule.index + rule[0].length - rule[2].length - 1);
    // Viewport units: 100vh is wrong in mobile Safari unless a dynamic unit is also given.
    if (/\b100vh\b/.test(body) && !/\b100[dsl]vh\b/.test(body)) found.push({ id: 'viewport-height', line, detail: selector });
    // Palette tokens defined in HSL, where equal lightness does not look equal.
    for (const token of body.matchAll(/(--[\w-]+)\s*:\s*hsla?\(/g)) found.push({ id: 'hsl-palette', line, detail: token[1] });
    // Gradients between two or more colours without OKLCH/OKLab interpolation turn grey in the middle.
    for (const gradient of body.matchAll(/(?:repeating-)?(?:linear|radial|conic)-gradient\(([^;]*?)\)(?=\s*[,;]|\s*$)/g)) {
      const args = gradient[1];
      if (/\bin\s+okl(?:ch|ab)\b/.test(args)) continue;
      const colours = (args.match(/#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|color)\([^)]*\)|\b(?:red|orange|yellow|green|blue|purple|pink|teal|cyan|magenta|violet|indigo)\b|var\(--[\w-]+\)/gi) || [])
        .filter(c => !grey(c));
      if (new Set(colours.map(c => c.toLowerCase())).size >= 2) found.push({ id: 'gradient-interpolation', line, detail: `${selector}: ${gradient[0].slice(0, 70)}` });
    }
  }
  if (/(?:transition|animation)(?:-duration)?\s*:\s*(?!none)[^;}]*\d/.test(css) && !css.includes('prefers-reduced-motion')) found.push({ id: 'reduced-motion-missing', line: 1, detail: 'transitions or animations without a prefers-reduced-motion block' });
  else found.push(...motionFindings(css));
  return found.map(f => ({ ...f, file }));
}

// Style rules with whether they sit inside a reduced-motion media block; keyframe steps are skipped.
function styleRules(css) {
  const rules = [], stack = [];
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') { stack.push({ prelude: css.slice(start, i).trim(), open: i }); start = i + 1; }
    else if (css[i] === '}') {
      const block = stack.pop(); start = i + 1;
      if (!block || block.prelude.startsWith('@')) continue;
      const parents = stack.map(b => b.prelude);
      if (parents.some(p => /^@(?:-\w+-)?keyframes\b/i.test(p))) continue;
      rules.push({ selector: block.prelude, body: css.slice(block.open + 1, i), index: block.open,
        reduce: parents.some(p => /^@media\b/i.test(p) && /prefers-reduced-motion\s*:\s*reduce/i.test(p)) });
    } else if (css[i] === ';' && !stack.length) start = i + 1;
  }
  return rules;
}

const splitSelectors = text => { const parts = []; let depth = 0, from = 0;
  for (let i = 0; i < text.length; i++) { if (text[i] === '(') depth++; else if (text[i] === ')') depth--; else if (text[i] === ',' && !depth) { parts.push(text.slice(from, i).trim()); from = i + 1; } }
  return [...parts, text.slice(from).trim()].filter(Boolean); };
const LEGACY_PSEUDO = /^:(?:before|after|first-line|first-letter)$/i;
function selectorParts(selector) {
  const simple = [], pseudo = [];
  for (const [token] of selector.matchAll(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|::?[\w-]+(?:\([^)]*\))?|(?<![\w#.:\-[])[a-z][\w-]*|\*/gi)) {
    if (token.startsWith('::') || LEGACY_PSEUDO.test(token)) pseudo.push('::' + token.replace(/^::?/, '').toLowerCase()); else simple.push(token);
  }
  const ids = simple.filter(t => t.startsWith('#')).length, classes = simple.filter(t => /^[.[:]/.test(t)).length;
  const elements = simple.filter(t => /^[a-z]/i.test(t)).length + pseudo.length;
  return { simple: simple.filter(t => t !== '*'), pseudo: pseudo.join(''), specificity: ids * 10000 + classes * 100 + elements };
}
const seconds = value => { const m = String(value).match(/([\d.]+)(m?s)/); return m ? parseFloat(m[1]) / (m[2] === 'ms' ? 1000 : 1) : 0; };
// An override stops motion with none, display:none or a duration of at most 50 ms.
function stops(body, kind) {
  if (/(?:^|;)\s*display\s*:\s*none\b/i.test(body)) return true;
  if (new RegExp(`(?:^|;)\\s*${kind}(?:-name|-property)?\\s*:\\s*none\\b`, 'i').test(body)) return true;
  const duration = body.match(new RegExp(`(?:^|;)\\s*${kind}-duration\\s*:\\s*([\\d.]+m?s)`, 'i'));
  return !!duration && seconds(duration[1]) <= 0.05;
}

// Each animated selector needs a reduced-motion override that matches it with equal specificity or !important.
function motionFindings(css) {
  const found = [], rules = styleRules(css);
  const overrides = rules.filter(r => r.reduce).flatMap(r => ['animation', 'transition'].filter(kind => stops(r.body, kind))
    .flatMap(kind => splitSelectors(r.selector).map(selector => ({ kind, important: /!important/.test(r.body), ...selectorParts(selector) }))));
  for (const rule of rules.filter(r => !r.reduce)) {
    const line = lineOf(css, rule.index);
    const kinds = [/(?:^|;)\s*animation(?:-name)?\s*:\s*(?!none\b)[^;]*[a-z]/i.test(rule.body) && 'animation',
      /(?:^|;)\s*transition(?:-property)?\s*:[^;]*\b(?:transform|translate|scale|rotate)\b/i.test(rule.body) && 'transition'].filter(Boolean);
    if (/(?:^|;)\s*animation(?:-iteration-count)?\s*:[^;]*\binfinite\b/i.test(rule.body)) found.push({ id: 'looping-animation', line, detail: rule.selector.slice(0, 120) });
    if (!overrides.length) continue;
    for (const selector of splitSelectors(rule.selector)) {
      const target = selectorParts(selector);
      const covered = kind => overrides.some(o => o.kind === kind && o.pseudo === target.pseudo && o.simple.every(t => target.simple.includes(t)) && (o.important || o.specificity >= target.specificity));
      for (const kind of kinds) if (!covered(kind)) found.push({ id: 'reduced-motion-uncovered', line, detail: `${kind} on ${selector.slice(0, 100)}` });
    }
  }
  return found;
}

function windowFindings(file, text, mauiHasMinimum) {
  const found = [];
  for (const match of text.matchAll(/new\s+BrowserWindow\s*\(\s*\{/g)) {
    let depth = 0, end = match.index + match[0].length - 1;
    for (; end < text.length; end++) { if (text[end] === '{') depth++; else if (text[end] === '}' && --depth === 0) break; }
    const options = text.slice(match.index, end);
    if (!/\bminWidth\b/.test(options) || !/\bminHeight\b/.test(options)) found.push({ id: 'window-min-size', file, line: lineOf(text, match.index), detail: 'BrowserWindow without minWidth and minHeight' });
  }
  if (!mauiHasMinimum) for (const match of text.matchAll(/new\s+Window\s*\(/g)) found.push({ id: 'window-min-size', file, line: lineOf(text, match.index), detail: 'MAUI Window without MinimumWidth and MinimumHeight' });
  return found;
}

const MESSAGES = {
  'focus-without-visible': 'A :focus rule draws an outline or shadow without :focus-visible, so mouse clicks show a ring.',
  'small-font': 'Font size is below 12 px.',
  'reduced-motion-missing': 'Stylesheet animates without a prefers-reduced-motion override.',
  'reduced-motion-uncovered': 'An animation or moving transition has no reduced-motion override that matches it. The override must name the same element, pseudo-element and modifiers with equal specificity, or use !important.',
  'looping-animation': 'Animation loops indefinitely. Remove it from reading and inventory surfaces, or give movement longer than five seconds a pause control (WCAG 2.2.2), and stop it in hidden tabs.',
  'window-min-size': 'Window is created without a minimum size, so the layout can be squeezed until it breaks.',
  'viewport-height': 'Uses 100vh without 100dvh. Mobile Safari counts its toolbars in vh, so full-height sections overflow.',
  'hsl-palette': 'Palette colours are defined in HSL, where equal lightness does not look equally light. Define them in OKLCH.',
  'gradient-interpolation': 'Gradient between colours without "in oklch" can turn grey in the middle. Write linear-gradient(90deg in oklch, ...).'
};

function inspectSources(root) {
  const files = sourceFiles(root), found = [];
  const read = file => { try { return fs.statSync(file).size <= MAX_BYTES ? fs.readFileSync(file, 'utf8') : ''; } catch { return ''; } };
  const texts = new Map(files.map(file => [file, read(file)]));
  const csharp = files.filter(file => file.endsWith('.cs'));
  const mauiHasMinimum = csharp.some(file => /\bMinimumWidth\b/.test(texts.get(file)) && /\bMinimumHeight\b/.test(texts.get(file)));
  for (const [file, text] of texts) {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    if (/\.s?css$/.test(file)) found.push(...cssFindings(relative, text));
    else found.push(...windowFindings(relative, text, mauiHasMinimum || !file.endsWith('.cs')));
  }
  const findings = Object.keys(MESSAGES).map(id => ({ id, message: MESSAGES[id], locations: found.filter(f => f.id === id).map(({ file, line, detail }) => ({ file, line, detail })) }))
    .filter(f => f.locations.length).map(f => ({ ...f, count: f.locations.length }));
  return { scanned: files.length, truncated: files.length >= MAX_FILES, findings };
}

module.exports = { inspectSources, cssFindings, windowFindings };
