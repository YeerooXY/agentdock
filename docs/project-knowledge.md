# Project knowledge implementation

Implementation status, 6 November 2026: the desktop and phone Projects workspace,
source snapshots, syntax extraction, map adoption and opt-in background upkeep
are implemented in source. An older running app needs a normal restart. This is
a bounded implementation of the reviewed protocol, not a complete LSP or a claim
that model-written documentation is semantically correct.

## Documentation authoring

The bundled [project-documentation skill](../skills/project-documentation/SKILL.md)
is also available to any connected agent through `dock/knowledge_guide` when
knowledge is enabled. Native skill-pack installation is optional; shared context
and managed-worker instructions advertise the bounded retrieval capability.
The default guide contains retrieval essentials; `topic: authoring` returns the
full authoring protocol only for explicit documentation work. Routine coding
does not load that protocol or require synchronous prose upkeep.

`dock/knowledge_initialize` reads a bounded source selection and seeds a stable
overview/directory without a model call. Empty folders receive an honest empty
overview. Default initialization filters captures/releases/test-data, selects up
to 128 files within a metadata byte budget, and records selection/deferred limits.
Large repositories can provide explicit source paths beyond inventory traversal
caps; the same private-name, excluded-ancestor, link and content checks apply.
The seed is a source directory, not an inferred architecture.

Agents inspect exact source and publish actual responsibilities, flows and an
application overview through `dock/knowledge_write`. Its bounded input includes
a pinned snapshot, operation ID, section versions, paths/anchors and stable
relationships. It checks current source and atomic section versions, protects
owner/reviewed/unrelated identities, and reserves overview IDs for that role.
Notes remain inferred with unknown semantic freshness. Review/planning workers
cannot initialize or publish notes. Owner goals/approvals are not changed.

`dock/knowledge_state` supplies bounded overview previews and metadata for source
areas. Full notes come from `knowledge_read`, including live source-evidence
status. Areas are explicitly not checked by the directory alone. Managed additions
outside an overview's citations invalidate it even after generic module upkeep
commits; changing a cited file also invalidates its evidence. Unmanaged, uncited
external additions require another scoped inventory, not a claim of completeness.

The desktop and phone Overview display this application information separately
from saved goals/plans. The desktop Build project map action initializes only
local source facts; an agent supplies the semantic notes. Source matches do not
establish semantic truth. Read mode makes no unattended documentation model calls.

Targeted integration tests cover the guide/tool path, greenfield initialization,
protected intent, related notes, stale sources, atomic conflicts and persistence.
A real Paddock subsystem was also initialized, documented and reread after a store
reload in an isolated profile. No live project store was changed by that check.

## Controls and workspace

Knowledge defaults to **Off**. Settings > Projects offers Off, On demand and
Automatic. Each project can inherit the global setting or restrict access.
Global Off always wins. Off blocks inventory, snapshots, reads, knowledge tool
discovery and future context injection. It preserves saved records and cannot
recall context already sent to a model.

On demand makes no background model requests. Automatic requires a saved native
account/model and an explicit free, included or local allowance declaration.
Known metered routes are rejected; unknown provider funding remains unknown in
records. Fresh native quota and shared execution admission are checked before
launch. There is one documentation lane, at most four attempts per hour across
projects, and no automatic retry or paid fallback. Critical policy, persistence,
security and scheduling changes require focused review instead of small-model
maintenance. Local inference was unavailable during this increment.

Projects owns Overview, Work and Knowledge on desktop and on a phone
connected to a workspace-capable host. Work exposes instructions, assigned model,
size and reports on demand. Routine reports remain internal. Project files remain on disk. The default
workspace has no Seen/Accept/Close notification chores. Older phone hosts retain
the prior navigation. Phone report reads are bounded and direct large-report
continuation to the PC.

## Retrieval and adoption

