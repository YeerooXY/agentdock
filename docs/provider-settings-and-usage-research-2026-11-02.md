# Provider settings and usage research, 2 November 2026

Two read-only research passes (Claude Opus, low effort). No project files edited and no prompts sent to any CLI. Rows marked "unverified" come from vendor docs or recall and need a `--help` or doc check before an adapter relies on them.

## Model and effort

Paddock today: `electron/cli-catalog.cjs` records only `model: '--model'` for 11 providers. Claude and Codex switch on idle consoles by resuming the same conversation with new flags (`electron/sessions.cjs:236-270`); Antigravity resumes with `--conversation <id>` (line 281). `providerSessionId` is kept only for codex, claude and antigravity (line 143). `electron/model-selection.cjs` normalizes only Claude's model list.

| Provider | Model / effort flags | Resume | Model list | Recommended switch | Checked |
|---|---|---|---|---|---|
| claude | `--model`, `--effort` | `--resume <id>` | stream-json `initialize` | resume (done) | yes |
| codex | `-m`, `-c model_reasoning_effort=` | `codex resume <id>` | app-server `model/list` | resume (done) | yes |
| kiro | `chat --model`, `--effort` | `--resume-id <id>` | `chat --list-models` | resume | `--help` |
| cursor | `--model 'id[effort=high]'` | `--resume [chatId]` | `--list-models` | resume | `--help` |
| grok | `-m`, `--reasoning-effort` | `-r <id>` | none found | resume, model only until efforts are listed | `--help` |
| gemini | `-m`, no effort flag | `-r <index>`; `--session-id` at launch | none | resume, only with `--session-id` captured at launch | `--help` |
| pi | `--model`, `--thinking` | `--session` | `--list-models` | resume | unverified |
| opencode | `-m provider/model` | `-s <id>` | `opencode models` | resume | unverified |
| copilot | `--model` | `--resume [id]` | none | resume | unverified |
| kimi | `-m`, `--thinking` | `-S <id>` | none | resume | unverified |
| qwen | `-m` | `--resume` (recent builds) | none | relaunch until resume is confirmed | unverified |
| droid | `-m`, `-r` on exec | `--resume` | none | relaunch until resume is confirmed | unverified |
| cline | `-m` or `cline config` | task id (unverified) | none | none | unverified |
| antigravity | none known | `--conversation <id>` | none | none | partly |

Never type `/model` or drive menus. On-screen model text is display only; Paddock's launch flags and provider metadata are the source of truth, shown as "selected" until the provider confirms.

### Common settings adapter

```js
{
  provider: 'kiro',
  switch: 'resume' | 'relaunch' | 'none',
  reason: 'shown when switch is none',
  listModels: async ctx => [{ id, label, efforts: [], defaultEffort, isDefault }],
  modelsSource: 'native-api' | 'cli-list' | 'catalog' | 'none',
  current: { model, effort, source: 'launch-flag' | 'provider-metadata' | 'unknown', at },
  launchArgs({ model, effort }),
  resumeArgs(sessionId),
  captureSessionId: 'flag' | 'log' | 'none',
  confirmIdentity: async (session, id) => boolean,
}
```

### Phone

One Model and effort sheet for all providers, driven by `switch` and `modelsSource`. Pending choices and one Apply. Effort chips come from the chosen model and hide when it has none. Warnings by method: resume reloads the chat and may use extra tokens; relaunch starts a new conversation and needs a second confirmation; none makes the sheet read-only with where to change the model. No free-text model entry. Composer text stays.

Risks: native draft loss where no draft bridge exists (block or warn), attaching the wrong chat when resuming by index or "latest" (use ids and confirm identity), token cost of resending long conversations, listed models the account cannot use (keep the original console on failure), flag drift between CLI versions (check `--help` at discovery).

Steps: adapter interface and Claude/Codex refactor (`electron/provider-settings.cjs`, `model-selection.cjs`); generalize `sessions.cjs` switching and add relaunch; session-id capture per provider (`cli-launch.cjs`); model listing for kiro, cursor, pi, opencode with mocked tests; catalog fields; phone transport (`mobile.cjs`, `dock_client.dart`); phone sheet states (`live_agent_controls.dart`); verify unverified rows one provider at a time.

## Subscription usage

