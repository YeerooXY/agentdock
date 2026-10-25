# Setup, resize feedback and cursor review

16 October 2026, Paddock 0.5.0. This record supplements [the console interaction review](console-interaction-review.md) and [agent setup notes](agent-setup.md).

## Changes verified

- Panel resizing highlights the active edge/corner and proposed grid footprint. A live size label follows the pointer. Invalid placements use a red patterned preview and preserve the previous layout. Release, Escape, window resize and blur clear feedback. Existing keyboard resize and reduced-motion behavior remain.
- The cursor is steady by default. Output batching keeps delayed, fragmented hide/redraw/show sequences together, with a maximum 48 ms grace window. Intentional hiding still works and ordinary typing keeps the shorter 16 ms batch. ANSI content is unchanged. Four browser profiles sampled rendered frames during eight redraw bursts with the show command split across later packets: no hidden cursor frames were observed. This does not establish that every Codex workload is flicker-free, and it does not change CMD outside Paddock.
- First-run setup offers 14 optional CLI installers, a folder picker, default provider and immediate-launch checkbox. No software is preselected. Installed choices are detected; unsupported Windows versions are labeled. Installation errors preserve selected agents, folder and launch choice. Retry works. Settings can reopen setup without restarting consoles.
- Agents can prepare tool/API settings or request direct key entry. Tools shows the actual endpoint/command and expandable configuration before Apply. Preparation makes no connection or model request. Missing keys block Apply. Keys remain encrypted in the vault and are not sent back to the agent. Grok and Z.AI presets keep a missing-key reference instead of silently treating authentication as optional.

## Checks

| Check | Outcome |
| --- | --- |
| Build | Passed, including Windows installer packaging. |
| Unit/integration tests | 65 passed; one WSL-specific test skipped because WSL Claude is not installed. Includes all catalog adapters, install selection/retry/guard, credential filtering, MCP merges/backups, setup requests, output preservation and timing. |
| Desktop checks | All four scripts passed with temporary profiles: nine real PTYs, layout/resize/drag, fullscreen/tray preservation, workspace restoration, encryption, Results/Inbox, setup and actual immediate console launch. |
| Packaged checks | Passed with system Node/npm absent from PATH. Bundled npm installed an offline fixture CLI and its generated Windows shim ran through bundled Node. First launch, real PowerShell, Meshy discovery, MCP and restoration passed without paid calls. |
| Windows installer | See final installer result below. |
| Four-profile renderer | Passed. No renderer errors or horizontal page/content overflow; selected axe contrast, label, button-name and dialog-name checks passed. A WebKit style read during terminal replacement was made to wait for the attached, rendered cursor before sampling. |
| Dependency review | npm 12.2.1 removes the high-severity advisories found in 12.2.0's bundled dependencies. Eight moderate audit entries remain in the existing electron-builder dependency chain; those build tools are excluded from the application. No forced downgrade was applied. |

| Profile | Browser/viewport | Device status |
| --- | --- | --- |
| Windows PC | Chromium, 1440 × 1000; native Electron/ConPTY tests as well | Windows browser and desktop app |
| Mac Safari | WebKit, 1440 × 1000 | Emulated on Windows |
| Android Chrome | Chromium, Pixel 7, 412 × 839 | Emulated |
| iPhone Safari | WebKit, iPhone 13, 390 × 664 | Emulated |

Inspected screenshots include normal/error setup, active/blocked resize, Tools requests, Settings, terminal and the other app views in all four profiles. Screenshots and versioned browser details are in `artifacts/console-layout/browser-report.json`; the evidence archive in Results contains the captures from this run. Phone dialogs scroll vertically and keep their primary action reachable. Real macOS/iOS fonts, physical-device input and a complete screen-reader audit remain manual checks. Installer recipes were checked against primary documentation; signing into every third-party provider and running paid work was deliberately not part of these tests.

## Required page review

This covers the first-run dialog, Settings, Tools, Keys, Consoles and fullscreen; each row applies to all six unless its reason names a particular flow. Existing unchanged views remain covered by the earlier review. These are local desktop screens, not legal or accessibility certification of external sites.

| # | Item | Status and reason |
| --- | --- | --- |
| 1 | Privacy information | Checked for scope. README/setup notes describe local storage, third-party installation downloads, separate CLI sign-in and provider requests. No new hosted account or telemetry collection was added by Paddock. |
| 2 | Terms | Not applicable to these local controls: no new hosted service or purchase contract. Provider terms remain separate. |
| 3 | Refunds | Not applicable: no sale or checkout in setup. |
| 4 | Cookies/storage | Checked. Preferences, installation status and prepared settings stay in local files; no web tracking cookies added. |
| 5 | Consent banner | Not applicable: no consent-dependent web tracking introduced. |
| 6 | Form consents | Checked. Optional software checkboxes and immediate launch start unchecked. Account sign-in is explicit in the provider console. Secret entry uses a password input in Keys. |
| 7 | Unnecessary data | Checked. Install environments exclude keys/tokens; no paid prompt was submitted in testing. Setup tools accept key IDs and never return vault values. |
| 8 | Third-party SDKs | Checked. Bundled npm is pinned, with licenses. Selected agent installers contact their official distribution sources. Provider clients manage their own network/data behavior, documented separately. |
| 9 | Dark patterns | Checked. Install choices are optional; failed items can be retried or unticked; setup can be reopened. Resize can be canceled. No forced subscription flow. |
| 10 | Hidden fees | Checked for scope. Setup states that users' own accounts or API billing apply. Coding plans are distinguished from standard API billing. No model request is sent during setup. |
| 11 | Fake reviews | Not applicable: no reviews/testimonials. Verification fixtures are identified as tests. |
| 12 | Claims | Checked. Catalog is not presented as a popularity ranking; unsupported clients and untested provider sign-in are documented. Cursor/CMD limits are explicit. |
| 13 | Alt text/names | Checked. Decorative icons are hidden from accessibility; folder, guide, resize and dialog controls have names. |
| 14 | Contrast | Checked in captured states with selected axe rules. Error text, status labels and resize patterns supplement color. [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). |
| 15 | Keyboard | Checked for setup fields, checkboxes, picker, validation, submit/retry, Escape on reopened setup, panel resize and existing navigation. Reduced motion preserved. [W3C keyboard guidance](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html). |
| 16 | Business details | Not applicable: these local controls introduce no seller or commercial landing page. |
| 17 | Children's data | Not applicable: no child-directed feature or age collection introduced. |
| 18 | Unsubscribe | Not applicable: Inbox notifications are local; no marketing email. |
| 19 | Licenses | Checked. Original app icons, OS fonts and retained dependency license files; no added stock art or remote fonts. |
| 20 | Deletion | Checked for scope. Setup requests can be dismissed, connections and vault keys removed, Results deleted and Inbox cleared. CLI installations/auth remain provider-managed; uninstalling Paddock retains its local data as documented. |

## Installer result

Passed: per-user installation into a chosen folder, Windows uninstall registration, Start menu shortcut target, packaged app checks and clean uninstall. Existing development shortcuts were restored. The installed app also passed Results, Inbox, website-review and console-drag checks. The user's running Paddock was not restarted.
