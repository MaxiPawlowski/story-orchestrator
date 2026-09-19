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

## Gate record — 2026-08-13 (automated matrix GREEN; human-eval sessions OPEN)

**Status: NOT fully green.** Everything an agent can prove is proven: the automated matrix is
**J1–J10, 63/63 pass, 0 fail, 0 blocked** under `--strict` with the real model, the register is
evidenced, the harness and the whole v2 scenario corpus are green on the final tree, and the docs are
merged. The two **human-eval sessions are the user's to play and score** (plan deliverable 2, plus the
outstanding J8.4/J9.6/J9.7 rubrics from plans 06/07) — an agent cannot answer "did you always know
where the story was?" honestly. Until those are filed, the v2.1 gate is recorded as **not green**, and
the "≥4/5 on the player rubric, above the plan-01 baseline" criterion has no number on either side.

### Automated matrix (real LLM · gemma4-mtp · headed · fresh-start · `--strict`)

Archived under [`test/journeys/records/v2.1-acceptance/`](../../../test/journeys/records/v2.1-acceptance/)
(matrices, machine records, runner logs, a session-journal export and the selector-sweep proof —
`.debug` rotates, this does not).

| Journey | Baseline (plan 01) | Acceptance | Exit |
|---|---|---|---|
| J1 first-contact | 4 pass · 1 fail · 2 blocked | **7 pass** | 0 |
| J2 author-loop | 2 pass · 4 blocked | **9 pass** | 0 |
| J3 player-session | 5 pass · 1 fail · 2 blocked | **8 pass** | 0 |
| J4 return-and-adopt | 4 pass | **4 pass** | 0 |
| J5 group-direction | 5 pass · 1 blocked | **6 pass** (three consecutive runs) | 0 |
| J6 mutation-storm | 3 pass · 1 blocked | **4 pass** | 0 |
| J7 long-haul | 7 pass · 1 harness fail | **8 pass** | 0 |
| J8 stagecraft | not-runnable | **3 pass** (two consecutive runs) | 0 |
| J9 wizard | not-runnable | **5 pass** | 0 |
| J10 identity-and-settings | (added by plan 02) | **9 pass**, incl. the new J10.11 | 0 |
| J0 runner-selftest | 2 pass · 1 blocked-by-design | **2 pass · 1 blocked-by-design** | 1 under `--strict`, as designed |

J0.3 exists to prove that a missing capability reports `blocked` rather than failing; J0 is the
harness selftest, not part of the acceptance matrix. Asset ledgers came back clean after every run
(`so-assets assert-clean --marker SO-J8 / SO-J9`), and the group roster was restored to
`disabled_members: []` at the end of the session.

### Success criteria v2.1

| Criterion | Verdict | Evidence |
|---|---|---|
| New chat on a configured install advances by real extraction with zero per-chat setup | PASS | J1.2, J1.3, J1.6, J10.6 |
| A story is authorable, playable and mid-play editable without touching JSON, same chat throughout | PASS | J2.1–J2.9 (hot-swap, keep-and-prune, cancel-and-drift) |
| A premise becomes a playable, fully provisioned story without leaving the wizard | PASS | J9.1–J9.5 — real card, group and lorebook created, requirements green, real transition fired |
| The default surface passes the spoiler checklist automatically | PASS | J3.3 (`assert-player-clean`, text needles + selector sweep) |
| …and scores ≥4/5 on the player rubric, above the plan-01 baseline | **OPEN** | human session not run; plan-01 baseline was never scored either, so there is no before-number |
| **D1 enforced**: no steering control reachable in player mode — automated selector sweep, not a visual judgement | PASS | plan-08 sweep over the drawer (every tab), the HUD and the settings panel: driver `aria-label`s, `[data-so="curator-*"]`, `#so-stagecraft`, `#so-edit-story`, `#so-update-story`, `#so-fix-with-wizard`. Non-vacuity proven by `player-selector-sweep.scenario.json`: author view **does** render the swept controls, player mode renders none. `/cp` stays typeable by anyone — documented author-only (plan 04), and no player surface offers it |
| Player-hidden ≠ broken: epistemic private injection, ledger and arcs still work with the surface clean | PASS | J5.6 (rewritten: real epistemic pass, per-speaker blocks, no foreign line, the two blocks differ), J5.5 payload capture |
| Stalled ≠ dead ≠ working — three distinct states, each reachable and correct | PASS | J3.6 (induced stall → `#so-stall-signal`, clears on the real re-read), `so-ui pipeline` |
| A pre-v2.1 chat migrates losslessly | PASS | J10.8 (synthetic) **and** J10.11 (a blob captured verbatim from a real pre-v2.1 chat: both stories survive, id-keyed, checkpoint/boundary/blackboard unchanged) |
| Refactor neutrality: J3/J5/J6 unchanged vs baseline | PASS | J3 8/8 · J5 6/6 · J6 4/4, same event sequence in the archived journal export; plan-03 guards still enforced by `architecture.test.ts` |
| Stagecraft: background deterministic; curator proposal applied and visible in the payload | PASS | J8.1–J8.3, twice |

