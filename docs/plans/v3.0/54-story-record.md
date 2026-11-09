# v3.0 54 — Story record: what happened, why, who knows, what is open

Status 2026-11-09: BUILT with 48, merged and pushed; live gates PASS (no-model scenario ×2, assert-player-clean). Astra's "shared foundation". Built with or right after 48; read by 51 and 52.

## Why

Owner 2026-11-08 wants quests whose consequences show up later in the story. Later systems (director, pacing, recap,
author tools) each need the same answer: what happened, why, who was affected, who knows, what is still unresolved.
Today each one rebuilds part of it.

## What exists (the sources; no new one is added)

- Boundary log: `BoundaryLogEntry` with `before`/`after`/`evaluated` blackboards and context (`engine/engine.ts`,
  `stateLog`).
- Consequence refs per boundary, with `playerSpan` for "Because you…" (`runtime/consequences.ts`, `extras.recap`,
  `evidencedCause`).
- Effect ledger: write-ahead rows per host effect (`runtime/effectLedger.ts`).
- Session journal: derived from the rings at read time; only status transitions and flags persist (`extras.journal`).
- Who knows: held secrets and `secretAudience` (`memory/heldSecrets.ts`, `runtime/whoKnows.ts`), the audience contract
  (`memory/audience.ts`), rumors' landed hearsay (`extras.rumors`), promises (`extras.promises`).
- Open items: quest statuses (`engine/quests.ts`), pending echoes, open commitments and promises, open arcs
  (`memory/arcs.ts`).

## Design

- `runtime/storyRecord.ts`: a pure projection in a lazy chunk. `buildStoryRecord(sources, range)` returns rows; nothing
  is persisted.
  - Each row: `{ boundary, messageId, event, causes[], effects[], audience, opens[], closes[] }`.
  - `event`: a typed ref (transition, resolution, consequence, faction move, pressure threshold, agenda end, check,
    milestone, echo landing, rumor landing).
  - `causes`: `decidingCause` (`runtime/consequences.ts:83`): a single deciding leaf with an applied queue write, plus
    the `playerSpan` when the commit guard recorded one. Anything else is "unknown". Merely changed leaves are never
    presented as a cause.
  - `effects`: effect-ledger row ids.
  - `audience` per roster member: `witnessed | told | not-told | unknown`. It comes from the audience contract where a
    relation exists; otherwise `unknown`. Never inferred from being on stage (disclosure is not knowledge).
- No cache. Memory, audience, held secrets and in-place ledger status change within a boundary, so a key of
  boundary + length goes stale. The record is built on demand, author-only or once per director plan; the p95 floor
  below keeps that cheap. A cache comes later only if the floor misses, keyed by every source's revision.
- Views:
  - author: the Author console "record" section tab, the 51 candidates, and author-only Ask;
  - player: none new. The player keeps the journal and recap, through `playerProjection.ts`.
- Held secrets: rows are built per audience. The author view shows everything. Any machine consumer (51 director)
  takes the resting view (`restingFilter`). No shared tier reads the record.

## Schema keys

None. No code key, no detector. Rollback ≡ replay holds because every source already rolls back. A property test proves
the record after rollback equals the record of a replay.

## Switch and floors

- Feature row `story-record` (author area), on by default. Off: 51 falls back to its sources 4 and 5.
- D floors (hard):
  - record(rollback) == record(replay) over 200 seeds;
  - 0 secret text in the resting view (planted held secret);
  - build time p95 ≤ 5 ms over a 300-boundary log (performance rule; measured first, then the floor kept).

## Tests and live gate

- Pure: `storyRecord.test.ts`, a property test, a secret planted control.
- Runtime: author console Storybook story; `so-ui.mts assert-player-clean`.
- `npm run gates`. Live: the no-model scenario reads the record after a scripted resolution + rollback.

## Adolion adoption

No authored fields. Nothing to change.

## Order, size, resources

