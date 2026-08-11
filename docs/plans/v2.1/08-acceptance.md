# Plan 08 — v2.1 acceptance

## Objective

Prove the composition, not the features: full journey matrix green, human-eval protocol executed by the user with journal-backed sessions, findings register closed with evidence, docs/status refreshed. This is the gate v2 never had.

## Context

- Everything in plans 01–07 + their Gate records. Plan-01 test-plan.md is the checklist; the 00-overview findings register is the scorecard.
- v2 acceptance precedent (plan-13 Gate record): real-LLM, headed, no mocks, success-criteria matrix — same bar, journey-shaped.

## Scope

In: acceptance runs, human-eval sessions, register closure, docs refresh, CLAUDE.md status update, v2.2 seed list.
Non-goals: new code beyond acceptance-found fixes (any fix > trivial ⇒ its own mini gate record here, or bounced to v2.2 — no silent scope creep in an acceptance plan).

## Deliverables

- **Automated matrix**: J1–J9 all green, fresh-start, real LLM (gemma live setup), headed; each journey's `so-journey` exit code + journal export archived under `test/journeys/records/` (or `.debug/` + summarized — delegated). Migration journey re-run against a genuinely old chat copy.
- **Human-eval protocol executed** (D2, the user's own-runs feedback loop, run by the user):
  1. **Player session** — user plays sun-ruins (or a fresh Studio story) ≥30 messages in pure player mode; flags moments live; fills the J3 rubric.
  2. **Author session** — user authors a small story in Studio start-to-finish, plays it, performs one mid-play edit (J2 path); fills the authoring rubric.
  - Both journal exports + rubric sheets filed in the Gate record; every flag triaged (fixed / v2.2 / by-design with reason).
- **Findings register closure**: 00-overview table gains an Evidence column — per finding, the journey/check or Gate-record line that proves it fixed. A finding without evidence stays open and is said so plainly.
- **Success criteria v2.1** (additive to spec v2's nine, all asserted or rubric-scored):
  - New chat on a configured install advances by real extraction with zero per-chat setup (J1).
  - A story is authorable, playable, and mid-play editable without touching JSON, same chat throughout (J2).
  - A premise becomes a playable, fully provisioned story (characters, group, lorebook created by reviewed wizard proposals) without leaving the wizard (J9).
  - The default surface passes the spoiler checklist automatically and scores ≥4/5 on the player rubric (J3 + human), **above the plan-01 baseline score** — improvement is measured, not asserted.
  - **D1 enforced**: no steering control (Advance / Nudge / Probe / Suggest / `/cp` verbs / gate or checkpoint-list surfaces) is reachable in player mode — automated selector sweep across every player-visible surface, not a visual judgement.
  - Player-hidden ≠ broken: epistemic private injection, ledger, and arcs still function with the player surface clean (J5 payload assertions).
  - Stalled ≠ dead ≠ working — three visually distinct states, each reachable and correct (J3 induced segments).
  - A pre-v2.1 chat migrates losslessly (migration journey).
  - Refactor neutrality: J3/J5/J6 journal event sequences unchanged vs plan-02 baseline (plan-03 gate re-affirmed on final code).
  - Stagecraft: background deterministic; WI curator proposal applied and visible in the generation payload (J8).
- **Docs refresh**: README (personas, settings homes, id/version, `/story`, stagecraft), `docs/architecture-v2.md`, `.claude/rules/*` (coordinators, registry, journeys as gate default), examples updated. CLAUDE.md status line updated to v2.1 ACCEPTED.
- **v2.2 seed list**: remaining curators (scene-setter, cast tuning, continuity warden slice if not built), per-tier token/trim visibility bar (Smart-Memory `trim-stats` pattern), regenerated character/world profile snapshots (Smart-Memory `profiles` pattern), entity/memory graph view, copilot context tools (search chat/lorebook — ST-Copilot pattern), driver adopting the `questions` protocol, deferred flags/rubric findings, `/story` growth, anything bounced from this gate.

## Implementation notes

- Run order: automated matrix first (cheap failures early), human sessions last (most expensive to redo).
- Roster hygiene: J5/J8 restore `disabled_members` (standing gotcha); sandbox cleanup verbs after every journey.
- If a journey is flaky under the real model, the fix is tolerance in *checks* (the v2 live-suite lesson: scoring policy, not mocks) — never a debugResponse.

## Validation gate

This plan **is** a gate. Green = automated matrix **J1–J9 9/9 + migration journey**, zero `blocked` outcomes anywhere in the matrix, both human sessions completed with rubrics filed (player + author; the plan-06 wizard session may be reused if the build hasn't changed since) and all flags triaged, register fully evidenced, docs merged, harness baseline (typecheck/lint/test/build/Storybook + structural guards + v2 scenario corpus) green on the final tree. Anything less is recorded as not green with the specific misses listed.

## Delegated decisions

- Journal/rubric archive location.
- Whether the acceptance play-throughs re-record the live-suite goldens (only if extraction-adjacent code changed since the last 22/22 baseline).

## Unresolved questions

- None.
