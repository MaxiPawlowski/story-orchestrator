# Plan 05 — World Info

**Status: DRAFT 2026-09-23, not started. Reconciled with overview X9/X18/X19.** Depends on plan
01, for the outermost-loud-generation tracker (T6, a hard dependency per X19), the T20 interop
corpus and `host-facts.md` (X9). T13 needs T12, because the spike's live evidence is T12's ring.
Runs in parallel with plans 02/03. A T13 PASS yields build plan 05b **for v2.5** (X19), not a v2.4
build. Verified against the working tree on 2026-09-23: HEAD
`fcc33cc` plus uncommitted edits by another session in `effectsApplier.ts`, `memoryMirror.ts` and
`stHost/worldInfo.ts`. **Re-verify every path:line below before building (rule 1).**

## Goal
1. Stop treating "we forced it" or "we enabled it" as evidence. Observe what ST actually activated,
   and flag only the misses that mean something (T12).
2. Decide on evidence whether checkpoint `world_info` can move from **file writes** to **scan-time
   copies** (T13 spike, D8). The spike delivers a verdict, not a build.
3. Measure the mirror's keys, then clean them. Fix `so-assets`' stale `worldInfoCache` (seed D).

## Scope / out of scope
In scope:
- **T12** activation evidence: seam, ring, LoreSelector landed check, constant/forced miss flags,
  the author view, and a foreign-scan-filter Repair check.
- **T12c** (conditional, X19): move the lore force point to our generate interceptor. Built only
  if T12's foreign-dry-scan fixture shows forces being lost.
- **Read the discarded WI `WriteResult`s** (X19, new defect `effectsApplier.ts:100,102`).
- **T13 spike**, with the predeclared conditions in §Design. It runs on marker-named copies of
  books, **never on the user's library books**.
- **Mirror key hygiene** (owned here, X18): measure first, strip second.
- **`so-assets` cache fix** (seed D).

Out of scope, with where each goes:
- Building scan-time gating: build plan 05b in **v2.5**, only on a spike PASS (X19).
- Unbound mirror, member-scoped lore, and requirements satisfied by chat-, character- or
  persona-bound books (theme 6): all ride on the T13 seam, so they wait for 05b (v2.5).
- Mirror reaping and stopping scene-row mirroring: plan 02 (T14, X18).
- In-book ownership marker: plan 02, because the reaper needs it (X18).
- Per-tier `scan:true` on extension prompts: v2.5. It is a memory-injection change and has no
  evidence yet.
- Mirror budget share / `order`: not scheduled. T12's ring records the mirror's firing rate and
  the spike report states it, as input for a later decision.
