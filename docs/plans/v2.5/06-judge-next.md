# Plan 06 — Judge: hosts and next uses

**Status: DRAFT 2026-09-25 — awaits user approval.** Depends on **03** (coordinator lines: the warden, scene and
extraction coordinators sit at their budgets, overview rule 12), on **U2** for J5 (hosted routes) and on **13** for J8
(LLM-as-judge via a harness). J1–J4 can start once 03 lands. Verified against master `e7626d7`. **Re-verify every
path:line before building** (v2.4 rule 1). Every new use follows v2.4 rule 4 / overview V9: its own Phase A before any
runtime code, a ≥ 20-case fixture with a Spanish slice, a floor declared before any answer is read, a judge-off column,
its own `judge.uses.*` key, **off by default and never flipped by a plan**. A use below its floor is recorded as
not built, and no floor is retuned.

## Source rows

| Row | Where | Item here |
|---|---|---|
| D10 hosted routes (NanoGPT, OpenRouter), local Jev-likes | overview §06; `v2.4/00-overview.md:398`; `v2.4/07-judge.md:49,252-253` | J5 (U2) |
| Judge-shaped candidates: boundary bundle, tension read, pre-reply Choice, R16 record | overview §06; `v2.4/07-judge.md:52-53`; SUMMARY `:258,268-270` | J6 |
| v2.3 plan-10 spikes | `v2.3/v2.4-seeds.md:26`; `v2.3/10-judge-seeds.md:86-100` | J7 |
| `sceneOoc` / `memoryRerank` | `v2.4/07-judge.md:290-292` | listed, not scheduled (§Scope) |
| Authoring role on the memory route below its es floor (A14) | seeds §E row 1; `v2.4/09-acceptance.md:257`; residue "T18 per-role calibration" | J1 |
| Curator role now meets every floor; `recommended-config` must say so | seeds §E row 2 | J1 |
| Agency and house-rule effect on replies (A15, A16) | seeds §E row 3; residue; `v2.4/07-judge.md:1350-1356` | J3 |
| TypeSafe published terms; warden 4 s timeout | seeds §E row 4; residue; `v2.4/07-judge.md:1027-1028,1437` | J4, J2 |
| In-flight call missed by the journey meter | same row; `v2.4/07-judge.md:1399-1401` | **plan 03** (harness), not here |
| A8 scene-judge timeouts (J11.25) | seeds §B A8 | J2 (live check only; the fix is merged, `ed6c367`) |
| "LLM-as-judge via a harness" | plan 13 spike H-S3 (`13-harness-routing.md` §Scope) | J8 (candidate) |

## Goal

1. Close the judge and role-calibration rows v2.4 measured open (J1–J4), each by a measurement, not a retune.
2. Decide D10 on evidence the user asked for (J5), and state plainly what plan 13's harness routing can and cannot
   do for the judge.
3. Give every judge-shaped candidate a Phase A the user can pick (J6–J8). None is a build until its floor is met.

## Scope / out of scope

**In:** J1 role-calibration follow-ups (authoring es, curator recommendation, the per-role protocol plan 13 reuses);
J2 warden timeout and the A8 residue; J3 the reply-effect control arms; J4 the TypeSafe terms row; J5 hosted routes
(Phase 0, then build only on U2 = yes); J6 the four judge-shaped candidates; J7 the v2.3 plan-10 spikes (user picks);
J8 LLM-as-judge via a harness (candidate, after plan 13).

**Out:**
- `judge.uses.memoryPairs` on the write-path hold: plan 04. R14 lore contradiction in the warden: plan 08.
- F5 curator `create`: recorded not built (must-not-propose 0.879 < 1.00; seeds §F), not a v2.5 item.
- The journey-meter in-flight gap: plan 03 (it is harness, not product).
- J11.23 stall policy (p 0.93 < `STALL_DIRECT_P` 0.95 → re-read): by design (A9), recorded only.
- `sceneOoc` / `memoryRerank`: come back only with a named consumer and a new Phase A at the v2.2 floors (OOC ≥ 0.9 with
  ≤ 1 false positive per 12 over ≥ 40 rows with the addressee list; rerank ≥ +10 points recall@budget over ≥ 30 windows).
  No consumer exists, so nothing is scheduled.
