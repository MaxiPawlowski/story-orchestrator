# Plan 70 — v2.8 final suite: every row, one frozen build, a GPU budget and a cut list

**Status (2026-10-17): WRITTEN, not run.** Owner: "plan the full test suite for everything; I'll let you know when we run
it". Planning only: no run, lane, model or GPU was used to write it. Source of truth for rules, carriers and floors stays
`24-test-plan.md` (rules 1–12, §Feature → validation matrix, §Measurement rows, §Plans 42–59, Gate records); this plan
selects, orders and budgets them for the one final run (R13, Phase C ×2 from zero). Inputs: `32-queue.md`,
`00-overview.md`, every v2.8 plan's "owed" Gate record lines, `test/phase-c/manifest.json` (204 rows),
`node scripts/suite/coverage.mjs` on `64287be2` (124 registry ids: 122 green, 2 image track, 0 red; 31 plans, 324
floors, 0 unmapped), the plan 24 text suite records (rounds 1–2, branch `v2.8-suite-readiness`) and the coordinator's
round 3 inputs (2026-10-17).

**Headline.** Artemis need on the frozen build: **about 7.0 GPU-h acceptance + 2.7 h informational = 9.7 h** (11.9 h if
AS-smoke and GS2 also ride Artemis, as rounds 1–2 did). The 12 h cap has **about 3.0 h left** (§Budget). Owner decision
D1 is required before the run.

## Rules (on top of plan 24's)

1. **One frozen build.** Every row runs on build F (§Freeze). A fix during the suite re-freezes to F′; only the rows the
   fix can reach re-run ×2, named in the fix commit; header diffs around each batch. No row mixes builds.
2. **Re-cover everything after `167892d9`.** Rounds 1–3 ran on `167892d9` (+ suite-readiness fixtures). Merged since:
   plans 42 B + recorder, 43 offline, 44 stage 1/1b, 48, 49 focus, 18 Q7, 65, 68, 69 (K1a–K17), 35 G1–G10, 09/34
   harvest phase, 18 check `when`, Astra review fixes (48/49/18Q7/65/68, 69/35), stale-read guard, image defects 2,
   bundle diets (391 src files). The read itself changed (42 witness lines on by default, K1a, K6b, K9, K13), so rule 6
   carries are expected to fail their path diff; compute them anyway (§Pre-flight 6) and carry only an empty diff.
   Coordinator 2026-10-17: 47 promises (RED ×2, fix `6e8d782e`, rollback step in triage), T8 (0.75 ×2 vs 0.9,
   informational miss) and GS1 (run 2 8/9, fixture fix `360b9cf2`) re-run on F regardless.
3. **Campaign at the bumped pin.** The Adolion adoption branch `v2.8-adopt-features` @ `411f4d4` (9 commits over pin
   `03441dc3`) merges to campaign master, `scripts/debug/adolion-fresh.pin.json` is bumped, reinstalled, and every
   lane is seeded from it. GS1–GS4 and AS-smoke then play the adopted stories, so they get one shakedown on the new pin.
   This doc names feature ids and story ids only; no campaign content (AGENTS.md privacy).
4. **Text first, images last.** `image.enabled`/`sprites.enabled` off for every text row (plan 24 rule 12). The image
   POC rows run after the text suite closes. Adolion campaign image generation stays on hold (owner 2026-10-15).
5. Unchanged from plan 24: floors predeclared and never retuned (a miss is recorded, the feature stays on); ×2
   consecutive on one lane for acceptance, ×1 for informational; never trim a ×2 to fit a budget; English only; group
   chats only; lanes 30+ for no-model work, model lanes on the isolated suite ST copy, never the owner's ST, lane 0 or
   while the owner uses the 3090; at most `SO_MAX_LLM_LANES` (2) model lanes; Adolion excerpts rated by a second
   model, never the owner.

## Freeze, attest, stage

1. **Merge before freeze** (each with `npm run gates`, Storybook included): `v2.8-suite-readiness` (GS fixture fixes,
   promise `m=` fix `6e8d782e`, `360b9cf2`), the 47 rollback-step fix once triaged, and any other round 3 fix. Then the
   campaign pin bump (rule 3), `npm run docs:guide`, `npm run docs:settings` (no diff).
2. **Freeze F:** master tip after (1). Record commit, `npm run build` bundle sha256 (`dist/manifest.json`), main bundle
   bytes (≤ 1,300,000 B), plugin versions. Local tag `v2.8-suite-F` (not pushed). `npm run gates` with Storybook ×2
   (manifest C1-gates), `npm run test:release` (C1-release) **before** any live batch (it rewrites `builtAt`), ratchet
   C1b.
