'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { validateManifest, renderJavaScript, renderDart, renderCommonJS, renderPaletteCss } = require('../scripts/build-theme-data.cjs');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'themes', 'manifest.json'), 'utf8'));

test('theme manifest validates and renders deterministic CSS, JS, CommonJS and Dart data', () => {
  assert.doesNotThrow(() => validateManifest(manifest));
  const css = renderPaletteCss(manifest);
  const javascript = renderJavaScript(manifest);
  const commonJs = renderCommonJS(manifest);
  const dart = renderDart(manifest);
  assert.equal(css, renderPaletteCss(manifest));
  assert.equal(javascript, renderJavaScript(manifest));
  assert.equal(commonJs, renderCommonJS(manifest));
  assert.equal(dart, renderDart(manifest));
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'src', 'theme-palette.css'), 'utf8'), css);
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'src', 'generated', 'theme-data.js'), 'utf8'), javascript);
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'mobile', 'lib', 'generated', 'theme_data.dart'), 'utf8'), dart);
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'electron', 'generated', 'theme-data.cjs'), 'utf8'), commonJs);
  assert.match(javascript, /export const mobileThemeOverrides =/);
  assert.match(dart, /const mobileThemeOverrides =/);
  assert.match(css, /body\[data-trim=fiery\]:not\(\[data-lighting=spectrum\]\) \{ --accent-blue:#ffb700; --accent-pink:#ff6a2b \}/);
  assert.match(css, /body\[data-trim=redline\]:not\(\[data-lighting=spectrum\]\) \{ --accent-blue:#ff4d5e; --accent-pink:#d10022 \}/);
  assert.match(css, /\[data-frame=icy\] \{ --frame-a:#7fe9ff; --frame-b:#4f9dff \}/);
  assert.match(css, /\[data-frame=fiery\] \{ --frame-a:#ff6a2b; --frame-b:#ffb700 \}/);
  assert.ok(renderDart({ ...manifest, starLevels: ['Dollar $ is literal'] }).includes('Dollar \\$ is literal'));
});

test('desktop canvas registry covers manifest effects within duration and flash limits', async () => {
  const { pathToFileURL } = require('node:url');
  const { openings, stateEffects } = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'effects', 'registry.js')));
  for (const theme of manifest.themes) assert.equal(typeof openings[theme.opening]?.draw, 'function', theme.id);
  for (const effect of [...Object.values(openings), ...Object.values(stateEffects)]) {
    assert.ok(effect.duration > 0 && effect.duration <= 1600);
    assert.ok((effect.flashes || 0) <= 2);
  }
});

test('theme manifest rejects unknown fields, invalid colors, duplicate IDs and unknown effects', () => {
  const withChange = change => {
    const copy = structuredClone(manifest);
    change(copy);
    return copy;
  };
  assert.throws(() => validateManifest(withChange(data => { data.unexpected = true; })), /unknown field.*unexpected/);
  assert.throws(() => validateManifest(withChange(data => { data.themes[0].background = 'navy'; })), /#RRGGBB/);
  assert.throws(() => validateManifest(withChange(data => { data.themes[1].id = data.themes[0].id; })), /duplicate theme id/);
  assert.throws(() => validateManifest(withChange(data => { data.themes[0].opening = 'unknown'; })), /unknown effect/);
  assert.throws(() => validateManifest(withChange(data => { data.desktopOverrides.frame.icy.a = 'cyan'; })), /#RRGGBB/);
  assert.throws(() => validateManifest(withChange(data => { data.desktopOverrides.frame.unknown = { a: '#ffffff', b: '#000000' }; })), /unknown theme/);
});
