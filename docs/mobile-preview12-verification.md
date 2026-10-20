# Android preview 12 verification

Checked on 20 October 2026. This release changes Android UI only. Windows remains on preview 11.

## Automated checks

- 86 Flutter tests passed; `flutter analyze --no-pub` reported no issues.
- Layout tests cover 320×740, 393×852, 852×393 and 1024×768 logical pixels, normal and doubled text, keyboard visibility, rotation, 240 terminal columns and scrollback position.
- Agent commands wait for Send, preserve unsent drafts, and reject stale PC/console targets.
- Link tests preserve a complete synthetic OAuth URL through ANSI styling, soft wrapping and full-width hard wrapping. Unsupported URL schemes, embedded credentials, control characters and malformed URLs are rejected. Open/Copy occur only after a tap; browser failure keeps Copy available.
- Existing saved-device, pinned TLS, route fallback, revocation and update-selection tests passed.
- Release APKs built for ARM64, ARMv7 and x86_64. Flutter reports an existing Firebase plugin Kotlin migration warning; the builds succeed.
- `git diff --check` passed. PC code, connection protocol, encrypted device storage and Android signing configuration are unchanged.

## Upgrade and reconnection

The Android 15 x86_64 emulator first ran a release build of preview 11 from commit `00dee1f`. It paired with an isolated loopback test PC, then received preview 12 through `adb install -r`, without clearing data or uninstalling.

After reopening, preview 12 reconnected automatically. The fixture recorded one saved device before and after, and two successful connection attempts in total. The PC terminal stayed at 80×32 and no terminal input was sent during the upgrade.

The published preview 11 ARM64 APK was checked against GitHub's SHA-256 digest. Both new phone APKs have the same signing certificate as that APK. Package ID remains `com.yeeroo.agentdock.mobile`; version codes increase to 2012 for ARM64 and 1012 for ARMv7.

## Native UI checks

Inspected Android emulator screenshots at approximately 411 and 320 logical pixels wide, doubled system text and landscape. Checked Fit width, the command sheet, link sheet, close controls and Open/Copy button placement. The link sheet scrolls and retains the pink-blue styling.

Open dispatched the complete synthetic URL, including its encoded redirect and query parameters, to Android Chrome. Copy showed confirmation and the URL appeared in Android's keyboard clipboard suggestion. The test fixture received no terminal input from these actions.

Screenshots and local logs are in `artifacts/mobile-controls/` and `artifacts/mobile-preview12-*.log`; selected screenshots are also saved in Dock Results. The fixture uses synthetic content and temporary credentials, never live agent accounts.

## Limits

The upgrade was emulated, not performed on a physical ARM phone or over the owner's mobile connection. A real phone still needs to reopen Dock after installation and have a reachable, running PC. This release does not update, restart or reconfigure that PC.

Very wide terminals use small text in Fit width; Larger text enables horizontal scrolling. Link extraction covers loaded terminal output, with up to 30 recent distinct web links. Arbitrary manually broken links and OSC-only hidden hyperlinks are not reconstructed. URLs are not fetched automatically or retained on disk by this feature.

No new SDK, analytics or cloud service was added. Opening a link sends a normal browser request only after Open; Copy puts the address on the phone's clipboard. Existing privacy and deletion controls are unchanged. Windows, macOS and iPhone UI were not modified or newly verified in this native Android release.
