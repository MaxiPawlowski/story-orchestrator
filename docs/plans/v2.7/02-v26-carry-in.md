# Plan 02 — v2.6 carry-in

**Status: DRAFT 2026-10-03. Not approved, not built.** Overview: `00-overview.md` (rule 2).

## Why

User decision 2026-10-03: **v2.6 takes no more changes.** Anything the seed research marked as a v2.6 item, and
anything v2.6 still owes, lands here. v2.6's code, gate records and seeds file stay as written, as history.

## Items

| # | Item | What | Source | Proposed gate |
|---|---|---|---|---|
| C1 | **SP5.b build** | the story-owned scenario (`effects.scenario` → `chat_metadata.scenario`), approved in v2.6 but never built. On the campaign it gives one story block instead of up to 7 card texts. C1–C5 passed ×1 | `16a-sp5-story-scenario.md` (design); `v2.6/04-remaining-builds.md:26`; `v2.6/03-sp5-restated.md` | triage the T7 red first; `npm run gates` + the SP5 recipe ×2 live; the scenario stays held while requirements are unmet (C3) |
| C2 | **Summarize / chat-vectors Repair row** | warn the author when ST's Summarize or Vector Storage chat vectors are on, because they put the whole transcript (unwitnessed scenes included) into every member's prompt. This bypasses per-member privacy | `22-sp9-witness-filter-v2.md` option A, decision 1; `v2.6/14-findings.md` T2-2 item 1 | pure `repair.ts` row + unit cases; live: toggle each extension and see the row appear and clear |
| C3 | **Warden and lore-check timeouts** | pooled over the playtest sessions, warden calls timed out 7.2% and lore-check calls 3.9%, both above J2's 1-in-50 bar. Find out whether this is the 4000 ms budget, plugin queueing or provider latency before tuning anything | `11-warden-lore-one-request.md` decision 3 (ad hoc scan of session journals) | formal `so-judge timeouts` run (was v2.6's owed R4) ×2; the floor stays 1 in 50, never retuned |
| C4 | **Separate-arm live checks owed** | the warden-lore runtime shipped as a separate call; R4, R6 and the G-L7 J8 on/off checks were owed to v2.6 plan 15 Part B | `11-warden-lore-one-request.md:22,70`; `v2.6/15-review.md:407-429` | as written in `v2.6/04-remaining-builds.md:536-540` |
| C5 | **SP6 / SP1 / SP10 runs** | never run in v2.6. SP6 measured, then built in plan 19 on PASS (`16b-sp6-complication-pool.md`); SP1 parked with a swipe-back counter (`16c-sp1-swipe-back-cache.md`); SP10 README note + probe removed (`16d-sp10-tool-call-turns.md`) | `16-spike-defers.md` (index) | per each file |

Plugin-side findings the campaign cannot fix (`C:\dev\adolion-campaign\docs\FEATURE-COVERAGE.md` §Findings,
re-checked against the current plugin before building):

