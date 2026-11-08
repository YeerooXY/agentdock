---
name: force-delegation
description: Substantive implementation must go to a bounded real worker through Paddock; tiny and check-only work stays direct.
---

# Force delegation

Opt-in workflow instruction for the lead console. It applies only when the owner turned it on. It does not intercept native shell commands; it binds the lead's own choices.

If you are an assigned worker, complete your assignment directly and never delegate. This skill applies only to the coordinating console. When enabled, it overrides the shared direct-work allowance for substantive implementation.

## Scope

1. Substantive implementation (multi-file changes or non-trivial logic) goes to a bounded worker started with dock/start_task.
2. Stay direct for tiny edits, check-only runs, and read-only or deterministic operations.
3. Owner choices, manual skill settings, Knowledge Off, model choices, permissions and spending limits stay in force. Loading this skill grants no spending authority. It does not authorize metered routes, paid fallbacks or extra model calls.

## Routing

1. Call dock/task_candidates once for the task. Reuse those readings for every subtask. Do not repeat discovery per subtask.
2. Pick the smallest sufficient discovered builder: a tier-one model at medium effort where the provider and the discovered model support it. Start one bounded worker for an eligible free or already-included account. Give each worker a distinct deliverable and file ownership. Use a compact brief.
3. Use medium reasoning for implementation from a clear plan and for routine review. High may be warranted for the first substantive plan; name the reason. Later escalation to a stronger model or high effort also needs a concrete blocker or failed check and a stated reason. Do not escalate by default.
4. A local model that is offline or not ready is skipped using the existing readings. Do not call it again to re-check.
5. If no eligible route exists, or a call is denied or fails, stop and report a blocker that names the cause: exhausted, stale or unknown quota, or an offline local model.
6. Do not fall back to a paid or metered route, do not implement silently in the lead, and do not retry automatically. Continue only when the owner says so.
7. No nested workers, no manager loops and no review loops. Use one review at most.

## Skills for workers

- The coordinator reads the planning skill (pstack, when installed, enabled and available) and applies it to the plan before dispatch. Planner workers receive pstack through their own brief.
- Builder workers use ponytail, the builder's own skill, when it is installed, enabled and available. Do not pass the planner's pstack to builders.
- Review uses thermo-nuclear-code-quality-review when it is installed, enabled and available.
- Skill text in a brief is verified and included directly. Workers use it directly and do not reopen installed pack paths or retry denied reads. If a needed reference is missing, the coordinator supplies it as bounded verified text.
- Name the applicable skills in each worker brief. If one is missing, say so in the brief and continue without it.
- Never put force-delegation in a worker brief, and never ask a worker to delegate.

## Report

Name the worker jobs started, the account and model used for each, the effort used, any escalation and its reason, and any blocker. If the lead did the work directly, give the reason it was tiny or check-only.