3. **Stage:** `npm run stage` into the suite ST copy (`st-suite`, as rounds 1–3), `npm run plugins:install`, restart
   it; never the owner's ST slot. Each lane: `st-session.mts reload` (cache-off), `so-run-header.mts capture --label
   suite-F-base`; served hash = built hash or the row does not start.
4. **Attest at the end:** `docs/release/2.8.0/attestation.json` (commit F, bundle hash, each row's archived record path),
   `SO_ACCEPTANCE=1 npm run test:release` green; v2.8 rows listed in `test/phase-c/v28-manifest.json` (written with the
   freeze, plan 24 §Phase C proposal) so plan 39 parity keeps guarding the v2.7 file.

## Scope

Tiers: D, CL (cloud reply/read; Sol authoring/wizard/Ask/rater; TypeSafe judge), RP (Artemis v1.1 on the 3090 at
32K, thinking on, preset `Artemis v1.1 RP`), RP-read (Artemis as the read/memory model, the shipped local route),
LT, LI. A = acceptance ×2, I = informational ×1, C = conditional (runs only if its prerequisite exists at freeze,
else deferred with that trigger), X = deferred (owner decision or v3.0).

### Artemis rows

| Row | Carrier | Tier | Kind | Floor (source) |
|---|---|---|---|---|
| GS1 first hour | `gs1-first-hour.journey.json`, adolion-academy | RP | A | every check green (24 §GS1); L5-RP1/RP3 read in GS1.2/GS1.5 (54), 34-copy I |
| GS3 long road | `gs3-long-road.journey.json`, adolion-saga | RP | A | every check green (24 §GS3); 50 T11 in GS3.3; 48 S10 + 68 hand-back read with living on |
| GS4 stubborn player | `gs4-stubborn-player.journey.json`, adolion-esha | RP | A | every check green (24 §GS4); C4-R6 rubric I |
| GS6 adoption play (new) | `gs6-adoption.journey.json` (written 2026-10-17; carrier adolion-saga, the one adopted story with every world-layer feature; features found by structure, author fallbacks recorded) | RP | A | every check green: codex fact after its gate and gone on swipe (52), label reveal (51), faction band (53), `story_time` moves and never goes back (50), scene card (65), recap "What changed" (46), rumor stays private (44), public check waits for its attempt (18 `when`), promise row (47), `assert-player-clean` at each stop |
| T-R4 reply effort | `live-v28-24-reply-effort.json` | RP | A | R4-live predeclared assertion (24 §Targeted) |
| J13 reply effect | `j13-reply-effect.journey.json` | RP | A | journey checks (preset overlay is TC only) |
| Commit-model | campaign `lab/v28/v28-adolion-commit-model.json` | RP | A | C11-F2 model leg (01; 24 §Targeted) |
| Encounters-model | campaign `lab/v28/v28-adolion-encounters-model.json`, first 6 turns + real pool | RP | A | 19 RP acceptance (24 Q9 split) |
| Promises live | `live-v28-47-promises.json` | RP-read | A | 47 P1s CL half (100 % byte-exact), P2w 0, ids, rollback reopens |
| T8 time windows | `so-live-suite.mts run --set time` (`timewindow01..04`) | RP-read | A (floor informational) | live-suite per-tier floors (50 T8); last 0.75 ×2 vs 0.9 |
| 45 final seal | carry fixtures `carry-source`/`carry-sequel`, one real seal + sequel start | RP | A | epilogue through `verifySaga`, picker lists the run, seed before boundary 0 (45 owed) |
| 42 W4 recorder | `so-witness.mts record` (74 reads, both arms), then `reads`, `wc`, `score-real --adjudicated` | RP-read | I (decision-bearing) | W4 ≥ 0.9 per set, W4fi ≤ 0.02, Wc (42 §7); solo: Wc has a latency row |
| T-Q3 check narration | `v27-36-quests.story.json` variant, 10 attempts | RP | I | 36-Q3 rater |
| Encounters M2 tail | same lab file, remaining 7 turns | RP | I | 35-M2 / 19 M1–M2 |
| Over-steer card | `so-session` charter 33-W2-oversteer, 40 turns | RP | I | 01 §G / v3.0 04 floors |
| 47 P7/P7h | scripted relevance session | LT | I | P7 ≥ 6/10 (47) |

### Artemis rows deferred (X), with reopen trigger

- SP6 block: 49 C8–C10, 35-K3/K4/K5 (+ -C5), R3, R12 (about 10 lane-h RP): pod or a free 3090 night (D5).
- R2/R7 (B1-PFX, B1-HIST, late-lore cache), 63 H1/H2/H6r: pod P2 at 98K / `--swa-full` (D6).
- R5 B1-NARR run 2 (120 min), M24, thinking A/B, 37-M3, B1-R4: blind-pack arms (24 §Cuts 10).
- 51 R7/R9, 53 F7: no lab story (reopen: a lab story or the adopted campaign stories accepted as carriers by the owner).
- 18 Q7 S7, 62 Q1r, 43 VR7/VR7p: beyond the cap (24 §Allocation); 43 also behind R-Gate2/3.
- 55–59: not built.

### Cloud rows (no GPU)

| Row | Carrier | Tier | Kind | Floor (source) |
|---|---|---|---|---|
| AS-smoke ×9 | `live-v28-24-smoke-<act>.json` on the bumped pin | CL | A | per-file steps (24 §AS-smoke) |
| GS2 living hub | `gs2-living-hub.journey.json`, adolion-aegis | CL | A | every check green; M21 functional, M22/R1 I, M23 |
| Journeys | J1, J2, J3, J5, J6, J6-W1, J7, J8 (+C4-J8 arms), J9 (Sol), J10, J11 (+judge-off arm), J12 | CL | A | journey checks (24 §Targeted) |
| v2.7 owed rows | O10, O11, O13b (Sol), O16 (Sol), 33-W1-V3/V4/V5/V7-live, 33-W2-J8.10 | CL | A | manifest rows |
| Privacy block | S-07, S-08, S-11, S-12, S-13 on one planted-secret story | CL | A | manifest rows |
| Suggestions | 10 runs; 33-W4-useful I | CL | A | 0 unreached names (04 C5) |
| C8b-stranger | fresh lane, guide only | CL | A | first rendered reply (O1 merged) |
| Plan 09 live | real Ask answer, wizard tool call, vision request (Sol) | CL | A | 40 §Deferred |
| Plan 13 J7 consumers | canonVerify/canonDraft/idle/tone/adversity, TypeSafe, + off arm | CL | A | 13 Gate record |
| Plan 34 lore-select | character eligibility, TypeSafe leg | CL | A | 34 |
| Plan 22 L1/L5 | `live-v28-22-l1-l5.json` | CL | A | save-run-as-story lands, delete-4 rollback = fold |
| 52 C7 | `codex-pages` recipe, Sol, review mode | CL | A | ≥ 9/10 ×2 (52); last 10/10 ×2 on `167892d9` |
| M16, M17, M20 | `live-v28-meanwhile`, `live-v28-11-create`, `live-v28-09-ask-player-play` | CL | A if path diff non-empty | carried ×2 (24 §Cuts 14) |
| Adversarial set | 35 G3, G4 (`3fa06bf3` fixtures, read model) | CL | A | G3 0 asserted + control, G4 0 (35) |
| 35 G4r | 10 replies, second-model rater | CL | I | recorded (35) |
| 42 Wc / RB | `so-live-suite.mts run` witness on/off | CL | I | Wc, RB1 (42 §7) |
| 09 A6 run 2 | `so-wizard-agent.mts card-revision --fixture v2` | CL | I | recorded, expected ≥ 7/10 (09 owner decision 2026-10-16) |
| CL informational | M18, M19 (60/36), plan 10 30 drafts, O15, C14-b, 33-W3-N1, 33-W3-combined, 37-M1-C5, 37-L6-C, 32-W6-seam, 32-director-payload, R9 J6d extractor leg, R10 cue/scene A/B, 01 C13-b, 13 N5 extractor tension, 53 F9, G10 (role calibration), plan 18 M1/M2 from audits | CL | I | each plan's floor |
| Offline from records | B1-C3, B1-C12 (M3), B1-EMPTY (R4/M4), M10, M12, M21 Artemis half, R8/M15 packs from shipped-default replies | CL/none | I | 24 §Measurement rows |

Conditional (C), each deferred with its trigger if missing at freeze:

- 47 P1, P2 (labelled sets ≥ 60/60, ≥ 30), P6 (20 director proposals), P8 (with RB): **built 2026-10-17** (`so-promises.mts`,
  `test/measurements/v2.8/47-promises/`); runs at freeze (P1/P2 RP-read ×2, P6 Sol + claude -p rater ×2, P8 tokens).
- 44 G7/G8 voicing (20 cases, on/off), G14 (30 turns): **built 2026-10-17** (`so-rumor-voicing.mts`,
  `test/measurements/v2.8/44-voicing/`); runs at freeze (RP replies, claude -p blind labels, ×2; G14 ×1 then offline check).
- 48 S7–S9, S11: **built 2026-10-17** (`so-scene-test-replay.mts`, `test/measurements/v2.8/48-scene-test/`, 20 frozen
  frontiers × 3 forced outcomes, Sol replay, blind claude -p pack); runs at freeze (CL, no GPU, ×2).
- 62 Q1, Q2, Q2d, Q2a: probe harness not built and stage 1 awaits the owner (62 status); other agent, branch `v2.8-62-63`.
- 34 A7: arm switch and blind two-rater command owed (other agent, branch `v2.8-65aplus-09a7`). 18 Q7 S8: **built
  2026-10-17** (`so-q7-failure.mts`, `test/measurements/v2.8/18-s8/`, 10 cases; reply on Artemis per D2, blind rater).
- 69 K1b: windows keep no fitted text; checklist must be written outside this repo by another model.
- 35 G9: only on a lane with a prompt-only regex or Presence active.
- 43 (all VR rows): only if W4/W4fi pass on the recorder run; then R-Gate2 re-runs on the witness record (CL,
  offline) before any VR row (D9).
- 50 T9/T10: B2 not built. 63 H6: window not built.

### Deterministic rows (D, no-model lanes 30–34 and local, day 0)

- Manifest D rows (79 acceptance): C0-freeze, C1-*, C1b, the C2 corpus, 16-*, 29-*, 30-*, 31-G3, 32-W4-scenario,
  33-D-clean, 34-L-*, S-04/S-05/S-09, 35-P2-*, 36-*, 37-D1..D3, 37-spoiler, 37-Q1/Q2, O2, O8, O12, 35-ENC, 35-DROP,
  37-B3, 38-G-campaign, Z-docs, Z-attestation, J0, J4, J14, 16-07-A3A8, 16-07-A6.
- No-model live scenarios ×2 on F (plumbing re-proof after the post-`167892d9` merges): `v28-42-witness`,
  `v28-44-rumors`, `v28-45-carry`, `v28-47-promises`, `v28-48-scene-test`, `v28-50-story-time`, `v28-51-labels`,
  `v28-53-factions`, `v28-a13-thought-carry` (54, never run live), `v28-18-q7-sheet`, `v28-65-scene-card`,
  `v28-68-your-move`, `v28-35-*`, `v28-69-*` (K8, K9, K12), `v28-61b-created-scope`, `v28-34-a3a-preview-activation`,
  `v28-09-card-readback`, plan 40 §3 and B6 scenarios, campaign no-model scenarios (`commit-per-value`,
  `commit-read-as`, `open-stretch`, `panels`, `regex-keys`).
- **Payload goldens, baseline first.** No baseline exists (`test/measurements/v2.7/payload/` holds a README only).
  Capture B on `6616f2e4` (last master before 46/47/50–53 merged) and F with `so-payload-golden.mts capture` on a
  no-model lane, then `diff B F --declared` with one declarations file naming each plan's hunk: 50 (`time_of_day` →
  `life_time_read`), 51 R5, 52 C5, 53, 47 (seeded promises), 18 Q7 (header clause), 42 F-rows when C is built. An
  undeclared hunk is red. Then the C3/PC-* contracts on F.

### Human evaluations

- **The owner rates (synthetic or his own play only):** M25 CC vs TC blind pack (pending, his); a counts-only surface
  rubric during his own fresh Adolion play on F for the player-visible surfaces without a session (00 rule 4): 65
  scene card, 68 your-move chip, 18 Q7 narrator sheet effects, 46 recap, 52 People and Places, 51 labels, 53 bands,
  45 picker and "Previously…" (pack `owner-surfaces`, rows only, no excerpts shown to him); optional over-steer card in
  his own play, scored against the same floors separately.
- **Second model rates (never the owner), from recorded replies:** GS1.10 start-pane copy, 34-copy, O15, C4-R6 rubric,
  33-W4-useful, 36-Q3, 35 G4r, 47 P6, 48 S7/S8/S11, 44 G7/G8, plan 10 drafts, packs R4, Q-M5/P3, inner voice C3, W6,
  54 L5-RP2, over-steer applied notes. A pack reads "recorded, not rated" until rated.

## Order and parallelism

Lanes: 41, 42 = model lanes (two Artemis lanes sharing the controller, or one Artemis + one CL); 43, 44 = CL lanes on
days with the GPU off; 30–34 = no-model (do not count against `SO_MAX_LLM_LANES`). A cloud lane counts as a model lane,
so while two Artemis lanes run, CL waits for the day blocks unless the owner allows `--allow-load` (D3).

1. **Day 0 (no GPU, no model).** Freeze F, gates ×2, test:release, payload B/F, seeds and snapshots on every lane at the
   new pin, D corpus ×2 on 30–34 in parallel (about 3 h), no-model scenarios ×2, GS6 fixture loader-validated.
2. **Night 1, 3090.**
   - Solo first (lane 41 only, nothing else on the GPU): 42 W4 recorder (Wc latency row), about 45 min.
   - Then two Artemis lanes. Lane 41: GS6 shakedown, GS1 ×2, GS4 ×2, commit-model ×2, promises ×2. Lane 42: GS3 ×2,
     encounters acceptance ×2, T8 ×2, T-R4 ×2, J13 ×2. T-R4 and J13 assert request keys, not latency, so they share.
3. **Night 2, 3090.** GS6 ×2, 45 seal ×2, triage re-runs (39a: a re-run is the row ×2), then informational in order:
   T-Q3, M2 tail, P7/P7h (LT), over-steer card.
4. **Days D1–D3 (CL, lanes 43/44, GPU free for the owner).** AS-smoke ×9 ×2 (one batch, `--repeat 2 --strict`), GS2
   ×2, journeys, targeted CL rows, adversarial set, C7, M16/M17/M20 if due, then CL informational and conditionals.
   With `--allow-load` (D3) these run during nights on a third lane instead.
5. **Offline (no lane):** B1/M3/M4/M10/M12 counts from the GS tails and chat files, W4 scoring, R9 extractor leg, R10,
   rating packs to the second model.
6. **Image POC, last** (after the text verdict, one 3090 session, LI through the broker, Artemis off unless a row drives
   replies): 41 product journey ×2 (prepared presentation, reference views with per-view seconds and peak VRAM, look
   rebuild, cast scene on the showcase busts), 33 product Acceptance ×2 and the image-path priority latency/coverage
   re-run, 36 LI2/LI5 on the showcase rigs plus the browser gaze re-check, GS5 not run. Campaign images (X6, campaign
   sprite renders, pose conversion) stay on hold.

## Budget

Rates: plan 24 lane-minutes per run (3.0 min per campaign turn, 3.5 Saga, 2.5 synthetic). Measured share: two lanes on
one 3090 used 0.44–0.48 GPU-h per planned lane-hour (round 2: about 7.3 planned lane-h in 3.2 GPU-h; round 3 about 6.7
in 3.2), so shared rows count at 0.5 and solo or read-bound rows at 1.0.

Artemis used so far: round 1 2.6 h + round 2 3.2 h (recorded, plan 24 §Gate record, branch `v2.8-suite-readiness`) +
round 3 about 3.2 h (coordinator; to confirm from its record) = **about 9.0 h of 12 h; 3.0 h left.**

| Row | Runs | Lane-min | GPU-min |
|---|---|---|---|
| GS1 (12 turns, swipe, retries) | 2 | 108 | 54 |
| GS3 | 2 | 132 | 66 |
| GS4 | 2 | 80 | 40 |
| GS6 (12 turns) | 2 | 80 | 40 |
| Commit-model | 2 | 24 | 12 |
| Encounters acceptance | 2 | 40 | 20 |
| Promises live | 2 | 24 | 12 |
| T8 | 2 | 20 | 10 |
| 45 seal | 2 | 30 | 15 |
| T-R4 | 2 | 44 | 22 |
| J13 | 2 | 20 | 10 |
| Shakedowns on the new pin (GS6 + one spare) | 2 | 80 | 40 |
| Snapshot restores | 22 | 44 | 22 |
| Triage slack 15 % | — | — | 55 |
| **Acceptance** | | **726** | **418 ≈ 7.0 h** |
| 42 W4 recorder (solo) | 1 | 45 | 45 |
| T-Q3 | 1 | 25 | 13 |
| M2 tail | 1 | 21 | 11 |
| 47 P7/P7h (LT) | 1 | 60 | 30 |
| Over-steer card | 1 | 120 | 60 |
| **Informational** | | **271** | **159 ≈ 2.7 h** |
| **Total** | | | **≈ 9.7 h** |
| If AS-smoke ×9 ×2 and GS2 ×2 ride Artemis | | +260 | +130 ≈ +2.2 h → 11.9 h |

Cut list, in order (first cut first); savings in GPU-h:

1. Over-steer card → the owner's own play or v3.0: −1.0 (D10).
2. 47 P7/P7h (LT) → v3.0: −0.5.
3. T-Q3 and the M2 tail → v3.0: −0.4.
4. 45 seal ×2 → ×1, recorded informational: −0.25.
5. AS-smoke and GS2 stay on the cloud reply (rule 2): avoids +2.2.
   After 1–5: 7.0 h acceptance + 0.75 h W4 = **7.7 h**, still 4.7 h over the 3.0 h left.
6. **Owner (D1), only if the cap holds at 3.0 h:** run GS1, promises, T8, GS4, T-R4, J13, commit-model (about 2.7 h)
   and defer GS3, GS6, encounters, seal and W4. The verdict is then PARTIAL by construction (acceptance rows without a
   pair). Not recommended.

Cloud spend (no GPU):

- CL lane time: plan 24's 28 lane-h plus new rows (adversarial set, Wc/RB, C7, A6, M16/M17/M20, conditionals) about
  6 lane-h = **about 34 lane-h**, about 17 h wall on two lanes (D1–D3).
- Reply/read model on CL lanes (D2): about 800 cloud turns × about 30K input tokens with passes ≈ 24M in, 2M out; at
  DeepSeek list prices (about USD 0.27/M in, 1.10/M out) **about USD 9**. Cap EUR 15, stop and ask at 150 %; the
  provider's usage page and `so-session budget` decide.
- TypeSafe judge: about 12 calls per turn over about 170 RP + 1,000 CL turns ≈ **14,000 calls** (cap 20,000), at
  roughly 1.5–2K input tokens each ≈ 25M input tokens; price from the TypeSafe dashboard, not this plan.
- Sol (opencode `openai/gpt-6.1-sol`, subscription): wizard, Ask, C7, A6, O13b, O16, J9, M18, M19, plan 09 live, raters.
  No marginal cost; the usage limit is the risk (it stopped a plan 33 leg). Fallback per owner rule: DeepSeek.
- RunPod: none (no pod budget for the rest of October); P1/P2 only on an owner decision.

## Pre-flight (all recorded green in this plan's Gate record before any model row)

1. **Rule 11 readiness on F and the new pin:** campaign `scripts/check_all.sh` green, `lab/v28/check.py` resolves every
   group, member, story, checkpoint and mocked delta, `adolion-fresh check <lane>` 0 problems on every lane;
   row → carrier → campaign file list with no gaps, GS6's structure checks included; missing data goes into the
   campaign (pin bump, reinstall), never into a fixture.
2. **Docs current:** guideCoverage and guide drift tests green; `docs:guide` and `docs:settings` leave no diff; every plan
   merged since the last check (42, 43, 44, 48, 49, 18 Q7 and check `when`, 65, 68, 69, 35 G, 09/34 harvest) has its
   guide section and Gate record; `coverage.mjs` 0 red, 0 unmapped floors, report attached.
3. **Campaign data:** pin = campaign master containing `411f4d4`; `adolion-fresh accept-baseline <lane> --reason "pin
   bump: v2.8 adoption"` after the seed diff is read; content review of the adoption by a second model, counts only.
