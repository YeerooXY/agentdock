# Agent Dock for Android

A native Flutter companion for the Windows app. It connects to your own PC over pinned TLS, shows one live terminal at a time, and loads Results on demand. Optional Firebase alerts use your own project.

For installation, pairing and Firebase setup, see [the Android guide](../docs/android-setup.md).

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

`flutter test` covers invalid pairing, narrow layout, draft retention, on-demand Results and native Markdown. Root `npm test` exercises the HTTPS/WebSocket protocol, token revocation, compressed reconnects, and mocked Firebase sends.

`scripts/mobile-device-fixture.cjs` starts an isolated unpaid Windows test instance for an emulator. `scripts/mobile-adb.cjs` only targets `emulator-5554`; it never chooses a physical phone. Generated pairing codes and profiles stay under ignored `artifacts/mobile-device` and must not be published. Browser profile screenshots test the desktop renderer's responsive fallback, not an iOS app.

See [verification and remaining device checks](../docs/android-review.md). Live FCM and off-network Tailscale have not yet been exercised with real accounts/devices.
