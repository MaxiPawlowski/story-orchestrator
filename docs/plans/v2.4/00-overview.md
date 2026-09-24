# Implementation Overview — Story Orchestrator v2.4: correct under the host as it really is

**Status: APPROVED 2026-09-23 (user). Plan docs 01–09 are written.** Building waits for the
frozen v2.3 candidate (D1). §Reconciliation, at the end, records what writing the plan docs
changed. Where it disagrees with an earlier section of this file, the reconciliation wins.

v2.3 made the extension correct under the mutations *we* modelled: chat switches, our own
boundaries, and ST's turn types. A review of 55 community extensions plus Jeved and four Reddit
threads (`extension-research/SUMMARY.md`) found that the host is wider than that model:
- ST itself mutates chats without events (`/hide`, `messageEditMove`, branches).
- Other extensions generate inside our turn, rewrite messages and patch `fetch`.
- `MESSAGE_DELETED` does not carry what we assumed it carries.

v2.4 closes that gap first, then spends what is left on author leverage and on judge uses that
earn their floor.

v2.4 builds **no new autonomous agent**, no reroll, no rewrite pass, and no rule that runs
STscript. Those were the research's most-copied patterns and are listed as anti-patterns in
§Out of scope.

## Inputs

1. **`extension-research/SUMMARY.md`**: 55 repo reports plus Jeved plus the Reddit threads.
   - T1–T20 were adversarially verified 2026-09-23 (20/20 kept, 10 corrected).
   - T21 was verified separately (CONFIRMED).
   - T22–T25 and every §11/Reddit idea are **unverified**.
   - Line numbers there are at HEAD `fcc33cc` while v2.3 is still moving.
2. **`docs/plans/v2.3/v2.4-seeds.md`**: what v2.3 bounced, each item with its reason and
   measurement. Mapped to plans below; §Overlap in SUMMARY has the row-by-row relation.
3. **The v2.3 carry-over decision** (user, 2026-09-23, `SUMMARY.md` §v2.3 carry-over).
   - v2.3 finishes as planned and none of this research goes into it.
   - Findings that contradict v2.3 claims become v2.4's first plan.
   - Until plan 01 lands, v2.3's acceptance is read with those caveats.

## Entry condition

v2.4 starts on the **frozen v2.3 candidate**. That means v2.3's work queue is closed or each
remaining row is a deferral the user signed off (v2.3 rule 14), and L1 (P0′ playthrough) is
recorded. That playthrough is also v2.4's baseline, the run every v2.4 plan compares against.

Nothing starts earlier (D1). Plan 01 edits files v2.3's V22 still rewrites.

## Rules for every v2.4 build agent (additive to v2 … v2.3, including v2.3 rules 11–17)

1. **Research is a source, not evidence.**
   - A community claim, a vendor statement or a Reddit number never counts as a measurement.
   - Every item re-verifies its "Ours" line on the current tree before building, because SUMMARY
     cites `fcc33cc` and the tree has moved.
   - A stale line is corrected in the plan doc, not argued with.
2. **Host shape before fix.**
   - Every host-mutation or lifecycle item starts from a failing fixture in the plan-01 interop
     corpus (T20).
   - It also needs a verified host fact (ST `file:line`) in `00-implementation-overview`'s
     host-facts table. No fixture, no fix.
3. **No blob version bump in v2.4 (X1).** v2.3.0 replaces any blob version it does not know
   with a fresh one (`persistence.ts:48-55,72-75`), so a v5 would destroy the story for anyone
   who runs v2.3.0 afterwards.
   - T3's fingerprints and T2's `integrity` stamp go in as **optional v4 fields**. v2.3 keeps a
     v4 blob as-is (`persistence.ts:48`) and only drops fields it does not know when it
     re-sanitizes, so the worst a downgrade can do is lose the fingerprints.
   - A missing fingerprint reads as "unknown", never as a mismatch.
   - The downgrade guard (T11) still ships, so every **future** bump is safe.
   - A migration test proves both directions: v2.4 reads a v2.3 blob, and a blob written by
     v2.4 survives a v2.3 read-and-write with the story intact.
4. **Every judge item is its own Phase A** (inv 7, v2.2 rule 1).
   - Each needs a ≥20-case fixture with a Spanish slice and a predeclared floor.
   - Each is a `judge.uses.*` key, off by default and never flipped by a plan.
   - Each keeps today's path on disabled, unavailable, timeout or error.
   - A judge-off control arm is a column in its live gate.
5. **A one-turn note is measured for over-steer.** Any new one-turn block (agency note, house-rule
   note, objective block) gets the over-steer probe from plan 07: the next reply must not restate
   the note or swing past it. The Reddit criticism of OOC nudges is the reason.
6. **Schema additions are additive-optional and diffed.**
   - This covers `evidence_from`, `house_rules`, `agency.player_attempts_only` and the objective
     block's per-story switch.
   - Each ships with a `storyDiff` classification row, a `DIAGNOSTIC_CONSEQUENCES` entry and a
     Studio control.
   - Absent means today's behaviour **unless the user decides otherwise per item**. C4's "absent =
     defaults" rule makes that an explicit decision, not an accident.
7. **Nothing the player sees changes without a player session.** Items that add player-facing
   surface wait for the outstanding v2.3 player sessions: an options menu, visible qualities, a
   cross-chat Continue list, a wand-menu entry, and the objective block's player echo.
