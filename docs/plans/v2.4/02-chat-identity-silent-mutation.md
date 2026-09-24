# Plan 02 — Chat identity and silent mutation

**Status: DRAFT 2026-09-23, reconciled with `00-overview.md` §Reconciliation (X1, X2, X11, X18, X25). Depends on plan 01**: the T20 interop corpus the fixtures here join, the T1 identity snapshot this plan shares, and `docs/plans/v2.4/host-facts.md` (X9). Not started.

Written against HEAD `fcc33cc` plus uncommitted v2.3 edits (`memoryMirror.ts`, `effectsApplier.ts`, `stHost/*`, … are modified). Re-verify every cited line before building (rule 1).

## Goal

A chat's story state follows the chat as ST really mutates it:
- a blob this build cannot read is never overwritten;
- a message that changed without an event rewinds the story, and one that did not change never does;
- hiding is not deleting;
- a reload of the same chat is not a chat switch;
- a branch offers to continue, and never adopts on its own;
- a deleted chat's mirror book can be cleaned up;
- install-wide saves are read from evidence;
- requirements follow persona, group and lorebook changes as they happen.

**No blob version bump** (X1, rule 3). Every new field is an optional v4 field.

## Scope / out of scope

**In scope:**
- T11 downgrade guard + `minimum_client_version`
- T3 content fingerprints, with the X2 hash
- same-chat reload
- hidden ≠ deleted (D5)
- T2 branches (D3)
- T14: payload typing, the reaper with the in-book ownership marker, and stopping scene-row mirroring (X18)
- T8 install-wide save evidence + a self-healing watcher
- requirements refresh on persona, group and lorebook changes (X25)
- seed D: `commitDecision` id-keyed restore
- seed D out-of-horizon, as "branch from the oldest restorable point", **author view only** (X25)
- the X11 harness:
  - `expect.rollbackOutcome`;
  - a next-read-window assertion;
  - a branch-adopt UI verb;
  - cleanup that owns branch chats;
  - the generalised `attestation.test.mjs`

**Out of scope:**
- T1's decode itself (plan 01).
- Mirror key hygiene (roster/persona names in keys): **plan 05**, measured first (X18).
- "Swipe back to the consumed swipe is a no-op" and the swipe-back cache: v2.5 (X25). Fingerprints cannot deliver it, because swiping away already rolled back.
- Re-commit after a third-party rewrite (v2.5).
- Schema stamps on the library and wizardSessions (T11 follow-up; they carry no version, `storyLibrary.ts:30-47`).
- Persona Repair actions.
- Any player-surface change beyond the D3 branch notice.

## Verified current state (working tree, 2026-09-23)

| Claim | Seen at | Drift vs SUMMARY |
|---|---|---|
| Blob is v4 `{version:4, chatId, selectedStoryId, stories}` | `types.ts:307-320`, `persistence.ts:19` | — |
| Migration chain: v2 → `migrateMetadataBlob` → `migrateV3ToV4`; v3 → `migrateV3ToV4` | `persistenceMigration.ts:20-56,66-68`; `persistence.ts:49-55` | — |
| **An unknown version is destroyed.** Any other version, a missing `version`, or v4 with non-record `stories` goes to `migrateMetadataBlob` → null. `getMetadataBlob` then writes `createBlob()` into `chat_metadata`, and the next ST save persists it. This is why X1 forbids a bump | `persistence.ts:55,72-75`; `persistenceMigration.ts:23` | SUMMARY `:44-56`/`:69-72` → `:45-58`/`:72-75` |
| **v2.3 keeps a v4 blob object as-is.** `metadata[KEY] = current` is the stored object. Unknown top-level fields therefore survive its writes, which only replace `stories[id]` | `persistence.ts:49,56,156` | — |
| **v2.3 rebuilds the played story's record** on every persist from a fixed field list. An unknown per-record field is dropped (the X1 "worst a downgrade can do") | `runtimeManager.ts:575` | — |
| V5 foreign stamp: `belongsHere`, detached `createBlob()` with no write, `blobMismatch()`, `ownBlob` refusal, `adoptChatState` (restamps `chatId` only), `restampRenamedChat` | `persistence.ts:34,41-43,60-71,78-93,97-108`; `storySelection.ts:38-50,77` (corrected 2026-09-24: was `:36-47,71`; re-read on `9cb054a`) | SUMMARY `:57-67,75-80` → `:60-71,78-83` |
| Engine keeps ids only: `BoundaryContext {lastMessageId, chatLength}` | `engine.ts:11-14` | — |
| Hydrate has **no chat-length reconcile** | `runtimeManager.ts:525-556` (hydrate `:543`) | SUMMARY `:524-543` → `:525-556` |
| Every edit/swipe/update id rolls back, unchanged text included | `turnBridge.ts:171-189` (corrected 2026-09-24) | plan 01 T1 moved `onMutation` |
| Continue stamp keyed by `gen_finished`/length | `turnBridge.ts:24-29,96` (corrected 2026-09-24) | — |
| Same-chat CHAT_CHANGED = full switch: `reset()` drops pending, then `loadStory` → `invalidateRuns` → `owner.bump()` | `turnBridge.ts:160-164`; `runtimeManager.ts:78` (`invalidateRuns`), `:547` (`loadStory` calls it); `runOwner.ts:80-98` (corrected 2026-09-24) | — |
| **Hidden messages are already out of read windows**: `is_system === true` returns null, `/hide` emits nothing, and `source-removed` is set only by rollback | `chatWindow.ts:8`; `stores.ts:109-115`; `epistemic.ts:144`; `ledger.ts:95` | D5 holds in behaviour, untested |
| Branch reads as foreign (V5). `grep main_chat\|integrity src` = 0 | `storySelection.ts:36-47` | — |
| Mirror: the adopting path ensures a fresh book, sweeps `so_`-prefixed leftovers and binds the slot. Scene rows are mirrored and keyless (inert) | `memoryMirror.ts:53-54,58-64,83-89,93-105,115,127`; `extractionCoordinator.ts:300` | SUMMARY `:82-88,110,122` → `:83-89,115,127` |
| `bindChatLorebook` answers a string union, not a `WriteResult`. No unbind and no book delete in `src/` | `stHost/worldInfo.ts:153-172` | — |
| `CHAT_DELETED`/`GROUP_CHAT_DELETED`/`WORLDINFO_UPDATED` typed `[]` and unsubscribed | `stHost/events.ts:11-12,31` (corrected 2026-09-24) | — |
| Install-wide saves: unverified `saveSettingsDebounced()` | `storyLibrary.ts:69,110,119`; `settingsStore.ts:135,161`; `wizardSessions.ts:44,49` | — |
| Save watcher wraps `fetch` once and never re-checks. A lost wrap reads as "no save request went out", which is sticky, and `withLedger` then refuses every effect | `stHost/persistence.ts:25,57-77` (`observeNextSave` `:79`) (corrected 2026-09-24); `saveEvidence.ts:44-51`; `saveHealth.ts:18-31`; `effectsApplier.ts:181-189` | SUMMARY `:185` → `:181-189` |
| `GROUP_UPDATED`/`WORLDINFO_SETTINGS_UPDATED` only `notify()`. Requirements refresh only at commit, activate, load and rollback. `PERSONA_CHANGED` is unsubscribed. not-ready → ready effects apply only at the next boundary | `turnBridge.ts:64-65`; `runtimeManager.ts:266` (commit), `:273-275` (the not-ready → ready re-apply), `:299` (activate), `:555` (load), `:656-659` (`refreshRequirements`) (corrected 2026-09-24); `requirements.ts:7-28` | — |
| `commitDecision` puts back **whole arrays** captured before the save. Census row `partial` | `memoryQueue.ts:102-120` (callers `:125-235`) (corrected 2026-09-24: was `:102-121`, callers `:130-232`); `test/findings/ownership-sites.json:276` | — |
| E1 notice offers Restart only | `rollback.ts:77-86` (corrected 2026-09-24): `:57-66` on `9cb054a`; the §10 wrapper moved it | — |
| `attestation.test.mjs` hard-codes the records dir `v2.3-plan05-live` (`:16`) and a literal journey list (`:62`). Corrected 2026-09-24: on `9cb054a` the literal already read J0–J12 (V22b), so J12 WAS checked; the defect was the literal itself, which a J13 would silently fall outside of. Built in §10: both are now derived (`scripts/release/attestationChecks.mjs`) | `scripts/release/attestation.test.mjs:16,59-62` | X11 |
| Manager **677/700** lines, so new logic goes in new modules. Corrected 2026-09-24: **736/740 effective lines** (662 raw); the budget is 740 since V22b (`architecture.test.ts:17`), so the headroom is 4 lines, not 23 | `runtimeManager.ts` | SUMMARY 676 |
| `manifest.json`: no `minimum_client_version`, version `2.3.0`. README declares 1.18.0 as the older host and already lists 1.19.0 | `manifest.json`; `README.md:57-66` | — |

