#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const INPUT = path.join(ROOT, 'themes', 'manifest.json');
const OUTPUTS = [
  [path.join(ROOT, 'src', 'generated', 'theme-data.js'), renderJavaScript],
  [path.join(ROOT, 'mobile', 'lib', 'generated', 'theme_data.dart'), renderDart],
  [path.join(ROOT, 'electron', 'generated', 'theme-data.cjs'), renderCommonJS],
  [path.join(ROOT, 'src', 'theme-palette.css'), renderPaletteCss],
];
const THEME_FIELDS = ['id', 'label', 'detail', 'opening', 'sky', 'a', 'b', 'background', 'foreground', 'cursor', 'selection'];
const OPENINGS = new Set(['soft', 'bloom', 'neon', 'lightning', 'portal', 'implode', 'redline', 'glitch', 'frost', 'explosion', 'spectrum']);
const SKIES = new Set(['stars', 'glitter', 'dust', 'streaks', 'data', 'snow', 'embers', 'rainbow']);
const ANSI_FIELDS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'];
const HEX_COLOR = /^#[\da-f]{6}(?:[\da-f]{2})?$/i;

function fail(message) {
  throw new Error(`Invalid theme manifest: ${message}`);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value);
  const unknown = actual.filter(key => !expected.includes(key));
  const missing = expected.filter(key => !Object.hasOwn(value, key));
  if (unknown.length) fail(`${label} has unknown field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`);
  if (missing.length) fail(`${label} is missing field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`);
}

function string(value, label) {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a non-empty string`);
}

function color(value, label) {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) fail(`${label} must be a #RRGGBB or #RRGGBBAA color`);
}

function validateManifest(data) {
  exactKeys(data, ['themes', 'lighting', 'starLevels', 'ansi', 'mobileOverrides', 'desktopOverrides'], 'root');
  if (!Array.isArray(data.themes) || data.themes.length === 0) fail('themes must be a non-empty array');
  const ids = new Set();
  data.themes.forEach((theme, index) => {
    exactKeys(theme, THEME_FIELDS, `themes[${index}]`);
    string(theme.id, `themes[${index}].id`);
    if (!/^[a-z][a-z0-9-]*$/.test(theme.id)) fail(`themes[${index}].id is not a stable identifier`);
    if (ids.has(theme.id)) fail(`duplicate theme id "${theme.id}"`);
    ids.add(theme.id);
    for (const field of ['label', 'detail']) string(theme[field], `themes[${index}].${field}`);
    if (!OPENINGS.has(theme.opening)) fail(`themes[${index}].opening references unknown effect "${theme.opening}"`);
    if (!SKIES.has(theme.sky)) fail(`themes[${index}].sky references unknown effect "${theme.sky}"`);
    for (const field of ['a', 'b', 'background', 'foreground', 'cursor', 'selection']) color(theme[field], `themes[${index}].${field}`);
  });
  if (!ids.has('classic')) fail('themes must include the classic fallback');

  if (!Array.isArray(data.lighting) || data.lighting.length === 0) fail('lighting must be a non-empty array');
  const lightingIds = new Set();
  data.lighting.forEach((entry, index) => {
    if (!Array.isArray(entry) || entry.length !== 2) fail(`lighting[${index}] must be a two-item [id, label] array`);
    entry.forEach((value, part) => string(value, `lighting[${index}][${part}]`));
    if (lightingIds.has(entry[0])) fail(`duplicate lighting id "${entry[0]}"`);
    lightingIds.add(entry[0]);
  });
  if (!Array.isArray(data.starLevels) || data.starLevels.length === 0) fail('starLevels must be a non-empty array');
  data.starLevels.forEach((value, index) => string(value, `starLevels[${index}]`));

  exactKeys(data.ansi, ANSI_FIELDS, 'ansi');
  for (const field of ANSI_FIELDS) color(data.ansi[field], `ansi.${field}`);

  exactKeys(data.mobileOverrides, ['terminalBackground', 'cursor', 'selection', 'search'], 'mobileOverrides');
  if (data.mobileOverrides.terminalBackground !== 'background') fail('mobileOverrides.terminalBackground must reference background');
  const cursor = data.mobileOverrides.cursor;
  if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor) || !Object.hasOwn(cursor, 'default')) fail('mobileOverrides.cursor requires a default');
  for (const [id, role] of Object.entries(cursor)) {
    if (id !== 'default' && !ids.has(id)) fail(`mobileOverrides.cursor references unknown theme ${id}`);
    if (!['primary', 'secondary'].includes(role)) fail('mobileOverrides.cursor requires primary or secondary');
  }
  exactKeys(data.mobileOverrides.selection, ['source', 'alpha'], 'mobileOverrides.selection');
  if (!['primary', 'secondary'].includes(data.mobileOverrides.selection.source) ||
      typeof data.mobileOverrides.selection.alpha !== 'number' ||
      !Number.isFinite(data.mobileOverrides.selection.alpha) ||
      data.mobileOverrides.selection.alpha < 0 || data.mobileOverrides.selection.alpha > 1) {
    fail('mobileOverrides.selection requires a primary/secondary source and alpha from 0 to 1');
  }
  exactKeys(data.mobileOverrides.search, ['hitBackground', 'hitBackgroundCurrent', 'hitForeground'], 'mobileOverrides.search');
  for (const field of ['hitBackground', 'hitBackgroundCurrent', 'hitForeground']) {
    color(data.mobileOverrides.search[field], `mobileOverrides.search.${field}`);
  }

  exactKeys(data.desktopOverrides, ['accent', 'frame'], 'desktopOverrides');
  for (const group of ['accent', 'frame']) {
    const overrides = data.desktopOverrides[group];
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
      fail(`desktopOverrides.${group} must be an object`);
    }
    for (const [id, pair] of Object.entries(overrides)) {
      if (!ids.has(id)) fail(`desktopOverrides.${group} references unknown theme ${id}`);
      if (id === 'gamer') fail(`desktopOverrides.${group} cannot override animated gamer colors`);
      exactKeys(pair, ['a', 'b'], `desktopOverrides.${group}.${id}`);
      color(pair.a, `desktopOverrides.${group}.${id}.a`);
      color(pair.b, `desktopOverrides.${group}.${id}.b`);
    }
  }
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

