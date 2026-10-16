# Plan 67 — Grader hygiene and adversarial extractor fixtures (folded)

**Status: folded 2026-10-16 into v2.8 35 §Harvest phase and plan 24 §Measurement rows.** Written 2026-10-14 from the extension
harvest (`61-harvest-triage-2026-10-14.md` H8). This file stays as a pointer so links resolve; the design, floors (G1–G10) and
owner decisions now live in `35-test-coverage.md` §Harvest phase. Not built, not queued.

## Where each part went

- Matcher (prefix inventory first, per-needle mode, one helper), versioned re-score, attribution-aware false-memory fixture,
  persona-pressure reader and reply legs, noise-aware compare, a defined "chat untouched" hash: `35-test-coverage.md`
  §Harvest phase (G1–G6).
- Folded in at the same time from the triage: shipped-block verification on actual requests (R13, R14 → G7), result
  fingerprints (V33 → G8), compatibility measurements (V1, V60 → G9), side-model reasoning template (V47 → G10), fixture export
  from flagged reads (V37, optional).
- The compare and fingerprint rules that apply to every measurement: `24-test-plan.md` §Measurement rows.

## Review 2026-10-16 (Astra)

Source: `review-astra-harvest-2026-10-16.md` §1 (NEWs that should be folds), §2 (67). Verified on `e8b9dd6d`.

- **67 → 24 + 35.** Accepted: test infrastructure and coverage, not a product feature. → folded; this file is a pointer.
- **P1 word-start vs whole-term, P1 asserted vs attributed, P1 reader-only G4, P2 hash fields, result versioning.** All
  accepted; resolutions with file:line are in 35 §Harvest phase "Review 2026-10-16 (Astra)".
- Rebutted: none.
