# Recommended reasoning per role (v2.6 plan 05 R3)

**All three arms measured (DeepSeek 2026-10-02; artemis-tc and artemis-cc 2026-10-02/03). This table is a
recommendation only: no default changes.** Defaults stay `default` whatever the numbers (overview rule 9).

Rule (predeclared, `test/measurements/v2.6-05/r3-matrix.json`, unchanged): a level is recommended for a role only if it
meets that role's floor on two consecutive runs AND its p95 latency fits the role's cadence. Floors never retuned.

## DeepSeek arm (`deepseek 4.1 flash`, model `deepseek-flash`) — measured 2026-10-02

- Lane 5 (adolion-fresh, check: 0 problems, 1 drift `extraction.enabled` true vs false), served dev bundle
  `5b74e2aafe0b` (the reports' `bundle` field reads the repo's prod `dist/manifest.json`, `b63f42bfe26e`; the page ran
  `5b74e2aafe0b` throughout, per the run header before and after). Judge plugin 1.6.0 loaded; no plugin or pod call was
  made (page fetch meter: 0 text-completions, 0 plugin calls).
- Cells: default, off, low, high, each r1 then r2 back to back, all five roles, commands exactly as the matrix runbook
  (`--profile 'deepseek 4.1 flash' --effort <level> --arm deepseek-<level>-r<n>`; read adds `--expect-count 43
  --min-tier intents=0`; authoring adds `--holdout`). Medium (optional) not run.
- Records: `test/measurements/v2.6-05/deepseek/<role>-<level>-r<n>.json`, `verdicts.json`, `meter-runs.tsv`.
- Run 20:16–21:22 UTC (DeepSeek off-peak).

| Role | default | off | low | high | Recommended |
|---|---|---|---|---|---|
| read | floor missed ×2 (facts 0.65/0.65 < 0.85, epistemic 0.67/0.33 < 0.8; plot 0.95/0.95); p95 2.4 s | floor missed ×2 (facts 0.60/0.65, epistemic 0.33/0.67; plot 0.98/0.95); p95 2.4 s | reasoning-exhausted 43/43, 42/43 (answer 512 + budget 512 spent on thinking); p95 6.1 s | reasoning-exhausted 23/43, 21/43; plot 0.44/0.51, facts 0.50; p95 30.6 s | **none** |
| synthesis | validity 5/5 ×2; p95 1.2 s | 5/5 ×2; p95 1.3 s | 5/5 ×2; p95 2.8 s | 5/5 ×2; p95 5.7 s | **none — no floor declared** (validity only, v2.4 plan 08; `verdict` reads the null floor as "below a floor") |
| authoring | floors ×2, hold-out 5/5 ×2; p95 3.5 / 9.6 s | floors ×2, hold-out ×2; p95 7.8 / 8.6 s | floors ×2, hold-out ×2; p95 15.1 / 14.6 s | floors ×2, hold-out ×2; p95 23.7 / 26.7 s | default, off, low, high (interactive, no latency bound) |
| director | 24/25, 23/25 (floor 22); p95 0.9 / 1.0 s | 24/25, 23/25; p95 0.9 / 1.0 s | 25/25 ×2; p95 2.8 / 2.0 s | 25/25, 24/25; p95 1.6 / 1.8 s | default, off, low, high (all p95 ≤ 4000 ms) |
| curator | validity 0.83 < 0.9 in r1 (r2 0.92); p95 1.4 s | validity 0.83 < 0.9 in r2 (r1 0.92); p95 1.4 s | every floor ×2 (validity 1.0, opShape 1.0, decision 1.0); p95 4.1 / 4.5 s | every floor ×2 (validity 1.0, opShape 0.89, decision 1.0); p95 9.1 / 10.0 s | low, high (off-path) |

Read latency bound: the matrix asks for the read interval at cadence 3 measured on the arm's own default run. This
arm does not drive a chat, so no interval was measured; a conservative lower bound is 3 rendered replies × 15 s (the
shortest ordinary turn on the RTX PRO 4500 reference, gotchas 2026-09-20) = 45 s. Every read cell's p95 fits it
(max 30.6 s at high); read fails on floors and exhaustion, not on latency.

