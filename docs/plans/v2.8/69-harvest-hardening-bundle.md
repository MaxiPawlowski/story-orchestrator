# Plan 69 — Harvest hardening bundle

**Status: owner accepted 2026-10-16 (61 §Owner decisions). Built in part 2026-10-16 on `v2.8-harvest-k11-k12` (unmerged): K11, K12, K5, K6, K8, K9 (3/4), K10, K17, K1a; see §Gate record 2026-10-16. The rest built 2026-10-17 on `v2.8-harvest-rest` (unmerged): K2, K3 (detection), K6b, K7, K13, K14, K15; K16 measured, nothing to build; K4 blocked on B8; K1b owed; see §Gate record 2026-10-17. Revised 2026-10-16 after Astra's review (§Review 2026-10-16).** Written
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
| K12 | **P1** Stale whole-book WI writes: our writers never overwrite each other or a change the server already has; ST's editor saving in the same instant remains best-effort detection (wording revised 2026-10-16 after review #3) | `worldinfo-workspace.md` P4 (R2) | S |
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
- **K4.** B8 built 2026-10-22: the overlay is placed last per generation. K4 (a last-word request rewrite) stays conditional on
  evidence that B8 is not enough on the host send path; none so far.
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

## Gate record 2026-10-16 (branch `v2.8-harvest-k11-k12`, base master `22eb50ce`, unmerged)

Owner decisions 2026-10-16 applied: K12 refuses on conflict; build order K11, K12, then 35 matcher, then K5, K6, K8, K9, K10,
K17, K1 (bounded). One commit per item, test first. No GPU, no model.

- **K11 built** (`b1490976`). A pending edit step records a proposal base: a hash of every unit of the proposal-time draft
  (top-level fields, keyed entities by `id`/`key`/`from->to`, one level of entity fields) and the units its op touched.
  `decideStep` refuses (`failed`, "… changed since proposed") when a touched unit changed since, and also when applying the op
  to the current draft would overwrite any unit the author changed since. Deviation from the design: the second check is new;
  without it a whole-block op (`setPlayer`, `removeCheckpoint` dropping an edited transition) silently drops an author edit
  to a field the op never touched at proposal. The base is dropped once the step is decided. Test
  `src/copilot/agent/staleProposal.review.test.ts`: touched-path author edits refused 10/10, unrelated edits refused 0/10
  (floor 10/10, 0/10: met), plus an author-edited op, the overwrite cases and a decided step dropping its base.
- **K12 built** (`1451f01c`, live fixture `f6af6de3`). All five whole-book writers (`setWIEntriesState`, `upsertWIEntry`,
  `updateWIEntryByUid`, `createWIEntry`, `deleteWIEntryAt`) compare the server's book with the copy the write started from
  just before saving; any differing entry refuses the write (`couldNot` "another page changed …", `upsertWIEntry` answers
  `failed` and logs), nothing is saved and the cached copy is evicted, so the next write starts from the server copy. This is
  the design's fallback (cached load + pre-save server read). The primary variant (load from the server, apply, compare
  after) was not used: applying onto the server copy merges another page's change silently, which is not the owner's
  "refuse". B14 kept: a difference first saves this page's own edit waiting in ST's debounce (`flushPendingWorldSave`, the
  named book only) and reads again, so the page's own pending edit is never a conflict and no extra save happens when the
  copies agree. A server read that cannot answer is not evidence (write proceeds, unconfirmed). Tests
  (`worldInfo.test.ts`, `worldInfoPending.test.ts`): 5 writers × planted change refused with the conflict named, other page's
  entry kept 5/5 (floor 5/5: met), evict-then-rebase, own debounced edit, blind read. Census: no call site changed (the
  check sits inside `stHost/worldInfo.ts`, outside the lorebook-writers and ownership censuses).
  - Live, lane 60 (no-model, `C:\dev\st-live`, lanes root `C:\dev\so-live-lanes`), `test/scenarios/v28-69-k12-stale-book.json`,
    4 runs (2 on the K12 build, 2 on the final build), all PASS. Control: ST's own immediate save of the stale cached book
    loses the other page's edit (hazard reproduced). Treatment: the story's file-mode checkpoint write refuses, posts no
    `/api/worldinfo/edit`, the other page's edit survives, the gated entry stays off, the cache is evicted; re-entering the
    checkpoint lands the write from the server copy with the edit kept. Cost: the extra server read was 3–6 ms per write
    (n = 4 per run), so the boundary path keeps it. Evidence `C:\dev\so-live-lanes\evidence-2026-10-16\60\`
    (`2026-10-16T15-40-49-946Z`, `…15-41-37-795Z`, `…16-40-04-008Z`, `…16-40-38-811Z`).
- **K5 built** (`93c8176d`). Guard in `architecture.test.ts`: only `sprites/stage.ts` (a `closest(".mes_text")` read) and the
  shared selector `utils/messageText.ts` name `.mes_text`, no write into it (planted control). Inline Storybook plays assert
  0 SO nodes inside `.mes_text`. `assert-player-clean` now sweeps `#chat .mes_text` for SO nodes (planted-DOM test: inside
  caught, beside not). Live: K8 synthetic-player and swipe-append ×2 each: 0 inside, `assert-player-clean` ok; the lane
  rendered no inline hosts in those chats, so the live half proves absence only; the rendered-host case is the Storybook half.
