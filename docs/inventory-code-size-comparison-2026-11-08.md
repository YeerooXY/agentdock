# Inventory code size comparison: maple and yew (8 November 2026)

Read-only source comparison at revision f3fadec. Nothing was executed by this review. Test results quoted below come from existing records; the coordinator reruns the suites separately.

## Provenance

- **maple**: plain Sol/medium session, round 2 (`.build/stockroom-round2/runs/plain-…/record.json`, `cwd` …\stockroom\maple).
- **yew**: Sol/medium coordinator with four Haiku/medium workers, round 4 (`.build/stockroom-round4/runs/paddock-…/record.json`, `cwd` …\stockroom\yew).
- Both records list the same four per-stage prompt hashes (`5f010f28…`, `f01bd5f8…`, `92c412d3…`, `44aede7e…`). Both manifests give the same prompts-file hash `89e8903d…`, and the two `prompts.json` files have identical text.
- The round 4 summary records 3 of 4 Haiku workers failing their first check, with fixes by the coordinator. It also notes that the comparison is a single treatment against an earlier baseline.
- The round 4 runner's `plain` folder (`pine`) is a different folder and plays no part here. The birch findings in earlier docs were not carried over to yew.

## Line counts

Convention: physical lines, meaning newline-terminated lines as counted by ripgrep `^`, which matches `wc -l`. Comments and blank lines are included. The earlier figures (342, 1100 and 1153) are one higher because the file viewer shows an empty final line.

| Production JS | maple | yew |
|---|---|---|
| Store | `lib/store.js` 341 | `src/store.js` 1,099 |
| Validation | (inside store) | `src/validation.js` 310 |
| Server/entry/config | `server.js` 83 | `server.js` 294, `index.js` 28, `config.js` 30 |
| CSV | `lib/csv.js` 10 | `src/csv.js` 58 |
| Client | `public/app.js` 341 | `public/app.js` 1,152 |
| **Total** | **775** | **2,971** |
| Blank or `//` lines | 10 | 365 |
| Lines over 160 characters | 93 | 0 |

Tests (reported separately): maple 869 lines (three Node suites plus a 272-line Playwright spec; 28 tests recorded). yew 2,053 lines in eight Node suites (93 tests recorded). The owner's approximate "840 vs 350" does not match any file or total measured here, so this document does not use it.

The ratio is about 3.8 to 1, but formatting accounts for part of it. maple packs whole validators into single lines, for example the 400-character conditions at `lib/store.js:73` and `:104`, and the template literal at `public/app.js:50`. yew uses one property per line and has 365 comment or blank lines. Characters and statements were not measured, so this review cannot separate formatting from design numerically. The paired examples below show design differences that remain after formatting is set aside.

## Requirement matrix (static inspection)

| Stage requirement | maple | yew |
|---|---|---|
| 1. Unique SKU, edit, search, archive, low-stock, file storage, whole numbers | Both. Search runs in the client. | Both. Search runs on the server with a debounce. |
| 1. Keyboard and errors | Field errors only in the product form. Other dialogs show one text error. | Field errors in every dialog, live regions, focus returns to the opener or the next row (`app.js:166-196`). **Stronger.** |
| 2. Migrate v1 into default location | `store.js:39-43` | `parseV1` `store.js:271-286` |
| 2. Atomic transfer, no loss or duplication | Clone the draft, validate the whole file, then temp-write and rename (`store.js:155-171`) | Clone the draft, check append-only, unique temp file, fsync and cleanup (`store.js:639-657, 1078-1092`). Write path **stronger.** |
| 2. Locations | User can add locations (`store.js:214-223`, `app.js:141-154`). **Extra.** | Fixed to two; files with any other locations are refused (`validation.js:12-15`, `store.js:288-294`) |
| 3. Multi-line all-or-none, request-ID idempotency, idempotent collect and cancel, archived blocked, restart | Both | Both |
| 3. Client retry after an unconfirmed response | Same key only while the dialog stays open and unchanged (`app.js:156,169`). A reload loses it. | Pending attempt kept in sessionStorage with fields locked and resent unchanged, including after a reload (`app.js:95-126, 1010-1139`). **Stronger, beyond the server requirement.** |
| 4. Append-only ledger, reasoned corrections, correcting link | Both. Prefix comparison on every write (`store.js:160`). | Both (`store.js:684-690`) |
| 4. Migration keeps completed actions | `legacyActions` lists (`store.js:49`) | `legacy: true` flags (`store.js:631-634`) |
| 4. History and CSV with formula guard | Both | Both |
| 4. Restart validation | One validator checks every loaded file **and every write** (`store.js:64-138, 161`) | Version parsers run at load only; `run()` checks only append-only |
| Cross-origin writes | Origin check (`server.js:28-29`) | No Origin check, and `readJson` accepts any content type (`server.js:201-208`). Unverified CSRF gap. **Weaker.** |
| Edit conflicts | `expectedRevision` (`store.js:248`). **Extra.** | Last write wins |

