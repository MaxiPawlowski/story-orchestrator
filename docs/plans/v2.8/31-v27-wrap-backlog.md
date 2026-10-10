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
| M6 | B1-PFX (prompt-cache reuse) and B1-HIST (32K vs 98K history) | dropped for budget twice; decides the group cache layout (P4) and the history window (P1) **2026-10-10 (pod 2, `27f66m9327okh8`, §Pod 2 measurements): B1-PFX FAIL ×2; B1-HIST INCOMPLETE (3 turns per arm, 1 run)**. PFX: reuse p50 0 on same-speaker and member-after-Narrator pairs in all four arm-runs, `--swa-full` included. The first per-turn difference is the World Info in the story string (entries before the card change with each new message), not the depth-10 player role. `--swa-full` at `LLM_CTX` 98304 does not fit the 32 GB card; run at 24576. HIST partial: the 24576 arm stayed at or under 24576 tokens, prompt ms p50 0.49 × control; probes not run | pod |
| M7 | S-17 / 37-S17 on the new scope budget (`extraction/scopeBudget.ts`) | FAIL ×2 at +17 % before the budget; pair fairness may count per axis, not per pair **2026-10-10 (pod 2 lane 31, DeepSeek CL, master `84c23335`): S-17 FAIL ×2, 37-S17 FAIL ×2**. Tokens +24.6 % in all four runs (combined 3,063 vs baseline 2,460 mean), above +17.1 % before the budget. Latency +0.6–9.9 % ok, block p95 122 ok, quest fairness ok, pair fairness max wait 6 (9 pairs over 3). Filed as F27 | pod |
| M8 | 36-Q1-M2 quest completion recall, 36-Q1-M1 scope, 37-M1 relationship direction, 37-L6-C voice warden OOC recall | 0.46, split, 0.20, 0.5. **2026-10-09 local variant (3090, ×2, §Gate record): M2 PASS 1.00 / 0.92 (was 0.46 ×2); 37-M1 PASS 0.95 (judge first) / run 2 PASS 2026-10-10 on an uncontended controller (§3090 measurements 2026-10-10); L6-C PASS 0.8 / 0.9 (was 0.5 ×2); Q1-M1 not decided (arm 20 can no longer carry 20 keys under B2's scope budget)**. Pod re-measure still owed (local-variant numbers) | pod |
| M9 | Lorebook R5: Cast and place sheets "after character definitions" vs depth 4 | needs a real-model A/B on prefix stability and quality; the first same-member diff is earlier (Vector Storage, depth-10 player role) | pod |
| M10 | Lore selection after R12: calls per reply, exclusive-mode effect under scan mode | before: ~5 judge calls per reply, exclusive refused in file mode. **2026-10-10 (3090)**: still ~5 per reply (p50 7 / p95 15 / max 17 per turn); exclusive never applied (`no-selection`, F21) **2026-10-10 (pod)**: lore select 2.85 / 2.56 judge calls per reply (97 / 34, 46 / 18; was ~5), 1 lore timeout in 143, 0 `busy`; exclusive applied in every loud generation window (54 / 54, 65 / 68; the 3 others `story-off` / `not-loud`, i.e. quiet scans); F21 holds live. 22-turn SP6 prefix ×2, §Pod round 2026-10-10 | 3090 |
| M11 | Send-to-line latency by turn decile after `43a16f4a` and F1 | batch 3 max 4.5 s, mostly 25–40 ms. **2026-10-10 (3090)**: p50 323 ms, p95 8.5 s, max 14.2 s (F19) | 3090 **2026-10-10 (3090, `v2.8-local-3090`, §Local controller X2)**: 24 turns ×2, before p50 44 / 56 ms, p95 5,830 / 11,862 ms, max 15,568 / 14,263 ms; after the token-count bypass p50 38 / 23 ms, p95 808 / 517 ms, max 965 / 3,467 ms (0 / 1 over 1 s) |
| M12 | Warden timeouts after the warden fix | see the warden task's record. **2026-10-10 (3090, C3 ×2 on `ddf021bd`)**: not met: warden 1 / 103, 6 / 114; wardenLore 4 / 99, 7 / 109 (F22) **2026-10-10 (pod)**: warden 0 / 32 and 0 / 16, wardenLore 0 / 31 and 0 / 16 timeouts; all uses 2 timeouts in 779 calls (1 lore, 1 director), plugin `upstreamBusyAnswers` 0, adaptive factor 1 throughout: no burst to attribute. Under the 100-call floor (short runs, run 2's journal tail lost 10:27–10:48Z to the C: disk-full window), so diagnostic, not scored; F22 not reproduced | 3090 |
| M13 | Keyword-scan recall on the lore lab after the campaign key tightening | 0.25 → 0.26 | none |
| M14 | Phase C ×2 from zero on one build | symbolic now; runs when there is budget | pod |
| M15 | v2.8 01 owed: Q-M5/P3, inner voice B2/C, W6, R4, funded thinking A/B | unchanged | pod |
| M16 | D2 agenda proposals in real play: a character-life story in a group, real memory model (no `debugResponse`), Author view; play past a checkpoint change and a scene break; check one pass per trigger and none within `MEANWHILE_MIN_GAP` (8) boundaries or while a proposal waits, the proposal stays `proposed` until accepted, an accepted one lands at the next reply (`appliedAt`) and appears only in the holder's private block (`getAppliedEpistemicBlock` / payload capture with `onMemberDrafted`), never in a player surface (`so-ui.mts assert-player-clean`); swipe the landing reply (back to `accepted`, lands again); cost per pass (one curator call, 300 tokens max). Re-run 37-L3 (`so-b1-meanwhile.mts`) on the shipped build | built 2026-10-09 (`v2.8-agenda-proposals`), jest + no-model only; the 3090 was busy, so no real-model run **2026-10-10 (pod)**: **every M16 check green ×3** (`live-v28-meanwhile.json`, lane 21 ×1 + lane 13 ×2, group chat, curator on DeepSeek, reply on the pod): one pass at the checkpoint change, auto-accepted, landed at the next reply (`appliedAt`) in Arin's private block only (not the narrator's), nothing on the player page but F23; a `/cut` from `appliedAt` put it back to `accepted` and it landed again; no pass inside the gap (3 in the fixture), a scene-location pass once past it; 1 curator call per pass, `maxTokens` 300. Deviations: `confessed` set by author `/cp set` (real extraction never set it); the scene breaks came from the text heuristics (`location` stayed null); the rollback was a `/cut`, not a swipe; 37-L3 (`so-b1-meanwhile.mts`) not re-run. §Pod round 2026-10-10 | pod or 3090 |
| M17 | v2.8 11 J8 create checks ×2 (positive with the activation proof first, then unestablished name, createCap, auto never creates, excluded/gated title refused at the write edge, unmeasured route refused with "Only on a measured model" on), group chat, curator + main reply on cloud profiles | not run (needs the reply model and a staged build) **2026-10-10 (pod)**: **every J8 create check green ×2** (`live-v28-11-create.json`, lane 11, group chat, curator + lore on DeepSeek, reply on the pod): the real lore pass proposed a card (Oskar / Tilda, 1–2 cards), it waited, was accepted, written at the next boundary and reached the next prompt 2 / 2 (activation proof); unmeasured route refused before any call (`not-measured`, "measured below the create floor"); unestablished name and both hidden titles (gated, excluded) refused at plan time; auto mode left both cards pending across a boundary; createCap 2 skipped the pass with no call; a card edited into the excluded title was refused at the write edge ("excluded from the curator by this story"), the excluded entry untouched. The only red step is `assert-player-clean` on F23. Deviation: real reads put 0 rows in the facts tier, so a scripted read added 4 facts (the create pass itself was real). Re-run on `b8de063a` (the first batch overlapped the C: disk-full window, group saves 500): run 1 every check green again (Oskar created, written, 2 / 2 prompts, cap, excluded edit refused) but F23; run 2 red at setup, the fixture's fact seed (real reads gave 1 Oskar row, the seed did not top up): a fixture gap, not the product. Residue found: the created entries stayed in the lane's story book between runs, so the fixture now resets the book first | cloud + reply model |
| M18 | v2.8 09 live Q&A ×2 (`so-ask-qa.mts run`, `test/measurements/v2.8/09/ask-qa.json`, floors predeclared): author 17 of 20 cited + correct Show me, player 8 of 8 clean. Model (owner 2026-10-10, final): DeepSeek, the authoring role's default; never Artemis | **2026-10-10 (lanes 45/46, `v2.8-wizard-measure`, 09 Gate record §Measurements)**: DeepSeek flash 17/20 + 8/8 PASS, 16/20 + 8/8 FAIL (floor not met ×2), 3.0 s median per question; gpt-6.1-sol (opencode) 18/20 + 8/8 ×2 PASS, 24-26 s median (a first sol run void: C: disk full) | cloud (DeepSeek) |
| M19 | v2.8 09 wizard on DeepSeek ×2: `so-wizard-agent.mts recipes` (`test/measurements/v2.8/09/recipes.json`: quest-line, character-life, chapters end to end), `run` and `safety` on the product route (the authoring role's DeepSeek default, native tool calls through the profile tool bridge; `--route harness` checks it) against `--route local` (text JSON on the same profile) | **2026-10-10 two consecutive runs of run, safety and recipes, three arms (lane 27's §F run 1 stays in 09)** (09 Gate record §Measurements): flash native W1 0.832/0.802, W2 1 and 2 of 3 finished (FAIL), W3 pass, recipes 0/3 ×2, W5 0/20 ×2; flash text W1 0.810/0.825, W2 0 of 3 ×2, recipes 1/3 and 0/3, W5 0/20 ×2; sol bridge W1 0.967/0.900, W2 0 of 3 ×2, recipes 1/3 and 2/3, W5 0/20 ×2. §F floor FAIL ×2 on refused calls (17 > 10, 16 > 7). Unfinished = step budget or the done check's group rule | cloud (DeepSeek) |
| M20 | v2.8 09 player Ask in real play: a group chat mid-story, Author view off, `/story ask` and the Help box on the reply model's install; the answer names nothing unreached (`so-ui.mts assert-player-clean` with the answer open), a refused read is journaled once | **2026-10-10 ×2 PASS** (`live-v28-09-ask-player-play.json`, lane 45, DeepSeek flash as reply and authoring model, no 3090/pod): 3 real turns, 3 real player questions + the Help box, nothing unreached, `assert-player-clean` no findings; no read refused, so the journal line stays unexercised live | integration (reply model) |
| M21 | v2.8 22 M1 on a lane ×2 with the reply model (Artemis v1.1), DeepSeek on the authoring role: `22-living-story-director.md` §Live rows L1 + L5 (premise start, 12 turns, `assert-player-clean`, Save as story, delete-4 rollback + reopen); the play floors (≥1 anchor per chapter on a player-pursued arc, warden contradictions per 50 turns vs the authored baseline) | offline spike only (DeepSeek direct, synthetic stories, no reply model): 0 impossible / open-on-arrival gates in 22 answers, critic stalls 2 of 3 runs. Pod round 2 (lane 13, 2026-10-10): L1 ×2 below floor (1 and 0 `liv_<n>` reached), causes fixed in F24 on `v2.8-living-pace`; re-run L1 ×2 + L5 **2026-10-10 (pod)**: L1 + L5 ×2 on `a11cb81e` and ×2 on `43ea77ac`, lane 13, DeepSeek on every orchestration role (§Pod round 2026-10-10). Before the fix: 0 anchors ×2, path through 2–4 `liv_bN_way` branches, 4 of 5 turning points refused "objective is longer than 400 characters" (fixed on master `43ea77ac`). After: 0 branch / prefetch jobs, 0 divergence calls, 0 refusals, wrote 1 / grew 1 per run, **anchors 1 and 0 in 12 turns (floor ≥ 2 not met; pace work in F24, `v2.8-living-pace`)**; Save as story landed in run 2 ("… (played)", 2 unreached left out), run 1 wrote no journal line in 30 s (reason not captured); L5 cut stepped back (34 → 31), reopen clean; only other red F23. On master `f031637b` (living pace, F24) ×1: 0 "merge failed" lines, save wrote "saved the run as", still **0 anchors in 12 turns** (stayed on `liv_open`, no `gen_` beat entered): the way-in value (`liv_1_watch_pressed_for_answers`, about a scene the opening never plays) read false on all 19 reads, and its bridge failed the code check 3 times (beats gated on the same value, pinned true by the entry gate). **Fixed 2026-10-10** (`v2.8-living-pace2`, `22-living-story-director.md` §Living pace 2): a code pace fallback on every director way in (3 player turns), stub arrival (1), bridge beat hand-over (2); deterministic replay reaches `liv_2` by turn 8 (bare stub) / 9 (bridge), old ops stay on `liv_open`. Pod re-run L1 ×2 + L5 owed | pod (owner-funded 2026-10-10) |
| M22 | v2.8 22 false-divergence rate (CL, judge use `divergence`): §Live rows L3 ×2, readings "none" ≥ 0.6 per on-script turn, branches per on-script turn (floor to be declared before the run) | pod round 1: L3 false positives, thresholds raised to 0.8 ×2 / 0.97 (director tune); L3 ×2 re-run owed **2026-10-10 (pod)**: L3 ×2, lane 22, 8 on-script turns each. On `a11cb81e`: readings "none" ≥ 0.6 on 3 / 7 and 2 / 9, 1 false branch per run (fixed `43ea77ac`). On `43ea77ac` (counts committed turns only, 0.8 ×2 / 0.97): **0 branches ×2**, 1 committed turn per run (the first, fit 0.45, commits 0.83 / 0.82), every other turn commits 0.08–0.31; raw fit ≥ 0.6 on 6 / 8 and 4 / 8 uncommitted turns; the second reply of a player turn made no reading (b2, and b6 in run 2), 8 readings each. False-divergence rate (committed, ≥ 0.8): 0 / 16 | pod or cloud judge |
| M23 | v2.8 22 RP play check: branch on divergence landing + swipe/delete rollback (§Live rows L2) and the one-checkpoint prefetch (L4), ×2 each | pod round 2: L2 delete red on a prepared proposal written before the fixture switched prefetch off (F24 d, fixed); re-run L2 ×2 with the switches set before the sandbox chat, L4 then L2 on one lane **2026-10-10 (pod)**: L4 ×2 on `a11cb81e` + ×1 on `43ea77ac`: prefetch wrote one way forward per checkpoint, landed, and moved on; green but F23. L2 (lane 22, prefetch off): one reading fit 1.00 / commits 0.98 on the first off-script turn, branch `liv_b1_way` below the authored exits with its exit into the downstream anchor, the panel line shown; L4 → L2 back to back: no cross-chat prefetch on `43ea77ac`. **Swipe rollback failed ×3 on `43ea77ac`** (ops kept, no step back: F26), **fixed `b8de063a` and green ×2** (proposal withdrawn "rolled back", way gone, "living story stepped back"); delete rollback green ×2 on `b8de063a`, and ×1 on `f031637b` right after an L1 batch with no reload (the F24(d) condition): no prepared proposal. Only other red F23 | pod |
| M24 | v2.8 22 M2 blind pairs (authored vs living excerpts, second-model rater) and M3 hybrid (an authored act continued past its end) | not run; needs an L1 run at its floor first (M21) | pod + delegated rater |
| M25 | Chat Completion vs Text Completion on Artemis v1.1 with thinking, budget 400, fair CC config (brief-plan line in the CC main prompt, `thinking_budget_tokens` 400 through the overlay, names "content", group nudge on, same samplers), both arms at once, ≥ 20 replies each, then a blind pack + a delegated pre-rating | **2026-10-10 (pod)**: CC at parity: wrong speaker / out of form TC 1/20, CC 0/20; empty 0/0; damage 0/0; loops 0/0; budget honoured both (TC reasoning max 406, CC 399, the keys verified in the request); reply median 53.7 vs 53.0 s; first visible text 15.4 vs 12.5 s. Blind pack `model-blind-20-cctc` pending the owner; delegated pre-rating (codex `gpt-6.1-sol` high) sealed in its `delegated-sol/`. `15-model-config.md` §2026-10-10 (pod) | pod |

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
| F12 | 3090 cannot hold the "normal" profile with the v1m GGUF, and the pods run v1.1; decide model-file parity for local rows | C3 local-variant. **Settled 2026-10-10** (`v2.8-local-3090`, §Local controller 2026-10-10): not a version difference. The 3090's `Artemis-31B-v1m-Q4_K_M.gguf` is TheDrummer's own v1.1 repo (`TheDrummer/Artemis-31B-v1.1-GGUF` names its files `v1m`, 18.7 GB); the pods run bartowski's imatrix Q4_K_M of the same weights (19.6 GB). Kept TheDrummer's quant on the 3090 (owner); local-vs-pod comparisons carry a quantizer caveat. Fit on 24 GB (q8_0 KV, 2 GiB reserve): 32768 all on GPU (2.1-2.6 GiB left, 15-22 tok/s at full context); 36864 dips to 1.85 GiB in prefill; 65536 / 98304 load only by spilling layers (`--fit`) at 0.7 / 0.5 tok/s, so `maxContext` 32768 and `normal`/`sharing` are manual only |
| F13 | Campaign sprite fixes | v2.7 38 |
| F14 | Whatever the owner flags while playing with every feature on | owner sessions |
| F15 | The settings reader writes its full sanitized result back, so a changed default never reaches an existing install (judge uses, `spikes.*`, `cardOverlay`, `onDemand` stay at a stored `false`; R7 needed a `gatingChosen` marker). Persist only what the user changed, then drop the marker | features-on and R7 tasks 2026-10-09. **Fixed 2026-10-09** (`v2.8-settings-delta`): the store holds a delta over the defaults (`runtime/settingsDelta.ts`, `readGlobalSettings`/`globalSettingsDelta`), a read never writes, a value written back to its default leaves the store; `gatingChosen` and the Image Director settings import removed; harness raw reads/restores made delta-safe. jest `settingsDelta.test.ts` (flip reaches an untouched install, a set value survives, a read never writes) |
| F16 | Lore selection still costs about 5 judge calls per reply (263 candidates in chunks of 64); R12 saved about 0.1. Needs larger chunks or narrower book lists | R12 measurement. **Fixed 2026-10-10**: candidates packed into as few requests as the documented 64,000-token limit (minus 10 %) allows, split evenly: 263 lore-sized -> 2 calls per selection (stress 5.0 -> 2.0). TypeSafe 263 questions p50 608 ms vs 64 p50 311 ms; recall/precision unchanged on both lore fixtures ×3 |
| F17 | Director timeouts: 36 of 155 calls over the 1500 ms budget (p50 about 960 ms) on the 3090 C3 run | warden fix record, v2.8 01 §B. **Cause found, fixed 2026-10-10**: not queueing behind lore (no director call overlapped one), not request size (4–6 K state chars), not the provider (network p50 ~600 ms in that run, all 36 answers arrived in 0.4–1.9 s): the page held each answer past its budget while the main thread rebuilt the runtime snapshot (the sprite stage built one per actor per streamed token). Hot readers take the cached snapshot; one-turn profile getSnapshot 3.5 s -> 0.5 s. Budget unchanged (shown right) |
| F18 | F1 send latency shares its cause with the warden timeouts (consolidation embeddings blocking ST's thread); re-measure M11 after the vector-yield fix (`runtime/vectorYield.ts`) before building more | warden fix 2026-10-09. **2026-10-10 (3090, §3090 measurements M11)**: still p95 8.5 s / max 14.2 s locally, and 12 of 14 slow sends were not near a consolidation pass; see F19 **Cause found 2026-10-10** (§Local controller X2): not embeddings; the browser's six connections to ST filled with ST's own `/api/tokenizers/remote` counts queued in the local gateway behind generation |
| F19 | On the 1-slot controller the player's line is taken only after the drafted member's inner-voice call returns, and that call queues behind extraction reads (3 slowest sends: 10–14 s). Check by trace whether the inner beat runs before ST posts the line; if so, post first | §3090 measurements 2026-10-10, M11. **Fixed 2026-10-10** (`cb371721`): the beat starts at GROUP_MEMBER_DRAFTED and is awaited in the generate interceptor (`runtime/draftedBeat.ts`), so ST posts the line first; the 3090 M11 run was on `ddf021bd`, before it **Remaining cause fixed 2026-10-10** (`v2.8-local-3090`): after `cb371721` the line still waited 4–16 s on `ddf021bd`-era shapes; a trace showed the send's `/api/ping` stalled while 4–6 tokenizer XHRs sat in the gateway's text queue. `/tokenize` and `/detokenize` now go straight to a loaded backend (`broker/gateway.mjs`); M11 ×2 after: max 965 / 3,467 ms |
| F20 | **Fixed 2026-10-10** (`v2.8-local-3090`): the gateway's +256 margin dropped (prompt + output under the profile's `--ctx-size`, llama-server's own limit), profiles chosen by their `--ctx-size` within `maxContext` (32768 here), a request no usable profile holds answered 400 `exceed_context_size_error` with nothing loaded, a profile that failed to load skipped for 10 min, chat requests counted through `/apply-template` (they used to always move to `normal`); `/props` forwards the backend's and reports the served n_ctx; the extension clamps the memory model's budget to it and raises `context-over-server` when ST's context is larger. Repro `live-f20-long-chat` ×2 PASS (§Local controller 2026-10-10). Long local chats overflow the 32K profile: at turn ~71 a reply request carried 32,848 tokens with ST `max_context` 32768 (ST "Error counting tokens"); the controller answers 409 and tries to load `normal` | §3090 measurements 2026-10-10, item 3 (branch `v2.8-3090-measure`). **Investigated 2026-10-09** (`v2.8-small-fixes`): not ours. 32,848 is the controller's `prompt + n_predict + 256` (`backend.mjs` `forRequest`), so ST's own fill (≤ `max_context - amount_gen`) was 176 under 32768 and the 256-token gateway margin made it overflow; every story block is set before ST's budget pass and counted (ST source lines and a no-model lane 5 dry-run probe: prompt 165 / 168 tokens under budget). "Error counting tokens" is ST's `/tokenize` hitting the same 409. Margin rule in the debug skill: local `max_context` ≤ 32000. Owner option instead: drop the +256 from the controller's fast/normal decision |
| F22 | C3 ×2 not met on `ddf021bd` (3090): warden 1 / 103 then 6 / 114, wardenLore 4 / 99 then 7 / 109. No timeout near a consolidation pass; run 2's come in 2-minute bursts across every judge use, mostly `queue`. Attribute the bursts (plugin `/status` served counts and TypeSafe latency per minute), then decide plugin capacity, lore-select chunking (F16/F21) or judge share | §3090 measurements 2026-10-10, item 3 |
| F21 | Exclusive lore select never applies: with every signal on, each loud generation refuses `no-selection`, because about 45 % of lore-select chunk calls fall back `busy` (judge-plugin 429/503) and the selection is never complete. Fewer, larger chunks (F16) or a retry for the missing chunks | §3090 measurements 2026-10-10, M10. **Fixed 2026-10-10** with F9 + F16 + one retry of a `busy`/`timeout` chunk after a cool-down of at most 1 s: lane 14 (share 3) exclusive applied 1/18 -> 16/16 loud generations, stress 0/20 -> 20/20 complete selections |
| F23 | The cloud-model egress line (`[data-so="role-egress"]`, Models per task) rendered in player mode, so `assert-player-clean` failed on any install with a cloud profile or harness assigned to a task | **Fixed 2026-10-10** (`v2.8-owner-decisions`): both egress lines are author-only; in player mode one line above Models per task (`[data-so="role-cloud-tasks"]`) names the tasks that send text to a cloud service and the vendor, for an assigned or a default route. Stories `Settings/RoleProfilesGroup` `CloudTasksOutsideAuthorView`, `WizardDefaultsToSol` |
| F24 | Living director, pod round 2 (lane 13): (d) a prepared way forward applied with `prefetchEnabled` false; L1 reached 1 and 0 turning points in 12 turns; Save as story left no line in one run | **Fixed 2026-10-10** (`v2.8-living-pace`, `22-living-story-director.md` §Living pace): (d) no stale settings view; the proposal was written before the fixture switched prefetch off and applied after, so `applyAccepted` now withdraws an accepted proposal whose switch is off. Pace: the first bridge of every premise story failed to merge (`liv_open` vanished once `gen_` beats existed), a failed `liv_` chain was never retried, and a player in a bare stub was stuck for good; fixed (opening kept, retry ×3, stub exit also opens on the way-in gate), plus a prompt rule for the way-in gate. Save refused from inside a stub; the export now keeps the turning point the stub leads into. Pod re-run owed (M21, M23) |
| F23 | `assert-player-clean` fails in player mode whenever a pass role routes to a cloud profile: `[data-so="role-egress"]` (the "sent to DeepSeek, a cloud service, from the machine running SillyTavern" line, `RoleProfilesGroup.tsx:143`, added ungated by v2.7 14 `8f850724`) is reachable in `#story-orchestrator-settings`, while CR-U lists it as author-only (`so-ui.mts` player selector list). Every pod-round row with a DeepSeek role hit it; with every role on the pod (widgets glance) the same check is clean. Owner call: gate it on Author view, or move it off the author-only list as a player privacy note | 2026-10-10 pod round (M16, M17, director rows) |
| F25 | Widgets live glance: after `/cp set found_ledger true` and a real reply in player mode, `found_ledger` reads `false` and the clue wall never comes up (×3), while the no-model fixture shows it | **Fixed 2026-10-10** (`v2.8-living-pace2`, `22-living-story-director.md` §F25). Attributed from the 5 records: not the slash, the gate or the projection. Every run: `/cp set` wrote true, then cadence reads created AFTER it (windows 0→2 / 0→3 / 0→4, evidence quoted from message 1, the walk along the harbour) applied `false` at the next boundary; the read that saw the page (`found_ledger=true`) was still pending, applied only at the next boundary (by design: a reading lands at the next reply). Fix: a manual write records the message it was made at (`blackboard.authoredAt`, rolled back with the snapshot); an extractor/reconciliation delta whose evidence message (`evidenceAt`, else the window end) is at or before it is discarded at the boundary. Authoring side: the story was fine, but `widget-item-never-read` threw on a clue written with the `quality` shorthand (and the preview on a string `bind`), so it could never catch one; both read the shorthand now. Pod re-run of the widgets glance owed | 2026-10-10 pod round (widgets glance) |
| F26 | **Fixed 2026-10-10** (`b8de063a`, branch `v2.8-living-rollback`, merged): a swipe / edit / delete of the reply whose boundary applied a living director change kept the change when no transition had fired: `runRollback`'s noop path (`!shouldRollbackFromMessage`) never called `restoreLiving`, so the branch's ops and checkpoint stayed (L2 swipe ×3 on `43ea77ac`). `livingMovedAfter` (any living op after the restored boundary) now takes the full path; `livingRollback.review.test.ts` (swipe/edit/delete, a negative control without the dep, an op at the boundary). Live ×2 green | 2026-10-10 pod round (M23) |
| F27 | S-17 / 37-S17 on the shipped scope budget (`extraction/scopeBudget.ts`, master `84c23335`): token growth **+24.6 %** in all four runs (floors +15 % 36 / +12 % 37; was +17.1 % before the budget), relationship pair fairness max wait **6** reads (9 pairs over 3), and the overflow drops 3 card pulls plus 6–12 relationship pulls on every read. Latency, block size and quest fairness pass. A budget design issue, not for a pod round | pod 2 2026-10-10 (§Pod 2 measurements): DeepSeek 4.1 flash read profile, lane 31, `--values` b1b `s17-values.json`; records `so-sessions:evidence/phase-c/pod2-2026-10-10/rows/s17/{S-17,37-S17}-run{1,2}.record.json` |
| F28 | **Fixed 2026-10-10** (`v2.8-pod2`): `scripts/local/judge.mjs setup` downloaded only the decider-4b `.gguf`, but `decider-ai`'s GGUF engine loads its HF tokenizer from the same folder, so a fresh setup's judge server failed at start (`Couldn't instantiate the backend tokenizer`). Setup now also downloads `tokenizer.json`, `tokenizer_config.json` and `decider_config.json` (`JUDGE_MODELS[...].companions`), and the weights count as present only with them (`judge.test.mjs`) | pod 2 local-judge calibration 2026-10-10 (the server ran once the three files were fetched by hand) |

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
| D10 | Story presence panels C4/C5/C7/C9a (what is left) | v2.8 04 (done 2026-10-10, `v2.8-panels-rest`; C5 CL owed) |
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


## Local controller 2026-10-10 (branch `v2.8-local-3090`, queue X3 / X1)

**X3 / F12 (model file).** No download needed for parity: the 3090's file is TheDrummer's own v1.1 GGUF (`TheDrummer/Artemis-31B-v1.1-GGUF`, files named
`v1m`); the pods run bartowski's imatrix Q4_K_M of the same weights. Owner: keep TheDrummer's quant on the 3090 (fast disk), caveat local-vs-pod
comparisons as a quantizer difference. Fit probes (llama-server b11388, q8_0 KV, flash attention, 1 slot, 32K-filled prompt, 64-token reply):

| ctx | placement | GPU free after load / min in prefill (MiB) | prefill / decode |
|---|---|---|---|
| 32768 | all layers (`--fit off`) | 2186 / 2118; 2200 / 2149 (×2, no ComfyUI) | 40.8 s / 17.9 tok/s; 40.4 s / 18.5 |
| 36864 | all layers | 2149 / 1851 (below the 2048 reserve) | 47.7 s / 15.1 |
| 65536 | `--fit` spill | 1127 | 128 s / 0.7 tok/s |
| 98304 | `--fit` spill | 1152 | 299 s / 0.5 tok/s |

`fast` at 32768 is the largest usable context; `normal`/`sharing` load but are not servable, so `maxContext` 32768 and they stay manual. Two config
corrections from the same runs: `fast`'s RAM estimate 5500 -> 3000 MiB (measured 2.5 GiB, 8448 -> 5983 MiB free; the 5500 refused every load while
other lanes held 23 GB of RAM), and `fitMarginMiB` 512 (new key): `--fit-target 2048` left 1.8–2.0 GiB free once an idle ComfyUI or a busy desktop
took its share, so every reload broke the reserve and retried. Install config backed up as `config.before-x1-2026-10-10.json`.

**X1 / F20 (fix).** Controller: no +256 margin (prompt + output under the profile's `--ctx-size`, one position short, as measured: an exact fit got
367 of 368 tokens, `stop: limit`); the profile chosen by `--ctx-size` within `maxContext`; past it a 400 `exceed_context_size_error` and nothing
loaded; a profile that failed to load skipped for `contextRetryMs`; chat requests counted through `/apply-template` (they always switched to `normal`
before); `/props` forwards the backend's (ST's `/props` proxy answered 500 on the gateway's, it hashes `chat_template`) with the served n_ctx.
Extension: the memory model's budget is clamped to the server's n_ctx (`stHost/servedContext.ts`, lazy chunk), and `context-over-server`
(degrades, player) names a reply connection whose context is above it. Main bundle 1,249,990 B of the 1,250,000 budget.

Repro `test/scenarios/live-f20-long-chat.json` on lane 40 (private ST copy, `--allow-local`), sun-ruins in "Group: Arin, DM Narrator", 30 padded
history rows (~80 K tokens), controller loads read around each run:

| Run | Arm A (ST context 98304) | Arm B (ST context 32768) | memory read budget | controller |
|---|---|---|---|---|
| 1 | 400 `exceed_context_size_error`, prompt 80,474 + 400; check fired (98304 vs 32768) | 200, prompt 30,816 + 400 = 31,216 | 32768, source `source` | fast, loads 1 -> 1 |
| 2 | 400, prompt 80,462 + 400; check fired | 200, prompt 30,813 + 400 = 31,213 | 32768 | fast, loads 1 -> 1 |

Before the fix (F20 rows above): 409 `local_residency` and a `normal` load attempt. Both arm B replies first came back thought-only once and the
product's empty-reply recovery re-asked (B1-EMPTY, not F20). Gates: `npm run gates -- --no-storybook --jobs 2` exit 0, `npm run typecheck:test` exit 0
(one earlier gates run failed `so-r4-spike` p95 ratio 2.07x vs 2x and a GPU plugin test on `listen EACCES 127.0.0.1:23994`, both environment
under load; green on the rerun).

## Pod round 2026-10-10 (RunPod `c9knurjijfupao`)

One pod: `llm-pod-4500-v28-smallwins`, Secure RTX PRO 4500 Blackwell, EU-RO-1, $0.72/hr, volume `x9gi6f1rig`. Artemis v1.1 Q4 on llama-server, reached over an SSH tunnel at `127.0.0.1:18081` (`so-pod.mts target 1` + `up 1`).

Lanes:
- Private ST code copy `C:\dev\so-lanes\agent-st-podsw`, lanes root `C:\dev\so-lanes\podsw`.
- Lane 21 and lane 11: plain seed (`Group: Arin, DM Narrator`).
- Lanes 22 and 13: adolion-fresh.
- At most two model lanes ran at once.
- The real install (`:8000`, CDP 9222) and the 3090 were never touched.

Builds staged in turn: `4b211597`, `a11cb81e`, `43ea77ac` (director tune), `b8de063a` (F26), `f031637b` (living pace).

Every row with a pass role on DeepSeek is red on `assert-player-clean` because of F23 alone. With every role on the pod (widgets glance), the same check is clean.

**M16 (agenda / meanwhile, auto accept).**
- Records:
  - Lane 21: `podsw/21/debug/batch/2026-10-10T09-01-47-052Z/live-v28-meanwhile-run1`.
  - Lane 13 ×2: `podsw/13/debug/batch/2026-10-10T12-52-34-411Z`.
- One curator pass at the checkpoint change. It was auto-accepted, `proposed` → `accepted` → `applied`, and landed at the next reply.
- The landing reached Arin's private block (`onMemberDrafted` + `getAppliedEpistemicBlock`), never the narrator's block or the player page.
- A `/cut` from `appliedAt` put the proposal back to `accepted`, and it landed again at the next boundary.
- No pass ran inside the gap. A scene-location pass ran once the gap had passed.
- Each pass made one curator call (`maxTokens` 300).
- Run 2 on lane 21 was red on a fixture assumption (it expected the checkpoint pass first, but a scene-divider pass inside the gap correctly suppressed it). The assertion was then relaxed.

**M17 (curator create, J8).**
- Every J8 check is green ×2: `podsw/11/debug/batch/2026-10-10T10-17-38-784Z`. See the M17 row.
- That batch overlapped the C: disk-full window (group save 500s), so it was re-run ×2 on `b8de063a`: see the M17 row.

**M10 / M12 (C3).**
- Two short runs of the SP6 22-turn prefix with every judge use on: `podsw/c3/run1`, `run2b-merged`.
- Run 2's journal tail 10:27–10:48Z was lost to the disk-full window.

**M25 (CC vs TC).** See `docs/plans/v2.6/15-model-config.md` §2026-10-10 (pod).
- Records: `podsw/cctc/{tc,cc}`.
- Blind pack: `test/sessions/rating-pack/model-blind-20-cctc` (gitignored; key sha256 `f8919e6b…`).
- The delegated `gpt-6.1-sol` pre-rating is in its `delegated-sol/`.

**Living director (M21–M23).**
- Every orchestration role was on DeepSeek; reply on the pod; curator off; judge on.
- Records: `podsw/{13,22}/debug/batch/2026-10-10T11-51-*`, `T13-43-*`, `T13-58-31-917Z`, `T14-11-09-994Z`, `T14-27-35-779Z`, `T14-32-*`.
- Divergence pollers: `podsw/director/divergence-{13,22}.jsonl`.
- Scenarios: `podsw/director/*.json`, generated, kept with the evidence, not in the repo.
- Swipe rollback: `/cut` past the applying reply, then ST's own `.swipe_right` on it.

**Widgets glance (plan 23).**
- Records: `podsw/22/debug/batch/2026-10-10T12-47-32-812Z`, `T12-56-46-366Z`, `T13-00-51-256Z`.
- Every role was on the pod.
- No widget text reached a generation prompt; no hidden widget content was on the page; `assert-player-clean` was clean.
- The clue wall never came up (F25).

Deviations:
- The pod saturated at 4 busy slots and 7–8 tok/s at 12:21Z. From then on, every orchestration role of the director rows and M16 went to DeepSeek; only the main reply stayed on the pod.
- M17's facts tier came from one scripted read; the create passes themselves were real.
- In M16, `confessed` was set with author `/cp set`.
- The C3 runs are short (under M12's 100-call floor).
- The C: drive hit 0 bytes about 10:27–10:48Z. That killed the C3 run 2 tails, and run 2 was restarted.
- The pod capture stalls for about 136 s at a time, idle or busy (`samples.jsonl` gaps). So `st-lanes batch` marks most rows INCOMPLETE ("the pod capture stopped sampling before the row ended") although record, server log and page capture are all there. Rows with any other evidence gap were re-run.

### Gate record (2026-10-10, pod round)

- Pod created 08:44:34Z, terminated 15:26:55Z (`delete-pod` 204, gone from `list-pods`) after `so-pod.mts release 1` exit 0 (sha match, 1762 requests): 6 h 42 min, about $4.83 at $0.72/hr; cap 8 h (owner). The four older EXITED pods were never started, stopped or terminated.
- Fix delivered on its own branch from master: `b8de063a` (F26, `v2.8-living-rollback`), merged to master by main.
  - `npm run gates -- --no-storybook`: all green in 121.9 s. `test-storybook:ci` was skipped.
  - `npm run typecheck:test`: exit 0.
  - The first gates run was red only on `codeHealth` S5 and lint `max-len` (a 233-character line, then split) and on `arrivalEquivalence` (it scans untracked scenario files, which were moved aside for the run).
- Docs and scenarios: docs-only gates (none). The new scenario stories are in the `arrivalEquivalence` golden (`SO_RECORD_ARRIVAL_GOLDEN=1`).
- Evidence: `so-evidence.mts archive --label pod-2026-10-10-smallwins`, then `npm run sessions:archive`.

### X2 / M11 send-to-line latency (F1, F18, F19), same branch

Rig: lane 40 (private ST copy, `--allow-local`), sun-ruins in "Group: Arin, DM Narrator", 24 real turns per run through the 1-slot
controller (Artemis v1m Q4_K_M, 32768), every feature at the install default (judge on, inner voice, extraction, lore select),
`SEND-TAKEN` from `st-actions` (click -> the player's row in `chat`). Extension bundle identical in every row (`4a5875c249fd`, master
`95354446` + X1). In-page instrumentation (fetch timeline, emit timings, a 1 s `/api/ping` probe, long tasks, resource timing) and an
outside `curl` to the lane every second; scripts and raw timelines are private (scratch).

| Run | p50 | p95 | max | over 1 s | by decile (p50/p95 ms) |
|---|---|---|---|---|---|
| before 1 | 44 | 5,830 | 15,568 | 4 | 44/50, 39/513, 39/66, 33/4121, 29/34, 5830/15568, 34/1641, 42/137, 50/57, 572/572 |
| before 2 | 56 | 11,862 | 14,263 | 10 | 10/17, 30/7738, 1533/2676, 42/8346, 10722/11862, 40/2102, 45/2063, 47/56, 59/69, 1016/14263 |
| after 1 | 38 | 808 | 965 | 0 | 38/49, 12/117, 37/79, 45/808, 52/965, 49/508, 23/29, 30/58, 25/54, 27/508 |
| after 2 | 23 | 517 | 3,467 | 1 | 7/16, 8/3467, 18/21, 20/20, 48/70, 21/37, 21/23, 41/52, 27/94, 48/517 |

**Cause.** Between ST's `GENERATION_AFTER_COMMANDS` and `GROUP_WRAPPER_STARTED` the outer `Generate` awaits `pingServer()`
(script.js:4336); that ping took 1–15 s exactly when the line was late, while the lane answered an outside `curl` in ~150 ms (the
server was not blocked) and no long task ran. Resource timing at the stall showed 9–12 requests open to the ST origin: 2 memory-model
generations plus 4–6 `/api/tokenizers/remote/textgenerationwebui/encode` XHRs (ST's own counts, Best match tokenizer), each queued in the
gateway's text FIFO behind the running generation, so Chrome's six connections per origin were full and the ping queued in the browser.
**Fix:** the gateway forwards `/tokenize` and `/detokenize` straight to a loaded backend (llama-server answers them beside a running
slot); while text is absent or loading they still wait in the queue. A page-side cap of 2 memory calls per server was tried first
(`gate1`, not kept): it held 2 in flight and the line still waited 15 s, which is what pointed at the tokenizer XHRs. The one 3.5 s
send left in after 2 is not attributed (no trace kept for that run). Pods are unaffected (llama-server directly, no gateway queue).
Gates: `npm run gates -- --no-storybook --jobs 2` exit 0 (all ten steps), `npm run typecheck:test` exit 0, on master `1231fda4` merged. The GPU was left idle after the runs (controller and lane 40 stopped).
