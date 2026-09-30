# Plan 11 — Agentic wizard: an author's assistant that edits the story with tools, one reviewed step at a time

**Status: DRAFT 2026-09-30, awaiting user approval. Nothing here is built.**

User answer (overview Q7, 2026-09-30): the wizard "should propose as many things as possible, and be able to edit the
story with tools, sequentially, like claude code".

## Today

- The wizard is five fixed stages over `COPILOT_STAGES`: premise, turning points, characters, setup, provisioning. Each
  stage is **one** model call that returns a staged proposal (`ProposalResult`). The author accepts or rejects items;
  `applyOp` applies them.
- Provisioning ops (cards, lorebooks, groups) are create-only and validated by `src/wizard/provisioning.ts`, and are
  never reachable by bulk accept (architecture invariant).
- All Studio edits go through the typed `src/studio/mutations.ts`: 35 exports, covering quality, checkpoint,
  transition, gate, roster, effects, arc bridges, requirements, stagecraft, scene read, lore select and house rules.
  That file was written as "plan 12's copilot contract" and is already a tool surface in all but name.
- Harness routing (v2.5 plan 13, built in v2.6 04) routes the `authoring` role to a local profile or to a CLI harness
  (Claude Code, Codex, opencode).

## Design

### A1 The tool set (typed, no free-form writes)

| Tool family | Backed by | Kind |
|---|---|---|
| read: story, checkpoint, graph, diagnostics, validation, qualities in use, gate options | `draft.ts`, `diagnostics.ts`, `validate.ts`, `qualityUsage.ts`, `gateOptions.ts` | read |
| edit: every `mutations.ts` export | `mutations.ts` | draft write |
| simulate: gate replay over a scripted transcript; graph reachability | `studio` gate replay (v2.5 07 A3), `generation/paths.ts` | read |
| look up: ST cards, lorebooks, groups, backgrounds (names and summaries only) | `stHost/*` through STAPI | read |
| provision: create a card, lorebook, entry or group | `wizard/provisioning.ts` | create-only; always its own review card |

A tool call is JSON matching a schema generated from the mutation signatures. An unknown tool or argument is refused
with a did-you-mean hint (the scenario-vocabulary pattern).

### A2 The loop

1. **Plan.** The agent states the steps it intends. The author can edit the plan or say go.
2. **Step.** One tool call, then one diff card: the Studio's `diffProposal` over one op. The author can accept, reject
   (the reason goes back to the agent) or edit.
3. **Check.** After every accepted write, diagnostics and validation run and their output goes back to the agent, the
   way a test run goes back to Claude Code.
4. **Repeat** until the plan is done, the author stops it, or the budget is spent (a step cap and a token cap).

- **Modes:** `review` (the default: every write waits for the author) and `auto-draft` (writes to the draft go through,
  and the author reviews the whole diff before saving). **Provisioning always waits, in every mode.** Saving to the
  library is always the author's click.
- **Transcript:** a wizard session keeps the conversation, the plan, every tool call and every decision. It is resumable
  (the existing `wizardSessions`, cap 8) and journaled.

### A3 "Propose as many things as possible"

The agent is prompted to cover the whole story model, not the five stages. That includes:
- per-checkpoint objectives, gates and agency policy;
- motives per member and checkpoint (v2.6 06 A);
- chapters (07);
- lore select, house rules, chance rolls (SP7.b), complications (if SP6 is included) and backgrounds;
- sprites and image cues (the sprite stage);
- requirements and provisioning.

**Coverage** is a diagnostic: "fields this story does not use yet, and what each would add". The agent reads it, and so
can the author.

### A4 Routes

- **Local profile** (today's `authoring` role): tool calls go through a strict line or JSON parser with one repair pass,
  like the stage calls.
- **Harness** (Claude Code / Codex / opencode via 04 H): tools are exposed to the harness as an MCP server over the
  harness plugin, the tool-isolation pattern from v2.5 plan 13 Phase 0.
  - The harness gets **only** these tools: no shell and no file system.
  - This depends on 04's H1–H4 and on that phase's isolation result.
- Every route keeps plan 13's rules: no silent fallback, and each call is recorded with its route.

### A5 What stays true

- Create-only provisioning, validated at the write edge. A prompt cannot widen it.
- No write outside the draft until the author saves, and the save goes through `onSaved` (the runtime decides whether a
  chat takes it).
- Personas are never provisioned.
- Wizard asset cleanup (`so-assets.mts`) keeps working. The ledger records every asset the agent creates.

## Measurement (predeclared; decides the default mode and the recommended route)

| # | Leg | Floor |
|---|---|---|
| W1 | Tool validity: calls that parse and validate on the first try, per route | ≥ 0.9 harness, ≥ 0.75 local |
| W2 | Story validity: stories that the agent finishes pass `validate` with 0 errors | 1.0 |
| W3 | Author effort: accepted / proposed ops across 3 premises (the v2.5 A11 wizard premises) | ≥ 0.6 |
| W4 | Playability: each generated story plays 30 turns on a lane (J-style, real LLM) with ≥ 2 transitions and no stall | 3 of 3 |
| W5 | Safety: a planted prompt asking for a write outside the tools, a provisioning bulk-accept or a persona is refused | 0 escapes over 20 attempts per route |
| W6 | Quality: blind-rating pack (overview rule 11), agent story vs today's staged wizard on the same premise | agent preferred ≥ 60 % |

## Tasks

1. The tool schema generated from `mutations.ts`, the read tools, the refusal path (jest).
2. The loop, diff cards and session transcript (Studio Wizard tab; Storybook stories + interaction tests).
3. The local route, then the harness route (after 04 H).
4. Coverage diagnostic.
5. W1–W6 on lanes. The recommendation goes to `recommended-config.md`.

## Gates

The pure/UI tier runs typecheck, lint, test, `test-storybook:ci` and build. Live: J9 (the wizard journey) keeps passing
on the staged path, and a new J9b drives the agent through one premise to a saved story, ×1 here and ×2 in plan 10.
Each run cleans up with `so-assets.mts`.

## Unresolved questions

None yet. The default mode (`review` vs `auto-draft`) and the recommended route come from W1–W6.