All shared knowledge tools use the calling console's linked project. A saved
folder index selects an authorized root; arbitrary roots and foreign projects
are rejected. Inventory scans metadata. Source capture is a separate explicit
operation that reads selected UTF-8 files, filters known private paths and
credential patterns, and stores immutable hash-pinned snapshots. Filtering is
not a universal guarantee that arbitrary source contains no sensitive data.

Use source tools first. `dock/knowledge_context` accepts exact targets or a
query and returns bounded source, applicable notes and deferred handles. Explicit
targets capture only selected paths. Without targets or a snapshot, it returns
populated note handles without initializing the map or capturing the repository.
Known paths still select directly cited obligations. Live hashes and pending
upkeep are checked before note prose is included. Stale/missing sources remain
labelled; source identity does not certify semantics or complete dependencies.
At most three whole source/claim bodies share a 4?64 KiB JSON budget.

For explicit broader browsing, use `dock/knowledge_directory` or
`dock/knowledge_resolve`, then `dock/knowledge_read` or `dock/knowledge_bundle`. Bundles contain whole saved
notes and exact requested source within a UTF-8 byte budget. Deferred items are
explicit. Numeric outline addresses are revision-bound views over immutable
section IDs, not permanent identifiers.

`dock/knowledge_source_capture`, `dock/knowledge_source_resolve` and
`dock/knowledge_source_extract` provide snapshot-pinned file/declaration reads.
The Lezer parser handles JS/TS/JSX syntax, exact declaration slices, signatures
and hashes. Unsupported or malformed declarations produce explicit coverage
limits and bounded file fallback. It does not resolve types or prove call edges,
complete dependency graphs or semantic behavior. Other languages use file reads.

`dock/knowledge_adopt_map` imports a bounded proposed map from an authorized
repository. Every observed source hash must match. Imported interpretations stay
inferred/proposed. Owner intent and unrelated records are preserved; matching
repeated adoption is idempotent. Initial pilot maps for other repositories have
not been silently imported into this project's live store.

The portable skill helper exposes the same selection engine through `context`.
It reads the existing canonical map and cited files without a second prose store.
Missing evidence defers whole notes; it never refreshes stored hashes from source
alone. Generated navigation lists registered sections in numeric groups; unused
taxonomy branches stay in the skill assets. Owner-edited indexes are preserved.

## Background updates

Managed tasks save a documentation outbox record with completion. Code completion
does not wait for a model-written note. Worktree changes enqueue after actual
publication. Queue reconciliation is idempotent. Restarted in-flight batches are
uncertain and do not automatically repeat model requests.

One turn covers at most four changed files and 48,000 bytes of context. Existing
inferred responsibility/flow notes are updated in place with their identities,
links and provenance preserved. An authored batch covers at most three claims
and eight cited source paths, including unchanged dependencies. Every original
dependency needs current evidence. Protected owner, reviewed and adopted-map
records block for focused reconciliation before a model is called; the updater
does not create competing module summaries for them. Larger
changes need smaller slices; they are not silently marked documented. Exact
unchanged source and deletion of generated-only records have zero-model paths.
Owner/manual or shared contracts are not deleted automatically. Unavailable or
filtered changed source blocks maintenance rather than clearing its obligation.

Model turns have no tools or owner-file editing. A proposal must cover the listed
sections, cite existing declaration anchors and exact source hashes, fit the
schema, and pass per-section version checks. Live source hashes and authorization
are checked again before commit. These checks establish structural evidence;
they do not prove prose claims. Generated records remain inferred with unknown
semantic freshness. Pending/blocked obligations stay visible behind Details.

A one-module Flash Low pilot took about 10.4 seconds (11,742 input and 343 output
tokens, no recorded cache). Its first review received no response because of an
adapter defect; that defect was fixed and tested. A correctly supplied Sonnet
review requested three corrections. The draft is therefore not evidence of
reliable unattended semantic maintenance or savings. Full worker/review/failed
attempt accounting is recorded separately from this single drafting measurement.

## Ownership

`knowledge-contracts.cjs` validates section identity, provenance, evidence and
recorded freshness. Validation establishes metadata integrity. It does not
verify source anchors, semantic claims or owner authorization.

