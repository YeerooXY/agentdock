# Shooting star motion verification

24 October 2026. Prompt 2 on branch `main`; existing staged, unstaged and untracked work remains preserved. The desktop and Flutter sky now give each comet one angle and speed, move its head along that vector, and draw an 80 px tail on the same vector. The head stays bright while the tail fades. The desktop speed is measured in pixels per second and does not depend on panel width or height. Flutter recreates a stable shot from its cycle seed on each repaint. The elapsed sky clock, seeded particle pool, pause/resume phase and live recoloring remain in place.

The Blue texture was left unchanged for the separate prompt 3 work.

## Verification

| Check | Result / evidence |
| --- | --- |
| Focused desktop comet check | Passed 8 path, angle, length, speed, gradient, head and fade checks in each of four profiles. The deterministic sample measured 27.5°, 80 px and 270 px/s at every aspect ratio. No page errors or external requests. `../.build/shooting-stars-20261024/final-visual/checks.json`, `desktop-comets-final.log` |
| Desktop screenshots | Inspected the full Appearance view and a clean sky panel for each profile. Windows wide (1280 × 420), desktop WebKit wide (1440 × 900), Android tall (412 × 839), iPhone tall (390 × 664). See captures below. |
| Flutter focused test | Passed. It checks the expected head location, stable speed across wide/tall surfaces and tail fade; saved wide and tall painter captures. `../.build/shooting-stars-20261024/flutter-focused-retry3.log` |
| Settings motion/RGB regression | Passed: 20 live updates, 39 motion checks and 22 color-isolation checks per profile; no issues. `../.build/settings-theme-live-20261024/shooting-star-regression/checks.json`, `../.build/shooting-stars-20261024/settings-theme-live-regression.log` |
| `flutter analyze` / full `flutter test` | No analysis issues; all 148 tests passed. `../.build/shooting-stars-20261024/flutter-analyze.log`, `flutter-test.log` |
| `npm run build` | Passed with the existing warning about a bundle larger than 500 kB. `../.build/shooting-stars-20261024/build-final.log` |
| `npm test` | 224 passed, 1 skipped, 0 failed. The skip requires a local WSL Claude installation. `../.build/shooting-stars-20261024/npm-test.log` |
| `npm run test:desktop` | Passed all four suites. Tests used their existing fake CLIs and paid-call guards. `../.build/shooting-stars-20261024/npm-test-desktop.log` |

### Desktop browser captures

All browser checks ran on Windows. Mac Safari, Android and iPhone are browser-engine/device-profile emulations; the Windows Chromium profile uses the local Windows browser. These captures do not establish native macOS/iOS font rendering or physical-device behavior.

- Windows Chromium: [wide sky panel](../.build/shooting-stars-20261024/final-visual/pc-wide-shooting-star-panel.png), [Appearance view](../.build/shooting-stars-20261024/final-visual/pc-wide-shooting-star-settings.png)
- Desktop WebKit / Mac emulation: [wide sky panel](../.build/shooting-stars-20261024/final-visual/mac-wide-shooting-star-panel.png), [Appearance view](../.build/shooting-stars-20261024/final-visual/mac-wide-shooting-star-settings.png)
- Android Chromium / Pixel 7 emulation: [tall sky panel](../.build/shooting-stars-20261024/final-visual/android-tall-shooting-star-panel.png), [Appearance view](../.build/shooting-stars-20261024/final-visual/android-tall-shooting-star-settings.png)
- iPhone WebKit / iPhone 13 emulation: [tall sky panel](../.build/shooting-stars-20261024/final-visual/iphone-tall-shooting-star-panel.png), [Appearance view](../.build/shooting-stars-20261024/final-visual/iphone-tall-shooting-star-settings.png)

Flutter painter captures were produced by the Windows widget test at [wide](../.build/shooting-stars-20261024/mobile/flutter-wide-shooting-star.png) and [tall](../.build/shooting-stars-20261024/mobile/flutter-tall-shooting-star.png) sizes. They are test-rendered images, not physical Android/iPhone captures.

## Review scope and remaining checks

The existing page and security checklist statuses remain in [the console theme review](console-themes-review.md#page-review) and its [security review](console-themes-review.md#security-review). This change adjusts drawing in the existing decorative sky canvas; it adds no controls, storage, routes, IPC, credentials, network access or service permissions. The full Settings motion/theme isolation evidence remains in [the prior live verification](settings-theme-live-verification.md). These references retain the unchanged-flow evidence and do not claim a new audit of unrelated features.

No paid model requests were made. Manual checks remain on native macOS Safari and physical Android/iPhone devices, including sustained motion and device rendering. No account login or installation is needed for these checks.
