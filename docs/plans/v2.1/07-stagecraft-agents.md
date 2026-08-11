# Plan 07 — Stagecraft agents

## Objective

Take the audit/control role D1 removed from the player and give it to the system: deterministic presentation effects where rules suffice, background curator agents where judgment is needed (World Info, scenario, background, cast — the user's stated direction). v2.1 ships the **design doc + one deterministic effect + one agentic slice**; the full fleet is design intent for v2.2.

## Context

- Spec addendum §Stagecraft (invariants live there: proposals only, boundary-applied, never write blackboard/memory, journaled, author-reviewable, per-curator capability flag).
- Existing machinery to reuse: checkpoint effects pipeline (`effectsApplier.ts`), WI seam (`stHost/worldInfo.ts` — enable/disable/upsert + one-save disable path), memory-LLM scheduler lanes P3/P4, capability profile, canon/arcs read models, session journal (plan 01), compatible-update path (plan 05), plan-06 provisioning-op review pattern + lorebook write path.
- External patterns (00-overview §External-base learnings): ST-Copilot proposal-card conventions (inline edit-before-apply, history hygiene) and patch "first words || last words" boundary syntax for small-model-safe partial WI edits; Smart-Memory `continuity.js` for the continuity warden.
- Consumed: plans 01–06 all. Journeys J3/J5 as regression floor; new journey J8 (stagecraft) defined here.

## Scope

In: design doc covering the curator fleet; `background` checkpoint effect (deterministic); WI curator slice (agentic) behind a flag; J8 journey.
Non-goals: scene-setter and cast-manager curators (designed, not built); music/ambience (no verified host seam yet); any curator authority over blackboard, memory tiers, or transitions — ever (invariant, not scope).

## Deliverables

- **`docs/plans/v2.1/stagecraft-design.md`** — the fleet: per curator (WI, scene-setter, cast/npc tuning, recap narrator, **continuity warden** — checks the latest reply against established facts [card, canon, facts tier, ledger] and emits a one-turn corrective note injected next generation and auto-cleared; Smart-Memory continuity/repair pattern, run on the P2 lane at cadence or scene break, never blocking) — inputs (canon, open arcs, active checkpoint, roster state), outputs (typed proposals), trigger (scene break / checkpoint activation / cadence), lane (P2–P4), veto rules, author-review surface, failure mode (silent no-op, never blocks play). Explicit "deterministic first" test per candidate: if a checkpoint effect can express it, it is not an agent.
- **Deterministic: `background` effect** — `effects.background?: { name }` in schema/validate/Studio EffectsEditor/copilot ops; applied at boundary via verified ST seam (verify `/bg` slash or background API in ST source per the non-negotiable rule; add `stHost/backgrounds.ts`); idempotent, hydrate-safe, rollback re-applies restored checkpoint's background (existing effect discipline).
- **Agentic slice: WI curator** — off-path P4 pass on scene break/checkpoint activation (coalesced): reads canon + open arcs + active checkpoint + current story-lorebook entries; proposes `{enable[], disable[], rewrite[{comment, text}], patch[{comment, anchor, replace}]}` (patch uses the "first words || last words" boundary syntax — safer than full rewrites on small models) scoped **only** to an explicit authored allowlist — new story field `stagecraft?: { lorebooks: string[] }` (schema + validate + Studio field; the plan-06 wizard prefills it with the story lorebook it creates); an empty/absent allowlist means the curator has nothing to write, full stop — never user lorebooks, never inference; strict parse, schema-validated; proposals applied at next boundary through the effects pipeline; every proposal + application journaled; author-view review ring reusing the plan-06 proposal-card component (last N proposals, editable before apply, accept-mode setting: `auto | review | off`, default `review`); capability-flagged (default off until J8 proves it).
- Tooling: `so-scenario` verbs for background assertion + curator proposal/apply; debug-response global `storyOrchestratorDebugCuratorResponse` (unit determinism only, per policy); **J8 stagecraft journey**: play across 2 checkpoints — background switches deterministically; WI curator proposes a coherent change from real canon, author reviews/applies, next generation payload reflects it.

Exports: proposal/apply contract + review-ring pattern (v2.2 curators reuse), `stHost/backgrounds.ts`.

## Implementation notes

- Curator is a coordinator (plan-03 pattern, rule 3: nothing new in `runtimeManager.ts`) + a pure `src/stagecraft/` module (prompt, parse, proposal diff) — same pure/host split as extraction.
- Adding `stagecraft.lorebooks` to the format means plan-05's "complete story authorable in Studio" claim must be extended here: this plan ships the Studio field, the wizard prefill (plan 06), and updates plan-05's completeness table + J2 checks (rule 8).
- Prompt discipline mirrors the extractor: closed vocabulary (entry comments it may touch), evidence expectation, low temp, strict parse with the v2 tolerance lessons (channel-noise strip).
- Scheduler pressure rules apply (P4 coalesces; reply path never waits).
- Rollback: curator applications are boundary-logged like other effects; mutation rollback reverts WI to the pre-boundary entry state (reuse WI write-on-change record in `extras.memory.wiWrites` or extend).
- `review` default keeps the author in the loop until trust is earned — J8 + one real human-eval session decide whether `auto` is defensible as default (record verdict in Gate record).

## Validation gate

Harness: baseline (incl. structural guards + v2 corpus) + stagecraft pure-module suites + Storybook (review ring UI); `test-plan.md` updated with J8 + curator rubric (rule 8). Live journey gates (fresh-start, real LLM): **J8 green** — real curator pass over real play, proposal quality human-scored on the plan-01 rubric; J3/J5 regression floor (curator off *and* on); payload capture proves WI change reached the prompt. If the real-LLM curator pass can't run, gate is not green (standing policy).

## Delegated decisions

- Review-ring UI placement (author drawer tab vs Scheduler tab section).
- Proposal cadence caps; rewrite length budget.
- Whether `background` also becomes a curator input (scene-setter, v2.2) — design doc decides.

## Resolved decisions (user, 2026-08-11)

- Curator scope = explicit `stagecraft.lorebooks` allowlist in the story JSON (deliverable above). No inference from requirements/effects.
