# Extra accounts per provider: isolation checks, 3 November 2026

An extra account needs its own sign-in storage, so two accounts never share a login. Paddock gives each extra account a private folder and points the CLI at it through an environment variable. A provider is enabled only when a CLI started with that variable no longer sees the default account.

Method on Windows 11: run a free, non-model command with the default environment, then with the variable set to an empty folder, and compare. No model requests were made.

| Provider | Variable found | Command | Result | Where the login lives |
| --- | --- | --- | --- | --- |
| Kiro 2026.10 | `KIRO_HOME` (config), `KIRO_DATA_DIR` (named in the binary) | `kiro-cli whoami` | Still signed in as the default account with `KIRO_HOME`, `KIRO_DATA_DIR`, `LOCALAPPDATA` or `XDG_DATA_HOME` set to an empty folder | Not in the overridable folders. `KIRO_HOME` moves settings only. |
| GitHub Copilot 1.0.105 | `COPILOT_HOME` | `account.getQuota` over `--headless --stdio` | Same quota from the default account with an empty `COPILOT_HOME` | Windows Credential Manager or the GitHub CLI login, outside `COPILOT_HOME` |
| Cursor 2026.10.22 | `CURSOR_CONFIG_DIR`, `CURSOR_DATA_DIR` | `cursor-agent status` | Still "Logged in" as the default account with both set | Windows Credential Manager |

Result: none of the three can hold a second account through a folder. They stay at one account ("One account for now" in the chooser).

The remaining route would be a per-account token passed in the environment (`COPILOT_GITHUB_TOKEN`, `CURSOR_AUTH_TOKEN`). The project rules forbid credentials in agent-console environments, so that route needs an owner decision first.

Not yet checked: Qwen, Droid, Cline, OpenCode, Kimi, Grok and Antigravity.

Note: `agent` on this PC resolves to Grok's CLI before Cursor's (`.grok/bin` is earlier on PATH). Cursor checks must use `cursor-agent`.
