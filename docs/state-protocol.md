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

## Transport (A4, opt-in)

Code: `electron/state-sync.cjs` (`ProjectionHistory`, `StateConnection`, `chunkFrames`, `reassembleChunk`). Fixture: `tests/fixtures/state/transport.json` (chunk cases and limits; regenerate with `node tests/fixtures/state/generate-transport.cjs`).

Protocol 2 is off by default. It turns on with the `stateSyncV2` setting (`dock.call('settings', {stateSyncV2: true})`), the `--state-v2` flag or `PADDOCK_STATE_V2=1`. Off, the renderer gets `dock:state` and phones use `/v1/events`, as before. Turning the setting off closes v2 phone sockets (1012) and returns the renderer to `dock:state`.

### Server behaviour

- `hello` subscribes on its own: the server answers `welcome` and then a `changes` batch for the listed slices. `subscribe` is only for changing the slice list later; it issues a new subscription id and a new `welcome`. Batch numbers restart at 1 for each subscription.
- Acknowledge `changes` only. `welcome`, `ping`, `error` and the transport frames below need no ack.
- Resume: a `hello.lastRev` in the current epoch resumes each slice from its revision when the server's history covers it (about 30 s or 4 MiB of changes). The change is one composed `patch` (with `order` when more than one commit is folded in) or `replace` built from the current value. Otherwise, and for another epoch, a missing slice or a revision ahead of the server, the slice gets a `reset`. Deletions travel in `remove` or in the reset value.
- Flow control: one unacknowledged `changes` batch per connection. Writes during that time mark slices dirty; after the ack the next batch is computed from the acknowledged revisions, never from queued intermediate frames. `resync` drops the batch in flight and resets the named slices.
- WebSocket water marks: sending pauses when the socket buffers 512 KiB or more and resumes below 128 KiB. Terminal frames are skipped while congested; the phone's terminal cursor stays put and the next read is a replay or checkpoint.
- Frames over 512 bytes are gzip-compressed (binary frame) when `hello.compression` lists `gzip` and the result is smaller; text frames are plain JSON. IPC uses neither compression nor chunks.
- Revocation is rechecked before every frame; a removed phone is closed with 1008 and gets nothing more.
- The server sends `ping{nonce}` every 15 s (with a WebSocket ping). Answer with `pong{nonce}`; any valid client message also counts. A phone that misses eight in a row (about two minutes, the backgrounded-phone grace) is closed.
- The server never closes a socket because the client reported `reconnect`. A new socket from the same phone closes the older one (1000, "Opened on another connection"), so opening a fresh socket and sending `hello{lastRev: null}` is the expected recovery.

### Chunks

A `changes` message larger than 128 KiB of JSON is sent as `chunk{subscription, batch, part, parts, data}` frames: `data` is the next slice of the message's JSON text, `part` counts from 1, `parts` is 2 to 512 and the joined text is at most 32 MiB. Reassemble with `reassembleChunk(buffer, chunk)`: `partial` waits, `complete` returns the parsed `changes` message for `applyServerMessage`, `reconnect` means a part was missing or invalid. Nothing applies until every part has arrived. A `welcome` discards a partial buffer; a part 1 for another batch replaces it.

### Phone `/v2/events`

Same authentication as `/v1/events` (bearer token, Tailscale peer, no Origin). With protocol 2 off an authenticated phone gets HTTP 404 and should fall back to `/v1/events`; an unknown token gets 401. When on, v1 `state.capabilities` lists `state.v2`.

Frames other than protocol messages share the socket; route them by `type` before `applyServerMessage`:

| Direction | Frame | Notes |
|---|---|---|
| phone to PC | `{type: 'request', id, method, payload}` | the v1 commands, unchanged methods and checks |
| PC to phone | `{type: 'reply', id, value}` or `{type: 'reply', id, error}` | reliable ordered queue, sent before state batches; 64 waiting replies close the socket (1013) |
| PC to phone | `{type: 'terminal', id, sequence, epoch, data, reset, cols, rows}` | as v1; select a console with the `subscribe` request method |
| PC to phone | `{type: 'extras', value}` | v1 snapshot fields that are not slices yet: `connection, previews, projects, imageJobs, imageJobsRunning, capabilities, alerts, unreadResults, resultVersion`; sent on connect and when they change |
| PC to phone | `chunk` | see above |

v1 `state` frames are not sent on `/v2/events`. Phone `capabilities` stay in `extras`, not in the `shell` slice: they describe this phone connection, while `shell` is built from the desktop store. Session items carry `launchId` in both v1 and the `sessions` slice; use `id` plus `launchId` as the terminal key.

### Desktop IPC

`window.dock.state.send(message)` sends `hello`, `subscribe`, `ack`, `resync` or `pong`; `window.dock.state.onMessage(callback)` receives `welcome`, `changes` and `error`. It throws when protocol 2 is off; `dock.call('state.protocol')` returns `{protocol: 2, v2, flag}`. While a v2 subscription is open, `dock:state` stops; a reload or renderer crash closes it and `dock:state` resumes. Subscribe to `sessions` and `panels`: the preload reads them to keep console identities for owner activity.

Codes kept out of the store are explicit reads: `dock.call('mobile.status')` returns the phone status with `pendingPairing.code`, and `dock.call('meshy.auth')` returns `{state, code?, url?, error?}`. Call them when `mobileStatus.pendingPairing` or `imageJobs.meshyAuth.state === 'waiting'` appears or changes.

### Tasks and results fields (B3-B4)

Desktop `tasks` items carry `acknowledgedAt`, `dismissedAt` and `supersededBy`; dismissed tasks leave the slice. Desktop `results` items carry `outcome` (`{type: 'task', verdict, outcome, changedFiles, checks, unresolved, usage}`) when a task wrote one. Phone tasks (`phone-task.json`) add `acknowledgedAt`, `dismissedAt` and `supersededBy`. The phone `results` slice stays `{unread, count}`; outcomes are read with `results.list` and `results.preview`. IPC: `tasks.acknowledge {id}` returns the task view, `tasks.dismiss {id}` returns true and refuses running tasks.

Not yet: v2 as the default, removal of full-snapshot publishing (A5), and IPC application pings.
