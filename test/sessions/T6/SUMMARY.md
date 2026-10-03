# T6 summary

## T6-1 Reasoning (lane 2, `test/sessions/T6/T6-1-1`, `-2`, `-3` all VALID)

- **Setup:** played 2026-10-03 03:39-04:41Z on lane 2 (adolion-fresh, seeded earlier tonight, `start --no-seed --force-waiting`; the card's `waits` line still names the R3 doc as missing, so start refused without `--force-waiting`). Served dev bundle `4a5c0a165ec6` (master `b2ad5870`), judge plugin 1.6.0, media off, player mode, persona Max Nightriver, T1-1's lines replayed. Every stop was valid; the only header warning was the repo `dist` rebuilt by another session while the served bundle stayed the same. Lane 2 was stopped at the end.
- **Rows chosen:** the lane routes every orchestrator role to `deepseek 4.1 flash` (`page-pin.json` roles), and the main reply goes to `Artemis RunPod RP` (TC). The DeepSeek column of `recommended-reasoning.md` includes `default` for authoring and director, and read and synthesis have no recommendation. So the only rows that differ from default are **curator low** and **curator high**. The Artemis-TC column is `default` everywhere, the same as the lane, so no run was spent on it. Each row was applied with `setting extraction.routes {"curator":{"route":{"options":{"effort":<level>}}}}` and put back to `null` before stop.
  - Run 1 = curator low.
  - Runs 2 and 3 = curator high. Run 2 broke on a product defect at turn 6; run 3 replayed it.
- **T1-1 is not a like-for-like latency baseline.** T1-1 (2026-10-01) ran without reply thinking. Every T6-1 run has the reply-thinking baseline (`extraction.replyEffort` medium, budget 400, on since 2026-10-02). So the reply latency gap below comes from that baseline, not from the curator row.

| Run | Row | Turns | Route reached | Per-reply p50 / p95 (T1-1 31.1 / 63.8 s) | Read calls (T1-1 p50 4.4 s) | Curator calls | Empty replies | Leaks |
|---|---|---|---|---|---|---|---|---|
| T6-1-1 | curator low | 11 | walls t6, first-night t9, the-breach t11 | 45.6 / 73.4 s | 32/32 ok, p50 4.4 s | **9/11 reasoning-exhausted** (max_tokens 896, all 896 tokens went to reasoning, finish `length`); 1 WI proposal vs T1-1's 5 | 0 | 0 |
| T6-1-2 | curator high | 8 | walls t6, then **stuck** (defect below) | 45.6 / 50.2 s | 13/13 ok, then none after 04:14:52 | 1/1 ok (11.4 s, 2,433 out) | 0 | 0 |
| T6-1-3 | curator high | 10 | walls t6, first-night t7, the-breach t8 | 35.6 / 60.2 s | 24/24 ok, p50 4.3 s | **5/7 reasoning-exhausted** (max_tokens 6,528, all spent on reasoning, about 30 s each) | 1 (R4 high arm) | 0 |

Rubric scores:
- Reasoning setting: broken / not-noticed / broken.
- Latency: annoying ×3.
- Extraction: works / broken / works.
- R4: recorded.

Evidence:
- Run 1: `T6-1-1/journal.jsonl:223`, `:256`, `:537`.
- Run 2: `T6-1-2/turns.jsonl:10`, `:15`, `console.jsonl:18`, `shots/014-after-swipe-no-checkpoint.png`.
- Run 3: `T6-1-3/journal.jsonl:356`, `:391`, `turns.jsonl:15`.

Checks:
- **Reply budget:** every medium loud TC request carries budget 400. The high-arm requests carry no budget key, and the journal says `Reply thinking "high" … no budget; set nothing`. The requests without a budget and without `stream` are ST Summarize.
- **Thought leaks:** 0 across all three runs (scan of every reply and swipe). The T6-3-3 repair (`thoughtLeak.ts`) never fired, so 0 `LEAK_REPAIRED` journal rows. That is consistent with no leak happening, not proof that the repair works.
- **Empty replies:** 0 at medium. 1 at high, no budget: msg 28 in T6-1-3, 0 reply chars and 2,240 reasoning chars. The stream body was not captured, so the stop reason is unknown.
- **Narrator deciding for the player:** not seen.
- **Extraction vs T1-1:** read latency is the same (p50 4.3-4.4 s). The walls are reached faster: turn 6 in every run, against about turn 17 in T1-1, where the latch supersession held the story.
- **Overview, HUD:** not separately driven.

**05 R4 leg:** `test/sessions/rating-pack/R4/` holds 4 pairs: T6-1-1 msgs 19 and 21, T6-1-2 msg 15, T6-1-3 msg 19. The key is in `rating-pack/.keys/R4.json`, the status is `pending`, and 4 of the 20 pairs exist. Not rated, by instruction.
- Arms:
  - `reasoning` = reply thinking `high` (no budget). This is plan 05's R4 arm: checkpoint high.
  - `plain` = the install default `medium` (budget 400). This is R4's control.
  - I read the card's "switch the row off" as "back to the default". The curator row does not touch the reply, so it could not form a reply pair.
- Pair stats: the high side used 1.3-1.9× the medium side's thought time (28.7-52.8 s against 17.0-24.0 s), and its replies were longer (865-1,302 chars against 549-939).
- Unmatched attempts: 5. In a group round the pack keys the turn by its first reply, while `swipe-new` swipes the last reply, so any round with 2 or more replies cannot pair. That is a harness limit (see below).

Findings:
- **HIGH (product, rollback):** in run 2, a swipe of the reply that moved the story from a generated checkpoint (`gen_on-the-road_1`) into an authored one (`at-the-walls`) left the engine on a checkpoint the graph no longer holds.
  - The persisted `engineState.activeCheckpointId` is `gen_on-the-road_1`, and the snapshot's checkpoint list has no generated ids, so `activeCheckpointId` reads null.
  - `requirementsHost.refresh` throws `Cannot read properties of undefined (reading 'id')` on `this.engine.activeCheckpoint.id`, 23 times.
  - After that, no boundary was committed (9 → 9 over 2 more turns) and no model call was made at all. That hits the card's must-not: a read that never lands.
  - An authored → authored swipe (T6-1-3 msg 19, at-the-walls → first-night) re-committed correctly, so the trigger is the generated checkpoint.
  - Repro: reach the generated on-the-road chain, play the turn that enters at-the-walls, then `swipe-new`.
  - Evidence: `T6-1-2/turns.jsonl:10`, `:12`, `:16`, `console.jsonl:18`, `shots/014-after-swipe-no-checkpoint.png`, flag `turns.jsonl:15`.
- **HIGH (recommendation table, R3 vs play):** both recommended curator rows fail in play on DeepSeek. R3 measured curator low and high at validity 1.0 ×2 on its fixtures. In play, low exhausted 9/11 WI-curator calls, and high exhausted 5/7 while spending about 6.5k reasoning tokens and about 30 s per call.
  - DeepSeek does not honour the reasoning budget: max_tokens = answer + budget, and it fills the whole thing with reasoning.
  - Play prompts were 1.4-1.6k tokens. I did not check whether R3's curator fixtures match the play-time task.
  - Until R3 is re-measured on play-shaped prompts, `recommended-reasoning.md`'s curator "low, high" should read "none". Not changed here.
  - The failure is not silent: `stagecraft.lastError` names it. But the curator effectively stops proposing: 1 WI proposal in run 1, against T1-1's 5.
  - Evidence: `T6-1-1/journal.jsonl:223`, `T6-1-3/journal.jsonl:356`, `payloads.jsonl` response `finish_reason length`.
- **MEDIUM (R4 arm):** 1 empty narrator reply at reply thinking high (no budget). That is 1 of about 15 high generations, against 0 of about 40 at medium. If R4 ships checkpoint `high`, this is the "empty reply" must-not. Evidence: `T6-1-3/turns.jsonl:15`, flag `:16`.
- **MEDIUM (extraction parse tolerance):** 6 DELTA/FACT lines were rejected as `unrecognized line` because the evidence opens with a quoted speech and never closes its own quote. The parser requires a closing `"` at the end of the line. Among the losses was `inside_wendhope=true`, read 3 times. The story still advanced. This happened 0 times in T1-1 and T6-4. Evidence: `T6-1-1/journal.jsonl:537`, `:577`, `:613`.
- **LOW (reasoning storage):** 2 of the 4 medium `swipe-new` replies stored 0 reasoning chars, with a recorded duration of 17-21 s and clean text: T6-1-1 msg 21 swipe 1 and T6-1-2 msg 15 swipe 1. Whether the thought was lost or never written is unverified.
- **LOW (voice, known class):** narrator and companion replies sometimes open with another speaker's name label (T6-1-1 msg 27 "Belle:", T6-1-3 msg 11 "Adolion Narrator:").
- **LOW (known T1-1 MEDIUM, recurred):** in run 2 the generated on-the-road chain ran while the party was at the gate (`gen_on-the-road_1` at turn 5).
- **Harness:**
  - The R4 pairing cannot pair a group round with 2 or more replies (`candidatesFromTurns` keys `replies[0]`, `swipe-new` swipes the last reply). That cost 5 of 9 attempts.
  - T6-1's `waits` line is stale: the doc exists.
  - The model-call ring has no `effort` field, so the curator effort is visible only in `payloads.jsonl` (`reasoning_effort`).
- **Spend:**
  - DeepSeek 234 calls (109 / 38 / 87): 532,404 in / 155,186 out, of which 14 failed as exhausted.
  - Judge 620 calls (285 / 103 / 232).
  - Main RP 58 requests (23 / 15 / 20).
  - Pod: about 62 min of play (03:39-04:41Z).
- **Verdict:** neither recommended non-default row plays at least as well as default. Curator low and curator high both break the WI curator in play; default on T1-1 had 10/10 ok. Reply quality under the rows is unaffected, because the row does not touch the reply. Keep the curator at `default` on DeepSeek and re-measure R3's curator cell on play-shaped prompts.

## T6-2 Judge providers (lane 4, `test/sessions/T6/T6-2-3` VALID; llama-logprob row fails in play)

- **T6-2-3 (VALID):** played 2026-10-03 04:49-05:38Z on lane 4 (adolion-fresh, seeded earlier tonight, `start --no-seed --force-waiting`). The lane server was started with `SO_JUDGE_LLAMA_URL=http://127.0.0.1:18080`. Served dev bundle `5bc207ec4fe2` (staged from master `56ab6991`), confirmed in `run-header-start.json` `bundle.served`. Judge plugin 1.6.0, media off, player mode, persona Max Nightriver, chat `2026-10-03@01h49m21s041ms`. All 21 of T1-3's player lines were replayed (21 turns, 39 main RP requests). Route: war-the-summons -> war-the-front at turn 16. Stop: header diff 0 blocking; the one warning was the repo `dist` rebuilt mid-run while the served bundle stayed the same. 1 flag. Lane 4 stopped, no lease.
  - T6-2-2 is only a `start-failed.json`. The first start read back settings from a stale page (no `replyEffort`, `houseRules` on). After `st-session reload` the next start went through.
- **Row applied:** the five passed llama-logprob keys were routed together: `memoryPairs`, `typedExtraction`, `stallCheck`, `warden` and `agencyCheck`. I used `so-session setting judge.provider` (recorded in `turns.jsonl`) and put every key back to `typesafe` before stop; lane `settings.json` has 0 `llama-logprob`. `houseRules` stayed off (`typesafe`), so the warden was never refused `split`. Every other use stayed on TypeSafe.
- **Pre-play route check:** passed. One ask per routed ring use (memoryPairs, typed, stall, warden; agencyCheck rides warden) was answered by `llama-server:/workspace/models/TheDrummer_Artemis-31B-v1.1-Q4_K_M.gguf` in 202-298 ms, with 0 `uncalibrated` or `model-mismatch`. The plugin's llama-logprob served counter went 0 -> 4 (`x-route-check.js`, `x-route-check-result.json`).

| Routed use (llama-logprob) | Play calls | Answered | Fallbacks | Latency answered (p50 / p95) | Phase B row p50 / p95 |
|---|---|---|---|---|---|
| typedExtraction (`typed`, 15 questions per call) | 59 | **0** | timeout 48, busy 11 | n/a | 1041 / 4.1 s |
| warden + agencyCheck (`warden`, 3-17 questions) | 30 | **0** | timeout 27, busy 3 | n/a | 1320 / 3.8 s |
| stallCheck (`stall`, 12+ questions) | 7 | **0** | timeout 7 | n/a | 1180 / 3.5 s |
| memoryPairs (`memoryPairs`, 2 questions) | 58 | 26 | timeout 16, busy 16 | 1.9 / 3.0 s (budget 3.0 s) | 1475 / 1.7 s |

These counts exclude the 4 pre-play probes and 4 cache hits; source is `journal.jsonl`. The ring (`x-ring-check-end.json`) is capped at 300, so it has lost the early rows. The plugin served 971 llama-logprob `/completion` requests, because the page sends one request per question. It also refused 48 locally (busy, `maxInFlight` 2). The TypeSafe uses stayed healthy: director 40/42 (2 timeouts), lore 155/157, memoryVerify 37/37, scene 33/33, wardenLore 30/30.

| Row | Score | Evidence (T6-2-3) |
|---|---|---|
| provider (name it) | broken: llama-logprob (Artemis 31B Q4_K_M on the pod) for the 5 passed keys; routable and calibrated, but 3 of 4 ring uses answered 0 times in play | x-route-check-result.json, x-ring-check-end.json, journal.jsonl:39 |
| speaker direction | works: every named question answered first by the named member (14/14 named turns; T1-3 13/13). The "never mind" line went to Dalan, and the absent-Melisande line went to the narrator. The director stayed on TypeSafe | turns.jsonl:2, :3, :19, :20 |
| fallbacks | broken: 136 fallbacks on the routed uses (timeout 98, busy 38), each silently taking its no-judge path; 0 `uncalibrated` | findings.md:62, journal.jsonl:41, :646 |

Speaker direction vs T1-3: as good. Named-first was 14/14 here and 13/13 in T1-3. T1-3's 5 degenerate loops at the front did not recur (0 model defects).

Memory vs T1-3, at equal turns: about the same in volume. Entries 93 vs 92, epistemic 84 vs 80, ledger 127 vs 114, conflicts 23 vs 40, verifyDrops 17 vs 8. Empty private blocks were 0 here against T1-3's 13, and rejected epistemic lines 0 against 4. So nothing measurably worse. But the typed reads, the warden/agency checks and the stall checks never got a llama answer, so the memory and agency here are effectively the judge-off paths for those uses. That is no evidence the row works.

Findings:
- **HIGH (Phase B rows vs play):** the llama-logprob rows recorded as `passed` for typedExtraction, warden/agencyCheck and stallCheck time out in real play: 0 of 96 calls answered. memoryPairs answers 45% of calls, at p95 equal to its 3.0 s budget.
  - Likely cause, from the evidence:
    - The play calls are much bigger than the fixtures. typed sends 15 questions per call, the warden 3-17 and stall 12+, and each question is its own `/completion`.
    - Those requests go through a plugin limited to 2 in flight.
    - They run on the same llama-server (4 slots) that is streaming the group's main RP replies at that moment. typed and warden fire at each boundary, mid-round.
    - Phase B measured on an idle pod with fixture-sized requests.
  - Until the rows are re-measured under play load with play-sized requests (or the provider gets its own server/slots), these three keys should not read `passed`. memoryPairs is marginal. The default stays `typesafe`, so this costs nothing unless someone opts in.
  - Not changed here (W2, user's call).
  - Evidence: `T6-2-3/journal.jsonl:39`, `:41`, `:202`, `findings.md` "Judge health", `x-ring-check-end.json`, `console.jsonl` (48 × 429, 12 × 504).
- **LOW (product, journal):** the journal's judge `route` string is hard-coded `judge:typesafe:<model>` even for llama-logprob calls, e.g. `judge:typesafe:llama-server:/workspace/models/...`. The call ring's `provider` field is right. The session journal and digest therefore cannot tell providers apart. Evidence: `T6-2-3/journal.jsonl` (any memoryPairs row after 04:50).
- **LOW (harness):** the first `start` (T6-2-2) failed its settings read-back on a page that had not reloaded onto the staged bundle. A manual `st-session reload` was needed before `start`. The digest counts judge fallbacks by use but not by provider.
- Spend: DeepSeek 71 calls, 296,498 in / 51,648 out, all primary. Judge 191 metered calls (6 cached, 103 fallbacks), 1,327,087 in / 117,758 out. llama-logprob: 971 `/completion` requests on the pod. Main RP 39. Pod: about 52 min of lane time (04:47-05:39Z). The pod was left running.


### Earlier attempt

- **T6-2-1 (not played, no session started):** 2026-10-03 03:38-03:40Z on lane 4 (adolion-fresh, not re-seeded), lane server started with `SO_JUDGE_LLAMA_URL=http://127.0.0.1:18080` as in Phase B; served dev bundle staged from master `b2ad5870`, judge plugin 1.6.0. Pod `/health` ok.
- **Why not played:** the card asks for routed uses that are calibrated for the model and fixture revision. The matrix's six floor-x2-in-budget uses (memory-pairs, continuity, typed, stall, agency, contradiction-release) were measured into `test/measurements/v2.6-12/llama-logprob/`, but no calibration row was recorded into the product: `JUDGE_READINESS_BY_PROVIDER["llama-logprob"]` is `{}` (`src/judge/readiness.ts:184-187`), so `judgeRoute` refuses every llama-logprob route as `uncalibrated` before sending. The matrix also says no default changes without the user (W2). Per the card's must-not ("a routed use refuses as uncalibrated"), the run was stopped rather than played on a forced route; the default TypeSafe arm is T1-3's baseline and was not replayed.
- **Live confirmation:** `so-judge status` reported `llama-logprob.configured: true` (host 127.0.0.1:18080). With memoryPairs, typedExtraction, stallCheck, agencyCheck and warden routed to llama-logprob in memory only (never saved; restored in a `finally`, lane `settings.json` has 0 `llama-logprob`), `JudgeRuntime.ask` answered `fallback: "uncalibrated"`, 0 ms, no model for memoryPairs, stall, typed and warden (`T6-2-1/2026-10-03T03-39-04-934Z_st-eval.json`, script `x-route-check.js`). The plugin's served counter stayed 0 for both providers (`so-judge-status-after.json`).

| Row | Score | Evidence (T6-2-1) |
|---|---|---|
| provider | llama-logprob: not routable (no calibration row in the bundle) | src/judge/readiness.ts:184-187, 2026-10-03T03-39-04-934Z_st-eval.json |
| speaker direction | not measured (not played) | |
| fallbacks | every routed use `uncalibrated` (by design, logged) | 2026-10-03T03-39-04-934Z_st-eval.json, so-judge-status-after.json |

Findings:
- BLOCKER (process, not a product defect): Phase B measurements were never recorded as `llama-logprob` readiness rows (calibration, `measuredOn` = the Artemis GGUF id, `fixtureRevision`, `passed`). Until a build adds them for the six qualifying uses, T6-2 cannot be run. Adding them is also a routing decision for the user (W2).
- LOW (harness): `globalThis.storyOrchestratorJudge` (the dev harness) has no `ask`, so a route check needs `rt.getJudge().ask`. No so-judge verb asks a use through its live route.
- Note for the re-run: continuity has no ring use of its own (it rides `warden`, which also carries agencyCheck and houseRules, `RING_USE_ROUTE_KEYS`). houseRules is not cleared on llama-logprob, so routing warden needs houseRules routed too or off, or the route is refused as `split`. contradiction-release has no route key.
- Spend: judge 0 calls (TypeSafe 0, llama 0), main RP 0, DeepSeek 0. Pod about 2 min of lane time, no model calls. Lane 4 stopped, no lease.

## T6-4 Judge off (lane 2, `test/sessions/T6/T6-4-1` VALID)

- **T6-4-1 (VALID):** played 2026-10-02 15:48-16:08Z on lane 2 (seeded at pin be0696b, then `start --no-seed`, see harness), served bundle `133b12aa92a0` (dev, master `811d19d6`), media off, thinking overlay default, judge fully off (master switch and every use). Player mode, persona Max Nightriver, chat `2026-10-02@12h47m22s751ms`. 11 player turns, T2-2's lines plus the card's "I'll stand as the Crown's second.", 2 flags. Route nightriver-house -> fathers-summons (turn 3) -> whispers (turn 5, the stop condition) -> the-duel (turn 11). Stop: header diff 0 blocking (warning: repo `dist` rebuilt mid-run, served bundle unchanged); `assert-player-clean` ok; lane 2 left unleased.

| Row | Score | Evidence (T6-4-1) |
|---|---|---|
| silent fallback | works | x-judge-fetch-count-end.json, evidence-*.json judgeCalls [], session.json spend |
| speaker direction without judge | works | turns.jsonl:1, journal.jsonl:14, :17, :30 |
| memory without judge | annoying | payloads.jsonl:65, :143, evidence-*.json epistemic (retired@5) |

Live checks (detail in `T6-4-1/findings.md` "Live checks"): 0 requests to the judge plugin (in-page counter), `extras.judge.calls` empty, meter 0; director = LLM director (7) + mention rule (3); warden stood down silently (no record); lore select = ST keyword scan (20 fired rows, no lore flags); memory verify skipped (72 rows, 0 verifyDrops); all 20 loud TC requests carry the 5 `reasoning_budget_*`/`generation_prompt` keys with budget 400 (the 3 without are ST Summarize quiet calls); `selected_world_info` [] at start and end, the 4 books met by `story`; empty replies 0 of 20 (17 with reasoning, 1146-1667 chars, no leaks); DeepSeek 73 calls all primary (0 fallback, 0 failed), 166,951 in / 27,652 out; no judge notice, error or console error.

Must-not checks: no judge-unavailable message (none); no stall T2-2 lacked (the digest's whispers stall is an evidence-count read issue, it advanced 3 min later; T2-2 ended at whispers); **Natalia learned about the seals** (msg 15, flagged), and Ronan recited Shiya's private report (msg 24, flagged): same class as T2-2, not worse.

Findings:
- HIGH (product, carried from T2-2, judge-independent): the secret reaches excluded members outside the private block, through session-details memory, the ledger and ST Summarize (`payloads.jsonl:65`, `:143`).
- MEDIUM (product): every `[hiding]` epistemic row retired at its creation boundary (`retired@5`, `retired@8`), so no hiding row reaches a private block; cause unverified.
- MEDIUM (product): the mention rule drafted Natalia after "Natalia must not hear it." (`journal.jsonl:17`), as in T2-2.
- MEDIUM (extraction): the monotonic count `evidence` was re-read as 1 eight times after a second authored clue (`journal.jsonl:201`-`:330`), parking whispers 10 boundaries until a reconcile set 3.
- MEDIUM (pacing): the-duel's herald post (msg 33) skipped past Natalia's direct question (msgs 31-32).
- LOW (voice): narrator messages open "Shiya:" (msgs 4, 21) and speak Natalia's lines (msg 32).
- Harness: `adolion-fresh seed` fails on `$.selected: length 16 vs 0` for any lane whose last good seed predates cf9ce13c (`lastGoodSeed` never moves past it); `start --no-seed` after a clean `adolion-fresh check` was the workaround. `media.variant "full"` label while media is off. Judge plugin `/status` has no served-call counter.
- Spend: DeepSeek 73 calls 166,951 / 27,652; judge 0; main RP 23 requests (20 loud + 3 ST Summarize). Pod about 30 min (seed 15:37-15:45 + play 15:48-16:08).

## T6-3 Harness routing (lane 1, `test/sessions/T6/T6-3-1` VALID, harness route NOT exercised)

- **T6-3-1 (VALID):** played 2026-10-02 15:46-16:20Z on lane 1, using `start --no-seed` after the seed failed the drift check (as in T6-4). Served bundle `133b12aa92a0` (dev, master `811d19d6`), media off, thinking overlay default. Author mode. Stop: header diff 0 blocking, with the wizard allowance covering +4 cards, +1 book, +1 group and +1 story (`the-redrawn-kingdom@1`); the repo `dist` was rebuilt mid-run but the served bundle was unchanged (warning).
- **Blocker (host config):** opencode is not offered. The ST plugin dir `plugins/story-orchestrator-harness/` has no `config.json`, so `/status` reports `offered:false`, `agentBridge:false` and `cacheWarm:false`, and the settings panel offers no harness. Enabling it is a host-owner change in the shared ST tree, so it was not made. The harness-vs-local question stays open until `config.json` sets `{"harnesses":{"opencode":{"offer":true}}}`, the opencode cache is warmed, and T6-3 is re-run.
- What ran instead:
  - Fallback visibility: the Wizard role was routed to `harness:opencode:openai/gpt-6-astra-fast` by a settings write, then both wizard entries were run. Both refused and neither fell back to the local route.
  - The local-route agent wizard in review mode: 1 run plus New goal plus 4 Continues, 47 review cards accepted, 17 provisioning cards applied one by one. Story saved.
  - The Envoy Marrow group gap was fixed by hand with `/member-add`.
  - 9 player turns, 1 flag.

| Row | Score | Evidence (T6-3-1) |
|---|---|---|
| harness route | not-noticed (not exercised: not offered) | shots/002-capabilities-harness-unavailable.png, shots/003-authoring-unavailable-harness.png, console.jsonl:2 |
| fallback visibility | annoying | shots/006-agent-call-failed-harness.png, shots/004-authoring-test-result.png, console.jsonl:2, :30, journal.jsonl:666 |

Fix-wave live checks (detail in `T6-3-1/findings.md` "Fix-wave live checks"):
- Start `cast_changes` are written by names and take effect: 3 members muted, only Halden spoke for 7 turns, Marrow was enabled at courier_offer, 0 `CAST_UNRESOLVED`.
- Agent output: the one done summary matched the draft; 0 `patch: {}`; drive and motive cards preview real values.
- Reply budget: 10/10 loud TC requests carry the 5 `reasoning_budget_*`/`generation_prompt` keys with 400; the 2 without are ST Summarize.
- Lore: the story book is met by `story` and its entries fired; lane `globalSelect` stayed [].
- Judge plugin 1.5.0.
- Empty replies 0/10 (10 with reasoning, 0 leaks).
- Routes: every executed agent step ran local (219/219, first-try valid 182/219). The tool bridge never opened.

Must-not checks: the harness wrote nothing (it never ran). All provisioning waited for Create it: chars 163->167, books 24->25, groups 12->13. No silent fallback.

Findings:
- BLOCKER (host config): harness not offered (above).
- HIGH (product, agent): the local agent never finishes.
  - Run 1 spent 28 of 40 steps on `readGuide` and ended "Finished" at step 38 (~223k tokens), recommending "a fresh budget" while only New goal was offered.
  - The next runs looped through 219 steps and ~1.46M tokens (45 `readCheckpoint`, 28 `readStory`, 28 `lookupCharacters`, 37 refused, including 9 re-creates of its own assets) and ended Out of budget.
- HIGH (product, agent): the group was created before the 4th card and never updated, so the saved story was not ready in its own group (shots/020). The agent believed provisioning was done.
- MEDIUM (product): invalid values (`tension_target` 1/3/5/"high", `agency` as a string) are dropped silently and reported as "this changes nothing in the draft", which drives retry loops. A mixed card was accepted showing only its valid half.
- MEDIUM (product UX): harness failures show only "…failed; the details are in the browser console", and the role Test says "failed its self-test" with no reason. The actionable reason is in the console only.
- MEDIUM (wizard story): every gate is `>= 1` and the Varn members are never enabled. The finale came at turn 8, with Ysolde and Casimir muted through their own scene. Diagnostics said "No issues".
- LOW:
  - Contradictory lore entries (Alderhelm vs Alderan, both fired); greeting names "House Vell".
  - A no-change requirements card was offered.
  - The ledger omits the created group.
  - New goal drops the previous run's transcript.
  - The agent refusal with no chat open is not in the model-call ring.
- Harness:
  - Seed drift (`$.selected 16 vs 0`) as T6-4.
  - No so-session/so-ui verb to accept agent review cards or apply agent provisioning cards (an operator loop was used, `x-accept-loop.js`).
- Spend: DeepSeek 273 calls, 1,679,980 in / 42,628 out, all primary. Judge 51 (4 timeouts). Main RP 12 (10 loud + 2 ST Summarize). Pod about 25 min of play. Assets left on lane 1's copy.

## T6-3 re-run (lane 1, `test/sessions/T6/T6-3-3` INVALID (harness allowance), harness route blocked by opencode quota)

- **T6-3-2 (left as is):** interrupted by the host restart at 20:02Z after 16 agent steps. It had already hit "quota: opencode reports its usage limit" at 19:48Z.
- **T6-3-3:** played 2026-10-02 20:25-21:21Z on lane 1. Served bundle `5b74e2aafe0b` (dev, master `1d8b575d`). Harness plugin 1.1.0: opencode offered, warm, `agentBridge:true`. Media off. Author mode.
  - Start deviation: the seed failed its ComfyUI guard on 8 refused `GET :8188/object_info`. These come from ST's built-in Image Generation, which loads its ComfyUI lists on every page load. ComfyUI was down, so nothing was reached. I disabled `stable-diffusion` in lane 1's copy, ran `adolion-fresh check 1` (clean), then `start --no-seed`.
  - Why INVALID: the stop diff blocked only on `inventory.characterCount 163 -> 167` against an allowance of +5. That is a harness bug: the allowance counts the agent-created group as a character. Every other change was allowed by name. Scores are `--provisional`.

| Row | Score (provisional) | Evidence (T6-3-3) |
|---|---|---|
| harness route | not-noticed (not exercised: opencode account quota) | turns.jsonl:4, shots/001-role-test-quota.png, shots/003-harness-plan-quota.png, lane server.log |
| fallback visibility | annoying | turns.jsonl:10, shots/009-stepbystep-after.png, shots/x03-role-row-after-fallback.png |

Live checks (detail in `T6-3-3/findings.md` "Live checks"):
- Harness:
  - The panel offers opencode.
  - The role Test states the reason ("opencode reports its usage limit", after 75-89 s).
  - The tool bridge opened twice: `agent {calls:0, kind:quota}`. No call was parked or answered, and nothing was written.
  - Agent entry: visible error, no fallback. It ignores the role's On failure.
  - Step by step: fell back to DeepSeek twice with no notice in the pane. The role meter showed "0 fell back".
  - `quotaUntil` stays null, so every call waits about 80 s again.
- Fix wave (local route):
  - 133 steps, 108 first-try valid, 3 Continues.
  - 4 guide repeats refused. No re-creates.
  - The 3x repeated refusal stopped the run with a reason.
  - The group was created after the 4th card and holds the whole cast; the ledger records it.
  - 11 provisioning cards waited and were applied one by one.
  - Saved with diagnostics "No issues".
- Play (11 turns):
  - 17/17 loud TC requests carry budget 400.
  - Book met by `story`; `lorebooksSelected` [] at both ends.
  - Empty replies 0/17.
  - 2/17 reasoning leaks.
  - Muted members stayed silent until enabled.

Findings:
- HIGH (product, play): visible reasoning leaks in 2 of 17 replies.
  - Msg 14 opens with the thought's tail plus `<channel|>`; its reasoning was cut at about 400 tokens.
  - Msg 17 opens `"speech", *...` (`journal.jsonl:257`, `:297`).
- HIGH (wizard story/diagnostics): offer, archive, raid and choice each passed straight through, and the finale came at turn 9.
  - `gate-open-on-arrival` stayed silent because it checks only the entering edge.
  - Offer's exit was met two edges earlier. Raid and choice read `pen_control`, which was already `apprentice_held` at boundary 1.
- MEDIUM (product, agent):
  - `updateQuality` drops `evidence_from` (`src/copilot/parseFields.ts:92-108`). So the step the `quality-outcome-player-evidence` note recommends is refused as "changes nothing", which stopped the run.
  - `setRequirements.groups` is dropped the same way.
- MEDIUM (product, routing):
  - Step by step falls back to On failure with no notice, and the meter undercounts.
  - The Agent entry (bridge) ignores On failure.
  - A quota with no retry time is retried at full cost on every call.
- LOW:
  - The status pill stays "Planning" after a failed agent call.
  - The role Test shows no "testing" state during a 75-89 s call.
  - The Scholar-Envoy speaks under the House Agent's name (msg 26).
  - Agent calls with no chat open are not in the model-call ring.
- Harness:
  - characterCount allowance bug (`scripts/debug/lib/sessionWizardAssets.mts`: `characters` does not exclude `agentNames`).
  - The ComfyUI guard sees ST Image Generation's load-time probes only when ComfyUI is down. Lanes keep `sd.source = comfy`, so every lane page load contacts 127.0.0.1:8188.
  - The digest's model-defect detector missed both leaks.
- Spend:
  - DeepSeek 167 calls, 1,090,526 in / 40,808 out.
  - Judge 78 (2 timeouts).
  - Main RP 19 (17 loud + 2 ST Summarize).
  - opencode 5 spawns, all quota.
- Open:
  - The harness-vs-local question is still unanswered. It needs the opencode usage limit to reset, then T6-3-4 with the allowance fixed.
  - Assets are left in lane 1's copy; lane 1 is stopped.