| # | Item | What | Source | Proposed fix |
|---|---|---|---|---|
| C6 | **Image cue leaks the internal checkpoint name** (F3) | the establishing-shot cue sends `name`, never `player_name`, so a name that says more than the scene has shown reaches the image prompt | campaign F3; `src/image/runtime.ts:91-97` (cited there) | use `player_name` when present, else a neutral "establishing shot"; spoiler-checklist row for image prompts |
| C7 | **Secret looks reach image prompts** (F6) | lore `Appearance:` lines are read from every scanned entry the scene mentions, hidden forms included | campaign F6; `src/image/lore.ts` | read appearance only from entries the player has seen fire (`extras.lore.fired`) or an authored `public` flag |
| C8 | **Illustrations are story-wide** (F4) | no per-checkpoint opt-out or look; the Saga renders one image per transition (157 checkpoints, ~26 s GPU each, text queued meanwhile) | campaign F4; `src/engine/schema.ts` | `checkpoints[].illustrate: false` + per-chapter look override; chapter boundary as the default cadence |
| C9 | **Card fallback reads as a look** (F5) | a member with no image prompt falls back to 500 chars of the card description (the narrator's instructions) | campaign F5; `src/image/prompt.ts` | skip members whose roster role is narrator/system, or require an `appearance` |
| C10 | **Curator vs the house-style meta entry** | the WI curator may propose edits to the book's house-style entry | campaign review | a per-entry curator exclusion (`stagecraft.exclude`) |
| C11 | **F1/F2/F7 still open** | judge-typed evidence cut to 160 chars (F1); `commit_evidence` per quality, not per value (F2); chain voice ignores `no_repeat` (F7) | campaign F1, F2, F7 | each needs its own small plan before building; listed so they are not lost |
| C12 | **Lore select costs 5 judge requests per turn** (campaign lab C11) | open in the plugin with no v2.7 row until now | `adolion-campaign/lab/README.md` findings table (2026-10-03 refresh) | measure the per-turn request count on the campaign, then batch the questions into fewer requests (plan 14 notes that extra questions on an existing call cost almost nothing) |
| C13 | **SP8 tiers and spans approved but never built** | v2.6 approved them; the code still runs only behind its spike flag | `adolion-campaign/lab/README.md` v2.6 verdicts; `docs/plans/v2.6/03-sp8-restated.md` | build as approved (move out of `spikes/`, drop the flag), or record why not |

v2.6 playtest findings that arrive from now on are appended as new rows here (or as their own plan when large), with
their session dir or `14-findings.md` row as the source.

## Decisions for the user

1. Build order: C2 and C1 first (small, already designed), then C3 (measurement before any fix)? **Recommended: yes.** yes
2. Do C3/C4 run on the frozen v2.6 bundle (a clean before-measurement), or only on the first v2.7 build? 2.6 is goibg to be untouched at this point, this is the first properly dev plan.
3. Does the playtest's findings stream keep going into `v2.6/14-findings.md`, with this file only citing it, or straight
   into this file? **Recommended: straight here.** v2.6 docs stay as history.  Your recommendation is accepted.

## Links

`22-sp9-witness-filter-v2.md`, `16-spike-defers.md` (index; `16a`–`16d`), `11-warden-lore-one-request.md`, `19-quests-and-game-layer.md`
(SP6).

## Gate record (C6–C10)

2026-10-03, branch `worktree-agent-a5d8c1ad276a14ac2` (on `b2be37ab`). Claims checked against the tree first; all four findings were still open.

| # | Verified | Built |
|---|---|---|
| C6 (F3) | `src/image/runtime.ts` passed `snapshot.activeCheckpointName` (= `active.name`, `snapshotBuilder.ts:291`) into the cue (`Establishing shot of ${name}`) and into the director prompt's STORY BEAT line, which also feeds the fallback caption | `src/image/cast.ts` `beatLabel` + `cueText`: `player_name`, else "Establishing shot of the current scene."; the cue key is now the checkpoint id; the director prompt gets the same label. Spoiler property over sun-ruins + a control in `src/image/cast.test.ts`; checklist row in `docs/plans/v2.1/test-plan.md` §Spoiler checklist |
| C7 (F6) | `src/image/lore.ts` read `Appearance:` from every scanned, scene-mentioned entry | `visualLore` takes the fired set (`snapshot.lore.fired`, i.e. `extras.lore.fired`, keyed book + uid, rolled back by message). `Appearance:` counts only once the entry fired in this chat. The public marker is an entry line `Public appearance:`: always eligible, and it wins over `Appearance:` |
| C8 (F4) | `illustrations` story-wide only (`schema.ts`) | `checkpoints[].illustrate: false` (validator, Studio checkbox under "What the player sees") skips the automatic beat and scene cues while that beat is active. Manual requests still run. `chapters[].illustrations {style, appearances}` (same reader as the story block, `validate/illustrations.ts`) overrides the look inside the chapter (`lookFor`). Studio: chapter "Visual direction" field; per-member chapter looks are JSON-only |
| C9 (F5) | `sceneForImage` fell back to `card.description.slice(0, 500)` | subjects carry `described`. `castForImage` drops a member whose roster `role` starts with narrator/storyteller/game master/GM/DM/system, or whose `view` is `omniscient`, unless it has an authored or card `appearance` |
| C10 | curator scope = allowlist minus gated entries | `stagecraft.exclude: [{lorebook, comments}]` (validator, load errors on bad shapes). `isCuratorExcluded`/`isCuratorHidden` in `stagecraft/scope.ts`: the `readScope` filter and `isCuratorWritable` (write edge, refusal message "excluded from the curator by this story"). `setStagecraft` keeps exclusions when the call names only lorebooks, so the wizard/agent cannot drop them by accident. Studio Story tab rows (`[data-so="stagecraft-exclude"]`, story `CuratorExclusion`) |

Guide: `docs/authoring/story-guide.md` (Curator scope, Illustrations and display) + `src/copilot/guideTopics.ts` (stagecraft, presentation), drift test green. The defect-replay mutant `test/findings/defect-replay/curator-writes-gated-entry.json` was re-anchored to `&& !isCuratorHidden(...)` (the write-edge check moved into it); it is still KILLED.

Commands (worktree, node_modules junctioned to the main checkout, `.st-root` copied):

- `npm run gates`: typecheck ok, typecheck:test ok, lint ok, test ok (496 suites passed + 1 skipped; 6063 tests passed + 1 skipped). Then RED at build: `ST_ROOT is not set` because the worktree had no `.st-root`. Copied it in.
- `node scripts/release/gates.mjs --skip=typecheck,typecheck:test,lint,test` (no source change since the green steps): build ok, build:dev ok, test:debug RED (934/935: the stale defect-replay anchor above). Re-anchored.
- `node scripts/release/gates.mjs --skip=typecheck,typecheck:test,lint,test,build,build:dev`: test:debug ok, debug:typecheck ok, test:release ok, test:replay ok (curator-writes-gated-entry KILLED), test:plugin ok. test-storybook:ci RED with "No tests found": an environment fault, not a test failure. The worktree path contains `.claude`, which jest's testMatch glob skips, and the test runner resolves its root through the junctioned node_modules to the main checkout.
- Storybook re-run from a temporary copy at `C:\dev\so-sbcopy-a5d8`, with `@storybook/test-runner` copied locally and `STORYBOOK_PROJECT_ROOT` set: `npm run test-storybook` against the built `.sb-static`. Result: 67 suites, 425 tests passed, `curator-exclusion` included. The copy was deleted afterwards.

Live ST gate: NOT run. No ST session in this worktree. The ST-facing paths (image cue, fired-lore read, curator scope at runtime) are unit-covered only, so the gate is **not green** for live use. Owed: one real-LLM image cue on a beat with and without `player_name`, a fired vs unfired `Appearance:` entry, `illustrate: false`, and one curator pass on a story with `stagecraft.exclude`.

Leftovers: the plan's "chapter boundary as the default cadence" (C8) is not built. The agent's `setStagecraft` tool cannot write `exclude`; it is author-only, and the tool doc is unchanged. A story-level `illustrations` change still produces no `storyDiff` row (pre-existing). The image runtime class itself has no unit test, because its host imports block jest. C11 is untouched.