## Host facts (ST 1.19.0; rows land in `docs/plans/v2.4/host-facts.md`, X9)

| # | Fact | Where |
|---|---|---|
| H1 | A branch saves `{...chat_metadata, main_chat: sessionName, integrity: uuidv4()}`, so our blob and the chat lorebook slot travel | `bookmarks.js:199-201,231-233`; `script.js:7406`; `group-chats.js:2370` |
| H2 | A checkpoint does the same (`main_chat` = group `chat_id` or `characters[this_chid].chat`) | `bookmarks.js:282-290` |
| H3 | `main_chat` equals our stamp: `sessionName` and `ctx.chatId` are the same value. It holds one hop only. Legacy bookmarks set `main_chat` lazily | `script.js:8538`; `st-context.js:125-127`; `bookmarks.js:115-123` |
| H4 | `integrity` is minted on load if missing. Convert-to-group copies metadata and deletes `main_chat` | `script.js:7665-7667`; `group-chats.js:276-278`; `bookmarks.js:357-358` |
| H5 | `hideChatMessageRange` flips `is_system`, saves, emits nothing (`/hide`, `/unhide`) | `chats.js:147-169`; `slash-commands.js:1836,1859` |
| H6 | `messageEditMove` swaps adjacent entries, saves, emits nothing. Corrected 2026-09-24: it is not exported; its only caller is the editor's up/down buttons (`script.js:11939-11955`), and closing that editor emits `MESSAGE_UPDATED` for the **target** id only (`messageEditCancel` `:8337`; `messageEditDone` emits `MESSAGE_EDITED` + `MESSAGE_UPDATED`, `:8405`/`:8431`). So the host names one of the two rows it changed, the later one, and a rollback from that id misses the earlier row | `script.js:8353-8395` |
| H7 | Deleting a swipe below the current one decrements `swipe_id` with `mes` unchanged. Corrected 2026-09-24: `deleteSwipe` (`script.js:9339-9406`) does emit `MESSAGE_SWIPE_DELETED {messageId, swipeId, newSwipeId}` (`:9388`), which `turnBridge.ts:57` already hears (identity refresh only); no `MESSAGE_SWIPED`/`UPDATED` for a swipe below the current one (`:9395`) | `script.js:9368-9388` |
| H8 | `/persona-sync` renames every matching user row, saves, then `reloadCurrentChat` | `personas.js:1842-1869` |
| H9 | `reloadCurrentChat` re-reads the file (`chat_metadata` replaced by the server copy), then emits `CHAT_CHANGED` with the same id. Callers include a persona change on an untainted group | `script.js:1702-1727,7655-7700`; `group-chats.js:268-318`; `personas.js:1876-1881`. Corrected 2026-09-24: `reloadCurrentChat` is the mutex-bound export at `script.js:1703` (body `reloadCurrentChatUnsafe` `:1710-1724`), exposed as `ctx.reloadCurrentChat` (`st-context.js:130`); the persona caller is `setUserAvatar` → `retriggerFirstMessageOnEmptyChat` (`personas.js:163`, `:1875-1882`) |
| H10 | `CHAT_DELETED(name)`, name without `.jsonl` | `script.js:1349-1354,1401,10882-10884` |
| H11 | `GROUP_CHAT_DELETED(chatId)`. `deleteGroup` emits it **before** checking `response.ok`. Corrected 2026-09-24: only `deleteGroup` (`:1323-1337`) does; `deleteGroupChatByName` (`:2242-2270`, emit `:2269`) and `deleteGroupChat` (`:2279-2310`, emit `:2308`) emit after an ok answer, but `deleteGroupChat` splices the id out of `group.chats` before the request, so a failed delete leaves the client list without a chat the server still holds | `group-chats.js:1328-1337,2269,2308` |
| H12 | `WORLDINFO_UPDATED(name, data)` | `world-info.js:4160` |
| H13 | `deleteWorldInfo(name)` → boolean: deletes, evicts the cache, unselects, refreshes the list | `world-info.js:4346-4393` (corrected 2026-09-24) |
| H14 | Keyless non-constant WI entries never activate (unless sticky) | `world-info.js:4898-4907` (SUMMARY; re-verify) |
| H15 | `saveSettings` never rejects. It defers silently while not ready, toasts on error, and emits `SETTINGS_UPDATED` only after 2xx | `script.js:8051-8114` |
| H16 | `/api/settings/get` returns `settings` as a JSON string and reads every preset directory per call | `src/endpoints/settings.js:219-268`; client `script.js:7913-7931` |
| H17 | `minimum_client_version` is checked via `versionCompare`. A failing extension is not loaded | `extensions.js:580-590,658-660` |
| H18 | `PERSONA_CHANGED(avatar)`. ST restores the chat persona in its own `CHAT_CHANGED` listener | `personas.js:154-167,1543,3004` |
| H19 | (added 2026-09-24) Closing the message editor with Done emits `MESSAGE_EDITED` and `MESSAGE_UPDATED` for the id **whether or not the text changed**, so a no-op edit is indistinguishable from an edit by its events | `script.js:8397-8435` (emits `:8405`, `:8431`); opened by the delegated `.mes_edit` click `:11829-11858` |

