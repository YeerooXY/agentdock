# Completion notifications

Verified 21 October 2026 on `main`, based on `88409424c563967eed4c2749e9385f04fe46d64c`. No commit or installed-app update was made. Earlier uncommitted work and the user's running consoles were preserved.

## Behavior

Clicking a completion notification previously opened the expanded live console when the notification carried only a session ID. Both completion paths now carry the finished turn's identity: an agent's `dock/notify` ready message and the Codex/Claude completion callback.

- Completion clicks restore the dashboard and open a saved result from that exact prompt and console. A readable report takes priority over screenshots, code captures and supporting JSON.
- Newer prompts, renamed chats and other consoles sharing the same folder cannot replace the notification's target. Duplicate finish callbacks retain the completed turn ID.
- Results filters clear and pagination moves to the linked result before its preview opens.
- A deleted result stays in Results with **These results are no longer available.** A prompt without a saved result shows **No results were saved for this prompt.** Neither case opens an unrelated console or older result.
- Questions and errors retain access to the originating live console. Manual console expansion remains available.

This change reuses the existing Results gallery and preview. It introduces no terminal input, provider request, new dependency or layout redesign. The callback keeps only state/usage metadata and the turn ID; prompt and response content remain excluded.

## Verification

| Check | Outcome | Evidence |
| --- | --- | --- |
| Build | Passed; existing large-chunk warning remains | `artifacts/notification-routing/build.txt` |
| Node suite | 179 passed, 1 skipped, 0 failed | `artifacts/notification-routing/node-tests.txt` |
| Targeted regression checks | 26 passed | `artifacts/notification-routing/regressions.txt` |
| Full desktop suite | All four scripts passed | `artifacts/notification-routing/desktop-suite.txt` |
| Native notification activation | Real Electron main-process activation restores Results from fullscreen, opens the exact saved report, handles deletion and retains live consoles for questions | `scripts/workbench-smoke.cjs`, `artifacts/notification-routing/windows-completed-prompt.png` |
| Browser profiles | Exact older prompt despite newer results/filters; correct page; deleted/empty states; Escape; scoped contrast/labels; no overflow or page errors | `artifacts/notification-routing/browser-checks.json` |
| Callback integration | Codex and Claude completion callbacks carry the finished ID through a disposable authenticated bridge without saving prompt/answer content | `tests/completion-notice.test.cjs` |

The existing callback unit test now removes inherited live bridge credentials before launching its test helper. Integration tests use their own temporary bridge. Tests use disposable application profiles and synthetic reports; they submit no paid model requests.

## Screen coverage

| Target | Inspection | Limit |
| --- | --- | --- |
| Windows PC | Actual Windows Electron and Chromium; completed-report preview inspected | Main-process activation exercised directly; an actual Windows Action Center toast click remains a manual check |
| Mac | WebKit Desktop Safari profile; screenshot inspected | Emulated on Windows; actual macOS Safari and font rendering remain unchecked |
| Android browser | Chromium Pixel 7 profile; screenshot inspected | Emulated; no physical phone browser in this run |
| iPhone browser | WebKit iPhone 13 profile; screenshot inspected | Emulated; actual iPhone Safari and font rendering remain unchecked |

The inspected previews fit at all four widths, with readable wrapping, visible controls and no document overflow. Scoped axe checks cover contrast, button names, form labels and dialog names. Escape closes the preview. These checks do not establish full accessibility certification. Native mobile source was unchanged by this fix.

## Results page review

All 20 items were reviewed for this navigation change. The [previous Settings and Results review](settings-results-controls-review.md#page-review) documents the unchanged data flows, primary references and release review items. No new legal or business facts are assumed here.

| Item | Status | Evidence or reason |
| --- | --- | --- |
| 1. Privacy policy | Checked for this change | Existing local Results storage is retained; callback event metadata gains a turn ID. No recipient or content collection is added. Existing privacy documentation and release review remain as recorded in the previous review. |
| 2. Terms | Not applicable | No account, hosted service or contractual flow is added. |
| 3. Refund policy | Not applicable | The Results page sells nothing. |
| 4. Cookie/storage policy | Checked | No browser storage is added. Existing local callback metadata and saved Results retain their existing storage paths and lifecycle. Notifications remain in memory. |
| 5. Cookie consent | Not applicable | No tracking, advertising or nonessential browser storage is introduced. |
| 6. Form consent | Not applicable | No form or personal-data field is added. Opening a completion requires a notification click. |
| 7. Data minimization | Checked | The callback adds only the turn ID; tests verify prompt/response text stays out of its event file. Test helpers use isolated credentials. |
| 8. Third-party SDKs | Checked for this change | No dependency or SDK changes. Existing distribution/traffic review remains documented in the previous review. |
| 9. Dark patterns | Checked | Notifications open their exact result; missing results show an explicit message. Questions preserve console access. No silent console input is sent. |
| 10. Fees | Not applicable | No purchase or billable action is added. |
| 11. Reviews | Not applicable | No testimonials; screenshots contain synthetic test reports. |
| 12. Claims | Checked | Test results, emulation and remaining physical-device/OS-toast checks are stated separately. Installed-app deployment is not claimed. |
| 13. Alternative text | Checked | Existing titled dialog and labelled controls are retained; scoped accessible-name checks pass. No new image controls are added. |
| 14. Color contrast | Checked within scope | Scoped axe contrast checks pass in all four browser profiles; existing preview styles are reused. |
| 15. Keyboard navigation | Checked within scope | The report opens in the existing labelled dialog and Escape closes it in all four profiles. Existing desktop navigation checks pass. |
| 16. Business details | Not applicable to this change | No commerce/contact flow is added. Existing distribution identity questions remain recorded in the previous review. |
| 17. Children's data | Not applicable | No child-directed feature, age collection or new personal-data flow is added. |
| 18. Email unsubscribe | Not applicable | No email or marketing messages are sent. Existing notification controls remain available. |
| 19. Asset licenses | Checked for this change | No new fonts, artwork, icons or dependencies. Existing distribution license review remains recorded in the previous review. |
| 20. Data deletion | Checked | Existing Results deletion remains functional. Clicking a notice after deletion shows a missing-result message and preserves the remaining gallery. |

## Handover

The task-only patch compares files against a snapshot taken before this fix, preserving earlier Settings, Results and mobile work. Screenshots, the test summary and this note are saved individually in Results. The installed desktop app must be updated and restarted to run the fix; no running console was restarted for deployment.
