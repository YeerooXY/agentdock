# Codex mobile model switching

The shared draft-preservation code could delete its temporary `PDK…` suffix before Codex imported the editor file. It waited for any output after the editor acknowledgement. A background redraw could satisfy that wait, so the suffix appeared after the deletion. The second capture then saw a changed draft and cancelled the switch.

`Sessions.removeNativeDraftMarker` now waits for the unique suffix in terminal output before sending deletion keys. It tolerates ANSI styling and wrapping, has a bounded timeout, and is shared by capture and restoration. Existing exact-draft comparisons and staged replacement checks remain in place. This covers model and account switching without changing the phone protocol.

The background-redraw regression failed before the change and passed afterward. Additional checks cover wrapped markers and timeout without deletion keys. The account-switch fixture now emits the imported draft rather than an unrelated space. A temporary real Codex 0.166 Windows PTY check passed empty-draft capture and multiline Unicode capture/restoration, including trailing whitespace, with no inference submitted. That check did not verify a complete live model switch. Its PTY shutdown emitted a node-pty AttachConsole warning after the assertions passed.

Local assistance was attempted once. Strata had no loaded model, so no local inference ran. The fix was completed directly. No savings claim is made.

Validation: `npm run build` passed. `npm test` passed 1,008 tests with one platform skip. `npm run test:linux` passed 1,002 tests with seven platform skips and all five headless desktop scripts. Unrelated concurrent changes were preserved.

The desktop process must restart to load this main-process change. No Android rebuild is required. Clear any marker left by the earlier failed operation before trying again.
