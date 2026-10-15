# Agent Dock

A Windows desktop app for up to nine agent consoles, shared tools and usage tracking.

## Install

Download **[Agent-Dock-0.2.0-Setup-x64.exe](https://github.com/YeerooXY/agentdock/releases/download/v0.2.0/Agent-Dock-0.2.0-Setup-x64.exe)** for Windows 10/11 on an Intel or AMD 64-bit PC.

1. Run the installer and choose where to install Dock. It adds desktop and Start menu shortcuts.
2. On first launch, choose your **project folder** and **default console**.
3. Click **+** to open a console there. Change either choice later in **Settings → Console defaults**.

Dock includes its own runtime; you do not need Node.js or Git to run it. Install Codex, Claude Code or other agent CLIs separately and sign in to your own accounts. The welcome screen links to their setup guides. PowerShell works immediately. Additional MCP servers may need their own software or runtimes.

This release is unsigned, so Windows may show an unknown-publisher or SmartScreen prompt. Only download it from this repository's releases. Existing users keep their settings, keys and saved panels. Uninstalling leaves that local data in `%APPDATA%\Agent Dock`.

## Run from source

On Windows, with Node.js 24 and Git installed:

```powershell
git clone https://github.com/YeerooXY/agentdock.git
cd agentdock
npm ci
npm run build
npm start
```

To add desktop and Start menu shortcuts, run `powershell -File scripts/desktop-shortcut.ps1` after building. `Launch Agent Dock.cmd` also opens the app. Keep the project folder in place; the shortcuts point to it.

## Build an installer

On Windows x64 with Node.js 24, run `npm ci`, then `npm run dist`. The installer and `SHA256SUMS.txt` are written to `release/`. `npm run pack` builds an unpacked app for inspection; `npm run test:packaged` tests it with a temporary profile and no system Node on PATH.

`powershell -NoProfile -File scripts/test-installer.ps1` also checks installation, the Start menu shortcut and removal. It refuses to run when Dock is already installed and preserves existing development shortcuts.

The build downloads a pinned Node.js runtime, checks its SHA-256, bundles the completion/MCP helpers outside ASAR, and includes their dependency licenses. `node-pty` uses its supplied Windows x64 N-API binaries. Only application code, built UI, icons, production dependencies and the runtime go into the installer. Local settings, credentials, sessions and test data are excluded. Packaging uses [electron-builder's NSIS target](https://www.electron.build/v26/docs/nsis/).

## Use it

- **Consoles** shows nine live terminals filling the window. Click **+** to launch in that panel using **Settings → Console defaults**. You can type directly in a panel or use its expand button for fullscreen. **Consoles** brings back the grid and keeps the window fullscreen. Thinking uses a blue-purple outline; ready uses green.
- **Usage** contains subscription limits, API tokens, cost estimates and pricing settings.
- **Keys** stores named credentials from any service, encrypted with Windows DPAPI.
- **Tools** connects MCP servers, HTTP tools and model APIs.
- **Instructions** sets the working style shared by supported agents.

**Ctrl + Alt + Space** shows or collapses the app. **Ctrl + Alt + 1–9** opens a console fullscreen. Closing the window keeps sessions running in the HUD; quitting stops their processes.

**Settings → Startup → Restore previous consoles** is on by default. After quitting or restarting Windows, Dock reopens the same numbered panels with their agents, names, launch folders and permissions. The layout is saved as it changes, including before shutdown. Ending an individual console removes it from the saved layout. Turning the setting off clears the saved layout and leaves currently open consoles running.

Saved Codex and Claude conversations resume by their exact session IDs, so consoles sharing a folder keep separate chats. Codex's completion callback supplies its ID after the first completed turn; Claude's session-start hook supplies its ID when the chat opens. Consoles without a recorded ID start a new chat. Dock uses [`codex resume <ID>`](https://learn.chatgpt.com/docs/cli/reference) and [`claude --resume <ID>`](https://code.claude.com/docs/en/cli-reference) without submitting a prompt. WSL Claude sessions keep their original distribution even if a native installation is added later.

Shells and custom startup commands launch fresh. Running jobs, shell variables, typed input and terminal scrollback are not restored. A missing project folder leaves its panel available to retry; other panels still reopen.

The top-left button hides or shows the sidebar. Its state is saved.

Click a panel's title to name it, for example **Trader** or **Robonslaught**. On an empty panel, the name field appears at the top when you hover or tab into it. Enter or clicking away saves; Escape cancels. The name follows the console into fullscreen and the HUD, survives restarts, and stays on its slot after you close the console. Clear it to return to folder names. Hovering over an empty console smoothly reveals **New console** beside the plus.

The folder button above the grid changes the launch folder for new consoles. You can also choose it in **Settings → Console defaults**, alongside the agent, optional name and custom command. Preferences are stored for each Windows user. On a new computer the initial folder is that user's Projects folder, or their home folder if Projects does not exist.

Hold **+** for a moment, or right-click it, to choose an agent, model and folder for that panel. **Options** has a name and permission override. These choices apply only to that console; a regular click still uses your saved defaults. Escape or Cancel closes the chooser without opening anything. This also works in the HUD. With a keyboard, hold Space or press Shift+Enter on a plus button.

Codex model suggestions come from its local model cache. Claude offers its [model aliases](https://code.claude.com/docs/en/model-config). **Enter a model…** accepts another model name or alias; the CLI checks availability. **Agent default** keeps the CLI's configured model. A one-time model choice is kept with that console when startup restoration is enabled.

The HUD is a normal desktop window, covered by other apps by default. It is not attached to the wallpaper; Win + D hides it too. Use the shortcut or taskbar to bring it back. Settings has an optional always-on-top switch.

## Vim controls

Turn on **Settings → Keyboard → Vim controls**. It is off by default and remembers your choice. **Ctrl+Shift+Space** moves focus out of the terminal and into Dock's **NORMAL** mode. **i** returns to typing (**INSERT**). When the terminal or a form field has focus, its usual keys—including Escape and Ctrl+w—pass through unchanged.

| Key in NORMAL mode | Action |
| --- | --- |
| h / j / k / l | Select the slot to the left / below / above / right |
| 1–9 | Select a numbered slot |
| Enter | Expand the selected console, or launch an empty slot |
| i | Type in the selected console without expanding the grid |
| n / N | Open a console with defaults / open the one-time chooser |
| r | Edit the selected slot's name |
| gg / G | First / last slot; top / bottom on other pages |
| gc / gu / ga | Consoles / Usage / API |
| gv / gt / gi / gs | Keys / Tools / Instructions / Settings |
| b / f / d | Toggle sidebar / fullscreen / collapse to HUD |
| ? | Show the shortcut list |

On other pages, j/k scroll and Ctrl+d/u scroll half a page. Press the two keys in a `g` shortcut within a second. No Vim shortcut ends a running console. This controls Dock's interface; your editor or agent keeps its own editing mode.

## Claude and permissions

Claude Code is detected on Windows PATH, in its usual native install folders, and inside installed WSL distributions. Open a Claude console to complete any first-run setup and sign-in.

A fresh installation uses **Agent defaults** for permissions. Select **Unrestricted** in **Settings → Console defaults** to pass `--dangerously-bypass-approvals-and-sandbox` to new Codex consoles or `--dangerously-skip-permissions` to Claude. Existing consoles keep their permissions. Full access uses the signed-in OS account's permissions; it does not grant administrator rights or remove provider limits. First-run setup and sign-in still apply.

Per-session hooks report completion and attention states. Claude's status line reports usage when available. User and project CLI configuration files are not edited. Existing processes outside Dock are not controlled.

## Shared tools and instructions

1. Save a credential in **Keys**, using a short ID such as `blender_service`.
2. Add a connection in **Tools**. Local MCP servers need their executable and arguments; remote servers need an endpoint. Bind a saved key to the required environment variable, HTTP header or query parameter.
3. Test an MCP connection to discover its tools. Checking an ordinary HTTP API validates its setup without sending a request.
4. Write your preferences in **Instructions**. New managed Codex, Claude and API sessions receive them automatically.

The generated summary is `%APPDATA%\Agent Dock\shared\AGENT_DOCK.md`. It contains instructions, enabled connection descriptions and credential names, never key values.

All supported sessions receive three shared functions:

- `dock_context`: current instructions and connection summary.
- `dock_tools`: tool discovery with input schemas.
- `dock_call`: invoke a configured tool with its bound credentials.

Open sessions can fetch updates with `dock_context`. Codex receives the summary as additional developer instructions; Claude appends the file to its system prompt. When a large summary would exceed Windows command-line limits, Codex receives an instruction to load it through `dock_context` or the file. Existing project instructions still apply.

Custom commands can use `{instructions}` and `{mcp_config}` placeholders; Dock replaces them with quoted file paths. The same paths are available in `AGENT_DOCK_INSTRUCTIONS` and `AGENT_DOCK_MCP_CONFIG`. A custom agent must support those integrations. Arbitrary programs do not automatically become MCP clients. Agents launched outside Dock are not modified.

Supported connections: MCP stdio, Streamable HTTP and legacy SSE; fixed HTTP endpoints with GET/POST/PUT/PATCH/DELETE and JSON Schema inputs. MCP OAuth browser login, resources/prompts, arbitrary model protocols and streaming model output are not implemented. Blender's MCP server and Blender itself must be installed/configured separately before adding that connection.

## API requests and usage

Model API connections support OpenAI Responses, Anthropic Messages and OpenAI-compatible Chat Completions. Configure the full endpoint and a saved credential in **Tools → Model APIs**. Local endpoints may omit a key.

Each API request starts a new conversation, receives shared instructions and can use connected tools. Runs stop after at most eight model steps. Every model request gets its own ledger entry, including a failed continuation. No automatic retries are made. Text and supported image tool results are passed to Responses/Messages; Chat Completions tool results are text only.

Subscription percentages come from provider reports and are account-wide. Missing windows are not inferred. Codex account reads do not run model inference. Claude usage arrives from managed sessions after responses. API usage here covers requests sent through Dock, not other apps or a provider's entire bill. External HTTP/MCP service charges are not estimated automatically.

Cost estimates use the per-model USD rates you enter in **Usage**. Unknown rates or token counts stay unknown. Cached tokens are counted once. Export includes all API records; the table shows the latest 100.

## Storage and access

Local data is in `%APPDATA%\Agent Dock`:

- `vault.json`: encrypted credentials and labels.
- `workspace.json`: encrypted console launch details and conversation IDs for startup restoration; no terminal input, output or transcripts.
- `shared.json`: instructions, connection settings and credential IDs.
- `shared/AGENT_DOCK.md`: generated summary without secrets.
- `ledger.json`: model, time, tokens, request status and estimated cost; no prompts or responses.
- `settings.json`, `limits.json`, `events`, `sessions`: preferences, cached quotas and per-session tracking/configuration.

Keys are decrypted in the main process. A configured local MCP server receives only the credentials explicitly bound to it. Agent consoles do not receive vault keys. Remote keys are sent only to their configured connection, with redirects disabled. Do not paste credentials into commands, URLs, descriptions or instructions; use key bindings.

The renderer is sandboxed and cannot read decrypted keys or make network requests directly. CLI tools connect through a token-authenticated loopback bridge bound to 127.0.0.1; tokens are passed in memory via environment variables and revoked when the session ends. There is no LAN/tablet service. Windows encryption does not protect against software already running with your account's access.

API prompts, responses and terminal scrollback stay in memory. Agent CLIs and connected tools may independently keep their own histories. Remote model providers receive the shared instructions, connection descriptions and tool results needed for their requests.

## Development

```powershell
npm ci
npm run build
npm start
npm test
npm run test:desktop
```

This is a local development build, not a signed installer. It uses Electron, xterm.js and ConPTY. Each console, MCP server and WSL distribution adds its own resource usage. Background tool connections are opened on demand and reused. Terminal buffers and recent-log scans are bounded.

Validation includes real Windows encryption, nine live shell consoles, HUD/fullscreen persistence, installed agent startup, MCP subprocess/loopback integration, HTTP credential bindings, all three model tool loops with mocked responses, form failures and narrow layouts. Agent-specific checks depend on the CLIs installed on the test machine. Tests use temporary data and never submit paid model requests. Screenshots and reports are in `artifacts` and stay out of Git.

## References

- [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference)
- [Claude CLI options](https://code.claude.com/docs/en/cli-reference) and [MCP](https://code.claude.com/docs/en/mcp)
- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/client)
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