4. **Seeds:** `adolion-fresh seed` on 41, 42, 43, 44 (images and sprites off, preset overlay applied, read back), never
   lane 0; never-run snapshot per lane (24 rule 5); no-model lanes 30–34 seeded; no ComfyUI call in any lane log.
5. **Headers:** `so-run-header capture` per lane before each batch, `diff --owned <run chats>` after; an undeclared
   difference stops the next batch.
6. **Carries:** for each carried manifest row and each `167892d9` pair, `git diff --stat <evidence commit>..F -- <row
   paths>`; empty = carry with the citation, else the row runs.
7. **Evidence:** archive the open private evidence first (`text-suite-20261015`, rounds 2–3:
   `so-evidence.mts archive`, then `npm run sessions:archive`, committed in `so-sessions`).
8. **Host:** owner not playing and the 3090 free; tray `status.txt` OK for the controller; `df -h /c` checked; TypeSafe
   key present in the suite ST (owner types it); Sol sign-in valid (harness status); DeepSeek quota; RAM headroom for
   two lanes (round 1 stopped on a RAM hold).

## Exit criteria

- Every A row green ×2 on F (or F′), or red with its finding and the owner's decision; every I row recorded ×1 or
  deferred with a reopen trigger; every C row run or deferred with its missing prerequisite named.
