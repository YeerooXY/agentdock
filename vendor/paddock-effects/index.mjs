import './effects.js';

export const PaddockEffects = window.PaddockEffects;
export const themes = PaddockEffects.themes;
export const apply = (theme, starsEnabled = true) => PaddockEffects.apply(theme, starsEnabled);
export default PaddockEffects;

export const { mountSky, refreshSky, setSkyLevel } = PaddockEffects;
