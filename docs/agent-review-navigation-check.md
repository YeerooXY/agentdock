# Agent reviews and live alerts

Reviewed 20 October 2026 for Windows 0.6.0-preview.21, based on main at 207ebfa.

Website Review and Inbox have been removed from navigation, page rendering, forms, styles and desktop action handlers. The Inbox class, persisted read state and management API are removed. Existing `inbox.json` files are left untouched and are no longer read or updated by this build.

Website reviews remain agent tools. Agents can start and list reviews, read findings, record checklist evidence and delete a review with its saved files. Screenshots and reports remain in Results. Meshy CLI sign-in moved to Tools → Screen previews. Interrupted Meshy jobs can still resume from Usage without submitting another generation.

Windows notifications and phone completion alerts use live events. Console interaction still clears its ready badge; Results retains its own unread batch count. Phones receive at most 50 recent event IDs, titles and timestamps in memory through the existing protocol. No read/dismiss API or persistent alert history remains. Pairing and device credentials use their existing encrypted storage.

## Verification

- Backend: 164 passed, one skipped, no failures. Includes authenticated mobile WebSocket delivery, duplicate suppression, bounded transport memory and absent Inbox storage/API checks.
- Build and all four desktop test scripts passed. Agent tools performed a real isolated website review, updated its checklist/report, survived a page reload and deleted the saved review evidence. The removed navigation items were absent.
- Image settings and the local MCP bridge passed. Paid image generation was rejected and no job was created. Tests made no paid AI requests.
- The image-settings visual harness passed all four browser profiles: generator fields, endpoint-error recovery, moved Meshy sign-in, agent-returned fixture image previews, usage, selected axe label/button/contrast rules, overflow and page errors. These checks use mocked image responses.
- Simulated notification clicks used the real activation handler to restore tray/minimized windows, open a console and open Markdown Results, including a notification containing only a review ID. Actual Windows toast delivery remains a manual check.
- Windows Chromium plus Mac Safari, Android Chrome and iPhone Safari profiles were checked with the existing fixture harness. Safari/phone profiles are emulated on Windows; physical devices, native macOS/iOS rendering and screen readers remain manual checks. The native Android UI and app version are unchanged.
- The checks caught a WebKit focus change that closed the shell chooser between mouse-down and click. Mouse-down now preserves focus until selection; selection and keyboard behavior were rechecked across all four profiles.
- The Windows installer was built. Packaged checks passed, including a real agent review through its bundled MCP bridge. All 57 checked backend, UI and network-helper files match the tested source/build; package metadata reports 0.6.0-preview.21.
- Screenshots are individual files under `artifacts/shell-project/`, with current Consoles and Tools views for each profile. Fixture screens are labelled.

Logs: `artifacts/inbox-removal-unit-tests.log`, `inbox-removal-desktop-tests.log`, `inbox-removal-preview-tests.log`, `inbox-removal-notification-tests.log` and `inbox-removal-browser-tests.log`.

Packaged evidence: `artifacts/inbox-removal-packaged-tests.log`, `artifacts/inbox-removal-packaged-review-tests.log`, `artifacts/inbox-removal-package-match.json`.

## Page review

Scope: remaining navigation, Results notification routing and the moved Meshy sign-in controls in Tools. Existing provider contracts and the rest of the app remain outside this change. This review is not a legal or accessibility certification. References: [WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/), [European Commission data protection information](https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en).

| Item | Outcome |
| --- | --- |
| 1. Privacy policy | Checked for changed data flow: the README documents removal of persisted alerts, the volatile phone delivery window and retained pairing. No new operator-held data. |
| 2. Terms | Not applicable: no new hosted account, agreement or commercial service. Provider terms still govern sign-in and generation. |
| 3. Refund policy | Not applicable: these controls sell nothing. |
| 4. Cookie policy | Checked: no new cookies, browser storage or analytics; pairing storage is unchanged. |
| 5. Consent banner | Not applicable: no added tracking or advertising technology. |
| 6. Form consent | Checked: sign-in starts through an explicit control. Saving image settings does not generate an image or spend credits. |
| 7. Necessary data | Checked: persisted notification bodies/read state removed; phone event delivery contains only IDs, titles and times. Old files remain user-controlled. |
| 8. Third-party SDKs | Checked: no added dependency; Meshy sign-in uses the existing bundled CLI. |
| 9. Dark patterns | Checked: removed dead navigation routes; clear sign-in controls and ordinary collapsible details. |
| 10. Hidden fees | Checked: generator settings retain the existing paid-generation disclosure; test generation remains blocked. |
| 11. Reviews | Not applicable: no customer testimonials. Website review findings describe actual automated checks. |
| 12. Claims | Checked: automated checks are distinguished from manual checklist evidence; screenshots identify fixtures and emulated coverage is explicit. |
| 13. Alt text | Checked: no new images; existing result previews keep titles and image alternatives. |
| 14. Contrast | Checked for affected controls: existing blue-pink button, text and focus styles are retained; screenshots inspected at all four widths. No whole-app conformance claim. |
| 15. Keyboard navigation | Checked: native details and sign-in buttons, shell selection, Escape and Results dialogs. Physical screen-reader testing remains manual. |
| 16. Business details | Not applicable: no new storefront or business identity. |
| 17. Children's data | Not applicable: no new audience, age collection or child-targeted flow. |
| 18. Email unsubscribe | Not applicable: no marketing email or mailing list. |
| 19. Asset licenses | No new assets. Existing provider-logo approval questions remain documented in `provider-brand-assets.md`; this change does not resolve them. |
| 20. Data deletion | Checked: agent review deletion removes its saved evidence; individual Results deletion remains available. Legacy alert files may be deleted after quitting. No new externally hosted data. |

## Remaining checks

Try the updated Windows host with a physical phone during ordinary work. Existing Android preview 20 is compatible; no re-pairing is required by these changes. Real Mac/iPhone font rendering and assistive technology behavior are not established by emulation.