- D: `npm run gates` with Storybook ×2, `test:release`, no-model scenarios ×2, payload diffs with no undeclared hunk.
- Header diffs clean around every batch; evidence archived and committed to `so-sessions`; GS journey records under
  `test/journeys/records/v2.8/`, measurements under `test/measurements/v2.8/`.
- Attestation green with `SO_ACCEPTANCE=1`. Verdict per plan 24 §Freeze: ACCEPTED only with every A row green ×2;
  PARTIAL with reasons; INCOMPLETE if any A row lacks a pair.
- Status tables updated: `.claude/CLAUDE.md`, `00-overview.md`, `32-queue.md` (R13 done), `24-test-plan.md` pointer.

### Record format (this plan's Gate record; lists only, no `| ID |` tables)

```
## Gate record (<date>, final suite on F <commit>, bundle <sha12>)
- Freeze: commit, bundle bytes, gates ×2 (command + result), test:release, staged copy, served = built.
- Pre-flight: checks 1–8, each with its command and count.
- Budget: Artemis GPU-h per night and total against the cap; TypeSafe calls; DeepSeek EUR; Sol runs.
- <row>: run 1 <pass|fail> (<record path>), run 2 <pass|fail> (<record path>); floor <value> (<plan>), measured <value>;
  findings; carried: <evidence commit + empty path diff> when carried.
- Deferred: <row>, reason, reopen trigger.
- Header diffs: per batch, 0 undeclared.
- Evidence: archive label, file count, so-sessions commit.
- Verdict: ACCEPTED | PARTIAL (reasons) | INCOMPLETE (rows without a pair).
```

