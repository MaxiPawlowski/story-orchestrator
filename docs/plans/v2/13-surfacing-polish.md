# Plan 13 — Surfacing, Polish, Final Validation

## Objective

Finish the author/user surface (v2 macros, WI/AN cadence polish, debug panels), refresh all project docs to v2, optional budget auto-tune, packaging pass — then run the spec's **Success criteria** as the final gate for the whole build.

## Context

- Spec: §Success criteria (the checklist), §ST integration (WI/AN cadence), remaining loose ends recorded in Gate records of plans 01–12 (read them all first).
- Consumes: everything. `MacrosParser` already wrapped (`stHost/context.ts`).

## Scope

**In**: macros, cadence/injection final pass, debug panel polish, docs refresh, `.claude` rules refresh, auto-tune (optional), packaging, success-criteria run.
**Non-goals**: new features. Anything discovered here that isn't polish becomes a logged follow-up, not scope.

## Deliverables

- **Macros** (registered via `MacrosParser`, auto-updated): `{{story_title}}`, `{{story_description}}`, `{{story_current_checkpoint}}`, `{{story_past_checkpoints}}`, `{{story_possible_transitions}}` (gate texts via `renderGateText`), `{{story_blackboard}}` (absorbed from plan 02), `{{story_tension}}`, `{{story_canon}}`, `{{story_player_name}}`, `{{story_role_<role>}}` per roster, per-tier memory macros (`{{story_memory_facts}}`, `{{story_memory_arcs}}`, …) for custom placement (Smart-Memory pattern).
- **Memory slash commands**: `/so-mem list|pin|exclude|backlog` alongside `/cp` (pin/exclude wiring exists from plan 07).
- **Cadence polish**: audit every injection writer (AN, WI, extension prompts, private blocks) for write-on-change discipline and depth collisions; consolidate injection-key registry in one module.
- **Debug panels**: unify drawer debug tabs (blackboard w/ evidence, memory tiers, scheduler queue, extraction audit, expansion cache) + `so-state.mjs`/`so-ui.mjs` final shape; payload-inspector view showing the exact injected prompt blocks per generation (ST-Copilot pattern).
- **Away recap** (Smart-Memory pattern): on reopening a chat after a long gap, one popup summarizing story position (active checkpoint, open arcs, canon excerpt).
- **Budget auto-tune** (optional, keep small): observe trim pressure per tier over a session; suggest budget adjustments in settings (suggest only).
- **Docs refresh**: v1 docs were already removed during the repo move — verify none linger; write `docs/architecture-v2.md` (current source layout + data flow, concise); polish `.claude/CLAUDE.md` + `.claude/rules/*` (skeleton-refreshed in 03a) to final v2 reality; reconcile the build-session root artifacts (`FEATURE_SPECS.md`, `agents.md`, `notes/`) — fold anything load-bearing into the docs, delete the rest; README with Smart-Memory/ST-Copilot/MessageSummarize attribution + AGPL note. Plan docs live under `docs/plans/v2/` — keep references consistent.
- **Packaging**: `npm run build` production; manifest review; version bump; storybook build not required to pass but must not be broken.

## Final validation — Success-criteria run

Assemble one long fixture + one live session and check every spec §Success criteria item as an assertion or recorded observation:

| Criterion | How |
|---|---|
| Early fact constrains late narration; supersession clean | long-fixture replay assertions (08) re-run |
| Every anchor reached, none skipped; bounded convergence | 06 fixtures re-run + live story completion |
| ≥ half of planted arcs resolve; resolutions advance convergence | 09 fixture + live |
| Delta suite live accuracy | suite-A `LIVE=1` exact-match ≥ 90% (default, user-tunable) over a ≥20-fixture corpus; compare against 03's Gate-record baseline |
| Epistemic perspective accuracy | 10 fixtures re-run + live prompt capture |
| Smoothed tension fits shape above threshold | 04 fit metric on the long fixture |
| Critic ≤ 2 rounds ≥ 85% of generations (default, user-tunable); arithmetic always verifies | 05 metrics re-measured |
| Response path AI-free at steady state; effects at boundaries | 08 queue-flood test + live timing spot-check |

Record the full matrix in this plan's Gate record — this is the project's acceptance record.

## Validation gate

1. Baseline green across the whole repo; all prior plans' suites still pass (full `npm test`).
2. Success-criteria matrix complete, all rows green or explicitly waived by the user.
3. Fresh-clone check: `npm ci && npm run build` works; extension installs into ST and a bundled example story (ship one polished format-2 example in `examples/`) runs end to end.

## Delegated decisions

Macro naming final call; example story content; auto-tune inclusion (skip if time-boxed out — record).
