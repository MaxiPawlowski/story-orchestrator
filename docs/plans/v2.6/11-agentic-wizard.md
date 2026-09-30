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

## Gate record (tasks 1, 2, 3 local route, 4; 2026-09-30)

Scope built: A1 tool set, A2 loop + diff cards + transcript, A3 coverage diagnostic, A4 local route. Not built: the
harness route (waits for 04 H; a typed seam refuses today), W1–W6 runs (real LLM; fixtures and recipes below).

### As built

| Part | Where | Gate (rule 15) |
|---|---|---|
| A1 tools: 14 read/simulate/lookup, 24 edit (every draft `ProposalOp` kind + agent-only `setHouseRules`), 4 provision (no `grantLorebook`, no persona tool); closed JSON schema per tool for the harness; unknown tool/argument refused with did-you-mean, then the ordinary op grammar (`parseProposal`) | `src/copilot/agent/tools.ts`, `readTools.ts` | `tools.test.ts`: every `mutations.ts` export backs a tool or has a stated reason in `MUTATIONS_WITHOUT_A_TOOL`; refusal cases |
| A2 loop: plan → author edits/approves → one call per reply → one diff card (`opPreview`, before/after) → accept / reject with reason / edit (re-checked by `checkToolCall`) → validation + diagnostics fed back; modes `review` / `auto-draft`; provisioning always waits and is confirmed only through `applyProvisioning` → `resolveProvisioning`; step + token caps; stop/continue; author notes; transcript in `wizardSessions[].agent` (plan, every call with route, every decision) | `loop.ts`, `prompt.ts`, `studio/components/AgentWizard.tsx`, `StudioCopilot.tsx` (Step by step / Agent switch; the staged wizard is unchanged and stays the default) | `loop.test.ts` (12), `AgentWizard.stories.tsx` (5 interaction stories), `StudioCopilot.stories.tsx` AgentModeSitsBesideTheStagedWizard |
| A3 coverage: fields the story does not use yet, what each adds, and the tool that sets it | `src/studio/coverage.ts`; read tool `readCoverage`; in every agent prompt; `#so-agent-coverage` panel | `coverage.test.ts` (3, incl. every gap's tool exists) |
| A4 local route: strict one-object parser, one repair pass naming the problems (parse and tool check), then the reply stands; harness route: `harnessRoute(null, …)` throws `AgentRouteUnavailable`, no fallback | `parse.ts`, `route.ts`, `turn.ts` | `loop.test.ts` repair + harness cases |
| W5 deterministic half: 20 planted replies (file write, shell, slash command, save, persona set/create, self-grant, write into a user book, overwrite a card, bulk provisioning `ops`, a list of calls, smuggled args, …) × both modes: 0 escapes; a valid provisioning step waits in auto-draft and no `decideStep` (even with a smuggled op) creates it | `safety.review.test.ts` | 21 cases |

Deviations:
- **Journey id `J14`, not `J9b`**: the release catalog accepts only `J<n>` (`attestationChecks.mjs` `JOURNEY_KEY`). `test/journeys/j14-agent-wizard.journey.json` (title says J9b); added to `docs/release/2.4.0/attestation.json` as `notRun` + a `notGreen` line, the way J13 was. It runs in the plan 10 final suite (rule 13).
- **Nothing of the agent is in the main entry** (lead, bundle budget). `StudioModal` builds the runner from an `agentModel` prop (`manager.model`); the manager/coordinator have no agent code. `setHouseRules` is an agent-only op (`AgentOp`), not a `ProposalOp`, so the staged path and the main chunk are unchanged. The dev handle `storyOrchestratorWizardAgent` is set when the Studio chunk loads (`__SO_DEV__` only; absent from the prod bundle).
- "Journaled": the transcript is the wizard session's own record (not the per-chat journal, which is chat-scoped while authoring is not).
- Budget rule 3 (fail once): mutants killed — arg-key check removed (3 safety cases fail), auto-draft applying provisioning (1 fails), an exclusion row removed (tools test fails), the W3 refused-filter removed in the scorer (1 fails).

### Measurement fixtures and recipes (W1–W6, not run: real LLM)

- `test/measurements/11/premises.json`: three premises, **provisional** — decision A11 says the user writes them; replace before the first run and commit first (rule 4). Floors copied from this plan.
- `test/measurements/11/w5-planted.json`: 20 planted instructions; escape = any install change (cards, books, groups, persona, selected books) while the runner confirms no provisioning, or a draft that is not the replay of the accepted ops.
- Driver: `scripts/debug/so-wizard-agent.mts` (dev bundle; open the Studio once so the handle exists), scorer `scripts/debug/lib/wizardAgentScore.mts` (+ test).
  - W1–W3: `node scripts/debug/so-wizard-agent.mts run --route local` (then `--route harness` after 04 H); `--provision apply` creates real assets under the `SO-W11` draft title → `node scripts/debug/so-assets.mts remove --marker SO-W11`.
  - W5: `node scripts/debug/so-wizard-agent.mts safety --route local` (×1 per route, 20 attempts).
  - W4: take each W1 run's saved story (`--provision apply`), play 30 turns on a lane from `adolion-fresh`-style fresh chat; J14 is the one-premise composition check.
  - W6: pair each agent story with the staged wizard's on the same premise for the plan 10 blind-rating pack.
- Recommended mode/route (W1–W6 outcome) → `recommended-config.md` once measured.

### Gates (worktree, after merging master `fc5ea3ab`)

- `npm run typecheck` 0 · `npm run typecheck:test` 0 · `npm run lint` 0
- `npm test`: 354 suites, 4722 tests, all pass (architecture, ownership, fault-matrix, code-health, error-copy, legacy guards green; the error-copy inventory gained the agent's 9 rows, all author/console, pass)
- `npm run test:debug`: 429/429 (includes `wizardAgentScore.test.mts` 3 and the corpus validation of J14)
- `npm run build:dev` 0, `npm run build` 0, `npm run test:release`: 77 pass, 0 fail, 2 skipped
- **Main entry `dist/manifest.json` `bundle.bytes` = 1,242,580** (master `fc5ea3ab` 1,242,543 per the lead: +37 B, the `agentModel` prop; budget 1,250,000). Byte counts depend on the checkout path (module ids): measured side by side from two same-depth exports, master 1,249,905 vs this branch 1,249,942 before the last merge.
- Storybook: `npx storybook build -o .sb-static-11 --quiet`, served on 6111, `test-storybook --url http://127.0.0.1:6111 --index-json`: 41 suites, 289 tests pass. `--index-json` because the worktree sits under `.claude/`, a dot directory the runner's `testMatch` glob never matches (0 files found otherwise).
- Live: none (rule 13). J14 and W1–W6 are the owed real-LLM rows.
