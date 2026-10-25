# Settings, Results and mobile controls

Reviewed 21 October 2026. Changes remain on `main`, based on `88409424c563967eed4c2749e9385f04fe46d64c`, without a new commit. The running production Paddock was not restarted and its consoles were preserved. This is a verified source change and Android debug build, not a published update.

## Behavior

- Desktop Settings has General, Appearance, Consoles, Devices, API, Keys, Tools and Instructions. API requests remain a separate workspace. Existing forms, encrypted key entry, phone setup and prepared tool requests remain usable.
- Results leads with the recorded console/chat name, completed prompts, summaries and saved files. Git, project and capture information is collapsed. Text files use compact cards; narrow browser layouts collapse filters and bulk actions.
- Android has separate Usage and Settings tabs. API, key and tool names and shared instructions can be read from the selected PC; configuration editing stays on the PC. The response excludes secret values, endpoint URLs, commands and key bindings. Changing PCs discards previous configuration and late replies.
- The native model/effort sheet stages choices locally. Opening, browsing, closing, cancelling, Back, outside dismissal and an unchanged Done send no terminal input. Apply requires the original connection/chat, an idle agent and empty terminal input. An effort-only change preserves the model. Reconnects stop the sequence without replay. Failed confirmation retains the choice for inspection; it does not announce success.
- The bottom row displays confirmed settings, such as **6.1 Sol / Max**. Unreported values remain Unknown. Codex effort availability comes from model metadata; Claude effort availability depends on the model. Unknown CLI layouts stop with recovery guidance.

## Ice Age Village capture diagnosis

Existing Agentdock, Nemosite and RexdecoSite reports contained `ice-age-village-research/.deps/.../INSTALLER` and `top_level.txt`. The reports were captured from the shared `Projects` folder, and the affected entries had no patch: their contents had been omitted by the snapshot budget.

Two causes were corrected: generated `.deps` metadata was included, and snapshots compared a content hash against a size/time signature when their budgets differed. Snapshots now compare compatible signatures and exclude generated dependencies, Python caches and Paddock's own `.agentdock` files. A non-Git parent workspace containing child repositories captures only its direct files, leaving sibling project folders out. Open a console in the actual project folder for automatic project diffs.

Old reports filter generated paths on load/preview. Dependency-only captures disappear from the gallery and unread count; mixed reports retain their useful changes and corrected count. Original saved reports and all Ice Age source/dependency files remain intact. The fix takes effect when the updated desktop code runs; the current app's stored gallery was not edited behind its back.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Vite build | Passed; existing large-chunk warning remains | `artifacts/interface-build.txt` |
| Node suite | 170 passed, 1 environment-dependent skip, 0 failed | `artifacts/interface-node-tests.txt` |
| Desktop suite | All four scripts passed | `artifacts/interface-desktop-tests.txt` |
| Flutter suite | 122 passed, 0 failed | `artifacts/interface-mobile-tests-final.txt` |
| Flutter analysis | No issues | `artifacts/interface-mobile-analyze.txt` |
| Android debug APK | Built; existing Firebase/Kotlin migration warning remains | `artifacts/interface-android-build.txt`, `mobile/build/app/outputs/flutter-apk/app-debug.apk` |
| Browser profiles | Eight settings categories, chat/prompt grouping, filters, keyboard expansion/Escape, collapsed diagnostics, scoped axe checks, no document overflow or page errors | `artifacts/interface-review/checks.json` |
| Native Android | Paired over loopback pinned TLS; Settings names/instructions, report and code previews, pending choices, cancellation, Apply and confirmed footer inspected | `artifacts/mobile-controls/interface-checks.json` and individual PNGs |

The emulator trace records **zero writes** through opening, choosing Max and cancelling. An explicit effort-only Apply sent five menu inputs, retained `gpt-6.1-sol`, changed `medium` to `max`, and left the PC terminal at 180 columns × 32 rows. The fixture is synthetic and uses disposable pairing data. No paid model request was made.

Regression tests also cover snapshot budget changes, non-Git sibling folders, filtering old reports without deleting originals, immutable chat attribution, same-folder chats, combined model/effort changes, preserving typed PC input, reconnect interruption, unconfirmed changes, secret exclusion and late settings replies.

## Screen coverage

| Target | Coverage | Limit |
| --- | --- | --- |
| PC | Windows Chromium and Electron; Settings categories, Results and details inspected | Actual Windows engine; synthetic UI fixtures |
| Mac | Playwright WebKit with Desktop Safari profile; screenshots inspected | Emulated on Windows; actual macOS fonts/Safari remain unchecked |
| Android browser | Chromium Pixel 7 profile; screenshots inspected | Emulated browser; separate native testing below |
| iPhone browser | WebKit iPhone 13 profile; screenshots inspected | Emulated; actual iPhone Safari/font rendering remains unchecked |
| Native Android | AgentDock_Test emulator; portrait, large text and landscape captures | No physical Android device or TalkBack session in this run |