Size S-M. CPU only. Alongside 48 (it needs the resolution refs); before 51.

## Unresolved questions

- Should the record also be the director's only input for "what happened" (replacing its own thread list), or sit
  beside it?


## Gate record (2026-11-08)

Built with 48 on `v3.0-48-resolutions` (same runs).

- Full gates, run 6 (via the heavy lock, no `--resume`, Storybook included), on `3450f0849` (branch with local master
  `e5a1c61f8` merged): `npm run gates -- --jobs=2` -> `gates: all green in 390.7s` (test:replay 92.9s, test 202.4s,
  test-storybook:ci 297.0s, build 14.4s, typecheck 33.6s, test:debug 30.4s, typecheck:test 29.7s, lint 27.5s,
  debug:typecheck 9.5s, test:release 6.1s, test:plugin 21.4s). Main bundle 1,249,929 B of 1,300,000.
- After it, only docs: local master `81e98eb06` (plan 52 record) and these gate records.
- `npm run gates:quick` (via the lock) on `e45b1340f`: typecheck 74.9s, typecheck:test 90.8s, lint 29.1s, jest related 165.9s,
  replay `--cached` 90.9s, all ok.
- Red runs before it, each fixed and rerun in full:
  - run 1: `errorCopy.guard` (two simulator sites missing from `test/findings/errorCopy.json`); Storybook
    `QuestResolutionsPanel` (fixture did not validate; precedence field ate commas while typing).
  - run 2: Storybook, the fixture's `trust` meter needed `min`/`max`.
  - run 3: lint, the story's `render` called a hook (now a `FirstQuest` component).
  - run 4: stopped in the lock queue (master moved). Run 5: `test:release` suite coverage, `quest-resolutions` and
    `story-record` had no plan 24 matrix row (added to `docs/plans/v2.8/24-test-plan.md`).
- Docs: `npm run docs:guide`, `npm run docs:settings` after each master merge.
- Built: `runtime/storyRecord.ts` (pure projection), Author console section `record` (`RecordSection.tsx` + stories), switch
  `featureSwitches.storyRecord` (on) through `runtime/recordSwitch.ts`; tests `runtime/storyRecord.test.ts` (rollback equals
  replay, planted secret, p95 floor).
- Deviation: the p95 floor is measured best-of-3 per sample after warm-up (the CPU was fully loaded; median build ~0.7 ms).
- Owed: the no-model scenario reading the record after a scripted resolution + rollback (`v30-48-resolutions.json`, ×2);
  `so-ui.mts assert-player-clean` on a lane.

## Live gate record (2026-11-09)

- No-model scenario, ×2, PASS (2026-11-09, master `3b2e2985a`, bundle f681c5b1): adolion-fresh lane 48 seeded offline
  (`SO_LANE_OFFLINE=1 node scripts/debug/adolion-fresh.mts seed 48`, then `st-lanes.mts no-model 48`, `start 48`);
  `node scripts/debug/st-lanes.mts run 48 -- scripts/debug/so-scenario.mts run test/scenarios/v30-48-resolutions.json --sandbox --group "Group: Arin, DM Narrator"`
  twice: `ok: true`, 16/16 steps, residue clean. Closes on `freed` with both consequences, player view shows only the reached
  label and applied outcomes, the record lists close + consequences, `assert-player-clean` (step 14) holds, deleting the
  closing turn rolls back close, consequences and record rows. Evidence `<so-lanes>/48/debug/runs/2026-11-09T15-22-21-440Z-so-scenario-run`,
  `…/2026-11-09T15-23-31-132Z-so-scenario-run`. A first try on a plain no-model lane was not-runnable (its memory profile
  still reached the local controller); hence the offline seed.
- `assert-player-clean` on a lane: PASS in both runs (scenario step 14, player view after the close; the Author record is
  absent from every player surface).
- Owed: nothing for 54 beyond 48's journey rerun.