| Provider | Readable | Method | Per account | In Paddock |
|---|---|---|---|---|
| codex | 5-hour and weekly used %, resets, plan | app-server `account/rateLimits/read` | yes | yes |
| claude | plan, 5-hour, weekly, per-model weekly windows | stream-json `get_usage` (undocumented, no prompt) | yes | yes |
| copilot | per quota remaining %, unlimited flag, reset | `copilot --headless --stdio` `account.getQuota` (undocumented) | no, global env | yes |
| cursor | plan, rounded % per group, reset | screen read of `/usage` | no | yes (`cursor-usage.cjs`) |
| antigravity | % left per model group, 5-hour and weekly | screen read of `/usage` | no | yes (`antigravity-usage.cjs`) |
| kiro | credits used and total, plan, reset, bonus grants | `kiro chat --no-interactive /usage` | no | yes |
| kimi | 5-hour, weekly, monthly ratios | local `kimi web` route | no | yes |
| opencode | Go plan 5-hour, weekly, monthly %, local stats | undocumented web route plus CLI | partly | yes |
| pi | OpenRouter key limit, usage, credits | documented OpenRouter API | yes | yes (`pi-usage.cjs`) |
| gemini | per-model daily quota (inferred) | `/stats model`; undocumented quota route | would be | no |
| droid | plan token allowance | `/limits` | unknown | no |
| grok, cline, qwen | no known quota source | dashboard or none | n/a | no |
| strata | local, no quota | n/a | n/a | show as Local |

### Gaps, by value

1. Six readers (copilot, cursor, antigravity, kiro, kimi, opencode) use the global environment, so an extra account would show the default account's numbers. Pass the per-account environment, or report "not isolated" until verified.
2. Usage shows one card per provider with an account dropdown (`src/app.js:287,540`); the decision is one row per account.
3. Auto-switch leftovers (`electron/main.cjs:319,327,340`, `mobile/lib/settings_page.dart:295`); Phase 0 removes them.
4. Staleness is computed separately on desktop and phone; the phone treats a missing time as fresh. Compute once on the PC.
5. Gemini reader, starting with an explicit "Unknown" row.
6. Droid `/limits` reader if it runs without inference.
7. Explicit "No quota source" rows for grok, cline, qwen.
8. Strata shown as Local.
9. Codex reader moved behind the same interface.

### Normalized reading

```
UsageReading { accountId, provider, accountLabel|null, plan|null, source,
  method: native-rpc|native-command|screen|documented-api|undocumented-api|local,
  observedAt, precision: exact|rounded, windows: UsageWindow[], credits? }
UsageWindow { key, label, scope: account|model-group, modelGroup|null, minutes|null,
  usedPercent|null, unlimited, used?, total?, unit?, resetsAt|null, resetLabel|null }
UsageCheck { accountId, provider, status: current|refreshing|stale|sign-in|not-installed|
  timeout|unavailable|unsupported|no-quota|not-isolated, checkedAt, observedAt|null, message, lastReading }
```

Rules: stale when the reading is older than 5 minutes, a window's reset has passed, or the last check failed while a cached reading exists; cached readings stay visible with their age. Null percent shows "Unknown", never 0% or 100%. Never sum across accounts or model groups, never infer from tokens. Undocumented sources fail to "Unknown".

### Display: one row per account

Desktop: rows grouped under a provider header (mark, name, account count). Groups ordered current, stale, error or unknown, no quota. Rows: accounts in use first, then default, then by label. Each row: label and plan, one bar per window (tightest first, highlighted; more than three behind "More limits"), credits line, status text ("Checked 2 min ago", "Cached, observed 40 min ago", "Sign in", "No quota source"), Refresh and Hide actions. Stale rows desaturated with a dashed outline; unknown bars empty with "Unknown"; exhausted rows show "Allowance used" and the reset; Cursor rows say "Rounded". Empty states for no accounts and all hidden. Focus moves to the next row when one is hidden.

Phone: same order, provider header plus one card per account, tightest window as a full-width bar and the rest behind an expand tile, server-computed status, 48 dp targets, pull to refresh.

Steps: types and staleness (`subscription-usage.cjs`); per-account reader isolation with mocked tests; derive capabilities from the reader map; snapshot emits sorted `accounts[]`; desktop rows (`src/app.js` quotaCard and renderUsage, CSS); phone rows (`account_usage.dart`, `settings_page.dart`); new readers one at a time with fixtures; visual checks of current, stale, unknown, error and empty states on desktop and phone.
