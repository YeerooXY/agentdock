# Results revisions and tool logos

18 October 2026 · 0.6.0-preview.9

Results shows a branch and commit together, such as `main · 1ca12958`. A separate label identifies uncommitted changes. The saved commit is a reference for the working tree; it is not a claim that every saved screenshot or change was committed.

Code reports retain the revisions at the beginning and end of a turn. Explicitly saved files record their repository at save time and the turn’s ending revision separately. Later commits and console renames leave that history intact. Each repository keeps its own revision when a turn saves files from several repositories.

Manual saves now find the repository containing the source file, including when the console starts in a parent workspace or automatic capture is disabled. The original project access boundary remains enforced. Git metadata capture uses read-only commands with optional index locking disabled; it creates no commits or branches. Shared agent instructions default to the current branch and require a user request before creating or switching branches. This is an agent instruction, not a shell permission restriction.

Historical code reports can supply their originally recorded revisions. Missing history remains unavailable; Dock never assigns today’s HEAD to an old result. Unborn branches, detached HEAD and missing commit data have distinct labels. A parent workspace with no repository remains unbound unless a saved source file identifies its repository.

Tools uses the official Blender, Unity and Meshy assets, including the shared connection list. Files are bundled locally without recoloring or stretching. [Asset sources and notices](../src/assets/tool-logos/README.md) record attribution and usage references. The redundant Tools subtitle was removed. The unrelated Website review tagline, “Check the page. Keep the evidence. Explore a new direction.”, is flagged for a later wording pass.

## Verification

- Node tests exercise real temporary Git repositories: exact commit/branch pairs, unborn and detached states, working-tree changes, index preservation, turn completion, restart history, parent-folder saves, automatic capture disabled, access boundaries and legacy recovery. The tests verify that capture creates no branches.
- Windows Electron checks cover the revision badges, starting/ending commits, image navigation, Markdown/diff previews, saved-file deletion and source-file preservation. Existing desktop session, layout, Tools setup and shared-instruction checks also passed.
- Browser screenshots cover Windows Chromium, desktop WebKit, Pixel 7 Chromium and iPhone 13 WebKit. Revision labels, Tools logos, icon alignment, wrapping, overflow, keyboard operation and targeted axe checks are inspected. Mobile captures include the Unity and Meshy cards after scrolling. Evidence: `artifacts/results-check`.
- Flutter analysis and widget tests check the final revision in the image viewer while preserving image navigation and individual viewed state.
- Final checks: 132 Node tests passed, one platform-specific test skipped; 39 Flutter tests passed; production frontend, Windows installer and Android release APK builds passed. The packaged Windows app also passed setup, real-terminal, bundled-runtime/Meshy, MCP and restart/restore checks without system Node or paid model requests.
- Mac, Android-browser and iPhone checks use emulation on Windows. Physical Safari font rendering, physical-phone behavior and screen-reader checks remain manual. Browser profiles do not establish native-device behavior.

## Page review

Scope: Results and Tools, plus the native Results revision label. This is a local application update, with no new hosted service, accounts or payments. The checks below describe this change; they are not a compliance certification.

| Item | Status and reason |
| --- | --- |
| Privacy policy | Checked: existing storage and optional-service documentation applies. Revision metadata stays in the local Results index and reaches only the paired client. |
| Terms | Not applicable: no new service agreement or hosted service. |
| Refund policy | Not applicable: no payment flow. |
| Cookies/storage | Checked: no tracking cookies. Git metadata uses the existing Results store. |
| Cookie consent | Not applicable: no tracking or advertising technology added. |
| Form consents | Checked: existing key, connection and setup controls retain their behavior and consequences. |
| Necessary data | Checked: only repository path, branch, commit and working-tree state are added. No Git credentials, remote URLs or source contents in metadata. |
| Third-party SDKs | Checked: no SDK added. Logo files are local and cause no requests to brand websites. |
| Dark patterns | Checked: setup, disconnect, delete and cancel behaviors are unchanged. |
| Hidden fees | Checked: Meshy credit disclosure remains visible. No paid request is used for these checks. |
| Fake reviews | Not applicable: no testimonials. Test records are fixtures. |
| Unsupported claims | Checked: unavailable history, uncommitted changes and overlapping work remain explicit. |
| Alt text | Checked: logos are decorative beside their product names; revision labels have accessible names. |
| Contrast | Checked: existing pink/blue revision colors and targeted axe checks. Brand artwork keeps its original colors; Unity has a light background. |
| Keyboard navigation | Checked: gallery arrows, Escape, Tools navigation and Logo credits disclosure. |
| Business details | Not applicable: no new business transaction. Trademark attribution is in Tools and the asset notes. |
| Children’s data | Not applicable: no child-directed feature or age collection. |
| Email unsubscribe | Not applicable: no email flow. |
| Font/image licenses | Checked: existing fonts; official unmodified logos with source and attribution records. |
| Data deletion | Checked: revision metadata is deleted with the saved Result. Existing saved-directory deletion checks passed; project originals remain. |

Reference: [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/) for contrast, labels, focus, keyboard operation and reflow. Brand references are linked in the asset notes.