Observations (not floors):

- `default` sends no effort and the profile leaves Request model reasoning off, so ST sends `thinking: disabled`:
  `default` spent 0 reasoning tokens and behaves like `off` on this profile (matrix note "DeepSeek's own default is
  thinking at high" does not apply through this profile).
- Read at low/high is a budget problem, not an effort one: reasoning eats the 512 + 512 / 512 + 6144 max_tokens before
  the DELTA lines. Per R2's rule a per-role budget override is only justified by exactly this (read exhausting where
  others do not); not decided here.
- Read's facts (0.60–0.65) and epistemic (0.33–0.67) tiers miss at every non-exhausted level: DeepSeek flash does not
  pass the read floor as built, independent of reasoning.
- Hypothesis "read/director best at off; authoring/synthesis gain at medium": director passes at every level (low/high
  slightly more accurate, 25/25, at 2–3× the latency); read is not recommendable at any level; authoring passes
  everywhere; synthesis has no quality floor to show a gain; curator only clears its validity floor ×2 with thinking on.

Usage (page fetch meter, `meter-runs.tsv`, all `deepseek-flash`, 0 errors):

| Level | Calls | Prompt tok (cache hit) | Completion tok (reasoning) | Est. cost off-peak / peak USD |
|---|---|---|---|---|
| default | 217 | 206,796 (162,035) | 35,766 (0) | 0.029 / 0.057 |
| off | 217 | 206,940 (162,035) | 36,094 (0) | 0.029 / 0.058 |
| low | 217 | 207,488 (163,691) | 136,005 (122,434) | 0.089 / 0.177 |
| high | 211 | 201,385 (105,846) | 482,143 (463,059) | 0.304 / 0.608 |
| **total** | **862** | **822,609 (593,607)** | **690,008 (585,493)** | **0.45 / 0.90** |

Prices: api-docs.deepseek.com pricing, read 2026-10-02 (deepseek-flash per 1M: cache hit 0.003, miss 0.15, output
0.6 off-peak; peak ×2). The run was off-peak, so ~0.45 USD.

## Artemis arms — measured 2026-10-02 21:28 to 2026-10-03 02:54 UTC

- Lane 5 (adolion-fresh, `check 5`: 0 problems, the same known drift `extraction.enabled` true vs false), served dev
  bundle `5b74e2aafe0b` the whole run (run header before/after: `servedIdentity` empty). The reports' `bundle` field
  reads the repo's prod `dist/manifest.json`. Another session merged `52aab999` into the checkout at 22:28Z and rebuilt
  prod `dist` at 22:34Z, so reports written before then say `b63f42bfe26e` and the later ones say `ed5e9cf20d0a`. The
  page never changed, and no measurement harness file changed (`so-live-suite`, `so-role-calibration`, `roleEffort`,
  `connection` are identical across the two commits).
- The pod (Artemis 31B v1.1 Q4_K_M, llama-server b11046, ~34 tok/s) was used by this run alone, through the tunnel
  `127.0.0.1:18080`.
- Commands are exactly the matrix runbook: `--profile <arm profile> --effort <level> --arm <arm>-<level>-r<n>`; read
  adds `--expect-count 43 --min-tier intents=0`; authoring adds `--holdout`. Each cell ran r1 then r2 back to back.
- Records: `test/measurements/v2.6-05/artemis-tc/`, `test/measurements/v2.6-05/artemis-cc/`, each with
  `<role>-<level>-r<n>.json` and `verdicts.json`.