- The harness transport itself, its plugin and the role → route type: plan 13.
- Refused (overview §Out of scope): reroll/swipe QA, judge-driven rewrite, judge-written state, per-checkpoint house
  rules, a browser-held key, any default flip.

## Verified current state (master `e7626d7`, 2026-09-25)

**Judge path (TypeSafe Jev through the plugin)**

| Claim | Seen |
|---|---|
| 14 use keys, all default `false` | `src/judge/settings.ts:5-20`, `:61`; built list `:173`; author-only `:176` |
| One transport: page → plugin `/systemone` → TypeSafe | `src/services/stHost/judge.ts:7,29,53`; `server-plugin/story-orchestrator-judge/index.mjs:26` (`TYPESAFE_BASE_URL` override, path fixed to `/v1/systemone`) |
| Plugin default model and caps | `index.mjs:8` (`jev-1.13.0`), `:10` (140 000 chars), `:106`; forwards any non-empty `model` string `:151` (plan 12 PR-05) |
| Model-id map: canonical `jev-1.13.0`, floating `jev-latest`/`jev-preview`; no hosted ids | `src/judge/policy.ts:5-9`, `modelVerdict` `:21-26` |
| Call sites (`use` string → timeout) | director `runtime/judge.ts:202` (1500, `policy.ts:32`); lore `runtime/loreSelect.ts:70` (1500, `:59`); scene `coordinators/sceneCoordinator.ts:138` (2500, `:49`); warden `runtime/continuity.ts:66` (4000, `:68`); stall `extractionCoordinator.ts:172`; memoryVerify `:242`; typed `runtime/typedRead.ts:14`; critic `expansionCoordinator.ts:187`; memoryPairs `runtime/consolidationMatches.ts:56`; curatorFilter `runtime/curatorFilter.ts:20` |
| Every call lands in `extras.judge.calls` (cap 300) with `model`, tokens, `cached`, `discarded` | `src/judge/types.ts:80-96`; `policy.ts:3`; journal event `runtime/journal.ts:162-172` |
| Boundary-time judge work | `scene-read` order 55 (`runtime/boundaryWork.ts:97-107`), `continuity-warden` order 57 (`:112-117`), both fire-and-forget |
| Pre-reply seam | lore selection waits for `MESSAGE_SENT` (`runtime/index.ts:193,232,319`) |
| Judge-answered typed qualities leave the extractor's scope (R16) | `src/extraction/sharedRead.ts:160-164` (`residual = scope − answered`) |
| Tension is an EMA of extractor samples | `src/pacing/tension.ts:21-25` |

**A8 after the fix (`9524384`, merged `ed6c367`).** `SceneCoordinator` keeps one call in flight keyed by its request;
an identical run whose world still owns it joins it (`sceneCoordinator.ts:108-109`), only the asking run ages the
record (`:119`), and the flight clears on land (`:146-148`). `SCENE_TIMEOUT_MS` stays 2500. Ledger `ACC-A8` is closed on
jest (`test/findings/ledger.json:461-468`). **Left open:** no live J11.25 on a bundle carrying the fix, and 3 single
(non-burst) timeouts at 13.8–14.8k state chars in J11 seriesB-run3 that the ring does not explain (same ledger note).
The seeds' hypothesis (fetch queued behind long same-origin requests) is superseded by the burst finding.

**Role → route map (T18, v2.4 plan 08). Plan 13 extends exactly this; J1 calibrates against it.**

