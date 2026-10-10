# Plan 31 — Backlog from the v2.7 wrap (2026-10-09)

**Status:** notes, not yet planned. Owner decisions 2026-10-09:
- private plugin, one user;
- every built feature on by default, below its floor too;
- floors are informational;
- versions are symbolic;
- v2.7 wrapped without the pod Phase C;
- no RunPod budget for the rest of October 2026, so the local 3090 takes what it can.

Sources:
- v2.7 39 §B1 records (batch 3);
- v2.8 01 §H;
- the 2026-10-09 lorebook review (`docs/authoring/lorebook-mechanics.md`, campaign `docs/reviews/`).

Where: **pod** needs the pod model (Artemis v1.1, 98K context), **3090** runs on the local controller (model file v1m, 32K: a local variant, valid for model-independent rows), **none** needs no model.

## Measure

| # | What | Why / last result | Where |
|---|---|---|---|
| M1 | 35-K3 and 35-K4 run 2 | run 1 PASS (batch 3); K3 under the fixed carried check (F-B1c-3). **2026-10-10 (3090, one cell, judge on / release)**: 98 turns, agency flags 0, 15 releases (< 20), carried 13 / 15, K4 0 restatements in 15; other three cells not run (time) | pod |
| M2 | 35-K5 with enough releases (≥ 20 pooled) | 7–8 measured; control arms land under 20 (run variance, F-B1c-5); longer runs or more segments | pod |
| M3 | B1-C3 judge timeouts per use; B1-C12 lore-select requests per turn | pod run killed; the 3090 diagnostic had the warden at 7/118 timeouts and C12 p50 7, max 18 | pod (3090 diagnostic) |
| M4 | B1-EMPTY formal arms A/B | 8/8 recoveries seen incidentally in batch 3, not the formal row | pod |
| M5 | B1-NARR plus its rating pack | P3 Narrator holdings scoping, unmeasured | pod |
| M6 | B1-PFX (prompt-cache reuse) and B1-HIST (32K vs 98K history) | dropped for budget twice; decides the group cache layout (P4) and the history window (P1) | pod |
| M7 | S-17 / 37-S17 on the new scope budget (`extraction/scopeBudget.ts`) | FAIL ×2 at +17 % before the budget; pair fairness may count per axis, not per pair | pod |
| M8 | 36-Q1-M2 quest completion recall, 36-Q1-M1 scope, 37-M1 relationship direction, 37-L6-C voice warden OOC recall | 0.46, split, 0.20, 0.5. **2026-10-09 local variant (3090, ×2, §Gate record): M2 PASS 1.00 / 0.92 (was 0.46 ×2); 37-M1 PASS 0.95 (judge first) / run 2 PASS 2026-10-10 on an uncontended controller (§3090 measurements 2026-10-10); L6-C PASS 0.8 / 0.9 (was 0.5 ×2); Q1-M1 not decided (arm 20 can no longer carry 20 keys under B2's scope budget)**. Pod re-measure still owed (local-variant numbers) | pod |
| M9 | Lorebook R5: Cast and place sheets "after character definitions" vs depth 4 | needs a real-model A/B on prefix stability and quality; the first same-member diff is earlier (Vector Storage, depth-10 player role) | pod |
| M10 | Lore selection after R12: calls per reply, exclusive-mode effect under scan mode | before: ~5 judge calls per reply, exclusive refused in file mode. **2026-10-10 (3090)**: still ~5 per reply (p50 7 / p95 15 / max 17 per turn); exclusive never applied (`no-selection`, F21) | 3090 |
| M11 | Send-to-line latency by turn decile after `43a16f4a` and F1 | batch 3 max 4.5 s, mostly 25–40 ms. **2026-10-10 (3090)**: p50 323 ms, p95 8.5 s, max 14.2 s (F19) | 3090 |
| M12 | Warden timeouts after the warden fix | see the warden task's record. **2026-10-10 (3090, C3 ×2 on `ddf021bd`)**: not met: warden 1 / 103, 6 / 114; wardenLore 4 / 99, 7 / 109 (F22) | 3090 |
| M13 | Keyword-scan recall on the lore lab after the campaign key tightening | 0.25 → 0.26 | none |
| M14 | Phase C ×2 from zero on one build | symbolic now; runs when there is budget | pod |
| M15 | v2.8 01 owed: Q-M5/P3, inner voice B2/C, W6, R4, funded thinking A/B | unchanged | pod |
| M16 | D2 agenda proposals in real play: a character-life story in a group, real memory model (no `debugResponse`), Author view; play past a checkpoint change and a scene break; check one pass per trigger and none within `MEANWHILE_MIN_GAP` (8) boundaries or while a proposal waits, the proposal stays `proposed` until accepted, an accepted one lands at the next reply (`appliedAt`) and appears only in the holder's private block (`getAppliedEpistemicBlock` / payload capture with `onMemberDrafted`), never in a player surface (`so-ui.mts assert-player-clean`); swipe the landing reply (back to `accepted`, lands again); cost per pass (one curator call, 300 tokens max). Re-run 37-L3 (`so-b1-meanwhile.mts`) on the shipped build | built 2026-10-09 (`v2.8-agenda-proposals`), jest + no-model only; the 3090 was busy, so no real-model run | pod or 3090 |
| M17 | v2.8 11 J8 create checks ×2 (positive with the activation proof first, then unestablished name, createCap, auto never creates, excluded/gated title refused at the write edge, unmeasured route refused with "Only on a measured model" on), group chat, curator + main reply on cloud profiles | not run (needs the reply model and a staged build) | cloud + reply model |
| M18 | v2.8 09 live Q&A ×2 (`so-ask-qa.mts run`, `test/measurements/v2.8/09/ask-qa.json`, floors predeclared): author 17 of 20 cited + correct Show me, player 8 of 8 clean. Model (owner 2026-10-10, final): DeepSeek, the authoring role's default; never Artemis | **2026-10-10 (lanes 45/46, `v2.8-wizard-measure`, 09 Gate record §Measurements)**: DeepSeek flash 17/20 + 8/8 PASS, 16/20 + 8/8 FAIL (floor not met ×2), 3.0 s median per question; gpt-6.1-sol (opencode) 18/20 + 8/8 ×2 PASS, 24-26 s median (a first sol run void: C: disk full) | cloud (DeepSeek) |
| M19 | v2.8 09 wizard on DeepSeek ×2: `so-wizard-agent.mts recipes` (`test/measurements/v2.8/09/recipes.json`: quest-line, character-life, chapters end to end), `run` and `safety` on the product route (the authoring role's DeepSeek default, native tool calls through the profile tool bridge; `--route harness` checks it) against `--route local` (text JSON on the same profile) | **2026-10-10 two consecutive runs of run, safety and recipes, three arms (lane 27's §F run 1 stays in 09)** (09 Gate record §Measurements): flash native W1 0.832/0.802, W2 1 and 2 of 3 finished (FAIL), W3 pass, recipes 0/3 ×2, W5 0/20 ×2; flash text W1 0.810/0.825, W2 0 of 3 ×2, recipes 1/3 and 0/3, W5 0/20 ×2; sol bridge W1 0.967/0.900, W2 0 of 3 ×2, recipes 1/3 and 2/3, W5 0/20 ×2. §F floor FAIL ×2 on refused calls (17 > 10, 16 > 7). Unfinished = step budget or the done check's group rule | cloud (DeepSeek) |
| M20 | v2.8 09 player Ask in real play: a group chat mid-story, Author view off, `/story ask` and the Help box on the reply model's install; the answer names nothing unreached (`so-ui.mts assert-player-clean` with the answer open), a refused read is journaled once | **2026-10-10 ×2 PASS** (`live-v28-09-ask-player-play.json`, lane 45, DeepSeek flash as reply and authoring model, no 3090/pod): 3 real turns, 3 real player questions + the Help box, nothing unreached, `assert-player-clean` no findings; no read refused, so the journal line stays unexercised live | integration (reply model) |

## Fix

| # | What | Evidence |
|---|---|---|
| F1 | Send latency: keep `/api/vector/query` bursts out of the send window | v2.8 01 §H |
| F2 | Saga downtime: a passed posting's scene stays on through the generated stretch. Transitions and generated stubs carry no World Info effects | campaign lore fixes 2026-10-09. **Fixed 2026-10-09** (`v2.8-small-fixes`): `mergeExpansions` copies the expanded intermediate's own `effects.world_info` onto the stretch's first generated beat (an expanded intermediate is never entered, so its beat lore was lost; unexpanded it already applied). The path replay is unchanged, so rollback ≡ replay holds (property tests green) and the gated set is the same. Authoring: put the passed scene's `disable` on the downtime intermediate (story guide, Beat lore). The campaign still has to add those disables; no transition-level field |
| F3 | Card pulls starve in crowded reads (1 of 7 kept); consider a minimum share; `REL_AXES_PER_READ` 8 vs 37-M2's 4; author-view overflow checks report budget drops | scope budget task 2026-10-09. **Fixed 2026-10-09** (`v2.8-small-fixes`): `CARD_MIN_SHARE` 1 rotating card slot inside the same budget (every card within 7 reads in the S-17 fixture, no extra tokens); `quest-scope-overflow` / `relationship-scope-overflow` read the budgeted scope (`scope.ts` `scopeOverflow`); `REL_AXES_PER_READ` stays 8 (the budget, not the cap, bounds the cost at +5 keys ≈ +10.3 %; 4 starves others' axes). Decision record: v2.7 39 §B2 record addendum. S-17 / 37-S17 CL re-run still owed (M7) |
| F4 | K3 lab check simulates one boundary per turn; real runs commit 1.4–1.6 (multi-voice) | F-B1c-5 |
| F5 | Quest completion recall (0.46 vs 0.80) | 36-Q1-M2. **Fixed 2026-10-09** (`v2.8-reads-accuracy`): the live-suite fixture run never passed the running total the shipped read shows a monotonic count, so every miss wrote evidence 2 → 1; plus a parse tolerance for `evidence=3 value=3`. Local ×2 1.00 / 0.92, 0 false latches |
| F6 | Relationship direction accuracy (0.20 vs 0.80) | 37-M1. **Fixed 2026-10-09**: axes read as a direction (up/down, never a level), member names in rubrics, and the typed judge's 11-level request was invalid in every read of a story with relationships (now a three-level direction on its own confidence). Local run 1 PASS, arm (c) passes: default read path judge first |
| F7 | Voice warden OOC recall (0.5 vs 0.80) | 37-L6-C. **Fixed 2026-10-09**: voice question checks role, drive and feelings, plus a drive question; feelings reach the judge without a raw `{{user}}`. ×2 0.8 / 0.9, 0 false notes. Label voice-04 disputed by the second model (row stays as labelled) |
| F8 | The warden counts an empty reply as rendered | B1 attempt 2. **Fixed 2026-10-09** (`v2.8-small-fixes`): the lifecycle's `settled` intent carries the rendered message id, and the wiring passes `emptyReply.settledOnReply` (rendered and not `isThoughtOnlyReply` under the install's reasoning tags) to `commitContinuityNote`, so a thought-only reply leaves the warden note (and the chapter bridge note, same call) accepted for the recovery swipe; lore evidence keeps the raw flag. Jest only; live: an empty-reply recovery with a warden note pending |
| F9 | Judge-plugin 429 bursts (13 in 2 min) | C3 local-variant. **Fixed 2026-10-10** (`v2.8-judge-throughput`, §Judge throughput): every 429 in the 3090 C3 run was the plugin's own (169 local, 0 from TypeSafe), its per-user token second (33,333/s under judge share 3) refusing lore chunks. Plugin 1.8.0 paces a call inside its 2 s wait instead of refusing, and with ST user accounts off the one user gets the whole account share. Lane 14 stress (share 3): lore busy 100 % -> 0 %, other uses 9/100 busy -> 0 |
| F10 | D rows with no runner | F15 |
| F11 | `sessions:archive` gzips files over 90 MB before pushing | task chip 2026-10-08. **Fixed 2026-10-09** (`v2.8-small-fixes`): `scripts/lib/sessionsArchive.mjs` gzips (-9, only the `.gz` kept) every new or modified file over 90 MB in the so-sessions work tree before `add -A`, and refuses (nothing staged) when a changed file is still over 95 MB; node:test on a temp repo, never run against the real one |
| F12 | 3090 cannot hold the "normal" profile with the v1m GGUF, and the pods run v1.1; decide model-file parity for local rows | C3 local-variant |
| F13 | Campaign sprite fixes | v2.7 38 |
| F14 | Whatever the owner flags while playing with every feature on | owner sessions |
| F15 | The settings reader writes its full sanitized result back, so a changed default never reaches an existing install (judge uses, `spikes.*`, `cardOverlay`, `onDemand` stay at a stored `false`; R7 needed a `gatingChosen` marker). Persist only what the user changed, then drop the marker | features-on and R7 tasks 2026-10-09. **Fixed 2026-10-09** (`v2.8-settings-delta`): the store holds a delta over the defaults (`runtime/settingsDelta.ts`, `readGlobalSettings`/`globalSettingsDelta`), a read never writes, a value written back to its default leaves the store; `gatingChosen` and the Image Director settings import removed; harness raw reads/restores made delta-safe. jest `settingsDelta.test.ts` (flip reaches an untouched install, a set value survives, a read never writes) |
| F16 | Lore selection still costs about 5 judge calls per reply (263 candidates in chunks of 64); R12 saved about 0.1. Needs larger chunks or narrower book lists | R12 measurement. **Fixed 2026-10-10**: candidates packed into as few requests as the documented 64,000-token limit (minus 10 %) allows, split evenly: 263 lore-sized -> 2 calls per selection (stress 5.0 -> 2.0). TypeSafe 263 questions p50 608 ms vs 64 p50 311 ms; recall/precision unchanged on both lore fixtures ×3 |
| F17 | Director timeouts: 36 of 155 calls over the 1500 ms budget (p50 about 960 ms) on the 3090 C3 run | warden fix record, v2.8 01 §B. **Cause found, fixed 2026-10-10**: not queueing behind lore (no director call overlapped one), not request size (4–6 K state chars), not the provider (network p50 ~600 ms in that run, all 36 answers arrived in 0.4–1.9 s): the page held each answer past its budget while the main thread rebuilt the runtime snapshot (the sprite stage built one per actor per streamed token). Hot readers take the cached snapshot; one-turn profile getSnapshot 3.5 s -> 0.5 s. Budget unchanged (shown right) |
| F18 | F1 send latency shares its cause with the warden timeouts (consolidation embeddings blocking ST's thread); re-measure M11 after the vector-yield fix (`runtime/vectorYield.ts`) before building more | warden fix 2026-10-09. **2026-10-10 (3090, §3090 measurements M11)**: still p95 8.5 s / max 14.2 s locally, and 12 of 14 slow sends were not near a consolidation pass; see F19 |
| F19 | On the 1-slot controller the player's line is taken only after the drafted member's inner-voice call returns, and that call queues behind extraction reads (3 slowest sends: 10–14 s). Check by trace whether the inner beat runs before ST posts the line; if so, post first | §3090 measurements 2026-10-10, M11. **Fixed 2026-10-10** (`cb371721`): the beat starts at GROUP_MEMBER_DRAFTED and is awaited in the generate interceptor (`runtime/draftedBeat.ts`), so ST posts the line first; the 3090 M11 run was on `ddf021bd`, before it |
| F20 | Long local chats overflow the 32K profile: at turn ~71 a reply request carried 32,848 tokens with ST `max_context` 32768 (ST "Error counting tokens"); the controller answers 409 and tries to load `normal` | §3090 measurements 2026-10-10, item 3 (branch `v2.8-3090-measure`). **Investigated 2026-10-09** (`v2.8-small-fixes`): not ours. 32,848 is the controller's `prompt + n_predict + 256` (`backend.mjs` `forRequest`), so ST's own fill (≤ `max_context - amount_gen`) was 176 under 32768 and the 256-token gateway margin made it overflow; every story block is set before ST's budget pass and counted (ST source lines and a no-model lane 5 dry-run probe: prompt 165 / 168 tokens under budget). "Error counting tokens" is ST's `/tokenize` hitting the same 409. Margin rule in the debug skill: local `max_context` ≤ 32000. Owner option instead: drop the +256 from the controller's fast/normal decision |
| F22 | C3 ×2 not met on `ddf021bd` (3090): warden 1 / 103 then 6 / 114, wardenLore 4 / 99 then 7 / 109. No timeout near a consolidation pass; run 2's come in 2-minute bursts across every judge use, mostly `queue`. Attribute the bursts (plugin `/status` served counts and TypeSafe latency per minute), then decide plugin capacity, lore-select chunking (F16/F21) or judge share | §3090 measurements 2026-10-10, item 3 |
| F21 | Exclusive lore select never applies: with every signal on, each loud generation refuses `no-selection`, because about 45 % of lore-select chunk calls fall back `busy` (judge-plugin 429/503) and the selection is never complete. Fewer, larger chunks (F16) or a retry for the missing chunks | §3090 measurements 2026-10-10, M10. **Fixed 2026-10-10** with F9 + F16 + one retry of a `busy`/`timeout` chunk after a cool-down of at most 1 s: lane 14 (share 3) exclusive applied 1/18 -> 16/16 loud generations, stress 0/20 -> 20/20 complete selections |

## Develop

| # | What | Plan |
|---|---|---|
| D1 | C12 lore-select batching, C13-b digest, C11 model-driven items, R4 gate lift + Studio control | v2.8 01 |
| D2 | Agenda proposals wired into play. **Built 2026-10-09** (`v2.8-agenda-proposals`): review mode on by default, cadence on checkpoint changes and scene breaks, accepted proposals land at the next boundary; real-model check owed (M16) | v2.7 37 L3 |
| D3 | Smart-context harvest and inner voice L5, as spikes | v2.8 21, v2.7 20 L5 |
| D4 | Curator `create` op | v2.8 11 |
| D5 | Wizard assistant, briefing drafting | v2.8 09, 10 |
| D6 | Living story director | v2.8 22 |
| D7 | Story widgets (rest after option A) | v2.8 23 |
| D8 | GPU broker in the ST plugin, image workflows per story, model downloads | v2.8 28, 29, 30 |
| D9 | TunnelVision re-harvest | v2.8 25 |
| D10 | Story presence panels C4/C5/C7/C9a (what is left) | v2.8 04 |
| D11 | Lorebook features the campaign could still use: outlets, regex keys, NOT logic, triggers | lorebook review |

## Test setup (next pod round)

- Check the real RunPod balance before any pod run; an approval is not credit.
- No dedicated memory pod: each reply pod runs its own lanes' memory at `LLM_PARALLEL` 4.
- The 3090 takes the light and model-independent rows.
- Use as few pods as possible (39a run plan, e02af9c6).

## Gate record (2026-10-09, branch `v2.8-reads-accuracy`, F5–F7 / M8 on the local 3090)

**Local variant, not pod evidence.** Lane 11 on a private ST code copy (the real ST slot, lane 0 and :8000 untouched), seeded by
`adolion-fresh seed 11` (campaign pin `6709a3a6`), every profile and role on the 3090 controller :18888 profile `fast` (32K, 1 slot,
GGUF `Artemis-31B-v1m-Q4_K_M`, not the pods' v1.1; shared with another task's requests throughout), ST `max_context` 32768, images and
sprites off. Read profile "Story Orchestrator Memory RunPod" (pointed at :18888); judge TypeSafe `jev-1.13.0`. Baseline build `039acb28`
(bundle `73717c0b4b0f`), fixed build bundle `f5116f172db7` (the tree committed as `02372e18`; a rebuild reproduces the hash). Drivers as in 39's command
table; public records were moved out of `test/phase-c/records/` after each run (the pod records there are unchanged). Evidence (private):
`so-sessions:evidence/phase-c/reads-2026-10-09/` (raws, records, logs, dev rows, second opinion). `sessions:archive` not run.

| Row | Before ×2 (local) | After ×2 (local) | Cause | Fix |
|---|---|---|---|---|
| 36-Q1-M2 | FAIL / FAIL: recall 0.4615 (6/13), 0 false | **PASS / PASS: 1.00 (13/13), 0.92 (12/13), 0 false** | Every miss was the quest's running count written back down (current 2, read 1): the shipped read tells a monotonic count its current value (T6-4 `runningTotalRule`), but `buildFixtureRun` never passed `counted`, so the row measured a prompt the product does not send. Then the local model restated a value in the bare form (`key=3 value=3`), refused as invalid | `fixtureRun.ts` passes `runningTotals` (parity test against the shared read); the parser takes an identical restated value (`key=3 value=3`; two different values and quoted numbers stay refused, A36) |
| 37-M1 | FAIL / INCOMPLETE: (a) 0.60 / 0.60, stuck 0.50 / 0.50; (b) 0.75 / 0.65; (c) = (a), judge never answered | **Run 1 PASS**: (a) 0.95 stuck 0.0625, (b) 0.95, (c) 0.95 stuck 0, gap 0, 0 clamp violations, default path **judge first** (16/20 axes judge-answered). **Run 2 INCOMPLETE ×4 attempts**, each only for 1–2 reads that timed out at ~60 s on the shared 1-slot controller (p90 read 45–57 s); every complete arm in them passed (a 0.95/0.0625 in three attempts, b 1.0/0 twice, c 0.95/0 once) | (1) The read asked for a level on −5..5 while hiding the current value: the model wrote absolute levels (raw over step) or nothing (stuck). (2) The typed judge sent an 11-level score for every −5..5 axis; the judge refuses more than 10 levels, so the **whole** typed request fell back `invalid` on every read of a story with relationships (also on the pod run: arm (c) there was the extractor). (3) Once valid, the judge's direction was right on all 16 moving windows but never taken: its confidence was capped by a separate presence question. (4) Rubrics named roster ids, not member names | Stepped int qualities read as a direction (`"up"`/`"down"`, resolved one step from the blackboard value, start when unread; numbers still parse and clamp); member names in rubrics; the rule says feelings move on deeds as well as words, and a stepped read ends with one reminder (no change for stories without relationships); the typed judge asks a three-level direction on its own confidence (floor 0.8 unchanged), and a rating with more than ten levels is left to the LLM read instead of invalidating the request |
| 37-L6-C | FAIL / FAIL: OOC recall 0.5, false notes 0 | **PASS / PASS: 0.8, 0.9; false notes 0, rewrite/player notes 0, fallbacks 0** | The question held a note back unless "no version of them" would speak so: replies that turned from the character's drive scored in character. Feelings reached the judge with a raw `{{user}}` | Voice score names going against role, drive or feelings as out of character unless the reply shows why; a drive question (noul, asked only with a drive) notes p ≥ 0.5 (`VOICE_DRIVE_P`; `VOICE_SCORE` 0.75 unchanged); `{{user}}` → "the player" |
| 36-Q1-M1 | INCOMPLETE / INCOMPLETE (facts 0–1/15 on the local model, arm 5 one errored read in run 1) | **INCOMPLETE / INCOMPLETE**: deltas tier 1.00 → 0.95 (run 1, one case), 0.95 flat (run 2); facts 0/15 every arm; tokens arm 5 +5.9 %; arm 5 p50 latency +43 % / +24 % (shared controller) | Not a read defect found here. Since B2's `SCOPE_EXTRA_BUDGET` (2026-10-09) arm 20 can carry only 17 extra quest keys (card pulls give way first), so the runner marks every run INCOMPLETE; one case is 5 points against a 3-point floor; the local model writes its clues as `MEMORY revelation` lines, so the facts tier (FACT lines) is ~0 locally; latency on a shared 1-slot controller is not a measurement | None in product. Owed: the M1 arm runner and the B2 budget need a decision (measure per-key cost with the budget lifted, or retire M1 into S-17) — not changed here (never change the scorer to pass) |

**Method.** Each row was reproduced first on the baseline build. Wording for F6 and F7 was chosen on agent-written dev rows and
windows (private, `voice-dev*.json`, `devlab*`), then checked on the scored set; the floors, scorers and labels are unchanged.

**Labels.** The two voice rows both after-runs missed (voice-04, voice-17) were sent for a second opinion (`codex exec -m
gpt-6.1-sol`, high, read-only): voice-04 **DISAGREE**, the right label is `in` (the scene the row comes from explains the reaction, so
its stated reason does not hold); voice-17 **CONTEXT** (the `ooc` label holds only with scene facts the row does not carry; the
relevant feeling starts at 0). Reasons in the private evidence (campaign content). Rows kept as labelled; both runs pass with voice-04 counted as a
miss. No relationship or quest label was disputed (rel-10's earlier relabel stands).

**Commits.** `d7f945a3` (F6: direction read, typed judge, restated-value parse, guide), `b7a32988` (F5: fixture running totals +
parity test), `02372e18` (F7), and this record.

**Gates.** `npm run gates -- --no-storybook` on `02372e18`: all green in 86.4 s (typecheck, typecheck:test, build, debug:typecheck,
test 611 suites / 7,083 passed / 1 skipped, test:plugin 111 / 114 (3 skipped), test:release 115 / 129 (14 skipped), test:debug
1,231 / 1,231, test:replay 32 of 32 killed, lint).
`test-storybook:ci` SKIPPED (worktree); stories to re-run for the regenerated guide text: `HelpPanel.stories.tsx`,
`GuideDisclosure.stories.tsx`, `StudioModal.stories.tsx`. Lane 11 stopped; the controller left on `fast`.

**What remains.** Pod re-measure of M8 (these are local-variant numbers); 37-M1 run 2 on an uncontended controller; the 36-Q1-M1 runner
vs the B2 budget; whether the judge-first default for relationships changes any `judge.uses` setting (it is the existing typed path,
on by default).

## 3090 measurements 2026-10-10 (branch `v2.8-3090-measure`)

**Local variant, not pod evidence.** Every number in this section comes from the owner's RTX 3090: controller `:18888` profile `fast`
(32K, 1 slot, GGUF `Artemis-31B-v1m-Q4_K_M`, not the pods' v1.1), its config untouched, one model lane at a time and nothing else on
the controller (`activeText` checked before each run). Lanes 12 (model) and 13 (no model) on a private ST code copy
(`C:\dev\so-lanes\agent-st-3090m`, data junctioned read-only to the real install for the seed; the real ST slot, lane 0 and :8000
untouched), each seeded by `adolion-fresh seed <n>` (campaign pin `6709a3a6`), every profile and role on the controller, ST
`max_context` 32768, images and sprites off, judge TypeSafe (plugin 1.7.0, judge share 3). Build master `ddf021bd` (bundle
`1149a1ce5a07`) unless a row says otherwise. Private evidence: `test/sessions/evidence/phase-c/3090-2026-10-10/` (`sessions:archive`
not run).

### 1. 37-M1 run 2 (uncontended)

`so-b1-life-reads.mts m1 --lab <campaign lab/life> --profile "Story Orchestrator Memory RunPod" --run 2`, 18:28–18:37Z, 20 windows,
no read errors, no timeouts (read p50 8.4–9.8 s, max 13.9 s per arm; the contended run 2 attempts of 2026-10-09 had p90 45–57 s).

| Arm | Direction | Stuck (of 16 moving) | Clamp violations | Judge answered |
|---|---|---|---|---|
| (a) value hidden, shipped prompt | 0.95 | 0.0625 (1) | 0 | — |
| (b) value shown | 1.00 | 0 | 0 | — |
| (c) typed judge | 0.95 | 0 | 0 | 16 / 20 |

**PASS** (run 1 PASS 2026-10-09, so 37-M1 is PASS ×2 locally). Gap (a) below (b): 5 points, at the 5-point limit (ok). Default
path: judge first (arm c passed). The one (a) miss is a stuck window (label down, no move); the one (c) miss moved on a window
labelled no change.

### 2. Scan mode (the default since R7) live, v2.5 01 G1–G8 equivalents

`live-v25-01-real-books.json` cannot run as written under R7: it requires a lane still in file mode with an empty ledger and switches
through the confirm, while a fresh lane now normalises by itself at its first start. Its gates were taken over the same assertions on
fresh adolion-fresh lanes (library = the nine Adolion stories plus the install's own; gated set 323 entries in 14 books, recomputed
from the authored effects, independently of `src/runtime`).

| Gate | Result | How |
|---|---|---|
| G2 | **exact** ×2 (lanes 12, 13) | At rest after the first start: mode `scan` (not chosen), ledger 14 books / 323 entries; against the campaign's exported books: 323 / 323 present gated entries off and in the ledger, 0 gated entries changed beyond `disable`, 0 non-gated entries changed, 0 added or removed. The campaign ships every gated entry off, so the normalisation wrote nothing here (R7's no-model run covered the flip). Second start (reload, lane 13): every book file byte-identical (sha256) |
| G3 | **GREEN ×2** strict | J7 (sun-ruins) `--wi-gating scan`, lane 12: 8 pass / 0 fail each (1,520 s, 1,678 s), 8 of 8 first try, cleanup clean |
| G4 | **GREEN** | J3 `--wi-gating scan` ×2 (8 pass / 0 fail, 164 s, 150 s, first try) and J7 `--wi-gating file` ×1 (8 pass / 0 fail, 1,404 s); the lane came back in `scan` (not chosen) after the file run; header diffs only the open chat |
| G5 | **PASS ×2** (lane 13, no model) | One normalised entry hand-enabled through ST's API, page reloaded: the start-up verify reports it (drift 1, the only one), the author's Repair row "switched on outside the story" shows, the file still has it on (not switched off silently); re-normalise: file off, drift 0, row gone, 1 book write. Book hashes after both runs identical to before. The extension-disabled half and G1 (c) (manual, extension off) not run |
| G1 | **PASS** ×2 (C3 run 1 and run 2 chats) | Adolion saga chat after 71 real turns over a 9-checkpoint path: scan view 323 / 323 gated entries as the path says (0 wrong, 0 unseen), owner `story`, drift 0, missingKey 0; T12 ring 20 loud-generation slots, 0 entries from another story's gated set, 0 flags |
| G8 | **PASS** ×3 (two chats) | 40 + 10 dry scans over the 14 ledger books: p95 4.1 / 3.7 ms (run 1 chat), 3.2 ms (run 2 chat) (≤ 5), max 7.1 ms |
| G7 | not run | clean host per README ST version; unchanged, owed |

**M10 (lore selection under scan mode)**, C3 run 1 (fresh Adolion lane, loreSelect on, 71 turns, 108 replies): lore-select requests per
loud turn p50 7, p95 15, max 17 (546 requests, `so-b1-judge-causes score --row B1-C12`), about 5 per reply: unchanged from before
R12 (p50 7, p95 16, max 18). 174 of 382 sent lore calls came back `busy` (plugin 429/503 after the client's retries), 9 timed out.
**Exclusive mode never applied.** During the C3 play it was off by the harness (`--judge-uses` lists the C3 uses and not
`loreExclusive`: refusal `use-off`). In 3 extra turns in the same chat with the install default (`loreExclusive` on, story
`lore_select.exclusive: true`, scan mode, vectors WI off) every loud generation refused it with `no-selection`: the selection is
never complete for a message while chunks fall back `busy`. New row F21.

**M11 (send-to-line latency, H15b `SEND-TAKEN`)**, C3 run 1: 71 sends, all taken; p50 323 ms, p95 8,475 ms, max 14,202 ms, 14 over
1 s; by decile (p50/p95 ms) 31/34, 1895/5072, 221/12558, 46/8475, 140/10202, 323/2910, 264/414, 367/14202, 414/7503, 421/528. The
c3fix final run (same vector-yield build line) read p50 329, p95 9,870, max 21,063, 25 over 1 s. **Not the consolidation cause
here**: 2 of the 14 slow sends started within 20 s of a consolidation pass (7 of 57 fast ones did). In the three slowest (14.2,
12.6, 10.2 s) the line was taken 0.2–0.5 s after a memory-model call (`inner`, an extraction read) finished on the 1-slot
controller (in all three an inner-voice call, itself queued behind an extraction read): the player's line appears to wait for the
drafted member's inner-voice call. New row F19 (a local 1-slot shape so far; the pods' multi-slot runs read p50 ~60 ms; not proven
by a trace).

### 3. B1-C3 ×2 on one build (`ddf021bd`, bundle `1149a1ce5a07`)

Same play as the warden task (`c3-run.sh`, a copy of c3fix's): SP6 saga lab journey at the campaign pin, control arm, the C3 judge
uses (`director,memoryVerify,memoryPairs,sceneTrigger,sceneTracker,lookahead,loreSelect,curatorFilter,typedExtraction,stallCheck,
expansionCritic,expansionLookahead,agencyCheck,wardenLore,warden`), warden `auto`, judge share 3, each run on a freshly seeded lane.
Diagnostic, never a manifest slot.

| Run | Lane | Turns | warden calls / timeouts | wardenLore calls / timeouts | `score --row B1-C3` | director calls / timeouts (answered > 1,500 ms) |
|---|---|---|---|---|---|---|
| 1 | 13, 20:08–23:14Z | 71 | 103 / 1 (queue) | 99 / 4 (queue 3, unattributed 1) | INCOMPLETE (wardenLore 99 < 100) | 147 / 0 (40) |
| 2 | 12, 23:36–02:30Z | 73 | 114 / 6 (queue 4, provider 1, unattributed 1) | 109 / 7 (queue 5, provider 1, unattributed 1) | **FAIL** (both over 1 per 50) | 155 / 8 (54) |

**Verdict: not met ×2.** Run 2 FAILs warden and wardenLore; run 1 is INCOMPLETE with wardenLore already at 4 timeouts. The
warden fix's single 0 / 114 run (c3fix final) does not repeat on this build. Run 2 other uses (calls / timeouts / `busy`): lore 426 /
20 / 186, scene 113 / 4, typed 157 / 4 / 13, memoryVerify 99 / 3, memoryPairs 48 / 2, critic 2 / 1; warden provider p50 1,448 / p95
3,398 ms. C12: p50 8, p95 16, max 22 lore-select requests per loud turn (621 requests, 72 turns).

- **Not the consolidation cause any more**: 0 of the timeouts of either run (all uses) started within 10 s of a consolidation pass
  (12 and 26 passes), so the vector yield holds.
- **Run 2's timeouts come in bursts across every use**: 55 timeouts, 17 of them in 00:46:57–00:49:04Z over 8 uses, another 6 in
  00:23:29–00:23:40Z; mostly `queue` (the plugin had not passed the call on at the budget). Judge-plugin 429s were about the same in
  both runs (~170 recorded). This reads as plugin or provider capacity during those minutes (1 user, 2 slots, judge share 3, lore
  select filling the queue with 4–8 chunk calls per reply), not as a warden-path defect; not attributed further here. Row F22.
- G1 and G8 repeated in run 2's chat: 323 / 323 matched, 0 foreign in 20 ring slots; scans p95 3.2 ms. **G1 and G8 are PASS ×2.**
- M11 in run 2: p50 373 ms, p95 7,165 ms, max 35,610 ms, 9 over 1 s, 0 of them near a consolidation pass (F19).
- Run 2 also stopped on the 32K overflow (request of 32,900 tokens, F20), at turn 73. The harness fix skipped the jump prompts
  without a stall.

### 4. 35-K3 / 35-K4 run 2 (local variant): one cell

Time allowed one cell: **judge on, release arm** (`k3-cell.sh`, a copy of b1c's `k3-lane.sh`: `--judge-uses agencyCheck
--warden-mode auto`), lane 13 freshly seeded, campaign lab journey at the pin `6709a3a6` (includes the fixed carried check
`c5f513bf`), 02:39–06:33Z, **98 / 98 turns**. The other three cells were not started: a cell took 3 h 54 min, past the 10:00Z stop.

| Row | Result (one run) | Detail |
|---|---|---|
| 35-K3 | **INCOMPLETE** | agency flags 0 (bar = control mean + 1, no control run); 15 release points, under the arm's predeclared 20 (the journey check failed on size, as F-B1c-5 describes for control arms) |
| 35-K4 | **INCOMPLETE** as scored (no ×2) | 0 restatements in 15 measured release replies (15 / 15 measured) |
| carried | 13 of 15 releases carried the block under the fixed check | the 2 not carried are not attributed here (the fixed check counts a release at a chain's last voice on the next turn) |

`so-sp6-score` on the one record: overall INCOMPLETE (each cell needs 2 runs). 141 replies; the product's empty-reply recovery fired 8
times. Send-to-line: p50 368 ms, p95 1,046 ms, max 34,858 ms (5 over 1 s). Deviation: the lane's `settings.json` `max_context` was set
to 30720 to leave margin for F20, but the reply request still carried `truncation_length` 32768 (the loaded preset's), and one request
of 32,848 tokens got the controller's 409 again (turn ~45); the round recovered and the run finished.

### Evidence, cleanup

`test/sessions/evidence/phase-c/3090-2026-10-10/` (private, not archived): drivers (`prep-local*.sh`, `row.sh`, `journey-batch.sh`,
`c3-run.sh`, `k3-cell.sh`, `g5-*.js`, `g-post*.{js,sh}`, `excl-probe.sh`, `*.cjs` counters), `m1/`, `scan/` (G2–G5 logs, J3/J7 batch
rows), `c3/run1`, `c3/run2` (journals, judge-cause samples, score records, raws, lane server logs, page evidence), `k3/`, seed logs,
gates log. Lanes 12 and 13 stopped; the controller left on `fast`, idle; the private ST copy deleted.

Run 1 other uses (calls / timeouts / `busy`): lore 382 / 9 / 174, scene 102 / 1, typed 150 / 0 / 13, memoryVerify 102 / 0 / 3,
memoryPairs 72 / 0, stall 19 / 0. Warden provider p50 1,114 / p95 2,608 ms; wardenLore 501 / 3,353 ms. `so-judge timeouts`: warden
closed (1 per 103), scene not closed (J11.25 not run here). Reply round p50 99.8 s, p95 192 s.

- **wardenLore 4 timeouts in 99** (> 1 per 50 as read, though under the 100-call minimum): 3 are `queue` (the plugin had not passed
  the call on at the budget) inside stretches with judge-plugin 429s; the c3fix final run read 0 / 111.
- **F17 director**: 0 timeouts in 147 (the c3fix middle run had 36 / 163, its final run 8 / 156); 40 answers arrived past 1,500 ms
  and were kept (the stall grace of `44bade38`). Recorded, not fixed.
- **Why runs stop near turn 71 on the 3090** (this run, and the three earlier local C3 runs at 71–81): the prompt outgrows the 32K
  profile. At turn 72 the reply request carried 32,848 tokens (ST `max_context` 32768; ST also logged "Error counting tokens"); the
  controller answered 409 `local_residency` ("needs the normal profile, which could not load … fast is loaded again"), twice, so the
  round produced no reply and the journey's `send_generate` failed. The controller tried to load `normal` on its own and fell back to
  `fast`; nothing here asked for it. Row F20.
- **Harness: a 43-minute stall at the first cross-chapter `/cp activate`.** Chapter sealing is on by default since features-on
  (2026-10-09), so a scripted jump raises the seal/skip prompt and the slash step waited on it. Run 1 was unblocked by an in-page
  watcher that chose "Jump without sealing" (the same outcome the c3fix runs had with sealing off; 2 prompts in the run); the slash
  helper now does this itself (`73c2279f`, test pins the product's text and label). No judge call was in flight during the stall.

## Judge throughput 2026-10-10 (branch `v2.8-judge-throughput`, F9 / F16 / F17 / F21)

**Rig.** Lane 14 on a private ST code copy (`C:\dev\so-lanes\agent-st-judge`; the real ST slot, lane 0 and :8000 untouched), seeded by
`adolion-fresh seed 14` (campaign pin `6709a3a6`, problems none), the saga story in a fresh chat each run. No GPU: every profile pointed at
a scripted llama.cpp stand-in on :18914 (fixed short replies, 2.5 s stream), so replies, boundaries, director, warden, scene and lore
passes all ran for real against TypeSafe (owner's key); the 3090 controller was never called. Judge share 3 (`st-lanes start --judge-lanes
3`, the 3090 C3 setting). Before = master `cb371721` (bundle `bfb805f23386`, plugin 1.7.0), after = this branch (bundle `2382a68eab0d`,
plugin 1.8.0). Two drivers: 15 real turns (`st-actions send`) and a stress probe of 20 boundaries (a `/sendas` reply, then the real lore
selector and director / warden / wardenLore / scene / typed requests of the 3090 run's sizes, all at once). Scripts and raw output are
private (scratch, not archived).

| Measure | Before | After |
|---|---|---|
| Lore judge calls per loud generation (turns) | 8.3 (133 / 16, 73 `busy`) | 3.4 (58 / 16, 0 `busy`) |
| Lore calls per selection (stress) | 2.7 sent, 100 % `busy` | 2.0, 0 `busy` |
| Lore busy fallback rate (turns / stress) | 59 % / 100 % | 0 / 0 |
| Other uses `busy` (stress) | 9 / 100 (page cool-down after a local 429) | 0 / 100 |
| Exclusive applied, loud generations (turns) | 1 / 18 (17 `no-selection`) | 16 / 16 |
| Complete selections (stress) | 0 / 20 | 20 / 20 |
| Director timeouts (turns + stress) | 0 / 53 | 0 / 51 |
| Warden timeouts (turns + stress) | 0 / 57 | 0 / 53 |
| Director page delay after the network answer, p95 / max (turns) | 94 / 736 ms | 55 / 84 ms |
| Page long tasks over 15 turns, total / max | 139.7 s / 2.7 s | 69.6 s / 1.0 s |
| One-turn CPU profile: getSnapshot / extension total | 3,459 / 4,270 ms | 549 / 2,230 ms |

**F9 / F21 cause.** The 3090 C3 run's plugin log shows 169 refusals, all `local`, `upstreamBusyAnswers` 0, every one a lore chunk with
`Retry-After: 1` and at most one other call in flight: the per-user token second (2 x 83,333 / 5 = 33,333 tokens/s under share 3) refused
the second ~19 K-token lore chunk in a second, and the page then cooled every use for that second. The stand-in lane reproduces it at share
3 (and not at share 1, where the per-user second is 100,000). Fixes: plugin 1.8.0 waits for the window inside its 2 s queue wait and refuses
only past it; with ST user accounts off the one user's share is the lane's whole account share; lore asks 2 requests instead of 5; a chunk
that still falls back `busy` or `timeout` is asked once more after the page's cool-down when that is at most 1 s.

**F17 cause.** In c3fix's middle run (36 director timeouts) every timed-out director call had nothing else in flight at the plugin, and the
fetch had its answer in 0.4–1.9 s; the page took 0.1–3.0 s more to read it (page latency minus fetch time, director p50 575 ms, scene 366,
warden 450; lore and memory uses, which run outside the reply boundary, ~0). A CPU profile of one turn attributes the main thread to the
extension's own snapshot builds (3.5 s of a 15 s turn), most of it the sprite stage calling `getSnapshot()` (uncached) per actor per streamed
token. The director budget (1500 ms) is not wrong for the request size: TypeSafe answered director requests in p50 ~260 ms (lane) / ~420–600
ms (3090 runs), p95 < 1.1 s. Not changed here: the drafted member's private block build (~0.6 s per draft in the profile) and ST's own
`getContext()` cost inside snapshot builds.

**Live A/B of the chunk shape** (`calibrate-node`-style, real TypeSafe, 3 reps): lore fixture recall 0.878 / precision 0.929 both shapes;
lore-holdout 0.786 / 1.000 both shapes (mean p(needed) 0.739 vs 0.738). The holdout golden (recorded 2026-09-19, 26/27) now replays per
question, since the same answers fill one request. **Drift found:** the holdout's live recall today is 0.786 in either shape, under its 0.8
floor (the recorded golden still passes); the golden is not re-recorded here.

**Tests (controls fail on the old code).** `plugin.test.mjs` F9 x5 (4 fail on 1.7.0: burst paced not refused, close while paced, the
single-user share, four lore-sized requests through the handler); `lore.test.ts` F16 (5 chunks on the old code); `loreSelect.test.ts` F21 x4
(retry after a cool-down; refused twice, long cool-down and judge error not retried); `stage.test.ts` F17 (28 snapshot builds for one
streamed reply on the old stage, 0 now).

**Gates.** `npm run gates -- --no-storybook` on this branch: all green in 162.1 s (typecheck, typecheck:test, build, debug:typecheck,
test 615 suites / 7,151 passed / 1 skipped, lint, test:release 115 / 129 (14 skipped), test:plugin 120 / 123 (3 skipped), test:debug
1,231 / 1,231, test:replay 32 of 32 killed). `test-storybook:ci` SKIPPED (worktree).

**Stories to re-run.** None changed (no `.tsx` or story file touched); `SpriteGroup` / stage stories read the stage, run them once:
`src/sprites/*.stories.tsx`.
## Gate record (2026-10-09, branch `v2.8-agenda-proposals`, D2)

Agenda proposals wired into play (architecture.md, "Character life" invariant). Design: own setting `stagecraft.meanwhileAcceptMode`
`review` (default) | `off`, never auto (plan 37: never auto-accepted); a pass on a checkpoint change (boundary work
`meanwhile-proposals`, order 66) or a confirmed scene break, only while an agenda is open, no proposal waits for the author and
`MEANWHILE_MIN_GAP` (8) boundaries passed since the last pass; accepted proposals land at the next boundary (`meanwhile-land`,
order 6) into the holder's private block only, and a rollback past the landing returns them to `accepted`. Text only, so no host
write and no effect-ledger row. Review: Accept / Reject in Author view (`CharacterLifePanel`).

- `npm run gates -- --no-storybook` (ST_ROOT set): **all green in 193.7 s** (typecheck, build, typecheck:test, test, debug:typecheck,
  lint, test:release, test:debug, test:plugin, test:replay 32 of 32 killed). `test-storybook:ci` SKIPPED (worktree); re-run
  `Drawer/CharacterLifePanel` (new `ReviewMeanwhileProposals`), `Settings/PlayGroups`, `Settings/SettingsPanel`, `Drawer/DrawerTabs`.
- Main entry `dist/index.js` 1,222,526 B (budget 1,250,000); the meanwhile prompt only in lazy chunks (`lazyHarness.guard.test.ts`
  `LAZY_MEANWHILE` + control).
- No-model plumbing: lane 8 (no-model) on a private ST code copy `C:\dev\so-lanes\agent-st-meanwhile`,
  `test/scenarios/v28-meanwhile-proposals.json --sandbox`: 17/17 green ×2 (evidence `C:\dev\so-lanes\8\debug\runs\2026-10-10T00-38-16-290Z-so-scenario-run`,
  `…2026-10-10T00-38-58-350Z-so-scenario-run`). The proposal text is a debugResponse: plumbing only, NOT the real-model gate (M16).
- Same lane: `v27-37-character-life.json` green; `v27-37-agenda-effect.json` was red at step 12 ("the step-two entry to switch on").
  Two causes. The fixture read the lorebook file's `disable` flag while the lane runs `worldInfo.gatingMode: scan` (the default),
  where gated entries are never toggled in the file. And a real defect under it: the scan gate (`worldInfoScan.ts`) and the
  file-mode scan guard (`worldInfoScanGuard.ts`) planned from the checkpoint path alone, without the earned switches the file
  path uses (quest rewards, landed agenda steps), so in scan mode an agenda or quest-reward entry never switched on, and in file
  mode the guard forced it back off in every scan copy. Fixed: both take the blackboard values, plan with `earnedSwitches`, and
  key their memo on them (`scanGateEarned.review.test.ts`, with a no-values control that shows the defect). The fixture now asserts
  what this chat's scan used (`snapshot.scanGate` after an in-page `getSortedEntries`, `on` = `effectiveDisabled === false`) and
  that scan mode never changes the file; the file-flag assertions moved to `v27-37-agenda-effect-file.json`, which switches to file
  mode first and restores it last (as `memory-mirror-file.json` does). Lane 8, no model: scan leg 17/17 ×2, file leg 19/19 ×2
  (mode restored to scan both times); `v28-meanwhile-proposals`, `v27-37-character-life`, `v27-36-quest-lifecycle` green on the
  same build. Both legs end with a residue sweep of the untitled wizard session `applyProvisioning` records (pre-existing).
- After the scan-gate fix: `npm run gates -- --no-storybook` all green in 156.8 s (test:replay 32 of 32 killed); Storybook SKIPPED.
