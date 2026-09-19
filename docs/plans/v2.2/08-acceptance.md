# Plan 08 — v2.2 acceptance

## Objective

Accept v2.2 as a whole: every journey green with the judge **off** (nothing regressed for an
install without it, which is every install by default) and **on** (every usage earning its
place). Cost and latency are reported from
the judge call ring, not estimated. The human-eval sessions score what automation can't. This plan also
publishes a **recommended configuration**. It never flips a default: every judge usage stays
opt-in (overview rule 4, user decision 2026-09-19).

## Context

- The template is v2.1 plan 08: `--strict`, fresh-start, real model, each journey run twice,
  archived under `test/journeys/records/<gate>/`.
- Carried in: the v2.1 human-eval sessions and rubrics (J8.4 then, J9.6/J9.7) if still
  outstanding. They share sessions with this plan's human checks.
- Consumed: plans 01–07 and every Gate record.

## Scope

In:
- The full journey matrix in both judge states.
- Calibration re-run.
- The cost/latency report.
- The human-eval protocol.
- The recommended configuration (no default changes).
- Findings register.
- Docs/status refresh.
- v2.3 seeds.

Non-goals: new code beyond acceptance-found fixes. Any fix bigger than trivial gets its own mini
gate record here or is bounced to v2.3 (the v2.1 rule).

## Deliverables

### Matrix

- J0–J11, `--strict`, twice each, in two configurations:
  - **judge off**: `judge.enabled=false`, plugin installed. This is the regression proof, and it
    must match v2.1's archived matrix check for check.
  - **judge on**: every usage opted in, curator accept modes on `review`, variants = 2. Run it
    once with `pick: code` and J11.25 once more with `pick: llm`.
- J7 runs once per configuration. It is expensive, and a v2.1-style two-run requirement does not
  apply to it.
- Archive both matrices, logs and journal exports under `test/journeys/records/v2.2-acceptance/`.

### Calibration

- `so-judge calibrate --use <every use> --record` on the model the settings pin.
- A table per use: floor, measured value, and the change against its plan's Gate record.
- A usage below its floor is marked **not recommended** in the configuration table, with the
  reason.

### Cost and latency report

`docs/plans/v2.2/acceptance-report.md`, built from the judge-on runs' `extras.judge.calls` rings.
Each record carries use, model, latency, `stateChars`, question count and fallback. The rings are
exported per journey run with `so-journal.mts export`, because a chat's ring caps at 300 and the
journey chats are deleted in cleanup.

- calls per boundary by use;
- p50/p90/max latency by use;
- on-path latency (director, lore-select) against its 1.5 s budget;
- the fallback rate by reason;
- `$` per 1000 boundaries at the published rate;
- GPU time saved: LLM calls avoided, counted as critic calls + skipped reconcile reads + P0 scene
  reads the regex would have triggered on false hits + residual-scope token reduction. The
  supersession bridge stays in v2.2, so it is not a saving.

The spike's $0.08 per 1000 boundaries is the baseline to compare against.

### Human eval

Two sessions, each exported with `so-journal.mts export`:

- **Player session**: sun-ruins, judge on. Rubric rows:
  - Did the right characters speak? (J5.7 anchors)
  - Did the story notice when you changed scenes?
  - Did lore you asked about show up?
  - Was anything contradicted?
- **Author session**: an Adolion story, judge on.
  - Review warden notes, scene-setter proposals and the "Not stored" list.
  - Author one quality hint through the preview.
  - Rubric: were the judge's calls explainable from the author view?

Every flag is triaged: fixed / v2.3 / by-design, with a reason.

### Recommended configuration

`docs/plans/v2.2/recommended-config.md` is a table with one row per usage flag: recommended /
not recommended / only for certain stories, plus the evidence and what the usage sends off the
machine. A usage is recommended only if:
- its calibration is at floor;
- its journeys ran green twice with it on and off;
- the human sessions raised no unresolved flag against it.

The settings panel links to this page. No code default changes: `judge.enabled` and every usage
stay `false` (plan 01's sanitizer test keeps it that way).

### Docs truth (v2.1 rule 5)

- `.claude/rules/architecture.md` + `docs/architecture-v2.md`: `src/judge/`, `stHost/judge.ts`,
  `stHost/worldInfoActivate.ts`, `runtime/judge.ts`, `runtime/loreSelect.ts`,
  `runtime/consolidationMatches.ts`, `sceneCoordinator`, the new registry keys, and the server
  plugin.
- `.claude/rules/gotchas.md`: judge handles, flags, fixtures, and the plugin/secret setup.
- The debug skill and `scripts/debug/README.md`: `so-judge`.
- `CLAUDE.md` status line for v2.2.
- `test-plan.md`: J11 in full, the J8 growth, the spoiler checklist additions.
- The v2 host-facts table: every seam verified in plans 01–07.

### Findings register

The same table shape as v2.1's `00-overview.md`: id, finding, fixed in, evidence.

### v2.3 seeds

- Direct scene-break confirmation by the judge.
- Canon/summary verify.
- Epistemic via judge.
- Cast tuning curator.
- Recap narrator (if the human eval asks).
- Canon regeneration drafts.
- Two-hop look-ahead.
- Per-quality floors.
- Anything bounced from this gate.

## Validation gate

The two matrices green (`--strict`, twice), calibration at floor for every recommended usage, the
recommended configuration and the cost report written, and both human sessions scored and triaged. The status line updated. If the plugin
can't run on the machine, the gate is not green.

## Persona tags

No new UI. Any acceptance fix that touches UI tags itself per v2.1 rule 4.

## Unresolved questions

- Should the judge-on matrix also run on a second judge model version (`jev-latest` if it has moved
  by then)? Proposed: yes, calibration only, not the journeys.
