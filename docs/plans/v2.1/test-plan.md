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
- Player-surface verbs (plan 04): `so-ui.mts pipeline` prints the derived pipeline slice next to what is
  actually on screen; `so-ui.mts assert-player-clean` walks every player-mode tab and fails on any
  checklist violation. Both are also scenario/journey steps (`ui: {action: "pipeline"|"assert-player-clean"}`).
  Plan 08 made it a **selector sweep as well as a text sweep**: across the drawer (every tab it
  offers), the HUD strip and the settings panel, no steering control or author-only panel may be
  present in the DOM — driver controls (`[aria-label="In-play driver"|"Advance target"|"Nudge text"|
  "Driver suggestions"|"Driver report"|"Active nudge"]`), the curator ring (`#so-stagecraft`,
  `[data-so="curator-*"]`) and the author's story controls (`#so-edit-story`, `#so-update-story`,
  `#so-fix-with-wizard`). A renamed label can no longer slip a control past the checklist. `/cp` and
  the other author slash commands stay typeable by anyone — they are documented author-only (plan 04),
  and the sweep asserts no player-visible surface offers them.
- Author-loop verbs (plan 05): `so-ui.mts studio-save [keep|restart|cancel]` clicks the Studio's Save and
  answers the invalidation popup (`studio_save` as a step key, `ui: {action: "studio-save", choice}` as a
  ui action); `expect: {storyVersion: {played, library, drifted}}` and
  `expect: {hotSwap: {applied, classification, choice, dropped, boundaryAtLeast}}` assert what the update
  did to the run.
