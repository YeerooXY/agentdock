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
// a scrolling content pane and a close button that also answers to Esc.
export function settingsShell(page, content, closeIcon = '×', theme = 'classic') {
  if (page === 'settings') page = 'general-settings';
  const name = settingsSections.find(([id]) => id === page)?.[1] || 'General';
  const body = content.replaceAll('<h1>', '<h2>').replaceAll('</h1>', '</h2>');
  return `<div class="settings-overlay settings-workspace" data-frame="${theme}"><div class="settings-backdrop" aria-hidden="true"></div><header class="settings-header"><div><h1 class="settings-title">Settings</h1><p>${name}</p></div><div class="settings-close"><button type="button" data-action="close-settings" aria-label="Close settings" title="Close settings (Esc)">${closeIcon}</button></div></header><div class="settings-columns"><div class="settings-rail"><nav class="settings-navigation" aria-label="Settings categories"><h2 class="settings-rail-title sr-only">Categories</h2>${settingsSections.map(([id, label]) => `<button data-page="${id}" ${id === page ? 'aria-current="page" class="selected"' : ''}>${label}</button>`).join('')}</nav></div><div class="settings-stage" tabindex="0" role="region" aria-label="${name} settings"><section class="settings-content" aria-label="${name} settings">${body}</section></div></div></div>`;
}