## Design

### 0. Schema: optional v4 fields, no bump (X1)

```ts
interface StoryOrchestratorMetadataBlob {       // still version: 4
  version: 4;
  chatId: string | null;
  integrity?: string | null;                    // NEW, optional: chat_metadata.integrity at the last own save
  selectedStoryId: string | null;
  stories: Record<string, PersistedStoryRuntime>;
}
interface PersistedStoryRuntime {
  …existing fields…;
  fingerprints?: MessageFingerprints;           // NEW, optional; absent = unknown, never a mismatch
}
interface MessageFingerprints { v: 1; from: number; hashes: Array<string | null> } // hashes[i] ↔ messageId from+i
```

- **Upgrade (v2.3 blob read by v2.4):** nothing to migrate.
  - A missing `integrity` means unknown. It is stamped at the next own save, like `chatId` (`persistence.ts:153-155`).
  - A missing `fingerprints` means unknown. The length check (§2) still runs.
- **Downgrade (v2.4 blob read and written by v2.3):**
  - v2.3 keeps the blob object (`persistence.ts:49,56`), so `integrity` survives.
  - Its first persist rebuilds the played record (`runtimeManager.ts:575`) and drops that record's `fingerprints`. That is harmless, because on re-upgrade the record reads as unknown.
  - Other stories' records are untouched. Their fingerprints stay valid, because v2.3 changes only the loaded story's state.
- **Stale `integrity` after a downgrade:** v2.3's `adoptChatState` restamps `chatId` only (`persistence.ts:90`). So a blob whose `chatId` matches but whose `integrity` differs was adopted explicitly. It is restamped at the next own save and journaled `integrity-restamped`, never treated as foreign. `integrity` is **advisory**: it only classifies an already-foreign blob (§5) and a same-chat reload (§3).
- Invariants: 13 (no version change, because nothing changes shape), 12, 17.

### 1. T11 guard + host minimum (for future bumps)
- An **unrecognized** blob is read **detached**, on the V5 foreign-stamp path. "Unrecognized" means any value under the key other than v2/v3/v4 with the right shape: v5+, a non-numeric version, a missing version, or broken `stories`.
  - `blobMismatch()` gains `kind: "foreign" | "unreadable"` plus `foundVersion`.
  - `getMetadataBlob` returns `createBlob()` and writes nothing.
  - `ownBlob` and `restampRenamedChat` refuse.
  - `adoptChatState` refuses for `unreadable`, and `selectStory` reports "saved by a newer Story Orchestrator (vN): update, or Restart to replace it".
  - A confirmed Restart is the only overwrite. The event is journaled `blob-unreadable`.
- `manifest.json` gets `"minimum_client_version": "1.18.0"`. `scripts/release/manifest.test.mjs` asserts it equals README's "Declared older host" row (`README.md:66`).
- Lives in `persistence.ts` (~20 lines); `persistenceMigration.ts` stays pure. Invariants: 13, 2 (H17).

### 2. T3 content fingerprints (`runtime/fingerprints.ts`, pure; hashing in the runtime, inv 1)
- **Hash (X2)** = FNV-1a/32 (the `hash.ts` scheme) over `stable({mes, is_user, name: is_user ? null : name})`.
  - No `swipe_id`: H7.
  - No `is_system`: D5.
  - No user-row `name`: H8.
- **Capture** at `commitBoundary`, before `persist`, of the ids in `(previousLastMessageId, lastMessageId]`.
  - A continue/appendFinal boundary **re-hashes** `lastMessageId`. `turnBridge.ts:24-29` already classifies it and passes `{continued}` through.
  - The list is truncated at the history floor (`engineHistory.from.messageId`), so its size follows the rollback horizon (≈11 B/message).
  - It is written in the commit's own persist, not as a `boundaryWork` entry, because it must land in the same write as its boundary (inv 22 untouched).
- **Reconcile** `diffFingerprints(stored, chat) → {firstMismatch | null}` runs at the boundary (before `engine.commitBoundary`), at hydrate (after `engine.hydrate`) and on a same-chat reload.
  - A `null` or absent hash is unknown, never a mismatch.
  - A chat **shorter** than `lastMessageId+1` is a mismatch at `chat.length`. This check also runs for records without fingerprints: it catches a branch tail or a truncation made while SO was off.
  - A mismatch at `m` goes through `runRollback(m)`, E1 included, and is journaled `eventless change at message m`.
- **Mutation events:** an `edit`/`update` whose hash is unchanged is a **no-op**: no rollback, no `noteMutation`, turnKeys kept. A swipe changes `mes`, so it falls through. `delete` is plan 01's T1.
- **Rollback ≡ replay (inv 11):** after restoring boundary B, fingerprints are truncated to `B.lastMessageId`, which is what replay to B holds.
- Invariants: 1, 3, 10 (reconcile holds a `RunToken` across its awaits), 11, 13.

### 3. Same-chat reload (`runtime/chatIdentity.ts`)
- `TurnBridge.onChatChanged` calls `classifyChatChange()`.
- **same-chat** requires all three: `openChatId === owner.claimedChat()`, the loaded `chat_metadata.integrity` equals the integrity recorded at load, and the server copy's selected `engineState.boundary` equals the engine's.
  - Keep pending boundaries, turnKeys, the epoch and runs (no `bump`, no `reset`).
  - Reconcile fingerprints against the reloaded `chat[]`. Nothing is re-hydrated: the next persist writes through `getMetadataBlob` into the new metadata object.
- If the boundaries differ (another tab, or a lost save), today's full reload runs and is journaled `reload-diverged`.
- Anything else is today's switch.
- Invariants: 10 (tokens stay valid because the world did not change, and the classification is the evidence), 17.

### 4. Hidden ≠ deleted (D5)
No new behaviour. D5 is pinned by tests so that nothing later in v2.4 can break it:
- T3 does not hash `is_system`.
- Plan 01 T1's key has no `is_system` (X3).
- A re-read over a hidden source (`rereadConflictWindow`, reconcile reads) reports `hidden`. It never reports "evidence gone" and never quarantines.

Facts from hidden messages stay `live`, and unhide returns the message to future windows.
- Invariants: 4 (hidden text is out of the window, so it cannot be evidence), 11 (hide is not a mutation).