All eight Settings views were compared in contact sheets for each browser profile, with individual screenshots inspected for text, wrapping, spacing, icon alignment and result hierarchy. The browser screenshot index and contact sheets are in `artifacts/interface-review`. Native screenshots are in `artifacts/mobile-controls`. iPhone native support was not added.

The remaining functional check is a physical Android phone against the user's current Codex/Claude CLI menus and account. The synthetic fixture verifies the interaction and transport, not every provider/version/menu variant. No real Firebase push or public internet pairing was exercised in this change.

## Page review

This table covers desktop Settings (all categories), Results/list/details, Android Settings and model/effort controls. Checked means reviewed within this change's stated scope; it is not legal or accessibility certification.

| Item | Status | Page evidence or reason |
| --- | --- | --- |
| 1. Privacy policy | Checked for changed data; release review remains | The linked [setup/privacy guide](android-setup.md#data-use-and-privacy) now describes PC configuration names/instructions on the paired phone. It documents storage, recipients, retention and deletion. Distribution-specific owner/jurisdiction details remain for the owner; [EU transparency guidance](https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en) was consulted. |
| 2. Terms | Not applicable to new flows | No hosted account, purchase or service contract was added. Existing user-selected provider terms still apply. Distribution/license work is recorded in item 19. |
| 3. Refunds | Not applicable | Settings, Results and console controls sell nothing. |
| 4. Cookies/storage | Checked | No browser tracking storage was added. PC settings/Results stay local; pairing and drafts use existing secure storage. Pending choices are in memory. The guide describes existing retention. |
| 5. Cookie consent | Not applicable to changed browser views | No advertising, analytics, tracking cookies or external fonts were introduced. Existing native SDK review is separate below. |
| 6. Form consent | Checked | Model/effort changes require Apply; browsing and cancellation send nothing. Existing optional phone setup and key-entry purpose remain visible. No marketing consent or extra personal fields were added. |
| 7. Data minimization | Checked | Authenticated settings responses whitelist names/protocol/enabled state/instructions. Keys, URLs, commands and bindings are excluded by unit and transport tests. Capture skips generated/private paths. |
| 8. Third-party SDKs | Needs work for distribution | No SDK/dependency was added. The existing inventory covers Firebase Messaging, ML Kit, secure storage, xterm and explicit browser links. Current [Firebase privacy](https://firebase.google.com/support/privacy) and [ML Kit terms/privacy](https://developers.google.com/ml-kit/terms) were consulted. Physical-device traffic and store disclosures still need review. |
| 9. Dark patterns | Checked | Pending choices, explicit Apply, functional Cancel/Back and unchanged Done. No silent model switch or automatic command replay. |
| 10. Fees | Not applicable to new flows | No purchase flow. Existing API estimates/provider billing remain separate. Changing model/effort can affect the user's provider usage; no new paid request runs while browsing settings. |
| 11. Reviews | Not applicable | No testimonials or customer reviews. Test content is labeled synthetic. |
| 12. Claims | Checked | Reports distinguish source/build verification, emulation and real-device checks. No claim of production, legal or accessibility certification. |
| 13. Alternative text | Checked | Result previews retain title-based accessible names; decorative icons remain decorative. Category buttons, chooser fields and icon controls have labels. Scoped axe checks passed. |
| 14. Contrast | Checked within changed states | Scoped browser contrast checks passed. Native blue/pink/muted text samples measure 11.04:1, 10.32:1 and 10.08:1 against their backgrounds; see `native-contrast.json`. Focus/selection/error use existing visible states. [WCAG 2.2 guidance](https://www.w3.org/WAI/WCAG22/quickref/) informed the check; full platform accessibility testing remains outstanding. |
| 15. Keyboard | Checked in tests; device review remains | Category Tab order, native dropdowns, cancellation, code expansion and Escape were tested. Desktop tests cover forms, dialogs, focus return and console key preservation. Physical phone keyboard and TalkBack remain unchecked. |
| 16. Business details | Needs work before commercial distribution | The brief describes a local FOSS utility. Legal entity, sales jurisdiction and commercial contact obligations are not established by this change. No identity details were invented. |
| 17. Children's data | Not applicable to changed flows | The audience is people managing development/agent consoles. No child-directed flow, age collection or new child data handling was introduced. |
| 18. Unsubscribe | Not applicable | No email/marketing messages. Existing notification controls and phone revocation remain available. |
| 19. Asset licenses | Needs work for distribution | No new artwork, fonts or dependencies. Existing system fonts and provider/tool icons were retained; a complete distribution license/brand-rights inventory was not verified here. Android retains its open-source license view. |
| 20. Deletion | Checked for local data | Existing Results deletion removes saved copies and preserves project originals; failure keeps entries available to retry. Keys/phone removal and forget controls remain. Filtering old capture noise does not erase saved originals. Provider-held data uses the provider's own process, as the guide explains. |

## Handover

Open Results for selected screenshots, the source patch and this report. A desktop/mobile update is still needed to run these changes in the installed apps. The running Paddock, other projects, live consoles, formal planning approvals and milestone flags were left intact. The reviewable source patch records the current branch and base commit without staging or committing unrelated files.
