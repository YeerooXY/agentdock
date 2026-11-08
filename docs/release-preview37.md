# Paddock 0.6.0-preview.37

Windows x64 desktop and Android preview.

- Planning briefs identify the user scenario, existing code to reuse and reasons for extra mechanisms. Builders report reuse; reviewers check behavior-preserving deletion and unnecessary duplication.
- Shared instructions remain within the existing compact-context budget. Task status supports compact summaries, explicit details and bounded waiting.
- Android removes the Results navigation destination and the Projects All outputs button. No replacement link or old-desktop fallback was added.
- The rejected task-loop extraction was removed; this release makes no 350-line refactor claim.

Close active desktop work before installing. The installer preserves the existing profile. Windows is unsigned. Android uses the existing application ID and preview signing certificate with a higher version code, so it can update preview.36 without uninstalling. Choose arm64 for most current phones; armv7 and x64 downloads are also included.

Verification: Windows Node tests (1,402 passed, 2 skipped), Linux Node tests (1,396 passed, 7 skipped), production build, focused workflow checks, Flutter analysis, 451 Flutter tests, Linux unit and headless desktop checks, Android emulator navigation, APK signature checks and all 4,650 Windows archive integrity entries. Tests use fixtures and make no paid model requests. Physical-phone pairing and native macOS/iPhone behavior were not tested for this release.

The source tag is built from a frozen release snapshot. Ongoing working-tree changes and the current branch are preserved.
