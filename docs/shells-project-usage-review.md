# Shells, project colors and turn usage

Reviewed 20 October 2026 for 0.6.0-preview.20. Base: main at 891d8c7.

The desktop console headers, fullscreen tabs, HUD and one-time shell chooser share local provider identifiers. The chooser shows names beside icons and supports arrow keys, Home/End, Enter and Escape. Unknown providers use initials. A header Close button uses the existing confirmation and ends only that console.

Projects have an optional color in the creation/edit form. Colors survive reloads and edits from older clients that omit the field. Legacy records receive a stable default derived from their ID. Names and status labels remain visible alongside the colors. Color input is restricted to a six-digit hex value before it reaches CSS.

Usage groups the latest 200 recorded turns by project, with a project filter and remembered expanded groups. Each turn shows token counters, API estimates where applicable and observed quota changes. Narrow layouts stack turn details so percentages remain visible.

Quota readings are account-wide, so a change near a turn is an attribution estimate. Each provider window and limit group stays separate. Percentages are never summed across sessions or projects. The calculation rejects missing/stale baselines, window resets, decreased readings and saturated starting quotas. A reported zero is labelled as potentially rounded. Monthly capacity and per-turn subscription prices are not invented. Claude token counters still cover the main agent only.

Codex readings come from its existing token-count log events. Claude compares fresh status-line readings around its prompt/stop hooks. No additional provider request is made for this calculation. Old or unsupported turns can remain unavailable. Tracking retains whitelisted counters and identifiers, with no prompt text, answer text, secrets or credit balances.

## Verification

- Backend suite: 163 passed, one skipped, no failures. New cases cover quota reset/staleness/saturation, separate limit groups, rescan deduplication, exact turn IDs, saved project colors, invalid color rejection and real Claude callback helpers.
- `npm run build` and `npm run test:desktop`: passed. The existing large bundle warning remains.
- `node scripts/shell-project-smoke.cjs`: real Windows shells confirmed that header Close ends only its target. Browser fixtures checked icons, keyboard selection/Escape, color edits, project filtering, turn grouping and quota presentation.
- Windows Chromium and WebKit with Mac Safari, Pixel 7 and iPhone 13 profiles were inspected. Safari and phone checks are emulated on Windows. They do not establish physical-device behavior, macOS/iOS font rendering, native color-picker behavior or screen-reader compatibility.
- The narrow-screen review caught cramped table columns; these now stack as turn details. Screenshots are in `artifacts/shell-project/`. Fixtures are labelled and no paid AI prompts were submitted.
- Windows installer and Android ARM64/ARMv7 builds are produced separately; the Android UI is unchanged in this release. Existing pairing and subscription authentication are not migrated or replaced.

The reported stuck Codex screen displayed “Save and close editor to continue”. That console had been closed before inspection; the underlying editor failure remains unverified. The new header control provides a confirmed way to end a blocked console without first entering fullscreen. This review does not claim to fix Codex's external-editor implementation.

## Page review

The following checks cover Consoles/the shell chooser, Projects and Usage. Shared storage and policy behavior is assessed for the changed fields; this is not a legal or accessibility certification. Sources checked: [WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/), [European Commission data rights information](https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en), and the [provider asset record](provider-brand-assets.md).

| Item | Result for the affected views |
| --- | --- |
| 1. Privacy policy | Checked for this change: local color preferences and quota metadata are described in README Storage and access. Viewing marks adds no remote logo requests. A public hosted service would need an operator-specific notice. |
| 2. Terms | Not applicable to new functionality: no new hosted service, account agreement or purchase flow. Provider terms remain applicable. |
| 3. Refunds | Not applicable: these views sell nothing. |
| 4. Cookies/storage | Checked: expanded groups are in-memory UI state; colors and readings use the existing local profile. No new cookies or analytics. |
| 5. Consent banner | Not applicable: no added optional tracking or advertising technology. |
| 6. Form consent | Checked: color is optional; selecting a shell does not launch it until Open console. Close retains its explicit confirmation. |
| 7. Necessary data | Checked: metadata whitelist excludes prompts, answers, credentials and credit balances. Storage has a bounded turn count. |
| 8. Third-party SDKs | Checked: no new SDK or dependency; logos are existing bundled assets. |
| 9. Dark patterns | Checked: named controls, cancellable chooser, explicit stop confirmation and honest unavailable states. |
| 10. Fees | Checked: account quota estimates and API spending are labelled separately. No monthly allowance or subscription per-turn price is fabricated. |
| 11. Reviews | Not applicable: no reviews or testimonials. |
| 12. Claims | Checked: screenshots identify fixtures; quota attribution is an estimate; trademark approval is not claimed. |
| 13. Alternatives | Checked: decorative chooser images are hidden from accessibility APIs; named icon-only shell marks expose their provider. Names accompany project colors. |
| 14. Contrast | Checked for new color pairs: shell text 16.10:1 on its opaque background; secondary usage text 9.39:1 against the tested dark surface; focus ring 9.50:1; dot outline 8.95:1. Chosen colors are supplemental, with readable names and values. Whole-app AA certification was not performed. |
| 15. Keyboard | Checked: chooser selection, arrow navigation, Home/End, Enter and Escape; native form controls and visible focus. Real VoiceOver/TalkBack testing remains manual. |
| 16. Business details | Not applicable: no commercial storefront or new operator identity is presented. |
| 17. Children | Not applicable to this change: no child-targeted feature, age collection or new audience data. |
| 18. Email unsubscribe | Not applicable: no email or marketing messages. |
| 19. Asset rights | Needs review for distribution: original sources and conditions are recorded. Anthropic's published guidelines ask for prior approval; none is recorded. Logo availability is not itself permission. No new third-party artwork was downloaded. |
| 20. Deletion requests | Not applicable to a new operator-held database: metadata stays in the user's self-hosted profile. Existing local storage behavior is documented; no new external data-request endpoint is introduced. |

## Remaining checks

Test a real Mac/iPhone and physical Android browser, including native color selection and a screen reader. Confirm per-turn quota availability with normal user activity after the updated host starts; missing historical observations are expected. Resolve any required provider logo approvals before claiming brand clearance or a formal partnership.