- Lore-select "exclusive" mode (TV #2): v2.5, and it needs its own recall floor (inv 7).

## Verified current state (2026-09-23 working tree; drift vs SUMMARY marked ⚠)
| Claim | Seen | Note |
|---|---|---|
| Plan builder is pure | `src/runtime/worldInfoGates.ts:12-23` `worldInfoPlan`, `:27-32` `releasePlan` | matches |
| File writes | `src/runtime/effectsApplier.ts:96-104` `applyWorldInfo`, called `:220`; release `:258-260` | ⚠ SUMMARY `:95-103,219,254` |
| **WI write results discarded** | `effectsApplier.ts:100,102` await `disableWIEntry`/`enableWIEntry` and drop the `WriteResult` | ⚠ **new**: `setWIEntryDisabledState` returns a typed result since V17 (`stHost/worldInfo.ts:73-109`, uncommitted), but the caller ignores it. The same trap as "a WriteResult nobody reads" (gotchas, plan 11). WI flags are also **not** effect-ledger rows, unlike AN/preset/background (`:222`, `:233`, `:250`) |
| Not ready → no touch | `effectsApplier.ts:206` `if (!extras.requirements.ready) return` | matches inv 14 |
| Release | `src/runtime/storySelection.ts:27-35` `releaseGatedWorldInfo` over library records + previous; callers `runtimeManager.ts:231` (clear, keep=null), `:547` (load), `:608` (swap) | ⚠ SUMMARY `:546,607`; HEAD already had `:547,608` |
| No-story chats protected only while SO runs | `clearStory` → release with `keep=null` (`runtimeManager.ts:231`) | with SO disabled, or ST closed mid-story, the file flags stay on (inv 14 wording) |
| Events | `stHost/events.ts:30-32` `WORLDINFO_UPDATED/SETTINGS_UPDATED/ENTRIES_LOADED: []`; no `WORLD_INFO_ACTIVATED` key | matches. Only subscriber is `turnBridge.ts:60` (SETTINGS_UPDATED → notify) |
| Force = emit | `stHost/worldInfoActivate.ts:18-25` returns `wrote()` on emit; `getScannableEntries` `:10-14` calls `getSortedEntries` | matches. The comment `:17` cites `:203, :1020-1029, :5275`, which are still correct |
| LoreSelector | `src/runtime/loreSelect.ts:62-81` reads the scan view, `:89-93` `forced()` checks only the emit's `ok`. Forced at `GENERATION_STARTED`/`MESSAGE_SENT` (`runtime/index.ts:153-158,189-190`) | forced ≠ landed is invisible |
| hostTypes | `stHost/hostTypes.ts:104` `worldInfoCache: {delete}`; `:108-111` comment cites `:4590`/`:4603` | ⚠ the actual lines are `:4590` (fn) / `:4604` (emit) / `:4638` (clone) |
| Mirror | `src/runtime/memoryMirror.ts:51` name, `:53-54` mirrors `relationship` + `scene_history/scene` rows, `:86` `ensureLorebook`, `:115` keys = `entry.entities`, `:127` binds the chat slot | ⚠ SUMMARY `:50,82-88,110,122` (the uncommitted V17 edit shifted them) |
| Scene rows keyless | `extractionCoordinator.ts:300` `entities: []`; `stHost/worldInfo.ts:212` sets `key` only when non-empty | ⚠ SUMMARY `worldInfo.ts:204` |
| Relationship keys | `memory/parse.ts:49-50` `entity=` token split; `types.ts:17` relationship → `facts` tier, so the row is already injected by the facts tier | stripping roster names can leave a row keyless, which makes it inert |
| `ensureLorebook` | `stHost/worldInfo.ts:125-139` (no activation), `bindChatLorebook` `:159-171` | ⚠ SUMMARY `:116`, `:151-163` |
| Requirements | `runtime/requirements.ts:16-20` global selection only; Repair `repair.ts:47-51` | matches the gotcha |
| Probe | `scripts/debug/so-lore-probe.mts:20` event list, `:37` activated uids | matches, can be lifted |
| so-assets | `scripts/debug/so-assets.mts:143` raw `POST /api/worldinfo/delete`, `:146` `updateWorldInfoList`, `:148-160` manual deselect. **No `worldInfoCache.delete`** | seed D confirmed. `so-scenario.mts:966` and `so-turn-types-check.mts:254` already use ST's `deleteWorldInfo` |
| Gated fixtures | only `examples/sun-ruins/quest-for-the-sun-ruins.json:105,139,190,238,266`; `worldInfoGates.test.ts`; J7 walks it | no fixture with ≥2 stories sharing a book |

## Host facts
Per X9, each row H1–H14 is entered into `docs/plans/v2.4/host-facts.md` (created by plan 01) with
its ST `file:line` for both versions before any item that relies on it is built. Rule 2 cites that
table, and the table below is this plan's working copy. Taken from ST **1.19.0** (working tree `package.json:118`) unless noted. **1.18.0** means pinned rev
`51ad27fb`, read with `git show` (static, no live run). ✅ = same behaviour on 1.18.0, with the
1.18.0 line given where it differs.

| # | Fact | 1.19.0 | 1.18.0 |
|---|---|---|---|
| H1 | `WORLD_INFO_ACTIVATED(Array)` = `allActivatedEntries.values()`, emitted in `getWorldInfoPrompt` only when `!isDryRun && size>0`. **No event for "nothing fired"** | `world-info.js:899-903` | ✅ `:902` |
| H2 | `WORLDINFO_ENTRIES_LOADED({globalLore, characterLore, chatLore, personaLore})`, awaited inside `getSortedEntries` **before** sort/hash/clone | `:4590`, emit `:4604` | ✅ `:4478`/`:4492` |
| H3 | The arrays are per-call copies. `loadWorldInfo` returns a **deep clone** (`worldInfoCache = StructuredCloneMap({cloneOnGet:true})`), and each entry is then spread `{uid, world, ...rest}`. **Mutating `disable` on an array element is scan-local**; even nested `key` arrays are clones | `:882`, `:2041-2042`, `:4515,4535,4556,4577` | ✅ `:882` |
| H4 | The result is sorted (chat lore first `:4624`), hashed **after** the event (`hash = getStringHash(JSON.stringify(entry))` `:4628-4633`), then `structuredClone`d `:4638` | — | ✅ `:4527` |
| H5 | Timed effects (sticky/cooldown) match entries **by that hash** (`:585`, `:624`). A scan-time change that alters an entry's JSON (for example *adding* a missing `disable` key) changes its hash, and any sticky state recorded under the old hash is dropped once | — | re-check |
| H6 | Scan loop: `disable == true` is skipped (`:4801`) **before** the forced check (`:4885`), so a force of a disabled copy never lands. Keyless non-constant entries are skipped (`:4906`). Forced entries still pass probability (~`:5042-5053`) and budget (~`:5061-5070`) | — | ✅ `:4689`/`:4774` |
| H7 | Every `checkWorldInfo`, dry runs included, ends in `resetExternalEffects()`, which clears pending forces | `:418`, `:5275` | ✅ `:5156` |
| H8 | `WORLDINFO_SCAN_DONE(args)`, with `activated.entries` a live Map | `:5175` | ✅ `:5056` |
| H9 | Callers of `getSortedEntries`: `checkWorldInfo` (`:4744`), ST's **CHAT_CHANGED pre-cache** (`:1013-1018`, result discarded, fires **before our hydrate**), vectors (`vectors/index.js:1629`), ours (`worldInfoActivate.ts:12`), and any third party | — | ✅ pre-cache `:1016`, vectors `:1629` |
| H10 | Vectors WI: runs in its generate interceptor `rearrangeChat` (`vectors/index.js:776`, skips `quiet` `:778`) → `activateWorldInfo` `:1623`. It **skips `entry.disable`** (`:1646-1649`), **deletes vector items for entries absent from its view** (~`:1680-1690`), and forces matches via `WORLDINFO_FORCE_ACTIVATE` (`:1723`). So a gated-off copy is neither vectorised nor activated, and the churn is the same as today's file path | — | ✅ `:1629/:1646` |
| H11 | Emitter: `emit` awaits each listener in order and swallows errors (`public/lib/eventemitter.js:130-153`). `makeFirst`/`makeLast` reposition **at call time only** (`:66-110`); a later `.on` still lands after | — | ✅ `:66/:90` |
| H12 | `worldInfoCache` exported. ST's `deleteWorldInfo` evicts it (`:4361-4363`), deselects (`:4365-4369`), refreshes the list (`:4371`) and unbinds character/persona slots. It requires the name to be in `world_names` (`:4347`) | `:4346` | ✅ `:4234` |
| H13 | Event keys `WORLD_INFO_ACTIVATED` `events.js:62`, `WORLDINFO_FORCE_ACTIVATE` `:77`, `WORLDINFO_ENTRIES_LOADED` `:97`, `WORLDINFO_SCAN_DONE` `:98` | — | ✅ same lines |
| H14 | The generate interceptor runs before the WI scan (`script.js:4561-4573` < `:4635`), after `GENERATION_AFTER_COMMANDS` (`:4321`), and never on a dry run | — | re-check (T12c only) |

Live re-check still owed on 1.18.0: H5 (sticky across the scan-mode switch) and H14. This install
runs 1.19.0, so plan 09's clean-host-older run covers them only as jest seam tests. The spike report
must say so.

## Design

### T12 — activation evidence (build)
- **What:** new `stHost/worldInfoEvidence.ts` (inv 2).
  - Add `WORLD_INFO_ACTIVATED: [entries: HostScannableEntry[]]` to `events.ts` and correct the
    `ENTRIES_LOADED` payload type.
  - Records `{world, uid, comment, constant, key0}` per scan into a **per-loud-generation slot**.
    Plan 01's T6 tracker opens the slot and closes it at render/STOPPED. Several scans in one
    generation (tool recursion, nested quiet) are tagged, not merged.
  - A slot that closes with no event records `fired: []`. This is the "nothing fired" case PTMT
    gets wrong.
  - The ring is in memory (cap 20), keyed `chatId`, and carries `lastMessageId`.
    `rollbackFromMessage` drops the slots at/after the cut (inv 11).
  - Only miss **flags** are persisted, as journal events (`kind: "lore"`), so the journal cap
    applies.
- **Flags, only these (SUMMARY *Verified*):**
  - (a) `LoreSelection.landed` / `lost`: a forced pick absent from the slot → journal
    `lore-force-lost`, plus a judge-ring note. Reachable only with `judge.uses.loreSelect` on.
  - (b) A constant entry of the active gated plan that is enabled for this chat but absent. Budget
    or probability is the likely cause, but the flag only says "did not land".
  - Keyword-gated and mirror entries are **recorded, never flagged**.
- **Author view:** the Payload tab gains "Lore that fired last turn", next to the next-turn
  preview, with ours marked `gated`/`pick`/`mirror`. Author-only (inv 9). It never predicts, since
  dry runs emit nothing (H1).
- **Foreign-scan-filter Repair (shape rule, D9):**
  - `makeFirst` and `makeLast` observers on `ENTRIES_LOADED`, both re-asserted at each
    `GENERATION_STARTED` (H11), count entries per story book (requirements ∪ gated ∪
    `lore_select` ∪ `memory.wiBook`).
  - A book present at first and absent at last in **2 consecutive loud scans** becomes a
    `repair.ts` step, worded player-safe: *"Another extension is hiding this story's lorebook from
    the model"*. There are no names of foreign extensions (no allowlist).
- **Invariants:** 2 (new stHost module), 9, 11, 16 (read-only, so no WriteResult), 14 and 6 (never
  writes WI), 18 (the ring lives in a coordinator-free runtime module and rides the snapshot).
- **T12c (conditional):** a fixture emits a foreign dry `checkWorldInfo` between our force and the
  real scan (H7). **If** the pick is lost there (flag (a) fires), move the non-send force into
  `talkControlInterceptor`, which runs after GAC (H14). The `MESSAGE_SENT` path is unchanged. Not
  built otherwise.

### Mirror key hygiene (measure, then strip)
- **Measure:** during the T12 live runs (J3 ×2), compute the activation rate over loud generations
  for each live `so_` relationship entry.
- **Predeclared rule:** strip only if the **median rate ≥ 0.8**, meaning the entry fires as if it
  were constant. Otherwise record the rate and change nothing ("fires every turn" is unmeasured,
  SUMMARY T14).
- **Strip:**
  - keys = `entry.entities` minus roster names (via `nameOf`) minus the persona name, in a pure
    helper beside `mirroredEntries` (`memoryMirror.ts:53`);
  - a row left keyless is **not mirrored** and goes through the existing stale-disable path
    (`:93-105`), because keyless non-constant is inert (H6) and the row is already injected by the
    facts tier.
- **Invariants:** 15 (still no epistemic), 10 (the existing `lapsed()` check before each write).

### `so-assets` stale cache (seed D)
- Replace the raw POST (`so-assets.mts:143`) with ST's `deleteWorldInfo` after
  `updateWorldInfoList` (H12). It evicts the cache and deselects, so the manual deselect at
  `:148-160` goes.
- A book that is not listed falls back to the raw POST plus `worldInfoCache.delete(name)`.
- Update the gotchas "(open)" line when done. Harness only; no invariant touched.

### T13 — scan-time gating SPIKE
- **Hypothesis:** checkpoint `world_info` applied to the `ENTRIES_LOADED` copies (H2/H3) gives
  every chat the same effective lore that path replay gives it today:
  - with **zero** lorebook writes after a one-time normalisation;
  - no release step;
  - no cross-chat leak, even with SO disabled.
- **Spike build:**
  - Spike code sits behind an install-wide flag `worldInfo.gatingMode: "file" | "scan"` (default
    `file`, never flipped by this plan).
  - One pure function `scanGatePlan(libraryStories, loaded|null, path)` →
    `Map<book, Map<comment, on>>` = `worldInfoPlan` ∪ `releasePlan(library, keep=loaded)`. It
    shares the file path's comment matcher (`findMatchedLoreEntries` semantics: `world` via
    `lorebookFileId`, case-insensitive; `comment.trim()`).
  - The handler (`stHost/worldInfoScan.ts`) is **synchronous**. It is `makeLast`, re-asserted per
    generation.
  - It gates on `ctx.chatId === owned chatId`. Any other chat, including the CHAT_CHANGED
    pre-cache before hydrate (H9) and not-ready requirements, is treated as **no story**: every
    library gated entry is off.
  - It walks all four arrays.
  - Off → `disable = true`.
  - On → `disable = false` **only if** the copy still holds the file's resting value
    (compare-and-set, the `effectLedger` idiom), so a foreign listener's own disable (STLO's
    legacy budget path) is not overridden.
  - It never adds keys that are missing from the copy (H5).
  - It is memoised by `(chatId, storyId@version, path hash, library revision)`.
