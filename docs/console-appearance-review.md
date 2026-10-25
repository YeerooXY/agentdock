# Console appearance verification

24 October 2026. Branch `main`, base `88409424c563967eed4c2749e9385f04fe46d64c`, uncommitted source. Turn `dc01771a-5d91-49a0-a817-3934a229472f`. Existing changes and `HANDOFF.md` were preserved; no reset, stash, branch change or commit. This change has been built locally. The user's running Paddock was not restarted or repackaged.

## Behavior

- Rounded frames, tinted headers and soft colored edges follow the supplied screenshot. A color button in each header opens a native dialog. Choose the default, accent colors, Blue, Violet, Hot pink, Redline or RGB. Apply saves; Cancel and Escape discard. Colors follow moves, swaps and resizing, survive restart, and remain on the empty holder after ending its console.
- RGB frames and accents inherit one clock, including newly opened consoles. Redline frames share their pulse. Ready, attention and error borders retain status colors and text indicators.
- Empty panels contain 48 stars, with 12 animated. Turning stars off fades the existing sky and pauses its twinkle. Native switches animate their thumb and track. Save failures restore a switch's previous value; keyboard focus returns after saving.
- Console animations covers the existing opening shockwave and a 240 ms closing fade/shrink. Closing animates an inert snapshot after the host reports the end. The snapshot has unique IDs, no action attributes, copied terminal canvases, and a cleanup timeout. Other sessions remain mounted. Cancellation, hide and collapse do not end sessions. Reduced motion disables opening/closing effects, cycling colors and twinkle, and makes switches instant.
- Removed redundant Appearance help: ?Off keeps the console cursor steady? beneath ?Blink cursor.? The user was notified before editing.
- Console-to-console handoff remains recorded in `HANDOFF.md`. It has not been implemented in this appearance pass.

## Checks

| Check | Outcome | Evidence |
| --- | --- | --- |
| Build | Passed; existing bundle-size warning | `artifacts/console-appearance-build.log` |
| Node tests | 220 passed, 1 environment-dependent skip, 0 failed | `artifacts/console-appearance-unit.log` |
| Desktop suite | All four scripts passed: smoke, workbench, layout, setup | `artifacts/console-appearance-desktop.log` |
| Real Electron appearance test | IPC validation, persistence, restart, moves/swaps, resizing, default reset and collapse preserving processes passed | `scripts/appearance-persistence-check.cjs`, `artifacts/console-appearance-persistence.log` |
| Browser behavior | All four profiles passed with normal and reduced motion | `scripts/trim-visual-check.cjs`, `artifacts/console-appearance/checks.json` |
| Accessibility checks | Scoped axe contrast, labels, button/dialog names passed; native radio keyboard selection, Escape/focus return, switch keyboard focus, save failure/retry checked | Same browser script and screenshots |
| Motion | RGB phase survives late mounting; inherited accents match; closing snapshot fades, is inert and cleans up; opening/closing opt-out checked | Same browser script |
| Responsive | Desktop, 768 px tablet and 320 px widths; phone profiles; large root text check; no document overflow | `artifacts/console-appearance/*` |
| Dependency audit | Needs work: full tree reports 4 high and 1 moderate entries, 0 critical | `artifacts/console-appearance-audit-all.json` |
| Source review | Task diff checked against `artifacts/appearance-before`; generated code read; whitespace check passed | Source and Git diff |

The first desktop run still asserted the old fixed blue/purple palette; the assertion now checks inherited accent colors, the active edge and the ready border. WebKit animation checks now sample transitions synchronously and observe opening events, avoiding short animations finishing between browser calls. Native Safari mouse clicks do not always focus controls; the keyboard test explicitly focuses and presses Space.

## Rendered coverage

| Target | Coverage | Selected evidence |
| --- | --- | --- |
| PC | Windows Chromium plus real Electron on Windows | [Frames](../artifacts/console-appearance/pc-frames.png), [picker](../artifacts/console-appearance/pc-colors.png), [Appearance](../artifacts/console-appearance/pc-appearance.png) |
| Mac | WebKit with Desktop Safari profile, emulated on Windows | [Frames](../artifacts/console-appearance/mac-frames.png), [picker](../artifacts/console-appearance/mac-colors.png) |
| Android | Chromium Pixel 7 profile, emulated | [Frames](../artifacts/console-appearance/android-frames.png), [picker](../artifacts/console-appearance/android-colors.png) |
| iPhone | WebKit iPhone 13 profile, emulated | [Frames](../artifacts/console-appearance/iphone-frames.png), [Appearance](../artifacts/console-appearance/iphone-appearance.png) |