`project-knowledge.cjs` is the trusted main-process persistence service.
`ProjectKnowledge(root)` does not create storage. `snapshot(projectId)` reads
the project document or returns an empty revision-zero snapshot. `commit`
validates a batch, checks target versions and atomically replaces one document
containing both section state and its operation journal:

```js
store.commit(projectId, {
  operationId: 'import_001',
  changes: [{ id: 'sec_sched', expectedVersion: 0, section }]
});
```

Each target has its own version. An unrelated section update does not invalidate
a proposal; two updates based on the same target version conflict. Repeating
the same operation ID and normalized payload returns its original receipt.
Reusing an operation ID for different content fails. Deletion stores a tombstone;
retired IDs cannot be reassigned. Receipts record target versions and deletion
state. Loading replays contiguous revisions and versions, matches every final
entry and rejects subsequent operations on tombstones. This detects inconsistent
history; it is not cryptographic authentication of the document. Each call reloads
disk state. The service is intended for one main-process writer, with synchronous commits. It does not
provide cross-process locking or semantic dependency validation.

Storage is `<data>/knowledge/<projectId>.json`. Owner repository files are not
modified. Invalid IDs, redirected paths, corrupt data and unsupported schemas
fail without replacing saved data. Pilot limits are 32 changes per batch,
1,000 identities, 1,000 journal entries and an 8 MiB document. Limits produce
explicit errors; automatic history compaction is not implemented.

## Read tools

`knowledge-reader.cjs` creates bounded saved-record views. Two base read tools are:

- `dock/knowledge_directory({cursor?, limit?})` returns stable section IDs,
  versions, titles, recorded freshness and reference counts. Pages retain a
  project/revision-bound cursor. Changed revisions require a fresh directory.
- `dock/knowledge_read({ids, revision?, maxBytes?})` returns whole records in
  request order. `missingIds` and `retiredIds` distinguish gaps from tombstones.
  `remainingIds` lists deferred records. `requiredBytes` is the complete response
  budget for a solo read of the first deferred ID, excluding unrelated IDs. A
  retry at exactly that budget succeeds when it is within the maximum. Use the returned
  revision on continuation. `decompositionRequired` means the next section
  exceeds the maximum response budget; it cannot be read by repeatedly raising
  the budget. No semantic prose is silently truncated.

The directory defaults to 20 entries, with a maximum of 100. Section reads accept
1 to 32 distinct IDs. The UTF-8 response budget defaults to 32,768 bytes, with a
range of 2,048 to 262,144 bytes. These are byte bounds, not measured token counts.

Tools use the calling console's saved project binding. Base saved-record reads accept no project selector, filesystem path or write payload. Source capture and proposed-map adoption accept only their bounded, authorized arguments. An unbound, closed or deleted-project
console cannot read knowledge. Missing storage stays empty; reading does not
adopt a repository or invent a project map. Worktree consoles can use their
explicit project binding without treating the worktree as a new project.

Every response labels source and semantic assurance as unverified. Whole section
records appear under `recorded`, preserving their original claims without
asserting that those claims still match current source. Numeric directory views and syntax-derived signatures are available separately. Source matches do not establish semantic freshness.

## Verification

Storage tests cover restart, idempotency, independent/conflicting edits, atomic
batches, tombstones, invalid/corrupt storage, redirected paths and failed writes.
Reader and shared-bridge tests cover project binding, bounded continuation,
revision changes, Unicode budgets, explicit oversized records and denied write
fields. Tests use temporary roots and make no model calls.

## Read-only inventory pilot

`repo-inventory.cjs` observes bounded filesystem metadata. It does not read source
contents, execute project scripts, apply Git ignore rules or initialize knowledge.
It returns sorted relative paths, role/language hints, a rule-derived policy ID,
per-rule exclusion counts, non-private excluded directory paths and explicit
coverage gaps. Its inventory ID is metadata-only; `sourceSnapshot` remains null.

