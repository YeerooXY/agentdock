# Paddock for Android

A native Flutter companion for the Windows app. It connects to your own PC over pinned TLS, shows one live terminal at a time, and loads Results on demand. Optional direct alerts keep a status connection open without a cloud account. Firebase alerts remain available with your own project.

For installation, pairing and notification setup, see [the Android guide](../docs/android-setup.md).

**Updates** on the connection screen, **App updates** above the consoles, and **Usage → Updates** check GitHub directly. Pairing and a PC connection are not required. **All downloads** opens the release list if the check fails. Install the APK using Android; upgrades signed with the same key preserve pairing. No background update polling runs.

**Connection settings** can change a known PC address while retaining the saved certificate pin. Updated PCs also send their current addresses over the authenticated connection, so reconnecting on Wi-Fi can refresh an old internet address. Use dynamic DNS in PC Phone setup for unattended access when your home IP changes. Foreground WebSocket pings detect broken connections; commands are never automatically resent.

Use the current preview on both devices for new pairing and compare the approval code on the PC. The approval protocol requires preview 8 or later; upgrades preserve existing pairing. Terminal scrolling, taps and long presses do not open the keyboard. Use the message field for a prompt, or the always-visible keyboard button for direct terminal input. Touching the terminal closes the keyboard and preserves the message draft.

## Build

Tested with Flutter **3.47.7**, Dart **3.13.5**, JDK **17**, and Android SDK **36** on Windows. Android 7/API 24 is the minimum. Install Flutter and the Android SDK using their official setup instructions, accept the SDK licenses, then run from this folder:

```powershell
flutter pub get
flutter analyze
flutter test
flutter build apk --release --split-per-abi
```

APKs are written to `build/app/outputs/flutter-apk/`. Use `app-arm64-v8a-release.apk` for most phones, `app-armeabi-v7a-release.apk` for older 32-bit devices, and `app-x86_64-release.apk` for the emulator.

The current preview uses the local Android development signing key even in release mode. Configure a durable private release/upload keystore before a store release; never commit that keystore or its passwords. Users may need to uninstall a development build before installing a differently signed build. No iOS project is included yet.

Do not put `google-services.json` or service-account JSON in the app source. Each PC imports its user's files; the APK loads only public Firebase options at runtime. Native initialization also runs when Android starts the app for a background FCM message. The private sender key never reaches the APK.

## Checks

Preview 21 adds phone console styles under **Settings → Appearance** and the
console menu's **Console style**. Normal, Accent colors, Blue, Violet, Hot pink,
Redline, Cyber, Arctic, Inferno and RGB each have a distinct opening animation.
Stars, ambient motion and opening animations have separate switches. Preferences
stay on the phone and apply to its console views; PC appearance is unchanged.
Effects pause while the app is backgrounded, covered by another route or under
the device's reduced-motion setting. Explicit ANSI backgrounds stay opaque.

See [native console FX verification](../docs/mobile-console-fx-review.md).

`flutter test` covers invalid pairing, narrow layout, separate message submission, interrupted sends, terminal checkpoint replacement, draft retention, on-demand Results, native Markdown and update selection. Root `npm test` exercises the HTTPS/WebSocket protocol, resize ordering, token revocation, compressed reconnects, and mocked Firebase sends. The [preview 3 checks](../docs/mobile-input-resize-review.md) also exercise the installed Codex CLI against a local mock API.

`scripts/mobile-device-fixture.cjs` starts an isolated unpaid Windows test instance for an emulator. `scripts/mobile-adb.cjs` only targets `emulator-5554`; it never chooses a physical phone. Generated pairing codes and profiles stay under ignored `artifacts/mobile-device` and must not be published. Browser profile screenshots test the desktop renderer's responsive fallback, not an iOS app.

See [the original Android checks](../docs/android-review.md) and [direct internet verification](../docs/direct-internet-review.md). New direct internet pairing requires preview 8 on both devices. Physical-phone internet access was verified by the owner on 18 October 2026. Live FCM and the new approval flow on a physical phone still need testing.
