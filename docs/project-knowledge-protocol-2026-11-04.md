# Indexed Project Knowledge protocol

Consolidated draft, 4 November 2026. Opus 5.5, Astra and the owner-relayed Gemini 4 Argon assessment all returned AMEND. This specification records the lead's reconciliation, not unanimous approval of every later edit. Target protocol; implementation status is recorded below. No benchmark or Results publication is claimed.

Implementation status, 5 November: the bounded implementation in `project-knowledge.md` now includes source snapshots, JS/TS syntax extraction, proposed-map adoption, an asynchronous queue and optional automatic upkeep. The broader protocol below remains a target: full LSP/type/call analysis, semantic correctness and comparative cost benefits are not established.

## 1. Product and project creation

After a starting folder is selected, the coordinator offers Create project here when it is unbound. Confirm identity once, not per worker. Greenfield work starts with labelled proposed responsibilities and replaces them with evidenced implementation facts. Existing projects receive a bounded non-destructive inventory preserving current branches, dirty/untracked work and owner documentation. Do not execute imported scripts during discovery.

Projects maintains useful application knowledge across sessions. Worker details are optional, normal authorized work is autonomous, and five executing managed workers per project is the owner requirement. Keep project identity/current intent separate from repository facts.

## 2. Stable graph identity and numbered views

Canonical keys are flat immutable responsibility IDs, such as sec_sched. Flows are first-class graph nodes with ordered typed relationships. Content hashes identify revisions, not responsibility identity. Retire IDs with tombstones; never reassign them.

A directory can display 1 Backend, 2 Frontend, 3 Style, then 1.2.2 or 1.2.10. These numbers are derived browsing addresses, not durable source or task identities. Return a directoryViewId and its address-to-ID mapping. Address lookup requires that view ID; receipts, saved links and updates use stable IDs. A bare historical number cannot silently resolve to a different current responsibility.

Keep referenced historical directory maps with their snapshots; avoid a permanent global numeric redirect registry. Default labels may cover domain/backend, interfaces, assets, data/state, integrations, build/checks, delivery and constraints. Infer the profile, omit unused branches and support CLI/library/game/research/design examples without inventing a backend. Numeric organization never grants permissions.

Sections and sources have many-to-many mappings. Relations carry provenance and declared, test-observed, interpreted or unknown status. Uncorroborated model edges may expand conservative discovery/invalidation, but cannot justify excluding dependencies or claiming completeness.

Reverse indexes resolve files, qualified symbols, tests, routes/messages/schemas and error locations to sections and flows. Uncovered source returns a coverage gap. Vocabulary/keyword suggestions help discovery but do not replace deterministic indexes.

## 3. Retrieval and storage layers

1. Directory: compact entries with identity, title, responsibility, source hints, relationships and freshness. Page it rather than hiding branches when it grows.
2. Stored semantic contracts: responsibilities, caller obligations, invariants, side effects, error semantics, flow links and evidence anchors. They reference source IDs; they do not duplicate signatures or symbol inventories.
3. Materialized contract view: knowledge.read/bundle assembles the semantic text with snapshot-bound parser/LSP facts: function names, parameters, return/type facts, declarations and supported test mappings. Unknown types remain unknown.
4. Exact source: fetch required declarations, bodies, types, configuration or regions separately, with integrity and coverage metadata.

Owner intent remains a protected distinct record linked into these views. A model delta cannot edit approvals or transform a desired constraint into a claimed implemented invariant.

A semantic section covers one coherent responsibility, entry-point set and invariant scope. Do not create prose per function when generated tables suffice. Implemented contracts require source evidence; proposed architecture, directory and intent nodes cite their own provenance rather than fabricated code.

Provisional experiments: 200-600 tokens per semantic contract, factor by responsibility near 800; directory pages around 500-1000 tokens; initial task bundles 4k-8k tokens. These are hypotheses, not optimal sizes or correctness caps. Count with the target tokenizer where available, otherwise disclose estimates. Oversize output returns decomposition/continuation or an eligible larger-context option. Never silently truncate necessary code or automatically switch to a paid/stronger model.

