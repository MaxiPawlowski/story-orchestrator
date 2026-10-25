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
