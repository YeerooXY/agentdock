# Extra accounts per provider: isolation checks, 3 November 2026

An extra account needs its own sign-in storage, so two accounts never share a login. Paddock gives each extra account a private folder and points the CLI at it through an environment variable. A provider is enabled only when a CLI started with that variable no longer sees the default account.

Method on Windows 11: run a free, non-model command with the default environment, then with the variable set to an empty folder, and compare. No model requests were made.

| Provider | Variable found | Command | Result | Where the login lives |
| --- | --- | --- | --- | --- |
| Kiro 2026.10 | `KIRO_HOME` (config), `KIRO_DATA_DIR` (named in the binary) | `kiro-cli whoami` | Still signed in as the default account with `KIRO_HOME`, `KIRO_DATA_DIR`, `LOCALAPPDATA` or `XDG_DATA_HOME` set to an empty folder | Not in the overridable folders. `KIRO_HOME` moves settings only. |
| GitHub Copilot 1.0.105 | `COPILOT_HOME` | `account.getQuota` over `--headless --stdio` | Same quota from the default account with an empty `COPILOT_HOME` | Windows Credential Manager or the GitHub CLI login, outside `COPILOT_HOME` |
| Grok Build | `GROK_HOME` | `auth.json` structure, `cmdkey /list` | The full sign-in (session key and refresh token) is `auth.json` in `GROK_HOME`; no Credential Manager entry. An empty `GROK_HOME` has no `auth.json`. | `GROK_HOME/auth.json`. **Enabled.** |
| Google Antigravity (agy) | none for sign-in (home folder follows `USERPROFILE`) | `agy models` | Still the default account with `USERPROFILE` and `HOME` set to an empty folder | Credential Manager entry `gemini:antigravity`, one per Windows user. `AGY_ADC_AUTH` is Google Cloud business sign-in, not a consumer plan. |
| Cursor 2026.10.22 | `CURSOR_CONFIG_DIR`, `CURSOR_DATA_DIR` | `cursor-agent status` | Still "Logged in" as the default account with both set | Windows Credential Manager |

Antigravity uses account switching instead (owner approved 3 November 2026): Paddock keeps each account's sign-in encrypted with safeStorage (`credential-slots/`) and writes the chosen one into `gemini:antigravity` before a console or usage check starts. Only one Antigravity account is signed in at a time; starting a console of another account is refused while one is open. Sign-ins are matched by the email inside the credential, so a token refreshed by a CLI outside Paddock is saved under the right account. After use, the default account is put back. Verified live: the credential round-trips byte for byte through `electron/windows-credentials.cjs`, and `agy models` reports "Please sign in" without the entry. Not yet verified with a real second Google account.

Result: Grok gets extra accounts (its MCP configuration also goes to the account's folder). Kiro, Copilot and Cursor cannot hold a second account through a folder and stay at one account ("One account for now" in the chooser). Grok skills installed by Paddock go to `~/.grok/skills` and are not yet copied into extra Grok accounts.

The remaining route would be a per-account token passed in the environment (`COPILOT_GITHUB_TOKEN`, `CURSOR_AUTH_TOKEN`). The project rules forbid credentials in agent-console environments, so that route needs an owner decision first.

Not yet checked (CLI not installed on this PC): Qwen, Droid, Cline, OpenCode and Kimi.

Note: `agent` on this PC resolves to Grok's CLI before Cursor's (`.grok/bin` is earlier on PATH). Cursor checks must use `cursor-agent`.
