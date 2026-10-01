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