- **Normalisation:** each gated entry of each library story is set `disable: true` in its file
  once. That makes "off" the resting state, which is what an ST editor, a disabled SO or a no-story
  chat then sees.
  - It is recorded in install-wide settings (`worldInfo.normalized: {book: [comments]}`).
  - It re-runs incrementally on library save/import when a gated set grows.
  - Each book write is a typed `WriteResult` with read-back.
  - In the spike it runs on **marker copies** of the sun-ruins books plus a second story sharing
    one book. It never runs on real books.

**Predeclared pass conditions.** Every one must hold; the measurement is taken once per condition
and not retuned (inv 7 spirit).

| # | Condition | Measured by | Pass |
|---|---|---|---|
| S1 | **No-story chat sees no gated lore** | Force the file state adversarially: every gated entry enabled on disk. Then open (a) a no-story chat, (b) a chat of story B, (c) any chat with SO **disabled** after normalisation. Read `getScannableEntries()` and T12's ring over 3 real generations each | 0 gated entries of any non-owning story in any scan view or ring |
| S2 | **Per-chat correctness without writes** | Chat A at cp-4, chat B (same story) at cp-1, story C sharing one book; switch A→B→C→A ×3 | Each chat's effective set == `worldInfoPlan` for its path, 100%. **0** `saveWorldInfo` calls during the switches (counted with a fetch wrapper on `/api/worldinfo/edit`) |
| S3 | **One-time normalisation** | Run the normaliser twice, then import a story whose gated set grows | 1st run: exactly the gated entries flip. 2nd run: 0 writes. Entries outside gated sets are byte-identical (JSON diff). Growth normalises only the new entries |
| S4 | **Vectors still works** | Vectors `enabled_world_info` on, a marker book with 2 vectorised entries (one gated-on, one gated-off at this checkpoint), real query text matching both | The on entry is activated (in the ring), the off one is not. Vector insert/delete call count ≤ today's file path on the same script |
| S5 | **Author view shows effective state** | Author-only table: entry, file state, effective state for this chat, last fired (T12) | Matches `getScannableEntries()` for 100% of gated entries. `assert-player-clean` stays green |
| S6 | **File-write fallback** | Capability `wiScanGating` (`present` = our handler observed a probe scan, `absent`/`error` otherwise). Force `absent` | The file path (`applyWorldInfo` + release) runs and yields the S2 sets. Normalised files still work under it (it enables from rest-off) |
| S7 | **Force and selector coherence** | Judge `loreSelect` on, a pick inside a gated-off entry | Not a candidate (the view is gated). A forced gated-off copy never lands (H6) |
| S8 | **Cost** | Handler time per scan, 500-entry library, p95 over 50 scans incl. dry | ≤ 5 ms p95 |
| S9 | **Sticky survives** | A sticky gated entry active across the switch `file`→`scan` | Stays active, or the one-time loss is stated in the report. Not a fail by itself; a fail if it recurs after the switch |

