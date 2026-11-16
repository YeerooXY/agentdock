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
        .filter(c => !/^(?:#(?:000|fff)(?:000|fff)?|rgba?\(\s*(?:0[ ,]+0[ ,]+0|255[ ,]+255[ ,]+255)\b[^)]*\))$/i.test(c));
      if (new Set(colours.map(c => c.toLowerCase())).size >= 2) found.push({ id: 'gradient-interpolation', line, detail: `${selector}: ${gradient[0].slice(0, 70)}` });
    }
  }
  if (/(?:transition|animation)(?:-duration)?\s*:\s*(?!none)[^;}]*\d/.test(css) && !css.includes('prefers-reduced-motion')) found.push({ id: 'reduced-motion-missing', line: 1, detail: 'transitions or animations without a prefers-reduced-motion block' });
  return found.map(f => ({ ...f, file }));
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