| Piece | Seen |
|---|---|
| Roles and labels: `read` "Story reads", `synthesis` "Summaries and canon", `authoring` "Wizard and road ahead", `director` "Speaker direction", `curator` "World Info curator" | `src/extraction/passRole.ts:1-11` |
| Setting: `extraction.profiles?: Partial<Record<PassRole, string>>` (Connection Manager profile ids), install-wide | `src/runtime/types.ts:275-283`; sanitized `runtime/passProfiles.ts:11-17`, `runtime/settingsStore.ts:86-87,100` |
| Resolver: unset → `extraction.profileId` (`source: "fallback"`); set and existing → `source: "role"`; set and missing → refused with the role named | `runtime/passProfiles.ts:19-24` |
| Router installed once; applied inside the one client chokepoint; a refusal throws `ModelCallError("config")` | `runtime/index.ts:64` → `extraction/client.ts:49-61` (`setProfileRouter`/`routeProfile`) → `client.ts:78-81` |
| `read` callers | cadence/scheduled read `extraction/scheduler.ts:437`; manual read `coordinators/extractionCoordinator.ts:282`; epistemic P2 `:385`; ledger P2 `:403`; memorize overhead estimate `:442` (profile null); memorize windows `:480`; supersession bridge `coordinators/memoryCoordinator.ts:553`; live suite `runtime/liveSuite.ts:71`; model self-test `runtime/selfTest.ts:173` |
| `synthesis` callers | scene summary `extractionCoordinator.ts:325`; short-term compaction `:359`; arc summary `memoryCoordinator.ts:281`; canon `:392` |
| `authoring` callers | every copilot/wizard stage, driver suggest/report `coordinators/copilotCoordinator.ts:45-46` (used at `:50,207,213`); expansion generator + critic + pick `coordinators/expansionCoordinator.ts:269` |
| `director` caller | the LLM talk director `runtime/index.ts:262-266` (`DIRECTOR_MAX_TOKENS` 96, outer race `DIRECTOR_TIMEOUT_MS` 20000, `runtime/talkControl.ts:8-9,260`); its breaker is read by route `runtime/index.ts:268` |
| `curator` callers | WI curator `coordinators/stagecraftCoordinator.ts:198-199`; live suite `runtime/liveSuite.ts:96` |
| Calibration and self-test drive the same client | `runtime/roleCalibration.ts:155,163,171,185`; `runtime/roleSelfTest.ts:128,135,141,149` |
| Census: every client caller must name a role literal | `runtime/passProfiles.test.ts:63-81` |
| Health, Repair, UI | `runtime/roleHealth.ts:25-38` (configured route + breaker + self-test, not the answering route); `components/settings/RoleProfilesGroup.tsx`; `src/index.tsx:252-262,414` |
| Budget per route | `runtime/requestBudget.ts:12` (`routedProfileId`) |
| What answered is not recorded: the answered observer feeds only the breaker | `client.ts:39-47,90` → `runtime/index.ts:65`; no audit carries a profile (`extraction/types.ts:95-113`, `stagecraft/types.ts:124-132`, `runtime/types.ts:52-61`, `copilot/types.ts:68-73`) |
| **Not roles:** every `judge.uses.*` key and the warden. They go through `JudgeRuntime.ask` → the plugin, never through `callExtractionModel`. Two directors exist: the LLM one (role `director`, 20 s) and the judge one (`judge.uses.director`, 1500 ms) | table above |

**Δ drift found while verifying**

| Cited | Found |
|---|---|
| overview §06 / Inputs: D10 at `v2.4/00-overview.md:396`, D12 at `:398` | D10 is `:398`, D12 is `:400` |
| plan 13: resolver at `passProfiles.ts:20-37` | the file is 24 lines; resolver `:19-24` |
| seeds A8: hypothesis "judge fetch queues behind long same-origin requests" | superseded: 15 of 18 timeouts were identical-request bursts (`ledger.json:467`) |
| `v2.3/recommended-config.md` has role rows | it has judge-use rows only (`:41-42` …); role recommendations live only in `v2.4/08-author-observability.md` §Gate record |
| two `DIRECTOR_TIMEOUT_MS` constants | judge 1500 (`judge/policy.ts:32`) vs LLM 20000 (`runtime/talkControl.ts:8`); name both whenever a doc says "the director's budget" |

## Design

### J1 — Role calibration follow-ups (T18) and the protocol plan 13 reuses

