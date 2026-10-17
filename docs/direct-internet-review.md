# Direct internet setup verification

Reviewed 17 October 2026 for `0.6.0-preview.2`. Scope: installer-launched first-run wizard, desktop Phone setup, encrypted key handoff, Windows network helper and Android pairing. This is direct access to the user's own PC, not a hosted relay.

## Behavior

First run offers same-Wi-Fi or direct-internet phone setup. Direct mode validates the outside address, retains the local route, and creates a versioned QR invitation using the PC's existing certificate pin. Local mode continues to reject public peers. Android validates both routes, tries the local connection first with a short timeout, then uses the internet route. Revocation, compressed selected-terminal updates and no command replay remain in place.

Router checks are read-only. They detect an upstream private address or a mismatch with the observed public address, but do not claim to prove internet reachability. Opt-in automatic forwarding uses Windows' built-in PowerShell/.NET networking: one leased TCP mapping, an installation-specific owner ID, no overwrite or removal of another owner's rule, and cleanup on disable/quit. The helper bounds network waits, disables HTTP redirects, forbids XML DTDs/external resolvers and limits descriptor size. It accepts discovery/control URLs only on the selected gateway.

The optional Windows Firewall rule is scoped to the actual executable, chosen local address, adapter and TCP port. Windows elevation is requested only for that rule; the firewall is not disabled and the network trust category is not changed. A removed or changed network can need manual rule cleanup. The optional Duck DNS token is selected from Keys and resolved only in the main process for its fixed HTTPS endpoint; snapshots/errors omit it.

## Checks

- `npm run build` passed. The full Node suite passed 95 tests with one WSL-dependent skip (96 total). Public-peer restrictions, authentication/revocation, malformed endpoints, bounded attempts, network classification, mapping lifecycle, test-mode network guards, and mocked Duck DNS updates are covered.
- All four desktop suites passed. The setup-specific suite also checks the first-run internet choice, network mutations disabled in test mode, and the return from Keys without losing the phone setup draft.
- Flutter analysis found no issues; all six tests passed, including versioned internet invitations, rejection of unsafe routes and retained form input. Release APKs built for ARM64, ARMv7 and x86_64.
- A real Xiaomi UPnP router was inspected without changing its configuration. A temporary unused TCP mapping was then created, a different owner could neither remove nor overwrite it, and the original owner removed it. A subsequent lookup confirmed removal. The test detected an upstream private WAN address. These tests do not prove access through the upstream ISP router.
- The final Windows installer passed a per-user installation into a chosen folder containing spaces, Start menu registration, installed setup/terminal/tools/Results checks, restart restoration and clean uninstall. The packaged test ran without system Node/npm on PATH and confirmed that the network helper ships outside ASAR. Tests used isolated profiles and no paid model requests. No API key, real phone pairing code or local profile is included in release artifacts.

## Visual and interaction review

The desktop renderer is checked in Windows Chromium, desktop WebKit/Safari, Pixel 7 Chrome and iPhone 13 WebKit profiles. Screens include local connection, direct internet, expanded DNS help, upstream-router instructions, QR pairing, alerts, and the first-run choice. Checks cover contrast, accessible labels, keyboard navigation, disclosure operation, preserved input after errors, scrolling and horizontal overflow. Selected screenshots and the automation report are saved individually in Results.

Mac and phone browser checks are emulated on Windows. They do not establish physical-device behavior or actual macOS/iOS fonts. Android widget tests and APK compilation are separate from those browser checks. Physical-phone internet pairing, carrier network changes, the live Windows UAC/firewall flow, live Duck DNS updates with an account, and live Firebase delivery remain manual checks. No iPhone app or IPv6 direct mode is included.

## Required page review

These findings apply to the affected first-run, connection/router/pairing and Keys-return screens. Existing Firebase/Results behavior is covered by [the Android review](android-review.md).

| Item | Status and reason |
| --- | --- |
| 1. Privacy | Checked: [data-use guide](android-setup.md#data-use-and-privacy) describes the optional ipify request, DNS updates, local settings, credential handling and device records. |
| 2. Terms | Not applicable to a new hosted service: none is operated. External account providers retain their own terms. |
| 3. Refunds | Not applicable: no purchase is offered in these screens. |
| 4. Cookies/storage | Checked: chosen connection settings remain local; credentials use the existing encrypted vault. No browser cookie/tracking change. |
| 5. Cookie consent | Not applicable: no nonessential web tracking added. |
| 6. Form choices | Checked: phone setup is optional; internet access, network lookup, firewall and DNS binding are explicit actions. Valid entries survive errors and the Keys handoff. |
| 7. Minimal data | Checked: third-party requests contain address lookup/DNS data, never terminals, files or provider API keys. No router password collected. |
| 8. Third-party SDKs | Checked: no new SDK or installed VPN dependency. Windows networking is used for local router control. ipify/Duck DNS are optional services disclosed before use. |
| 9. Dark patterns | Checked: same-Wi-Fi remains available; setup can be deferred; no paid server or account is forced. |
| 10. Fees | Checked: no hosting fee is promised universally; provider public-IP availability/fees and normal connection costs are explained. |
| 11. Reviews | Not applicable: no reviews or endorsements displayed. |
| 12. Claims | Checked: router discovery/mapping is distinct from a verified authenticated internet connection. Manual checks remain identified. |
| 13. Alt text | Checked: QR code has an accessible name and a copy-code alternative. Decorative icons remain labelled through their buttons. |
| 14. Contrast | Checked with selected axe rules and screenshot inspection. State labels accompany color. |
| 15. Keyboard | Checked: select controls, details, tab navigation, focus within dialogs, close/Escape and key-entry return. Windows UAC is an OS-controlled step. |
| 16. Business details | Not applicable to a new transaction: this local utility adds no commercial service or invented identity. |
| 17. Children's data | Not applicable: no new child-facing service or personal-data form. |
| 18. Unsubscribe | Not applicable: no email is sent. |
| 19. Asset licenses | Checked: existing project icons/fonts; no new media or third-party assets. |
| 20. Deletion | Checked: remove phone/token, disable listener/DNS updates, remove owned mapping and optional firewall rule. Existing project Results deletion is unchanged. |

References: [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/), [Windows Firewall rules](https://learn.microsoft.com/en-us/powershell/module/netsecurity/new-netfirewallrule), [Duck DNS API](https://www.duckdns.org/spec.jsp), [ipify](https://www.ipify.org/) and [router troubleshooting](https://www.tp-link.com/ph/support/faq/785/). This is a scoped engineering review, not a legal or accessibility certification.
