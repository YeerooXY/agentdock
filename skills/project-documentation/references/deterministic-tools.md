# Deterministic documentation tools

The installed skill includes `scripts/documentation.cjs`, a bundled Node.js 20+
command. It needs no Paddock process, package installation, model or API key.
Run it by its absolute path from the skill folder. Commands return JSON.
Source is parsed as data, never imported or executed.

## Navigation and sections

```text
node <skill>/scripts/documentation.cjs init --root <repository> [--folders]
node <skill>/scripts/documentation.cjs add --root <repository> --address 1.3.3 --title Cancellation --id sec_cancellation
node <skill>/scripts/documentation.cjs directory --root <repository> --address 1.3
```

The default creates `docs/knowledge/index.md` and an empty `map.json`.
The generated index lists populated sections. The full taxonomy stays in the
skill assets. Adding a section refreshes an unchanged generated index; owner edits
remain untouched and the response reports `indexUpdated: false`.
`--folders` also creates eight top-level category directories. `add` creates one
uninspected note with required fields and a stable identity. Domain systems
(`1.2.x`) and user journeys (`6.1.x`) accept project-specific leaves. Other
branches also accept additional responsibility leaves. Predefined topics in
`assets/taxonomy.json` are starting points, keeping their existing addresses.

Existing maps and owner files are preserved. Read existing documentation first;
the script recognizes common canonical map paths, not every possible filename.
Initialization refuses competing common application/architecture maps. Adoption needs a
separate deliberate migration. Addresses belong to this portable format, not
Paddock's existing ordinal views. A writer lock prevents concurrent manifest
updates. An interrupted lock needs inspection before removal; no lock stealing.

`map.json` is the populated-section directory. Entries have `id`, `address`,
`title`, `status`, `document` relative to `docs/knowledge`, `sourceRefs` and
`relatedIds`. Source references contain repository-relative `path`, exact file
`contentHash`, and optional `symbolId`. Obtain these from snapshot output.
Related IDs must exist in the map. Populated notes use `present` or `uncertain`;
unfinished notes stay `uninspected`. Unscoped absence claims are unsupported.

## Capture, retrieve and compare

```text
node <skill>/scripts/documentation.cjs context --root <repository> --paths src/queue.ts --max-bytes 16384
node <skill>/scripts/documentation.cjs context --root <repository> --query cancellation
node <skill>/scripts/documentation.cjs snapshot --root <repository> --paths src/queue.ts,src/store.ts
node <skill>/scripts/documentation.cjs facts --root <repository> --snapshot <hash> --path src/queue.ts
node <skill>/scripts/documentation.cjs extract --root <repository> --snapshot <hash> --path src/queue.ts --symbol <declaration-id>
node <skill>/scripts/documentation.cjs diff --root <repository> --base <old-hash> --target <new-hash>
node <skill>/scripts/documentation.cjs validate --root <repository> --snapshot <new-hash>
```

`context` uses the same bounded selection engine as managed knowledge. With
`--paths`, it captures only those source paths and retrieves directly applicable
canonical notes. Use `--snapshot` to pin an existing capture and optional
`--symbol` with a single path for exact declaration extraction. Without a snapshot
or paths, the query returns populated title matches and handles without reading
note bodies or initializing documentation. Selection is partial; a title miss
does not establish absence. Source and note bodies share a three-item limit and
a 4?64 KiB JSON budget (`--max-bytes`). Oversized records defer whole.

All cited note evidence must match the supplied snapshot and current files before
prose is returned. Missing/stale notes remain handles; the helper never refreshes
their hashes from code alone. It writes no documentation. Include additional
cited paths explicitly when a note spans several files.

Immutable snapshots live under `.build/documentation`, excluded from inventory.
Default selection includes at most 512 source and configuration files. Explicit
paths narrow selection. Coverage is explicit: missing files in partial captures
do not prove deletion. Readers exclude private paths and obvious credential
content, reject links and bound file sizes. This is not a general secret scanner.

Facts expose supported parser-derived signatures and declaration metadata.
Parse coverage and declaration coverage are separate. Unindexed function forms,
CommonJS assignments, class fields and type declarations are reported explicitly;
successful parsing does not establish a complete symbol inventory.
JavaScript/TypeScript syntax support is not an LSP, inferred type system or
complete dependency graph. Unsupported languages retain exact-file retrieval.
Declared return types do not explain runtime meaning. Exact extraction returns
its hash and refuses silent truncation. Facts responses are capped at 64 KiB.

Diff identifies changed declarations, directly cited notes, directly linked
handoff checks and unplaced paths. It writes no prose and runs no models.
It names `unobservedSections` when either snapshot omits their sources and keeps
`reviewComplete` false for partial captures. An empty change list is not a
complete review of omitted sections.
File-level evidence is conservative: changing one declaration can require
checking other notes citing that file. Dynamic dependencies remain unresolved.

Validation checks fields, IDs, addresses, document links, relationships, pinned
evidence, live source changes and declaration anchors. Uninspected notes remain
gaps even when structurally valid. `checkComplete` and `evidenceVerified` expose
unfinished checks separately from structural validity. Missing evidence in a
supplied snapshot is an error. Validation does not certify semantic prose.

## Upkeep

Refresh generated facts first. Read affected prior notes, changed source and
relevant neighbors. Revise affected semantic fields only. Preserve unrelated
notes and owner goals. Record missing context instead of guessing. Update
evidence after checking the target snapshot. Exact unchanged source needs no
semantic rewrite; syntax similarity alone does not establish unchanged behavior.

The helper does not watch repositories, enable Knowledge, dispatch workers or
change model allowances. Respect a known Paddock Off setting.
