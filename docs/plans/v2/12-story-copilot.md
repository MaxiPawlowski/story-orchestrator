# Plan 12 — Story Copilot (Authoring + In-Play Driver)

## Objective

Two assistant surfaces: (a) an **authoring copilot** that turns a premise into a proposed format-2 story draft — qualities, rubrics, checkpoints, gates — applied through staged proposal/diff review into Studio; (b) an **in-play driver** panel that reads the live blackboard/canon and helps steer the story forward on demand.

## Context

- Spec: this plan implements the user-requested assistance layer on top of the spec (no spec section owns it; it must respect all spec invariants — especially: regex/assistant never writes state except through declared paths).
- Consumes from 11: `src/studio/mutations.ts` (typed draft mutations), draft model, diagnostics (proposals validated before offer). From 03: memory-LLM client, forced-extraction path. From 05: generator prompt utilities where reusable. From 02: `/cp activate` (manual advance), effects. From 09: `getCanon()`.
- **Pattern bases**: [ST-Copilot](https://github.com/Supker/ST-Copilot) (MIT) — OOC assistant window separate from the RP narrative, **proposal + diff-review before apply**, context pickers; [MultihogDnDFramework](https://github.com/MultihogAurelius/SillyTavern-MultihogDnDFramework) (MIT) — narrative-hooks, world-progression reports. Patterns and selective code lifts (MIT-compatible), not vendoring.

## Scope

**In**: copilot chat panel (authoring mode in Studio, driver mode in drawer), staged proposal pipeline with diffs, driver actions (below), prompt set, eval-light golden tests for proposal parsing.
**Non-goals**: auto-pilot (driver never acts without a click), character-card/lorebook management (ST-Copilot features out of scope), voice/vision.

## Deliverables

**Authoring copilot** (Studio tab):
- Conversation panel on the memory LLM. Staged flow, each stage a reviewable proposal applied via `mutations.ts`: premise + questionnaire → (1) quality set w/ rubrics → (2) anchor checkpoints w/ objectives + snapshots + tension targets → (3) transitions w/ gate trees + stub placement → (4) effects/cast suggestions. Free-form chat between stages ("make act 2 darker") produces incremental proposals.
- Proposal format: strict JSON parsed against schema (01) + diagnostics (11) *before* being offered; invalid → auto-retry once with errors quoted, then shown as failed.
- Diff review UI: per proposal, added/changed/removed entities with accept-all / per-item accept (ST-Copilot's lorebook-proposal pattern); applied items land in the draft undo stack.

**In-play driver** (drawer tab):
- Context: live blackboard, active checkpoint + unmet gates, upcoming anchors + progress, `getCanon()`, recent chat window.
- Actions (each one click, all through existing declared paths): **Suggest** — 2-3 next-development suggestions w/ rationale (display only); **Nudge** — inject a one-shot steering note (own `setExtensionPrompt` key, cleared after next generation) from a suggestion; **Probe** — force a targeted extraction (03's P0 path) for chosen qualities; **Advance** — manual checkpoint activation (02's `/cp activate` semantics) with confirmation; **Report** — world-progression style summary (DnD-framework pattern) of where the story stands.
- Driver writes NOTHING to the blackboard directly — Probe goes through extraction, Advance through the manual path, Nudge only steers prose.

Tests: proposal-parse goldens per stage (valid/invalid); mutation-application unit tests (proposal JSON → expected draft state); driver action wiring tests (Probe schedules P0, Nudge sets+clears key).

## Implementation notes

- Authoring prompts should embed the format-2 schema summary + the closed-vocabulary discipline (qualities it proposes must include rubric questions — reuse spec §Extractor hardening language).
- Stage prompts get current draft JSON (compact) so later stages stay consistent with accepted earlier stages.
- Keep both panels fully optional: extension works identically with copilot disabled (settings toggle).

## Validation gate

1. Baseline green; proposal goldens + mutation tests pass.
2. Live Playwright: premise → accept all four stages → resulting draft has zero diagnostics → save → load in chat → story runs (first mechanical/extractor gate fires).
3. Driver live: open panel mid-play → Suggest returns suggestions citing real blackboard values; Nudge visibly steers next reply (note in Gate record); Probe produces an audit-logged P0 read; Advance moves checkpoint with effects.
4. Toggle off → no panels, no behavior change.

## Delegated decisions

Panel placement/UX; stage prompt wording; suggestion count; whether driver Report reuses canon text or its own summary call.