### 5. T2 branches (D3; `chatIdentity.ts` + drawer/HUD)
- **Detect** on load: the blob reads foreign, and `chat_metadata.main_chat === mismatch.stampedFor`, and `blob.integrity` is absent or differs from `chat_metadata.integrity`. The result is `snapshot.chatIdentity = {kind: "branch", parentChat, checkpointName}`. Anything else stays `kind: "foreign"`, including convert-to-group (H4).
- **Notice:** non-blocking `#so-branch-notice` in the drawer Overview plus a HUD chip, with **Continue from here** (`#so-branch-continue`). No popup and no auto-adopt (V5, D3). Checkpoint names only (inv 9).
- **Continue from here:**
  1. `adoptChatState()` restamps `chatId` + `integrity`.
  2. `selectStory` hydrates.
  3. The §2 reconcile rolls back to the branch tail: a shorter chat rolls back at `chat.length`; a swipe-branch at the first changed id. Past the horizon, the E1 notice applies.
- **While unadopted:** if the chat slot names the parent's mirror book, `unbindChatLorebook(name): WriteResult` clears the slot (new in `stHost/worldInfo.ts`, exact match only) and saves. Our foreign blob stays byte-identical. The unbind runs behind a `RunToken` (inv 10) and returns a typed result (inv 16). On adopt, the existing path binds a fresh per-branch book (`memoryMirror.ts:83-89,127`).
- **Out-of-horizon (seed D, X25), author view only:** the E1 panel gains **Branch from the oldest restorable point** = `/branch-create` at `engineHistory.from.messageId`. In that branch, Continue from here restores `base` exactly. Offering it to players waits for a player session (rule 7).
- Invariants: 12, 9, 10, 16, 14 (the gated WI replay runs on adopt through the existing hydrate).

### 6. T14 mirror lifecycle (`runtime/mirrorReaper.ts`; X18, X25)
- **Typing** in `events.ts`: `CHAT_DELETED: [name: string]`, `GROUP_CHAT_DELETED: [chatId: string]`, `WORLDINFO_UPDATED: [name: string, data: unknown]`.
- **In-book ownership marker.** When the mirror adopts a book, it writes one entry:
  - comment `so-owner`, hyphenated so the `so_` stale sweep never touches it (`memoryMirror.ts:58-64`);
  - no keys, so it is inert (H14), and disabled after the write, because `upsertWIEntry` re-enables what it writes;
  - content `{"owner":"story-orchestrator","chatId":…,"integrity":…,"createdAt":…}`.

  A missing marker means "not provably ours", and such a book is never reaped. Books from before the marker are handled by the Repair row only, never automatically.
- **Reap:**
  1. On a delete event, candidates are listed books whose name ends in ` - <lorebookFileId(chatId)>` (exact) **and** whose `so-owner` marker names that `chatId`.
  2. The reaper **confirms the chat is really gone** (H11): for a group, the id is not in `group.chats`; for a solo chat, it is not in `/api/characters/chats`.
  3. The player is asked to confirm.
  4. Deletion goes through the new `deleteLorebook(name): WriteResult` over `deleteWorldInfo` (H13).
  5. A declined or unverifiable reap becomes a session Repair row, "orphaned story-memory lorebook" (area `lore`).

  Never automatic (inv 16, destructive).
- **Stop mirroring scene rows:** `mirroredEntries` drops `scene`. The existing stale sweep disables already-written scene entries on the next sync (`memoryMirror.ts:93-105`). Scene history stays injected through `memorySceneHistory`.
- Key hygiene is **not** here (plan 05, X18).
- Invariants: 16, 15, 2.

### 7. T8 install-wide save evidence (`stHost/persistence.ts` + stores)
- **Watcher self-heal:**
  - keep a reference to our wrapper, and re-wrap in `observeNextSave` whenever `globalThis.fetch !== ours`;
  - report each request once, keyed by a `WeakSet` of `init` objects, so a chained old wrapper plus a re-wrap cannot double-report.
- **Settings saves:**
  - also observe `/api/settings/save`, through `observeNextSettingsSave()` plus `SETTINGS_UPDATED` (H15);
  - library saves are read back through `/api/settings/get`, comparing `v2Stories[id].{version, updatedAt}`, at most once per save burst (H16);
  - `Saved "X" vN to the library.` is shown only on evidence; otherwise `Saving "X" vN… not confirmed`, with the reason journaled.
- Chat-save predicates stay as they are (seed E asymmetry kept).
- Invariants: 17, 2, 18.

### 8. Requirements refresh (`runtime/requirementsWatch.ts`; X25)
- Subscribe `PERSONA_CHANGED`, `GROUP_UPDATED` and `WORLDINFO_SETTINGS_UPDATED`; the last two replace the bare `notify()` at `turnBridge.ts:60-61`.
- After a 250 ms debounce, refresh requirements.
- On not-ready → ready with `lastAppliedCheckpointId !== active`, apply the checkpoint in `hydrate` mode under a `RunToken`. This is the call `commitBoundary:258-260` already makes, moved earlier.
- ready → not-ready changes nothing destructive.
- Lorebook selection is read from `selected_world_info`, not the debounced mirror (`worldInfo.ts:184-193`).
- Invariants: 10, 14, 13.

### 9. Seed D: `commitDecision` id-keyed restore (`memoryQueue.ts`)
- `restore` becomes `{store, before: Map<id, row | ABSENT>, wrote: Map<id, row>}`.
- On a lost save, each touched id is put back only if the current row **is** the one written (compare-and-set, the `effectLedger.ts:52-68` shape).
  - Rows added meanwhile are kept.
  - Rows changed by someone else are left alone and reported `externally-changed` on `[data-so="decision-refused"]`.
- The census row moves from `partial` to `checked`.
- Invariants: 10, 11, 17.

