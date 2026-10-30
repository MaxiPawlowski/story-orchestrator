# v3.0 33 — Threads the player put off stop being pushed

**Status: PLANNED 2026-10-30** (harvest 2026-10-30, index `30-harvest-index.md`; revised after `30-review-sol.md`).
Nothing built. Size: M (reversible event history + suggestion integration).

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
