# Mobile usage and automatic Results — preview 6

Reviewed 18 October 2026. Native Android Usage/Console and the desktop Settings → Results control. No paid model requests, real account usage, router changes or live push messages were used in verification.

## What changed

- Usage opens with separate account cards and pink-blue bars for each reported window. Percentages are not added across consoles or accounts. Unknown, invalid, stale and expired-reset readings remain explicit; a passed reset does not manufacture a fresh quota.
- Refresh works by button, pull gesture and after reconnection. Failed refreshes keep the last readings and show an error. API estimates remain separate, limited to Paddock requests over the last 30 days.
- Console borders, focused inputs and Send follow the existing pink-blue palette. The scrolling/focus behavior from preview 5 is preserved.
- Settings → Results → **Automatically save results** defaults on and persists locally. Off prevents new automatic snapshots, diffs and image copies, discards unfinished captures, and leaves explicitly saved/imported files available. Re-enabling applies to the next turn. MCP context reports when capture is off. Logical turn IDs and ready notifications still work.
- Firebase remains the implemented optional background-alert transport. The [Android guide](android-setup.md#can-alerts-work-without-firebase) explains direct connections and UnifiedPush as possible future options, not shipped features.

## Verification

| Check | Outcome |
| --- | --- |
| Flutter analysis | Passed, no issues |
| Flutter tests | All 21 existing tests and 10 usage tests passed; full run before reconnect addition, focused usage suite afterward |
| Usage cases | Independent window values, malformed/unknown readings, stale state, passed reset, zero/full bars, failed refresh, retry, pull-to-refresh, reconnect, dispose during request |
| Text and size | Widget checks at 320, 393 and 800 logical pixels with 200% text; no layout exceptions |
| Node suite | 108 passed, one environment-dependent WSL Claude check skipped |
| Desktop smoke suites | All four passed |
| Results setting integration | Real Electron, local MCP bridge and unpaid PowerShell: disable, manual save, ready notification, re-enable, cancel active capture, reload and app restart |
| Packaged Windows smoke | Passed: installer output app, real PTY, bundled runtime/MCP, setup, completion and restore |
| Android packaging | ARM64, ARMv7 and test-only x86_64 release builds passed; same signing certificate as preview 5 |
| Android emulator | API 35, installed preview 6; saved pairing retained, usage and refresh, background/resume, real Windows command submission, scroll without reopening keyboard, normal and 200% text screenshots |
| Desktop setting visual check | Windows Chromium; WebKit with Mac Safari profile; Chromium with Pixel 7 profile; WebKit with iPhone 13 profile. Keyboard toggle, labels, selected contrast checks, overflow and page errors passed |

The browser checks exercise the desktop HTML renderer, not a phone web app. Mac/Android/iPhone browser coverage is emulated on Windows. The native phone app was tested in an Android emulator, not on a physical phone. Real Safari font rendering, physical touch behavior and TalkBack still need device checks. Firebase delivery and alternative push transports were not tested. Existing rapid hardware-key injection duplication in xterm is outside this change; the composer Send check passed.

The initial desktop visual fixture omitted terminal-buffer data and showed a fixture-only toast. The fixture was corrected and all four screenshots/checks rerun. An initial native command assertion read the fixture's one-second mirror before it updated; the subsequent buffer contains the executed command and output.

## Visual evidence

Local screenshots were inspected and saved individually to Paddock Results:

- `artifacts/mobile-device/usage-bars-preview6.png`: sample accounts, real native rendering, independent limits, stale and unknown states.
- `artifacts/mobile-device/usage-console-preview6.png`: console border, input and Send styling.
- `artifacts/mobile-device/usage-large-text-preview6.png`: 320 logical pixels with Android font scale 2.0.
- `artifacts/results-setting/{pc,mac,android,iphone}-settings.png`: automatic Results control on four browser profiles.
- `artifacts/results-setting/native-checks.json` and `visual-checks.json`: integration and browser outcomes.

## Required page review

This covers the affected native screens and desktop Settings section; it is not a legal or accessibility certification.

| Item | Status | Scope and reason |
| --- | --- | --- |
| 1. Privacy policy | Checked | Existing setup/privacy guide remains reachable. It now describes the capture opt-out and notification choices. No new remote data flow. |
| 2. Terms | Not applicable | These local settings do not introduce a hosted service, sale or account contract. |
| 3. Refund policy | Not applicable | No purchase or refund flow. |
| 4. Cookies/storage | Checked | Toggle is stored in the PC settings file; usage is held in phone memory. No added tracking storage. Existing pairing storage is documented. |
| 5. Consent banner | Not applicable | No added nonessential tracking/cookies. |
| 6. Form consents | Checked | Capture is an explicit reversible setting. Firebase remains opt-in. No added marketing consent or personal-data field. |
| 7. Necessary data | Checked | No new data collected. Capture-off avoids folder snapshots and releases active baselines. |
| 8. Third-party SDKs | Checked | No new SDK or dependency. Firebase/ML Kit disclosures remain in the guide; no new calls to either. |
| 9. Dark patterns | Checked | Toggle states and effects are explicit. Updates and alerts remain optional. |
| 10. Hidden fees | Checked | API dollars are labeled estimates; no subscription costs inferred or new paid requests. |
| 11. Reviews | Not applicable | No reviews/testimonials. Sample accounts exist only in the isolated fixture. |
| 12. Claims | Checked | Unknown/stale labels retained. Alternative notifications are clearly marked unimplemented. Device coverage limitations are recorded. |
| 13. Alternatives for visuals | Checked | Progress bars have semantic labels and values; icon controls have tooltips. Decorative frames need no separate description. Physical TalkBack verification remains open. |
| 14. Contrast | Checked | Selected desktop axe checks passed. Native text on card: blue 10.50:1, pink 9.82:1, muted 10.08:1. Send icon contrast exceeds 10:1 at both gradient ends. Filled bar versus track is at least 6.81:1 at the endpoints. Values and stale state also use text. |
| 15. Keyboard/touch | Checked | Desktop Space toggles the setting. Existing native focus regression tests pass. Main native controls have 48 logical-pixel minimum targets; large-text wrapping checked. |
| 16. Business details | Not applicable | No new business or transaction page. Repository and help links remain available. |
| 17. Children's data | Not applicable | No child-directed flow or new age/data collection. |
| 18. Unsubscribe | Not applicable | No email sent. |
| 19. Licenses | Checked | Existing Material icons/fonts only; open-source licenses remain accessible. No new images or fonts. |
| 20. Deletion | Checked | Existing Results deletion and Forget PC are preserved. Turning capture off is not described as deleting old results. |

Primary references: [WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [Android background restrictions](https://developer.android.com/training/monitoring-device-state/doze-standby), [UnifiedPush distributors](https://unifiedpush.org/users/distributors/).
