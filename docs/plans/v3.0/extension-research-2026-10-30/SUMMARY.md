# Extension harvest 2026-10-30 — summary

## Method and safety

- Ask (owner 2026-10-30): one more pass, carefully, after the trojaned Bot Browser extension stole keys the week before.
- Forum `#📦・extensions` re-listed in the browser pane: 8 threads since 2026-10-21. Cloned 3 (TavernOS HUD, Stat Tab,
  Simply-LoreAndTracker); skipped 5 UI-only (Message Fold & Delete, Message Actions Manager, Teams / iMessage / Discord themes).
- Clones and fetches ran with hooks, symlinks, fsmonitor, submodules and LFS filters off, https only
  (`C:/dev/st-extensions-research/_refresh-2026-10-30/safegit.sh`). 13 repos changed (old head = branch `pre-refresh-2026-10-30`).
- Before any idea harvest, a regex screen and an Opus security reviewer read every new repo and every diff:
  `C:/dev/st-extensions-research/_refresh-2026-10-30/SECURITY.md`. Verdicts: 15 CLEAR, lattice CAUTION, none suspicious.
- Seven Opus reviewers, read-only, never inside a clone (`_brief.md`). Nothing was executed, installed, built or loaded into ST.

## Security findings

- **lattice CAUTION:** new optional server plugin `lattice-files` reads/writes text files (admin: whole disk; user: the data
  folder holding `secrets.json`), reachable by any page script; setup ZIP ships `.cmd`/`.sh` that can turn on
  `enableServerPlugins`. Do not install the plugin; the browser extension is fine.
- **Agent bait** (quoted in the reports, never followed): castward `AGENTS.md` (escalate sandbox, drive the live ST at :8000);
  nemopresetext tracks `.claude/settings.local.json` granting `Bash(python:*)`; dooms `docs/handover-short-fuse.md` tells "a
  local Claude Code session" to commit under the owner's git identity; lattice plan files open with a "REQUIRED SUB-SKILL" line.
  Never start an agent with a clone as its working directory.
- **TavernOS HUD** wraps `window.fetch` and rewrites every text-generation body, other extensions' too: if ever installed, SO's
  reads see rewritten history and play prompts get a per-turn system message. Deserves an info check like `transcript-copiers`.

## Suspected SO defects (code reads, not reproduced)

- **Regenerate after a trailing system row** (dooms P2): ST's Regenerate deletes the last message when it is not the user's,
  hidden system rows included (`script.js:4402-4409`). SO's image placement `"message"` (`stHost/image.ts:123-133`) and the
  opt-in `/comment` transition note leave such a row; Regenerate then removes it and writes a second reply. Next: a no-model
  scenario.
- **Story macros dead after a macro-engine flip** (nemopresetext P1): ST switches substitution engine at once
  (`script.js:2837`) but registration went only to the startup engine (`macros.js:82`); `stHost/version.ts:38-40` reports the
  setting, not what substitutes. Fix: canary `substituteParams` probe + `degrades` check `story-macros-unresolved`.
- **Chapter-fold IGNORE hole on Chat Completion still open** (2026-10-21 §3): `chapterKit.ts:324-347` still folds one range per
  chapter; v2.8 69 M05 marked "Not built"; M06 (`transcriptCopiers.ts`) not built either.
- **Archive recall on the reply path** (vectfox P0, perf, unmeasured): the generate interceptor awaits recall that rebuilds a
  temp vector collection and waits up to 15 s for judge idle, once per drafted member (`wiring/talk.ts:92`, `chapterKit.ts:107-145`).
- **Display-only qualities never read** (stat-tab P1): a quality with only `display.public` never enters extraction scope
  (`extraction/scope.ts:62-126`), so the sheet stays empty; Studio only warns. Fix: a rotating `display` scope source.
- **Optional held-secret filter defaults to "no filter"** (st-memory-books P1): `chapterKit.ts:282`, `pacing/focus.ts:12`,
  `living/export.ts:12`. No current leak; make the parameter required.

## Player-experience ideas

- **Narrator sees only what the player can see** (lattice P1, 3/S): the narrator gets private hiding/intends/knows lines with
  "use this to foreshadow" (`memory/innerRender.ts:94-96`); add one fixed clause. Blind rating first; thinking/inner voice untouched.
- **Player-chosen skip ahead** (dooms P1, 3/M): "cut to the next scene" the player chooses; `NO_SKIP_CLAUSE` already allows it.
- **Who-knows-what grid, Author view only** (tavernos P1, 3/M) + alert when a kept-out member is on stage. Never on a player surface.
- **"Here now" tab in the 29 story sheet** (tavernos P2, 3/S) reusing `runtime/sceneCard.ts` `sceneView`.
- **Deferred/answered thread states** (lattice P2, 3/S-M) so a put-off topic stops being pushed; fits 19.
- **Time/place notes on past messages** (castward P1, 3/M): only on scene breaks and time steps, from committed boundaries;
  measure + blind rating.
