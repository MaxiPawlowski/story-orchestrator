# Plan 46 — Consequences recap

**Status: v2.8, owner 2026-10-14, not built.** New. Overview: `00-overview.md` §Rules (this folder).
**Gate tiers** (v2.8 rule 7): implementation **D**; acceptance **D** (deterministic composer). **CL** only if option C
is ever built.

## What it is

- At a chapter's end, and on demand, the player gets a short recap of **cause and effect**: "Because you took the
  posting, the garrison opened its gates."
- Built from what the runtime already records: the boundary log (applied writes and fired transitions), the typed
  game log rows (v2.8 27 G3), quest moves, milestones, public checks, public agenda steps, and chapter records.
- Player-safe by construction: only player-visible labels, only reached places, nothing a held secret could change.
- Deterministic first. A model pass is an option only if the attribution floor fails.

## History and evidence

| What | State | Citation |
|---|---|---|
| G3 typed log rows | "Typed, attributed, derived log rows with from→to", built as v2.7 36 Q5/W `log` | `docs/plans/v2.8/27-gamification-report.md:129`, `:198` |
| G1 "no empty section" property | player panels never show an empty section | `27-gamification-report.md:198` (P) |
| Chapter record consequences | the seal writes CONSEQUENCES lines with sources, from the resting view | `src/memory/types.ts:58-82`; `src/runtime/secretShared.review.test.ts:123` |
| Away recap | returning after ≥ 8 h shows the standing narrative, same sections | `src/runtime/awayRecap.ts:3,29-34` |
| `/story recap` | "where the story is right now"; no cause/effect | `src/runtime/slashCommands.ts:145-146`; `src/runtime/slashHelp.ts:8` |
| Saga verification precedent | model text checked for length and names outside the records | `src/memory/chapterRecord.ts:162-166` |
| Owner 2026-10-14 | new v2.8 plan; deterministic preferred | this plan |

No session has asked for this; the owner decision 2026-10-14 is the rule-4 basis for a player surface.

## Current state in code

| Piece | Where | What it gives |
|---|---|---|
| Boundary log entry | `BoundaryLogEntry {before, after, fired, source, context, queue, evaluated}`, `src/engine/engine.ts:56-66` | before/after state, the fired transition, applied queue entries |
| Applied writes | `ApplyQueueEntry {source, turnRange, deltas, origin}` + `outcomes`, `src/engine/applyQueue.ts:9-21` | which key changed, from which read and message range |
| Game log rows | `LogRowView {at, kind, actor, text, outcome}`, kinds `action | world_event | check | quest | milestone`, `src/runtime/gameTypes.ts:55-64` | player-safe effect lines |
| Row composition | `statusMoves` (quest moves, earned milestones, `Reached <player_name>`), `checkRows` (public checks only), `actionRows` (player's first line), `src/runtime/widgets.ts:79-121` | — |
| Player labels | `Quality.player_labels`, `src/engine/schema.ts:73` | authored, player-safe value text: the natural **cause** copy |
| Secret milestones, hidden checks | `Milestone.secret` `src/engine/gameSchema.ts:114`; `CHECK_NARRATE` `:74` | filtered already in `statusMoves`/`checkRows` |
| Life steps | `landedSteps`, `src/engine/life/lines.ts:71-78`; `AgendaStep.public` `src/engine/lifeSchema.ts:41` | NPC agenda moves; only `public` ones are player-visible |
| Journal records | kinds `status | flag | story | stagecraft | lore | chapter | author`, `src/runtime/journal.ts:17-26` | author-side; not a recap source |
| Player projection | sections `now, about, recently, threads, quests, chapters, story, end`, `src/runtime/playerProjection.ts:7`; `withheldNames` `:79` | the one player read-model; spoiler guard for unreached names |
| Chapter end hook | `chapterSeal.ts` announce and `bridgeText` (`src/runtime/chapterKit.ts:298`) | where a chapter-end recap attaches |

Nothing links an effect to its cause today. `evaluated` holds the gate's inputs at fire time; the applied entries
hold which reads moved those inputs.

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Authored recap lines** | transitions/quests carry `recap: "Because you…"`; shown when they fire | S | authors must write them; most stories won't |
| **B. Deterministic causal composer** | effect = a log row (quest move, milestone, reached place, public check, public agenda step); cause = the gate keys of that effect whose value changed in an applied entry since the chapter opened, rendered with the quality's `player_labels`. "Because <cause>, <effect>." A's authored line wins where present | M | a gate with no labelled key has no cause line (falls back to "What changed"); multi-key gates need a pick rule |
| **C. Model pass** | B's rows + chapter consequences → a model writes 3–5 lines; verified for invented names and spoilers | M + per-seal call | invented causality; spoilers; needs CL floors |
| **D. Chapter consequences as-is** | show the seal's CONSEQUENCES lines | XS | no "because"; model text written for memory, not for the player |

## Recommendation

**B, with A's authored override and D as the fallback section.**

1. Pure composer `src/runtime/consequences.ts` over `(story, boundaryLog slice, checks, chapter records, reached path)`:
   - **Effects**: the same rows `statusMoves`/`checkRows` produce, plus `landedSteps` where `step.public`.
   - **Cause pick**: keys read by the effect's gate (transition `gate`, quest `done_when`/`failed_when`, milestone
     `when`), restricted to keys with a `player_labels` entry for the new value and not quiet; among those, the one
     changed by an `extractor` entry whose `turnRange` holds a player message; ties → latest change. No eligible key →
     no "because" (the effect goes to "What changed" unadorned).
   - **Authored override**: `Transition.recap` / `Quest.recap` text replaces the composed line (option A, optional).
   - At most 5 lines, newest effects first; chapter CONSEQUENCES (D) follow under "What changed" when B has fewer
     than 2 lines.
