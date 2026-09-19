# Implementation Overview — Story Orchestrator v2.1

v2 (plans 01–14) is ACCEPTED and feature-complete. v2.1 fixes what the per-plan gating never tested: **the composition**. Four driving inputs:

- **D1 (user decision)**: hard author/player separation. The player never audits or controls the story — that role moves to the system (and, longer term, to background "stagecraft" agents managing WI, scenario, background, cast). Author keeps full tooling.
- **D2 (user decision)**: an integration test plan — objectives, checks, split into automated vs human-evaluated — plus instrumentation so the user's own play sessions produce reviewable feedback. Not full step recording: correlate + export the audit rings that already exist.
- **D3 (user decision)**: a copilot/**wizard** that helps configure the initial story plot before roleplaying — interview → staged proposals → provisioning of the ST assets the story requires — plus richer system-side steering. Patterns adopted from the ST-Copilot / Smart-Memory review (§External-base learnings).
- **R (review 2026-08-11)**: findings register below (U = UX seam, I = implementation seam).

Spec deltas live in [spec-addendum-v2.1.md](spec-addendum-v2.1.md) — read it after spec v2, before any plan. Everything not amended there still follows `../v2/story-orchestrator-spec-v2.md` and the v2 Gate records.

## Findings register

Evidence is the plan-08 acceptance run (2026-08-13, real LLM, fresh-start, `--strict`): the journey
check that proves the finding closed, or the jest guard that keeps it closed. A finding without
evidence stays open and is said so plainly.

| Id | Finding (one line) | Fixed in | Evidence (plan-08 acceptance) |
|---|---|---|---|
| U1 | Extraction defaults off + profileId per-chat → every new chat is dead until configured in a global-looking panel | 02 | J1.2 (fresh chat has extraction on), J1.3 + J10.2 (profile is install-wide, never in the chat), J10.6 (a brand-new chat plays with zero setup) |
| U2 | Story identity = content hash → Studio save forks a new record; re-select wipes progress/memory/settings silently | 02 (identity), 05 (loop) | J10.1/J10.3/J10.4/J10.5/J10.7, J2.4 (one identity across edits), J2.6–J2.8 (hot-swap · keep · cancel) |
| U3 | Player/author split applied to tabs not content: epistemic map (incl. `hiding`), arcs internals, driver + Advance list visible to player | 04 | J3.3 (`assert-player-clean`: text needles **and** the plan-08 selector sweep over drawer/HUD/settings), J5.6 (hidden ≠ broken: private injection still works) |
| U4 | "Where am I" rendered 6 ways sharing nothing; only the away-recap composes the narrative view | 04 | J3.5 (`getNarrativeStatus()` sections + `#so-player-overview`), J4.2/J4.3 (the same composition in the away recap) |
| U5 | Stall/reconciliation invisible — stuck story indistinguishable from slow one | 04 | J3.6 (induced stall shows `#so-stall-signal`, clears when the real re-read lands), J6.4 (`#so-rollback-notice` + HUD chip) |
| U6 | Settings grouped by implementation area; no first-run path | 02 (homes), 04 (surfacing), 06 (wizard/"Fix with wizard") | J1.1/J1.4/J1.5 (empty install → wizard entry → playable), J9.4 ("Fix with wizard" pre-filled from the unmet list) |
| U7 | Studio can't author roster/requirements/arc_template/arc_bridges/description — half the checkpoint features unauthorable | 05 | J2.1/J2.2/J2.3 (Story + Roster + requirements + bridges authored through the UI) |
| U8 | Player surfaces speak author vocabulary (cp ids, positional `/cp` mini-language, debug verbs exposed) | 04 | J3.4 (no cp ids, boundary numbers or audit vocabulary on any player surface) |
| I1 | RuntimeManager: 1867 lines / 90 public methods — every plan's orchestration landed in one class | 03 | 1867 → **630** lines; `src/runtime/architecture.test.ts` fails the build over the budget |
| I2 | Snapshot contract leaks: drawer calls `getLedger()`/`getDriverContext()`/`getActiveNudge()` outside the subscription | 03 | `architecture.test.ts` drawer-reads-snapshot guard (no `manager.get*(` under `components/drawer/**`) |
| I3 | Three lifetimes in one per-chat blob: story progress + chat knowledge + user settings | 02 | J10.2 (settings home), J10.8 (synthetic v2 blob migrates), J10.11 (a blob captured from a real pre-v2.1 chat migrates without losing a value) |
| I4 | Layer inversion: drawer imports `studio/`; DriverPanel (play surface) lives in `src/studio/components/` | 03 | `architecture.test.ts` import-boundary guard (`components` ↔ `studio`); DriverPanel lives in `components/drawer/` |
| I5 | Docs claim host effects go through `EngineHost`; it is `{ now }` — map ≠ terrain | 03 | `architecture.test.ts` engine-purity guard + the corrected seam description in `.claude/rules/architecture.md`, `docs/architecture-v2.md` and this plan set |
| I6 | Boundary scheduling policy = hand-appended branches in `runtime/index.ts` | 03 | `runtime/boundaryWork.ts` registry; the boundary callback in `runtime/index.ts` is 3 lines |

## Why v2 missed these — and the rules that prevent recurrence

Every v2 gate proved a feature; none proved a journey. Gates ran on pre-configured chats (U1 was literally recorded as an "environment note" in `../v2/retro-live-validation.md:46`). No layer existed between pure modules and RuntimeManager, so integration piled into one file. Rules for every v2.1 build agent — **additive to the v2 rules** (`../v2/00-implementation-overview.md` §Rules, all still binding):

1. **Journey gates.** Every plan's validation gate includes at least one end-to-end journey from plan 01's catalog, run as an end user with the real LLM. Feature checks alone never turn a gate green.
2. **Fresh-start default.** Live gates start from a virgin chat with default settings (and, where the journey says so, cleared global config). Pre-configured state is the exception and must be justified in the Gate record.
3. **No net RuntimeManager growth.** Any plan touching `src/runtime/` leaves `runtimeManager.ts` at equal or lower line count. New orchestration goes into the plan-03 services (before plan 03: into a new module, wired thin).
4. **Persona tag.** Every UI element added or changed is tagged `player` / `author` / `both` in the plan doc, and `player` elements pass the plan-04 spoiler checklist.
5. **Docs-truth.** If a plan changes an architectural fact, it updates `.claude/rules/architecture.md` + `docs/architecture-v2.md` in the same plan. A doc describing a seam that doesn't exist is a defect.
6. **Migration-with-gate.** Any persisted-shape change ships its migration and a journey gate that reopens a pre-change chat.
7. **Regression floor.** Each plan names the journeys it must not regress; they re-run in its gate.
8. **Living test plan.** A plan that adds, retires, or changes a journey — or any player-visible element — updates `test-plan.md` (checks table, auto/human split, spoiler checklist) **in the same plan**. The test plan is never allowed to describe a build that no longer exists.
9. **Structural rules are enforced by the harness, not by vigilance.** Rules 3 and 4 get automated guards in plan 03 (size budget + import-boundary test); a rule nobody can violate silently is the only kind that survives eight plans.

**Existing v2 test corpus.** The v2 `test/scenarios/*.json` (feature-level, incl. `live-plan0*`) is **kept, not replaced** — journeys are the composition layer above it. Any plan that breaks a scenario either fixes it or retires it explicitly in its Gate record; silent rot is a gate failure. Plan 03 (the refactor) must leave the whole corpus green.

## Plan sequence and exported contracts

Sequential, one build agent per plan, gate green before the next starts. Same plan-doc template and Gate-record protocol as v2.

| Plan | Addresses | Exports (consumed later) |
|---|---|---|
| [01-journeys-and-instrumentation](01-journeys-and-instrumentation.md) | D2 | journey catalog (J1–J7; J8/J9 reserved), check-outcome vocabulary, automated/human test-plan matrix, `so-journey` runner (fresh-start sandbox, crash-safe config snapshot), session journal + `so-journal` export, flag-moment affordance, **baseline run + baseline human rubric vs current build** |
| [02-story-identity-and-settings-home](02-story-identity-and-settings-home.md) | U1 U2 U6 I3 | story `id`+`version` in format-2, library keyed by id, settings split global/per-chat, non-destructive select, migration |
| [03-runtime-decomposition](03-runtime-decomposition.md) | I1 I2 I4 I5 I6 | `MemoryCoordinator`, `ExtractionCoordinator`, `ExpansionCoordinator`, `SnapshotBuilder`, boundary-work registry, layer moves, docs truth-up |
| [04-player-surface](04-player-surface.md) | D1 U3 U4 U5 U8 | narrative drawer default, spoiler-audited player mode, stall signal, player-language pass |
| [05-author-loop](05-author-loop.md) | U2 U7 | Studio completeness (roster/requirements/arc_template/arc_bridges/description), save→same-chat hot-swap with invalidation flow, Restart affordance |
| [06-story-wizard](06-story-wizard.md) | D3 U6 | interview protocol (`questions` proposals), provisioning ops + host seams (character cards, story lorebook, group), wizard flow + "Fix with wizard", J9 |
| [07-stagecraft-agents](07-stagecraft-agents.md) | D1 | stagecraft design doc (WI curator, scene-setter, cast tuning, continuity warden), deterministic `background` effect, one agentic curator slice (WI) behind a flag |
| [08-acceptance](08-acceptance.md) | all | full journey matrix green, human-eval protocol executed, success-criteria v2.1, findings register closed, docs/status refresh |

## External-base learnings (review 2026-08-11: `C:\dev\ST-Copilot`, `C:\dev\Smart-Memory`)

Patterns adopted — same provenance discipline as the v2 external-bases table; no new code vendored (ST-Copilot MIT, Smart-Memory AGPL patterns-only, consistent with v2 stance):

| Pattern | Source | Adopted in |
|---|---|---|
| Interview mechanic — assistant asks the user questions before proposing (`ask_user` tool → in-protocol `questions` variant for generic-textgen backends) | ST-Copilot `feature-tools-engine.js` | 06 |
| Environment provisioning — create character cards (`/api/characters/create`, FormData + `getCharacters()` reload), draft/edit lorebook entries, proposal cards with inline edit-before-apply | ST-Copilot `feature-character-engine.js:744`, `feature-lorebook-*` | 06 (wizard), 07 (curator reuses WI path) |
| Proposal hygiene — raw proposal blocks stripped from assistant history after decision; patch "first words \|\| last words" boundary syntax for small-model-safe partial WI edits | ST-Copilot `constants.js` | 06, 07 |
| Model self-test — fixed fixture scenario through the real per-tier extraction pipeline, per-tier pass/fail UI, drives capability flags | Smart-Memory `model-test.js` (pattern only; reuse our `extraction/fixtureRun.ts`) | 02 |
| Continuity warden — contradiction check of the last reply vs established facts + one-turn corrective note, auto-cleared | Smart-Memory `continuity.js` (pattern only) | 07 (fleet design) |
| v2.2 seeds — per-tier token/trim visibility bar, regenerated character/world profile snapshots, entity/memory graph view, copilot context tools (search chat/lore) | Smart-Memory `trim-stats.js`/`profiles.js`/`graph.js`, ST-Copilot tools | 08 seed list |

Explicitly **not** adopted: ST-Copilot chat-message editing (conflicts with TurnBridge rollback semantics), editing existing user characters (wizard is create-only), native tool-calling payloads (memory LLM is generic textgen).

## Gate protocol

v2 baseline (`npm run typecheck && npm run lint && npm test && npm run build` + real-LLM live checks per `../v2/00-implementation-overview.md` §Gate protocol) **plus** the plan's journey gates via `so-journey`, fresh-start. `debugResponse` mocks never green a gate. Gate record appended to the plan doc, next agent reads all prior v2.1 Gate records **and** the v2 ones.

## Traceability

| Input | Plan |
|---|---|
| D1 player never audits/controls | 04 (removal), 07 (system takes the role) |
| D2 integration test plan + own-run feedback | 01 (definition + tooling), 08 (execution) |
| D3 setup wizard + provisioning | 06 (build), 02 (model self-test), 07 (steering side) |
| U1–U8, I1–I6 | per findings register |
| v2 open item F1 (latched-contradiction outcome gates) | closed in v2 (`src/generation/critic.ts:56` + latchGuard) — no v2.1 work |
