# Paddock 0.6.0-preview.47

Windows x64 and Android ARM64, ARMv7 and x64. Update the PC and phone together.

- Phone updates install from inside the app. Settings > Updates > Install update downloads the APK with a progress bar, checks its size and SHA-256 against this release's checksum file, then opens Android's installer for one confirmation. The first time, Android asks you to allow installs from Paddock.
- A download that does not match the checksum is deleted and not installed. All downloads still opens the release page in the browser.

Install this version once from the browser; later versions install from the app.

Windows is unsigned. Android previews keep their existing signing certificate. Physical-phone checks remain pending. Close active work before installing.