### Harness (final tree)

```
npm run typecheck         -> clean
npm run lint              -> clean
npm test                  -> 60 suites / 1589 tests passed (1588 before; +the chat-scoped talk-decision test)
npm run debug:typecheck   -> clean
npm run build             -> webpack compiled (2 pre-existing bundle-size warnings)
npm run test-storybook:ci -> 26 suites / 107 tests passed
```

v2 scenario corpus, `--sandbox`, all `ok: true`: `plan02-runtime`, `plan03-extraction`,
`plan03a-edit-rollback`, `plan03a-delete-rollback`, `plan03a-llm-npc-reply`, `plan04-pacing`,
`plan06-convergence`, `plan07-memory`, `plan08-hygiene`, `plan09-arcs`, `plan10-epistemic-ledger`,
`plan12-copilot`, `plan13-surfacing` — **plus `plan05-background-generation`, the corpus's last
known-stale scenario, now fixed and green** (see findings). The corpus is whole again: 14/14.

Live-suite goldens were **not** re-recorded (delegated decision): nothing extraction-adjacent changed
in this plan — the only product change is the talk-decision key — so the 22/22 baseline in
`test/goldens/live/` still describes this tree.

### Findings fixed during the acceptance run

1. **A talk decision could be answered by a different chat's cache.** `TalkController`'s decision key
   was `checkpointId:lastMessageId`, and the controller lives for the whole session — so a *new* chat
   that reached the same checkpoint at the same message index hit the previous chat's cached decision:
   nothing was recorded, the interceptor vetoed nobody, and ST's own activation picked the speaker.
   Speaker direction silently did nothing for that turn. Running J5 twice in a row was enough to
   reproduce it (3 of 5 runs failed); it never showed up in the per-plan gates, which ran J5 once.
   Fix: the key is `chatId:checkpointId:lastMessageId` (`getChatId()` added to `TalkControlHost`,
   `SillyTavernContext.chatId` vendored at st-context.js:125), with a unit test that fails on the old
   key. J5 then passed three consecutive runs.
2. **A 0-op curator proposal passed as a proposal.** When a small model formats every line
   unparseably, the pass produces a proposal with nothing in it; `expect: {stagecraft:
   {proposalsAtLeast: 1}}` was satisfied and the failure surfaced three steps later as "the proposal
   produced no review cards". Fix (in the checks, per the v2 lesson — no mock): `expect: {stagecraft:
   {opsAtLeast}}` names the real condition, and `stagecraft: {action: "curate", expectOps, attempts}`
   re-asks the curator, which is what the scheduler would do. J8 then passed twice.
3. **J5.6 had never actually run** (`blocked` at plans 01/04/07 via a `requires: epistemic-present`
   probe that depended on a short run happening to produce an epistemic entry) — and it would have
   passed vacuously if it had: it looked for leaks in `getMemoryInjectionBlocks()`, which carries the
   memory tiers, never the private epistemic block. Rewritten: the journey turns the capability on,
   seeds a scene with two secrets, runs the **real** epistemic/ledger pass (with one retry), then
   drafts each subject and asserts against the actual injected prompt
   (`extensionPrompts.story_orchestrator_epistemic`) that every line is that member's own and that the
   two members' blocks differ. Capability renamed to `epistemic-ledger` (a build capability, not a
   run-state coincidence).
4. **J1.4 probed a first-run path that was never built** (`#so-first-run`) while the one that shipped
   went unasserted. Rewritten against the real path: the settings panel offers "New story (wizard)"
   and it opens the wizard on an empty draft.