Counts only for campaign rows; no checkpoint, character or place names.

## Row counts

- RP acceptance: 11 rows (GS1, GS3, GS4, GS6, T-R4, J13, commit-model, encounters, promises, T8, 45 seal); 22 runs.
- RP/LT informational: 5 (W4 recorder, T-Q3, M2 tail, over-steer, P7/P7h).
- RP deferred: 7 groups (SP6, R2/R7/63, R5 and packs, 51/53 lab rows, 18 S7/62 Q1r/43 VR7, 55–59).
- CL acceptance: 32 plan rows (AS-smoke 9, GS2, 12 journeys, the O/33-W block, privacy, suggestions,
  C8b, 09 live, 13 consumers, 34 lore-select, 22 L1/L5, 52 C7, adversarial set), +3 if due (M16, M17, M20).
- CL informational: about 22. Conditional: 11 groups.
- D: 79 manifest rows + about 30 no-model scenarios + payload B/F diff.
- Human: owner 2 packs (M25, owner-surfaces) + optional over-steer; second model about 18 packs/ratings.
- LI (image POC, last): 4 groups.

## Owner decisions needed

- **D1 budget (blocking).** Need about 7.7 h after cuts 1–5 against 3.0 h left. Recommended: a cap for the frozen run
  of 8 h (two 3090 nights), treating rounds 1–3 as shakedown spend on a superseded build (v2.8 Artemis total about
  17 h vs the 12 h cap). Alternative: hold 3.0 h and accept PARTIAL (cut 6).
