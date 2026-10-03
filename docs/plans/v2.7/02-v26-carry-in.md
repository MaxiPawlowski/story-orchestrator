# Plan 02 — v2.6 carry-in

**Status (2026-10-03): v2.7 plan 02. PARTLY BUILT: C2 (`e9082dd5`) and C6–C10 (`74c8f50a`) merged, live NOT run.
Open in v2.7: K1 (step 0, urgent), C1, C11-F1 display half, C13 exact promotion, C14. The model-consuming rows (C3, C4,
C12, C11-F2/F7, the F1 guard change, C13-b, C14-b) moved to `v2.8/01-v27-carry-over.md` §B.** Overview:
`00-overview.md` (rule 2).
**Gate tiers** (v2.7 overview §Gate taxonomy): implementation D; acceptance D here, CL/LI/RP rows in v2.8 01 §A/§B.

## Why

User decision 2026-10-03: **v2.6 takes no more changes.** Anything the seed research marked as a v2.6 item, and
anything v2.6 still owes, lands here or, when it needs a model, in v2.8 01. v2.6's code, gate records and seeds file
stay as written, as history.

## Items in v2.7

"Model input" says whether the change alters what reaches a model (v2.7 rule 6) and who owns its real-model row.

| # | Item | What | Source | Gate (D) | Model input |
|---|---|---|---|---|---|
| C1 | **SP5.b build** | the story-owned scenario (`effects.scenario` → `chat_metadata.scenario`), approved in v2.6, never built. No model call in its code path (review A5), so it is deterministic to build. Design: `v2.8/16-sp5-story-scenario.md` | v2.6 `v2.6/04-remaining-builds.md:26`, `v2.6/03-sp5-restated.md` | triage the T7 red first; jest (scenario set, released on jump/leave, held while requirements are unmet, rollback ≡ replay); `effects-*`-style no-LLM scenario on a group; dry-run payload shows the authored block and nothing else | **yes**: the scenario block; real legs owned by v2.8 16 |
| C2 | **Summarize / chat-vectors privacy check** | built (gate record below) | `v2.9/02-sp9-witness-filter-v2.md` option A | live seeded lane (v2.8 01 O8, tier D) | no |
| C2-K1 | **K1: the player alert must not reveal a held secret** | `SECRET_LEAK_CHECK` (`src/runtime/checks.ts:45`) shows only when `secretLeaks()` is non-empty, which needs a held secret. Fix: the player copy shows whenever a copier is on in a **group story**; `secretsHeld` gates only the author detail. K2: rewrite the held-secret invariant in `.claude/rules/architecture.md` (player alert + HUD chip, author detail) in the same change | review K1, K2, F34 | jest: player-visible output (HUD chip, drawer row, settings row, Help) identical with and without held secrets, both copiers, solo control inactive; live seeded lane ×2 | no |
| C6–C10 | image cue, fired/public looks, `illustrate`, narrator fallback, `stagecraft.exclude` | built (gate record below) | campaign F3–F6, review | done (D) | **yes**: image and curator prompts; real rows v2.8 01 O3–O7 |
| C11-F1a | **Judge-typed evidence cut, display half** | F1: a judge-typed read cites only the first 160 characters of the chosen message (`src/judge/extraction.ts:179`). The display half: the author journal row of a held judge-typed reading says the evidence was cut and names the source message id, so an author can see why a long reply did not commit. Own short plan first (problem above; floor: jest, the note appears for a cut source and never for a short one; gate: `npm run gates`) | campaign F1; Sol split item 3 | jest + `so-journal.mts show` on a seeded hold | no |
| C13 | **SP8 tiers and spans, exact promotion** | v2.6 approved them; the code still runs behind its spike flag (`stagecraftCoordinator.ts`, `settingsModel.ts`). Promote exactly as measured: out of the spike path, flag dropped, no prompt or digest change. Deterministic safety/revert checks: a write outside a tier or into a protected span is refused at the write edge; rollback reverts an applied op; flag-off control | `v2.6/03-sp8-restated.md`; campaign lab README; Sol split item 4 | jest (`curatorTiers.test.ts`, `curatorTiersSpike.review.test.ts` re-homed), defect-replay mutant on the write edge, payload invariance on the curator request (byte-identical prompt) | none if the prompt bytes stay identical; any digest or prompt change is v2.8 01 C13-b |
| C14 | **Model-specific context table + role picker** | today a preset-less CC profile gets 8192 tokens unless the source is `deepseek` (`src/services/stHost/contextLimit.ts:21-28`). Build a per-source/per-model table, the precedence (preset value > table > default) and the picker grouped by source with a cloud/local label. Design: v2.7 14 §Build in v2.7 | v2.7 14 research decision 6; review F17, A (C14); Sol split item 5 | jest: unknown model → default with a reason, preset wins over the table, truncation at the table's limit, picker grouping; Storybook for the picker (a11y) | **yes**: larger extraction inputs; real row v2.8 01 C14-b |

