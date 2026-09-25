# Plan 05 — Extraction and off-path follow-ups

**Status: DRAFT 2026-09-25 — awaits user approval.** Depends on **02** (overview §Plan sequence), and on 11 through it.
Backend-shaped items (F4–F7) also read plan **13 "Harness routing"** for their harness column; they do not wait for it.
Verified against master `e7626d7`. Re-verify every path:line before building (v2.4 rule 1). Nothing here is built.

Every item names its measurement and a floor **before** any build. An item without a measurement is a spike with
conditions; below its floor it is recorded **not built**, and no floor is retuned.

## Source rows

| Row | Source | State on `e7626d7` |
|---|---|---|
| FACT/MEMORY evidence window check (X26) | `v2.4/04-extraction-input-quality.md:32-39`; overview `:190-192` | open |
| Epistemic/ledger over the whole scene | `v2.4/03-off-path-call-hygiene.md:41,363-364`; overview `:193-194` | open |
| Constrained decoding, rpm/mutex, reasoning-template strip (theme 3) | `v2.4/03-…:37-40`; SUMMARY `:166-170,718-719` | open |
| Token estimate (A13) | seeds §B A13; `v2.4/09-acceptance.md:256`; `v2.4/03-…:1003-1008` | open |
| Live-suite tiers (A17) | seeds §B A17; `v2.4/04-…:676-679` | open (Δ vacuous count, below) |
| Plan 04 regex parity | seeds §F; `v2.4/04-…:156-165,681-683` | open, not built on evidence |
| A5 labelled evidence refused | seeds §B A5 | **fixed** `2702435` (merge `c64c540`), D1; live check owed |
| A7 `tension_current` level refused | seeds §B A7 | **fixed** `2702435` (merge `c64c540`), D3; live check owed |
| A6 breaker / A11 memorize retry | seeds §B | **fixed** `efbe189` (merge `582d56a`); live check owed |
| A10 early triggered reads over 0-1 | seeds §B | **fixed** `9524384` (merge `ed6c367`): the scene-break cursor was page-lived; live check owed |
| Theme-4 extraction ideas | `v2.4/04-…:43-45` | candidates only (§Theme-4 below) |

Not here: A1/A2 (`69b378f`, prompt blocks), A8 (`ed6c367`, scene judge → plan 06), AE04 (`70b8eed`, lore/scene → plan 02).

## Goal

Close what v2.4 measured open on the read path, and make every backend-dependent claim carry the route it was measured on.

## Scope / out of scope

**In:** F0 live confirmation of the post-freeze extraction fixes; F1 FACT/MEMORY evidence (attribution, then screen); F2 live-suite
tiers; F3 whole-scene epistemic/ledger (spike); F4 reasoning-template strip (spike); F5 constrained decoding (spike); F6 rpm spacing
/ generation mutex (spike); F7 token estimate (measurement, reopens on a condition); F8 finish-reason recording in calibration;
F9 regex parity (its v2.4 build rule).

**Out:** plan 13's design (the route seam, the plugin, per role × route calibration). Redefining `plotDeltaAccuracy` (v2.4 X15).
The judge typed read (plan 06). Anything player-facing (rule 7). Theme-4 items, unless F2 produces a failing fixture for one.

## Route kinds (plan 13 interface this plan assumes, not designs)

| | **profile** route (today) | **harness** route (plan 13) |
|---|---|---|
| Transport | ST Connection Manager `sendRequest`, `extractData:false` (`stHost/modelReply.ts:116-135`) | server plugin → CLI harness (Claude Code / Codex / opencode), cloud model |
| Roles today | `read`, `synthesis`, `authoring`, `director`, `curator` (`extraction/passRole.ts:1`); epistemic/ledger ride `read` (`extractionCoordinator.ts:385,403`), scene/short-term ride `synthesis` (`:325,359`) | per role, finer split is plan 13's |
| Samplers | TC only (`modelReply.ts:111-114`); CC left to the preset | harness-owned |
| Finish | `readFinish` (`modelReply.ts:72-85`) | harness must map to `ModelFinish` |
| Tokenizer | ST main-API tokenizer (03-H11, `host-facts.md:89`) | none in ST; harness usage/limits |
| Recorded today | run header `extraction.profiles`, `profiles.urls` (`so-run-header.mts:209-216`) | plan 13 adds a route field to the audit |