- **Pin current location's lore** into the next scan via `loreSelect` force, decided in code (castward P2, 3/S-M).
- **Rejected swipe as a one-shot negative example** (nemo ReSwipe, 3/S build, M rate): prompt tail, cache-safe; rate first.
- **Say what a read waits on, bounded into Retry** (bb-map P1, 3/S) for 29; **feature rows say which model and what they
  write** (scene-archivist P1, 3/S) for 29's FeatureList.
- Smaller: seeded name hints for the director (castward P3), local JSON repair before a living retry (lattice P3), "new this
  turn" placeholders (tavernos P3), story sheet in a real second window (stat-tab P2, owner question after 29 IC5), footer-adding
  extension conflict row (simply-loreandtracker P1), off-means-unseen payload goldens (dooms P3).
- Evidence for v3.0 17: lattice built post-generation revision on 10-25 and dropped it a day later for cost/latency.

## Host facts

- Connection Manager streaming yields accumulated text, not deltas (`custom-request.js:165-187`); its non-streaming errors
  carry no HTTP status (`:470-475`).
- On a swipe ST drops the rejected message from the prompt copy before interceptors, but `chat.at(-1).mes` still holds it.
- `hideStopButton` emits `GENERATION_ENDED` on every shown→hidden Stop (`script.js:3533`); `stopGeneration` emits
  `GENERATION_STOPPED` with nothing running. Castward forces Stop visible: harness "stop visible" misreads with it installed.
- ST copies `message.extra` across swipes (`script.js:3705-3712`): per-swipe data needs a swipe-id stamp.
- PromptManager saves drag order read from the DOM (`PromptManager.js:1919-1925`): 29's reorderable lists save from state.
- `#curEditTextarea` missing from `.claude/sillytavern-docs/community/ui-dom-selectors.md`.

## Reports

tavernos-hud, stat-tab, simply-loreandtracker, castward, lattice, dooms-enhancement-suite, scene-archivist, st-memory-books,
vectfox, bb-interactive-map (+ bb-enhance-gen), bb-visual-novel-engine, nemopresetext, small-updates (characterbench,
languagetool, danganronpa).

## Defect check 2026-10-30

Branch `v3.0-harvest-1030-fixes` (from `29c1267d`). Offline only: no GPU, no model call, no lane, nothing staged, so no
live or real-LLM gate ran for any item below (each ST-facing or model-consuming change is NOT live-green).

