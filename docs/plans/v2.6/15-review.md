# v2.6 plan 15 — review fixes

## Review fixes CR-J (harness plugin, agent bridge, judge plugin) — 2026-09-30

Scope: the CR-J findings on the harness plugin (`server-plugin/story-orchestrator-harness`), the agent tool bridge, the judge plugin (`server-plugin/story-orchestrator-judge`) and their page-side seams. User decisions that bound the fixes: the harness scope for v2.6 is **opencode only**, judge uses default **on**, keys are read **server-side only**. CR-J3 (the judge privacy notice gating egress) is **not touched**: user decision pending.

Rule followed: every finding fixed, each fix with a test that failed first. "Failed first" was proven by running the new tests against the pre-fix sources (`e76eff73`): the three plugin test files against a `git archive` copy of `server-plugin/` (18 failing, every new CR-J test), and the jest files with the fixed `src/` files checked out at `e76eff73` (16 failing + the new `pluginVersionCheck` suite failing to run).

| Finding | Fix | Test (failed first) |
|---|---|---|
| CR-J1 route rejection crashes ST | `guardRoute` wraps every route in both plugins (500 only if headers not sent, logged); `readTextBody` catches a stream error → 400; `execute` catches owned-home/fs errors → `config`; bridge `open` moved every fs step into `try`, closes the home and frees the slot on failure | `plugin.test.mjs` "CR-J1" ×3 (aborted stream on all 7 routes, throw/reject → 500, failing owned-home write); `agent.test.mjs` "CR-J1"; judge `plugin.test.mjs` "CR-J1" ×2 |
| CR-J2 `rmSync` no retries, `removed:false` ignored | `RM_RETRY {maxRetries:10, retryDelay:100}` on every removal; a home that stays is counted (`leakedHomes`, in the status row) and logged; `sweepCalls(tmpRoot)` at service start; tests poll with `until()` | `plugin.test.mjs` "CR-J2"; `agent.test.mjs`/`plugin.test.mjs` one-shot asserts → `until()` |
| CR-J4 key rule fails open | `userAccountsEnabled` returns **true** (accounts on: per-user ST secrets only) when `util.js` or `getConfigValue` cannot be read, and logs it once | judge `plugin.test.mjs` "CR-J4"; existing judge tests now pass `accountsEnabled: false` explicitly |
| CR-J5 install + version check | `npm run plugins:install` (`scripts/plugin-install.mjs` over `scripts/lib/pluginInstall.mjs`): idempotent (matching files left alone), reports installed vs source version, refuses a downgrade without `--force`, `--check` is read-only. Plugins bumped (judge 1.3.0, harness 1.1.0); `src/utils/pluginVersions.ts` holds the bundle's expected versions; a lazy startup check (`runtime/pluginVersionCheck.ts` + `…Host.ts`) reads `/status`, toasts and journals (`status` record) a mismatch; the capability rows (settings panel) carry the same sentence | `scripts/lib/pluginInstall.test.mjs`; `runtime/pluginVersionCheck.test.ts` (incl. pins the expected versions to `server-plugin/*/package.json` and `PLUGIN_VERSION`) |
| CR-J6 hold invisible, needs restart | status row `blocked`; `probeHarness` → `config` on `blocked` and on `cacheWarm === false`; the hold stores the real login's hash and re-arms when a fresh login replaces it | `plugin.test.mjs` "CR-J6"; `harness.test.ts` "CR-J6"; `harnessRouting.test.ts` "CR-J6" |
| CR-J7 silent local fallback in the wizard | `resolveAgentHarness` returns `{refusal}` when `authoring` is routed to a harness that cannot serve it (status down, not listed, held, no bridge, model unlisted); `harnessRoute` throws it as `AgentRouteUnavailable`, which the wizard shows; `createAgentRunner` never memoizes a refusal; dead `.catch` removed | `agentHost.test.ts` "CR-J7"; `bridge.test.ts` "CR-J7" |
| CR-J8 busy trips breaker | `busy` is a `ModelFailureKind` and its own `FailureClass` (no trip, no fallback; a probe reads it as alive) | `harness.test.ts` "CR-J8"; `harnessRouting.test.ts` "CR-J8" |
| CR-J9 owned home copies every credential | opencode's owned `auth.json` holds only the routed model's provider entry, and only if `type: oauth`; `copyBefore` hash for the rewrite check | `plugin.test.mjs` "CR-J9" |
| CR-J10 failing fallback unrecorded | `answerFallback` records the failure on the fallback route with `fallbackFrom`, then rethrows | `harnessRouting.test.ts` "CR-J10" |
| CR-J11 text + finish + error = failure | answer is `ok` when text and a finish are present; errors ride as `warnings` | `plugin.test.mjs` "CR-J11" |
| CR-J12 judge errors unclassified | `JudgePluginError(status)`; 504 → `timeout`, 409 → `unavailable`, 401 → new fallback `auth` (metered as never sent) | `judge/pluginErrors.test.ts`; `judge.review.test.ts` "CR-J12" |
| CR-J13 CSRF 403 read as admin-only | only the plugin's JSON `{error}` 403 is `config` (with its own words); any other 403 is `transport` with `STALE_PAGE_REFUSAL`; same in the bridge client | `harness.test.ts` "CR-J13"; `harnessBridge.test.ts` "CR-J13" |
| CR-J14 `inFlight` keyed by requestId | keyed `${user}\|${requestId}` | `plugin.test.mjs` "CR-J14" |
| CR-J15 telemetry note after await unowned | `createModelCallVia` mints a token before the await (manager passes its `RunOwnership`); `recordCall` checks it before every record, fallback notes included; census row `modelCallCore.ts#createModelCallVia.call` = checked. `modelCall.ts`/`modelCallLog.ts` untouched (CR-E14 is another agent's) | `harnessRouting.test.ts` "CR-J15" |
| CR-J16 foreign tool on the last line | `finishRun` scans the whole stdout for non-`so_` tool events before filtering → `refused` | `agent.test.mjs` "CR-J16" |
| CR-J17 opencode only | the probe and `/status` run `--version` only for offered harnesses; unoffered rows say "not offered"; `complete` refuses unoffered claude/codex | `plugin.test.mjs` "CR-J17" |
| CR-J18 bridge outside the concurrency gate | `gate.tryAcquire` reserves the harness slot synchronously before the first await in `open`; the session holds it until teardown; a replaced session frees its slot first | `agent.test.mjs` "CR-J18" |
| CR-J19 every provider checked for staleness | `loginFreshness(..., {providers})`: a call checks its model's provider, status checks the configured models' providers | `plugin.test.mjs` "CR-J19" |
| CR-J20 malformed config silent | `loadConfig` logs a parse/read error (not a missing file) | `plugin.test.mjs` "CR-J20" |
| CR-J21 flaky asserts | wall-clock bound 1 s → 5 s; `delete process.env.TYPESAFE_BASE_URL` at the top of the judge test | `test:plugin` ×5 green |
| CR-J22 probe falls back to TypeSafe | `transportFor` returns null for a provider with no transport; `probe` answers `unavailable` and sends nothing | `judgeProviderRouting.test.ts` "CR-J22" |

Ledgers: `test/findings/ownership-sites.json` +1 row (CR-J15); `test/findings/errorCopy.json` — the removed `agentHost` `.catch` row replaced by `agentHarnessRefusal` (author surface), `harness.ts#pluginRefusal` and `pluginVersionCheck.ts#checkPluginVersions` (probe catches).

Not done here, by instruction: the plugins were NOT installed into the live ST (`node scripts/plugin-install.mjs --check` read-only: live judge 1.1.0 → 1.3.0 upgrade, harness not installed). The lead runs `npm run plugins:install` and restarts ST; until then the startup check warns about the judge plugin version. No live/LLM gate run (no real CLI or model calls by instruction) — the live harness rows stay owed to the final suite.

### Gate record

- `npm run typecheck` ✓, `npm run typecheck:test` ✓, `npm run lint` ✓
- `npm test`: 376 suites passed, 1 skipped; 4956 tests passed, 1 skipped
- `npm run build` ✓ — main bundle `dist/index.js` 1,216,156 B (≤ 1,250,000); new client code (startup check, harness/bridge seams) is lazy
- `npm run build:dev` ✓
- `npm run test:debug`: 480/480
- `npm run test:release`: 77 pass, 0 fail, 2 skipped (from Git Bash; from PowerShell `bash` resolves to WSL and `UP: clean-host.sh keeps a pre-release suffix` fails on the environment, unrelated)
- `npm run test:replay`: 30 of 30 killed
- `npm run test:plugin` ×5: 73 pass, 0 fail each run
- Storybook: not run — no `.tsx` changed (the refusal reaches the existing wizard error line)

## Review fixes CR-E

Engine, runtime and memory findings from the plan 15 review (master `e76eff73`), fixed 2026-09-30/10-01 in worktree `agent-a81ceb8cb64fe9382`. Every fix has a test that failed first (red evidence below), then passed. No lanes, no model calls.

| Finding | Fix | Red → green test |
|---|---|---|
| CR-E1 deferred seal read a later boundary | `SealAt` (now in `chapterPort.ts`) carries `pathLength`, `path`, `activeCheckpointId` and a blackboard snapshot; `boundaryWork` builds it with `sealAtState(getEngineState(), …)` at the boundary; `ChapterSeal.run` never calls `getState()` (blackboardAt, visited, bridge's next chapter, title card all from `at`). The jump confirm passes the target as `activeCheckpointId`. | `chapterSeal.review.test.ts` "takes the blackboard, the checkpoint entered and the path from `at`" (red: blackboardAt/announce came from the later state) |
| CR-E2 C4 staging lost after `ROLLBACK_HORIZON` | `EngineState.stagedFrom?` (path index of the last manual activation): set by `activateCheckpoint`, serialized only when set, restored by hydrate/rollback/step-back, remapped by `repairActiveCheckpoint` and `pruneEngineState` (`keptStagedFrom`); malformed → unstaged (`validStagedFrom`). It rides every snapshot and `history.base`. `stagedPath(path, stagedFrom)` replaces the boundary-log lookup. Blob stays v6; `isCurrentRecord` unchanged. | `stagedFrom.review.test.ts` (red 3/5 on the log lookup: >200 boundaries, reopen, rollback inside the window) |
| CR-E3 only `/cp activate` confirmed | `RuntimeManager.activateCheckpoint` runs `confirmChapterJump` itself, so `index.tsx` advance, `SchedulerTab` alternate and `/cp activate` all get it; cancel sets status "Jump cancelled." and returns false. `/cp activate` is one call. | `jumpRelease.review.test.ts` "the manager itself asks, and a cancel jumps nowhere" (red: no popup) |
| CR-E4 skip written after activation | the skip (`{pathLength: path+1, messageId}`) is written after the staging release and immediately before `engine.activateCheckpoint`, so onEnter `/sendas` boundaries see it | `jumpRelease.review.test.ts` "the skip marker is already in memory when the target's onEnter effects run" (red: null at apply) |
| CR-E5 unseal kept the raised watermark | `unsealedView` lowers `shortTermSummaryEnd` to `min(current, range.from - 1)` from the record's `chapter_seal` derived range (the `reverseMemoryState` rule) | `chapterSeal.review.test.ts` "lowers the short-term watermark…" (red: 10, expected -1) |
| CR-E6 opener assumed at gate+1 | `fireOnEnter` captures `lastMessageId()` before firing; `first = max(gate, before) + 1` | `onEnterRollback.review.test.ts` "CR-E6: another member's reply at gate+1…" (red: first 6, expected 7) |
| CR-E7 rollback awaited the kit unchecked | `RollbackDeps.ownership`; a `RunToken` brackets the kit load, a lapse returns noop, extras are read after the check. Census note on `rollbackOnce` updated. | `rollbackKit.review.test.ts` (red: journal/memory/stagecraft/persist ran in the switched chat) |
| CR-E8 reseal could lose the record | `reseal` seals through a view unit whose `memory()` is the unsealed view of the live state until the swap; nothing is patched before `commitSeal`, which writes chapters, entries, arcs, derived and chronicle in one patch. Census row `ChapterSeal.reseal` (local). | `chapterSeal.review.test.ts` "a re-seal whose run lapses leaves the old record…" (red) + control (one `chapter_seal` row) |
| CR-E9 property test | generator gains arcs (open/resolve), seal policies carry/decide/close with carry/closed-offscreen/abandoned dispositions, era merges, bridge commits, recap marks and seal skips; compares the full arc view, records, eras, pending bridge and the skip; beats two-sided (exception: a beat the full run's ring cap already evicted). It found two defects (below). Plan 07 gate record corrected. | `rollbackReplay.property.test.ts` (red: 17 of 20 before the fixes) |
| CR-E9 defect 1: bridge / recap not reversible | `chapterBridge` and `chapterRecapSeen` are gone; each record carries `bridge {text, committedAt?}` and `recapSeenAt?`, stamped with the chat's last message (`commitRecordBridge`, `markRecapSeen`); `unfoldAt` rewinds marks at/after the cut (`rewindRecordMarks`); the pending bridge is the newest record's uncommitted one (`pendingBridge`). An overwritten bridge and a re-seal's recap are therefore exact under rollback (this also covers CR-E15's recap item). | same |
| CR-E9 defect 2: an overwritten seal skip was lost | `chapterSealSkip` is a capped chain (`previous`, depth 8, `pushSealSkip`); a rollback walks back to the newest mark before the cut | same; `chapterJump.test.ts` chained case |
| CR-E10 shallow blob read | `sanitizeChapterRecord` validates every field: required id/chapterId/summary/short/provenance/range/boundaries/sealedAt.{boundary,messageId,pathLength}; `people`/`open`/`consequences` default `[]` when absent, row dropped when present and malformed; `playerTitle` defaults to title; bridge/recap marks kept only well formed. `sanitizeInnerBeats` validates each beat; the skip chain is validated link by link. | `extrasChapters.review.test.ts` (red 3/3 against HEAD `extras.ts`) |
| CR-E11 era stamp | `eraMessageId(records)` = max `sealedAt.messageId` of the records present when the merge runs (the seal that triggered it). Deliberate reading: stamping only the merged records' max let a rollback that removed the triggering seal keep the era, which the property test showed is not replay. | `chapterSeal.review.test.ts` "is the max sealedAt.messageId…" (red: 99, the later boundary) |
| CR-E12 guard | `classFieldOrder.guard.test.ts` rewritten on the TypeScript AST: flags, in instance field initializers, `this.<method>(` calls and reads of parameter properties or fields the constructor body assigns; arrow/function/class expressions are deferral. The tree is clean. | planted cases (red: method call and ctor-assigned field not flagged by the regex guard) |
| CR-E13 numbering | `chapterListText`, `/story chapter <n>` (`recordsForChapter`, all parts of chapter n) and the chronicle export use `chapterNumber` | `chapterSeal.review.test.ts` "one chapter numbering everywhere" (red) |
| CR-E14 model-call log | `ModelCallDeps.stamp` stamps `chatId` + newest message at call start; `recordModelCall` keeps a row only for the loaded chat (`acceptModelCall`); rollback drops rows asked at/after the cut (`rollbackModelCalls`). Census row `createModelCallVia.call` (partial). | `modelCallChat.review.test.ts` (red 3/3), `rollbackKit.review.test.ts` control |
| CR-E15 | one `storyEnded` (`chapterPort.ts`; `chapters.ts` imports it); recap seen is per record now (see defect 1), so an unfolded record takes its mark with it; `buildRecord`'s `_story` param removed | covered above |

### Gates (2026-10-01)

| Command | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run typecheck:test` | clean |
| `npm run lint` | clean |
| `npm test` | 379 suites passed, 1 skipped; 4961 passed, 1 skipped |
| `npm run build` | ok, bundle `55f501459f8b`, main entry **1,219,538 B** (budget 1,250,000) |
| `npm run build:dev` | ok, bundle `b9c99322e708` |
| `npm run test:debug` | 476/476 |
| `npm run test:release` | 77 pass, 2 skipped, 0 fail |
| `npm run test:replay` | 30 of 30 killed |

No UI file changed, so no Storybook run. No live gate (rule 13: no lanes, no model).

## Review fixes CR-P (plans and test infrastructure, 2026-10-01)

Scope: the plan set's status and wording against the current truth (W26–W30), and the test infrastructure the plans
cite. CR-P10 is handled with CR-J22 by another agent and is not repeated here. No lane and no model call was used.

Current truth written into the plans:
- Plan 14 is executed by Claude (plan 15 Part B) and reviewed with the user on 2026-10-01; the user's own sessions are
  optional and later (**W26**, overview rule 6 amended).
- Harness: opencode only, no CLI logins (**W27**).
- Artemis on RunPod is the main model; DeepSeek runs the orchestrator passes (**W28**).
- Every review finding is fixed immediately (**W29**).
- The A11 wizard premises are chosen (**W30**).
- English only (W25).

| Id | Finding | Fix | Evidence |
|---|---|---|---|
| CR-P5 | `defect-replay-report.json` said 25 rows, the specs say 30; `decisions.mjs` hard-coded "25/25" and "342 files"; `pendingDecision` (extractor6–20) was stale | Re-ran `npm run test:replay -- --out test/findings/defect-replay-report.json` (**30 of 30 killed**) and committed the report. `decisions.mjs` derives the replay line from the report (killed/mutants, report date, spec count, and says STALE when they disagree) and the jest line from the inventory (file count, summed seconds). `pendingDecision` dropped from `suite-decisions.json` and its branch from `suiteDecisions.mjs` (no extractor fixture carries a vacuous needle any more). `13-decisions.md`, `13-inventory.md`, `13-final-suite.md` regenerated | `scripts/suite/decisions.mjs`, `scripts/lib/suiteDecisions.mjs` (+ test), `test/findings/defect-replay-report.json` |
| CR-P6 | Chapter surfaces missing from the player-clean sweep and the spoiler checklist | Ten rows added to the v2.1 spoiler checklist (player: "Your story", title card, "Previously…" popup, `/story chapters|chapter|chronicle` + macros, pipeline `complete`; both: chapter settings; author: Chapters panel, Studio Chapters editor and lanes, the story-so-far/bridge/returning prompt content, `/cp chapters|seal|unseal` and the jump confirm), plus the sweep's selectors and forbidden text (record ids, `degraded`/`author-edited`, `[src:`, OPEN dispositions). The `so-ui` selectors are another agent's change | `docs/plans/v2.1/test-plan.md` §Spoiler checklist |
| CR-P7 | The Q-M6 test rendered twice and sealed nothing | Removed from `memory/chapters.test.ts`; the new case drives the real `ChapterSeal` four times (arrival, camp, siege, final) and asserts chapter 1's record, SUMMARY included, is byte-identical | `src/runtime/chapterSaga.test.ts` "chronicle drift across later seals (v2.6 plan 07 Q-M6)" |
| CR-P8 | Plan 07 tasks 12, 13, 15, 17, 18 had no dedicated test | One describe each: story-so-far (composition; key/depth, off, paused), bridge (text; spent only on a rendered reply; withheld on quiet/impersonate), dossiers (history; re-enabled after the last seal, window), the interceptor fold (folded/kept/missing on copies; quiet, impersonate, fold off, block missing), endings (epilogue, bridge cleared, view ended, no seal after, export, pipeline `complete`, boundary work only compacts). Plan 07's gate table cites them | `src/runtime/chapterSaga.test.ts` (12 cases); `07-chapters-and-saga-memory.md` §What was built |
| CR-P9 | Plan 11 docs stale: harness route built, 28 edit tools not 24 | Status, A4, task 3, gate record and recipes updated (bridge.ts, opencode); tool count 28 with the four later tools named; `loop.test.ts` case renamed to "refuses the harness route when the plugin offers no transport, and never falls back to the local profile" | `11-agentic-wizard.md`, `src/copilot/agent/loop.test.ts` |
| CR-P11 | Plan status headers stale (03, 06, 11, 12, 00) and the CLAUDE.md row; plan 04 lines 10, 268, 391 | Every v2.6 header now states its real state (01, 03, 04, 06, 07, 09, 10, 11, 12, 13, 14 and 00); overview §Status is one row per plan (00–15); CLAUDE.md row covers plans 00–15 and Part A/Part B; plan 04's H row (built, opencode only), the C3/C4/C12/C13 evidence row (built after approval) and the Claude-login open item (dropped) fixed | `00-overview.md` §Status, `.claude/CLAUDE.md` |
| CR-P12 | Who plays, and when, disagreed across overview rule 6, plan 10 and plan 14 | Rule 6 rewritten ("Claude plays, the user reviews") and recorded as **W26**; plan 10 (title, status, change 0 and 5, the pack and sessions sections, verdict) and plan 14 (status, a "Who plays" block, rule 2) point to plan 15 Part B; plan 09 status and configuration line too | `00-overview.md` rule 6 + W26, `10-acceptance.md`, `14-tiered-testing.md`, `09-integration.md` |
| CR-P13 | Logins still asked for | Opencode only, no logins, everywhere: overview rule 6, the parallelism line, U2; plan 14 T6-3 and "Before T0"; the T6-3 card note (the driver agent's card fixes on master carry the same wording and were kept at the merge); plan 04; plan 02-audit's H row; recorded as **W27** | `00-overview.md`, `14-tiered-testing.md`, `test/sessions/charters.json`, `14-cards.md` |
| CR-P14 / CR-P15 | Exit criteria needing human or blind ratings; the pack's timing; plan 11 W6 missing; T5's A1 inspector decision | Every such exit item reads "recorded for the user's review" (T2 Q-M, T3 C3 and C5/C6, T5 W6, T6 R4); the blind-rating pack is built from the recorded arms and goes to the joint review (overview rule 11, plan 10, plan 14 rule 8); 11 W6 added to the pack in all three; T5's "A1 inspector decision" removed (W18 decided it) and plan 10's HU-A1 row says so | `14-tiered-testing.md`, `10-acceptance.md`, `00-overview.md` rule 11 |
| CR-P16 | Plan 09 I1–I6 had no tier slot | Plan 14 T7 is now "Integration, freeze and cumulative run": I1–I6 first, before the freeze, with a runbook (adolion-fresh per run, `so-session start` on T1-1/T2-2/T7/T4-1 with the everything-on settings, the I4 storm, the I5 cuts with the profile restore, the I6 reopen check, findings into `09-findings.md`) | `14-tiered-testing.md` §T7, `09-integration.md` |
| CR-P17 | `architecture.md:89` said `judge.uses.*` all off | Now "all on by default since v2.6 rule 5" | `.claude/rules/architecture.md` |
| CR-P18 | Plans still describing per-plan live ×1 runs | Pointers to rule 13 at 06 §Gates, 07 §Gates, 04 §Gate, 05 §Gates, overview parallelism; also 11 §Gates and 12 §Gates (same wording) | those sections |
| CR-P19 | The run header did not record the campaign | `so-run-header` captures `campaign.pinCommit`/`pinBranch` (the adolion-fresh pin) and `campaign.installed.commit`/`sha256` (the lane's `adolion-fresh/inventory-latest.json`, null off an adolion-fresh lane); a missing or unreadable pin or inventory is a warning; the diff covers every field (a re-import at another commit is three blocking paths) | `scripts/debug/so-run-header.mts` `readCampaign`; `so-run-header.test.mts` (2 cases) |
| CR-P20 | Spanish remnants | `02-audit.md` rows (contradictions, lore-select, commit cases, needles, complications, curator, witness, house rules, player intent) state the English-only counts and drop the Spanish artifacts; overview J6a row (50 English lines); `12-survey.md` finding 8 (no Spanish floor; the column is history). `05-reasoning-control.md:154` was checked and holds no Spanish remnant (the live suite's `--expect-count 29` is the English fixture count) | those files |
| CR-P21 | No aggregate gate command; CI lacked `test:replay` | `npm run gates` (`scripts/release/gates.mjs`): typecheck, typecheck:test, lint, test, build, build:dev, test:debug, test:release, test:replay, test:plugin, test-storybook:ci, stopping at the first red step; `--no-storybook` / `--skip=` (an unknown step is refused). CI gains `test:replay` (`test:plugin` was already there). Rule 16 and CLAUDE.md name the command. `gates.test.mjs` pins the chain, the package scripts, CI coverage and rule 16's text | `scripts/release/gates.mjs` (+ test), `.github/workflows/ci.yml`, `scripts/release/ci.test.mjs` |
| CR-P22 | Duplicate-completion re-delivery and inner delayed-error untested; partial rows | New: extraction re-delivery through the real Extraction + Memory coordinators (fact stored once, same read id, the engine's ApplyQueue applies the duplicate once, control: two windows apply twice); stagecraft re-delivery as a second auto-accepted record (one host write, duplicate op `failed`); inner held rejection after the await; inner same-reply re-delivery (one beat); hostDeletes same deletion twice (one question, one delete). Fault matrix **102 → 106 covered, 15 → 11 partial**, 1 todo | `src/runtime/coordinators/duplicateCompletion.review.test.ts`, `stagecraftCoordinator.test.ts`, `innerCoordinator.test.ts`, `mirrorReaper.review.test.ts`; `test/findings/faultMatrix.json` |
| CR-P23 | `test:replay` ran only the named killers; the mutation baseline predated W25 | `npm run test:replay -- --full` runs the whole jest suite per mutant (baseline too; report `scope: "full"`); the default stays the named killers. The baseline sample re-ran after W25 (below) | `scripts/suite/defect-replay.mjs` `replayScope` (+ test in `suiteMutants.test.mjs`), `13-mutation-baseline.json` |
| CR-P24 | `identityVerbs.test.mts:303` waited on a real 300 ms timer; `test:release` failed from PowerShell | The branch case counts context reads instead of sleeping (it still fails if `branchCreate` stops polling). `versions.test.mjs` resolves Git Bash by path (`scripts/release/gitBash.mjs`: `GIT_BASH`, `git --exec-path`, Program Files), never the WSL `bash` PowerShell finds first; a test pins the candidate order | `scripts/debug/lib/identityVerbs.test.mts`, `scripts/release/gitBash.mjs`, `versions.test.mjs` |
| CR-P25 | `13-final-suite.md` did not say where the suite runs or restate the budget | The generator adds "Where it runs: plan 15 Part B": EUR 20 RunPod (EUR 1 margin, ≈ pod-hours at the measured pod price), DeepSeek per token outside it, lane-hours vs pod-hours at `LLM_PARALLEL` 2, whether the list ×2 fits beside the sessions, and the priority order (T0, the waiting measurements, the tier passes, I1–I6, the built rows ×2, placeholders); anything unrun is listed as "not run: budget" | `scripts/suite/decisions.mjs`, `suite-decisions.json` `partB`, `13-final-suite.md` |
| CR-P26 | `blobUnreadable.review.test.ts:124` title said v5 | Fixed in this commit (title only) | `src/runtime/blobUnreadable.review.test.ts` |
| CR-P22 follow-up | The extraction audit ring kept a re-delivered read twice | Fixed in this commit (fix(extraction): a re-delivered read appends one audit): `applyAudit` appends an audit only when no row carries its id (the id is minted once per read in `runSharedRead`, so two reads of one window stay two rows) | `src/runtime/coordinators/duplicateCompletion.review.test.ts` "the audit ring keeps one row for a re-delivered read" + control |

### Fault-matrix rows still partial (11) and todo (1), with the reason each stays

| Cell | Why it is not covered by a cheap test |
|---|---|
| memory\|afterHostWrite | The mirror's mid-sync fault is a chat change; a host write that errors halfway needs a host double for `upsertWIEntry` that fails on the n-th entry and a rollback contract for the entries already written, which does not exist yet |
| scene\|malformedResponse | A wrong-typed scene answer goes through the judge client's validation (`src/judge/`), which another agent owns this round |
| scene\|duplicateCompletion | The scene read's completion lands through `SceneCoordinator.rerun`, which has no re-delivery seam a test can drive without a judge double; covered for the injection (once) |
| lore\|malformedResponse | Same as scene: the unparseable answer is the judge client's case (judge owner) |
| expansion\|duplicateCompletion | A re-delivered chain needs the expansion cache's contract stamp and merge path in one harness; the concurrent-generation half is covered |
| persistence\|afterHostWrite | A save that fails after the host wrote part of the chat cannot be faked below `saveMetadata`, which swallows its own errors; the save evidence covers the observable half |
| effects\|delayedError | Covered except a host write that rejects after a slow await mid-apply; the ledger and refusal paths are covered |
| effects\|aborted | v2.5 C1: the stop runs inside `CHAT_CHANGED`; only a live run shows whether the populated next chat is untouched (plan 14 T4) |
| wiNormalize\|persistFailure | The lost-provenance case is a design gap (no second ledger), not a missing test |
| harnessTransport\|delayedSuccess | The caller's `RunOwnership` decides the write, and that half is the agent bridge's census row |
| agentBridge\|afterHostWrite | Re-offering a provisioning card after the draft run lapsed is not built |
| harnessTransport\|worldSwitched (todo) | The late call is recorded in the open chat's ring (telemetry); pinning that behaviour would bless it, so it waits for the owner's call on whether the ring should drop it |

### Observed while writing CR-P22 (not fixed here: product code outside this change's scope)

- **The extraction audit ring keeps a re-delivered read twice** (`ExtractionCoordinator.applyAudit` appends `audit` to
  `extras.extraction.audits` without checking its id). Nothing is applied twice (memory dedupes the window, the engine
  supersedes the covered write), so it is telemetry only, but the journal and the author's audit list show the read
  twice. Fix belongs to the extraction coordinator's owner: skip an audit whose id is already in the ring.

### Mutation baseline after W25 (CR-P23)

Same seed (20260930) and sample size (200), `node scripts/suite/mutation-baseline.mjs --sample 200 --seed 20260930 --workers 4`, after W25 and the merges up to `e76eff73`: **76.3 %** killed (142 of 186 scored; 14 timeouts, 0 crashed) in 3732 s, over a population of 5142 mutants in 124 pure files. Per dir: engine 92.5 % (37/40), memory 72.0 % (36/50), extraction 76.3 % (29/38), judge 68.6 % (35/51), talk 75.0 % (3/4), pacing 66.7 % (2/3). Before W25 (2026-09-30): 71.9 % (143 of 199, population 4469). The populations differ (new code since), so the stratified sample is a different set of mutants: the number is the new baseline, not a like-for-like delta. Recorded in `13-mutation-baseline.json`; `13-decisions.md` reads it.

### Gates

`npm run gates` in this worktree, 2026-10-01, after merging master `ec5083e9`:

| Step | Result |
|---|---|
| typecheck | ok (15.4 s) |
| typecheck:test | ok (15.3 s) |
| lint | ok (17.8 s) |
| test | ok: 384 suites passed, 1 skipped; 5009 tests passed, 1 skipped (501.9 s) |
| build | ok (54.7 s) |
| build:dev | ok (59.1 s) |
| test:debug | ok: 537 pass, 0 fail (14.5 s) |
| test:release | ok: 82 pass, 2 skipped, 0 fail (22.8 s) |
| test:replay | ok: 30 of 30 mutants killed (533.1 s) |
| test:plugin | ok: 73 pass, 3 skipped, 0 fail (10.3 s) |
| test-storybook:ci | **NOT green**: the runner reported "No tests found" (exit 1) |

The Storybook step failed before running anything. The test runner resolved its root to the main checkout (`C:\dev\story-orchestrator`, reached through this worktree's node_modules junction), so `<worktree>/src/**/*.stories.*` matched 0 files. This comes from the agent-worktree layout, not from any story. The CR-P changes touch no `.stories.tsx` and no UI component. Even so, Storybook is not green here: it must be run from a checkout with its own node_modules (or on master after merge) before anyone calls this record fully green.


## Review fixes AS (session tooling), 2026-10-01

Astra's plan-14 readiness findings AS-21..AS-29 and the tooling half of AS-11. The driver commit `28f6611b` was checked first: it closed none of these. Every fix has a node:test case (or one jest case) that failed first. Red check: the new and edited tests were run in a scratch copy against the pre-change sources (`HEAD` before this work): `sessionDigest` 7 new cases red, `st-payload` 2 red, `sessionRunbook` 2 red, `sessionLanes`/`sessionCharters` and every new module's test red at import (the exports did not exist). No lanes, no model calls, no ComfyUI.

| Finding | Fix | Test that failed first |
|---|---|---|
| AS-21 wizard agent harness | `lib/wizardAgentDrive.mts`: `so-wizard-agent --route harness` and J14.1 drive the UI's own runner (`createAgentRunner`), the UI's bridge resolver (`resolveAgentHarness`, now exposed on the dev global as `storyOrchestratorWizardAgent.resolveAgentHarness`) and `driveAgent`, wrapping the bridge to record open/tool/answer/close. `bridgeEvidenceProblems` refuses a bridged run missing any of the four. New J14.2 asserts the evidence. Opt-in `so-wizard-agent.mts bridge-check` exercises a real opencode bridge; not run here | `wizardAgentDrive.test.mts` (UI handles, bridge evidence, refusal) |
| AS-22 fail closed | `lib/sessionTails.mts`: tails write `<out>.ready` after their first poll and `<out>.drained` after one more full poll once `<out>.drain` exists (`st-payload --ack`, `so-journal follow --ack`, console tail). `start` refuses (writes `start-failed.json`, exit 2) on a missing ready ack, a blocking pin/page/run-header discrepancy or a settings mismatch. `lib/sessionStop.mts`: stop runs end export → header diff → drain → wait for drained → kill → verify; a failed diff, a missing ack, a missing JSONL or a missing required artifact marks the session INVALID and exits 1. `digest` exits 1 on an invalid session | `sessionTails.test.mts`, `sessionStop.test.mts`, `st-payload.test.mts` (ack), `sessionDigest.test.mts` (missing JSONL = invalid) |
| AS-23 evidence | `lib/sessionPageReads.mts` + `lib/sessionArtifacts.mts`: every live verb records the observed chat (`trackChat`), stop exports every chat created since `chatsBefore`, `wizard-drafts.json`, `runtime-<chatId>.json` (the whole `chat_metadata.story_orchestrator`: engine history, effect ledger, chapter store; `runtimeProblems` checks them), `transcripts.jsonl` with swipes, and each flag's context at event time (`contextFrom`). Required per-charter artifact counts (`requiredArtifacts`) are verified at stop | `sessionArtifacts.test.mts`, `sessionPageReads.test.mts`, `sessionDigest.test.mts` (event-time flag context) |
| AS-24 private-block anomaly | Payload captures carry `chatId`, `boundary`, `lastMessageId`, `draftMemberName`. The digest matches a capture only to its own chat's end state, names the member by `draftMemberName` or a same-epoch index, and reconstructs what the member held at capture time from each item's message/boundary provenance (`heldAtCapture`); anything it cannot place counts as unverifiable, never as a finding | `sessionDigest.test.mts`: cross-chat negative, acquired-later negative, unverifiable count, planted positive |
| AS-25 chapters and harvest | T4-1 now plays `adolion-saga` with `chapters {seal, storySoFar, fold}` and rubric row "rollback: chapters" (academy carries no chapters); T2-3 sets `chapters.fold`; `requiredFeatures` refuses a start whose pinned story lacks the chapters the card needs; `requiredArtifacts` requires chapter records, folded payloads and harvested reasoning (`HARVEST_HEADER`, the same header `src/memory/innerRender.ts` writes) whenever the effective settings enable them | `sessionArtifacts.test.mts`, `sessionCharters.test.mts` (AS-25) |
| AS-26 baseline settings | `test/sessions/baseline-settings.json` (versioned, judge on, images/sprites off, spikes off) + `lib/sessionBaseline.mts`: the root→card override chain is merged over the baseline, applied over the lane's settings keeping only the declared install-owned paths, read back from the page and asserted (`effectiveProblems`); recorded in `session.json`. `src/runtime/sessionBaseline.test.ts` fails when `defaultGlobalSettings` gains a leaf the baseline does not state. Per the 2026-10-01 decision there is no notice gate: the earlier acknowledge step was removed, and no `acknowledgeJudgeNotice` handle is assumed | `sessionBaseline.test.mts`, `sessionBaseline.test.ts` (jest) |
| AS-27 no-media variant | `start --media off` is the default: images and sprites stay off, ComfyUI calls in the lane log fail the session (`comfyCalls`). T3-1 asks for images/sprites but its recorded variant is no-media; its media rubric rows are written `unexercised` (a score there is refused, `rubricSummary` never counts them green). Pre-rendered sprites may still show (`mediaPlan`). `--media on` still needs `--allow-comfy` | `sessionCharters.test.mts` (AS-27), `sessionBaseline.test.mts` (mediaPlan) |
| AS-28 blind gates | `lib/ratingPack.mts`: C3 (T3-1), R4 (T6-1), Q-M (T2-1), W6 (T5-1) build paired, shuffled (seeded), unlabelled packs under `test/sessions/rating-pack/<gate>/`, with the arm key in a separate file and any human verdict preserved by pair id. `gateStatus` is always `pending`; nothing here can turn a gate green. Live verbs take `--arm`/`--gate` tags so the pairs come from recorded turns | `ratingPack.test.mts`, `sessionCharters.test.mts` (gate rows need a user reviewer) |
| AS-29 lanes | `planLanes` schedules from the transitive continuation graph across tiers (tier order, reservations `fromTier`/`untilTier`, waves); a lane holding a chat a later card continues is leased (`<lanes>/<n>/lease.json`), `adolion-fresh seed` refuses a leased lane unless `--for <dependent>` or `--break-lease`, and `so-session lane archive|restore|lease` moves `data`, `adolion-fresh` and the lease aside and back. `lane-plan.json` regenerated; `plan --check` reports drift | `sessionLanes.test.mts` (+6) |
| AS-11 tooling | `index` reads whatever commit the pin names, records per-story `features` (chapters, chapter assignments, drives, motives, member guidance) and regenerates the story index and `14-cards.md` together; `validate` reports pin, baseline and plan drift and each card whose required features the pinned story lacks; `start` refuses such a card. T1-3 declares `requires.features: ["memberGuidance"]` | `sessionCharters.test.mts` (AS-11), `sessionArtifacts.test.mts` (featureProblems) |

Deviations:

- Outside the allowed dirs: `src/index.tsx` (dev global gains `resolveAgentHarness`), `src/studio/StudioModal.tsx` (`export const WIZARD_HARNESS`), `src/runtime/sessionBaseline.test.ts` (jest, because the baseline must be checked against the real `defaultGlobalSettings`) and `test/journeys/j14-agent-wizard.journey.json` (AS-21 names J14). `WIZARD_AGENT` is kept as is: the defect-replay mutant `studio-chunk-global-outlives-stop` targets that line.
- The pin is still `5e2974b`, whose stories carry no chapters, drives, motives or member guidance, so `validate` reports 17 story-data problems and the preflight refuses the 8 cards that need them (T1-3, T2-1, T2-3, T2-5, T3-1, T3-2, T3-3, T4-1) until the pin moves (the readiness branch has the data; counting it was checked there). That refusal is the intended behaviour.
- The debug skill and `.claude/rules/debug-scripts.md` are not updated (out of scope); `14-autonomous-runbook.md` carries the new start/stop/lane behaviour.
- Not run: `bridge-check` (real opencode), any live session.

### Gates

`npm run gates` in this worktree, 2026-10-01, after merging master `ec5083e9`:

| Step | Result |
|---|---|
| typecheck | ok (13.5 s) |
| typecheck:test | ok (30.6 s) |
| lint | ok (19.5 s) |
| test | ok: 385 suites passed, 1 skipped; 5016 tests passed, 1 skipped (227.7 s) |
| build | ok (25.1 s) |
| build:dev | ok (29.1 s) |
| test:debug | ok: 591 pass, 0 fail (13.1 s) |
| test:release | ok: 82 pass, 2 skipped, 0 fail (5.2 s) |
| test:replay | ok: 30 of 30 mutants killed (296.1 s) |
| test:plugin | ok: 73 pass, 3 skipped, 0 fail (11.7 s) |
| test-storybook:ci | **NOT green**: `serve-sb` could not bind port 6006 (`EADDRINUSE`, held by another session's process, left alone) |

No `.stories.tsx` and no UI component changed here; Storybook still has to run from a checkout with the port free (or on master after merge) before this record is fully green.

## Review fixes AS (measurement) — AS-13, AS-14, AS-15 (2026-10-01)

Worktree `agent-a7a250354f7055458`, master merged at `e5f9118f` (CR-P + English judge fixtures). Rule: every finding fixed, each tool with a negative control (a planted wrong input must fail), inputs frozen before scoring. No lanes, no model calls, nothing live: every vehicle below is **built and unit-tested, not run**. The measurements themselves stay owed to Part B.

### AS-13 — measurement vehicles

| Item | Built | Negative controls (all node:test / jest, fake page) |
|---|---|---|
| 05 R4 spike code | `effects.reasoning: off\|low\|medium\|high` on a checkpoint (`engine/schema.ts`, `validate/checkpoints.ts`, unknown value refused); `runtime/spikes/reasoningEffect(+Host).ts` behind `spikes.reasoningEffect` (default off, `__SO_DEV__` dynamic import from `wiring/lore.ts`, on the dev-only list); writes loud requests only and only keys the request already carries (`samplerKeys.REASONING_OVERLAY_KEYS`, never `SAMPLER_OVERLAY_NEVER`); CC via `reasoningPayload`, custom merges `chat_template_kwargs.enable_thinking` into the request's own `custom_include_body` | `checkpointReasoning.test`, `reasoningEffect.test`, `reasoningEffectHost.test`, `samplerKeys.test`, `devOnly.guard.test` (2 planted-import controls): quiet/impersonate/dry untouched, absent key not added, disarm on checkpoint/chat/flag-off mid-checkpoint, flag off = nothing. 40 of 41 mutants killed (survivor equivalent: `delete effects.reasoning` after a validation error) |
| 05 R4 arm runner + blind pack | `so-r4-spike.mts freeze\|check\|run\|pack\|score` over `lib/r4Pack.mts` (pure) + `lib/r4Live.mts` (injected page); inputs `test/measurements/v2.6-05/r4-turns.json` (20 turns, 2 stories, placeholders, `frozenSha256`) and recipe `r4-spike.json`; pack = seeded, balanced, shuffled, unlabelled pairs (context + reply A + reply B) in `human/rating-pack/`, key sealed apart in `sealed/r4-key.json` | `r4Pack.test` (15), `r4Live.test` (7), `so-r4-spike.test` (7): arm label or `<think>` in text, all-A / alternating / unshuffled order, extra fields, seed in the pack → leak refused; edited turns or pack after sealing → score refuses; unknown/duplicate/missing rating refused; a pair whose arm key did not land is excluded (19 pairs then fail); floor both sides (12/20 pass, 11/20 fail; p95 2.00× pass, 2.01× fail) |
| 06 `intents` tier | `liveSuiteScore.mts` tier `intents` (precision ≥ 0.80, recall ≥ 0.50, playerAttributed = 0, predeclared in `b-intents.json`); 14 new fixtures `test/fixtures/extractor-intents01..14` (+ goldens): 11 claim an aim the character states, 3 claim none (two where only the player's narration implies one), with meta-commentary ("as an AI, I should…") planted in transcripts that must not become an intent; suite now 43 fixtures, every `--expect-count` pinned to 43 | `liveSuiteIntents.test.mts`: a player-attributed intent, an intent for the wrong subject and an empty answer against a positive claim each fail the tier; a vacuous claim is flagged, never passed |
| 07 Q-M driver + corpus | `so-saga-recall.mts corpus\|prepare\|baseline\|replay\|ask\|score\|floors` over `lib/sagaRecall.mts` + deterministic generator `lib/sagaCorpus.mts` (seed 607): `saga-mini.transcript.json` (360 messages, ch1–ch3 + the ferry interlude), `needles.json` (40 needles, adolion `lab/needles` shape: id, chapter, messageId, entity, statement, question, accept), chapterless 600-message variant for Q-M8. `prepare` freezes sha256 of story/transcript/needles/recipe; **A0 is prepared on its own** (`baseline`: own manifest + run dir, seal/chronicle/fold forced off and read back) | `sagaCorpus.test` (files equal the generator; each accept regex matches its statement, each key form once, no filler matches a needle); `sagaRecall.test`: changed corpus after `prepare` → ask/score refuse; planted wrong answer scores 0; an answer matching another needle does not count; an A0 run with seal on is refused as baseline; a treatment arm with an A0 from another manifest is refused; floors both sides |
| 06 inner-voice K | K stays provisional at 24: `MEDIAN_BOUNDARIES_PER_SCENE = 8` is the one constant, `INTENT_LAPSE_K_PROVISIONAL = true`, recipe `k-intent-lapse.json` records that D1 sets it; `so-intent-k.mts measure --corpus <id> <files> [--write]` derives the median from the D1 corpus's `scene_summary` boundaries and, with `--write`, rewrites the constant, flips the flag and records the measurement | jest "K and its recipe agree" (constant ↔ recipe ↔ flag); `so-intent-k.test`: below `minScenes` refuses, no scene summaries refuses, a source no longer holding K as one constant refuses |

### AS-14 — plan 07 retained scope (all off by default, blob stays v6)

| Item | Built | Tests |
|---|---|---|
| Archive recall (D10) | `memory/archiveRecall.ts`; `chapterKit.recall` from the talk interceptor before the fold: folded live rows named (whole word) by the latest player turn or the checkpoint objective, ranked by injection score (vectors same-topic band from a purged temp collection, Jaccard fallback), k = 4 `Recalled from <chapter>: …` lines within `recallTokens` (200) appended to the scene-history block for one generation, restored at close; quiet/impersonate skipped; RunGuard after the vectors read; journaled | off by default, append/journal/restore, objective mention, vectors order, token bound; controls quiet, live-only mention, chat moved mid-vectors |
| Era seals (D11 / Q-M8) | `chapters.eraTarget`/`eraChapter`/`isEraId`; settings `eraSeals`, `foldEras` (off), `eraMessages` 300; fires for a chapterless story at the first scene summary after > 300 messages, > 24 unpinned scene rows and > 20 resolved arcs; `era-<n>`, title from visited checkpoint names, chronicle style, same fold/chronicle, no bridge or title card | each threshold, setting, chaptered-story control, second era, routing, end-to-end era seal |
| Epistemic folding (D3) | `chapterFold.foldEpistemic`: `[hiding]`/`[suspects]` rows whose subject and every target leave at the entered checkpoint's `cast_changes` fold (`EpistemicEntry.foldedInto`); pinned/locked kept; unfold on unseal/rollback | pure fold, prompt exclusion, unfold three ways, seal-level fold, no-`cast_changes` control |
| Judge `memoryVerify` in the seal | after the code verify, each consequence (≤ 12) asked against its cited sources; a drop feeds the existing re-ask-once-then-degraded flow; every fallback (off, unavailable, timeout, error, uncalibrated) is the code-only path; RunGuard after each call | degrade with the failure fed back, one call when supported, fallback never blocks, chat moved mid-judge |
| Map-reduce | `memory/chapterReduce.ts` replaces `fitInput`'s trim: chunks condensed with sources, a category a reply drops gets a code-built line, consequence sources expanded back; `SEAL_CALL_BUDGET = 6` over map + write + saga + era merges (Q-M7) | all five input categories reach the record call, sources expanded, chat moved mid-map, fits-in-one-call control, oversize + eras ≤ 6 calls |

`rollback ≡ replay` gains a hide op, epistemic folds at every seal and era ids (20/20). Census +3 `checked` rows (`ChapterSeal.prepare`, `ChapterSeal.judgeConsequences`, `chapterKit.ts#recall`). Fault matrix gains package `chapterSeal` (10 cells: 5 covered, 2 partial, 2 todo — title card before host write, seal does not read save evidence — 1 n/a); its `$comment` now states sixteen packages × ten shapes and a jest case keeps the count honest. 23 of 23 plan-local mutants killed. Deviations: the Q-M7 bound counts the seal unit's own calls, not the scene/arc passes it triggers; era records do not appear in the player Overview's chapter list (`view.declared` is false for a chapterless story); no settings-panel controls for the new switches.

### AS-15 — harness prerequisites and the final suite

| Item | Built | Negative controls |
|---|---|---|
| H-a | `lib/generationQuiesce.mts`: both runners' cleanup stops and awaits an in-flight generation (and `isChatSaving`) before any chat switch; if it never stops, nothing is switched or deleted and the run fails. `so-run-header diff --owned <ids>`: chat-length growth on a chat the run does not own is blocking | `generationQuiesce.test` (9): page work before stop + idle fails, never-stops leaks nothing; `so-run-header.test` +2 (foreign growth/shrink blocking, owned growth not) |
| H-g (= AS-3) | `attestationRules.mjs` series: `change` opens a new series; ×2 = the first two runs of the latest series on one build + fixture; fail-then-pass without a change = `flaky k/n`, red | `attestationRules.test` (23): pass-fail-pass-pass → not ×2; fail, change, pass, pass → ×2; across builds/fixtures → not; `--only`, failed cleanup, unscored human row break the pair; cited path outside the root refused |
| H-j | `lib/soakProbe.mts` + `so-soak-probe.mts arm\|sample\|verdict`: heap after forced GC, long tasks, event timing, DOM nodes, listeners over CDP, JSONL; budgets un-calibrated until the first soak | `soakProbe.test` (8): planted heap growth, long task, slow event, DOM growth, dropped entries, too few samples each fail |
| H-k | `lib/engineHistoryDump.mts`: journey cleanup writes `engine-history-<journeyId>.json` (every owned chat: engineState + engineHistory) before deleting; `journeyArchive` copies it; the attestation fails on a cited dump that is missing | `engineHistoryDump.test` (8), `attestationRules`/`attestation.test` H-k cases. Deviation: one dump per journey (one sandbox across checks), not per check |
| C2 | `so-c2-save-race.mts` + `lib/c2SaveRace.mts`: model-free, seeds its own sandbox (pinned group, `/newchat`, own story, own solo chat), guard/control alternation, cleanup; refuses any chat it did not create (incl. the old lane-1 ids) | `c2SaveRace.test` (8) |
| Plan 09 I1–I6 | `test/measurements/v2.6-09/runs.json` (tier T7, campaign pin + route blob sha256, columns `on`/`defaults`, routes, I4 mutation schedule, I5 outages, I6 cut points, required artifacts) + `so-integration.mts validate\|plan\|play\|verify` over `lib/integrationRuns.mts`. I5's memory-model cut matches **by profile** (DeepSeek `chat_completion_source` + model vs the Artemis llama-server `api_server`), never the main reply; a lane where both share source and endpoint is refused at preflight. Bulky evidence (> 1 MB) goes to a gitignored `evidence-<chat>.full.json` and the committed file keeps a hash summary | `integrationRuns.test`/`so-integration.test` (27): artifact missing, route checkpoint unknown, tampered route sha, one-field reopen diff, empty payloads.jsonl, the main request never cut while the memory model is, shared-endpoint refusal, `play` in the wrong group refused, bulky split |
| Final suite rows | every placeholder in `13-final-suite.md` replaced (05 R3/R4, 11 J9b/W1–W6, 12 providers, 03 SP1–SP10, 09 I1–I6, judge-off, 01 carry-over): each row carries command, run condition, configuration, artifacts and tier T7 (+ origin tier); journey and live-scenario rows are generated with their batch command and the engine-history artifact. `suiteRowProblems` makes the generator refuse a placeholder, a missing command/condition/artifact/tier, or a command naming a repo file that does not exist | `suiteDecisions.test`: each defect planted in turn is refused; every hand row passes |
| `so-journey` engine history | = H-k above | |

Evidence policy (lead, 2026-10-01): `.gitignore` drops `payloads*.jsonl`, `shots/` and `*.full.json` under `test/measurements/v2.6-09/out/`, and `payloads*.jsonl`, `shots/`, `chat-full-*.json` under `test/sessions/` (the session tooling writes the full chat as `chat-full-*` unconditionally, so all of them are ignored; the digest `chat-*.json` stays committed). Summaries, verify output, findings, rubrics, run headers and engine-history dumps are committed.

Open, not ours: `so-session.mts` still diffs with `--allow chat` instead of `--owned` (session tooling's file).

### Gates (2026-10-01, after merging master `e5f9118f`)

One command, `npm run gates -- --no-storybook`: **all green**.

| Step | Result |
|---|---|
| typecheck / typecheck:test / lint | ok |
| test | 389 suites passed, 1 skipped; 5128 tests passed, 1 skipped |
| build | ok, bundle `884a031acb87`, **main entry 1,227,349 B** (budget 1,250,000; plan 07 era code now in `chapters.ts`) |
| build:dev | ok, bundle `125dc9f07c9c` |
| test:debug | 678 pass, 0 fail |
| test:release | 90 pass, 0 fail, 2 skipped |
| test:replay | 30 of 30 killed |
| test:plugin | 73 pass, 0 fail, 3 skipped |
| test-storybook:ci | **skipped** (`--no-storybook`): no `.stories.tsx` or UI component changed, and the worktree's junctioned node_modules resolves the runner to the main checkout (the CR-P note above) |

The first run (`npm run gates`) went red at `test`: master's new `chapterSaga.test.ts` harness had no `epistemic` slice, which the epistemic fold now reads; the harness gained `epistemic: []` and the re-run is the one above. No lanes, no model calls: every vehicle is built, none is run, and none of the measurements it serves is green.

## Review fixes CR-U (UI, player leaks, a11y, mobile), 2026-10-01

Scope: the CR-U UI review: player-mode leaks (H1–H6, M1–M8, the Low copy moves), curator and copilot gating, author UI / a11y / CSS / mobile items 1–4, 6–9, 12–20 and 25–30, and the `disabled_members` product gap. Item 5 (font scaling) was **not changed**, by instruction (user decision 2026-09-19 stands). Fail-first proof: `src/runtime/playerSurfaces.review.test.ts` (SSR via `renderToStaticMarkup`) fails 6 of 8 against the `e76eff73` components; the jest and story assertions below were written against the old copy first.

| Finding | Fix | Test |
|---|---|---|
| H1/H2 HUD + rollback show author names / pipeline detail | `HUD_COPY`/`hudChipLabel` in `pipeline.ts`; chip title = `pipeline.text`, detail author-only; `lastRollback.playerName` (set in `rollback.ts`), `rollbackNoticeText`/`steppedBackText` in `narrative.ts` | `playerSurfaces.review.test.ts` H1/H2; `PlayerOverview` SteppedBack story; `inlineTimeline.test.ts` |
| H3/H6/M2 Memory tab: raw error, evidence, provenance codes, character ids | constant `PLAYER_COPY.memorizeError`, player provenance phrase, names from `snapshot.castNames` (`buildCastNames`), evidence + author controls moved to lazy `AuthorMemory.tsx` | `playerSurfaces` H3; DrawerTabs MemorizeFailed story |
| H5 inline levels 3/4 offered to players | player select offers ≤ 2 and shows the effective level; stored level kept | `playerSurfaces` H5; `Settings/InlineControls` stories |
| M1/M8 inline: member ids, author detail in player items | `castNames` resolve members; player items drop `detail`, keep pin/exclude only; drafts above the effective level dropped | `inlineTimeline.test.ts` M1/M8 |
| M3 role-route + WI gating detail | `authorView` prop on `RoleProfilesGroup`/`WorldInfoGatingGroup`; detail lazy-free author add-ons | `playerSurfaces` M3; stories |
| M5 chapter seal/fold/story-so-far/budget | author-only; "Previously…" stays | `playerSurfaces` M5; `ChapterControls` PlayerSeesOnlyThePreviouslyToggle |
| M6/M7/17 Repair: author consequence, lore names, wizard offered with wizard off | `repairSteps`/`viewerRepairStep` (player copy `REPAIR_PLAYER_COPY`, author detail add-on); New story / Fix with wizard disabled with `WIZARD_OFF_REASON`; "Turn on Author view" `#so-entry-author-view` | `repair.test.ts` "CR-U: Repair per viewer"; `playerSurfaces` M6/M7 |
| Low copy moves | every player string now a function/constant in `narrative.ts` (`PLAYER_COPY`, `DERIVED_PLAYER_COPY`, chapter/away/inline/sprite/image texts) or `pipeline.ts` | covered by the tests above |
| Curator + copilot in player settings | `authoringSettings = authorView \|\| !storyId`; `StagecraftGroup` and `#so-copilot-enabled` author-gated; engine status author-only | `Settings/PlayGroups`, `Settings/SettingsPanel` stories; `so-ui` sweep |
| `assert-player-clean` extensions | v2.6 selectors added to `PLAYER_FORBIDDEN_SELECTORS`; `[title]`/`[aria-label]` attribute sweep; text needles on HUD + settings | `scripts/debug/so-ui.test.mts` (3 new) |
| Muted member (`listGroupMembers` ignored `disabled_members`) | `listMutedGroupMembers` (stHost), `requirementsRead` → `mutedMembers` (present, muted, not muted by the story's own cast effect); Repair names it (`mutedMembersText`), Overview lists "Unmuted cast" | `requirements.test.ts` muted block; `repair.test.ts` |
| 1/2 help button inside checkbox labels | `CheckRow`/`FieldLabel` (`components/settings/Field.tsx`), help outside the label, `htmlFor` labels across settings, image and judge groups | `playerSurfaces` "1/2"; exact-name stories (PlayGroups, MemoryModelGroup, JudgeSettingsGroup, StoryGroup) |
| 3/4 a11y names | Test buttons "Test <role>", MultiSelect labels, ChaptersEditor uses checkpoint names, ReviewGrid Redo `aria-label`, status dot `role="img"`, wizard `role="log"` / regions | stories (RoleProfilesGroup, ChaptersEditor, ImageReviewGrid, StudioCopilot) |
| 6 Studio dialog | heading `h2#so-studio-heading` + `aria-labelledby`, focus trap includes `a[href]`/`summary`, focus returns to the opener, close via `dialog.close()` | StudioModal stories (named dialog, ClosingReturnsFocusToTheOpener) |
| 7 colour-contrast | **measured, not re-enabled**: with the rule on, 193 of 367 stories fail, every one on `color-contrast` only — the Storybook theme stub's muted ST palette, not one component. Rule stays off; needs a theme-level pass against real ST themes | Storybook run (contrast on) recorded below |
| 8 lazy chunk failure | `lazyRetry` + `resetFailedLazies`, `Lazy` boundary with Retry; Studio/inline failures toast and reset; image/sprite imports `.catch` with a toast; roots get `onUncaughtError` | `src/utils/lazyRetry.test.ts`; `Drawer/LazyFailure` story |
| 9 async buttons stuck busy | try/finally in self-tests, role test, judge key save, StoryGroup `whileBusy` | stories (JudgeSettingsGroup KeySaveFailedSaysWhy) |
| 12–16 raw errors | `studioFailure` (`studio/errorCopy.ts`), constant player errors; `errorCopy` census now records `x instanceof Error ? x.message : …` | `errorCopy.guard.test.ts` CR-U 27 control; `test/findings/errorCopy.json` |
| 18–20 naming | "Judge", "Wizard", "Memory model profile"; Copilot labels → Wizard (ProposalReview "Wizard proposal") | stories |
| 25/29/30 CSS + mobile | theme tokens `so-warning/error/success-text` replace hard Tailwind colours; HUD wraps, chips ellipsize; `.menu_button` ellipsis + `.so-wrap-button`; responsive Studio grids; blackboard table scrolls | visual; stories |
| 26 AgentWizard dead end after a failed call | Retry button (`#so-agent-retry`) | AgentWizard ErrorShowsTheConstantNotTheCause |
| 30 missing stories | new: SettingsPanel, StoryGroup, PlayGroups, MemoryModelGroup, InlineControls, GroupStoryBinding, ImageGroup, ImageChatPanel, ImageReviewGrid, VnStage, InlineLayer, ScenePanel, LazyFailure; states: AgentWizard error/stopped/done, WizardQuestions busy, JudgeSettingsGroup key-save-failed/checking, StudioCopilot thrown error, StudioModal focus return | 367/367 |

Decisions: a muted member does not satisfy "must be active" and Repair names it, but `requirements.ready` is unaffected, so the story's own cast effect can still unmute it (no deadlock). Curator and copilot settings are author-only once a story plays (`authorView || !storyId`). Warden and sprite stage are one switch each (no separate "off" option). Image stories live under `src/components/**` because `src/image` is outside `tsconfig.json`. `.storybook/preview.ts` gives `Settings/SettingsPanel` no extra root (it renders its own `#story-orchestrator-settings`).

Not run: the live gate (no ST/LLM browser validation was done here). `so-ui assert-player-clean` was extended and unit-tested but not driven against a live page.

### Gate record

- Master merged (CR-P, English judge fixtures) cleanly.
- `npm run gates`: typecheck ✓, typecheck:test ✓, lint ✓, test ✓ (386 suites passed, 1 skipped; 5031 passed, 1 skipped), build ✓ (main bundle `dist/index.js` 1,235,123 B ≤ 1,250,000), build:dev ✓, test:debug 543/543, test:release 82 pass / 2 skipped / 0 fail, test:replay 30 of 30 killed, test:plugin 73 pass / 0 fail; **test-storybook:ci RED: "No tests found"** (worktree layout, the runner resolves to the main checkout through the node_modules junction; same as CR-P).
- Storybook run instead from the worktree: `node node_modules/storybook/bin/index.cjs build --output-dir <scratch>/sb-cru`, served with `http-server -p 6133`, `node node_modules/@storybook/test-runner/dist/test-storybook.js --url http://127.0.0.1:6133 --index-json --maxWorkers 1` → **367 passed, 367 total**. With `color-contrast` enabled: 193 failed, all contrast-only (item 7 above).

## Review fixes AS (product) — 2026-10-01

Astra findings in `src/` runtime, judge, memory, services and `scripts/release` (`15-review-astra.md`), fixed in worktree `agent-aadcf340970b8af6f` on master `ec5083e9`, then merged with master `e5f9118f` (English judge fixtures, readiness bound to the fixture revision). Rule: every fix has a test that failed first. For the three "verify" items (AS-6, AS-7, AS-9) the existing fix was confirmed, the missing cases added, and red was shown by mutation (the guard removed, the test fails). No lanes, no model calls.

| Finding | Fix | Red → green |
|---|---|---|
| AS-1 intent admission | `admitIntents` (`memory/innerRender.ts`) admits an `[intends]` line only when text attributable to the subject supports it: the subject's own message (dialogue and action), or an unquoted narration sentence that starts with the subject as the actor and is not a mental-state claim ("Haley clearly wants…"). Support = at least one shared content word (stemmed, stopwords out) between the claim and that text. Quoted speech of another character, reported speech and the player's lines never count. `IntentEvidence` now carries `characters[{speaker,text}]`. | `innerVoice.test.ts` "AS-1" ×4 (red 3/4: Haley's "Good morning" admitted a murder plan; player narration; another NPC naming her). `innerVoiceInjection.review.test.ts` cap fixture now states the four aims it caps |
| AS-3 ×2 predicate | `seriesVerdict` (`scripts/release/attestationRules.mjs`): series start at the first run and at every run carrying a named `change`; ×2 = the FIRST two runs of the LAST series pass on a known, unchanged build + fixture (and the attested build). A build or fixture change without a named change is a problem. `journeyVerdicts` reads `change` from the attestation's run entries; the verdict carries `series`. | `attestationRules.test.mjs`: pass-fail-pass-pass no change → red; fail, change, pass, pass → ×2; blank change starts nothing; a failure in the new series stays red; pair across builds refused and named; `journeyVerdicts` reads `change` (red 5 of 5 new). The existing --only, failed-cleanup, unscored-human and outside-root controls stand |
| AS-4 readiness keying | Kept master's per-use `fixtureRevision` (`JUDGE_FIXTURE_REVISION` / measured map). Added `calibrationProblem(key, fact, served)` → `unmeasured`/`failed` (`passed: false`)/`stale` (`fixtureStale`, or no revision)/`model`; `providerCleared(provider, key, served)` refuses any of them for a non-default provider; `judgeRoute(settings, use, served)`. `JudgeRuntime` remembers the model each non-default provider answered as (`servedModels()`); an answer from another model than the calibrated one is discarded (fallback `model-mismatch`, recorded with the model, metered as sent) and the next call is refused before sending. Readiness: non-default providers get the served-model check (`extra.served`; unknown is never a match), rows carry `calibrationProblem`. TypeSafe routing is unchanged (default never refused); its stale/failed rows read unproven. | `judgeProviderRouting.test.ts` "AS-4" ×5 (red 5/5); the two older control rows needed a current revision (they failed on the new check) |
| AS-5 reasoning shapes | `readReasoning` also reads ST's normalized Claude reply (`content[]` `thinking` blocks, `chat-completions.js:438`) and Gemini reply (`responseContent.parts[].thought`, `:784`). `ReasoningPlan` carries `requested`, `supported`, `sent`: OpenAI/Azure only for ST's `OPENAI_REASONING_EFFORT_MODELS` list (`constants.js:461`, else stripped at `:1731`/`:2600` → `applied: false`, reason named), the fixed `gpt-5.3-chat-latest` → `medium`, xAI → `high`/`low` (`:1215`), Claude only on ST's thinking models (`:255`), Gemini only on thinking-config models (`:526`). `ReasoningMeter` adds `supported`/`sent`/`observed`. | `reasoningPayload.test.ts` "AS-5" ×5 (red 5/5), `modelReply.test.ts` "AS-5: the meter tells requested, supported, sent and observed effort apart" (red) |
| AS-6 reseal ownership | Verified: CR-E8's `reseal` is one unit (the unseal is a view, not a write), one token minted synchronously in `run()`, checked before the commit, the era merge, the save and the journal. One gap fixed: `unseal` returned `true` after its run lapsed; it now returns `false` and journals nothing. | `chapterSeal.review.test.ts` "AS-6" ×4 with one store per chat (A→B during the write, during the final saga, control, unseal) — the unseal case red; removing the check before `commitSeal` turns the saga case red |
| AS-7 unseal watermark | Verified CR-E5. Added seal→unseal→reprocess (fold, watermark, seal row and record all back; a re-seal covers the span again) and seal→reseal (one `chapter_seal` row with the span) and a no-move control. | Removing the watermark lowering in `unsealedView` turns 2 of 3 red |
| AS-8 cast chips | `castItems` (`inlineTimeline.ts`) maps every ledger status: only `applied` is player copy (L1 "Mira joined"/"The scene changed"); `pending` (author, "… (not confirmed)"), `failed`, `reverted` ("…, then undone"), `revert-failed`, `externally-changed` are author-level `refused`/`pending` chips. | `inlineTimeline.test.ts` "AS-8": six-status table, the author wording table, rollback on a surviving (edited) message (red 6) |
| AS-9 telemetry after a switch | Verified CR-J15 (token) + CR-E14 (stamp). Fault matrix `harnessTransport|worldSwitched` todo → covered. Found: the census held `createModelCallVia.call` TWICE (CR-E partial + CR-J checked; JSON kept the last); folded into one row, and a guard now fails a duplicate census key. Fault matrix: 103 covered / 15 partial / 32 n/a / 0 todo. | `harnessRouting.test.ts` "AS-9" (success and failure path, both chats' rings, control); removing the token check turns it red. `ownership.guard.test.ts` "AS-9: no site is classified twice" red on `ec5083e9`'s census |
| AS-10 ledger growth + duplicate apply | `compactLedger` (inside `trimLedger`): drops an applied row that changed nothing, merges chained applied rows on one target at one message (first `before`, last `after`; a round trip within one message vanishes). Rows at different messages are never merged, so rollback from any message and restore on leave are unchanged. Duplicate apply: `EffectsApplier.applyCheckpoint` is now a door; a hydrate of the same checkpoint in the same chat while an apply is running awaits it (`applyCheckpointNow` does the work; census: door = delegate, Now = checked). | `effectLedgerCompaction.review.test.ts` (red 4/4): equivalence over 4 seeds × 300 writes for every rollback cut and leave; long cast-heavy run (400 boundaries, 3 applies each, 40 members toggled every 25): **701 rows / 168,493 B vs 3,040 rows / 677,044 B naive**. `effectsDuplicateApply.review.test.ts` (red: Finn and Leila written twice) |
| AS-17 provider in calibration | `createJudgeHarness`: `probe/calibrate/calibrateLoreRelevance/rescore(…, model, provider)`. `so-judge calibrate|rescore --provider typesafe|llama-logprob` (default typesafe), summary records `provider`; a llama run's model verdict is the model that answered (`providerVerdict`). | `judgeHarness.review.test.ts` (llama calibration never calls TypeSafe; red), `calibrationVerdict.test.mts` AS-17 ×2 (red) |
| AS-18 delayed valid expansion | Test only (the guard existed). | `expansionDelayedSuccess.review.test.ts`: a valid chain answering after a switch during the generation or the critic call writes no cache in either chat, no merge, no persist; control files, merges, persists once. Removing the guard after `generateReviewedBeats` turns both red |
| AS-20 usage + model | `requestModelReply` returns `usage` (`prompt_tokens`/`input_tokens`, `completion_tokens`/`output_tokens`, `cost`; missing = `null`, never 0) and `model` (`json.model`); `replyVia` and the harness reply pass them on; `modelCallCore` records `usage` (explicit all-null when unknown) and `model`; `routeMeters` counts `unknownUsage`; the calls table shows no token count for unknown usage. | `modelReply.test.ts` AS-20 ×2, `modelCallUsage.review.test.ts` ×3 (red) |
| CR-J3 | **No gating; key = consent (user, 2026-10-01).** A first gate was built and removed on the coordinator's instruction. The notice text now says a configured key (or off-machine llama-server) is consent and how to stop it (untick "Use the judgment model" or the use). `architecture.md` judge invariant says so. | `judge/providerNotice.review.test.ts` (red 3/3 on the old copy) |

Not mine, noticed: the judge master switch tooltip (`JudgeSettingsGroup.tsx:205`) still says "Every use below is off until you turn it on", false since v2.6 rule 5 (UI agent).

### Gates

`npm run gates` on the merged branch (master `e5f9118f` + this work), 2026-10-01:

| Step | Result |
|---|---|
| typecheck, typecheck:test, lint | ok |
| test | 5065 passed, 1 skipped |
| build | ok, bundle `eddebc4297e2`, main entry **1,232,423 B** (budget 1,250,000) |
| build:dev | ok, bundle `a5a3173c22af` |
| test:debug | 542 pass, 0 fail |
| test:release | 86 pass, 0 fail |
| test:replay | 30 of 30 killed |
| test:plugin | 73 pass, 0 fail |
| test-storybook:ci | **NOT green**: `EADDRINUSE 0.0.0.0:6006`, another agent's Storybook held the port; no story ran. No `.tsx` changed here; run it once the port is free |

No live gate (no lanes, no model calls, by instruction).

## Review leftovers, 2026-10-01

Leftovers named by the merged review-fix batches. No lanes, no model calls, no ComfyUI.

| Item | Change | Test |
|---|---|---|
| `so-session stop` diffed with `--allow chat` | `headerDiffArgs` (`lib/sessionStop.mts`): allow `chatId,groupId,authorView,story,group,inventory.journal` and pass `--owned <every session chat>`; `chat.chatLength` is no longer allowed wholesale, so growth in a chat the session does not own blocks | `sessionStop.test.mts` "review leftovers" (flag pinned, `chat` not allowed, foreign growth blocks, owned growth passes through `diffHeaders`) |
| Judge master-switch tooltip | Already fixed on master by CR-U ("Each use below is on by default…"); nothing pinned the old copy | — |
| Stale open items | `01-carry-over-proof.md` (ledger growth + duplicate apply → AS-10) and `13-test-suite-review.md` (non-throwing expansion path → AS-18) now say fixed and cite the tests | docs |
| Session tooling docs | Debug skill "Human sessions" and `debug-scripts.md` session bullet: fail-closed start/stop, `--owned` stop diff, required evidence, `baseline-settings.json`, `--media off`, blind rating packs, lane leases / `lane archive\|restore\|lease`, feature-checked cards | docs |
| CR-U 7 colour-contrast | `.storybook/st-theme.css` now carries ST's own element/class rules our UI inherits in the host (`.menu_button`, `.text_pole`, `select`/`option`, `textarea`, `a`, disabled buttons; copied from ST `style.css`), so unstyled browser-white controls no longer stand in for ST's. Rule re-enabled (the `color-contrast: false` override in `preview.ts` removed). Remaining failures were real component contrast: muted text at `opacity-40/50/60`, mostly nested inside `opacity-80` panels (effective 0.45–0.48 under ST's global text-shadow, 3.1–4.1:1). Fixed: every `opacity-40/50/60` → `opacity-70` (18 files), three-level nesting removed (memory row meta, warden fact origin, curator diff, effects row spans), `.so-inline-more` drops its 0.7 on top of ST's Em colour, the judge "recommended config" link loses its opacity, `#so-pacing-alpha` gets `text_pole`, ReviewGrid Redo gets `menu_button` (both were browser-default white controls in the real host too), the StudioModal story opener gets `menu_button`. ST's default theme defines no error/warning/success colours, so ours fall back to `SmartThemeQuoteColor`; that passes once not stacked under opacity. Nothing left that is ST's own palette | Storybook run below |

Also fixed, red on master after the merges (not caused here): `chapterSeal.review.test.ts` AS-6 fixture lacked `epistemic: []` (AS-14's `foldEpistemic` reads it); `spikes/reasoningEffect.test.ts` used model `m`, which AS product's per-model capability now refuses (openai → `gpt-5`, makersuite → `gemini-2.5-pro`); `test/sessions/baseline-settings.json` lacked AS-14's `memory.chapters.{archiveRecall,recallTokens,eraSeals,foldEras,eraMessages}` and `spikes.reasoningEffect` (all at their defaults).

### Gates

Storybook (from the worktree, `test-storybook:ci` finds no tests through the junction): `node node_modules/storybook/bin/index.cjs build --output-dir <scratch>/sb`, `http-server <scratch>/sb -p 6144 -s -c-1`, `node node_modules/@storybook/test-runner/dist/test-storybook.js --url http://127.0.0.1:6144 --index-json --maxWorkers 1` with `color-contrast` ON → **367 passed, 367 total** (63 suites). Before: an axe `color-contrast`-only sweep of every story found 191 failing stories / 1632 nodes; after the theme rules 103 / 293; after the component fixes 0. The first full run also caught a stale play assertion unrelated to contrast (`JudgeSettingsGroup` privacy story expected "sent to TypeSafe"; CR-J3 copy says "sends the chat excerpts it lists to TypeSafe"), fixed.

`npm run gates -- --no-storybook`, 2026-10-01, on master `e27d276f` + this work:

| Step | Result |
|---|---|
| typecheck, typecheck:test, lint | ok |
| test | ok: 5204 passed, 1 skipped |
| build | ok, bundle `aee62bf1bf6f` |
| build:dev | ok, bundle `1577d272aec5` |
| test:debug | **RED, 3 fail / 734 pass, not from this branch**: `integrationRuns.test.mts` ×2 and `so-integration.test.mts` "loadFrozen refuses…" — the story index is now built from the campaign-readiness pin `e1c91fb` while the frozen integration runs pin `5e2974b`. Needs the runs re-frozen at the new pin (or the index rebuilt at the old one), a decision for the integration owner |
| test:release | ok: 90 pass, 2 skipped (run separately, after gates stopped at test:debug) |
| test:replay | ok: 30 of 30 killed (separately) |
| test:plugin | ok: 73 pass, 3 skipped (separately) |

## Review fixes: read coalescing (2026-10-01)

From `15-model-config.md` "Needs the lead's decision" 2 and 3.

| Item | Fix | Proof |
|---|---|---|
| Forced-cue reads multiplied | Root cause: `scheduleForcedCues` (`src/extraction/cues.ts:17-19` before) scheduled one windowless P0 read per matching transition, and the scheduler had no merge for windowless P0 reads, so N cues on one window = N identical reads (same window, resolved at run time; same derived scope). Now one scan schedules ONE read, reason `cue:<from>-><to>,…` (single cue unchanged: `cue:a->b`), and `ExtractionScheduler.mergeCue` folds a later windowless cue read into one still queued (pair union, deduped). Scope: the shared read already derives active + reachable gates (`deriveScope`), so the one read covers every cued gate. Untouched: P0 before P1, P1 merge, lapsed re-read merge, explicit-window reads (rollback/reconcile), scene reads (journeys match `scene:location` exactly), the cue scan window, retries, ownership, one audit per read. | `src/extraction/cueCoalesce.test.ts` on a trimmed copy of `adolion-war` (campaign `e1c91fbe`, `test/fixtures/adolion-war.story.json`): hub `war-the-summons`, one player line matching 9 cues → **9 reads before, 1 after**; two boundaries with the read still queued → **18 before, 1 after** (reads the newest window); controls: a read that already ran + a newer window = 2 reads; cue + rollback re-read + pending P1 = 3 reads in order P0 cue, P0 rollback, P1 cadence; cue never merges into `scene:location`. Red 5/5 before the fix. |
| Epistemic/ledger floor | `MAX_TOKENS_TABLE` epistemic and ledger floor 384 → 768 (cap 1024 unchanged; curator stays 384). | `callBudget.test.ts` |
| Backlog windows sized for a 512 reply (master regression, found by the gate) | `747d88d7` made the shared read ask 1024, but `planBacklog` still budgeted input for `DEFAULT_MAX_TOKENS` (512), so the first memorize window was trimmed (`budgetWiring.review.test.ts` red on master `b96cdf7b`). `planBacklog` now budgets for `maxTokensCap("sharedRead")`; the test's read budget follows the same constant. | `budgetWiring.review.test.ts` (red on master, green here) |

Expected live effect on the audit's turn: 19 reads over 2 boundaries → 3 (one cue read per boundary + the cadence read), or 2 when the second boundary's cues arrive while the first cue read is still queued. Not measured live (no lanes, no model calls, by instruction). Narrowing the campaign's broad `extractor_trigger` regexes is still open (campaign repo, not touched).

Not done, noted: a windowless `scene:*` read and a cue read at the same boundary are still two reads of the same window; merging them would change the `scene:location` / `scene:judge` audit reasons J11 matches exactly.

Gates: `npm run gates -- --no-storybook`: all green. typecheck, typecheck:test, lint ok; test 5212 passed, 1 skipped; build ok, main entry 1,242,767 B (budget 1,250,000); build:dev ok; test:debug 738/0; test:release 90/0; test:replay all killed; test:plugin 73/0. Storybook skipped (it cannot find stories from a worktree).

## Bundle headroom (2026-10-01)

Goal: at least 30 KB of main-entry headroom under the unchanged 1,250,000 B budget (`webpack.config.js` `performance`, `scripts/release/buildChecks.mjs`), no behaviour change.

**Main entry `dist/index.js`: 1,242,214 B → 1,200,869 B (−41,345 B; headroom 7,786 → 49,131 B).** Measured on master `0df7347b` with `webpack --mode production`; after = `dist/manifest.json` `bundle.bytes` from the gates build.

Measurement: a prod build with `--devtool source-map`, minified bytes attributed per source through the map (the devtool build inflates `styles.css` with its inline CSS map, so the totals above are from the plain build). Top 30 of the main entry before:

| # | module | min. bytes |
|---|---|---|
| 1 | webpack/terser glue with no source mapping | 175,138 |
| 2 | `react-dom/cjs/react-dom-client.production.js` | 167,897 |
| 3 | `src/styles.css` (as a JS string) | 80,398 |
| 4 | `src/runtime/runtimeManager.ts` | 23,878 |
| 5 | `src/runtime/coordinators/extractionCoordinator.ts` | 14,829 |
| 6 | `src/runtime/effectsApplier.ts` | 13,931 |
| 7 | `src/runtime/coordinators/memoryCoordinator.ts` | 13,875 |
| 8 | `src/extraction/scheduler.ts` | 12,415 |
| 9 | `src/engine/engine.ts` | 11,199 |
| 10 | `src/runtime/extras.ts` | 11,088 |
| 11 | `src/runtime/coordinators/stagecraftCoordinator.ts` | 11,000 |
| 12 | `src/engine/storyDiff.ts` | 10,827 |
| 13 | `src/components/settings/JudgeSettingsGroup.tsx` | 10,393 |
| 14 | `src/index.tsx` | 9,950 |
| 15 | `src/runtime/snapshotBuilder.ts` | 9,739 |
| 16 | `src/memory/contract.ts` | 9,696 |
| 17 | `src/runtime/talkControl.ts` | 9,326 |
| 18 | `src/judge/readiness.ts` | 8,206 |
| 19 | `src/runtime/memoryQueue.ts` | 8,205 |
| 20 | `src/engine/validate/checkpoints.ts` | 8,167 |
| 21 | `src/runtime/coordinators/expansionCoordinator.ts` | 7,696 |
| 22 | `src/judge/settings.ts` | 7,660 |
| 23 | `src/services/stHost/worldInfo.ts` | 7,588 |
| 24 | `react/cjs/react.production.js` | 7,395 |
| 25 | `src/runtime/worldInfoGating.ts` | 7,056 |
| 26 | `src/runtime/coordinators/copilotCoordinator.ts` | 6,980 |
| 27 | `src/components/settings/PlayGroups.tsx` | 6,971 |
| 28 | `src/components/drawer/tabs/MemoryTab.tsx` | 6,942 |
| 29 | `src/components/drawer/DrawerTabs.tsx` | 6,724 |
| 30 | `src/services/stHost/image.ts` | 6,619 |

What moved:

- **CSS, ~20 KB.** `postcss.config.js` turns off postcss-preset-env's `is-pseudo-class` (like `cascade-layers`), so the nested mount-root scope stays one `:is(#drawer-manager, …, #so-studio-modal) .x` selector instead of five expanded copies per utility, and a small `so-compact-whitespace` plugin drops indentation, newlines and non-`/*!` comments. Compiled CSS 68,999 → 51,075 B. Equivalence checked by parsing both outputs, expanding every `:is()` and comparing (context, selector, declarations) multisets: identical (1,323 entries each). Specificity is unchanged (`:is()` takes its most specific argument, one id here; `:is(.grid, .flex)` and `:is(input, select, textarea)` match their expanded forms). `:is()` needs Chrome 88 / Firefox 78 / Safari 14. Lightning CSS minify (tailwind `optimize`) was not used: it drops the unprefixed `backdrop-filter`.
- **`JudgeSettingsGroup` → lazy chunk (10.6 KB)**, `lazyRetry` + `<Lazy fallback={null}>` like `MemoryModelGroup`/`ImageGroup` in the same panel.
- **`engine/storyDiff` → lazy chunk (12 KB).** Dropped from the `@engine/index` barrel; `applyStoryUpdate` (the author's save / "Update to vN" path only) imports it first. A `RunOwnership` token is minted before the import and checked after it, so a chat switch during the load discards the update instead of applying it to the next chat; a failed load returns an `unavailable` outcome with a fixed reason (error copy guard) and logs the error.

New chunk files are picked up by `scripts/release/manifest.mjs` (`files` = every emitted file, hashed) and so by `stage.mjs` (`stageList` reads the manifest; dev copies `dist-dev`). Lazy chunk files 47 → 49.

Tests: `src/runtime/bundleHeadroom.review.test.ts` — player-mode first render (`DrawerTabs`, `PlayerOverview`, `HudStrip`) calls no `lazyRetry` factory and does not suspend; control: the author inspector does (so the counter can fail); guards that the barrel does not re-export `storyDiff`, the panel lazy-loads the judge group and postcss keeps `:is()`. `storyUpdate.test.ts` waits for the chunk before asserting the popup and adds "world changes while the comparison is still loading". Storybook `Settings/SettingsPanel/JudgeGroupArrivesFromItsLazyChunk` (loaded state, no `lazy-failed`); loading/retry of the boundary itself is `Drawer/LazyFailure`.

Not moved: the settings panel's other groups render on mount inside closed `<details>`, so lazy-loading them only defers a load already triggered at boot; render-on-open would change the DOM the live harness reads.

### Gates

- `npm run gates -- --no-storybook`: all green. typecheck, typecheck:test, lint ok; test 5220 passed, 1 skipped; build ok, main entry 1,200,869 B (budget 1,250,000); build:dev ok; test:debug 761/0; test:release 90/0; test:replay 30 of 30 killed; test:plugin 73/0.
- Storybook (separately, from the worktree): `node node_modules/storybook/bin/index.cjs build --output-dir <scratch>/sb`, `npx http-server <scratch>/sb -p 6147 -s -c-1`, `node node_modules/@storybook/test-runner/dist/test-storybook.js --url http://127.0.0.1:6147 --index-json --maxWorkers 1`: 63 suites, 368/368 passed.
- No live gate run (no lanes, per the task); the CSS change is the one ST-facing risk and was checked by AST equivalence only.
