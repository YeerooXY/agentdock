'use strict';
// Main-process only. Reuse the selected native login in memory; never copy it
// into Paddock storage, renderer state, worker environments, arguments or logs.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
function failure(code, message) { return Object.assign(new Error(message), { code }); }
function validSecret(value) { return typeof value === 'string' && value.length > 0 && value.length <= 16384 && !/[\r\n]/.test(value); }
function openCodeAllowanceCredential({ home = os.homedir(), env = process.env, now = Date.now(), openDatabase } = {}) {
  const base = env.XDG_DATA_HOME && path.isAbsolute(env.XDG_DATA_HOME) ? env.XDG_DATA_HOME : path.join(home, '.local', 'share');
  const folder = path.join(base, 'opencode'), file = path.join(folder, 'opencode.db');
  if (fs.existsSync(file)) {
    let database, account;
    try {
      database = openDatabase ? openDatabase(file) : new (require('node:sqlite').DatabaseSync)(file, { readOnly: true });
      const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('account','account_state')").all();
      if (tables.length === 2) account = database.prepare('SELECT a.url, a.access_token, a.token_expiry, s.active_org_id FROM account_state s JOIN account a ON a.id=s.active_account_id WHERE s.id=1').get();
    } catch { throw failure('unavailable', 'OpenCode sign-in could not be read. Open OpenCode and refresh.'); }
    finally { database?.close(); }
    if (account) {
      if (!['https://opencode.ai', 'https://opencode.ai/console', 'https://console.opencode.ai'].includes(String(account.url).replace(/\/$/, '')))
        throw failure('unsupported', 'This OpenCode Console server has no connected allowance reader.');
      if (!validSecret(account.access_token) || !/^org_[A-Za-z0-9_-]{1,200}$/.test(account.active_org_id || ''))
        throw failure('sign-in', 'Select a signed-in workspace in OpenCode, then refresh.');
      if (!Number.isFinite(account.token_expiry) || account.token_expiry <= now)
        throw failure('sign-in', 'Refresh your OpenCode sign-in, then check allowance again.');
      return { key: account.access_token, orgId: account.active_org_id, source: 'OpenCode Console sign-in' };
    }
  }
  const auth = path.join(folder, 'auth.json');
  if (!fs.existsSync(auth)) return null;
  try {
    if (fs.statSync(auth).size > 256 * 1024) throw new Error('oversized');
    const entry = JSON.parse(fs.readFileSync(auth, 'utf8'))['opencode-go'];
    return entry?.type === 'api' && validSecret(entry.key) ? { key: entry.key, source: 'OpenCode Go native connection' } : null;
  } catch { throw failure('unavailable', 'OpenCode connection could not be read. Open OpenCode and refresh.'); }
}
module.exports = { openCodeAllowanceCredential };
