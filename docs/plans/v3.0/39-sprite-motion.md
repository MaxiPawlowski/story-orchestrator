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

## Gate record

2026-10-30, branch `v3.0-39-sprite-motion` (code tree `81e7e93e`, master `b17a057c` merged in).
- Built: §Build 1-9 and §Harness. Motion lives in `src/sprites/motion/` inside the sprites chunk, with the effects overlay and
  the WAAPI player in one lazy chunk (`motion/lazy.ts`, 9,062 B); it imports no ST module (the `#bg1` read is the host-free
  `stHost/backgroundLayer.ts`). No GPU, no model call, no write: `motion/presentationOnly.test.ts` fails a writer import (planted control).
  - 1 `stageMotion` budget + `sprites.effects` `full` (default) | `calm` | `off`, also a device row; ST `reduced_motion`, OS
    `prefers-reduced-motion` and story `display.motion: false` win (short opacity-only fades, no movement).
  - 2 enter (rise or fade) / exit (kept mounted until its animation ends) / move (`left`/`width` ease); the first cast of a session stands without an entrance.
  - 3 background crossfade on an authored `effects.background` switch: an old-image layer over `#bg1` (ours; ST's element is only read),
    held from the authored switch until its cue so the new image never flashes first; fires only on a forward boundary, never on hydrate, reopen, chat switch or rollback.
  - 4 reactions on plain sprites from expression changes, sharing the live head's emotion map (`sprites/reactionMap.ts`); skipped while a live head shows.
  - 5 new-speaker hop (once per member per boundary) and soft blur on the dimmed others (`full` only).
  - 6 tension vignette from the player-safe tension level; a shake (`full`) or vignette flash (`calm`/reduced) on crossing into critical.
  - 7 chapter card on seal (public chapter title only, honours `display.chapter_card: false`, click to skip).
  - 8 authored `effects.transition` `dissolve|fade|wipe|iris|cut` + `ms` (0-5000) + hex `color`: schema, validation, Studio field
    (kit `Select`/`TextInput`), guide topic `stage-transition`, `docs:guide` + `docs:settings`; compatible story edit.
  - 9 idle sway, seeded idle beats, seeded double blinks (about 1 in 6).
- Harness: `so-cast-presentation.mts` reads the group's cast, runs in a sandbox chat (deleted + reap prompts settled), restores the
  install-wide sprite settings, diffs the run header, exits 1 on a cleanup gap (`lib/castPresentation.mts` + node:test); not run (GPU job).
  `so-sprite-copy.mts` lane -> owner copy: dry run by default, `--confirm` copies only files the owner lacks, never overwrites or deletes,
  writes the rig refs to apply as `rig-settings.json` (`lib/spriteCopy.mts` + node:test). Exercised only on scratch folders; never run against the owner's install.
- Live: lane 38 (no-model). Its SO image/living/extraction were on in the copy and were switched off in the lane's settings.json before
  start (judge already off); worktree `dist/` routed into the lane browser (nothing staged); ComfyUI, model, judge and plugin requests
  blocked in the page (38 blocked, 0 reached the server). SO-UI cards with drawn fixture sprites (uploaded, no generation), SO-UI group, sandbox chat,
  story `SO-UI Sprite motion` (two backgrounds, fade + iris). Lane ST has reduced motion on: stage read `reduced` (ST wins), then in-memory off
  for the full arm and restored (saved back `true`). Checked: reaction, hop + blur, exit/move, enter rise, fade cover + background hold/crossfade,
  iris, reduced via ST setting and via OS media emulation (opacity-only, no act animations). Cleanup: chats deleted, reap prompts 0, group
  deleted, 15 sprites deleted, cards removed (leaked 0), library 0, run-header diff empty; lane stopped. An earlier run's reload timeout left
  the 3 cards, removed with `so-assets remove --marker SO-UI` (clean). Evidence: `C:\dev\so-lanes\sprite-motion\` (pngs, mp4s, frames,
  `record.json`, driver as `driver-tmp-sprite-motion.mts.txt`). Not re-run after the last two fixes (host-free seam, cover colour), which Storybook covers.
- Tests: jest for budget, roster phases, cues (forward-only, rollback/hydrate/chat switch give none), feed, background hold, schema/validation,
  host read seam, double blinks, presentation-only guard; Storybook `Sprites/VnStage motion` (full, calm, off, reduced, vignette + card, fade cover).
- Bundle: main `dist/index.js` 1,290,908 B (budget 1,300,000) after merging master; this plan adds about 1.9 KB to main (settings, copy,
  schema, validation); motion code is lazy.
- `npm run gates` (no `--resume`, Storybook included) on `81e7e93e`: all green in 1033.8s (build, typecheck, test:debug, test 11007,
  typecheck:test, test:replay, debug:typecheck, test:release, lint, test:plugin, test-storybook:ci 192 suites / 1105 tests).
  Earlier runs: guard reds fixed (style tokens, silent catch, file budgets), a motion-chunk load failure in Storybook (chunk imported ST
  context; fixed with the host-free seam), and timing flakes in untouched tests (`childTree`, `startupWiring`) that passed alone.
- Owed: Adolion adoption of `effects.transition` (decision 3) is a private campaign step, not done here. Emote bubbles (D2) stay parked.
