# Plan 23 — v2.8 test plan: per-plan acceptance, the final real-LLM suite, sessions and the freeze

**Status (2026-10-03): v2.8 plan 23 (new). Written; runs last.** Overview: `00-overview.md`. Model:
`v2.6/10-acceptance.md` (phase F, the blind pack, the verdict) and `v2.6/14-tiered-testing.md` (charters, ×2,
findings fixed in place). v2.7's deterministic test plan is `v2.7/16-test-plan.md`; everything v2.7 could not prove is
owed here through `01-v27-carry-over.md`.

## Rules

1. **Tiers** (00-overview §Gate taxonomy): D, CL, LT, LI, RP. Each plan is accepted at the tier its rows name; a
   deterministic gate never closes a CL/LT/LI/RP row (rule 7).
2. **Measurements when a decision needs them, regression once at the end** (rule 8). A measurement that decides a build
   (a spike, a floor, a calibration) runs inside its plan, ×2, before the build decision. Regression and acceptance of
   built behaviour run in the final suite (§Final suite).
3. **Floors are predeclared and never retuned** (rule 2). A row that misses stays red; the plan says what happens then.
4. **×2, consecutive, on one lane**, run header diffed around each batch (`so-run-header.mts`); a gate is green only
   after both.
5. **Dark launch** (rule 9): a new runtime model use passes its floor twice before it leaves dev-only, then ships off by
   default.
6. **Adolion stays unspoiled** (rule 11): Adolion excerpts are rated by a second model, never the user; the user rates
   synthetic rows only, and only if they choose.
7. **Group chats only; tray; models off `C:`** (rules 5, 6): every LT/LI service is started from its tray entry and its
   run asserts `C:\dev\tray\status.txt` OK and no model path on `C:`.
8. **Adolion runs start from `adolion-fresh`** with the pin of the run; images/sprites off unless the row is LI
   (`--allow-comfy`, through the broker, never the shared ComfyUI while another session renders).

## Per-plan acceptance

"Own" = measured inside the plan when its decision needs it. "Suite" = regression in the final suite.

