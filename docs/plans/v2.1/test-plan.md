# Story Orchestrator — integration test plan (v2.1)

**Living document (overview rule 8).** Any plan that adds, retires or changes a journey — or any
player-visible element — updates this file in the same plan. A test plan describing a build that no
longer exists is a defect.

Layer 5 of the evaluation framework (spec addendum §Evaluation): end-to-end user journeys run
against the real system, fresh-start, with the real LLM. Layers 1–4 (unit, golden, scenario,
live-suite) are unchanged and still run in every gate.

Layer 1 additionally carries the **structural guards** (`src/runtime/architecture.test.ts`, plan 03):
manager/coordinator size budgets, the `components`↔`studio` import boundary, drawer-reads-snapshot
and engine purity. They are ordinary jest tests — a violated architecture rule fails the build
instead of waiting for a reviewer to notice it (overview rule 9).

## How to run

```bash
node scripts/debug/so-journey.mts --list
```

```bash
node scripts/debug/so-journey.mts run J3
```

- Journeys live in `test/journeys/*.journey.json`; the runner wraps the `so-scenario` step engine, so
  every verb is shared (new verbs land in `so-scenario`, never in a parallel runner).
- Setup is fresh-start by default: a new sandbox chat in the most recent group, chat state wiped,
  debug-response globals cleared. `clearGlobalConfig` additionally snapshots and clears
  `extensionSettings["story-orchestrator"]` — **only** that key, never other extensions and never ST's
  Connection Manager profiles. The snapshot is written to `.debug/so-journey-config-snapshot.json`
  *before* clearing; if a run dies mid-journey, `so-journey.mts restore-config` puts it back.
- Journey files carry no profile ids. `ui: select-profile` picks the memory model through the real
  settings panel; `ST_DEBUG_PROFILE=<name>` chooses when several profiles exist.
- `--strict` makes `blocked` fail (acceptance mode, plan 08). `--only <ids>` runs a subset.
  `--keep` skips cleanup. `--no-config` forbids any global-settings write.
- Artifacts per run: `.debug/journey-<id>.md` (matrix + human checklist) and a timestamped
  `.debug/*_journey-<id>.json`. Both, and the config snapshot, are protected from `.debug` rotation.

## Check outcome vocabulary

| Outcome | Meaning | Blocks a gate? |
|---|---|---|
| `pass` | the check ran and asserted what it claims | — |
| `fail` | the check ran and got the wrong result | yes, in the plan's own gate journeys |
| `blocked` | the step is not executable on this build — the feature does not exist yet (declared via `requires: [capability]`) | no at baseline; **forbidden at acceptance** (`--strict`) |
| `not-runnable` | the journey itself is undefined on this build (`status: "reserved"`, e.g. J8/J9 today) | no |
| `skipped` | not selected by `--only`, or a human check the operator scores | no |

Human checks are emitted as a checklist block at the end of every run (1–5 plus free text) together
with one standing prompt: **"What would make you stop using this?"** — the place unknown-unknowns
arrive. The operator records scores in the plan's Gate record.

## Journey catalog

| Id | Title | Objective | Auto | Human | Notes |
|---|---|---|---|---|---|
| J0 | runner-selftest | The runner itself: fresh-start, pass/blocked/skipped, cleanup | 3 | 1 | No LLM. Run it whenever the harness changes |
| J1 | first-contact | Cleared install → install state → import example → configure → first real transition | 7 | 2 | Only journey that clears global config |
| J2 | author-loop | Empty Studio → authored story → play → edit → continue; author-view driver (Probe + Nudge) | 6 | 2 | Authoring checks blocked until plan 05 |
| J3 | player-session | Real session on sun-ruins: transitions announced, memory recalled, spoiler sweep, journal | 8 | 5 | The human-eval workhorse |
| J4 | return-and-adopt | Simulated multi-day gap → away recap on return; mid-chat adoption via memorize backlog | 4 | 2 | Uses the `reload` verb (real return path) |
| J5 | group-direction | talk_control + npc_replies + cast_changes; per-speaker private injection in the payload | 6 | 1 | Restores the group roster in cleanup |
| J6 | mutation-storm | Edit/delete around a boundary; rollback correct and comprehensible | 4 | 1 | Deterministic (`extract` with a debug response for the latch only) |
| J7 | long-haul | Full sun-ruins play-through to the finale; success-criteria hooks | 8 | 2 | **Expensive** — plan 01 (baseline) and plans 07/08 (acceptance) only |
| J10 | identity-and-settings | Story identity, pinning, settings homes, migration, Restart | 8 | 2 | Plan 02's gate journey |
| J8 | stagecraft | *Reserved — defined by plan 07* | 3 | 1 | `not-runnable` until then |
| J9 | wizard | *Reserved — defined by plan 06* | 4 | 1 | `not-runnable` until then |

