# v2.9 plan writer brief

You write ONE v2.9 plan file in the worktree `C:/dev/so-v29-plans` (branch `v2.9-triage-plans`). Docs only: never touch `src/`,
SillyTavern, lanes, the GPU or the network. Write only your plan file.

## Source of truth for your plan
- `docs/plans/v2.9/01-triage-sol.md`: your plan's section under "Proposed v2.9 plan set" is the spec (pitch, in/out, precedent,
  dependencies, measurement/floors, owner decisions). Also read every verdict, audit finding (A01–A13) and "Challenge" that
  names your plan, and the build order. Keep the floors exactly as sol wrote them (they are proposals to freeze; never retune).
- Research behind it: `docs/plans/v2.8/extension-research-2026-10-21/` (`SUMMARY.md`, the per-repo reports your section
  cites, `niches.md`), and where relevant `docs/plans/v2.8/extension-research-2026-10-14/` and
  `docs/plans/v2.8/61-harvest-triage-2026-10-14.md`.

## Format
Follow recent v2.8 plans, e.g. `docs/plans/v2.8/68-your-move-chip.md` and `62-quantum-ogre-and-prepared-facts.md`, and the
rules in `docs/plans/v2.8/00-overview.md` §Rules (implementation/acceptance tiers, new-surface owner decisions):

```
# Plan NN — <title>
**Status: written 2026-10-21 from the v2.9 triage (`01-triage-sol.md`); not built; owner decisions pending.** Tiers.
## What it is
## History and evidence            (sources with paths; triage rows)
## Current state in code           (verify every claim in src/ on this checkout; cite file:line; "Verified on <short sha>")
## Options                          (table: design / cost / risk)
## Recommendation                   (phased slices, each small enough to build and gate alone; schema, validation, Studio,
                                     typed mutations + wizard tool, guide topic, feature registry entry, settings, lazy chunk)
## Predeclared floors              (sol's, with denominators; informational)
## Gates by tier                    (per CLAUDE.md validation table; real-LLM live gate where model-consuming)
## Privacy and spoiler notes       (held secrets, shared tiers, player surfaces)
## Invariants touched               (name each architecture.md invariant and how the plan keeps it)
## Dependencies and links
## Decisions for the owner
## Unresolved questions
```

## Rules
- Terse, grammar optional, no code comments, no hype. Plan docs must not contain a markdown table whose header is `| ID |`
  (collides with `test:release`); use lists for id'd rows.
- Every feature is on by default once built; thinking and inner voice stay on (flag anything that would switch them off).
- Repo is PUBLIC: no Adolion campaign content; never open `C:/dev/adolion-campaign`. English only.
- Where sol's triage and the research disagree, follow sol and say why in History.
- Final message ≤120 words: file written, slices, open owner decisions.