| Part | Evidence | Action | Gate |
|---|---|---|---|
| Authoring es 7/8 = 0.875 < 0.90 | a16 (es): after its repair, the checkpoints stage sets a snapshot on unknown quality `reliquia_recuperada`; `parseStoryV2` refuses the draft (`09-acceptance.md:257`; golden `test/goldens/live/role-calibration/authoring-shared-65733265d301.json`) | Fixture first: a jest case replays a16's recorded answer through `runAuthoringStage` and shows the refused draft. Fix candidates, pick after the red case: (a) `validateProposal` refuses a `setCheckpointSnapshot` on a quality the draft does not declare **before** the repair, so the repair sees the error; (b) the checkpoints-stage repair prompt lists the draft's quality keys | Re-run `so-role-calibration.mts run --role authoring --arm shared-<bundle> --record --expect-count 20` **×2**, same labels, same floors (validity ≥ 0.90, opShape ≥ 0.80, overall and es). Recommended only if both runs meet every floor. Before the fix is picked, write ≥ 4 new es authoring rows (`test/fixtures/role-calibration/authoring-holdout.json`, labelled and committed first, following the memory-pairs-holdout rule). Score them in both ×2 re-runs and report their validity/opShape beside the fixture score; they do not enter or change the fixture floors. If the fixture meets its floors but the hold-out has a miss in either run, the recommended-config row says "fixture floors met; generalisation not shown" instead of "recommended" |
| Curator meets every floor for the first time | validity 20/20, opShape 14/14, decision 19/20; es 8/8, 6/6, 7/8 (`curator-shared-65733265d301.json`) | Doc/config change: a **"Models per task"** section in the recommended config (none exists, Δ above) with one row per role: route, bundle, golden, verdict. Curator → recommended on "Same as memory model" (`Story Orchestrator Memory RunPod`, Artemis 31B) on `65733265d301` | Plan 10 re-runs curator + authoring on the v2.5 candidate ×2; the row names the v2.5 bundle only after that |
| Protocol ownership | fixtures `test/fixtures/role-calibration/*.json` + `judge/director.json`; floors `v2.4/08-author-observability.md:460-488`; recommendation rule `:486-488` | This plan owns fixtures, floors and the rule. **Plan 13 adds arms, never floors.** A harness arm has no sampler control, so every arm, local or harness, runs ×2 and a verdict needs both | the verdict vocabulary is plan 13's (`recommended` / `usable` / `refused`); a floor edit in either plan is a review failure |

### J2 — Off-path judge timeouts: warden 4 s and the A8 residue

| | Warden (`CONTINUITY_TIMEOUT_MS` 4000, `policy.ts:68`) | Scene (`SCENE_TIMEOUT_MS` 2500, `policy.ts:49`) |
|---|---|---|
| Recorded | one fallback on a 4 s timeout, not investigated (`v2.4/07-judge.md:1027-1028`); metered p50 554 / p90 1219 / max 2126 ms, 0 fallbacks, over the 14 metered calls of v2.4 part 2 (`:1383-1387`) | burst fix merged; 3 unexplained singles at 13.8–14.8k chars |
| Measure | every warden call in the plan 10 J8 ×2 records and the JM control arms (`so-judge cost-report`): timeouts per call, and whether a timed-out call shares its `messageId` with another in-flight warden call (the A8 shape: a group turn commits several boundaries in ~1 s) | J11.25 ×2 consecutive on a bundle carrying `9524384`, on an uncontended backend (seeds E1); scene calls from the J11 rings |
| Predeclared close | ≤ 1 timeout per 50 warden calls over ≥ 100 calls → recorded, closed; fewer than 100 warden calls in plan 10's judge-on records → recorded as "unmeasured (n = N)", NOT closed, and listed as an open row in plan 10's verdict table (not deferred); plan 10's JM row sizes the judge-on warden columns to reach ≥ 100 calls | 0 bursts (two scene calls with one request key in flight), ≤ 1 timeout per 20 scene calls, J11.25 green ×2 |
| Else | bursts → the A8 in-flight sharing, keyed by request, in the warden pass (fixture first); singles → `stateChars` vs latency table. **The timeout is raised only if successful calls' p99 exceeds it**, never to make a count pass; p99 is read only when there are ≥ 100 successful calls, and below that the timeout is not changed. Plan 08 L7 enlarges the warden request; its `wardenLore`-on calls are counted separately | singles cluster > 12k chars → a scene-window cap is a candidate (own measurement), not built here |

### J3 — Effect on replies: agency and house-rule control arms (A15, A16)

The calibration passed (agency 51/51, house rules 95/96), so neither use is removed. What is missing is evidence that
the note changes the next reply. v2.4 could not show it: in every agency arm the only flagged reply was the scripted m2
(A16), and the house-rule note held in 1 run of 2 (pooled defect on 0.4 vs off 0.3, A15).

