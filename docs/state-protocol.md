# State protocol 2

Contract for the main-process state store and its consumers: the desktop renderer (workstream C) and the phone app (workstream D). Code: `electron/state-protocol.cjs` (types, validation, reference client), `electron/state-store.cjs` (store), `electron/projections.cjs` (desktop and phone views, legacy adapter). Fixtures: `tests/fixtures/state/`.

Terminal output stays on its existing stream (`dock:output`, phone `terminal` frames with sequence and epoch). It is not a slice.

## Slices

Each slice has one writer. The table is `SLICES` in `state-protocol.cjs` and `slices.json` in the fixtures.

| Slice | Kind | Writer |
|---|---|---|
| `shell`, `preferences` | value | main |
| `sessions`, `panels` | collection | sessions |
| `queues` | value | messageQueue |
| `prompts` | collection | prompts |
| `tasks` | collection | taskLoop |
| `delegations` | collection | delegation |
| `projects`, `projectProposals` | collection | projects |
| `accounts` | collection | accountProfiles |
| `agents` | collection | cliSetup |
| `skills` | collection | skillPacks |
| `usage`, `usageHistory` | value | usage |
| `results`, `setupRequests` | collection | workbench |
| `imageJobs` | value | workbench |
| `tools` | value | sharedHub |
| `keyMetadata` | value | vault |
| `sshHosts` | collection | ssh |
| `mobileStatus`, `updates`, `screenshots` | value | their services |
| `alerts` | collection | alerts (reserved, not written yet) |

A collection is `{byId, order, meta}`. `order` lists every key of `byId` once. An item with an `id` field has `String(id)` equal to its key. `meta` holds small collection-wide fields, for example `results.meta.unread` or `agents.meta.setupBusy`.

Large reports, images, terminal bytes and ledger pages stay explicit reads.

## Views

The desktop sees every slice. The phone sees its own allowlisted slices with their own revisions (`PHONE_SLICES`):

| Phone slice | Kind | DTO |
|---|---|---|
| `shell` | value | `{capacity, version}` |
| `sessions` | collection | `fixtures/state/dto/phone-session.json` |
| `queues` | value | `{[sessionId]: {paused, entries[]}}` |
| `prompts` | collection | `{id, name, text, projectId, createdAt, updatedAt}` |
| `projects` | collection | `fixtures/state/dto/phone-project.json` (archived projects omitted) |
| `tasks` | collection | `fixtures/state/dto/phone-task.json` |
| `usage` | collection | `fixtures/state/dto/phone-usage-account.json`, one row per account; `check` carries the server's status and staleness (`electron/usage-reading.cjs`), a null `usedPercent` is unknown |
| `results` | value | `{unread, count}` |

A change the phone cannot see never advances a phone revision. Validators take the view: `validateServerMessage(message, 'phone')`.

## Revisions and cursors

Writers call `set(value)` or `patch({upsert, remove, order?, meta?})` after a successful save. Writes in one tick coalesce. Each changed slice gets one revision bump per commit. A value equal to the committed one (JSON equality) bumps nothing. `transaction(fn)` groups synchronous writes and discards them if `fn` throws.

`Cursor = {epoch, revs}`. The epoch is random per store start. Revisions are per view and per slice, start at 0 and are unrelated to project plan revisions.

## Changes

```
patch   {kind, slice, baseRev, rev, upsert: {id: DTO}, remove: [id], order?, meta?}   collections
replace {kind, slice, baseRev, rev, value}                                            values
reset   {kind, slice, rev, value}                                                     both
```

When `order` is absent, the client keeps its order minus removed ids and appends new ids in `upsert` key order. A batch changes each slice at most once.

## Messages

Client: `hello{protocol: 2, lastRev: Cursor|null, slices, compression: ["gzip"|"none"]}`, `subscribe{slices}`, `ack{subscription, batch}`, `resync{subscription, slices}`, `pong{nonce}`.

Server: `welcome{protocol: 2, epoch, subscription, slices, compression}`, `changes{epoch, subscription, batch, changes}`, `ping{nonce}`, `error{code, message}`. Error codes: invalid, epoch, subscription, duplicate, gap, unauthorized, unsupported.

Messages reject unknown fields.

## Client rules

`applyServerMessage(state, message)` in `state-protocol.cjs` is the reference. `sequences.json` replays it step by step and both Node and Dart tests must produce the same outcomes and states.

- `welcome`: adopt the epoch and subscription. In the same epoch, keep cached values for subscribed slices. A new epoch drops all cached values.
- `changes` with another epoch: `reconnect` (send `hello` with `lastRev: null`).
- Another subscription: `ignored`.
- `batch` at or below the last applied batch: `duplicate`; acknowledge again.
- A slice outside the subscription or an invalid message: `reconnect`.
- `baseRev` different from the cached revision: `resync` naming those slices. The whole batch is rejected; nothing changes.
- Otherwise `applied`: apply all changes, then notify and acknowledge.
- `ping`: answer `pong` with the nonce.

## Privacy

Slices hold allowlisted DTOs only. Credential values, OAuth material, pairing tokens and comparison codes, device-flow user codes, private keys, resolved environments and authorization headers never enter a slice. The store checks field names against `SECRET_KEY` (`slices.json` has the pattern): tests reject such writes; the app drops the fields and logs the slice and path. The phone pairing comparison code and the Meshy device code reach the desktop only through the legacy adapter's live overlay. A v2 desktop client reads them with an explicit call.

## Legacy adapter (until A5)

`electron/main.cjs` reads the services, splits today's snapshot into slices (`slicesFromLegacy`), writes each through its writer handle and rebuilds the snapshot from the desktop view (`legacySnapshot`). In test mode, a mismatch between the rebuilt and direct snapshot fails the call. The `tasks` slice is written from TaskLoop's `changed` events instead of the publish-time read.

Not in this step: `/v2/events`, v2 IPC, bounded history and resume, acknowledgement flow control, chunked resets and server pings (A4).
