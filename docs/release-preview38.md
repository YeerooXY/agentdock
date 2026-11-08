# Paddock 0.6.0-preview.38

Windows x64 and Android ARM64, ARMv7 and x64.

- Repeated desktop typing no longer serializes the owner registry or invokes scheduler/history listeners when only its activity timestamp changes. Ownership, reservation and critical-save protection remain immediate.
- Desktop protocol updates skip unrelated console rendering and unchanged expand icons. Queue, saved-prompt and review updates still refresh their controls.
- Empty sky animation loops stop. Sprite caching is bounded. Wave colors use the selected frame palette, and breathing has a smaller brightness swing. The separately selected Spectrum cycle remains available.
- Codex OSC 8 hyperlinks and plain web URLs use the existing validated browser opener.
- Android had a separate per-edit rebuild path. Composer changes now rebuild the console workspace without rebuilding the outer home shell. Draft storage, caret handling, send guards and persistence-error notifications remain in place.

Verification includes production builds, desktop unit and Docker desktop checks, four emulated Chromium/WebKit visual and focus profiles, packaged Windows hidden startup, all 4,699 archive file integrity checks, Flutter analysis and 452 Flutter tests. The Android regression fails against preview.37 and passes with the fix. APK version codes increase and use the same preview signing certificate as preview.37.

The focused desktop work-count check removed 200 serializations and 100 synchronous notifications for 100 recency-only interactions. This is not a measured whole-app latency improvement. The reported intermittent flashing, Start-key redraws and affected-PC latency still need live confirmation. Completed task history remains stored and loaded; lazy history loading was not implemented. The Codex metadata startup wait was not redesigned.

Windows remains unsigned. Close active work before installing. Android preview.37 users can update without uninstalling. Physical-phone pairing and native macOS/iOS behavior were not tested for this release.

The release uses a frozen preview.37 source snapshot plus the reviewed desktop fixes and the mobile composer change. GitHub main and the release tag contain that source. Unrelated local changes and the current checkout are preserved.
