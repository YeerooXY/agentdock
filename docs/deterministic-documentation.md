# Deterministic documentation maintenance

The Project documentation skill includes a portable Node.js helper. Its source
is `scripts/documentation.cjs`; the installed bundle is
`skills/project-documentation/scripts/documentation.cjs`. It runs without the
desktop app. No command dispatches models, imports repository source as code or
enables background upkeep.

## Responsibilities

| Component | Output |
| --- | --- |
| Taxonomy asset | Versioned 0–7 navigation with stable template IDs |
| Scaffold | Sparse index, map metadata, optional category folders |
| Section template | Stable ID, three-level address and required semantic fields |
| Source snapshots | Immutable bounded UTF-8 evidence with explicit coverage |
| Source facts | Supported declaration signatures and syntax-derived metadata |
| Change planner | Changed declarations, directly affected notes and immediate relationships |
| Validator | Structural errors, stale evidence, missing anchors and uninspected gaps |

Section numbers are navigation. Stable IDs identify records. The portable map
does not change Paddock's managed directory addresses or migrate adopted maps.
Initialization refuses competing canonical documentation. Source paths are not
automatically assigned semantic responsibilities from directory names.
The guard recognizes common map paths; agents must still inspect differently
named canonical documentation before initializing another tree.

The implementation uses the existing repository inventory, source reader,
parser and immutable snapshot store. The portable bundle includes those pieces
and parser licenses, so agents need no parser package setup. The build checks
that the bundle matches its sources. Instructions and examples are maintained
in the skill's `references/deterministic-tools.md`.

## Updating after a change

1. Capture relevant source before and after the change.
2. Refresh generated source facts.
3. Resolve changed paths/declarations to their cited map sections.
4. Check directly related handoffs in either direction.
5. Revise only affected semantic fields, then refresh their source evidence.
6. Validate IDs, navigation, links and current evidence.

Diff planning produces an update request, not a prose rewrite. It performs no
model calls and does not block implementation completion on documentation.
Paddock's existing managed queue remains asynchronous. Its model route,
authorization, budget, Off behavior and protected-record rules remain in force.

Exact unchanged source requires no semantic update. A syntax fingerprint is
triage evidence only. Comment directives, automatic semicolon insertion,
external consumers and unresolved dependencies make broad semantic-equivalence
claims unsafe. No formatting/comment fast path silently approves semantic docs.

## Limits

The parser supports selected JavaScript/TypeScript declarations. It is not an
LSP or whole-program type/call analysis. Unsupported languages retain exact
file extraction. Declared types are syntax facts, not runtime guarantees.

References currently use file hashes. A change to one declaration can require
reviewing every note citing that file; symbol differences help focus that
review. Immediate relationships are explicit links, not a proven complete
impact graph. Missing sources in partial snapshots remain unavailable rather
than being declared deleted. Renames/moves require identity reconciliation.
Diffs explicitly list unobserved sections. Parser success and declaration
coverage are separate; unsupported callable/type forms remain visible gaps.

Validation does not certify prose truth, full obligation coverage or successful
tests. A valid uninspected template still has a knowledge gap. Scope-bound
absence claims, automatic adoption/migration and a semantic-delta model lane
for this portable format are outside this increment.

No token-saving claim follows from zero-inference tooling. Real-repository
initialization, retrieval, upkeep, repair and coordinator costs must still be
measured against the conventional-tools baseline.

## Verification, 6 November 2026

Build passed. The full Node suite passed 1,244 checks with one skip and no
failures. The skill validator passed. The bundled helper was copied outside
the repository and exercised without adjacent dependencies or a Paddock
process. It was also used to capture and inspect actual Paddock source.
All seven installed skill locations match the generated helper.

StudentAnti supplied the bounded parser implementation. Opus performed a
focused review; a short Sonnet evidence check recovered the validation boundary
after Paddock truncated the leading review finding. Reviews returned amendments,
not final approval. The lead corrected and tested return/newline semantics,
template text hashing, unsupported declaration coverage, unobserved sections,
missing evidence and empty-map verification flags. The initial review's full
leading text was unavailable, so independent final signoff is not claimed.

Usage, cached input, worker durations, review limitations, installation receipts
and verification logs are under `.build/deterministic-docs/`. StudentAnti's
exact effective model and monetary cost were not reported. Coordinator usage
is recorded as a pre-final lower bound; no overall savings claim is made.

Docker's Linux engine was unavailable. No visible desktop test or restart was
used. The installed helper is available to new agent sessions now. The managed
source-index change loads with the next normal Paddock restart.
