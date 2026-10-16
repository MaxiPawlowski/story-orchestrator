# Plan 69 — Harvest hardening bundle

**Status: candidate, owner decision pending. Revised 2026-10-16 after Astra's review (§Review 2026-10-16).** Written
2026-10-14 from the extension harvest (`61-harvest-triage-2026-10-14.md`). Not built, not queued. One plan for the small
hardening items that are not built defects and that no feature plan owns. Each item is S, independent, one commit, and closes
on its own D floor. Two items (K11, K12) are **P1 correctness guards** and come first. Implementation and acceptance **D**,
except K1b (**CL**, ×1). Overview: `00-overview.md` §Rules.

Plan 60 did not fix every harvest defect: B4, B7, B8, B17 are open (`60-extension-harvest-fixes.md` §Not built). K4 waits on
B8; K17 is B7.

## What it is

| # | Item | Source | Size |
|---|---|---|---|
| K1 | Short-term compaction accepted only if non-empty, shorter than its inputs and inside the token budget; a refused input is retried at most once (deduplicated by input identity) | `docs/plans/v2.8/extension-research-2026-10-14/sillytavern-copilot-p3dra.md` P2 (H10b) | S |
| K2 | Nemo Preset Extension rows in the interference probes (it rewrites multiword WI keys to regex) | `nemopresetext.md` P2 (H16h) | S |
| K3 | Stale-tab overwrite of install-wide state: measure first, then **detection only** | `creative-studio.md` P3, `worldinfo-workspace.md` P7, `writers-workbench.md` P3 (H16k) | S + M |
| K4 | Last-word request rewrite, only if B8's ordering fix is not enough on the actual host send path | `nemopresetext.md` P1, P4 (H16g, R42) | S, conditional |
| K5 | Guard test: no SO host inside `.mes_text` | `rpg-companion.md` P6 (x1) | S |
| K6 | Receipt normalisation vs genuine rewrite: thought-leak repair does not roll back; a later genuine rewrite does; listener orders and swipe-left | `dynamic-response.md` P4, `recast.md` P3, P4 (x2, R4, R5) | S |
| K6b | A text revision change invalidates reads of `extra.reasoning` (54 thought carry, 43 recall) | `recast.md` P5 (R6) | S |
| K7 | Jaccard tokens: fold quotes and strip edge punctuation without splitting inner tokens | v2.4 theme 7 (V17) | S |
| K8 | Interop fixtures with explicit expected outcomes: silent `mes` rewrite, out-of-band swipe append, synthetic player-like message, delayed Recast-style rewrite; conditional foreign scan suppression | v2.4 T20 (V46), `recast.md` P2 (R3), V61 | S |
| K9 | Declarative withhold policy on `INJECTION_REGISTRY`, tested on nested quiet, restoration, early returns and raw generation | v2.4 theme 5 (V56) | S |
| K10 | NPC replies trigger by host character index through the existing member resolution; a CC `send_if_empty` fixture | v2.4 theme 5 (V57, V58) | S |
| K11 | **P1** Stale draft proposals: an author accepting an old agent proposal never overwrites a manual edit made since | `creative-studio.md` P4 (R1) | S |
| K12 | **P1** Stale whole-book WI writes: a write never overwrites another page's changes to other entries of the same book | `worldinfo-workspace.md` P4 (R2) | S |
| K13 | Per-generation derived state bound to the rendered message revision | `st-memory-books.md` P3, `rpg-companion.md` P5 (R9, R10) | S |
| K14 | Size budget for the chat blob and the story library (measure, then a `degrades` check) | `multihog-dnd-framework.md` P4 (R16) | S |
| K15 | Active-persona guard around persona writes (tests) | `nemo-plotlight.md` P3 (R17) | S |
| K16 | Critic findings cite a verbatim quote checked in code (measure first) | `filigree.md` P4, `simulation-blackboard.md` P6 (R21, R22) | S |
| K17 | B7: `hostMessageId` instead of `Number(messageId)` in reply-effort repair | plan 60 B7 | XS |

