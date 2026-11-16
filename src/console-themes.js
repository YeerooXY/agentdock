import { themeData, lightingStyles, starLevels, ansiPalette } from './generated/theme-data.js';

// Stable saved IDs and concrete xterm colors come from the shared manifest.
export { lightingStyles, starLevels };
export const consoleThemes = Object.fromEntries(themeData.map(({ id, ...theme }) => [id, theme]));
export const frameStyles = Object.entries(consoleThemes).map(([id, theme]) => [id, theme.label]);
export const consoleTheme = id => Object.hasOwn(consoleThemes, id) ? consoleThemes[id] : consoleThemes.classic;

export function terminalTheme(id) {
  const theme = consoleTheme(id);
  return {
    background: '#00000000', foreground: theme.foreground, cursor: theme.cursor,
    cursorAccent: theme.background, selectionBackground: theme.selection,
    selectionInactiveBackground: theme.selection, selectionForeground: '#ffffff',
    ...ansiPalette,
  };
}
