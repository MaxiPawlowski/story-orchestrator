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
| J0 | runner-selftest | The runner itself: fresh-start, pass/blocked/skipped, cleanup | 4 | 1 | No LLM. Run it whenever the harness changes. J0.3 must report `blocked` (a capability this build lacks — its steps never run) and J0.5 `fail` (a step that fails on purpose), which is how "could not run" and "ran and was wrong" are shown to be distinct; J0.4 is a placeholder human row proving the checklist emits and reports `skipped` |
| J1 | first-contact | Cleared install → install state → import example → configure → first real transition | 7 | 2 | Only journey that clears global config |
| J2 | author-loop | Empty Studio → authored story → play → edit → continue, incl. an invalidating edit and its choice popup; author-view driver (Probe + Nudge) | 9 | 2 | Plan 05's gate journey |
| J11 | judgment-backend | The judgment model (v2.2 plans 01–04, 06–07): plugin reachable with a key, off by default, deciding speaker direction when opted in, timeout fallback, own call ring, no key leak; memory lines verified before storing, judged consolidation; scene read (trigger, tracker block, rollback, union with the regex); lore-select (force, seam, disabled entries, dry/quiet, off); typed extraction and the stall check; expansion review, variants and prepare-ahead; curator focus | 26 | 0 | Needs the server plugin and `enableServerPlugins: true`; without it J11.1 fails with the reason and the rest block |
| J3 | player-session | Real session on sun-ruins: transitions announced, memory recalled, spoiler sweep, journal | 8 | 5 | The human-eval workhorse |
| J4 | return-and-adopt | Simulated multi-day gap → away recap on return; mid-chat adoption via memorize backlog | 4 | 2 | Uses the `reload` verb (real return path) |
| J5 | group-direction | talk_control + npc_replies + cast_changes; per-speaker private injection in the payload | 6 | 1 | Restores the group roster in cleanup |
| J6 | mutation-storm | Edit/delete around a boundary; rollback correct and comprehensible | 4 | 1 | Deterministic (`extract` with a debug response for the latch only) |
| J7 | long-haul | Full sun-ruins play-through to the finale; success-criteria hooks | 8 | 2 | **Expensive** — plan 01 (baseline) and plans 07/08 (acceptance) only |
| J10 | identity-and-settings | Story identity, pinning, settings homes, migration, Restart | 9 | 2 | Plan 02's gate journey; plan 08 added J10.11, the migration over a real captured blob |
| J9 | wizard | Premise → interview → staged proposals → provisioned ST assets → playable story | 5 | 2 | Plan 06's gate journey. **Writes real ST assets** — every one is marked `SO-J9` and deleted in cleanup |
| J8 | stagecraft | Background effect + the World Info curator: propose off-path, review, apply at a boundary, journal it, touch nothing else; continuity warden notes (auto, review lapse, off) (v2.2 plan 05) | 6 | 1 | Plan 07's gate journey. **Writes a real lorebook** — marked `SO-J8` and deleted in cleanup |
| J12 | unaided-schedule | The configuration every real install runs and no journey covered: the shipped default cadence, three real player turns, **no `runExtractionNow` and no `/cp`** — a read fires on its own with reason `cadence`, an accepted delta's evidence quotes the player's own words, and the checkpoint it opens applies its effects through the owned ledger (v2.3 plan 01 §G, the S13 seed; written 2026-09-22) | 5 | 0 | Runs on the **adventurer** story at cadence **3**. J12.1 refuses to run at any other cadence rather than redefining itself — this install currently reads 1, so J12 fails its own precondition here until that is set back to 3 |

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
| J10.15 | auto | T11 | A v4 blob (the format before v5) shows the one unreadable notice, refuses a selection with its bytes kept; a confirmed Restart writes a v5 blob, and a real turn saves `engineHistory`, `visitedPath` and `pinnedStory` (v2.5 plan 11; J10.8 and J10.11, the v2 migration checks, were deleted with the migration) |
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
a test ledger names it (`protected` in the record), and only this run's own sessions are dropped —
marker-keyed, or one whose ledger entry was actually deleted.
`cleanup.removeCreatedAssets` runs in the runner's `finally`, so a failed check still cleans up,
and it re-lists afterwards against the pre-removal ledger: anything left is reported as a leak and
fails the run.

