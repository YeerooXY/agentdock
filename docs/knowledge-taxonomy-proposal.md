# Proposed project documentation structure

Status: the owner authorized deterministic tooling on 6 November 2026. A
portable versioned taxonomy and scaffold now exist; managed taxonomy migration
has not been implemented. Existing managed IDs and evidence hashes remain.

## Shared outline

Use a versioned template with consistent top-level categories:

0. Application overview
1. Backend and core logic
2. Frontend and interaction
3. Style and presentation
4. Data and content
5. Build, deployment and operations
6. Cross-system flows
7. Verification and known gaps

For a website, Backend contains handlers and domain logic; Frontend contains
browser interaction. For a CLI, core processing belongs in 1 and command-line
interaction belongs in 2. For a game, simulation belongs in 1 and player input,
rendering interaction and screens belong in 2. Test this mapping on actual
repositories before treating it as universal.

## Sparse population

Pre-generate the outline as metadata, not empty physical directories. Populate
records and files only where needed. Each category shows one explicit status:
uninspected, present, absent, uncertain or not applicable. An absence claim
requires an inspected scope and snapshot; changes to that scope invalidate it.
Freshness is separate from existence. Uninspected does not mean absent.

Use stable section IDs as identity and numbered paths as navigation. The current
ordinal directory addresses must remain distinct from taxonomy paths. If human
paths become durable, store them, do not renumber automatically, retain aliases
on moves and never reuse a retired path. The first implementation should avoid
requiring arbitrary three-level paths for sections that fit at two levels.

## Section shape

Each populated section records its responsibility, entry points/source links,
state ownership, constraints and side effects, neighboring section IDs, checks,
open questions and provenance. Signatures are extracted from source rather than
duplicated into prose. Flow records hold sequence and handoffs, linking to
responsibilities instead of copying their implementation descriptions.

Deterministic extraction handles hashes, placement rules, source inventories and
stale marking. Small models update bounded affected notes. Unmatched files go to
an unplaced queue instead of silently receiving an invented category. A template
is not evidence that its categories were inspected.

## Nemosite example

| Area | Current evidence |
| --- | --- |
| 1 Backend | Worker routing, contact validation, email delivery |
| 2 Frontend | Work filtering, galleries, theme, consent, enquiry form |
| 3 Style | CSS exists but is outside the current pinned snapshot policy |
| 4 Data/content | Project definitions; dist content inputs need further inspection |
| 5 Build/deployment | Generator documented; Wrangler JSONC is not pinned |
| 6 Flows | Project enquiry from browser through owner email |
| 7 Verification | 18 mocked email tests passed; browser/deployed checks unverified |

## Opus review and first increment

One explicitly requested Opus thought review recommended a shared sparse
template, stable IDs behind human paths, scope-bound absence, deterministic
upkeep and explicit flow links. It warned about collisions with current ordinal
addresses, false absence, category ambiguity outside websites and excessive
numbering. Its response was advice only; no code or project records were edited.

Start with a taxonomy schema and path-to-ID resolver, then organize Nemosite's
existing notes. Do not make more generated copies of the same documentation.
Measure a bounded retrieval/update task before expanding to larger repositories.

Review task: 2eab2004-9bdf-417c-adb7-0e228c6ea069. Included Claude Opus route,
one attempt, about 47 seconds; 13,928 input, 3,807 cached input (part of input),
3,926 output tokens. Coordinating usage is additional. Local inference was
offline. No cost-savings claim.