function renderJavaScript(data) {
  return [
    '// Generated by scripts/build-theme-data.cjs. Do not edit by hand.',
    `export const themeData = ${json(data.themes)};`,
    `export const lightingStyles = ${json(data.lighting)};`,
    `export const starLevels = ${json(data.starLevels)};`,
    `export const ansiPalette = ${json(data.ansi)};`,
    `export const mobileThemeOverrides = ${json(data.mobileOverrides)};`,
    '',
  ].join('\n');
}

function renderDart(data) {
  const dartJson = value => json(value).replace(/\$/g, '\\$');
  return [
    '// Generated by scripts/build-theme-data.cjs. Do not edit by hand.',
    `enum ConsoleOpening { ${[...OPENINGS].join(', ')} }`,
    `enum SkyKind { ${[...SKIES].join(', ')} }`,
    `const themeData = <Map<String, String>>${dartJson(data.themes)};`,
    `const lightingStyles = <String, String>${dartJson(Object.fromEntries(data.lighting))};`,
    `const starLevels = <String>${dartJson(data.starLevels)};`,
    `const ansiPalette = <String, String>${dartJson(data.ansi)};`,
    `const mobileThemeOverrides = <String, Object?>${dartJson(data.mobileOverrides)};`,
    '',
  ].join('\n');
}

function renderCommonJS(data) {
  return `'use strict';\n// Generated by scripts/build-theme-data.cjs. Do not edit by hand.\nmodule.exports = ${json({ themeData: data.themes, lightingStyles: data.lighting })};\n`;
}

function renderPaletteCss(data) {
  const lines = ['/* Generated by scripts/build-theme-data.cjs. Do not edit by hand. */'];
  const fallback = data.themes.find(theme => theme.id === 'classic');
  lines.push(`:root { --accent-blue:${fallback.a}; --accent-pink:${fallback.b} }`);
  lines.push('');
  for (const theme of data.themes) {
    if (theme.id === 'gamer') continue;
    const accent = data.desktopOverrides.accent[theme.id] || theme;
    lines.push(`body[data-trim=${theme.id}]:not([data-lighting=spectrum]) { --accent-blue:${accent.a}; --accent-pink:${accent.b} }`);
  }
  lines.push('');
  for (const theme of data.themes) {
    if (theme.id === 'gamer') continue;
    const frame = data.desktopOverrides.frame[theme.id] || theme;
    lines.push(`[data-frame=${theme.id}] { --frame-a:${frame.a}; --frame-b:${frame.b} }`);
  }
  return `${lines.join('\n')}\n`;
}

function main(args) {
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    throw new Error('Usage: node scripts/build-theme-data.cjs [--check]');
  }
  const manifest = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  validateManifest(manifest);
  const check = args[0] === '--check';
  const drift = [];
  for (const [file, render] of OUTPUTS) {
    const expected = render(manifest);
    if (check) {
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== expected) drift.push(path.relative(ROOT, file));
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, expected, 'utf8');
    }
  }
  if (drift.length) throw new Error(`Generated theme data is out of date: ${drift.join(', ')}. Run node scripts/build-theme-data.cjs.`);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { validateManifest, renderJavaScript, renderDart, renderCommonJS, renderPaletteCss };
