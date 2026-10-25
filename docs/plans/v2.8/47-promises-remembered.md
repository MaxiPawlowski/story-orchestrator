# Plan 47 — Promises remembered

**Status: v2.8, owner 2026-10-14, not built. Revised 2026-10-14 against the Astra review (owner approved; §Review
2026-10-14).** New. Overview: `00-overview.md` §Rules (this folder).
**Gate tiers** (v2.8 rule 7): implementation **D**; acceptance **CL** (the read's promise lines, read role) and **LT**
(does the promisee bring it up, Artemis on the 3090). Model acceptance is deferred with the rest of v2.8 (owner
2026-10-12).

## What it is

- When the player promises a character something ("I'll bring your brother back by the new moon"), the story should
  remember it **in the player's exact words**: the promisee can bring it up when it becomes relevant, remember its
  fulfilment warmly, accept a renegotiation, or release the player.
- A promise is a **typed record with a stable id**: maker (the player), promisee (one roster member), the exact source
  span (v2.8 42 §0 shared audience/provenance contract), an optional **agreed** deadline quoted from the span, and a
  history of evidence-linked resolution events (`kept`, `broken`, `renegotiated`, `released`).
- **No invented deadlines.** An undated promise stays open; reminders arise from relevance, never from elapsed turns.
  Overdue (past an agreed deadline) never means broken.
- Surfaced to the promisee (private member block) and, for promises the whole present cast witnessed, to the living
  director as a hook, through the same resting/audience filtering the director uses today. Never narrated as the
  player keeping or breaking it.
- Option F folds in the reciprocal: **NPC promises to the player**.

## History and evidence

| What | State | Citation |
|---|---|---|
| Commit evidence, player lines only | T0 blocker 2026-10-01: a commit counts only when a **player** line (`isUser`) in the window matches; NPC lines never count | `docs/plans/v2.6/14-findings.md` l.24-34; `src/extraction/commitGuard.ts:228-230` |
| Negation/hedge guard | `NEGATOR`, `HEDGE` before the verb hold the delta; recall 43/44, precision 1.000, refusals 0/45 | `src/extraction/commitGuard.ts:51-52`; `v2.6/14-findings.md:146` |
| Double negatives | v2.7 09: hold (fail safe), option E built `e9082dd5` | `docs/plans/v2.7/09-commitment-double-negatives.md` |
| Arcs mention promises | the shared arc contract tracks "unfulfilled promises" as free-text threads, `[resolved]` on "promise kept" | `src/memory/contract.ts:9,15` |
| `[intends]` excludes the player | "never the player's" | `src/memory/contract.ts:31` |
| Director guard | "promise/promised" are in the player-act list; "keep/kept/break/broke" are not | `src/generation/living/guard.ts:3-8` |
| Owner 2026-10-14 | new v2.8 plan | this plan |

## Current state in code

Re-checked on `3a716f2b` for the review.

| Piece | Where | Relevance |
|---|---|---|
| Arcs | `ArcEntry {id, text, status, entities, openedAt, …}`, `src/memory/types.ts:36-51`; contract `src/memory/contract.ts:3-17` | promises become untyped **shared** threads; a typed promise must not be duplicated there |
| Commit guard | `lineVerdict` (`src/extraction/commitGuard.ts:199-218`) and `playerReading` (`:221-233`) are **private**; the verdict depends on the quality's value relevance and returns `{commits: true}` without the committing line | the negation/hedge/question rules are reusable once extracted; not a promise detector as is |
| Epistemic hygiene | `dropCommonKnowledge`/`capEpistemic` `src/memory/epistemic.ts:203,223` | model for per-character typed rows |
| Private member block | `memberBlock` → `renderPrivateEpistemicBlock`, `src/runtime/memoryInjector.ts:116-125` | where the promisee's line goes |
| Director inputs | `livingInputs` passes open arcs through the resting filter (`src/runtime/livingInputs.ts:30-46`) | a new hook list must keep that filter |
| Director pace | way-in on the gate or `LIVING_PACE_TURNS` (3), `src/generation/living/plan.ts:119` | hooks can justify a way-in |
| Agency | `PLAYER_ACTION_CLAUSE`, `src/engine/agency.ts:24` | reminders never decide for the player |
| Authored promise vehicle | `Quest {giver, done_when, failed_when}`, `src/engine/gameSchema.ts:57-72` | authored promises stay quests |
| Story time | `story_day`/`time_of_day` with a story clock, `src/engine/lifeSchema.ts:9-10` | agreed deadlines resolve against it |
| Rollback | `reverseMemoryState`, `src/memory/reverse.ts:48-80`: knows entries, arcs, epistemic, chapters; **no promise slice** | must be extended |

Nothing typed named "promise" exists.

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| A. Arcs only | free-text arcs and director open threads | 0 | shared to everyone; today's state |
| B. Authored only | promises as quests with `giver` + `failed_when` | 0 code | only foreseen promises |
| **C. Typed promise lines with exact spans** | read lines quote the player's exact words; accepted only when the quote resolves to a player span that commits and addresses the promisee; stable ids; evidence-linked resolution events | M | read prompt grows (v2.8 42 RB); detection misses |
| D. Separate promise pass | its own read on a cadence | M + one call per cadence | cost |
| E. Judge-scored detection | a judge use labels player lines | M | needs calibration; would only gate C |
| **F. NPC promises to the player (reciprocal)** | the same record with maker = a roster member, promisee = the player, evidence = the NPC's exact span; the maker's private block remembers what it owes; authored NPC commitments stay quests/agendas | +S over C | NPCs promise often in RP; must not become player debt |

## Recommendation

**C now, with B as the authored path (linked, not duplicated); F after C's P1 passes.**

1. **Contract** (`src/memory/contract.ts`): one line family in the shared read, listing open promises by short id so
   resolutions point at an id, never at similar text:
   - `[promised] Promisee | "<the player's exact words>" | by "<the exact deadline words>" | none`
   - `[kept] p<id> | "<exact evidence words>"`, `[broken] p<id> | "<exact evidence words>"`,
     `[renegotiated] p<id> | "<exact new terms>"`, `[released] p<id> | "<exact promisee words>"`.
2. **Acceptance** (`src/extraction/`):
   - The quoted text must be an exact substring of a message in the window; it resolves to a v2.8 42 §0 source span.
     For `[promised]` the span's speaker must be the player.
   - The span passes a promise verdict extracted from the commit guard (a new exported `commitmentVerdict(line,
     matcher)` with the same negation, hedge, double-negative and question rules, without quality relevance) with a
     promise matcher (`promise|swear|vow|you have my word|I will|I'll`).
   - **Addressing:** the promisee is named in the span's sentence, or is the speaker of the message the player is
     answering. A span addressing several members makes one row per named member; "everyone"/unnamed groups are
     refused in v1.
   - Refused shapes (fixtures): the player quoting someone else, sarcasm markers, conditional offers ("if…, I'll…"
     stored with `conditional: true` and never surfaced as owed until the condition is confirmed), casual future tense
     without a commitment word or addressee ("I'll check the stables").
   - The deadline is recorded only if quoted from the span (or the promisee's immediate reply the player affirms);
     resolved against the story clock when the story declares one, else kept as text with no overdue.
   - Resolution lines need the evidence span: `kept` (player action or the promisee's acknowledgement), `broken`
     (explicit player refusal, an agreed deadline passed **and** the promisee says so, or an action that makes it
     impossible, authored), `renegotiated` (player and promisee spans), `released` (promisee span). An event for an
     unknown or closed id is dropped.
3. **Store:** `extras.memory.promises` rows `{id = hash(chatId, sourceSpan), promisee, span, quote, deadline?,
   conditional?, events: [{eventId, kind, span, at}]}`; state is derived from the last event. Cap 24 **open** (a 25th
   is refused with an author journal row, never evicting an open promise); resolved rows kept until older than the
   rollback horizon, then evicted oldest-first deterministically.
4. **Rollback:** `reverseMemoryState` gains the promise slice: rows made at/after m dropped; events at/after m dropped
   (so a rolled-back closure reopens the promise); evicted rows within the horizon cannot exist (retention rule).
   `rollback ≡ replay` property case.
5. **Reminders by relevance:** an open promise adds one line to the promisee's private block only when that member is
   drafted **and** one of: the player's or a member's last turn names the promise's subject (content words of the
   quote), the promisee's scene/location matches an entity in the quote, an agreed deadline is due, or the player asks.
   Line: "{{user}} promised you: "<exact quote>". You may bring it up if it fits." Cooldown: once per promise per 15
   drafted turns of the promisee, at most 3 surfacings per relevance trigger. Fulfilment adds a warm one-time line
   ("{{user}} kept their word: …"); release and renegotiation update the quote shown.
6. **Director (privacy kept):** only promises whose source span was **witnessed by every present member** (v2.8 42 B
   record, `classified`) become director hooks; unknown or private ones never do. Hook text goes through the director's
   resting filter and `restatesSecret` (`livingInputs.ts:30-46`) like open arcs. The director guard's `PLAYER_ACTS`
   gains `keep/keeps/kept/break/breaks/broke/broken/fulfil/fulfill/fulfilled/release/released`; P6 still needs the
   rater, the guard is a detector only.
7. **No duplication:** with promise lines on, the arc contract excludes promises the player made ("tracked
   separately"); an arc whose words restate an open promise's quote is dropped at apply time and counted. Summaries,
   chapter records and the canon never render promise rows.
8. **Player view:** the Overview lists the player's open promises as **verified quotes** (the exact span text with the
   promisee's name), never an extraction paraphrase.
9. **Authored promises:** a quest may declare `promise: true`; a `[promised]` line matching that quest's giver and
   content is linked to the quest (`questId`) and takes its state from the quest, not from events.
10. **F (after C's P1):** `[npc-promised] Maker | "<the maker's exact words>"` with the same span rules (speaker =
    maker, addressee = the player); the maker's private block remembers it with the same relevance rule; the player's
    Overview lists "Promises made to you" as verified quotes. No automatic player debt, no reputation effect.
11. Registry + Help entry, feature switch `memory.promises` (on by default, v2.8 rule 9), guide topic.

## Predeclared floors

P1–P8 first written 2026-10-14; P1/P2/P7/P8 tightened and P1s/P2w/P2r/P4d/P4a/P7h added by the review (none run).

| # | Condition | Floor | Tier |
|---|---|---|---|
| P1 | Promise detection | labelled synthetic set ≥ 60 promises + ≥ 60 non-promises (hedges, refusals, double negatives, NPC promises, the player quoting someone, sarcasm, conditional offers, casual future tense, multiple recipients): precision ≥ 0.95, recall ≥ 0.70, NPC promise attributed to the player 0, wrong promisee 0 | CL |
| P1s | Span exactness | accepted rows whose quote is a byte-exact substring of a player message revision: 100 %; paraphrased quotes refused 100 % | D (parser) + CL |
| P2 | Resolution | ≥ 30 labelled resolution events incl. renegotiation and release: agreement ≥ 0.85 | CL |
| P2w | Wrong-promise closure | events closing a different promise than labelled | 0 |
| P2r | Rollback reopens | rollback past a closure reopens the promise; past the making removes it: 100 % (property) | D |
| P3 | Rollback ≡ replay | property test over generated chats: 100 % | D |
| P4 | Promisee only | payload goldens: the promise line only in the promisee's drafted request; 0 in other members' or the resting block | D |
| P4d | Director privacy | director input with a private (promisee-only or unknown-witness) promise: 0 promise content; public promise passes the resting filter | D |
| P4a | No duplication | arcs, summaries, chapter records and canon after a 30-turn fixture with 4 promises: 0 restated private promise quotes | D + CL |
| P5 | Held secret | player output identical with and without held secrets | D |
| P6 | Never narrates the player | 20 director proposals with an open public promise: 0 narrate the player keeping, breaking or answering (guard + rater) | CL |
| P7 | Brought up when relevant | scripted session, promise made, then a relevant turn: the promisee mentions it within 4 of its drafted turns in ≥ 6 of 10 runs; feature-off baseline recorded beside it | LT |
| P7h | Repetition / harassment | across the same runs plus 10 runs with no relevance trigger: promise mentioned in two consecutive promisee turns ≤ 0.10 of mentions; mentions without a trigger ≤ 0.10 of runs; rater "nagging" ≤ 0.10 | LT + CL |
| P8 | Read cost | read prompt +≤ 5 % tokens; part of v2.8 42 RB (combined with witness lines and v2.8 15) | CL |

## Gates by tier

- **D:** contract/parser/span resolution/store/rollback/relevance: `npm run typecheck && npm run lint && npm test` (+
  `typecheck:test`). Commit-guard extraction (`commitmentVerdict`) keeps the existing guard tests green. Injector,
  director input and Overview: + `npm run build` + payload goldens (`so-payload-golden.mts`) with seeded promises +
  no-LLM scenario (seeded rows, rollback by edit). Integration case **promise × arcs/director**. Plan close:
  `npm run gates`.
- **CL:** P1, P1s, P2, P2w, P4a, P6, P8 on the read and director roles (scorer + live suite + RB).
- **LT:** P7, P7h on the 3090 lane, after the owner lifts the 2026-10-12 deferral; never while the owner plays.

## Privacy and spoiler notes

- A promise row reaches one member's private block only. Shared tiers, arcs, the ledger, the WI mirror, chapter
  records and the canon never render promise rows; the director sees only fully-witnessed promises, filtered.
- The Overview shows the player's own exact words, already in the transcript. P5 proves held secrets change nothing
  player-visible.
- The reminder is a nudge for the character, never an instruction about the player; agency clauses stand.
- Labelled sets are synthetic and English (W25). Any label drawn from session evidence goes to a second model, never
  the owner (v2.8 rule 11).

## Dependencies and links

- v2.8 42 §0 shared audience/provenance contract (source spans, witnessed) and B (director eligibility); RB read
  budget.
- v2.7 09 commitment double negatives (guard semantics carried over), v2.6 14 T0/T1 findings.
- v2.8 22 living director (hooks, way-ins), v2.8 20 character life (clock for agreed deadlines).
- v2.8 43 verbatim recall: a promise reminder is a direct source reference for exact-words recall.
- v2.8 46 consequences recap (an evidence-linked fulfilment as an authored-or-evidenced line), v2.8 45 New Game+ (open
  promises not carried in v1).
- v2.8 44 rumors: a public fulfilment can become an authored rumor; private promises never spread.
- v2.8 15 cue + scene read merge (same shared read; RB).

## Decisions for the owner

1. **Source:** typed lines with exact quoted spans in the shared read (C), not a separate pass (D)? **Recommended: C.**
2. **Undated promises:** stay open; reminders only by relevance; overdue only past an agreed deadline and never
   automatically broken. **Recommended: yes.** (Replaces "overdue after 12 boundaries".)
3. **Who hears the reminder:** promisee only; director only for fully-witnessed promises, filtered. **Recommended:
   yes.**
4. **Player list:** the player's open promises in the Overview as verified quotes. **Recommended: yes.**
5. **Consequences of breaking:** write a life value? **Recommended: not in v1; record it and let v2.8 46 show it.**
6. **NPC promises to the player (F):** **Recommended: yes, after C's P1 passes; no automatic player debt.**
7. **Authored promises:** linked to quests by `promise: true`, not tracked twice. **Recommended: yes.**

## Unresolved questions

- Promises to someone off the roster: v1 drops them.
- Promises to the whole party: v1 refuses unnamed groups; a party row may come later.
- Whether conditional promises should ever surface without explicit confirmation of the condition.

## Review 2026-10-14 (Astra)

Source: `review-astra-2026-10-14.md` §Plans 42-47 (47). Verified on `3a716f2b`.

- **P1 — the commit guard is not a promise detector.** Accepted. Verified `lineVerdict`/`playerReading` private and
  relevance-bound (`commitGuard.ts:199-233`). → exact quoted span + speaker + addressing rules; exported
  `commitmentVerdict` without relevance; P1 extended (quotations, sarcasm, conditionals, casual future, multiple
  recipients), P1s.
- **P1 — "overdue after 12 boundaries" invents an obligation.** Accepted. → no invented deadlines; agreed deadlines
  only from the span; relevance-based reminders; overdue ≠ broken; `broken` needs explicit evidence (decision 2).
- **P1 — resolution and rollback underspecified.** Accepted. Verified `reverseMemoryState` has no promise slice
  (`reverse.ts:48-80`). → stable ids from source spans, id-addressed resolution events incl. renegotiation/release,
  reopen on rollback, open rows never evicted; P2w, P2r.
- **P0 — director input is a second privacy path.** Accepted. Verified resting filter on arcs (`livingInputs.ts:30-46`)
  and the guard list (`guard.ts:3-8`). → fully-witnessed promises only, resting filter kept, guard list extended, P6
  rater kept; P4d.
- **P1 — overlap with shared arcs; Overview paraphrases; no repetition floor.** Accepted. Verified arc contract
  (`contract.ts:9`). → arcs exclude player promises, restating arcs dropped (P4a); Overview shows verified quotes; P7h.
- **Recommendation (C with evidence, stable ids, history, no deadline invention, relevance reminders; quests linked).**
  Adopted; reciprocal NPC promises folded in as option F (brainstorm).
- Rebutted: none.

## Harvest 2026-10-14 addendum

From `docs/plans/v2.8/61-harvest-triage-2026-10-14.md`. Ideas only (source licences: AGPL/GPL/none unless noted). First verified against master `9e96871d`; revised 2026-10-16 on `e8b9dd6d` after `review-astra-harvest-2026-10-16.md`. The owner decides with the rest of this plan.

- **H13a quote lines carry the message id** (`docs/plans/v2.8/extension-research-2026-10-14/timeline-memory.md` P1, 3/S). **Built with P1 (option C)**: the read's
  `[promised]` and event lines carry `m=<message index>` and the player's exact words (`src/memory/promises/contract.ts:7,15`),
  resolved to a source span with chat, message, **revision**, speaker and offsets (`src/memory/audience.ts:10`); a quote not
  found word for word in the cited message is refused (`src/memory/promises/impl.ts:147-150`). Nothing more to build here. v2.8 55 option B's `[pledged]` line owes the same (55
  addendum).

## Gate record: P1 (option C) build, 2026-10-14 (no model, no GPU, LIST)

Branch `v2.8-p47-promises` (base `0c283dc6`, master `837d96e0` merged in). Owner: "yes to all from your recommendations".
Option F (NPC promises) not built.

Built:
- Contract: `[promised] Promisee | m=<id> | "<exact words>" | by "<deadline>"` and `[kept|broken|renegotiated|released] <id> | m=<id> | "<words>"`,
  open promises listed by id; the section and the arc rule ("tracked separately") only when `memory.promises` is on
  (`memory/promises/contract.ts`, lazily imported by `extraction/sharedRead.ts`; `memory/contract.ts` `PROMISE_ARC_RULE`).
  The parser keeps promise lines raw on the audit (`promiseLines`); the lazy writer parses them.
- Acceptance (`memory/promises/impl.ts`, lazy chunk with `runtime/promisePortImpl.ts`): the quote must be byte-exact in message `m`
  (H13a), spoken by the player, not quoted from someone else, no sarcasm marker; `commitmentVerdict` (exported from the commit
  guard: negation, hedge, double negative, question, without quality relevance) on the span; addressing = named in the sentence or
  the speaker the player answers; unnamed groups refused; casual future tense without a commitment word or addressee refused;
  conditional offers stored `conditional` and never listed as owed; deadline only when quoted (same message or the promisee's ask),
  `dueDay` only against a declared story clock.
- Source span (`memory/audience.ts`, the 42 §0 shape): chat, story, message, revision `{swipeId, fnv1a(text)}`, speaker, offsets,
  input range; window entries gain an optional `swipeId`. Id = `p` + hash of the span fields and promisee (never content alone).
- Store: own slice `extras.promises` (not `extras.memory.promises`: the memory coordinator is at 559/560 effective lines).
  Events id-addressed, unknown/closed ids and quest-linked rows refuse events; `broken` needs the player's refusal or a passed agreed
  deadline the promisee names; `released` only by the promisee; `renegotiated` needs both parties in the window and updates the shown
  quote. Open cap 24 (25th refused, journalled); closed rows evicted only past the rollback horizon.
- Rollback: `rollbackPromises` in `rollback.ts` quarantine (every path, also when the engine does not move): rows and events at or
  after the message dropped, so a rolled-back closure reopens.
- SC1/SC2 fit (shared contract built on `v2.8-p52-codex`, not here): promise rows are written when a read lands, beside arcs
  (`ExtractionCoordinator.applyAudit`), never in `commitBoundary`; a read whose window reaches the message already counts as
  engine-moving, and the quarantine drops promise rows on every path. Quest-linked status is read at render time from quest state
  (after SC2 step 4). No reserved code-key prefix, so no `ROLLBACK_DETECTORS` entry is needed.
- Reminders (`promiseReminderLines`): promisee only, through the member block's held-secret filter (`MemoryInjector.addPrivateSource`);
  triggers = newest turn names the subject, the player asks, or (bounded window) an agreed deadline due / location match; cooldown
  15 promisee turns after the promisee mentions it; persistent triggers surface at most 3 turns per 15; overdue never says broken;
  kept gives one warm line until the promisee speaks. Derived from the transcript (no draft-time write).
- Director: `promiseHooks` only for spans whose audience is `all-present`, through the resting filter in `livingInputs`; the runtime
  passes `unknownAudience` until 42 B exists, so the director gets no promise today. Guard `PLAYER_ACTS` gains keep/break/fulfil/release.
- No duplication: arcs restating an open promise are dropped and counted on the audit (`restates a promise`).
- Player view: Overview `#so-player-promises` lists open, non-conditional promises as the exact quotes (`PlayerPromises.tsx` + stories).
- Authored: `quests[].promise: true` (needs `giver`) links a matching promise; state from the quest; a second row for that quest refused.
- Feature `promises-remembered` (registry, Features page `promises`, `memory.promises` default true), settings copy, guide (quests
  section), `npm run docs:guide`, `npm run docs:settings`, architecture.md bullet.

Deviations:
- Slice `extras.promises` instead of `extras.memory.promises` (coordinator line budget).
- Cooldown and per-trigger cap are derived from the transcript (promisee mentions, promisee turns) instead of a surfacing log.
- `renegotiated` accepts one quoted span from either party when the other party speaks in the window.
- The compact guide topic lists the `promise` field only (`guideTopics.ts` at its 600-line budget); the full text is in the guide.
- Main bundle +7,455 B vs master `0c283dc6` (1,266,960 -> 1,274,415 measured on the pre-merge commit); writer, parser and contract text ride lazy chunks.

Tests (D):
- `memory/promises/promises.test.ts` 55: parser (m= required), 10 accepted and 11 refused shapes (negated, hedged, question, casual
  future, quoting someone else x2, sarcasm, unnamed group, double negative), paraphrase refused (P1s parser half), NPC promise 0,
  wrong/off-roster promisee 0, multiple recipients, H13a same pledge twice, exact span offsets, conditional, deadlines, cap, P2w,
  closed/unknown ids, release/broken evidence, renegotiation, P2r, eviction, quest link, arc restating, reminders (no elapsed-turn
  reminder, subject, ask, cooldown, deadline window, kept line), P4d hooks.
- `memory/promises/rollbackReplay.property.test.ts` (P3): 6 seeds x 61 cuts over 60-message generated chats, rollback = replay (claims
  compared without the read's input range).
- `runtime/promisePort.review.test.ts` (P4 promisee only, held-secret filter, P5 player list identical, P4a arc drop, switch off),
  `runtime/promiseRollback.review.test.ts` (rollback check on the no-engine-move and engine-move paths), `runtime/promiseDirector.test.ts`
  (resting filter on hooks, guard words, quest validation), `extraction/promiseRead.test.ts` (contract on/off, hash, raw lines, audit,
  `commitmentVerdict`).

Gates (on `dfde90e8`, the merge-fix commit):
- `npm run gates:quick` (pre-merge): typecheck, typecheck:test, lint, jest related 6834 passed; defect replay RED because the staged
  copies hold tracked files only (new files untracked); green after commit (`test:replay` ok in the full gates).
- `npm run gates -- --jobs=2 --skip=test-storybook:ci` (after merge): test:replay ok; test RED once on
  `consequences.test.ts` C6 p95 <= 5 ms (plan 46 timing under load), passed alone on retry; rerun
  `npm run gates -- --jobs=2 --skip=test-storybook:ci,test:replay`: all green in 218.4 s (build, test:debug, typecheck,
  test 8551 passed / 1 skipped, typecheck:test, lint, debug:typecheck, test:plugin, test:release).
- Pre-merge runs also hit two timing flakes, each green on one retry: `startupWiring.review.test.ts` (5 s timeout) and
  `scripts/debug/lib/generationQuiesce.test.mts` H-a (test:debug).
- Storybook outside the gates runner (its script pins 6006): `npm run storybook:build`, then `http-server .sb-static -p 6347` +
  `test-storybook --url http://127.0.0.1:6347 --maxWorkers 2`: 140 suites, 839 stories passed.

Live gate: NOT green. Lanes serve the extension from the owner's ST tree (`C:\dev\SillyTavern-MainBranch` slot), so a lane >= 40
cannot run this branch without staging into the owner's ST; not staged, not run. Payload goldens with seeded promises owed with it.

Owed:
- CL: P1 (labelled set >= 60 + >= 60, read role), P1s CL half, P2, P2w live, P4a after 30 turns, P6 (rater), P8 (read cost, with 42 RB
  and 15); H13a read-emits-ids x2. No model run here.
- LT: P7, P7h on the 3090 after the owner lifts the 2026-10-12 deferral.
- Live no-model scenario (seeded rows, rollback by edit) and payload goldens once a lane can serve the branch.
- 42 B witness record: until it exists no promise reaches the director.
- Possible reuse after merge: plan 46 `extraction/playerSpan.ts` (`{messageId, revision, span}` on accepted deltas) could share the
  span helper with `memory/audience.ts`; not unified in this pass.

## Gate record addendum 2026-10-15: live no-model check (branch `v2.8-live-checks`)

- Setup (shared by the 2026-10-15 addenda in plans 46, 47, 52, 60 and queue row N13): isolated ST code copy
  `C:\dev\st-live` (tar of `st-v28-nomodel` without `node_modules`, `node_modules` junctioned to the owner's), worktree
  `.st-root` pointed at it, this worktree's build staged with `node scripts/release/stage.mjs --st-root C:/dev/st-live`
  (served `dist/index.js` sha256 `885c115c`, source = master `cc38c5b1`), plugins installed into `C:\dev\st-live\plugins`
  only (judge + harness; harness `config.json` offers claude only). Lanes root `C:\dev\so-live-lanes`: lane 60 = offline
  no-model lane (data copied from `so-nomodel-lanes/44`, server plugins off), lane 61 = the same plus
  `st-lanes.mts pod 61 cloud` (loopback firewall, server plugins on). Run: `ST_ROOT=C:/dev/st-live
  SO_LANES_ROOT=C:/dev/so-live-lanes node scripts/debug/st-lanes.mts run 60 -- scripts/debug/so-scenario.mts run <file>
  --sandbox --group 'Group: Arin, DM Narrator'`. Evidence copied to `C:\dev\so-live-lanes\evidence-2026-10-15\{60,61}\`.
  Owner ST, port 8000, lanes 0/31/33/53/54 and `C:\dev\st-p53` untouched.
- PASS x2 (`60/2026-10-15T06-50-30-610Z`, `...06-54-29-046Z`; `test/scenarios/v28-47-promises.json`). Seeded: the two
  reads are debug responses (`[promised] Arin | m=0 | "..."`, `[kept] <id> | m=1 | "..."`); acceptance, store, projection
  and rollback run for real. The promise shows on the Overview (`#so-player-promises`: "To Arin" and the exact quote, no
  id); kept on Arin's reply it leaves the list; a swipe of that reply reopens the same id on the Overview; a chat reopen
  keeps it open. `assert-player-clean` 0 findings with the promise open and again after the reopen.
- Still owed: payload goldens with seeded promises, and every CL/LT row above.

## Review 2026-10-16 (Astra)

Source: `review-astra-harvest-2026-10-16.md` §Addenda requiring correction. Verified on `e8b9dd6d`.

- **43/47/55 — good provenance additions, but message ids need revisions.** Accepted; already true here: spans carry a
  revision (`src/memory/audience.ts:10`) and lines carry `m=` (`src/memory/promises/contract.ts:7,15`). → addendum marked built.
- Rebutted: none.

## Gate record 2026-10-17: P1/P2/P6/P8 harness (pre-freeze, no model)

Branch `v2.8-prefreeze-47` (base `v2.8-prefreeze` `c909b40a`). Build and unit tests only: no lane, no ST, no GPU, no model call.

- Files:
  - Sets (synthetic, English, invented names, no campaign content): `test/measurements/v2.8/47-promises/` `story.json` (river town, roster
    Mira/Tobin/Edda/Corvin, one read-scoped enum so the shared read runs), `p1-cases.json`, `p2-cases.json`, `p6-director.json`,
    `freeze.json`, `generate.py` (provenance only; the JSON is what is frozen).
  - Seam: `src/memory/promises/readCase.ts` (pure: seed open promises by key through the shipped acceptor, apply one read's lines, return rows,
    events and each line's outcome), `src/runtime/promiseReadCase.ts` (lazy, harness list in `lazyHarness.guard.test.ts`): runs the shipped
    `runSharedRead` with the promise contract section (`openPromises` from the seeded rows, `null` for the off arm), then `applyReadLines`.
    In-page handle `storyOrchestratorLiveSuite.runPromiseRead(spec)` (`src/runtime/liveSuite.ts`). Main bundle 1,284,221 B (budget 1,300,000).
  - Harness: `scripts/debug/so-promises.mts` (`check | freeze | run | score | cost | director`), `scripts/debug/lib/promiseScore.mts` (scorers,
    floors), `lib/promiseRun.mts` (specs, plumbing replies, offline replay, freeze), `lib/promiseDirector.mts` (P6 prompts, Sol run, guard,
    claude -p rater), `lib/promiseEntry.ts` (esbuild entry over the shipped modules).
- Counts:
  - P1: 126 cases, 66 labelled promises in 60 promise cases, 66 non-promise cases. Promise categories: plain 10, answering 8, oath 8,
    deadline 8, future-commitment 6, multiple-recipients 6 (12 rows), embedded 6, negative-promise 4, asked-then-given 4. Non-promise:
    hedge 8, refusal 8, double-negative 6 (labelled not a promise, the v2.7 09 fail-safe), npc-promise 8, quoting 7, sarcasm 6 (2 without a
    marker word), conditional 7 (a stored `conditional` row is not counted as a promise), casual-future 8, question 4, unnamed group 4. Each
    non-promise case carries a bait line (what a careless read would write).
  - P2: 38 cases, 32 labelled events (kept 10, broken 7, renegotiated 8, released 7) + 6 controls (the promise discussed, nothing closes);
    14 cases seed two open promises (distractor for P2w). Seeds pass the shipped acceptor (checked by `check`).
  - P6: 20 director inputs, each with one open public promise (hook from the shipped `promiseHooks`, audience `all-present`).
- Frozen sha256 (LF-normalised UTF-8; `run` refuses a drifted set): `story.json` `408f6ffa5e685fe3fc23504d8d19f53ff6da1bc372316f174220b37598b8173b`,
  `p1-cases.json` `6e411cef77715b359b1815c0c8da95cf4deb48e8a80db0a85a39d0ebe8706c31`, `p2-cases.json`
  `5789268f5035ebb8958d0bb18214ec711616ce33ac049a04dc4aae982749a1a9`, `p6-director.json`
  `86671cbb25c614bb7aa19632833fd3d78e6b96f44dee202b3e03a533164903f7`.
- Acceptor only (`node scripts/debug/so-promises.mts check`, canned replies, no model; not a CL measurement):
  - gold: P1 precision 66/66, recall 66/66, NPC 0, wrong promisee 0, P1s exact 66/66; P2 agreement 32/32, P2w 0.
  - greedy (gold + every bait line): P1 precision 66/77 = 0.857; NPC 0, wrong promisee 0, 5 bait rows stored `conditional`; 11 bait rows
    the acceptor accepts: neg-004 (try, no guarantee), 011 ("I will not take that vow"), 034 and 037 (reported speech without quote marks),
    040/042/043 (sarcasm; 040's "I roll my eyes" marker sits in the previous sentence, outside the window the check reads), 046 and 049 (condition after the verb or in the previous
    sentence), 055 and 056 (named addressee, plain plan). P1 precision therefore rests on the read not writing these lines.
  - greedy P2 (event line also pointed at the other open id): 5 wrong-id events accepted (kept/broken on player-spoken evidence carry no
    id check), agreement 27/32. P2w rests on the read naming the right id.
  - paraphrase: 66/66 paraphrased promise quotes refused, 0 rows; P2 paraphrased evidence 0 events.
- Tests: `node --test scripts/debug/promises.test.mts` 14/14 pass (set rules, freeze drift and CRLF, planted bad labels, P1 scorer perfect and
  planted NPC/wrong-promisee/missed/paraphrase/inexact failures, conditional and incomplete, P2 agreement/P2w/kind mismatch/seed refused, P8
  overrun, P6 guard/rater/unrated, acceptor replay, plumbing replies, P6 run/rate/score with fake models incl. a planted narration and resume,
  CLI). `npx jest --maxWorkers=2 src/memory/promises/readCase.test.ts src/runtime/promiseReadCase.test.ts src/runtime/lazyHarness.guard.test.ts`
  3 suites, 29 tests pass. `npm run typecheck`, `npm run typecheck:test`, `npm run debug:typecheck`, eslint on the touched src files: clean.
  `npm run build` ok. Full `npm run gates` not run here (coordinator runs it once).
- Real-run commands (lane page, read role = Artemis; CL acceptance ×2, consecutive on one lane; plumbing first on a no-model lane):
  - plumbing: `node scripts/debug/st-lanes.mts run <lane> -- scripts/debug/so-promises.mts run --set p1 --out <dir> --plumbing gold`, then
    `--plumbing greedy`, `--plumbing paraphrase`, and the same three for `--set p2` (exit 0 on gold; greedy must reproduce the numbers above).
  - P1/P1s: `node scripts/debug/st-lanes.mts run <lane> -- scripts/debug/so-promises.mts run --set p1 --out <dir> --label r1`, then `--label r2`.
  - P2/P2w: the same with `--set p2` (`--label r1`, `--label r2`). A run resumes with `--resume`; `score --set p1|p2 --records <file>` rescores.
  - P8 (joins 42 RB): `node scripts/debug/st-lanes.mts run <lane> -- scripts/debug/so-promises.mts cost --out <dir>/p8.json` (no model call,
    debugResponse NO_DELTA; counted by `measureBudget` on the read role, so run it on the Artemis lane for the real tokenizer). The suite story is
    minimal, so the ratio is an upper bound; `--story <file>` measures the same windows over a real story for RB.
  - P6: `node scripts/debug/so-promises.mts director run --out <dir>` (Sol, opencode `openai/gpt-6.1-sol`), `director rate --out <dir>`
    (claude -p), `director score --out <dir>`; twice in separate dirs. Standalone: prompts from the shipped `renderDirectorPrompt`, no resting
    filter (no held secrets in the fixture); the live director gets no promise until 42 B exists, so this is the prompt-level check only.
- Still owed: every real run above (P1, P1s CL half, P2, P2w, P6, P8 with 42 RB), no-model plumbing runs on a lane serving this branch,
  archiving real-run records next to the sets; P4a, P7/P7h unchanged. Floors stay informational: record the miss, never retune.

## C3 record 2026-10-25: GS6.8 no promise row (v2.9 13 C3, offline, no GPU)

- Evidence: GS6 batch row lane 45 `2026-10-25T08-00-03-602Z/GS6-run1` (build `d6d6aed5`, Artemis v1.1), check GS6.8 08:18:42 to 08:26:47
  UTC. The promise line is the journey's own generic text (`I turn to whoever spoke last. "I promise you ..."`), chat message 17; message 16
  is one cast member's reply, so that member is the answered speaker.
- Cause: **(a) model miss.** `server.log` holds 4 shared reads in the window (responses at lines 16950, 18551, 19030, 19739). Three cover
  message 17 (WITNESS ranges 15-18, 0-21 (the step's manual read), 14-21), each with the promise section in its prompt and message 17 in its
  transcript (request lines 16264, 18211, 18945); none emits a `[promised]` line. The first read writes a MEMORY row calling the player's
  words vague instead. Not (b)/(c): there was no line to refuse or to span. Not (d): three windows covered the message. Not (e): the step
  waits for the scheduler, runs a manual read and polls 180 s.
- Offline proof: the four recorded responses through the shipped `parseSharedReadResponse` (esbuild entry outside the repo) give 0 promise
  lines for each read covering message 17. The acceptor accepts the GS6 shape when the read does write it: a synthetic window (player line
  with the same narration prefix and quoted pledge, promisee = the answered speaker) gives 1 row for the inner quote with and without
  `by "before nightfall"` and for the whole message; another member is refused (`not addressed to that cast member`), as designed.
- Precision note: a later read in the same run (line 28970) wrote a `[promised]` line citing the narrator's message 26; the acceptor refuses
  it (`not the player's own words`, covered by the NPC test).
- Prompt: unchanged (C3 rule). The instruction allows "the character the player is answering" but gives no example of an unnamed addressee,
  and the GS6 line names nobody while the toy scenario names its promisee. Candidate one-line addition, to be measured on the P1 set before
  shipping: `A promise said to "you" right after a cast member spoke is for that cast member: write their name.`
- Journey: GS6.8 kept as strict; its failure now says why in counts (promise message index, reads covering it of all audits, promise lines
  read, unparsed promise lines, promise refusal notes), so the next run separates (a) from (b)/(c)/(d) without the server log.
- GPU rerun (`GS6 --model judged`): a pass closes C3; a fail with `promise lines read 0` and covering reads >= 1 confirms the recorded model
  miss; `promise lines read` > 0 with refusal notes or unparsed > 0 is a product case to reopen.

### C3 GPU rerun 2026-10-25 (lane 45 batch `2026-10-25T12-33-25-817Z`, branch build): product case

- GS6.8 failed with the new counts: promise message 7, 3 of 14 reads covering it, 3 promise lines read, 0 unparsed, 3 refusal notes.
  The three reads (server.log lines 14872, 15832, 16259) wrote the same line naming the member who replied after the promise (message 8).
  Message 6, the line the player answered, was the narrator's. Offline through the shipped `applyPromiseLines` on the recorded window:
  refused with `the promise is not addressed to that cast member` (no member named in the quoted sentence, answered speaker = narrator).
  Naming the narrator would have been accepted. For that unnamed line the refusal is correct under the contract.
- Two fixes:
  - Journey step defect: "whoever spoke last" made the addressee depend on run state (a member in run 1, the narrator here). GS6.8 now
    picks the latest non-narrator enabled member who spoke at run time, stores it in a chat variable and the send names it through
    `{{getvar::gs6_promisee}}` (ST substitutes macros in the player message). A guard step fails if the macro is left unresolved or the
    name is missing. Strictness unchanged: a row, byte-exact quote, one promisee.
  - Product defect, found while checking the named form: the acceptor only looked for a member's name in the quoted pledge's own sentence.
    In `I turn to <member>. "I promise you ..."` the name sits in the narration sentence just before, so the inner-quote line the read
    is told to write was refused whenever the previous speaker was someone else (the toy scenario passed only because its answered speaker
    was the promisee). `impl.ts` `leadInAddressee`: when the quoted sentence names nobody, the sentence right before it in the same
    player message counts only if it names exactly one member; two or more fall back to the answered speaker. Test
    `takes the member the player's narration names just before the quoted pledge (C3)` (synthetic) failed on the old code.
- Offline on the recorded window with the fix: the unnamed line is still refused; the same line with the member named in the lead-in is
  accepted, and a narrator line is then refused.
- GPU rerun owed: GS6 `--model judged`. Pass closes C3. If it fails with promise lines read 0, record a model miss.