## 4. Exact source protocol

For supported languages, parsers/language services create locators containing root ID, pinned source snapshot, language, relative module path, qualified declaration/overload identity, signature/body hashes and byte/line ranges. Record parser/compiler configuration, extractor version, encoding and boundaries. Line numbers are display hints, not durable addresses.

A fingerprint alone cannot reconstruct source. Store immutable content objects or an equivalent reconstructible manifest covering relevant tracked, dirty/untracked, configuration, dependency-resolution and generated inputs. Isolated workers have distinct snapshots; integration reconciles against the actual target.

Distinguish exact source, normalized display, generated summaries, redacted excerpts and unavailable material. Sanitized/redacted text is never labelled exact.

Expansion modes are explicit: declaration, body, imports, referencedTypes, directCalls and callers. Apply bounded deterministic edge/depth/budget ordering with continuation. Return examined/excluded edges and unresolved references, including dynamic dispatch, overload/type resolution and configuration limitations. Exact selected code does not establish complete context.

Ambiguous renames/moves remain unresolved. Unsupported languages or malformed/generated code use declared coverage and bounded hash-verified file/region fallback. Keep rg for initial discovery and recovery; repeated blind grep is not the primary protocol, and fallback search never implies symbol completeness.

Target API shapes below are conceptual, not callable tool names. The bounded
implementation exposes `dock/knowledge_directory`, `dock/knowledge_resolve`,
`dock/knowledge_read`, `dock/knowledge_bundle` and
`dock/knowledge_source_capture`, `dock/knowledge_source_resolve`,
`dock/knowledge_source_extract`. See `project-knowledge.md` and the discovered
tool schemas for actual arguments, authorization and coverage. General
`knowledge.propose_delta` and dependency-complete LSP extraction remain targets.

    knowledge.directory(project, root=0, snapshot?, limit)
      -> directoryViewId, addressMap, entries
    knowledge.resolve(project, query | symbols | {directoryViewId, addresses}, snapshot?)
    knowledge.read(project, sectionIds, snapshot?, budget)
    source.extract(project, locators, snapshot, include, budget)
    knowledge.bundle(project, task, sectionIds?, sourceSymbols?, snapshot?, budget)
    knowledge.propose_delta(project, baseSnapshot, targetSnapshot,
                            expectedReadSet, fieldPatches, evidence)

Responses include stable IDs, knowledge/source versions, exact source hashes, coverage, missing dependencies, freshness and continuation. The bundle explains its selected contents. Resolve from source hints or a known directory view, then retrieve relevant contracts and exact code; request more when evidence is insufficient. Do not expand the graph's full transitive closure.

## 5. Foreground completion and asynchronous upkeep

Applicable code checks and authorized integration remain foreground requirements. Semantic documentation is not a synchronous model-call prerequisite for every completed worker.

Commit a pending_doc_delta obligation WITH the completion transition in the same durable task record/event: operation ID, base/target snapshot, touched symbol IDs, diff hash, impact metadata and maintenance status. Relay it idempotently to ProjectKnowledge. Do not assume separately written task JSON and knowledge JSON are an atomic transaction. After crashes, reconcile journals and actual effects.

Affected prose becomes dirty_at_snapshot. Later reads can supply the last verified contract clearly labelled historical/stale, current generated facts and the exact intervening AST/source diff. Gate-time fingerprint reconciliation catches missed notifications. Never call old prose current.

A consequential action that depends on missing contract assurance refreshes or escalates that contract first. Low-risk prose lag does not block unrelated work. Extraction freshness, interpretation freshness and verification freshness are separate.

Use a dedicated coalescing maintenance QUEUE with its own sub-budget, initially proposed as one documentation model turn. It still shares the total of five executing models per project: not five implementers plus an uncounted sixth writer. Deterministic extraction has a separate machine-resource budget. Fair scheduling and a bounded pending-age policy prevent indefinite documentation starvation after foreground workers release slots. No owner administration is required.