**An empty baseline is "unknown", never "nothing"** (2026-09-20). A baseline captured while the
settings root was cleared classified every *foreign* wizard session's ledger as "recorded during
this run", spared nothing for having existed before, and rebuilt `wizardSessions` from that
emptiness — a J11 run deleted another session's character card and lorebook and wiped its wizard
session while reporting `clean:true`. `snapshotAssets` now returns `{trusted, untrusted[]}` and
`baselineTrust` re-checks the inventory, so an untrusted (or empty-but-trusted-looking) baseline is
ignored and cleanup falls back to marker-only scope, reporting `baselineUntrusted`. The baseline is
archived at `.debug/so-journey-asset-baseline.json` so a bad cleanup is provable from the artifact.
`restoreGlobalConfig` also refuses to write an empty snapshot over a populated config: that clear is
self-perpetuating (every later run snapshots the emptiness) and it silently nulls
`extraction.profileId`, which is what turns the next real-LLM gate into a no-profile run.

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
| J8.5 | auto | — | Warden `auto`, judge on, a fact seeded through `applyExtractionAudit` ("the old stone bridge … collapsed"). A scripted `/sendas` reply that contradicts it → one `curator: "warden"` note, `accepted`. The next loud generation's `GENERATE_AFTER_DATA` prompt carries the note text and the op turns `applied`. The generation after that carries it only if a newer reply was flagged in turn (logged as its own branch) |
| J8.6 | auto | — | Warden `review`: the same contradiction → a `pending` note. A newer `/sendas` reply commits first → the note is `rejected` with `lapsed`, and no captured prompt contains `Continuity: established` |
| J8.9 | auto | — | Warden and curator focus both off, judge master on: a contradicting reply plus a generation → no `judge warden` or `judge curatorFilter` call, no new proposal, no note in the prompt |
| J8.10 | auto | — | v2.4 plan 07 T22. `judge.uses.agencyCheck` on (or `--judge-uses agencyCheck --warden-mode auto`), warden accept mode `auto`: a player line, then a scripted `/sendas` reply that writes the player's act and words → one `family: "agency"` note, `accepted`. The next loud generation's `GENERATE_AFTER_DATA` prompt carries the `Agency:` line and the op turns `applied`; over-steer recorded (family `agency`). Off arm (`--judge-uses off`): no warden call, no `Agency:` in any prompt |
| J8.11 | auto | — | v2.4 plan 07 T22, review: the agency note waits `pending`; a newer reply lapses it; no `Agency:` line reaches any prompt |
| J8.12 | auto | — | v2.4 plan 07 T23. Story `j8-house-rules.story.json` (two `house_rules`), `judge.uses.houseRules` on, `auto`: a reply that fires a flintlock → a `family: "house-rule"` note naming the firearm rule verbatim; the next captured prompt carries it and the op turns `applied`; over-steer recorded (family `house-rule`). Off arm as J8.10 |
| J8.13 | auto | — | v2.4 plan 07: every warden family off (continuity warden, `agencyCheck`, `houseRules`), judge master on, a story with house rules: a player-writing reply and a rule-breaking reply plus a generation → no `judge warden` call, no proposal, no `Agency:`/`House rule:`/`Continuity:` in any prompt |

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

### J11 judgment-backend (v2.2 plan 01)

