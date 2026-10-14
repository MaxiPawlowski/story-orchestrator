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

From `docs/plans/v2.8/61-harvest-triage-2026-10-14.md`. Ideas only (source licences: AGPL/GPL/none unless noted); verified against master `9e96871d`. Not built; the owner decides with the rest of this plan.

- **H13a quote lines carry the message id** (`docs/plans/v2.8/extension-research-2026-10-14/timeline-memory.md` P1, 3/S). `evidenceSources`
  (`src/extraction/evidence.ts:88-92`) returns every message holding a quote, so a pledge said twice matches two spans and
  the stable id (P2w) is ambiguous. Recommended: the `[promised]` line takes `m=<id>` as v2.8 42 §5.1 witness lines do
  (`[promised] Promisee | m=<id> | "<words>"`); a line whose quote is not in message `<id>` is refused. Floor: on a fixture
  with the same pledge in two messages, every accepted promise binds to the cited message, 100 %, D (parser) + CL (read
  emits ids, ×2). The same applies to v2.8 55 option B `[pledged]`.
