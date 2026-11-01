'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
// Read only public routing fields from native configuration. Presence is not a
// sign-in or quota check, and credentials never leave the provider's own store.
function clineRoute({ env = process.env, read = fs.readFileSync } = {}) {
  try {
    const directory = env.CLINE_DIR || path.join(os.homedir(), '.cline');
    const data = env.CLINE_DATA_DIR || path.join(directory, 'data');
    const file = env.CLINE_PROVIDER_SETTINGS_PATH || path.join(data, 'settings', 'providers.json');
    const raw = read(file, 'utf8'); if (raw.length > 1024 * 1024) return null;
    const value = JSON.parse(raw), selected = value.providers?.[value.lastUsedProvider]?.settings;
    if (typeof selected?.provider !== 'string' || typeof selected?.model !== 'string' || !/^[\w.:/-]{1,120}$/.test(selected.model) || selected.model.startsWith('-')) return null;
    return { model: selected.model, nativeProvider: selected.provider,
      funding: selected.provider === 'cline' && selected.model.startsWith('cline-free/') ? 'free' : 'unknown', quota: 'unknown' };
  } catch { return null; }
}
module.exports = { clineRoute };
