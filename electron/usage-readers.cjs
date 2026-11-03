'use strict';
// The usage reader map. Its keys must equal the providers whose adapters declare
// a usage reader, and the `usage` capability is derived from those same
// references, so a reader cannot exist without the capability or the reverse.
//
// Every reader receives the environment of the account it is reading. A CLI whose
// separate sign-in storage is not verified (copilot, cursor, antigravity, kiro,
// kimi, opencode) is only read for its default account; any other account of that
// CLI fails with `not-isolated` rather than showing the default account's numbers.
const path = require('node:path');
const { UsageError, usageEnvironment, readClaudeUsage, readCopilotUsage, readKiroUsage, readKimiUsage, readOpenCodeUsage, copilotExecutable } = require('./subscription-usage.cjs');
const { readAntigravityUsage } = require('./antigravity-usage.cjs');
const { readCursorUsage } = require('./cursor-usage.cjs');
const { readPiUsage } = require('./pi-usage.cjs');
const { usageSource, usageProviders } = require('./providers/index.cjs');

function buildUsageReaders({ executable, accounts, usageDirectory, getOpenCodeKey = () => null, codex, credentialSwitch = null, env = process.env, impl = {} }) {
  const read = { readClaudeUsage, readCopilotUsage, readKiroUsage, readKimiUsage, readOpenCodeUsage, readAntigravityUsage, readCursorUsage, readPiUsage, ...impl };
  const common = (choice, provider) => {
    if (choice.provider !== provider) throw new UsageError('unavailable', 'This account belongs to a different provider.');
    // Reject before building an environment: no other account's data may be read.
    if (!usageSource(provider)?.isolated && choice.id !== `${provider}:default`)
      throw new UsageError('not-isolated', 'Separate sign-in storage is not verified for this CLI. Only its default account is checked.');
    return { accountId: choice.id, env: usageEnvironment(accounts.environment(choice.id, provider, { baseEnv: env })) };
  };
  // A one-at-a-time CLI is read after switching to the account, and only while
  // no console of another account is open. It then returns to its default account.
  const switched = async (choice, provider, reader) => {
    if (!credentialSwitch?.handles(provider)) {
      // Without switching, the credential holds whichever account is signed in.
      if (choice.id !== `${provider}:default`) throw new UsageError('not-isolated', 'Account switching is unavailable, so only the default account is checked.');
      return reader();
    }
    try { return await credentialSwitch.withAccount(provider, choice.id, reader); }
    catch (error) {
      if (error instanceof UsageError) throw error;
      if (error.code === 'switch-busy') throw new UsageError('inactive', 'Another account of this CLI is open in a console. Showing the last reading.');
      throw new UsageError('unavailable', error.message);
    }
  };
  const sync = {
    codex: choice => codex(choice),
    claude: choice => read.readClaudeUsage({ executable: executable('claude'), cwd: usageDirectory, ...common(choice, 'claude') }),
    antigravity: choice => switched(choice, 'antigravity', () => read.readAntigravityUsage({ executable: executable('antigravity'), cwd: usageDirectory, ...common(choice, 'antigravity') })),
    copilot: choice => read.readCopilotUsage({ executable: copilotExecutable(executable('copilot')), cwd: usageDirectory, ...common(choice, 'copilot') }),
    cursor: choice => read.readCursorUsage({ executable: executable('cursor'), cwd: usageDirectory, ...common(choice, 'cursor') }),
    pi: choice => {
      const account = accounts.getAccount(choice.id, 'pi');
      return read.readPiUsage({ executable: executable('pi'), cwd: usageDirectory, ...common(choice, 'pi'), settingsPath: account.configDir ? path.join(account.configDir, 'settings.json') : undefined });
    },
    kiro: choice => read.readKiroUsage({ executable: executable('kiro'), cwd: path.join(usageDirectory, 'kiro'), ...common(choice, 'kiro') }),
    kimi: choice => read.readKimiUsage({ executable: executable('kimi'), cwd: usageDirectory, ...common(choice, 'kimi') }),
    opencode: choice => read.readOpenCodeUsage({ executable: executable('opencode'), cwd: usageDirectory, getKey: getOpenCodeKey, ...common(choice, 'opencode') })
  };
  // Guard failures reject instead of throwing synchronously.
  const readers = Object.fromEntries(Object.entries(sync).map(([id, reader]) => [id, async choice => reader(choice)]));
  const missing = usageProviders.filter(id => !Object.hasOwn(readers, id)), extra = Object.keys(readers).filter(id => !usageProviders.includes(id));
  if (missing.length || extra.length) throw new Error(`Usage readers and provider adapters disagree (missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}).`);
  return readers;
}

module.exports = { buildUsageReaders };
