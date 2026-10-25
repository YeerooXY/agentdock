# Account switching review

Review date: 25 October 2026  
Scope: prompt 5, subscription account profiles, in-place console switching, account-specific Usage and the phone action.

## Interaction review

| Surface | Evidence | Result |
| --- | --- | --- |
| Usage and account profiles | `src/app.js`, four account-switching browser captures, fake-CLI account tests | Passed: separate account cards, labels, 90% threshold, opt-in setting, per-account limits, login retry, rename retry, and a successful retry that clears the form without adding a duplicate profile. |
| Console grid and threshold offer | `scripts/account-switching-visual-check.cjs`; four-profile screenshots and JSON report under `.build/codex-prompt-runs/2026-10-24/5/verification/` | Passed: menu stays open and focused across an unchanged snapshot; pointer selection works with a 100 ms press; setup and switch requests stay pinned to the original console; the switched profile appears in the header; account, Expand and End controls stay inside the header. |
| Desktop terminal header | `src/app.js` exact account lookup and menu IDs; `src/style.css` shrinkable account control | Source review. The browser fixture checks the grid header after a switch; it does not capture a separate expanded-terminal screenshot. |
| Phone console | `mobile/lib/main.dart`, `mobile/lib/settings_page.dart`, Flutter test and screenshot record below | Passed in Flutter widget tests: the action stays pinned to its original PC and console, reconnect preserves the composer draft, long labels wrap, and the Usage view retains per-account and unmatched limits. |
| Account creation and sign-in | Browser fixture plus fake CLI tests | Passed: provider login runs with its own profile path; missing login remains recoverable; failed login preserves input and retry reuses the profile. No credential file is read or copied. |
| Account rename | Browser fixture | Passed: duplicate-name error preserves the edit; retry updates the row and console header. Delayed dialog close no longer steals focus from the next form. |
| First-use setup | Fake CLI tests and isolated installed Codex probe | Passed: both providers can open a setup console pinned to the original console and folder. Codex setup shows the provider's trust prompt without accepting it. Setup is transient and leaves the original process and draft running. |
| Threshold and automatic switching | `tests/account-switching.test.cjs`, mobile widget tests, browser Usage view | Passed in fixtures: accounts keep separate limits; unknown or stale usage is not zero; automatic switching defaults off and requires explicit opt-in, fresh complete windows and an idle session. Repeated prompts and busy-session switching are guarded. |

## Account, history and draft checks

| Requirement | Evidence and limit |
| --- | --- |
| Provider authentication stays provider-owned | `electron/account-profiles.cjs` assigns generated profile directories and invokes the CLI login. No Paddock code reads or copies auth files. Fake CLI logs contain only allowlisted paths and fixture arguments. Real account identity was not inspected. |
| Isolate launch state | Profile launches set `CODEX_HOME`, `CODEX_SQLITE_HOME`, explicit Codex SQLite configuration and `--no-daemon`, or `CLAUDE_CONFIG_DIR`. Case-insensitive inherited auth, backend and Paddock draft overrides are filtered. Fake CLI tests assert the profile environment. |
| Keep histories separate | `electron/account-history.cjs` transfers only the selected verified transcript. It rejects unsafe roots, links, divergent or active target history, compressed Codex history and transcript dependencies. No provider document confirms cross-profile transcript migration. |
| Keep events tied to their launch | Hooks, usage updates and process callbacks carry launch and account identity. Tests cover delayed old-process events after a switch. |
| Preserve the actual unsent draft | `electron/draft-bridge.cjs`, `electron/draft-editor.cjs`, and tests use the CLI's native external editor. Codex capture verifies a suffix before removal; Claude context blocks are refused. Multiline Unicode, trailing spaces/newline, edits, repeated switches, and no-submit behavior are covered. Unsupported attachment/control text leaves the source console running. |
| Handle races and recovery | Fake PTY tests cover duplicate clicks, target login changes, busy sessions, unknown resume model, failed restart, source End, app stop, stale callbacks, slot/title/project/resize changes during staging, and cancellation. Failed staged checks leave the source console and draft intact. |
| Isolate the draft bridge | The temporary HTTP server binds to `127.0.0.1`, accepts only the expected host, POST path, no Origin header and a random per-launch bearer token. Draft text stays in process memory and the CLI's external-editor file; it is not written to routine state or logs. The bridge expires and revokes launch-scoped tokens. |

Native installed-CLI evidence used isolated fixture data and synthetic provider behavior; it did not use the supervising chat, an active user console, real account credentials, HTTP model calls or a paid request:

- Codex 0.163.0 production handover: 10 checks passed, including an in-CLI model change, exact multiline Unicode draft, stable conversation identity and 83×24 PTY resize. Evidence: `.build/codex-prompt-runs/2026-10-24/5/native-switch-probe/7cab32a1-4efe-41e4-93e1-89eb451ba2f2/result.json`.
- Codex first-use folder setup: 9 checks passed; the native trust prompt remained for the user. Evidence: `.build/codex-prompt-runs/2026-10-24/5/native-switch-probe/7ffa193a-d3e6-4a39-acaf-bd78e52841b2/result.json`.
- Claude Code 2.1.310 production handover: 8 checks passed with an exact normal draft. Evidence: `.build/codex-prompt-runs/2026-10-24/5/native-claude-switch-probe/7c63ab67-5692-4fe1-86db-b9852f36a04e/result.json`.
- Claude external-editor reference-context refusal: 6 checks passed; Paddock kept the draft and original process. Evidence: `.build/codex-prompt-runs/2026-10-24/5/native-claude-switch-probe/b0a97a91-a3d5-40d1-8f21-c8cef0a85664/result.json`.

## Page checklist

The 20-item index is from [`guides/web-design.md`](../guides/web-design.md). This is a local desktop/mobile application flow, not a hosted Paddock website.

| Item | Status | Evidence or reason |
| --- | --- | --- |
| 1 Privacy | Checked in scope | Profile labels and account metadata are local; each provider CLI owns sign-in and history. Paddock does not read credential files. The account research note distinguishes local behavior from provider processing. |
| 2 Terms | Checked | Usage shows a neutral provider-terms warning. The dated research note links the current official terms and records uncertainty. |
| 3 Refunds | Not applicable | No sale, subscription or payment is offered by this flow. |
| 4 Cookies | Not applicable | Native app flow; no browser cookies were added. |
| 5 Cookie consent | Not applicable | No new nonessential tracking or cookie-based analytics. |
| 6 Form consent | Not applicable | Account creation starts only after an explicit Add account action; the provider CLI owns its sign-in flow. No marketing consent is collected. |
| 7 Data minimization | Checked | Profile records contain provider, label, generated ID and login-completion time; draft content is transient and excluded from routine state/logs. Tests check that fake token sentinels and drafts do not appear in state or logs. |
| 8 Third-party SDKs | Checked | No SDK, remote font, analytics or account service was added. Provider CLI login and usage remain provider-owned. |
| 9 Dark patterns | Checked | Account switching is explicit; automatic switching is off by default; the provider-terms note is visible. |
| 10 Fees | Not applicable | This flow does not charge or present a purchase. |
| 11 Reviews | Not applicable | No reviews or testimonials are shown. |
| 12 Claims | Checked | Research separates official documentation, installed-CLI observations and Paddock inference. It does not claim provider approval for cross-profile resume or quota rotation. |
| 13 Alt text | Checked | Account menu names and controls have accessible labels; scoped axe checks passed in all four browser profiles. |
| 14 Contrast | Checked in scope | Account menu uses light text and focus outline on a dark surface. Existing theme review records palette contrast evidence; the new browser check confirms visible focus and account controls. This is not a WCAG certification. |
| 15 Keyboard | Checked in scope | Account menu implements Arrow, Home, End and Escape handling; focus stays with the menu across a snapshot. Existing console keyboard/focus evidence remains in the console interaction review. |
| 16 Business details | Not applicable | No public business or sales page was added. |
| 17 Children's data | Not applicable | No age or child data is requested. |
| 18 Unsubscribe | Not applicable | No marketing email is sent. |
| 19 Asset licenses | Checked | No new font, image or icon asset was added for account switching. |
| 20 Data deletion | Needs work | The local Usage profile list supports sign-in and rename but no Remove action. `AccountProfiles` persists account directories and metadata. Add an explicit user-triggered removal flow with clear treatment of provider-owned credentials and history before claiming profile deletion is available. |

## Security checklist