- **Verdict:**
  - **PASS** = S1–S8 hold. Then build plan `05b-wi-scan-gating.md` is written **for v2.5** (X19),
    for user approval. v2.4 ships today's file path, so v2.4 acceptance stays stable. 05b covers:
    - the inv 14 rewording in `.claude/rules/architecture.md`: "checkpoint `world_info` is a
      per-scan view derived from the chat's path; files rest off; the file path is the capability
      fallback". The path-replay semantics are kept. It is applied when 05b ships, not in v2.4, so
      the invariant never describes code that is not running;
    - production normalisation of real books behind a confirm;
    - the default switch;
    - ledger rows for the normaliser;
    - unbound-mirror and bound-book requirements as follow-ups.
  - **FAIL** on any of S1–S8 → keep today's path, and record the failing measurement.
  - Either way, the spike code stays behind the `file` default. On a FAIL it is removed before
    plan 09.
- **Carried regardless of the verdict:** read the discarded WI `WriteResult`s
  (`effectsApplier.ts:100,102`). A refused flip is journaled and retried at the next apply. This is
  the one fix owed to today's path.
- **Invariants:** 14 (unchanged in v2.4; reworded by 05b in v2.5 only on PASS), 2, 10 (the handler's ownership check is synchronous;
  the normaliser takes a `RunToken`), 13 (install-wide home for mode and ledger), 16/17 (normaliser
  WriteResult + read-back), 6 (the curator scope still excludes gated entries), 20 (live evidence
  is real-LLM).

