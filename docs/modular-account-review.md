# Modular Account Isolation and Capability Integration Review

**Scope:** Focused independent source review of modular account changes per `.build/modular-account-review-input.md` diffs and new registry/tests. No code edits. No shell/browser/native provider calls. One review only.

---

## Executive Summary

The modular account changes introduce a provider registry (`provider-account-capabilities.cjs`) that drives account isolation, credential environment overrides, auth/login evidence, generic source snapshots/task routing, migration of unsupported profiles, and capability-driven UI. The design is sound and mostly correct. Several concrete findings require attention before production use.

---

## 1. Account Isolation for New Gemini/Pi Profiles

### Finding 1.1 — Gemini `homeScoped` isolation uses `configRoot` for `GEMINI_CLI_HOME` but core appends `.gemini`
**File:** `electron/account-profiles.cjs` line 165  
**Code:** `env[isolation.env] = isolation.homeScoped ? account.configRoot : account.configDir;`  
**Evidence:** `provider-account-capabilities.cjs` defines `gemini.isolation.defaultSubdir = '.gemini'` and `homeScoped: true`. The `configRoot` is the profile directory (e.g., `agent-accounts/<uuid>`). `configDir` is `configRoot/.gemini`.  
**Issue:** Per verified Gemini facts, `GEMINI_CLI_HOME` overrides the **home root**; the core appends `.gemini`. Setting `GEMINI_CLI_HOME=configRoot` results in effective config at `configRoot/.gemini` (correct). However, `configDir` already equals `configRoot/.gemini`. The current logic is correct **only if** the CLI treats `GEMINI_CLI_HOME` as the root. Verified fact confirms this.  
**Verdict:** Correct behavior, but brittle. Add a comment explaining why `configRoot` is used for `homeScoped` providers.

### Finding 1.2 — Gemini `envOverrides` forces `GEMINI_FORCE_FILE_STORAGE=true` and `GEMINI_FORCE_ENCRYPTED_FILE_STORAGE=true` unconditionally
**File:** `electron/provider-account-capabilities.cjs` lines 55–58  
**Evidence:** Test `tests/multi-provider-accounts.test.cjs` lines 20–22 asserts these are forced.  
**Issue:** Verified facts state `FORCE_FILE_STORAGE=true` selects per-home encrypted FileKeychain; `FORCE_ENCRYPTED_FILE_STORAGE=true` selects that OAuth storage. Forcing both is correct for isolation (prevents shared system keychain). No user override path exists.  
**Verdict:** Correct for isolation. Document that these cannot be overridden per-profile.

### Finding 1.3 — Pi `PI_CODING_AGENT_DIR` points to `configDir` (`.pi/agent`) but `defaultSubdir` is `.pi/agent`
**File:** `electron/provider-account-capabilities.cjs` lines 67–72  
**Evidence:** Test line 45: `assert.equal(env.PI_CODING_AGENT_DIR, one.configDir)`.  
**Issue:** `homeScoped` is **not** set for Pi. `getAccount` returns `configDir = configRoot` (no subdir append). But `isolation.defaultSubdir = '.pi/agent'` is only used by `defaultConfigDir`. The profile `configDir` is `agent-accounts/<uuid>`. The env var `PI_CODING_AGENT_DIR` is set to `configDir` (the profile root). Verified fact: `PI_CODING_AGENT_DIR` directs config/auth. This matches expectation.  
**Verdict:** Correct. Pi does not need `homeScoped` because its config dir is the profile root.

### Finding 1.4 — Pi `clearEnv` clears `PI_CODING_AGENT_SESSION_DIR` but test expects it undefined
**File:** `electron/account-profiles.cjs` line 145  
**Evidence:** Test line 46: `assert.equal(env.PI_CODING_AGENT_SESSION_DIR, undefined)`.  
**Verdict:** Correct. The inherited session dir is cleared per verified fact.

---

