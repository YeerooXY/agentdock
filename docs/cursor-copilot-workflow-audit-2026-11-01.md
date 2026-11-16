# Cursor and Copilot workflow audit — 1 November 2026

Read-only inspection of the user's existing sessions. No model requests, console restarts, permission changes or website edits were made.

## Session attribution

- Cursor conversation `75a24d26-55eb-4de3-b9ad-54426a587e82` contains the exact `yeeroo-home` handoff and port 5177. Its stored tool calls include website guides and the project proposal.
- Copilot conversation `f523d574-d406-4a85-bd73-70c1844abad5` edited `portfolio-starter` and reported port 5173. Its tool-call arguments contain no `yeeroo-home` references.
- Keep these runs separate when comparing output, usage and duration. No project was created or linked during this audit.

## Autonomous Cursor commands

In an existing Cursor CLI conversation, `/run-everything on` enables automatic execution; `/auto-run on` is an alias. `/run-everything status` checks the setting. Paddock already maps its Unrestricted launch option to `--force`. Explicit deny rules still apply. The observed Cursor process did not have `--force`; that alone does not establish the current interactive setting.

Sources: [Cursor slash commands](https://cursor.com/docs/cli/reference/slash-commands), [Cursor parameters](https://cursor.com/docs/cli/reference/parameters).

## Local AI delivery and use

Both sessions received successful Paddock context responses containing `dock/local_assist` and Strata guidance. Neither session recorded a `dock/local_assist`, `dock/task_candidates` or `dock/start_task` invocation in the inspected histories.

Cursor had already answered the user's question about alternate work methods: it said it built the site itself without routing, and listed local Strata, `opencode:strata`, Paddock workers and reviews as available options. It then asked the user to choose a path for another pass. This is evidence that the capabilities were visible; it does not establish why the model chose direct implementation or that a local endpoint was ready at that time.

The connected Paddock tool catalog exposes no method to send a follow-up into an existing owner console. The running app's debug interface was unavailable and Windows accessibility exposed no targetable console controls. No message was injected or duplicate conversation launched. Findings above come from saved tool calls and Cursor's existing response.

The next workflow change should make an already-authorized local role concrete for suitable substantive tasks: for example, one screen composition or one bounded component that replaces cloud work. Keep small repairs direct, integrate useful output once, and record actual use or a concrete availability/quality reason for skipping. Repeating capability lists does not make routing happen.

## Copilot usage

The existing account reader succeeded through native `account.getQuota`, without a model prompt. At 16:18:52 UTC it reported Chat 97.5% remaining and Completions 100% remaining. The card is hidden in the saved preferences; restore through Usage → Add subscription → GitHub Copilot → Refresh. The earlier pool/reset fixes require the updated app to be running.

Account allowance and task token usage are different measurements. The current Paddock message-usage implementation imports Codex/Claude records and app API requests; it does not yet import Copilot task token records. This audit did not implement that importer.

Copilot CLI 1.0.105 persisted `session.usage_record` events with input, output and cache-read counts, plus `session.usage_checkpoint` records. For the authorized portfolio build prompt at 15:59:14.581 UTC, the inspected main-session records contain:

| Measurement | Count |
| --- | ---: |
| Model calls | 40 |
| Input tokens | 5,994,671 |
| Cached input tokens, included above | 5,811,761 |
| Uncached input tokens | 182,910 |
| Output tokens | 61,339 |

These are main-session records for the `portfolio-starter` build, not the Cursor site or an invoice. The model recorded for those calls was `gpt-6-luna`. Do not price all input as uncached or infer remaining subscription allowance from these counters.

An automatic importer needs exact provider session identity, record deduplication, user-turn boundaries, incomplete-record handling and separate account quota. Native `--session-id` can establish identity for future launches. Never associate an old console with the latest same-folder conversation by guesswork. GitHub also documents `session.usage.getMetrics` for accumulated session totals and ephemeral `assistant.usage` events for live integrations; support must be checked against the installed CLI. Persist billing units separately from dollars.

Source: [GitHub usage and billing metrics](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/usage-and-billing).

## Verification scope

Checked native Copilot help, the existing account reader, exact session metadata and tool-call records, Cursor's stored handoff and response, Paddock's permission mapping and usage import code, and official provider documentation. No application source changed; no build or visual check was required.