| | Agency (`judge.uses.agencyCheck`) | House rules (`judge.uses.houseRules`) |
|---|---|---|
| Arm that can show an effect | an **induced** arm: a story whose checkpoint AN and NPC demand a player answer each turn (the pressure that makes narrators write the player), no scripted defect; the real model's own replies only | the J8.12 story (no guns), no scripted defect |
| Size (predeclared) | ≥ 20 real replies per arm; on ×2 and off ×2, consecutive, same scripted player turns | same |
| Metric | next-reply defect rate by `so-judge rescore --use agency` (the calibrated question, off arm as control) + a blind human sample of 10 per arm | `--use house-rules`, same |
| Validity bar | the off arm's defect rate ≥ 0.2; below it the arm did not induce the defect, and the run is **void**, not a pass | off arm ≥ 0.2 |
| Effect floor | on ≤ off − 0.15 absolute, in both on runs | same |
| Verdict | met → recommended config says "reduces"; missed → "flags reliably; no effect on replies shown". The key stays default off either way | same; a stronger placement (depth, AN slot) is a **new** arm with its own record, never a retune |
| Over-steer | plan 01's probe columns on N+1 (restate, meta tokens, swing), human rubric row when U4 runs | same |

### J4 — TypeSafe published terms (privacy row)

Read TypeSafe's terms and data policy through the `typesafe:typesafe-ai` skill's live docs (retention, training use,
processing region, sub-processors). Write the per-host row in `docs/plans/v2.3/privacy-report.md` (it says the terms
"were not read in this pass", `:141-142`), citing URL and date. If nothing is published: the row says so with the URLs
checked, and plan 12's README privacy section (PR-16) repeats it. No product change. Also answers U7's input (what a
multi-user install sends where).

### J5 — D10 hosted routes (U2 decides; Phase 0 only until then)

**What harness routing (plan 13) does not do.** Jev is a System One classifier. Its answer is a probability
distribution (Noul p, Choice probabilities, Score distribution), and every judge threshold reads that distribution:
`CONTINUITY_P` 0.7, `AGENCY_SCORE` 2.5 on the raw Score, `LORE_MIN_P` 0.6, `SCENE_TRIGGER` 0.4 (`judge/policy.ts:45-75`).
A CLI harness (`claude -p`, `codex exec`, `opencode run`) returns generated text from a chat model, with no calibrated
probability. So plan 13 serves **no** `judge.uses.*` key, `stHost/judge.ts` stays the only judge transport, and the
TypeSafe plugin is not replaced (plan 13 §Out agrees). A D10 host is therefore **a second vendor for the same
classifier**, not another model family. Reaching another family for a judgment is J8, a different contract.

| Step | Content | Pass |
|---|---|---|
| Phase 0 (docs, no key, no spend) | For NanoGPT and OpenRouter: is Jev served, under which id (`typesafe/jev-1.13`?), through the **System One contract** (typed answers with probabilities) or only chat completions; auth header; usage/cost fields; terms. Local Jev-likes: context and contract (v2.4: laya ~1k context, openjev a different contract) | recorded per host with URL + date |
| Contract identical | plugin host table `{typesafe, nanogpt, openrouter}: {baseUrl, path, keyName, modelIds}`; `JUDGE_MODEL_IDS.canonical` gains the hosted ids; readiness `measuredOn` becomes host × model; the plugin's permitted-model list (PR-05) **is** that table | per host × model: every **recommended** use re-calibrated on its existing fixture, floors unchanged, ×2; a privacy row per host |
| Contract differs (chat completions only) | not a Jev host: recorded as such; the idea moves to J8 | — |
| Local Jev-like | built only if Phase 0 finds ≥ 32k context and the same contract | as above |

Default stays TypeSafe. A host is an opt-in setting next to the key, never a fallback: a judge call never answers from
a host the author did not choose (the T18 rule, applied to the judge).

### J6 — Judge-shaped candidates (each a Phase A; none built until its floor)

