# Plan 39 — Phase C: test everything from zero

**Status (2026-10-07): SEEDED from the user (2026-10-07: "then do all test over from 0"; "u can use runpod if there're
many test to be done"); needs user approval; not run.** Overview: `00-overview.md`. Supersedes `16-test-plan.md`'s
close-out (§Close-out checklist) and absorbs the real-model rows v2.7 had moved to `v2.8/01-v27-carry-over.md` §A and
the v2.7-plan rows of `v2.8/24-test-plan.md`. 16's per-plan table stays the deterministic row list for 01–28.

## Rules

1. **Nothing carries over.** Every earlier "green" (v2.7 01–28 gate records, plan 24/26/28 live rows, the 2026-10-06
   rollout) is history, not evidence. Each row below runs on the frozen candidate.
2. **One frozen candidate.** Freeze = one commit + its prod and dev bundle hashes (`dist/manifest.json`
   `bundle.sha256`), recorded before C1. A fix during Phase C produces a new candidate; rows it can affect re-run
   (the record says which and why).
3. **Tiers** as in `00-overview.md` §Gate taxonomy. Real-model rows are allowed in v2.7 now (user 2026-10-07):
   **RP** (Artemis on the RunPod pod) for reply-dependent volume, **CL** (DeepSeek roles, TypeSafe judge),
   **LI** (local ComfyUI) for images. Local text (LT) only where a plan needs the local route itself.
4. **×2, consecutive, one lane, run header around the batch** (v2.7 16 rule 2). Floors predeclared in each plan,
   never retuned (rule 3). A below-floor result is a failure, recorded, never a re-run until green.
5. **At most two model lanes at once** (`SO_MAX_LLM_LANES`); no-model lanes run in parallel freely.
6. **Evidence**: summaries and gate records public; anything holding chat text, campaign content or art goes to the
   private `so-sessions` repo (`npm run sessions:archive`; `test/sessions/evidence/`).
7. **Adolion stays unspoiled for the user**: campaign rows report pass/fail and counts only (v2.7 rule 11).

## Sequence

| Step | What | Tier | Where |
|---|---|---|---|
| C0 | freeze; `so-run-header capture` baseline; payload goldens on the candidate | D | lane 1 |
| C1 | `npm run gates` (full, Storybook, main checkout) ×2; `npm run test:release` on prod | D | local |
| C2 | mocked scenario corpus ×2; every plan's live (D) row ×2 (v2.7 16 §Per plan + rows of 29–38) | D | no-model lanes 1–4 in parallel |
| C3 | payload invariance: every plan that touches model input, captured vs C0 goldens, declared diffs only | D | no-model lane |
| C4 | journeys J0–J14 `--strict` ×2; J6 again with plan 33 W1 on (V8) | D + RP | model lanes ≤ 2 |
| C5 | real-model acceptance rows per plan: 02 (O3–O8, O13, O14), 08–10 (O9–O11), 33 W1–W4 (+ the W2 over-steer session card), 34, 35 (Phase 1 K2–K5 first, then M2), 36, 37, 32 W8 S32-1 ×2, 32 W6 streamed-reply row | RP + CL | pod |
| C6 | image rows: 32's route A/B, S32-2, multi-character sprite rows; 38's asset checks | LI + CL | local ComfyUI, isolated lane |
| C7 | Adolion integration ×2 on `adolion-fresh` (38): every story starts, plays N turns, reopen, rollback, chapter | RP | pod |
| C8 | live smoke on a clean install: v2.7 16 §Live smoke procedure (5 turns, DeepSeek CC, no pod; plumbing only, not acceptance), all features on as shipped | CL | fresh lane |
| C9 | user sessions (optional): play from the guide only; flags filed | human | user's choice |
| Z | close-out: settings reference + README table regenerated from the registry, guide vs UI, What's new 2.7, every gate record final, v2.8 carry-over rewritten | D | — |

C5 order follows dependencies: 33 W2 (agency → auto) before any warden row; 35 SP6 measurement before 35's build
rows and 36's complication use; 34 persona before 36/37 rows that read it.

## RunPod budget (estimate, to be approved)

| Block | Lane-hours (est.) |
|---|---|
| C4 journeys ×2 | ~6 |
| C5 rows (35 Phase 1 3–5 + M2 ≈4, 32 S32-1 ≈2 + W6 ≈0.5, 33 incl. over-steer ≈4, 34, 36/37 floors, 02/08–10 O-rows) | ~18–20 |
| C7 Adolion ×2 | ~6 |
| C8 smoke | 0 (DeepSeek) |
| **Total** | **~30–32 lane-hours ≈ 16–18 pod-hours** (two lanes share one pod; RTX PRO 4500 ≈ $0.72/h → ≈ $12–13; the approved ≈ $20 with a 150% stop covers it) |

Pod rules: `v2.6 gotchas` (direct SSH tunnel, `MAX_UPTIME_HOURS`, restart renews the window, record ports); stop the
pod at every pause; `test/sessions/BUDGET.md` updated per block.

## Close-out checklist

- [ ] C0–C8 rows green ×2, or failed and recorded with a finding id and owner.
- [ ] Every v2.7 plan's gate record cites its Phase C rows.
- [ ] Release attestation (`docs/release/2.7.0/attestation.json`) cites archived records only.
- [ ] Overview Status table final; v2.8 overview and `v2.8/01` rewritten for what remains.

## Decisions for the user

1. RunPod budget ≈ 27 pod-hours (≈ $20). **Recommended: approve, with a stop at 150%.**
2. C9 user sessions: before or after the freeze? **Recommended: after C8, on the frozen candidate.**

## Links

`16-test-plan.md`, `00-overview.md`, `v2.8/01-v27-carry-over.md`, `v2.8/24-test-plan.md`, `.claude/rules/debug-scripts.md`.

## Decided (user, 2026-10-07)

"Go with the recommendations": every decision in §Decisions above takes its **Recommended** answer. RunPod budget **approved** (about 27 pod-hours, stop at 150%).

## Prerequisites before the freeze (test review 2026-10-07, `40-test-case-review.md`)

The payload-golden tool (C0/C3), `requires` on every scenario (C2), the de-pinned image harness with a ≥ 3-character
test cast (C6), the missing plan 01–10 D scenarios (C2), the guards the review lists (FLUX nodes, `.safetensors`
literals, port/reserve literals, media allowlist, controller status, fail-open without the GPU plugin), and the floors
written in 34, 37 and 38. Built in the 2026-10-07 fix wave; any still missing at freeze is a red C-row, not a skip.
