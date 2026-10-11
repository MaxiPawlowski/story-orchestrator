# 38 — Already-muted scene cast falsely blocks setup

Owner report 2026-10-10; fixed 2026-10-11. Installation current at `e68a242c`:
all 107 staged build files matched their manifest hashes. The reported group had
125 members, 119 muted; its active checkpoint explicitly disabled those 119.
The cast-write mirror held zero disabled rows because the host already matched.

## Existing seam and fix

`EffectsApplier.applyCastChanges` correctly skips identical host flags. Setup's
`RuntimeManager.refreshRequirements` previously recognised only the write mirror
as intentional mutes. An authored no-op therefore produced a false blocker.

Use the existing `planCastChanges` resolver/order to combine tracked mutes with
the active checkpoint's authored changes. Active enables remove an exemption,
so an unavailable current speaker still raises the existing repair. This changes
the requirement read only; no cast writes, campaign edits or feature switches.
Guard an unloaded engine before asking for its active checkpoint.

## Gate record

2026-10-11.

- `npm run gates:quick`: green in 71.3 s; 47 related suites, 531 tests; replay
  32/32 killed. Later unloaded-engine regression covered by the final full suite.
- `npx jest src/runtime/requirements.test.ts src/runtime/requirementsRefresh.review.test.ts src/runtime/architecture.test.ts src/runtime/codeHealth.guard.test.ts --runInBand`:
  4 suites, 62 tests passed.
- `npm run build`: compiled successfully. Final main 1,293,563 B under the
  unchanged 1,300,000 B budget; SHA256
  `30f7f3905ca877641b27ab790e299d579c8e3befb3da96c245c278346f0fa9fa`.
- `npm run gates -- --jobs 4`: all green in 199.3 s, all eleven steps including
  Storybook. Earlier attempts failed the line-length/manager-size guards; moved
  tracked-flag projection into `requirements.ts`, without raising either budget.
- `ST_DEBUG_VIEWPORT=1440x844 node scripts/debug/st-lanes.mts run 30 -- scripts/debug/so-muted-scene-check.mts`:
  two consecutive final runs passed. Three synthetic cards/group; two already
  muted by the current scene: ready true, zero warning rows, zero tracked writes,
  two members remain muted. Control: mute the current enabled speaker and exactly
  one warning remains. Zero model/judge calls, zero page errors, cleanup clean
  with zero leaked marked assets in both final runs.
- The fixture serves the candidate production bundle through lane browser routes.
  Failed earlier harness probes retained: unloaded-story read, invalid fixture
  missing description, concurrent-build startup timeout, stale group inventory
  during cleanup. Cleanup now reloads away from the owned group, settles host
  writes and refreshes the group inventory before verifying removal.
- `node scripts/debug/st-lanes.mts stop 30`: lane stopped.

Private browser evidence: final runner windows `2026-10-11T00-13-07-536Z` and
`2026-10-11T00-13-30-324Z`; archive label `v28-muted-cast-20261011`.
No campaign content, names, transcripts or private inventories in this public record.

Final checks: `npm run debug:typecheck && npm run test:release` exit 0; release
123 passed, zero failed, 14 skipped. Evidence archive: 59 files, 4,520,042 B,
zero verification problems. `npm run stage && npm run plugins:install` succeeded:
159 files staged, all four plugins unchanged, `restartNeeded: false`.
Owner hard-reloads the ST tab to activate the fix. Changes remain uncommitted.
