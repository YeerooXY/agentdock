'use strict';
// Derived from the provider adapters in ./providers. Installation sources were
// reviewed 2026-10-25. `script` is the Windows PowerShell installer and
// `shScript` the vendor's macOS/Linux installer. Recipes are fixed in the
// adapters; the renderer can select IDs, never supply a package, download URL
// or shell command. Unrestricted flags were read from each CLI's --help on
// 2026-10-25. Pi has no approval prompts, so it has no unrestricted mode.
// Kiro has no local sandbox (only --cloud), so its unrestricted mode trusts
// file tools only and every shell command still asks.
const registry = require('./providers/index.cjs');
const catalog = registry.catalog;
const byId = new Map(catalog.map(x => [x.id, x]));
const providers = [...byId.keys(), 'shell', 'custom'];
module.exports = { catalog, byId, providers };
