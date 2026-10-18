# Projects, usage and updates

## Keep a project moving

Open **Projects → New project**. Give it a name and folder, describe your goals, and optionally choose a category. That is enough to start. Add an approach, milestones, notes or a next step later through **Edit**. Add several folders if the game, website and backend live separately. The folder picker adds one; the text field also accepts one folder per line, optionally as `Label | path`.

Choose **Open console** on its card, or right-click/hold **+** and select the project. **Start in** lists its saved folders. The editable folder below also accepts a subfolder or another existing folder. The console inherits the project name unless you enter a different name. Regular **+** still uses your defaults.

Project cards show milestone progress and the last worked date. Active projects left for a week get a quiet **Pick up again** label. Search or filter by category/status. Paused and complete projects remain available; archived projects leave the launch chooser.

The selected project's brief is included in the console's startup instructions and in each `dock_context` refresh. Agents can call `dock/project_progress` to record a verified milestone, a note or the next step. That tool is scoped to the calling console's project. Agents with plain custom commands must read the supplied instruction file themselves. API requests have their own Project selector.

Project records live in `projects.json` inside Dock's local profile, normally `%APPDATA%\Agent Dock`. They are ordinary local text, not vault entries. Use **Keys** for credentials. Only the project selected for a console/request is added to its instructions; the agent or API provider can receive that brief. Other provider/tool data practices still apply.

**Edit → Delete project** removes that local project record. It leaves folders and open consoles intact. Information already copied into startup instruction files, agent histories, Results or exports is not erased by this action. Existing consoles retain their current name and folder; new context calls stop including the deleted project record.

## Make room for more consoles

Use **Ctrl+Shift+N**, or the floating **+** when all cells are covered. Dock first shrinks a larger panel by one grid step. If every panel is already 1×1, it grows the grid. Running consoles and their conversations stay in place.

**Settings → Console grid** accepts 2–8 rows and columns, up to 64 consoles. Shrinking the grid requires moving/resizing any panel that would be outside it. Drag edges to resize and panel handles to move, as before. Grid dimensions, project links and panel sizes survive restart when restoration is on.

The limit is a layout limit, not a performance promise. Each agent has its own memory/CPU usage; use a larger grid when the screen and PC can handle it. The native Android app still shows one selected console at a time.

## Read message usage

**Usage → Per message** shows the latest 200 recorded turns:

- **Dock API:** one row groups all model/tool rounds of a request. Token counts come from provider responses. Cost is an estimate from your configured rates, not an invoice. Unknown usage/rates remain unknown.
- **Codex:** completed turns use changes in cumulative token counters. If the bounded local log scan lacks a reliable starting counter, that turn has unknown usage.
- **Claude:** completion hooks total the main agent's reported message counters, including cache tokens. Delegated agents are not included. Old turns are not reconstructed automatically.
- **Other CLIs:** remain unsupported until a reliable usage source is available. Subscription credits per message are not exposed by these integrations and are never inferred from tokens.

The API ledger retains request metadata as before. CLI message metadata is stored in `message-usage.json`, capped at 5,000 rows. These records contain identifiers, times, model/console/project labels and counters; they do not copy prompts, responses or tool output. Agent CLIs may keep their own transcripts independently. To reset CLI message history manually, quit Dock and remove that file. A running console can import recent counters again when reopened.

## Download an update

On Windows: **Settings → Updates → Check for updates → Download update → Install update**. Dock checks the downloaded size and SHA-256 against GitHub's release metadata and checks the hash again before launching it. If consoles are open, you explicitly choose whether to end them for installation. An active API request must finish first. The installer uses your existing local profile; supported conversations resume according to the restoration setting. Running jobs do not survive installation.

On Android: **Usage → Updates → Check for updates → Download update**. The browser downloads the matching arm64 or armv7 APK from this repository. Open the file and approve Android's installation prompt. Pairings stay saved when the new build has the same signing key. The current preview uses a development signing key; a future differently signed store build may require reinstalling and pairing again.

There are no scheduled checks, background downloads or automatic installer launches. GitHub receives ordinary request metadata such as your IP address, but no project notes, terminal traffic, keys or pairing credentials. Windows downloads stay in the local profile's `updates` folder; Android downloads are managed by the browser. Stable builds only offer stable releases; preview builds can offer newer previews or a stable release. The feature updates Agent Dock, not the Windows operating system.

An offline connection or GitHub rate limit leaves an error and a retry button. Windows installers are still unsigned in this preview; checksum verification detects a mismatched download but is not publisher signing.