## Order of work
0. Enter H1–H14 into `host-facts.md` (X9), re-reading each line on the then-current tree.
1. Plan-01 T20 fixtures for WI shapes (red):
   - forced pick lost to a foreign dry scan;
   - activation ring across a nested quiet generation;
   - an `ENTRIES_LOADED` splicer hiding a story book.
2. `so-assets` cache fix (independent, small).
3. Read the discarded WI `WriteResult`s.
4. T12 seam + ring + flags + author list. Then the foreign-filter Repair. Then T12c only if step
   1's fixture stays red.
5. T12 live runs (J3 ×2, J7 ×1). These also produce the mirror firing-rate measurement.
6. Mirror key hygiene: apply or record, per the predeclared rule.
7. T13 spike: pure `scanGatePlan` + tests → handler behind the flag → normaliser on marker copies
   → S1–S9 → report + verdict.

## Tests and gates
- **Jest:**
  - `worldInfoEvidence.test.ts`: slot open/close, empty slot, rollback trim, tool-recursion
    tagging.
  - `loreSelect.test.ts`: landed/lost.
  - `scanGatePlan.test.ts`: property test that `scanGatePlan` ≡ `worldInfoPlan` ∪ `releasePlan`
    over seeded paths × libraries, including a shared book and duplicate comments.
  - `worldInfoScan.test.ts`: the handler over a fake payload. Covers compare-and-set, never adding
    keys, the non-owning chat being treated as no-story, and the pre-cache scan.
  - The normaliser is idempotent.
  - Mirror key strip.
  - `effectsApplier` refused-flip journal.
