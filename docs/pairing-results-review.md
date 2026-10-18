# Phone approval and Results review

18 October 2026 · 0.6.0-preview.8

New phones must request access, show the same six-digit code as the PC, and receive approval on the PC. A QR scan alone cannot obtain a terminal or Results session. Existing paired phones keep their credentials. New pairing needs preview 8 on both devices.

Results are organized by the saved project ID or working folder, then by turn. Pictures share a gallery with Previous/Next, arrow keys, thumbnails and individual viewed markers. Supporting JSON is collapsed, code is rendered as a diff, and empty code snapshots are no longer generated. Deletion permanently removes the saved copy and its gallery record, while leaving project originals and exported copies alone.

## Attribution findings

- The old view used the console name as its main heading. The screenshot's “Learning application” label was not evidence of a project binding.
- Results previously discarded the project ID. Turn context used the current console's folder/name, and a later rename rewrote historical names.
- A non-Git parent workspace was recursively scanned, including child repositories. This could collect another project's screenshots and code while several consoles were active.
- New captures freeze identity at turn start, persist project IDs and skip child Git repositories when scanning a parent workspace. Existing records are grouped using their recorded folder; missing history is not guessed or silently reassigned.
- Same-folder concurrent work can still overlap. The diff explicitly labels this limitation; it is a folder comparison, not proof of individual authorship.

## Verification

- Node tests: 127 passed, one platform-specific skip. They cover QR-only denial, unknown request keys, desktop-only approval, denial, expiration, cancellation, QR replacement, shutdown, encrypted credentials, persistence rollback, revocation and connection recovery. Results tests cover immutable attribution, child-repository exclusion, individual/batch deletion, partial deletion failure and redirected paths.
- Desktop approval: real isolated Electron profile plus HTTPS client. Matching codes, keyboard Deny/Allow and revocation passed. No production pairing or router settings were changed.
- Results: real Windows Electron test opens pictures in one viewer, switches with arrow keys, checks individual viewed state, collapses JSON, previews ZIP/Markdown, reads a Git diff, deletes individual files and the whole batch, verifies saved directories are absent, then reloads the app. Project source files remain intact.
- Browser coverage: Windows Chromium, desktop WebKit, Pixel 7 Chromium and iPhone 13 WebKit. Screenshots inspected for layout, labels, spacing, wrapping, overflow, gallery controls, viewed markers, approval controls and keyboard focus. Targeted axe contrast/name/label/dialog checks passed. Screenshots are in `artifacts/results-check` and `artifacts/mobile-views`.
- Flutter analysis and tests cover matching-code waiting/cancel UI, approval protocol races, individual picture navigation and viewed state, plus existing terminal input, account usage and update behavior. Release APKs built for ARM64, ARMv7 and x86_64.
- Native Android API 35 emulator: in-place APK upgrade preserved pairing; a new pairing stayed without access until PC approval, then connected and executed a command in an isolated Windows console. Two images opened in one gallery, Next switched without closing, viewed markers persisted, and deleting the turn removed all four saved directories. Original assets remained. Screenshots and the check record are in `artifacts/mobile-device`.
- `npm run build`, `npm test`, `npm run test:desktop`, `npm run dist` and `npm run test:packaged` passed. The packaged app was exercised without system Node on PATH. One intervening desktop run observed a terminal exit during the window-preservation check; the full unchanged rerun passed. This intermittent test observation is not claimed fixed by this change.
- Real-device limits: Mac/iPhone browser checks are emulated on Windows, and Android browser emulation is separate from the native APK. Physical-phone approval, physical Safari rendering, TalkBack and live Firebase delivery still need device checks. The owner separately verified internet command delivery from a physical phone before this change.

## Page review

Scope: local Results browser, PC phone setup and native Android pairing/gallery. No public website, checkout or marketing form was added. These checks are not a legal or accessibility certification.

| Item | Status and evidence |
| --- | --- |
| 1. Privacy policy | Checked: README storage section and Android privacy/setup guide describe local files, direct connections, optional push and deletion. Pending approval secrets stay in memory; only approved credentials are encrypted and saved. |
| 2. Terms | Not applicable: no hosted service or new service contract; existing open-source license applies. |
| 3. Refund policy | Not applicable: no sale or payment flow. |
| 4. Cookies/storage | Checked: no browser tracking cookies added. Saved Results, viewed timestamps and encrypted pairing are documented. |
| 5. Cookie banner | Not applicable: no new nonessential browser tracking. |
| 6. Form consents | Checked: pairing explains terminal/Results access, requires an explicit PC action, and offers Deny and Cancel. No marketing consent. |
| 7. Necessary data | Checked: bounded device label and pending code; no model keys, access tokens or request secrets in renderer state. Pictures are fetched on demand on Android. |
| 8. Third-party SDKs | Checked: no new SDKs. Existing ML Kit QR and optional Firebase disclosures remain; paste pairing avoids the scanner. |
| 9. Dark patterns | Checked: Deny/Cancel, revoke and delete remain visible. No forced cloud service or paid action. |
| 10. Hidden fees | Not applicable: these features do not make model or image-generation calls. |
| 11. Reviews | Not applicable: no testimonials or social proof. Test screenshots are fixtures. |
| 12. Claims | Checked: attribution limits, old metadata, build signing and emulation limits are explicit. |
| 13. Alt text | Checked: meaningful image titles; thumbnail buttons have names and viewed state; decorative images use empty alt text. |
| 14. Contrast | Checked: targeted axe checks on all four browser profiles; selected/viewed state includes text and borders. Native colors follow the existing theme. |
| 15. Keyboard | Checked: arrow navigation, native buttons, focus rings, Escape, keyboard approval/denial. Physical screen-reader testing remains open. |
| 16. Business details | Not applicable: local FOSS utility, no new business transaction or public service. Repository issue/contact route remains. |
| 17. Children's data | Not applicable: developer utility; no child profiles, age field or new child-directed flow. |
| 18. Unsubscribe | Not applicable: no email is sent. Notifications remain configurable. |
| 19. Asset licenses | Checked: existing repository icon, system fonts and existing Flutter icon assets; no external images or fonts added. |
| 20. Deletion | Checked: real saved-directory deletion and reload tests; failures retain entries for retry. Exported files, backups and project originals are outside gallery deletion. |

References: [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/) for labels, contrast, keyboard access, focus and reflow; [European Commission individual data-protection information](https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en) for transparent storage and deletion descriptions. No compliance certification is claimed.