- Lane prep, recorded in the run header diff, not a product change:
  - `stable-diffusion` was disabled in the lane's settings copy (backup beside it). No 8188 contact appeared in the lane
    log after start.
  - The lane's main connection was switched to `Artemis RunPod RP` (`/profile`). The lane had been seeded with
    `Artemis Local (Unsloth)` (generic, :18888, offline). ST's Connection Manager builds a Text Completion payload from
    the page's current textgen `type` (`presetToGeneratePayload` clones `textgenerationwebui_settings`,
    custom-request.js:395-411). With `generic` selected it skips the llama.cpp branch that turns
    `dry_sequence_breakers` into an array (textgen-settings.js:1808-1826), and llama-server answers 400
    `dry_sequence_breakers must be a non-empty array of strings`. So every Text Completion profile on :18080 failed
    through the Connection Manager until the main connection was llama.cpp. The first `off` refusal pass hit this 400
    and was discarded (`r3-artemis/failed-main-generic/` in the lane dir). This is an ST host fact worth knowing for
    any lane whose main connection is not the arm's own API type.
  - `Artemis RunPod CC` was created on lane 5 only, per `r3-matrix.json` reconciliation.profiles: CC, source custom,
    `http://127.0.0.1:18080/v1`, model `/workspace/models/TheDrummer_Artemis-31B-v1.1-Q4_K_M.gguf`, no preset, no
    Additional Parameters. No preset means no "Request model reasoning" toggle is carried; the mapping writes
    `include_reasoning` itself for every level except `default`. Smoke test: `enable_thinking:false` returned `PONG` with
    0 reasoning chars, and a curl with no kwarg returned 145 reasoning chars. That confirms F5: with no kwarg, thinking
    is on.
- Cells run: artemis-tc `default` ×2 full, plus `off` on one case per role (s01, a01, D01, c01, extractor29) as the
  refusal proof. artemis-cc `default`, `off`, `medium` ×2 full (the minimum). The optional `low`/`high` cells were not
  run, because pod time was already ~5.5 h for the minimum.
- Two verdict-tool notes. These are not floors and nothing was retuned:
  - (a) `so-role-calibration verdict` scores `meetsFloors` over answered cases only. A run with incomplete rows
    (reasoning-exhausted) can read "recommended": artemis-cc curator `default` answered 6 of 12, and authoring `default`
    answered 11 of 12. The reports list those rows under `notGreen`. Below, a run with any incomplete row is not counted
    as meeting the floor.
  - (b) The tool refuses a pair whose `bundle` labels differ (artemis-cc authoring `default`, see the first bullet).
- The tool does not check latency; the cadence bound is applied below by hand. The read bound is the same conservative
  45 s used for the DeepSeek arm (3 rendered replies × 15 s). No chat was driven, so no interval was measured.

### artemis-tc (`Artemis RunPod RP`, Text Completion, preset `Artemis v1.1 RP`, instruct `Gemma 4 Thinking`)

| Role | default | off / low / medium / high | Recommended |
|---|---|---|---|
| read | floor missed ×2 (facts 0.40/0.40 < 0.85; plot 0.98/0.98, rejected 0.97/0.94, epistemic/ledger/arcs 1.0); p95 10.9 / 12.0 s | refused: `unsupported: "Text Completion sends a raw prompt"`, `applied: false`, request unchanged (proved on `off`, one case; low/medium/high are the same code path) | **none** |
| synthesis | validity 5/5 ×2; p95 2.2 / 2.2 s | refused (same) | **none — no floor declared** |
| authoring | every floor ×2, hold-out 5/5 ×2; p95 32.5 / 35.0 s | refused (same) | default (interactive, no bound) |
| director | 24/25 ×2 (floor 22); p95 1.07 / 1.09 s | refused (same) | default (≤ 4000 ms) |
| curator | every floor ×2 (validity 12/12, opShape 8/8, decision 12/12); p95 3.5 / 3.5 s | refused (same) | default (off-path) |

On this lane the profile's role calls show no reasoning. `reasoning.chars` reads 0, but a Text Completion reply carries
any reasoning inline, so that 0 means "not observed", not "measured zero". The one sampled reply (`PONG`) came back
with an empty thought channel (`<|channel>thought\n<channel|>PONG`). So this arm measures the TC profile as seeded, and
an effort level cannot change it: the refusal holds, as declared.

