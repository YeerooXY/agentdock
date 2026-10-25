# Project linking and screen previews — preview 7

Reviewed 18 October 2026. Covers the console suggestion and picker, project progress cards, Settings → Projects, Tools → Screen previews, Website review routing, returned Results images and image usage. Checks used isolated profiles, synthetic credentials and mocked image responses. No paid image requests or live user data were used.

## Behavior verified

- Ungrouped chats receive a nonmodal suggestion without stealing terminal focus. New-project setup prefills the current name/folder and starts with goals. Existing projects can be linked without restarting the PTY or changing its name, folder, buffer or exact resume ID.
- Don't ask again persists globally through restart. Settings restores suggestions; the header folder button always allows manual linking and opens project progress. Agent progress refreshes the visible project card.
- Image preference reaches shared context and design briefs. Native first remains the default. OpenAI, Gemini, Meshy and compatible JSON image-edit endpoints are selectable; API keys remain vault bindings. Missing keys and unsafe endpoint forms fail without replacing valid settings.
- Agents can prepare image settings, but the user applies them in Tools. The selected API never silently switches providers. Paid generation is blocked in test-mode desktop/bridge calls.
- Mocked OpenAI/Gemini responses yield individual image files grouped with the source turn/console and a ready notice. Failed/interrupted requests are not retried. A repeated request ID does not resubmit after restart or job removal. Cross-project references are rejected for both console and API context.
- Usage distinguishes actual zero from missing counters. Removing job details leaves its image and usage record. Results deletion removes the saved image. Opening a result from a scrolled review resets to its heading.

## Checks and evidence

| Check | Result |
| --- | --- |
| `npm run build` | Passed |
| `npm test` | 115 passed, one WSL Claude environment check skipped |
| Image suite after interruption-state fix | All six passed; recovered jobs also show Interrupted in Usage so their removal remains available |
| `npm run test:desktop` | All four suites passed; unpaid installed-agent startup, real PTYs, vault, tools, layout, restore and first run |
| `node scripts/project-link-smoke.cjs` | Passed; real Electron, live shell variable preserved, authenticated MCP context/progress, opt-out and workspace restoration |
| `node scripts/image-preview-smoke.cjs` | Passed; real Electron/vault/bridge, preference persistence, prepared settings Apply, real local-page review, selected brief and generation guard |
| `node scripts/project-link-visual-check.cjs` | Six views each across four browser profiles; keyboard, Escape/focus return, linking, progress and switch behavior passed |
| `node scripts/image-preview-visual-check.cjs` | Six views each across four profiles; provider forms, errors, review routing, mocked returned image, usage and job removal passed |
| Browser checks | No horizontal page/dialog overflow or page errors; selected axe contrast, button-name, form-label and project-dialog-name checks passed |
| Windows package | Installer built; clean-PC packaged smoke passed without system Node. Both new feature smoke scripts also passed against the packaged executable. Backend, guides and renderer files match the source build. |
| Android package | ARM64 and ARMv7 release builds passed, version 0.6.0-preview.7 / code 2007. Both retain the preview-6 signing certificate. No native behavior change or new device test is claimed. |

Screenshots and JSON reports are under `artifacts/project-link/` and `artifacts/image-preview/`, with representative files saved individually in Paddock Results. Each includes Windows Chromium at 1440×1000, WebKit with a Mac Safari profile, Chromium with Pixel 7 and WebKit with iPhone 13. Rendered screenshots were inspected for wrapping, spacing, icon alignment, clipping and control states. Narrow usage tables scroll horizontally within their container.

These browser profiles exercise the desktop HTML renderer; they do not add a mobile web app. Mac/Android/iPhone coverage is emulated on Windows. Actual macOS/iOS fonts, physical touch behavior and screen-reader behavior remain unverified. The Android native code is unchanged except its release version. Provider account access, live image quality and billing were not tested. The visible returned-image fixture is labelled mock data, not an AI-generated design.

The initial image smoke reused a Playwright locator from before its intentional app restart; the fixture was corrected and passed. Visual inspection found retained modal scroll position; the Results heading/focus fix was then checked across all four profiles.

## Required page review

The common outcomes below apply to the affected console/Projects/Settings, Tools, Website review, Results and Usage controls. This is not a legal or accessibility certification.

| Item | Status | Evidence and applicability |
| --- | --- | --- |
| 1. Privacy policy | Checked | [Project data guide](projects-and-updates.md) and [image data flow](screen-previews.md#data-and-usage) describe local records, selected-agent context and screenshot uploads to the chosen provider. Saving preferences sends no generation request. No hosted Paddock service introduced. |
| 2. Terms | Not applicable | No new hosted account, sale or contractual checkout. Users still use their own provider accounts. |
| 3. Refund policy | Not applicable | Paddock does not sell image credits or process payments. Provider billing is explicitly separate. |
| 4. Cookies/storage | Checked | Project suggestion is a local settings flag; generator configuration stores vault IDs, not keys. Jobs and retained usage/request IDs are documented. No tracking cookies added. |
| 5. Consent banner | Not applicable | No added tracking technology or marketing cookies. |
| 6. Form consents | Checked | Linking and settings are explicit actions. Agent preparation requires Apply in Tools. Generation buttons disclose upload and possible charges; agents receive the same selected routing. No marketing fields. |
| 7. Necessary data | Checked | Existing name/folder reused. Goals-only creation preserved. No transcript import, new telemetry or key read-back. Image responses and reference sizes are bounded. |
| 8. Third-party SDKs | Checked | No new SDK/dependency. Direct provider APIs and existing Meshy CLI are used. Official API requests disallow redirects; Gemini requests use `store:false`, without claiming zero provider retention. |
| 9. Dark patterns | Checked | Don't ask again is available beside setup and persists. Manual setup stays reachable. Preview-first and generator are reversible preferences. No silent provider fallback after an explicit API selection. |
| 10. Hidden fees | Checked | Generation cost is disclosed before direct requests. Missing token/credit values remain unavailable. No dollar estimates fabricated. Retries do not automatically create new jobs. |
| 11. Fake reviews | Not applicable | No testimonials or social proof. Visual test data is identified as a fixture. |
| 12. Unsupported claims | Checked | Previews are labelled design proposals. Guidance is not presented as guaranteed agent obedience, actual implementation, real device testing or provider account validation. |
| 13. Alt text | Checked | Console folder controls have accessible names; saved image previews use result titles. Existing icon/text combinations retained. |
| 14. Contrast | Checked | Selected axe text-contrast checks passed for all affected views/profiles; errors, state and usage also use words. Existing pink-blue palette retained. |
| 15. Keyboard navigation | Checked | Form controls, Enter/Space, Escape, picker focus return and opt-out fallback focus exercised. Project suggestion never grabs typing focus. Results starts at its heading. |
| 16. Business details | Not applicable | No new commercial service page. Existing repository/help identity retained. |
| 17. Children's data | Not applicable | No child-directed feature or new age collection introduced. |
| 18. Email unsubscribe | Not applicable | No emails sent. |
| 19. Asset licenses | Checked | Existing application icons/fonts only. Test screenshot comes from the local fixture. No new external design assets. |
| 20. Deletion | Checked | Project unlink preserves files; project deletion semantics remain documented. Results copies can be recycled. Remove job deletes its prompt/details; retained usage and duplicate-request protection, reset procedure and provider-side limits are documented. |

Reference: [WCAG 2.2 contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Provider request shapes and sources are recorded in the [screen-preview guide](screen-previews.md).
