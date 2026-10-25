export const settingsSections = [
  ['general-settings', 'General'], ['appearance', 'Appearance'],
  ['console-settings', 'Consoles'], ['devices', 'Devices'],
  ['api-settings', 'API'], ['tools', 'Tools'],
  ['instructions', 'Instructions'],
];
// Keys are entered on the tool or API that needs them; old links to the
// Keys page open Tools, which lists saved keys.
export const isSettingsPage = page => page === 'settings' || page === 'vault' || settingsSections.some(([id]) => id === page);
// Settings open as a separate layer over the app: categories on the left,
// one column of settings and a close button that also answers to Esc.
export function settingsShell(page, content, closeIcon = '×', theme = 'classic') {
  if (page === 'settings') page = 'general-settings';
  const name = settingsSections.find(([id]) => id === page)?.[1] || 'General';
  const body = content.replaceAll('<h1>', '<h2>').replaceAll('</h1>', '</h2>');
  // The backdrop carries the theme texture and its moving sky; the menu,
  // settings and close button form one centered group above it.
  return `<div class="settings-overlay settings-workspace" data-frame="${theme}"><div class="settings-backdrop" aria-hidden="true"></div><div class="settings-stage"><div class="settings-columns"><div class="settings-rail"><nav class="settings-navigation" aria-label="Settings categories"><h2 class="settings-rail-title">Settings</h2>${settingsSections.map(([id, label]) => `<button data-page="${id}" ${id === page ? 'aria-current="page" class="selected"' : ''}>${label}</button>`).join('')}</nav></div><section class="settings-content" aria-label="${name} settings"><h1 class="settings-title">${name}</h1>${body}</section><div class="settings-close"><button type="button" data-action="close-settings" aria-label="Close settings" title="Close settings (Esc)">${closeIcon}</button></div></div></div></div>`;
}