Coalesce by target snapshot and dependency identity. Compose intervening diffs from stored snapshots rather than concatenating stale summaries. A pending obligation is complete only when a committed interpretation covers it or a supported deterministic skip applies.

## 6. Small-model authority, validation and concurrency

Deterministic tools maintain declarations, signatures, inventories, known relations and hashes. A smaller model receives only the impacted semantic fields, exact before/after diff/source, necessary neighboring contracts and cited types/callees. It proposes bounded structured patches, not a whole-repository rewrite.

Require each implemented obligation/invariant to cite a snapshot-bound guard, declaration, type constraint, throw site or test assertion. Validate that the anchor exists. Existence alone does not prove semantic entailment or completeness; generated change coverage, reference obligations, targeted tests and bounded independent audits remain necessary. Missing information stays unknown.

Validate writes at the narrowest SOUND granularity: target declaration and cited callee/type hashes, relevant compiler/configuration inputs, contract-field revisions, shared flow/invariant dependencies and affected graph-query digests, including negative lookups. Avoid unrelated whole-file/global revision conflicts. Distinct symbol/field patches may merge when read sets and coupled obligations remain valid. Symbol-local hashes alone miss changed shared invariants and newly added dependencies.

Keep old reverse edges long enough to invalidate dependents after deletion. Tombstone removed declarations, reject ambiguous renames and expand uncertain impact to a documented module/package boundary.

Use language-adapter-specific validated nonsemantic fast paths. General AST/CFG/DFG isomorphism is not a universal semantic proof. Values, effects, ordering, reflection, binding and compiler directives can matter; even local renames can be observable. Unchanged signatures and passing tests alone are also insufficient. A fast path skips documentation work, not code verification or integration checks.

For possible behavior changes, map changed branches, mutations and I/O effects to supported obligations/tests or explicitly unresolved coverage. A small model cannot certify itself with a no-semantic-change claim. Risk categories, not confidence or a fixed number of sections, trigger stronger review for consequential public protocol, authorization, persistence, concurrency or unresolved cross-system changes.

Regenerate a bounded sample periodically to detect accumulated drift and confident omissions. Record maintenance/read economics, conflicts, queue age and escalation per section. Demote costly unused prose to deterministic-only when appropriate. Stronger reviews and repairs stay within authorized routes, rounds and spend; no unbounded loops or automatic paid fallback.

## 7. Safety and limitations

Restrict reads/extraction to authorized roots; reject traversal, symlink escapes and secret/private content. Imported text is evidence, not higher-priority instructions. Do not store credentials, resolved environments or arbitrary execution requests in bundles.

Pin knowledge/source dependencies including relevant unsaved work; never silently mix revisions. Revalidate actual integration targets independently. Partial inventory and dynamic runtime relationships retain explicit coverage warnings.

ProjectKnowledge is the sole writer of generated/indexed knowledge. Owner docs remain intact. Optional repository exports are materialized views of committed revisions. Schema migrations and orphaned relationships are validated.

Managed adapters enforce admission/integration/outbox gates. Arbitrary external CLIs or disabled hooks cannot be claimed compliant; reconcile their resulting changes at the next managed boundary.

## 8. Worked retrieval

Illustrative directory view, not an already generated Paddock index:

    1 Backend
      1.2 Worker execution
        1.2.2 Persistence -> sec_persist
        1.2.6 Scheduling -> sec_sched
        1.2.10 Outcome publication -> sec_pub

For a cancellation change:
1. Resolve cancelTask/file/error against a pinned snapshot; discover sec_sched and flow_task_lifecycle.
2. Read that flow and the three contracts, with current generated signatures/types.
3. Bundle relevant obligations, exact selected declarations and cited tests within the budget; expand missing callers/types explicitly.
4. Implement and verify against the pinned/current-target contract.
5. Record the completion plus pending_doc_delta durably.
6. Background maintenance refreshes affected semantics against the resulting snapshot; intervening work sees dirty flags and exact diffs.