| Check | Mode | Findings | What it proves |
|---|---|---|---|
| J11.1 | auto | — | The server plugin answers `/status` with `configured: true` and a key **source** (`st-secrets` / `env` / `dotenv`), never the key |
| J11.2 | auto | — | Judge off (the default, asserted): a real group turn is decided by today's chain (`mention`/`director`/`rules`/`fallback`), zero plugin calls, empty judge ring |
| J11.3 | auto | — | Judge on + speaker direction opted in: the turn's source is `judge`, inside 1500 ms, the ring records the answering `jev-*` model, and `extras.journal` gains no judge row |
| J11.4 | auto | — | A 1 ms budget: today's chain decides, the ring records `fell back (timeout)`, and the turn still gets its reply |
| J11.5 | auto | U3 | Player mode shows nothing judge-internal (`assert-player-clean`) |
| J11.6 | auto | — | Judge settings survive a reload; no key or key-like value appears in extension settings or chat metadata |
| J11.7 | auto | — | `memoryVerify` opted in, real turn + real read: every read with memory lines leaves a `memoryVerify` record (not all fallbacks), stored confidences are 1 or down-weighted into [0.2, 0.5), a drop carries `p < 0.2` and the model; logs `no lines this read` when the model wrote none |
| J11.8 | auto | — | A scripted self-contradicting `/sendas` reply + a real read: an unsupported line lands in `verifyDrops` or the model wrote only supported lines; logs which branch ran |
| J11.9 | auto | — | `memoryPairs` opted in, seeded labelled pairs (M01 M07 M08 P21 P31, in their own `characterId` group) → `runConsolidation`: M01's newer note dropped, M07's older note superseded, M08/P21 (same owner or place, different thing) **never** superseded or dropped; logs whether P31 was decided over the confidence floor |
| J11.10 | auto | — | `memoryPairs` off, same seed in another group: zero `memoryPairs` calls; logs where the heuristic result differs from J11.9's |
| J11.11 | auto | — | `sceneTrigger` + `sceneTracker` opted in, real turn: exactly one `scene` record per committed boundary (not all fallbacks), and `getSceneRead().messageId` is the newest message |
| J11.12 | auto | — | A scripted time skip the regex misses (held-out SH01) → the `scene:judge` P0 read runs and its window reaches the break; logs the no-trigger branch (the cadence read still confirms, as today) |
| J11.13 | auto | — | The tracker block (`story_orchestrator_scene`, depth 1) is in every main prompt ST sends on the next generation (`GENERATE_AFTER_DATA`) and carries every over-floor field; with none over floor, no block is sent |
| J11.14 | auto | — | Deleting the message a scene read belongs to clears the read and the block; the next boundary builds both again |
| J11.16 | auto | — | Marked `SO-J11 Lore` (40 entries whose keys never appear in play), lore-select opted in: the player asks for the back-room password → the `Back room password` entry is activated in every scan of the turn, the first `lore` record has trigger `MESSAGE_SENT` and names it, later group members pick again at `GENERATION_STARTED` |
| J11.17 | auto | — | The switched-off `Vault combination` entry (disabled as checkpoint gating does) is never picked, activated, or in the prompt, even when asked for directly |
| J11.18 | auto | — | A dry run (`generate(…, dryRun)`) and a quiet `/gen` make no `lore` call |
| J11.19 | auto | — | Lore-select off: no `lore` call, and the keywordless password entry is not activated (only a force could have done it). Cleanup removes the marked book (`removeCreatedAssets: SO-J11`) |
| J11.20 | auto | — | `so-j11-typed`, cadence 50, typed extraction opted in: the player takes the key, a judged read writes `has_key=true`, and the transition to The Vault fires on the next turn, far before any cadence read, with no LLM read writing `has_key` and the Blackboard reader `judge` |
| J11.21 | auto | — | Cadence 1 + typed extraction: every LLM read with a judged step leaves the judged keys out of its scope and prompt, and keeps the unsettled hinted `guard_mood` (residual scope) |
| J11.22 | auto | — | Every judged write of the latching `guard_mood` has confidence ≥ 0.9; logs whether the judge settled it at all |
| J11.23 | auto | — | `so-j11-stall`, cadence 50, stall check opted in: a lever pulled six turns ago is written straight from the stall check (`judge:reconcile`, no `reconcile:` LLM read) and the transition fires; a door nobody opens stays a genuine stall (event open, no re-read) with `#so-stall-signal` showing |
| J11.24 | auto | — | Typed extraction and the stall check off: cadence reads carry no `judged` step or judge-sourced delta, and the judged-read ring does not grow |
| J11.25 | auto | — | `so-j11-expand`, prepare-ahead + expansion review + 2 variants: heading for the watchtower queues the tower's stub (`origin: lookahead`) before the tower is reached; on arrival the prepared chain is used, or a stale/failed one is re-queued and expanded (never left blocking); the entry records 2 generations and a pick, and the ring has `critic` calls. Logs which branch ran |
| J11.26 | auto | — | `so-j11-lore` with `stagecraft.lorebooks = [SO-J11 Lore]` (40 entries), real curator passes: filter **off** → no `curatorFilter` call, no `lastPass.focus`, every entry in the prompt; filter **on** → exactly one call, `lastPass.focus.shown < total`, fewer entries in the prompt, and no proposed op names an entry the prompt left out. A judge fallback is logged as its own branch (everything shown) |
| J11.15 | auto | — | Every scene usage off: zero `scene` calls, no stored read, no block. Then trigger on + a blackboard `location` change with no text cue: the heuristic's `scene:location` read still runs (union), logging whether the judge added any read |