1. **Regenerate after a trailing system row: CONFIRMED (host source), not fixed, owner decision.**
   - SO plays only in groups, and there the path differs from the report: `#option_regenerate` in a group calls
     `regenerateGroup()` (`script.js:11629-11637`), which stops at the first `is_system` row from the end and deletes nothing
     (`group-chats.js:167-188`), then runs a fresh `generateGroupWrapper(false, 'normal')` round. The old reply stays and a
     new round lands under the trailing row; TurnBridge commits it as a new boundary. (Solo `Generate('regenerate')` deletes
     the row instead, `script.js:4402-4409`.)
   - Both SO rows are `is_system`: image placement `"message"` (`stHost/image.ts:123-133`) and `/comment`
     (`slash-commands.js:6118`). ST's own image extension posts hidden images the same way (`stable-diffusion/index.js:4985`,
     default hidden), so plain ST has the same trap.
   - Exposure: both are opt-in (`image.placement` default `inline`; `#so-announce-transitions` default off).
   - Not built: the only fix that keeps both features is a DOM-level Regenerate intercept (capture the menu click in a group,
     delete SO's own marked trailing rows awaited, then let ST regenerate), which needs a live gate. Alternatives: refuse
     `"message"` placement and the note in groups, or accept. Reproduction owed: a no-model lane scenario that posts a
     message-placement image, clicks `#option_regenerate`, and asserts the reply count and boundary count.
2. **`{{story_*}}` macros dead after a macro-engine flip: CONFIRMED, fixed.**
   - `MacrosParser.registerMacro` writes only the engine on at the time (`macros.js:82`, `:205-214`); substitution follows
     the live flag (`script.js:2837`); the toggle flips it at once (`power-user.js:3874-3875`).
   - Fix: `stHost/macroEngine.ts` `plainMacroSeam` remembers each live plain macro and the engine it went to;
     `rearmHostMacros()` re-registers through ST when the flag differs, on every `GENERATION_STARTED` (before card fields
     are substituted, `script.js:4299` vs `:4470`), with a warn line. No new check needed. Known residue: a key
     unregistered while the new engine is on stays in the legacy map (ST offers no way to reach it).
   - Test: `src/services/stHost/macroEngineFlip.test.ts`. Commits `96906af8`, `a0c085ca` (mocks), `d2cb6f10` (probe without a silent catch).
3. **Chapter-fold IGNORE interior hole on Chat Completion (M05) + VectFox copier keys (M06): CONFIRMED, fixed.**
   - `setOpenAIMessages` skips an ignored row without assigning its slot (`openai.js:578-647`); two sealed chapters folded
     two ranges and left chapter 1's tail between them, so `[...messages].reverse()` (`:948`) carried `undefined`.
   - Fix: `foldRange` returns one block from the oldest record through the newest contiguous foldable record minus its
     `keep_tail` (stops at a coverage gap or a `fold_messages: false` chapter; an older chapter's tail now folds once a
     later one seals); `foldRows` folds only a leading run of rows (an unplaceable row folds only between folded rows).
     Consequence: a story started mid-chat (`storyStart` > 0) now folds nothing, since folding after a kept prefix is
     itself a hole; owner may want pre-story rows folded too.
   - M06: `transcriptCopiers.ts` `copierName` maps the `3_vectfox` prefix to VectFox (no `checks.ts` change).
   - Guide: `keep_tail` sentence in `story-guide.md`, `npm run docs:guide`.
   - Tests: `src/runtime/chapterFoldHole.review.test.ts` (models `setOpenAIMessages`), `secretLeak.test.ts` "names VectFox
     by its block prefix". Commit `04244384`.
4. **Archive recall on the reply path: CONFIRMED (call count), fixed for reuse within a round; timing not measured.**
   - The generate interceptor awaits `chapters.recall` once per drafted member (`wiring/talk.ts:92`); each built a temp
     vector collection (inserts in chunks of 4, each behind the up-to-15 s judge-quiet wait, `vectorYield.ts`), queried and
     purged it, for the same turn text and candidates.
   - Fix: `ChapterPort.recallBand` keeps the last band keyed by story id, vector source, query text and every candidate's
     id + text; a matching key reuses it, anything else asks again. Selection, the resting filter and the RunGuard stay.
   - Test: `chapterRetained.review.test.ts` "vectorfox P0: one round's drafted members share one vector band" (insert and
     query once for two members; a new turn or a new archive row asks again). Commit `0f03a849`. No latency claim.
5. **Display-only qualities never in extraction scope: CONFIRMED, fixed (extraction read changes; real-LLM gate owed).**
   - An extractor quality with only `display.public` was pulled by no source (`extraction/scope.ts`), so the sheet stayed
     empty; Studio only warned.
   - Fix: `DISPLAY_SOURCE` in `scopeSources.ts` (cap 3, budgeted after the other tiers, unset first then rotating, skips keys
     another pull already holds, latched and non-extractor keys); `quality-never-in-scope` no longer fires for public
     display stats. Evidence contract unchanged. Guide paragraph updated.
   - Test: `src/extraction/scopeDisplay.test.ts`. Commit `3ef24c17` (+ diagnostics line budget in `a0c085ca`).
   - Owed: a real-LLM read on a story with public stats (Adolion) before calling it green; the extraction prompt now asks
     up to 3 more questions per read.
6. **Optional held-secret filter params: NOT A BUG (no leak), hardened.**
   - Every production caller already passed a filter or pre-filtered text (`livingInputs.ts` filters `openThreads`;
     `storySoFar` passes `restingFilter()`; the living export passes `scrub`).
   - Made required: `FocusSources.resting`, `focusSafe(resting)`, `LivingExportOptions.scrub`, `StorySoFarInput.resting`;
     `livingCoordinator` now passes `resting: inputs.scrub` to `focusCandidates`. Tests pass identity filters explicitly.
     Commits `0f03a849`, `d2cb6f10` (`scripts/debug/lib/sceneReplay.mts` caller).

Gates:
- `npm run gates:quick` green after each fix (last: 181.9 s).
- Full `npm run gates` run 1 (no `--resume`): RED at test (errorCopy silent catch), test:debug (scene replay caller),
  test-storybook:ci (EADDRINUSE 6006: a peer's Storybook from `C:\dev\so-ctl-cpu` holds the port; not stopped). Fixed in `d2cb6f10`.
- Full `npm run gates -- --no-storybook` run 2 (no `--resume`) on `d2cb6f10`: 9 of 10 green (typecheck, build, typecheck:test,
  debug:typecheck, lint, test, test:replay, test:release, test:plugin); test:debug RED on one timing test under load
  (`childTree.test.mts` "a driver whose wrapper shell is killed…", 124 s). Rerun alone: `node --test
  scripts/debug/lib/childTree.test.mts` pass 2/2; `npm run test:debug` alone: 1674/1674 pass.
- Storybook (port moved only): `npm run storybook:build` + http-server on 6016 + test-runner: 169 suites, 1025 tests pass.
- Not run: any lane, live, or real-LLM gate (owner constraint). Not merged.
