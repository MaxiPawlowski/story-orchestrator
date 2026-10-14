# Plan 46 — Consequences recap

**Status: v2.8, owner 2026-10-14, not built. Revised 2026-10-14 against the Astra review (owner approved; recommendation
reversed to A first; §Review 2026-10-14).** New. Overview: `00-overview.md` §Rules (this folder).
**Gate tiers** (v2.8 rule 7): implementation **D**; acceptance **D** (deterministic composer). No model pass.

## What it is

- At a chapter's end, and on demand, the player gets a short recap of what changed, and, where the author wrote it or
  the evidence proves it, why: "Because you took the posting, the garrison opened its gates."
- **Three tiers of line, strictest first:**
  1. **Authored lines** (`recap` on a transition, quest outcome or milestone), shown when their effect is
     player-visible.
  2. **Evidenced "Because you…" lines**, only when an accepted write carries **explicit player-action evidence** (the
     player line that committed it) and that write demonstrably decided the effect (§Recommendation 3).
  3. **Neutral "What changed" lines**: the effect alone, no cause.
- Built from structured effect references derived from authoritative records (boundary log, quest/milestone state,
  check records), never from display text.
- Player-safe: only player-visible effects and labels, only reached places, nothing a held secret could change.
- Below the attribution floor the composer **abstains** (neutral line). A model pass is not a fallback for attribution.

## History and evidence

| What | State | Citation |
|---|---|---|
| G3 typed log rows | "Typed, attributed, derived log rows with from→to", built as v2.7 36 Q5/W `log` | `docs/plans/v2.8/27-gamification-report.md:129`, `:198` |
| G1 "no empty section" property | player panels never show an empty section | `27-gamification-report.md:198` (P) |
| Chapter record consequences | the seal writes CONSEQUENCES lines with sources, from the resting view (memory text, not player copy) | `src/memory/types.ts:58-82`; `src/runtime/secretShared.review.test.ts:123` |
| Away recap | returning after ≥ 8 h shows the standing narrative, same sections | `src/runtime/awayRecap.ts:3,29-34` |
| `/story recap` | "where the story is right now"; no cause/effect | `src/runtime/slashCommands.ts:145-146`; `src/runtime/slashHelp.ts:8` |
| Commit evidence | a `commit_evidence` delta is accepted only when a player line in the window commits to it | `src/extraction/commitGuard.ts:8-12,221-233` |
| Owner 2026-10-14 | new v2.8 plan; deterministic preferred | this plan |

No session has asked for this; the owner decision 2026-10-14 is the rule-4 basis for a player surface.

## Current state in code

Re-checked on `3a716f2b` for the review.

| Piece | Where | What it gives |
|---|---|---|
| Boundary log entry | `BoundaryLogEntry {before, after, fired, source, context, queue, evaluated}`, `src/engine/engine.ts:56-66`; retained **200** boundaries (`:276-277`) | before/after state, fired transition, applied queue entries; a long chapter outlives the ring |
| `evaluated` | the blackboard values snapshot after the drain, before the transition (`engine.ts:256`) | a value snapshot, not a causal proof |
| Applied writes | `ApplyQueueEntry {source, turnRange, deltas, origin}` + `outcomes`, `src/engine/applyQueue.ts:9-21` | which key changed, from which read and message range; **not** which message caused it |
| Commit guard verdict | `playerReading` returns `{commits: true}` without naming the committing line (`src/extraction/commitGuard.ts:221-233`) | evidence exists at accept time but is not kept |
| Game log rows | `LogRowView {at, kind, actor, text, outcome}`, `src/runtime/gameTypes.ts:59-66` | display text only: no quest/check/transition ids, no cause links |
| Row composition | `statusMoves`, `checkRows`, `actionRows`, `src/runtime/widgets.ts:79-121` | filters quest visibility per historical event and includes earned secret milestones; not a full recap spoiler policy |
| Player labels | `Quality.player_labels`, `src/engine/schema.ts:73` | state descriptions, not necessarily action clauses |
| Secret milestones, hidden checks | `Milestone.secret` `src/engine/gameSchema.ts:114`; `CHECK_NARRATE` `:74` | filtered in `statusMoves`/`checkRows` |
| Life steps | `landedSteps`, `src/engine/life/lines.ts:71-78`; `AgendaStep.public` `src/engine/lifeSchema.ts:41` | NPC agenda moves; only `public` ones are player-visible |
| Player projection | `src/runtime/playerProjection.ts:7`; `withheldNames` `:79` | the one player read-model; unreached-name guard |
| Chapter end hook | `chapterSeal.ts` announce and `bridgeText` (`src/runtime/chapterKit.ts:298`) | where a chapter-end recap attaches |

