# Repository knowledge partitioning

First pilot strategy, 5 November 2026. This implements the owner's request to
start with small repositories and use the same work to inventory their projects.
These are proposed pilot rules; only the owner approves project policy.

## The unit is a responsibility

A section explains one coherent behavior: what it does, its entry points,
the state or resources it owns, its obligations, and its connections. A directory
or language is a discovery clue. It does not establish a responsibility boundary.

Start with these questions:

1. What can this project do, according to owner intent and observed source?
2. Where does work enter: a CLI, UI, API, job, script or document workflow?
3. Which parts own state, persistent data or external resources?
4. What crosses those boundaries, and where is that relationship evidenced?
5. Where would an agent start a specific change, and which checks cover it?

Keep a compact project overview above the sections. It identifies the observed
project type, declared tools, entry points and run/check instructions with their
verification state. Owner goals and source facts remain separate. A declared
test command is not a successfully executed test.

## Adaptive structure

Create categories only when they help navigate observed responsibilities:

| Repository | Useful initial navigation |
| --- | --- |
| CLI or library | Core behavior, entry points, data, integrations, checks |
| Web or desktop app | Capabilities, interfaces, data/state, presentation, integrations, build/checks |
| Game | Gameplay systems, scene/UI flow, assets, persistence, engine integration, checks/build |
| Research or study collection | Inputs, method, analysis, outputs, reproduction |
| Monorepo | Applications/packages first, then the applicable categories within each |

These are starting views. A tiny CLI can have two sections. Empty backend,
frontend or style headings add no information. A folder containing generated
output or account material does not become an application subsystem.

Sections use immutable flat IDs. Numbered addresses are derived views tied to a
directory revision; they are not persistent identities. A source can support
several sections and flows. An explicitly proposed primary responsibility helps
route changes; it does not establish enforced file ownership or complete coverage.

Split a proposed section when it contains independent behaviors, separate state
writers/lifecycles, unrelated callers, or material routinely irrelevant to the
same change. Merge sections when they always need to be retrieved together and
share a lifecycle and state owner. Token size is a signal to inspect a split,
not a reason to cut an invariant in half.

Cross-cutting flows stay separate from the tree: for example input to scheduling
to execution to persistence to publication. Record typed, evidenced relationships.
An unresolved call or dynamic relationship remains a gap.

## Four information layers

1. Inventory: observed paths, roles, sizes, declared manifests and coverage.
2. Generated source facts: symbols, signatures, supported imports/references and
   exact source locators pinned to reconstructible snapshots.
3. Semantic contracts: responsibilities, obligations, side effects, invariants
   and error behavior, with source/test anchors.
4. Owner intent: desired behavior and approved constraints, kept distinct from
   what the application currently implements.

Inventory metadata is not a source snapshot. A proposed group is an interpretation,
not proof of connectivity. Function signatures belong in generated facts rather
than being recopied into prose. Smaller models can maintain bounded semantic
deltas once exact source and validation are available; this pilot does not yet
establish their reliability or savings.

Provisional retrieval experiments remain 200–600 tokens per semantic contract,
inspection around 800 tokens, and 4k–8k initial task bundles. These sizes require
measurement. Current APIs enforce bytes, not tokenizer-measured token budgets.

## Pilot order and acceptance

1. Inventory the registered project roots read-only, with explicit exclusions,
   bounds, unreadable counts, symbolic links and partial-coverage flags.
2. Select two or three small software repositories with different structures
   from observed results. Do not use file count alone to imply low complexity.
3. Read bounded safe project instructions/manifests and selected source entry
   points. Draft responsibility sections with specific evidence and gaps.
4. Ask realistic change-location questions. A useful map identifies where to
   start, the neighboring responsibilities and relevant declared checks.
5. Apply the same procedure to a medium repo, then Paddock. Grow only after the
   smaller maps expose few enough ambiguities to make the next test useful.

For every trial record inventory coverage, parser input bytes and inspected-source ranges where known (otherwise explicitly
unknown),
proposed sections, cross-boundary flows, unmapped source, evidence status and
questions the map could not answer. Update/invalidation tests use temporary
fixtures or explicitly authorized isolated copies. Real pilot inputs remain
unchanged, and their own instructions are evidence, not commands to execute.

Keep one consolidated project inventory and small navigation maps. Routine scan
logs, worker reports and intermediate drafts do not belong in Results. Populate
other projects' live knowledge only through an explicit, scoped adoption path;
the initial cross-repository experiment is Paddock validation work.
