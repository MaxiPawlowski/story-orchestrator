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
