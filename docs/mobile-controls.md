# Mobile terminal controls

Available in Android **0.6.0-preview.14**. Reading, copying, drafts, remaining-allowance meters and command shortcuts work with older PC hosts. Agent selection, file suggestions and closing consoles require **Windows preview 13 or later**. Install over your current app to preserve saved computers. Installing the phone update does not restart your PC.

## Reading and copying

The terminal starts in **Wrap text**: normal-size text wraps to the phone's width and scrolls vertically. Long-press to select text and use Android's Copy control. While a selection is active, new output waits behind **Show new output** so it cannot move your selection.

**Console actions (⋮ beside the keyboard) → Copy text** opens a fixed snapshot with selection handles and **Copy all**. Only loaded terminal output is available, including up to 1,000 terminal lines. Copies preserve hard line breaks and indentation, and join terminal soft wraps. ANSI formatting is removed.

Tap **Wrap text** to show **Grid** for menus, tables and other terminal layouts. Grid scales the original PC columns to fit; very wide grids use smaller text. Tap **Grid** to return to readable wrapped text. Wrapping is a reading view, not a reconstruction of an agent's conversation. Cursor placement, colors and column alignment belong to Grid. The keyboard button switches to Grid for direct terminal input.

The PC terminal keeps its dimensions, process and scrollback. Turning the phone or showing the keyboard also leaves that grid unchanged. The display choice lasts while viewing the current PC; reopening starts in Wrap text.

The message box and keyboard button start typing. Touching the terminal returns to reading. Enter, Escape and the arrow buttons are below the terminal. Swipe that button row for Tab and Ctrl C. With a landscape keyboard and large system text, the controls can scroll vertically to remain reachable.

## Consoles and saved drafts

Tap the **chat name and arrow** to switch consoles. Agent labels use distinct accents and readable names. OpenAI/Codex, Cursor, OpenCode and Cline also show official icons. Other providers use colored names or initials while logo permission or suitable official artwork remains unverified. See [provider assets](provider-brand-assets.md).

Choose **New console → Agent → Claude Code → Open** to start Claude once. Only installed agents appear. The folder is shown before opening and comes from the PC's configured default. Agent selection does not change that default or reuse another provider's model. The existing Claude trial console may have a different folder because it was launched there explicitly.

Use **Console actions → Close console** to end the selected console on the PC. A confirmation names the console and explains that running work will end. Switching consoles, closing a menu or closing the phone app leaves the PC process running.

Drafts in **Command or message** belong to a PC and a stable console identity. Switching chats, restarting the phone app, or restoring the same PC console brings back its draft. Successfully sending or manually clearing the draft removes it. A completely new console gets a new identity; it does not inherit a deleted console's draft.

Drafts stay on the phone in OS-backed encrypted storage and are never sent until you press Send. Up to 128 recent drafts are retained, with a combined target of 1 MiB of text; older drafts are removed when that limit is exceeded. Forgetting a PC removes its drafts. Writes are coalesced for 200 ms and flushed when the app goes into the background. A sudden OS termination during a pending write can lose the newest edit. Storage errors remain visible; there is no plaintext fallback.

## Models and commands

Tap the sliders beside **Wrap text**. Choose **Model** or another command, then **Send**. The command is inserted into your message box first. If it would replace an unsent message, choose **Replace** or **Keep draft**.

Typing `/` into the message box shows selectable matches from Dock's known command shortcuts. These are local suggestions, not a complete list of the CLI's custom commands or plugins.

The **paperclip** opens **Files** for the selected console's working folder. Open a subfolder or filter filenames, then select a file to insert its relative path into your draft. File contents are not read or uploaded by this picker. Hidden credential folders, `.env` files, Git internals, dependency folders and links/junctions are excluded. Large directories return a bounded list; filter or open a subfolder to narrow it.

For the CLI's own completion menu, use the **keyboard** button, type directly, then press **Tab**. Text staged in the message box has not reached the CLI, so the CLI cannot complete it there. Claude's Tab key accepts a highlighted suggestion; in other contexts it can perform a different action. [Claude interactive controls](https://code.claude.com/docs/en/interactive-mode).

Model selection happens inside the agent's own terminal menu. Use the arrow buttons and Enter, or Escape to cancel. Dock does not supply a model list or claim to know the currently selected model. Available models and the effect on CLI defaults depend on the agent and account.

| Console type | Model command | Other shortcuts |
| --- | --- | --- |
| Codex | `/model` | `/status`, `/diff`, `/mcp` |
| Claude Code | `/model` | `/status`, `/context`, `/mcp` |
| OpenCode | `/models` | `/help`, `/details` |
| Gemini CLI | `/model manage` | `/stats`, `/mcp`, `/help` |

Commands were checked against the providers' documentation on 20 October 2026: [Codex](https://developers.openai.com/codex/cli/slash-commands/), [Claude Code](https://code.claude.com/docs/en/commands), [OpenCode](https://docs.opencode.ai/docs/tui/), [Gemini CLI](https://geminicli.com/docs/reference/commands/). Installed CLI versions may differ. The composer lets you edit a command before sending it.

Current Claude Code documentation says `/model` can save a default for new sessions. Press **s** on a picker row to change only the current session; use the keyboard button to send that key. Check the installed CLI's prompt before confirming. [Claude model command](https://code.claude.com/docs/en/commands).

Claude Pro/Max subscription meters appear after Claude supplies usage in a status-line callback, normally after the session's first AI response. Signing in alone does not populate the 5-hour or weekly percentages. Refresh **Usage** after a response. Until then, Dock shows a waiting message rather than inventing a value. [Claude status-line usage](https://code.claude.com/docs/en/statusline#rate-limit-usage).

From preview 14, **Usage** shows the allowance remaining: a reported 38% used becomes **62% left**, with a bar filled to 62%. Each window stays separate. Missing or invalid values remain **Unknown**; stale readings and passed reset times keep their warnings. A reset timestamp alone never refills a bar. API dollar figures still show estimated spending. Windows preview 14 uses the same remaining values in Usage and the corner HUD. Icons are bundled locally and require no image-service requests.

Shortcuts use the console's configured provider. Shells, custom commands and other providers keep ordinary terminal input without guessed AI shortcuts. A staged shortcut is bound to its PC, console, provider and connection generation. If these change, select the shortcut again. Nothing is automatically resent after a disconnect.

## Console links

Tap the **link icon** beside the keyboard button. The sheet lists web links from this console's loaded output, newest first. **Open** launches your phone's browser; **Copy** copies the complete URL, including sign-in parameters. **Full link** expands a long address for inspection.

Link detection happens only when you open the sheet. It joins terminal soft wraps and full-width URL-only line breaks, and shows up to 30 distinct links. Other manually broken URLs may need to be copied from the CLI. Links are kept in memory, and no URL is fetched automatically. Only HTTP and HTTPS addresses without embedded usernames or passwords are offered. A localhost address refers to the phone when opened there.

If a sign-in page returns a code, paste it into the console's message box and Send. Opening the sheet preserves your draft and does not type into the terminal. Switching computers or receiving a replacement terminal screen disables the old sheet; reopen it for current links.

## Toolbar

The **chat name** opens the console switcher. **Devices** remains at the top. The top **⋮ → App updates** opens the downloader; **⋮ → Reconnect** retries the current PC. **Usage → Updates** and the connection-screen **Updates** button remain available.

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
