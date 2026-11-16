# Tool discovery

An absent connection does not establish that Paddock lacks an integration. The compact context names every built-in integration. `dock/setup_status` returns an `integrations` catalog with setup readiness, connection state and its Tools location.

`dock_tools({})` returns one short description per enabled integration and Paddock's built-ins. Missing counts trigger a server metadata lookup through the existing connection cache; later calls reuse the cached catalog. Only the summary reaches the agent. A connection failure returns a null count and its reason. Installation options remain in `dock/setup_status`, so a connected custom Upscayl entry appears once in default discovery. Setup notices appear only on explicit connection lookups.

Select a connection to list up to 20 tool names and short descriptions. The response contains `connection`, `total`, `tools` and, when more entries exist, `nextOffset`. Pass that value as `offset` with the same connection/query for the next page. Add `query` to match words in names/descriptions, for example `dock_tools({connection:"rea",query:"inspect android"})`. Request `dock_tools({tool:"rea/inspect_android_package"})` for that tool's exact schema. Connection lookups accept the saved ID/display name or built-in ID/display name, case-insensitively. Explicit lookups retain connection errors and setup notices without installing or enabling anything.

The installation snapshot distinguishes `setup-required`, `ready-to-connect`, `connected`, `disabled`, `unavailable` and `unknown`. A configured connection is not evidence that an analysis provider is ready. Test it and inspect its capabilities before use.

Regression coverage is in `tests/tool-discovery.test.cjs` and `tests/shared.test.cjs`, including lazy discovery, filtered lookup, exact schemas, disabled connections and credential redaction.

Restart Paddock to load main-process changes. Existing consoles are preserved until the user chooses to restart.

## Task candidates

`dock/task_candidates` returns each measured or local account once, compact quota windows, a short `unknown` list, role lists containing account IDs, and the suggested `assignment`. Window percentages represent remaining allowance; `null`, stale status, unlimited and inapplicable windows stay explicit. Readiness, funding and sign-in state remain visible. Model catalog counts replace full catalogs in the overview.

Pass `accountId` for one account's full model metadata, supported efforts, quota windows and diagnostic reason. The desktop task picker retains its existing detailed data. The agent response omits duplicated account arrays, repeated policy/suggestion text and the global list of unrelated project folders. Tool permissions, routing and spending checks stay in the existing task flow.

Pass `refresh:true` to run the existing Usage refresh before reading candidates. This explicitly includes interactive Antigravity and Cursor readers; background timers keep their cached readings. Existing account-switch guards and failure reasons remain in force. Automatic free-allocation assignments are limited to small tasks; explicit task assignments remain available. Broader automatic review suggestions exclude known small-model defaults.

`dock/list_reviews` returns only ID, URL, state and issue count. Use `dock/review_details` for its checklist, report and evidence. `dock/setup_status` returns a compact readiness overview and pending request IDs; pass `detail:true` for full setup configuration and installation details. Default `dock/task_status` includes aggregate usage once; `detail:true` retains phase-level accounting.

Review details place identical viewport page fields in `report.commonPage`; each view's `page` contains its overrides. `detail:true` retains the original full pages. Screenshot references report `available` or `missing`, with a file path only when the stored file exists.
