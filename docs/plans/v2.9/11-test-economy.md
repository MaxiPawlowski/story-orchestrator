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