Nothing links an effect to its cause today.

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Authored lines + neutral "What changed"** | transitions/quest outcomes/milestones carry optional `recap`; every other visible effect is a neutral line from structured effect refs | S–M | most effects read neutral; authors write the "because" |
| **B. Evidence-linked "Because you…"** | A plus a "Because you…" line only when an accepted extractor write carries the player line that committed it and that write was the deciding operand of the effect's gate | M | small coverage; must abstain on OR gates, pre-satisfied gates, overwrites, priority races |
| B₀. Latest-changed-key heuristic | (original B) cause = latest labelled gate key changed by a read whose window holds a player message | M | **refused**: a window with a player line does not prove the player caused the write |
| C. Model pass | a model writes recap lines | M + per-seal call | invented causality; **not a fallback** for attribution misses |
| D. Chapter consequences as-is | the seal's CONSEQUENCES lines | XS | memory text for the model; familiar names do not make it public. Not shown |

## Recommendation

**A first, B later and cautious. B₀, C and D are not built.**

1. **Structured effect refs** (pure, `src/runtime/consequences.ts`), derived at boundary commit from authoritative
   records:
   `EffectRef {kind: "transition" | "quest" | "milestone" | "check" | "agenda", id, from?, to?, boundary, messageId,
   causes: CauseRef[]}` with `CauseRef {key, origin (audit id), playerSpan?: v2.8 42 §0 source span}`. Transition
   refs come from `fired.id`, quest refs from per-quest status changes, milestone refs from milestone ids, check refs
   from check records, agenda refs from `landedSteps` with `public`.
2. **Retention: reversible chapter evidence.** Refs append to `extras.recap.refs` at each committed boundary (cap 120
   per chapter, deterministic order). Rollback drops refs with `messageId ≥ m`; at the seal the chapter's refs move into
   the chapter record (`ChapterRecord.recapRefs`), and chapter unfold restores them. The recap never depends on the
   200-boundary log ring. Chapterless stories show a bounded "Recently" section over the last 20 boundaries, labelled
   as recent.
3. **Evidence for "Because you…" (B):**
   - The commit guard keeps the accepting player line: an accepted `commit_evidence` delta records
     `playerSpan` (message id, revision, span). Deltas without it carry no player cause.
   - A cause links to an effect only when the effect's gate is a single-operand gate on that key, or an `all` gate
     where that key was the **last** operand to become true in this boundary; the gate was false at the previous
     boundary; the key was not overwritten again before the effect; and, for transitions, no higher-priority
     transition was also eligible. OR (`any`) gates, already-satisfied gates and multi-operand ties abstain.
   - NPC-caused writes (reads without a player span), `code`/mechanical writes and `liv_` director writes never
     produce "Because you…".
4. **Rendering:**
   - Authored `recap` text wins where present, and is shown only if its effect is player-visible at that boundary
     (visible quest, earned or non-secret milestone, reached checkpoint with `player_name`, public check or agenda
     step) and contains no withheld name (`withheldNames`). Authors can narrow with `recap_when: <gate>`.
   - "Because you…" lines are phrased from authored `recap.because` text when present; otherwise "Because you
     <committed label>, <effect>" is used only when the quality declares `player_action` text for that value (a new
     optional field: an action clause, distinct from `player_labels`); without it the line degrades to neutral.
   - Neutral lines: "<effect>" from the same text the game log uses (quest move, milestone, reached place, public
     check, public agenda step).
   - At most 5 lines per chapter, authored first, then evidenced, then neutral, newest first within a tier.
5. **Surfaces:** "What changed" section on the chapter-end card (with the bridge), in the Overview
   (`playerProjection` section id `consequences`), and in `/story recap`. The section title says "Because of you" only
   when at least one authored or evidenced line is present.
6. Registry + Help entry; guide topics for `recap`, `recap_when`, `player_action`.

## Predeclared floors

C1–C7 first written 2026-10-14; C1 rewritten, C7 dropped, C8–C10 added by the review (none run).

| # | Condition | Floor | Tier |
|---|---|---|---|
| C1 | Attribution | ≥ 60 labelled effect cases from ≥ 3 synthetic fixture stories (labels written before scoring), of which ≥ 50 % adversarial: NPC-caused effects, coincidental writes in a player window, redundant `all`/`any` operands, already-satisfied gates, reversals and overwrites, priority races. "Because you…" precision ≥ 0.95 (abstaining counts as correct on negatives); recall on true player causes reported, no floor | D |
| C1n | Neutral baseline | the same cases rendered neutral-only: reported beside C1 so B's added value is visible | D |
| C2 | Spoiler-safe | property test over generated states: 0 lines naming an unreached checkpoint, an unearned secret milestone, a hidden check, a non-public agenda step, a hidden quest, a raw key or value, or a withheld name inside authored recap text; planted controls for each | D |
| C3 | Held secret | player output byte-identical with and without held secrets (K1-style gate) | D |
| C4 | Rollback | recap after a rollback equals the recap of the replayed chat, including chapter unfold: 100 % (property test) | D |
| C5 | No empty or causeless lines | 0 "Because" lines without a recorded `playerSpan` or authored text; no empty section (G1) | D |
| C6 | Cost | composer p95 ≤ 5 ms on a chapter with 120 refs | D |
| C8 | Retention | a chapter longer than 200 boundaries: recap covers every visible effect of the chapter (planted 260-boundary fixture) | D |
| C9 | Evidence integrity | every "Because you…" line's `playerSpan` resolves to a player message whose current revision matches; 0 after an edit of that message (property) | D |
| C10 | Authored projection | authored recap of an invisible effect shown: 0 | D |

