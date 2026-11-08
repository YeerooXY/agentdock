'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { readJson } = require('./storage.cjs');
const { sessionPolicy } = require('./providers/index.cjs');

// Owns PTY callbacks and file-based provider events. The host exposes only the
// session maps, provider services and notifications needed by this runtime.
class SessionEventRuntime {
  constructor(host) { this.host = host; }

  bindAgent(session, { resumeId = null } = {}) {
    const h = this.host, { id, launchId, terminal } = session;
    terminal.onData(data => {
      session.buffer = (session.buffer + data).slice(-250000);
      session.lastOutputAt = Date.now();
      if (h.items.get(id) === session) h.emit('output', { id, launchId, data, sequence: ++session.sequence });
      else session.sequence++;
    });
    terminal.onExit(({ exitCode }) => {
      h.getHub()?.revoke(id, launchId); h.getDraftBridge()?.unregister(id, launchId);
      session.alive = false; session.exitCode = exitCode; session.updatedAt = Date.now();
      if (h.pendingStages.get(launchId) === session) h.pendingStages.delete(launchId);
      if (session.purpose === 'setup' && h.setupAccounts.get(session.accountId) === session) h.setupAccounts.delete(session.accountId);
      if (h.items.get(id) !== session) { session.state = 'ended'; session.exitResolve?.(); h.emit('changed'); return; }
      h.contexts.delete(id); session.state = 'ended';
      if (resumeId && exitCode !== 0 && !session.dismissed) {
        session.state = 'error'; session.restoreError = 'The saved conversation could not be reopened. Check the console output, then try again.';
      }
      if (session.purpose === 'login' && h.getAccounts()) h.getAccounts().markLoginCompleted(session.accountId, exitCode === 0);
      void h.getCredentialSwitch()?.release(session.provider);
      h.emit('changed');
    });
  }

  bindLogin(session, { switched = false } = {}) {
    const h = this.host, { id, launchId, accountId, terminal } = session;
    terminal.onData(data => { session.buffer = (session.buffer + data).slice(-250000); session.lastOutputAt = Date.now(); h.emit('output', { id, launchId, data, sequence: ++session.sequence }); });
    terminal.onExit(({ exitCode }) => {
      session.alive = false; session.state = 'ended'; session.exitCode = exitCode; session.updatedAt = Date.now();
      if (h.loginAccounts.get(accountId) === session) h.loginAccounts.delete(accountId);
      if (switched) {
        void h.getCredentialSwitch().completeLogin(session.provider, accountId).then(result => {
          h.getAccounts().markLoginCompleted(accountId, result.completed);
          if (!result.completed) session.loginError = result.duplicate ? 'This Google account is already added in Paddock. Sign in with a different account.' : 'Sign-in was not confirmed. Reopen this account and complete the provider sign-in.';
        }, () => { session.loginError = 'Paddock could not save this sign-in. Try again.'; })
          .finally(() => { void h.getCredentialSwitch().release(session.provider); h.emit('changed'); });
      } else if (exitCode === 0 && !session.dismissed) {
        const completed = h.getAccounts().hasCredentials(accountId, session.provider) !== false;
        h.getAccounts().markLoginCompleted(accountId, completed);
        if (!completed) session.loginError = 'Sign-in was not confirmed. Reopen this account and complete the provider sign-in.';
      }
      h.emit('changed');
    });
  }

  bindRemote(session) {
    const h = this.host, { id, terminal } = session;
    terminal.onData(data => { session.buffer = (session.buffer + data).slice(-250000); h.emit('output', { id, data, sequence: ++session.sequence }); });
    terminal.onExit(({ exitCode }) => {
      session.alive = false; session.state = 'ended'; session.exitCode = exitCode;
      if (!session.dismissed) { session.state = 'error'; session.restoreError = 'SSH disconnected. Reconnect to reattach the remote session.'; }
      session.updatedAt = Date.now(); h.emit('changed');
    });
  }

  scanEvents() {
    const h = this.host;
    let changed = false;
    for (const item of h.items.values()) {
      const policy = sessionPolicy(item.provider);
      if (item.taskId || ['login', 'setup'].includes(item.purpose) || !item.launchId || item.switching) continue;
      for (const kind of ['identity', 'state', 'usage']) {
        const file = path.join(h.root, 'events', `${item.id}.${item.launchId}.${kind}.json`);
        try {
          const stat = fs.statSync(file);
          if (h.eventTimes.get(file) === stat.mtimeMs) continue;
          h.eventTimes.set(file, stat.mtimeMs);
          const event = readJson(file, {});
          if (event.session !== item.id || event.launchId !== item.launchId) continue;
          if (kind === 'identity') {
            if (policy.identityEvents === 'none' || (policy.identityEvents === 'tagged-uuid' && event.provider !== item.provider) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(event.providerSessionId || '')) continue;
            h.codexIdentities.set(item.id, event.providerSessionId);
            if (item.providerSessionId !== event.providerSessionId) { item.providerSessionId = event.providerSessionId; delete item.model; delete item.modelId; delete item.effort; delete item.settingsAt; changed = true; }
            continue;
          }
          if (policy.identityEvents !== 'none' && h.codexIdentities.has(item.id) && event.providerSessionId && event.providerSessionId !== h.codexIdentities.get(item.id)) continue;
          if (event.providerSessionId && event.providerSessionId !== item.providerSessionId) {
            item.providerSessionId = event.providerSessionId;
            delete item.model; delete item.modelId; delete item.effort; delete item.settingsAt;
          }
          if (event.usage) item.usage = event.usage;
          if (event.messageUsage) h.emit('message-usage', { session: item, messages: [event.messageUsage] });
          if (event.model) { item.model = event.model; item.modelId = event.modelId || event.model; item.effort = event.effort || null; item.settingsAt = event.at; }
          if (event.contextPercent !== undefined) item.contextPercent = event.contextPercent;
          if (event.state && item.alive) {
            if (event.studyContinuation && !h.getHub()?.workbench?.completion?.canContinueStudy(item.id, event.turnId || null)) { changed = true; continue; }
            item.state = event.state; item.updatedAt = event.at;
            if (['ready', 'attention'].includes(event.state)) h.emit('attention', { ...h.listItem(item.id), turnId: event.turnId || null, summary: typeof event.summary === 'string' ? event.summary.slice(0, 200) : '' });
          }
          if (event.limits) h.emit('limits', event.limits);
          changed = true;
        } catch {}
      }
    }
    if (changed) h.emit('changed');
  }

  updateUsage(recent) {
    const h = this.host;
    for (const session of h.items.values()) {
      if (['login', 'setup'].includes(session.purpose) || (sessionPolicy(session.provider).recentUsageDefaultOnly && (session.accountId || `${session.provider}:default`) !== `${session.provider}:default`)) continue;
      const match = recent.find(x => x.id === session.providerSessionId);
      if (match?.usage) session.usage = match.usage;
      if (match?.model) { session.model = match.model; session.modelId = match.model; session.effort = match.effort || null; session.settingsAt = match.settingsAt; }
      if (match?.messages?.length) h.emit('message-usage', { session, messages: match.messages });
    }
  }
}

module.exports = { SessionEventRuntime };
