# Plan 01 — Journeys & instrumentation

## Objective

Define the integration test plan (journeys, objectives, checks, automated-vs-human split), build the tooling that runs it (`so-journey`, session journal, `so-journal`), and record a **baseline run against the current build** so every later plan measures improvement instead of asserting it. Nothing else in v2.1 starts before this gate is green — this is the harness the anti-mistake rules depend on.

## Context

- Spec addendum §Evaluation (layer 5), §Personas.
- Existing rings to correlate (all already persisted): boundary logs (`engine.ts`), `extras.extraction.audits` + `reconciliationEvents`, `payloadCaptures` (ring of 5, `generation_started`), `extras.talk.decisions`, fired transitions, status history (not yet persisted — add).
- Existing tooling: `so-scenario.mts` (assertions, sandbox, exit codes), `so-state`, `so-ui`, `st-navigation`, shared 9222 session (`.claude/rules/debug-scripts.md`).
- v2 lesson: gates ran on pre-configured chats; `../v2/retro-live-validation.md:46` filed U1 as an environment note.

## Scope

In: journey catalog + test-plan doc; `so-journey` runner (fresh-start orchestration over `so-scenario`); session journal (runtime aggregation + persistence of a correlated timeline); `so-journal` export; flag-moment UI affordance; baseline run + report.
Non-goals: fixing anything the baseline finds (that's plans 02–06); new assertions inside jest (journeys are live-layer); any recording beyond correlating existing rings.

## Deliverables

- `docs/plans/v2.1/test-plan.md` — the D2 artifact, and a **living document** (rule 8): per journey — objective, preconditions, steps, **checks table** with each check marked `auto` (so-journey assertion) or `human` (rubric question, 1–5 + free text), each check tagged with the finding id(s) it proves (U1…I6, D1–D3) so plan 08's Evidence column writes itself. Human rubrics cover what assertions can't: immersion, spoiler feel, language quality, pacing feel, recap usefulness — plus one standing free-text prompt per session ("what would make you stop using this?"), which is where unknown-unknowns arrive.
- **Check outcome vocabulary** (without it the baseline is unreadable): `pass` · `fail` (check ran, wrong result) · `blocked` (step not executable on this build — the feature doesn't exist yet) · `not-runnable` (journey undefined on this build, e.g. J8/J9 at baseline) · `skipped`. `so-journey` distinguishes all five in its output and exit semantics (only `fail` in a plan's own gate journeys blocks; `blocked` is expected at baseline and forbidden at acceptance).
- Journey catalog (initial; catalog is versioned, plans may extend):
  - **J1 first-contact**: fresh chat + cleared global config → install state → import example → configure → first real transition fires. (Baseline: known-fail U1/U6.)
  - **J2 author-loop**: empty Studio → authored mini-story (no JSON editing) → play → hit a wrong gate → edit → continue same chat; includes one **author-view driver** use (Probe + Nudge) so the in-play author tools stay covered after plan 04 removes them from player view. (Baseline: blocked at authoring — U2/U7.)
  - **J3 player-session**: 20+ real messages on sun-ruins; transitions announced; memory recalled; induced stall recovers visibly; spoiler checklist over every visible surface. (Baseline: partial-fail U3/U4/U5.)
  - **J4 return-and-adopt**: reopen after simulated gap → away recap; mid-chat adoption via memorize backlog.
  - **J5 group-direction**: talk_control + npc_replies + cast_changes across checkpoints; **per-speaker private injection asserted in the captured payload** (drafted member sees their own facts/epistemic and not another's — proves the epistemic tier still works after plan 04 hides it from the player); roster restored after (debug-scripts gotcha).
  - **J6 mutation-storm**: swipe/edit/delete around a boundary; rollback correct and user-comprehensible.
  - **J7 long-haul**: full sun-ruins play-through to finale; success-criteria matrix hooks.
  - Reserved: **J8 stagecraft** (defined by plan 07) and **J9 wizard** (defined by plan 06) join the matrix when their plans land; baseline records them as not-runnable.
- `scripts/debug/so-journey.mts` — runs a journey file (`test/journeys/*.journey.json`): fresh-start setup verbs (new sandbox chat, reset extras to true defaults, optionally snapshot+clear+restore global extension settings), then delegates steps/assertions to the `so-scenario` engine; `--list`, exit code = pass; human checks emitted as a checklist block for the operator.
- Session journal: runtime module (pure aggregation + a thin manager seam) producing `JournalEvent[]` — `{at, boundary?, messageId?, kind, summary, detail?}` from the existing rings + status transitions + **flags**; persisted capped ring in extras. Handle: `getSessionJournal()`. Flag affordance: one small "⚑ flag this moment" control in the drawer (persona: `both` — it's meta, not steering) writing `{kind:"flag", note?}`.
- `scripts/debug/so-journal.mts export [--md|--json]` → `.debug/journal-<chat>.{md,json}` — the artifact a human-eval session hands back.
- Baseline: run J1–J7 against current build, real LLM, headed; record per-check outcome (vocabulary above) with finding ids in the Gate record. Fails and blocks are expected — they are the measurement.
- **Baseline human session** (small, once): the user plays ~15 messages on the current build and fills the J3 rubric. Two purposes — validate the rubric is answerable before eight plans depend on it, and give plan 08's "≥4/5" an honest *before* number. Filed in the Gate record alongside the automated baseline.

Exports: journey catalog + file format, `so-journey`, `getSessionJournal()`/`so-journal`, test-plan matrix. All later plans consume.

## Implementation notes

- `so-journey` wraps, not forks, `so-scenario` — one assertion engine (rule 9 of v2: tooling grows with build, no parallel stacks). New verbs land in `so-scenario` and are documented in `scripts/debug/README.md`.
- Global-settings snapshot/restore must be surgical and crash-safe: only `extensionSettings["story-orchestrator"]`, never other extensions, **never ST's Connection Manager profiles** (they are the user's, and J1's "cleared config" means our settings only); the snapshot is written to `.debug/` *before* clearing and a `so-journey restore-config` verb re-applies it if a run dies mid-journey.
- Journal is derivation-first: build events from rings at read time where possible; persist only what rings don't already hold (status transitions, flags). Cap ~200 events.
- Flag control: tiny, unobtrusive, no text required (optional note popup). Tag `both` per rule 4.
- Journeys assume the gemma live setup (memory: `gemma-live-validation-setup`); journey files carry no profile ids — `so-journey` reads the configured profile.

## Validation gate

Harness: typecheck/lint/test/build (journal module unit-tested; runner has a self-test journey); existing v2 scenario corpus still green. Live: `so-journey --list` sane; J1 executes end-to-end fresh-start (its *checks* may fail or block — the runner must not); config snapshot/restore proven by killing a run mid-journey and restoring; journal export from a real J3 session contains extraction, transition, payload, and flag events on one timeline. Gate record includes the full **baseline matrix** (per-check outcomes + finding ids) and the **baseline human rubric**.

## Delegated decisions

- Exact journey-file schema (reuse scenario schema + `setup` block vs new wrapper format).
- Rubric wording; 1–5 anchors.
- Journal ring cap; whether flags post a `/comment` too (leaning no — journal only).

## Unresolved questions

- J7 duration vs gate practicality: acceptable to run J7 only at plans 01 (baseline) and 07 (acceptance), not per-plan? (Assumed yes.)

## Gate record

**Date**: 2026-08-11 · **Status**: COMPLETE. Harness green; live baseline recorded against the current build with the real LLM (gemma4-mtp via "Story Orchestrator Memory Local", headed browser, no `debugResponse` on any LLM-consuming path except the two deliberately deterministic latch steps in J6).

### Delivered

| Deliverable | Where |
|---|---|
| Journey catalog J1–J7 + J8/J9 reserved + J0 runner selftest | `test/journeys/*.journey.json` (+ `j5-group.story.json` fixture) |
| Test plan (living, D2 artifact) | `docs/plans/v2.1/test-plan.md` |
| `so-journey` runner | `scripts/debug/so-journey.mts` — `--list`, `run`, `restore-config`; fresh-start setup, crash-safe config snapshot, lazy capability probes, human checklist, `.debug/journey-<id>.{md,json}` |
| Session journal | `src/runtime/journal.ts` (`SessionJournal`, `buildSessionJournal`), handle `getSessionJournal()`, persisted `extras.journal` (status + flags only, cap 200) |
| Flag affordance (persona `both`) | `#so-flag-moment` in `DrawerTabs` + `manager.flagMoment(note?)`; Storybook `FlagMoment` play |
| Journal export | `scripts/debug/so-journal.mts export|show` → `.debug/journal-<chat>.{md,json}` |
| Shared-engine verbs (added to `so-scenario`, not a fork) | `ui` (open-drawer / drawer-tab / open-settings / select-profile / open-studio / close-studio / flag / screenshot), `reload`, `expect_ui` (retrying), `expect.activeCheckpointIn`, `wait.checkpointNot` / `checkpointIn`, `send_generate {text,timeoutMs}` |

Rule 3 (no net RuntimeManager growth): `runtimeManager.ts` **1867 → 1718** lines — the extras factory/sanitizer block moved to `src/runtime/extras.ts` (`hydrateExtras`), payload captures into `SessionJournal`. Rule 4: the one UI element this plan adds (the drawer ⚑) is tagged `both` and shows no story state. Rule 5: `.claude/rules/architecture.md`, `.claude/rules/gotchas.md`, `.claude/rules/debug-scripts.md`, `docs/architecture-v2.md`, `scripts/debug/README.md` and `.claude/CLAUDE.md` updated in this plan.

### Harness

```
npm run typecheck         -> clean
npm run lint              -> clean
npm test                  -> 48 suites / 1445 tests passed (was 47/1427; +journal.test.ts)
npm run build             -> webpack compiled (2 pre-existing size warnings)
npm run debug:typecheck   -> clean
npm run test-storybook:ci -> 20 suites / 65 tests passed (was 20/64; +FlagMoment)
```

v2 scenario corpus (`--sandbox`, deterministic subset): `plan02-runtime`, `plan03-extraction`, `plan03a-edit-rollback`, `plan03a-delete-rollback`, `plan04-pacing`, `plan06-convergence`, `plan07-memory`, `plan08-hygiene`, `plan09-arcs`, `plan10-epistemic-ledger`, `plan12-copilot`, `plan13-surfacing` — **all `ok: true`**. Three had rotted against v2 *post-acceptance* changes (not against this plan) and were fixed here:

- `plan04-pacing`: asserted `tension.expected 0.5` (shape curve) and the pre-calibration hint wording; the authored `tension_target` now drives expected tension → 0.25 + "hold the tension near stirring …".
- `plan03a-edit-rollback` / `plan03a-delete-rollback`: mutated `messageId: "last"`, which is now the scripted NPC reply added *after* the commit, so no rollback was due. Pointed at message 0 (the message that carries the delta) — the check's actual intent.
- **Known-stale, explicitly excluded from the green list**: `plan05-background-generation` step 4 expects an inserted expansion to go `stale` after `/cp set approach blocked`; v2 plan-13 acceptance made staleing *basis-tracked*, so a value outside the expansion's basis no longer stales it. The scenario needs a basis-touching mutation. Owner: whichever plan next touches `generation/` (03 or 07). Recorded, not silent.

### Baseline matrix (real LLM, fresh-start, headed)

Legend: `pass` · `fail` (ran, wrong result) · `blocked` (feature absent, declared via `requires`) · `skipped` (human check).

| Check | Outcome | Findings | Evidence |
|---|---|---|---|
| J0.1–J0.2 | pass | — | runner selftest: virgin chat; drawer ⚑ writes a journal record |
| J0.3 | blocked | — | proves `requires` → blocked, not a fake failure |
| J1.1 | pass | U6 | empty install: drawer says "Load a story from the extension settings." |
| **J1.2** | **fail** | **U1** | fresh chat: `{"enabled":false,"profileId":null,…}` — extraction off by default |
| J1.3 | blocked | U1 I3 | no `getGlobalSettings` — the profile is per-chat |
| J1.4 | blocked | U6 | no first-run path (`#so-first-run`) |
| J1.5 | pass | U6 | example story imports and is playable (cp1, requirements ready) |
| J1.6 | pass | U1 | after configuring in the settings panel, 3 real turns fire cp1 → cp2 |
| J1.7 | pass | U6 | "Accept the Mission" announced in `#chat` |
| J2.1 | pass | U7 | Studio opens on an empty draft |
| J2.2 / J2.3 | blocked | U7 | no roster / requirements editors in the Studio UI |
| J2.4 / J2.5 | blocked | U2 | no stable story id, no hot-swap |
| J2.6 | pass | U3 | author-view driver: real Probe (audit recorded) + Nudge injected + cleared |
| J3.1 / J3.2 | pass | — | 3 real turns → cp1 → cp2, announced in chat |
| **J3.3** | **fail** | **U3** | player mode (`authorView:false`) drawer contains "Epistemic map" and "State ledger" |
| J3.4 | pass | U8 | player Overview free of `cp*`, "Boundary ", audit vocabulary |
| J3.5 | blocked | U4 | no composed narrative status surface |
| J3.6 | blocked | U5 | no player-visible stall signal |
| J3.7 | pass | — | memory written and the facts tier injected into the next generation |
| J3.8 | pass | — | journal carries extraction + delta + boundary + transition + payload + flag |
| J4.1–J4.4 | pass | — | away recap after a simulated 3-day gap (on reopen), names the checkpoint, dismisses; memorize backlog fills memory with the real model |
| J5.1–J5.5 | pass | — | talk_control active, `cast_changes` disabled Luke, scripted npc_reply fired, real group turn routed + decision recorded, payload captured |
| J5.6 | blocked | U3 | no epistemic entry produced in this short run → private-injection assertion not runnable |
| J6.1–J6.3 | pass | — | boundary latched; edit → rollback to cp1; delete → engine state consistent |
| J6.4 | blocked | U5 | no player-facing rollback notice |
| J7.1–J7.8 | pass | — | full play-through cp1 → cp2 → cp3 → cp-4a → cp-4a1 → cp-5 → cp-6; all 5 anchors visited, convergence 1, 5+ transitions and memory in the journal |
| J1.8–J1.9, J2.7–J2.8, J3.9–J3.13, J4.5–J4.6, J5.7, J6.5, J7.9–J7.10 | skipped (human) | — | checklist emitted every run; see below |
| J8.*, J9.* | not-runnable | D1, D3 | reserved for plans 07 / 06 |

Totals: **J1** 4 pass / 1 fail / 2 blocked · **J2** 2 / 0 / 4 · **J3** 5 / 1 / 2 · **J4** 4 / 0 / 0 · **J5** 5 / 0 / 1 · **J6** 3 / 0 / 1 · **J7** 7 / 1 / 0. The single J7 fail was a harness artifact (an exact-checkpoint wait missed an overshoot to cp3); the check now waits on `checkpointIn: [cp2, cp3]` and was re-run green in isolation.

Every `fail` and `blocked` maps to a finding a later plan owns: U1/I3 → plan 02, U2/U7 → plans 02 + 05, U3/U4/U5/U8 → plan 04, D1/D3 → plans 06/07. Plan 08 re-runs this matrix with `--strict`, where `blocked` is forbidden.

### Baseline human rubric — NOT RUN

The J3 human checklist (immersion, spoilers, language, stall legibility, pacing, plus the standing "What would make you stop using this?") is emitted by every run and specified in `docs/plans/v2.1/test-plan.md`, but the ~15-message human session is the **user's** to play — an agent cannot answer it honestly. It is therefore explicitly open, and plan 08's "≥ 4/5" has no *before* number until the user plays it once. Protocol: test-plan.md, §Session journal & human-eval protocol.

### Live-gate evidence

- Runner selftest `so-journey run J0`: pass / blocked / skipped / checklist / cleanup all exercised.
- Config snapshot+restore proven crash-safe: `run J1 --only J1.1 --keep` cleared `extensionSettings["story-orchestrator"]` (Connection Manager profiles verified untouched), then `so-journey restore-config` put the library back.
- Journal export from a real J3 session: `.debug/journal-2026-08-11_22h06m15s490ms.md` — 27 events on one timeline (`status → extraction → delta → boundary → transition → payload → … → flag`) with a "Flagged moments" section written by the drawer ⚑ control.
- `so-journey --list` lists 10 journeys with status and auto/human counts.

### Deviations and fixes made along the way

- **Two destructive tooling bugs found and fixed.** They cost the user's story library once during this run; it was restored from `data/default-user/backups/settings_default-user_20260707-153214.json` plus a re-import of the shipped example (same hashes, so existing chats still resolve).
  - `so-journey` cleanup removed every story hash the run imported, including records that already existed. It now snapshots the library at setup and removes only new hashes (`keptPreExistingStories` in the cleanup report).
  - `so-scenario --sandbox` cleanup had the identical bug; same fix.
  - `.debug` artifact rotation (40 files) deleted journey matrices, journal exports and the config snapshot. Those names are now protected from rotation.
- `st-actions.getGenerationState` treated a *stopped* stream (`isFinished:false, isStopped:true`) as generating forever and ignored ST's send/stop button swap. The buttons are now the primary signal, and `waitForIdle` requires a continuous idle window so the gap between two group members is not read as the end of the turn. `send_generate` accepts `timeoutMs` (default 300 s — group turns on a local model regularly need minutes).
- `so-ui.openExtensionSettings` opened by *presence*; ST nests our panel behind `#extensions-settings-button` → `#rm_extensions_block`. It now opens by visibility and closes the nav drawer again (an open Extensions drawer hides `#options_button` and `#send_but`).
- Journey setup dismisses stray ST modals and retries `/newchat` once — a chat deleted by the previous run can leave ST mid-transition.
- **Extraction settings are per-chat**, so `setup.configureExtraction` before a story import is wiped by `loadStory`. Journeys therefore configure the profile *after* importing (`ui: select-profile`). That is U1/I3 showing up inside the harness itself; when plan 02 makes settings global, the per-check step can go away.
- Environment note: ST's own "Chat integrity check failed while saving the file" popup fires under rapid sandbox chat churn (`/newchat` + `/delchat` back to back) and wedges the client at "Initializing…" after its forced reload; recovery is killing the Playwright browser and running `st-session start` again. Run scenario/journey batches one at a time. Extension state was intact each time (server `settings.json` verified).
- `BoundaryLogEntry` gained `at` (host clock) so boundary/transition events order against the timestamped rings.

### Unresolved

- **Baseline human rubric** (above) — needs one ~15-message session from the user.
- `plan05-background-generation` known-stale (above).
- J7 wall-clock is ~25 min on the local model; confirmed practical only at plans 01 and 07/08, as the plan assumed.
