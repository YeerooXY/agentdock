# Agent Dock for Android

A native Flutter companion for the Windows app. It connects to your own PC over pinned TLS, shows one live terminal at a time, and loads Results on demand. Optional Firebase alerts use your own project.

For installation, pairing and Firebase setup, see [the Android guide](../docs/android-setup.md).

From preview 4, **Usage → Updates** checks GitHub and opens the APK download for the phone's architecture. Installation remains an Android action. Upgrades signed with the same key preserve pairing; no background update polling runs.

Android preview 5 works with Windows preview 4 or 5. Terminal scrolling, taps and long presses do not open the keyboard. Use the message field for a prompt, or the always-visible keyboard button for direct terminal input. Touching the terminal closes the keyboard and preserves the message draft.

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

`flutter test` covers invalid pairing, narrow layout, separate message submission, interrupted sends, terminal checkpoint replacement, draft retention, on-demand Results, native Markdown and update selection. Root `npm test` exercises the HTTPS/WebSocket protocol, resize ordering, token revocation, compressed reconnects, and mocked Firebase sends. The [preview 3 checks](../docs/mobile-input-resize-review.md) also exercise the installed Codex CLI against a local mock API.

`scripts/mobile-device-fixture.cjs` starts an isolated unpaid Windows test instance for an emulator. `scripts/mobile-adb.cjs` only targets `emulator-5554`; it never chooses a physical phone. Generated pairing codes and profiles stay under ignored `artifacts/mobile-device` and must not be published. Browser profile screenshots test the desktop renderer's responsive fallback, not an iOS app.

See [the original Android checks](../docs/android-review.md) and [direct internet verification](../docs/direct-internet-review.md). Direct internet pairing requires preview 2 on both devices. Physical-phone internet access and live FCM still need testing with real accounts/devices.