Screenshots were inspected for icon alignment, framing, spacing, text wrapping, focus and overflow. Long console names truncate inside their editable name field; terminal text wraps inside the frame. Actual macOS/iOS fonts and emoji, physical touch/keyboard behavior, VoiceOver and TalkBack remain unchecked. These are desktop renderer checks in mobile browser profiles, not a new native mobile build. Synthetic error toasts in screenshots come from deliberate save-failure tests.

## Dependency follow-up

Security checklist items 57?58 need work. `package-lock.json` contains the following existing versions. No dependencies or lockfile entries were changed by this appearance work. The earlier production-only audit returned zero, but the full audit includes Electron and bundled tool dependencies classified as development dependencies; the full result is the relevant limitation.

| Location | Installed | Fix / follow-up |
| --- | --- | --- |
| Electron | 44.7.2 | Update within the 44 line to 44.9.1 or a later patched version and rerun desktop/package tests. [Maintainer advisory](https://github.com/advisories/GHSA-jr5w-w6x2-84p9). |
| Meshy MCP ? Express ? body-parser; MCP SDK ? Express ? body-parser | 1.20.8 and 2.3.0 | Refresh compatible parents/lock entries to body-parser 1.20.9 and 2.4.0 or later patched versions. [Maintainer advisory](https://github.com/advisories/GHSA-27r3-jxmh-p828). |
| Meshy MCP 0.6.4 ? Zod | 3.25.76 | Audit flags versions before 4.6.6. Review a Meshy release using a patched compatible Zod; do not force a major Zod override without testing its API compatibility. npm reports no automatic fix for this chain. [Advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). |
| Bundled npm ? proxy agent ? socks ? ip-address | 10.7.2 | Update the bundled npm dependency tree to ip-address 10.7.4 or a later patched version. [Maintainer advisory](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5). |

Paddock sent a needs-attention notification naming the location and fixes. These are dependency audit findings; no exploit was attempted against a live process. Meshy compatibility review is already in the handoff work list.

## Page review

Scope: console grid, frame-color dialog, expanded console frame and Appearance settings. Statuses describe this local UI change; they do not certify the whole product or a hosted deployment. Guidance checked against [WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/). Existing release/distribution work remains in the project handoff.

| Item | Status | Evidence / reason |
| --- | --- | --- |
| 1 Privacy policy | Checked | Added storage is a slot-to-palette preference in local settings. No new personal-data collection or recipient. |
| 2 Terms | Not applicable | No service contract or terms change in local appearance controls. |
| 3 Refunds | Not applicable | No sale or cancellation flow. |
| 4 Cookies/storage | Checked | No browser cookies or tracking storage added; preferences use existing local settings persistence. |
| 5 Cookie consent | Not applicable | No new nonessential tracking. |
| 6 Form consents | Checked | Color choices stage locally until Apply; Cancel/Escape send no save. No personal-data form. |
| 7 Data minimization | Checked | Only validated palette identifiers and existing slot/session identity are sent. |
| 8 Third-party SDKs | Checked | No SDK, font, analytics or remote asset added. Existing dependency findings are below. |
| 9 Dark patterns | Checked | Working cancel/default reset, no forced extras or hidden actions. |
| 10 Fees | Not applicable | No payment or paid model call. |
| 11 Reviews | Not applicable | No testimonials. Fixtures are labeled. |
| 12 Claims | Checked | Evidence distinguishes synthetic renderer tests, real Electron and emulated devices. |
| 13 Alternative text | Checked | Color buttons have names; swatches and stars are decorative; snapshot is aria-hidden and inert. |
| 14 Contrast | Checked | Scoped axe checks on dialog and Appearance pass; status retains text and existing semantic colors. |
| 15 Keyboard | Checked | Radio navigation, Escape, focus return, switch Space/save, retry and closed-slot focus tested. Real assistive technology remains unchecked. |
| 16 Business details | Not applicable | No new commercial page or identity claim. |
| 17 Children's data | Not applicable | No age/child data flow introduced. |
| 18 Unsubscribe | Not applicable | No marketing email. |
| 19 Asset licenses | Checked | Frames/stars/swatches are CSS; existing system fonts and icon sources retained. No new licensed asset. |
| 20 Deletion | Checked | Use default removes the selected local color override. No additional personal record. |

## Security review

Reviewed the changed renderer, main-process dispatch and settings helper. Existing IPC checks sender, main frame and entry URL; the BrowserWindow retains context isolation, sandboxing, disabled Node integration and web security. These controls follow the [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security). N/A refers to this appearance change, not a claim that every other feature lacks those data flows.

| Item | Status | Evidence / reason |
| --- | --- | --- |
| 21 Database credentials | Not applicable | No database access or credentials in new modules. |
| 22 Public .env | Passed | `.env*` ignored; no env files in generated dist. No web deployment added. |
| 23 Hardcoded API keys | Passed | Changed modules contain palette constants, not keys. |
| 24 Authentication | Not applicable | No login flow; local IPC continues to check renderer identity. |
| 25 Authorization | Passed | New slot.trim uses existing trusted-renderer gate and validates current slot/session. |
| 26 Other users' data | Not applicable | No remote or multi-user data access added. |
| 27 Database permissions | Not applicable | No database. |
| 28 Cloud storage | Not applicable | No cloud storage. |
| 29 Admin routes | Not applicable | No new network route. |
| 30 Debug pages | Passed | Verification serves synthetic dist only on loopback in disposable processes; no debug page shipped. |
| 31 Build logs | Passed | Inspected new build/test logs; no credential output added. |
| 32 Verbose errors | Passed | New validation errors are action-specific; UI displays message text, not stacks. |
| 33 Repository leaks | Not applicable | No publishing or visibility change; full Git history was not re-audited. |
| 34 Frontend secrets | Passed | New renderer constants are public palette/UI values. |
| 35 Client-only checks | Passed | Main process repeats style, grid bounds and slot identity checks. |
| 36 Input validation | Passed | Allowlisted styles, integer slots, bounds, stale-console rejection; unit and real IPC tests. |
| 37 SQL injection | Not applicable | No SQL. |
| 38 NoSQL injection | Not applicable | No database query object. |
| 39 XSS | Passed | New template content uses fixed labels/integers; dynamic title uses textContent; no eval. |
| 40 CSRF | Not applicable | No HTTP mutation added; IPC rejects other senders/frames/URLs. |
| 41 Uploads | Not applicable | No uploads. |
| 42 Path traversal | Passed | Color input cannot choose a file path; existing atomic writer targets fixed settings.json. |
| 43 SSRF | Not applicable | No network fetch in new modules. |
| 44 Password reset | Not applicable | No passwords. |
| 45 Session management | Passed | Appearance does not write terminal input or end processes; collapse and other-console survival tested. |
| 46 JWT secrets | Not applicable | No JWT. |
| 47 CORS | Not applicable | No new web API. |
| 48 Rate limits | Not applicable | Local preference save only; no new remote/AI endpoint. |
| 49 Staging | Passed | Temporary profiles and synthetic state only; test artifacts ignored by Git. |
| 50 Default credentials | Not applicable | No credential flow. |
| 51 Webhooks | Not applicable | No webhook. |
| 52 Payments | Not applicable | No payment. |
| 53 Direct object references | Passed | Stale/wrong session IDs cannot recolor the console now occupying a slot. |
| 54 Trusted IDs/roles | Passed | Main process checks requested session against its own live slot inventory. |
| 55 Sensitive logs | Passed | Added tests log outcomes and synthetic data; no terminal content or private messages logged by appearance modules. |
| 56 Source maps | Passed | Generated dist has no .map files. |
| 57 Dependency vulnerabilities | Needs work | Full audit: 4 high and 1 moderate entries; versions, locations and fixes above. Notification sent. |
| 58 Outdated packages | Needs work | Installed Electron and tool transitive packages need the patched versions listed above. |
| 59 Prompt injection | Not applicable | No AI instruction or handoff delivery implemented; palette strings are data. |
| 60 AI permissions | Passed | Existing tool/confirmation controls untouched; no paid requests in tests. |
| 61 Database user rights | Not applicable | No database. |
| 62 Audit logs | Not applicable | No deployment or sensitive action added; local palette edits are reversible. |
| 63 Monitoring | Not applicable | No hosted service added. |
| 64 Backup/restore | Passed for changed preferences | Real Electron restart preserves colors. No user-work storage changed; off-machine project backup was not assessed. |
| 65 Internal dashboards | Passed | Appearance stays within the existing local Electron renderer; no public hosting. |
| 66 Security headers | Passed for local renderer | Existing CSP and sandbox/security settings retained. HTTP hosting headers are not applicable to file-loaded desktop UI. |
| 67 Cookie flags | Not applicable | No new cookies or web sessions. |
| 68 Encryption | Not applicable to colors | New values are nonsensitive local preferences. Existing vault encryption is untouched; desktop suite checks DPAPI. |
| 69 Tenant isolation | Not applicable | No multi-tenant feature added. |
| 70 Generated code | Passed | Source inspected, task diff reviewed, build/unit/desktop/browser and persistence checks completed. |
