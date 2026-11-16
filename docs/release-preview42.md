# Paddock 0.6.0-preview.42

Windows x64 and Android ARM64, ARMv7 and x64.

- Android uses a compact Messenger-style message pill beside Terminal keys, attachments, one model/effort control and dictation. Send sits beside the pill.
- The image shortcut inside the pill attaches the latest accessible image on the phone, regardless of folder or age. It checks again when tapped. Photo access is requested only after tapping; denied access opens the image picker. Images are uploaded only after an explicit action.
- Dictation opens the phone's speech service and inserts editable text at the draft caret. It does not send the message. Cancellation preserves the draft; changing the draft or console discards the pending result. The speech service may process audio online.
- Drafts, saved prompts and direct CLI input retain their existing behavior. The separate message queue remains removed.

Verification: 460 Flutter tests pass with clean static analysis. Rendering and keyboard navigation checks cover 320px and 393px phones with normal and enlarged text. Windows production build and 1,404 Node tests pass (2 skipped). Android release APKs, packaged archive integrity, hidden packaged startup, APK versions and signing identity are checked before publication.

Physical-phone speech-service and photo-permission verification remains pending. Docker desktop checks remain unavailable while the Linux engine is stopped. Windows remains unsigned. Close active work before installing. Android updates retain pairing and drafts when installed over the existing app; the preview signing certificate is unchanged.
