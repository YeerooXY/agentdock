# Cross-agent reviews

An agent can ask another of your subscriptions to review its changes. It is off by default. Turn it on in **Usage → Cross-agent reviews**.

## How a review runs

1. The agent calls `dock/delegate_review` with a short focus. It can list files to narrow a large change.
2. Paddock builds the diff itself from Git (uncommitted changes against `HEAD`, or a base the agent names). Credential and generated files are left out. New files are listed for the reviewer to read.
3. Paddock picks the reviewer:
   - only Claude Code, Codex and Kiro accounts you allowed, installed and signed in (Kiro uses its own sign-in);
   - most measured usage left, preferring a different vendor from the caller;
   - an account resetting within 12 hours with room left gets a small boost;
   - accounts at 90% or more of a limit are skipped;
   - usage older than 30 minutes counts as unknown, never as free.
4. Paddock runs that vendor's official CLI read-only, with your own sign-in, and sends the brief on standard input (no brief file):
   - Claude Code: `claude -p` with only Read, Grep and Glob, no MCP servers, no saved session.
   - Codex: `codex exec --sandbox read-only --ephemeral`. On Windows Paddock adds `-c windows.sandbox=unelevated`; Codex's default Windows sandbox rejects every command, including reads.
   - Kiro: `kiro-cli chat --no-interactive --trust-tools=fs_read`. Kiro writes notes before its answer, so Paddock keeps only the last `VERDICT:` block.
   The reviewer gets no Paddock tools, so it cannot start reviews of its own.
5. The agent reads the answer with `dock/delegation_status` (it can wait up to 45 seconds per call). The answer is a verdict and at most 12 findings as `path:line — severity — problem — fix`, capped at 6,000 characters. The full review is saved in Results.

## Limits

- One review per console at a time, two in total, 20 an hour, 10 minutes each.
- Reviews can be stopped from the Usage page.
- The changed code is sent to the reviewer's vendor.
- Paddock never reads, copies or forwards sign-in tokens. Each vendor's terms still apply to your own use.

## Not in this version

Delegating implementation work (planned next, in a separate worktree), other reviewer CLIs such as Gemini, and choosing a reviewer model per task in the app (the `delegationModels` setting exists but has no control yet).