## Current state in code

Verified on master `e8b9dd6d`.

- **K1.** `runShortTermCompaction` (`src/runtime/coordinators/extractionCoordinator.ts:414-439`) replaces the short-term entry
  with any non-empty summary (`replaceShortTerm`, `:436`), checked only by `refuseIncomplete` and ownership.
- **K2.** `KNOWN_EXTENSIONS` (`src/services/stHost/extensionConflicts.ts`) has no Nemo row.
- **K3.** `librarySave.ts` confirms a save by read-back at save time; nothing notices a later revert by another page. ST's
  `/api/settings/save` writes the whole file (last writer wins). ST backs up the settings file only at server start
  (`backupSettings` in `init`, ST `src/endpoints/settings.js:118-156,379-381`).
- **K4.** `src/services/stHost/samplerOverlay.ts` subscribes with plain `subscribeToHostEvent`; B8 (`makeLast`) is not built.
- **K5.** `src/services/stHost/inlineMount.ts` mounts on `.mes_block` (outside `.mes_text`): safe today, unguarded.
- **K6/K6b.** `rewriteReplyText` (`src/services/stHost/chatMessages.ts`) re-renders through `updateMessageBlock`;
  `ChatIdentity` keys by content hash (`src/runtime/messageIdentity.ts`). No test separates a receipt normalisation from a
  later genuine rewrite; nothing ties `extra.reasoning` to a text revision.
- **K7.** `tokenize` (`src/memory/similarity.ts:1-3`) is lowercase + whitespace split.
- **K8.** Thirteen `test/scenarios/v24-*` shapes exist; none plants a silent rewrite, an out-of-band swipe append, a
  synthetic message or a delayed rewrite.
- **K9.** `WITHHOLDING_TYPES` (`src/runtime/generationLifecycle.ts:22`) plus per-coordinator clears; `INJECTION_REGISTRY` has no
  per-kind field. Plan 60's B10 live check found a hold left on when `Generate` returns before sending (60 §Gate record
  addendum 2026-10-15).
- **K10.** `fireReply` runs `/trigger await=true <member name>` (`src/runtime/effectSteps.ts:68`); the talk path resolves a
  member to ST's numeric index (`memberId`, `src/services/stHost/voiceStart.ts:6,18-19`).
- **K11.** `decideStep` re-checks only that the op still applies to the current draft (`editProblem`,
  `src/copilot/agent/loop.ts:382-397`); a still-valid old op overwrites whatever the author changed since it was proposed.
- **K12.** Every whole-book writer (`setWIEntriesState`, `upsertWIEntry`, `updateWIEntryByUid`, `createWIEntry`,
  `deleteWIEntryAt`, `src/services/stHost/worldInfo.ts:107,303,371,410,436`) loads through `loadExisting` (ST's cached
  `loadWorldInfo`, `:46-51`), modifies, saves the whole book, and reads back only its own target (e.g. `:383-391`). Another
  page's edit to a different entry is overwritten while the write reports success. B14 (debounce rescue) and B15 (rewrite
  baseline) do not cover it.
- **K13.** Talk decisions key by `chatId:checkpointId:lastMessageId` with no revision
  (`src/runtime/talkStagecraftTypes.ts:5-16`); sprite expression reads (`classifyExpressions`, `src/sprites/classify.ts:136`)
  are not keyed by swipe.
- **K14.** The chat blob (`src/runtime/persistence.ts`) and the story library have no size check.
- **K15.** Persona writes (`src/services/stHost/personaWrites.ts`, `src/runtime/playerSetup.ts`) have no test that the active
  persona is unchanged across them.
- **K16.** The expansion critic (`src/generation/critic.ts`) accepts findings without checking a quoted span.
- **K17.** `replyEffortLive.ts` observes `Number(messageId)` (`src/runtime/replyEffortLive.ts:26`); `hostMessageId` exists
  (`src/runtime/turnBridge.ts:19`).

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Bundle, item by item** | each item its own commit and floor; skip any item whose floor already holds when measured | S each | none beyond each item's |
| **B. Spread into feature plans** | | same | small items wait on big plans |
| **C. Nothing** | | 0 | — |

