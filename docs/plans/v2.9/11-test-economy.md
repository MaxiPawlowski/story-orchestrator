# Plan 11 — Test economy: GPU only where a model output is judged, stop rules everywhere

Owner request 2026-10-25: only the 3090 is available. Every test and measurement (unit, replay, Storybook, no-model lane,
real-model row, blind rating) is classed by what it needs; the GPU runs only rows whose verdict depends on what the model
wrote, and every measurement stops as soon as its outcome is decided.

## Classes

| Class | Needs | Runs | Examples |
|---|---|---|---|
| U | nothing | `npm run gates` (per change `gates:quick`) | jest, typecheck, lint, test:replay, test:debug, test:plugin, Storybook |
| N | ST lane, no model | `npm run suite:nomodel` (new, B5) on lanes 30–34 | no-LLM scenarios (`scripts/suite/decisions.mjs`), no-model journeys, payload goldens |
| R | ST lane, recorded replies | replay lane (B3) | journey/scenario checks that need *a* plausible reply, not a judged one |
| M | model, no browser | `so-prompt-batch.mts` (B2) against the controller | W4 recorder, T8, v2.9 06 LT, 04 C2, 07 echoes, 05 P3 |
| E | model + browser | one smoke journey per freeze | GS1 (owner's real-LLM gate rule: browser-level, real model) |
| H | a person | owner's playthrough (decision 13) | GS1.10 copy, playtest rows |

A check's class is the cheapest one whose verdict it can still reach. A check that asserts on model wording is M or E; one
that asserts on plumbing around a reply (row written, rollback, HUD, persistence) is R or N.

## Stop rules (shared helper `scripts/debug/lib/stopRule.mts`, pure, node:test)

Every class-M and class-E measurement declares, before inference: N (planned items), its floors, and which floors are
zero-tolerance. The runner evaluates after every item:

- **S0 pilot.** The first `k = min(10, ceil(N/4))` items always run.
- **S1 unreachable.** Stop FAIL when misses so far exceed the misses the floor allows over N (exact, no statistics).
- **S2 futility.** After the pilot, stop FAIL when the Wilson 95 % upper bound of the pass rate so far is below the floor.
- **S3 zero tolerance.** Stop FAIL at the first confirmed violation of a zero floor (leaks, secret reaching a kept-out member).
- **S4 decided pass.** Stop PASS when passes so far already meet the floor over N, unless a paired or blind metric needs every
  item (then run on; S1–S3 still apply).
- **S5 plumbing.** A harness error, backend outage or refused request stops the row as NOT A MEASUREMENT after one retry; the
  GPU time is logged, nothing is scored.
- **Pairs.** A/B arms run interleaved per item (on, off, on, off…), so any stop leaves balanced pairs.
- **Record.** A stopped row records `{stopped: S<n>, at: i/N, counts}`. It is never resumed to change a result; floors are
  never retuned (unchanged rule).

Retroactive check: the 2026-10-25 W4 run (exact-set 13/147 real) trips S2 at the 10-read pilot; 64 reads were not needed.

## Builds (no GPU; D gates per change, `npm run gates` to close)

- **B1 stop rules.** `stopRule.mts` + table tests (each rule, pairs, a planted measurement that would pass S4 early and one that
  must not stop on a blind metric). Wire into `so-witness record`, `so-live-suite run`, the 06 LT runner, 04 C2 arms, `so-journey`
  (S5 only: a harness defect stops the journey instead of burning the remaining turns).
- **B2 prompt batch (class M).** `scripts/debug/so-prompt-batch.mts capture | send | score`.
  - `capture` runs the shipped prompt builder on a no-model lane (dry, like `so-payload-golden`) and freezes the exact request
    bodies (sha per item).
  - `send` posts them to the controller (`127.0.0.1:18888`) with the request's own sampler keys, sequentially, with stop rules;
    records `{sha, response, tokens, ms}`.
  - `score` is the existing offline scorer per measurement.
  - Contract test: a captured body equals what the page sends for the same item (golden diff), so batch = shipped prompt.
- **B3 replay backend (class R).** A loopback stub on a reserved port (`RESERVED_PORTS` gains it) that answers recorded responses
  keyed by `(fixture, step, member)`; a request it has no recording for is refused and counted (never invented). Every class-E/M
  run records its responses (`st-payload arm --persist` + response capture). A drift report names steps whose prompt sha moved
  since recording; a moved step is re-recorded at the next GPU window, its replay result stays valid for plumbing only.
- **B4 journey split.** Each journey/scenario check declares `model: judged | any | none`. `none`/`any` checks run in N/R; `judged`
  checks are the only GPU part of a row. Census test: every check declares it.
- **B5 `npm run suite:nomodel`.** The no-LLM list (`decisions.mjs`) + no-model journeys + replay checks on lanes 30–34, `--strict`,
  run at freeze and before merging any runtime change. Not part of `gates` (needs ST lanes).
- **B6 precision.** No vacuous passes: a leg whose precondition did not happen fails as `vacuous` (e.g. 47 step 13 when step 10
  read no kept event); every reported rate carries its denominator; `suite:mutation` lists tests that kill no mutant, reviewed and
  cut or sharpened (gates stay ≤ 8 min).

## Overlap cut

- 47 promises: GS6.8 covers the promise read; the scenario keeps only its rollback leg, class R after B3.
- T8: class M (4 fixtures, one batch).
- 45 seal: class E for the epilogue (real `verifySaga`), picker/heritage/Previously legs class N (`v28-45-carry.json` already).
- GS6: `judged` checks only on the GPU (codex read, promise read, time read); the rest R.

## GPU per freeze (3090)

- GS1 smoke ×1 (E): ~50 min.
- GS6 judged checks (E, B4): ~20 min.
- Batched M rows with stop rules: W4 re-test only when the witness prompt changes; T8; v2.9 06 LT; optional 04 C2 off-screen,
  07 count, 05 P3: ~40–60 min with S0–S4.
- Total ≈ 2 h (was 5–6 h).

## Order

1. Finish the lean night already running on build G (`d6d6aed5`): GS6, GS1, 47, T8, 45 seal as written (rules S1/S3/S5 applied by
   hand). Gate record in plan 70.
2. B1, B6 (small) → B2 → B4 → B3 → B5.
3. Next GPU window: v2.9 06 LT through B2 with stop rules; T8 batch.

## Unresolved questions

- Reserved port for the replay stub (proposal 18078).
- Whether B2 `send` needs the GPU broker lease or talks to the controller directly (controller queue already serializes).

## Build record: B1 + B6 (2026-10-25, branch `v2.9-11-b1-stoprules`, no GPU, no lanes)

- `scripts/debug/lib/stopRule.mts` (pure): S0 pilot `min(10, ceil(N/4))`; S1 exact (best reachable rate over the planned
  denominator; a counted metric without `planned` skips S1/S4); S2 Wilson 95% (upper for `atLeast`, lower for `atMost`); S3 first
  zero-floor hit, inside the pilot too; S4 only without `needsAll` and zero floors; S5 a plumbing item after one retry
  (`withOneRetry`, `isPlumbingError`); `interleave` for pairs; `stopRecord` = `{stopped, verdict, at: "i/N", reason, counts}`.
  Tests `stopRule.test.mts`: rule table, planted S4 pass at 15/20, `needsAll` never S4, the W4 shape (13/147, 0.9) S2 at 10/37,
  balanced pairs.
- `so-witness record`: `recordAll` interleaves on/off per read, scores each on-arm read against the frozen labels in its window
  (`scoreOneRead`, W4/W4fi/W4fe/W4cov + aside kept-out zero floor), `needsAll` (Wc pairs); writes `reads/stop.json`, refuses to
  resume a stopped run; `--no-stop` keeps S5 only. Exit 1 on a non-pass stop.
- `so-live-suite run`: `--min` + every positive tier floor (`lib/liveSuiteStop.mts`); `needsAll` with `--record`, `--arm` or
  intents expectations; a fixture that throws twice = S5; report gains `stopped`, `planned`, `plotDelta {hits, of, rate}`.
- `so-journey`: S5 only; a check failing on a harness defect is retried once, a second one stops the journey (check `blocked`,
  rest `not-runnable`, `runnerError`, `record.stopped`); `--no-stop` = old behaviour.
- B6: step modifier `precondition {step, path, atLeast}` (`lib/stepPrecondition.mts`, schema-validated, earlier step only, remapped
  by `withAuthorView`); an unmet one fails the step as `vacuous` without running it. 47 step 13 declares step 10 `kept >= 1`.
  Wc `lengthRate` now carries `{hits, of, rate}`.
- Open: 06 LT runner and 04 C2 arms not wired (no runner on master); `suite:mutation` no-kill review (B6 third item) not done.
## B2 build record 2026-10-25 (branch v2.9-11-b2-batch, not merged)

- `scripts/debug/so-prompt-batch.mts capture | send | score`; libs `lib/promptBatch.mts` (freeze, send, resume, S5, stop hook),
  `lib/promptBatchRecorder.mts` (page fetch recorder), `lib/promptBatchMeasures.mts` (w4, t8), `lib/promptBatchEntry.ts` (src reply
  processing and parsers for node). No src change.
- Capture = the shipped in-page path (`runWitnessRead`, `runFixture`) with a page fetch recorder: the one
  `/api/backends/text-completions/generate` call is recorded and answered with a canned backend reply, every other model route is
  refused. ST forwards llama.cpp bodies verbatim (text-completions.js 315-328, only `localhost` -> `127.0.0.1` in `api_server`, applied
  at freeze), so the frozen body is the controller's request. Other API types and chat completion are refused.
- Contract: per item, the builder prompt is inside the body and offline reply processing + parse of the canned answer equal the
  page's; `--verify` recapture gave 4/4 (t8) and 74/74 (w4) identical shas; golden `test/measurements/v2.9/11-b2/t8-golden`
  (`promptBatchContract.test.mts`: builder drift, self-check, send bytes, score). Replaying the G-run W4 answers through send + score
  reproduced `score-real-G.json` (real, null control, lab) and all 17 reads files byte for byte.
- `send` takes `--stop <module>` (B1 interface: `(progress) => {stop, rule, verdict, detail}`); S5 built in.
- Open: a W4 first answer the page would retry (refusal) is scored as an outage and listed `retryOwed`; W4 Wc uses
  backend token counts; 06 LT needs a scenario item kind.

## Build record: B4 + B5 (2026-10-25, branch `v2.9-11-b4b5`, no GPU; no-model lanes 30-34)

B4 journey/scenario check classes:
- `model: "judged" | "any" | "none"` on every top-level scenario with steps and every journey check (human rows too).
  judged = the verdict depends on what a model wrote (reads, judge, curator, wizard, measurement corpora); any = needs a
  model call or a configured model route, asserts plumbing around it; none = no model call (mocked reads count as none).
- `scripts/debug/lib/modelClass.mts`: classes, schema problems (wired into `validateFixture`, so so-scenario and the journey
  loader refuse an unknown class), `--model` parser, selection with `dependsOn` closure, `noModelRunnable`, census rules.
- Census `scripts/debug/lib/modelClass.test.mts` (test:debug): fails on a missing class, `requires.lane no-model` not none,
  `requires.lane model` none, or steps that call a model (`stepsShape`) marked none; planted controls.
- Runner filter: `so-journey run <id> --model judged` (or `none,any`) runs the listed classes plus their declared `dependsOn`
  (a none-only filter instead drops checks whose dependencies are not none); the rest are `skipped` with `deselected: true`,
  counted apart (`tallies.deselected`) and not failed by `--strict`; the record is `partial` and keeps `model {filter,
  selected, pulled, deselected}`. `so-scenario run <file> --model ...` prints `not-runnable: model class ...` and exits 0
  without touching the page when its class is not listed. `st-lanes batch --model` forwards to both.
- New `dependsOn` (state an earlier check leaves, found by reading or by the no-model run): GS6.2-GS6.12 on GS6.1, J14.2 on
  J14.1, J3.2-J3.8 on J3.1, J6.2-J6.4 on J6.1, J5.5 on J5.4, J1.7 on J1.6.
- Scenarios (305 with steps): judged 48, any 78, none 179. Every none is a `requires.lane no-model` file; every
  `requires.lane model` file is any or judged.
- Journey checks (188): judged 49, any 56, none 83.
  - GS1: judged 2, any 7, none 1. judged GS1.3, GS1.9; any GS1.1, GS1.2, GS1.4, GS1.5, GS1.6, GS1.7, GS1.8; none GS1.10
  - GS2: judged 3, any 5, none 0. judged GS2.2, GS2.3, GS2.6; any GS2.1, GS2.4, GS2.5, GS2.7, GS2.8
  - GS3: judged 2, any 5, none 0. judged GS3.3, GS3.6; any GS3.1, GS3.2, GS3.4, GS3.5, GS3.7
  - GS4: judged 3, any 3, none 0. judged GS4.2, GS4.3, GS4.4; any GS4.1, GS4.5, GS4.6
  - GS6: judged 2, any 6, none 4. judged GS6.3 (codex read), GS6.8 (promise read); any GS6.1, GS6.4, GS6.5, GS6.6, GS6.10,
    GS6.12; none GS6.2, GS6.7, GS6.9, GS6.11. GS6.9 (story time) makes no model call of its own (author time step fallback),
    so it is none, not the judged "time read" the overlap cut assumed
  - J0: none 6 (J0.1-J0.6)
  - J1: judged 1, none 9. judged J1.6; none J1.1-J1.5, J1.7-J1.10
  - J2: any 2, none 10. any J2.6, J2.9; none J2.1-J2.5, J2.7, J2.8, J2.10-J2.12
  - J3: judged 4, any 1, none 8. judged J3.1, J3.7, J3.10, J3.13; any J3.6; none J3.2-J3.5, J3.8, J3.9, J3.11, J3.12
  - J4: judged 1, none 6. judged J4.4; none J4.1-J4.3, J4.5-J4.7
  - J5: any 3, none 5. any J5.4, J5.7, J5.8; none J5.1-J5.3, J5.5, J5.6
  - J6: any 4, none 8. any J6.1, J6.6, J6.7, J6.8; none J6.2-J6.5, J6.9-J6.12
  - J7: judged 10 (J7.1-J7.10)
  - J8: judged 5, any 5, none 1. judged J8.5, J8.6, J8.10, J8.11, J8.12; any J8.1, J8.2, J8.4, J8.9, J8.13; none J8.3
  - J9: judged 4, none 6. judged J9.1, J9.3, J9.5, J9.6; none J9.2, J9.2b, J9.2c, J9.2d, J9.4, J9.7
  - J10: any 1, none 11. any J10.15; none J10.1-J10.7, J10.9, J10.10, J10.13, J10.14
  - J11: judged 7, any 14, none 5. judged J11.9, J11.12, J11.16, J11.20, J11.22, J11.23, J11.25; any J11.2-J11.4, J11.7,
    J11.8, J11.11, J11.13-J11.15, J11.17, J11.19, J11.21, J11.24, J11.26; none J11.1, J11.5, J11.6, J11.10, J11.18
  - J12: judged 3, none 2. judged J12.3, J12.4, J12.5; none J12.1, J12.2
  - J13: judged 1 (J13.1)
  - J14: judged 1, none 1. judged J14.1; none J14.2
- Judged scenarios: live-authority-real-model, live-curator-write, live-generated-fork-a/-b, live-l3b-warden-quarantine,
  live-plan02/03/04/05/06/07/09/10/12, live-two-ways-bridge/-ferry, live-v13-refusal, live-v24-04-player-evidence (+control),
  live-v24-05-mirror-rate, live-v24-06-curator, live-v25-04-negation, live-v25-08-l5-x1-exclusive/-keyword,
  live-v25-08-mirror-rate, live-v28-09-ask-player-play, live-v28-11-create, live-v28-45-seal, live-v28-47-promises,
  live-v28-61b-curator-secret/-director-secret, plan08-hygiene, v27-c6-test-cast, v27-card-art-base, v27-local-card-reply,
  v29-02-s6(h)-baseline/-prevention, v29-03-polish-shadow(-forced), v29-03-s2-shadow, v29-04-07/05/06 model pilots,
  v29-04-c2-corpus/-cue-off/-cue-on. Every other `requires.lane model` scenario is any.

B5 `npm run suite:nomodel` (`scripts/suite/nomodel.mjs`; pure parts `scripts/debug/lib/nomodelSuite.mts` + test):
- List: `collect()` + `decideAsset` + `noLlmPartition` (new export of `scripts/lib/suiteDecisions.mjs`; `noLlmSuiteRows` uses it),
  i.e. decisions.mjs's rules without writing its docs: kept, no model call by shape, `requires.lane no-model`, no prior, and
  declared none (a listed file that is not none is a problem, exit 1). Plus each journey's none checks whose dependencies are
  none. At the run: 179 scenarios + 12 journeys (63 checks: J0-J6, J8-J12); the dependsOn added after it drop J1.7, J3.2-J3.8,
  J5.5, J6.2-J6.4 (and J3 entirely) from the list: now 179 scenarios + 11 journeys (53 checks).
- Refuses a lane not listed, not seeded, down, or with a model (`st-lanes status` `noModel`), exit 2; runs one
  `st-lanes batch --lanes 30,...,34 --strict --model none --group 'Group: Arin, DM Narrator'`; prints counts and every
  non-green row; exit 1 on any RED, INCOMPLETE or NOT-RUNNABLE row. `--list` prints the list only.
- Lanes: `seed 30..34 --fresh --slim`, `no-model`, media off in each settings.json (`image.enabled` false, sprites off
  explicit, ST `stable-diffusion` disabled), the 7 loopback URLs to the GPU controller (18888) pointed at the closed port 18079,
  `start` (lane 33's browser needed a second start). No ComfyUI, GPU, lane 0, lane 45 or :8000.
- Run 2026-10-25 10:21Z (batch summary `C:\dev\so-lanes\batch-2026-10-25T10-21-32-915Z.json`): 191 rows, GREEN 128,
  RED 51, INCOMPLETE 7, NOT-RUNNABLE 5; exit 1. Not green.
  - Journeys RED 10 of 12 (J0, J12 green): implicit dependencies on model checks (J3, J6.2-J6.4, J5.5, J1.7; now declared);
    J5.1 extraction profile null on the no-model lane; J1.1 and J5.5 "sandbox escaped" (lane 33); J2.1/J2.3/J2.5 Studio and
    drawer copy; J4.2/J4.3/J4.7 away recap not shown; J8.3 no curator proposal; J9.4 blocked (capability wizard-entry-points);
    J10.14; J6.9, J6.11; J11.5, J11.6, J11.10.
  - Scenarios: RED 41, INCOMPLETE 7 (runner ended without a record), NOT-RUNNABLE 5 (groups SO-Open-Stretch-Curve and SOIMG
    Test cast absent from the install copy; one toy-group lookup on lane 33 during a page navigation). RED groups: v24-01
    continuity-note cases (note "" on the no-model lane), mirror book not bound to the parent slot (v24-02 branch/checkpoint
    continue, e5, I6), live-story-workflows (Image Generation extension disabled by the media-off rule), v27-d-*, v28-40/55/60
    UI or setup rows, page navigations on lane 33.
  - Not compared with a model lane: whether these rows are red on master with a model is unmeasured.
- Open: triage the 51 reds (fixture drift, no-model environment or product); whether `suite:nomodel` should select a memory
  profile for checks that need one configured; seed the two missing groups on no-model lanes; lane 33 flakiness; one run per
  row (no `--repeat 2`).

## Owner decision 2026-10-25 (close-out)

- B3 (replay backend) and the `suite:mutation` review half of B6 move to v3.0. B1, B2, B4, B5 and B6's vacuous/denominator half
  are built and merged; the B2 extension (`lt06`, `saga`) is v2.9 13 C10; `suite:nomodel` to green is 13 C8.
## B2 extension record 2026-10-25 (branch v2.9-11-b2-ext, not merged): lt06 + saga, scenario item kind

- Scenario item kind (`lib/promptBatchScenario.mts`): `captureVariant` turns a so-scenario fixture into a no-model variant
  (`requires.lane` no-model, relative `import_story.file` rebased) with the recorder armed by in-page eval steps (`ARM_EVAL`,
  `DISARM_EVAL`) and a context eval after the measured step; `runScenarioItem` runs it through `runScenario --sandbox` and drains
  the recorder. The recorder (`lib/promptBatchRecorder.mts`) gains rules: a text call whose prompt matches a rule is answered from
  that rule's reply list in order, others get the plan's neutral reply; refused routes no longer include the lore plugin
  (`story-orchestrator-lore` commits pass through); media refusals are not counted as model refusals.
- `lt06` (`lib/promptBatchScenarios.mts`): plans the frozen corpus (situations.json + scenarios/{current,anchored} hashed LF-normalised
  against frozen.json, refused on drift), arm order per frozen.json (odd current first), 80 items. Capture arms the recorder for the
  record step only, freezes the one suggestions call and stores the ask's inputs (engine state, snapshot slices, chat, held secrets via
  the memory injector) as `contexts/<sha>.json`. Self-check: the prompt rebuilt offline from the context
  (`lib/promptBatchScenarioEntry.ts`: playedProjection, anchorCandidates/rankAnchors/selectAnchors, buildSuggestionPrompt) is inside
  the body, and the canned answer parsed offline (parseSuggestionLines, refuseIncomplete, authored offers, screen) equals the panel's
  lines and anchors; record.asks = 1. A scenario failure is retried once after a page reload (S5); a cleanup-only failure is a warning.
  `merge` replaces problem rows with a `--only` recapture before any send.
- lt06 stop declaration (built into `send`, `--no-stop` keeps S5 only): N = sendable rows; usable >= 0.9 and grounded >= 0.85 over the
  anchored rows (mechanical upper bounds of F1/F2, so S1/S2 are sound); a leak needle the prompt does not already show is a zero
  floor over both arms (S3; a needle the prompt shows is listed as `visibleNeedleHits` for adjudication); `needsAll` for the blind
  pair (never S4).
- lt06 score: per row usable (parsed >= 3), shown lines with anchor and kind, grounded (any anchor; strict goal/thread kinds and
  model-only lines reported too), needle hits over lines, help and greyed rows, prompt needles, asks; floors F1-F5 exactly as
  frozen.json, F1/F2/F3/F4 null until the rater has run. `rate`: frozen.json pass A (blind, Set 1/Set 2 from
  sha256(corpus + id)) and pass B on opencode `openai/gpt-6.1-sol` (exe path, `--agent so-rater` tools off, `--file <prompt>`),
  resumable, -fast and DeepSeek refused; F4 mean/median/wins/paired bootstrap (1000, seed corpus sha).
- `saga`: captures test/scenarios/live-v28-45-seal.json up to the final seal (loop shortened to 20 tries) on the no-model lane; the
  recorder answers chapter records (canned or `--record-replies`), the first epilogue ask with a reply cut at the limit and the
  retry with a canned epilogue, so both the epilogue body (n_predict 2560) and its larger-token retry body (4096) are frozen. Items
  `saga#1..4` + `saga-long#1`. Score: per response verifySaga's verdict and reasons (word count, proper nouns not in the records),
  refusals before verifySaga (cut, degenerate, thought-only) and the two-attempt flow. Golden `test/measurements/v2.9/11-b2/saga-golden`.
- Goldens + tests: `lt06-golden` (s01, s05), `saga-golden`; `promptBatchScenarios.test.mts`, `promptBatchLtGolden.test.mts`,
  `promptBatchSagaGolden.test.mts`.
- Capture 2026-10-25 on lane 33 (no-model, read/synthesis/memory pinned to `Story Orchestrator Memory RunPod` = Artemis 31B
  llamacpp preset, as on the lane): lt06 80/80 rows clean after `merge` of a 12-item recapture (6 rows had harness flakes: judge
  read-back, 15 MB settings saves timing out, a chunk load; one cleanup-only warning), 76 distinct bodies (the 4 `none` rows send the
  same prompt in both arms), every row self-checked against master's builders. Frozen at `C:/dev/so-lanes/33/b2ext/lt06`
  (outside the repo; served bundle moved mid-capture when another session restaged, rows re-checked offline, recaptured rows identical
  sha). saga frozen at `C:/dev/so-lanes/33/b2ext/saga` = `saga-golden`.
- Corpus finding (not fixed, corpus is DRAFT): 6 situations (s04, s05, s06, s11, s18, s26) show a leak needle in the prompt in both
  arms, because the story `description` (shown as "About this story") states the hidden bait. frozen.json's offline check missed the
  description section. Fix the corpus before freezing, or adjudicate those rows.
- Dry run (canned fake backend on a free port, not a measurement): lt06 send stopped S2 at the 10-row pilot (grounded 1/5, canned
  lines rarely ground), score produced per-row facts and F1-F5, rate ran pass A on s01 and pass B on its one tagged line through
  opencode Sol (JSON parsed, resumable); saga send + score: 3/5 accepted, reasons and flows as expected.
- GPU (not run): copy the frozen dir, `send --base-url http://127.0.0.1:18888` (lt06 stop rule built in), `score`, then for lt06
  `rate` and `score` again. Exact lines in the handoff.
- Open: the capture lane's memory profile/preset is the lane copy's, not necessarily the 2026-10-25 lane 45 one (saga sampler
  temperature 0.1, n_predict 2560/4096); the F2 goal/thread kind question stays open (both readings reported); rater pass A
  playerView carries the no-model lane's "Status" line (not in the prompt).