## Moved out

| # | Item | Now |
|---|---|---|
| C3 | warden and lore-check timeouts | v2.8 01 §B C3 (CL) |
| C4 | separate-arm live checks (R4, R6, G-L7 J8) | v2.8 01 §B C4 (CL + RP) |
| C5 | SP6 / SP1 / SP10 runs | SP6 → `v2.8/17-sp6-complication-pool.md`; SP1 → `v2.9/01-sp1-swipe-back-cache.md`; SP10 → v2.7 15 (B + C) and v2.9 05.2 |
| C11-F1 guard | test the commit guard against the whole source message (commitment semantics) | v2.8 01 §B C11-F1 |
| C11-F2 | `commit_evidence` per value | v2.8 01 §B |
| C11-F7 | chain voice ignores `no_repeat` | v2.8 01 §B |
| C12 | lore select costs 5 judge requests per turn | v2.8 01 §B (CL) |
| C13-b | SP8 digest or prompt changes | v2.8 01 §B |
| C14-b | enlarged extraction inputs, real-model row | v2.8 01 §B |

Plugin-side campaign findings (C6–C11) come from `C:\dev\adolion-campaign\docs\FEATURE-COVERAGE.md` §Findings,
re-checked against the current plugin before building. v2.6 playtest findings that arrive from now on are appended as
new rows here (or as their own plan when large), with their session dir or `v2.6/14-findings.md` row as the source.

## Decisions for the user

1. Build order: C2 and C1 first (small, already designed), then C3 (measurement before any fix)? **Recommended: yes.** yes
2. Do C3/C4 run on the frozen v2.6 bundle (a clean before-measurement), or only on the first v2.7 build? 2.6 is goibg to be untouched at this point, this is the first properly dev plan.
3. Does the playtest's findings stream keep going into `v2.6/14-findings.md`, with this file only citing it, or straight
   into this file? **Recommended: straight here.** v2.6 docs stay as history.  Your recommendation is accepted.

Decision 2 now applies in v2.8 01 (C3/C4 measure on the first v2.7 build).

## Links

`v2.9/02-sp9-witness-filter-v2.md` (C2 is its option A), `v2.8/16-sp5-story-scenario.md` (C1 design + live legs),
`v2.8/17-sp6-complication-pool.md`, `v2.9/01-sp1-swipe-back-cache.md`, v2.7 15 (SP10), v2.7 13 (warden-lore kept
separate), v2.7 14 (C14 design), v2.7 04 (checks registry), `v2.8/01-v27-carry-over.md` §A/§B.

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

## Gate record — C2 (2026-10-03)

**As built.** v2.6 T6-4 (`97156c2f`) already shipped a block-based row: Summarize's `1_memory` / Vector Storage's
`3_vectors` extension prompt present + a held secret (`secretsHeld`, groups only) → author-only `privacy` Repair row.
C2 adds:

- **Settings read** (`src/services/stHost/transcriptCopiers.ts`, pure, host shapes cited from ST `7c3994196`:
  `memory/index.js:36,93-97,319,418,434,541-555,566,785`, `vectors/index.js:50,52,86,795,1746-1789`,
  `extensions.js:146,513`, `script.js:485`). Summarize counts as on when not in `disabledExtensions`, not paused,
  interval > 0, position not NONE and source main/webllm (the retired Extras source is invisible to this read; its
  block, if any, is still caught by the block read). Chat vectors: `vectors.enabled_chats === true`. So the row
  appears before the copier's first block lands, not only after.
- Wired in `runtime/wiring/lore.ts` through `readCopiersWith` (`runtime/transcriptCopiers.ts`), the same reader-seam
  pattern as `globalStoryLore`; the snapshot unions both readings into `secretLeaks`.
