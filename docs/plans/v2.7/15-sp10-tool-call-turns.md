# Plan 15 — SP10 tool-call turns

**Status (2026-10-03): v2.7 plan 15 (was old v2.7 16d, split out of the removed 16 index). APPROVED: B (guide note) +
C (remove the Q1 probe), not built. Option A is deferred to `v2.9/05-deferred-items.md` §05.2.** v2.7 02 row C5 points
here for SP10. Overview: `00-overview.md`.
**Gate tiers** (v2.7 overview §Gate taxonomy): implementation D; acceptance D. Model input: none.

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
| v2.5, jest | Q3 | **FAIL**. Fold off: 0 divergent of 23,066 (chat, cut) pairs. Fold on: **2,684 divergent**, every one a cut at a tool-invocation message. The fold removes the intermediary reply's snapshot that a rollback needs; no fold rule can restore it | `v2.5/09-sp10-spike-report.md:3,67,69-79` |
| v2.5 | — | fold code removed under rule 2; report, fixtures and the dev-only Q1 probe kept so Q1/Q2 can still document the inflation | `:3-11` |
| v2.5 | Q1/Q2 | never run | `:65-66` |
| v2.5 seed | — | fold the per-boundary **work** only (keep the intermediary's boundary and snapshot, skip its cadence/tension work); would not touch rollback ≡ replay; never measured | `:81-83` |
| v2.6 | all | **not run**. The D3 corpus (20 recorded CC function-calling turns) was never built; the campaign `lab/` has no tool-call directory | `v2.6/02-data-gaps.md:35`; `v2.6/03-spike-reevaluation.md:38`; `v2.6/14-review-pack.md:449` |

Already handled, outside SP10: deleting a reply also deletes the tool-invocation messages before it, and the runtime
decodes that multi-message delete correctly (v2.4 plan 01 T1, `4ecafef1`; red fixture
`test/scenarios/v24-01-toolcall-run.json`). The fold-off control above is that path: rollback ≡ replay holds today.

Reach: tool calls need `main_api === 'openai'` and function calling on (ST `tool-calling.js:414-417,614-620`, per
`v2.5/09-sp10-spike-report.md:25`). The play profile is a Text Completion Artemis profile (README §Tested on). Whether the user
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
| README / guide | (as of the seed; the README is rewritten since) no mention of tool calling (grep "tool" over `README.md`: only the dev tooling line, `:205`) |
| Prod cost | none |

## Options

| | Option | Cost | Needs |
|---|---|---|---|
| A | Build D3 (20 CC function-calling turns), run Q1/Q2 ×2 as documentation, and only if Q2 says needed, a new spike "fold the work, keep the boundary" with its own rollback ≡ replay bar | M | a CC profile with tools on the pod (`enable_thinking: false` kwargs, `.claude/rules/gotchas.md`); a tool-bearing extension or `/tools-register` dummy |
| B | **Document only**: a guide note (`docs/guide/setup/memory-model.md`) | S | — |
| C | Remove the Q1 probe, its tests and `v25-09-tool-turn.json` | S | — |

## Proposal (B + C)

**Guide note** (review B9: the README was rewritten by v2.7 01, so the note goes to the guide). Add to
`docs/guide/setup/memory-model.md` §When changes apply:

> **Tool calling.** With Chat Completion function calling on (for example an extension that gives the model tools), one
> player turn can render a reply, a tool call and a continuation. Each rendered reply is its own turn boundary, so one
> player turn can move the story's tension and extraction cadence more than once and fire one transition per step.
> Swipes, edits and deletes still roll back correctly, tool-call messages included. Not measured: how much this changes
> pacing in play. If a story feels rushed with tools on, compare a turn with tools off and report it.

Every claim in it has a source: boundaries per rendered reply (`v2.5/09-sp10-spike-report.md:19`), rollback with tool messages
(`:67` fold-off control; `4ecafef1`), "not measured" (Q1/Q2 never ran). No claim about per-generation work running twice:
that is Q2's question and was not measured.

**Remove the probe** (C): `toolTurnProbe.ts`, `toolTurnSummary.ts`, their tests, the `index.ts:83` import,
`test/scenarios/v25-09-tool-turn.json`, `test/fixtures/v25-09-tool-fold.story.json`; add both modules to
`DROPPED_SPIKES` with a planted-import control. The v2.5 report stays as history, and its Q1 procedure (`:30-39`) is the
recipe if SP10 reopens. Keep `v24-01-toolcall-run.json` (it guards the delete decode, not SP10).

**What reopens it:** see `v2.9/05-deferred-items.md` §05.2, the only owner of the reopen trigger and of option A's
recipe and gates (Sol r3 R3-21).

## Recommendation

**B + C.** No known user on CC + tools, the fold failed its invariant, and the work-only fold has no measured need. The
note tells a player what to expect; the probe is dead code until someone has the data. A → v2.9 05.2.

## Decisions for the user

1. Do you, or a player you target, use Chat Completion with function calling (TunnelVision, MCP Client or similar) in
   story chats? **Recommended: if no, take B + C.** idk, if we do, lets handle this now. If we dont, lets defer until next version and take B + C
2. The README note as drafted above? **Recommended: yes.**
3. Remove the Q1 probe now rather than keep it dev-only? **Recommended: yes; the v2.5 report keeps the recipe.**

## Floor and measurement before building

None in v2.7 (B + C need no measurement). Option A's floor and gates live in `v2.9/05-deferred-items.md` §05.2.

## Gates

- B: docs; the guide drift/registry tests stay green (`npm run gates`).
- C: `npm run gates` (`devOnly.guard.test.ts` with the planted-import control for the two removed modules;
  `v24-01-toolcall-run.json` still runs and passes, it guards the delete decode).

## Links

- v2.9 05.2 (option A, deferred); siblings from the removed 16 index: v2.8 16 SP5, v2.8 17 SP6, v2.9 01 SP1.
- v2.7 01 docs and in-app guidance (the guide page holds the note; no feature registry entry: it is a host-interaction
  note).
- v2.7 12 model choice: a switch to a CC profile would change the reach question.

## Review of the answers (2026-10-03)

**Decision 1 ("idk"), answered from the install:** the story chats here run the main reply on a Text Completion
profile, and the roles run on DeepSeek Chat Completion profiles without tools. Nobody uses Chat Completion function
calling in story chats. So: take **B + C now** (the README note and removing the probe), and defer the rest to the next
version. Decisions 2 and 3 are taken as recommended.

## Review 2026-10-03

Applied: B9 (the note targets `docs/guide/setup/memory-model.md`, not the README), the Claude-B note "16d moves to tier 1"
(v2.7, deterministic), option A deferred to v2.9 05.2, B12/F36 (references).

Round 3 (Sol): R3-21 applied.

## Gate record

2026-10-03, branch `worktree-agent-a1eb7b669f3b8ce6a`, code commit `8f850724`. Not merged into master.

| Item | Built |
|---|---|
| B guide note | `docs/guide/setup/memory-model.md` §When changes apply, the note as drafted above, verbatim. No feature registry entry (a host-interaction note, as the plan says) |
| C probe removal | deleted `src/runtime/spikes/toolTurnProbe.ts`, `toolTurnSummary.ts` and their tests, the `__SO_DEV__` import in `src/runtime/index.ts`, its stop call, `storyOrchestratorToolTurnProbe` from `RUNTIME_GLOBALS`, the probe case in `stopRuntime.test.ts`, and `test/fixtures/v25-09-tool-fold.story.json`. `devOnly.guard.test.ts`: both modules out of `SPIKES`, into `DROPPED_SPIKES`, and into the dropped-spike planted-import control (a planted import reaches no module); the SP10 live-probe planted control went with the module |

**Model input (rule 6): none.**

Gates (tier D), all on the branch after the code commit:

| Command | Result |
|---|---|
| `ST_ROOT=C:/dev/SillyTavern-MainBranch npm run gates -- --no-storybook` | all green: typecheck, typecheck:test, lint, test (502 suites passed, 1 skipped; 6141 tests passed, 1 skipped), build, build:dev, test:debug (87 pass, 3 skipped), debug:typecheck, test:release, test:replay, test:plugin; Storybook skipped by the flag and run separately below |
| `npm run typecheck:test` | green (inside the gates run) |
| `npm run storybook:build` (to `.sb-static`), `npx http-server .sb-static -p 6063 -s -c-1 -a 127.0.0.1`, `node node_modules/@storybook/test-runner/dist/test-storybook.js --index-json --url http://127.0.0.1:6063` | 71 suites, 447 tests passed (includes the new `Settings/RoleProfilesGroup` `GroupedBySource` story with its a11y check); server stopped |
| prod bundle `dist/index.js` | 1,117,438 B (budget 1,250,000 B) |

Live gate: **NOT run**. `v24-01-toolcall-run.json` (the delete-decode guard this plan keeps) was not run live; its
16-test-plan row is still owed.

Deviations:
- **`test/scenarios/v25-09-tool-turn.json` is NOT deleted.** The plan lists it; the build brief put `test/scenarios`
  out of bounds (another agent owns it). It now drives a probe global that no longer exists, so a run of it fails at its
  first probe step. `test/findings/suite-decisions.json:446` still cites it. Whoever owns `test/scenarios` deletes the
  file and that suite-decisions row.

Open questions:
- Delete `v25-09-tool-turn.json` and its `suite-decisions.json` row in the `test/scenarios` owner's next change?
