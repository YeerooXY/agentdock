# Android preview verification

Reviewed 17 October 2026. Scope: desktop Phone setup, Results code/Markdown previews, Windows notification activation; Android pairing, console, Results and Usage. These are local app screens, not a hosted commercial website. All twenty shared review items were considered for each screen; the common findings below apply across this scope unless a screen is named.

## Verified

- `npm run build` passed. Markdown is loaded only when needed.
- `npm test`: 75 passed, one environment-dependent WSL check skipped, zero failed (76 total). Includes single-use pairing, Origin/authentication rejection, malformed Unicode tokens, encrypted storage, revocation, one-of-nine streaming, reconnect without command replay, headless terminal checkpoints, mocked Firebase sends, before/after diffs, overlapping-console attribution and native notification callbacks.
- `npm run test:desktop` passed all four suites. Existing sessions, resizing, setup, shared tools, Results deletion and restore behavior remain covered. Tests used temporary profiles and no paid model requests.
- `npm run dist` built the Windows installer. `npm run test:packaged` passed in an isolated install location with system Node removed from PATH: first run, bundled runtime, real ConPTY, MCP, callback and restore. Additional dependency notices are included in the final package.
- `node scripts/notification-smoke.cjs` passed against both the source app and final packaged app: simulated native click events restored real minimized/tray windows, expanded the HUD, selected the correct terminal, opened the related Markdown result and marked the alert read. Windows notification-center delivery/focus behavior still needs a manual OS-toast check; the test invokes the native callback rather than clicking an actual system toast.
- Flutter static analysis passed. Five Flutter tests passed, covering invalid pairing, narrow-screen errors, retained drafts, on-demand Results, and native Markdown tables/code without remote images, and cleanup of closed-console buffers. Android release-mode APKs built for ARM64, ARMv7 and x86_64. The preview uses a development signing key.
- Android API 35 emulator: paired over real pinned HTTPS/WSS using a single-use code; sent a command to a Windows PowerShell/ConPTY session; switched existing consoles; reopened after backgrounding; loaded Markdown, code and an image; deleted a whole Results batch with confirmation. PC originals stayed intact. The Firebase-not-configured path provides setup guidance.
- Background traffic observation: after Android Home, the PC marked the device disconnected. Compressed application counters stayed at 20,581 bytes sent / 2,585 received during the observation. This is a fixture measurement, not a carrier-data or per-hour estimate; TLS, VPN and Google traffic are excluded.

## Visual coverage

`scripts/mobile-visual-check.cjs` captured the three Phone setup steps, code diffs and Markdown in four profiles: Windows Chromium desktop, desktop WebKit/Safari profile, Pixel 7 Chrome profile, and iPhone 13 WebKit/Safari profile. All twenty screenshots were inspected for hierarchy, icons, alignment, wrapping, spacing, scrolling and overflow. Selected axe checks found no color-contrast, label, button-name or dialog-name violations. Tab/Escape and dialog focus were exercised; adversarial Markdown could not create scripts, active links, frames or remotely loaded images.

Mac, Android-browser and iPhone-browser checks were **emulated on Windows**. They do not establish actual macOS/iOS font rendering or physical touch behavior. The native Android app was separately inspected in the emulator, not inferred from browser screenshots. There is no iPhone app in this release.

Evidence stays under `artifacts/mobile-views`, `artifacts/mobile-device`, and `artifacts/notifications`, and a curated screenshot archive/report is saved in Dock Results. Test pairing credentials and profile data are excluded from that archive and Git.

## Shared page checklist

