// Applies the theme, lighting and sky settings from state to the document.
import { mountSky, setSkyLevel } from '../console-sky.js';
import { gridSize } from '../console/panels.js';

export function starLevel(settings) {
  const value = settings.starDensity;
  return Number.isInteger(value) && value >= 0 && value <= 4 ? value : settings.panelStars === false ? 0 : 2;
}
export function ensureBackdropSky(region, slot, settings) {
  region.dataset.frame = settings.trimStyle || 'classic';
  if (region.id === 'content') {
    let layer = region.querySelector(':scope > .page-background-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'page-background-layer';
      layer.setAttribute('aria-hidden', 'true');
      layer.innerHTML = '<span class="page-backdrop"></span>';
      region.prepend(layer);
    }
    mountSky(layer, slot);
    return;
  }
  if (!region.querySelector(':scope > .page-backdrop')) region.insertAdjacentHTML('afterbegin', '<span class="page-backdrop" aria-hidden="true"></span>');
  mountSky(region, slot);
}
export function applyTheme(state, { settingsOpen, appearance, lightingChanged }) {
  const settings = state.settings, body = document.body;
  body.style.setProperty('--grid-columns', gridSize(state).columns); body.style.setProperty('--grid-rows', gridSize(state).rows);
  body.dataset.trim = settings.trimStyle || 'classic';
  ensureBackdropSky(document.querySelector('#sidebar'), 56, settings);
  if (!settingsOpen) ensureBackdropSky(document.querySelector('#content'), 57, settings);
  ensureBackdropSky(document.querySelector('#consoles-page'), 55, settings);
  const settingsOverlay = document.querySelector('.settings-overlay');
  if (settingsOverlay) settingsOverlay.dataset.frame = settings.trimStyle || 'classic';
  body.dataset.stars = starLevel(settings) ? 'on' : 'off';
  body.dataset.lighting = settings.lighting || 'static';
  body.dataset.textures = settings.themeTextures === false ? 'off' : 'on';
  body.dataset.speed = settings.lightingSpeed || 'normal';
  body.dataset.ambient = settings.ambientMotion === false ? 'off' : 'on';
  setSkyLevel(starLevel(settings), settings.ambientMotion !== false);
  body.dataset.openingMotion = settings.launchEffect === false ? 'off' : 'on';
  appearance.syncSettings();
  const trims = [settings.trimStyle, ...Object.values(settings.slotTrims || {})];
  body.dataset.rgb = trims.includes('gamer') ? 'on' : 'off';
  body.dataset.pulse = 'off';
  lightingChanged();
  body.style.setProperty('--trim-width', (settings.trimWidth || 1) + 'px');
}