Static reading found no required behavior that maple omits. yew's extra lines buy field-level accessibility, persistent client retry, fsync durability and stricter file parsing (unknown keys and exact UTC timestamps). maple's lines buy dynamic locations, revision conflicts, an Origin check, and whole-state validation on every write.

## Paired examples

**1. Data model and derived state.** maple keeps one derivation: `physical()` and `reservedUnits()` (`store.js:12-16`), plus `view()` (`:147-153`), which returns a per-location `stocks` map that the client scopes. yew derives the same numbers twice. `toPublic` (`store.js:117-143`) returns the by-location maps together with scoped copies, and `quantity` and `physical` hold the same value (`:137-138`). The ledger fold appears in both `stockIndex` (`:75-84`) and `parseMovements` (`:519-525`). The hold accumulation appears in both `reservedIndex` (`:87-97`) and `checkHolds` (`:402-410`). Shared derivation helpers may remove these repeats; startup parsers must still validate persisted invariants. Removing the alias changes the API, so the tests and client would need updating.

**2. Validation, parsing and migration.** yew rebuilds the product record field by field four times (`store.js:275-282, 303-310, 592-598, 624-630`). It has a separate parser per version. `validateProductInput` and `validateProductUpdate` are near-duplicates (`validation.js:159-191`), and several small validators layer text, ID and numeric constraints (`:64-108`). Some encode distinct domain rules and are useful; `checkRequestId` delegates to `checkText`, while `checkProductId` validates an ID directly. They are not all wrappers over `parseWhole`. `parseWhole` also accepts strings because the client sends raw input values (`app.js:993, 565, 1060`). maple upgrades in place (v1→v2→v3→v4) and uses one validator for every version (`store.js:39-52, 64`). The migration checks themselves are required on both sides: backup comparison, refusing negative or overflowing balances, and link checks. The duplicated projections and wrappers are not required.

**3. UI request, error and dialog handling.** yew has three submit handlers with the same structure: a saving flag, a pending attempt, a remember step, a branch on whether the response was confirmed, and a lock (`app.js:1010-1045, 1047-1095, 1097-1139`). Supporting them are three `remember*` wrappers (`:113-126`), three lock functions with the same note text (`:494, 524, 655`), five cancel listeners (`:870-901`) and five `trapTab` calls (`:860-864`). The source shows the copying directly: "pendingReservation works like pendingTransfer" (`:74`, `:83`). maple has the same duplication in compressed form: an identical error ternary at `app.js:184, 256, 338`, four dialog `cancel` guards, and client validation that repeats server rules (`:100-102, 243-248, 328-330`). In yew, the retry semantics are justified and the copies are not. `trapTab` partly repeats what native modal `<dialog>` already provides; verify keyboard behavior in the required browser profiles before removing it.