The indexes are from [`guides/web-design.md`](../guides/web-design.md). Unchanged mobile pairing and remote-access controls retain the status and evidence in the [mobile security review](mobile-security-review.md). Unchanged renderer, CSP and dependency findings retain the [console themes review](console-themes-review.md#security-review) and [dependency security review](dependency-security-review.md).

| Item | Status | Evidence or reason |
| --- | --- | --- |
| 21 Database credentials | Not applicable | No Paddock database URL or database user is introduced. |
| 22 Public `.env` | Not applicable | No website host or public deployment is part of this task. |
| 23 Hardcoded API keys | Passed | New source contains no provider credential or API key. Fake sentinels are isolated test data. |
| 24 Authentication | Passed | Login uses `codex login` or Claude's CLI login with the selected config directory; Paddock does not parse login output or tokens. Real accounts were not checked. |
| 25 Authorization | Passed | Main-process handlers validate profile/provider, console ID, launch ID and target account; mobile requests also remain bound to the paired PC and console key. Fake tests cover stale IDs. |
| 26 Other users' data | Passed | Profile paths are generated under the current user's Paddock data folder and validated against links/redirection. This is a local single-user feature, not a hosted tenant system. |
| 27 Open database permissions | Not applicable | No Paddock database or public database rules. |
| 28 Cloud storage | Not applicable | No cloud bucket or shared profile store was added. |
| 29 Admin routes | Not applicable | No network admin route was added. |
| 30 Debug pages | Passed | Browser fixture servers bind to loopback and no review/debug page ships in `dist`. |
| 31 Build logs | Passed | Build and test logs were inspected; no real credential or account identity was supplied to tests. |
| 32 Verbose errors | Passed | Login, history, draft and resume errors use actionable text without printing credential values, draft text or stack traces to the user. |
| 33 Leaked repositories | Not applicable | Inherited from the [console themes security review](console-themes-review.md#security-review): no publish or visibility change was requested; that review did not perform a full historical secret audit. |
| 34 Frontend secrets | Passed | Provider and draft tokens stay in the main/selected CLI process path; account state exposes IDs and labels only. Negative tests check state and logs. |
| 35 Client-only checks | Passed | Main process repeats provider, session, launch and target validation. |
| 36 Input validation | Passed | Labels, thresholds, profile IDs and history paths are bounded and validated; fake tests cover path redirection and stale targets. |
| 37 SQL injection | Not applicable | No Paddock SQL query was added. Codex SQLite location is isolated, not used to build queries from user input. |
| 38 NoSQL injection | Not applicable | No NoSQL store is used. |
| 39 XSS | Passed | User labels are escaped in renderer templates; account fixtures include long Unicode labels and pass scoped accessible-name checks. |
| 40 CSRF | Not applicable | State-changing account actions use existing trusted Electron IPC and authenticated mobile RPC, not browser form endpoints. |
| 41 File uploads | Not applicable | No upload flow was added. |
| 42 Path traversal | Passed | Profile IDs are generated UUIDs; account and history roots reject symlinks and paths outside the permitted root. |
| 43 SSRF | Passed | The draft helper posts only to the generated loopback bridge URL. The bridge binds to `127.0.0.1`, validates host/path/method, rejects Origin and requires a per-launch bearer token. No user-controlled host is accepted. |
| 44 Password reset | Not applicable | Provider CLI owns credential reset and account recovery. |
| 45 Session management | Passed | Launch/account IDs scope callbacks; switching refuses active work, stages the replacement, verifies identity/model/draft and commits only after checks. End/stop cancel staged launches. |
| 46 JWT secrets | Not applicable | No JWT is used for this feature. |
| 47 CORS | Not applicable | The temporary local bridge is not a CORS API and rejects requests with an Origin header. |
| 48 Rate limits | Passed | No public authentication, signup, API or AI endpoint was added. The new local draft bridge requires a random launch-scoped token, accepts one pending operation per session, caps bodies at 1 MiB and applies request/header timeouts. Provider terms uncertainty is recorded separately in `account-switching.md`. |
| 49 Test and staging | Passed | Fake CLI, temporary profile roots and synthetic provider behavior were used. No real account, user console or paid model call was used. |
| 50 Default credentials | Not applicable | No shared/default credentials are created. |
| 51 Webhook signatures | Not applicable | No webhook is introduced. |
| 52 Payment checks | Not applicable | No payment processing is introduced. |
| 53 Direct object references | Passed | Console, launch, account and phone identity are revalidated on every switch/setup request. |
| 54 Trusted IDs and roles | Passed | Main process resolves provider/account from stored profiles; client-supplied IDs do not select arbitrary directories. |
| 55 Sensitive logs | Passed | Tests assert fake token sentinels and exact draft text do not appear in public state or logs. The bridge token is launch-scoped and not logged. |
| 56 Source maps | Passed | The verified Vite build emits no public source map. |
| 57 Dependency vulnerabilities | Needs work | The zero-finding audit applies to the isolated clean install recorded in the [dependency security review](dependency-security-review.md), not this active workspace. The running install remains on its old lockfile and installed Electron 44.7.2 while the manifest specifies 44.9.3. Applying the reviewed replacement requires stopping the running app and installing dependencies; activation was not performed. |
| 58 Outdated packages | Needs work | The [dependency security review](dependency-security-review.md) records tested package/runtime replacements, but this active workspace still has the old dependency installation, including Electron 44.7.2 versus manifest 44.9.3. Runtime activation remains outstanding. |
| 59 Prompt injection | Passed | Transient login/setup consoles receive no Paddock instructions or completion hooks. Drafts are not replayed as prompts. Provider CLI project instructions remain provider behavior. |
| 60 AI tool permissions | Passed | A switch keeps the folder and permission mode; setup shows the native provider prompt without choosing for the user. Automatic switch requires an idle console. |
| 61 Database user rights | Not applicable | No Paddock database user is used. |
| 62 Audit logs | Not applicable | No deployment or hosted administrator action is added. Account-switch events are not a persistent audit log. |
| 63 Monitoring | Not applicable | No hosted service is introduced. |
| 64 Backup and restore | Not applicable | Inherited from the [console themes security review](console-themes-review.md#security-review): no hosted Paddock data store or backup service is introduced. That review covered preference restart persistence only; provider profile backup remains the user's responsibility. |
| 65 Internal dashboards | Not applicable | No dashboard is exposed outside the local app. |
| 66 Security headers | Passed | Existing Electron CSP and BrowserWindow isolation remain unchanged. DraftBridge is a loopback-only ephemeral service with no static pages. |
| 67 Cookie flags | Not applicable | No cookie or web session is added. |
| 68 Encryption | Not applicable | Paddock does not store provider credentials; provider CLI/keyring settings remain provider-controlled. The draft bridge carries draft text over loopback HTTP in memory, not TLS, and does not persist it in Paddock state or logs. No remote transport was added. |
| 69 Tenant isolation | Not applicable | No hosted multi-tenant service. Separate local account roots are validated and tested. |
| 70 Generated code | Passed | New account, history, bridge and renderer code was inspected; fake tests and native fixture probes exercise the changed paths. |

## Verification and limits

- `npm run build`: passed. Vite reports the existing JavaScript chunk size warning (about 620 kB).
- `npm test`: passed, 245 tests passed and 1 skipped; see `.build/codex-prompt-runs/2026-10-24/5/verification/npm-test.log`.
- `npm run test:desktop`: passed all four smoke scripts; see `.build/codex-prompt-runs/2026-10-24/5/verification/test-desktop.log`.
- Flutter in `mobile/`: formatting completed, `flutter analyze` clean, and `flutter test` passed 162 tests. See `flutter-verification.md` and the captured logs in the same verification folder. The phone screenshots were inspected at 393×852 and 320×900 with enlarged system text.
- Account UI browser check: `account-switching-visual-report.json` and 12 screenshots cover Windows Chromium, Desktop WebKit with Mac emulation, Android Chromium with a Pixel profile and iPhone WebKit with an iPhone profile. All three non-Windows profiles are emulated on Windows; no native Apple/Android device, OS keyboard, VoiceOver or TalkBack behavior is claimed. The captures also omit Electron's native window chrome.
- Focused renderer regression: `settings-theme-live-check.log`; all four profiles passed 20 live updates, 39 motion checks and 22 color-isolation checks. The account-specific check also reports no page errors, external requests or horizontal overflow.
- Account UI test logs and screenshots use synthetic data only. Earlier aborted test attempts remain under the same `.build` directory; only the final successful logs are acceptance evidence.

## Remaining manual checks

Use two personally controlled Codex accounts in separate Paddock profiles and a new isolated review console. Sign in through each provider CLI, confirm its own account and conversation, then switch once in each direction while checking the same conversation, current model and unsent draft. If Codex asks to trust the folder, use `Set up <account>`, review the provider prompt and accept it yourself. Do not use a supervising chat or active work console. Never copy or share credential contents. Confirm provider keyring and managed-workspace behavior in the user's environment. Real-account switching was not run here.

Provider documentation does not confirm quota-based subscription rotation or cross-profile transcript transfer. WSL Claude switching stays unavailable until its draft bridge is verified. A profile-removal UI is not part of this prompt; the local profile deletion gap is recorded as Page item 20 above.
