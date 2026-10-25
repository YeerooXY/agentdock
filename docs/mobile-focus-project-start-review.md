# Preview 5: terminal scrolling and new projects

Verified 18 October 2026, on Windows. No paid AI calls or user projects were used.

## Changes

- Android's terminal previously requested keyboard focus on touch-down, before a slow swipe became a scroll. `mobile/lib/main.dart` now allows terminal focus only through the keyboard button. Touching the terminal returns to reading, keeps any message draft, and prevents the keyboard reopening after Android Back. The keyboard button stays visible beside the scrolling key row.
- New projects ask for goals, name, category and folders. Approach, next step, milestones, notes and status appear only when editing an existing project. Hidden fields are disabled and excluded from submission; saved project data remains available. `src/projects-ui.js` also restores focus to the actual opener after closing the dialog, including in WebKit.
- Android preview 5 works with Windows preview 4 or 5. Windows preview 5 adds the simpler project form. Downloads and update instructions are at the top of the README.

## Verification

| Check | Result |
| --- | --- |
| Original slow-touch reproduction | Failed before the fix: keyboard visible after 150 ms, before dragging. |
| Flutter analysis | Passed; no issues. |
| Flutter tests | 21 passed, including five new checks for slow vertical/horizontal scrolling, taps, long presses, explicit direct input, keyboard dismissal and draft retention. |
| Android release builds | ARM64, ARMv7 and x86_64 built successfully. |
| Android API 35 emulator | 13 checks passed on the installed APK: in-place upgrade retained pairing, touch gestures kept the keyboard closed, the keyboard button opened input, touchscreen keys reached a real isolated Windows console, Back dismissal held, and composer drafts survived scrolling. |
| Node tests | 105 passed, one environment-dependent WSL test skipped. |
| Desktop smoke suites | All four passed using disposable profiles. |
| Project integration | Goals-only planning at creation, later editing, saved progress, project instructions, subfolders and console launch passed. |
| Windows release | Installer built; packaged setup, runtime, terminal, MCP, completion and session restore checks passed. |
| Project renderer | Windows Chromium, Mac Safari/WebKit profile, Android Chrome/Pixel 7 profile and iPhone Safari/WebKit profile passed. New/edit screenshots inspected in all four. No selected axe contrast, label, button-name or dialog-name violations; no horizontal overflow. |

Browser checks used the actual renderer with an isolated fixture bridge. Mac, Android-browser and iPhone-browser checks were emulated on Windows. They do not prove physical-device input or macOS/iOS font rendering. The native Android APK was tested separately in an Android emulator; there is no iPhone app.

Evidence is in `artifacts/mobile-focus/` and `artifacts/projects/`, with selected individual screenshots and this report saved to Paddock Results. Pairing codes and test profiles are excluded from published evidence.

Remaining checks: a physical phone with its usual keyboard; TalkBack and physical external keyboards. Rapid `adb shell input text` injection duplicated characters in xterm, while tapping the emulated touchscreen keyboard passed. Rapid/hardware input needs a separate investigation; this release does not claim to fix it. Existing Kotlin/SDK toolchain warnings remain, although all APKs built. No live Firebase or off-Wi-Fi checks were repeated.

## Page review

Scope: Projects and its new/edit dialogs; the native terminal interaction. Existing data flows and integrations were retained. This records checks for this change, not legal or accessibility certification.

| Item | Status and reason |
| --- | --- |
| 1. Privacy information | Checked: [project storage and sharing](projects-and-updates.md) and [phone privacy](android-setup.md#data-use-and-privacy) describe local records and agent/paired-phone access. No new data destination. |
| 2. Terms | Not applicable to these controls: no hosted service or contract acceptance introduced. |
| 3. Refunds | Not applicable: no sales or checkout. |
| 4. Cookies/storage | Checked: project JSON and phone pairing storage remain as documented; no browser cookie added. |
| 5. Cookie banner | Not applicable: no nonessential browser tracking introduced. |
| 6. Form consent | Checked: explicit project save and input actions; no marketing checkbox or new consent collection. |
| 7. Necessary data | Checked: creation collects fewer planning fields; credentials still belong in Keys. |
| 8. Third-party SDKs | Checked for this change: no new dependency or SDK; xterm uses the existing focus API. Existing optional mobile SDK review is in [Android verification](android-review.md). |
| 9. Dark patterns | Checked: close/Escape, optional category and later planning remain available; no forced AI call or signup. |
| 10. Fees | Not applicable: neither creating a project nor scrolling starts a paid request. Existing provider charges remain separate. |
| 11. Reviews | Not applicable: no testimonials or customer reviews. |
| 12. Claims | Checked: emulator limits, signing, compatibility and outstanding input checks are explicit. |
| 13. Accessible names | Checked: form labels, dialog name, close control and keyboard tooltip retained; no new image asset. |
| 14. Contrast | Checked: selected axe scans passed in all four renderer profiles; existing focus colors retained. See [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). |
| 15. Keyboard navigation | Checked: initial name focus, hidden controls excluded, Escape and return to opener passed. Native touch/Back checked separately. See [W3C focus-order guidance](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html). Full assistive-technology testing remains open. |
| 16. Business details | Not applicable: no merchant or hosted business service introduced by these local controls. |
| 17. Children's data | Not applicable to this change: no child-directed feature or new age/personal-data collection. |
| 18. Email unsubscribe | Not applicable: no email sent. |
| 19. Asset rights | Checked: existing fonts/icons reused; no downloaded or generated art added. |
| 20. Deletion | Checked: existing project removal remains under Edit and passed the smoke test; it removes metadata, not project files or copies already supplied to agents. This limitation is documented. |