8. **Carry-in corrections are edits to v2.3 docs, made in v2.4.**
   - Plan 01 corrects the v2.3 docs, `.claude/CLAUDE.md` and `.claude/rules/*` named in SUMMARY
     §v2.3 carry-over.
   - Each correction states "corrected in v2.4 plan 01" and cites the evidence, so v2.3's
     history stays readable.

## Plan sequence

| # | Plan | Items (SUMMARY ids) | Depends on | Bucket |
|---|---|---|---|---|
| 01 | **Carry-in**: the interop corpus, and the v2.3 claims it disproves | T20 no-backend rows (the failing spec), T1, T10, T6, **checkpoint `guidance` injection (spec v2 defect, D7)**, corrections T21/T4/T2 | frozen v2.3 | H, T, S |
| 02 | **Chat identity and silent mutation** | T11 → T3 (blob bump), same-chat reload, hidden ≠ deleted, T2 branches, T14 reap + scene-row mirror stop, T8 install-wide save evidence, persona/requirements re-evaluation | 01 | H |
| 03 | **Off-path call hygiene** | T4 abort + timeout (+ backlog Stop, expansion `generating` wedge), T5 transient ≠ disabled (+ dangling profile), T9 request-size bound (seed D), finish_reason truncation, loop detector, input-proportional maxTokens, CC sampler override fix | 01 | X |
| 04 | **Extraction input quality** | T7 window hygiene (regex parity optional), T15 speaker-aware evidence, live-suite per-tier floors (seed C) | 03 (shared window path) | X |
| 05 | **World Info: evidence, then gating** | T12 activation evidence, T13 scan-time gating **spike**, mirror key hygiene, `so-assets` `worldInfoCache` fix (seed D) | 01; T13 needs T12 | W |
| 06 | **Steering and stagecraft** | T16 objective line (`auto`) + AN-inheritance diagnostic, T17 curator hardening, F5 curator `create` op Phase A (seed B), CC preset contract decision (seed A) | 04 (evidence rules), 05 | S |
| 07 | **Judge: accounting first, then new uses** | T24 usage/cost + readiness by model, T25 narrowed (model-id map + token guard, D10), dead toggles `sceneOoc`/`memoryRerank` wire-or-remove, T22 agency check, T23 house rules, over-steer probe, judge-off control column | 01 (T21 corrections); T22 after 04's T15 decision | J |
| 08 | **Author observability** | T19 next-turn cost/fate + `/chat-jump` provenance, T18 per-pass profile routing, per-quality macro (R15) | 03 (routing touches every pass) | U, X |
| 09 | **Acceptance** | J0–J12 `--strict` ×2, interop live rows, per-plan live gates re-run on the final tree, judge-on matrix for new uses, clean-host ×2, attestation, human sessions | all | — |

Plans 03 and 05 can run in parallel with 02 after 01, since they touch different subsystems. Plan
07's T24/T25 need only 01 and can start early. Its new uses (T22/T23) come last because they reuse
the warden path and inherit T15's decision.

## Plan outlines

### 01 Carry-in
- **Why first:** three defects contradict what v2.3 certifies, and one spec v2 feature was never
  built (guidance injection, D7).
  - T1: `MESSAGE_DELETED` carries the post-delete `chat.length`, which breaks plan 04's
    `rollback ≡ replay` on a middle delete.
  - T10: after our own `/comment` in a group, the active speaker reads null, which affects plan
    05's per-member block.
  - T6: quiet, nested or foreign generations clear the private block and spend the warden note,
    which breaks plan 05's claims whenever Stepped Thinking or Guided Generations is installed.
- **Order:**
  1. T20 fixtures for the three shapes, red.
  2. T1: an identity-snapshot diff; an ambiguous diff journals and falls back, never guesses.
  3. T10: the speaker skips `is_system`/image rows.
  4. T6: an outermost-loud-generation tracker; the private, nudge and note blocks clear only at
     its render or STOPPED.
  5. **Guidance injection (D7).** The active checkpoint's `guidance` goes into a registry block
     while that checkpoint is active, for authored and generated checkpoints alike. This is spec v2
     §75/§225, which was never built.
  6. The doc and comment corrections (T21 × 9 locations, T4 × 3 comments + plan-03 statement,
     T2 × 1 line). The `loreRelevance.test.ts:54` assertion is renamed "rounded Score", not
     deleted.
- **Done:**
  - each fixture is green, with a live group probe for T10;
  - a live T6 run with Stepped Thinking's thinking switched on. The extension is installed and
    enabled here, but its own `is_enabled` is `false`, so the run flips that install-wide setting
    and restores it;
  - a live guidance check: the block appears in a captured request on an authored and on a
    generated checkpoint;
  - J5 and J6 re-run ×2 strict.

### 02 Chat identity and silent mutation
- T11 comes first:
  - an unknown blob version is read as detached, with no automatic write and a journal entry;
  - `minimum_client_version: 1.18.0` goes in `manifest.json`, asserted by `test:release`.
- T3 is **the** blob bump:
  - store `{messageId, hash}` per boundary, with a hash over `mes`, `is_user`, `name` and
    `swipe_id`;
  - `is_system` is deliberately **not** hashed (D5): hiding is tracked separately so it never
    rolls back;
  - reconcile at boundary, hydrate and same-chat reload;
  - a continue re-fingerprints, and a legacy boundary counts as unknown, not as a mismatch.
- **Hidden ≠ deleted (D5):** hiding a consumed message never rolls back. The message is left out
  of future read windows and its facts stay live.
- **T2 (D3):**
  - a branch is detected as `main_chat === stampedFor` with a fresh `integrity`;
  - on open, a non-blocking drawer/HUD notice with a **Continue from here** button appears; there
    is no popup and no auto-adopt (V5);
  - the button is an explicit adopt plus a rollback to the branch tail;
  - the parent's mirror is unbound while the branch is unadopted.
