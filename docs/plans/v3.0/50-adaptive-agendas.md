# v3.0 50 — Adaptive agendas

Status 2026-11-08: PLANNED (docs only). Depends on 48 (resolution ids in gates). Pairs with 49 (stakeholders).

## Why

Owner 2026-11-08 asked which other parts "could need improvements like these". Astra ranked agendas first: an agenda
today executes the author's plan one step at a time, whatever the player did.

## What exists

- `Agenda { id, goal, steps[], pace, every }`, with steps `{ text, when?, effect?, public?, repeat? }`
  (`engine/lifeSchema.ts:56-75`).
- Steps advance on a pace timer, per chapter or every N boundaries, optionally waiting on `when`
  (`engine/life/derive.ts:20-35`).
- The member's private block shows done steps as "Meanwhile, off stage, you: …" (`engine/life/lines.ts:46-63`).
- The meanwhile proposer is given the goal and "the author's next step" (`runtime/meanwhilePrompt.ts:23-34`). It
  proposes one text line per member, accepted `auto|review|off` (`runtime/agendaProposals.ts`). Text only, never
  blackboard.
- `Commitment` is member → player only (`lifeSchema.ts:128-140`), validated in `validate/commitments.ts`, latched in
  `engine/life/commitments.ts:67-75`.
- Rollback detectors `life-steps`, `life-pacing` (`engine/rollbackDetectors.ts:51-56`).

## Design

Motivation persists; method changes. Choices stay bounded and authored. The engine picks among authored options in
code; no model call decides state.

- `agenda.priority` (1-5): orders competing agendas of one member. The private block lists at most the top two open
  agendas.
- `agenda.methods[]`: `{ id, steps[], when?, abandon_when?, limit? }`. An agenda with `methods` uses them instead of
  `steps`.
  - The active method is the first, in order, whose `when` holds and whose `abandon_when` does not.
  - Switching is recorded and never returns to an abandoned method.
  - `limit` (e.g. "never harms a child") is author copy that reaches only that member's private block.
- `agenda.ends[]`: `{ id, when, label? }`. Named agenda ends (achieved, given up, changed sides), decided like 48's
  resolutions with `precedence`. An ended agenda stops advancing; gates read the end.
- Asking for help: a method step may carry `asks: <roster id | "player">`. It only adds a private line ("you could ask
  X"). The model may voice it or not.
- NPC-to-NPC commitments: `Commitment.to` accepts a roster id. The private line reaches the holder and, while enabled,
  the promisee. `heard` semantics as today. Kept/broken/due latches unchanged.
- The meanwhile proposer gets the active method's next step, not a fixed sequence, plus the method's `when` so a
  proposal can serve it. Proposals stay text only.

## Schema keys

- Authored:
  - `life.members[].agenda[].priority`, `methods[]` (`id`, `steps`, `when`, `abandon_when`, `limit`), `ends[]`;
  - `steps[].asks`;
  - `commitments[].to: <roster id>`.
- Compiled code keys:
  - `agenda_<m>_<a>_method`: enum of method ids;
  - `agenda_<m>_<a>_left_<method>`: int, the boundary it was abandoned, latching;
  - `agenda_<m>_<a>_end`: enum, latching;
  - per-method step counters reuse `agendaStepKey` suffixed by the method id.
  - Every key goes into `life-steps` / `life-pacing` or a new `life-methods` detector.

## Invariants and rollback

- Method choice runs in `derive` (where agenda steps advance today). Ends latch in the same place. One order per
  boundary is unchanged. Latency: `derive` runs before quest closes, so a method or end gated on a 48 resolution
  reacts one boundary after the resolution. That is accepted and documented in the guide; moving agendas into the
  latch pass would change SC1.
- Rollback ≡ replay. A method switch is a code write keyed on gates, so replay reproduces it.
- Privacy: `limit`, `methods` and `asks` reach only the member's private block (`privateLifeLines`). A secret method
  restating a held secret is withheld by the resting filter, as life lines are today. The director gets `plans`
  through the existing route only.
- Method step `effect.world_info` joins the gated-entry census (`engine/worldInfoEffects.ts`, today plain agenda steps
  only) and the earned-switch replay.
- NPC-to-NPC commitment text never reaches a kept-out member through a shared tier.

## Switch and floors

- Feature row `adaptive-agendas` (character-life area), on by default. Off never invents or revives an action:
  - an agenda with `methods` pauses: no step advances and the private block shows only its goal;
  - an abandoned method stays abandoned;
  - `ends` already latched stay;
  - a commitment to another member is ignored, never reread as a promise to the player.
- D floors (hard):
  - a fixture where the first method's `abandon_when` fires switches method at that boundary and never back
    (100 %);
  - rollback ≡ replay;
  - private-block isolation (another member's prompt never holds `limit`/`methods`).
- Live (RP, owner-gated rating): blind A/B of member replies with methods on vs off on a fixture where the player blocks
  plan A. "The character pursues the goal by a different means" ≥ 0.6 of rated turns on vs ≤ 0.3 off. "Acted for the
  player" flags ≤ control + 1.

## Tests and live gate

- Pure: `life.test.ts` (methods, ends, asks), `validate/life.ts`, commitments `to`, detector guard, property test.
- Runtime: `privateLifeLines` snapshots, meanwhile prompt golden.
- `npm run gates`. Live: one model journey, plus the rating above in the GPU window.

## Adolion adoption

23 agenda declarations in 8 stories and 8 commitment lists (counts only). Methods are opt-in; existing agendas keep
working. Content decision for another model.

## Order, size, resources

Size M. CPU build; GPU rating about 1 h. After 48; parallel with 49 except `validate/gameLayer.ts` merges.

## Unresolved questions

- Should a member be able to change sides (an agenda end that moves a faction membership), or is that 53?
- Cap on methods per agenda (proposal: 3)?