## 2. Credential Environment Overrides

### Finding 2.1 — Broad API key scrubbing may remove unrelated keys
**File:** `electron/account-profiles.cjs` lines 143–144  
**Code:** Regex `/(?:_API_KEY|_AUTH_TOKEN|_ACCESS_TOKEN|_OAUTH_TOKEN)$/i` and `/^(?:GH_TOKEN|GITHUB_TOKEN|COPILOT_GITHUB_TOKEN|GOOGLE_APPLICATION_CREDENTIALS|CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE|GEMINI_CLI_CUSTOM_OAUTH_CREDS)$/i`  
**Issue:** Scrubbing applies to **all** profile accounts. A user with `MY_CUSTOM_API_KEY` for a local tool would lose it. The hardcoded list covers known provider keys but the suffix regex is broad.  
**Verdict:** Acceptable risk (profile isolation intent). Document that custom `_API_KEY` vars are cleared. Consider allowlist for non-provider keys.

### Finding 2.2 — `codex_sqlite_home` cleared but not in registry isolation env list
**File:** `electron/account-profiles.cjs` line 140  
**Code:** `[...this.registry.listAccountProviders().flatMap(x => x.isolation ? [x.isolation.env.toLowerCase()] : []), 'codex_sqlite_home']`  
**Issue:** `codex_sqlite_home` is a Codex-specific internal var, not in registry. Correct to include explicitly.  
**Verdict:** Correct.

### Finding 2.3 — Gemini `clearEnv` includes `GOOGLE_GENAI_USE_VERTEXAI` and `GOOGLE_GENAI_USE_GCA` but not `GOOGLE_API_KEY`
**File:** `electron/provider-account-capabilities.cjs` lines 59–61  
**Issue:** `GOOGLE_API_KEY` is caught by the `_API_KEY` suffix regex. The explicit list targets Vertex/GCA switches. Correct.  
**Verdict:** Correct.

---

## 3. Auth/Login Evidence

### Finding 3.1 — Login completion checks `credentialFiles` existence and non-zero size
**File:** `electron/sessions.cjs` lines 411–416  
**Code:** `const evidence = adapter.login.credentialFiles; const completed = !evidence?.length || evidence.some(file => fs.statSync(path.join(account.configDir, file)).size > 0);`  
**Evidence:** Gemini: `['gemini-credentials.json', 'oauth_creds.json']`; Pi: `['auth.json']`.  
**Issue:** 
- Codex/Claude have `credentialFiles: undefined` (empty args login). `!evidence?.length` → `true` → marks completed on exit code 0. This assumes CLI login command succeeds iff credentials written. Risk: CLI may exit 0 without writing (e.g., already logged in).  
- Pi `auth.json` may be created empty initially. Size check handles this.  
- No verification of credential **validity** (only presence).  
**Verdict:** Acceptable for MVP. Document that exit-code-only success is assumed for Codex/Claude. Consider adding a `verifyCredential` hook in registry for future.

### Finding 3.2 — `createLoginConsole` passes `adapter.login.args` but Gemini/Pi have empty args
**File:** `electron/sessions.cjs` line 401  
**Code:** `let command = executable, args = [...adapter.login.args];`  
**Issue:** Gemini/Pi `login.args = []`. The CLI is launched with no args. User must manually run `/auth` or `/login` inside the console. The `instruction` text guides this. This is intentional (no programmatic login).  
**Verdict:** Correct by design. UI shows `loginInstruction`.

### Finding 3.3 — No `credentialFiles` for Codex/Claude means login always "succeeds" on exit 0
**File:** `electron/provider-account-capabilities.cjs` lines 27, 34  
**Issue:** Codex `login: { args: ['login'] }`, Claude `login: { args: ['auth', 'login'] }` — no `credentialFiles`. The check `!evidence?.length` returns true. If user cancels login, CLI may still exit 0.  
**Mitigation:** Codex `login` command typically blocks until complete. Claude `auth login` similar. Risk is low but not zero.  
**Verdict:** Acceptable. Add `credentialFiles` for Codex (`~/.codex/auth.json`?) and Claude (`~/.claude/.credentials.json`?) when known.

