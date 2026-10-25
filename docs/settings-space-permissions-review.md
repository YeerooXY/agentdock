# Settings layout and mobile terminal prompts

Verified 22 October 2026 on `main`, based on `88409424c563967eed4c2749e9385f04fe46d64c`. Earlier uncommitted work is preserved. No commit, production installation or restart of the user's running Paddock/consoles was made.

## Settings

The previous desktop layout capped settings at 850px, stacked every section and used 10px supporting text. The user selected the generated larger-text, two-column concept in Results before implementation.

General now places Desktop/Shortcuts alongside Startup/Projects/Results, with a compact Updates row. Consoles uses independent columns for defaults/keyboard and grid/agents. Categories sit across the top. Narrow layouts stack sections and wrap navigation and form controls.

All eight desktop/browser Settings categories use 15px controls, 16px toggle labels, 14px supporting text and 20px section headings. Existing colors, forms, storage and actions are retained. Fields and buttons have room for enlarged text. The desktop layout uses the available content width, capped at 1480px for very wide windows.

The design uses adjacent content regions and a full-width content area, comparable to [Primer PageLayout](https://primer.style/product/components/page-layout/); the implementation retains Paddock's own components. [W3C reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) informed the narrow/enlarged-text checks. Sources checked 22 October 2026.

The generated concept is `artifacts/settings-permissions/settings-concept.png`; its built-in image-generation prompt is saved alongside it. It is a proposal approved for direction, not a screenshot of working code. Actual captures are under `artifacts/settings-permissions/browser/`.

## Mobile permission prompts

Removing the old key toolbar left startup trust menus and other CLI dialogs without an obvious way to send arrows, an empty Enter or Escape from the phone. The chat composer submits messages with paste handling and requires nonempty text.

**Terminal keys** now opens a separate manual input sheet beneath the terminal. With chat open, its keyboard icon sits beside the model controls. The sheet shows the original console, its folder when supplied by the PC, and the live active terminal screen. Its output area scrolls when needed.

- Up/Down navigate; Enter confirms the selected CLI choice; Esc cancels where supported. Left/Right, Tab, Space and Ctrl+C support other terminal dialogs. Application cursor mode is respected.
- Reply text sends raw text on **Type text**, with no automatic Enter or chat paste markers. An answer such as `y` reaches a one-key prompt without an extra submission.
- Opening/closing the sheet sends zero input. Each action sends one acknowledged input to the original console. Pending input disables further actions; failures retain text and show recovery guidance.
- Switching PC, console, provider or chat, reconnecting, ending the console, replacing its terminal or backgrounding the app disables the original sheet. Input is not replayed.
- The ordinary chat draft remains separate. Folder trust remains the user's manual choice; no trust configuration or permission mode is changed.

This uses the existing authenticated terminal transport for every harness and shell. It does not depend on a particular prompt wording or a hook firing before startup. [Claude's security documentation](https://code.claude.com/docs/en/security) and [interactive controls](https://code.claude.com/docs/en/interactive-mode) were consulted on 22 October 2026. Tests use synthetic prompts rather than granting real folder access or submitting AI work.

## Verification

| Check | Outcome | Evidence |
| --- | --- | --- |
| Vite build | Passed; existing large-chunk warning remains | `artifacts/settings-permissions/build.txt` |
| Node tests | 179 passed, 1 skipped, 0 failed | `artifacts/settings-permissions/node-tests.txt` |
| Full desktop suite | All four scripts passed, including settings persistence, forms and navigation | `artifacts/settings-permissions/desktop-tests.txt` |
| Flutter tests | 139 passed, including 17 new terminal-key tests | `artifacts/settings-permissions/mobile-tests.txt` |
| Flutter analysis | No issues | `artifacts/settings-permissions/mobile-analyze.txt` |
| Android debug APK | Built; existing Kotlin/SDK migration warnings remain | `artifacts/settings-permissions/android-build.txt`; `mobile/build/app/outputs/flutter-apk/app-debug.apk` |
| Browser profiles | All eight Settings categories, 14px minimum visible text, scoped contrast/names, keyboard category navigation, no overflow/page errors, 320px reflow with doubled text | `artifacts/settings-permissions/browser/checks.json` |
| Native Android emulator | Folder allow/cancel/Escape, changed-target rejection, other harness/tool prompt and raw `y` reply passed over pinned loopback TLS | `artifacts/settings-permissions/native-checks.json` and individual PNGs |

Native transport traces show zero inputs on opening, exactly Down+Enter for the cancel choice, one Enter for allow, one Escape for cancellation and one `y` for a yes/no response. The host terminal retained 180 columns. Widget tests also cover five providers, preserved chat drafts, failed delivery, double presses while pending, stale targets, application cursor mode and large-text/keyboard layouts at portrait and landscape widths.

## Screen coverage and limits

| Target | Coverage | Remaining manual check |
| --- | --- | --- |
| Windows PC | Actual Windows Chromium and Electron; all category captures/contact sheets reviewed, selected screens inspected at full size | Normal use in the updated installed build |
| Mac | Desktop Safari WebKit profile on Windows; category captures reviewed | Physical Mac Safari and actual macOS font rendering |
| Android browser | Pixel 7 Chromium profile; category captures reviewed | Physical Android Chrome |
| iPhone browser | iPhone 13 WebKit profile on Windows; category captures reviewed | Physical iPhone Safari and actual iOS font rendering |
| Native Android | Updated debug APK in AgentDock_Test emulator; permission controls inspected and exercised | Physical phone against current provider CLI prompts; TalkBack |

Browser phone/Mac checks are emulated. The native fixture models folder, tool and yes/no prompts; it verifies UI and transport, not every provider/version or account-specific prompt. The test emulator and fixture were shut down afterward. The user's app, consoles, accounts and physical devices were not restarted or modified.

## Page review

All 20 items cover the changed Settings categories and native terminal-key sheet. Unchanged policies, data flows and distribution review items are recorded in the [previous Settings review](settings-results-controls-review.md#page-review). These checks do not certify legal or accessibility compliance.

| Item | Status | Evidence or reason |
| --- | --- | --- |
| 1. Privacy policy | Checked for changed data | Settings storage/recipients are unchanged. Reply text uses the existing paired-PC terminal connection only after an explicit action; no new service receives it. Existing privacy documentation/release review remains applicable. |
| 2. Terms | Not applicable | No hosted account or contractual flow is added. User-selected provider terms remain applicable. |
| 3. Refunds | Not applicable | These screens sell nothing. |
| 4. Cookie/storage policy | Checked | No new browser or persistent phone storage. Pending reply text lives in the sheet; existing settings and drafts retain their lifecycle. |
| 5. Cookie consent | Not applicable | No new tracking, advertising or nonessential browser storage. |
| 6. Form consent | Checked | Each terminal input requires a key or Type text action. Opening/cancelling sends nothing. No marketing or personal-data fields are added. |
| 7. Data minimization | Checked | Existing authenticated transport is reused. No production terminal text, keys or account data is saved by these tests. All test traces use a synthetic fixture. |
| 8. Third-party SDKs | Checked for this change | No dependency/SDK changes. Existing Firebase/ML Kit distribution review remains in the previous review. |
| 9. Dark patterns | Checked | Trust remains manual; cancel keys are visible. Stale targets stop input. No silent approval, mode change or reconnect replay. |
| 10. Fees | Not applicable to changed flow | No purchase or new provider request is added. Tests submit no paid AI work. |
| 11. Reviews | Not applicable | No testimonials or customer claims. Test output is labelled synthetic. |
| 12. Claims | Checked | Source/build, generated concept, emulated profiles and physical-device limits are distinguished. No production deployment is claimed. |
| 13. Accessible names | Checked within scope | Existing labelled settings forms retained; scoped axe checks pass. Terminal controls use text labels/tooltips and native buttons. |
| 14. Contrast | Checked within scope | Scoped browser contrast checks pass across all categories/profiles. Native controls retain the existing high-contrast palette and disabled states. Full platform assessment remains a release check. |
| 15. Keyboard navigation | Checked within scope | Category Tab order and existing desktop form/dialog checks pass. Terminal-key sheet uses native focusable fields/buttons; device screen-reader review remains outstanding. |
| 16. Business details | Not applicable to this change | No commerce or identity flow is added. Existing distribution-owner questions remain documented in the previous review. |
| 17. Children's data | Not applicable | No child-directed feature, age collection or new personal-data flow. |
| 18. Unsubscribe | Not applicable | No email or marketing messages. Existing notification controls remain available. |
| 19. Asset licenses | Checked for this change | No new shipped art, fonts or dependencies. Generated concept is a review artifact. Existing distribution/license inventory remains in the previous review. |
| 20. Deletion | Checked for this change | No new retained record is added. Existing Results/key/phone removal remains unchanged; sheet disposal releases its pending reply controller. |

## Handover

Open Results for the accepted concept, actual screenshots, task-only source patch and verification summary. The patch compares against a pre-task snapshot, preserving earlier Settings/Results/mobile changes. Desktop and Android updates are still required to use the new code in installed apps.
