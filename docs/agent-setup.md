# Agent setup

Reviewed 25 October 2026. This is a maintained catalog of prominent vendor CLIs and independent clients with documented Windows installation paths, not a market-share ranking or an exhaustive list of agents. Install choices are optional. Existing installations are detected; account sign-in remains in each provider's CLI.

| Agent | Installer used by Paddock | Account/setup guide | Shared context and tools |
| --- | --- | --- | --- |
| Codex | Official PowerShell installer | [Codex CLI](https://learn.chatgpt.com/docs/codex/cli) | Per-console developer instructions, MCP and completion callback |
| Claude Code | Official PowerShell installer | [Setup](https://code.claude.com/docs/en/setup) | Per-console appended instructions, MCP and hooks; existing WSL installations remain supported |
| Google Antigravity | Official PowerShell installer, `agy` | [CLI installation and sign-in](https://antigravity.google/docs/cli/install/) | Managed entry in `.gemini/config/mcp_config.json`; MCP initialization instructions |
| GitHub Copilot | `@github/copilot` | [Quickstart](https://docs.github.com/en/copilot/get-started/cli-quickstart) | Session MCP config and a generated instructions directory |
| OpenCode | `opencode-ai` | [OpenCode](https://opencode.ai/docs/) | Runtime config merges the shared instructions and MCP entry |
| Cursor | Official Windows CLI installer, `agent` | [CLI installation](https://cursor.com/docs/cli/installation) | Managed entry in `.cursor/mcp.json`; MCP initialization instructions |
| Grok Build | Official PowerShell CLI installer | [Grok Build](https://docs.x.ai/build/overview) | Additional rules and a managed TOML MCP entry |
| Kiro | Official Windows CLI installer, `kiro-cli chat` | [CLI setup and first run](https://kiro.dev/docs/cli/setup/) | Managed entry in `.kiro/settings/mcp.json`; Windows 11 required |
| Qwen Code | `@qwen-code/qwen-code` | [Quickstart and authentication](https://qwenlm.github.io/qwen-code-docs/en/users/quickstart/) | Per-console system defaults with context and MCP |
| Kimi Code | Official PowerShell installer | [Maintained Kimi Code CLI](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/guides/getting-started.md) | Managed entry in `~/.kimi-code/mcp.json`; global accounts can use `kimi login --region global` |
| Cline | `cline` | [CLI overview](https://docs.cline.bot/usage/cli-overview) | Managed MCP entry; CLI inherits the session environment |
| Factory Droid | `droid` | [Droid CLI quickstart](https://docs.factory.com/droid-cli/quickstart) | Appended instructions and managed MCP entry |
| Pi | `@earendil-works/pi-coding-agent`, with install scripts disabled | [Quickstart](https://pi.dev/docs/latest/quickstart) | Appended instructions and managed MCP entry |
| Gemini CLI | `@google/gemini-cli` | [Installation](https://geminicli.com/docs/get-started/installation/) | Managed MCP entry in `~/.gemini/settings.json`; Windows 11 24H2 or newer |

Google's current Gemini CLI guidance directs free/personal users toward Antigravity. Paddock retains both choices. Qwen OAuth ended on 15 April 2026; use `/auth` to choose a currently supported provider. Z.AI is a model provider: choose OpenCode and connect the appropriate Z.AI account/provider inside it. See [Z.AI's OpenCode guide](https://docs.z.ai/devpack/tool/opencode). The Tools presets for Grok and Z.AI use their standard Chat Completions endpoints; a Coding Plan subscription is not a general-purpose API credit balance. [Z.AI supported tools](https://docs.z.ai/devpack/tool/others).

Other clients remain available through Custom command. Aider, Goose and Mistral Vibe were also checked: [Aider](https://aider.chat/docs/install.html) and [Vibe](https://docs.mistral.ai/getting-started/quickstarts/vibe-code/install-cli) use Python/uv installation paths; [Goose](https://block.github.io/goose/) distributes its own desktop/CLI binaries. They are not checkbox installers in this release. Custom commands can receive `{instructions}` and `{mcp_config}` where supported. This distinction avoids claiming uniform MCP support for clients with different tool systems.

## What setup changes

The renderer can choose catalog IDs, not arbitrary download URLs or packages. npm-based agents install under Paddock's local `agents` directory with its bundled Node/npm runtime. Native installers use their documented Windows destinations. Paddock records each installer workspace and the exact executable path without claiming a shared parent folder. Existing commands are detected and skipped. Installers receive an allowlist of OS environment variables; Paddock strips provider keys, bridge tokens, npm registry credentials and Node injection options, and keeps npm config files empty. Installation runs sequentially, reports bounded redacted diagnostics and can be retried after failure. Closing the setup dialog is disabled while installation runs.

The wizard saves the project folder and default provider. Its launch checkbox opens that console once when setup finishes. It does not overwrite defaults when using the one-time console chooser. On future restarts, workspace restoration handles saved panels.

New managed consoles get a shared-tool bridge. Where a CLI has a session configuration option, Paddock uses it. Other clients receive only a `paddock` entry in their user MCP configuration, preserving other entries and keeping an original backup ending in `.paddock-backup`. A conflicting server name or invalid JSON stops automatic setup instead of overwriting it. Global entries reference session environment variables; no vault key is written into them. The bridge is available while its Paddock console is alive. Provider policies and project instructions still apply.

MCP initialization includes instructions to fetch `dock_context`. Supported clients also receive the shared instruction file through their context/config options. Completion for the additional clients uses `dock/notify`; it depends on the agent making that call. Codex and Claude retain their native completion/usage hooks. Only Codex and Claude resume exact saved chat IDs. Other clients reopen their folder and selected model in a fresh session; their own session picker may reopen prior chats. Account quota widgets remain Codex/Claude only; unknown provider limits are not fabricated.

## Agent-assisted configuration

`dock/setup_status` lists agent readiness, connection settings and key names. `dock/prepare_setup` prepares a tool, API or key-entry request in Tools. It does not execute a command, install a server or send a model request. **Apply settings** saves the reviewed connection. A key-entry request opens the vault form with its ID and name filled in; the secret is never returned to the agent. Built-in Blender, Unity and Meshy setup remains on Tools, including the Unity folder picker.

Paddock's vault covers API calls and explicitly bound MCP credentials. Each CLI manages its own provider sign-in and authentication storage. These are separate from Paddock's vault; account quotas and API spending are also separate.

## Validation and limits

Catalog commands and package ownership were checked against the linked primary documentation and the npm registry. Tests cover all launch adapters, installation selection/retry, credential filtering, configuration merging/backups and setup drafts. An offline fixture package verifies that bundled npm installs and launches a CLI without system Node. Native Codex/Claude startup is checked without sending prompts. The other providers' interactive sign-ins and paid work were not exercised; organization policies and future upstream CLI changes can require provider-specific adjustments. Automatic installation is disabled in smoke tests.

MCP references: [GitHub](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers), [OpenCode](https://opencode.ai/docs/mcp-servers), [Cursor](https://cursor.com/docs/context/mcp), [Grok](https://docs.x.ai/build/features/mcp-servers), [Antigravity](https://www.antigravity.google/docs/mcp/), [Cline](https://docs.cline.bot/mcp/configuring-mcp-servers), [Droid](https://docs.factory.com/cli/configuration/mcp), [Pi](https://pi.dev/docs/latest/mcp). Pi's prompt-file option is documented in its [CLI reference](https://pi.dev/docs/latest/cli). Cline's current [CLI transport source](https://github.com/cline/cline/blob/main/sdk/packages/core/src/extensions/mcp/client.ts) confirms environment inheritance.
