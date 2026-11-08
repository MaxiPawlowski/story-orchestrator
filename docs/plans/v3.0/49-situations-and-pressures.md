# v3.0 49 — Situations and pressures

Status 2026-11-08: PLANNED (docs only). Depends on 48. Kept separate from 48: 48 changes how a quest ends; this plan
adds what happens around a quest while nobody resolves it. It also takes the "world pressures" half of Astra's faction
idea, so 53 is left with belief and trust.

## Why

Owner 2026-11-08: quests should "properly integrate into the story to make it richer, not just to drive the player from
A to B." A situation with stakeholders and something that gets worse while the player is elsewhere does that. A
checklist does not.

## What exists

- Quests have one `giver` (`engine/gameSchema.ts:77`), steps with `visible_when` (`gameSchema.ts:37-43`) and an
  `author_note` (`gameSchema.ts:78`).
- Factions: standing plus authored moves on gates (`engine/factionSchema.ts:14-30`); `heard_by: present|faction`.
- Agendas advance on a pace timer (`engine/life/derive.ts:27-35`). Meanwhile proposals are text only
  (`runtime/agendaProposals.ts`).
- Echoes: delayed, cancellable cues after an event (`engine/echoSchema.ts`).
- Story time is one code int (`story_time`) with derived day and part (architecture §Memory, v2.8 50).
- Widgets already draw `clock` and `track` kinds (`gameSchema.ts:143`).
- Owner decision 2026-10-31 (42 §Owner decisions 2): "Clocks on check misses: not built (overlaps agendas)". A pressure
  below is a clock on events and story time, not on check misses. Confirm with the owner (§Unresolved questions).

## Design

- `situations[]` (top level, game layer, optional):
  - `id`, `title` (author copy), `stakes` (author note, ≤ 400 chars).
  - `stakeholders[]`: `{ who, wants }`. `who` must resolve to a roster id or a faction id (validated). `wants` is
    author copy for the director, agendas and the wizard, never player copy.
  - `quests: [ids]`: the quests that are the player's way into it.
  - `discoveries: [codex fact refs]`: discoverable information is a codex fact (`codex_p_*` / `codex_l_*` latches,
    `knownEntities`). The situation only names which facts belong to it, so there is no second latch.
  - `pressures[]`, below.
- A pressure is `{ id, label?, max, advance[], recede?, at[] }`:
  - `advance[]`: `{ when: gate }` or `{ every: { parts | days } }`.
    - A gate rule counts once per false→true edge. It keeps its previous truth in a code bool, so a gate that stays
      true counts once and a gate that drops and rises again counts again.
    - Unlike faction moves, which apply once ever (`engine/factions/standing.ts:45`), a pressure rule can fire again.
    - A time rule reads story time only and keeps the last `story_time` it counted.
    - Pressures run in the first latch pass only. The post-entry latch pass (`engine/engine.ts:271,290`) skips them,
      so a transition boundary never advances a pressure twice.
  - There is no turn-count rule; the validator refuses `message_count`-style keys (`TIME_KEYS`) in `advance`.
  - `recede[]` has the same shape.
  - `at[]`: `{ value, label?, effects? }`. Thresholds. Reaching one is a world development: it may enable WI, add an
    echo or write `set`, and gates read the pressure value.
- World developments are not player commitments. A pressure threshold never writes a promise, a commitment or a
  `failed` resolution of a quest the player did not take up (`from: active` only). Authors get the
  `pressure-fails-untaken-quest` warning when a `quests[].resolutions[].when` reads a pressure while the quest can still
  be `offered`.
- Display order ≠ execution order: steps get `optional: true` and `alternative_of: <step index>`. Display keeps the
  authored order; completion reads the gates. Default completion (every step) skips optional steps and needs one step
  of each alternative group.
- Player view: a pressure shows only through a widget the author binds (`clock` widget bound to `pressure_<sit>_<id>`)
  and only while `visible_when` holds. Stakeholders and `wants` never reach a player surface.

## Schema keys

- Authored:
  - `situations[]` with `id`, `title`, `stakes`, `stakeholders[]` (`who`, `wants`), `quests`, `discoveries` (codex
    refs), `pressures[]` (`id`, `label`, `max`, `advance`, `recede`, `at`, `visible_when`);
  - `quests[].steps[].optional`, `alternative_of`.
- Compiled code keys:
  - `pressure_<sit>_<id>`: int clamped to `[0, max]` by the one range clamp;
  - `pressure_<sit>_<id>_was_<n>`: bool, the gate rule's truth at the last boundary;
  - `pressure_<sit>_<id>_t_<n>`: int, the `story_time` the time rule last counted;
  - `pressure_<sit>_<id>_at_<value>`: int, the boundary a threshold was reached, latching.

## Invariants and rollback

- Pressures advance in the latch pass after quest closes (they read 48's resolutions in the same boundary). Thresholds
  apply effects through `gamePort` like consequences, never through `EffectsApplier` directly from the engine.
- New detector `situations` covers every key above. Rollback ≡ replay.
- Threshold `effects.world_info` joins the gated-entry census (`engine/worldInfoEffects.ts`) and the earned-switch
  replay (48 order rule).
- The time rule uses derived story time only (no wall clock; `life/clock.test.ts` T4 guard style).
- Held secrets: `wants` and `stakes` reach the director and the drafted member only through the resting filter or the
  member's private block. A stakeholder's `wants` reaches only that member's private block, never a shared tier.

## Switch and floors

- Feature rows `situations` and `situation-pressures`, both on by default.
- D floors (hard):
  - no pressure moves on a boundary where neither a gate edge nor story time moved (fixture of 50 idle turns: 0
    moves);
  - shuffle invariance;
  - rollback ≡ replay;
  - player-clean (stakeholder text never in player surfaces).
- Live (model lane): on a fixture where the player ignores a situation for N story parts, the threshold development
  appears in a reply within 2 boundaries of the threshold in ≥ 4/5 runs, and no reply narrates a commitment the player
  never made (0, rated by the Sol rater, owner-gated).

## Tests and live gate

- Pure: validate (stakeholder resolution, time-only refusal, untaken-quest warning), edge detection, thresholds,
  detector guard, property tests.
- Runtime: threshold effects through `gamePort`, the widget binding, player projection.
- `npm run gates`. Live: a no-model scenario for pressure plumbing, plus one model journey (`situation-pressure.journey.json`)
  run twice.

## Adolion adoption

The campaign has 2 factions with 4 moves and 0 situations (counts only). Adoption is a content decision for another
model; pin bump if adopted.

## Order, size, resources

Size M. CPU build; GPU about 30 min for the journey. Start after 48 lands. Can run in parallel with 50 (separate files),
but both touch `validate/gameLayer.ts`, so merge one after the other.

## Unresolved questions

- Is a pressure the "clock" the owner declined on 2026-10-31 (that one was on check misses), or is it fine on events
  and story time?
- Should situations be a top-level list, or fields on a quest (fewer concepts, but no situation spans several quests)?
- Optional and alternative steps: here, or in 48?