- Wizard verbs (plan 06): `so-ui.mts wizard | open-wizard | new-story-wizard | wizard-run [stage] [message] |
  wizard-answer [a1|a2|a3] | wizard-apply [index]` drive the wizard through the real UI (the review step is
  the feature, so nothing here writes the draft store); the same names are `ui` actions in scenarios and
  journeys. `copilot: {action: "provision", op, expectFail?, messageContains?}` exercises one provisioning
  op through the runtime — which is where create-only lives — and `copilot: {action: "stage", expect:
  "questions"}` asserts the interview variant. `assets: {action: "list"|"expect"|"remove"|"assert-clean",
  marker}` is the asset ledger (`so-assets.mts`; in a journey it is scoped by the run's baseline).
- Stagecraft verbs (plan 07): `stagecraft: {action: "curate"|"accept"|"reject"|"accept-op"|"reject-op"|"apply"|"state"}`
  drives the World Info curator through the runtime (`curate` is a real model call unless a
  `debugResponse` is given), and `ui: {action: "stagecraft"|"curator-accept"|"curator-reject", index?, text?, pick?: "text-first", minOps?}`
  reviews it through the drawer the way an author does (`so-ui.mts stagecraft | curator-accept | curator-reject`).
  `expect: {background}` asserts the background the chat is showing; `expect: {stagecraft: {...}}` asserts
  proposals, applied ops, op statuses, the allowlist scope and dropped lines.
- Migration verbs (plan 08): `seed_metadata: {file}` writes a captured `chat_metadata.story_orchestrator`
  blob into the sandbox chat **verbatim** and hydrates it through the ordinary load path — a migration
  gate must run over bytes this build never wrote, not over state synthesized from the live snapshot.
- Nondeterminism verbs (plan 08): `wait: {talkDecisions: n}` waits for speaker direction to record a
  decision instead of reading it the instant the chat goes idle; `stagecraft: {action: "curate",
  expectOps: 1, attempts: 3}` re-asks the curator when a small model formats every line unparseably,
  and `expect: {stagecraft: {opsAtLeast: 1}}` fails a proposal that carries nothing to review (a
  0-op proposal used to satisfy `proposalsAtLeast`).
- Cleanup restores group members **after** `/delchat` and reports the resulting `disabledMembers` —
  enabling them while the sandbox chat is open is silently undone (plan 04 live finding).
- Artifacts per run: `.debug/journey-<id>.md` (matrix + human checklist) and a timestamped
  `.debug/*_journey-<id>.json`. Both, and the config snapshot, are protected from `.debug` rotation.
- Acceptance archive (plan 08, delegated decision): the run that greened a gate is copied out of
  `.debug` into `test/journeys/records/<gate>/` — per-journey matrix + JSON record, journal exports and
  a `README.md` naming the tree, the model and the operator. `.debug` is scratch and rotates; a gate
  record must still be readable a year later.

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
| J2 | author-loop | Empty Studio → authored story → play → edit → continue, incl. an invalidating edit and its choice popup; author-view driver (Probe + Nudge) | 9 | 2 | Plan 05's gate journey |
| J3 | player-session | Real session on sun-ruins: transitions announced, memory recalled, spoiler sweep, journal | 8 | 5 | The human-eval workhorse |
| J4 | return-and-adopt | Simulated multi-day gap → away recap on return; mid-chat adoption via memorize backlog | 4 | 2 | Uses the `reload` verb (real return path) |
| J5 | group-direction | talk_control + npc_replies + cast_changes; per-speaker private injection in the payload | 6 | 1 | Restores the group roster in cleanup |
| J6 | mutation-storm | Edit/delete around a boundary; rollback correct and comprehensible | 4 | 1 | Deterministic (`extract` with a debug response for the latch only) |
| J7 | long-haul | Full sun-ruins play-through to the finale; success-criteria hooks | 8 | 2 | **Expensive** — plan 01 (baseline) and plans 07/08 (acceptance) only |
| J10 | identity-and-settings | Story identity, pinning, settings homes, migration, Restart | 9 | 2 | Plan 02's gate journey; plan 08 added J10.11, the migration over a real captured blob |
| J9 | wizard | Premise → interview → staged proposals → provisioned ST assets → playable story | 5 | 2 | Plan 06's gate journey. **Writes real ST assets** — every one is marked `SO-J9` and deleted in cleanup |
| J8 | stagecraft | Background effect + the World Info curator: propose off-path, review, apply at a boundary, journal it, touch nothing else | 3 | 1 | Plan 07's gate journey. **Writes a real lorebook** — marked `SO-J8` and deleted in cleanup |

## Checks

Each check names the finding(s) it proves (`U1…U8`, `I1…I6`, `D1…D3` from the overview's findings
register), so plan 08's Evidence column writes itself.

### J1 first-contact

| Check | Mode | Findings | What it proves |
|---|---|---|---|
| J1.1 | auto | U6 | With nothing installed, the drawer says what to do next |
| J1.2 | auto | U1 | A brand-new chat has extraction enabled by default |
| J1.3 | auto | U1 I3 | The memory profile is install-level, not stored per chat (`requires: global-extraction-settings`); J10.6 proves a new chat inherits it |
| J1.4 | auto | U6 | A first-run path walks an empty install to playable: the settings panel offers "New story (wizard)" and it opens the wizard on an empty draft (`requires: first-run-path`) |
| J1.5 | auto | U6 | Importing the shipped example from the settings panel makes it playable |
| J1.6 | auto | U1 | After configuring the memory model in the panel, the first real transition fires |
| J1.7 | auto | U6 | The transition is announced to the player in chat |
| J1.8 | human | U6 | "Could you tell what to do to get a story running?" |
| J1.9 | human | U1 U6 | "Was it clear the story was running and would advance on its own?" |

### J2 author-loop

| Check | Mode | Findings | What it proves |
|---|---|---|---|
| J2.1 | auto | U7 | The Studio opens on an empty draft and offers Story/Qualities/Checkpoints/Transitions/Roster/Diagnostics |
| J2.2 | auto | U7 | Roster members are authorable in the Studio UI (`requires: studio-roster-editor`) |
| J2.3 | auto | U7 | Id/version, description, dramatic shape, requirements (persona/cast/lorebook) and thread bridges are authorable (`requires: studio-requirements-editor`) |
| J2.4 | auto | U2 | A story keeps one identity across edits: re-import updates the record instead of forking |
| J2.5 | auto | U2 U7 | The drawer's author view opens Studio on the story this chat plays (`requires: drawer-edit-story`) |
| J2.6 | auto | U2 | Saving a compatible edit from this chat hot-swaps it: boundary and blackboard survive (`requires: hot-swap`) |
| J2.7 | auto | U2 | An invalidating edit asks first; "keep playing" drops only the orphaned value and the run continues |
| J2.8 | auto | U2 | "Cancel" leaves the chat on its pinned version while the library keeps the edit (identity reads drifted) |
| J2.9 | auto | U3 | The author-view driver still works in play (Probe + Nudge, real model) |
| J2.10 | human | U7 | "Could you author a playable checkpoint without JSON?" |
| J2.11 | human | U2 | "After editing mid-play, did the chat behave as expected — including when it asked you to choose?" |

### J3 player-session

| Check | Mode | Findings | What it proves |
|---|---|---|---|
| J3.1 | auto | — | The story loads and the first real transition fires from play alone |
| J3.2 | auto | — | The checkpoint change is announced in the chat |
| J3.3 | auto | U3 | Player mode shows no author-only internals — `ui: assert-player-clean` walks every player tab against the checklist below, plus an explicit sweep |
| J3.4 | auto | U8 | Player surfaces avoid implementation vocabulary (checkpoint ids, boundary, audit counts, "extractor") |
| J3.5 | auto | U4 | One composed narrative "where am I" surface exists — `getNarrativeStatus()` sections and `#so-player-overview` (`requires: narrative-status`) |
| J3.6 | auto | U5 | An induced stall shows the player signal (`#so-stall-signal`, "re-checking") and it clears when the real re-read lands (`requires: stall-signal`) |
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
| J5.6 | auto | U3 | Private per-speaker injection: the journey turns the epistemic capability on, runs the **real** epistemic/ledger pass over a scene with two secrets, then asserts each drafted member's injected block carries only their own lines and that the two blocks differ (`requires: epistemic-ledger`) |
| J5.7 | human | — | "Did the right characters speak, and did silence read as a choice?" |

### J6 mutation-storm

| Check | Mode | Findings | What it proves |
|---|---|---|---|
| J6.1 | auto | — | A boundary is committed and a gate latches |
| J6.2 | auto | — | Editing the message that carried the delta rolls the story back |
| J6.3 | auto | — | Deleting the last message leaves engine state consistent |
| J6.4 | auto | U5 | The player is told the story stepped back — `#so-rollback-notice` in the drawer, chip in the HUD (`requires: rollback-notice`) |
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
| J10.11 | auto | I3 | The same migration over a blob **captured verbatim from a real pre-v2.1 chat** (`test/fixtures/legacy-v2-chat-blob.json`, provenance recorded in the file): both stories survive, keys are id-keyed, and checkpoint / boundary / blackboard values are unchanged |
| J10.9 | human | U6 | "Was it clear which settings apply to every chat and which only to this one?" |
| J10.10 | human | U6 | "Did the memory-model self-test tell you something you could act on?" |

### J9 wizard

| Check | Mode | Findings | What it proves |
|---|---|---|---|
| J9.1 | auto | D3 U6 | The wizard interviews before proposing (≤3 in-protocol questions), and "You decide" always proceeds to a valid proposal (`requires: wizard-interview, wizard-entry-points`) |
| J9.2 | auto | D3 | Create-only is enforced in op validation, not the prompt: an existing character, a non-story lorebook, a duplicate group name and an unknown cast member are all rejected, and nothing is created (`requires: wizard-provisioning`) |
| J9.3 | auto | D3 | Every provisioning step is its own editable card, applied one at a time, and "Accept all" cannot reach them |
| J9.4 | auto | U6 | "Fix with wizard" opens the provisioning stage pre-filled from the unmet requirements |
| J9.5 | auto | D3 U6 | The provisioned story is playable: requirements go green and a real transition fires from real play |
| J9.6 | human | D3 | "Starting from a one-line premise, did the wizard get you to a story you actually wanted to play?" |
| J9.7 | human | D3 U6 | "When it offered to create characters, lore and a group, did you trust what it was about to do?" |

**Asset-leak safety.** J9 writes to the user's real install, so cleanup is load-bearing rather than
hygiene. Every asset it asks for is named with the `SO-J9` prefix, and `so-assets.mts` scopes both
listing and deletion to that marker **plus** whatever a *test* wizard session recorded as created
(`extensionSettings["story-orchestrator"].wizardSessions[].applied`) — the second source catches a
model that drifted off the prescribed name. A test session is one keyed by the slugged marker
(`so-j9-wizard`), or, via the baseline the runner takes before setup (`snapshotAssets`), any entry
recorded during this run. A real author's wizard sessions are never read, their assets never
deleted, their resume state never cleared; an asset that existed before the run is spared even when
a test ledger names it (`protected` in the record), and only the test sessions are dropped.
`cleanup.removeCreatedAssets` runs in the runner's `finally`, so a failed check still cleans up,
and it re-lists afterwards against the pre-removal ledger: anything left is reported as a leak and
fails the run.

```bash
node scripts/debug/so-assets.mts assert-clean --marker SO-J9
```

### J8 stagecraft

| Check | Mode | Findings | What it proves |
|---|---|---|---|
| J8.1 | auto | D1 | A checkpoint's `background` effect switches the ST background deterministically, both ways, and re-applies on hydrate (`requires: background-effect`) |
| J8.2 | auto | D1 | The WI curator proposes off-path from real canon, the author reviews it on the drawer cards, the boundary writes it, and the result reaches the server file and the next generation's prompt, **whatever op kind the model chose** (`requires: wi-curator, curator-review-ring`). `curator-accept pick: text-first` edits the first text change when there is one (edited text must land in `/api/worldinfo/get` and every captured prompt). Otherwise it accepts the first switch as proposed (`disable` on the server file, entry gone from the prompt). A before-control proves the untouched entry was in the first prompt, so its later absence means something. Prompts come from `GENERATE_AFTER_DATA` (main generation only), not a fetch wrapper that also sees memory-model calls |
| J8.3 | auto | D1 | Every curator action is journaled; the blackboard, memory tiers, arcs, epistemic map and ledger are untouched; a write outside `stagecraft.lorebooks` is refused at the write edge. The before-snapshot waits for `wait: {schedulerIdle}`: on a slow model J8.2's last turn is still being read (memory 8→9, 2026-09-19), and that is not the curator |
| J8.4 | human | D1 | "Did the presentation (scene, background, cast) feel handled for you, without you asking?" |

**Curator rubric** (score the proposals J8.2 produced, alongside the J8.4 score):

| Dimension | 1 | 3 | 5 |
|---|---|---|---|
| Necessity | changed something the story had not changed | plausible but optional | only what the story had actually overtaken |
| Precision | rewrote a whole entry to fix a clause | patched roughly the right span | patched exactly the stale span |
| Scope discipline | reached for an entry it was not shown | stayed in scope | stayed in scope and said what it deliberately left alone |
| Reviewability | had to open the lorebook to understand it | readable after a re-read | obvious what would change, before accepting |

**Asset safety.** J8 creates one real lorebook (`SO-J8 Lore`) and writes entries into it. It is
marked, `cleanup.removeCreatedAssets: "SO-J8"` deletes it, and the run reports a leak as a failure —
the same load-bearing cleanup as J9. The curator is switched on *inside* the journey and the global
config snapshot is restored in cleanup, so an interrupted run never leaves the flag on.

```bash
node scripts/debug/so-journey.mts run J8
```

## Spoiler checklist (player mode) — v2 (plan 04)

Applied automatically by J3.3 (`ui: assert-player-clean` + an explicit sweep) and
`node scripts/debug/so-ui.mts assert-player-clean`, and by the human checks J3.10/J3.11. Any plan
that adds a player-visible element adds a row here.

| Element | Persona | Where |
|---|---|---|
| Narrative view: where you are · recently · open threads · the story so far · noted · status | player | `PlayerOverview` (drawer Overview), away-recap popup, `/story recap` |
| Checkpoint **name** + objective, tension **level word** (no numbers) | player | narrative "now" section, HUD |
| Open-arc texts, canon prose (never canon-lite) | player | narrative "threads"/"story" sections, `/story threads` |
| Pending deltas as "N things noted, apply next turn" (no quality keys) | player | narrative "pending" section, HUD chip |
| Pipeline status + stall/needs-setup/error signal + setup deep link | player | `#so-pipeline-status`, `#so-stall-signal`, `#so-hud-pipeline`, `#so-open-story-settings` |
| Rollback notice after an edit/delete | player | `#so-rollback-notice`, HUD chip |
| Missing requirements (persona / cast / lore) | player | `#so-player-requirements` |
| Memory curation of established facts (pin / edit / exclude, evidence tooltip), Memorize chat | player | drawer Memory tab |
| ⚑ flag moment, display toggles, Restart story (`#so-restart-story-drawer`) | both | drawer Overview footer, settings panel |
| "Edit story" (opens Studio on this chat's story) and "Update to v*N*" (takes a newer library version) | author | drawer Overview footer (`#so-edit-story`, `#so-update-story`) |
| "Fix with wizard" on the unmet-requirements panel | author | drawer Overview author view (`#so-fix-with-wizard`) |
| The wizard itself — stages, interview question cards, proposals, provisioning cards, "created so far" | author | Studio Wizard tab (`#so-wizard`, `#so-wizard-questions`, `[data-so="provisioning-card"]`, `#so-wizard-created`) |
| "New story (wizard)" and "Start with the wizard" entry points | author | settings panel (`#so-new-story-wizard`), Studio empty state (`#so-start-wizard`) |
| Story-update choice popup (keep playing / restart / cancel) — only ever raised by the author's own save | author | plan-05 invalidation flow |
| Superseded / folded memory entries, importance · expiration · recall counts, last audit id | author | drawer Memory tab (author view) |
| Arc bookkeeping (pin/remove/resolved), epistemic map (esp. `hiding from`), state ledger | author | drawer Memory tab (author view) |
| Checkpoint id, boundary number, pipeline state name + error detail, raw pending writes | author | drawer Overview "Engine" panel |
| Tension numbers, expected tension, steering hint | author | drawer Overview (author view) |
| Convergence bars (they name a future anchor and its distance) | author | drawer Overview (author view) |
| Blackboard / Scheduler / Payload tabs, stall re-check detail, talk decisions | author | drawer tabs (author view) |
| World Info curator review ring — proposals, editable replacement text, accept / decline, dropped lines | author | drawer Scheduler tab (`#so-stagecraft`, `[data-so="curator-proposal"]`, `[data-so="curator-op"]`) |
| Curator settings (on/off, accept mode) and the "no lorebook listed" notice | author | settings panel (`#so-curator-enabled`, `#so-curator-accept-mode`, `#so-curator-unscoped`) |
| The curator's write scope (`stagecraft.lorebooks`) and a checkpoint's `background` file | author | Studio Story tab (`[data-so="stagecraft"]`) and Checkpoints → Effects |
| The background switch itself — the player sees the scene change, never the filename or the effect | player | ST background |
| DriverPanel in full — Suggest / Probe / Report / Advance / Nudge, unmet gates | author | drawer footer (author view + copilot on) |
| `/cp` in full (`list`, `state`, `activate`, `set`, `converge`, debug `extract`/`expand`) | author | slash commands |

Turning **Author view** on asks for confirmation first: it is a one-way look behind the curtain
for that chat.

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
