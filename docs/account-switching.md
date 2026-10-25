# Subscription account profiles

Research checked 25 October 2026. This page separates provider documentation from Paddock's implementation choices and open questions.

## Provider behavior

### Codex CLI

OpenAI documents `CODEX_HOME` as the root for Codex configuration, credentials, logs, sessions, skills, and package metadata. It defaults to `~/.codex`, and a custom directory must already exist. A named Paddock profile gets a separate directory, so file-backed `auth.json` can be created by that profile's own `codex login`. Codex can instead use an OS credential store or ephemeral credentials; administrators can enforce a login method, workspace, credential store, or `chatgpt_base_url`. A different directory does not override those choices. Paddock never reads, copies, logs, or sends credential files or values. Profile labels identify the user's selection; a successful login process exit does not verify the signed-in account.

`codex resume <SESSION_ID>` accepts a session UUID or name. The CLI reference documents `--last` as current-working-directory scoped unless `--all` is used. Official troubleshooting identifies `$CODEX_HOME/sessions` as the transcript directory. The public docs do not promise that copying a transcript into another `CODEX_HOME` makes cross-profile resume supported. Paddock therefore keeps each profile's history and SQLite state isolated, passes an explicit profile SQLite location, disables Codex's shared daemon for profile launches, and transfers only the selected transcript after validating its metadata, dependencies, and path. Conflicting or reference-based histories are refused. This transfer remains a Paddock implementation choice, not a provider-supported account-history migration.

The installed Codex 0.163.0 exposes the current thread model through its local thread metadata read. Paddock uses that model when it is known and refuses a switch if the model is unavailable instead of forcing an older launch-time choice. Paddock verifies the full conversation UUID with Codex's local `/status` command on an empty staged composer. It sends no conversation prompt. An isolated native production-path handover passed on 25 October 2026 with a synthetic local provider, a changed in-CLI model, and an exact multiline Unicode draft; it made no HTTP or model request. These are observations from the installed CLI and Paddock's implementation, not a documented account-switch API.

### Claude Code

Anthropic documents `CLAUDE_CONFIG_DIR` as an override for settings, credentials, session history, and plugins, and says it is useful for running multiple accounts side by side. On Windows, credentials are kept under the selected directory. `claude auth login` starts its supported login flow. `claude --resume <ID>` resumes by ID or name; current documentation says explicit-ID discovery searches project histories, including across projects. `CLAUDE_CODE_PROJECT_DIR_NAME` can stabilize a project's history directory when paired with `CLAUDE_CONFIG_DIR`, but requires v2.1.234 or later.

These docs establish separate configuration roots. They do not approve moving a transcript between personal subscriptions or rotating subscription usage. Paddock keeps each profile's state separate and, when resuming across profiles, copies only the selected validated transcript. Installed Claude Code 2.1.310 reports the resumed provider session ID and model through its status line before the first turn; Paddock accepts only events matching the staged session, launch, and account IDs. Provider support for transcript transfer remains unconfirmed. Claude Code installed in WSL retains its configured editor but does not expose Paddock's account-switch action because the Windows-to-WSL draft bridge is not verified.

### Account terms and limits

Update checked 25 October 2026: Anthropic's [Claude Agent SDK plan guidance](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan), updated 7 October, explicitly permits Claude Agent SDK, `claude -p` and third-party app usage within subscription limits. Paddock's idle Claude usage reader uses the native CLI control protocol without submitting a prompt. This permission does not establish permission to evade rate limits by rotating accounts. The Usage notice now states the provider-limit requirement without presenting automation as a blanket prohibition.

OpenAI's account-switching article describes two signed-in ChatGPT accounts on ChatGPT web, with separate conversations, history, billing, and workspaces. It says the switcher does not transfer conversations and is not available in Codex desktop or native ChatGPT mobile apps. It does not document Paddock-style Codex CLI profile switching or say that owning multiple personal accounts itself is prohibited.

OpenAI's Europe Terms of Use, updated 16 January 2026, prohibit sharing account credentials and circumventing rate limits or restrictions. They do not state a blanket prohibition on a person owning multiple accounts. The terms do mean users must not use profile switching to evade a usage limit or other restriction.

Anthropic's Consumer Terms of Service, effective 8 October 2025, restrict access through automated or non-human means except through an Anthropic API key or where Anthropic explicitly permits it, and prohibit bypassing protective measures. The terms do not expressly settle whether a person may hold multiple Claude subscriptions or whether a Paddock account switch is permitted. Technical support for separate config directories is not permission for quota-driven rotation.

**Account notice:** OpenAI terms prohibit circumventing rate limits or restrictions. Anthropic terms restrict automated access unless an applicable exception or permission covers it. Provider documentation does not confirm cross-profile conversation transfer or subscription-usage rotation. Review the terms that apply to each account.

## Paddock behavior

