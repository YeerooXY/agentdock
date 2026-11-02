# Provider effort dispatch

Planner, implementation and review assignments accept an optional effort setting. An omitted setting retains the adapter's existing default. The task record distinguishes the requested value, dispatch mechanism and an observed effective value when the provider exposes one.

| Provider | Dispatch |
|---|---|
| Codex | `model_reasoning_effort` config |
| Claude | `--effort` |
| OpenCode | `--variant` |
| GitHub Copilot | `--reasoning-effort` |
| Grok | `--reasoning-effort` |
| Pi | SDK `thinkingLevel` |

Provider-level choices describe supported dispatch values, not proof that every listed model or account supports each level. Discovered model-specific effort lists constrain validation when available. Unsupported provider overrides fail before launch. Kiro currently retains its native default and rejects an explicit override.

Pi reports the SDK session's effective thinking level. If it differs from an explicitly requested level, the worker stops before inference. Omitting Pi effort retains the existing `off` default. Other adapters record what was sent and leave provider-effective effort unreported unless there is evidence.

Validation: production build, full Windows unit suite and Linux unit/headless desktop suite passed. Targeted delegation/schema checks passed after standalone-review effort support was added. A mocked SDK test verifies downgrade rejection before inference and preservation of Pi's omitted-effort default; no paid requests are used by tests.

Live benchmark observations: a local OpenCode task accepted `medium` through `--variant`; a Pi task received `medium` through the SDK but later failed after delivering usable files. This does not establish successful completion or model reasoning equivalence. Native Claude and Codex benchmark processes receive their specified CLI effort values. Their effective internal reasoning budgets are not observable here.

Pi budget exhaustion now emits a structured worker-limit event with a fixed diagnostic. Task errors no longer infer Pi authentication failures from words in generated output. This preserves failed-task accounting without instructing the user to sign in on unconfirmed evidence. Validation after this correction: build passed, Windows unit suite 840 passed/1 skipped, Linux unit/headless desktop checks passed, and 103 targeted task/Pi checks passed.
