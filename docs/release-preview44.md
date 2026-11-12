# Paddock 0.6.0-preview.44

Windows x64 and Android ARM64, ARMv7 and x64.

- Removed the saved-prompts button from desktop consoles and the saved-prompts entry from the Android attachment menu.
- Removed the unused desktop popup, Android sheet and their handlers. Existing saved prompt data stays on disk.
- Updated the desktop navigation smoke check to open Projects after removal of Results.

This release contains the saved-prompts removal. Other changes in the development workspace remain unpublished.

Validation: 1,323 Node tests passed with 2 skipped, 441 Flutter tests passed, clean Flutter analysis, production build and hidden startup checks. Release artifacts are checked for package versions, Android signing continuity and SHA-256 hashes before publication.

Desktop CI still has existing cross-platform test failures. Local Docker desktop tests remain blocked by the stopped Linux engine. Physical-phone checks remain pending. Windows is unsigned; Android previews retain their existing signing certificate. Close active work before installing.
