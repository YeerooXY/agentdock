'use strict';
// OpenRouter allowance for the Pi account. The OpenRouter credential comes from
// Pi's own non-refreshing auth check, stays in this function's memory and is
// sent only to the exact read-only key and credits endpoints. It is never
// logged, persisted, returned or included in an error.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { UsageError, runUsageCommand } = require('./subscription-usage.cjs');
const { normalizeOpenRouterAllowance } = require('./route-allowance.cjs');
const { piRoute } = require('./pi-worker.cjs');

const BASE = 'https://openrouter.ai/api/v1';
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,199}$/;
const SMALL = 1024 * 1024, CATALOG = 16 * 1024 * 1024;
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
const FREE = { pricing: { prompt: '0', completion: '0' } };

function authCredential(stdout) {
  const text = String(stdout).trim();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {
    for (const line of text.split(/\r?\n/).reverse()) { try { parsed = JSON.parse(line); break; } catch {} }
  }
  const credential = record(parsed)?.credentials;
  // Printable ASCII without spaces: anything else could split the header.
  if (typeof credential !== 'string' || !/^[\x21-\x7e]{8,4096}$/.test(credential)) throw new UsageError('sign-in', 'Sign in to OpenRouter in Pi, then refresh.');
  return credential;
}
function selectedRoute({ model, settingsPath, env = process.env } = {}) {
  if (model) { try { return piRoute(model); } catch { return null; } }
  const home = env.USERPROFILE || env.HOME || os.homedir();
  const file = settingsPath || path.join(home, '.pi', 'agent', 'settings.json');
  let settings;
  try {
    if (fs.statSync(file).size > 256 * 1024) return null;
    settings = record(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch { return null; }
  // Only these two whitelisted fields are read; everything else is ignored.
  const provider = typeof settings?.defaultProvider === 'string' ? settings.defaultProvider.trim() : '';
  const id = typeof settings?.defaultModel === 'string' ? settings.defaultModel.trim() : '';
  if (!id || !SAFE_ID.test(id) || (provider && (!SAFE_ID.test(provider) || provider.includes('/')))) return null;
  return provider ? { provider: provider.toLowerCase(), model: id } : piRoute(id);
}
async function getJson(fetchImpl, url, { credential, timeoutMs, limit }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json', ...(credential ? { Authorization: 'Bearer ' + credential } : {}) }, redirect: 'error', signal: controller.signal });
    if (response.status === 401 || response.status === 403) throw new UsageError('sign-in', 'OpenRouter rejected the Pi sign-in. Sign in again in Pi, then refresh.');
    if (response.status === 429) throw new UsageError('limited', 'OpenRouter limited usage checks. Try again later.');
    if (!response.ok || response.redirected) throw new UsageError('unavailable', 'OpenRouter could not return current allowance.');
    let size = 0; const chunks = [];
    for await (const chunk of response.body || []) {
      const bytes = Buffer.from(chunk); size += bytes.length;
      if (size > limit) throw new UsageError('unavailable', 'The allowance response was too large.');
      chunks.push(bytes);
    }
    return record(JSON.parse(Buffer.concat(chunks).toString()));
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw controller.signal.aborted ? new UsageError('timeout', 'The usage check timed out. Try again.') : new UsageError('unavailable', 'OpenRouter could not return current allowance.');
  } finally { clearTimeout(timer); controller.abort(); }
}
function freeAlternatives(catalog, limit = 12) {
  const out = [];
  for (const entry of catalog) {
    if (out.length >= limit) break;
    if (!record(entry) || typeof entry.id !== 'string' || !SAFE_ID.test(entry.id)) continue;
    if (normalizeOpenRouterAllowance(null, null, entry, null).funding !== 'free') continue;
    const request = Number(entry.pricing?.request);
    if (Number.isFinite(request) && request > 0) continue;
    if (!Array.isArray(entry.supported_parameters) || !entry.supported_parameters.includes('tools')) continue;
    const contextLength = Number.isSafeInteger(entry.context_length) && entry.context_length > 0 ? entry.context_length : null;
    out.push({ provider: 'openrouter', model: entry.id, route: 'openrouter/' + entry.id, contextLength });
  }
  return out;
}

async function readPiUsage({ executable, accountId = 'pi:default', cwd, env, run, fetchImpl = fetch, timeoutMs = 20000, model, settingsPath, now = Date.now } = {}) {
  if (!executable) throw new UsageError('not-installed', 'Install Pi to read its OpenRouter allowance.');
  const stdout = await runUsageCommand(executable, ['auth', 'check', '--provider', 'openrouter', '--json', '--credentials', '--no-refresh'], { cwd, env, run, timeoutMs });
  let credential = authCredential(stdout);
  const route = selectedRoute({ model, settingsPath, env: env || process.env });
  const onOpenRouter = route?.provider === 'openrouter';
  let key, credits = null, catalog = null;
  try {
    [key, credits] = await Promise.all([
      getJson(fetchImpl, BASE + '/key', { credential, timeoutMs, limit: SMALL }),
      // A failed credits reading leaves the balance unknown; it is never zero.
      getJson(fetchImpl, BASE + '/credits', { credential, timeoutMs, limit: SMALL }).catch(() => null)]);
  } finally { credential = null; }
  // The public catalog needs no credential.
  try { catalog = (await getJson(fetchImpl, BASE + '/models', { timeoutMs, limit: CATALOG }))?.data; } catch { catalog = null; }
  if (!Array.isArray(catalog)) catalog = null;
  const observedAt = now();
  const keyData = record(key?.data), creditsData = record(credits?.data);
  if (!keyData) throw new UsageError('unavailable', 'OpenRouter returned no readable allowance.');
  const entry = onOpenRouter && catalog ? catalog.find(item => record(item) && item.id === route.model) || null : null;
  // Account-level free request window, independent of the selected model.
  const account = normalizeOpenRouterAllowance(keyData, null, FREE, observedAt);
  // The selected route is classified only from its own catalog pricing; the
  // account's free-tier flag never makes a priced model free.
  const selected = normalizeOpenRouterAllowance(keyData, creditsData, entry, observedAt);
  const windows = account.windows.map(window => ({ ...window, modelGroup: 'openrouter:free', resetsAt: null }));
  return [{ id: accountId, accountId, provider: 'pi', name: 'Pi', source: 'OpenRouter key and credits API', observedAt, windows,
    route: route ? { provider: route.provider, model: route.model } : null,
    funding: selected.funding, modelAllowed: selected.modelAllowed, remainingCredits: selected.remainingCredits,
    creditsKnown: !!creditsData, catalogKnown: !!catalog,
    freeAlternatives: catalog ? freeAlternatives(catalog) : [] }];
}
module.exports = { readPiUsage, authCredential, selectedRoute, freeAlternatives };
