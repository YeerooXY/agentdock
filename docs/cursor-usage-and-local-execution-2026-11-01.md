# Cursor usage and local execution — 1 November 2026

Cursor now has a registered background allowance reader. It opens an owned CLI in Ask mode in the usage workspace, types `/usage`, and submits only after the native command picker confirms that command. It never submits a model prompt. Login failures, unsupported plans, missing commands and deadlines fail without inventing a balance. Credentials remain with Cursor; the reader does not read login files or export credentials. The owned console is closed after the reading, including ConPTY handles on Windows.

Live CLI 2026.10.22-27dcf5f reading: Free plan, Included 19% used, Auto 38% used, API 0% used, reset label December 1. Percentages are rounded by Cursor. Paddock preserves the label without inventing a reset year or time. Disabled on-demand spending is omitted from allowance windows. Restart Paddock when convenient to load the reader, then use Usage → Add subscription → Cursor if hidden and Refresh. Existing chats are not restarted by this change.

## Local execution

- Startup guidance assigns suitable bounded work locally before cloud drafting. The lead frames the task, integrates useful output and performs a necessary focused review. Tiny edits and deterministic checks stay direct.
- Small and medium task suggestions now prefer a ready Strata candidate even when cloud accounts have fresh headroom. Large planning tasks and explicit custom pools remain configured by the user.
- A read-only model probe runs every 30 seconds; readiness expires after 60 seconds or an endpoint change. It makes no inference request and never starts or downloads a model.
- Local implementation defaults to one checked round. Explicit round overrides are preserved. No automatic provider switch follows a failed local task.
- Usage analytics show Cloud API tokens and Local tokens separately. This API ledger does not cover all native CLI conversations. Existing task status/reports provide separate worker totals and explicitly mark coordinating-chat coverage as incomplete.

At the user's request, started the existing `Paddock-125B-256k` preset on localhost port 8080. The plan required no downloads. Strata remains running. Two useful components were drafted by `qwen3.8-flash-next-iq2_xs` and integrated after targeted repairs:

| Component | Local input | Local output | Generation time |
| --- | ---: | ---: | ---: |
| Usage aggregation | 311 | 377 | 3.030 s |
| Equivalent-run comparison | 341 | 925 | 4.745 s |

Aggregation needed an attempt-counter increment and an early return for invalid usage. Comparison needed corrections to field validation, cache uncertainty, empty keys and the export interface. No model retry or second reviewer was used. The earlier offline attempt is retained as unknown/unavailable in the local API ledger; it made no inference request. Runtime receipts are in `artifacts/cursor-usage/local-work.json`.

## Measuring improvement

Use `node scripts/compare-workflow-usage.cjs baseline.json candidate.json`. Each record supplies:

```json
{
  "benchmarkKey": "same-brief-source-revision-and-acceptance-checks",
  "accepted": true,
  "cloudComplete": true,
  "wallMs": 12345,
  "entries": [
    { "status": "completed", "usage": { "input": 100, "output": 20, "cached": 50 } },
    { "local": true, "status": "completed", "usage": { "input": 300, "output": 100, "cached": 0 } }
  ]
}
```

This is a schema example, not measured savings. Include lead, worker, reviewer, setup and failed-attempt model usage in entries; cached input is already part of input. Include elapsed wall time, not summed parallel-worker durations. `cloudComplete` is an explicit capture assertion, not inferred from missing records. Use the same benchmark key only for equivalent briefs and acceptance criteria. The comparator refuses savings claims when acceptance, coverage, task identity or required counters are missing; negative reductions remain visible. It never infers dollar savings from token totals or local output.

The live local calls establish useful output and generation time. There is no matched cloud-only run with complete coordinating usage for these components, so net cloud savings remain unproven. The next website comparison must retain the same brief, assets and acceptance checks and count the entire lead/delegation/review flow.

Validation records: `artifacts/cursor-usage/`, four emulated browser profiles under `artifacts/usage-recovery/`. Physical Mac, Android and iPhone checks remain outstanding.

Verified build; Windows unit suite (756 passed, one skipped); Linux unit suite and headless desktop checks; rendered Cursor allowance and separate local/cloud totals in PC Chromium, Mac WebKit, Android Chrome profile and iPhone WebKit profile. All four screenshot sets were inspected. Native Cursor reader completed and exited with owned-process cleanup; live Strata drafts were exercised outside automated tests. Automated tests made no model requests.
