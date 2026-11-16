# Projects, consoles and updates

Projects group consoles and documentation by name and folder. Configure name, category, colour, status and one or more folders on desktop. Choose a project from a console�s folder button. Its binding supplies the project ID, name and launch directory to the agent. Knowledge has a separate project setting.

Projects no longer displays planning fields, saved progress, milestones, decisions or a duplicate worker-report history. Existing reference documents and Knowledge remain available. New project setup creates no planning mirrors or completion journals.

Project configuration is stored in `%APPDATA%\Paddock\projects.json`. Deleting a project removes its configuration and preserves its source folders and consoles. Existing agent histories and exports remain independent.

## Make room for more consoles

Use **Ctrl+Shift+N**, or the floating **+** when all cells are covered. Paddock first shrinks a larger panel by one grid step. If every panel is already 1×1, it grows the grid. Running consoles and their conversations stay in place.

**Settings → Console grid** accepts 2–8 rows and columns, up to 64 consoles. Shrinking the grid requires moving/resizing any panel that would be outside it. Drag edges to resize and panel handles to move, as before. Grid dimensions, project links and panel sizes survive restart when restoration is on.

The limit is a layout limit, not a performance promise. Each agent has its own memory/CPU usage; use a larger grid when the screen and PC can handle it. The native Android app still shows one selected console at a time.

## Read message usage

**Usage → Per message** shows the latest 200 recorded turns:

- **Paddock API:** one row groups all model/tool rounds of a request. Token counts come from provider responses. Cost is an estimate from your configured rates, not an invoice. Unknown usage/rates remain unknown.
- **Codex:** completed turns use changes in cumulative token counters. If the bounded local log scan lacks a reliable starting counter, that turn has unknown usage.
- **Claude:** completion hooks total the main agent's reported message counters, including cache tokens. Delegated agents are not included. Old turns are not reconstructed automatically.
- **Other CLIs:** remain unsupported until a reliable usage source is available. Subscription credits per message are not exposed by these integrations and are never inferred from tokens.

The API ledger retains request metadata as before. CLI message metadata is stored in `message-usage.json`, capped at 5,000 rows. These records contain identifiers, times, model/console/project labels and counters; they do not copy prompts, responses or tool output. Agent CLIs may keep their own transcripts independently. To reset CLI message history manually, quit Paddock and remove that file. A running console can import recent counters again when reopened.

## Download an update

On Windows: **Settings → Updates → Check for updates → Download update → Install update**. Paddock checks the downloaded size and SHA-256 against GitHub's release metadata and checks the hash again before launching it. If consoles are open, you explicitly choose whether to end them for installation. An active API request must finish first. The installer uses your existing local profile; supported conversations resume according to the restoration setting. Running jobs do not survive installation.

On Android: **Usage → Updates → Check for updates → Download update**. The browser downloads the matching arm64 or armv7 APK from this repository. Open the file and approve Android's installation prompt. Pairings stay saved when the new build has the same signing key. The current preview uses a development signing key; a future differently signed store build may require reinstalling and pairing again.

There are no scheduled checks, background downloads or automatic installer launches. GitHub receives ordinary request metadata such as your IP address, but no project notes, terminal traffic, keys or pairing credentials. Windows downloads stay in the local profile's `updates` folder; Android downloads are managed by the browser. Stable builds only offer stable releases; preview builds can offer newer previews or a stable release. The feature updates Paddock, not the Windows operating system.

An offline connection or GitHub rate limit leaves an error and a retry button. Windows installers are still unsigned in this preview; checksum verification detects a mismatched download but is not publisher signing.