---

## 4. Generic Source Snapshots / Task Routing

### Finding 4.1 — `allChoices()` includes unavailable providers with `unavailableReason`
**File:** `electron/account-profiles.cjs` lines 56–58  
**Code:** `this.list().filter(x => !this.provider(x.provider)).map(x => ({ ...x, profile: true, unavailableReason: 'Provider adapter is unavailable. This account has been kept.' }))`  
**Evidence:** Test line 64: `assert.throws(() => reopened.getAccount(profile.id, 'unavailable-provider'), /kept/);`  
**Issue:** Correct migration behavior. UI shows disabled sign-in button (`profileProvider(account.provider)?.namedProfiles ? '' : 'disabled'`).  
**Verdict:** Correct.

### Finding 4.2 — `usageAccounts()` filters by `installed` agents and `limits`
**File:** `electron/main.cjs` lines 301–312  
**Code:** `const choices = (accounts?.allChoices() || []).filter(choice => choice.profile || installed.has(choice.provider) || limits.some(value => limitAccountId(value) === choice.id));`  
**Issue:** Profiles for unavailable providers are excluded unless they have usage limits recorded. This is correct — no usage to show.  
**Verdict:** Correct.

### Finding 4.3 — Task routing `environment` uses `accounts.environment` for all providers
**File:** `electron/main.cjs` line 533  
**Code:** `environment: (id, provider) => id === 'opencode:strata' ? usageEnvironment(...) : taskAccounts.environment(id, provider)`  
**Issue:** Previously non-Claude/Codex providers got stripped env. Now all use `accounts.environment` which scrubs API keys for profiles. Correct for isolation.  
**Verdict:** Correct.

### Finding 4.4 — Pi usage reading passes `accounts.environment` and `settingsPath`
**File:** `electron/main.cjs` lines 445–447  
**Code:** `pi: choice => readPiUsage({ ..., env: usageEnvironment(accounts.environment(choice.id, 'pi', { baseEnv: process.env })), settingsPath: accounts.getAccount(choice.id, 'pi').configDir ? path.join(accounts.getAccount(choice.id, 'pi').configDir, 'settings.json') : undefined })`  
**Issue:** `usageEnvironment` wraps the account env. `settingsPath` points to profile `configDir/settings.json`. Correct for per-profile usage.  
**Verdict:** Correct.

---

## 5. Migration Retaining Unsupported Profiles

### Finding 5.1 — Constructor filter allows any provider matching `/^[a-z][a-z0-9-]{0,63}$/`
**File:** `electron/account-profiles.cjs` line 23  
**Code:** `/^[a-z][a-z0-9-]{0,63}$/.test(x.provider || '')`  
**Issue:** Old hardcoded `PROVIDERS` set removed. Now any valid provider id passes filter. Saved profiles with unknown providers are retained.  
**Verdict:** Correct. Test line 60 confirms.

### Finding 5.2 — `getAccount` throws "kept" error for unavailable providers; `create` throws "not verified"
**File:** `electron/account-profiles.cjs` lines 64, 80  
**Code:** `if (!this.provider(profile.provider)?.namedProfiles) throw new Error('Separate sign-in storage is unavailable for this provider. The saved account has been kept.');`  
**Verdict:** Correct. Clear error messages.

### Finding 5.3 — `allChoices()` surfaces unavailable profiles with `unavailableReason`; UI disables actions
**File:** `src/app.js` lines 516–518, 541  
**Code:** Sign-in button disabled if `!profileProvider(account.provider)?.namedProfiles`.  
**Verdict:** Correct UX.

---

## 6. Capability-Driven UI

