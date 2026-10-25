# Code panel and interface verification — 25 October 2026

Branch `main`, base commit `88409424c563967eed4c2749e9385f04fe46d64c`. The existing uncommitted work, including Claude's skill-pack changes, was preserved. This note covers the new desktop Code panel, Tools alignment, phone setup dialog, console headers/copying, Usage ordering and the shared-tool repairs. It does not certify the whole application or its legal compliance.

## Delivered behavior

- **Code** adds a read-only panel to the existing grid without creating a terminal process. It follows a local console, displays changed files and syntax-highlighted diffs, browses full files, and copies selected lines or inserts them into a chosen console's draft without submitting it. Grid move, resize, expansion, close and workspace restoration include code panels. Closing one preserves the agent.
- Before a tracked turn is available, Changes shows the current Git working tree. While a panel follows a console, turn start/end captures bounded before/after text even when automatic Results capture is off. Captures remain in memory; reopening the app returns to the working tree. Providers must emit the existing turn signals for turn capture; Refresh remains available. Shared-folder changes are explicitly attributed to the folder, not to an individual agent.
- A file preview is limited to 256 KB; snapshots to 5,000 files and 8 MB; lists to 100 changed files; cached reports to eight sources. Lazy editor/language loading avoids loading the code viewer before it is opened. Private/generated paths, links outside the source folder, private paths reached through internal links, binaries and recognizable credential content are excluded. Renaming a private file cannot expose its old Git contents through a diff. Known vault values are redacted before renderer delivery.
- Tools uses shared grid rows for headings, guides, description, fields, status and actions. Long names keep guides aligned. Unity and Meshy inputs now share a baseline. Phone setup keeps the dialog, step navigation and footer stationary; long steps scroll internally. Save name aligns with its input. Console header controls share a vertical center.
- Terminal Ctrl+C copies selected text through Electron's clipboard IPC; without a selection it retains terminal interrupt behavior. The native smoke test intercepts only the clipboard writer, preserving the user's actual clipboard while testing the renderer-to-main path.
- Kiro Free's current `(used of total covered in plan)` format is parsed. A live read returned **14.1 of 50 credits used**, 28.2%, resetting 1 November 2026. This is Kiro's estimate at the recorded observation time, not a fixed current balance. The reader retains the native V2 `/usage` command and submits no model prompt. Usage puts accounts with recorded usage first, followed by active accounts and unused installations; the same account ordering reaches the phone.
- Tool discovery returns short descriptions by default; a connection or exact tool requests schemas. Schema/connection errors retain useful, bounded, credential-redacted details. Notifications accept an omitted title. The optional web guide is fetched by topic, including the full checklist, instead of injecting the complete review into every agent session. Claude's skill-pack implementation remains present.
- Meshy preview requests pass the shared enabled/allowed/ask/budget checks before upload or paid submission. CLI preview and MCP balances use separate accounting scopes because their logins may differ. Consumption is combined against the configured budget; if both interfaces use the same billing account this can conservatively count consumption twice. The existing balance-based threshold cannot reserve an unknown future generation cost. No paid preview/model call was made during validation.
- The review tool now states its actual Chromium desktop/narrow coverage. Safari/device checks remain separate. The decorative window drag grip no longer has an invalid accessible name.

## Checks and evidence

- `npm test`: **295 tests, 294 passed, one WSL-specific skip, zero failures**. New coverage includes working-tree/turn differences, encrypted-workspace layout integration, no spawned process, private-file/path boundaries, Kiro Free parsing, tool error redaction/discovery and preview permission/budget rejection before submission.
- `npm run build`: passed. The existing main-bundle size advisory remains; editor and language chunks load separately.
- `npm run test:desktop`: all four suites passed. The assertions now check the on-demand guide and actionable error messages, rather than the removed full injection/generic error text.
- `scripts/code-panel-smoke.cjs`: passed in native Windows Electron, including a real temporary Git repository, read-only file/diff views, resize/expansion, code and terminal selection copying, and closing without ending the source console. User clipboard writes were intercepted; no test login or paid request occurred.
- `scripts/code-panel-visual-check.cjs`: Windows Chromium, desktop WebKit, Pixel 7 Chromium and iPhone 13 WebKit passed. Tested read-only selection, keyboard opening/copying, bracketed draft paste without Enter, file browsing, preserved terminals, fixed phone setup geometry, aligned guide/input positions, known-subscription ordering and page overflow. Selected axe contrast, control-label, valid-ARIA and drag-grip checks passed. Captures were inspected for text, wrapping, spacing and control placement.
- `npm install` audit: **zero vulnerabilities** across 655 packages. The prepared source runtime is Node **24.22.1**, with its pinned checksum verified; Electron is **44.9.3**. The old staged app is kept as recovery. A running-process update is separate from these source checks.

