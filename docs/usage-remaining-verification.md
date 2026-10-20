# Remaining allowance and provider identities

Verified 20 October 2026 for Windows and Android **0.6.0-preview.14**, on the existing `main` branch. This is a display update. Provider authentication, meter collection, remote pairing, saved consoles and API accounting formats are unchanged.

## Behavior

- Subscription windows show `100 - usedPercent`, labeled **% left**, on Android, desktop Usage and the corner HUD. A bar shrinks as the allowance is consumed.
- Only finite numeric readings from 0 through 100 are accepted. Unknown, malformed and out-of-range readings remain **Unknown**. An unknown meter has no numeric ARIA value.
- Each account keeps its own observation time. Stale snapshots, expired reset times and clock warnings remain visible. No balance is inferred from a reset time.
- API spending remains estimated dollars spent, with the existing unpriced-request warnings. Subscription percentages remain account-wide, not per console.
- Every catalog provider has a named identity. OpenAI/Codex, Cursor, OpenCode and Cline use unchanged official PNGs. Other identities use colored names/initials. Sources, restrictions and unverified permissions are in [provider-brand-assets.md](provider-brand-assets.md).
- Desktop supports identity display for any actually reported provider. Synthetic test cards do not add usage adapters or promise subscription meters for every CLI.
- Assets are local. No image CDN, new dependency, analytics or background polling was added.
- Usage's uppercase labels, including `API REQUESTS`, were changed to sentence case and made larger. `CODEX USAGE` in the HUD became `Codex remaining`.

## Checks

| Check | Result |
| --- | --- |
| Flutter suite | 104 passed; analyzer reported no issues. |
| Account Usage regressions | Remaining percentage and fill agree; refresh failure preserves last data; unknown and stale readings remain explicit; expired resets do not invent a new balance. |
| Host tests | 149 passed, one skipped. No paid provider calls. |
| Production frontend build | Passed. Existing large-bundle advisory remains. |
| Desktop smoke checks | Passed console layout, result review, CLI setup and desktop behavior checks in isolated profiles. |
| Packaged Windows smoke | Passed setup, real test terminal, bundled runtime/tools, callback, MCP bridge and restart/restore in an isolated profile. |
| Four browser profiles | PC Chromium, Mac WebKit, Android Chromium and iPhone WebKit passed remaining-value, invalid-value, local-image, keyboard, empty-state, overflow and selected axe checks. |
| Corner HUD | PC Chromium and Mac WebKit at 360 × 450: remaining values and Unknown fit. |
| Native Android | Android 15 x86_64 emulator: release APK, sample usage, original-size and doubled-text layouts, console provider badge inspected. |
| Android release artifacts | ARM64, ARMv7 and x86_64 release builds completed; existing signing identity retained. |

Browser verification uses `node scripts/usage-visual-check.cjs` after `npm run build` and `npm run test:desktop`. It serves the renderer on loopback with synthetic IPC and records screenshots in `artifacts/usage-remaining/`. It checks all 14 catalog identities, four local logos, 0%, 100%, fractional and unknown remaining values, no page errors and no external image requests.

The Android fixture runs with `DOCK_USAGE_FIXTURE=1 node scripts/mobile-controls-fixture.cjs`, uses loopback TLS and synthetic consoles, and expires after 20 minutes. Screenshots are in `artifacts/mobile-controls/remaining-*.png`. The helper restricts installation and data reset to the test emulator. Neither fixture connects to a user's PC or launches an AI request.

The emulator briefly showed **Check PC clock** because its clock lagged the fixture timestamp; the existing warning was correct. Later screenshots show the normal age label. The host clock was not changed.

PC Chromium ran on Windows. Mac Safari, Android Chrome and iPhone Safari coverage used corresponding Playwright engines/device profiles; native Android ran in an emulator. These checks do not establish physical-phone behavior, actual macOS/iOS fonts, or a native iPhone app. A physical Android update and real account refresh remain user checks.

The user's running desktop instance and conversations were not restarted for verification or publication.

## Page review

Scope: desktop Usage, corner HUD, native Android Usage and the affected provider badges. This is a local application display change, not a newly hosted service or checkout. The table records the required review; it is not a legal or accessibility certification.

| Item | Result | Reason / evidence |
| --- | --- | --- |
| 1. Privacy policy | Checked | No new data collection. Existing connection/privacy documentation in [Android setup](android-setup.md) remains applicable; logos are bundled. |
| 2. Terms of service | Not applicable | This change introduces no hosted service contract. Provider asset conditions are separately recorded. |
| 3. Refund policy | Not applicable | No sale or payment collection on these views. |
| 4. Cookie policy | Not applicable | No cookie or storage change. Existing local settings remain local. |
| 5. Cookie consent banner | Not applicable | No tracking or nonessential third-party resource requests added. |
| 6. Form consents | Not applicable | No new submission or consent form. Refresh reads the existing usage source. |
| 7. Unnecessary data | Checked | Uses existing percentages, observation/reset times and provider identity. No new personal fields. |
| 8. Third-party SDKs | Checked | No SDK/dependency added. Local image rendering generates no external requests. Existing optional Firebase behavior is unchanged. |
| 9. Dark patterns | Checked | Explicit remaining labels, Unknown and stale warnings. No forced upgrade or hidden action. |
| 10. Hidden fees | Checked | API figures remain estimates of spending; fixed-price subscriptions get no fabricated per-message price. |
| 11. Fake reviews | Not applicable | No testimonials or reviews. Test samples are identified as synthetic and are not installed into real profiles. |
| 12. Unsupported claims | Checked | Logos do not claim partnership. No fabricated quota adapters, balances, legal certification or physical-device pass. |
| 13. Accessible image text | Checked | Decorative provider image is hidden from screen readers beside the visible provider name. Progress meters have remaining-allowance labels. |
| 14. Color contrast | Checked | Selected axe contrast checks passed in four profiles after animations settled. Provider names and numeric labels accompany color; low balances also show their value. |
| 15. Keyboard navigation | Checked | Desktop navigation via focus/Enter and Usage controls checked; no new modal or focus trap. Full assistive-technology coverage remains unverified. |
| 16. Business details | Not applicable | No new commercial page, business representation or contact details. |
| 17. Children's data | Not applicable | No age targeting, children's flow or new data collection introduced. |
| 18. Email unsubscribe | Not applicable | These views send no marketing email. |
| 19. Font/image licenses | Checked | Existing fonts unchanged; four unchanged official images documented with sources. Unverified/restricted marks retain text badges. |
| 20. Data deletion requests | Not applicable | No new stored user data or deletion path introduced. Existing local-data controls are unchanged. |

Accessibility reference: [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/). Asset permissions are reviewed per provider; this note does not assert permission for unbundled marks.
