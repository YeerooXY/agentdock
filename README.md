# Paddock

## Downloads

| Device | Download |
| --- | --- |
| Windows 10/11 — Intel or AMD 64-bit | **[Windows installer](https://github.com/YeerooXY/agentdock/releases/download/v0.6.0-preview.21/Agent-Dock-0.6.0-preview.21-Setup-x64.exe)** |
| Android — most phones (ARM64) | **[Android APK](https://github.com/YeerooXY/agentdock/releases/download/v0.6.0-preview.20/Agent-Dock-0.6.0-preview.20-Android-arm64.apk)** |
| Android — older 32-bit phones (ARMv7) | [Android ARMv7 APK](https://github.com/YeerooXY/agentdock/releases/download/v0.6.0-preview.20/Agent-Dock-0.6.0-preview.20-Android-armv7.apk) |

Current previews: **Android 0.6.0-preview.20**, **Windows 0.6.0-preview.21**. Reading, copying, saved drafts and adjustable text size work with older PC hosts. Project/folder selection, current Codex model choices, image attachments and SSH hosts require Windows preview 15. Older hosts retain basic terminal controls. [Android release notes](https://github.com/YeerooXY/agentdock/releases/tag/v0.6.0-preview.20) · [Windows release notes](https://github.com/YeerooXY/agentdock/releases/tag/v0.6.0-preview.21) · [All releases](https://github.com/YeerooXY/agentdock/releases) · [Previous stable desktop-only release](https://github.com/YeerooXY/agentdock/releases/tag/v0.5.0).

A desktop app for Windows, Linux and macOS: agent consoles, projects, shared tools and usage tracking. Linux and macOS installers come from the next release; until then, run Paddock from source on those systems.

## Updates

- **Windows:** open **Settings → General → Updates → Check for updates**, then **Download update → Install update**. Paddock verifies the download and asks before ending open consoles. Let active work finish before installing. Settings, keys and supported conversation IDs stay in your local profile.
- **Android:** tap **Updates** on the connection screen, **App updates** above your consoles, or **Settings → General → Updates**. From preview 12, **App updates** is under the **⋮** menu. Check and download directly from GitHub, even without a paired or reachable PC. Open the APK and confirm the update over your installed app; do not uninstall or clear app data first. Android may ask you to allow installs from that browser. Pairing stays saved when upgrading a build signed with the same key. Reopen Paddock to reconnect; PC consoles keep running. **All downloads** is available if the version check fails.

**No update button in your version?** Use the downloads above and run the Windows installer or open the Android APK to update the existing app. You do not need to uninstall first. Use the current preview on both devices for new pairing: scan the QR, compare the six-digit code, then approve on the PC. Existing pairing is preserved during an upgrade.

Updates are manual. Preview builds can see newer previews; stable builds only offer stable releases. To switch from stable to this preview, use the downloads above. These buttons update Paddock. See [projects, usage and updates](docs/projects-and-updates.md) for data storage and limits.

## Install

1. Run the installer and choose where to install Paddock. It adds desktop and Start menu shortcuts.
2. Choose your **project folder**. Tick any agents you want Paddock to install; already installed agents are detected.
3. Choose your **default console**. Tick **Open this console when setup finishes** to launch it immediately.
4. Optionally tick **Connect my Android phone next** and choose **Same Wi-Fi** or **Direct internet through my router**. Paddock walks you through the connection, router, Windows Firewall, pairing and optional alerts.
5. Sign in through that agent's console. After setup, **+** launches your saved choice. Run the wizard again from **Settings → Consoles → Set up agents**.

Paddock includes Node.js and its package installer; you do not need a separate Node installation. PowerShell works immediately. Optional agents download from their official installers or npm packages and use your own accounts or API billing. Some agents have newer Windows requirements, shown in setup. Git and other project tools may still be needed by your chosen agent. Additional MCP servers may need their own software.

The wizard offers Codex, Claude Code, Google Antigravity, GitHub Copilot, OpenCode, Cursor, Grok Build, Kiro, Qwen Code, Kimi Code, Cline, Factory Droid, Pi and Gemini CLI. Z.AI/GLM can be connected through OpenCode. Grok and Z.AI also have model API presets in Settings → API. See the [agent setup notes](docs/agent-setup.md) for sources, sign-in and integration details. Other CLIs can use **Custom command**.

### Linux

Download the AppImage, make it executable (`chmod +x Paddock-*-Linux-x64.AppImage`) and run it, or install the `.deb` with `sudo apt install ./Paddock-*-Linux-x64.deb`. Paddock stores keys through your system keyring (GNOME Keyring or KWallet), which most desktop sessions already run. Without one, Paddock refuses to store keys rather than saving them as plain text. Consoles open your login shell. The setup wizard installs agents with each vendor's own Linux installer or npm.

### macOS

Open the `.dmg` for your Mac (`Mac-arm64` for Apple silicon, `Mac-x64` for Intel) and drag Paddock to Applications. The app is not signed yet, so macOS blocks the first launch: open **System Settings → Privacy & Security** and choose **Open Anyway**, or run `xattr -d com.apple.quarantine /Applications/Paddock.app`. Keys are stored in the macOS Keychain. Consoles open your login shell.

### Windows

This release is unsigned, so Windows may show an unknown-publisher or SmartScreen prompt. Only download it from this repository's releases. Existing users keep their settings, keys and saved panels. Uninstalling leaves that local data in `%APPDATA%\Paddock`.

## Code panels (current source build)

Press **Code** in the desktop title bar to add a read-only panel to the console grid. Choose the console to follow, then use **Changes** for its latest tracked turn or **Browse files** for its folder. Before a tracked turn is available, Changes shows the current Git working tree. Resize and expand the panel with the existing grid controls.

Choose **Diff** or **File**, select code, and use **Copy** or **Add to draft**. Adding context preserves the agent's existing draft and sends no Enter key. If the console cannot safely accept a multiline paste, Paddock copies the context for manual pasting. Credential files, generated folders, external links, binary files and text files above 256 KB are excluded. Changes are folder comparisons; other agents working in the same folder may contribute. Code panels currently belong to the desktop app; the Android companion continues to list agent consoles.

## Android preview

The native Android companion controls your PC consoles, shows Results and account usage, and receives optional completion alerts. The header shows the harness icon, chat name, connection status and PC name.

Tap the thin blue-pink handle below the terminal to write a message. **Model** and **Effort** appear while chat is open; the down arrow collapses it and keeps your draft. Each console retains its draft, caret and reading position. The top **?** menu contains **Text & display**, **Copy text**, **Console links**, **Clear mobile history** and direct keyboard input. Wrapped text keeps terminal colors; its size is adjustable. Clearing history keeps the active terminal screen and the PC process running.

Tap the **chat name ? New console** to select a saved project/folder and an installed agent. Tap the current model or effort, make both choices, then press **Apply**. Browsing and cancelling send no terminal input. Effort can change while keeping the current model. Unknown menu layouts remain in the terminal. The message **+** attaches a project file or selected image. [Mobile controls](docs/mobile-controls.md).

Use **Settings → Devices** to name your phone, add computers and switch between saved PCs. Each PC keeps its pairing and address. On Windows, **Settings → Devices → Connect a phone → Connection** names the PC; **Pair phone** manages its paired phones. [Multiple-device setup](docs/android-setup.md#multiple-computers-and-phones).

**Settings → General → Stay connected** turns on alerts. They come straight from your PC; no cloud account is needed. After pairing, the app offers to turn them on. Android shows an ongoing notification; battery restrictions can delay alerts.

**Linux VM through SSH:** add a host in **Settings → Devices → Linux hosts**, verify its fingerprint on the VM, then check the connection. Choose it when opening a console. tmux keeps the remote session available after Paddock disconnects. A paired phone controls that same console through the PC. [SSH setup](docs/ssh-hosts.md).

Phone and PC connect directly on the same Wi-Fi. For access away from home, choose **Direct internet**: Paddock checks your network, can forward a port on a compatible router, helps with Windows Firewall, and pairs your phone by QR code. This needs a reachable public IPv4 address. An upstream router or provider NAT may need a manual step; the wizard does not claim internet access works until a phone connects from outside. A private VPN you already use still works too.

An optional free Duck DNS hostname follows a changing address; its token stays in Keys. If mobile data stops working, follow the [connection recovery steps](docs/android-setup.md#if-mobile-data-stops-connecting). No terminal traffic goes through a Paddock account or hosted relay. See the [setup and privacy guide](docs/android-setup.md) and [direct-internet verification](docs/direct-internet-review.md). Physical-phone internet access was verified on 18 October 2026; address changes still require a fresh test.

## Run from source

With Node.js 24.22.1 and Git installed (on Linux also a C++ toolchain: `sudo apt install python3 make g++`, which builds the terminal library):

```powershell
git clone https://github.com/YeerooXY/agentdock.git
cd agentdock
npm ci
npm run prepare:runtime
npm run build
npm start
```

To add desktop and Start menu shortcuts, run `powershell -File scripts/desktop-shortcut.ps1` after building. `Launch Paddock.cmd` also opens the app. Keep the project folder in place; the shortcuts point to it.

## Build an installer

With Node.js 24.22.1, run `npm ci`, then the command for the system you are on: `npm run dist` (Windows x64), `npm run dist:linux` (AppImage and `.deb`) or `npm run dist:mac` (Apple silicon and Intel `.dmg`). Each system builds its own installers. The installers and `SHA256SUMS.txt` are written to `release/`. The CI workflow builds all three when a `v*` tag is pushed or the workflow is run by hand. `npm run pack` builds an unpacked app for inspection; `npm run test:packaged` tests it with a temporary profile and no system Node on PATH.

`powershell -NoProfile -File scripts/test-installer.ps1` also checks installation, the Start menu shortcut and removal. It refuses to run when Paddock is already installed and preserves existing development shortcuts.

The build downloads a pinned Node.js runtime, checks its SHA-256, bundles [npm 12.2.1 with dependency security fixes](vendor/README.md), the completion/MCP helpers and Meshy server outside ASAR, and includes their dependency licenses. `node-pty` uses its supplied Windows x64 N-API binaries. Only application code, built UI, bundled guides, icons, production dependencies and the runtime go into the installer. Local settings, credentials, sessions and test data are excluded. Packaging uses [electron-builder's NSIS target](https://www.electron.build/v26/docs/nsis/).

## Use it

Start with **+**, or open **Projects → New project**. Give it a name and folder, describe your goals and audience, and add initial milestones. New projects stay in **Planning** while you review the brief, similar apps and niche, infrastructure, and roadmap. **Discuss with agent** starts a conversation using your default console. You approve each section before the project becomes active. See the [planning guide](docs/projects-and-updates.md#plan-a-project).

- **AI shells** show their icons in the chooser, console headers, fullscreen tabs and corner HUD. Tools without a bundled logo use a colored initial. **?** in a panel header ends that console after confirmation.
- **Move consoles** with the shell icon in each panel header. A frozen copy of the terminal follows your pointer while other panels slide into place. On release, the copy expands into its destination. Drop on an empty slot to move, or an occupied slot to swap. Processes, output, names and saved conversations stay with their consoles. With the icon focused, **Alt+1–9** moves it by keyboard.
- **Resize consoles** by dragging an edge or corner. It snaps to your grid, which starts at 3×3, including 3×1 and 2×2 panels. Other panels move to make room. A pink-blue grid preview, active edge and live size label show the new footprint. An occupied layout turns red. Escape cancels; an impossible size leaves the saved layout intact. Focus a resize handle and use arrow keys to move that edge by one cell. Sizes are saved with your workspace. Narrow browser previews stack panels for readability.
- **Git workflow** defaults to the current branch. Shared agent instructions require a user request before creating or switching branches.
- **Results** groups work by project or working folder, then by turn. Pictures share one gallery: use the thumbnails, Previous/Next or arrow keys, and see which pictures you have viewed. Opening one picture marks only that picture; **Mark viewed** clears a whole turn. Console names are kept as recorded when the turn started. Code changes show a readable diff and the recorded branch + commit (for example, `main · 1ca12958`). Uncommitted changes are labelled separately. The code view keeps the starting and ending revisions; later commits do not rewrite old results. Missing historical revisions stay unavailable. Markdown is formatted, and supporting JSON stays behind **Show data**. ZIP files still have a built-in preview browser. Delete a file or a whole turn to permanently remove Paddock's saved copies from disk; project originals and exported copies stay in place. Failed deletions remain visible so you can retry.
- **Results** keeps requested outputs saved by agents: documents, images, designs, reports, datasets and exports. Ordinary replies and small code edits stay in their chat/project. Use **Add files** to keep other work. **Settings → General → Results → Also capture file changes** optionally copies code diffs and changed images after each turn; it defaults off. The first update to this policy turns the old default-on capture setting off once; later opt-ins persist. Existing Results remain available.
- **Completion alerts** go to Windows and paired phones. Clicking a Windows notification opens its console, result, or requested settings. Paddock keeps no notification inbox or read history; console badges and new Results batches still show pending work.
- **Website reviews** run through your agent. Ask it to review a page; screenshots and findings appear in Results. The tools capture desktop/mobile viewports, check accessibility and overflow, and check up to 12 same-origin links. The 20-item checklist needs a human or agent review; an automated scan is not certification. There is no separate review page.

- **Consoles** fills the window with live terminals. Click **+** to launch using **Settings → Console defaults**. When the grid is full, adding a console shrinks a larger panel by one cell or grows the grid, up to 64 consoles. **Settings → Console grid** lets you choose 2–8 rows and columns. More agents use more memory and CPU. You can type directly in a panel or expand it fullscreen. Returning to **Consoles** keeps the window fullscreen. Thinking uses a blue-purple outline; ready uses green.
- **Projects** shows status, goals, milestone progress, next step and last worked date. Active is green; the other states have distinct colors and labels. Click a folder path to open it. **Roadmap** holds your approved scope and milestones; extra ideas go into **Later features**. Agents can propose changes for review and report verified progress. A project can have several folders, and consoles can launch in subfolders. Existing projects keep their current state until you choose **Plan project**.
- **Bring an existing chat into Projects:** an ungrouped console shows **Set up project**. Link it to an existing project or create one with its current name and folder already filled in. Add your goals, and the project brief becomes available through `dock_context` on the agent's next turn. Linking preserves the running chat and files; it does not import earlier conversation transcripts. **Don't ask again** switches suggestions off across all consoles, including after a restart. Re-enable them in **Settings → Projects → Suggest project setup**. The folder button in each console header always lets you link, change or remove its project, or jump to **View project**. Project management is currently in the desktop app.
- **Chat project and title:** linked chats receive their exact project ID, name, launch folder and brief. Automatic titles follow project renames. Custom names stay yours; enable **Use project name as chat title** in the console's folder menu to switch back. An unlinked chat is explicitly marked as unlinked in its agent context; Paddock does not assign projects by guessing from a title or message.
- **Usage ? Project turns** groups recent turns by project. Filter a project or expand its group to see tokens, API cost estimates and observed changes in provider quota windows. These account-wide changes are estimates: other work can overlap, readings can be rounded, and resets or missing baselines stay unavailable. API messages include their tool-call rounds. Subscription prices are separate from API billing.
- **Project colors** are set when creating or editing a project. The same color appears beside its name, in linked consoles and on its usage bars. Project names and status labels stay visible.
- **Keys** stores named credentials from any service, encrypted with Windows DPAPI.
- **Settings → Tools** connects MCP servers and HTTP tools. **Settings → API** configures model APIs. Ask an agent to help configure one: it can prepare the settings here for you to apply. Missing keys are entered directly in Keys.
- **Instructions** sets the working style shared by supported agents.

**Ctrl + Shift + N** creates a console in the first free cell while Paddock is focused, using your defaults. **Ctrl + Alt + Space** shows or collapses the app. **Ctrl + Alt + 1–9** opens a console fullscreen. **×** hides Paddock in the Windows system tray, keeping consoles running. Click its tray icon or use the shortcut to return. **–** minimizes to the taskbar; **Quit** stops the processes.

Drag the grip in the top bar to move the window, including out of fullscreen. Drag the name in the HUD to move it. Double-click either grip to toggle fullscreen. Reopening from the tray keeps the window's position and fullscreen state.

**Settings → Startup → Restore previous consoles** is on by default. After quitting or restarting Windows, Paddock reopens the same numbered panels with their agents, names, launch folders and permissions. The layout is saved as it changes, including before shutdown. Ending an individual console removes it from the saved layout. Turning the setting off clears the saved layout and leaves currently open consoles running.

Saved Codex and Claude conversations resume by their exact session IDs, so consoles sharing a folder keep separate chats. Codex's session-start hook records its ID before the first reply finishes, including when you quit during that first task. Paddock trusts only its own metadata hook for that launch and leaves your Codex configuration files alone. Older Codex installations without hook support show an update message and keep completion-based tracking. Claude records its ID when the chat opens. Consoles without a recorded ID start a new chat. Paddock uses [`codex resume <ID>`](https://learn.chatgpt.com/docs/cli/reference) and [`claude --resume <ID>`](https://code.claude.com/docs/en/cli-reference) without submitting a prompt. WSL Claude sessions keep their original distribution even if a native installation is added later.

Other agents, shells and custom startup commands launch fresh. Running jobs, shell variables, typed input and terminal scrollback are not restored. A missing project folder leaves its panel available to retry; other panels still reopen.

The top-left button hides or shows the sidebar. Its state is saved.

**Settings → Desktop → Keep PC awake while agents work** is on by default. Paddock keeps the computer awake while any console is marked Thinking, a plain shell or custom command has printed output in the last 5 minutes (for example a running build), or a Paddock API request is running, including in the tray or HUD. The screen can still turn off. Normal automatic sleep resumes once all work finishes, needs input, or stops. Turning the setting off releases the request immediately. This follows Paddock's agent status; plain shells and custom commands without status reporting are not detected automatically. Manual Sleep, lid actions and Windows power-policy limits still apply. See the [verification and limits](docs/keep-awake-review.md).

Click a panel's title to name it, for example **Trader** or **Robonslaught**. On an empty panel, the name field appears at the top when you hover or tab into it. Enter or clicking away saves; Escape cancels. The name follows the console into fullscreen and the HUD, survives restarts, and stays on its slot after you close the console. Clear it to return to folder names. Hovering over an empty console smoothly reveals **New console** beside the plus.

The folder button above the grid changes the launch folder for new consoles. You can also choose it in **Settings → Console defaults**, alongside the agent, optional name and custom command. Preferences are stored for each Windows user. On a new computer the initial folder is that user's Projects folder, or their home folder if Projects does not exist.

Hold **+** for a moment, or right-click it, to choose a project, name, agent, model and folder for that panel. You can create a project from this chooser too. **Options** has a permission override. These choices apply only to that console; a regular click still uses your saved defaults. Escape or Cancel closes the chooser without opening anything. This also works in the HUD. With a keyboard, hold Space or press Shift+Enter on a plus button.

Pink-blue accents are the default. **Settings → Appearance** also offers blue or pink. Ready consoles pulse green and show a red badge on their terminal icon. Click inside a console, type or paste, or open it fullscreen to clear its badge. Results keeps its own new-batch count directly on its icon. Reduced-motion preferences disable panel motion and the ready pulse. Fullscreen terminals leave space below the last line. Window controls sit at the top right: HUD, minimize, fullscreen/restore, close to tray.

The console cursor is steady by default. **Settings → Appearance → Blink cursor** turns blinking back on. Paddock batches short output fragments and gives split cursor hide/redraw/show sequences up to 48 ms to arrive together. It also skips unchanged terminal fits to reduce redraw flicker. Programs can still deliberately hide and show their cursor; Paddock preserves those terminal commands. This setting affects Paddock, not CMD or other terminal apps. For Codex outside Paddock, `codex -c tui.animations=false` disables its animations for that launch; this is a troubleshooting option, not a confirmed fix for every flicker. See [Codex TUI options](https://learn.chatgpt.com/docs/config-file/config-advanced#tui-options).

Codex model suggestions come from its local model cache. Claude offers its [model aliases](https://code.claude.com/docs/en/model-config). **Enter a model…** accepts another model name or alias; the CLI checks availability. **Agent default** keeps the CLI's configured model. A one-time model choice is kept with that console when startup restoration is enabled.

The HUD is a normal desktop window, covered by other apps by default. It is not attached to the wallpaper; Win + D hides it too. Use the shortcut or taskbar to bring it back. Settings has an optional always-on-top switch.

## Vim controls

Turn on **Settings → Keyboard → Vim controls**. It is off by default and remembers your choice. **Ctrl+Shift+Space** moves focus out of the terminal and into Paddock's **NORMAL** mode. **i** returns to typing (**INSERT**). When the terminal or a form field has focus, its usual keys—including Escape and Ctrl+w—pass through unchanged.

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
| → | Show the shortcut list |

On other pages, j/k scroll and Ctrl+d/u scroll half a page. Press the two keys in a `g` shortcut within a second. No Vim shortcut ends a running console. This controls Paddock's interface; your editor or agent keeps its own editing mode.

## Claude and permissions

Claude Code is detected on Windows PATH, in its usual native install folders, and inside installed WSL distributions. Open a Claude console to complete any first-run setup and sign-in.

A fresh installation uses **Agent defaults** for permissions. Select **Unrestricted** in **Settings → Console defaults** to start every new agent console without approval prompts. Paddock passes each agent's own flag:

| Agent | Flag |
| --- | --- |
| Codex | `--dangerously-bypass-approvals-and-sandbox` |
| Claude Code, Google Antigravity | `--dangerously-skip-permissions` |
| GitHub Copilot | `--allow-all` |
| OpenCode | `--auto` |
| Cursor | `--force` |
| Grok Build | `--always-approve` |
| Kiro | `--trust-all-tools` |
| Qwen Code, Gemini CLI | `--approval-mode yolo` |
| Kimi Code | `--yolo` |
| Cline | `--auto-approve true` |
| Factory Droid | `--auto high` |

Pi has no approval prompts, so the setting does not apply to it. Consoles on a Linux host through SSH always use Agent defaults.

Codex consoles run inline (`--no-alt-screen`), so you can scroll up and select text to copy. Turn this off in **Settings → Consoles → Keep scrollback in Codex consoles**; Codex then uses its full-screen view, where Shift+drag selects text. Paddock tells an agent its new size once a resize stops, so Codex repaints once per drag. Existing consoles keep their permissions. Full access uses the signed-in OS account's permissions; it does not grant administrator rights or remove provider limits. First-run setup and sign-in still apply.

Per-session hooks report completion and attention states. Claude's status line reports usage when available. User and project CLI configuration files are not edited. Existing processes outside Paddock are not controlled.

## Shared tools and instructions

1. Save a credential in **Keys**, using a short ID such as `blender_service`.
2. Add a connection in **Tools**. Local MCP servers need their executable and arguments; remote servers need an endpoint. Bind a saved key to the required environment variable, HTTP header or query parameter.
3. Test an MCP connection to discover its tools. Checking an ordinary HTTP API validates its setup without sending a request.
4. Write your preferences in **Instructions**. Managed agents and API sessions receive shared context through their launch configuration or the MCP bridge. See the [adapter details](docs/agent-setup.md).

The **Built-in tools** cards handle these integrations:

| Tool | Setup in Paddock | What you need |
| --- | --- | --- |
| Blender | **Set up Blender** installs a pinned MCP server in a separate local Python environment and installs its add-on. **Update tools** reapplies the version shipped with Paddock. | Install Blender first. The setup uses Blender's bundled Python. Open Blender and start **MCP for Blender** in the N sidebar; enable it in Preferences → Add-ons if setup could not do that while Blender was open. |
| Unity | Pick your project folder and press **Connect**. Paddock installs Unity Pipeline into that project and uses the official Unity CLI MCP connection. | Install [Unity CLI](https://docs.unity.com/en-us/unity-cli/unity-cli-reference) and a compatible Unity Editor. Open the selected project to use editor tools. |
| Meshy AI | **Add key** saves your Meshy key in the encrypted vault. Select it and press **Connect**. The MCP server and runtime are included. | Your own [Meshy API key](https://www.meshy.ai/developers/keys). Asset generation uses Meshy credits. |

| Reverse Engineer Anything | **Set up REA** installs the pinned local MCP package and shares its tools and investigation guidance. | No service key; external engines/browser depend on the target. [Setup](docs/reverse-engineering.md). |
| MiroFish | Enter your local backend URL and **Connect MiroFish**. Agents can prepare scenarios, run bounded simulations and retrieve reports. | A separately running MiroFish backend with its own model/Zep configuration and billing. [Setup and limits](docs/mirofish.md). |

**Browse tools** shows discovered tool names, descriptions and inputs. Connecting or browsing Meshy does not generate assets or verify account credits. Installers need an internet connection; Blender is a community integration, while Unity CLI and Meshy's MCP server are provided by their respective vendors. Blender server telemetry is disabled for Paddock's managed connection. No other agent configuration is rewritten.

REA helps agents investigate existing software and record evidence. MiroFish is an
optional step after building and before launch, for exploring audience reactions
and testing assumptions. Its simulated personas do not replace actual customer
feedback. Both integrations share relevant guidance through `dock_context` while
enabled; opening Tools starts no analysis or simulation.

**Free creative tools** offers optional ArtCraft MCP presets when you have no
preferred alternative. Preparing a preset saves and starts nothing. Paddock keeps a
readable inventory of managed tool downloads and asks to open it for manual cleanup
at interactive uninstall; it never automatically deletes downloaded repositories.
[Creative tools and download review](docs/tool-downloads.md).

### Web design

For a vague request such as **“improve this screen”**, agents are now instructed to inspect the screen, try one visual preview and show it in **Results** before a substantial redesign. Specific edits can proceed directly. Turn this preference off in **Tools → Screen previews** if you prefer.

Choose your **Image generator** there: the agent's own tool, OpenAI, Gemini / Nano Banana, Meshy, or a compatible image API. The default still tries the agent's own tool first, with Meshy as fallback. For an API, add its credential in **Keys**, select that saved key and an image model, then save. Agent help can prepare these settings in Tools for you to apply. Saving does not generate or bill anything. [Provider setup and limits](docs/screen-previews.md).

Ask your agent to review the page and generate a screen preview. It uses the shared review and image tools with your selected generator, then saves screenshots, findings and the image in **Results**. Configure generation in **Tools → Screen previews**; **Meshy CLI sign-in** is there too. Agents can list saved reviews, update checklist evidence and delete a review with its saved files.

Meshy fallback uses the bundled official CLI and its own sign-in, separate from the API-key MCP connection in Tools. **Check sign-in** reuses an existing CLI account; **Connect Meshy** provides a code and a browser sign-in link. The CLI manages its credentials; Paddock does not copy them into its vault. Generating a concept uploads the reference screenshot to Meshy and uses credits. Accepted task IDs are saved, so **Resume task** continues checking the same job without another submission. Reported credits appear in **Usage** and remain after deleting a job. No credit amount is invented when Meshy does not report one.

All agents and API sessions can discover connection `dock` with `dock_tools`. It includes `save_result`, `notify`, `review_page`, `review_details`, `generate_preview`, `meshy_concept` and job status tools. File results must be inside the calling console’s project; API sessions use the default project folder. Files are copied into the gallery, with a 50 MB file limit and a 1 GB gallery limit. Optional file-change capture compares bounded project snapshots and saves changed code and images; see the [capture limits](docs/android-setup.md#code-changes-in-results).

**Instructions → Ways of working → Web design** is off by default; the **Web UX/UI** skill pack below carries the same research for agents to load when a task needs it. Turned on, its [shared guide](guides/web-design.md) covers layout, typography, responsive behavior, accessibility, performance and a 20-point page review: policies, consent, data collection, SDKs, honest claims and reviews, fees, business details, children's data, unsubscribe, asset licenses and deletion requests.

Agents review every item on every page, recording checked, needs work or not applicable with a reason. Policies and consent flows must match the actual site and applicable rules; the guide is not a legal certification or an automated enforcement engine. You can read or disable it in Instructions, alongside your own preferences.

### Skill packs

**Instructions → Skill packs** installs optional knowledge as [Agent Skills](https://agentskills.io/) folders. The first-run wizard offers the same choice. Installing copies a pack into `~/.agents/skills`, which Codex, Gemini CLI, Copilot, Cursor, OpenCode, Kimi Code, Cline and Pi read, and into the folders of installed agents that use their own location: `~/.claude/skills`, `~/.kiro/skills`, `~/.qwen/skills`, `~/.factory/skills`, `~/.grok/skills` and `~/.gemini/antigravity/skills`. Agents load a pack when a task matches its description.

Paddock includes **Web UX/UI** ([`skills/web-ux-ui`](skills/web-ux-ui/SKILL.md)): the 23 October 2026 web research as a handbook, topic guides, reference atlas, verification workbook, source register and the 70-item page and security checklist. `dock/website_guide` reads the same topic files. Third-party screenshots from that study are not included.

Your own packs go in `%APPDATA%\Paddock\skill-packs\<name>\SKILL.md`. They appear as **Local** and never enter the repository or a release. A pack's `name` must match its folder.

Each installed folder holds a `.paddock-skill.json` manifest with file hashes. **Update** replaces an unchanged install. Paddock never overwrites a folder it did not create or one whose files you changed. **Uninstall** removes the unchanged files it added and keeps your edits. Installed locations are listed in `managed-downloads.txt` for review when uninstalling Paddock.

The shared summary is `%APPDATA%\Paddock\shared\PADDOCK.md`. Each new console receives its own `sessions/<session ID>/PADDOCK.md` with the chat's project binding. These files contain instructions, enabled connection descriptions and credential names, never key values. Live console copies refresh when the project link, project details or shared instructions change. Running agents still need to call `dock_context` or reread their file to consume updates.

All supported sessions receive three shared functions:

- `dock_context`: current instructions and connection summary.
- `dock_tools`: tool discovery with input schemas.
- `dock_call`: invoke a configured tool with its bound credentials.

Open sessions can fetch updates with `dock_context`. Codex receives the summary as additional developer instructions; Claude appends the file to its system prompt. When a large summary would exceed Windows command-line limits, Codex receives an instruction to load it through `dock_context` or the file. Existing project instructions still apply.

Custom commands can use `{instructions}` and `{mcp_config}` placeholders; Paddock replaces them with quoted file paths. The same paths are available in `PADDOCK_INSTRUCTIONS` and `PADDOCK_MCP_CONFIG`. A custom agent must support those integrations. Arbitrary programs do not automatically become MCP clients. Agents launched outside Paddock are not modified.

Supported connections: MCP stdio, Streamable HTTP and legacy SSE; fixed HTTP endpoints with GET/POST/PUT/PATCH/DELETE and JSON Schema inputs. MCP OAuth browser login, resources/prompts, arbitrary model protocols and streaming model output are not implemented.

## API requests and usage

Model API connections support OpenAI Responses, Anthropic Messages and OpenAI-compatible Chat Completions. Configure the full endpoint and a saved credential in **Settings → API → Model APIs**. Local endpoints may omit a key.

Each API request starts a new conversation, receives shared instructions and can use connected tools. Runs stop after at most eight model steps. Every model request gets its own ledger entry, including a failed continuation. No automatic retries are made. Text and supported image tool results are passed to Responses/Messages; Chat Completions tool results are text only.

Subscription percentages come from provider reports and are account-wide. Desktop per-turn quota change compares fresh readings for the same window, labels the result as an estimate, and never adds percentages across sessions or projects. A reported 0% can reflect rounding. Monthly capacity is not inferred from a subscription price or token totals. Missing windows are not inferred. Codex account reads do not run model inference. Claude usage arrives from managed sessions after responses. API usage here covers requests sent through Paddock, not other apps or a provider's entire bill. External HTTP/MCP service charges are not estimated automatically.

Cost estimates use the per-model USD rates you enter in **Usage**. Unknown rates or token counts stay unknown. Cached tokens are counted once. Export includes all API records; the table shows the latest 100.

## Storage and access

Local data is in `%APPDATA%\Paddock`:

- `vault.json`: encrypted credentials and labels.
- `workspace.json`: encrypted console launch details and conversation IDs for startup restoration; no terminal input, output or transcripts.
- `shared.json`: instructions, connection settings and credential IDs.
- `shared/PADDOCK.md`: generated summary without secrets.
- `integrations`: installed Blender server, setup versions and add-on setup notes. The Blender add-on itself lives in Blender's user add-ons folder. Unity Pipeline lives in the project you selected.
- `ledger.json`: model, time, tokens, request status and estimated cost; no prompts or responses.
- `results/`, `reviews.json`: saved files, page screenshots, findings and manual checklist notes. These can contain project or page content. Delete saved copies in Results, or ask your agent to delete a whole review with `dock/delete_review`.
- `mobile.json`: connection settings plus an OS-encrypted payload containing paired device tokens and TLS identity. Disable the connection or remove phones in Android setup.
- `concept-jobs/` holds image job metadata, prompts and Meshy temporary downloads; `concept-usage.json` keeps reported usage and request IDs to prevent repeat billing. Completed images are copied to Results. Removing a job deletes its prompt and temporary files; usage metadata remains. [Image data and deletion](docs/screen-previews.md#data-and-usage).
- `settings.json`, `limits.json`, `events`, `sessions`: preferences, cached quotas and per-session tracking/configuration.
- `projects.json`: project records, including the chosen color. `message-usage.json` retains up to 5,000 turn records with token counts, project IDs and reported quota changes; the desktop view shows the latest 200. A per-console `events/*.quota-start.json` file keeps the starting quota reading. These tracking fields contain no prompts, answers, key values or credit balances.

Older profiles may retain `inbox.json` from previous builds. Paddock no longer reads or updates it; it can be deleted after quitting the app. Live phone alert delivery keeps at most 50 event IDs, titles and timestamps in memory and resets when the host restarts. Pairing remains saved.

Keys are decrypted in the main process. A configured local MCP server receives only the credentials explicitly bound to it. Agent consoles do not receive vault keys. Remote keys are sent only to their configured connection, with redirects disabled. Do not paste credentials into commands, URLs, descriptions or instructions; use key bindings.

The renderer is sandboxed and cannot read decrypted keys or make network requests directly. CLI tools connect through a token-authenticated loopback bridge bound to 127.0.0.1; tokens are passed in memory via environment variables and revoked when the session ends. The optional Android companion adds a separate, disabled-by-default HTTPS/WSS listener on a selected private or Tailscale address. Pairing requires a single-use invitation and matching-code approval on the PC; devices can be revoked; see the [mobile data flow](docs/android-setup.md#data-use-and-privacy). Windows encryption does not protect against software already running with your account's access.

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
