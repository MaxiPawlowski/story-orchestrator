# Plan 47 — Promises remembered

**Status: v2.8, owner 2026-10-14, not built.** New. Overview: `00-overview.md` §Rules (this folder).
**Gate tiers** (v2.8 rule 7): implementation **D**; acceptance **CL** (the read's promise lines, read role) and **LT**
(does the promisee bring it up, Artemis on the 3090). Model acceptance is deferred with the rest of v2.8 (owner
2026-10-12).

## What it is

- When the player promises a character something ("I'll bring your brother back by the new moon"), the story should
  remember it: the promisee brings it up when it is overdue, and the living director can use an overdue promise as a
  hook.
- A promise is a **typed record**: who made it (always the player), to whom, what, an optional due point, a state
  `open | kept | broken`, and a derived `overdue` flag.
- Extracted from the shared read, accepted only when a **player-written line** in the read's window carries it.
- Surfaced only to the promisee (private member block) and to the director (hooks). Never narrated as the player
  keeping or breaking it.

## History and evidence

| What | State | Citation |
|---|---|---|
| Commit evidence, player lines only | T0 blocker 2026-10-01: a commit counts only when a **player** line (`isUser`) in the window matches; NPC lines never count | `docs/plans/v2.6/14-findings.md` l.24-34; `src/extraction/commitGuard.ts:228-230` |
| Negation/hedge guard | `NEGATOR`, `HEDGE` before the verb hold the delta; recall 43/44, precision 1.000, refusals 0/45 | `src/extraction/commitGuard.ts:51-52`; `v2.6/14-findings.md:146` |
| Double negatives | v2.7 09: hold (fail safe), option E built `e9082dd5`; the labelled set holds no double-negative acceptance | `docs/plans/v2.7/09-commitment-double-negatives.md` §History, §Gate record |
| Arcs mention promises | the arc contract tracks "unfulfilled promises" as free-text threads, `[resolved]` on "promise kept" | `src/memory/contract.ts:9,15` |
| `[intends]` excludes the player | "never the player's" | `src/memory/contract.ts:31` |
| Director never narrates the player | "promise/promised" are in the player-act list of the guard | `src/generation/living/guard.ts:3-8` |
| Verbatim promise recall | v2.8 21 P1 ("what exactly did X promise") is offline only; runtime recall deferred (v2.9 05.4) | `docs/plans/v2.8/21-smart-context-harvest.md:103,159` |
| Owner 2026-10-14 | new v2.8 plan | this plan |

## Current state in code

| Piece | Where | Relevance |
|---|---|---|
| Arcs | `ArcEntry {id, text, status: open|resolved, entities, openedAt, …}`, `src/memory/types.ts:36-51`; contract `src/memory/contract.ts:3-17` | promises today become untyped shared threads: no promisee, no maker, no due point |
| Epistemic lines | `[knows] [unaware] [suspects] [believes] [hiding] [intends]`, `src/memory/contract.ts:33-47`; hygiene `dropCommonKnowledge`/`capEpistemic` `src/memory/epistemic.ts:203,223` | the model for a per-character typed line family |
| Commit guard | player-line verdicts `src/extraction/commitGuard.ts:230`, `lineVerdict` `:199` | reusable as the promise acceptance check |
| Private member block | `memberBlock` → `renderPrivateEpistemicBlock`, `src/runtime/memoryInjector.ts:116-125`; life lines header `src/engine/life/lines.ts:12` | where the promisee's reminder goes |
| Director inputs | `openThreads` from open arcs, `src/runtime/livingInputs.ts:37`; prompt lists them `src/generation/living/prompt.ts:71` | where overdue promises go as hooks |
| Director pace | way-in opens on the gate or `LIVING_PACE_TURNS` (3) player turns, `src/generation/living/plan.ts:119`, `types.ts:8` | an overdue promise can justify a way-in |
| Agency | `PLAYER_ACTION_CLAUSE`, `src/engine/agency.ts:24` | the reminder must never decide for the player |
| Agendas | NPC goals with steps, `src/engine/lifeSchema.ts:37-51` | NPC-side; no player commitments |
| Authored promise vehicle | `Quest {giver, done_when, failed_when}`, `src/engine/gameSchema.ts:57-72` | an author can already model one promise as a quest |
| Story time | `story_day`/`time_of_day` when the story declares a clock, `src/engine/lifeSchema.ts:9-10`; `player_turns_in_checkpoint` `src/engine/stretch.ts:3` | due points |
| Rollback | `reverseMemoryState`, `src/memory/reverse.ts:48`; derived records `src/memory/derived.ts:9-37` | promise rows follow the same reversal |

Nothing typed named "promise" exists (`grep -rn "promise" src/engine src/memory` → prose and the guard list only).

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Arcs only** | rely on free-text arcs ("unfulfilled promises") and the director's open threads | 0 | no promisee, no overdue, shared to everyone; today's state |
| **B. Authored only** | authors model promises as quests with `giver` + `failed_when` | 0 code | only promises the author foresaw; none from play |
| **C. Typed promise lines in the shared read** | `[promised] Promisee | what | by <when or none>`, `[kept] …`, `[broken] …`; accepted only through the commit-guard player-line check; stored per chat; overdue derived at read time | M: contract lines, parser, guard reuse, store, injector, director input | read prompt grows; false promises from hedges or quotes |
| **D. Separate promise pass** | its own read on a cadence | M + one call per cadence | cost; another off-path pass to schedule |
| **E. Judge-scored promise detection** | a judge use labels player lines | M | needs calibration; the judge never writes, so it would only gate C |

## Recommendation

**C, with B left as the authored path.**

1. **Contract** (`src/memory/contract.ts`): one line family in the shared read, only for the player's words:
   `[promised] Promisee | what {{user}} promised | by <story day, scene, or "none">`, `[kept] Promisee | what`,
   `[broken] Promisee | what`. Promisee must be a roster member.
2. **Acceptance** (`src/extraction/`): a `[promised]` line is kept only when a player line in the window passes the
   commit guard's verdict with a promise matcher (`promise|swear|vow|I'll|I will|you have my word`), negation and hedge
   held as today. `[kept]`/`[broken]` need an open promise to the same promisee (dedup by vector band, Jaccard
   fallback, as the curator does).
3. **Store**: `extras.memory.promises` rows `{id, promisee, text, due?, state, madeAt {messageId, boundary},
   closedAt?}`, cap 24, reversed by `reverseMemoryState` by message id. **Overdue is derived**, never stored: `due`
   passed on the story clock, or no `due` and ≥ 12 committed boundaries open. So rollback ≡ replay holds.
4. **Surfacing**
   - **Promisee only**: an overdue (or due-today) promise adds one line to that member's private block: "{{user}}
     promised you <what>; it is not done. You may bring it up." Never in shared tiers, never to other members.
   - **Director**: overdue promises join the director input as a pinned list "Promises the player made and has not
     kept (world pressure only; never decide whether the player keeps them)". `narratesPlayer` already refuses a
     director draft narrating the player promising or keeping.
   - **Player**: the Overview lists the player's own open promises (their own words, already in the transcript).
5. Registry + Help entry, feature switch `memory.promises` (on by default, v2.8 rule 9), guide topic.

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| P1 | Promise detection | labelled synthetic set ≥ 40 promises + ≥ 40 non-promises (hedges, refusals, double negatives, NPC promises, quoted promises, sarcasm): precision ≥ 0.95, recall ≥ 0.70, NPC promise attributed to the player 0 | CL |
| P2 | Kept / broken | ≥ 20 labelled resolutions: agreement ≥ 0.85; a `[kept]` with no open promise is dropped | CL |
| P3 | Rollback ≡ replay | property test over generated chats: 100 % | D |
| P4 | Promisee only | payload goldens: the promise line only in the promisee's drafted request; 0 in other members' or the resting block | D |
| P5 | Held secret | player output identical with and without held secrets | D |
| P6 | Never narrates the player | 20 director proposals with an overdue promise: 0 narrate the player keeping, breaking or answering (guard + rater) | CL |
| P7 | Brought up | scripted session, promise made, then made overdue: the promisee mentions it within 6 of its drafted turns in ≥ 6 of 10 runs; with the feature off, the baseline rate is recorded beside it | LT |
| P8 | Read cost | read prompt +≤ 5 % tokens; live suite per-tier floors unchanged (`so-live-suite.mts`) | CL |

## Gates by tier

- **D:** contract/parser/store/derivation: `npm run typecheck && npm run lint && npm test` (+ `typecheck:test`).
  Injector, director input and Overview: + `npm run build` + payload goldens (`so-payload-golden.mts`) with a seeded
  promise + no-LLM scenario (seeded rows, rollback by edit). Plan close: `npm run gates`.
- **CL:** P1, P2, P6, P8 on the read and director roles (scorer + live suite).
- **LT:** P7 on the 3090 lane, after the owner lifts the 2026-10-12 deferral; never while the owner plays.

## Privacy and spoiler notes

- A promise row reaches one member's private block only. Shared tiers, the ledger, the WI mirror and chapter records
  never render promise rows (epistemic data is never written to World Info).
- A promise made in private is in the transcript the player already sees; the Overview list shows only the player's
  own words. P5 proves held secrets change nothing player-visible.
- The reminder line is a nudge for the character, never an instruction about the player; agency clauses stand.
- Labelled sets are synthetic and English (W25). Any label drawn from session evidence goes to a second model, never
  the owner (v2.8 rule 11).

## Dependencies and links

- v2.7 09 commitment double negatives (guard semantics carried over), v2.6 14 T0/T1 findings.
- v2.8 22 living director (hooks, way-ins), v2.8 20 character life (clock for due points; a broken promise could move
  a relationship axis, not in v1).
- v2.8 21 P1 verbatim recall (quoting the exact promise; runtime deferred to v2.9 05.4).
- v2.8 46 consequences recap (kept/broken promises as effects), v2.8 45 New Game+ (open promises are not carried in v1).
- v2.8 15 cue + scene read merge (same shared read; line budget).

## Decisions for the owner

1. **Source:** typed lines in the shared read (C), not a separate pass (D)? **Recommended: C.**
2. **Overdue without a due point:** after how long? **Recommended: 12 committed boundaries; a story clock `due` wins.**
3. **Who hears the reminder:** promisee only? **Recommended: yes; other members learn of it only from the transcript.**
4. **Player list:** show the player's own open promises in the Overview? **Recommended: yes.**
5. **Consequences of breaking:** should a broken promise write a life value (relationship)? **Recommended: not in v1;
   record it and let v2.8 46 show it.**

## Unresolved questions

- Promises to someone off the roster (an NPC not in the group): drop, or keep as a director hook only? v1 drops.
- Promises the player makes to the whole party: one row per member, or a party row? v1: one row per named member.
- Do NPC promises to the player matter (the mirror case)? Out of scope for v1.