### Finding 6.1 — Provider selector in account form shows all registry providers; disables those without `namedProfiles`
**File:** `src/app.js` lines 514–518  
**Code:** `<option ... ${provider.namedProfiles ? '' : 'disabled'}>${escape(provider.name)}${provider.namedProfiles ? '' : ' (separate accounts unavailable)'}</option>`  
**Verdict:** Correct. Dynamic from registry.

### Finding 6.2 — "Add subscription" in Usage only shows providers with `namedProfiles`
**File:** `src/app.js` line 547  
**Code:** `profileProviders().filter(provider => provider.namedProfiles).map(...)`  
**Verdict:** Correct. Only providers supporting separate accounts can have additional subscriptions.

### Finding 6.3 — `accountProviderSupport()` details show supported/unsupported providers
**File:** `src/app.js` lines 509–513  
**Verdict:** Correct. Good transparency.

### Finding 6.4 — `providers()` strips `isolation` and `login` from public fields
**File:** `electron/account-profiles.cjs` line 50  
**Code:** `this.registry.listAccountProviders().map(({ isolation, login, ...publicFields }) => ({ ...publicFields, loginInstruction: login?.instruction || '' }))`  
**Issue:** `loginInstruction` exposed but not `credentialFiles` or `isolation` details. UI doesn't need internals. Correct.  
**Verdict:** Correct.

### Finding 6.5 — `usage` capability in registry gates usage checking in main.cjs
**File:** `electron/main.cjs` lines 487–518  
**Code:** Pi usage block iterates `accounts.choices(provider)`. Other providers use `accounts.choices(provider).filter(...)`.  
**Issue:** Registry `usage: true` for Pi, but Pi usage reading is special-cased. Codex/Claude/Antigravity/Copilot/Cursor/Kiro/Kimi/Opencode have `usage: true` in base.  
**Verdict:** Consistent. Pi's zero-price OpenRouter model handling is custom but uses registry choices.

---

## 7. Cross-Cutting Concerns

### Finding 7.1 — `defaultConfigDir` for non-codex uses `isolation.env` and `homeScoped`
**File:** `electron/account-profiles.cjs` lines 180–188  
**Issue:** For `homeScoped` (Gemini), returns `path.join(home, defaultSubdir)` — the **system default**, not profile. This is correct: "Default Gemini" uses system `GEMINI_CLI_HOME` or `~/.gemini`. Profile accounts use isolated `configRoot`.  
**Verdict:** Correct.

### Finding 7.2 — `environment` applies `isolation.envOverrides` after setting isolation env var
**File:** `electron/account-profiles.cjs` line 167  
**Code:** `if (account.profile) Object.assign(env, isolation.envOverrides || {});`  
**Verdict:** Correct. Overrides (e.g., Gemini forced file storage) apply only to profiles.

### Finding 7.3 — `cli-launch.cjs` `prepareCli` uses `configDir` for Gemini MCP settings
**File:** `electron/cli-launch.cjs` line 92  
**Code:** `saveManagedMcp(path.join(configDir || path.join(home, '.gemini'), 'settings.json'), bridgeConfig(runtime));`  
**Issue:** `configDir` passed from `sessions.cjs` line 280: `configDir: account?.profile ? account.configDir : null`. For Gemini profile, `configDir` = `configRoot/.gemini`. MCP settings written there. Correct isolation.  
**Verdict:** Correct.

### Finding 7.4 — Pi `cli-launch` uses `--append-system-prompt` not MCP
**File:** `electron/cli-launch.cjs` line 124  
**Code:** `if (id === 'pi') args.push('--append-system-prompt', summaryPath);`  
**Issue:** Pi doesn't use MCP bridge. Correct per capability (`models: false`, `resume: false`).  
**Verdict:** Correct.

