# Mobile controls

Android preview 19. Install the APK over your current app to retain pairing and drafts. Updates download from GitHub without a connection to your PC. Do not uninstall or clear app data first.

## Console and chat

The header contains the harness icon, chat name and dropdown, status dot, monitor icon and PC name. Claude and Codex icons are bundled locally. Green pulses while connected and idle, blue indicates work, and red indicates a disconnected or ended console. Status also has an accessibility label. Reduced-motion settings disable the pulse.

Tap the thin blue-pink handle beneath the terminal to enter chat. Model and Effort appear above the message field only while chat is open. The down arrow collapses chat without discarding the draft. Switching consoles starts collapsed; reopening a saved draft restores its reading position. Tap the field to continue writing. An empty field occupies one line and grows to at most 8.5 text lines, with a smaller cap in landscape.

Tap the chat name to switch consoles or choose **New console**. New consoles can use a saved project, project subfolder and installed harness. Project selection needs a PC version that advertises that capability; older hosts explain the required update.

## Text, files and links

The top **More options (⋮)** menu provides:

- **Text & display:** Wrap text or the original terminal Grid, plus the saved text-size slider. Wrap text preserves colors and indentation without changing the PC terminal dimensions. Grid fits all PC columns and can be much smaller.
- **Copy text:** select and copy loaded terminal text without typing into the PC.
- **Console links:** open or copy full HTTP/HTTPS URLs from loaded output. Links are not fetched automatically. Localhost links refer to the phone.
- **Type directly in terminal:** explicitly opens the keyboard for terminal interaction. Touching or scrolling output dismisses it; scrolling never requests keyboard focus.
- **Clear mobile history:** drops local scrollback while retaining the active screen, cursor and parser modes. It sends no command to the PC. A later host reset may supply a fresh snapshot including older output.
- **Close console:** asks before stopping that console.
- **App updates** and **Reconnect**.

Inside chat, **+ → Files** inserts a relative path into the draft. It does not upload the file. **+ → Image** opens Android's image picker, uploads the selected image to the local console's project and inserts its path. Send submits the draft. Android 14+ can offer the picker after a screenshot; no screenshot is sent automatically. Upload limits and SSH restrictions remain unchanged.

## Model and effort

Model and Effort open a native list of the running Codex or Claude menu's choices. The list comes from the CLI's current output, with its account availability and descriptions; model names are not embedded in the APK. Codex selects a model before displaying its effort choices. Claude uses its separate effort menu.

Opening a menu requires an idle agent and an empty terminal prompt. Dock does not clear existing PC input. The native picker recognizes numbered model and effort menus with an active selection and an Enter/Escape footer. Unsupported layouts show a message to inspect the terminal. Reopen the chooser after resolving an unrecognized dialog. Other harnesses retain direct terminal input.

Each selected row waits for the CLI to acknowledge navigation before sending the next key. A changed connection, computer, console or menu stops the operation. Requests are never replayed after reconnect. Unknown confirmation or billing dialogs stay in the terminal for the user; Dock does not approve them automatically.

**This session only** is offered and defaults on when the live menu advertises its `s` key. Other choices follow the CLI's displayed default-saving behavior. Changing a model can affect usage and caching; the CLI's warnings remain relevant. [Claude model configuration](https://code.claude.com/docs/en/model-config). The Codex menu shapes were checked against its [official model snapshot](https://github.com/openai/codex/blob/main/codex-rs/tui/src/chatwidget/snapshots/codex_tui__chatwidget__tests__model_selection_popup.snap) and [effort snapshot](https://github.com/openai/codex/blob/main/codex-rs/tui/src/chatwidget/snapshots/codex_tui__chatwidget__tests__model_reasoning_selection_popup.snap) on 20 October 2026. CLI updates can change those layouts.

The Commands button, local slash-command suggestions and arrow/Enter/Esc toolbar have been removed. Ordinary messages and manually typed commands still work.

## Usage, devices and notifications

Usage shows remaining allowance separately for each account window, with provider icons/colors, reset times and refresh. Missing values remain Unknown and stale readings stay marked. A reset time alone never refills the meter. Claude supplies subscription usage through its status-line callback, normally after a response; signing in alone does not produce usage percentages. API amounts remain estimated spending.

Saved computers and phone names are under **Usage → Devices**. **Usage → Notifications → Stay connected** enables direct background alerts without Firebase and uses an ongoing Android notification. Power saving can delay delivery. Firebase remains an optional alternative. [Android setup](android-setup.md).

## Verification

Run `flutter test` and `flutter analyze` from `mobile/`. Tests cover layout, ANSI colors, scrolling, draft restoration, input submission, pairing, native menu navigation and stale targets. See [preview 19 verification](mobile-preview19-verification.md) for actual outcomes and remaining device checks.

The emulator fixture uses loopback TLS, synthetic output and disposable pairing data. It does not connect to a real PC profile or launch an AI request:

```powershell
node scripts/mobile-controls-fixture.cjs
# With AgentDock_Test running as emulator-5554 and a debug APK built:
node scripts/mobile-controls-adb.cjs install
node scripts/mobile-controls-adb.cjs reset
node scripts/mobile-controls-adb.cjs pair
```

The helper refuses physical devices. Create `artifacts/mobile-controls/stop` to stop the fixture; it also expires after 45 minutes. Fixture model selection proves transport and UI behavior, not provider account entitlement or every installed CLI version.