| Item | Status and evidence |
| --- | --- |
| 1. Privacy information | Checked: [setup/privacy guide](android-setup.md#data-use-and-privacy) describes local retention, paired-phone access, Google/Tailscale processing, optional FCM, QR metrics, and deletion. Linked from desktop setup and Android pairing/Usage. Live SDK network verification remains pending. |
| 2. Terms | Not applicable to these local screens as a hosted service: no operator account, service subscription or hosted terminal relay is provided. Provider terms are linked. Owner-approved product licensing/store terms need review before a store launch; none were invented here. |
| 3. Refunds | Not applicable: these screens have no sale, checkout or refund promise. Provider purchases remain external. |
| 4. Cookies/storage | Checked: no browser tracking cookies added. PC safeStorage, Android secure storage, public Firebase preferences and local Results are documented. |
| 5. Cookie banner | Not applicable: local desktop/native screens; no ad/marketing cookies. Optional Google notification setup and camera use are explicit actions. This is not a legal determination for a future hosted website. |
| 6. Form consent | Checked: mobile is disabled by default; Android follow-up setup is optional; camera and notification permissions are requested for their stated features. Invalid pairing preserves entered text. No marketing opt-in exists. |
| 7. Data minimization | Checked: allowlisted mobile RPC, generic pushes, bounded buffers, selected terminal only, no private-key renderer readback or key in APK, no automatic remote Markdown images. Credential-like files and known vault values are excluded/redacted from diffs; not a comprehensive secret scan. |
| 8. Third-party SDKs | Checked inventory: Firebase Core/Messaging for optional alerts, ML Kit through mobile_scanner for QR recognition, secure_storage for device storage, url_launcher for explicit browser links, xterm for local rendering. No Analytics SDK enabled. ML Kit metrics and provider processing are disclosed. Physical-device network tracing remains pending. |
| 9. Dark patterns | Checked: pairing/cloud alerts are optional; disable/remove actions are available; no forced sign-up with the author, false urgency or hidden submission. |
| 10. Fees | Checked: own provider accounts and carrier/model costs are explained; no author-hosted relay. FCM pricing is sourced and qualified as current. No unrelated paid cloud services are deployed. |
| 11. Reviews | Not applicable: no testimonials, ratings or customer claims are presented. Screenshots use clearly identified fixture data. |
| 12. Claims | Checked: device, Firebase, attribution and byte-counter limitations are explicit; no claim of production readiness, legal compliance, guaranteed delivery or universally free Tailscale. |
| 13. Alternative text | Checked: meaningful QR/result images have accessible names; buttons have labels/tooltips. Markdown image placeholders retain their labels. Full TalkBack testing remains pending. |
| 14. Contrast | Checked: selected rendered desktop color-contrast tests pass in all four profiles. Text/icon hierarchy was inspected in Android. Full native accessibility audit is still pending; no certification claimed. |
| 15. Keyboard | Checked: desktop tab/focus/Escape flow and existing console keyboard controls pass. Android text input and back navigation work in the emulator. Physical external keyboards and TalkBack require device testing. |
| 16. Business details | Not applicable to this free local preview's screens: no merchant checkout or hosted business service. Repository identity/support link is supplied; no legal address or company registration was invented. Reassess for commercial/store distribution. |
| 17. Children's data | Not applicable to the implemented flow: it is a developer terminal companion, with no child-directed content, age field, advertising or author-hosted child account. Reassess if audience/data flows change. |
| 18. Email unsubscribe | Not applicable: the app sends no email or marketing messages. Android alerts use system notification controls and removable Firebase setup. |
| 19. Asset rights | Checked for additions: existing project icon reused, system fonts/Material icons, generated Flutter dependency notices, and Marked/DOMPurify license texts saved in `assets/third-party-notices.txt` and packaged. No third-party photos or invented attribution added. |
| 20. Deletion | Checked: Results deletion, batch confirmation, phone removal/revocation, local forget and Firebase removal are implemented. The guide distinguishes local removal from revoking Google keys or deleting provider-held identifiers/account data; it does not claim those remote records disappear on local uninstall. |

References reviewed: [WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/), [Firebase privacy](https://firebase.google.com/support/privacy), [ML Kit privacy](https://developers.google.com/ml-kit/terms), [Firebase pricing](https://firebase.google.com/pricing), [Tailscale plans](https://tailscale.com/pricing), [FCM setup](https://firebase.google.com/docs/cloud-messaging/flutter/get-started). This checklist records implementation review, not legal or accessibility certification.

## Remaining checks before a stable mobile release

Real phone/camera and off-Wi-Fi Tailscale; a real Firebase project, background/force-stop/reboot delivery and notification taps; physical keyboard/TalkBack/text scaling; Android release signing and store disclosures; actual Mac/iPhone rendering if those platforms become supported. The current Firebase plugin builds but warns that a future Flutter version will require its Kotlin Gradle migration; the tested toolchain is pinned in the mobile README.