### Finding 7.5 — `sessions.createLoginConsole` validates `adapter?.namedProfiles && adapter.login`
**File:** `electron/sessions.cjs` line 395  
**Code:** `if (!adapter?.namedProfiles || !adapter.login) throw new Error('Sign-in for a separate account is unavailable for this provider.');`  
**Issue:** Gemini/Pi have `namedProfiles: true` and `login: { args: [], instruction: ... }`. Passes. Codex/Claude have `login.args`. Passes. Unavailable providers fail. Correct.  
**Verdict:** Correct.

---

## 8. Test Coverage Observations

### Finding 8.1 — Tests cover Gemini isolation, Pi isolation, synthetic adapter, migration, login/launch restoration
**File:** `tests/multi-provider-accounts.test.cjs`  
**Coverage:** Good for account-profiles core. No tests for:
- UI rendering of provider support details
- Usage checking with multiple profiles per provider
- Task routing environment with profiles
- Login evidence verification (credentialFiles)
- Cross-provider `clearEnv` and `envOverrides` combinations

### Finding 8.2 — Test line 33: `assert.equal(accounts.provider('gemini').usage, false)` — registry `usage: false` for Gemini
**Verdict:** Correct. Gemini has no usage API.

### Finding 8.3 — Test line 51: `assert.throws(() => accounts.create('cursor', 'Unsafe shared sign-in'), /not been verified/);` — Cursor has `namedProfiles: false`
**Verdict:** Correct. Migration test confirms blocked creation.

---

## 9. Actionable Findings (Prioritized)

| # | Finding | File/Line | Severity | Action |
|---|---------|-----------|----------|--------|
| 1 | Gemini `homeScoped` logic correct but undocumented | `account-profiles.cjs:165` | Low | Add comment: `// homeScoped: GEMINI_CLI_HOME is root, core appends .gemini` |
| 2 | Broad `_API_KEY` suffix scrubbing may catch custom keys | `account-profiles.cjs:143` | Medium | Document behavior; consider allowlist for non-provider keys |
| 3 | Codex/Claude lack `credentialFiles` → login success assumed on exit 0 | `provider-account-capabilities.cjs:27,34` | Medium | Add known credential file paths when verified; or add `verifyCredential` hook |
| 4 | Pi `login.args = []` launches CLI with no args; user must run `/login` manually | `provider-account-capabilities.cjs:75` | Low | Document in `loginInstruction` (already present) |
| 5 | No test for `envOverrides` / `clearEnv` combination across providers | — | Low | Add integration test |
| 6 | `allChoices()` includes unavailable profiles but `usageAccounts()` filters them out unless limits exist | `main.cjs:301` | Low | Verify UX: hidden profiles with no limits don't appear in Usage |
| 7 | `cli-launch.cjs` Gemini MCP uses `configDir` (profile `.gemini`) — correct | `cli-launch.cjs:92` | Info | Confirm no fallback to home `.gemini` for profiles |

---

## 10. Limitations

- Review based on source only. No live sign-in, no test execution, no browser/UI verification.
- "Verified installed Gemini facts" accepted as given; not independently verified.
- Pi OpenRouter zero-price model handling not reviewed in depth (custom logic in `main.cjs`).
- No assessment of WSL paths, symlink attacks beyond existing `canonical`/`inside` checks.
- Registry is frozen (`deepFreeze`); runtime mutation not possible — correct for security.
- Prior dirty work excluded by task-start baselines; not reviewed.

---

## 11. Conclusion

The modular account isolation and capability integration is **well-designed and mostly correct**. The registry-driven approach cleanly separates provider capabilities from account management. Key isolation mechanisms (home-scoped config dirs, env scrubbing, env overrides, credential evidence) work as intended for Gemini and Pi.

**Blocking issues:** None.

**Recommended before merge:** Address findings #1 (documentation), #2 (document scrubbing scope), #3 (add credentialFiles for Codex/Claude or verify hook). Others are low-priority improvements.

---

*Review completed. Document owned at `docs/modular-account-review.md`. No code edits made.*