# Keep-awake verification

Reviewed 17 October 2026. Scope: the new **Settings → Desktop → Keep PC awake while agents work** switch and Windows sleep-request lifecycle. This change is in source after `v0.6.0-preview.1`; that previously published installer does not include it.

## Behavior

The switch defaults on for new and existing profiles. One `prevent-app-suspension` request covers all living, non-dismissed consoles marked `active` and any running Paddock API request. It remains active in the HUD, minimized window and tray. It is released when the last task finishes, waits for input, errors or exits; when the setting is disabled; and during app shutdown. Re-enabling follows the current activity immediately. No Windows power-plan setting is changed, and the display may turn off.

Detection follows Paddock's agent status, not CPU usage or whether a terminal process merely exists. Plain shells/custom commands without status reporting are not automatically classified as working. Agents must report completion to leave the Thinking state. An idle PC can still sleep and become unavailable to the phone.

[Electron documents the request type and display behavior](https://www.electronjs.org/docs/latest/api/power-save-blocker). [Windows power-request limits](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-powersetrequest) still apply: explicit Sleep/lid actions override ordinary requests, and Modern Standby on battery can limit them. This is not a guarantee against every OS power transition.

## Checks

- `npm run build`: passed.
- `npm test`: 78 passed, one environment-dependent WSL check skipped, zero failed (79 total). New tests cover overlapping consoles, ready/attention/error/dead/dismissed states, setting changes, API overlap and shutdown cleanup.
- `npm run test:desktop`: all four suites passed.
- `node scripts/power-smoke.cjs`: passed using an isolated Windows Electron profile and real `powerSaveBlocker` requests. Checked idle consoles, overlapping work, completion, waiting for input, HUD/tray, toggle persistence across renderer reload, console closure and quit cleanup. Every acquired request used `prevent-app-suspension` and was released. No paid requests or real user consoles were used.
- `node scripts/power-visual-check.cjs`: passed Windows Chromium, desktop WebKit/Safari, Pixel 7 Chrome and iPhone 13 WebKit/Safari profiles. Inspected all four screenshots for label wrapping, spacing, icon/toggle alignment and focus. Keyboard toggling, selected axe contrast/label/button checks, horizontal overflow and page errors passed.

Mac, Android-browser and iPhone-browser coverage was **emulated on Windows**. It does not establish physical-device behavior or actual macOS/iOS font rendering. This changes the Windows desktop setting; no native phone screen was changed. A real suspend/resume, lid or battery-drain experiment was not performed on the user's PC.

Evidence is in `artifacts/power-check` and the matching Paddock Results batch. Screenshots and test output exclude temporary profile data.

## Shared page review

All twenty items were reviewed for the affected Settings screen. This records the change's scope, not legal or accessibility certification.

| Item | Status and reason |
| --- | --- |
| 1. Privacy | Checked: one local boolean preference; no new personal-data processing or transfer. Existing [privacy notes](android-setup.md#data-use-and-privacy) remain applicable. |
| 2. Terms | Not applicable: no new service agreement or hosted feature. |
| 3. Refunds | Not applicable: no purchase or refund flow. |
| 4. Cookies/storage | Checked: the boolean uses existing local settings storage; no cookies or tracking. |
| 5. Consent banner | Not applicable: no nonessential web tracking or new consent technology. |
| 6. Form consent | Not applicable to consent collection: this is a reversible setting with a direct label, enabled by default. |
| 7. Unnecessary data | Checked: activity states already exist; no CPU/process scanning, terminal-content logging or telemetry added. |
| 8. Third-party SDKs | Checked: uses the already bundled Electron API; no new dependency or network request. |
| 9. Dark patterns | Checked: disabling immediately releases the request; the saved choice is retained. |
| 10. Hidden fees | Not applicable: no billing or paid request introduced. |
| 11. Fake reviews | Not applicable: no testimonial or review content. |
| 12. Claims | Checked: status-detection, display, OS-policy and verification limits are explicit above. |
| 13. Alt text | Checked: no image added; the native checkbox has an associated text label. |
| 14. Contrast | Checked: selected axe checks passed in all four profiles; existing theme and focus styling retained. |
| 15. Keyboard | Checked: focus and Space toggle the control; mouse/touch-sized layout and reload persistence also checked. |
| 16. Business details | Not applicable: no new business, sale or operator claim. |
| 17. Children's data | Not applicable: no child-directed feature or data collection added. |
| 18. Email unsubscribe | Not applicable: no email sent. |
| 19. Asset licenses | Checked: existing styles/icons only; no new fonts or media. |
| 20. Data deletion | Checked: no new personal records; disabling updates the local preference and releases the request. Existing app-data deletion behavior is unchanged. |