- Accounts have a provider, a user-entered label, and a generated configuration directory under Paddock data. `Sign in` opens the provider's own login command with that directory selected.
- A switch stages a replacement CLI in the same console, folder, slot, permission mode, and conversation. Paddock checks the target identity and exact restored draft before ending the old CLI. It does not send or replay the draft.
- Any eligible account has a `Set up <account>` action that opens its normal CLI in the selected console's folder and permission mode. Codex profiles may need to trust that project folder once before resuming it. If a staged Codex CLI shows `Folder access` / `Trust this folder?`, Paddock keeps the original console and draft open and offers that setup action. The user handles the trust or first-run prompt; Paddock does not accept it or bypass it. Setup consoles are temporary, receive no Paddock hooks or draft tokens, and are not saved as agent sessions.
- The desktop and phone action stays pinned to the original console ID, launch ID, account ID, and phone console key. A missing login, busy task, changed target, failed resume, or unverified draft leaves the original process running.
- Drafts are captured from the CLI's external editor bridge, not reconstructed from terminal keystrokes. Paddock checks twice and restores without submitting. Attachments and control-bearing drafts are refused. Claude's optional prior-response comment block is refused with an instruction to turn off “Show last response in external editor”. A native Claude 2.1.310 probe verified a synthetic-provider handover with exact multiline Unicode and trailing whitespace, without an HTTP or model request.
- Codex capture uses a random suffix in the native editor file, then removes that suffix with backspaces and confirms the exact composer text. The suffix prevents Codex 0.163.0's successful editor path from trimming whitespace at the end of a draft. Isolated native helper and production-path probes verified exact multiline Unicode and trailing-whitespace capture/restoration, including an in-CLI model change, without a model request. A failed check keeps the old console alive.
- Codex usage readers use the same profile directory and SQLite location as their console. Claude usage and status events are tied to the launching account and launch ID. Stale or unavailable readings remain unknown.
- Usage and the HUD show the selected account's own limits. The default switch offer threshold is 90%. Automatic switching starts off and requires explicit opt-in plus fresh, complete usage for every source and target window and an idle console. No percentages are combined across accounts.
- Named profiles discard inherited direct provider token and endpoint environment overrides that could silently redirect the subscription CLI. Provider config and administrator-enforced authentication settings remain under provider control. Codex's OS-keyring/ephemeral auth behavior and managed workspace policy still need confirmation in the user's environment.

Paddock's local Claude CLI is supported. The WSL Claude path displays a disabled switch action with its limitation because its draft file and helper cross Windows/WSL boundaries that have not been verified. Normal WSL editor settings remain untouched.

## Source links

All links below were checked on 25 October 2026.

- OpenAI, [Codex environment variables](https://learn.chatgpt.com/docs/config-file/environment-variables) — `CODEX_HOME` and `CODEX_SQLITE_HOME`.
- OpenAI, [Codex authentication](https://learn.chatgpt.com/docs/auth) — file, keyring, automatic, and ephemeral credential storage; managed login restrictions.
- OpenAI, [Codex CLI reference](https://learn.chatgpt.com/docs/cli/reference) — `codex resume`, session IDs, working-directory behavior, and `--no-daemon`.
- OpenAI, [Codex troubleshooting](https://learn.chatgpt.com/docs/reference/troubleshooting) — session transcript location under `$CODEX_HOME/sessions`.
- OpenAI, [Codex CLI customization](https://learn.chatgpt.com/docs/cli-customization) — Ctrl+G opens the configured `VISUAL` or `EDITOR`; saving and closing returns prompt text to the composer without submitting it.
- OpenAI, [Using multiple accounts with account switching](https://help.openai.com/en/articles/20001068-using-multiple-accounts-with-account-switching) — ChatGPT web account separation and no history transfer.
- OpenAI, [Europe Terms of Use](https://openai.com/policies/eu-terms-of-use/) — updated 16 January 2026; credential sharing and rate-limit restrictions.
- Anthropic, [Claude Code environment variables](https://code.claude.com/docs/en/env-vars) — `CLAUDE_CONFIG_DIR` and `CLAUDE_CODE_PROJECT_DIR_NAME`.
- Anthropic, [Claude Code authentication](https://code.claude.com/docs/en/authentication) — credential location scoped to `CLAUDE_CONFIG_DIR`.
- Anthropic, [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference) — `claude auth login` and resume options.
- Anthropic, [Claude Code interactive mode](https://code.claude.com/docs/en/interactive-mode) — Ctrl+G external editing, optional prior-response comment context, and cleared-draft behavior.
- Anthropic, [Consumer Terms of Service](https://www.anthropic.com/legal/consumer-terms) — effective 8 October 2025; automation and protective-measure restrictions.

## Verification and limits

Provider documentation establishes directory selection and native login/resume commands. Paddock's cross-profile transcript transfer, automatic usage prompts, and account switching are not provider-confirmed features. Paddock does not inspect or copy credential files, infer an account identity from login output, or treat unknown usage as zero. Fake-CLI tests use isolated temporary profiles and write only allowlisted fixture fields. The user must sign in to two separate profiles and confirm the account and conversation shown by each CLI before relying on a real switch. If a profile asks to trust the review folder, open its `Set up <account>` console, review and accept the provider prompt manually, exit that console, and retry. Do this in a separate review console; do not use an active conversation for the check.