- **Harness:** `test:debug` node cases for `so-assets` removal against a fake page (cache evicted,
  unlisted fallback).
- **Mutation checks**, each recorded in `test/findings/mutations/`, where deleting the named line
  must fail exactly its own case:
  - the slot-close empty record;
  - the rollback trim;
  - the lost-pick comparison;
  - the handler's `chatId` guard;
  - compare-and-set;
  - the not-ready → no-story branch;
  - the discarded-result read;
  - the keyless-row skip.
- **Census:** add `ownership-sites.json` rows for the normaliser and the evidence ring writer.
  Add a fault-matrix row for WI evidence.
- **Live (real-LLM, headed, no `debugResponse`):**
  - **forced-pick evidence**: `loreSelect` on, a real reply, the ring shows the pick landed; the
    fixture's foreign dry scan shows `lore-force-lost`;
  - gated constant landed on a sun-ruins checkpoint;
  - the foreign-filter Repair with a scripted splicer;
  - J3 ×2 and J7 ×1 green with T12 on.
- **Spike report:** `docs/plans/v2.4/05-t13-spike-report.md`, one row per S-condition: measured
  value, pass/fail, and the 1.18.0 static note.
- **Records:** archived under `test/journeys/records/v2.4-plan05/` (run headers + diff, ring
  dumps, spike measurements).
- **Machine gates:** typecheck, typecheck:test, lint, test, build, test:release, test:debug. Then
  `st-session.mts reload`.

## Risks
- **Plan 01 T6 slips:** the slot boundaries fall back to STARTED/ENDED, which nested quiet
  generations break. T12 does not ship before T6.