`SharedReadAudit` carries no route or profile (`extraction/types.ts:95-113`). Until plan 13 adds one, **every measurement here is
archived with a run header** and states the role's route from it. A number measured on one route is never quoted for the other.

## Verified current state (master `e7626d7`, 2026-09-25)

| Claim | Seen | Δ |
|---|---|---|
| Deltas are screened (scope, evidence, `evidence_from`); FACT/MEMORY are not | `screenDeltas` `extraction/sharedRead.ts:46-72`; facts returned as parsed `:200` | — |
| Facts and memory lines stamped `messageId: audit.window.to`, provenance `window.to` | `extractionCoordinator.ts:200-201`, `:91` | Δ v2.4 cited `:177-178` |
| Rollback removes/quarantines a row by its `messageId` | `dropByMessageId` `memory/stores.ts:77-118` | so a fact read from message 3 in window 0-7 dies with message 7 |
| Evidence strips the window's own `[n] Speaker:` label | `lineLabel` `extraction/evidence.ts:63`, `evidenceSources` `:82` | A5 fixed (D1) |
| Replay of 299 acceptance audits: 13 of 90 "evidence not in window" were labels; 77 remain unclassified; 0 of 206 accepted lost | `test/findings/mutations/v24-acc-d1-d3.txt` | — |
| `key=value=<v>` and single-quoted levels parse; 23 of 24 invalid values now parse (`reached_tower="false"` refused by design) | `parse.ts:7,84-87,126`; same record | A7 fixed (D3); prompt still says "one quoted level" (`contract.ts:21`) |
| Epistemic/ledger pass reads the **detecting** window; scene summary reads the whole scene | `runEpistemicLedgerPass` `extractionCoordinator.ts:371-376` vs `runSceneBreakPass` `:313-319` (`memory.sceneStart`) | — |
| Reasoning strip: fixed leading forms (`<think>`, `<thinking>`, Gemma, Harmony), never the profile's template | `parse.ts:22-27,52-63`; applied `client.ts:77,91` | — |
| CM profiles carry a `reasoning-template`; ST parses it only with prefix **and** suffix | `connection-manager/index.js:48`; `reasoning.js:1461-1467` | — |
| CC `json_schema` parse trap applies only when `extractData` is true | `custom-request.js:476-492`; our seam sends `extractData:false` (`modelReply.ts:127`) | Δ SUMMARY `:718` ("our seam returns `''`") no longer holds |
| No rpm spacing, no generation-mutex listener; one light + one heavy scheduler lane; backlog runs outside the scheduler | grep 0; `scheduler.ts:107-108`; `v2.4/03-…:1043-1050` | — |
| `GENERATION_MUTEX_*` absent from ST core | grep `public/scripts/events.js`, `public/script.js`: 0 | community string events only |
| Budget margin 10 %, estimate via main-API tokenizer | `extraction/inputBudget.ts:2,49-53`; `stHost/tokenizer.ts:3-8` | — |
| Estimate error measured on TC profile routes only: ~1 % low (669–685 over `inputBudget`), A13 358–374 low (87,707 vs 88,319) | `v2.4/03-…:1003-1008`; `v2.4/09-acceptance.md:256` | no CC or non-textgen measurement exists |
| Finish reasons: curator calibration 20/20 `stop` on the RunPod TC profile; authoring 24/24 `unknown` | `test/goldens/live/role-calibration/{curator,authoring}-shared-65733265d301.json` | authoring's is a harness artifact: `roleCalibration.ts:176` hardcodes `"unknown"` |
| Live suite scores deltas, facts, rejected, arcs, epistemic, ledger; floors default 0.8 for the last three | `scripts/debug/so-live-suite.mts:101-108`; `lib/liveSuiteScore.mts:124` | — |
| 0 of 22 extractor fixtures state epistemic/ledger/arcs; `fixtureRun` supports `epistemicLedgerCapable` | `test/fixtures/extractor*.expected.json`; `extraction/fixtureRun.ts:22,55` | — |
| Vacuous `mustContain: [""]`: 2 of 22 (`extractor21`, `extractor22`) | fixtures | Δ gotcha says 16 of 22 |
| Facts tier 16/22 = 0.727 (floor 0.68, target 0.85); the 6 misses all "got 0 FACT lines" (`extractor`, 2, 3, 4, 5, 15) | `test/journeys/records/v2.4-acceptance/live-suite/run1/so-live-suite-report.json` | — |
| No regex capability; `promptRegex` is a constant `false` | `capabilities.ts:18`; `windowHygiene.ts:10` | — |
| Budgets | `extractionCoordinator` **604/620**, `memoryCoordinator` 619/620, manager **740/740** | Δ overview 736 |
| Census rows touched | `ExtractionCoordinator.applyAudit` (`ownership-sites.json:52`), `runEpistemicLedgerPass` (`:56`) | rule 13 applies |