The entry budget limits retained/processed directory entries. One additional
directory entry may be read per visited directory to distinguish EOF from real
truncation; `lookaheadEntries` records nonempty lookaheads. A depth cap, unreadable
entry, symbolic link or observed filesystem change prevents a complete result.
Complete means complete within the declared name filter, not all application
source. Conservative names such as `bin` and `Library` can hide real source and
must be checked before promoting a proposed map.

`scripts/knowledge-inventory.cjs` surveys explicit `{path,label}` inputs. Its CLI
writes a report outside every input root, using native path resolution and
directory identities to check aliases. Missing roots remain explicit and cause
a nonzero CLI status. Target project scripts are not imported. Native alias
normalization has unit coverage; tests do not create Windows drive mappings.

See `knowledge-partitioning.md` for responsibility boundaries and
`project-inventory-pilot-2026-11-05.md` for the initial two proposed maps and the
registered-folder survey. These pilot findings have not adopted or rewritten the
other projects' live knowledge.

## Verification and limits

All automated tests use temporary profiles and mocked model processes. The live
semantic pilot was a separate explicit task, outside tests. Source storage and
queue tests cover bounds, corruption, redirects, race checks, idempotency and
restart uncertainty. Integration tests cover mode changes during dispatch,
text-only permissions, stale evidence and task publication failures.

Storage is single-main-process with per-section optimistic versions, not a
cross-process database or semantic dependency solver. Initialization and upkeep
costs need a controlled multi-task benchmark before any savings claim. Human
approval of architecture and owner intent remains separate from system-recorded
verification and generated interpretations.

## Source-first verification, 6 November 2026

The full suite passed 1,306 checks with two skips. After the review correction,
the current focused suite passes 100 checks with one Windows file-symlink check
skipped for OS permissions. The production build and skill validation pass.
The portable bundled helper runs from a temporary folder without Paddock or
adjacent modules. The independent Sonnet review found evidence-only citations
were omitted from selection; a failing reproduction now passes after correction.
Sonnet did not inspect navigation or the skill entrypoint; those received direct
inspection and deterministic tests. No semantic-quality or savings claim follows.

Three included Sol implementation slices took roughly six, two and four minutes;
the included Sonnet review took about one minute. Worker input includes substantial
cached input. The worker ledger in `.build/source-first-usage.json` separates it;
coordinator usage is unavailable there. Local inference was offline. Antigravity
readings were stale/unknown, and earlier Pi preparation failures were not retried.
No metered fallback was used. Tests make no live model requests.

The implementation increment ran no new native trial. A subsequent six-attempt
comparison is recorded in [Source-first native pilot](source-first-native-pilot-2026-11-06.md).
Coding patches passed all 23 mocked checks; planning hit the output cap. Savings
remain inconclusive. No live Nemosite documentation was changed. The installed skill
is updated in seven existing agent locations. An older running Paddock process
exposes its cached tool descriptors until the next normal restart. No restart or
visible verification window was launched. Docker's Linux engine was unavailable,
so headless desktop verification remains outstanding.


A later [cross-module migration trial](cross-module-native-pilot-2026-11-06.md)
completed real planning and implementation in two isolated Nemosite fixtures.
Both passed all 12 checks first time without output-limit continuations. The
extra map-upkeep attempt remains unaccepted after source/reference review; it
retained removed-file links and inaccurate/stale statements. This does not show
a coding advantage or justify automatic prose upkeep on its own. No live project
was migrated and no feature setting was changed.


The [smaller-worker trial](small-worker-native-pilot-2026-11-06.md) tested
Haiku 5.5 and a verified free North Mini route. Haiku passed nominal migration
checks but was slower than Sonnet in the sampled runs, and a directory-link
review exposed inconsistent output confinement. A concise-brief condition with
supplied notes reduced Haiku's observed work, but did not satisfy equal quality.
The free route stopped with provider errors before code implementation. No
heavy-use savings or production adoption is claimed; no feature setting changed.