## Recommendation

**A, in this order: K11, K12, then K5, K6/K6b, K8, K9, K10, K17, K1, then the rest.** K4 only after B8.

- **K1.** Pure `acceptCompaction({ summary, previous, window, budget })` → `{ ok } | { ok: false, reason }`; a refusal keeps the
  previous entry and journals `compaction-refused`. Attempts are keyed by input identity (window range + previous entry id +
  input hash): the same input is retried at most once, then skipped until the window changes.
- **K2.** A `nemo-preset` row detected by folder and settings key; Repair `info` row "Nemo rewrites multiword lorebook keys; key
  previews may differ". Host fact first: the setting name at the installed Nemo version.
- **K3, detection only.** Step 1 (measure): one chat in two pages on a no-model lane; a library save in page A, then a settings
  save from page B; record whether A's record survives. Step 2 only if lost: an index of library ids + hashes and wizard
  session ids in `user/files/so-library-index.json` (new `stHost/` module, `WriteResult`). The index is a union: a save adds
  or updates ids, a deliberate deletion writes a tombstone, and no page removes an id it did not delete, so a stale page
  writing the index cannot erase the evidence. On start, an id in the index but missing from settings (and not tombstoned) is
  a `degrades` check "a story (or wizard session) was lost to another tab", pointing to ST's own settings backups (written at
  server start). **No Restore**: the index holds ids and hashes, not content, and lost edits to surviving ids are out of scope
  (a hash mismatch is reported, not repaired).
- **K4.** Only if, after B8, a planted later listener still overwrites overlay keys **on the actual host send path** (captured
  request, not the event payload): a serialization-time re-apply of exactly the overlay's keys, recorded in `applied`.
  Ordinary event ordering is preferred whenever it suffices.
- **K5.** Guard test in `architecture.test.ts` style.
- **K6.** A TurnBridge review test: thought-leak repair at receipt (both listener orders, before and after TurnBridge)
  commits no rollback and no "eventless change" journal, identity equals the post-repair key after render, and swipe-left and
  back keeps the repaired text; a **genuine** later rewrite of the same reply (a different visible text after render) does
  roll back and re-read.
- **K6b.** Consumers of `extra.reasoning` record the text revision they read against; a revision change makes the reasoning
  stale for them (54 carries no thought from a stale revision; 43 never recalls one).
- **K7.** `tokenize` folds curly quotes and strips punctuation only at token edges (`"Mara."` → `mara`; `don't`, `co-op` and
  `3.5` stay whole). Dedup goldens re-run; false positives checked on a planted set where only inner punctuation differs.