- **K6: floor held on measurement, test only** (`66d11ab3`, option A). `src/runtime/thoughtLeakReceipt.review.test.ts` on the
  real manager + TurnBridge + `rewriteReplyText`: repair before/after TurnBridge's `MESSAGE_RECEIVED` × render in the same tick
  /after the boundary: 0 rollbacks, 0 eventless-change journals, identity = the repaired key, swipe left and back keeps the
  repaired text: 4/4; a genuine later rewrite rolls back once: 1/1. Finding (not a defect today): a repair that lands after
  its boundary was saved reads as an eventless change (a noop rollback and journal). Unreachable now because the repair runs
  synchronously inside `MESSAGE_RECEIVED` and ST's `emit` awaits listeners in order, before the boundary's save.
- **K8 built** (`4f826c4a`), 4 no-model fixtures, each ×2 on lane 60, all PASS (floor 4/4 ×2: met), cleanup clean:
  - `v28-69-k8-silent-rewrite.json`: no event, no rollback until the next boundary; then one applied rollback from the
    rewritten reply and the boundary commits message 2; the rewritten line's fact is gone.
  - `v28-69-k8-swipe-append.json`: no boundary, no rollback, before and after the next boundary.
  - `v28-69-k8-synthetic-player.json`: one boundary consuming the synthetic message, no rollback.
  - `v28-69-k8-delayed-rewrite.json`: the rewrite after the reply's boundary is re-read once (editReread recommits +1) and the
    values equal the recording before the reply (the reply's fact gone, the earlier one kept).
  - Conditional foreign scan-suppression case: NOT RUN (no scan-filtering extension installed on lane 60).
  - Evidence `C:\dev\so-live-lanes\evidence-2026-10-16\60\` (`2026-10-16T16-45-56-431Z` … `…16-49-34-706Z`).
- **K9 built in part** (`c7f4d89d`). `InjectionSpec.carry: {quiet, impersonate}` is required (type) and checked by
  `findInjectionRegistryProblems` (planted entry without it, and one with an unknown value, fail). Declared withhold: pacing,
  epistemic, continuity note, checkpoint guidance, chapter bridge, check outcome, away notice, previously; everything else
  keeps. The away notice, previously, chapter bridge and continuity note gates read the declaration (`carriesInto`); the
  pacing/guidance/epistemic hold keeps its coordinator path and a manager test pins that a withholding run clears exactly the
  set blocks declared withhold. Behaviour: nested quiet withholds and the loud blocks return, restoration, raw generation
  (no lifecycle event, nothing held): 3/4. **Early return (B10 stale hold): NOT fixed, design question**: no host event marks
  a quiet/impersonate `Generate` that returned before sending, so the hold stays until the next loud run (snapshot and
  next-turn preview only; the next loud request is unaffected). Options: release on the wrapper/generation idle signal, or
  report the hold only while a withholding run is open. Floor 3/4: below.
- **K10 built** (`1bbc119e`). `stHost/groups.ts` `groupMemberPosition`: exact name/avatar match among the open group's members
  to the member's group position; `fireReply` sends `/trigger await=true <position>` (ST reads a number as a position and a
  name through Fuse, `group-chats.js:353-417`). Missing and duplicate names refused with a journal line, nothing generated.
  Tests: member "2" gets its own position, reordered members, missing, duplicate: 4/4. CC `send_if_empty` fixture: NOT RUN
  live (no Chat Completion profile on lane 60); host source recorded instead: `openai.js:930-931` appends `send_if_empty` as a
  user message when the last prompt message is the assistant's, so a `/trigger` right after another reply on CC carries the
  filler. Protection (strip it for our triggers, or leave the owner's setting alone) is a design question: recorded, not built.
- **K17 built** (`7524d34f`). Reply-effort repair observes through `onReplyReceived` (`hostMessageId`); null, empty, NaN and
  non-numeric ids are ignored, never message 0 (`replyReceived.test.ts`: holds).
- **K1 bounded, K1a built** (`1cab5f02`). `memory/compactionGate.ts`: a summary is accepted only if non-empty, shorter than
  previous + window text, and within the short-term answer cap (`maxTokensFor("shortTerm")`, metered); a refusal keeps the
  previous entry and journals `compaction-refused`; attempts keyed by window range + previous entry id + input hash, one
  retry, then skipped until the input changes (in memory, reset by a reload). Deviation: the budget is the answer cap, not the
  tier token budget, because tier overflow is already trimmed by `fitEntryToBlock` (the plan 03 short-term budget fix) and
  refusing there would undo that decision. Tests (`compactionGate.test.ts`, `compactionRefusal.review.test.ts`): 5/5 (floor
  5/5: met). `extractionOwnership.review.test.ts`'s ordinary-case control used a one-line window and a longer summary; its
  summary was shortened to stay a real summary. Ownership census row updated. **K1b (CL) not run.**
- Not built: K2, K3, K4 (waits on B8), K6b, K7, K13, K14, K15, K16.
- Gates: `npm run gates:quick` green after every item (two reds fixed before commit: the error-copy census on a duplicated
  template, and the code-health withholding ratchet on a second quiet/impersonate literal; K10's first run red on six STAPI
  mocks lacking `groupMemberPosition`, added).
- Full gates on the branch tip (`npm run gates -- --jobs=2 --skip=test-storybook:ci`; Storybook skipped in the runner because
  it pins port 6006, run separately below): first run RED at `test` (`arrivalEquivalence` golden lacked the five new scenario
  stories, the same miss as plan 60's addendum); re-recorded with `SO_RECORD_ARRIVAL_GOLDEN=1` (5 rows, all `[]`), rerun
  **all green in 171.9 s**: test:replay, test (8991 passed, 1 skipped), build (main `dist/index.js` 1,284,578 B, budget
  1,300,000), test:debug (1320 pass), typecheck, typecheck:test, debug:typecheck, lint (0 errors, 2 existing warnings),
  test:plugin, test:release. The 3090 text suite was running alongside; no timing flake seen.
- Storybook outside the runner: `npm run storybook:build`, `http-server .sb-static -p 6271`,
  `test-storybook --url http://127.0.0.1:6271 --maxWorkers 2`: 147 suites, 882 tests green.
- Owed: K9 early-return design decision; K10 CC protection decision and a live CC fixture; K8 conditional case; K1b CL;
  merge, then the live rows re-run on master.

## Gate record addendum 2026-10-16: owner decisions on K9/K10 (branch `v2.8-harvest-followup` from `d1f9ede2`, unmerged)

- Owner decisions 2026-10-16: K9 releases a carried hold at the next generation start that is not the carrying run, plus a
  time cap; K10 gets no code guard, an info check instead; 35's `bandit` marked prefix, `poison` left (35 gate record).
- **K9 early return fixed** (`b6ca763f`). `GenerationLifecycle` closes an open quiet/impersonate outermost run (closed +
  settled, so the hold is released) when a start arrives that is not it: a non-withholding `GENERATION_STARTED`, or our own
  generate interceptor's entry for a non-withholding type (`live.interceptEntry`, first line of `talkControlInterceptor`).
  A withholding start under a withholding run stays nested (group quiet: wrapper start then member start) unless the cap has
  passed. Cap `WITHHOLD_CAP_MS` = `callTimeoutMs(largest MAX_TOKENS_TABLE answer 4096, 32,768 input tokens)` = 300,336 ms:
  the longest single model call our own timeouts allow at the context the owner's model serves, so no live request can still
  be assembling its prompt past it; a timer armed on every withholding open applies `expire()`. Tests
  (`generationLifecycle.test.ts`, `runtimeManager.test.ts`): early return then a loud start closes the hold and the guidance
  block is back (fails on the previous lifecycle), interceptor entry, cap boundary, a legitimate nested quiet inside a loud
  run keeps its carry past the cap, group quiet stays nested, the cap value pinned to its formula. Floor K9 now 4/4.
  - Live, lane 60 (no-model, `C:\dev\st-live`), `test/scenarios/v28-69-k9-early-return.json` (plan 60 B10's setup) ×2, PASS:
    control `generate('impersonate')` on the disconnected lane emits no GENERATION_ENDED and leaves the hold on; the next
    `generate('normal')` releases it, pacing hint and check outcome back, chat unchanged; `assert-player-clean` ok. Evidence
    `C:\dev\so-live-lanes\evidence-2026-10-16\60\` (`2026-10-16T17-20-02-220Z`, `…17-20-35-148Z`).
- **K10 info check built** (`cb586d36`), no code guard. Host path verified: `oai_settings.send_if_empty` is the context's
  `chatCompletionSettings` (ST `st-context.js:227`), the API is `main_api` "openai" (`:200`), and `openai.js:930-931` appends
  it as a user message when the last prompt message is the assistant's. `stHost/extensionConflicts.ts` reports
  `cc-send-if-empty` only for Chat Completion with a non-blank value; the runtime slice keeps it only for a story with NPC
  replies; check `cc-filler-after-reply` (info, player audience, feature `stories`) says SillyTavern adds a filler line after a
  character's reply, in the prompt only. Firing fixture in `checksRegistry.test.ts`; detection, slice and copy (no jargon)
  tests. Not run live: lane 60 has no Chat Completion profile.
- Gates: `npm run gates:quick` green per item (K9's first run red at the known replay `--listTests` flake with empty stderr;
  one plain `node scripts/suite/defect-replay.mjs`, 32 of 32 killed, then green; K10's first run red on one 201-character
  line, split). Full `npm run gates -- --jobs=2 --no-storybook` **all green in 213.1 s** (test 9007 passed, 1 skipped;
  test:debug 1322; build main `dist/index.js` 1,287,226 B of 1,300,000; lint, typechecks, test:plugin, test:release green).
  Storybook not run: no `.stories` file or component changed. Arrival golden did not trip.

## Gate record addendum 2026-10-16/17: review fixes (branch `v2.8-harvest-review-fixes`, master `41717773` + merge of `f8bc217b`, unmerged)

Fixes every finding of `review-astra-harvest-code-2026-10-16.md`: one commit and one regression test per finding, each
test run against the code before its fix and failing there.

- **#1 P1, WI conflict check flushed the conflicting book** (`2d569834`). `worldInfoPending.ts` now tells a load from a save:
  a load sets an object nobody has seen, a save sets one the cache handed out (the fetched reference on a miss, a clone
  through `get`). Each load and each `WORLDINFO_UPDATED` records the server copy as the edit's baseline. The preflight
  flushes this page's waiting edit only while the server still equals that baseline; any other difference refuses and is
  never saved over. The debounce rescue applies the same check. Test `stHost/worldInfoConflict.review.test.ts` (ST-faithful
  cache: clone on get, reference on miss; real tracker): a recent load plus another page's edit refuses with zero posts;
  a local pending edit plus a remote edit refuses without flushing; B14 kept (own edit over an unchanged server lands).
  The first two fail on master.
- **#4 P2, writes mutated ST's cached book** (`bef63587`). Correction to the review: `world-info.js:2041-2042` returns a
  clone (`cloneOnGet: true`). The reference is returned on a miss (`:2054-2055`), so a write loaded on a miss mutated the
  shared cache, and a flush or an ST scan saw an uncommitted flag. The five writers now build on a `structuredClone`. Test:
  an ST load during the suspended preflight read sees no uncommitted flag; on refusal neither server nor cache holds it.
  Fails on master and on `2d569834`.
- **#2 P1, no ownership check inside the host writer** (`851dff9f`). Every stHost lorebook writer
  (`setWIEntriesState`, enable/disable, `upsertWIEntry`, `updateWIEntryByUid`, `restoreWIEntryAt`, `createWIEntry`,
  `deleteWIEntryAt`, `ensureLorebook`, `deleteLorebook`, `setLorebookEntriesDisabled`) and both pending flushes take a
  `WriteGuard` (`stHost/writeGuard.ts`; `RunGuard` fits). Each one checks it after the load, after the preflight read,
  around the pending-edit flush, before the save, and inside the rescue loop. Callers pass their run: checkpoint WI
  replay, normaliser and restore, memory mirror, curator write, create and revert, created and mirror reapers, wizard
  provisioning. Ownership census notes updated for 11 rows. Tests: 7 writers × a lapse during the load GET and during
  the preflight GET give zero posts (14 cases, all fail on `bef63587`); a lapsed write does not flush a waiting edit;
  `runtime/wiWriterRun.review.test.ts` shows the replay hands each host write its run.
- **#3 P1, GET-then-save could still overwrite** (`5c086027`). New server plugin `server-plugin/story-orchestrator-lore`,
  built on the judge pattern and installed by default with judge. `POST /commit {name, expected, data}` reads the file,
  compares its entries revision and replaces it in one synchronous step, so on Node's thread no other request, ST's
  `/api/worldinfo/edit` included, can land in between. It answers 409 on a mismatch and never creates a book. All five
  writers commit through it with the revision of the entries they started from. A 404 (plugin absent) falls back to
  the previous preflight plus ST save. A commit updates ST's cache and announces `WORLDINFO_UPDATED`. The revision is
  pinned to the same vector in jest and in the plugin's node test.
  - Claim reworded in the K12 row: our writers never overwrite each other or a change the server already has; ST's
    editor saving in the same instant remains best-effort detection.
  - Test: B's write lands between A's GET and A's POST; A is refused and B survives. Fails on `851dff9f`.
  - Plugin tests: B between A's read and A's commit, missing book, bad names and bodies, the router.
  - `plugin-install` defaults, README and setup guide updated.
- **#5 P2, nested withholding runs kept blocks declared withhold** (`e33f6bbd`). The nested withholding entry now
  withholds the wiring-owned away notice and Previously block, and the reapply restores them.
  - Seeding every declared block in the manager test found two more leaks on the same path. The continuity note stayed
    injected (stagecraft returned early). The chapter bridge stayed, and the outer run's carried record was dropped.
    Both are now held and restored through `restoreTurnNotes` on reapply (`runtime/heldPrompt.ts`).
  - Check outcome is held by `checkOutcomeHost` and covered by that host's own test.
  - Tests: the real `subscribeGenerationEvents` wiring with non-empty away and Previously blocks, under a nested quiet
    and a nested impersonate, plus a loud control (`wiring/generationNotices.review.test.ts`); the manager test seeding
    every registry block; note and bridge hold, restore and spend. 5 of 6 fail on master; the loud control passes there,
    as a control should.
- **#6 P2, refused NPC replies consumed their allowance** (`dccdd24e`). The fire is reserved while the reply is pending.
  It is committed (spoken, `lastSelfInjectionMessageId`) only on success and released on a refusal or a throw.
  `fireReply` now returns the `/trigger` and `/sendas` slash result. Test `runtime/npcReplyRefusal.review.test.ts`:
  ambiguous member, then the corrected turn fires; refused `/sendas`; landed-reply control. The first two fail on master.
- Follow-ups: `dcc2536b` (dead-export ratchet), `b951d3f1` (slash mocks answer `true` like the host), `fac94671` and
  `183aa470` (live commit-race scenario), `e141a1c3` (arrival golden: one new `[]` row). Master merged at `ef025237`
  without conflicts; the generated guide and settings files regenerated with no change.
- Gates:
  - `npm run gates:quick` green after each fix. Reds fixed before commit: errorCopy sites, the typedResults allowlist,
    max-len, the coordinator line budget, and the continuity-writer guard.
  - The known replay `--listTests` flake was cleared by a plain `node scripts/suite/defect-replay.mjs` (32 of 32 killed).
  - Full `npm run gates -- --jobs=1 --no-storybook` on `e141a1c3`: all green in 362.1 s. test:replay, test (809
    suites, 9,381 passed, 1 skipped), build (main `dist/index.js` 1,288,326 B of 1,300,000), test:debug, typecheck,
    typecheck:test, lint, debug:typecheck, test:plugin and test:release all green.
  - Storybook skipped: no component or story touched.
- Live, served bundle `fb0fcfb52bc8` (staged from `e141a1c3`; the later commit changes only a scenario file), staged
  into the private ST copy `C:/dev/st-live-hrfix` (st-live code, no data, `node_modules` junctioned to the main ST).
  Lanes root `C:/dev/so-live-lanes`, no GPU.
  - Lane 75 (offline, no server plugins, so the fallback path), copied from lane 61's data. K12 stale-book and the four
    K8 fixtures, each ×2: 10/10 GREEN (batch `2026-10-17T00-15-57-129Z`).
  - Lane 76 (no-model keys, server plugins on, lore plugin loaded), copied from lane 66's data. K12 stale-book ×2
    GREEN (batch `2026-10-17T00-15-57-147Z`). New `test/scenarios/v28-69-k12-commit-race.json` ×2 GREEN (batch
    `2026-10-17T00-19-09-548Z`): commit 409, server keeps the other page's edit, no ST save, retry lands. The first
    commit-race attempt in batch `…00-15-57-147Z` was RED on a fixture defect (book name doubled, fixed in `183aa470`).
  - Evidence: `C:/dev/so-live-lanes/evidence-2026-10-16/75/` and `/76/`. Plumbing green; real-LLM not applicable
    (no model-consuming path touched).
- Open: ST's own editor can still overwrite in the same instant, because its save is unconditional; the only fix would
  touch ST's source, which this plan does not do.

## Gate record 2026-10-17: the rest of the bundle (branch `v2.8-harvest-rest`, master `b9c5f392` + merge of `1f4c676f`, unmerged)

Scope: K2, K3 (detection only, owner), K4, K6b, K7, K13, K14, K15, K16, K1b. One commit and one test per item; each fix's
test was run against the code before it and failed there. No GPU, no model. Lane 80 (no-model, offline, data copied from
lane 75), private ST copy `C:\dev\st-live-hrest` (st-live code, no data, `node_modules` junctioned to the main ST), lanes
root `C:\dev\so-live-lanes`.

- **K7 built** (`c4131c42`, golden `9a61a610`). `similarityTokens`: NFKC and the quote and dash folds of `termPresent`
  (`foldTerm`), lowercase, punctuation stripped at token edges only. `"Mara."` vs `"Mara"` 1.0; `don't`, `co-op`, `3.5` one
  token each; planted inner-punctuation set (`don't/dont`, `co-op/coop`, `3.5/35`, `re-cover/recover`, `it's/its`, `e.g/eg`):
  0 merges (`memory/similarity.test.ts`; floor holds). Declared rows: K0 rows K21–K23 now fall in the Jaccard band (fixture
  frozen; the consistency test names them); two below-band polarity fixtures (`memoryQueueHeld.test.ts`,
  `contradictedSeed.review.test.ts`) reworded to stay below the band; E0 synthetic golden arm c hits@4 9 → 10 (verdicts
  unchanged).
- **K15 built** (`480880cc`). `createPersona` reads the active persona before the slash command; when the host selects the
  new persona despite `select=false`, it switches back (only while the chat is still owned, else refused). Planted 4 writes
  (create on a host that selects, lock, select of an unlisted persona, select lapsing during load): active persona unchanged
  4/4; the start step's order (create, select, lock) leaves the created persona locked (`stHost/personaActiveGuard.test.ts`).
- **K2 built** (`f71fc60e`). Host fact: NemoPresetExt 6.0.12 calls `initializeLorebookSpacing` on every load (`content.js:105`)
  and its `WORLDINFO_ENTRIES_LOADED` listener rewrites every multiword plaintext key to a regex on the scan copies
  (`features/lorebook-spacing/runtime.js:7-14`, `matching.js:26-31`); no setting turns it off, so "rewrite on" = loaded and
  enabled. Row `nemo-lorebook-spacing` (folder `third-party/NemoPresetExt`), kept only for a story with lorebooks; author
  info check `nemo-lorebook-keys`. Planted: loaded and enabled → present, disabled or missing → absent: 2/2.
- **K16 measured, nothing to build** (`7e98143f`). `so-critic-quotes.mts` over every recorded chat holding expansion
  verdicts (207 files, 13 unique entries): 12 verdicts, 10 judge (no quote possible), 2 model verdicts with 0 findings;
  0 findings quote text absent from the candidate. Record `test/measurements/v2.8/69/k16-critic-quotes.json`. Code check not
  built (the plan builds it only if any finding misquotes).
- **K14 built** (`4f4e5df9`, `389acdd2`). Rule set before measuring: limit = the smallest whole MiB at least 2× the largest
  measured size. Measured on 39 lane data copies (`so-size-budget.mts`, record `test/measurements/v2.8/69/k14-size-budget.json`):
  largest chat blob 3,673,781 B, largest library 2,186,460 B (wizard sessions 985 B), p95 blob 857,933 B. Limits 8 MiB blob,
  5 MiB library + wizard sessions (JSON characters, pinned to the record by a test). `degrades` check `state-size-large`
  (install, player copy, engine-free); per-item sizes cached by object identity, so a snapshot costs one stringify per changed
  record. Planted: above fires, at and below not: 1/1, 0/1.
- **K13 built** (`aab4a05a`). Talk decisions: the cache key adds the last message's swipe id and text hash, so an in-place
  swipe or edit decides again (the defect-replay row `talk-key-not-chat-scoped` now targets the new key line). Warden note:
  an applied note records the revision of the reply that carried it (`noteAppliedTo`); at the next loud start a swipe or edit
  of that reply re-arms it, so it rides again. Expression picks: already bound to text hash + swipe (`storedReads`), test only.
  3 × 2 mutations: 6/6 (`talkDecisionRevision.review.test.ts`, `stagecraftCoordinator.test.ts` K13 cases,
  `sprites/storedReads.test.ts`). Architecture and gotchas updated for the new key.
- **K6b built** (`82ab2ed0`). `reasoningRevision.ts`: at `CHARACTER_MESSAGE_RENDERED` (after the receipt repair) the reply's
  text hash is kept per send date + swipe, in memory, cap 500. Thought carry (54) and the reasoning harvest the memory read
  takes read rows through `withoutStaleReasoning`, which hides the reasoning of a reply whose text changed since render. An
  unobserved reply (rendered before a reload) is never called stale. Planted, 2 consumers: 2/2 (`reasoningRevision.test.ts`).
  43's recall quotes `mes` spans with their own revision and never reads `extra.reasoning`, so the harvest is the path by
  which a stale thought could reach recalled memory.
- **K3 built, detection only** (`d83862b4`, census `b9bd7b4f`).
  - Step 1 (measure), `so-stale-tab.mts` on lane 80: page B loads, page A saves a story to the library, page B saves its
    settings. A's story is gone from the server's settings file: **lost**, 2/2 (bundle `4e405b86d461`). Side finding:
    `importStory`'s own debounced save had not landed 2.5 s after the import; the probe forces A's save before B's.
  - Step 2: `user/files/so-library-index.json` through the new lazy `stHost/userFiles.ts` (`WriteResult`). Union index:
    a library save upserts only the story it wrote (id + hash), a removal writes a tombstone, a wizard session write
    upserts its keys and tombstones the ones it dropped, a start seeds ids the index never saw (never over a tombstone or a
    newer hash). On start, an id in the index but missing from settings (not tombstoned), a missing session, or an older
    hash raises `library-lost-to-tab` (`degrades`, player copy), naming ST's start-time settings backups. No restore.
  - Floors: planted revert raises the check, tombstoned deletion does not, a stale page's index write keeps the id: 3/3
    (`libraryIndex.test.ts`, plus hash-mismatch, sessions, seeding, parsing cases).
  - Live, lane 80, bundle `8c995e387e13` ×2 and the final bundle `bbea74a8f4e9` ×2: lost, then reload reports the probe
    id, re-import + remove tombstones it and a reload is quiet; 4/4.
- **K4 blocked.** B8 (`makeLast`) is not built (`60-extension-harvest-fixes.md` §Not built), and the plan builds K4 only if a
  planted later listener still overwrites overlay keys after B8 on the captured request. Nothing built.
- **K1b owed (CL).** Not runnable offline as specified: short_term derived records keep the output and removed rows but not
  the fitted window text, so a refusal rate over recorded windows would be approximate, and the retained-fact checklist per
  window has to be written over campaign text, outside this public repo, by another model.
- Gates:
  - `npm run gates:quick` green after each item. Reds fixed before commit: two below-band fixtures and the K0 consistency
    row (K7), coordinator line budget and max-len (K13: helpers moved to `noteRevision.ts`), ownership census rows
    (K3, `local`), max-len (K14), the known replay `--listTests` flake once (plain `defect-replay.mjs`, 32 of 32).
  - Full `npm run gates -- --jobs=1 --no-storybook` on `9a61a610`: **all green in 270.8 s**. test:replay, test (822 suites,
    9,468 passed, 1 skipped), build (main `dist/index.js` 1,297,627 B of 1,300,000), test:debug (1,359 pass), typecheck,
    typecheck:test, lint, debug:typecheck, test:plugin, test:release. Two earlier full runs were red and fixed: the
    error-copy census (userFiles rows) and the E0 synthetic golden (K7). Storybook skipped: no component or story changed.
- Evidence: `C:\dev\so-live-lanes\evidence-2026-10-17\80\` (stale-tab runs `01-15-48`, `01-15-56`, `01-22-43`, `01-23-03`,
  `02-00-26`, `02-00-48`). Plumbing green; no model-consuming path touched except K6b's filter, whose real-LLM check (a
  rewritten reply's thought not carried in a played session) is owed with the inner-voice runs.
- Design questions:
  - K14/K3: the main bundle is at 1,297,627 B (2,373 B left). The next main-bundle addition needs a lazy chunk or a budget
    call.
  - K3: the check keeps firing on every start until the lost story is imported again. Recommended: an "acknowledge" action
    that tombstones the reported ids (a small follow-up), rather than a time limit.
  - K6b: render hashes live in memory only, so a rewrite after a reload goes undetected for replies rendered before it.
    Recommended: keep it in memory unless a live session shows that case.

### Gate record 2026-10-17, follow-ups (branch `v2.8-harvest-rest-2`, unmerged)

- **Bundle diet built** (`40f1a7bf`). Story update (`runtime/storyUpdate.ts`), the judge director (`judge/director.ts`) and
  wizard provisioning (`wizard/provisioning.ts`) load through lazy doors, following the `a2d16ec0` pattern; the director's
  eligibility check stays static (`judge/directorEligible.ts`), so the no-roles fallback is still synchronous and records
  before any await. Main `dist/index.js` 1,297,627 -> 1,282,481 B; 1,284,184 B with the items below (target 1,285,000;
  budget unchanged at 1,300,000). Test: `lazyHarness.guard.test.ts` "bundle diet 2026-10-17" (the three modules are
  statically unreachable from the entry and dynamically reachable); fails on the old code.
- **Swipe re-carries the decided check outcome, built** (`313f04ca`). Cause, two parts:
  - Order: `MESSAGE_SWIPED` was `void`ed, so ST's `Generate('swipe')` (script.js:10315-10319 awaits the emit) could run
    before the rollback landed. The handler now returns the rollback promise.
  - Anchor: the rollback is a noop when the engine did not move, and the engine's `lastMessageId` stays at the swiped reply,
    so the outcome block (records at `lastMessageId`) was empty on the regenerating request. Order alone was not enough
    (live ×2 red). `runtime/regeneration.ts` records the engine's `lastMessageId` when each reply renders; while a swipe
    regenerates, `gamePort.outcomeBlock` anchors at the state that reply rendered against (fallback: the boundary that
    consumed it). Cleared on the next render, player send or chat change.
  - Tests: `swipeRollbackOrder.review.test.ts` (handler resolves only after the rollback; fails on the old code),
    `regeneration.test.ts` (one-reply, one-boundary round, two-boundary round with render anchor, control).
  - Live: G7 shipped blocks with the new swipe assertion, lane 80, bundle `43f34f1d38df`, ×2 green (`02-32-34`, `02-33-07`):
    normal, swipe and impersonate legs; the swipe request carries `story_orchestrator_check_outcome`.
- **K3 acknowledge built** (`f4dcce3d`). `library-lost-to-tab` offers one action (`acknowledge-library-lost`, label in
  `narrative.ts` `PLAYER_COPY.libraryLostAcknowledge`) carrying the reported ids. It tombstones missing stories and sessions,
  writes the held hash for a story reported older, never tombstones an id back in the library, and clears only the reported
  ids, only after the index write landed (else one player reason). Test: `libraryAcknowledge.test.ts` (registry fixture,
  delta, control, port; fails on the old code). Live, lane 80, bundle `2e168d854b4f`: planted phantom story + session ids,
  reload raised the check, the drawer's setup button tombstoned both (and one residual lost id the lane already held),
  the row cleared, a reload stayed quiet; lane index restored afterwards. Storybook not run: no component or story changed
  (the setup row renders any action by its label).
- Gates: `npm run gates:quick` green per item. Full `npm run gates -- --jobs=1 --no-storybook` on `f4dcce3d`: **all green in
  261.4 s** (test:replay 32/32, test 827 suites / 9,499 passed / 1 skipped, build, test:debug, typecheck, typecheck:test,
  lint, debug:typecheck, test:plugin, test:release). arrivalEquivalence did not trip.
- Evidence: `C:\dev\so-live-lanes\evidence-2026-10-17\80\` (G7 `02-32-34`, `02-33-07`; `k3-ack\`; `gates-harvest-rest-2.log`).

## Folds from v2.9 triage (applied 2026-10-25, owner)

- M05 fold interior holes (fixture: two seals, retained middle rows, a coverage gap, a no-fold chapter); M06 VectFox copier keys; M12/A02 stopped partials (K13; owner decision 3: a stopped partial is not a turn until the player sends again); G03 stale-build check; G13 image upload read-back.
- Source: `docs/plans/v2.9/01-triage-sol.md`. Not built; each item is scheduled with this plan's next build pass.
- A02 built 2026-10-25 (branch `v2.9-decided-2026-10-25`): `TurnBridge` holds a rendered reply whose ST stream the player stopped (`streamingProcessor` finished + aborted, not errored; `stHost/streamGuard.ts` `userStoppedStream`) in `runtime/stoppedReply.ts`: no boundary, a manual read and an at-less commit stop before it. The player's next send (or a later reply rendering first) commits it at its own id before the new line; a fresh swipe or delete drops the hold, a finishing continue commits it, a re-stopped swipe stays held, a thought-only held partial is dropped. In memory only: a reload forgets the hold, and the next committed reply then covers it. Tests: `turnBridgeStopped.test.ts`, `coordinators/stoppedReplyRead.review.test.ts`. Live stop check owed (needs a staged build and a streaming backend).
