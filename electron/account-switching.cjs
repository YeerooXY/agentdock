'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const { readJson } = require('./storage.cjs');
const { settingsAdapter } = require('./provider-settings.cjs');
const { copyConversation, findConversation } = require('./account-history.cjs');
const { resolveSelection } = require('./model-selection.cjs');
const { hasClaudeEditorContext, validateDraftText } = require('./draft-policy.cjs');
const { ordinaryConsole } = require('./worker-sessions.cjs');
const { publicSession, plainTerminalText } = require('./session-launch.cjs');

// Account and model changes stage a complete replacement before touching the
// current PTY. Every failure path revokes only staged credentials and preserves
// the source console, its launch identity and its unsent draft.
class AccountSwitching {
  constructor(host) { this.host = host; }

  async createSetupConsole({ id, launchId, targetAccountId } = {}) {
    const h = this.host;
    ordinaryConsole(h.items.get(id));
    const source = h.items.get(id);
    if (!source?.alive || source.dismissed || source.purpose !== 'agent' || source.launchId !== launchId || source.switching || h.isBusy(id)) {
      throw new Error('This console changed. Select it again before setting up the account.');
    }
    if (!h.getAccounts() || targetAccountId === source.accountId || !h.getAccounts().choices(source.provider).some(choice => choice.id === targetAccountId && (!choice.profile || !!choice.loginCompletedAt))) {
      throw new Error('Choose a signed-in account for this provider before setting up its folder access.');
    }
    const target = h.getAccounts().getAccount(targetAccountId, source.provider);
    if (target.profile && !target.loginCompletedAt) throw new Error(`Sign in to ${target.label} before setting up its folder access.`);
    if (h.setupAccounts.has(target.id) || h.loginAccounts.has(target.id)) throw new Error(`A sign-in or setup console is already open for ${target.label}.`);
    const reservation = { id, launchId, targetAccountId };
    h.setupAccounts.set(target.id, reservation);
    try {
      const opened = await h.launcher.createOne({
        provider: source.provider, cwd: source.cwd, name: `Set up ${target.label}`, nameMode: 'custom',
        permissions: source.permissions, model: source.launchModel
      }, {
        accountId: target.id, purpose: 'setup',
        cancelCheck: () => h.items.get(id) !== source || !source.alive || source.dismissed || source.launchId !== launchId
      });
      const setup = h.items.get(opened.id);
      if (!setup?.alive || h.setupAccounts.get(target.id) !== reservation) throw new Error('The setup console could not be opened. The original console is still running.');
      h.setupAccounts.set(target.id, setup);
      h.emit('changed');
      return opened;
    } catch (error) {
      if (h.setupAccounts.get(target.id) === reservation) h.setupAccounts.delete(target.id);
      throw error;
    }
  }

  async waitForOutputIdle(session, { afterSequence = -1, timeout = 15000, quietMs = this.host.getDraftQuietMs() } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (!session.alive) throw new Error('The CLI process ended before the composer could be checked. Keep the original console open.');
      if (session.sequence > afterSequence && session.lastOutputAt && Date.now() - session.lastOutputAt >= quietMs) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('The CLI composer did not reach a stable prompt. Keep the original console open and try again.');
  }

  // The CLI can ask before it resumes a large conversation. Choosing its default
  // Resume is what the owner already confirmed when applying the change.
  async answerResumePrompt(session, strategy) {
    const answer = strategy.resumePromptAnswer(plainTerminalText(session.buffer.slice(-6000)));
    if (!answer) return;
    const sequence = session.sequence;
    session.terminal.write(answer);
    await this.waitForOutputIdle(session, { afterSequence: sequence });
  }

  async nativeDraft(session, mode, text) {
    const pending = this.host.getDraftBridge().request(session.id, session.launchId, mode, text);
    session.terminal.write('\x07');
    return pending;
  }

  validateSwitchDraft(text, provider) { return validateDraftText(text, provider); }

