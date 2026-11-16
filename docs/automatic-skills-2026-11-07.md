# Automatic skill delivery

## Startup ordering fix

The missed migration was a symptom of a startup-order bug. Main constructed
SkillPacks and ran its adapter update before assigning `settings`. The preference
getter threw, its fallback selected defaults, and the updater rewrote the three
engineering adapters as Manual. It also cached that default state. Saved settings
loaded afterward, so fresh reads and the cached agent context disagreed. Another
offline repair or restart repeated the same mistake.

Pstack's Attack the Premise changed the investigation from another migration to
an actual startup reproduction. The new headless Electron test failed with
`Cached skill policy must match running settings`, `false !== true`. A bounded
Sonnet explanation/plan check using pstack and Ponytail confirmed the small fix.
The existing initialization/update block now runs after `initialSettings`. No new
policy state or setting was added. A focused North Mini free-model review found
no concrete defects; it was a static review, not runtime verification.

`scripts/skill-policy-smoke.cjs` now exercises the real application startup,
four mode switches and relaunch, comparing settings, cached cards, native
frontmatter, shared instructions and fresh guide reads at each step. It is part
of `npm run test:desktop`. The original startup assertion now passes. Forty-six
focused Node checks passed. The full Docker suite passed 1,364 Node tests with
seven platform skips and all seven desktop smoke suites. Full results are in
`.build/automatic-skills/consistency-linux.log`.

The live profile's 21 engineering copies were repaired against its saved
Automatic choices; the other 21 copies were already current. A real worker
dispatch refreshed the running snapshot through the normal guidance path.
Refreshed `dock_context` now lists all five Automatic skills with clean paths;
live guide reads return the corresponding Automatic versions. Project
documentation stays Manual. No further restart was performed or scheduled.
The startup-order correction takes effect on the next normal launch.

The user flow is unchanged: install the desired skill once, then use **Use
automatically** on its Tools card. Off means Manual. A mode switch already
refreshes adapters, saves the preference and refreshes shared instructions.
There is no separate Update action required after changing mode. Native skill
discovery may still require a new agent session. Existing modified copies remain
protected and produce explicit status messages.

## Installed-copy migration correction

The first restart loaded the new backend but left every profile adapter at its
old rendered version. This blocked guide reads and automatic delivery. The
correction upgrades unchanged managed copies at normal startup, using the existing
promotion/rollback service. It downloads nothing, creates no new installs and
preserves manual preferences, modified copies and unrelated folders. Safe mode
and startup preflight skip real-profile migration.

All 42 current profile copies were migrated successfully. Live `dock/skill_guide`
reads succeeded for all six packs. The owner then authorized a further one-shot
restart. Automatic preferences for pstack, Ponytail and Thermo-Nuclear were saved
and all managed copies refreshed with no failures. Project-documentation remains
manual. The new process must load these preferences before live automatic
delivery is claimed; its restart health is recorded separately.

The reader now distinguishes outdated, modified, conflicting and missing copies.
Build, 49 focused checks, the full Linux suite (1,364 passed, seven skipped) and
all six headless desktop smoke suites passed. No model worker or paid request
was needed for this deterministic correction. Evidence:
`.build/automatic-skills/installed-migration.json`, `migration-tests.log`,
`migration-build.log` and `migration-linux.log`.

## Initial implementation

Global skill preferences and Tools controls are implemented in the working tree.
The running Paddock process has not loaded these changes. Existing profile
preferences and native skill installs have not been changed by the isolated
checks. Load the new application before applying profile preferences.

See [the skill guide](optional-engineering-skills.md) for behavior and limits.

## Reviews and implementation

Opus, Astra and Gemini 4 Argon reviewed the design. Their corrections led to one
central policy, role filtering, bounded inline instructions for restricted
workers, preserved modified copies, repaired upstream references and explicit
partial installation results. A focused Sonnet implementation review identified
failure-state, diagnostic and keyboard-focus issues. Regression checks cover the
corrected behavior. Local inference was offline; one eligible free Pi worker
produced useful code before hitting its response limit. Its output was retained
and corrected, without an automatic model retry.

The policy is in `electron/skill-policy.cjs`; SkillPacks owns installation and
reading. SharedHub supplies lead instructions, TaskGuidance supplies worker
instructions, and Workbench exposes the bounded read-only guide tool. Settings
and Tools call the same service. No provider-specific policy or project name is
required. Knowledge-maintenance workers receive no general engineering skills.

## Verification

- Initial Windows full suite: 1,363 passed, two platform skips, no failures.
- Final Docker build and full suite: 1,362 passed, seven platform skips, no failures.
- All six Docker desktop smoke suites passed. The new checks exercise installation,
  saved automatic preferences, repeated Space toggles, Tab, Shift+Tab, Enter and
  focus restoration. No visible verification windows were opened.
- After the final install-record failure correction, 45 focused checks passed.
- Mocked transport checks exercise every registered CLI and all API protocols.
  No paid model request occurs in these tests.
- Live Codex Sol and Claude Haiku probes received actual generated builder
  guidance in isolated files. Both identified Ponytail and passed the supplied
  count-parser checks. This exercised generated instructions, not a newly
  restarted application's automatic dispatch. Haiku added an unnecessary
  leading-zero restriction; a host edge probe recorded it. These trials establish
  observed instruction use, not equivalent code quality or guaranteed compliance.

Evidence and individual review notes are in `.build/automatic-skills/`. They
remain local rather than adding Results cards. `usage-metadata.json` records
routes, funding classifications, durations and native usage, including the failed
free attempt. Cached input is part of input, not an additional token total.
Coordinating chat inference is recorded separately in `lead-usage.json`, through
its stated checkpoint, with the combined counters in `usage-summary.json`.
Post-checkpoint work remains excluded; there is no savings claim.
StudentAnti's funding and quota remain unknown/stale in Paddock's data;
there was no paid fallback.

## Documentation obligations

Proven empty changes can now settle one queue operation without a model call,
before maintenance admission. Missing, filtered or truncated change lists remain
unknown. Queue settlement checks payload, state and revision and retains receipts.

Robonslaught's three old operations remain pending. Their task reports explicitly
omitted three, one and six private/generated files, so their empty path arrays do
not prove no change. No queue reset or fabricated semantic approval was applied.
Astra specified a separate current-map publication reconciliation: bind all
affected active records and current versions to source-backed publication,
preserve historical/protected records and any residual unknown obligations, and
settle only the explicitly selected operations with durable receipts. That
publication-reconciliation operation is not implemented in this change.