The story (`j11-judge.story.json`) gives every roster member a role and authors **no** director, so
the install-wide flag is the only opt-in. The calibration half of the gate is separate:
`node scripts/debug/so-judge.mts calibrate --use director|memory-verify|memory-pairs --min 0.85`
(page → plugin → API; `--fixture memory-pairs-holdout` for the held-out pairs) and, off the page,
`scripts/spike/typesafe/calibrate-node.mts <use>` (`--record` re-records the memory goldens jest replays).

```bash
node scripts/debug/so-journey.mts run J11 --strict
```

### J12 unaided-schedule (v2.3 plan 01 §G, the S13 seed)

Written 2026-09-22, because this was the configuration **every real install runs and no journey
covered**: everything else either sets a cadence or reads on demand. The story is the **adventurer**
one (`adolion-adventurer` v9, group `1789797226071`) at the **shipped default cadence 3**, and the
journey never calls `runExtractionNow`, never issues `/cp` and never plants a debug response.

| Id | Mode | Goal |
|---|---|---|
| J12.1 | auto | the shipped default cadence (3) is in effect, extraction is on, a profile is set, and the audit ring is **empty** — so the read J12.3 observes cannot be a leftover |
| J12.2 | auto | the story is selected and its requirements are green; the failure names the missing lorebooks/members (the v2.3 plan 04 guard: an unestablished lorebook makes gated latches silent no-ops and surfaces 300 s later as a checkpoint that never arrives) |
| J12.3 | auto | three real turns produce a read with **no help** — reason `cadence` — and its window reaches the player's latest message, with ≥1 delta accepted |
| J12.4 | auto | an accepted delta's **evidence quotes the player's own words** from inside the read's window: asserted as the property (some distinctive token shared) with the evidence reported, never as a fixed string |
| J12.5 | auto | the checkpoint the read opened applied its effects — an owned ledger row per effect with status `applied`, the guild-hall `author_note` among them — and the transition fires. **This is the leg the model decides**, so it is its own check: J12.3/J12.4 remain the schedule's evidence |

J12.1 refuses to run at any other cadence rather than redefining itself. This install reads cadence
**1** (measured 3 on 09-20 and 09-21 10:17, 1 from 09-21 22:27 on, from the run headers in `.debug/`),
so J12 currently fails its own precondition here — set it to 3 in the panel, which is also the
shipped default.

