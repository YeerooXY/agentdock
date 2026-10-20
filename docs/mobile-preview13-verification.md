# Preview 13 verification

Checked on 20 October 2026. This release adds Android reading, console selection and draft controls, plus three authenticated PC operations: agent choices, file names and confirmed console closure.

## Automated checks

- 104 Flutter tests passed; `flutter analyze --no-pub` reported no issues.
- Host tests: 149 passed, one skipped. New tests cover one-time agent selection, unchanged defaults, rejection of arbitrary commands and paths, confirmed closure of the selected console, traversal and junction rejection, and filename exclusions.
- `npm run build`, all four `npm run test:desktop` smoke suites and `npm run test:packaged` passed. The packaged check launches an isolated app and real test terminal, checks bundled tools/MCP, and restores a test console. No paid model requests were made.
- Mobile tests cover narrow screens, doubled system text, landscape keyboards, exact copy output, stable text selection, chat-name menus, old-host compatibility, stale command/file/close targets and unchanged PC terminal dimensions.
- Draft tests cover PC/console isolation, stable console keys across restarts, restoring the composer, serialized encrypted writes and visible storage errors. No plaintext fallback was added.
- Release APKs built for ARM64, ARMv7 and x86_64. The Windows installer also built. An initial NSIS attempt failed to open its output file; packaging the same prepared app succeeded on retry. Existing bundle-size and Firebase plugin migration warnings do not fail the builds.

## Native Android checks

Used an Android 15 x86_64 emulator with a temporary loopback TLS host and synthetic Codex/Claude consoles. Inspected screenshots at approximately 411 and 320 logical pixels wide, doubled system text and landscape. These are emulated checks, not physical-phone validation.

- A 180-column PC terminal wraps at normal font size on the phone. Its dimensions remain 180×32.
- Long-press opens Android's text-selection Copy menu without opening the keyboard. Copy all shows Android clipboard feedback. Selection pauses visible output updates until released or refreshed.
- The chat name opens a compact console dropdown. Claude and Codex have distinct, readable labels. Doubled text exposed a clipped badge; the final build uses a compact display toggle and selected-only navigation labels at that scale.
- The file picker navigates a subfolder and inserts `src/mobile.dart` into the selected draft without sending it. Agent and command selection also stage changes before submission.
- Different drafts remain in the synthetic Codex and Claude consoles after switching and force-stopping/reopening Android.
- Closing a console requires a named confirmation. Cancel keeps it open. Confirming closed only the synthetic Claude console and returned to Codex with its draft intact; host tests also verify the selected-session restriction.

No terminal input was sent by reading, copying, choosing files or switching consoles. The fixture recorded no writes during these checks.

## Upgrade and compatibility

Installed the preview 13 x86_64 release APK over the emulator's preview 12 debug installation with `adb install -r`, using the existing development signing key. App data was not cleared. It reconnected with the same saved pairing, and both console drafts remained available. This checks retained data and reconnection; it does not substitute for a physical ARM release-to-release upgrade.

The package ID remains `com.yeeroo.agentdock.mobile`. Both phone release APKs use the existing signing certificate, with version codes 2013 for ARM64 and 1013 for ARMv7.

Reading, copying, command shortcuts, colored labels, the chat-name dropdown and draft storage work with older PC hosts. Agent selection, file suggestions and console closure require Windows preview 13. Unsupported controls explain that the PC needs an update.

The owner's running PC app and consoles were not restarted or updated. Installing Windows later will end its running processes; choose an appropriate time. Phone-only installation does not restart the PC.

## Storage, permissions and limits

Drafts use the phone's existing OS-backed secure storage, keyed by PC certificate identity and stable console key. Sending, clearing or forgetting removes the corresponding drafts. Storage is bounded to 128 recent drafts and a combined target of 1 MiB; the newest individual draft can exceed that target. Writes are coalesced for 200 ms and flushed on backgrounding. Abrupt termination during a pending write can lose the newest edit.

The new PC operations use the existing authenticated, pinned connection. Agent launch accepts a fixed installed-agent ID and preserves PC launch defaults; it does not accept remote command, working-directory, model or permission overrides. File listing returns bounded names only, rejects traversal and links/junctions, excludes common credential/dependency folders, and rechecks the connection and selected session after asynchronous work. This is not an OS filesystem sandbox.

No new SDK, analytics, cloud service, branding assets or dependencies were added. Copying explicitly puts text on the system clipboard. Labels remain textual as well as colored; the lowest tested agent-label contrast is 7.06:1 on its tinted background. Reduced-motion settings disable the dropdown animation. These checks do not establish complete accessibility conformance.

Wrap text is a readable rendering of the loaded terminal buffer, not a recovered conversation. Grid remains available for original colors, cursor positioning, tables and interactive menus. Copying covers at most the loaded 1,000 terminal lines. Command suggestions cover Dock's known shortcuts, not arbitrary CLI plugins. Claude subscription percentages remain unavailable until the CLI supplies them; the app shows a waiting state.

Physical Android input/selection, installed CLI versions and access over the owner's mobile network remain manual checks. Windows smoke tests passed; macOS and iPhone interfaces were not changed or newly verified.

Local screenshots and logs are in `artifacts/mobile-controls/`. Selected screenshots and this report are saved individually in Dock Results.