- **T14:**
  - type the `CHAT_DELETED` / `GROUP_CHAT_DELETED` payloads;
  - reap owned mirror books only behind a confirm or Repair;
  - stop mirroring scene rows (they are inert), and strip roster names from keys.
- **T8:** read back the library and settings saves (`/api/settings/get`), and re-wrap the save
  watcher if a peer restored `fetch`.
- **Persona:** re-evaluate requirements on `PERSONA_CHANGED`, `GROUP_UPDATED` and
  `WORLDINFO_SETTINGS_UPDATED`, and apply hydrate effects on not-ready → ready.
- **Done:**
  - the migration property test passes;
  - each T20 row for these shapes is green;
  - J6 and J10 ×2;
  - a live branch-mid-story run, plus a live no-op-edit run (no rewind).

### 03 Off-path call hygiene
- **T4:**
  - pass an `AbortSignal` through `sendRequest` `custom.signal`, with a per-read controller
    (the epoch signal alone never aborts on rollback) plus `AbortSignal.timeout`;
  - `AbortError` means lapsed, never a failed read, and `runWithRetries` short-circuits on it;
  - add a Stop control for the memorize backlog;
  - the expansion `generating` marker clears on abort (seed D).
- **T5 (D4):** the runtime never writes `extraction.enabled` again. Today it does
  (`runtimeManager.ts:432-438`), which silently switches extraction off in every chat.
  - A failure is classified as transport, config or bug.
  - Transport gets an in-memory breaker (not persisted), backoff, a profile probe, auto-resume and
    a player "Try again".
  - Config becomes the `not-configured` pipeline state plus a Repair step, including for a deleted
    profile.
  - A bug is a per-chat error state, journaled, and retried at the next boundary.
- **T9:**
  - a pure token chunker for summary passes only, never DELTA reads;
  - the scene summary spans the whole scene;
  - an unknown context limit falls back to a declared default and is reported, never failing
    closed;
  - an author preflight confirm before manual heavy passes.
- **Small items:**
  - truncation from `finish_reason`;
  - a degenerate-loop detector;
  - input-proportional `maxTokens`;
  - stop spreading `temperature`/`top_p` over CC sources that constrain them.
- **Done:** a live backend pause-and-resume without losing extraction install-wide, an abort on
  rollback mid-read, and `memorize:full` on a long chat under the budget.

### 04 Extraction input quality
- **T7:** one pure cleaner in `getChatWindow`, shared by the prompt, `evidenceInWindow` and stored
  evidence (inv 4). It drops extension-owned and foreign UI messages. Regex parity through a new
  `stHost/regex.ts` is optional and capability-probed.
- **T15 (D6):**
  - the per-quality `evidence_from: any | world` defaults to `any`, which is today's behaviour;
  - a Studio diagnostic suggests `world` on outcome qualities that gate an anchor;
  - `evidenceInWindow` returns the matched message;
  - the judge typed-extraction path follows the same rule;
  - the "player writes attempts" steering clause is an opt-in per story;
  - both defaults are revisited after a player session.
- **Live-suite floors (seed C):** set from the v2.3 measurement or re-read the fixtures, and
  record which was chosen. The live suite re-runs after T7, because cleaning changes evidence.
- **Done:** goldens and the live suite are green at the declared floors, and J3 ×2.

### 05 World Info
- **T12:**
  - a `WORLD_INFO_ACTIVATED` seam feeds a per-generation ring;
  - `LoreSelector` reports forced ≠ landed;
  - only constant or forced misses are flagged;
  - a Repair check covers a foreign scan filter hiding our book, worded player-safe.
- **T13 is a spike, not a build:** scan-time gating via `WORLDINFO_ENTRIES_LOADED` over per-scan
  copies. Its predeclared pass conditions are:
  - a no-story chat sees no gated lore;
  - files are normalised once;
  - the vectors extension still works;
  - the author view shows effective state;
  - a file-write fallback exists.
  A pass means inv 14 is reworded and a build plan follows; a fail keeps today's path replay.
- Mirror key hygiene and the `so-assets` `worldInfoCache.delete` fix.
- **Done:** T12 evidence live on a forced pick, and the T13 spike report with its verdict.

### 06 Steering and stagecraft
- **T16 (D7):** guidance already landed in plan 01. This adds the objective line to that block.
  - Per story, `objective_block: auto | off`, default `auto`.
  - `auto` adds the objective only when the active checkpoint has no author note of its own (a
    generated beat, or an inherited note). Every real story authors a note on every checkpoint,
    and those notes already restate the objective.
  - No look-ahead to upcoming checkpoints (C4).
  - Add the AN-inheritance diagnostic.
- **T17:**
  - refuse `[rewrite]` when the content exceeds what the prompt showed;
  - uid addressing, and refuse ambiguous or prefix titles;
  - feed rejected ops back;
  - a word diff on review cards;
  - fuzzy anchors in review mode only.
- **F5 `create` op:** its own Phase A with a floor (seed B), using the near-dup trigram and uid
  patterns.
- **CC preset contract (seed A):** decide between a per-request `SETTINGS_READY` overlay,
  `/preset` with exact read-back, and textgen-only by contract. The decision comes first and a
  build only if chosen.