| Plan | Acceptance tier | Own measurement (×2, before the build decision) | Final suite rows |
|---|---|---|---|
| 01 carry-over | RP, CL, LI, D | §C V0–V8 (SP2 option A), §D thinking A/B, §E R4, §F M1–M5, C3, C12, C11-F2 | **all of §A O1–O15 + O13b** (v2.7's owed rows; O13b = wizard prompt changes from C1; O15 = the A7 briefing content review by a second model; O13 = SP5.b in real replies, O14 = promoted SP8 tiers under a real curator, distinct from C13-b), C4, C13-b, C14-b, C11-F1/F7, §C V3/V4/V8 regression |
| 02 campaign | LI, CL, D | D13d cue reads per turn before/after | lab runs on the pinned campaign; D13b renders QA-equivalent |
| 03 persona | D, RP | S30-1 (scripted opener on a lane) | the injected `player` block in real replies; identity gate before the opener |
| 04 panels | D, CL | — | C5 suggestions (10 runs, no unreached name); C4/C7/C9 (a) live D rows |
| 05 images | LI, CL | discovery + probes | one cue per kind through the ST route and the broker |
| 06 sprite builder | LI | builder contract on 2–3 sets | — |
| 07 talking sprites | LI, CL/RP | S28 (2 vs 3 mouth frames) | a streamed reply animates on a named backend |
| 08 living cards | RP, LI | S32-1 (all arms, ×2, before the default/depth decision and the freeze) | overlay block in replies at the selected depth/default only (regression, no arm comparison); look sprites; deterministic rollback |
| 09 wizard assistant | CL, D | Ask mode projection on the DeepSeek CC profile; §F native tool-call spike (prereqs: v2.7 02 C14 picker/table built, DeepSeek CC profile named, v2.6 plan 11 fixture frozen; floor: arm ≥ text-protocol control on every agent check, 0 unconfirmed provisioning) ×2 | tutorial + Ask on the authoring profile; `profileToolsRoute` agent checks if §F passed and it shipped |
| 10 briefing drafting | CL | spoiler 0/30, preference ≥ 70 % (second-model rater) | the player-path draft on one story |
| 11 curator create op | CL | Phase A per model on frozen fixtures | create op in review mode on the pilot |
| 12 J6d shadow | CL | offline replay | — |
| 13 J7 ideas | CL | Phase A per idea (fixture, offline replay, dev-only until ×2) | uses that shipped off by default: on/off columns |
| 14 open-source Jev | LT, RP | own evals; local provider rows | play-load check on the pod |
| 15 cue/scene merge | CL | A/B on labelled windows | — |
| 16 SP5 | D, RP | C1–C5 dry-run plumbing in groups ×2 (D, no model call) | D: C1–C5 regression; RP: v2.8 01 O13, the scenario block in real replies (decided by the user 2026-10-03) |
| 17 SP6 | RP | SP6 measurement | — |
| 18 quests | CL, RP | M1/M2 reads on the academy lab copy | Journal, visible qualities, public rolls in real play |
| 19 open stretches | RP | stubs measured first; A/B | open mode on the lab stubs |
| 20 character life | CL, RP | M1 (with v2.8 13 N8's judge arm); M2 cost (sets `REL_AXES_PER_READ`); L3 curator-proposal fixture (20 cases, in-goal ≥ 0.85); L6-C voice warden calibration (OOC recall ≥ 0.80, false notes ≤ 0.10) | relationships and schedules in real play; L3/L6 on/off columns if they shipped off by default |
| 21 smart context | CL | E0 (5 arms) + offline witness | — |
| 22 living director | RP, CL | M1 spike | M1–M3 with UI, if M1 passed |

Each plan's own file holds the floors; this table is the index. A plan is done only when its rows are green (00-overview
§Gate taxonomy).

## Final suite (after every plan is built; like v2.6 10 phase F)

1. **Freeze** the candidate: every plan's overall gates green (`npm run gates` with Storybook, main checkout), every
   "own" measurement recorded.
2. **Fresh imports**: `adolion-fresh seed` on every lane; toy stories re-seeded; run header captured per lane.
3. **Run, cheapest first** (an early failure costs little):
   1. D: the mocked scenario corpus, the no-reply journey checks, every plan's live D rows;
   2. CL: v2.8 01 O7, O10, O11, O13b, O14, O15, C3, C4 (CL half), C12, C13-b, C14-b; then each plan's CL suite rows;
   3. LT: v2.8 14 rows (local judge server up from the tray);
   4. LI: v2.8 01 O3–O6; v2.8 05–08 rows (broker; LT and LI never share the GPU in the same batch);
   5. RP: v2.8 01 O1, O4, O9, O12, O13, C4 (RP half), C11-F7, §C V3/V4/V8; then each plan's RP suite rows;
   6. integration: everything-on and shipped-defaults columns on two stories (an act and the Saga), the v2.6 I1–I6 shape
      (mutation storm, cut a backend, reload and reopen);
   7. the judge-off column (every judge use's fallback).
4. **×2** on one lane series, run header diffed around each pass.
5. **A failure is fixed, the candidate re-freezes, and only the affected rows re-run ×2.** The fix commit names them.

## Sessions

Charter cards in `test/sessions/charters.json` (validated; `v2.6/14-cards.md`-style index regenerated), played with
`so-session` on adolion-fresh lanes, headed, fail-closed (start refuses on any discrepancy; stop marks INVALID on a
missing artifact). A session counts only when VALID.

| Card | Who plays | Question | Completion |
|---|---|---|---|
| **Over-steer** (v2.8 01 §G) | Claude | does the warden on `auto` with `agencyCheck` over-steer when the player declares outcomes or goes silent? ≥ 40 turns | VALID; digest counts agency notes raised/accepted/applied per 100 turns, every flagged reply, replies narrating the player, declarations counted as outcomes, each quoted (private); every applied note rated helpful/invisible/OOC/over-corrected by a second-model rater (unrated note = incomplete); T0–T7 journal count attached (v2.8 01 §G, v2.9 04) |
| Over-steer (same shape) | the user | same, the user's own play | the user's choice; scored against the same v2.9 04 floors, separately |
| Persona start (v2.8 03) | Claude | does the identity step lock the persona and does the opener use it? | VALID; lock + opener name in the digest |
| Panels (v2.8 04) | Claude | Journal, stat sheet, suggestions and public rolls in player mode | VALID; `assert-player-clean` at every stop |
| Living cards + talking sprites (v2.8 07/08) | Claude | overlay changes and look sprites over a long run | VALID, `--media on --allow-comfy` |
| Quests (v2.8 18), open stretches (v2.8 19), character life (v2.8 20), director (v2.8 22) | Claude | each feature's charter, on its pilot act | VALID; rubric scored with evidence |
| Free play on the frozen build | Claude | anything that feels wrong | VALID, 1 h |

Findings follow v2.6 14 rule 3 (severity, class), are fixed in place, and get a replay fixture where deterministic.
Session evidence goes to the private `so-sessions` repo (`npm run sessions:archive`); the public repo gets summaries.

## Blind rating packs

- Built from recorded arms only, shuffled and unlabelled (`rating-pack`, `--arm`/`--gate`), pairing only VALID sessions.
- **Rater: a second model** (Astra, delegated as in v2.6, or another model named in the pack's `status.json`), **never the
  user for Adolion excerpts**. The user may spot-check synthetic rows.
- A pack reads **recorded, not rated** until rated; its floor is never green before.
- Packs: R4 (16 more pairs), Q-M5 with P3 (19 more), inner voice C3 (29 more), W6 (9 more), the thinking A/B candidate
  (20 turns), v2.8 10 draft usefulness, any v2.8 plan's preference leg.

## Cost and budget

- Every RP block is estimated and written to `test/sessions/BUDGET.md` **before** it runs; DeepSeek and TypeSafe spend is
  written by `so-session stop` / `budget`.
- Known costs: one thinking A/B ≈ 2–3 pod-hours (the v2.6 one took 2.36 h, about USD 1.70); an RTX PRO 4500 pod is about
  USD 0.72/h (`.claude/rules/gotchas.md`). Other RP blocks are estimated in their plans.
- **RunPod budget for v2.8: EUR 20 cap**, as v2.6 (user, 2026-10-03, as recommended). Before any block that would
  exceed it, stop and ask the user; never trim a ×2 to fit.
- LT and LI are local (GPU time only; one at a time on the GPU via the broker).

## Freeze and attestation

1. Final suite green ×2 (or each red row stated with its reason and the user's decision).
2. Every session card VALID and scored with evidence; every pack rated or listed as recorded, not rated.
3. `npm run build` (prod), `npm run test:release` green; `so-run-header` names the served bundle (`bundle.served.sha256`
   matches the build).
4. Attestation `docs/release/2.8.0/attestation.json`: candidate commit, bundle hash, each row with its record path;
   records archived under `test/journeys/records/v2.8/` (journeys), `test/measurements/v2.8/` (measurements); citations
   checked by `scripts/release/attestation.test.mjs`.
5. **Verdict:** ACCEPTED only with every critical row green ×2, every plan's acceptance rows green, every session VALID
   and scored, every broken finding fixed and re-run; otherwise PARTIAL with the reasons. Anything deferred goes to v2.9
   with a reopen trigger (v2.9 rule 2).

## Review 2026-10-03

New file. Applied: F15 (tiers), Sol split item 2 (v2.7's owed rows run here through v2.8 01 §A), C9 refined (the
over-steer card with its completion contract), B4 (second-model raters for Adolion), D10/F17 (the frozen v2.6
measurements' packs listed).

Round 3 (Sol): R3-01, R3-02, R3-08, R3-09, R3-10, R3-15, R3-20 applied (both decided by the user 2026-10-03, as recommended).