2. **Surfaces**: a "Because of you" section at the chapter-end card (with the bridge) and in the Overview
   (`playerProjection` section id `consequences`); `/story recap` gains the section. Chapterless stories: the section
   covers the last 20 boundaries.
3. **Ledger**: nothing persisted. The recap is a read-time view over the log, so rollback ≡ replay by construction.
   The chapter-end card stores only `recapSeenAt` as today.
4. Registry + Help entry; guide topic for `recap` fields and `player_labels` as recap copy.

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| C1 | Attribution | ≥ 30 labelled cause→effect pairs from ≥ 3 synthetic fixture stories (labels written before scoring): precision ≥ 0.90, recall ≥ 0.60 | D |
| C2 | Spoiler-safe | property test over generated states: 0 lines naming an unreached checkpoint, an unearned secret milestone, a hidden check, a non-public agenda step, a hidden quest, a raw key or value; planted controls for each | D |
| C3 | Held secret | player output byte-identical with and without held secrets (K1-style gate) | D |
| C4 | Rollback | recap after a rollback equals the recap of the replayed chat: 100 % (property test) | D |
| C5 | No empty or causeless lines | 0 "Because" lines without a cause; no empty section (G1) | D |
| C6 | Cost | composer p95 ≤ 5 ms on a 300-boundary log | D |
| C7 | Only for C | 40 model recaps: 0 invented names (`verifySaga`-style), 0 C2 hits, rater "accurate" ≥ 0.9 | CL |

If C1 fails, record it; C is then a decision for the owner, not an automatic build.

## Gates by tier

- **D:** composer and projection: `npm run typecheck && npm run lint && npm test` (+ `typecheck:test`). Surfaces:
  + `npm run build` + no-LLM scenario on a lane: seeded writes (`seed_metadata`) cross a quest and a transition, the
  chapter seals, assert the card text and `so-ui.mts assert-player-clean`. Storybook story for the section. Plan
  close: `npm run gates`.
- **CL:** only for C7.

## Privacy and spoiler notes

- Every line comes from player-visible labels (`player_name`, `player_labels`, quest titles/labels, public checks,
  public agenda steps) or the resting-view chapter record. Author ids, quiet keys and raw values never render.
- Built from `playerProjection` inputs only; no draft or author-only read.
- C3 proves held secrets change nothing the player sees.
- Fixtures are synthetic; no Adolion content.

## Dependencies and links

- v2.7 36 quests and story panels (G3 log rows), v2.8 27 gamification report (G1, G3).
- v2.6 07 chapters (seal, consequences, bridge), v2.7 05 briefing.
- v2.8 18 quests (quest moves are the main effects), v2.8 20 character life (public agenda steps).
- v2.8 45 New Game+ (end-of-story recap as a possible carried text), v2.8 47 promises (a kept or broken promise is an
  effect with an obvious cause).

## Decisions for the owner

1. **Approach:** deterministic composer with optional authored lines? **Recommended: yes (B + A); no model pass unless
   C1 fails.**
2. **Where it shows:** chapter-end card, Overview section, `/story recap`. **Recommended: all three.**
3. **Second person:** "Because you…" (player-addressed) or neutral ("After the posting was taken…")? **Recommended:
   "Because you…" only when the cause came from a player message; neutral otherwise.**
4. **Cap:** **Recommended: 5 lines per chapter.**

## Unresolved questions

- Multi-key gates (`all` of three keys): name one cause or join two? v1 names one.
- Mechanical (`code`) writes such as clocks: never causes? v1 excludes them.
- Should living-director (`liv_`) transitions count as effects? v1 yes when they have a `player_name`.
