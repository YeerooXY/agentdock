'use strict';
// Default runtime steps for every provider. A strategy overrides only what its
// CLI needs. Hooks receive their dependencies from the session services, so this
// package never imports the launcher, the registry or a facade that loads them.
// Credential stripping, authorization, staging and rollback stay in those
// trusted services; hooks only add a provider's own arguments and variables.
function envValue(env, name) { return Object.entries(env).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]; }
function plainTerminalText(value) {
  return String(value || '').replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\x1b[()][A-Z0-9]/g, '').replace(/\r/g, '\n');
}

const commonRuntime = Object.freeze({
  // Which installation runs this console, and whether it runs through WSL.
  resolveInstall: () => ({ install: null, wsl: false }),
  // Folders the draft editor may touch, and any per-launch temp folder.
  prepareEditor: () => ({ editorRoots: [], tempRoot: null }),
  // Runs last, after the launcher has stripped and granted the environment.
  applyEnvironment() {},
  // A warning for the console buffer, '' for none, or a promise of either.
  // Skipping must stay synchronous: a launch with no await before its spawn is
  // what lets the next launch in the same tick see its slot.
  prepareTracking: () => '',
  sessionFields: () => ({}),
  loginExecutable: ({ provider, agent, cliSetup, findProgram }) => cliSetup?.executable(provider) || findProgram(agent?.command),
  loginLaunch({ executable, args, programLaunch }) { return programLaunch(executable, args, { bypass: true }); },
  confirmResumeIdentity: (deps, session, expectedId, timeout) => deps.awaitEventIdentity(session, expectedId, timeout),
  // Throws when a captured draft cannot move to the replacement console.
  checkDraft() {},
  // The keys that answer a question the CLI asks before it opens a resumed
  // conversation, from the plain text of its screen, or null when none is shown.
  resumePromptAnswer: () => null,
  resumeModel: async ({ source }) => source.modelId || source.model || null,
  resumePath: () => null,
  // A clearer message for a failed replacement, or null to keep the original.
  stageFailure: () => null
});

module.exports = { commonRuntime, envValue, plainTerminalText };
