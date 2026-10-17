# Mobile input and resize checks — preview 3

Send now writes the message and Enter separately. Bracketed paste is used when the console supports it, so multiline messages remain intact. An interrupted connection or console switch cancels the pending Enter and keeps the draft. The keyboard row also has a separate Enter button.

The phone now replaces its terminal parser on a full checkpoint. Desktop size changes reach the mirrored terminal before its redraw; rapid size reversals keep the final dimensions. Ordinary output no longer resets scroll margins by resizing an unchanged screen.

## Verification

- Installed Codex 0.156.1 in an isolated ConPTY with a disposable profile and local mock API: the previous combined text/Enter needed another Enter; the new multiline paste followed by Enter submitted exactly once. Two local requests, no paid calls. Run `node scripts/mobile-input-smoke.cjs`.
- Node suite: 97 passed, 1 skipped. Both new resize regressions failed before the fix and pass after it.
- Flutter: analysis clean; 15 tests passed, including checkpoint replacement, delayed Enter, interrupted sends, draft preservation and the separate Enter control.
- Desktop and packaged installer smoke suites passed. Windows installer and all three Android APK architectures built.
- Native Android emulator: updated APK installed over preview 2, paired to an isolated desktop instance, and Send executed `Write-Host PHONE_SEND_OK` without a second keypress. Screenshots are kept in ignored `artifacts/mobile-device`.

The user's physical Codex phone flow still needs retesting with both preview 3 builds. Existing pairing survives an in-place update with the same signing key. Desktop sessions must be closed normally before restarting to load the backend fix.

No background-alert transport changed. Firebase remains optional; without it, this build receives updates while the companion is open. A direct background connection would need an Android foreground service and battery-management handling.
