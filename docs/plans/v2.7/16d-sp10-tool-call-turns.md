# Plan 16d — SP10 tool-call turns

**Status: SEED from v2.6, not approved.** Split out of `16-spike-defers.md` (2026-10-03). Plan 02 row **C5** points here
for SP10. Overview: `00-overview.md`.

## What it is

- With Chat Completion function calling on, a model can call a tool mid-reply. ST then renders the text before the call
  as a reply, adds a tool-invocation message, and generates again (the continuation). One player turn becomes two or more
  rendered replies (`v2.5/09-sp10-spike-report.md:13-26`).
- Our runtime commits a turn boundary at each rendered reply. So one player turn can commit several boundaries (tension
  EMA steps, extraction cadence counts, one transition each), and per-generation work (warden note, lore select, private
  epistemic swap, talk decision) may run once per step (`v2.5/09-research-spikes.md:264-266`).
- Extensions that bring tools: TunnelVision (main-model lore tools), MCP Client, Timeline Memory
  (`v2.4/extension-research/SUMMARY.md:89,121,123,188`).
- SP10 asked whether to **fold** a tool chain into one boundary, or to document the inflation.

## History and evidence

Bars (v2.5, never retuned; `v2.5/09-research-spikes.md:276-278`):

| # | Condition | Pass |
|---|---|---|
| Q1 | Inflation measured | boundaries per player turn and per-depth work counts recorded, ×2 |
| Q2 | Fold needed | > 1 boundary per chain, or any per-generation work twice per chain; neither → document only |
| Q3 | Fold safe | rollback ≡ replay (jest, 4 seeds) and J6 green ×2 |

