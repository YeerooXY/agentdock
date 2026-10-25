# Console restoration and Results verification

Reviewed 17 October 2026 on branch `main`. These changes are in source after `v0.6.0-preview.1`; the previously published installer does not include them.

## What changed

Codex now records the exact chat ID through its SessionStart hook before the first reply finishes. Quitting during that first task can therefore reopen the same conversation. Two consoles in the same project keep separate IDs. Resuming does not resubmit the last prompt or continue an interrupted job automatically. Previously unrecorded chats cannot be recovered by this change alone.

Paddock obtains the exact hook key and hash from the installed Codex app-server, and trusts only its own metadata hook for that invocation. An isolated real-CLI check confirmed that an existing user hook stays enabled and trusted and its configuration file stays unchanged. Older versions without the hook API retain completion-based tracking and display an update message. References: [Codex hooks](https://learn.chatgpt.com/docs/hooks), [configuration schema](https://learn.chatgpt.com/docs/config-schema.json), [resume command](https://learn.chatgpt.com/docs/cli/reference).

Results now previews images, Markdown and text inside saved ZIPs with a file chooser. Previewing reads bounded entries without extracting or executing them. Agents are instructed to save viewable files individually, with ZIPs only as optional downloads. Each tracked turn records its Git branch and commit; the gallery and preview link to that turn's code changes. Branch switches show both names. Older results without recorded metadata say **Branch not recorded**. A console launched outside a Git repository has no branch to record.

Deleting an individual result or batch removes its saved directory through Windows' Recycle Bin, then removes the gallery entry. If the directory remains, the operation reports failure and retains the entry. Original project files remain in place. Previewing ZIPs creates no extracted files to clean up.

## Checks

- `npm run build`: passed.
- `npm test`: 89 passed, one WSL-dependent check skipped, zero failed (90 total).
- `npm run test:desktop`: all four suites passed, including quit/reopen with nine consoles. An initial run stalled during shutdown; its isolated test processes were stopped. A full rerun with temporary shutdown tracing completed. The stall was not reproduced, and the tracing was removed.
- `npm run prepare:runtime`: passed; the bundled event helper includes startup identity tracking.
- `node scripts/codex-restore-smoke.cjs`: passed with installed Codex 0.156.1, an isolated Codex home, and a localhost mock model endpoint. Two unfinished first turns in one project reopened their exact saved IDs and prompt histories, without replaying requests. No account credentials or paid model requests were used. Windows PTY cleanup printed an AttachConsole diagnostic during forced test exits; the restoration assertions and process exit succeeded.
- `node scripts/results-smoke.cjs`: passed in an isolated Windows Electron profile. Verified ZIP image thumbnails, file selection, formatted Markdown, branch display, linked code diffs, individual and batch deletion, missing saved directories, preserved originals, and deletion persistence after reload.
- Archive regression tests reject traversal, invalid entry sizes, unsupported entry selection, encrypted files, symlinks and oversized members. Deletion tests include a failing/no-op trash operation and a fresh gallery reload.
- Turn tests verify branch metadata on images/reports/diffs and both names after switching branches mid-turn. Existing credential exclusions and overlapping-console attribution tests pass.
- `node scripts/results-visual-check.cjs`: passed Windows Chromium, desktop WebKit/Safari, Pixel 7 Chrome and iPhone 13 WebKit/Safari profiles. Gallery, archive image, archive Markdown and code-diff views were captured. Selected axe contrast/name/label checks, horizontal overflow, keyboard file selection, Escape and page errors passed. Screenshots were inspected for wrapping, spacing, thumbnails, branch icon alignment and focus.
- `npm audit --omit=dev`: zero production vulnerabilities. ZIP reading adds `yauzl` 3.4.0, using its lazy reader and entry-size validation; see the [maintainer's documentation](https://github.com/thejoshwolfe/yauzl/blob/master/README.md).

Mac and phone browser checks were **emulated on Windows**. Actual macOS/iOS font rendering and physical-device behavior still need real-device checks. The affected screen is the desktop Results view; this does not certify the native Android app. Archive previews cover up to 400 files/1,000 entries, with 10 MB image and 1 MB text limits; unsupported files can be exported.

Evidence is in `artifacts/results-check`, the isolated Codex restore verification record, and the matching Paddock Results batch. Screenshots and the report are saved individually for immediate previews.

## Shared page review

All twenty items were reviewed for the affected Results gallery and preview dialog. This is a scoped review, not legal or accessibility certification.

| Item | Status and reason |
| --- | --- |
| 1. Privacy | Checked: previews and Git metadata stay in existing local Results storage; no new external transfer. Existing [privacy notes](android-setup.md#data-use-and-privacy) apply. |
| 2. Terms | Not applicable: no new hosted service or agreement. |
| 3. Refunds | Not applicable: no purchase flow. |
| 4. Cookies/storage | Checked: local result records and saved copies; no tracking cookies. |
| 5. Consent banner | Not applicable: no nonessential tracking added. |
| 6. Form consent | Not applicable: file selection and deletion controls do not collect consent or personal details. |
| 7. Unnecessary data | Checked: Git branch/commit metadata supports the requested review; startup callbacks save IDs, not prompts. Existing secret-file exclusions and diff redaction remain. |
| 8. Third-party SDKs | Checked: the new ZIP library reads local saved files; it adds no telemetry or network access. Production audit passed. |
| 9. Dark patterns | Checked: previews open directly, deletion is available per file/batch, failed removals remain visible. |
| 10. Hidden fees | Not applicable: previews, diffs and deletion make no paid requests. |
| 11. Fake reviews | Not applicable: no testimonials. Test screenshots use labelled fixtures. |
| 12. Claims | Checked: old metadata, snapshot attribution, archive limits and emulation limits are documented. |
| 13. Alt text | Checked: image previews have titles/file names; branch decoration is hidden from assistive technology; controls have names. |
| 14. Contrast | Checked: selected axe checks passed across four profiles; selection and diffs also use text/state indicators. |
| 15. Keyboard | Checked: file buttons work with Enter, retain focus after selection, and Escape closes the dialog. |
| 16. Business details | Not applicable: no new business/operator claim or transaction. |
| 17. Children's data | Not applicable: no child-directed collection added. |
| 18. Email unsubscribe | Not applicable: no email sent. |
| 19. Asset licenses | Checked: existing project icon, an original inline branch symbol and project fixture text; no new fonts or third-party imagery. ZIP library uses the MIT license. |
| 20. Data deletion | Checked: real Windows deletion removes saved directories and index records; reload confirms persistence. Originals stay in the project and recycled copies follow Windows' Recycle Bin retention. |
