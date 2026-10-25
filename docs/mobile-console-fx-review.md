# Native phone console effects

24 October 2026. Android preview 21. Branch `main`, base commit
`88409424c563967eed4c2749e9385f04fe46d64c`, with existing working changes preserved.

## Implemented

The native Flutter console now offers the same ten style IDs as the desktop.
Use **Settings → Appearance → Phone console**, or **Console → More options →
Console style**. These preferences apply to this phone's consoles and do not
change the PC. Normal keeps a plain frame. Stars, ambient motion and opening
animations can be switched independently; the preview has a replay control.

| Style | Opening | Persistent detail |
| --- | --- | --- |
| Normal | Soft edge | Plain neutral surface |
| Accent colors | Expanding rings | Blue/pink edge |
| Blue | Horizontal sweep | Blue rails |
| Violet | Orbiting halo | Corner arcs |
| Hot pink | Diagonal reveal | Diagonal corner lines |
| Redline | Rising pulse | Red edge markers |
| Cyber | Cyan scan | Chamfers and a faint grid |
| Arctic | Frost reveal | Ice facets and cross-shaped stars |
| Inferno | Rising embers | Orange/gold edge and ember trails |
| RGB | Spectrum sweep | Moving spectrum border |

Openings last 760 ms and paint behind text. They do not hide content, block input,
or restart on terminal output. Shape and particle drawing use Flutter's canvas;
no images, fonts, dependencies, shader downloads or network requests were added.
The outer border/glow is separate from the clipped content. Particle count is
bounded at 72, with repaint boundaries separating decoration from terminal text.

Both wrapped text and the xterm grid expose the decoration through their default
background. Explicit ANSI backgrounds and inverse video remain opaque. Changing
styles preserves the terminal object, scrollback, reading position and draft.
Reading-view colors update immediately even when no new output arrives.