### 07 Judge
- **Order:**
  1. T24: record `usage`/cost in `JudgeCallRecord`; readiness facts carry `measuredOn`; the panel
     says "not measured on <model>".
  2. T25, narrowed (D10):
     - a model-id map, the answering model recorded, and a token guard once Jev's limit is
       verified;
     - hosted routes (NanoGPT, OpenRouter) and local Jev-likes are **deferred to v2.5**.
  3. Dead toggles: `sceneOoc` and `memoryRerank` get a consumer that earns a floor, or are
     removed (the v2.3 V19 hide becomes a decision).
  4. T22: a warden-family agency Score whose note goes through the `continuityNote` path, never a
     reroll.
  5. T23: authored `house_rules` in the pinned story, one Noul per rule in the warden's call,
     capped.
  6. ~~T21 fresh-row arms~~: dropped (D11).
- **Cross-cutting:** a judge-off control column (Reddit R8), the over-steer probe (R9), and a
  privacy-report row per host.
- **Done:** every new use is at or above its predeclared floor, **or recorded as not built**. No
  floor is retuned.

### 08 Author observability
- **T19:**
  - the next-turn preview shows tokens and share of context (textgen max-context read verified
    first);
  - foreign extensions' blocks are shown read-only;
  - each memory row shows its fate (quarantined, superseded, other speaker, over budget) and trim
    telemetry;
  - "message N" opens `/chat-jump N`.
  It overlaps v2.3 V19 ("open owning editor"): build on whatever V19 shipped.
- **T18:** optional per-pass-family profiles (read, synthesis, authoring, director, curator) that
  fall back to `extraction.profileId`.
  - Requests go per request through the CM, never through a global switch.
  - Each role gets a self-test row, a Repair row and its own calibration, with no floor retuned.
- **Per-quality macro** `{{story_quality::<key>}}`, if the `MacrosParser` seam takes parametric
  macros; verify that first.

### 09 Acceptance
v2.3 plan 11's shape carries over, with v2.3 rules 11–13 applied: archived records, "twice" meaning
consecutive, and `--strict`. It adds:
- the interop live rows (plan 01/02 shapes on a real install with Stepped Thinking present);
- the judge-on matrix for the uses plan 07 built;
- a cost report from T24's ring;
- human sessions;
- clean-host ×2;
- a **Tested on** row for ST **1.19.0**. The working tree's `package.json` now reads 1.19.0,
  while v2.3 declared 1.18.0 plus a pinned revision;
- an attestation that cites only records that exist.

## Carry-in corrections (plan 01 edits these; nothing is edited before plan 01)

| Location | Correction |
|---|---|
| `docs/plans/v2.3/10-judge-seeds.md:155,157-158,168,169-174` (line numbers re-verified by plan 01) | The Score arm was ranked after `Math.round`; raw Score ties 0.04, not 1.00. "Noul stays" holds on nDCG. Drop "a finer scale" |
| `.claude/CLAUDE.md:20` (the claim appears three times) | same |
| `.claude/rules/architecture.md:97` | same |
| `docs/plans/v2.3/v2.4-seeds.md:23-24` | same; retire the "finer scale" seed |
| `docs/plans/v2.3/11-acceptance.md:808-809` | label the arm "rounded Score" |
| `docs/plans/v2.3/recommended-config.md:38` | the shipped **Noul** arm's tie rate is 0.08, not 1.00 |
| `src/judge/loreRelevance.test.ts:50,54`, `src/judge/loreScore.ts:56` | rename the test to state the rounded arm; fix the "raw scale value" comment |
| `test/findings/ledger.json:248` (F4 `provenBy`) | same wording as the plan-10 correction |
| `src/runtime/runOwner.ts:56-63`, `src/judge/types.ts:65-69`, `src/runtime/epochAbort.review.test.ts:8-11`, `docs/plans/v2.3/03-async-ownership.md:1676-1684,1789` | `sendRequest` honours `custom.signal` (`shared.js:415,423-424,464,484`, in 1.18.0 too) |
| `docs/plans/v2.3/live-gate-playbook.md` §0 steps 4–6 | the RunPod HTTPS proxy does not reach a loopback `llama-server`. The working route is the SSH tunnel from `get-pod` `ssh.direct` to `127.0.0.1:18080` (gotchas 2026-09-23) |
| `docs/plans/v2.3/03-async-ownership.md:2715` | a branch **does** copy our blob and the chat lorebook slot (`bookmarks.js:201,284`, `script.js:7406`) |

## Seeds from v2.3 → where they land

| v2.3 seed | v2.4 |
|---|---|
| A `player_summary` | waits for the player sessions (rule 7); adjacent to 06's objective block |
| A CC preset adapter | 06, contract decision first |
| B lore-ranking rebuild / finer scale | retired by 01's correction; fresh-row arms dropped (D11) |
| B WI `create` op (F5) | 06, own Phase A |
| B other plan-10 spikes (scene-break confirm, canon verify, …) | **not scheduled**; each needs its own Phase A, v2.5 candidates |
| B `so-lore-probe diff` | 07, as the judge-off control column |
| B judge drift | 07 T24/T25 (a hosted alias makes it measurable) |
| B `sceneOoc` / `memoryRerank` | 07, wire-or-remove |
| C live-suite floors | 04 |
| C `backgrounds` below floor | 07: re-calibrate on the shipping model or leave it out of the recommended set |
| D expansion `generating` wedge | 03 (T4) |
| D `so-assets` stale cache | 05 |
| D out-of-horizon history | 02: the branch-from-checkpoint option (timelines) is a third choice beside re-read and restart |
| D request-size bound | 03 (T9) |
| D `commitDecision` id-keyed restore | 02, compare-and-set shape from `effectLedger` |
| E save-evidence asymmetry | kept as is; 02's T8 extends evidence without unifying the predicates |