5. **`plan05-background-generation` (the corpus's known-stale scenario, open since plan 01)**: it
   mutated `approach` to stale an expansion, but staleing is basis-tracked and `approach` was never in
   the basis, because the blackboard had no value for it when the beats were generated. One step
   (`/cp set approach unknown` before the expansion) makes the later mutation basis-touching, which is
   exactly what the plan-01 note said the scenario needed.
6. **`.debug` rotation ate acceptance artifacts mid-run** (only `journey-<id>.md`, the config snapshot
   and the newest JSONs are protected). Not fixed in code — the archive directory is the fix, and
   `test-plan.md` now says so.

### Deviations

- **Migration was proven twice, not moved.** J10.8 (a v2 blob synthesized from live state) stays, and
  J10.11 adds the genuinely-old case the plan asked for. The fixture
  (`test/fixtures/legacy-v2-chat-blob.json`) is the verbatim `story_orchestrator` metadata of a real
  2026-03-26 group chat, provenance recorded in the file, seeded through a new shared verb
  (`seed_metadata`) rather than by copying a chat file into the user's group — a gate should not have
  to mutate the user's group record to run.
- **Four code/check changes in an acceptance plan.** Finding 1 is product code (10 lines + a test) and
  is recorded as its own mini gate record above; findings 2–5 are check/tooling changes, which the plan
  explicitly prefers over mocks. Nothing else was touched.
- **J0 under `--strict` exits 1 by design** and is therefore excluded from the acceptance matrix
  rather than "fixed".

### Not done (the gate's open items)

- **Human-eval sessions** (plan deliverable 2): the player session (≥30 messages, pure player mode,
  ⚑ flags, J3 rubric) and the author session (author a story in the Studio, play it, one mid-play
  edit, authoring rubric). Both are the user's to run; the protocol is in `test-plan.md` §Session
  journal & human-eval protocol and the fillable sheet is
  [`test/journeys/records/v2.1-acceptance/human-eval-sheet.md`](../../../test/journeys/records/v2.1-acceptance/human-eval-sheet.md).
  Every flag then needs triage (fixed / v2.2 / by-design with a reason) in this record.
- **Carried-over human rubrics**: J8.4 + the curator rubric (plan 07), J9.6/J9.7 (plan 06), and the
  standing "what would make you stop using this?".
- **The curator's `auto`-as-default verdict** stays open until the stagecraft rubric is scored; the
  capability remains off by default with accept mode `review`.

## v2.2 seed list

Carried forward from the plan's seed list, the external-base review, and what this gate turned up:

- **Remaining curators** (`stagecraft-design.md`): scene-setter (owns background + scenario framing),
  cast/npc tuning, recap narrator, continuity warden (Smart-Memory `continuity.js` pattern —
  contradiction check of the last reply + a one-turn corrective note).
- **The `auto` accept-mode decision** for the WI curator, once the human rubric exists.
- **Per-tier token/trim visibility bar** (Smart-Memory `trim-stats.js`): what memory actually costs
  per generation, per tier.
- **Regenerated character/world profile snapshots** (Smart-Memory `profiles.js`).
- **Entity/memory graph view** (Smart-Memory `graph.js`) over the ledger + epistemic map.
- **Copilot context tools** (ST-Copilot): search the chat and the lorebooks from inside the wizard.
- **The driver adopting the `questions` protocol** so in-play steering can ask before it acts.
- **`/story` growth**: `/story where`, `/story who`, and a player-safe way to ask "what changed since I
  left?" beyond the away popup.
- **A journey-level rerun mode** (`so-journey run <id> --repeat 2`): both defects this gate found were
  second-run-only, and the discipline should be in the runner, not in a habit.
- **Library hygiene**: gate-check stories from earlier plans (`Debug Cast`, `Restore Cast`,
  `Pacing Gate Check`) are still in the install's library; a `so-library prune --gate-checks` verb
  would keep test residue out of a user's story list.
- **Deferred flags and rubric findings** from the human sessions, once triaged.
