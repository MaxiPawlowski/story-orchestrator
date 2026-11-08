# v3.0 51 — Consequence-aware director

Status 2026-11-08: PLANNED (docs only). Depends on 48 (resolutions), 54 (the cause record); uses 49/50 when present.

## Why

Owner 2026-11-08: quests that integrate into the story "not just to drive the player from A to B". The living
director decides what comes next. Today it writes the next turning point and every lead heads there.

## What exists

- The director drafts one next turning point (`generation/living/prompt.ts:74`). It gets open threads, the cast's
  private plans, standing, the last refusal and agency (`prompt.ts:81-95`).
- Its draft carries `builds_on` and a one-sentence `reason` (`prompt.ts:112`, `living/types.ts:74`).
- Leads: 2-3 `opens_when` into one anchor (43 P3, `stagecraft.livingLeads`). Branches return to the turning point
  (`prompt.ts:166`).
- Scene test: a frozen `{chaos, p, drawn, focus, expected}` per frontier (`living/sceneTest.ts`). Focus = `pacing/focus.ts`
  over resting-filtered open arcs.
- Critic: judge director critic (43 P2) with LLM fallback. Guard `checkDirectorOps`. Railroad readout author-only
  (42 F).
- Ops land only at boundary work `living-apply`. Rollback drops later ops.

## Design

Candidates first, then a recorded choice. Code builds the candidate list; the model writes the turning point for the
chosen one.

- `generation/living/candidates.ts` (pure, lazy). It builds at most 6 candidates per frontier from five sources:
  1. a consequence of a player act: a 48 resolution or consequence applied since the last frontier, read from 54's
     record;
  2. an NPC acting on a changed goal: a 50 method switch or agenda end;
  3. an unresolved pressure: a 49 pressure near a threshold;
  4. a relationship opening: a relationship axis that moved ≥ 2 steps since the frontier;
  5. room to explore or recover: always present after a peak (reuses the relax window from 42 F).
- Each candidate: `{ id, kind, cause: CauseRef[], urgency, repeats }`.
  - `cause` refs point at 54 record rows: boundary, resolution or consequence id, `playerSpan` when one exists.
  - `repeats` counts the same kind among the last 3 chosen.
- Selection in code: a score over causal relevance (has a player cause), urgency (pressure distance), repetition
  (penalty), knowledge (a candidate naming an entity unknown per `knownEntities` is dropped), and the scene test's
  frozen focus.
  - Seeded tie-break (hash of chat, story, frontier), never `Math.random`.
- The prompt receives only the chosen candidate as "what the world answers now", with its cause in author words,
  resting-filtered. The draft must name the candidate id; `checkDirectorOps` refuses a draft for another candidate.
- Record: `extras.living.choices` keyed by frontier + `plannedAt`: candidates, scores, the chosen id, reasons.
  - Frozen like scene tests, so a regenerate reads it.
  - Rolled back by `plannedAt` with the ops (`LivingPort.movedAfter`).
  - Author-only (living panel, inline level 3). No player surface.

## Schema keys

None authored. No compiled code key: the choice is a director signal in `extras.living`, not a quality. It is
listed with the scene test as rollback by `plannedAt`.

## Invariants

- The director still writes only the future, at a boundary. Candidates never write the blackboard or memory (the
  stagecraft/living isolation guard in `architecture.test.ts` covers the new module).
- Held secrets: candidate causes are built from the resting view. A resolution whose label restates a held secret
  enters as "a quest ended" without the label.
- Disclosure ≠ knowledge: `knownEntities` filters candidate names.

## Switch and floors

- Feature row `director-candidates` (`stagecraft.livingCandidates`), on by default. Off: today's prompt.
- D floors (hard):
  - the same frontier, values and seed give the same choice (replay of 20 recorded director inputs, 100 %);
  - a candidate with a player cause outranks a pure-pace one on the fixture table;
  - unknown-entity candidates dropped (0 leaks);
  - recorded single-lead goldens still pass the guard.
- Live (CL + RP): on played living sessions, the share of new turning points whose author-rated cause is a player act
  ≥ 0.5, vs the baseline measured first on the same inputs. Same-kind repeats in 3 consecutive frontiers ≤ 1 per
  session. Rater: Sol, owner-gated.

## Tests and live gate

- Pure: `candidates.test.ts`, score table, seeded tie-break, prompt golden, guard refusal of a wrong candidate id.
- Runtime: `livingCoordinator.review` with the choice record, rollback by `plannedAt`.
- `npm run gates`. Live: M21-style living run on a model lane, the director on the authoring role (opencode Sol). The
  real-LLM gate is mandatory.

## Adolion adoption

1 story uses `living` (count only). On by default when built. No content change needed.

## Order, size, resources

Size M. CPU build; GPU + authoring model for the live rows (about 1.5 h). After 48 and 54; better after 49/50 (more
candidate sources), but it works with sources 1, 4 and 5 alone.

## Unresolved questions

- Should the player-facing Ask ever see "why this happened" (a cause line), or stay author-only?
- Score weights are code constants; make them a story option, or keep them fixed?
