# Isolated live review

This report covers the isolated 2026-09-18 source snapshot recorded in `evidence/environment.json`. The original worktree drifted after that copy, so later live runs intentionally continued against the frozen isolated extension. No production source was changed by these runs.

## Environment

- SillyTavern: isolated host on `127.0.0.1:18000`, disposable data and group `so-review-group`.
- Browser: shared Chromium CDP on `127.0.0.1:19222`.
- Backend: local Unsloth Studio on `127.0.0.1:8888` with a dedicated key kept under the isolated private directory and never written to evidence.
- Model: `TheDrummer/Artemis-31B-v1.1-GGUF:Q4_K_M`, 32,768 context, q8_0 KV cache, one parallel slot, n_ubatch 128, speculative decoding off, request body `enable_thinking: false`.
- The backend does not load the model while idle. Its first authenticated OpenAI-compatible request triggers loading. A restart probe first exposed lost runtime overrides (8K/four slots/spec auto and a stalled request); the review helper now reapplies the override idempotently without rotating the key. The corrected cold request completed in 290.406 seconds and the archived runtime status confirms 32K/q8_0/one slot/spec off.
- `scripts/review/launch-review.ps1` starts only the named review root, checks Studio/host listener identity and readiness, and calls `ensure-artemis-config.py`. Its real host-start branch was smoke-tested: PID 18612 stopped, PID 32168 started and owned port 18000, HTTP ready.

## Strict journey results so far

Human rubric rows are intentionally reported as skipped; the automated totals below do not treat them as failures.

| Journey | Attempt 1 | Attempt 2 | Finding |
|---|---:|---:|---|
| J1 first contact | 6 pass, 1 fail, 2 human skip | 6 pass, 1 fail, 2 human skip | `#so-new-story-wizard` is visibly located, but the chat overlay intercepts the click and the settings drawer then becomes invisible. All three real generations, checkpoint advance and transition notice passed both times. |
| J2 author loop | 9 pass, 2 human skip | 9 pass, 2 human skip | Green twice, including real Probe, compatible hot-swap and invalidating keep/cancel choices. |
| J3 player session | environmental abort retained | pending | Studio exited; the host logged `ECONNREFUSED 127.0.0.1:8888`. The checkpoint wait and real extraction failed. This attempt is retained and is not counted as a completed strict run. |
| J5 group direction | 5 pass, 1 fail, 1 human skip | 6 pass, 1 human skip | Nondeterministic privacy failure: Ponticius was drafted but the captured private block was empty on attempt 1; attempt 2 passed. This is not green twice. |
| J6 mutation storm | 4 pass, 1 human skip | 4 pass, 1 human skip | Green twice for edit rollback, delete consistency and player rollback notice. |

Evidence for every completed attempt is under `evidence/live-J*-run*/` with its raw log, timestamped JSON, matrix and exit code. The interrupted J3 record is under `evidence/live-J3-run1-backend-exit/`.

## Backend restart evidence

The restart sequence uncovered two distinct states rather than hiding them behind retries:

1. Idle restart stayed unloaded for 180 seconds. First request is the actual autoload trigger.
2. One resumed load ignored the intended override and started at 8K/four slots/spec auto. It produced zero tokens for several minutes and was cancelled and force-unloaded. That failed attempt is preserved in the Studio launch log.
3. `ensure-artemis-config.py` restored the persisted override without creating another API key. The next cold request loaded the intended 32K/q8_0/one-slot/spec-off configuration and returned HTTP 200. Runtime settings are in `evidence/artemis-resume-runtime-status.json`; request/usage/latency without credentials are in `evidence/artemis-resume-verified-config.json`.

## Remaining live scope

J4, J7, J8, J9 and J10 still require two strict attempts. J3 requires two completed attempts after its retained environmental abort. The two independent real-model branching scenarios (`live-two-ways-bridge.json` and `live-two-ways-ferry.json`) require two sandbox attempts each, with install-level extraction settings restored after each run. The self-test must be run separately as an intentionally failing harness check.