- **Player wording**: "<Summarize and Vector Storage> share the whole chat with every character, so a character can
  learn what was kept from them. Switch them off in SillyTavern's extensions to keep secrets." Names no secret and no
  holder. The author detail says how to switch each one off.
- **Check registry seed (v2.7 04 design note, old plan 31)**: `src/runtime/checks.ts`, `Check {id, area, scope, audience,
  severity, applies?, detect}`; C2 is `transcript-copiers` (scope story, audience player, severity degrades). Findings
  reach the one Repair channel (`repairSteps` → drawer, settings, new HUD `#so-hud-setup` chip); no parallel alert
  path. The existing repair.ts steps are NOT migrated yet (follow-up, v2.7 04).
- Spoiler checklist rows added (`docs/plans/v2.1/test-plan.md`).

**Tests:** `src/services/stHost/transcriptCopiers.test.ts`, `src/runtime/secretLeak.test.ts` (settings reading,
reader seam, player wording, HUD alert), `src/runtime/checks.test.ts`.

**Gates:** one run covers old plans 02 C2, 06, 07 E and 08 C (= v2.7 02 C2, 08, 09 E, 10 C); see the v2.7 08 gate record.

**Live: NOT run** (no ST lane available to this agent). Owed: a lane with a group story holding a `[hiding]` row →
switch Summarize (main source, interval > 0) and chat vectors on → row and `#so-hud-setup` appear in player mode,
clear when off; `so-ui.mts assert-player-clean` green.

## Gate record — C1 SP5.b (2026-10-03)

Branch `worktree-agent-a1032536536635cc2` (master `7371a44e` merged in first). Built as `v2.8/16-sp5-story-scenario.md`
§Design reference decides, steps 1–10.