| | J6a pre-reply Choice | J6b boundary bundle | J6c tension read | J6d R16 disagreement record |
|---|---|---|---|---|
| What | one Choice on the player's new line (intent: attempt / question / dialogue / meta) before the reply | merge judge calls of one boundary whose `state` is the same into one request | a raw Score over the newest reply as an EMA sample | the extractor also answers judge-answered keys, in shadow; the diff is logged author-only |
| Seam | `MESSAGE_SENT` (`runtime/index.ts:319`), shared with lore selection; **both must fit one 1500 ms wait** | boundary work orders 55/57 | `pacing/tension.ts:21-25` | `sharedRead.ts:163-164` |
| Phase 0 | name the consumer first (a toggle nothing reads is the dead-toggle mistake). Candidates: the steering clause chosen by intent (attempt → the agency clause, C4); meta → skip forced lore and the warden for that turn | from a J11 ring, group each boundary's requests by state hash; if no two uses share ≥ 80 % of state chars, **recorded not built** (nothing to merge) | the judge-off arm is the extractor's tension; A7 is fixed (`c64c540`, D3), but this control is valid only once plan 05's A7/D3 live check is green: 0 `tension_current` invalid-value rejections and `tension_current` moving off 0 in the J7 runs (`05-extraction-followups.md` F0); until then the judge-off arm is broken | none (measurement only) |
| Fixture | ≥ 40 player lines from archived journey records (≥ 8 es), labelled before any answer | the continuity-combined pattern: every bundled family re-run inside the bundle | ≥ 30 windows, 5 levels, ≥ 8 es | — |
| Floor (predeclared) | per-class recall ≥ 0.85; meta precision ≥ 0.95; combined MESSAGE_SENT wait p90 ≤ 1500 ms | every family at its existing floor, else arm B (separate); calls per boundary −30 % on the J11 ring | within ±1 level ≥ 0.90, exact ≥ 0.60, **and** exact beats the extractor by ≥ 0.10 | token overhead ≤ 10 % per read; jest proves a shadow answer is never applied |
| Key | `judge.uses.playerIntent` | no user key. Ships only as an internal arm constant (`policy.ts`, the `WARDEN_ARM` pattern), default the separate arm. The combined arm is selected only after every bundled family meets its existing floor inside the bundle. Phase A also records the rate at which one timeout or error in a bundled call loses answers for every family in it (`continuity.ts:67` shape), against the separate arm on the same J11 ring | `judge.uses.tensionRead` | `judge.uses.shadowTyped` (author-only), in `JUDGE_USE_KEYS`, default false via `defaultJudgeUses`/`sanitizeJudgeSettings`, never flipped by a plan |
| Cheapest? | yes (SUMMARY 2/S-M) | only if Phase 0 finds sharing | 3/M; Reddit caution that numeric tension grading "still wasn't good" | 2/M; feeds `typedExtraction` readiness |

### J7 — v2.3 plan-10 spikes (the user picks; floors as declared in `v2.3/10-judge-seeds.md:88-97`)

| Spike | Floor | Consumer |
|---|---|---|
| Direct scene-break confirmation (Noul) | ≥ 0.95 break / 1.0 nobreak | `sceneTrigger` |
| Canon / summary verify (Noul per sentence) | ≥ 0.9 unsupported dropped, ≤ 0.1 supported dropped | canon regeneration |
| Epistemic via judge (Choice per subject × fact) | ≥ 0.85 vs the LLM pass | epistemic pass |
| Cast-tuning curator (Score per member) | ≥ 0.85 on ≥ 20 labelled rings | new curator, review only |
| Two-hop look-ahead | ≥ 0.85 | `lookahead` |
| Per-quality floors | policy only | `typedExtraction` |
| Canon regeneration drafts (+ Noul verify) | ≥ 0.9 supported kept, 0 unsupported inserted | canon, author review only |

Each needs a ≥ 20-case fixture with ≥ 8 Spanish rows (v2.3 §E), lives in `scripts/spike/typesafe/experiments/`, and
leaves a golden that replays in jest whatever the verdict. "Recap narrator" waits on the human session (rule 7).

### J8 — LLM-as-judge via a harness (candidate; plan 13 H-S3)

| Question | Answer |
|---|---|
| Contract | a verbalized label (+ optional stated confidence) parsed from text. **Not** a calibrated probability, so no existing threshold carries over; each use needs a decision rule of its own |
| Corpus | the existing fixtures, unchanged: continuity 28, continuity-combined 85, agency 51, house rules 96, director 33, scene, stall, typed |
| Columns | harness arm vs the Jev arm vs judge off, same rows; per-family floors = the Jev use's floors |
| Where it could run | off-path only. Harness wall time is 2–7 s before the model works (plan 13 host facts), so the reply-path uses (judge director 1500 ms, lore 1500 ms, J6a) are excluded by construction; the warden's 4000 ms budget is already exceeded by spawn, so an off-path use would need its own budget and the late-note lapse rules |
| Setting | per use, `judge.transport[use]: "typesafe" \| <harness route>`, default `typesafe`; the use's own key still gates it |
| Cost / privacy | the user's subscription quota; the reply and facts go to the harness vendor (a new privacy row per vendor) |
| When | after plan 13 H1–H4 exist on a dev build. **Not a v2.5 build unless the user asks** |

