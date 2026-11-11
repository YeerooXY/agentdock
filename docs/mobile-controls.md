# Mobile controls

Android preview. Install a compatible APK over your current app to retain pairing and drafts. Updates download from GitHub without a connection to your PC. Do not uninstall or clear app data first.

## Console and chat

The header contains the harness icon, chat name and dropdown, status dot, monitor icon and PC name. Claude and Codex icons are bundled locally. Green pulses while connected and idle, blue indicates work, and red indicates a disconnected or ended console. Status also has an accessibility label. Reduced-motion settings disable the pulse.

The compact message pill stays open beneath the terminal and grows within the existing height limit. Terminal keys, attachments, model/effort and dictation sit beside it. The latest-image shortcut sits inside its right edge, with Send beside the pill. Switching consoles restores that console’s draft, caret and reading position without opening the keyboard.

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

In the reply box, **+ → Files** inserts a relative path into the draft. It does not upload the file. **+ → Image** opens Android's image picker, uploads the selected image to the local console's project and inserts its path. Send submits the draft. The thumbnail shortcut attaches the latest image accessible through Android photo permissions, regardless of folder or age. Photo access is requested only after tapping it; denied access opens the image picker. Nothing is uploaded automatically. Upload limits and SSH restrictions remain unchanged.

## Model and effort

Tap the model/effort control to open **Model & effort**. Make both choices in that sheet, then tap **Apply**. Browsing or cancelling sends no terminal input.

Choices and supported effort levels come from the PC. Applying reloads the selected saved conversation while preserving its draft. An active turn or real CLI prompt can block the change. A failed change keeps the original console available; pending values remain marked until confirmed.

Each selected row waits for the CLI to acknowledge navigation before sending the next key. A changed connection, computer, console or menu stops the operation. Requests are never replayed after reconnect. Unknown confirmation or billing dialogs stay in the terminal for the user; Paddock does not approve them automatically.

Paddock uses the **session only** key when the live menu explicitly advertises it. Otherwise it follows the CLI's normal selection behavior. The footer changes only after an explicit CLI confirmation or fresh confirmed PC metadata. Failed confirmation keeps the pending choice and asks you to inspect the terminal before retrying. Changing a model can affect usage and caching; the CLI's warnings remain relevant. See [Codex commands](https://developers.openai.com/codex/cli/slash-commands/) and [Claude commands](https://code.claude.com/docs/en/commands), checked 21 October 2026. CLI updates can change menu layouts.

## Tap to choose in CLI dialogs

When Claude or Codex shows a choice dialog (a question, a permission request, a trust prompt, a settings menu), a panel above the chat controls lists its options. Tap one: Paddock moves the CLI's own selector there one row at a time, waits for the screen to confirm each move, then presses Enter. **Cancel dialog** sends Esc. Showing the panel sends nothing, and Paddock never picks an option for you.

- A row that needs typed text (for example "Type something.") is selected, Enter is not pressed, and Terminal keys opens for your reply.
- Multi-select dialogs and dialogs with several questions show a note and stay in the terminal.
- A step stops if the connection, console or dialog changes. Nothing is replayed.
- Only providers with a profile in `mobile/lib/agent_dialog.dart` are read (Claude and Codex). Other harnesses keep Terminal keys.

Verified against real captures: Claude trust prompt, `/model`, `/theme` (including the moved check mark) and Codex `/model`, reasoning and `/permissions`, plus Up, Down and Esc behavior in the live CLIs. Reconstructed, not captured: Claude's question and permission dialogs and Codex's approval dialog, because raising them needs a model request. Replace those fixtures with captures when they can be raised safely. See `mobile/test/agent_dialog_test.dart` and `mobile/test/agent_dialog_panel_test.dart`.

Adding a harness: add a profile (selector character, start-up banner), capture each dialog it shows into `mobile/test/fixtures/`, add parser tests per dialog, then simulated tap tests in the panel test.

## Folder trust and permission prompts

Tap **Terminal keys** beneath the output to answer the CLI's current dialog. The sheet shows the selected console, folder and live terminal text. **Up / Down** change a menu selection, **Enter** confirms it, and **Esc** cancels where the CLI supports it. Left, Right, Tab, Space and Ctrl+C are also available for other terminal prompts.

For a prompt asking for a typed answer, enter it in **Reply text**, then tap **Type text**. This sends the text without a newline or chat paste markers. Tap **Enter** separately if the CLI asks for it. A `y`/`n` prompt can therefore receive one key without also submitting an extra Enter. Opening or closing the sheet sends nothing; it never trusts a folder automatically.

Each action sends one input to the original console. Controls stop after switching PCs/consoles, reconnecting or changing sessions. A failed delivery is not replayed. The ordinary chat draft remains separate. This works through the shared terminal transport for Claude, Codex and other harnesses; it does not depend on recognizing a specific permission dialog or receiving a status hook.

The Commands button and local slash-command suggestions remain removed. Ordinary messages and manually typed commands still work.

## Usage, devices and notifications

Usage shows remaining allowance separately for each account window, with provider icons/colors, reset times and refresh. Missing values remain Unknown and stale readings stay marked. A reset time alone never refills the meter. Claude supplies subscription usage through its status-line callback, normally after a response; signing in alone does not produce usage percentages. API amounts remain estimated spending.

**Usage** shows account allowances and API estimates. **Settings → Devices** manages computers and phone names. **Settings → General → Stay connected** enables direct background alerts without Firebase and uses an ongoing Android notification. Power saving can delay delivery. Firebase remains an optional alternative. **Settings → Appearance** controls text size. The API, Keys, Tools and Instructions categories show the selected PC's configuration; edit those settings on the PC. Key values and connection bindings stay on the PC. [Android setup](android-setup.md).

## Verification

Run `flutter test` and `flutter analyze` from `mobile/`. Tests cover layout, ANSI colors, scrolling, draft restoration, input submission, pairing, pending selections, native menu navigation and stale targets. See [interface verification](settings-results-controls-review.md) for actual outcomes and remaining device checks.

The emulator fixture uses loopback TLS, synthetic output and disposable pairing data. It does not connect to a real PC profile or launch an AI request:

```powershell
node scripts/mobile-controls-fixture.cjs
# With AgentDock_Test running as emulator-5554 and a debug APK built:
node scripts/mobile-controls-adb.cjs install
node scripts/mobile-controls-adb.cjs reset
node scripts/mobile-controls-adb.cjs pair
```

The helper refuses physical devices. Create `artifacts/mobile-controls/stop` to stop the fixture; it also expires after 45 minutes. Fixture model selection proves transport and UI behavior, not provider account entitlement or every installed CLI version.

Saved prompts are available under **+ → Saved prompts**. Using one only edits the draft. Paddock has no separate message queue; direct input follows the CLI’s behavior.

Dictation opens the phone’s speech service and inserts its result at the draft caret. Review or edit it before sending. The speech service may process audio online. Cancellation leaves the draft unchanged; changing the draft or console discards the pending result. Paddock stores no voice recording.
