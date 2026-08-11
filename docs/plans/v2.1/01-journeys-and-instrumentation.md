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