- **Listener order is not durable** (H11): another extension's later `.on` runs after our "last"
  listener. That is why we re-assert per generation and use compare-and-set rather than a
  guarantee.
- **Spike normalisation touching real books** would be a destructive shared-install change. It is
  confined to marker copies, and `so-assets` cleanup plus a run-header diff sit around every spike
  run.
- **The hash change resets sticky/cooldown** (H5). Mitigated by never adding keys; the residue is
  stated in S9.
- **Shared browser/peer sessions** can move the page mid-spike (gotchas). Pin the group and diff
  run headers.
- **Duplicate comments in one book:** the file path flips only the first match. The shared matcher
  keeps that parity, and the property test pins it.

## Unresolved questions

None open. The 0.8 median-activation threshold for stripping mirror keys is **accepted as the predeclared floor**
(decided 2026-09-23 at reconciliation). It is fixed before the measurement runs and is never retuned after it (inv 7 spirit).

## Gate record

### Build (worktree, 2026-09-24/25)

Branch `worktree-agent-afd20cf3b9e97ab17` off master `4151bc8`. Commits `e35daa6` (T12 + WriteResult read + seed D),
`9877d6a` (T13 spike code + releasePlan fix), `55fb95f` (S5 author table + live fixtures), plus this docs commit.
**No live gate was run** (task scope: build + fixtures only). Every live item below is NOT green.

**As built**

| Item | State | Where |
|---|---|---|
| Step 0, host facts | H1–H14 re-read on 1.19.0; corrections: H6 forced check `:4886` (not `:4885`), H10 vectors force `:1725` (not `:1723`), H3 spread `:4557`. New rows H15/H16. 1.18.0 not re-read (see host-facts §Plan 05) | `host-facts.md` §Plan 05 |
| Step 1, T20 WI fixtures | forced pick lost to a foreign dry scan (`live-v24-05-forced-pick.json` case 2, via `test/fixtures/interop/wi-foreign.js`); ring across a nested quiet (`v24-05-ring-nested-quiet.json`, no backend); ENTRIES_LOADED splicer (`live-v24-05-foreign-filter.json`). Schema-valid, evals syntax-checked. Jest reds written first for each shape | `test/scenarios/`, `test/fixtures/interop/` |
| Step 2, seed D | `so-assets` deletes via ST `deleteWorldInfo` after `updateWorldInfoList` (evicts + deselects, H12); an unlisted book falls back to raw POST + `worldInfoCache.delete`; reports `staleCache`. Manual deselect/evict removed | `scripts/debug/lib/lorebookDelete.mts` (+ 4 node cases), `so-assets.mts` |
| Step 3, WI WriteResults | **The plan's claim is stale**: `effectsApplier.ts:100,102` already read both results since V17. What was missing was proof: added cases for a refused ENABLE (journaled) and retry at the next apply | `effectsApplier.test.ts` |
| Step 4, T12 | `stHost/worldInfoEvidence.ts` (WORLD_INFO_ACTIVATED + makeFirst/makeLast ENTRIES_LOADED observers, re-asserted at GENERATION_STARTED); pure ring `runtime/worldInfoEvidence.ts` (cap 20, chat-keyed, per-loud-generation slot opened/settled by the T6 lifecycle intents, scans tagged, empty slot = `fired: []`, rollback trim via `RunContext.lowestMutatedSince`); host wiring `worldInfoEvidenceHost.ts`; journal kind `lore`; flags `lore-force-lost` + `lore-constant-missed`; author list `#so-lore-fired` (Payload tab, gated/pick/mirror/other); Repair step "Another extension is hiding this story's lorebook from the model." after 2 consecutive loud generations | see files |
| T12c | NOT built: conditional on a live measurement (forced-pick case 2) that has not run | — |
| Step 5, T12 live (J3 ×2, J7 ×1) | NOT run | — |
| Step 6, mirror key hygiene | NOT built: the predeclared median ≥ 0.8 is unmeasured. `live-v24-05-mirror-rate.json` measures it and applies the rule; nothing retuned | fixture |
| Step 7, T13 spike | code built behind `worldInfo.gatingMode` (default `file`, not flipped): `scanGatePlan`/`applyScanGate` (pure), `ScanGateProvider` (memoised, owner/ready guard), `stHost/worldInfoScan.ts` (sync last listener + `wiScanGating` probe), normaliser on `SO-T13` marker books only (`RunToken` before each write, records only confirmed writes), file-path skip in `effectsApplier` while active, S5 author table `#so-scan-gate`. **Verdict PENDING**: S1–S9 not measured | `05-t13-spike-report.md` |