**Step 1, T7 triage (from the archived evidence; no re-run, no live lane in this session).** Both reds are fixture
counts that predate v2.6 04 C4 (c) (a `/cp activate` jump releases the source's scenario row first), not product
regressions:

- Adolion `t7-adolion-sp5-scenario.json` step 7 counts `status === 'applied'` and wants 2. Under C4 (c) the jump to
  `east-landfall` reverts the guild-hall row, so the ledger holds 1 applied + 1 reverted: the same count
  `v2.6/03-sp5-restated.md` addendum 3 already changed to "applied **or** reverted". The T7 copy (under
  `test/sessions/T7/suite/spikes/`, untracked session evidence) still has the old count. Pinned by the jest case "a jump
  releases the source's scenario and applies the target alone" (`["reverted", "applied"]`).
- Toy `live-v25-09-sp5-scenario.json` C2 order 1: the lane log (`so-lanes/1/debug/batch/2026-10-03T06-08-17-091Z-…-run1.log`)
  shows every clause true except `back.refusedRows === 1` (found 2). The jump to `hall` releases the gate row, the
  compare-and-set refuses it (the user's text is held) and marks it `externally-changed`, then the hall write is refused
  too: two refused rows, and the hydrate on return adds none. Pinned by the jest case "T7 triage, toy C2 order 1".
  The fixture's count is left to v2.8 16 (it converts both fixtures to groups); its `spikes.sp5Scenario` residue is
  gone (the helper's `flag()` now writes nothing).
- The T7 header diff also warned the served bundle was not the built one, so neither red was a measurement anyway.

**Built.**

| Step | What |
|---|---|
| 2 type | `CheckpointEffects.scenario?: string \| null` (`engine/schema.ts`); `validate/checkpoints.ts` trims text, reads `""`/`null` as clear (`""`), keeps the key out when absent (inherit), refuses any other type by path. Localized: one schema line, one validator block |
| 3 move | `spikes/sp5Scenario.ts` → `runtime/storyScenario.ts` (pure, reads the typed field, `SCENARIO_EFFECT = "scenario"`: the ledger target name is unchanged, so stored rows still restore), `spikes/sp5ScenarioHost.ts` → `runtime/storyScenarioHost.ts` (`startStoryScenario`: registers the extension and the frame reader). Registered statically in `runtime/index.ts` `registerHostSurfaces`, before the startup load (the dev import used to race it); not in the manager |
| 4 flag | `sp5Scenario` out of `SPIKE_FLAGS`; the sanitizer drops a stored value (`spikeFlags.test.ts`), and `test/sessions/baseline-settings.json` no longer names it (`sessionBaseline.test.ts`). `devOnly.guard.test.ts`: the two spike files and `stHost/chatScenario.ts` leave the dev-only lists; the planted-import control now plants `spikes/swipeBack` (still reached and caught); a new case asserts the scenario modules ship in the prod entry graph and no `spikes/sp5*` file remains |
| 5 C3 | unchanged: held with World Info while requirements are unmet (`effectsApplier.ts` `ready ? effectExtensions() : []`); jest case + control |
| 6 jump | unchanged C4 (c); jest case (target authoring none plays the pre-story value) |
| 7 Studio | `EffectsEditor` "Scenario" section: off = inherit, on + empty = clear (`[data-so="scenario-clear-note"]`), text = set; through `setCheckpointEffects`. Story `Studio/CheckpointEditor` `ScenarioThreeStates` (interaction + a11y). No new diagnostic |
| 8 C5 note | snapshot `competingScenarios` (`snapshotBuilder` `setupWarnings`, from the live frame: the chat's override + the open group's enabled card scenarios, via the `readScenarioFrameWith` seam, the `readCopiersWith` pattern). Author view only, under the requirements rows (`OverviewTab` `[data-so="scenario-competing"]`); the journal note stays. Not a check-registry row: v2.7 04 is not built and `checks.ts` was out of scope. Stories `AuthorCompetingScenarios`, `PlayerSeesNoCompetingScenarios` |
| 9 guide | new topic `scenario` after `background` (`docs/authoring/story-guide.md` + `guideTopics.ts` twin, `STUDIO_TAB_GUIDE` checkpoints); `experimental-effects` keeps `reasoning` and `complications` only; `npm run docs:guide` regenerated `docs/guide/author` (new `topics/scenario.md`). No solo sentence existed to drop |
| 10 agent | `setCheckpointEffects` tool doc lists `scenario` |
| rule 9 | registry feature `story-scenario` (area world, author, Studio › Turning point › Effects › Scenario, guide topic `scenario`, since 2.7.0, needs group-chat + story); `registry.test.ts` green |

Invariants kept: `EffectsApplier` refuses with `NO_OPEN_CHAT` and writes nothing (new jest case); restore on leave never
writes the chat left behind, restart/remove is compare-and-set (`externally-changed`, user text kept); rollback restores
through the RESTORABLE row and equals a fresh replay of the shorter path (new jest case).

**Tests.** `src/engine/checkpointScenario.test.ts` (new), `src/runtime/storyScenario.test.ts` (moved + 7 new cases:
typed field, no chat, held/control, jump, T7 C2 triage, rollback ≡ replay, author-view names),
`storyScenarioHost.test.ts` (rewritten: no flag, frame reader), `storyScenarioCastSettle.review.test.ts` (moved),
`storyScenarioSnapshot.test.ts` (new), guide drift (`guideTopics.test.ts`), `registry.test.ts`, `devOnly.guard.test.ts`,
`spikeFlags.test.ts`. Census note in `test/findings/ownership-sites.json` repointed at the moved case.

**No-LLM scenario (D, not run live).** `test/scenarios/effects-story-scenario.json` (new, group sandbox, toy story
`live-v25-09-sp5.story.json`): import sets the gate's scenario; `/cp activate hall` swaps it; `/cp activate road`
(authors none) plays the pre-story value; back to gate; `removeStory` puts the pre-story value back. Each step takes a
dry-run capture (no model call) and asserts the held scenario is in the request once and the other checkpoint's text
zero times. Evals syntax-checked (`new Function`), the closed-vocabulary validator passes it inside `test:debug`.
Run: `so-scenario.mts run test/scenarios/effects-story-scenario.json --sandbox --group <id>`, ×2, with a run header diff.

**Gates** (worktree, node_modules junctioned to the main checkout):

- `ST_ROOT=C:/dev/SillyTavern-MainBranch npm run gates -- --no-storybook`: **all green**. typecheck, typecheck:test,
  lint ok; test 505 suites passed + 1 skipped, 6156 tests passed + 1 skipped; build ok (prod bundle `68937905eb17`);
  build:dev ok; test:debug 935/935; debug:typecheck ok; test:release ok; test:replay 30 mutants KILLED, 0 survived;
  test:plugin ok. `test-storybook:ci` SKIPPED by the flag; run separately below. (A first run was RED on
  `sessionBaseline.test.ts`: the session baseline still named `spikes.sp5Scenario`. Fixed, re-run green.)
- `npm run typecheck:test`: ok (also inside the gates).
- Storybook (UI files changed): `npm run storybook:build` → `.sb-static`; `npx http-server .sb-static -p 6064 -s -c-1 -a
  127.0.0.1`; `node node_modules/@storybook/test-runner/dist/test-storybook.js --index-json --url http://127.0.0.1:6064`:
  71 suites, 449 tests passed (the three new stories included); server stopped.
- Prod main entry `dist/index.js` 1,119,130 B (named 2026-10-03 build 1,115,323 B: +3,807 B), budget 1,250,000 B.

**Live gate: NOT run** (no ST, lane, pod or ComfyUI in this session), so C1 is **not green for live use**. Owed:
the no-LLM scenario above ×2 on a lane group (D, v2.7 16-test-plan C1 row, with the payload capture as the declared
diff); the C1–C5 ×2 acceptance on Adolion with both fixtures converted to groups (v2.8 16).

**Model input changes (rule 6), declared.** (1) Reply prompts: a group chat playing a story whose checkpoints author
`effects.scenario` now carries that one scenario text in place of every member card's scenario, on every install (it
was behind a dev-only flag, off by default). Real-model row: **v2.8 01 O13** (the scenario reaches the prompt and the
reply follows it); plumbing ×2: v2.8 16. (2) Wizard/agent prompts: the agent's topic list gains `scenario`, the
`experimental-effects` topic text changes, the `setCheckpointEffects` tool doc names `scenario`. No staged-stage topic
list changed (`STAGE_GUIDE_TOPICS` untouched). Owner: v2.8 01 O13b (CL).

**Open.** (a) Closed: v2.8 01 O13b owns the wizard-prompt diff. (b) The toy fixture's C2 count and
the Adolion T7 count (fixture, above) are v2.8 16's to change with the group conversion. (c) 16-test-plan's C1 row said
"cleared on leave" (fixed 2026-10-03): a chat-scoped scenario is never written on leave (the chat keeps its own); the scenario above uses
story removal (restore `exit`) instead.

## Review 2026-10-03

Applied: K1, K2 (C2-K1), F34 (with and without held secrets), A5 (C1 deterministic; C12/C13 owners), F17 (owners for
C14 and C11), Sol split items 2 (owed real rows → v2.8 01 §A), 3 (C11 per item: F1 display half here, the rest
v2.8 01), 4 (C13 exact promotion here, digest/prompt v2.8 01), 5 (C14 picker + table here, enlarged inputs keep a
real-model row), the Claude-A note "C14 is missing from 02" (added), F15 (tiers per row), B12/F36 (references).

## Gate record — C13 SP8.b exact promotion (2026-10-03)

Branch `worktree-agent-ae7551aa254ed5d35` (base master `506a7ca4`). Built as §Items C13 decides and v2.6 04 SP8.b
describes: tiers + protected spans out of the spike path, flag dropped, no prompt or digest change. C13-b (any digest or
prompt change) is v2.8 01 and was not touched. Not merged into master.

| Piece | Built |
|---|---|
| promotion | `src/stagecraft/curatorTiers.ts` unchanged, now exported from the `@stagecraft` barrel and reached statically. `StagecraftCoordinator` calls `refuseProtected` (plan time) and `routeByTier` (accept mode) on every pass; its `spikes` dep, `spikesOn`/`spikeModules` and the dynamic imports are gone (`managerWiring.ts` no longer passes it). `CuratorWriter.writeOp` calls `protectedRefusal` itself, so the write edge always re-checks spans against the entry it just read (the optional `guard` parameter is gone) |
| flag | `sp8CuratorTiers` out of `SPIKE_FLAGS`; the sanitizer drops a stored value (`spikeFlags.test.ts`), `test/sessions/baseline-settings.json` no longer names it |
| runs.json | `test/measurements/v2.6-09/runs.json` on-column `spikes-b` resolution writes nothing now and both readbacks drop `spikes.sp8CuratorTiers` **and `spikes.sp5Scenario`** (C1 left that residue; a readback of a dropped key could never match). `integrationRuns.test.mts` asserts the on column writes no spike |
| live helper | `test/fixtures/interop/v25-09-sp8.js` arm/disarm no longer set or check the flag (arm would have thrown); W3 fixture notes updated (`live-v25-09-sp8-w3-safety.json`, `sp8-fixtures.mjs`) |
| guide | `docs/authoring/story-guide.md` "Curator scope" + twin `guideTopics.ts` `stagecraft`: the markers, what they refuse, that auto mode now applies only `{{// so:auto}}` entries; `npm run docs:guide` regenerated `docs/guide/author/topics/stagecraft.md` |
| UI copy | settings help for `stagecraft.acceptMode` (`settingsCopy.ts`) and the author drawer line in `StagecraftPanel.tsx` say "apply on their own" means marked entries; the rest wait. Settings UI unchanged otherwise |
| rule 9 | registry feature `curator-markers` ("Protected and auto lore", area world, author, guide topic `stagecraft`, since 2.7.0, needs memory-profile); `registry.test.ts` green |
| invariant | `.claude/rules/architecture.md` "Stagecraft proposes, it never writes" names the tiers and spans and the two refusal points |

**Behaviour change, declared.** Accept mode `auto` used to accept every op; now only ops on entries carrying
`{{// so:auto}}` are accepted on the spot, every other op waits as in `review` (SP8 W2 as measured; v2.5 report §SP8).
An install on `auto` with an unmarked book therefore sees cards instead of writes. `review` and `off` are unchanged.
Protected spans only remove writes.

**Tests (D).**

- `src/runtime/coordinators/curatorTiers.review.test.ts` (re-homed from `curatorTiersSpike.review.test.ts`, no flag):
  W1 plan time 10/10 violations refused, 4/4 controls carded; write edge 10/10 refused with 0 host writes, controls
  written, the check reads the entry at the write; **rollback**: an applied op on a protected entry reverts to its
  before-image, span and markers included; W2 auto routes exactly the four auto entries; **flag-off controls, re-stated
  without a flag**: on the same book with every marker removed, the six marker-free violations become cards and an
  accepted disable is written (today's behaviour), and review leaves all eight pending.
- **Payload invariance (rule 6)**: the prompt a pass sends equals `buildWiCuratorPrompt` of the shown entries and its
  sha256 is pinned (`b8befae37041…`). `prompt.ts`, `scope.ts` and `types.ts` are untouched by this branch, and the prompt
  never depended on the flag, so the pinned bytes are the pre-promotion bytes.
- `src/stagecraft/curatorTiers.test.ts` unchanged (pure W1/W2).
- Existing coordinator suites (`stagecraftCoordinator.test.ts`, `.review.test.ts`) used `auto` on unmarked books as a
  shortcut to acceptance; they now accept every card through `test/support/curatorAccept.ts` (the author's acceptance,
  in-state, no extra save) and keep their write/rollback/ownership assertions. "auto mode accepts on the spot" is split
  into an auto-tier case and an unmarked control (pending, 0 writes).
- Defect replay: new mutant `curator-writes-protected-span` (write-edge `protectedRefusal` → `null`) KILLED by
  `curatorTiers.review.test.ts`.
- `devOnly.guard.test.ts`: `curatorTiers.ts` leaves the dev-only list; new case asserts it ships in the entry graph and
  is not dev-only; the planted-import control now plants `spikes/swipeBack` through the stagecraft barrel (still caught).

**Gates** (worktree, node_modules junctioned to the main checkout):

| Command | Result |
|---|---|
| `ST_ROOT=C:/dev/SillyTavern-MainBranch npm run gates -- --no-storybook` | **all green** (second run; the first was RED at lint: one over-long line in `StagecraftPanel.tsx`, wrapped): typecheck, typecheck:test, lint; test 508 suites passed + 1 skipped, 6182 tests passed + 1 skipped; build; build:dev; test:debug 958/958; debug:typecheck; test:release 94 pass, 2 skipped; test:replay 31 of 31 KILLED; test:plugin 87 pass, 3 skipped. Storybook skipped by the flag, run below |
| `npm run typecheck:test` | green (inside the gates run) |
| `npm run storybook:build` → `.sb-static`; `npx http-server .sb-static -p 6065 -s -c-1 -a 127.0.0.1`; `node node_modules/@storybook/test-runner/dist/test-storybook.js --index-json --url http://127.0.0.1:6065` | 71 suites, 450 tests passed; server stopped |
| prod main entry `dist/index.js` | 1,123,671 B (master 1,122,865 B: +806 B), budget 1,250,000 B |

**Live gate: NOT run** (no ST, lane, pod or ComfyUI in this session), so C13 is **not green for live use**. Owed: the
16-test-plan C13 D row's mocked curator scenario (`stagecraft: {action: "curate"}` with
`storyOrchestratorDebugCuratorResponse`: an op into a protected span refused, an applied op reverted by a swipe) and the
payload capture on a scripted group chat; the real-model row is **v2.8 01 O14** (promotion under a real curator, CL).

**Model input (rule 6), declared.** (1) Curator prompt: **none**: byte-identical (pinned hash above); the marker rule
line was already in every curator prompt, and ST strips `{{// …}}` from World Info before any reply prompt. (2) Wizard /
agent prompts: `readGuide("stagecraft")` returns the longer topic text (markers). No staged-stage topic list changed
(`STAGE_GUIDE_TOPICS` untouched), so only an agent that reads that topic sees it. Real-model owner: none yet (same open
question as C1 (2)). (3) What reaches a lorebook (not a prompt): `auto` mode writes fewer entries (above); O14 covers it.

**Open.** (a) Owner for the wizard-prompt diff (2) (with C1's, v2.8 01 beside O13/O14?). (b) Should `auto` on a book
with no `{{// so:auto}}` entry say so in Repair or the Studio (today only the settings help and drawer line say it)?
(c) `test/findings/suite-decisions.json` still describes the v2.6 SP8 run "curator tiers flag per 03-sp8-restated.md";
left as history.

## Gate record (C14)

2026-10-03, branch `worktree-agent-a1eb7b669f3b8ce6a`, code commit `8f850724`, built with v2.7 14 (picker: its gate record).
Not merged into master.

| Piece | Built |
|---|---|
| Table | `src/services/stHost/contextLimit.ts` `CONTEXT_TABLE` replaces `CHAT_SOURCE_CONTEXT`: rows keyed by CC source and, where ST knows them, a model pattern. Source rows: `deepseek` 131,072 (unchanged), `claude` 200,000, `openai`/`azure_openai`/`makersuite`/`vertexai`/`xai` 128,000. Model rows mirror ST's own model maxima (`public/scripts/openai.js` `getMaxContextOpenAI` :5088-5122, `getGeminiMaxContext` :5130-5161, the xAI block :5913-5926; Claude's 1M rows left out, beta-gated). `custom`, `openrouter`, `mistralai` and every other source have no row (their models vary or need ST's live model list) |
| Precedence | preset value > model row > source row > 8192 default. A CC profile's preset that is unreadable or has no usable `openai_max_context`, or a missing preset manager, now falls to the table with the preset's reason kept (`known for deepseek; the preset "X" could not be read`); the 8192 default keeps its reason as before. A Text Completion profile never reads the table. `ContextLimit.source` stays `"source"` for both row kinds (Diagnostics shows the reason) |
| Tests | `contextLimit.test.ts` §"v2.7 02 C14": model row wins over its source row, unknown model on a known source, unknown source (custom, openrouter) → default with reason, preset wins over the table, CC preset without a size → table, TC untouched, `inputBudget` truncates at the table's limit (200,000 − 512 − 20,000), table shape (one source row per source, last). Picker grouping: `src/utils/profileGroups.test.ts` + Storybook `GroupedBySource` |

**Model input (rule 6): yes.** What changes reaching the model: the extraction input budget (`inputBudget`, shared read,
memorize backlog plan, preflight) for (a) a preset-less CC profile on `claude`, `openai`, `azure_openai`, `makersuite`,
`vertexai` or `xai` (8,192 → 128,000-2,000,000 by row), and (b) a CC profile whose preset gives no usable context size,
on any source with a row (8,192 → the row, `deepseek` included). Unchanged: DeepSeek profiles with no preset (131,072
before and after; the v2.6 role setup), every CC profile whose preset has `openai_max_context`, every TC profile, and
`custom`/`openrouter`. Real-model row: `v2.8/01-v27-carry-over.md` §B C14-b (owed). The picker sends nothing new.

Gates (tier D), all on the branch after the code commit:

| Command | Result |
|---|---|
| `ST_ROOT=C:/dev/SillyTavern-MainBranch npm run gates -- --no-storybook` | all green: typecheck, typecheck:test, lint, test (502 suites passed, 1 skipped; 6141 tests passed, 1 skipped), build, build:dev, test:debug (87 pass, 3 skipped), debug:typecheck, test:release, test:replay, test:plugin; Storybook skipped by the flag and run separately below |
| `npm run typecheck:test` | green (inside the gates run) |
| `npm run storybook:build` (to `.sb-static`), `npx http-server .sb-static -p 6063 -s -c-1 -a 127.0.0.1`, `node node_modules/@storybook/test-runner/dist/test-storybook.js --index-json --url http://127.0.0.1:6063` | 71 suites, 447 tests passed (includes the new `Settings/RoleProfilesGroup` `GroupedBySource` story with its a11y check); server stopped |
| prod bundle `dist/index.js` | 1,117,438 B (budget 1,250,000 B) |

Live gate: **NOT run** (no ST, lanes, pod or ComfyUI in this build session). The tier-D live row in `16-test-plan.md`
(the picker on a lane with a TC, a DeepSeek CC and a harness route in the right groups; run header `profiles` diff empty)
is still owed.

Deviations: none beyond v2.7 14's (image director select not grouped).

Open questions:
- DeepSeek's row stays at 131,072 although ST now allows up to 1,000,000 for the source (`openai.js:5882-5888`); raising
  it would change the v2.6 role setup's input, so it waits for C14-b's measurement.

## Gate record — C11-F1a display half (2026-10-03)

**Short plan** (the row asked for one first). Problem: a judge-typed read quotes only the first 160 characters of the
message it chose (`src/judge/extraction.ts`), so a rating or commitment held on that quote can look unexplained when
the grounding words sit later in a long reply. Floor (predeclared): jest, the held row names the cut for a cut source
and never for a short source or an LLM-read hold. Gate: `npm run gates`. Guard semantics unchanged (v2.8 01 C11-F1).

**As built** (commit `ca79e142`):

- `TYPED_EVIDENCE_CHARS` (160) named in `src/judge/extraction.ts`; a typed delta whose source text is longer carries
  `sourceChars` (the full length). `runtime/typedRead.ts` passes it on to `ParsedDelta.sourceChars`.
- `src/extraction/evidenceCut.ts` `evidenceCut(delta)`: both guards' held rows (`HeldCommitDelta`, `HeldRatingDelta`)
  carry `sourceChars` + `messageId` only when the evidence was cut. Accept/hold decisions are unchanged.
- `runtime/heldJournal.ts` `heldNote` adds `, evidence cut to the first 160 of <n> characters of message <id>` after the
  reader's quote. It lives only in the journal record's `note` (author detail: `so-journal`, never player copy).
- Model input: none (the evidence string and every prompt are byte-identical; only journal detail changes).

**Tests:** `src/runtime/heldEvidenceCut.test.ts` (typed read of a long source records the length, a short one does not;
rating and commitment holds on cut evidence name the cut and the message; a short source and an LLM-read hold never
do). `heldJournal`, `judge/extraction`, `ratingGuard`, `commitHoldReason` suites green unchanged.

**Gates** (one run for all three items, worktree `worktree-agent-adc7c17ca7267180d`, base master `795948c2`, node_modules
junctioned): `ST_ROOT=C:/dev/SillyTavern-MainBranch npm run gates -- --no-storybook` -> **all green**: typecheck,
typecheck:test, lint, test (525 suites passed, 1 skipped; 6355 tests passed, 1 skipped), build, build:dev, test:debug
961/961, debug:typecheck, test:release 94 pass 2 skipped, test:replay 32 of 32 KILLED, test:plugin 89 pass 3 skipped.
`test-storybook:ci` skipped by the flag; not run by hand because no component or story changed. Prod `dist/index.js`
1,201,122 B (budget 1,250,000 B).

**Live: NOT run** (no ST checks while the user playtests). Owed (16-test-plan row "02 C11-F1a"): `so-journal.mts show`
on a seeded held judge-typed reading with a long source.