If C1 fails, B is not built (or switched to abstain-only by the owner); A stands. No model pass follows from a miss.

## Gates by tier

- **D:** composer, refs, retention and projection: `npm run typecheck && npm run lint && npm test` (+
  `typecheck:test`). Commit-guard change (`playerSpan` kept): extraction gate tier + `npm run build`. Surfaces: + no-LLM
  scenario on a lane: seeded writes (`seed_metadata`) cross a quest and a transition, the chapter seals, assert the card
  text and `so-ui.mts assert-player-clean`. Integration case **recap × log retention** (C8). Storybook story for the
  section. Plan close: `npm run gates`.

## Privacy and spoiler notes

- Every line comes from authored text checked against effect visibility, player-visible labels, or neutral effect
  text. Author ids, quiet keys and raw values never render. Chapter consequence text is not shown.
- Built from `playerProjection` inputs only; no draft or author-only read.
- C3 proves held secrets change nothing the player sees.
- Fixtures are synthetic; no Adolion content.

## Dependencies and links

- v2.7 36 quests and story panels (G3 log rows), v2.8 27 gamification report (G1, G3).
- v2.6 07 chapters (seal, bridge, unfold), v2.7 05 briefing.
- v2.8 18 quests, v2.8 20 character life (public agenda steps).
- v2.8 42 §0 source spans (the `playerSpan` identity).
- v2.8 45 New Game+ (end-of-story recap as a possible carried text), v2.8 47 promises (an evidence-linked fulfilment is
  a natural authored-or-evidenced line).

## Decisions for the owner

1. **Approach:** A first (authored lines + neutral "What changed"); B (evidenced "Because you…") after C1 passes; no
   model pass? **Recommended: yes.** (Reversed from "B + A".)
2. **Where it shows:** chapter-end card, Overview section, `/story recap`. **Recommended: all three.**
3. **Second person:** "Because you…" only with a recorded player span and a deciding write, or authored text.
   **Recommended: yes; neutral otherwise.**
4. **Cap:** **Recommended: 5 lines per chapter.**
5. **New authoring fields** `recap`, `recap_when`, `player_action`. **Recommended: yes, all optional.**
6. **Chapter consequences (D) in the recap:** **Recommended: no.**

## Unresolved questions

- Whether `player_action` should live on the quality or on the transition/quest that reads it.
- Should living-director (`liv_`) transitions count as neutral effects? v1 yes when they have a `player_name`; never
  as "Because you…".
- Whether 120 refs per chapter is enough for long chapters (C8 shows it).

## Review 2026-10-14 (Astra)

Source: `review-astra-2026-10-14.md` §Plans 42-47 (46). Verified on `3a716f2b`.

- **P1 — a player message in the window does not prove causation.** Accepted. Verified `ApplyQueueEntry` holds
  source/range only (`applyQueue.ts:9-21`), `evaluated` is a value snapshot (`engine.ts:256`), the guard drops the
  committing line (`commitGuard.ts:221-233`). → B₀ refused; B needs a recorded `playerSpan` and a deciding operand;
  OR, pre-satisfied, overwrite and priority cases abstain.
- **P1 — log rows lack references.** Accepted. Verified `LogRowView` (`gameTypes.ts:59-66`). → structured `EffectRef`
  from authoritative records; `player_action` for action clauses instead of reusing state labels.
- **P1 — read-time is not rollback-safe under retention.** Accepted. Verified 200-entry ring (`engine.ts:276-277`). →
  reversible per-chapter refs moved into the chapter record at seal; bounded, labelled "Recently" for chapterless
  stories; C8.
- **P1 — existing projection does not prove the new surface safe.** Accepted. Verified `widgets.ts:79-121`. → authored
  lines shown only for visible effects and without withheld names (C10); chapter consequences not shown (decision 6).
- **P2 — C1 needs adversarial negatives.** Accepted. → C1 rewritten (≥ 50 % adversarial, precision ≥ 0.95 with
  abstention), C1n neutral baseline.
- **Recommendation (A first; "Because you…" only with evidence; abstain, not LLM).** Adopted; C7 and the C fallback
  dropped.
- Rebutted: none.