```bash
node scripts/debug/so-journey.mts run J12 --strict
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
| Continuity warden cards (flagged facts, editable note, lapsed / withdrawn) and the warden settings rows (v2.2) | author | drawer Scheduler tab (`[data-curator="warden"]`, `[data-so="warden-fact"]`), settings panel in author view (`#so-warden-enabled`, `#so-warden-accept-mode`) |
| World Info curator review ring — proposals, editable replacement text, accept / decline, dropped lines | author | drawer Scheduler tab (`#so-stagecraft`, `[data-so="curator-proposal"]`, `[data-so="curator-op"]`) |
| Inner voice (v2.6 plan 06): drives, current motives, open intents, the latest beat and its status | author | drawer Scheduler tab (`#so-inner-voice`, `[data-so="inner-voice-row"]`, `[data-so="inner-voice-beat"]`) |
| Inner voice switches (v2.6 plan 06): reasoning harvest, inner beat, beat fan-out | author | settings panel in author view (`#so-inner-voice-settings`, `#so-inner-harvest`, `#so-inner-beat`, `#so-inner-fanout`) |
| Curator settings (on/off, accept mode) and the "no lorebook listed" notice | author | settings panel (`#so-curator-enabled`, `#so-curator-accept-mode`, `#so-curator-unscoped`) |
| The curator's write scope (`stagecraft.lorebooks`) and a checkpoint's `background` file | author | Studio Story tab (`[data-so="stagecraft"]`) and Checkpoints → Effects |
| The background switch itself — the player sees the scene change, never the filename or the effect | player | ST background |
| DriverPanel in full — Suggest / Probe / Report / Advance / Nudge, unmet gates | author | drawer footer (author view + copilot on) |
| Judgment-model settings: status, key field, master switch, per-usage opt-ins with what each sends, self-test (v2.2) | both | settings panel (`#so-judge`, `#so-judge-key`, `#so-judge-enabled`, `#so-judge-use-*`, `#so-judge-self-test`) |
| Judge decision sources and probabilities (`source: judge`, confidence, via), the judge call ring (v2.2) | author | drawer Scheduler tab talk decisions (author view), session journal export |
| Roster role lines and the "missing roles" hint (v2.2) | author | Studio Roster tab (`[data-so="roster-roles-hint"]`), wizard provisioning card |
| Memory lines the judge declined to store ("Not stored", with its probability) and "Store anyway" (v2.2) | author | drawer Memory tab (author view, `[data-so="memory-not-stored"]`, `[data-so="memory-store-anyway"]`) |
| Scene location as "At <place>." in the narrative (only when over floor) (v2.2) | player | narrative "now" section, `/story recap` |
| Expansion card judge line (contradicts / advances / new character, variants written and picked, prepared ahead) and the expansion review / prepare-ahead / variant settings (v2.2) | author | drawer Scheduler tab (`[data-so="expansion-judge"]`), settings panel in author view (`#so-judge-use-expansion-critic`, `#so-judge-use-expansion-lookahead`, `#so-judge-expansion-variants`, `#so-judge-expansion-pick`) |
| Lore forced this turn (entry titles + p, the triggering event) (v2.2) | author | drawer Payload tab (`[data-so="lore-forced"]`) |
| The Studio "Lore-select" books/count field and the `lore-select-inactive` diagnostic (v2.2) | author | Studio Story tab (`[data-so="lore-select-field"]`) |
| Scene read panel: every scene probability, and "Heading toward" (future checkpoint names) (v2.2) | author | drawer Overview engine panel (`[data-so="scene-read"]`, `[data-so="scene-heading"]`) |
| The Studio "Scene read" places/times field and the `scene-read-location-empty` diagnostic (v2.2) | author | Studio Story tab (`[data-so="scene-read-field"]`) |
| `/cp` in full (`list`, `state`, `activate`, `set`, `converge`, debug `extract`/`expand`) | author | slash commands |
| Inline timeline L1 "Story" chips under a message: new checkpoint by **player name** (or "The story moved on"), "Remembered: …" (facts tier, live, not character-private), thread opened/resolved, "X joined/left", "The scene changed", tension **word**, "Stepped back to …" (v2.6 plan 08) | player | `#chat [id^="so-inline-"] [data-so="inline-strip"]`, `[data-so="inline-chip"]`, `[data-so="inline-item"][data-level="1"]` |
| Inline timeline L2 "Behind the scenes": "Lore consulted: N entries" (names only with the story's `display.lore_names_public`, never a checkpoint-gated entry), scene summarized / memories folded, "N things noted, apply next turn", the live reading/stall/save line, "X was chosen to speak" (under the reply only), the agency line (v2.6 plan 08) | player | `[data-so="inline-item"][data-level="2"]` |
| Inline timeline L3/L4 rows (gate + blackboard before→after, deltas `q=v` + evidence, rejected lines, lore entries book · comment, curator/warden ops with Accept/Decline, judge calls, stall re-checks, effect-ledger failures; L4 prompts, raw replies, evaluated values, payload keys), item detail, inline actions and the inspector button — effective level is capped at 2 without Author view (v2.6 plan 08) | author | `[data-so="inline-item"][data-level="3"\|"4"]`, `[data-so="inline-item-detail"]`, `[data-so="inline-action"]`, `[data-so="inline-inspect"]` |
| Message inspector: one message's rows by category, opened from an inline chip (v2.6 plan 08, W18) | author | drawer `#so-inspector`, `[data-so="inspector-section"]` |
| Inline timeline level, categories and window (`#so-inline-level`, `[data-so="inline-category"]`, `#so-inline-window`) and "Also post a chat note when the checkpoint changes" (`#so-announce-transitions`) (v2.6 plan 08) | both | settings panel Display group |
| "Your story": each ended chapter's **player title** + SHORT line, opening to its SUMMARY (and the epilogue once the story ended), "Now: <player title>", ⚑ flag a summary for the author — never a chapter id (`arrival#1`), status, range, boundary, consequence sources or OPEN dispositions (v2.6 plan 07) | player | drawer Overview (`#so-player-chapters`, `[data-so="player-chapter"]`, `[data-so="player-chapter-current"]`, `[data-so="player-chapter-flag"]`) |
| Chapter title card `◆ Chapter N — <player title>` (a chat note at the boundary after a seal; never for an interlude or the final seal) and the "Previously — <player title>" popup on reopen (v2.6 plan 07) | player | chat note, ST popup (`.popup-content`) |
| `/story chapters`, `/story chapter <n>`, `/story chronicle` (player titles, SHORT/SUMMARY, epilogue; consequences only in the author export) and the macros `story_chapter`, `story_chapter_number`, `story_so_far`, `story_previously` (v2.6 plan 07) | player | slash commands, macros |
| Pipeline `complete` line "The story has ended. You can keep playing on in the epilogue." (v2.6 plan 07) | player | `#so-pipeline-status`, HUD |
| Chapter settings: seal, story so far, fold, "Previously…" recap, story-so-far budget (v2.6 plan 07) | both | settings panel Display group (`#so-chapter-settings`, `#so-chapter-seal`, `#so-chapter-story-so-far`, `#so-chapter-fold`, `#so-chapter-recap`, `#so-chapter-budget`) |
| Chapters panel: record ids, status (`sealed`/`degraded`/`author-edited`), message range, summary edit, re-seal, unseal, "Seal now" (v2.6 plan 07) | author | drawer Scheduler tab (`#so-chapters`, `[data-so="chapter-record"]`, `[data-so="chapter-status"]`, `[data-so="chapter-summary-input"]`, `[data-so="chapter-short-input"]`, `[data-so="chapter-save"]`, `[data-so="chapter-edit"]`, `[data-so="chapter-reseal"]`, `[data-so="chapter-unseal"]`, `[data-so="chapter-seal-now"]`) |
| The Studio Chapters editor (chapter rows, seal policy, checkpoint assignment) and the graph's chapter lanes (v2.6 plan 07) | author | Studio (`[data-so="chapters"]`, `[data-so="chapter-row"]`, `[data-so="chapter-policy"]`, `[data-so="chapter-assignment"]`) |
| The story-so-far block, the chapter bridge note, the returning-cast "Returning: …" lines and the fold count (prompt content, never rendered to the player) | author | next-turn preview / Payload tab only |
| `/cp chapters`, `/cp seal`, `/cp unseal`, and the seal-on-jump confirm raised by `/cp activate` (v2.6 plan 07) | author | slash commands |

**Player-clean sweep, chapters (v2.6 plan 07, CR-P6).** `assert-player-clean` must, in player mode, (a) find none of
the author-only chapter selectors above (`#so-chapters` and every `[data-so="chapter-*"]` except
`player-chapter*`), and (b) scan the player rows' text (`#so-player-chapters`, the title card, the "Previously"
popup) for chapter record ids (`<chapterId>#<part>`), the words `degraded` / `author-edited`, `[src:` citations, and
OPEN dispositions (`carry`, `closed-offscreen`, `abandoned`). The `so-ui` selectors for this sweep are added with the
`PLAYER_FORBIDDEN_SELECTORS` list (separate change).

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
