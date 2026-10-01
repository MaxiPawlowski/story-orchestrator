# Plan 14 findings register

One row per finding from the tiered sessions (`14-tiered-testing.md`). Rows start as drafts from
`node scripts/debug/so-session.mts digest <session dir>` (its `findings.md` ends with draft rows); severity
and class are decided in the review, never by the digest.

- **id**: `T<tier>-<n>`, numbered in the order the review accepts them.
- **severity**: blocker | broken | annoying | cosmetic.
- **class**: product | quality | expectation | harness.
- **evidence**: a path under `test/sessions/` with a line (`journal.jsonl:123`, `payloads.jsonl:9`, a flag's line).
- **status**: open | fixing | fixed | deferred (decided in the review) | wont-fix | cosmetic-list.
- **fix commit**: the commit that names the finding id.
- **eval**: the replay fixture, no-LLM scenario or scored eval that now guards it.

| id | tier | severity | class | evidence | status | fix commit | eval |
|---|---|---|---|---|---|---|---|

## Recorded before the sessions (card feasibility check, 2026-09-30)

Found while fixing the cards for the autonomous run; each goes to the review like a session finding. Evidence is source, not a session line, until a card reproduces it.

| what | class (proposed) | evidence | card |
|---|---|---|---|
| A disabled group member still counts as present: the members requirement reads `group.members` and ignores `disabled_members`, so disabling a required member breaks nothing Repair can see. | product | `src/services/stHost/selectors.ts:108` (`listGroupMembers`) via `src/runtime/requirements.ts:11` | T5-4 (removal used instead; the disabled case is recorded there) |
| The mirror-lorebook delete prompt names the deleted chat by its raw chat id, not in player words. | expectation | `src/runtime/mirrorReaperHost.ts:17` | T4-3 |

## T0 fixes: harness, rollback, load (2026-10-01)

From the T0 sessions (`test/sessions/T0/SUMMARY.md`); kept apart from the review register above. Each fix has a failing-first test.

| what | class | evidence | cause | fix | test |
|---|---|---|---|---|---|
| `start --age` / `age` never sees the away recap | harness | `T0-2-1/start-failed.json`, `T0-2-1/turns.jsonl:1` | `backdateSession` reloaded with `reloadCurrentChat()`, which does not re-hydrate the runtime, then polled `getAwayRecap()`, which is null once the popup showed | real page reload (`deps.reload`) + reopen the group by id (`deps.openChat`), recap read from the `away recap shown` journal record written after the backdate (decision and popup text recorded too) | `sessionLive.test.mts` "age: …reopens the group by id…", "age: the getter is not evidence…"; `sessionDriver.test.mts` "live age" |
| `reload-mid-gen` cannot reopen the group after the reload | harness | `T0-2-2/turns.jsonl:7` ("no group matching …") | reopened by group NAME right after the reload, before ST listed the groups | session chats carry `groupId` (`sessionChat`, `start --age`); `openChat` waits for the group to be listed and opens by id (`groupNeedle`: id first, name fallback); mutations fill `groupId` from the open chat | `sessionLive.test.mts` "reload-mid-gen: … reopens the session chat", "group needle" |
| `npm run debug:typecheck` red (5 errors) | harness | `sessionArtifacts.test.mts` ×2, `so-judge.mts` ×2, `so-session.mts:828` | untyped test literal; `CalibrationRow` lacked `detail`; `verb` intersected to `LiveVerb` so `'setting'` could not match | typed literal, `detail?` on the row, `Omit<LiveRequest,'verb'>` | `debug:typecheck` is now a step of `npm run gates` (after `test:debug`), `gates.test.mjs` + overview rule 16 |
| Swipe back to an earlier version steps the story back and never forward | product | `T0-3-1` flag at msg 2, `manual-swipe-left.json` | `TurnBridge.onMutation` rolled back on every `MESSAGE_SWIPED`; only a GENERATED swipe renders a reply (and commits), a swipe to a stored version renders none | a swipe whose current version is stored (`swipes[swipe_id]` is a string, a player line precedes it, not a greeting) is re-committed as the boundary after the rollback, without afterSpeak NPC replies, only while the run minted before the rollback still owns the chat; a spike seam that restores the state still wins | `turnBridgeSwipeBack.test.ts` (5 cases); ownership census rows `enqueueBoundary` (checked), `onRenderedReply` (delegate) |
| "save not confirmed" ×5/×12 with ST "Timeout waiting for chat to save" while the chat file was intact | product | `T0-1-1/journal.jsonl` (5 at 11:59:27), `T0-2-2/journal.jsonl`, `console.jsonl` (31/33 warnings) | ST's `saveChatConditional` waits 1 s for a running save and then returns WITHOUT sending (`script.js:9413`); under 3-4 lanes the running save outlived that, so the observation timed out as "no save request went out" = `unsaved`, a lost write | the watcher counts chat saves in flight; an observation armed while one runs is `busy`, and once it finishes with nothing sent since, the save is asked for again (only while the same chat is open). A busy timeout settles `unconfirmed` ("waited behind another save", journal "save waited behind another save"), not `unsaved`; a plain timeout with nothing running stays `unsaved` | `persistenceBusy.test.ts` (4), `saveEvidence.test.ts` (busy vs plain timeout) |
| Judge 429 / busy fallbacks across lanes | product + harness | `T0-1-1` runtime ring: 8 `memoryPairs` `busy` at one ms | every lane's plugin has its own 60/min limiter on one shared account; a 429 gave the page no retry time, so a burst retried 4× each into the same window | plugin limits from `SO_JUDGE_RATE_PER_MIN` / `SO_JUDGE_MAX_IN_FLIGHT` (logged at load, in `/status`); 429 carries `Retry-After` (own limiter, or TypeSafe's passed through); the page's gate cools down for a retry time past its backoff budget and the burst behind it falls back `busy` unsent (already not metered, status untouched). Plugin 1.4.0. Per-lane setting: debug skill, "Lanes share one TypeSafe account" | `plugin.test.mjs` (env limits + Retry-After, upstream Retry-After), `judgeGate.review.test.ts` (cool-down, its end) |