## Checks

Each check names the finding(s) it proves (`U1…U8`, `I1…I6`, `D1…D3` from the overview's findings
register), so plan 08's Evidence column writes itself.

### J1 first-contact

| Check | Mode | Findings | What it proves |
|---|---|---|---|
| J1.1 | auto | U6 | With nothing installed, the drawer says what to do next |
| J1.2 | auto | U1 | A brand-new chat has extraction enabled by default |
| J1.3 | auto | U1 I3 | The memory profile is install-level, not stored per chat (`requires: global-extraction-settings`); J10.6 proves a new chat inherits it |
| J1.4 | auto | U6 | A first-run path walks an empty install to playable (`requires: first-run-path`) |
| J1.5 | auto | U6 | Importing the shipped example from the settings panel makes it playable |
| J1.6 | auto | U1 | After configuring the memory model in the panel, the first real transition fires |
| J1.7 | auto | U6 | The transition is announced to the player in chat |
| J1.8 | human | U6 | "Could you tell what to do to get a story running?" |
| J1.9 | human | U1 U6 | "Was it clear the story was running and would advance on its own?" |

### J2 author-loop

| Check | Mode | Findings | What it proves |
|---|---|---|---|
| J2.1 | auto | U7 | The Studio opens on an empty draft |
| J2.2 | auto | U7 | Roster members are authorable in the Studio UI (`requires: studio-roster-editor`) |
| J2.3 | auto | U7 | Requirements (members, lorebooks) are authorable (`requires: studio-requirements-editor`) |
| J2.4 | auto | U2 | A story keeps one identity across edits: re-import updates the record instead of forking |
| J2.5 | auto | U2 | Saving an edit into the running chat keeps progress (`requires: hot-swap`) |
| J2.6 | auto | U3 | The author-view driver still works in play (Probe + Nudge, real model) |
| J2.7 | human | U7 | "Could you author a playable checkpoint without JSON?" |
| J2.8 | human | U2 | "After editing mid-play, did the chat behave as expected?" |

### J3 player-session

| Check | Mode | Findings | What it proves |
|---|---|---|---|
| J3.1 | auto | — | The story loads and the first real transition fires from play alone |
| J3.2 | auto | — | The checkpoint change is announced in the chat |
| J3.3 | auto | U3 | Player mode shows no author-only internals (spoiler sweep: epistemic map, ledger, `hiding from`, steering, blackboard) |
| J3.4 | auto | U8 | Player surfaces avoid implementation vocabulary (checkpoint ids, boundary, audit counts, "extractor") |
| J3.5 | auto | U4 | One composed narrative "where am I" surface exists (`requires: narrative-status`) |
| J3.6 | auto | U5 | A stalled pipeline is visibly distinct from a slow one (`requires: stall-signal`) |
| J3.7 | auto | — | The session produced memory and injected it into the next generation |
| J3.8 | auto | — | The session journal correlates extraction, transition, payload and flag on one timeline |
| J3.9 | human | U4 | "Did you always know where the story was?" |
| J3.10 | human | U3 | "Did anything spoil what was coming, or reveal what a character was hiding?" |
| J3.11 | human | U8 | "Did the wording sound like the game or the machine?" |
| J3.12 | human | U5 | "Could you tell stuck from thinking from waiting?" |
| J3.13 | human | — | "Did the pacing push and breathe when it should?" |

### J4 return-and-adopt

| Check | Mode | Findings | What it proves |
|---|---|---|---|
| J4.1 | auto | — | A chat played before the gap exists to return to |
| J4.2 | auto | — | Reopening after a simulated 3-day gap shows the away recap (`requires: away-recap`) |
| J4.3 | auto | — | The recap names the checkpoint left off at, and dismisses cleanly |
| J4.4 | auto | — | Mid-chat adoption: memorize backlog fills memory from existing history (real model) |
| J4.5 | human | U4 | "Did the recap put you back in the story?" |
| J4.6 | human | — | "Was it clear the extension had caught up?" |

### J5 group-direction

| Check | Mode | Findings | What it proves |
|---|---|---|---|
| J5.1 | auto | — | A talk-control checkpoint loads with speaker direction enabled (`requires: talk-control`) |
| J5.2 | auto | — | `cast_changes` applied the checkpoint's roster |
| J5.3 | auto | — | The scripted `npc_replies` entry fired |
| J5.4 | auto | — | A real group turn is routed by speaker direction and the decision recorded |
| J5.5 | auto | — | The injected payload for that turn was captured |
| J5.6 | auto | U3 | Private per-speaker injection: the drafted member sees their own epistemic block, not another's (`requires: epistemic-present`) |
| J5.7 | human | — | "Did the right characters speak, and did silence read as a choice?" |