**Decisions (made on evidence, not user-owned)**
- `landed`/`lost` live on the evidence slot, not on `LoreSelection`: a selection resolves before its scan.
- The flag-(a) judge-ring note was skipped, to stay out of plan 07's `JudgeCallRecord`. The `lore` journal record is the flag.
- Flags need at least one loud scan observed in the slot, because ST emits nothing for an empty scan (H1). Otherwise every quiet turn would raise one.
- Hidden-book counting is per loud generation, 2 consecutive, with no foreign-extension names.
- The ring writer has no census row: it never awaits, and the guard refuses rows for non-sites. The normaliser has a `checked` row.
- `wiScanGating` is a spike-local probe, kept out of `CAPABILITY_IDS`, so the shipped capability read-out does not change.
- Scan gating starts only after `settingsReady()`, because the mode is an install-wide setting.
- S5 author table added so S5 is measurable at all.
- The `.claude/CLAUDE.md` status row is left to the merge, to avoid conflicting with the parallel 04/07a builds.

**Deviations**
- A release-plan defect found by the T13 property test (a 300-seed oracle against the file path): `releasePlan` keyed its keep index by the authored book spelling. A story naming the same book in another case released entries the incoming story gates. A second spelling in one story also overwrote the first. Now keyed by file id and merged. Red tests came first (`worldInfoGates.test.ts`, 2 cases). This changes today's file path, which is a correct fix, not a spike artefact.
- `runtimeManager.noteRecap` gained a `kind` parameter (default `"story"`), with zero net lines (manager 737 effective).

**Gates** (worktree, after the last code commit)

| Gate | Result |
|---|---|
| `npm run typecheck && npm run typecheck:test && npm run lint && npm run debug:typecheck` | exit 0 |
| `npm test` | 221 suites, 3278 tests pass (baseline 214 / 3214) |
| `npm run build` | ok (2 size warnings, as before); manifest bundle `697b71e4a097`, ST version unknown (worktree) |
| `npm run test:debug` (after build) | 231: 230 pass, 1 skip, 0 fail |
| Storybook (`storybook:build`, `.sb-static` on :6347, `test-storybook --index-json`, server stopped) | 32 suites, 208/208 |
| Fault matrix | `wiEvidence` package added: 110 cells, 75 covered / 10 partial / 25 na / 0 todo (was 70/10/20/0 of 100) |
| Ownership census, architecture guards | green |
| `test:release`, `st-session reload`, live | not run |

**Mutants**
- `test/findings/mutations/v24-05-t12.txt`: 16/16 killed. W2, the enable half of the WriteResult read, first survived and was killed after the refused-enable case was added.
- `test/findings/mutations/v24-05-t13.txt`: 19/20 killed. 1 equivalent (S7, argued in the record). S2/S4 were re-run after the `gateEntry` refactor.
- The keyless-row skip has no mutant, because the strip was not built.

**Live fixtures written (not run)**
- `test/scenarios/v24-05-ring-nested-quiet.json` (no backend)
- `test/scenarios/live-v24-05-forced-pick.json`
- `test/scenarios/live-v24-05-gated-constant.json`
- `test/scenarios/live-v24-05-foreign-filter.json`
- `test/scenarios/live-v24-05-mirror-rate.json`
- `test/scenarios/live-v24-05-t13-spike.json` (46 steps plus a `_design` block for the manual S1c/S4/S7/S9 legs)

**Remaining**
1. Every live fixture above ×2, plus J3 ×2 and J7 ×1 with T12 on. Records go under `test/journeys/records/v2.4-plan05/`.
2. The T12c decision, from forced-pick case 2.
3. The mirror-rate measurement, then the strip (plus its keyless-row mutant) only if the median is ≥ 0.8.
4. T13 S1–S9 on a lane, with the manual legs; then the spike report verdict. On PASS, write `05b` for v2.5. On FAIL, remove the spike code before plan 09.
5. `test:release`; the CLAUDE.md status row.
