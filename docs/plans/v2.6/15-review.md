# v2.6 plan 15: review fixes

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
