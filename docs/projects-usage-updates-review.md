# Preview 4 verification

Checked on 2026-10-18. Scope: Projects and its editor, console project chooser, API project selection, larger console grids, per-message Usage, Windows update controls and the native Android update panel. All model requests in tests were mocked. Temporary profiles and test consoles were used; the owner's running Dock was left open.

## Results

- `npm run build`: passed.
- `npm test`: 105 passed, 1 existing platform-dependent skip, 0 failures. Includes full-grid shrinking, a tenth console, 12-console restoration with project links, reducing-grid boundaries, token grouping, unknown counters and update integrity failures.
- `npm run test:desktop`: four suites covering real Windows consoles, workbench, layout and setup.
- `node scripts/projects-smoke.cjs`: passed. Created/edited a project, checked progress, launched a named console with the scoped brief, chose a subfolder, shrank a full grid, expanded to 4×4 and removed the project record without deleting its files or ending consoles.
- `node scripts/projects-visual-check.cjs`: passed all four profiles below. Search, editor/Escape, API project selection, update check/download states, grid settings and the chooser were exercised. No page errors or horizontal page overflow. Axe checks for contrast, control names, form labels and dialog names found no violations in the captured states.
- Flutter analysis: clean. Flutter tests: 16 passed, including interrupted sends, checkpoint replacement, Markdown and update version/channel/architecture selection.
- Windows installer and all three Android APK architectures built. Packaged smoke checks cover bundled Node/MCP helpers, real terminal startup and workspace restoration.
- The native Android emulator upgraded from preview 3 to preview 4 with `adb install -r`; its pairing remained valid. Usage displayed the installed version and the manual live GitHub check returned **You're up to date**. The newer-release/download path uses controlled test metadata; no installer was launched automatically.

Latest desktop build screenshots and machine-readable findings are under ignored `artifacts/projects/`. The native screenshots are `artifacts/mobile-device/updates-native.png` and `updates-native-check.png`. Selected captures and this report are also saved individually in Dock Results. Demo project names and a synthetic future update in browser screenshots are test fixtures.

| Profile | Coverage | Limitation |
| --- | --- | --- |
| Windows desktop Chromium 156 | Actual browser engine on Windows, 1440×1000; Electron integration separately | No exhaustive screen-reader audit |
| Mac Safari | WebKit 27.2 with Desktop Safari profile | Emulated on Windows; actual macOS fonts/device still need checking |
| Android Chrome | Chromium 156 with Pixel 7 profile | Browser emulation; native app separately checked in Android emulator |
| iPhone Safari | WebKit 27.2 with iPhone 13 profile | Emulated; no native iPhone app or physical iOS check |

Screenshots were inspected for hierarchy, wrapping, icon/control alignment, spacing and overflow. Inspection caught a narrow-grid override and an undersized New project button; both were corrected and the four profiles rerun. Keyboard checks include labeled native controls, dialog Escape, existing console navigation and visible focus. The narrow browser grid stacks panels; it is a responsive desktop-renderer fallback, not the phone app's interface.

## Required page review

This matrix applies to every affected view named above. **Checked** means the relevant implementation and flows were reviewed, not that the app has legal or accessibility certification. Privacy context follows the [European Commission's data protection information](https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en); interface checks use the [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/).

| # | Item | Status and evidence |
| --- | --- | --- |
| 1 | Privacy policy | Checked: [data guide](projects-and-updates.md) identifies local project/usage files, selected-brief sharing with agents/providers, GitHub requests, retention and deletion limits. Existing phone/Firebase practices remain in the [Android guide](android-setup.md). |
| 2 | Terms of service | Not applicable to a new hosted service: these views add no author-hosted account or service contract. Existing repository license and selected provider terms still apply. |
| 3 | Refund policy | Not applicable: no sale, checkout, trial or subscription is introduced. |
| 4 | Cookie policy | Checked: no browser tracking/cookies added. Local project settings and usage files, and their purposes, are documented. |
| 5 | Consent banner | Not applicable: no advertising, analytics or other optional tracking introduced; no decorative consent banner. |
| 6 | Form consents | Checked: forms save the requested local project/configuration. No marketing opt-in, prechecked consent or unrelated data request. Failed saves retain input. |
| 7 | Unnecessary data | Checked: usage records omit prompt/response/tool text; bounded scans and metadata retention. Project fields are optional except name/folder. Credentials remain in the existing vault. |
| 8 | Third-party SDKs | Checked: no new SDK dependency. Existing browser-launch support opens an exact repository download URL. Manual GitHub checks send no project or terminal data. Existing Firebase setup is unchanged. |
| 9 | Dark patterns | Checked: updates are manual; users can keep working when installation would end consoles. Project deletion requires a second click and describes its scope. |
| 10 | Hidden fees | Checked: no new app fee. API costs are explicitly estimates; unknown values are not shown as zero. Existing provider/carrier costs remain documented. |
| 11 | Fake reviews | Not applicable: no testimonials or ratings in these views. Screenshot sample projects and future release data are isolated fixtures. |
| 12 | Unsupported claims | Checked: no invented subscription credits. Claude counters identify main-agent scope. The 64-panel limit is not a claim of performance at 64 active agents. |
| 13 | Alt text | Checked: decorative existing icons accompany labels; icon-only actions retain accessible names. No new content images. |
| 14 | Contrast | Checked in captured states by axe and visual inspection; pink-blue controls and text remain readable. Color is paired with labels/status. This subset is not a full WCAG audit. |
| 15 | Keyboard navigation | Checked: native form fields/selects, focus outlines, dialog Escape and existing hotkeys; no new hover-only action. Physical-device assistive-technology checks remain open. |
| 16 | Business details | Not applicable to a new seller/service: no business identity or registration claim added. Repository issue contact remains available. |
| 17 | Children's data | Not applicable to a new child-data flow: local developer tool, no age collection or child-directed service added. |
| 18 | Email unsubscribe | Not applicable: no email or marketing delivery. |
| 19 | Asset licenses | Checked: existing system fonts, icons and project assets reused; no newly sourced image/font asset. Existing dependency/license handling unchanged. |
| 20 | Data deletion | Checked: deleting a project removes its local record and preserves files/consoles. Docs distinguish agent-history/startup-file copies. Local CLI usage history reset and reimport limits are documented. Existing Results deletion regressions pass. |

## Remaining limits

Physical Android retesting of the latest Send/resize fix, internet access from outside the home network and live Firebase delivery remain pending. See [the preview 3 mobile verification](mobile-input-resize-review.md). New project management and per-message tables are desktop features; Android retains its one-console view and existing usage summary.

CLI token formats can change; missing/truncated counts remain unknown. Claude delegated-agent usage is not aggregated. No-Firebase background alerts were discussed but are not implemented: Android currently closes its private connection in the background. A future persistent-connection mode needs its own foreground-service/battery design; [Android Doze restrictions](https://developer.android.com/training/monitoring-device-state/doze-standby) prevent promising instant delivery from an ordinary background socket.

Windows signing and a durable Android production signing key remain release work. The updater does not silently restart a running Dock or update Windows itself.
