# Agent Dock

A Windows desktop app for up to nine agent consoles, shared tools and usage tracking.

## Install

Download **[Agent-Dock-0.5.0-Setup-x64.exe](https://github.com/YeerooXY/agentdock/releases/download/v0.5.0/Agent-Dock-0.5.0-Setup-x64.exe)** for Windows 10/11 on an Intel or AMD 64-bit PC.

1. Run the installer and choose where to install Dock. It adds desktop and Start menu shortcuts.
2. Choose your **project folder**. Tick any agents you want Dock to install; already installed agents are detected.
3. Choose your **default console**. Tick **Open this console when setup finishes** to launch it immediately.
4. Sign in through that agent's console. After setup, **+** launches your saved choice. Run the wizard again from **Settings → Set up agents**.

Dock includes Node.js and its package installer; you do not need a separate Node installation. PowerShell works immediately. Optional agents download from their official installers or npm packages and use your own accounts or API billing. Some agents have newer Windows requirements, shown in setup. Git and other project tools may still be needed by your chosen agent. Additional MCP servers may need their own software.

The wizard offers Codex, Claude Code, Google Antigravity, GitHub Copilot, OpenCode, Cursor, Grok Build, Kiro, Qwen Code, Kimi Code, Cline, Factory Droid, Pi and Gemini CLI. Z.AI/GLM can be connected through OpenCode. Grok and Z.AI also have model API presets in Tools. See the [agent setup notes](docs/agent-setup.md) for sources, sign-in and integration details. Other CLIs can use **Custom command**.

This release is unsigned, so Windows may show an unknown-publisher or SmartScreen prompt. Only download it from this repository's releases. Existing users keep their settings, keys and saved panels. Uninstalling leaves that local data in `%APPDATA%\Agent Dock`.

## Android preview

The [0.6 preview](https://github.com/YeerooXY/agentdock/releases/tag/v0.6.0-preview.1) adds a native Android companion, turn-by-turn code diffs in Results, formatted Markdown previews, and Windows notifications that bring Dock forward. Install both preview builds to try the phone connection; the stable 0.5 installer above does not include it.

Use your own Tailscale account, or stay on the same Wi-Fi. Optional cloud alerts use your own Firebase project. No terminal traffic goes through an Agent Dock account or hosted relay. Setup is in **Settings → Android → Connect a phone**, and the first-run wizard can open it for you. See the [setup and privacy guide](docs/android-setup.md) and [verification notes](docs/android-review.md). Real-phone and live Firebase checks are still pending.

## Run from source

On Windows, with Node.js 24.19.0 and Git installed:

```powershell
git clone https://github.com/YeerooXY/agentdock.git
cd agentdock
npm ci
npm run prepare:runtime
npm run build
npm start
```

To add desktop and Start menu shortcuts, run `powershell -File scripts/desktop-shortcut.ps1` after building. `Launch Agent Dock.cmd` also opens the app. Keep the project folder in place; the shortcuts point to it.

## Build an installer

On Windows x64 with Node.js 24.19.0, run `npm ci`, then `npm run dist`. The installer and `SHA256SUMS.txt` are written to `release/`. `npm run pack` builds an unpacked app for inspection; `npm run test:packaged` tests it with a temporary profile and no system Node on PATH.

`powershell -NoProfile -File scripts/test-installer.ps1` also checks installation, the Start menu shortcut and removal. It refuses to run when Dock is already installed and preserves existing development shortcuts.

The build downloads a pinned Node.js runtime, checks its SHA-256, bundles npm 12.2.1, the completion/MCP helpers and Meshy server outside ASAR, and includes their dependency licenses. `node-pty` uses its supplied Windows x64 N-API binaries. Only application code, built UI, bundled guides, icons, production dependencies and the runtime go into the installer. Local settings, credentials, sessions and test data are excluded. Packaging uses [electron-builder's NSIS target](https://www.electron.build/v26/docs/nsis/).

## Use it

Version 0.5.0 includes the agent setup wizard, resizable panels, grouped notifications and the updated theme.

- **Move consoles** with the terminal icon in each panel header. A frozen copy of the terminal follows your pointer while other panels slide into place. On release, the copy expands into its destination. Drop on an empty slot to move, or an occupied slot to swap. Processes, output, names and saved conversations stay with their consoles. With the icon focused, **Alt+1–9** moves it by keyboard.
- **Resize consoles** by dragging an edge or corner. It snaps to the 3×3 grid, including 3×1 and 2×2 panels. Other panels move to make room. A pink-blue grid preview, active edge and live size label show the new footprint. An occupied layout turns red. Escape cancels; an impossible size leaves the saved layout intact. Focus a resize handle and use arrow keys to move that edge by one cell. Sizes are saved with your workspace. Narrow browser previews stack panels for readability.
- **Results** groups saved files by console name and task. The badge counts new batches: three screenshots from one verification and five from another count as two. Opening a result or choosing **Mark viewed** clears that batch’s badge. Names remain after a console closes. Tracked turns include code diffs alongside their saved images and reports. Markdown opens as formatted text with tables and code blocks. Filter, preview, export, open the local folder, or delete individual files or whole batches. Deletion sends Dock’s copies to the Recycle Bin; project originals stay in place.
- **Inbox** keeps completion alerts, questions and errors. Open the related console or review, mark items read, dismiss them, clear read items, or **Clear inbox**. Clicking a Windows notification brings Dock out of the tray or minimization and opens its related console, result or review. Clearing alerts leaves Results and running consoles intact.
- **Website review** captures desktop/mobile viewports, runs automated accessibility and overflow checks, and checks up to 12 same-origin links. Findings and screenshots go into Results. The 20-item checklist needs a human or agent review; an automated scan is not certification.

- **Consoles** shows nine live terminals filling the window. Click **+** to launch in that panel using **Settings → Console defaults**. You can type directly in a panel or use its expand button for fullscreen. **Consoles** brings back the grid and keeps the window fullscreen. Thinking uses a blue-purple outline; ready uses green.
- **Usage** contains subscription limits, API tokens, cost estimates and pricing settings.
- **Keys** stores named credentials from any service, encrypted with Windows DPAPI.
- **Tools** connects MCP servers, HTTP tools and model APIs. Ask an agent to help configure one: it can prepare the settings here for you to apply. Missing keys are entered directly in Keys.
- **Instructions** sets the working style shared by supported agents.

**Ctrl + Shift + N** creates a console in the first free cell while Dock is focused, using your defaults. **Ctrl + Alt + Space** shows or collapses the app. **Ctrl + Alt + 1–9** opens a console fullscreen. **×** hides Dock in the Windows system tray, keeping consoles running. Click its tray icon or use the shortcut to return. **–** minimizes to the taskbar; **Quit** stops the processes.

Drag the grip in the top bar to move the window, including out of fullscreen. Drag the name in the HUD to move it. Double-click either grip to toggle fullscreen. Reopening from the tray keeps the window's position and fullscreen state.

**Settings → Startup → Restore previous consoles** is on by default. After quitting or restarting Windows, Dock reopens the same numbered panels with their agents, names, launch folders and permissions. The layout is saved as it changes, including before shutdown. Ending an individual console removes it from the saved layout. Turning the setting off clears the saved layout and leaves currently open consoles running.

Saved Codex and Claude conversations resume by their exact session IDs, so consoles sharing a folder keep separate chats. Codex's completion callback supplies its ID after the first completed turn; Claude's session-start hook supplies its ID when the chat opens. Consoles without a recorded ID start a new chat. Dock uses [`codex resume <ID>`](https://learn.chatgpt.com/docs/cli/reference) and [`claude --resume <ID>`](https://code.claude.com/docs/en/cli-reference) without submitting a prompt. WSL Claude sessions keep their original distribution even if a native installation is added later.

Other agents, shells and custom startup commands launch fresh. Running jobs, shell variables, typed input and terminal scrollback are not restored. A missing project folder leaves its panel available to retry; other panels still reopen.

The top-left button hides or shows the sidebar. Its state is saved.

Click a panel's title to name it, for example **Trader** or **Robonslaught**. On an empty panel, the name field appears at the top when you hover or tab into it. Enter or clicking away saves; Escape cancels. The name follows the console into fullscreen and the HUD, survives restarts, and stays on its slot after you close the console. Clear it to return to folder names. Hovering over an empty console smoothly reveals **New console** beside the plus.

The folder button above the grid changes the launch folder for new consoles. You can also choose it in **Settings → Console defaults**, alongside the agent, optional name and custom command. Preferences are stored for each Windows user. On a new computer the initial folder is that user's Projects folder, or their home folder if Projects does not exist.

Hold **+** for a moment, or right-click it, to choose a name, agent, model and folder for that panel. **Options** has a permission override. These choices apply only to that console; a regular click still uses your saved defaults. Escape or Cancel closes the chooser without opening anything. This also works in the HUD. With a keyboard, hold Space or press Shift+Enter on a plus button.

Pink-blue accents are the default. **Settings → Appearance** also offers blue or pink. Ready consoles pulse green and show a red badge on their terminal icon. Click inside a console, type or paste, or open it fullscreen to clear its badge and mark its completion alerts as read in Inbox. Results keeps its own new-batch count directly on its icon. Reduced-motion preferences disable panel motion and the ready pulse. Fullscreen terminals leave space below the last line. Window controls sit at the top right: HUD, minimize, fullscreen/restore, close to tray.

The console cursor is steady by default. **Settings → Appearance → Blink cursor** turns blinking back on. Dock batches short output fragments and gives split cursor hide/redraw/show sequences up to 48 ms to arrive together. It also skips unchanged terminal fits to reduce redraw flicker. Programs can still deliberately hide and show their cursor; Dock preserves those terminal commands. This setting affects Dock, not CMD or other terminal apps. For Codex outside Dock, `codex -c tui.animations=false` disables its animations for that launch; this is a troubleshooting option, not a confirmed fix for every flicker. See [Codex TUI options](https://learn.chatgpt.com/docs/config-file/config-advanced#tui-options).

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
4. Write your preferences in **Instructions**. Managed agents and API sessions receive shared context through their launch configuration or the MCP bridge. See the [adapter details](docs/agent-setup.md).

The **3D tools** cards handle these integrations:

| Tool | Setup in Dock | What you need |
| --- | --- | --- |
| Blender | **Set up Blender** installs a pinned MCP server in a separate local Python environment and installs its add-on. **Update tools** reapplies the version shipped with Dock. | Install Blender first. The setup uses Blender's bundled Python. Open Blender and start **MCP for Blender** in the N sidebar; enable it in Preferences → Add-ons if setup could not do that while Blender was open. |
| Unity | Pick your project folder and press **Connect**. Dock installs Unity Pipeline into that project and uses the official Unity CLI MCP connection. | Install [Unity CLI](https://docs.unity.com/en-us/unity-cli/unity-cli-reference) and a compatible Unity Editor. Open the selected project to use editor tools. |
| Meshy AI | **Add key** saves your Meshy key in the encrypted vault. Select it and press **Connect**. The MCP server and runtime are included. | Your own [Meshy API key](https://www.meshy.ai/developers/keys). Asset generation uses Meshy credits. |

**Browse tools** shows discovered tool names, descriptions and inputs. Connecting or browsing Meshy does not generate assets or verify account credits. Installers need an internet connection; Blender is a community integration, while Unity CLI and Meshy's MCP server are provided by their respective vendors. Blender server telemetry is disabled for Dock's managed connection. No other agent configuration is rewritten.

### Web design

Open a completed **Website review** and use **Draft in console** to paste a screenshot-based design brief into an idle Codex or Claude console. Review it, then press Enter to send. Agents are instructed to try their own image generator first. Use **Meshy fallback** only when that generator is unavailable or has failed.

Meshy fallback uses the bundled official CLI and its own sign-in, separate from the API-key MCP connection in Tools. **Check sign-in** reuses an existing CLI account; **Connect Meshy** provides a code and a browser sign-in link. The CLI manages its credentials; Dock does not copy them into its vault. Generating a concept uploads the reference screenshot to Meshy and uses credits. Accepted task IDs are saved, so **Resume task** continues checking the same job without another submission. Reported credits appear in **Usage** and remain after deleting a job. No credit amount is invented when Meshy does not report one.

All agents and API sessions can discover connection `dock` with `dock_tools`. It includes `save_result`, `notify`, `review_page`, `review_details`, `meshy_concept` and job status tools. File results must be inside the calling console’s project; API sessions use the default project folder. Files are copied into the gallery, with a 50 MB file limit and a 1 GB gallery limit. Tracked turns compare bounded project snapshots and save changed code and images; see the [capture limits](docs/android-setup.md#code-changes-in-results).

**Instructions → Ways of working → Web design** is on by default. Its [shared guide](guides/web-design.md) covers layout, typography, responsive behavior, accessibility, performance and a 20-point page review: policies, consent, data collection, SDKs, honest claims and reviews, fees, business details, children's data, unsubscribe, asset licenses and deletion requests.

Agents review every item on every page, recording checked, needs work or not applicable with a reason. Policies and consent flows must match the actual site and applicable rules; the guide is not a legal certification or an automated enforcement engine. You can read or disable it in Instructions, alongside your own preferences.

The generated summary is `%APPDATA%\Agent Dock\shared\AGENT_DOCK.md`. It contains instructions, enabled connection descriptions and credential names, never key values.

All supported sessions receive three shared functions:

- `dock_context`: current instructions and connection summary.
- `dock_tools`: tool discovery with input schemas.
- `dock_call`: invoke a configured tool with its bound credentials.

Open sessions can fetch updates with `dock_context`. Codex receives the summary as additional developer instructions; Claude appends the file to its system prompt. When a large summary would exceed Windows command-line limits, Codex receives an instruction to load it through `dock_context` or the file. Existing project instructions still apply.

Custom commands can use `{instructions}` and `{mcp_config}` placeholders; Dock replaces them with quoted file paths. The same paths are available in `AGENT_DOCK_INSTRUCTIONS` and `AGENT_DOCK_MCP_CONFIG`. A custom agent must support those integrations. Arbitrary programs do not automatically become MCP clients. Agents launched outside Dock are not modified.

Supported connections: MCP stdio, Streamable HTTP and legacy SSE; fixed HTTP endpoints with GET/POST/PUT/PATCH/DELETE and JSON Schema inputs. MCP OAuth browser login, resources/prompts, arbitrary model protocols and streaming model output are not implemented.

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
- `integrations`: installed Blender server, setup versions and add-on setup notes. The Blender add-on itself lives in Blender's user add-ons folder. Unity Pipeline lives in the project you selected.
- `ledger.json`: model, time, tokens, request status and estimated cost; no prompts or responses.
- `results/`, `reviews.json`: saved files, page screenshots, findings and manual checklist notes. These can contain project or page content. Delete saved copies in Results, or delete a whole review from Website review.
- `mobile.json`: connection settings plus an OS-encrypted payload containing paired device tokens, TLS identity and optional Firebase sender credentials. Disable the connection or remove phones/Firebase in Android setup.
- `inbox.json`: attention items and read state. `concept-jobs/` holds Meshy job metadata and temporary downloads; `concept-usage.json` keeps reported credit usage. Completed downloads are copied to Results and temporary copies are recycled.
- `settings.json`, `limits.json`, `events`, `sessions`: preferences, cached quotas and per-session tracking/configuration.

Keys are decrypted in the main process. A configured local MCP server receives only the credentials explicitly bound to it. Agent consoles do not receive vault keys. Remote keys are sent only to their configured connection, with redirects disabled. Do not paste credentials into commands, URLs, descriptions or instructions; use key bindings.

The renderer is sandboxed and cannot read decrypted keys or make network requests directly. CLI tools connect through a token-authenticated loopback bridge bound to 127.0.0.1; tokens are passed in memory via environment variables and revoked when the session ends. The optional Android companion adds a separate, disabled-by-default HTTPS/WSS listener on a selected private or Tailscale address. Pairing is single-use and devices can be revoked; see the [mobile data flow](docs/android-setup.md#data-use-and-privacy). Windows encryption does not protect against software already running with your account's access.

API prompts, responses and terminal scrollback stay in memory. Agent CLIs and connected tools may independently keep their own histories. Remote model providers receive the shared instructions, connection descriptions and tool results needed for their requests.

## Development

```powershell
npm ci
npm run prepare:runtime
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
