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

## Review 2026-10-03

Applied: K1, K2 (C2-K1), F34 (with and without held secrets), A5 (C1 deterministic; C12/C13 owners), F17 (owners for
C14 and C11), Sol split items 2 (owed real rows → v2.8 01 §A), 3 (C11 per item: F1 display half here, the rest
v2.8 01), 4 (C13 exact promotion here, digest/prompt v2.8 01), 5 (C14 picker + table here, enlarged inputs keep a
real-model row), the Claude-A note "C14 is missing from 02" (added), F15 (tiers per row), B12/F36 (references).

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