## Out of scope for v2.4

- **Anti-patterns (not deferred, refused):**
  - auto-reroll or auto-swipe QA;
  - judge-driven rewrite or recast passes;
  - rules that run STscript;
  - a browser-held judge key;
  - a judge probability deciding a state write.
- **v2.5 candidates** (next tier in SUMMARY; need a decision or a spike first):
  - swipe-back cache;
  - interceptor trimming and witness-filtered transcripts (re-deciding "no message-level
    hiding");
  - roster aliases and canonicalisation;
  - append-only short_term;
  - complication pool and adversity read (R13);
  - story-owned scenario;
  - seeded chance gates;
  - re-commit after a third-party rewrite;
  - lore contradiction in the warden (R14);
  - judge tension read and pre-reply Choice;
  - boundary judge bundle;
  - Studio gate replay.
- **Hosted judge routes and local Jev-likes** (D10). **Per-message author inspector** (D12).
- **Player-facing surface** (rule 7): options menu, visible qualities, cross-chat Continue list,
  wand-menu entry.
- **Multiplayer POV.**

## Status

| Plan | Status |
|---|---|
| 00 overview | APPROVED 2026-09-23, reconciled |
| 01 | built + integrated 2026-09-24; every live item green ×2 on `14402df10a0e` incl. `so-turn-types-check` + lane-0 header diff (0 diffs); open: J6.4/J6.7/J5.8/J8.5 intermittents (not reproduced on final); `01-carry-in.md` §Gate record, Final build |
| 02 | integrated on master 2026-09-24 (`34227e5`); 13 fixtures red→green ×2, J6/J10 ×2 on `14402df10a0e`; 4 live-found save/drain defects fixed; NOT accepted: downgrade leg (test, v2.3 blob, J10.12, clean-host) not built; `02-chat-identity-silent-mutation.md` §Integration and live gate |
| 03 | built + integrated 2026-09-24; every live gate green ×2 (final bundle `100696d1d4a0`; gate 3 on `27d0f711bf9b`); 4 live-found defects fixed; `03-off-path-call-hygiene.md` §Final live gates |
| 04, 05, 07 (part 1) | building in worktrees 2026-09-24 |
| 06, 07 (part 2), 08, 09 | written 2026-09-23, not started |

## Decisions (2026-09-23, made on evidence at the user's request)

The draft's 14 open questions were checked against our code, ST's source (the working tree reads
**1.19.0**) and this install, then decided. Each one is reversible, and the user can overturn any
row.

| # | Question | Decision | Evidence |
|---|---|---|---|
| D1 | Entry condition | **Wait for the frozen v2.3 candidate.** Nothing in v2.4 starts early | v2.3's queue still has open rows (V15b, V17–V20e, V22, V24, V25, L1–L8). Plan 01 edits `.claude/CLAUDE.md`, the same file V22 rewrites, so starting early collides and also breaks "don't touch v2.3" |
| D2 | T6 in plan 01 or 02 | **Plan 01** | It contradicts plan 05's certified private-block and warden-note claims. The mechanism is real: ST fires `GENERATION_ENDED` from `hideStopButton` (`script.js:3531-3537`), and we clear on every ENDED/STOPPED (`runtime/index.ts:191-192`, `runtimeManager.ts:637`). Stepped Thinking runs a quiet generation at `GENERATION_AFTER_COMMANDS` (`st-stepped-thinking/thinking/engine.js:56,443`) and **is installed and enabled here**. Its own thinking toggle is off today, so the defect is one checkbox away for this user |
| D3 | T2: offer continue on open vs explicit select | **Non-blocking notice on open with a "Continue from here" button**; no popup, no auto-adopt | V5 forbids auto-adopt. Explicit-select-only leaves a branch reading "no story" with no hint why, which is the discoverability gap the research found |
| D4 | T5: which failures pause install-wide | **None.** The runtime never writes `extraction.enabled` again | `pauseExtraction` calls `setGlobalSettings({extraction:{enabled:false}})` (`runtimeManager.ts:432-438`), which stops every chat after one transport blip. The verifier found content failures mostly don't throw, so "which failures" reduces to transport (in-memory breaker), config (`not-configured` + Repair) and bug (per-chat error) |
| D5 | `/hide` of a consumed message | **Never rolls back.** Left out of future read windows; its facts stay live; `is_system` stays out of T3's hash **and out of T1's identity key** | `/hide` flips `is_system` and saves with no event (`chats.js:147-168`). Memory extensions hide as housekeeping: ST Memory Books auto-hides summarised messages (`st-memory-books/source/addlore.js:79-86`); it is installed here but **disabled**. Rolling back on hide would rewind the story every time such a tool tidied context. The behaviour already holds today, because `chatWindow.ts:8` drops `is_system` and `/hide` fires no event. The work is tests, plus keeping T1 and T3 from breaking it |
| D6 | T15: "player lines prove attempts only" default | **Opt-in**: `evidence_from` defaults to `any` (today); a Studio diagnostic suggests `world` for outcome qualities that gate an anchor; the steering clause is opt-in per story. **Revisit after a player session**, together with T22 | A default change alters how every existing story's gates fire (C4 "absent = defaults" would make it silent). No player session has measured the need, so shipping the capability plus a diagnostic costs nothing, while flipping the default is exactly the untested behaviour change rule 7 guards against |
| D7 | T16: objective block default | **Guidance is always injected (moved to plan 01 as a carry-in); the objective line is `auto`**, added only when the checkpoint has no author note of its own | Spec v2 says a checkpoint's guidance is injected, "steering text while active" (`story-orchestrator-spec-v2.md:75,225`), but **nothing in `src/runtime` reads `guidance`** (only copilot/generation parse and `merge.ts:29`). Every real story authors it (Adolion academy 9/9, adventurer 14/14, sun-ruins 3/9), and generated beats carry guidance and **no** author note, so today a generated checkpoint gets no steering at all. The same stories author a note on every checkpoint that already restates the objective (sun-ruins 9/9, Adolion 23/23), hence `auto` for the objective line |
| D8 | T13: run the scan-time WI gating spike? | **Yes, as a spike** with predeclared pass conditions and a file-write fallback | It is the only item that removes the cross-chat leak class inv 14 contains, rather than managing it. "The ST editor shows file state" is acceptable: gated entries resting off in the file is the cleaner author view, and the author view shows effective state |
| D9 | T6/T7: marker allowlist vs shape rules | **Shape rules first** (ST's own event-argument shapes, `is_system`, `extra.type`); a named marker only for an extension with a fixture built from its source, capability-guarded; unknown means an ordinary message | An allowlist silently rots as extensions change. Shape rules cover the foreign-emitter case outright (Guided Generations' `{source}` payload is not ST's `(type, params, dryRun)` shape, `script.js:4299`) |
| D10 | T25: hosted judge routes / local Jev-likes | **Deferred to v2.5.** v2.4 builds only the model-id map, answering-model record and token guard | Each hosted route adds a second third party per call, plus a calibration per host×model. Nothing here needs it: the TypeSafe key is configured. Local Jev-likes are reported at ~1k context (laya) or a different contract (openjev), below every state we send |
| D11 | T21: fresh-row lore arms | **Dropped** | The verified recompute shows no nDCG gain for raw Score (0.9197 < 0.9272 even at the label-gap bound 0.9208), and the hybrid changes no top-4 set. The corrections in plan 01 are all that is owed |
| D12 | Author-view message buttons | **Not needed in v2.4**: provenance navigation uses `/chat-jump N` from the drawer; a per-message inspector (`.extraMesButtons`) is v2.5 | `/chat-jump` exists since ST 1.13.0 (`slash-commands.js:3449`), well below our declared minimum, and touches no message DOM |
| D13 | Dedicated ST user account for destructive journeys | **No** | `config.yaml:68` has `enableUserAccounts: false`. Turning it on changes the user's daily login flow for a harness convenience |
| D14 | Plan count | **Keep nine** | v2.3's audit found claims overstated inside large plans. Smaller plans with their own gate are what rule 11–14 enforcement needs. 03, 05 and 07's first half can run in parallel, so nine plans do not mean nine sequential cycles |

Still the user's, not decided here: the **player sessions** that rule 7 and D6 wait on.

## Decisions (2026-09-24, the open questions of plans 01–02, decided on evidence at the user's request)

Each one is reversible, and the user can overturn any row.

| # | Question | Decision | Evidence |
|---|---|---|---|
| E1 | Pod `LLM_PARALLEL` 2 → 4 | **Yes, at the next pod start**, with `--kv-unified` kept so the total context stays 196 608 shared across slots. Revert if a single request's decode rate drops below 20 tok/s (the plan 03 timeout floor) | Two lanes plus a lane-0 run already queue at the model; the kv-unified cache means four slots do not quarter each slot's context. Measured on the next live batch, recorded in plan 03's gate record |
| E2 | Solo `story_epistemic` merges every roster member's private block | **Not kept as is: attributed.** In solo with more than one name, each line names its subject (`- Arin knows: …`, `- Arin is concealing from Ponticius: …`) under a header telling the one narrator to voice each character accordingly. A single name keeps today's second-person block | `renderPrivateEpistemicBlock` (`memory/epistemic.ts:110`) writes every line as `You know` / `You are concealing`, so a merged solo block tells one narrator it both conceals a fact and is unaware of it. A solo narrator voices every NPC, so dropping the others' knowledge would lose it; attributing it is the only reading that is both complete and true |
| E3 | Extend T8 save evidence to import / removal / migration / `wizardSessions` | **Yes.** Chat-metadata writes (import, removal, migration) already go through `saveOpenChat` (armed, `dd73915`); they now also record save evidence. `wizardSessions` is an extension-settings write and records the `/api/settings/save` observation T8 already makes | A save nobody verifies is indistinguishable from success (plan 11 rule). The watcher exists; this only reads it |
| E4 | Pre-T14 mirror books get the `so-owner` marker on next sync | **Yes, only on proof of ownership**: the book's name is exactly `Story Orchestrator - <title> - <chatId>` for THIS chat's id AND this chat's `extras.memory.wiBook` names it. Anything else stays unmarked | Unmarked books are never reaped (T14), so every chat mirrored before T14 leaks its book forever. Both conditions together are the ownership the reaper already requires |
| E5 | Unbind an unadopted branch's inherited lorebook on the first page load too | **Yes**, through the same classification the bridge uses; the startup load already reads identity | A branch opened by reloading the page kept the parent's chat lorebook bound, while the same branch opened by a switch did not. Same state, two behaviours |
| E6 | H19: another extension's no-op `MESSAGE_UPDATED` is silent for consumed rows | **Keep** | A no-op edit changes no hashed field; rolling back on it rewinds a story for nothing (`turnBridge.ts:203` returns before any rollback). It is not journaled; a refresh that moved nothing leaves nothing to show |
| E7 | The integrity guard (`81e25e4`) also holds back empty no-integrity saves from ST and other extensions | **Keep** | ST stamps `integrity` on every chat it loads (`script.js:7665-7666`, `group-chats.js:276-278`), so an empty save with no integrity only exists in the switch window where metadata is `{}`. It never blocks a save of a loaded chat, including one whose every message was deleted (that one carries integrity) |
| E8 | Fault matrix 10th package for host deletes | **Yes**, added in plan 03's fault-matrix edit alongside the `aborted` column, so the count moves once, deliberately | Plan 02's reaper and chat-delete handling have tests but no census row; an uncensused package cannot be `todo` |

Built by plan 02 follow-ups (E2–E5) and plan 03 (E1, E8); each lands in its plan's gate record.

## Reconciliation (2026-09-23, after writing the plan docs)

Writing the nine plan docs re-verified every item against the working tree (`fcc33cc` plus the
other session's uncommitted v2.3 edits) and against ST 1.19.0 and 1.18.0. This section records the
resulting decisions. It supersedes anything above it, and each plan doc is updated to match.

| # | Decision | Why (found by) | Plans |
|---|---|---|---|
| X1 | **No blob version bump.** Fingerprints and `integrity` go in as optional v4 fields; T11 still ships | v2.3.0 replaces an unknown blob version with a fresh one, destroying a v5 story (plan 02) | 02, rule 3 |
| X2 | **T3 hash = `mes` + `is_user`, plus `name` on non-user rows only.** No `swipe_id`, no `is_system` | Deleting a lower swipe decrements `swipe_id` with `mes` unchanged (`script.js:9368-9388`); `/persona-sync` renames every user row (`personas.js:1842-1869`). Both would read as edits and rewind the story (plan 02) | 02 |
| X3 | **T1: an ambiguous diff rolls back from the earliest candidate start.** Today's path is used only when there is no snapshot or it is stale. The identity key has no `is_system` (D5) | Today's path is the known-wrong one for a middle delete. T1 only affects deletes before the end: tail deletes already decode correctly (plan 01) | 01 |
| X4 | **The existing `delete` harness verb only ever cuts the tail**, so v2.3's delete coverage never exercised T1. Plan 01 adds `host_delete` and `cut` verbs over ST's real `deleteMessage`. The multi-message-delete row is 1.19.0-only (`blocked` on 1.18.0) | Plan 01 | 01 |
| X5 | **T10 skips** `is_system` rows, rows with an `extra.type` other than `narrator` (a `/sys` narrator line stays a speaker for the reply, but is skipped when choosing a *character*), and rows named `systemUserName`; images are in `extra.media`, not `extra.image`. It also fixes the `story_epistemic` merged-knowledge leak (null speaker in a group merged every member's private knowledge, an inv-15 breach) and the talk `no_repeat` case | Plan 01. The macro leak is a privacy defect, so it goes in plan 01 | 01 |
| X6 | **T6: the warden note is committed on render, not at STARTED.** The shape rule accepts a `null` type (Stepped Thinking calls `Generate(null, …)`). Plan 01's Done list gains J8 ×2 | Plan 01 | 01 |
| X7 | **Guidance block:** depth and role match the story's author note default (system, depth 4); dropped on impersonate and foreign quiet generations; in a group, the resting `story_epistemic` macro renders empty | Plan 01's open questions, decided | 01 |
| X8 | **The over-steer probe moves to plan 01.** The guidance block is steering text and needs it before plans 06 and 07 exist; 07 reuses it | Plan 06 | 01, 06, 07 |
| X9 | **A v2.4 host-facts table** (`docs/plans/v2.4/host-facts.md`) is created by plan 01. Every plan's host-fact rows land there, and rule 2 cites it | Plans 02 and 03: rule 2 cited a table that did not exist | all |
| X10 | **Plan 01 builds the missing harness:** a verb that flips and restores another extension's setting (Stepped Thinking `is_enabled`); run-header capture of third-party extension state; a **test-only foreign-emitter fixture** that mimics Guided Generations' `{source}` shape (GG is not installed, and installing it is not our call); a replay-equality check; and the **P0′ transcript → scenario converter** that plan 09 replays | Plan 09's missing-harness list | 01 |
| X11 | **Plan 02 builds:** `expect.rollbackOutcome`, a next-read-window assertion, a branch-adopt UI verb plus cleanup that owns branch chats, and the **generalised `attestation.test.mjs`** (records root from the attestation, journey set from the files, every run reported, served-bundle check) | Plan 09 | 02 |
| X12 | **Plan 07 builds:** a judge-on journey mode (`setup.judge` / `--judge-uses`; today `so-journey.mts:303-308` forces every use off), a cost aggregation verb, `so-judge calls --use/--chat`, T22/T23 fixtures, and `so-lore-probe diff` | Plan 09 | 07 |
| X13 | **D6 is per checkpoint:** `AgencyPolicy.player_attempts_only`, default false. `AgencyPolicy` is per checkpoint (`schema.ts:155`), so "per story" in D6 was wrong. The clause rides plan 01's guidance block. `read_as` cannot tell an attempt from an outcome, so `evidence_from` carries that alone | Plan 04 | 04 |
| X14 | **Rule 6 gains storyDiff rows** `quality-evidence-changed`, `checkpoint-agency-changed` (which also covers the v2.3 agency fields: today they hot-swap silently as "identical") and `story-objective-block-changed`. `objective_block` absent means `auto`, an explicit behaviour change under D7 | Plans 04 and 06 | 04, 06 |
| X15 | **Plan 04:** the live suite is a non-regression check only. It never passes through `getChatWindow`, so T7/T15 are proven by jest plus two live scenarios run twice each. Seed C: the six golden-only `rejected` expectations come out of live scoring (floor 0.9 over the 15 remaining, 14/15 on the v2.3 record); `facts` gets a non-regression floor of 0.68, and the 0.85 target is left for a prompt change to earn. `--expect-count` stays 22. Depends on 01 **and** 03 | Plan 04 | 04 |
| X16 | **Plan 03 additions:** the memorize-backlog same-chat wedge, the persisted scheduler snapshot reset on hydrate, a real abort for the director's 20 s timeout, a new fault-matrix shape `aborted` (81 → 90 cells), a breaker keyed per profile id, the CC sampler fix limited to text-completion profiles, and a tail-fit `memorize:full` (not map-reduced). Depends on v2.3's V25 cadence window landing | Plan 03 | 03 |
| X17 | **Rule 7 exemption:** recovery controls on states the player already sees (pipeline "Try again", backlog "Stop") are not new story surface. They are exempt, and must pass `assert-player-clean` | Plan 03 | 03, rule 7 |
| X18 | **Plan 05 owns mirror key hygiene** (measured first with T12's ring; names are stripped only past a predeclared activation rate). Plan 02's T14 keeps the reaper, stops scene-row mirroring, and adds the **in-book ownership marker** the reaper needs | Plan 05 | 02, 05 |
| X19 | **Plan 05 additions:** read the discarded World Info `WriteResult`s (`effectsApplier.ts:100,102`, a new defect); T12c (moving the lore force into the generate interceptor) is conditional on a measured foreign dry-scan wipe. T12 depends on 01's T6 tracker. **On a T13 pass, build plan 05b goes to v2.5**, which keeps v2.4 acceptance stable | Plan 05 | 05 |
| X20 | **Seed A decided: option A, built in plan 06.** A per-request sampler overlay (`GENERATE_AFTER_DATA` for textgen, `CHAT_COMPLETION_SETTINGS_READY` for chat completion) that overwrites only keys already present. It replaces the textgen preset effect, which today is a **global write never restored** (`presets.ts:72-86`; `RESTORABLE` excludes presets), so a checkpoint preset leaks into every chat. Inv 21 is reworded to "a preset is a per-request sampler overlay" | Plan 06 | 06 |
| X21 | **F5 `create`:** the Phase A runs over the curator's model (the memory profile), not the judge, with a new `so-curator-suite.mts` and floors carried from `10-judge-seeds.md:78-79`. A reverted create **deletes the entry under compare-and-set**; if it was edited meanwhile, it is kept and marked externally edited. It is kept out of `decideProposal`'s bulk accept. Any new `extras.stagecraft` field must be added to `stripGlobalSettings` (`extras.ts:310`) | Plan 06 | 06 |
| X22 | **Judge:** T22/T23 get their own `judge.uses.agencyCheck` / `judge.uses.houseRules` keys and share the warden's accept mode (default `review`); the warden itself is not a `judge.uses` key. **`sceneOoc` and `memoryRerank` are removed**, because both failed predeclared v2.2 floors (`v2.2/03-scene-read.md:95`, `v2.2/04-lore-relevance.md:181-192`), so seed B's "never calibrated" was wrong. House rules are **story-level only, capped at 8**. T22 also depends on 01's T6. `backgrounds` stays out of the recommended set and gets `measuredOn` | Plan 07 | 07 |
| X23 | **Cost meter:** T24 adds a meter that rollback does not cut, an explicit inv-11 exemption, because the call ring rolls back and a total read from it undercounts. Plan 09's cost report reads the meter | Plan 07 | 07, 09 |
| X24 | **Plan 08:** the per-quality macro ships as **`{{story_quality_<key>}}` per key** on both engines (the `MacrosParser` bridge registers zero-argument macros, and `strictArgs` rejects `::`). The `::` form is v2.5. The T19 budget comes from `getMaxPromptTokens` (a `/script.js` export, cross-checked against the interceptor's value), not `getContext().maxContext`. T18 lists every consumer; expansion and critic sit under `authoring`; a role pointing at a deleted profile refuses and raises a Repair row (no silent fallback). If v2.3 defers V19's editor control, plan 08 absorbs it | Plan 08 | 08 |
| X25 | **Plan 02 additions:** J4 ×2 and a clean-host downgrade leg; out-of-horizon history becomes "branch from the oldest restorable point", author view only until a player session; "swipe back = no-op" is dropped (fingerprints cannot deliver it, so it stays with the v2.5 swipe-back cache); the `GROUP_CHAT_DELETED` reaper confirms the chat is really gone first; requirements refresh on `GROUP_UPDATED` / `WORLDINFO_SETTINGS_UPDATED` / `PERSONA_CHANGED` | Plan 02 | 02 |
| X26 | **Plan 09:** three clean hosts (the pinned `06bde939`, tag 1.19.0 `7e8663cd9`, 1.18.0 `51ad27fb`). The live host is a patched `staging` checkout (`7c3994196`) with local edits, **recorded, not reverted**, since it is the user's install. The README already lists 1.19.0 (`README.md:64-66`), so plan 09 re-verifies that row rather than adding it. Findings land in a register plus `docs/plans/v2.4/v2.5-seeds.md`. The judge-on matrix covers the new uses plus the existing warden as the over-steer baseline. The user runs the human sessions | Plan 09 | 09 |

Still the user's: **the player and author sessions** (rule 7, D6, T22 defaults).
