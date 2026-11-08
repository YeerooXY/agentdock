# Standalone repository documentation

Read the repository instructions and existing canonical docs before creating
files. Inspect source entry points, configuration and tests. A previous plan or
folder name does not prove implemented behavior. Use ordinary file/search tools;
do not request Paddock tools, model routing or an application connection.

## Consistent outline

Use the bundled [deterministic tools](deterministic-tools.md) for optional
scaffolding, source facts, exact extraction, change planning and validation.
They require Node.js 20+ and make no model calls. Reuse existing canonical docs;
the scaffold refuses to create a competing map.

Use this numbered outline for browsing, filling only relevant parts:

0. Application overview
1. Backend and core logic
2. Frontend and interaction
3. Style and presentation
4. Data and content
5. Build, deployment and operations
6. Cross-system flows
7. Verification and known gaps

For a CLI, core processing fits 1 and command interaction fits 2. For a game,
simulation fits 1 and player interaction fits 2. Explain an ambiguous placement.
Distinguish present, uninspected, absent, uncertain and not applicable. Absence
requires a named inspected scope; do not infer absence from files you skipped.

Generate navigation from populated sections. Keep the complete taxonomy in the
skill assets; do not load every unused topic during ordinary retrieval.
Reuse an existing map such as docs/application-map.md. If none exists, create
docs/knowledge/index.md. Split a substantial responsibility into a linked file
only when that makes retrieval easier. Use numbered category folders when files
need grouping; do not create categories with no content. Link the canonical
index from the existing README rather than starting a second documentation tree.
If existing docs already explain the responsibilities, improve their navigation
and link them instead of copying their content. Preserve owner-authored and
adopted-map records; ordinary documentation work does not authorize replacing
or retiring them.

Each responsibility has a stable ID such as sec_contact_delivery, a numbered
address such as 1.2, and a relative file link in the index. IDs are identity;
addresses are navigation. Preserve addresses where practical, keep aliases for
moved sections and do not reuse a retired address for another responsibility.
These file-based addresses do not change Paddock's managed address schema.

## What a section contains

Write the responsibility and its state owner, source paths/entry points, caller
obligations and invariants, side effects and failure behavior, neighboring
section IDs, relevant checks and open questions. Keep sections small enough to
read independently. Extract signatures from source when needed rather than
maintaining a second signature inventory. Flows document order and handoffs and
link to responsibilities instead of repeating their descriptions.

Cite exact relative source paths and symbols for concrete behavior. Use source
hashes only when produced by a deterministic tool or supplied snapshot manifest;
never invent a hash. Label evidence without hashes explicitly. Matching bytes
do not certify the semantic prose. Distinguish declared tests from tests run.

## Retrieval and upkeep

Use source tools first; consult the populated index and relevant sections when
they help locate responsibilities or cross-system obligations. Missing,
uninspected or changed evidence is a coverage gap, not permission to guess.
After a code change, a deterministic diff can identify affected evidence.
Documentation upkeep is a separate authorized step; ordinary implementation does
not require rewriting prose inline. During upkeep, inspect changed source and
update affected responsibilities, flow links and navigation. Keep stale evidence
labelled until reviewed; unchanged signatures do not prove unchanged behavior. Keep owner goals and approved decisions separate from
code observations. No background model calls are implied by installing this
skill. Preserve existing owner-authored docs and unrelated repository work.

Record initialization, retrieval, upkeep, review, repairs and failed attempts
when comparing cost. A shorter document or smaller patch alone proves no saving.
