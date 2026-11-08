'use strict';

const { modelsFromReading } = require('./routing-models.cjs');

function createTaskAccounts({
  getWorkers, usageAccounts, getUsageCheck, getLimits, limitAccountId, reviewers,
  executable, choices, getAccount, namedProfiles, hasCredentials, environment,
  usageEnvironment, credentialSwitch, clineRoute, saveResult, now = Date.now
}) {
  const signedIn = (accountId, providerId = String(accountId).split(':')[0]) => {
    const status = getUsageCheck(accountId)?.status;
    if (status === 'sign-in') return false;
    if (status === 'current') return true;
    const profile = getAccount(accountId);
    return hasCredentials(accountId, profile?.provider || providerId) ?? undefined;
  };
  const latestLimit = accountId => getLimits()
    .filter(row => limitAccountId(row) === accountId)
    .sort((a, b) => b.observedAt - a.observedAt)[0];

  return {
    usageSignIn: signedIn,
    getAccounts: () => {
      const workers = getWorkers() || [];
      return [...usageAccounts(), ...workers.filter(worker => worker.local)].map(choice => {
        const worker = workers.find(item => item.id === choice.id), check = getUsageCheck(choice.id);
        const needsSignIn = choice.profile && !choice.loginCompletedAt && !choice.unavailableReason;
        return { ...choice, ...worker, signedIn: worker?.signedIn ?? signedIn(choice.id, choice.provider),
          quotaReader: check?.status || 'unchecked',
          unavailableReason: choice.unavailableReason || (needsSignIn ? 'Sign in to this account first: Settings, Agents, then Sign in next to the account.' : worker ? undefined : 'No bounded worker adapter is connected for this CLI.') };
      });
    },
    getLimits: () => getLimits().map(item => ({ ...item, accountId: limitAccountId(item), usageCheck: getUsageCheck(limitAccountId(item)) })),
    candidates: () => reviewers.flatMap(providerId => {
      const command = executable(providerId), name = require('./provider-workers.cjs').names[providerId];
      if (providerId === 'pi') {
        if (!command) return [];
        return choices(providerId).filter(choice => !choice.profile || choice.loginCompletedAt).map(choice => {
          const reading = latestLimit(choice.id);
          const current = getUsageCheck(choice.id)?.status === 'current' && now() - reading?.observedAt <= 30 * 60_000;
          const freeRoom = current && reading?.windows?.some(window => window.modelGroup === 'openrouter:free' && window.remaining > 0);
          const models = freeRoom ? (reading.freeAlternatives || []).map(model => ({ id: model.route, available: true, observedAt: reading.observedAt, funding: 'free', source: 'native OpenRouter sign-in, zero-price tool model and free request quota' })) : [];
          const selected = current && reading?.modelAllowed === true && reading?.route?.provider && reading?.route?.model ? reading.route.provider + '/' + reading.route.model : null;
          return { id: choice.id, provider: providerId, label: choice.profile ? name + ' (' + choice.label + ')' : name, executable: command, signedIn: signedIn(choice.id), available: models.length > 0 || !!selected,
            model: models.find(model => model.id === 'openrouter/cohere/north-mini-code:free')?.id || models[0]?.id || selected,
            models, funding: models.length ? 'free' : selected ? reading.funding : 'unknown' };
        });
      }
      return command ? choices(providerId).filter(choice => !choice.profile || namedProfiles(providerId) && choice.loginCompletedAt)
        .map(choice => ({ id: choice.id, provider: providerId, label: choice.profile ? `${name} (${choice.label})` : name, executable: command, signedIn: signedIn(choice.id),
          models: modelsFromReading(latestLimit(choice.id)),
          ...(providerId === 'cline' && !choice.profile ? clineRoute() || {} : {}) })) : [];
    }),
    environment: (id, providerId) => usageEnvironment(environment(id, providerId)),
    prepareAccount: (id, providerId) => credentialSwitch.activate(providerId, id),
    releaseAccount: (_id, providerId) => { void credentialSwitch.release(providerId); },
    saveResult
  };
}

module.exports = { createTaskAccounts };
