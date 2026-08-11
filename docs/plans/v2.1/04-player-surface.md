# Plan 04 — Player surface

## Objective

Make the default (player) surface a single narrative view a story's *player* could be handed without spoilers or steering controls, with an honest working/stalled/dead status — and move everything else behind author view. This is D1's visible half: the player experiences the story; only the author inspects the machine.

## Context

- Spec addendum §Personas, §Stall surfacing. Findings U3 U4 U5 U8.
- Current state: Memory tab (player-visible) renders epistemic incl. `hiding from X`, ledger, arcs internals, superseded/folded strikethroughs (`DrawerTabs.tsx:236-320`); DriverPanel appended under every tab when copilot on, its Advance select lists all checkpoints by name (`DrawerTabs.tsx:430`, `DriverPanel.tsx:98`) — only `unmetGates` was author-gated; reconciliationEvents persisted but rendered nowhere; away recap is the only narrative composition (`awayRecap.ts:37`) and fires only after 8h; status strings use checkpoint ids; `/cp` is a positional mini-language exposing debug verbs (`slashCommands.ts`).
- Consumed: plan-03 snapshot (driver/ledger now in-snapshot, easy to gate), plan-02 settings homes, plan-01 J3 spoiler checklist + human rubrics.

## Scope

In: drawer player mode redesign, spoiler audit + gating, stall/dead-pipeline signal, HUD tweak, player-language pass, slash regroup, first-run surfacing.
Non-goals: author-view redesign (only reorganize what moves into it); Studio (plan 05); removing any capability — everything gated, nothing deleted.

## Deliverables

- **Player Overview = the recap composition, always on** (promote `buildAwayRecap`'s shape to the standing view; away popup becomes the same component shown modally after a gap): Now (checkpoint name + objective, narrative voice) · Recently (last transition) · Open threads (arc texts) · Story so far (canon excerpt) · Pending ("N things noted, apply next turn") · Status line. Persona tags: all `player`.
- **Spoiler checklist applied** (the J3 checklist becomes a per-element table in this plan doc, each row `player`/`author`):
  - Author-only: Blackboard/Scheduler/Payload tabs (already), epistemic panel, ledger panel, arc internals (pin/remove/superseded/folded mechanics), boundary numbers, convergence bars (they leak anchor names + distance), DriverPanel entirely (Suggest/Nudge/Probe/Advance/Report are steering — D1), unmet gates, `possible_transitions` surfaces.
  - Player-kept: memory facts curation (pin/edit/exclude — established facts only, no evidence-tier internals beyond the quote tooltip), open-arc *texts*, canon, tension level, flag-moment (plan 01).
- **Stall signal (U5)**: snapshot gains `pipeline: {state: "working" | "reading" | "stalled-rechecking" | "idle" | "not-configured" | "error", detail?}` derived from scheduler + reconciliation events + settings; player renders calm copy ("re-checking recent scenes…"), HUD gets a subtle chip for `stalled-rechecking` / `not-configured` / `error`; author view keeps full reconciliation detail (first render of `reconciliationEvents`).
- **Language pass (U8)**: every player-visible string uses checkpoint *names*, never ids (`Advanced to ${name}`); status strings humanized; transition `/comment` unchanged (already name-based).
- **Slash regroup**: `/cp` keeps full surface but is documented author-only; `extract`/`expand` clearly marked debug in help. New player-safe `/story` (or `/so`) with `recap | threads | flag [note]` — named-arg style via ST's enum providers, outputs the narrative composition. (`/cp memorize` alias dropped in help text, kept functional.)
- **First-run surfacing (U6 residue)**: when `not-configured`, player Overview and HUD deep-link the one missing step (profile pick) — no wizard build, just honest pointing (plan 02 made config global so there is exactly one place).
- Tooling: `so-ui` verbs for pipeline chip + player/author assertion (`assert-player-clean` = runs the spoiler checklist selectors); journeys J3 updated to assert the checklist automatically where DOM-checkable.

Exports: `pipeline` snapshot slice, spoiler checklist (versioned in test-plan.md), `/story` command.

## Implementation notes

- One components rule: player and author views share components where content is identical (canon, arcs list) — author view *adds*, player view never conditionally reveals.
- Convergence: hide entirely from player (progress toward a named future anchor is a spoiler by construction). Tension: level word only, no numbers.
- Copy: calm, diegetic-adjacent, no jargon ("checkpoint" is fine; "boundary"/"extraction"/"scheduler" are not) — the rubric in plan 01 scores this.
- `a11y.js` role rewrite gotcha applies to any new tab/buttons — selectors per gotchas rule.
- Memory curation stays player-visible per addendum; exclude-undo toast pattern kept.

## Validation gate

Harness: baseline + Storybook for new/changed components (player + author mode stories per component). Live journey gates (fresh-start, real LLM): **J3 green including automated spoiler checks**; induced-stall segment shows the player signal and clears; J1 regression (not-configured state now actionable); J4 regression (recap popup = same component). **Human-eval**: one J3 session scored on the plan-01 rubric by the user, journal + rubric filed in the Gate record — this plan's gate is not green on automation alone (D2).

## Resolved decisions (user, 2026-08-11)

- Player sees the tension **level word only** (no numbers), display-toggleable.

## Delegated decisions

- `/story` vs `/so` command name; exact player copy.

## Unresolved questions

- Should "Author view" toggle require confirmation with a spoiler warning when the chat isn't the author's own story? (Cheap; leaning yes.)
