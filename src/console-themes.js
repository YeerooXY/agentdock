// Stable identifiers preserve saved per-console choices. Terminal colors are
// concrete CSS colors: xterm does not resolve custom properties from the DOM.
// One theme drives the whole window: sidebar, buttons, settings and consoles.
// `sky` picks the ambient particle style and `opening` the launch effect.
export const consoleThemes = {
  classic: { label: 'Paddock', detail: 'Pastel glass · blooming rings', opening: 'bloom', sky: 'stars', a: '#89b4ff', b: '#f19cda', background: '#090b15', foreground: '#f0f0fb', cursor: '#f19cda', selection: '#6e548680' },
  'hot-pink': { label: 'Hot pink', detail: 'Neon tubes · hearts and glitter', opening: 'neon', sky: 'glitter', a: '#ff6ad5', b: '#c13cff', background: '#14060f', foreground: '#fff0fa', cursor: '#ff6ad5', selection: '#a13b7e80' },
  blue: { label: 'Blue', detail: 'Steel rails · lightning strike', opening: 'lightning', sky: 'stars', a: '#80c7ff', b: '#4f7bff', background: '#060d1b', foreground: '#edf5ff', cursor: '#80c7ff', selection: '#356ca480' },
  violet: { label: 'Violet', detail: 'Arcane arcs · spiral portal', opening: 'portal', sky: 'stars', a: '#c7a3ff', b: '#8f5bff', background: '#0e091b', foreground: '#f4edff', cursor: '#c7a3ff', selection: '#7650a280' },
  void: { label: 'Void', detail: 'Near black · collapsing star', opening: 'implode', sky: 'dust', a: '#7b6cff', b: '#35246e', background: '#020205', foreground: '#d9d6ea', cursor: '#9a8cff', selection: '#3a2f6e80' },
  redline: { label: 'Redline', detail: 'Black weave · red slash trim', opening: 'redline', sky: 'dust', a: '#ff2a3d', b: '#b0001a', background: '#040404', foreground: '#f4f4f4', cursor: '#ff2a3d', selection: '#8a001a80' },
  cyber: { label: 'Cyber', detail: 'Cut corners · glyph rain', opening: 'glitch', sky: 'data', a: '#00e1ff', b: '#cc55ff', background: '#080b17', foreground: '#f0f4fc', cursor: '#00e1ff', selection: '#007c9980' },
  icy: { label: 'Arctic', detail: 'Ice facets · spreading frost', opening: 'frost', sky: 'snow', a: '#7fe9ff', b: '#4f9dff', background: '#05121e', foreground: '#edfaff', cursor: '#7fe9ff', selection: '#287ba580' },
  fiery: { label: 'Inferno', detail: 'Ember glow · fireball blast', opening: 'explosion', sky: 'embers', a: '#ff6a2b', b: '#ffb700', background: '#160906', foreground: '#fff2ec', cursor: '#ffb700', selection: '#a64d2680' },
  gamer: { label: 'RGB', detail: 'Spectrum edge · rainbow shockwave', opening: 'spectrum', sky: 'rainbow', a: '#73eaff', b: '#ff5db4', background: '#090c12', foreground: '#ffffff', cursor: '#73eaff', selection: '#6553a580' },
  normal: { label: 'Plain', detail: 'Quiet frame · soft fade', opening: 'soft', sky: 'stars', a: '#b9c6d8', b: '#8392a8', background: '#090b10', foreground: '#e7ebf2', cursor: '#b9c6d8', selection: '#52658280' },
};

// Keyboard-style lighting. Every mode runs on one shared clock so all
// consoles, the sidebar edge and the accents stay in phase.
export const lightingStyles = [
  ['static', 'Static'], ['breathe', 'Breathing'], ['wave', 'Wave'], ['spectrum', 'Spectrum cycle'], ['reactive', 'Reactive'],
];
export const starLevels = ['Off', 'Few', 'Some', 'Many', 'Galaxy'];

export const frameStyles = Object.entries(consoleThemes).map(([id, theme]) => [id, theme.label]);
export const consoleTheme = id => Object.hasOwn(consoleThemes, id) ? consoleThemes[id] : consoleThemes.classic;

export function terminalTheme(id) {
  const theme = consoleTheme(id);
  return {
    background: '#00000000', foreground: theme.foreground, cursor: theme.cursor,
    cursorAccent: theme.background, selectionBackground: theme.selection,
    selectionInactiveBackground: theme.selection, selectionForeground: '#ffffff',
    black: '#1b2126', red: '#ef8a86', green: '#b9e888', yellow: '#e8c57e',
    blue: '#8daef2', magenta: '#c0a2f5', cyan: '#89ccc4', white: '#e1e8e3',
    brightBlack: '#9da9be', brightRed: '#ffa1b0', brightGreen: '#a2f5c5',
    brightYellow: '#ffe6a3', brightBlue: '#b0ceff', brightMagenta: '#edc4ff',
    brightCyan: '#aff5ff', brightWhite: '#ffffff',
  };
}
