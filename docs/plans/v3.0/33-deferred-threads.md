# v3.0 33 — Threads the player put off stop being pushed

**Status: BUILT 2026-10-30 on branch `v3.0-33-threads`, not merged** (harvest 2026-10-30, index `30-harvest-index.md`;
revised after `30-review-sol.md`). S1-S5 built, D floors pass; CL/LT/RP rows owed (no GPU). `memory.deferrals` on,
`memory.deferredOutOfPrompt` off until the blind rating (H33-RP). Size: M. Record: §Gate record 2026-10-30.

## Problem (player)

- The player says "later", "not now", and the same topic comes back next turn and the turn after. Open arcs are injected
  every turn until resolved, so a put-off thread keeps taking over the scene.

## Evidence

- Harvest: `extension-research-2026-10-30/lattice.md` P2 (scene capsule `open / answered / deferred` threads, intent "stop
  answered or deferred topics from repeatedly taking over").
- Ours: arcs are `open | resolved` only (`src/memory/types.ts:31-36`, `src/memory/arcs.ts:22-28`); resolve rollback
  handles one terminal state (`arcs.ts:86`); up to 8 open arcs injected (`ARC_OPEN_INJECT_LIMIT`, `arcs.ts:9`; reader
  `src/runtime/chapterKit.ts:150`); read contract `src/memory/contract.ts:16-17`. Suggestions enumerate `openArcs` only
  (`src/runtime/suggestionAnchors.ts:147`), and the player sees threads in the snapshot `openThreads`
  (`src/runtime/snapshotBuilder.ts:285`). Plan 19 handles the hand-back ("yield on question"); nothing handles "the player
  declined this topic". v2.9 05 authored occurrence patterns are a different feature despite the shared word.

## Recommendation

- **S1 State as events.** Each arc keeps an ordered `history: [{kind: "deferred" | "reopened", boundary, messageId, span}]`;
  status is derived from the last event (`deferred` when it is a deferral). A read line `[deferred] <existing open arc>`
  matches like `[resolved]` (Jaccard, `ARC_RESOLVE_THRESHOLD`). Contract line: only when the **player's own line** in the
  window puts the topic off; an NPC saying "later" is not a deferral.
- **S2 Evidence guard.** The deferral needs a player span: the read quotes the player's words, resolved to a source span on
  a player message (`memory/audience.ts` span shape). No span = dropped, journaled author-only.
- **S3 Injection.** Deferred arcs leave the injected open list. They reopen (a `reopened` event) when the player's own line
  touches the arc again (same matcher over the player's message). No timed return by default (owner question); nothing
  silently expires a player's choice.
- **S4 Suggestions and player threads.** `threadAnchors` adds deferred arcs as `dormant-thread` anchors (weight unchanged,
  never `thread`), so the player can pick the topic up; the player `openThreads` list shows a deferred thread with
  "(put off)" or hides it (owner question, default show). v2.9 06 floors are re-run on the amended anchors (F1-F3 rows).
- **S5 Author view.** Author Memory shows the event history with quotes.

## Invariants touched

- Rollback ≡ replay: a rollback drops every event at or after the message, so status re-derives (a reopen rolled back
  restores the deferral; repeated cycles are covered); `reverseMemoryState` and `rollbackReplay.property.test.ts` extended
  with defer/reopen cycles.
- Read contract change = extraction output change: gate on `so-live-suite` tiers within 0.02 of current goldens + a payload
  golden for the read prompt (09 read-reorder rule).
- Prompt layout is quality-rated: removing arcs from injection changes play prose: blind rating before adoption.
- Prefix (13): the open-arc block (depth 4, `storySoFar`, `src/constants/injectionRegistry.ts:41`) changes on defer and
  reopen, as on resolve today; measure with `so-payload-golden prefix` rather than assume.
- Held secrets: arcs already pass the resting view when injected and shown; unchanged. Thinking and inner voice untouched.

## Floors (predeclared, informational)

- D: 50 synthetic sequences: deferral only on a player span 50/50; NPC "later" 0 deferrals; reopen on player mention
  25/25; rollback cuts across defer/reopen cycles 0 divergence.
- RP/LT: >= 25 recorded put-off points re-played x2 arms on a model lane: deferred topic raised by the cast in the next 3
  replies counted per arm (labels frozen first); blind Sol pairs: no category below -0.2, flags <= control + 2, thinking
  closure no worse than control.

## Tests and gates

- jest: matcher, span guard, reopen paths, cap interaction (`ARC_OPEN_CAP`), event history rollback property, anchors.
- `so-live-suite` x2 on the read change; payload golden; v2.9 06 F1-F3 rerun (D).
- `npm run gates`; live gate on a lane with a real read.

## GPU / rating

- Live suite x2 (~2 x 20 min est., from 25's runs) + RP row ~30 min (TO ESTIMATE). Blind Sol rating owner-gated: ask first.

## Unresolved questions

- Timed return of a deferred arc (N boundaries or one day part), or only on the player's mention (default)?
- Player thread list: show "(put off)" (default) or hide deferred threads?
- "Answered" as its own state, or `resolved` (default; the contract already allows "mystery answered")?

## Gate record 2026-10-30 (v3.0 build, branch `v3.0-33-threads`)

Built (commits `f4dec099`, `ab7f5b5f`, `394a6476` + this record):
- S1 state as events: `ArcEntry.history` of `{kind: deferred|reopened, boundary, messageId, span, quote}`
  (`src/memory/types.ts`); `arcThreadState`/`arcDeferred` derive from the last event, `status` stays `open|resolved`, so
  every older consumer reads a put-off thread as open (today's behaviour). Read line `[deferred] <arc> | m=<id> |
  "<player's words>"` (`memory/contract.ts` `DEFERRED_ARC_LINES`, emitted only when existing arcs are listed;
  `memory/parse.ts`, `extraction/parse.ts`); matched to an open arc by Jaccard at `ARC_RESOLVE_THRESHOLD`.
- S2 evidence guard (`memory/arcThreads.ts` `deferralSpan`): message in the read's window, `isUser`, quote word for word,
  else refused; refusals land in the read's audit `rejected` (author-only), not applied. Also refused: already put off,
  older than the thread's last change, no matching arc, switched off.
- S3 reopen in code at every read while a thread is put off: a later player line sharing >= 2 content words and >= 30% of
  the arc's words (`touchesArc`; deviation: containment, not Jaccard against a whole message, which is length-biased).
  Runs at read apply, so a reopen lands with the next read, not mid-turn. No timed return: **builder's choice** on the open
  owner question = the plan's default (only the player's mention). Injection: the `[Open threads]` block
  (`chapterKit.storySoFar` -> `injectedThreads`) drops a put-off thread only with `memory.deferredOutOfPrompt` on;
  **default off** (prompt-layout exception to on-by-default, waits on H33-RP).
- S4: `threadAnchors` makes a put-off current thread a `dormant-thread` (weight unchanged); player `openThreads` shows
  `(put off)` (owner question default: show). "Answered" stays `resolved` (default).
- S5: Author Memory arcs show "Put off by the player" and each event with boundary, message and quote.
- Rollback: `rollbackArcHistory` inside `rollbackArcs` drops events at or after the message (or past the boundary);
  status re-derives. Feature `threads-put-off` (`src/features/threadFeatures.ts`), policy `deferrals {enabled, outOfPrompt}`,
  settings `memory.deferrals: true`, `memory.deferredOutOfPrompt: false`, FEATURE_STATE row, `deferrals.outOfPrompt` in
  UNMAPPED_CONTROLS, settings copy, player guide (`docs/guide/player/memory.md`), setup path row, plan 24 matrix row,
  baseline settings, GPU queue rows H33-LS/H33-F/H33-RP. No author-guide topic: nothing new is authorable.
- Main bundle 1,270,574 B (+4,649 vs 1,265,925 on the base), budget 1,300,000. memoryCoordinator at 560/560 effective
  lines (two old comment lines removed to fit), extractionCoordinator 559/560.

Floors (D, jest `src/memory/arcThreads.test.ts`): 50 synthetic sequences: deferral on the player span 50/50; cast
"later" 0 deferrals (50/50 refused); reopen on player mention 25/25, 25/25 controls stay put off; rollback cuts across
defer/reopen cycles 0 divergence (50 x 16 cuts). `rollbackReplay.property.test.ts` adds defer/reopen ops (4 seeds x 400
cuts, control: defer->reopen->defer cycles and a resolved arc with history). `coordinators/arcDeferral.review.test.ts`:
real `runSharedRead` -> `applyAudit` -> audit rejected -> reopen next read -> rollback restores the deferral -> off refuses.

Commands and results (final tree `394a6476`):
- `npm run gates:quick`: green in 309.8s (earlier slice).
- `npm run gates -- --no-storybook` run 1 (`f4dec099`): RED at test (arrival golden missing the new scenario: fixed in
  `ab7f5b5f` via `SO_RECORD_ARRIVAL_GOLDEN=1`) and test:debug (`sessionsArchive` timing, 5/5 alone).
- run 2 (`ab7f5b5f`): RED at test:debug only (`scripts/local/orphans.win.test.mjs` reaper timing under load; 3/3 alone;
  `npm run test:debug` alone 1674 pass / 0 fail).
- run 3 (`394a6476`, final, no `--resume`): typecheck, build, typecheck:test, debug:typecheck, test, lint, test:debug,
  test:release, test:replay ok; RED at test:plugin only (GPU broker `fetch failed` under load, untouched code;
  `npm run test:plugin` alone 430 pass / 0 fail). `npm run gates -- --no-storybook --resume`: green (test:plugin 21.7s, rest
  reused on this tree). The machine ran parallel builders throughout; each red was a different timing test outside this
  change.
- Storybook alone on 6233 (`npm run storybook:build` + test-runner `--maxWorkers 2`): first run 3 suites red (DrawerTabs
  Memory header text changed by this build: fixed in `394a6476`; StoryEditor/StudioCopilot 15 s timeouts); rerun on the
  fixed build: 169/169 suites, 1025/1025 tests pass.

NOT run:
- Lane checks (`test/scenarios/v30-33-deferred-threads.json` written, schema-checked, evals pre-checked): NOT run: unmerged
  branch, no staging.
- `so-live-suite` x2 on the read change, read-prompt payload golden, v2.9 06 F1-F3 rerun, RP put-off row + blind Sol pairs,
  live gate with a real read: NOT run: no GPU (owner 2026-10-30, waits on "resume"); recorded as H33-LS, H33-F, H33-RP in
  `gpu-queue-2026-10-30.md`. RP corpus (>= 25 put-off points) not built.

Deviations: the read contract asks for `[deferred]` whenever arcs are listed and the switch is enforced at apply (no new
read-contract flag, to stay off the memory-cpu read-prompt rewrite); reopen uses word containment; reopen at read time.
Conflict surface with memory-cpu: `src/memory/contract.ts` `renderArcContractSection` (one spread line after the promise
rule + a trailing const), `src/memory/parse.ts` `parseArcLine`, `src/extraction/parse.ts` arc tag regex.

## H33-F: v2.9 06 F1-F3 rerun (2026-10-31, rides the D1 rerun)

- Same run as v3.0 14 §D1 rerun 2026-10-31 (master `e4c9e9f0`, plan 33 merged): F1 39/40 pass, F2 36/40 pass, F3 FAIL (2 rater flags, 0 needle hits in answers).
- Reach: the LT06 corpus holds no deferred arcs (0 of 40 situations), so the S4 amendment (deferred arc -> `dormant-thread`) changed no prompt in this run. This rerun is a no-regression check only; the amended anchors are unexercised. A corpus row with a put-off thread is owed (CPU) if S4 needs its own measurement.
- Evidence: `C:/dev/so-lanes/35/b2ext/lt06-g/`.