Preferences use the existing secure-storage library, under `consoleAppearance.v1`.
Invalid fields recover to defaults; a failed save keeps the saved selection and
shows a retryable error. [Privacy documentation](android-setup.md#data-use-and-privacy)
now includes this local preference. No terminal input or PC RPC is sent by these controls.

Motion stops when the app is backgrounded, its route is covered, TickerMode is
disabled, or the platform requests reduced motion. Stars remain visible when
motion is paused. The Flutter implementation checks both disableAnimations and
the engine's separate reduceMotion flag. Android's setting was exercised in the
emulator; iOS remains unbuilt. See [Flutter's animation setting](https://api.flutter.dev/flutter/widgets/MediaQueryData/disableAnimations.html)
and [Android accessibility bridge](https://github.com/flutter/flutter/blob/master/engine/src/flutter/shell/platform/android/io/flutter/view/AccessibilityBridge.java).

## Verification

- `flutter analyze --no-pub`: no issues.
- `flutter test --no-pub`: 147 passed. Includes preference persistence and invalid
  data, failed saves, independent openings, lifecycle/reduced motion, narrow
  controls at 200% text, ANSI colors, provider/style changes preserving drafts and
  scroll position, grid transparency, keyboard behavior and existing pairing tests.
- Release APKs built for ARM64, ARMv7 and x86_64 using the documented toolchain.
  The x86_64 release APK was installed on the dedicated Android API 35 emulator.
  This remains a development-signed preview. No physical phone was changed.
- All ten styles and the controls were captured and visually inspected in the
  native emulator. Checks include live shell output, switching consoles, wrapped
  text/grid, large text, keyboard, stars off/on, and Android reduced motion.
- Test terminal sessions and pairing use an isolated PC fixture. No paid model
  requests or real project commands were submitted. A draft was typed without
  pressing Send. The user's running desktop app and consoles were left running.
- This task changes native Flutter rendering. Desktop browser/OS behavior was
  not re-tested; no desktop rendering files were changed. There is no iOS target
  in this project. Physical Android, TalkBack, external keyboard, real iOS/macOS
  fonts, device GPU behavior and battery measurements remain outside this check.

Evidence: `artifacts/mobile-fx/` (screenshots, analysis/test/build logs),
`mobile/test/console_appearance_test.dart`, and `scripts/mobile-fx-check.cjs`.
The first screenshot is the previously installed Android preview, which predates
other working mobile changes; it is not a claim that this task authored all layout differences.

The Windows QEMU process crashed three times with an access violation using
SwiftShader and SWANGLE. Captures resumed using `-gpu host`; the installed APK
was unchanged. This identifies an emulator failure, not its root cause. Keep the
software-renderer failures as a test-environment limitation. Android documents
[graphics backend selection](https://developer.android.com/studio/run/emulator-acceleration).

## Page review

This applies to the native console, appearance sheet and Appearance settings
panel. Existing pairing, SDK and data handling context is in the
[Android review](android-review.md) and [mobile security review](mobile-security-review.md).
Statuses describe this focused change, not a whole-product certification.

| Item | Status and evidence |
| --- | --- |
| 1 Privacy | Checked: local appearance storage documented in the linked setup/privacy guide. |
| 2 Terms | Not applicable: no new service, account or agreement. |
| 3 Refunds | Not applicable: no sale or subscription. |
| 4 Storage disclosure | Checked: one local preference; no cookies or network synchronization. |
| 5 Cookie consent | Not applicable: no web tracking technology added. |
| 6 Form consents | Not applicable: style controls collect no personal data or permission. |
| 7 Data minimization | Checked: ten allowlisted IDs and three booleans only. |
| 8 SDKs | Checked: no new SDK or dependency; existing inventory remains in Android review. |
| 9 Dark patterns | Checked: independent switches, close/back controls, plain Normal style. |
| 10 Fees | Not applicable: effects make no service requests. |
| 11 Reviews | Not applicable: no testimonials or social proof. |
| 12 Claims | Checked: sample labeled Preview; no fabricated progress or performance promise. |
| 13 Alternatives | Checked: decoration excluded from semantics; controls have labels/tooltips. |
| 14 Contrast | Checked in scope: existing readable ANSI palette retained; bright default foregrounds on dark surfaces; emulator inspection. Arbitrary shell ANSI colors remain shell-controlled. |
| 15 Keyboard | Checked in scope: existing interaction suite passes, native keyboard/draft checked; no decorative hit targets. Physical keyboard/TalkBack remain manual checks. |
| 16 Business details | Not applicable: local appearance controls, no merchant flow. |
| 17 Children | Not applicable: no audience, account or collection changes. |
| 18 Email | Not applicable: no email feature. |
| 19 Licenses | Checked: original procedural drawing, existing Material icons and system font; no new asset/license. |
| 20 Deletion | Checked: preferences can be changed locally or removed by clearing Android app storage. No remote copy is created. |

## Security review of the change

The new code paints local decoration and stores appearance preferences. Server,
transport, authentication, attachment and AI permissions remain unchanged; their
existing boundaries and limitations are recorded in the mobile security review.

| Item | Status and evidence |
| --- | --- |
| 21 Database credentials | Not applicable: no database access in this change. |
| 22 Public env files | Not applicable: no web deployment or env files added. |
| 23 Hardcoded keys | Passed: constants contain public palettes and labels only. |
| 24 Authentication | Not applicable to appearance: existing pairing flow retained; connection tests pass. |
| 25 Authorization | Passed in scope: appearance sends no PC RPC; regression test checks this. |
| 26 Other users' data | Not applicable: phone-local settings with no user-record access. |
| 27 Database permissions | Not applicable: no database. |
| 28 Cloud storage | Not applicable: no cloud assets or storage. |
| 29 Admin routes | Not applicable: no server route added. |
| 30 Debug pages | Passed: test scripts are outside the APK's Dart entrypoint. |
| 31 Build logs | Passed in scope: build output reviewed; no preference or credential logging added. |
| 32 Verbose errors | Passed: save failure shows a fixed recovery message. |
| 33 Repository exposure | Not applicable: no publication or repository visibility changes. |
| 34 Frontend secrets | Passed: theme model carries no secrets; existing secure storage reused. |
| 35 Client-only checks | Not applicable: settings affect only local painting. |
| 36 Validation | Passed: IDs and booleans validated; malformed storage tests pass. |
| 37 SQL injection | Not applicable: no SQL. |
| 38 NoSQL injection | Not applicable: no query objects. |
| 39 XSS | Passed: native Text/Canvas only; terminal input never becomes markup. |
| 40 CSRF | Not applicable: no browser requests. |
| 41 Uploads | Not applicable: no attachment changes. |
| 42 Path traversal | Passed in scope: fixed preference key, no user-built path. |
| 43 SSRF | Not applicable: no fetches. |
| 44 Password reset | Not applicable: no password workflow. |
| 45 Sessions | Passed in scope: existing terminal object retained; style/provider changes tested. Authentication tokens unchanged. |
| 46 JWT secrets | Not applicable: no JWT use added. |
| 47 CORS | Not applicable: no server changes. |
| 48 Rate limits | Not applicable: no API calls; repeated saves are disabled while a write is pending. |
| 49 Staging | Passed: separate loopback fixture and emulator; no real data submitted. |
| 50 Default credentials | Passed in scope: no credential constants added. |
| 51 Webhooks | Not applicable: no webhook handler. |
| 52 Payments | Not applicable: no payment flow. |
| 53 Direct object references | Not applicable: appearance does not address remote records. |
| 54 Trusted IDs/roles | Not applicable: theme IDs select local palettes, not privileges. |
| 55 Sensitive logs | Passed: no new logging of terminal data or preferences. Fixture pairing files remain ignored and outside deliverables. |
| 56 Source maps | Not applicable: native APK, no new web output. |
| 57 Dependencies | Not applicable to dependency changes: none added or updated; Flutter lockfile retained. This is not a new ecosystem-wide vulnerability audit. |
| 58 Package age | Not applicable to upgrades: documented installed toolchain retained; existing Kotlin-plugin migration warning remains. |
| 59 Prompt injection | Not applicable: effects never send model instructions. |
| 60 AI permissions | Passed in scope: no AI or terminal action from appearance controls. |
| 61 DB user rights | Not applicable: no database. |
| 62 Audit trail | Passed in scope: branch/base, source changes and test evidence recorded here. |
| 63 Monitoring | Not applicable: no hosted service added. |
| 64 Backup/restore | Passed in scope: task baselines retained locally; preference round-trip and failed-write recovery tested. No off-machine backup claim. |
| 65 Internal dashboards | Not applicable: no new hosting or exposed dashboard. |
| 66 Security headers | Not applicable: native decoration, no HTTP response changes. |
| 67 Cookies | Not applicable: no cookies. |
| 68 Encryption | Passed in scope: existing secure-storage library reused; no plaintext fallback or transport changes. |
| 69 Tenant isolation | Not applicable: local preference with no tenant records. |
| 70 Generated code | Passed: source reviewed, static analysis/tests/builds passed, native captures inspected; device limitations recorded above. |