## Design per item

### F0 — Live confirmation of the post-freeze extraction fixes (the extraction half of plan 02's post-freeze row)

| Fix | Gate (×2, lane, uncontended backend per seed E1) | Green |
|---|---|---|
| A5/D1 | J7 `--strict` | Replay each "evidence not in window" rejection from the two J7 audits through `evidenceSources` over the window rebuilt from its prompt (the D1 method). Green requires both: (a) 0 rejections that the replay finds (its own line's label plus a verbatim span); (b) at least 1 quote across the two runs, accepted or rejected, that carries its own line's `[n] Speaker:` label — if (b) fails, the row is "not exercised", not green. Rejections carrying another line's label, a bare label, or a labelled paraphrase are correct by D1's rule: counted and reported, never failed |
| A7/D3 | same J7 runs | 0 `tension_current` "invalid value" rejections; `tension_current` moves off 0 |
| A6 | `live-v24-03-breaker.json` plus a new slow arm (`live-v25-05-breaker-slow.json`) on its own lane, whose extraction profile points at a delaying proxy or at a backend held busy by a concurrent long request, so measured PONG latency is above 10 s and below the backoff cap | ×2: the breaker closes either on an answered call or on a probe whose budget is above `PROBE_TIMEOUT_MS`; no hold past one backoff step; the measured answer latency (> 10 s) is recorded in the gate record. Negative control: a mutant with `probeTimeoutMs` returning a fixed 10000 must hold the breaker open past one backoff step on the same arm, or the arm proves nothing |
| A10 | J12 | the first read of a fresh chat never compares its cast with the previous chat's |
| A11 | `live-v24-03-memorize.json` + a forced-timeout arm (×2, lane). The arm sets a new debug global `storyOrchestratorDebugCallBudgetScale` (read only in `callBudget.ts` `callTimeoutMs`, default 1, cleared by the `--sandbox` start and cleanup like the other `storyOrchestratorDebug*` globals) to a value that puts the whole-chat pass's first budget below its measured duration and its 2× retry above it | Forced arm: `timeoutRetries.length >= 1` with at least one entry whose read is the `memorize:full` pass, retry at ≈ 2× budget, backfill complete with no `lastError`; the fixture's step-15 eval pushes a problem when the arm marker is set and no such entry exists. Base arm: unchanged (a timeout there is tolerated, not required). Negative control, run once: with `retryOnTimeout` bypassed (mutant) or `TIMEOUT_RETRY_SCALE=1`, the forced arm ends with backfill incomplete and `lastError` naming the budget. The debug global is a build item here (seam default-inert; unit test that scale 1 leaves `callTimeoutMs` unchanged) |

Plus one offline step: classify the 77 remaining "evidence not in window" rejections from the D1 replay (paraphrase / invented /
elision miss). No build follows unless a class is ours (a parser/screen defect), and then as its own red fixture.
F0 is owned here (02 C8 routes these rows to F0). The A6 slow arm and the A11 forced-timeout arm are deliberately contended or
throttled, the one exception to the uncontended-backend header (seed E1).

### F1 — FACT/MEMORY evidence (X26): attribution first, screen second

**Measurement M1 (offline, before any code):** replay every FACT and MEMORY line in the v2.4-acceptance audits
(`journal-follow.jsonl`, window rebuilt from each audit's prompt, the D1 method) through `evidenceSources`. Record per line:
found / not found, and source id vs `window.to`.

- **F1a attribution.** A fact is stamped with its evidence's first source message; not found → `window.to` as today. Rollback of a
  later message then no longer drops a fact read from an earlier one.
  - **Floor:** M1 found-rate ≥ **0.8** of FACT lines (else attribution mostly falls back and buys nothing) → build.
  - Guard: `rollbackReplay.property.test.ts` stays green; a new case pins "a fact quoted from message 3 survives a rollback of 7".
- **F1b screen.** Reject a FACT/MEMORY line whose non-empty evidence is not in the window ("evidence not in window", same reason
  string as deltas).
  - **Floors (all three):** (i) hand-label the M1 not-found lines (all, or 40 sampled): ≥ **0.7** truly unsupported (screen
    precision); (ii) a `factsScreened` column added to the live suite beside `facts` (never replacing it, X15) reads ≥ **0.727** in
    both runs (today's measured facts, no regression); (iii) J3 and J8.5 ×2 stay green.
  - Interaction: `memoryVerify` (judge) already screens support when on; F1b runs before it and is judge-independent.
- **Budget.** Source ids come back from `runSharedRead` (pure); the coordinator change is the two stamps at `:200-201`, each
  changed in two places: the entry `messageId`, and the `messageId` passed into `provenanceFor` (today `window.to`, `:91`).
  Both take the evidence's first source id, falling back to `window.to`; otherwise `describeProvenance`
  (`memory/provenance.ts:100`), which the drawer shows, keeps naming `window.to`. Quarantine already keys on
  `entry.messageId` (`stores.ts:95`).
- **Route.** Route-independent (screening is in page), but M1 and the live columns are per route: rerun on each route plan 13 adds.

### F2 — Live-suite tiers (A17)

- New fixtures `extractor23`–`extractor29`: epistemic ×3 (one `[hiding]`, one long scene for F3), ledger ×2, arcs ×2; ≥ 2 Spanish.
  Expectations written from the transcript, **before** the first live answer, frozen by sha. Floors declared now: the script
  defaults (0.8 each). A tier below it is recorded below floor, never retuned.
- `extractor21`/`22`: replace `[""]` with a needle the transcript supports, or drop the facts expectation. Decided from the
  transcript, not from a model answer.
- The 6 zero-FACT misses: classify from the recorded raw responses (FACT section absent / cut by `maxTokens` / present but
  unparsed). A class that is ours becomes a red parser fixture; a model omission is recorded.
- **Gate:** `so-live-suite.mts --expect-count 29` ×2 per route, `--min-tier` at the declared floors.

### F3 — Epistemic/ledger over the whole scene (spike)

- **Arms:** A = detecting window (today); B = `[sceneStart, to]`, packed by the existing chunker (`extraction/chunker.ts`), one pass
  per chunk, merged through the existing `applyEpistemic`/`applyLedger` path (`capEpistemic`, `dropCommonKnowledge` unchanged).
- **Measurement:** F2's long-scene fixtures plus ≥ 4 more where the asymmetry is set > 8 messages before the break (≥ 1 es).
  Metrics: epistemic/ledger recall, precision, prompt tokens per scene.
- **Floor to build B:** recall gain ≥ **0.25** absolute on the long slice; no recall loss on the short slice; precision drop
  ≤ **0.1**; tokens per scene ≤ **3×** A. Measured per route (a cloud harness changes the cost term, not the recall term).
- **If built:** the chunk loop is pure; the token check sits **inside** the loop before each write (gotcha "put the check before
  EACH host write"); `runEpistemicLedgerPass` census note updated; coordinator growth ≤ 8 lines, else budget-blocked (rule 12).

### F4 — Reasoning-template strip (spike)

- **Measurement M4:** replay every archived raw reply (acceptance audits, role-calibration records, live-suite reports) through
  `stripReasoningBlocks`, then through a template strip built from each profile's `reasoning-template` (lane copy). Count
  residue (a leading reasoning block that survives today) and empty-after-strip.
- **Floor:** build only if residue ≥ **1** real reply on any route. Else recorded not built (the fixed forms are the authority).
- **Per route:** profile — prefix/suffix from the CM profile via ST's own parser (`reasoning.js:1461`), after our forms, never
  instead of them; CC with out-of-band `reasoning_content` has nothing inline, and its failure mode is an **empty** `content`
  (gotchas: Gemma CC), counted as `empty` per route. Harness — plan 13 must state whether replies are final text; the strip is
  idempotent and runs anyway; M4 is re-run on harness replies in plan 13's calibration.

### F5 — Constrained decoding (spike, opt-in per role, default off)

- **Measurement M5:** re-score the authoring and curator calibration records by repair cause: JSON syntax vs op shape.
  Known: authoring `65733265d301` first-try 16/20, repaired `a05`/`a12`/`a15`, failed `a16` (out-of-stage kinds: shape, not syntax).
- **Floor:** build only if ≥ **2 of 20** first-try failures are JSON syntax on some route.
- **Per route:** profile TC llama.cpp — GBNF (host fact owed: llama.cpp ignores `json_schema` when a grammar is sent, seen in the
  Image Director work, not verified from ST source here); profile CC — `json_schema` in `overridePayload`; with `extractData:false`
  the ST parse trap is bypassed (Δ above), but `extractJsonFromData` vs `extractMessageFromData` for tool-call-shaped sources is a
  host fact owed. Harness — harness-native structured output (plan 13). A route without support is refused with a reason
  (the sampler-overlay shape, inv 21).

### F6 — Rate spacing and generation mutex (spike)

- **Measurement M6:** per route over a live batch: `transport` failures whose message carries a rate-limit (429-class) signal;
  off-path timeouts that coincide with a main generation on the **same** backend, on a single uncontended lane (seed E1).
- **Floors:** rpm spacing only if ≥ **1** rate-limit failure on a route (expected on harness/cloud routes, plan 13's calibration
  feeds it). Mutex deferral only if ≥ **3** same-backend coincident timeouts in J7 ×2.
- **Per route:** mutex applies only to profile routes that share the main model's backend; the `GENERATION_MUTEX_*` events are
  community strings, not ST core, so any listener is a capability (absent = no deferral). Harness routes get spacing only.

### F7 — Token estimate (A13; measurement only)

- **Measurement M7** `live-v25-05-token-estimate.json`: windows of ~2k / 20k / 80k tokens per route, and for profile routes two
  main-API pairings: main TC + extraction TC (today's measured case) and main CC + extraction TC (the unmeasured mismatch 03-H11
  predicts). True size from the server (`tokens_evaluated`, `usage.prompt_tokens`) or harness usage.
- **Floor to reopen:** |error| > **5 %** (half the margin) on any route, or any true overrun of `contextLimit − maxTokens`.
  Otherwise recorded as measured and closed.
- **Harness:** no ST tokenizer applies; plan 13 must supply the context limit source (`ContextLimit.source`) and usage; M7
  reruns there.

### F8 — Finish reason in calibration

`roleCalibration.ts:176` records `"unknown"` for every authoring response, so a truncated authoring reply is invisible to
calibration: `runAuthoringStage` (`copilot/authoring.ts:33,43`) calls `callExtractionModel`, which returns only the text
(`client.ts:113-116`), and `CopilotAudit` has no finish field. Scope: switch `runAuthoringStage` to `callExtractionReply` (or
plan 03 D1's `ModelCall`, whichever has landed), add `finish` and `repairFinish` to `CopilotAudit`, and have `runAuthoring`
read them the way `runCurator` does (`roleCalibration.ts:164`). Sequencing: F8 lands after plan 03 D1, or states the rebase
onto D1's `ModelCall` surface, because D1 rewrites the same two call sites. Test: a fake reply with `finish: "length"`, run
through the real `runAuthoringStage` audit rather than a stubbed result, appears in the calibration record. The curator's 20/20 `stop` is live evidence for 03-H18's stop half → handed to plan
02 C4 (docs), not claimed here.

### F9 — Regex parity (v2.4 build rule, unchanged)

- **Measurement:** `live-v24-04-window-hygiene.json` with a planted user `promptOnly` regex script, on a lane copy only, ×2.
- **Floor:** build (the v2.4 design, `v2.4/04-…:156-165`, setting default off) only if the covering prompt carries residue in
  either run. 0 residue → recorded not built again. Route-independent (the window is built in page).

## Theme-4 candidates (recorded, not scheduled)

Current values in the prompt, signed `+5`, min/max step, negative memory, full restatement, `[intends]`, witness sets. The deltas
tier is 22/22 on both acceptance runs, so none has a measurable failure today. Each enters only with a fixture that fails on
`e7626d7`; otherwise it goes to plan 09's spike list.

## Order of work

F0 (live) and F8 (small) first → M1, M4, M5 offline replays (no backend) → F2 fixtures frozen → F1a/F1b per floors → F3 arms →
M6/M7 live batches → F9 → gate record.

## Tests

- **Red first:** F1a "a fact quoted from message 3 survives a rollback of 7" (fails today: `:200` stamps `window.to`), and for
  that fact `entry.messageId === 3` and `describeProvenance(entry)` contains "message 3"; F1b "an
  unfound FACT line is rejected with the delta reason"; F8 "a `length` finish reaches the authoring record"; F3 chunk-loop
  ownership lapse writes nothing (fake chunk resolving after the token lapses).
- **Negative controls:** a fact with empty evidence keeps today's path; a label-only quote is not evidence for a fact (D1's rule);
  F3 arm A unchanged when the scene fits one window; F4 template strip is identity when prefix or suffix is empty (ST's rule);
  F5 off = request byte-identical to today (payload capture).
- **Mutants** (`test/findings/mutations/v25-05-*.txt`): attribution uses `window.to` again; screen skips MEMORY lines; screen
  accepts a label-only quote; chunk-loop check moved after the write; template strip replaces our forms instead of following
  them; F8 hardcodes `unknown` again.
- Harness: `npm run test:debug` gains cases for the `factsScreened` column and `--expect-count 29`.
- Machine gates: typecheck, typecheck:test, lint, test, debug:typecheck, build, test:release; `st-session.mts reload` after build.

## Live gates (real LLM, ×2 consecutive, `--strict`, run header diffed around each batch)

Records: `test/journeys/records/v2.5-plan05/<route>/`. Every record names its route from the run header.

| Gate | Green |
|---|---|
| F0 rows | as its table |
| Live suite ×2 per route | deltas ≥ 0.9, facts ≥ 0.68, rejected ≥ 0.9, new tiers at their declared floors, `factsScreened` ≥ 0.727 if F1b built, 29 of 29 ran |
| J3, J7, J8.5 ×2 (after F1) | unchanged green; quarantine journal shows facts attributed to their source message |
| F3 (if built) | long-scene fixture recall at its floor ×2; tokens per scene logged |
| M6/M7 | numbers recorded per route; a floor crossing opens its item |

## Risks

- F1b lowers facts recall if the model paraphrases its evidence; that is why its floor is precision-first and non-regression.
- F1a changes what a rollback keeps; `rollback ≡ replay` must hold on the new attribution, not only today's.
- F3 multiplies model calls on long scenes; the cost term is measured per route, and a slow profile can fail the floor alone.
- Shared-backend contention (seed E1) can fake M6's mutex signal; hence single-lane, uncontended.
- Plan 13 may split roles differently from `PASS_ROLES`; F-item numbers are per role and must be re-keyed, not reused.
- `extractionCoordinator` has 16 lines on the pre-03 tree (today's 620 budget); after plan 03 step 4 the reserved headroom
  is ≤ 8 lines under 560 (03 D3 reservation). F1+F3 must stay in pure modules or fit that headroom, else budget-blocked (rule
  12); if F3 runs on the post-03 tree, re-measure against it.

## Unresolved questions

- F1b: reject unfound FACT lines outright, or keep them as `downweight` (the `memoryVerify` shape)? Plan proposes reject.
- F2: may the new fixtures carry Spanish transcripts although the extension is English-only for 2.5 (V11)? Plan proposes yes
  (the judge rule already requires es slices; the reader must not break on them).
