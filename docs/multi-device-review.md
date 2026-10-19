# Named devices and saved computers

19 October 2026 · preview 11.

## Behavior

Windows Phone setup now saves a PC name and editable labels for each paired phone. Name-only saves preserve the live connection. Android's Devices screen saves several PCs, adds another without replacing the first, renames the phone, and supports local PC labels and forgetting individual computers. The active PC is shown above the console.

Existing single-PC records migrate to one encrypted registry. Certificate fingerprints identify PCs independently of their current names and addresses. Each PC retains its own token, routes and alert preference. Switching drops the old transport and transient input/output; it leaves the host's agents running. Phone name changes queue for offline PCs and synchronize on reconnection.

## Verification

- Node: 146 tests passed, one skipped, none failed. All four desktop smoke suites passed. Focused mobile tests cover two approved phones, isolated renaming/removal, pairing abuse, malformed requests and the reproduced revocation race.
- Flutter: 52 tests passed; static analysis reported no issues. Coverage includes existing-pairing migration, failed storage, canceled additional pairing, selected-PC switching, in-flight input rejection, retained aliases, individual forgetting and bounded decompression.
- Android release APKs built for ARM64, ARMv7 and x86-64. Emulator tested against two independent local TLS servers: pair both, rename phone and PC, switch both directions, send distinct commands, restart Android, retain both pairings, forget one and reconnect to the other. Both fixture consoles deliberately used the same session ID; their input remained separate.
- Desktop setup rendered and tested on Windows Chromium, macOS Safari via Windows WebKit emulation, Android Chrome profile and iPhone Safari profile via WebKit. Checked names, save buttons, keyboard flow, escaping, relevant accessibility rules and horizontal overflow. Four-profile screenshots are in `artifacts/mobile-views/`; native Android captures are in `artifacts/multi-device/`.
- Native Android checks used an emulator, not the owner's phone. Safari emulation does not establish macOS/iOS font rendering or physical-device behavior. The two-host fixture is not a real VM or cellular-network test.
- Packaged Windows checks passed with the bundled Node runtime and a real ConPTY console, including session restoration. Publication checks separately verify release asset sizes and hashes, public downloads and desktop updater selection.

## Required page review

Scope: changed desktop Phone setup and Android device/pairing screens. Existing setup/privacy documentation remains linked. This is not legal or accessibility certification.

| Item | Review |
| --- | --- |
| Privacy policy | Checked: setup guide describes local storage, direct connections, optional Firebase and device removal; updated for multiple PCs |
| Terms | Not applicable to these local device-name controls; no new hosted service or contract introduced |
| Refund policy | Not applicable: no sale or charge in this flow |
| Cookie policy | Checked: no new browser cookies or tracking; Android uses encrypted local storage |
| Cookie consent | Not applicable: no new nonessential browser technology |
| Form consents | Checked: explicit QR approval remains required; names do not authorize access |
| Necessary data | Checked: names, routing, identity and pairing metadata only; no phone number or account requested |
| Third-party SDKs | Checked for change: no new SDK; existing scanner/Firebase disclosures retained; live push behavior still needs device testing |
| Dark patterns | Checked: Add, Rename, Switch and Forget are explicit; forgetting one does not remove the others |
| Hidden fees | Not applicable: name/switch controls have no charge; optional provider services remain separate |
| Fake reviews | Not applicable: no testimonials |
| Unsupported claims | Checked: reachable-host requirement, preview status and unverified cloud delivery stated |
| Alt text | Checked: QR alt text retained; device icon buttons have accessible tooltips; decorative icons have text labels beside them |
| Contrast | Checked: scoped automated contrast rules in all four browser profiles; existing pink/blue palette retained |
| Keyboard navigation | Checked: desktop form fields/save buttons and dialog navigation exercised; Android touch targets and menus checked in emulator |
| Business details | Not applicable to local naming controls; repository/author help route retained |
| Children's data | Not applicable: no new age-targeted service or data collection |
| Email unsubscribe | Not applicable: no email sent |
| Font/image licenses | Checked for change: no new asset dependency; existing Material icons and app mark reused |
| Deletion | Checked: Forget removes only the chosen encrypted PC record; PC-side Remove revokes access; offline push limitation is explicit |

## Limits

Each PC still permits nine paired phones. Android streams one selected PC at a time; it does not aggregate all computers' terminals or usage into one dashboard. Multiple-PC cloud alerts require a common Firebase project; token rotation requires reconnecting each host. New Android consoles still use that host's defaults. SSH, a desktop remote-PC picker and per-host mobile provider selection remain future work.

See [security findings](mobile-security-review.md), [setup instructions](android-setup.md#multiple-computers-and-phones), and [audience research](target-users-research.md).