### 10. Harness this plan builds (X11)
- **`expect.rollbackOutcome`**: `{result: "applied"|"noop"|"history-unavailable", fromMessage?, reason?}`. It reads the last `runRollback` outcome, recorded in-memory on the manager's notices. It is added to `scenarioSchema.mts`.
- **Next-read-window assertion**: `expect.nextReadWindow: {includes?: number[], excludes?: number[]}`. It asks `getChatWindow` for the window the scheduler would read next. An empty window, or a window outside the chat, fails rather than passing vacuously.
- **Branch-adopt UI verb**: `so-ui.mts branch-continue` and scenario `ui: {action: "branch-continue"}`. It clicks `#so-branch-continue` after a `hit-test`.
- **Cleanup that owns branch chats**: `branch_create` records each created chat name in the run ledger. `so-journey`/`so-scenario --sandbox` cleanup deletes only recorded names, after the pinned group is re-opened (the gotchas' `/delchat` rule). The cleanup record reports `cleanup.branchChats {deleted, failed, leaked}`, and a leak fails the run.
- **Generalised `scripts/release/attestation.test.mjs`**:
  - the records root is read from the attestation (not `:16`'s literal);
  - the journey set is read from `test/journeys/*.journey.json` (not `:62`'s J0–J11, which misses J12);
  - every run is reported, not only the first two;
  - the served-bundle check (`served.sha256` vs `build.attested.bundle.sha256`) is kept.
- `npm run test:debug` covers every new verb against a fake page. `npm run test:release` covers the attestation.

## Order of work (failing fixture first, T11 before T3)

1. **Harness first** (§10). Every later fixture asserts through it.
2. **Fixtures red**, in the plan-01 corpus, each with its H#:
   - unrecognized blob (v5 shape)
   - `/hide` consumed (H5)
   - `messageEditMove` (H6)
   - swipe delete below current (H7)
   - `/persona-sync` (H8)
   - same-chat reload (H9)
   - no-op edit
   - branch and checkpoint (H1-H3)
   - chat delete and a failed group delete (H10-H11)
   - swallowed settings save (H15)
   - `fetch` restored by a peer
   - persona change (H18)
3. **T11** guard + manifest minimum.
4. **Seed D `commitDecision`**.
5. **T3** fingerprints (optional v4 fields), plus the D5 tests.
6. **Same-chat reload**.
7. **T2**, then the out-of-horizon author option.
8. **T14**, **T8**, **requirements refresh**.
9. Live gates.

## Tests and gates

**Jest:**
- `persistenceDowngrade.test.ts`, **both directions**:
  - over a captured real v2.3 blob (`test/fixtures/v4-chat-blob.json`, new, provenance in file) and seeded generated ones, v2.4 reads it with every field deep-equal;
  - a v2.4-written blob run through a **frozen copy of v2.3.0's read and persist path** (`storedBlob` + `savePersistedRuntime` + the `:575` record build, inlined in the test with the source commit and hash cited) keeps `selectedStoryId`, every record's `engineState`/`engineHistory`/`extras` and the blob's `integrity`;
  - only the played record's `fingerprints` are lost, and v2.4 then reads that record as unknown with the story intact.
- `blobUnreadable.review.test.ts`:
  - for v5, `"4"`, no version and broken `stories`, `JSON.stringify(chat_metadata)` is byte-identical after `getMetadataBlob` and after every automatic write;
  - explicit select is refused;
  - Restart overwrites only after confirm.
- `fingerprints.test.ts`:
  - the hash ignores `swipe_id`, `is_system` and the user `name`, and reacts to `mes`, `is_user` and the character `name`;
  - absent means unknown;
  - a shorter chat is a mismatch at `chat.length`;
  - the continue re-hash;
  - truncation ≡ replay (seeded, the `rollbackReplay.property` pattern);
  - a stale `integrity` with a matching `chatId` is restamped, not read as foreign.
- `turnBridge.review.test.ts`: a no-op edit gives no rollback and no `noteMutation`.
- `chatIdentity.review.test.ts`:
  - same-chat vs diverged vs switch;
  - branch vs foreign;
  - the one-hop limit;
  - convert-to-group is foreign.
- `mirrorReaper.review.test.ts`:
  - exact suffix (`-12` ≠ `-123`);
  - no marker means no reap;
  - a marker naming another chat means no reap;
  - H11 announce-without-delete is refused;
  - confirm is required.
- `stHost/persistence.test.ts`: re-wrap after a peer restore; one report per request.
- `memoryQueue`:
  - a row added during the save survives the put-back;
  - a changed row is reported `externally-changed`.
- Census rows for every new write-after-await (unbind, marker write, reap, requirements apply, reconcile rollback). `typedResults.test.ts` covers `unbindChatLorebook`/`deleteLorebook`. `faultMatrix.json` gets updated rows. `architecture.test.ts` budgets hold (manager ≤740 effective lines, zero net growth from 736; corrected 2026-09-24: was "≤700, target ≤690").

**Mutation checks** (`test/findings/mutations/P02-*.txt`). Remove one guard at a time; each must fail exactly its own case:
1. drop the unrecognized-blob branch
2. hash `swipe_id`
3. hash `is_system`
4. hash the user `name`
5. drop the continue re-hash
6. drop the no-op-edit short-circuit
7. drop the length reconcile
8. same-chat without boundary equality
9. unbind without the token check
10. reap without the absence check
11. reap without the marker check
12. whole-array restore in `commitDecision`
13. watcher without the `WeakSet` dedupe
14. attestation with a literal J-list

**Scenarios** (`test/scenarios/plan02-*.json`):
- `downgrade-guard` (`seed_metadata` a v5-shaped blob, save, read the server file back)
- `noop-edit` (`expect.rollbackOutcome` none)
- `message-move`
- `hide-consumed` (`expect.nextReadWindow.excludes`)
- `swipe-delete-below`
- `persona-sync`
- `same-chat-reload`
- `branch-continue` (`ui: branch-continue`, `expect.rollbackOutcome.applied`)
- `checkpoint-continue`
- `chat-delete-reap`
- `requirements-refresh`

**Journeys** (`--strict`, twice consecutively, archived; X25 adds J4):
- **J6 ×2**, plus J6.10 no-op edit, J6.11 `/hide` consumed, J6.12 message move.
- **J10 ×2**, plus J10.12 the downgrade round trip over the captured blob, J10.13 unrecognized blob detached, J10.14 branch Continue from here.
- **J4 ×2** (return-and-adopt, touched by adopt).

**Gate commands** (CLAUDE.md tier "runtime / UI / ST-facing"):
- `npm run typecheck && npm run typecheck:test && npm run lint && npm test && npm run build && npm run test:release && npm run test:debug`
- `node scripts/debug/st-session.mts reload`

**Live checks** (real LLM, headed, profile selected, no `debugResponse`; `so-run-header capture`/`diff` around the batch):
1. Branch mid-story: notice, then Continue, then the next real reply commits from the tail.
2. No-op edit on a consumed reply: no rewind.
3. `/hide` of a consumed message: the next real read's window excludes it, and its facts stay live.
4. Same-chat reload mid-read (persona switch on an untainted group, H9): the read lands and the pending boundary is kept.
5. Deleting a story chat: the reap is offered, and the book is gone after confirm.
6. Persona switch: requirements go green without a turn.
7. **Clean-host downgrade leg** (X25, `scripts/release/clean-host.sh`):
   - play two turns on v2.4, check out the 2.3.0 tag and play one turn, return to v2.4;
   - the story continues from v2.3's boundary;
   - the played record reads its fingerprints as unknown;
   - `integrity` is intact.

Records go under `test/journeys/records/v2.4-plan02/`.

## Risks

- **Fingerprint false positives.** Any writer of a consumed `mes` rewinds the story; that is intended, and noisy for a rewriting extension. A host-side whitespace normalisation would rewind every chat once. Mitigations: the journal names the message, and there is at most one rollback per reconcile.
- **Downgrade loses fingerprints** for the played story. Until the next boundary re-captures them, only the length check guards that record. This is accepted (X1).
- **Same-chat misclassified.** Toward "diverged", it falls back to today's path, which is safe. Toward "same", it would keep a stale run, hence the boundary equality read from the copy ST just loaded.
- **The branch notice is new player copy** without a player session. D3 allows it; keep it to checkpoint names and one button.
- **The reaper is destructive and driven by an event ST emits even on failure** (H11). The absence check and the marker check are the guards, so their mutation checks are mandatory.
- **Books mirrored before the marker existed are never reaped** automatically. The Repair row is the only path.
- **`/api/settings/get` is heavy** (H16). It is rate-limited to one read-back per save burst.
- **Manager budget** (736/740 effective lines; corrected 2026-09-24: was 677/700): every item lands as a module plus a delegation line, and a delegation line has to be paid for by editing an existing one.

## Unresolved questions

None open. Q1 (blob bump) was answered by X1, Q2 (the hash) by X2, and Q3 (key hygiene) moved to plan 05 by X18.

## Gate record

_Placeholder: date, commands and results, mutation tallies, live checks with record paths under `test/journeys/records/v2.4-plan02/`, deviations._

### Harness + red fixtures (worktree build, 2026-09-24)

Built on `9cb054a` in a worktree, Order of work steps 1 and 2 only. Machine gates only: no browser, no
backend and no `npm run build`, so **no fixture below has been run, red or green**. Nothing here is live-green.

**Harness (§10), as built**
- **`expect.rollbackOutcome`** `{result: applied|noop|history-unavailable|none, fromMessage?, reason?, since?}`.
  - `runtime/rollback.ts`: `runRollback` now wraps `rollbackOnce` and records `deps.notices.lastOutcome =
    {seq, result, fromMessage, reason?, at}` (`rollbackRecord`). `runtimeManager.ts` changed by **0 lines**
    (736/740 effective, unchanged); the manager's notices object carries the new optional field at runtime.
  - The harness reads `storyOrchestratorRuntime.notices.lastOutcome` (a TS-private field, a plain property at runtime).
  - `since` names a `record_state` label; recordings now carry `rollbackSeq`. `result: "none"` requires `since`,
    because without it every rollback the page ever ran would count.
  - Census: the old `rollback.ts#runRollback` and `#runRollback.unavailable` rows moved to `#rollbackOnce` and
    `#rollbackOnce.unavailable` (same status, same notes). `#runRollback` is now the wrapper, `local`: its only
    write after the await is the in-memory notice.
- **`expect.nextReadWindow`** `{includes?, excludes?}`. **Deviation:** the plan says the harness "asks
  `getChatWindow`", but the scheduler's cursor (`cadenceTo`) is private and in no snapshot. The harness could
  only have replicated the window, and a replica cannot fail on the product's own filter. So one product seam
  was added:
  - `ExtractionScheduler.nextReadWindow(lastMessageId)`: the first queued job that carries a window, else the
    cadence window the next boundary would schedule, built by the real `getChatWindow`;
  - `globalThis.storyOrchestratorScheduler = {nextReadWindow}` in `runtime/index.ts`, cleared on dispose and typed
    in `global.d.ts`.

  An empty window, or one outside the chat, fails instead of passing vacuously.
- **`ui: {action: "branch-continue"}`** and **`so-ui.mts branch-continue`**. It opens the drawer Overview (a
  failure there is reported with the result, not thrown first), hit-tests `#so-branch-continue`, clicks its centre
  with a real pointer, and waits for `#so-branch-notice` to go. Today it fails as `missing`, "no branch notice is
  showing (… a build without the plan 02 §5 notice)".
- **`branch_create: {mesId?, kind?: "branch"|"checkpoint", name?, open?}`**.
  - It runs `/branch-create` or `/checkpoint-create mesId=N`, and `--sandbox` only.
  - It adopts the new chat into the sandbox guard and records it in `guard.branchChats`. It refuses a name that
    existed before the run, a page that left the pinned group, and a branch the page is not on.
  - Cleanup: `cleanupBranchChats` runs after `deleteSandboxChats` in both runners. It re-opens the pinned group,
    deletes only recorded names that are still present, waits out the 1 s group-save debounce and reads the server
    back. The report is `cleanup.branchChats {recorded, deleted, failed, leaked}`. `so-scenario` fails the run on a
    leak, a failure or an error; `so-journey` fails it through `readCleanup`.
- **Generalised `attestation.test.mjs`**, over the new `scripts/release/attestationChecks.mjs`:
  - the records root is the attestation's own `evidence.journeys`, and a root outside the repo is refused;
  - the journey set is `test/journeys/*.journey.json`;
  - every run of every journey is printed (26 lines on `docs/release/2.3.0/attestation.json`);
  - the served-hash check is unchanged.

  Synthetic cases name a catalog J13 the attestation omits, and an attested id with no journey file.
- **`scenarioSchema.mts`** gains the verb `branch_create`, the expect keys `rollbackOutcome`/`nextReadWindow` and
  the UI action `branch-continue`. Their value shapes are checked at load by the same parsers the runner uses.

**Tests added**
- node:test: `scripts/debug/lib/identityVerbs.test.mts` (17) and `so-ui.test.mts` (+3). They cover every new verb
  against a fake page, the vocabulary, and `runSteps` dispatch.
- jest: `rollback.review.test.ts` (+2) and `extraction/scheduler.test.ts` (+4). One of the four checks that the
  predicted window equals the one the next boundary actually reads.
- release: `attestation.test.mjs` (+3).

**Gates** (worktree, no `dist/`)

| Command | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run typecheck:test` | 0 errors |
| `npm run lint` | clean |
| `npm test` | 178 suites, 2746 tests, all passing |
| `npm run debug:typecheck` | 0 errors |
| `npm run test:debug` | 212 tests: 210 pass, 1 fail, 1 skipped |
| `npm run test:release` | 20 tests: 16 pass, 0 fail, 4 skipped |

Neither `test:debug` exception is this work's:
- The failure is `so-run-header.test.mts` "the build half reads plan 08s nested manifest", which needs
  `dist/manifest.json` (no build here, same as plan 01's worktree runs).
- The skip is `eventNames.test.mts`, which is blocked because the worktree is not at the ST tree's extension path.

The four `test:release` skips are `manifest.test.mjs`, which needs `dist/index.js`.

**Red fixtures** (step 2). All are under `test/scenarios/`, need no backend and run as `so-scenario run <file>
--sandbox --group 1759606632088`. Each passed `validateFixture` and `globalsReadButNeverWritten`, and every eval
compiles under the runner's own wrapper (the corpus-wide `scenarioSchema.test.mts` cases re-check the first two on every `test:debug`). Each `_note` cites the ST `file:line` it rests on. None was executed.

| Fixture | Row (H#) | Expected on today's code | Why |
|---|---|---|---|
| `v24-02-hide-consumed.json` | `/hide` consumed (H5) | **green** | D5 already holds. It is the pin for §4: red if T3 hashes `is_system` |
| `v24-02-message-move.json` | `messageEditMove` (H6) | **red** at `rollbackOutcome` (started at 2, not 1), then at `stateEquals` (`lit_lamp` survives) | The host names only the moved-to id (corrected H6) |
| `v24-02-swipe-delete-below.json` | swipe delete below current (H7) | **green** | Nothing rewinds today. It is the pin for "no `swipe_id` in the hash" (mutation 2) |
| `v24-02-persona-sync.json` | `/persona-sync` (H8) | **red** at the epoch step | Same-chat `CHAT_CHANGED` bumps the run epoch. The rollback and state steps are green guards for "no user name in the hash" |
| `v24-02-same-chat-reload.json` | same-chat reload (H9) | **red** at the epoch step | Same as above, driven by `ctx.reloadCurrentChat()` |
| `v24-02-noop-edit.json` | no-op edit | **red** at `rollbackOutcome` (a rollback from 1 ran) and at `stateEquals` | `messageEditDone` emits `MESSAGE_EDITED` + `MESSAGE_UPDATED` unconditionally (H19). Its control (a real edit rolls back from 2) runs only after the red |
| `v24-02-branch-continue.json` | branch (H1, H3) | **red** at the unbind step, then at `ui: branch-continue` (`missing`) | The chat lorebook slot travels with the branch. The Continue half **cannot go green before §5 builds `#so-branch-continue`** |
| `v24-02-checkpoint-continue.json` | checkpoint (H2, H3) | **red**, as the branch fixture | `/checkpoint-create` does not open the chat, so `branch_create` opens it (`open: true`) |
| `v24-02-chat-delete-reap.json` | chat delete + failed group delete (H10, H11) | **red** at the offer step. The H11 control half is **green** today and after | Nothing subscribes `GROUP_CHAT_DELETED`. The failed `deleteGroup` shape is an emitted `GROUP_CHAT_DELETED` for a chat that still exists: the shared group is never deleted |
| `v24-02-settings-save-swallowed.json` | swallowed settings save (H15) | **red** at the last step | The Studio claims `Saved "X" vN to the library.` while `/api/settings/save` answers 500 |
| `v24-02-fetch-restored.json` | `fetch` restored by a peer | **red** at the last step | The peer is a same-origin iframe's `fetch`, and the save made under it reads "no save request went out". The page's fetch is put back and re-persisted before the assertion |
| `v24-02-persona-change.json` | persona change (H18) | **red** at the last step | `PERSONA_CHANGED` is unsubscribed. **Needs two personas**; with fewer it stops at a named precondition |

Not written, by assignment: **unrecognized blob (v5 shape)**, which another agent owns.

**Not buildable or not covered here**
- The Continue-from-here half of both branch fixtures rests on a control that does not exist yet (§5). It is red
  today for that reason, and goes green only with the feature.
- The solo `CHAT_DELETED` path (H10 proper) is not driven, because the sandbox is group-only. It needs a solo
  sandbox chat.
- The H11 shape is emitted by hand. Deleting a whole group (the only emitter that fires before `response.ok`)
  would destroy the shared test group.
- Every fixture's red run and its later green run (×2 each, archived under `test/journeys/records/v2.4-plan02/red/`)
  are still owed. They need a browser.

**Host facts added or corrected** (rows above are marked "corrected 2026-09-24")
- H6: the editor path emits `MESSAGE_UPDATED` for the target id only.
- H7: `MESSAGE_SWIPE_DELETED` is emitted.
- H9: exact exports.
- H11: only `deleteGroup` emits before its ok check, and `deleteGroupChat` splices the client list first.
- H13: the range ends at `:4393`.
- New **H19**: an unchanged edit still emits both events.

**Plan claims found wrong**
- §10 "asks `getChatWindow` for the window the scheduler would read next": not possible from outside, so a
  scheduler seam was added (see above).
- "Verified current state":
  - the attestation row: the literal list already had J12;
  - the manager row: 736/740 effective, not 677/700;
  - five stale line references, now corrected.
- Tests and gates ("`architecture.test.ts` budgets hold (manager ≤700, target ≤690)") and Risks ("677/700") share
  that stale figure. The live budget is 740, with 4 lines of headroom, so every later item that touches the
  manager must move lines out, not just add a delegation line.

### T11 + seed D (worktree build, 2026-09-24)

Built on `9cb054a` in an agent worktree. Machine gates only: no `npm run build`, no browser, so **no live gate ran and none is claimed green**. The red fixture is written and validated, not run.

**§1 T11 as built**
- `persistence.ts`: a value under the key that is not a well-shaped v2/v3/v4 (`version` ∈ {2,3,4} as a number AND `stories` a record) is **unrecognized**. `null`/absent still means "no blob". `getMetadataBlob` answers a detached `createBlob()` and writes nothing. `blobMismatch()` is now a union: `{kind:"foreign", stampedFor, openChat}` | `{kind:"unreadable", foundVersion, openChat}`. `foundVersion` is the raw primitive (`5`, `"4"`) or `null` when missing/non-primitive. `ownBlob` refuses both kinds, so `savePersistedRuntime`, `setSelectedStoryId` and `dropPersistedRuntime` refuse. `restampRenamedChat` already refused, because `storedBlob` answers null. `adoptChatState()` now returns a boolean and refuses unreadable. `replaceUnreadableBlob()` is the only overwrite. `unreadableStored()` classifies from the stored value without going through `getMetadataBlob`. `persistenceMigration.ts` is unchanged (still pure).
- `storySelection.ts`:
  - `selectStory` (explicit) is refused with `Story not selected: this chat's saved story state was saved by a newer Story Orchestrator (v5): update, or Restart to replace it`. A non-numeric or missing version reads `unreadable by this build (version "4"): Restart to replace it`. The refusal is journaled `blob-unreadable: selecting '<id>' refused, …`.
  - `loadSelectedStory` journals `blob-unreadable: …` through `clearStory`'s note, like `blob-chat-mismatch`.
  - `restartStory` works with no story loaded while the blob is unreadable. It asks its own confirm text, replaces only after a yes, starts the story the last refused selection named (same open chat) if any, and journals `blob-unreadable: replaced on a confirmed Restart (…)`.
- Manager: **0 net lines** (736/740 effective before and after). The one edit is in place: `selectionDeps.setStatus(status, note?)` journals the note through `noteRecap`, the only way selection can journal after a load. `StorySelectionDeps.setStatus` gained the optional `note`.
- Surfacing, author settings panel only. `RuntimeSnapshot.blobUnreadable?: {foundVersion, notice}` is set from `blobMismatch()` when no story is loaded. `#so-restart-story` is enabled while it is set; otherwise nothing could reach the Restart the message names. `#so-blob-unreadable` states the notice. Player drawer untouched (rule 7).
- `manifest.json` `"minimum_client_version": "1.18.0"`. `scripts/release/manifest.test.mjs` "ST's loader manifest refuses a host older than the README's declared older host" parses README's `| Declared older host |` row. It runs without `dist/`.
- H17 re-verified on the ST checkout: `extensions.js:580-590` (read + `versionCompare`), `:658-660` (not loaded, `extensionLoadErrors`), `versionCompare` at `utils.js:2898`.
- Fault matrix `persistence|malformedResponse` re-cited to the new test. Its old evidence was true only of the migration, because `getMetadataBlob` then destroyed the blob.

**§9 seed D as built** (`memoryQueue.ts`)
- `commitDecision(deps, next, stores[], before?)`. Callers name the stores they patch, not pre-save arrays.
- After the patch (and `before()`, so the canon invalidation is included), `diffStore` builds one `DecisionRestore {store, before: Map<id,row|ABSENT>, wrote: Map<id,row|ABSENT>}` per store. Only rows that differ are recorded, and `ABSENT` covers rows the decision added or removed.
- Ids per store:

  | Store | Id |
  |---|---|
  | entries, ledger, epistemic, derived | `.id` |
  | conflicts | `.key` |
  | resolvedConflicts, excluded | the string itself |
  | verifyDrops | `.entry.id` |
  | canon | the literal `canon` (single value) |

- On a lost save, `putBack` is compare-and-set against the rows current **now** (JSON value compare, the `effectLedger` `same()` shape):
  - current is the written row → the `before` row goes back (a removed row is re-appended);
  - current is the `before` row → nothing to do;
  - anything else → left alone and listed `externallyChanged`.
- Rows added meanwhile are never touched.
- A `RunGuard` with **no window** (`deps.run`, wired to `beginRun(ownership)` in the coordinator) is minted at the top and checked before the put-back. A decision whose chat, story, version or epoch moved during the save puts nothing into the memory now loaded. Without it, a removed row whose id is absent in the next chat compares equal to `ABSENT` and would be re-added there.
- Every outcome goes to `deps.refused(DecisionRefusal | null)`: `{putBack, externallyChanged, lapsed}`. The coordinator keeps the last one (`lastDecisionRefusal()`), exposed as `memoryActions.lastRefusal()`.
- `ConflictQueue` reads it in the click handler, not during render. `[data-so="decision-refused"]` gains `data-so-outcome="put-back"|"externally-changed"` and, when non-empty, `[data-so="decision-externally-changed"]` naming the rows. Story `ARefusalNamesRowsChangedElsewhere` added.
- Census `src/runtime/memoryQueue.ts#commitDecision`: `partial` → **`checked`**. The guard agrees because the body calls `run.stillOwns()`. Coordinator effective lines: 597 → 603 of 620.

**Tests.** `src/runtime/blobUnreadable.review.test.ts` (10) covers:
- per shape (v5, `"4"`, no version, broken `stories`): reads and all automatic writes byte-identical, no `saveMetadata`, load journals `blob-unreadable`;
- explicit select refused, then Restart starts the refused story;
- a cancelled Restart changes nothing;
- a confirmed Restart replaces and journals;
- controls: v2/v3/v4 are read.

`memoryQueue.test.ts` seed D block (5):
- D1: an added row survives;
- D2: a changed row is left alone and reported `externally-changed`;
- D3: a chat left during the save gets nothing;
- a control;
- `diffStore`.

`blobForeign.review.test.ts` expects `kind:"foreign"`. The persistence mocks in `storySelectionOwnership`/`storyImportWarnings` gained `adoptChatState → true` and `unreadableStored`.

**Mutations** (each alone, file restored, full text in the records):
- `test/findings/mutations/v24-02-T11.txt`: **6/6 killed**.
  - T11-3 (Restart ignores the confirm) also fails the pre-existing `storyIdentity` "restart does nothing when the confirm is declined", which guards the same shared line.
  - The first run coupled T11-2 to two cases, so the Restart case was split.
- `test/findings/mutations/v24-02-seedD.txt`: **5/5 killed**.
  - S1 (plan mutation 12, whole-array restore) fails D1 and D2, the plan's two rows.
  - A first S5 mutant was malformed and survived; it was rewritten and then killed.

**Red fixture** `test/scenarios/v24-02-unrecognized-blob.json` (9 steps, 5 evals):
- validated: `validateFixture` → `[]`, `globalsReadButNeverWritten` → `[]`, every eval compiles under `new Function`;
- **not run**;
- red on `9cb054a` by reading: `seed_metadata` calls `loadSelectedFromChat`, the old `getMetadataBlob` writes `createBlob()` over the v5 blob, and step 2 finds version 4.

**Gates** (worktree, `node_modules` symlinked to the main checkout's):

| Gate | Result |
|---|---|
| `npm run typecheck` | 0 |
| `npm run typecheck:test` | 0 |
| `npm run lint` | 0 |
| `npm test` | 179/179 suites, 2755/2755 tests; fault matrix 55 covered / 10 partial / 16 na / 0 todo (of 81) |
| `npm run debug:typecheck` | 0 |
| `npm run test:debug` | 192 tests: 190 pass, **1 fail**, 1 skip |
| `npm run test:release` | 18 tests: 14 pass, 0 fail, 4 skip |

- The `test:debug` fail is `so-run-header.test.mts` "the build half reads plan 08s nested manifest". It reads `dist/manifest.json`, which does not exist without a build, and nothing here touches it.
- The `test:debug` skip is "every event name src/ subscribes to…": no ST checkout at the relative `ST_ROOT` from a worktree.
- The four `test:release` skips are the `manifest.test.mjs` cases that need `dist/index.js`.

**Deviations and open items**
- Mutation records are named `v24-02-T11.txt`/`v24-02-seedD.txt` as the build instruction asked, not `P02-*.txt` as §Tests and gates says.
- `StorySelectionDeps.setStatus` gained a `note` parameter to journal without a manager line. The alternative, a `journal` dep, costs a line.
- The put-back re-appends a removed row at the end of its array, not at its old index. Order in these stores is not semantic: conflicts are sorted at render, and `resolvedConflicts` only matters to its cap.
- Not built: J10.13 (the live counterpart), the `plan02-downgrade-guard` scenario name (the fixture is `v24-02-unrecognized-blob.json`), and the live gate. All need a browser and a build.