  async removeNativeDraftMarker(session, marker, { timeout = 15000 } = {}) {
    const deadline = Date.now() + timeout;
    while (!plainTerminalText(session.buffer).replace(/\s/g, '').includes(marker)) {
      if (!session.alive) throw new Error('The CLI closed while Paddock checked the draft. Keep this console open.');
      if (Date.now() >= deadline) throw new Error('The CLI did not display the draft verification marker. Keep the original console open.');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await this.waitForOutputIdle(session);
    const deleteSequence = session.sequence;
    session.terminal.write('\x7f'.repeat(marker.length));
    await this.waitForOutputIdle(session, { afterSequence: deleteSequence });
  }

  async captureNativeDraft(session, { dismissCodexStatusPopup = false } = {}) {
    if (!session.draftSupported || !this.host.getDraftBridge()) throw new Error('Paddock could not verify the CLI composer draft. Keep the current console open.');
    const captureOnce = async () => {
      await this.waitForOutputIdle(session);
      const marker = `PDK${crypto.randomUUID().replaceAll('-', '')}`;
      const text = await this.nativeDraft(session, 'capture', marker);
      this.validateSwitchDraft(text, session.provider);
      await this.removeNativeDraftMarker(session, marker);
      if (dismissCodexStatusPopup && text === '/status') {
        const popupSequence = session.sequence;
        session.terminal.write('\x1b');
        await this.waitForOutputIdle(session, { afterSequence: popupSequence });
      }
      return text;
    };
    const first = await captureOnce();
    this.validateSwitchDraft(first, session.provider);
    const second = await captureOnce();
    this.validateSwitchDraft(second, session.provider);
    if (second !== first) throw new Error('The draft changed while Paddock checked it. Keep the current console open.');
    return second;
  }

  // Late-bound so a strategy always reaches this instance's current methods.
  resumeDependencies() {
    return {
      awaitEventIdentity: (...args) => this.awaitEventIdentity(...args),
      waitForOutputIdle: (...args) => this.waitForOutputIdle(...args),
      captureNativeDraft: (...args) => this.captureNativeDraft(...args)
    };
  }

  async awaitResumeIdentity(session, expectedId, timeout = 20000) {
    return settingsAdapter(session.provider).confirmResumeIdentity(this.resumeDependencies(), session, expectedId, timeout);
  }

  async awaitEventIdentity(session, expectedId, timeout = 20000) {
    const h = this.host;
    const stateFile = path.join(h.root, 'events', `${session.id}.${session.launchId}.state.json`);
    const usageFile = path.join(h.root, 'events', `${session.id}.${session.launchId}.usage.json`);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (!session.alive) throw new Error('The selected conversation could not be reopened. Keep the original console open.');
      const state = readJson(stateFile, {}), usage = readJson(usageFile, {});
      for (const event of [state, usage]) if (event.session === session.id && event.launchId === session.launchId && event.accountId === session.accountId && event.providerSessionId) {
        if (event.providerSessionId !== expectedId) throw new Error('The CLI opened a different conversation. Keep the original console open.');
        session.providerSessionId = event.providerSessionId;
        if (event.model) { session.model = event.model; session.modelId = event.modelId || event.model; }
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('The CLI did not confirm the selected conversation. Keep the original console open.');
  }

  async confirmCodexResumeIdentity(session, expectedId) {
    return settingsAdapter('codex').confirmResumeIdentity(this.resumeDependencies(), session, expectedId);
  }

  async switchSettings({ id, launchId, model, effort, confirmConversationReload } = {}) {
    if (confirmConversationReload !== true) throw new Error('Confirm reloading the saved conversation before applying these settings.');
    const source = this.host.items.get(id);
    if (source?.remote || source?.taskId || settingsAdapter(source?.provider).switchMethod !== 'resume') throw new Error('Model switching is unavailable for this console.');
    return this.switchAccount({ id, launchId, targetAccountId: source.accountId }, { model, effort });
  }

  async switchAccount({ id, launchId, targetAccountId } = {}, settingsSelection = null) {
    const h = this.host;
    ordinaryConsole(h.items.get(id));
    const source = h.items.get(id);
    if (!source?.alive || source.dismissed || source.purpose !== 'agent' || source.launchId !== launchId) throw new Error('This console has changed. Select it again before switching.');
    if (settingsAdapter(source.provider).switchMethod !== 'resume' || !h.getAccounts()) throw new Error('Account switching is unavailable for this console.');
    if (h.switchOperations.has(id)) throw new Error('An account switch is already in progress.');
    const pendingCheckOnly = () => !!settingsSelection && source.state === 'attention' && source.completionMissing === true;
    if (settingsSelection && !['open', 'ready', 'idle'].includes(source.state) && !pendingCheckOnly()) throw new Error('Wait until this chat is idle before applying settings.');
    if (source.switching || source.state === 'active' || (!pendingCheckOnly() && (source.state === 'attention' || h.isBusy(id)))) throw new Error(settingsSelection ? 'Finish the current task before applying settings.' : 'Finish the current task before switching accounts.');
    const target = h.getAccounts().getAccount(targetAccountId, source.provider);
    if (!settingsSelection && target.id === source.accountId) throw new Error('Choose a different account for this console.');
    if (target.profile && !target.loginCompletedAt) throw new Error(`Sign in to ${target.label} before switching to it.`);
    const strategy = settingsAdapter(source.provider);
    const operation = (async () => {
      let staged = null, stageLaunchId = null, committed = false, step = 'waiting for running tool calls';
      const startedAt = Date.now();
      source.switching = true; source.switchTargetId = target.id; h.emit('changed');
      try {
        await h.getHub()?.waitForLaunchCalls?.(id, launchId);
        step = 'reading the model list';
        if (h.items.get(id) !== source || !source.alive || source.dismissed || !source.switching || source.state === 'active' || (!pendingCheckOnly() && (source.state === 'attention' || h.isBusy(id)))) throw new Error(settingsSelection ? 'Finish the current task before applying settings. The original console is still running.' : 'Finish the current task before switching accounts. The original console is still running.');
        const selection = settingsSelection ? resolveSelection(await h.getModels(source.provider, source.accountId), settingsSelection, source) : null;
        if (h.items.get(id) !== source || !source.alive || source.dismissed || source.launchId !== launchId) throw new Error('This console changed. Reopen the model choices.');
        step = 'reading the current draft';
        const draft = await this.captureNativeDraft(source);
        strategy.checkDraft(draft, 'source', { hasClaudeEditorContext });
        step = 'finding the saved conversation';
        const currentSource = h.items.get(id);
        if (currentSource !== source || !source.alive || source.dismissed || !source.switching || source.launchId !== launchId || source.state === 'active' || (!pendingCheckOnly() && (source.state === 'attention' || h.isBusy(id)))) throw new Error('The console changed while Paddock was checking it. The original console is still running.');
        const liveTarget = h.getAccounts().getAccount(target.id, source.provider);
        if (liveTarget.id !== target.id || liveTarget.provider !== source.provider || (liveTarget.profile && !liveTarget.loginCompletedAt)) throw new Error('The selected account changed or needs sign-in. The original console is still running.');
        const history = selection ? await findConversation(source.accountConfigDir, source.provider, source.providerSessionId) : await copyConversation({
          sourceConfig: source.accountConfigDir, targetConfig: liveTarget.configDir, provider: source.provider, sessionId: source.providerSessionId,
          isTargetInUse: () => [...h.items.values()].some(item => item !== source && item.alive && item.provider === source.provider && item.accountId === target.id && item.providerSessionId === source.providerSessionId)
        });
        if (h.items.get(id) !== source || !source.alive || source.dismissed || !source.switching || source.launchId !== launchId) throw new Error('The original console was closed while Paddock checked its conversation.');
        const resumeModel = selection ? selection.model : await strategy.resumeModel({ targetAccountId: target.id, source, getThreadModel: (...args) => h.getThreadModel(...args) });
        if (!resumeModel) throw new Error(`${strategy.label} has not confirmed the current conversation model. Keep the current console open.`);
        if (h.items.get(id) !== source || !source.alive || source.dismissed || !source.switching || source.launchId !== launchId) throw new Error('The original console was closed while Paddock checked its model.');
        const resumePath = strategy.resumePath({ target: liveTarget, history, selection });
        const raw = { provider: source.provider, cwd: source.cwd, name: source.name, nameMode: source.nameMode, projectId: source.projectId, slot: source.slot, width: source.width, height: source.height, consoleKey: source.consoleKey, permissions: source.permissions, model: source.launchModel,
          ...(selection ? {} : { effort: source.launchEffort ?? null }), worktree: source.worktree };
        stageLaunchId = crypto.randomUUID();
        step = 'starting the new console';
        staged = await h.launcher.createOne(raw, {
          resumeId: source.providerSessionId, resumePath, accountId: target.id, sessionId: source.id, launchId: stageLaunchId, stage: true, resumeModel, resumeEffort: selection?.effort ?? null,
          cancelCheck: () => h.items.get(id) !== source || !source.alive || source.dismissed || !source.switching || source.launchId !== launchId
        });
        const stageSession = h.pendingStages.get(stageLaunchId);
        if (!stageSession) throw new Error('The selected account console could not be started. Keep the original console open.');
        step = 'waiting for the new console to settle';
        await this.waitForOutputIdle(stageSession);
        step = 'answering the resume question';
        await this.answerResumePrompt(stageSession, strategy);
        step = 'confirming the saved conversation opened';
        await this.awaitResumeIdentity(stageSession, source.providerSessionId);
        if (selection) {
          delete stageSession.model; delete stageSession.modelId; delete stageSession.effort; delete stageSession.settingsAt;
          stageSession.requestedSettings = { ...selection, at: Date.now(), status: 'awaiting-provider' };
          stageSession.launchEffort = selection.effort;
        }
        step = 'checking the new console draft';
        const targetDraft = await this.captureNativeDraft(stageSession);
        strategy.checkDraft(targetDraft, 'target', { hasClaudeEditorContext });
        if (targetDraft !== '') throw new Error('The selected account opened with a draft already present. Keep the original console open.');
        const marker = `PDK${crypto.randomUUID().replaceAll('-', '')}`;
        step = 'restoring the draft';
        await this.nativeDraft(stageSession, 'restore', draft + marker);
        await this.removeNativeDraftMarker(stageSession, marker);
        step = 'verifying the restored draft';
        const restored = await this.captureNativeDraft(stageSession);
        if (restored !== draft) throw new Error('The selected account could not confirm the exact unsent draft. Keep the original console open.');
        step = 'final checks';
        if (h.items.get(id) !== source || !source.alive || source.dismissed || !source.switching || source.launchId !== launchId || source.state === 'active' || (!pendingCheckOnly() && (source.state === 'attention' || h.isBusy(id)))) throw new Error(`The console changed while Paddock was ${settingsSelection ? 'applying settings' : 'switching accounts'}. The original console is still running.`);
        const finalTarget = h.getAccounts().getAccount(target.id, source.provider);
        if (finalTarget.id !== liveTarget.id || finalTarget.provider !== source.provider || (finalTarget.profile && !finalTarget.loginCompletedAt)) throw new Error('The selected account changed. The original console is still running.');
        Object.assign(stageSession, {
          name: source.name, nameMode: source.nameMode, projectId: source.projectId,
          slot: source.slot, width: source.width || 1, height: source.height || 1,
          cols: source.cols || 110, rows: source.rows || 30, accountLabel: finalTarget.label
        });
        h.refreshContextFile(source);
        stageSession.terminal.resize?.(stageSession.cols, stageSession.rows);
        h.getHub()?.revoke(id, source.launchId);
        h.getDraftBridge()?.unregister(id, source.launchId);
        stageSession.switching = false; delete stageSession.switchTargetId; delete stageSession.completionMissing;
        h.items.set(id, stageSession); h.pendingStages.delete(stageLaunchId); committed = true;
        h.emit('changed');
        h.emit('output', { id, launchId: stageSession.launchId, data: stageSession.buffer, sequence: stageSession.sequence, reset: true });
        try { source.terminal.kill(); } catch {}
        staged = publicSession(stageSession);
      } catch (error) {
        const stageSession = stageLaunchId && h.pendingStages.get(stageLaunchId);
        const failure = stageSession ? strategy.stageFailure({ buffer: stageSession.buffer, targetLabel: target.label }) : null;
        if (failure && h.items.get(id) === source && source.alive && !source.dismissed) {
          error = new Error(failure);
          h.emit('changed');
        }
        if (stageSession) {
          h.pendingStages.delete(stageLaunchId);
          h.getHub()?.revoke(stageSession.id, stageSession.launchId); h.getDraftBridge()?.unregister(stageSession.id, stageSession.launchId);
          try { stageSession.terminal.kill(); } catch {}
        }
        // Name the step so a failed change can be traced without a screenshot of the terminal.
        if (settingsSelection && error instanceof Error) error.message += ` (Step: ${step}, after ${Math.round((Date.now() - startedAt) / 1000)}s.)`;
        throw error;
      } finally {
        if (!committed && h.items.get(id) === source) { source.switching = false; delete source.switchTargetId; h.emit('changed'); }
        h.switchOperations.delete(id);
      }
      return staged;
    })();
    h.switchOperations.set(id, operation);
    return operation;
  }
}

module.exports = { AccountSwitching };