**4. Wrappers and server boilerplate.** yew's generic static file server with traversal guards (`server.js:210-243`) serves four fixed files. maple uses a four-entry whitelist (`server.js:9, 63-68`), which is shorter and safe by construction. Four action branches repeat the same method check (`server.js:76-94`). `RequestError('Check the highlighted fields.', {status: 409, fields})` is built about eight times in `store.js`. In maple, the remains of earlier stages loop over single-element arrays (`for (const key of ['threshold'])`, `store.js:240`, `app.js:73,85,102`).

## Construction process

The records support three statements. The prompts were identical. yew had four workers, and three of them needed coordinator repair. Worker output was 484k tokens, against 68.6k for the coordinator. The source comments above show stage-by-stage copying.

Two explanations are plausible but unverified. Each worker may have added a parallel layer for its stage instead of reusing the previous flow. The coordinator's briefs may have asked for detail, such as strict parsing and field-mapped errors. The stage logs were not inspected. One run cannot show that model size causes the difference.

## Guardrails

- **Planning:** name one canonical stored representation (movements plus records, nothing derived), one derivation function, one transaction boundary that validates the whole next state, and one client request flow that every form reuses.
- **Builder brief:** list the existing functions to extend. Refuse new per-feature parsers, lock functions or result shapes unless a test needs a behavior the shared one cannot provide. State that the client sends typed JSON values.
- **Structural reviewer (one pass):** check for repeated object projections, parallel indexes, more than one representation of the same field in an API response, and handlers with the same shape. Run the same acceptance checks before and after any reduction.

## Ranked yew reductions

1. **Merge the client submit flows** into one pending-attempt helper (moving code). Highest payoff. Medium risk: keep the save-before-send order and the split between confirmed and rejected responses.
2. **Remove duplicated store derivations** (one product projection, one hold fold, one ledger fold). Low risk; the migration and ledger tests cover these paths.
3. **Replace generic static serving with a whitelist, and add the Origin check** (net deletion plus a security fix). Low risk; check the 405 `Allow` tests.
4. **Merge the product validators; inline pass-through wrappers only where clearer.** Preserve named validators that express distinct domain constraints. Typed client values would also remove string parsing, but that changes the API contract.
5. **Remove the `quantity`/`physical` alias and the scoped copies** from `toPublic`. Medium risk: client and test changes.

For maple, the useful additions from yew are the unique temp file with fsync and cleanup, field-mapped errors in every dialog, and possibly persistent retry. Reformatting maple's long lines would add lines; the amount was not measured.

## Recommendation and unknowns

Keep yew's accessibility, retry persistence and durable write path. Adopt maple's single validator for every write, its asset whitelist and its Origin check. Before claiming that yew keeps the same behavior with fewer lines, you would need: the 93 existing tests passing unchanged (or with recorded contract edits), v1, v2 and v3 migration fixtures, restart checks, and keyboard checks on all five dialogs.

Not established yet:
- character or statement counts
- runtime cost of maple's whole-file validation on every write
- whether the CSRF gap is exploitable in a browser
- whether maple would pass yew's scenarios (the APIs differ, so the test suites cannot be swapped)

This review gives no savings figure.

## Independent coordinator verification

Both existing Node suites were rerun after the source review: maple 28 passed, yew 93 passed, zero failures. These are different suites, not a common behavioral parity test. No browser or cross-site exploit checks were run for this comparison. No app source was edited.

The coordinator parsed and printed production JavaScript with the same installed esbuild printer (`target: esnext`, `minify: false`, `legalComments: none`), without executing or replacing the code. This is a formatting control, not a semantic proof.

| Consistent-format measure | maple | yew |
|---|---:|---:|
| Printed production JS lines | 1,053 | 2,507 |
| Printed store lines | 384 | 898 |
| Printed client lines | 569 | 989 |
| Printed production JS bytes | 69,702 | 99,982 |

Raw production source contains 68,285 versus 108,382 characters. Thus the raw line ratio of 3.8 falls to 2.4 under the same printer, and the printed byte ratio is 1.43. Formatting explains a substantial share of the line gap; source-level duplication and behavior differences still need individual assessment. These figures do not measure runtime speed, model cost, statement counts or full feature parity.