| When | Leg | Result | Citation |
|---|---|---|---|
| v2.5, jest | Q3 | **FAIL**. Fold off: 0 divergent of 23,066 (chat, cut) pairs. Fold on: **2,684 divergent**, every one a cut at a tool-invocation message. The fold removes the intermediary reply's snapshot that a rollback needs; no fold rule can restore it | `09-sp10-spike-report.md:3,67,69-79` |
| v2.5 | — | fold code removed under rule 2; report, fixtures and the dev-only Q1 probe kept so Q1/Q2 can still document the inflation | `:3-11` |
| v2.5 | Q1/Q2 | never run | `:65-66` |
| v2.5 seed | — | fold the per-boundary **work** only (keep the intermediary's boundary and snapshot, skip its cadence/tension work); would not touch rollback ≡ replay; never measured | `:81-83` |
| v2.6 | all | **not run**. The D3 corpus (20 recorded CC function-calling turns) was never built; the campaign `lab/` has no tool-call directory | `v2.6/02-data-gaps.md:35`; `v2.6/03-spike-reevaluation.md:38`; `v2.6/14-review-pack.md:449` |

Already handled, outside SP10: deleting a reply also deletes the tool-invocation messages before it, and the runtime
decodes that multi-message delete correctly (v2.4 plan 01 T1, `4ecafef1`; red fixture
`test/scenarios/v24-01-toolcall-run.json`). The fold-off control above is that path: rollback ≡ replay holds today.

Reach: tool calls need `main_api === 'openai'` and function calling on (ST `tool-calling.js:414-417,614-620`, per
`09-sp10-spike-report.md:25`). The play profile is a Text Completion Artemis profile (README §Tested on). Whether the user
or a target player runs Chat Completion with tools: not determined.

## Why it was deferred

- No data: D3 was not built.
- Q3's fold already failed; the work-only fold has no measured need (Q2 never ran).
- Narrow reach: CC + function calling + a tool-bearing extension, none of which the tested setup uses.

## Current state in code

Verified on master `f0e62687`.

| Piece | Where |
|---|---|
| Q1 probe | `src/runtime/spikes/toolTurnProbe.ts` (70), `toolTurnSummary.ts` (128), tests beside them; loaded by `if (__SO_DEV__)` at `src/runtime/index.ts:83` (`storyOrchestratorToolTurnProbe`) |
| Q1 fixture | `test/scenarios/v25-09-tool-turn.json`; Q3 fixture `test/fixtures/v25-09-tool-fold.story.json` (its property test was removed with the fold) |
| Fold | removed; no flag |
| Dev-only guard | `src/runtime/devOnly.guard.test.ts:25-26` |
| README | no mention of tool calling (grep "tool" over `README.md`: only the dev tooling line, `:205`) |
| Prod cost | none |

## Options

| | Option | Cost | Needs |
|---|---|---|---|
| A | Build D3 (20 CC function-calling turns), run Q1/Q2 ×2 as documentation, and only if Q2 says needed, a new spike "fold the work, keep the boundary" with its own rollback ≡ replay bar | M | a CC profile with tools on the pod (`enable_thinking: false` kwargs, `.claude/rules/gotchas.md`); a tool-bearing extension or `/tools-register` dummy |
| B | **Document only**: a README note | S | — |
| C | Remove the Q1 probe, its tests and `v25-09-tool-turn.json` | S | — |

## Proposal (B + C)

**README note.** Add to `README.md` §Extraction timing (after the cue paragraph, `:177-183`):

> **Tool calling.** With Chat Completion function calling on (for example an extension that gives the model tools), one
> player turn can render a reply, a tool call and a continuation. Each rendered reply is its own turn boundary, so one
> player turn can move the story's tension and extraction cadence more than once and fire one transition per step.
> Swipes, edits and deletes still roll back correctly, tool-call messages included. Not measured: how much this changes
> pacing in play. If a story feels rushed with tools on, compare a turn with tools off and report it.

Every claim in it has a source: boundaries per rendered reply (`09-sp10-spike-report.md:19`), rollback with tool messages
(`:67` fold-off control; `4ecafef1`), "not measured" (Q1/Q2 never ran). No claim about per-generation work running twice:
that is Q2's question and was not measured.

**Remove the probe** (C): `toolTurnProbe.ts`, `toolTurnSummary.ts`, their tests, the `index.ts:83` import,
`test/scenarios/v25-09-tool-turn.json`, `test/fixtures/v25-09-tool-fold.story.json`; add both modules to
`DROPPED_SPIKES` with a planted-import control. The v2.5 report stays as history, and its Q1 procedure (`:30-39`) is the
recipe if SP10 reopens. Keep `v24-01-toolcall-run.json` (it guards the delete decode, not SP10).

**What reopens it (any one):** the user or a target player plays story chats with CC + tools; a session finding shows a
tool chain committing several boundaries in one player turn and the pacing or a transition going wrong because of it;
a tool-bearing extension becomes part of the tested setup. Then option A, starting with D3.

## Recommendation

**B + C.** No known user on CC + tools, the fold failed its invariant, and the work-only fold has no measured need. The
note tells a player what to expect; the probe is dead code until someone has the data.

## Decisions for the user

1. Do you, or a player you target, use Chat Completion with function calling (TunnelVision, MCP Client or similar) in
   story chats? **Recommended: if no, take B + C.** idk, if we do, lets handle this now. If we dont, lets defer until next version and take B + C
2. The README note as drafted above? **Recommended: yes.**
3. Remove the Q1 probe now rather than keep it dev-only? **Recommended: yes; the v2.5 report keeps the recipe.**

## Floor and measurement before building

Only if reopened (option A):

- Q1/Q2 on ≥ 20 recorded CC tool turns, ×2 consecutive on one lane, run header diff around the batch.
- Any new fold (work-only): conditions restated first; rollback ≡ replay over 4 seeds with a fold-off control at 0
  divergent; then J6 ×2.

## Gates

- B: docs only, none.
- C: `npm run gates` (`devOnly.guard.test.ts` with the planted-import control for the two removed modules).

## Links

- 16 index; 16a SP5, 16b SP6, 16c SP1.
- 01 docs and in-app guidance: the README split and Help panel may move this note (its feature registry entry: none, it
  is a host-interaction note).
- 10 model choice: a switch to a CC profile would change the reach question.
