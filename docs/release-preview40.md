# Paddock 0.6.0-preview.40

Windows x64 and Android ARM64, ARMv7 and x64.

- Long phone chats render in pages of 120 terminal rows. Earlier, Later and Latest output keep retained history accessible. Reading an older page or selecting text pauses live replacement until Show new output is chosen.
- The phone keeps the latest acknowledged sent message for each console. Expand Sent to read or copy the full message. Failed submissions preserve the draft and the previous sent message. Saved text uses the phone's existing encrypted draft store.
- Model and effort are visible above the phone composer, including at enlarged text sizes.
- Claude model changes handle the resume confirmation shown for large conversations. Settings-change errors identify the failing step, and Claude's status line includes effort.

Verification: frozen-source production build, 1,409 Node tests passed (2 skipped), clean Flutter analysis and 465 Flutter tests passed. All 4,699 packaged Windows archive entries passed integrity checks; packaged startup stayed hidden and unfocused. Narrow-screen, enlarged-text and keyboard focus checks passed. Terminal/checkpoint replays matched at 66 and 110 columns. Android version codes increase and APK signatures verify.

Physical-phone acceptance remains unverified. The headless desktop suite could not run because Docker's Linux engine was stopped. The reading view displays the CLI's terminal output, including transient progress rows; it is not a reconstructed chat transcript.

Windows remains unsigned. Close active work before installing. Android users can update without uninstalling; the preview signing certificate is unchanged.
