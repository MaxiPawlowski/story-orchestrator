# v3.0 35 — "Here now" sheet tab and story-time spans

**Status: PLANNED 2026-10-30** (harvest 2026-10-30, index `30-harvest-index.md`; revised after `30-review-sol.md`:
"last seen" parked). Nothing built. Size: S. Rides 29 phase 2 (story sheet tab bodies).

## Problem (player)

- "Who is here, and how do they feel about me?" has an answer (v2.8 65 scene card) only when a story authors a `scene`
  widget. Most stories never show it.
- Chapter cards and the away recap say what happened, not when ("Day 3, evening to Day 4, morning").

## Evidence

- Harvest: `extension-research-2026-10-30/tavernos-hud.md` P2 (per-character "here now" card, cut to player-safe parts),
  2026-10-21 SUMMARY §2 (scene-archivist P2: story-time span on chapter cards and the away recap).
- Ours: `sceneView`/`scenePresent` already player-safe (`src/runtime/sceneCard.ts:42-64`: `knownEntities`,
  `holderLabelRows`, faction standing); shown only through a `scene` widget (`src/runtime/widgets.ts:268`). 29 sheet tabs =
  Journal, Stats, Ideas, Memory (`ui-review/inchat.md` §3.3). `timeLabel` (`src/engine/life/clock.ts:57`) is not used by
  chapter cards or `runtime/awayRecap.ts`. Boundary logs keep 200 entries (`src/engine/engine.ts:296`).

## Recommendation

- **S1 Here now tab.** Another consumer of `sceneView` (no second presence system): one tab body in 29's shared tab set,
  offered when the story has codex people, labelled relationships or factions (not only with a widget). Present members:
  portrait, name, public labels, visible faction band, link to People page. Empty state "Nobody else is here." Same body in
  Play's tabs.
- **S2 Story-time spans.** A chapter record stamps its start and end `story_time` when it seals (stored on the record, so
  log eviction cannot lose it; rollback drops the record as today). Chapter cards and the away recap's "Where you are" line
  render `timeLabel` for the span when the story has a clock; records sealed before this change show no span (explicit
  unknown, never reconstructed). Text only, no prompt change.
- **Parked: observed "last seen"** (dooms P4). Boundary logs store before/after state without the historical present cast
  (`src/engine/engine.ts:69`), and presence is enabled members minus authored schedule absences (`src/runtime/whereabouts.ts:7`),
  which is not an observation. Reopen with an evidenced sighting record (a read line or a per-boundary present-set stamp
  with retention and rollback), shared with 34 notes and 36 learned-at times (one historical-time/provenance design).

## Invariants touched

- Player/author split: player surfaces only; never thoughts, private aims, trust numbers, unrevealed secret labels
  (architecture §Relationship labels). Surfaces identical with and without a held secret (secret review tests).
- Disclosure is not knowledge: S1 lists members by `knownEntities` only (as `sceneView` does).
- One snapshot: read-models ride the snapshot; components never call manager getters.
- Rollback ≡ replay: S2 stamps live on the chapter record, rolled back with it.
- No prompt change: no rating.

## Floors (predeclared, informational)

- D: player Here now / chapter card output byte-identical with and without a held secret (planted control); 0 unknown
  members over 40 fixture states; span stamps survive crossing boundary 200 and drop with a rolled-back seal (20/20).

## Tests and gates

- jest: tab offering rule; span stamp at seal, rollback, pre-change records; `secret*.review.test.ts` extended.
- Storybook: tab body (present, nobody here), chapter card with and without a span, mobile sheet.
- `npm run gates`; live gate no-model lane: `so-ui.mts assert-player-clean`, screenshot desktop/mobile.

## GPU / rating

- None.

## Unresolved questions

- Offer the tab for stories with only a roster (no people pages, labels or factions)? Default no.