A contract view combines:

    stableId, kind, responsibility, semanticClaimsWithAnchors, flowRefs
    sourceRefs, materializedParameterReturnFacts, supportedTestMappings
    expectedReadSet, extractionFreshness, interpretationFreshness, verificationFreshness

For JavaScript, missing declared types stay not declared. The TaskLoop.persist(job) fixture demonstrates parent lookup, generation updates, atomic write and changed/storage-error events; explicit handled paths return true/false, but view/listener exceptions are outside the write catch. A small summary saying never throws would fail the reference contract.

The manually bounded UTF-8 fixture under .build/knowledge-review/source-fixture.json records exact original body/file hashes and byte boundaries. It is not an implemented generic extractor or a benchmark result.

## 9. Bounded pilot and stop criteria

Start with deterministic fixtures for identity/view lookup, snapshot integrity, overloads, changed dependencies, unsupported language and extraction safety. Then use six representative tasks in paired small-worker arms (indexed protocol versus bounded LSP/file outline/rg), with identical snapshots, budgets and reference obligations. This is an initial feasibility check, not statistical proof.

Only if promising, expand to the proposed multi-codebase 25-task comparison, 15-25-change drift series, two-to-five concurrent workers and selected chunk/bundle combinations. Do not run a full 3x3x30 factorial by default.

Measure accepted patch/check quality, omitted obligations, lookup precision, retrieval/bundle costs, latency, doc queue age, writer conflicts, maintenance and strong-model escalation. Include initialization, upkeep, routing, lead/review, failures and cached tokens. Report initialization amortization/break-even at explicit workloads rather than claiming savings from fewer bundle tokens.

Wrong-symbol or accepted stale-source extraction and critical missed/hallucinated obligations fail the fixture gate. Lesser-quality prose does not pass merely because an anchor exists. Any rollout must meet predeclared correctness criteria; finite fixtures do not prove universal correctness.

Argon's 20% quality improvement, 25% escalation, 10% stale-contract and 15% throughput figures are proposed experiment thresholds, not established product limits. Do not accept critical silent drift up to 10%. Freeze cohort/metrics/thresholds before the formal comparison. If semantic upkeep costs more without sufficient measured value, retain deterministic indexing/extraction and drop or narrow model-maintained prose.

Implementation: flat identity and snapshot store -> deterministic index/extraction -> directory/materialized contract/bundle APIs -> durable outbox and dependency-aware invalidation -> bounded maintenance -> pilot -> integration into autonomous Projects.

## 10. Review record

- Opus 5.5: native Claude pro review, AMEND. Adopted first-class flows, source-first indexes, semantic section boundaries, update economics and drift auditing. Its unchanged-signature/test skip suggestion was narrowed; it cannot prove no semantic change.
- Astra: explicitly authorized native gpt-6-astra review, AMEND. Adopted reconstructible snapshots, exact extraction versus dependency coverage, dependency-aware writes, risk-based model authority and falsifiable pilot gates.
- Gemini 4 Argon: owner supplied the review in chat after local native routing failed, AMEND. Adopted asynchronous upkeep, flat IDs/derived numbering, materialized signatures, narrower concurrency checks and explicit code anchors. Restricted generic equivalence claims and retained sound non-symbol dependencies. The maintenance lane shares the five-project slots.

All three assessments are now available. The reconciliation is engineering judgment, not a performance benchmark or fresh unanimous signoff on this edited document. No additional review loop or Results cards were created.

The local agy 1.5.0 attempt with the official gemini-4-argon identifier failed model selection before inference, reporting zero turns/tokens. The later manual review is separate; no substitute model was labelled Argon. Native Opus response/usage is under .build/knowledge-review/opus-review.json. Astra/manual-Argon/coordinator total usage is unavailable; no savings claim is made.