- **K8.** No-model scenarios in the closed vocabulary (new verbs in `scenarioSchema.mts` if needed), each citing a verified host
  fact, each with its **expected outcome**:
  - silent `mes` rewrite of the latest reply with `saveChat` and no event: no rollback until the next boundary; then the
    fingerprint mismatch re-reads that reply (the `editReread` path) and commits once;
  - out-of-band swipe append (not shown): no boundary, no rollback;
  - synthetic player-like message from another extension: commits a boundary as an ordinary message (TurnBridge's denylist);
  - delayed Recast-style rewrite of a reply after its boundary: one rollback and re-read, then identical state on replay;
  - conditional (only when a foreign scan-filtering extension is installed): a story entry removed from the scan by that
    extension is reported by the WI evidence ring, not assumed active.
- **K9.** `InjectionSpec.carry: { quiet: "keep" | "withhold", impersonate: "keep" | "withhold" }`, required; the withhold path
  reads it. Tests: nested quiet inside a loud run, restoration after the run, an early return before sending (the B10 stale
  hold), and raw generations (`generateRaw`) that emit no normal lifecycle events.
- **K10.** Reuse the talk path's member resolution (`memberId` → ST character index, as `src/services/stHost/voiceStart.ts`)
  and trigger by index; cases: missing member (refused with a journal line), duplicate names (refused, never guessed),
  reordered members (the right card). Plus one no-model Chat Completion fixture: a `/trigger` on CC with `send_if_empty` set
  records whether ST inserts the filler; protection is built only if it does.
- **K11.** Each pending edit step records the draft revision of every path its op touches at proposal time; `decideStep`
  refuses (status `failed`, "changed since proposed") when any of those paths changed, even if the op would still apply. The
  author can re-ask the agent.
- **K12.** Writers read the book from the server (`readServerLorebook`) instead of the cache, apply the change, and after the
  save compare the whole server book with the expected result (every other entry unchanged from the pre-write server read). A
  difference is a refused write (`couldNot`, "another page changed this book"), with the cache evicted. If server reads are too
  slow for the boundary path, fall back to: cached load + a pre-save server read of the other entries' hashes, refusing on
  difference.
- **K13.** Per-generation derived state carries the message revision (hash + swipe id): talk decisions (shared with 68), the
  warden note's applied mark, sprite expression picks; a revision change invalidates them.
- **K14.** Measure blob and library sizes on the adolion-fresh lane and the owner's evidence chat copy; then a `degrades` check
  above a threshold set from that measurement (not tuned later).
- **K15.** Tests: a persona write never leaves a different active persona than before; the start step's lock survives.
- **K16.** Measure on recorded critic outputs how many findings quote text absent from the candidate; build the code check
  only if any do.
- **K17.** Swap to `hostMessageId`; a null id is ignored.

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| K1a | Planted: longer-than-inputs, empty and over-budget summaries refused; a valid one accepted; the previous entry survives every refusal; the same refused input is not retried a second time | 5/5 | D |
| K1b | On 20 recorded real compaction windows: refusal rate, and for accepted ones the share of a fixed per-window fact checklist retained | recorded | CL |
| K2 | Planted settings with the rewrite on/off: row present/absent | 2/2 | D |
| K3 | Step 1 recorded (survives / lost); step 2 only on lost: a planted revert raises the check, a tombstoned deletion does not, a stale page's index write keeps the id | recorded; 3/3 | D (lane, no model) |
| K4 | Planted later listener overwrites a key: the captured outgoing request still carries the overlay value | 1/1 | D |
| K5 | No SO-owned node inside any `.mes_text` across the inline Storybook and a no-model scenario | 0 | D |
| K6 | Receipt repair: 0 rollbacks, 0 eventless-change journals, identity = post-repair key, swipe-left/back keeps the text (4 orders); a genuine later rewrite rolls back once | 4/4, 1/1 | D |
| K6b | A rewritten reply's stale reasoning is never carried (54) or recalled (43) (planted, 2 consumers) | 2/2 | D |
| K7 | "Mara." vs "Mara" similarity 1.0; `don't`, `co-op`, `3.5` stay one token; dedup goldens unchanged except declared rows; 0 false merges on the planted inner-punctuation set | holds | D |
| K8 | Each fixture meets its stated expected outcome ×2 on a no-model lane | 4/4 ×2 | D |
| K9 | Guard: every registry entry declares `carry`; a planted entry without it fails; nested quiet, restoration, early return and raw generation each behave as declared | holds, 4/4 | D |
| K10 | Member "2" in a planted group gets its own reply; missing and duplicate names refused; reordered members resolve correctly; CC fixture recorded | 4/4; recorded | D |
| K11 | A pending edit whose touched path the author changed since proposal is refused on accept; an unrelated edit does not refuse it (planted, 10 + 10) | 10/10, 0/10 | D |
| K12 | A second page's change to another entry survives every writer (5 writers × planted change); the write reports the conflict | 5/5 | D (stub host + no-model lane) |
| K13 | Talk decision, warden mark and expression pick are invalid after an in-place swipe or edit (3 × 2 mutations) | 6/6 | D |
| K14 | Sizes recorded; check fires above the recorded threshold on a planted blob, not below | recorded; 1/1, 0/1 | D |
| K15 | Active persona identical before and after each persona write (planted, 4 writes) | 4/4 | D |
| K16 | Recorded critic outputs: count of findings whose quote is absent from the candidate | recorded | D (offline) |
| K17 | A null or non-numeric id never reads as message 0 | holds | D |

Floors are informational and never retuned (rule 2).

## Gates by tier

- **D:** `npm run gates` per item (one commit each); K3 step 1, K8, K10 CC fixture and K12 on a no-model lane.
- **CL:** K1b ×1 offline over recorded windows.

## Privacy and spoiler notes

- No player-visible change except K2/K3/K14 Repair rows (player-safe wording). No campaign content.

## Dependencies and links

- Plan 60 (B8 before K4; B7 = K17; B14/B15 beside K12), v2.8 35 (coverage rows for K5, K6, K8), plan 68 (shares K13's revision
  shape), v2.8 54 and 43 (K6b consumers).

## Decisions for the owner

1. **One bundle plan for these items, K11 and K12 first?** **Recommended: yes.**
2. **K3 detection only (no Restore, ids and hashes only, union index with tombstones)?** **Recommended: yes.**
3. **K12 refuses a write when another page changed the book (never merges)?** **Recommended: yes.**

## Unresolved questions

- K3 alternative: a Web Locks leader per install so a second page is read-only (`writers-workbench.md` P3). Proposed: only if
  step 1 shows the loss is common.
- K12 cost: is a server read per boundary write acceptable on the 3090 lane? Measure in the K12 commit; fall back as described.

## Review 2026-10-16 (Astra)

Source: `review-astra-harvest-2026-10-16.md` §2 (69), §1 (omissions, V58, V61, B-status). Verified on `e8b9dd6d`.

- **P1 K3 — an id/hash index cannot Restore; misses lost edits and wizard sessions; stale writers can overwrite the backup.**
  Accepted. → narrowed to detection: ids, hashes and wizard session ids in a union index with tombstones; no Restore; points to
  ST's own start-time settings backups (ST `src/endpoints/settings.js:118-156,379-381`); hash mismatches reported only.
- **P1 K4 — B8 is open; a `toJSON` wrapper is not automatically final.** Accepted (`60-extension-harvest-fixes.md` §Not built).
  → K4 conditional on B8, judged on the captured actual request; event ordering preferred.
- **P1 K9 — registry declarations alone do not prove withholding.** Accepted. → nested quiet, restoration, early return (the
  B10 stale hold) and raw generation tested.
- **P2 K1 — unbounded retries; refusal rate does not measure retention.** Accepted. → input-identity dedup, one retry; K1b adds
  a retained-fact checklist.
- **P2 K10 — `castNames` resolves names, not host indexes.** Accepted (`src/services/stHost/voiceStart.ts:6,18-19`). → reuse the
  talk path's `memberId`; missing, duplicate, reordered cases; V58's CC fixture joins.
- **K5/K6/K8 — distinguish receipt normalisation from a genuine rewrite; K8 needs expected outcomes.** Accepted. → K6 has both
  cases; K8 lists an expected outcome per fixture.
- **K7 — token-boundary preservation and dedup false positives.** Accepted. → edge-only stripping, planted false-positive set.
- **Omissions: stale draft proposals and stale whole-book writes (P1).** Accepted (`src/copilot/agent/loop.ts:382-397`;
  `src/services/stHost/worldInfo.ts:46-51,371-392`). → K11, K12, first in order.
- **Omissions: Recast P2/P3/P4/P5, Memory Books P3, RPG P5, Multihog P4, Plotlight P3, Filigree P4, Blackboard P6.** Accepted. →
  K8 fourth fixture, K6 orders, K6b, K13, K14, K15, K16.
- **V61 suppression fixture.** Adopted as K8's conditional case.
- **B7 open.** Accepted. → K17.
- Rebutted: none.