- **D2 CL reply/read model.** DeepSeek Chat Completion (about USD 9, cap EUR 15; recommended, Sol cannot be ST's main
  reply profile) vs Artemis (+2.2 GPU-h). Sol stays authoring/wizard/Ask/rater.
- **D3 third lane.** `--allow-load` for a CL lane during the Artemis nights (shorter wall time, RAM risk) or CL on days
  only (recommended).
- **D4 carries.** Carry a `167892d9` or manifest pair whose path diff to F is empty? Recommended yes (rule 6).
- **D5 SP6** (49 C8–C10, R3, R12, about 10 lane-h RP): v3.0 (recommended) or a pod.
- **D6 R2/R7/B1-HIST + 63 H1/H2/H6r:** pod P2 (about EUR 6–10) or v3.0 (recommended).
- **D7 missing harnesses** (47 labelled sets, 44 voicing fixture, 48 frontier set and runner, 34 A7 arm, 18 S8 fixture,
  62 probe, K1b checklist): build before freeze (no GPU) or defer. 62 stage 1 itself awaits the owner.
- **D8 GS6** as a new journey (recommended, independent per-feature record) vs folding adoption checks into GS1/GS3/GS4.
- **D9 43:** re-run R-Gate2 on the witness record automatically if W4/W4fi pass? Recommended yes (CL, offline).
- **D10 over-steer card:** Claude ×1 inside the cap, or the owner's own play (plan 24 Q4).
- Still open from plan 24: Q1–Q3 (applied de facto in rounds 1–3; confirm), Q8 (`test/sessions/adolion-stories.json`
  in the public tree lists campaign checkpoint names: move to `so-sessions` and purge?).

## Unresolved questions

1. Round 3's exact Artemis hours (estimated 3.2 h here) and whether GS1's clean pair and the 47 rollback triage land
   before freeze.
2. GS6 carrier stories: which adopted stories carry each world-layer feature (count from the pinned build at
   pre-flight 1).
3. Image POC GPU time: one session assumed; the remaining POC rows are listed in 33, 36 and 41 Gate records.

## Owner decisions 2026-10-17

- D1 budget: no fixed cap for the frozen run; it keeps going until the owner pauses it. Earlier rounds count as shakedown.
- D2: Artemis is the reply/read model for the former cloud rows (no DeepSeek spend); +2.2 GPU-h accepted.
- D5/D6: SP6, R2/R7, B1-HIST and the 63 latency arms run on a RunPod pod, when the owner says so.
- D3 moot (no cloud reply lane); D4 carry empty-diff pairs: yes; D7 build missing harnesses before freeze; D8 GS6 as a new journey; D9 re-run 43 R-Gate2 automatically if W4 passes; D10 Claude runs the over-steer card (via go-with-recommendations).
- The run starts only on the owner's go.

## Pre-freeze prep 2026-10-17 (branch `v2.8-prefreeze`, unmerged)

No GPU, no model; no-model lane 85 (lanes root `C:\dev\so-live-lanes`) on the private ST copy `C:\dev\st-live-prefreeze`.

