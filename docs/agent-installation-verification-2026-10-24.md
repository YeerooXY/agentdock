# Agent installation verification

Checked on 25 October 2026 on Windows 11 build 26200. Host Node is 24.19.0 with npm 12.2.1; Paddock's prepared installer runtime is Node 24.22.1. Git Bash is available at `C:\Program Files\Git\bin\bash.exe`, which satisfies Pi's Windows shell requirement. Vendor instructions and Windows install routes below were checked against their primary sources on that date.

## Installed CLIs

All 14 catalogue entries were detected by the updated Paddock installer module. Each `--version` and `--help` check exited successfully using an isolated profile under `.build/codex-prompt-runs/2026-10-24/6/cli-profiles/`. Kiro's `chat --help` also passed. Codex, Claude Code and Kiro were already installed and were skipped; the remaining 11 were installed in this run.

| CLI | Version | Executable | Distribution and official source |
| --- | --- | --- | --- |
| Codex | 0.163.0 | `C:\Users\7yeer\AppData\Roaming\npm\node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin\codex.exe` | Existing install; left unchanged. [Codex CLI](https://learn.chatgpt.com/docs/codex/cli) |
| Claude Code | 2.1.310 | `C:\Users\7yeer\.local\bin\claude.exe` | Existing install; left unchanged. [Claude setup](https://code.claude.com/docs/en/setup) |
| Google Antigravity | 1.4.7 | `C:\Users\7yeer\AppData\Local\agy\bin\agy.exe` | Official PowerShell installer, [CLI install](https://antigravity.google/docs/cli/install/) |
| GitHub Copilot | 1.0.103 | `C:\Users\7yeer\AppData\Roaming\Paddock\agents\copilot\node_modules\.bin\copilot.cmd` | `@github/copilot`; [CLI quickstart](https://docs.github.com/en/copilot/get-started/cli-quickstart) |
| OpenCode V1 | 1.19.4 | `C:\Users\7yeer\AppData\Roaming\Paddock\agents\opencode\node_modules\.bin\opencode.cmd` | `opencode-ai`; [V1 documentation](https://opencode.ai/docs/) |
| Cursor | 2026.10.22-27dcf5f | `C:\Users\7yeer\AppData\Local\cursor-agent\cursor-agent.cmd` | Official Windows installer; [CLI installation](https://cursor.com/docs/cli/installation) and [Windows installer](https://cursor.com/install?win32=true) |
| Grok Build | 1.0.70 (f50904eaee6c) | `C:\Users\7yeer\.grok\bin\grok.exe` | Official native PowerShell installer; [xAI CLI overview](https://docs.x.ai/build/overview) |
| Kiro | 2.34.0 | `C:\Users\7yeer\AppData\Local\Kiro-Cli\kiro-cli.exe` | Existing per-user install; left unchanged. [CLI setup](https://kiro.dev/docs/cli/setup/) |
| Qwen Code | 0.26.1 | `C:\Users\7yeer\AppData\Roaming\Paddock\agents\qwen\node_modules\.bin\qwen.cmd` | `@qwen-code/qwen-code`; [official quickstart](https://qwenlm.github.io/qwen-code-docs/en/users/quickstart/) |
| Kimi Code | 2.3.1 | `C:\Users\7yeer\.kimi-code\bin\kimi.exe` | Official PowerShell installer; [maintained Kimi Code CLI guide](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/guides/getting-started.md) |
| Cline | 3.0.73 | `C:\Users\7yeer\AppData\Roaming\Paddock\agents\cline\node_modules\.bin\cline.cmd` | `cline`; [CLI overview](https://docs.cline.bot/usage/cli-overview) |
| Factory Droid | 0.249.0 | `C:\Users\7yeer\AppData\Roaming\Paddock\agents\droid\node_modules\.bin\droid.cmd` | `droid`; [Droid CLI quickstart](https://docs.factory.com/droid-cli/quickstart) |
| Pi | 1.4.0 | `C:\Users\7yeer\AppData\Roaming\Paddock\agents\pi\node_modules\.bin\pi.cmd` | `@earendil-works/pi-coding-agent`, installed with lifecycle scripts disabled; [quickstart](https://pi.dev/docs/latest/quickstart) |
| Gemini CLI | 0.65.0 | `C:\Users\7yeer\AppData\Roaming\Paddock\agents\gemini\node_modules\.bin\gemini.cmd` | `@google/gemini-cli`; [installation](https://geminicli.com/docs/get-started/installation/) |

The npm CLIs are stored in their separate Paddock-owned `agents/<id>` directories. Native installers use vendor-selected locations. The managed-download inventory records Paddock installer workspaces and exact executable paths; it does not claim shared parent directories or the existing Codex, Claude Code or Kiro installations as downloads owned by Paddock. The previous Kiro workspace record was reconciled to the existing per-user executable without reinstalling Kiro.

## Detection, setup and launch checks

Kiro was already installed in `%LOCALAPPDATA%\Kiro-Cli`; the old detector missed that folder. Paddock now checks the per-user location. Refresh also clears a stale error after a successful detection, while a failed version check remains retryable. The running Paddock process was left untouched. These source changes are not in the installed app; they require a rebuilt, updated Paddock app before users can use them there.

Production `prepareCli` arguments were tested for the 12 providers other than Codex and Claude, in isolated empty homes and workspaces. Each reached its expected login, trust, provider-selection, onboarding or composer gate without submitting a prompt or accepting a choice. Evidence and per-provider outcomes are in `.build/codex-prompt-runs/2026-10-24/6/native-startup-summary.json`. Codex and Claude startup checks were covered by the accepted Prompt 5 verification.

Native MCP checks used a local synthetic server and fake bridge values, not provider accounts:

- OpenCode V1, Cursor, Grok Build and Pi each completed `initialize` and `tools/list` through the production Paddock configuration. All four passed with a real Windows instructions-file path. See `.build/codex-prompt-runs/2026-10-24/6/native-mcp-summary.json`.
- Kiro's `mcp status --name paddock` recognized the generated configuration. This command only lists configuration; it did not connect to the server.
- Gemini's `mcp list` recognized the Paddock entry and showed it disabled until folder trust is granted. No handshake was attempted before trust.
- Other native startup checks reached their expected gates, but they do not establish that an authenticated provider will use every configured tool correctly.

The setup UI was checked in Windows Chromium, desktop WebKit with macOS emulation, Android Chromium with Pixel 7 emulation, and iPhone WebKit with iPhone 13 emulation. Screenshots and `checks.json` are in `.build/agent-installation-verification-2026-10-25/visual/`. Each profile covered first-run setup, the API key hint and a failed install followed by a successful retry. The API icon geometry check confirms it stays inside its sidebar button. These are browser/device emulations, not physical-device tests. Mobile layouts scroll vertically; the API key hint wraps on iPhone without horizontal overflow.

Three launch compatibility fixes are included in `electron/cli-launch.cjs`: Kimi receives its managed MCP entry through `~/.kimi-code/mcp.json`; Gemini merges into `~/.gemini/settings.json`; and OpenCode serializes the Windows instructions path so backslashes remain valid JSON. `tests/cli-launch-compatibility.test.cjs` covers these three contracts (3 passing focused tests).

The bounded installer diagnostics were checked with eight synthetic redaction cases, including JSON/camelCase fields, URL userinfo plus query data, and an oversized token line emitted by a spawned local fixture. All passed; see `.build/codex-prompt-runs/2026-10-24/6/diagnostic-review-final.json`. The OpenCode Windows-path contract and native MCP handshake passed with a synthetic local server; see the final OpenCode entry in `.build/codex-prompt-runs/2026-10-24/6/native-mcp-summary.json`. No real credential value was used in these probes.

The API page's missing-key hint now points to Settings → API. Shared agent instructions direct users to enter or select credentials in Settings → Tools or API, never in chat. Qwen's setup text reflects that its OAuth option ended on 15 April 2026; the current `/auth` provider list must be used.

## User checks still needed

No provider account was signed in, no trust/login choice was accepted, and no model request or purchase was made. To check authenticated functionality, the user must sign in with their own accounts, accept the applicable project trust prompts, choose supported providers, and run a real task in each CLI. OpenCode and Pi need a provider configured; Qwen needs a provider selected through `/auth`; global Kimi accounts use `kimi login --region global`. Account permissions, subscriptions, billing and organization policies can affect results. Help output and reaching a setup gate do not show that providers perform equally.

Final repository checks are recorded below.

This prompt reviewed setup installation, retry state, the API key direction and shared agent instructions. Existing checklist evidence for unchanged flows remains in [agent review navigation](agent-review-navigation-check.md), [integration review](integration-review.md), and [dependency security review](dependency-security-review.md); this is not a new full-app audit. The dependency review still documents the installed Electron dependency-activation gap. This task built the renderer and ran tests but did not install, replace, package or deploy Paddock, so that gap remains.

## Repository checks

| Check | Result |
| --- | --- |
| `npm run build` | Passed. Vite emitted a >500 kB chunk-size warning. |
| `npm test` | 254 passed, 1 skipped (WSL Claude unavailable), 0 failed. |
| `npm run test:desktop` | Passed: startup, workbench, layout and setup smoke suites. Setup smoke checks Qwen's actual selection/hint path without invoking the installer. |
| `node scripts/settings-theme-live-check.cjs` | Passed on PC Chromium, desktop WebKit, Android Chromium and iPhone WebKit. Each profile completed 20 live updates, 39 motion checks and 22 color-isolation checks. Screenshots are under `.build/settings-theme-live-20261024/visual/`. |
| `scripts/agent-setup-visual-check.cjs` | Passed on all 4 browser/device profiles. Retry, API hint, API-icon containment, no renderer errors and no external requests passed. |
