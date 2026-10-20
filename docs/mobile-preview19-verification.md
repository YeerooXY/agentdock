# Mobile preview 19 verification

20 October 2026. Scope: the native Android console UI, live model picker, local terminal history and release packaging. The existing Windows console layout and running user sessions were preserved.

## Changes checked

- Harness icon only beside the chat name, including the bundled official Claude icon. Provider names remain accessible to screen readers.
- Compact header with chat dropdown, labeled status dot, bundled monitor icon and PC name. Devices remain in Usage.
- Thin chat handle while collapsed. Model/Effort and message input appear only after opening chat. Collapse preserves drafts; switching consoles does not force a saved draft open.
- One-line composer grows to at most 8.5 text lines with a lower landscape cap. Reopening a draft retains its scroll position without automatically focusing its old caret.
- Old command catalogue, toolbar and arrow/Enter/Esc buttons removed. File/image attachment, links, copying and direct typing remain available in explicit menus.
- Text & display combines wrapping/grid selection with saved text-size adjustment. ANSI colors remain in wrapped output; the PC's terminal dimensions stay unchanged.
- Native model/effort rows come from recognized live CLI menus. Navigation waits for each observed selection change and stops on changed PC, session, provider, connection or menu. The session-only shortcut is offered only when advertised by the CLI.
- Clearing mobile history retains the terminal's current screen, parser modes, cursor and stream checkpoint; both normal and alternate-buffer scrollback are cleared. No remote clear/kill command is sent.

## Automated checks

| Check | Result |
| --- | --- |
| Flutter analysis | No issues |
| Flutter suite | 118 passed |
| Host unit tests | 156 passed, 1 skipped, 0 failed |
| Desktop build and four smoke suites | Passed |
| Packaged Windows smoke | Passed, including real terminal, bundled runtime/tools and restore |
| Android release builds | ARM64, ARMv7 and x86_64 built |
| Android identity | Package unchanged; versionName 0.6.0-preview.19, ARM64 versionCode 2019 |
| APK signing | Preview 18 and 19 ARM64 certificate SHA-256 match |
| Source whitespace check | Passed |

Mobile regressions cover draft text/caret/scroll across consoles and app reconstruction, paste-then-Enter transport, scrolling without keyboard activation, colored wrapping, read-only grid sizing, long messages, narrow layouts, landscape keyboards, reduced-motion behavior, file/close target guards, native row selection and stale connection/provider rejection. Removed tests belonged to the deleted command toolbar; replacement tests exercise the new flow.

## Rendered checks

Android 15 emulator, isolated loopback TLS fixture, synthetic terminal output. Inspected portrait, narrow/doubled system text, landscape, collapsed chat, open chat with keyboard, Codex/Claude icons, model/effort sheets and text settings. No horizontal overflow was observed. Long names truncate in the header and remain available in the switcher. The final APK was installed over an existing paired build and reconnected without another pairing request; the fixture retained one paired device.

Model selection and effort selection were exercised through the real mobile protocol against synthetic menus; the fixture recorded the expected command, navigation and selection keys. These are transport/UI checks, not a claim that every CLI release or account entitlement was tested. Codex's current public model and effort snapshot shapes were reviewed; an attempted isolated local CLI capture did not yield a usable interactive-menu capture. No paid model requests were made.

Screenshots are saved individually in Results and locally under `artifacts/mobile-controls/preview19-*.png`. This native change does not create a browser/iOS build. Windows desktop regression tests passed. macOS/iOS native rendering and physical-phone behavior were not tested or certified by Android emulation. Widget tests also exercised 320px, 393px, landscape and tablet layouts with large text.

## Remaining checks

- Try the chooser with the user's installed Codex and Claude versions. Unknown menu layouts and extra billing/permission dialogs require attention in the terminal; no approval is automated.
- Verify the final download/install on a physical phone. Same-key installation retains app data; uninstalling or clearing data removes it.
- Extended background notification delivery, Doze and mobile-data router reachability were outside this UI change. Existing networking/authentication settings were not modified.

Provider assets are bundled; viewing these screens does not contact a logo service. No additional telemetry, account or permission was introduced. Sources and trademark conditions are recorded in [provider assets](provider-brand-assets.md). User instructions are in [mobile controls](mobile-controls.md).
