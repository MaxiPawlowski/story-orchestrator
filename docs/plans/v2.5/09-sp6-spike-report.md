# v2.5 plan 09 — SP6 complication pool spike report

**Verdict: deterministic side PASS (K1); K2–K5 live legs pending.** No deterministic condition failed, so the code stays behind its flag and
the worth review (rule 8) waits for the live legs. The conditions, the measurement procedure and the fixtures were predeclared in `8a831195`
(conditions copied verbatim from `09-research-spikes.md` §SP6) and were not retuned. R13 (the judge adversity read) is not in this spike.
**U4 stays the user's:** only machinery is built; there is no player-visible copy or control (rule 7). The block is model-facing prompt text.

## Conditions

| # | Condition | Pass | Measured | Result | ST note (latest stable, V10) |
|---|---|---|---|---|---|
| K1 | Deterministic release | jest: release boundary and spent-ness derived from the log; rollback ≡ replay over 4 seeds | Real `StoryEngine` over `sp6-complications.story.json` (a camp/road loop), 150 boundaries per seed, seeds 5/17/29/43, 100 random cuts each: **0 mismatches of 400**, on both halves (the truncated log's releases equal the original's up to the cut, i.e. a rolled-back release is un-spent; the replay re-releases the same items at the same boundaries). Releases per seed 3/3/4/3 (the pool holds 4). Controls: a hold boundary breaks the streak (no release); spent-ness kept outside the log fails the same comparison (>0 mismatches) | PASS (jest, once) | n/a (our code) |
| K2 | One turn, one block | payload capture: the complication reaches exactly the next loud request, never a quiet/impersonate one | Machinery in jest (loud carries it, close clears it; quiet/impersonate never; a nested quiet lifts it until `reapply`; the next boundary retires it; a rollback to the release restores it; flag off never writes). The condition itself is live | **pending ×2 live** | `GENERATION_STARTED` fires before prompt assembly (`public/script.js:4299`, in-chat extension prompts read at `:5647`); quiet = `Generate('quiet')` (`public/script.js:3108`), impersonate = `Generate('impersonate')` (`public/scripts/slash-commands.js:361`); a dry run carries `dryRun` (`:4299`) and the lifecycle drops it |
| K3 | Agency | 20 released turns: the warden agency family (`agencyCheck`, judge on) flags ≤ the no-release control + 1; judge-off column recorded | — | **pending ×2 per arm** | judge on (host + model recorded per rule 5/6) |
| K4 | Over-steer | plan 01's probe on those turns: 0 verbatim restatements of the complication text | Scorer + `complication` over-steer family built (node:test) | **pending ×2** | n/a |
| K5 | It moves the story | on a stalled-tension fixture, committed tension reaches the target band within 6 boundaries of release in ≥ 60 % of releases vs ≤ 30 % control (route recorded) | — | **pending ×2 per arm** | pass role `read` (extraction) and its profile recorded in the run header |

ST facts verified against `C:\dev\SillyTavern-MainBranch` at `7c3994196`.

## What was built (all behind `settings.spikes.sp6Complications`, install-wide, default off, never flipped here)

- `src/runtime/spikes/sp6Complications.ts`: reads a checkpoint's raw `complications` (strings or `{id, text}`) and `complication_after`
  (default 3) from the pinned story; `deriveReleases` walks the boundary log (direction per entry = `getSteeringHint` over the entry's
  committed `tension_current` and `computeExpectedTension`), `pendingRelease` answers only while the release boundary is the newest one,
  `composeComplication` adds the checkpoint's agency clause. No new persisted state: release and spent-ness are the log.
- One-turn block: `story_orchestrator_complication` at depth 5 (the one free depth in `INJECTION_REGISTRY`; not registered — spike),
  set on an opened loud generation, lifted by a nested quiet/impersonate one, re-set on `reapply`, cleared on close. Seam:
  `SpikeSeams.generation?(intent)` called by `wiring/generation.ts` before the runtime's own handler, so the payload capture sees it.
- `RuntimeManager.getBoundaryLog()` (one line). Dev handle `storyOrchestratorSpikes.complications()` → `{flag, releases, pending, directions, compose}`
  (derived whatever the flag says, which is how the control arm measures its release points) and an `events` ring.
- Loaded only through the `__SO_DEV__` dynamic import of `runtime/spikes/install.ts`; `sp6Complications.ts` is on plan 12 D3's list
  (`devOnly.guard.test.ts`), whose planted-import control now names it.
- Harness: `COMPLICATION_FAMILY` in `scripts/debug/lib/overSteer.mts`; `scripts/debug/lib/sp6Score.mts` + `so-sp6-score.mts` apply the
  K3/K4/K5 bars as predeclared (INCOMPLETE, never PASS, on a missing cell or a run under 20 releases); `sp6Score.test.mts` (6 node:test cases).

## Live legs (pending; rule 1 ×2 consecutive, control arms in the same series on the same route; rule 4 lane copy + run header + `--strict`)

Dev build on the lanes first: `npm run build:dev && npm run serve:dev`, then `node scripts/debug/st-lanes.mts run <n> -- scripts/debug/st-session.mts reload`.
Group `1759606632088` holds DM Narrator. Records: `test/journeys/records/v2.5-plan09/sp6/live-<bundle12>/`.

| # | Commands |
|---|---|
| K2 | `node scripts/debug/so-run-header.mts capture --label sp6-k2` → `node scripts/debug/st-lanes.mts batch --lanes <n> --repeat 2 --strict --group 1759606632088 test/scenarios/live-v25-09-sp6-k2.json` → `node scripts/debug/so-run-header.mts diff <capture>` |
| K3/K4/K5 release, judge on | `node scripts/debug/st-lanes.mts run <n> -- scripts/debug/st-eval.mts "localStorage.setItem('so-sp6-arm','release')"` → `node scripts/debug/so-run-header.mts capture --label sp6-release-on` → `node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-journey.mts run test/journeys/spikes/sp6-complications.journey.json --strict --judge-uses agencyCheck --warden-mode auto` twice consecutively → `node scripts/debug/so-run-header.mts diff <capture>` |
| control, judge on | same with `'control'`, label `sp6-control-on` |
| release, judge off | same with `'release'` and `--judge-uses off`, label `sp6-release-off` |
| control, judge off | same with `'control'` and `--judge-uses off`, label `sp6-control-off` |
| score | `node scripts/debug/st-lanes.mts run <n> -- scripts/debug/st-eval.mts "localStorage.getItem('so-sp6-records')" > sp6-records.json` → `node scripts/debug/so-sp6-score.mts sp6-records.json` (archive both with the journey records) |

The journey lives in `test/journeys/spikes/` (moved there from `test/journeys/` in the code commit, content unchanged): the release
attestation's catalog is every top-level `*.journey.json` as a `J<n>` journey, and a spike is not one. `scenarioSchema.test.mts` now reads
that directory too, and names the SP6/SP7 fixtures so they cannot drop out of the validated corpus.
The K2 scenario and the journey switch `spikes.sp6Complications` themselves and switch it off at the end; after a FAILED run set it off by
hand. Every eval passed the fixture syntax check (`npm run test:debug`, `scenarioSchema`).

## Worth review (rule 8)

Waits for the live legs (no deterministic condition failed). Cost so far: prod main entry +151 B over SP7 (flag key + the generation seam call; 1 175 687 B of 1 250 000; the spike's own code is a
2-chunk dev-only import),
manager +2 lines, no new host seam (the extension-prompt writer already exists).
