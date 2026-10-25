# Mobile controls

Android preview. Install a compatible APK over your current app to retain pairing and drafts. Updates download from GitHub without a connection to your PC. Do not uninstall or clear app data first.

## Console and chat

The header contains the harness icon, chat name and dropdown, status dot, monitor icon and PC name. Claude and Codex icons are bundled locally. Green pulses while connected and idle, blue indicates work, and red indicates a disconnected or ended console. Status also has an accessibility label. Reduced-motion settings disable the pulse.

Tap the thin blue-pink handle beneath the terminal to enter chat. The confirmed model and effort appear above the message field while chat is open, for example **6.1 Sol · Medium**. Unreported settings show **Model unknown** or **Effort unknown**. The down arrow collapses chat without discarding the draft. Switching consoles starts collapsed; reopening a saved draft restores its reading position. Tap the field to continue writing. An empty field occupies one line and grows to at most 8.5 text lines, with a smaller cap in landscape.

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

Tap either current value to open **Model & effort**. Choose the model and effort locally, then tap **Apply**. Opening, browsing, cancelling, swiping away and closing an unchanged selection send no terminal input. To change **6.1 Sol Medium → Max**, keep the model and change only effort.

Codex choices come from the PC's model catalog, with supported effort metadata when available. Claude uses its documented model aliases and effort levels; availability depends on the model. Applying requires an idle agent and an empty terminal prompt. Paddock does not clear existing PC input. After Apply, it drives recognized numbered CLI menus with an active selection and an Enter/Escape footer. Unsupported layouts stay in the terminal. Reopen the chooser after resolving an unrecognized dialog. Other harnesses retain direct terminal input.

Each selected row waits for the CLI to acknowledge navigation before sending the next key. A changed connection, computer, console or menu stops the operation. Requests are never replayed after reconnect. Unknown confirmation or billing dialogs stay in the terminal for the user; Paddock does not approve them automatically.

Paddock uses the **session only** key when the live menu explicitly advertises it. Otherwise it follows the CLI's normal selection behavior. The footer changes only after an explicit CLI confirmation or fresh confirmed PC metadata. Failed confirmation keeps the pending choice and asks you to inspect the terminal before retrying. Changing a model can affect usage and caching; the CLI's warnings remain relevant. See [Codex commands](https://developers.openai.com/codex/cli/slash-commands/) and [Claude commands](https://code.claude.com/docs/en/commands), checked 21 October 2026. CLI updates can change menu layouts.

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