Evidence is in [the local verification folder](../.build/code-panel-20261025/): `checks.json`, `native-checks.json`, `kiro-check.json`, and the PC/Mac/Android/iPhone screenshots. Routine logs remain under `.build/code-panel-*.log`. `restart-status.json` records the eventual live update; `restart-preflight.json` records its preflight. A successful build is not proof that the running app has restarted.

Mac, Android and iPhone browser profiles are **emulated on Windows**. Real Apple fonts, VoiceOver/TalkBack, physical touch keyboards and native Android Code-panel support were not verified. The second real Codex-account sign-in remains deferred at the user's request.

## Check of the added Kiro review sections

The source review is preserved in [paddock-product-review-2026-10-25.md](paddock-product-review-2026-10-25.md), including its 12:33 additions.

| Finding | Checked status |
| --- | --- |
| Code panel | Implemented above. CodeMirror was chosen for browser/mobile selection support; this does not add the panel to the native Android app. |
| Terminal file links | Already implemented in `src/file-links.js` with a bounded file preview. Opening those links at a line in the new Code panel is still a separate improvement. |
| Themed pages/effects/account switching described as backlog | Present in current source; the live source update and second-account test are separate status items. |
| Dependency activation stuck | The current staged app uses Electron 44.9.3. Its earlier updater incorrectly treated a missing PowerShell process ExitCode as install failure. This handover prepares and tests files before quitting, then only reopens the source app. |
| First-run slogan | The quoted slogan is absent from current source. Claude's current setup work was preserved. |
| Drag-handle ARIA violation | Confirmed and fixed. |
| Account removal, plain-shell keep-awake, same-folder attribution, WSL switching | Remain limitations. No account folders were deleted, and no speculative shell-idle detection was added. |
| Worktree isolation | Strong next candidate for parallel agents: separate working directories and indexes reduce collisions. It requires explicit per-console choice and careful merge/removal behavior; the current branch rule remains in force. [Git's worktree documentation](https://git-scm.com/docs/git-worktree). |
| Web preview panel | Useful complement to Code. A future implementation should isolate web content from Paddock's privileged IPC, constrain navigation/permissions, and deliberately manage lifecycle. It is more than inserting a trusted-looking localhost URL. [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view), [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security). |
| Voice, queues, scheduling, prompt library, pre-run cost estimates | Product proposals, not implemented in this repair. An agent's future tool/token use cannot be reliably inferred from prompt length alone. Competitor exclusivity and “nobody has this” claims were not independently established and should not be published as facts. |

## Page review

Applies to Code/console grid, Tools, phone setup and Usage. Unchanged local-app disclosures and phone flows retain their existing project reviews. The reference for applicable accessibility checks is the [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/).

| Item | Status and evidence |
| --- | --- |
| 1 Privacy | Checked: local capture boundaries, memory-only code content and deliberate draft/clipboard delivery documented above; no new telemetry. |
| 2 Terms | Checked: native Kiro usage command; editor dependency licenses retained. No new subscription purchase or hosting service. |
| 3 Refunds | Not applicable: no purchase/refund flow. |
| 4 Cookies/storage | Checked: no new cookies; panel metadata uses existing encrypted workspace storage. |
| 5 Consent banner | Not applicable: no tracking technology added. |
| 6 Form consent | Checked: Follow, Copy and Add to draft require user actions; no automatic submission. |
| 7 Necessary data | Checked: bounded code capture, excluded credential paths, no login-file copying. |
| 8 Third-party SDKs | Checked: CodeMirror/Lezer run locally; languages are bundled lazy imports; no remote editor service. |
| 9 Dark patterns | Checked: explicit read-only state and working-tree/turn distinction; unknown quota remains unknown. |
| 10 Fees | Checked: paid preview guards tested with mocks; no invented token-cost estimate. |
| 11 Reviews | Not applicable: no customer testimonial added. |
| 12 Claims | Checked: source/live update separated; emulated coverage and review uncertainties recorded. |
| 13 Accessible names | Checked: labeled Code controls, decorative logos/grip, selected axe checks. |
| 14 Contrast | Checked: code palette and visible controls passed selected axe contrast checks in four profiles. |
| 15 Keyboard | Checked: opening Code and copying with keyboard, read-only selection, native controls and modal navigation; physical assistive-technology checks remain outstanding. |
| 16 Business details | Not applicable to these local settings/reading controls; existing app identity retained. |
| 17 Children's data | Not applicable: no new age-specific service or data collection. |
| 18 Unsubscribe | Not applicable: no email. |
| 19 Licenses | Checked: installed CodeMirror/Lezer license files retained; existing tool-logo credits preserved. |
| 20 Deletion | Checked: closing clears panel metadata on next workspace save; code captures are bounded memory and disappear at app exit. Provider-account removal remains a separate documented gap. |

## Security review

Scope: changed local renderer, IPC, file reader, tool bridge and preview authorization paths. “Passed” refers to the evidence in this patch, not a complete source-history or deployment audit.

| Item | Status and evidence |
| --- | --- |
| 21 Database credentials | Passed: no database connection added; private-path/content tests. |
| 22 Public env files | Passed: `.env` excluded from code browsing/capture; no web export endpoint added. |
| 23 Hardcoded keys | Passed: fixtures use synthetic values; real values stay in the existing vault. |
| 24 Authentication | Passed: provider-native login retained; no new login implementation. |
| 25 Authorization | Passed: existing sender/origin boundary plus server-side panel/source validation. |
| 26 Other users' data | Passed: explicit source root and canonical-path checks; no remote code endpoint. |
| 27 Database permissions | Not applicable: no database. |
| 28 Cloud storage | Not applicable: no new cloud storage. |
| 29 Admin routes | Not applicable: no admin service. |
| 30 Debug pages | Passed: fixtures use isolated test profiles and local test servers; production page unchanged. |
| 31 Build logs | Passed: inspected run logs; no provider raw response or credentials printed. |
| 32 Error detail | Passed: bounded bridge messages redact credentials/URLs/control characters; schema errors remain actionable. |
| 33 Repository exposure | Passed for change: no publishing or remote visibility change; no claim of a complete historical secret scan. |
| 34 Frontend secrets | Passed: renderer receives selected code after filtering/redaction, never vault keys. |
| 35 Server checks | Passed: IPC file/panel/source checks repeated in main process. |
| 36 Input validation | Passed: bounded paths, file sizes and clipboard input; malformed/stale requests rejected. |
| 37 SQL injection | Not applicable: no SQL. |
| 38 NoSQL injection | Not applicable: no NoSQL. |
| 39 XSS | Passed: escaped file names and text-only CodeMirror content; existing CSP remains enforced. |
| 40 CSRF | Passed: existing loopback authorization/origin checks retained; no new browser HTTP mutation. |
| 41 Uploads | Passed: preview permission checks precede existing upload; code reading adds no upload. |
| 42 Path traversal | Passed: traversal, absolute path, alternate stream, external junction and internal private-path tests. |
| 43 SSRF | Passed: code IPC accepts no URL; preview/provider endpoints retain fixed routing. |
| 44 Password reset | Not applicable: provider-owned login. |
| 45 Sessions | Passed: no change to bridge-token lifecycle; code panels cannot masquerade as agent sessions. |
| 46 JWT | Not applicable: no JWT added. |
| 47 CORS | Passed: no new HTTP origin or credentialed browser route. |
| 48 Rate limits | Passed: bounded snapshots, files, cache and diff computation; existing shared usage queue/cooldown retained. |
| 49 Test environments | Passed: synthetic profiles/repositories; loopback servers; no paid requests. |
| 50 Default credentials | Passed: no default password/token. |
| 51 Webhooks | Not applicable: no webhook. |
| 52 Payments | Passed: common preview authorization/budget checks; accounting limits documented above. |
| 53 Object references | Passed: panel and source IDs resolved in main; stale report IDs rejected. |
| 54 Trusted IDs | Passed: bridge owner remains server-bound; no user-supplied role. |
| 55 Sensitive logs | Passed: error-redaction regression tests and sanitized numeric Kiro verification. |
| 56 Source maps | Passed: production build emits no browser source maps. |
| 57 Dependency audit | Passed: zero vulnerabilities in the current install audit. |
| 58 Dependency versions | Passed: explicit editor dependencies, Electron 44.9.3 and verified Node 24.22.1 prepared. |
| 59 Prompt injection | Passed: files remain display data; adding context requires user selection/action and does not submit. |
| 60 Tool permissions | Passed: repaired preview bypass; disabled/ask/budget rejection before upload/submission tested. |
| 61 Database users | Not applicable: no database. |
| 62 Audit trail | Passed: revision/evidence note, runtime checksum and separate restart status; Git history unchanged. |
| 63 Monitoring | Passed for local feature: visible code errors, preserved quota freshness and restart failure/recovery notice. No hosted service added. |
| 64 Backup/restore | Passed for change: workspace restoration tests and retained old runtime/staged app; no claim of an off-machine user-data backup. |
| 65 Internal dashboards | Passed: code panel remains local; absent from mobile session listing and public serving. |
| 66 Security headers | Passed for local renderer: existing CSP retained and enforced during testing. Internet HSTS/framing headers do not apply to a new local file viewer. |
| 67 Cookies | Not applicable: no new cookies. |
| 68 Encryption | Passed: panel metadata uses encrypted workspace; selected code remains memory-only until explicit clipboard/draft action. |
| 69 Tenant isolation | Not applicable: single local desktop profile; canonical source-root checks still apply. |
| 70 Generated code | Passed: changed paths reviewed; unit, native, desktop and four-profile checks recorded above. |
