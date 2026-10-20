# Mobile terminal controls

Available in Android **0.6.0-preview.12**. Works with Windows preview 11 without updating or restarting the PC. Install over your current Android app to preserve saved computers.

## Fit width

The terminal starts in **Fit width**. It shows all PC terminal columns within the phone's frame. Very wide terminals use small text. Tap **Fit width** to switch to **Larger text**, then swipe sideways to read. Tap **Larger text** to fit the width again.

This changes the phone's rendering only. The PC terminal keeps its dimensions, process and scrollback. Turning the phone or showing the keyboard also leaves that grid unchanged. The display choice lasts while viewing the current PC; opening the app or switching PCs starts in Fit width.

The message box and keyboard button start typing. Touching the terminal returns to reading. Enter, Escape and the arrow buttons are below the terminal. Swipe that button row for Tab and Ctrl C. With a landscape keyboard and large system text, the controls can scroll vertically to remain reachable.

## Models and commands

Tap the pink sliders button beside **Fit width**. Choose **Model** or another command, then **Send**. The command is inserted into your message box first. If it would replace an unsent message, choose **Replace** or **Keep draft**.

Model selection happens inside the agent's own terminal menu. Use the arrow buttons and Enter, or Escape to cancel. Dock does not supply a model list or claim to know the currently selected model. Available models and the effect on CLI defaults depend on the agent and account.

| Console type | Model command | Other shortcuts |
| --- | --- | --- |
| Codex | `/model` | `/status`, `/diff`, `/mcp` |
| Claude Code | `/model` | `/status`, `/context`, `/mcp` |
| OpenCode | `/models` | `/help`, `/details` |
| Gemini CLI | `/model manage` | `/stats`, `/mcp`, `/help` |

Commands were checked against the providers' documentation on 20 October 2026: [Codex](https://developers.openai.com/codex/cli/slash-commands/), [Claude Code](https://code.claude.com/docs/en/commands), [OpenCode](https://docs.opencode.ai/docs/tui/), [Gemini CLI](https://geminicli.com/docs/reference/commands/). Installed CLI versions may differ. The composer lets you edit a command before sending it.

Current Claude Code documentation says `/model` can save a default for new sessions. Press **s** on a picker row to change only the current session; use the keyboard button to send that key. Check the installed CLI's prompt before confirming. [Claude model command](https://code.claude.com/docs/en/commands).

Shortcuts use the console's configured provider. Shells, custom commands and other providers keep ordinary terminal input without guessed AI shortcuts. A staged shortcut is bound to its PC, console, provider and connection generation. If these change, select the shortcut again. Nothing is automatically resent after a disconnect.

## Console links

Tap the **link icon** beside the keyboard button. The sheet lists web links from this console's loaded output, newest first. **Open** launches your phone's browser; **Copy** copies the complete URL, including sign-in parameters. **Full link** expands a long address for inspection.

Link detection happens only when you open the sheet. It joins terminal soft wraps and full-width URL-only line breaks, and shows up to 30 distinct links. Other manually broken URLs may need to be copied from the CLI. Links are kept in memory, and no URL is fetched automatically. Only HTTP and HTTPS addresses without embedded usernames or passwords are offered. A localhost address refers to the phone when opened there.

If a sign-in page returns a code, paste it into the console's message box and Send. Opening the sheet preserves your draft and does not type into the terminal. Switching computers or receiving a replacement terminal screen disables the old sheet; reopen it for current links.

## Toolbar

**Devices** and **Switch console** remain at the top. **⋮ → App updates** opens the existing downloader; **⋮ → Reconnect** retries the current PC. **Usage → Updates** and the connection-screen **Updates** button remain available.

## Verification

`flutter test --no-pub` covers the mobile suite, including narrow and wide layouts, doubled system text, landscape keyboards, measured terminal cell widths, unchanged terminal dimensions, draft preservation and stale command targets.

The Android emulator fixture uses a loopback TLS server and synthetic terminal output. It never launches an AI process or connects to a user's PC:

```powershell
node scripts/mobile-controls-fixture.cjs
# In another terminal, with AgentDock_Test running as emulator-5554:
node scripts/mobile-controls-adb.cjs install
node scripts/mobile-controls-adb.cjs reset
node scripts/mobile-controls-adb.cjs pair
```

Build the debug x64 APK first. The helper checks that the target is an emulator before installation or data reset. Create `artifacts/mobile-controls/stop` to stop the fixture; it also expires after 20 minutes.

Native tests use temporary pairing data and fake models. They verify command transport and layout, not an actual provider's current account entitlements or model switch. Physical Android testing with the installed CLI versions remains a release check. Windows desktop, macOS and iPhone interfaces were not modified or newly certified by these native Android checks.