### J6 mutation-storm

| Check | Mode | Findings | What it proves |
|---|---|---|---|
| J6.1 | auto | — | A boundary is committed and a gate latches |
| J6.2 | auto | — | Editing the message that carried the delta rolls the story back |
| J6.3 | auto | — | Deleting the last message leaves engine state consistent |
| J6.4 | auto | U5 | The player is told the story stepped back (`requires: rollback-notice`) |
| J6.5 | human | U5 | "Was it clear what the story did in response?" |

### J7 long-haul

| Check | Mode | Findings | What it proves |
|---|---|---|---|
| J7.1–J7.6 | auto | — | cp1 → cp2 → cp3 → cp-4a → cp-4a1 → cp-5 → cp-6 on the real model, with convergence progress |
| J7.7 | auto | — | Every anchor visited, none skipped |
| J7.8 | auto | — | The long session left a coherent journal and memory behind |
| J7.9 | human | — | "Did it feel authored, or like rails?" |
| J7.10 | human | — | "Did the finale land given what actually happened?" |

### J10 identity-and-settings

| Check | Mode | Findings | What it proves |
|---|---|---|---|
| J10.1 | auto | U2 | The example story carries an authored id and the chat keys its state by it (blob v3, pinned) |
| J10.2 | auto | U1 I3 | The memory profile is stored install-wide, never in the chat |
| J10.3 | auto | U2 | Re-selecting the same story hydrates progress instead of wiping it |
| J10.4 | auto | U2 | A library edit does not reach a chat that already pinned the story |
| J10.5 | auto | U2 | Deleting the library record leaves the running chat playable from its pinned copy |
| J10.6 | auto | U1 I3 | A brand-new chat on a configured install plays immediately, with no per-chat setup |
| J10.7 | auto | U2 | Restart is the only reset, and it re-pins the latest library version |
| J10.8 | auto | I3 | A pre-v2.1 (hash-keyed) chat blob migrates to id-keyed state with the story pinned |
| J10.9 | human | U6 | "Was it clear which settings apply to every chat and which only to this one?" |
| J10.10 | human | U6 | "Did the memory-model self-test tell you something you could act on?" |

### J8 stagecraft *(reserved — plan 07)*

Background effect; WI curator proposing off-path; every curator action audited in the journal and
never writing the blackboard or memory tiers; human: "did the stage keep up with the story?"

### J9 wizard *(reserved — plan 06)*

Interview before proposing; create-only provisioning enforced in op validation; per-op review;
"Fix with wizard" from the requirements panel; human: "did it get you to a story you wanted to play?"

## Spoiler checklist (player mode)

Applied by J3.3/J3.4 automatically and by the human checks J3.10/J3.11. Plan 04 extends this list
and re-audits every player-visible element it touches. A player-mode surface must never show:

- gate expressions or unmet-gate values, checkpoint ids, boundary numbers
- future/unvisited checkpoint names, transition targets, the Advance list
- the epistemic map (especially `hiding`), ledger internals, arc bookkeeping
- scheduler, audit, payload or queue debugging
- any control that steers the story (Advance / Nudge / Probe / Suggest / `set`)

Player-mode surfaces may show: where the story is narratively, open threads, that the machine is
working (or stuck and self-correcting), memory curation of established facts, display toggles,
Restart, and the ⚑ flag control (persona `both` — it is meta, not steering).

## Session journal & human-eval protocol

The journal correlates the rings that already exist — boundary log, fired transitions, extraction
audits and accepted deltas, reconciliation events, payload captures, talk decisions — plus status
transitions and player flags (the only two things persisted, capped at 200, in
`chat_metadata … extras.journal`). Nothing new is recorded step by step.

```bash
node scripts/debug/so-journal.mts export
```

Writes `.debug/journal-<chat>.md` and `.json`. `show` prints the timeline; `--kind` and `--limit`
filter it. In play, the ⚑ control in the drawer files a flag (optional note) at the current
boundary and message.

Human-eval session protocol (the "baseline human rubric", repeated at plan 08):

1. Fresh chat, real model, no scripts — the user plays ~15 messages.
2. Flag anything that felt wrong with ⚑ as it happens.
3. Export the journal, then answer the J3 checklist (1–5 + free text) plus the standing question.
4. File scores and the export path in the plan's Gate record.
