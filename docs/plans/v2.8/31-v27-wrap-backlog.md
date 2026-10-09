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
| M1 | 35-K3 and 35-K4 run 2 | run 1 PASS (batch 3); K3 under the fixed carried check (F-B1c-3) | pod |
| M2 | 35-K5 with enough releases (≥ 20 pooled) | 7–8 measured; control arms land under 20 (run variance, F-B1c-5); longer runs or more segments | pod |
| M3 | B1-C3 judge timeouts per use; B1-C12 lore-select requests per turn | pod run killed; the 3090 diagnostic had the warden at 7/118 timeouts and C12 p50 7, max 18 | pod (3090 diagnostic) |
| M4 | B1-EMPTY formal arms A/B | 8/8 recoveries seen incidentally in batch 3, not the formal row | pod |
| M5 | B1-NARR plus its rating pack | P3 Narrator holdings scoping, unmeasured | pod |
| M6 | B1-PFX (prompt-cache reuse) and B1-HIST (32K vs 98K history) | dropped for budget twice; decides the group cache layout (P4) and the history window (P1) | pod |
| M7 | S-17 / 37-S17 on the new scope budget (`extraction/scopeBudget.ts`) | FAIL ×2 at +17 % before the budget; pair fairness may count per axis, not per pair | pod |
| M8 | 36-Q1-M2 quest completion recall, 36-Q1-M1 scope, 37-M1 relationship direction, 37-L6-C voice warden OOC recall | 0.46, split, 0.20, 0.5. **2026-10-09 local variant (3090, ×2, §Gate record): M2 PASS 1.00 / 0.92 (was 0.46 ×2); 37-M1 PASS 0.95 (judge first) / see record; L6-C PASS 0.8 / 0.9 (was 0.5 ×2); Q1-M1 not decided (arm 20 can no longer carry 20 keys under B2's scope budget)**. Pod re-measure still owed (local-variant numbers) | pod |
| M9 | Lorebook R5: Cast and place sheets "after character definitions" vs depth 4 | needs a real-model A/B on prefix stability and quality; the first same-member diff is earlier (Vector Storage, depth-10 player role) | pod |
| M10 | Lore selection after R12: calls per reply, exclusive-mode effect under scan mode | before: ~5 judge calls per reply, exclusive refused in file mode | 3090 |
| M11 | Send-to-line latency by turn decile after `43a16f4a` and F1 | batch 3 max 4.5 s, mostly 25–40 ms | 3090 |
| M12 | Warden timeouts after the warden fix | see the warden task's record | 3090 |
| M13 | Keyword-scan recall on the lore lab after the campaign key tightening | 0.25 → 0.26 | none |
| M14 | Phase C ×2 from zero on one build | symbolic now; runs when there is budget | pod |
| M15 | v2.8 01 owed: Q-M5/P3, inner voice B2/C, W6, R4, funded thinking A/B | unchanged | pod |

## Fix

| # | What | Evidence |
|---|---|---|
| F1 | Send latency: keep `/api/vector/query` bursts out of the send window | v2.8 01 §H |
| F2 | Saga downtime: a passed posting's scene stays on through the generated stretch. Transitions and generated stubs carry no World Info effects | campaign lore fixes 2026-10-09 |
| F3 | Card pulls starve in crowded reads (1 of 7 kept); consider a minimum share; `REL_AXES_PER_READ` 8 vs 37-M2's 4; author-view overflow checks report budget drops | scope budget task 2026-10-09 |
| F4 | K3 lab check simulates one boundary per turn; real runs commit 1.4–1.6 (multi-voice) | F-B1c-5 |
| F5 | Quest completion recall (0.46 vs 0.80) | 36-Q1-M2. **Fixed 2026-10-09** (`v2.8-reads-accuracy`): the live-suite fixture run never passed the running total the shipped read shows a monotonic count, so every miss wrote evidence 2 → 1; plus a parse tolerance for `evidence=3 value=3`. Local ×2 1.00 / 0.92, 0 false latches |
| F6 | Relationship direction accuracy (0.20 vs 0.80) | 37-M1. **Fixed 2026-10-09**: axes read as a direction (up/down, never a level), member names in rubrics, and the typed judge's 11-level request was invalid in every read of a story with relationships (now a three-level direction on its own confidence). Local run 1 PASS, arm (c) passes: default read path judge first |
| F7 | Voice warden OOC recall (0.5 vs 0.80) | 37-L6-C. **Fixed 2026-10-09**: voice question checks role, drive and feelings, plus a drive question; feelings reach the judge without a raw `{{user}}`. ×2 0.8 / 0.9, 0 false notes. Label voice-04 disputed by the second model (row stays as labelled) |
| F8 | The warden counts an empty reply as rendered | B1 attempt 2 |
| F9 | Judge-plugin 429 bursts (13 in 2 min) | C3 local-variant |
| F10 | D rows with no runner | F15 |
| F11 | `sessions:archive` gzips files over 90 MB before pushing | task chip 2026-10-08 |
| F12 | 3090 cannot hold the "normal" profile with the v1m GGUF, and the pods run v1.1; decide model-file parity for local rows | C3 local-variant |
| F13 | Campaign sprite fixes | v2.7 38 |
| F14 | Whatever the owner flags while playing with every feature on | owner sessions |
| F15 | The settings reader writes its full sanitized result back, so a changed default never reaches an existing install (judge uses, `spikes.*`, `cardOverlay`, `onDemand` stay at a stored `false`; R7 needed a `gatingChosen` marker). Persist only what the user changed, then drop the marker | features-on and R7 tasks 2026-10-09 |
| F16 | Lore selection still costs about 5 judge calls per reply (263 candidates in chunks of 64); R12 saved about 0.1. Needs larger chunks or narrower book lists | R12 measurement |
| F17 | Director timeouts: 36 of 155 calls over the 1500 ms budget (p50 about 960 ms) on the 3090 C3 run | warden fix record, v2.8 01 §B |
| F18 | F1 send latency shares its cause with the warden timeouts (consolidation embeddings blocking ST's thread); re-measure M11 after the vector-yield fix (`runtime/vectorYield.ts`) before building more | warden fix 2026-10-09 |

## Develop

| # | What | Plan |
|---|---|---|
| D1 | C12 lore-select batching, C13-b digest, C11 model-driven items, R4 gate lift + Studio control | v2.8 01 |
| D2 | Agenda proposals wired into play (today a harness handle only) | v2.7 37 L3 |
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
