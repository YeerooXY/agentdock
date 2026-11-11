# Paddock 0.6.0-preview.41

Windows x64 and Android ARM64, ARMv7 and x64.

- The Android reply box stays open with three lines ready for typing. The collapsed handle is removed.
- Terminal keys and Send share the reply box's bottom row and align with its edges.
- One model/effort button opens the combined settings sheet directly.
- The message queue is removed on Windows and Android. Input goes directly to the CLI and follows its own input behavior.
- Saved prompts remain available. On Android, open Attach, then Saved prompts. On Windows, use the document button on an agent console. Using a prompt edits the draft without submitting it.

Verification: frozen-source production build, 1,404 Node tests passed (2 skipped) with serialized test files, clean Flutter analysis and 454 Flutter tests passed. Four headless browser profiles, narrow-phone/enlarged-text rendering and keyboard focus checks passed. All 4,698 packaged archive entries passed integrity checks; packaged startup stayed hidden and unfocused. APK versions and signatures verify.

One 300 ms resume/draft fixture timed out in the first Node run during concurrent packaging. The same test passed alone and in the complete serialized run; no application change was made for this timing failure.

Physical-phone verification remains pending. The Docker desktop suite could not run because the Linux engine was stopped. Windows remains unsigned. Close active work before installing. Android can update without uninstalling; the preview signing certificate is unchanged.