- **GS6 (D8): written.** `test/journeys/gs6-adoption.journey.json`, 12 checks, 12 real turns, group `Adolion - The Saga`.
  - Carrier by structure: adolion-saga is the only adopted story at `411f4d4` holding every world-layer feature (census in
    GS6.1: 37 reached-gated codex facts, 1 secret label, 8 factions / 19 moves, clock, 2 `when` checks, 9 rumors, 11 recap
    quests, 13 narrated public qualities + 1 omniscient narrator, a scene widget, `scene_test`). Carry targets live in other
    stories, so GS6.11 is a carry declarations census (4 targets, 7 sources); the real carry stays the 45 seal row.
  - Where 12 turns cannot reach a gate the check takes the shortest author write and records the path (`read` | `author`):
    codex route (5 hops on the Saga), label reveal, faction move, rumor start, recap quest, time step, the `when` attempt.
    The codex swipe is deterministic (a canned swipe on the route's reply; GS1.6 keeps the real regeneration).
  - GS6.8 (promise row) needs the read model: it fails on a no-model lane by construction.
  - Plumbing shakedown, lane 85 seeded `ADOLION_CAMPAIGN=C:/dev/adolion-adopt adolion-fresh.mts seed 85 --commit 411f4d4`
    (`SO_LANE_OFFLINE=1`, then `st-lanes no-model 85`; one expected problem: not the pinned commit), served bundle
    `47510e42370c`: `so-journey.mts run <GS6-plumbing copy>` **11/12 ×2 consecutive** (07:03 and 07:14 UTC), only GS6.8 red
    (read refused, no model); cleanup clean both. Plumbing green, real-model shakedown owed (night 1, lane 41). Evidence
    `C:\dev\so-live-lanes\evidence-2026-10-17\85\`. Two earlier iterations fixed the guard (judge is off on a no-model
    lane; the run header pins shipped defaults) and the rumor source (`rumorNet`).
  - New: `scripts/debug/so-journey-plumbing.mts` writes a PLUMBING copy of any journey (send_generate becomes a posted
    line plus a canned `/sendas` reply), since ST hides Send on a no-model lane; never evidence.
- **Lane range:** `adolion-fresh` and `so-session` capped lanes at 50 (the lane-73 throwaway copy); one range 1..99
  (`scripts/debug/lib/laneRange.mts`) now serves st-lanes, adolion-fresh and so-session.
- **D7 harnesses built** (no model; each plan's Gate record 2026-10-17 has files, hashes and the real-run commands):
  - 48 S7–S9, S11: `so-scene-test-replay.mts`, 20 frozen synthetic frontiers × 3 forced outcomes on the shipped director
    code, Sol replay, blind claude -p pack, scorer. Unit tests 13/13. Two invented names that collide with private campaign
    names renamed and the set re-frozen (`1f72dddb…`).
  - 47 P1/P1s/P2/P2w/P6/P8: `so-promises.mts`, 126 P1 cases (66 promises), 32 P2 events + 6 controls, 20 P6 inputs, lazy
    `runPromiseRead` seam. Lane 85 plumbing (`--plumbing gold`): p1 and p2 ran clean (misses 0, marked never a
    measurement). Agent note: on bait lines the shipped acceptor alone takes 11 (P1 precision then rests on the read
    model) and 5 wrong-id events; hardening to decide after the real numbers.
  - 44 G7/G8/G14: `so-rumor-voicing.mts`, 20 voicing cases on/off, 30-turn G14 fixture, offline G14 checker. Lane 85
    plumbing: 40/40 recorded (hearsay line present in all 20 on-arm requests, absent in all 20 off), pack built, score
    PLUMBING.
  - 18 Q7 S8: `so-q7-failure.mts`, 10 always-failing public checks (5 with a quest fail). Lane 85 plumbing 10/10
    recorded, pack built.
  - Not built here: 34 A7 and 62 (other agents, branches `v2.8-65aplus-09a7`, `v2.8-62-63`); 69 K1b (needs a
    checklist written outside this repo by another model); 35 G9, 43, 50 T9/T10, 63 H6 are lane or feature conditions,
    not harnesses.
- Plan 24 matrix: GS6 checks and the new harnesses added as carriers; `coverage.mjs` 124 ids, 122 green, 2 image
  track, 0 red; 324 floors, 0 unmapped.
- Gates: `npm run gates -- --jobs=1 --no-storybook` on `9a9d0797`: **all green** in 406 s (test:replay, test, build,
  test:debug, typecheck, typecheck:test, lint, debug:typecheck, test:plugin, test:release). Storybook skipped: no component
  or story touched. Two gate fixes on the way: census rows for the 47 probe (model-call role, ownership `local`) and a
  CRLF-checkout assumption in the 47 freeze test.
- Master `6dfc1ee1` (55, 45 E, 52 E, 65 A+, 09 A7, pin bump to `411f4d4`) merged as `de242fb4`: plan 24 matrix rows resolved
  row by row (both sides' carriers kept); docs:guide / docs:settings no content change; arrival golden not tripped;
  `coverage.mjs` 125 ids, 123 green, 2 image track, 0 red, 324 floors, 0 unmapped. `npm run gates -- --jobs=1
  --no-storybook` all green in 438 s (9,682 jest tests); Storybook static build + test-runner on port 6292, `--maxWorkers 1`:
  151 suites, 919 tests passed. Main bundle 1,285,188 B.

## Owner revision 2026-10-17: lean suite (supersedes the scope and budget above)

- Reason: plan 71 counted ~68 h Artemis + 8.4 h images; the owner cannot afford it.
- Every row runs x1; a second run only when a row fails or flakes. Evidence from round 3 (build 167892d9) carries for GS3, GS4, AS-smoke, commit-model, encounters, C7.
- Lean rows on the 3090 (about 5-6 h): GS1 x1 (smoke for everything since 167892d9), GS6 x1, 47 promises x1, T8 x1, 45 seal x1, 42 W4 recorder x1 (solo), image POC: 41 journey x1 + 33 latency pair x1 (solo).
- Measurements stay in v2.8 (owner): SP6, R7/B1-PFX, B1-HIST, 63 H6r/H1, blind-pack arms; they run on a pod when the owner says so (plan 71 scenario A rows).
- Cloud-model rows (former D2 reply turns: AS-smoke x9, GS2, journeys, O/33-W block, CL raters on a reply model) move to v3.0. D2 is withdrawn.
- Deterministic rows, payload goldens and the human evaluation stay as written; the owner's own Adolion play also counts as an acceptance source (journal and logs watched for defects).
- Starts only on the owner's go.

- 2026-10-17: run schedule and pod budget in plan 71 §Owner arrangement.


## Gate record (2026-10-25, lean suite on G `d6d6aed5`, bundle `1148eb7af1b9`; reruns on H `6d84dc1d`, bundle `6dde70ebffae`)

Owner revision 2026-10-17 (lean, x1 per row). Supersedes the 2026-10-23 partial night on F `9d88d992` (paused on the owner's call;
its W4 partial reads kept as `test/sessions/witness-real/reads-F-partial-2026-10-23`, not scored).

- Freeze G: master `d6d6aed5`, local tag `suite-G-v2.8` (a `v*` tag on HEAD trips test:release R4 release mode, so renamed),
  bundle 1,298,246 B (budget 1,300,000). `npm run gates` x1 all green 481.5 s (Storybook included). Deviation: x1, not x2.
  Staged + `plugins:install` (unchanged); served = built (`so-run-header` `bundle.served.sha256` = dist).
- Freeze H (reruns only): master `6d84dc1d`, tag `suite-H-v2.8`, bundle 1,298,271 B; `npm run gates` green 364.8 s. Carries the
  rollback fix (below), the so-journey cleanup-order fix `8e378dab`, plan 11 B1/B2 (scripts only).
- Pre-flight: lane 45 re-seeded `adolion-fresh seed 45` at pin `4762f0ff` (0 problems; drift = pin commit + 9 story hashes,
  baseline replaced); controller `automatic`, GPU free 23.6 GB; owner ST down (not playing); images/sprites off by the seed;
  header `run-header-suite-G-base.json` 0 warnings.
- Budget: 3090 only, about 2.0 h model time (W4 22 min, GS6 38 min, GS1 20 min, 47 x2 21 min, T8 2 min, seal x2 20 min);
  TypeSafe judge on; Sol: GS1.1 briefing + GS1.9 Ask; DeepSeek 0 EUR.
- 42 W4 recorder (G): 74 reads, 0 outages. FAIL (informational, decision-bearing). Real sessions: exact-set 13/147 (0.088, floor
  0.9), false inclusion 339/471 (0.72, floor 0.02), false exclusion 4/574, coverage 153/192 (0.80, floor 0.85), mixed 0/11; null
  control (presence) exact-set 144/171 (0.84). Lab: exact-set 3/21, 17 lines rejected ("unknown member player"). Wc: added input
  p95 150 (floor 120), output p95 282 (floor 160), latency p95 24.6 s vs 21.1 s (floor x1.15) all miss; length rate 0/0 ok.
  Shape: the read answers `heard=all-present` on almost every message. Decision 9 (43 R-Gate2) not triggered. Record:
  `test/sessions/witness-real/score-real-G.json` (private tree).
- GS6 (G): 11/12, first try 11/11, cleanup clean. FAIL GS6.8 (no promise row after the promise turns and a read; real-model
  miss on the saga carrier). Header diff found `display.playerSetup` left off: harness defect (cleanup restored the setting before
  the config snapshot that held the suppressed value), fixed `8e378dab`, lane restored. Record batch `2026-10-25T08-00-03-602Z`.
- GS1 (G, run with the cleanup fix): 9/9 automated, first try 9/9, cleanup clean; GS1.10 human copy check SKIP (second-model
  rating owed). Doubles as the inner-beat real recheck (GS1.2 green). Record batch `2026-10-25T08-46-11-803Z`.
- 47 promises: G run FAIL (step 13: deleting the keeping turn left the kept event; step 10 read kept=1, so not vacuous).
  Product defect: a burst delete whose earlier delete already stepped the engine back made `engine.rollbackTo` answer noop and
  `rollbackOnce` returned before `quarantine()`, keeping per-message rows (promises, checks, observations, audits, ...) at the
  deleted message. Fixed `5be3a107` (`settleInPlace` for both in-place paths; jest case red on old code). H rerun PASS.
  Records `2026-10-25T09-06-40-461Z` (G), `2026-10-25T09-33-57-395Z` (H).
- T8 (G): 0.75 (3/4), floor 0.9, FAIL (informational): timewindow04 flashback control read "morning" again (same as the two
  2026-10 runs). Report `so-live-suite-t8-G-report.json`.
- 45 seal: G run FAIL (fixture: `sealNow()` raced the automatic final seal, returned null; word split `/s+/`). Fixture fixed
  (waits for the automatic final record). H rerun: epilogue = joined-summaries fallback. Cause (lane server.log): attempt 1 was
  ~110 words (< 120), attempt 2 (~250 words) was refused for "names not in the records" that the prompt's own HOW IT ENDED lines
  supplied: product defect, fixed `c5e3546b` (verifySaga's known text includes the outcome lines; jest case red on old code).
  I rerun (staged from the gated worktree build of `c5e3546b`, bundle `9f0bfb781af5`, 1,299,999 B): epilogue 177 words, not the
  fallback (floor met); the final record was `degraded` and the carry picker did not offer the finished run: FAIL, open as
  v2.9 13 C2. Records `2026-10-25T09-16-06-550Z` (G), `2026-10-25T09-40-40-934Z` (H), `2026-10-25T11-10-29-798Z` (I).
- Build I note: the main checkout builds `c5e3546b` at 1,300,002 B (module ids follow the folder layout) while the worktree
  builds 1,299,999 B; staged from the worktree build; headroom is v2.9 13 C7.
- Image POC rows (41 journey, 33 latency pair): not run (owner: images on hold).
- Header diffs: after W4, GS6 (1 blocking: playerSetup, harness, fixed), GS1, 47, T8: 0 undeclared after the fix.
- Evidence: `so-evidence archive --label lean-suite-G-20261025 --lanes 45` (1,174 files; the 976 MB lane server.log stored
  gzipped, original sha in ARCHIVE.json `gzipOf`), so-sessions `0eb30314`.
- Verdict: PARTIAL. Green: GS1 9/9, 47 (H), 45 epilogue (I). Red: W4 (feature unconsumed; moved to v3.0), GS6.8 (13 C3), T8
  control (13 C4), 45 record/picker (13 C2). Defects fixed in this run: burst-delete rollback, journey cleanup order, epilogue
  name check.
