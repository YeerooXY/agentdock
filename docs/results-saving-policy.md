# Results saving policy

22 October 2026. Implemented on `main` at base `88409424c563967eed4c2749e9385f04fe46d64c`, preserving earlier uncommitted work. The user chose **Save requested outputs automatically** in chat. No planning approval or milestone completion is implied.

## What belongs in Results

Keep outputs the user asked to create and will want to open, reuse, download or review. A request for an image, document, design, research report, dataset or export authorizes saving that output without an extra confirmation. Useful design alternatives awaiting the user's choice also count as requested work.

| Work | Save in Results | Keep with the chat or project |
| --- | --- | --- |
| Writing | Requested document or reusable draft | Ordinary replies, corrections and progress messages |
| Research | Requested findings or comparison with its sources | Search traces and raw collection data |
| Design | Requested image, model, concept or selected review previews | Every intermediate verification screenshot |
| Coding | Requested export, packaged file or code review | Routine edits, patch copies, logs and passing-check reports |
| Data | Requested dataset, chart or analysis | Temporary processing files |

Use the existing **Add files** action or ask the agent to save other work. Requested output is identified by the agent following these instructions and calling `dock/save_result`; Paddock does not classify every filesystem change or run an extra paid model. Existing supported file formats, preview behavior and size limits remain applicable.

Two relevant patterns informed the decision: [Claude artifacts](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them) exposes substantial reusable outputs beside a conversation, while [VS Code's changes review](https://code.visualstudio.com/docs/agents/run/review-code-edits) keeps review/revert controls for workspace edits. Checked 22 October 2026. These are design precedents, not evidence that a particular policy will satisfy every Paddock user.

## Behavior changed

- File snapshots, automatic code-diff reports and changed-image copies default off. Logical task identity, saved-output grouping, Git attribution and completion notifications continue.
- The first update to `resultsPolicyVersion: 1` switches the legacy default-on capture option off once. Existing Results and unrelated settings are retained. Later explicit capture opt-ins survive restarts. The migration marker is persisted when the app starts, including before a Settings edit.
- **Settings → General → Results → Also capture file changes** is the optional way to retain the previous capture behavior. Disabling it discards active captures; enabling starts with the next turn.
- Shared instructions and tool descriptions direct agents to save requested outputs automatically and keep ordinary replies, logs, raw test JSON, patch copies and routine verification pictures in the chat/project. The web-design guide keeps a requested review's main report and selected screenshots together.
- A ready notification finishes a task even when nothing was saved. The agent points to Results only when it saved useful output. The existing notification destination behavior is retained; a completion with no saved artifact still uses the existing no-results message.

This change does not introduce automatic deletion, a new file-format decoder or output-version merging. Technical verification for this change stays in the project, with no manually added gallery report, patch copy or screenshot batch.

## Verification

| Check | Actual outcome | Evidence |
| --- | --- | --- |
| Vite build | Passed; existing large-chunk warning | `artifacts/results-policy/build.txt` |
| Node tests | 181 passed, 1 skipped, 0 failed | `artifacts/results-policy/node-tests.txt` |
| Full desktop suite | All four scripts passed | `artifacts/results-policy/desktop-tests.txt` |
| Isolated Electron/MCP | Migrates old capture-on profile; ordinary code/image changes create zero Results; requested save and ready notification work; opt-in capture, active disabling and restart persistence pass; previous results retained | `artifacts/results-policy/electron-check.txt`; `artifacts/results-setting/native-checks.json` |
| Browser profiles | Windows Chromium, emulated Mac Safari/WebKit, Android Chromium and iPhone WebKit pass keyboard toggle, accessible labels, scoped contrast, no document overflow and no page errors | `artifacts/results-setting/visual-checks.json` and four `*-settings.png` files |
| Visual inspection | All four captures inspected for text wrapping, icon alignment, focus, spacing and the off state | Same screenshots; Mac and phone profiles are emulated on Windows |

Unit tests also cover the class default without capture, a requested report's retained identity/content, one-time settings migration and later explicit opt-ins. Tests use local shells, synthetic results and disposable profiles; no paid AI request is submitted. No native Android source changed, and Flutter tests were not rerun for this PC capture policy. Physical Mac/iPhone/Android browser checks and current real-agent compliance with the new instructions remain manual checks. Installed apps and the user's running consoles were not restarted or updated.

## Page review

The affected page is the Results section of General Settings. Existing data flows and release questions are documented in the [earlier Settings review](settings-results-controls-review.md#page-review) and [phone privacy guide](android-setup.md#data-use-and-privacy). No new jurisdictional or privacy policy claim is made.

| Item | Status | Evidence or reason |
| --- | --- | --- |
| 1. Privacy policy | Checked for change; release review remains | Fewer automatic local copies; no new recipient or data collection. Existing distribution disclosures still need review. |
| 2. Terms | Not applicable | No hosted contract or purchase added. |
| 3. Refund policy | Not applicable | No sale on this page. |
| 4. Cookie/storage policy | Checked | One local migration marker and existing capture preference; documented above. No browser tracking added. |
| 5. Cookie consent | Not applicable | No analytics, ads or nonessential browser technology introduced. |
| 6. Form consent | Checked | Capture is optional and visibly off; keyboard toggling and persistence verified. |
| 7. Unnecessary data | Checked | Routine turn captures are off by default. Existing saved copies are retained. Tests use synthetic content. |
| 8. Third-party SDKs | Checked for change | No SDK/dependency changes. Existing native SDK distribution review remains open. |
| 9. Dark patterns | Checked | Requested saving and optional filesystem capture are explained separately; opt-in is reversible. |
| 10. Fees | Not applicable | No paid request, price or billing behavior added. |
| 11. Fake reviews | Not applicable | No testimonials or invented customer evidence. |
| 12. Unsupported claims | Checked | Agent instructions, filesystem behavior, test outcomes and untested real-agent compliance are distinguished. |
| 13. Accessible names/alt text | Checked in scope | The checkbox has its visible label and description; scoped browser check passed. No new images. Prior shared drag-handle ARIA finding is outside this change and remains open. |
| 14. Contrast | Checked in scope | Scoped contrast check and visible focus inspected in four profiles. |
| 15. Keyboard navigation | Checked in scope | Space toggles the focused native checkbox; no new dialog or navigation. Full platform screen-reader review remains open. |
| 16. Business details | Not applicable to change | No commerce or identity flow; prior release questions remain. |
| 17. Children's data | Not applicable | No child-directed feature or age collection added. |
| 18. Email unsubscribe | Not applicable | No email/marketing flow. |
| 19. Asset licenses | Checked for change | No art, fonts or dependencies added. Existing distribution inventory remains separate. |
| 20. Deletion requests | Checked for change | No automatic cleanup of existing Results. Existing removal/export behavior is retained; user choice is preserved. |

The desktop app must be updated to apply this policy and regenerate shared agent instructions. Existing agents should refresh `dock_context`; remote agents that do not read Paddock's instructions cannot be assumed to follow its saving policy.
