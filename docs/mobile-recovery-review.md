# Phone updates and connection recovery

19 October 2026 · 0.6.0-preview.10 · main

Android can now check and download updates without reaching a PC. The connection screen has an Updates button; paired consoles have an App updates action. Both open the public GitHub release checker. All downloads remains available when checking fails. Updating through Android preserves pairing when the signing identity matches.

## Connection findings and changes

The reported home connection had a saved numeric public IP that differed from the current public IP. The local listener was running and the Windows firewall rule was active. An unauthenticated HTTPS probe through the current public address reached the same certificate as the local listener. This establishes a working route from the home network through its public address; it does not establish current mobile-carrier reachability. No router credentials, pairing tokens, public IPs or certificate private keys are included in this report.

The old Android heartbeat sent application pings but did not act on failures. The client now uses WebSocket ping/pong timeouts while foregrounded, closes failed transports and reconnects with backoff. Reconnect explicitly resets the transport. Late events from an obsolete socket are ignored. Input is never automatically replayed.

PC connection settings on Android accept a known new HTTPS address while retaining the saved PC certificate pin and device token. A manually entered recovery address takes precedence over stale routes advertised by an older PC. Updated PCs send their current public/local routes only inside authenticated session state. Android remembers those routes, so reconnecting on Wi-Fi after saving the PC address can repair a stale internet route without pairing again.

The PC network check now identifies a changed numeric public IP and offers Use current public IP. Saving remains explicit. Duck DNS support already exists; configuring a hostname can keep an unattended phone address stable as the ISP changes the public IP. It still requires a user-controlled hostname and credential. A changing numeric IP cannot be discovered by an offline phone without some stable discovery service.

Relevant implementation: `mobile/lib/dock_client.dart`, `connection_panel.dart`, `update_panel.dart`, `pair_page.dart`, `main.dart`, `settings_page.dart`, `electron/mobile.cjs`, and `src/mobile-ui.js`.

## Verification

| Check | Result |
| --- | --- |
| `npm run build` | Passed; existing Vite chunk-size advisory remains. |
| `npm test` | 143 passed, one environment-dependent WSL check skipped, zero failed. |
| `npm run test:desktop` | All four suites passed. One initial run lost a fixture CLI before a session-preservation assertion; the complete sequential rerun passed without changes to that code. |
| `flutter analyze --no-pub` | No issues. |
| `flutter test --no-pub` | 45 passed. |
| TLS/WebSocket integration | Real temporary HTTPS server: local-route fallback works; wrong certificate pin is rejected before receiving credentials; ping interval is enabled. |
| Pairing storage tests | Address refresh preserves identity/token; invalid routes are rejected; manual recovery survives a stale server address. |
| Offline update widget tests | Paired and unpaired screens expose updates at 320×740 without any PC request. |
| `npm run dist` and `npm run test:packaged` | Installer built; packaged setup, bundled runtimes, real terminal, MCP, completion callback and restart/restore passed without system Node or paid model calls. |
| Android release builds | ARM64, ARMv7 and emulator x86_64 APKs built. Preview 10 ARM64 signature matches preview 9. Installed preview 10 over the emulator build successfully. |
| Native Android emulator | Offline connection recovery, unpaired Updates and a real public GitHub update check passed. Version 0.6.0-preview.10 displayed. No PC connection was used for the update check. |

The desktop Phone setup flow was inspected in Windows Chromium, desktop WebKit, Pixel Chrome and iPhone WebKit profiles. The changed-IP action, retained fields, keyboard flow, selected axe checks and horizontal-overflow checks passed. Screenshots were inspected at all four sizes. Mac and phone browser profiles were emulated on Windows. The native Android app was inspected separately in an Android emulator. Physical Mac/iPhone rendering, TalkBack and real phone network switching are not established by those checks.

Evidence: `artifacts/mobile-reconnect`, `artifacts/mobile-views` and `artifacts/mobile-device`. Test profiles use temporary data. No paid model requests were made and the user's running consoles were preserved.

## Page review

Scope: Android pairing, updates and PC connection pages; console/Usage entry actions; desktop Phone setup. These findings apply to each changed screen unless specified. This is an implementation review, not a legal or accessibility certification.

| Item | Finding |
| --- | --- |
| 1. Privacy policy | Checked: existing setup/privacy guide stays linked from pairing. GitHub update checks are documented; paired identity stays in secure local storage. |
| 2. Terms | Not applicable to this change: no hosted account, contract or purchase flow added. |
| 3. Refund policy | Not applicable: no purchases. |
| 4. Cookies/storage | Checked: no tracking cookies added. Route overrides share existing encrypted pairing storage. |
| 5. Cookie consent | Not applicable to these changes: no nonessential tracking technology added. |
| 6. Form consents | Checked: saving an address and opening downloads are explicit actions. Pairing still needs matching-code approval. |
| 7. Necessary data | Checked: route updates contain addresses only; no token, pin or key is included in public-state route fields. Diagnostic report omits addresses and credentials. |
| 8. Third-party SDKs | Checked for this change: no SDK added. Existing ML Kit/optional Firebase disclosures remain. Updates contact GitHub only on request. |
| 9. Dark patterns | Checked: download, back, retry and cancel remain explicit; updating is optional. |
| 10. Hidden fees | Not applicable: no payment or paid provider action added. |
| 11. Fake reviews | Not applicable: no testimonials. Verification results distinguish emulation and live-network limits. |
| 12. Unsupported claims | Checked: IP detection and same-network reachability are not presented as a successful mobile-data test. Preview/development-signing limits remain documented. |
| 13. Alt text | Checked: standard labeled controls/tooltips; no content image added. |
| 14. Contrast | Checked in desktop browser profiles with selected axe tests; native screenshot colors inspected. Full native accessibility audit remains pending. |
| 15. Keyboard navigation | Checked: desktop tab/Escape flow and Android emulator navigation. Physical keyboard/TalkBack checks remain pending. |
| 16. Business details | Not applicable to these local configuration screens: no merchant or commercial service added. Repository support identity remains available. |
| 17. Children's data | Not applicable to the change: no child-directed feature or age data collection added. |
| 18. Email unsubscribe | Not applicable: no email. |
| 19. Asset licenses | Checked: existing project styling and Material icons reused; no new fonts/images/dependencies. |
| 20. Deletion | Checked: existing Forget PC and revocation remain available; serialized storage writes keep address updates from reviving a forgotten pairing. GitHub-side records are outside local deletion. |

References: [Flutter WebSocket ping timeout](https://api.flutter.dev/flutter/dart-io/WebSocket/pingInterval.html), [GitHub public release API](https://docs.github.com/en/rest/releases/releases), [Duck DNS update API](https://www.duckdns.org/spec.jsp), and [WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/).

## Remaining live check

Install the Android update directly from its GitHub release. Apply the PC update after active work finishes, use Phone setup → Check my network → Use current public IP → Save, and reconnect Android on Wi-Fi once. Alternatively enter the known current address in Android → Connection. Then disable Wi-Fi and test console input over mobile data. Configure a stable hostname for unattended recovery from future IP changes.

The running user's Dock, router mappings and saved connection were not restarted or rewritten during this verification. The stale saved address still needs that live configuration step. The previous mobile-data success on 18 October is historical evidence, not a fresh pass for this release. Live Firebase delivery also remains outside this verification.
