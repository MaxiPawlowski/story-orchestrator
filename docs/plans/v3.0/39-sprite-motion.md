# v3.0 39 — Sprite motion and stage transitions

Source: `sprite-motion-research-2026-10-30.md` (inventory, ~30 ideas, technique and cost per idea). Owner 2026-10-30:
"Yes to all" on the recommendations below.

## Decisions (owner 2026-10-30)

1. First-plan order as listed under Build.
2. `sprites.effects` defaults to `full`, comic touches (emote bubbles, hops) included; `calm` and `off` one click away; ST,
   OS and story `display.motion` reduced-motion switches still win.
3. Adolion adopts the authored fields (`effects.transition`, later entrances/positions) once built (docs + campaign in step).
4. Prepared sprite sets reach the owner's install through a copy step that lists what it would copy and copies only after
   the owner confirms.

## Build (one lazy chunk, CSS/WAAPI, no GPU)

1. Motion budget helper + `sprites.effects` full/calm/off.
2. Enter / exit / move animation when the stage layout changes.
3. Background crossfade on `effects.background`.
4. Reaction motions on plain sprites, reusing the live head's emotion -> reaction map.
5. New-speaker hop, optional soft blur on the others.
6. Tension vignette + a screen punch on crossing into critical.
7. Chapter card on chapter seal.
8. Authored `effects.transition` per checkpoint: dissolve, fade, wipe, iris, cut.
9. Idle sway, blink variety and idle beats on plain sprites.

Next plan: tint/look, lighting from `story_time`, weather (canvas 2D), authored positions and entrances, camera push-in.
AGPL sources (Prome VN, Doom's Enhancement Suite) are ideas only, never code.

## Harness

- `scripts/debug/so-cast-presentation.mts`: keep and commit after fixes: run in a new chat and delete it after
  (`/delchat` + `settleReapPrompts`), restore install-wide sprite settings, read the group's members instead of a JSON
  file, `--front` in the usage text, run-header diff, a node:test, README entry.
- Copy step lane -> owner install: dry-run list, owner confirms, copies only the prepared set; never deletes owner data.

Each work package closes on full `npm run gates` plus a lane screenshot/video check with images off where possible
and reduced motion on/off.