### artemis-cc (`Artemis RunPod CC`, Chat Completion custom; `low`/`medium`/`high` collapse to `enable_thinking=true`)

| Role | default (thinking on, uncapped) | off (`enable_thinking=false`) | medium (thinking on, max_tokens +2048) | Recommended |
|---|---|---|---|---|
| read | reasoning-exhausted 33/43, 32/43; plot 0.19/0.21; p95 18.7 / 18.5 s | floor missed ×2 (facts 0.45/0.40; plot 1.00/0.98, rejected 0.97/0.94); p95 12.5 / 12.3 s | exhausted 9/43, 13/43; plot 0.74/0.65, facts 0.41/0.47; p95 84 / 84 s (> 45 s bound) | **none** |
| synthesis | exhausted 5/5 ×2 (0 answered) | validity 5/5 ×2; p95 1.9 / 1.8 s | validity 5/5 ×2; p95 15.8 / 16.7 s | **none — no floor declared** |
| authoring | floors on answered rows, 1 of 12 exhausted ×2 (a12, 26k reasoning chars), hold-out 5/5 ×2; p95 129 / 179 s; tool: incomplete (bundle labels) | floors ×2, hold-out 5/5 then 4/5 (h06 missed in r2); tool: "fixture floors met; generalisation not shown" | every floor ×2, hold-out 5/5 ×2; p95 232 / 240 s | medium (interactive, no bound) |
| director | exhausted 25/25 ×2 (0 answered) | 23/25 ×2; p95 0.81 / 0.83 s | 25/25, 22/25 (floor met ×2); p95 14.1 / 22.7 s (> 4000 ms) | off |
| curator | 6 of 12 exhausted ×2 (answered 6/6) | every floor ×2; p95 3.7 / 3.9 s | every floor ×2; p95 58 / 72 s | off, medium (off-path) |

Observations (not floors):

- **Read fails on facts at every level, on both Artemis arms** (0.40–0.47 against a floor of 0.85). DeepSeek also
  failed facts (0.60–0.65). The read floor is not met by any measured source as built, whatever the reasoning setting.
- **`default` on artemis-cc is uncapped thinking on a small answer budget**, and it exhausts every short-answer role
  (read, synthesis, director, half of curator). It costs ~1 h per authoring pair. That is the shape R2's
  `reasoning-exhausted` failure exists for. A user who points a role at a thinking CC Artemis profile without an effort
  gets that.
- **Hypothesis "read/director best at off; authoring/synthesis gain at medium"**:
  - director: best at `off` on CC. Medium is as accurate but 10–20× slower, over the bound.
  - read: not recommendable at any level.
  - authoring: medium is the only CC level that kept every hold-out row ×2. Off missed h06 once, and default left a
    row exhausted. TC default (no observed thinking) also passed everything, at 1/7 of medium's p95.
  - synthesis: no quality floor exists to show a gain.
- `low`/`high` on artemis-cc send the same `enable_thinking=true` as medium. They would differ only in max_tokens
  (+512 / +6144), so they would measure exhaustion only. Not run.

### Pod time

R3 Artemis ran 21:24–02:54 UTC (lane start to last cell), ~330 min. The calls were all local (llama-server); no hosted
calls.

## Combined recommendation (one row per role × arm)

Recommended = floor ×2 AND p95 within the role's cadence (rule unchanged). The UI line reads from this table. **No
default changes.**

| Role | DeepSeek (`deepseek 4.1 flash`) | artemis-tc (`Artemis RunPod RP`) | artemis-cc (`Artemis RunPod CC`) |
|---|---|---|---|
| read | none (facts/epistemic below floor; low/high exhaust) | none (facts below floor; effort refused on TC) | none (facts below floor; default/medium exhaust, medium over the latency bound) |
| synthesis | none (no floor declared) | none (no floor declared) | none (no floor declared; default exhausts) |
| authoring | default, off, low, high | default (effort refused on TC) | medium |
| director | default, off, low, high | default (effort refused on TC) | off |
| curator | low, high | default (effort refused on TC) | off, medium |