## Order of work

1. J4 (docs) and J5 Phase 0 (docs), at once.
2. J1 authoring fixture → fix → calibration ×2; the curator/role section of the recommended config.
3. J2 measurements from plan 10's records (no new runs of its own) and J11.25 ×2. This plan's Gate record states that J2
   closes in plan 10 (its matrix row J2; plan 10 entry criterion 1 carves it out).
4. J3 control arms (lane, real LLM + real judge). J6c's Phase A runs only after plan 05's A7/D3 live check is green.
5. J6/J7/J8 only as the user picks; each: fixture labelled → calibrate `--record` → verdict → build or not-built record.

## Tests

- **Jest, red first:** the a16 replay (J1); for any J2 sharing, the burst test in the shape of
  `coordinators/sceneBurst.review.test.ts`; for each built use: key default off, fallback on
  disabled/unavailable/timeout/cancelled/error/invalid, readiness row with `measuredOn`, the golden replay asserting
  per-family counts and every floor (the `warden.test.ts` pattern; a deleted golden fails). J6d: a shadow delta never
  reaches `acceptedDeltas`.
- **Mutation-checked** (`npm run mutate`): each threshold moved past a recorded score, each question reworded.
- **Calibration:** `so-judge calibrate --use <use> --record`; `so-role-calibration.mts run --role <role> --arm
  shared-<bundle> --record --expect-count 20`. A floor miss exits 1 and is recorded, never retried into a pass.
- **Machine gates:** `npm run typecheck && npm run typecheck:test && npm run lint && npm test && npm run build &&
  npm run test:release && npm run test:plugin && npm run test:debug && npm run debug:typecheck`; storybook when a
  settings component changes; `node scripts/debug/st-session.mts reload` after every build.

## Live gates (real LLM + real judge, `--strict`, ×2 consecutive, one bundle per record)

| Gate | Check |
|---|---|
| J1 | authoring and curator calibration ×2 on the v2.5 candidate; goldens `*-shared-<bundle>.json` |
| J2 | J11.25 ×2; warden and scene timeout tables from the J8/J11 rings |
| J3 | agency and house-rule arms: on ×2, off ×2 each; `so-lore-probe diff` + `so-judge rescore`; void runs named |
| each built J6/J7 use | J8/J11 check extended (note in the captured `GENERATE_AFTER_DATA` prompt, off arm makes 0 calls), `so-judge cost-report` totals vs the meter |
| J5 (if built) | per host × model calibration ×2; privacy capture of the plugin bodies per host |

Run-header capture/diff around every batch (`judge`, `extraction.profiles`, stagecraft unchanged). Records under
`test/journeys/records/v2.5-plan06/`, archived in the same commit as the claim.

## Risks

- **Budget lines.** The warden pass lives in `stagecraftCoordinator` and the scene read in `sceneCoordinator`; a J2
  sharing change or a J6 consumer that has no line goes to plan 03 (rule 12), never squeezed in.
- **An induced arm can over-induce.** A story that forces player answers may make the defect so dense that any note
  looks effective. The human sample and the swing columns are the check; the off-arm bar only guards the other side.
- **Hosted routes double the vendors per call** (D10) and each needs its own calibration; with the key already
  configured nothing here needs them.
- **J8 looks like a cheaper judge and is not one.** Without probabilities every threshold is re-derived per use, and
  spawn latency rules out every on-path use.
- **Two directors.** A report that says "director" must say which (role vs judge use); the timeouts differ 13×.

## Unresolved questions

- U2 (overview): hosted judge routes wanted at all? If no, J5 stops after Phase 0's record.
- Which J6/J7 candidates to run, and in what order? (J6a is the cheapest; J6b may end at its Phase 0.)
- J6a's consumer: steering clause by intent, meta-turn skips, or both?
- J3's induced agency arm: acceptable to author a story that pressures the narrator into writing the player?
- J8: pursue LLM-as-judge through a harness in v2.5 at all, or record it for later?
- J4: if TypeSafe publishes no terms, should the README still recommend any judge use?
