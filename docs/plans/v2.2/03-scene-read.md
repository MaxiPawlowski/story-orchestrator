# Plan 03 — Scene read ("current scenario data")

## Objective

Every committed boundary, one cheap judge call reads the scene: did it just break, where is it,
when is it, who is present, was the player's last message out of character, and which reachable
checkpoints is play heading toward. Code turns that into:

- an earlier and more precise **scene-break trigger** (the regex heuristic is right on 11 of 22
  cases and catches 6 of the 12 real breaks);
- a **scene tracker**: an injected block and macros that keep the roleplay model grounded (the ST
  community's "tracker" pattern, which is free at Jev prices);
- a **look-ahead** read model, which plan 07 uses to pre-generate the stub play is drifting toward.

This plan answers the user's "compute the current scenario data" and "plan checkpoints a couple of
steps ahead" (overview §Use-case review).

## Context

- Spike: README §Scene break. Jev scored 22/22 and the regex heuristic 11/22.
  `experiments/narrative.mts` holds `SCENE_PLAIN` + `SCENE_STRUCTURED` and the break-type choice.
- **How scene breaks work today.** `boundaryWork` `scene-detect` (order 50) runs
  `detectSceneBreak()`. That call advances a location/cast cursor, and on a heuristic hit it
  schedules a P0 shared read `scene:<reason>`.
  - Every shared read, cadence or triggered, asks the LLM for `SCENE_BREAK at=… reason=…` or
    `SCENE_NONE` (`memory/contract.ts:58`). The read is what confirms a break (`audit.sceneBreak` →
    `emitSceneBreak`).
  - So the current path's accuracy is the LLM's. What the heuristic costs is **latency** (a missed
    break waits for the next cadence read, `cadence` = 3 boundaries) and **wasted reads** (every
    false hit spends a P0 read on the GPU).
  - Corrected after review. The spike write-up first framed this as "50% → 100%".
- Not measured by the spike: presence, location, time of day, OOC detection, look-ahead. Overview
  rule 2 applies, so Phase A measures them first. Any field family that misses its floor is left
  out of Phase B, and the Gate record says so.
- Reuse:
  - `boundaryWork.ts` (registry).
  - The plan-03 v2.1 coordinator pattern (constructor-injected deps, own extras slice, never import
    another coordinator).
  - `constants/injectionRegistry.ts` (depth 1 is free; `findInjectionRegistryProblems` must stay
    empty).
  - `runtime/macros.ts` `registerHostMacro`.
  - `narrative.ts` (the player "now" section).
  - The talk `getWindow()` shape.
- Consumed: plan 01 (judge, roles), plan 02 (nothing directly). Regression floor: J3 (player
  session), J5 (group direction), and J6 (rollback).

## Scope

In:
- Phase A spike.
- `SceneCoordinator` + `extras.scene`.
- Scene-break trigger replacement.
- Tracker block + macros + an optional player "now" line.
- OOC flag → the extraction window annotation (only if Phase A passes).
- Look-ahead read model + author view.
- Format-2 `scene_read`.
- Calibration fixtures, J11 scene checks.

Non-goals:
- Arc resolution and tension on the judge. The LLM stays the authority: the spike had arcs at
  Artemis 22/22 vs Jev 21/22, and Jev's tension ran one level high on calm scenes, which would bias
  pacing steering.
- Confirming a scene break without the LLM read. The judge only triggers; the read still confirms.
  Direct confirmation is a v2.3 seed once J11 has data.
- Stall re-check (plan 06).
- Expansion pre-generation (plan 07).

## Deliverables

### Phase A — spike (before any `src/` change)

Add `scripts/spike/typesafe/experiments/sceneRead.mts` + `data/scene-read.json` to the harness
(same runner, cache and report). Labels are written before any Jev answer is read. Each family
includes a Spanish slice of ≥ 4.

| Family | Question shape | Cases | Floor to build |
|---|---|---|---|
| Presence | noul per roster member: "Is <name> (<role>) physically present in the scene at the end of `transcript`?" | ≥ 20 windows × 3–5 members | ≥ 0.9 per-member accuracy at 0.5 |
| Location | choice over the story's locations + `elsewhere` + `unclear` | ≥ 20 | ≥ 0.85 |
| Time of day | choice over dawn/morning/midday/afternoon/evening/night + `unclear` | ≥ 20 | ≥ 0.8 exact, ≥ 0.95 within one bucket |
| OOC | noul on the latest player message: "Is the latest message by `player` written out of character, speaking to the storyteller or system instead of acting in the story?" | ≥ 24 (half OOC, incl. `(OOC: …)`, bracketed meta, subtle "can you make X happen", in-character commands that only look meta) | ≥ 0.9, ≤ 1 false positive per 12 in-character |
| Look-ahead | noul per reachable checkpoint: "Is the play in `transcript` moving toward: <name> — <objective>?" | ≥ 20 windows × 2–4 checkpoints | AUROC ≥ 0.8, p ≥ 0.7 right ≥ 0.85 |

Record the numbers in this plan's Gate record, and state a threshold per family.

**Measured 2026-09-19** (`run.mts --only scene-read`, `jev-1.13.0`; data
`scripts/spike/typesafe/data/scene-read.json`, labels written before any answer was read):

| Family | Result | Floor | Build? |
|---|---|---|---|
| Presence | 52/53 per member at 0.5, AUROC 1.00; Spanish 13/13 | ≥ 0.9 | **yes** (`PRESENT_P` 0.7) |
| Location | 19/21 exact | ≥ 0.85 | **yes** |
| Time of day | 21/21 exact, 21/21 within one bucket | ≥ 0.8 / ≥ 0.95 | **yes** |
| Look-ahead | AUROC 1.00; p ≥ 0.7 right 18/20 | AUROC ≥ 0.8, ≥ 0.85 | **yes** (`HEADING_P` 0.7) |
| OOC | 88% on 24; 3 false positives among 12 in-character (0/21 on the windows' own last messages) | ≥ 0.9, ≤ 1 per 12 | **no** — below both floors |
| scene_break inside the full state | 22/22 at 0.5, AUROC 1.00 | 22/22 | **yes** |

What the misses say:
- **Location.** R08 ends with Max leaving the bridge for the pod bay, so the judge's `elsewhere`
  (0.78) is defensible and the label is ambiguous. R03's miss sat at 0.44, below
  `SCENE_FIELD_CONFIDENCE`, so it would not have been shown.
- **Look-ahead.** Both confident misses (R02, R04) were "moving toward Find the Artifact" while the
  party travelled toward it. The question cannot tell the next checkpoint from a later one on the
  same path. Plan 07's pre-generation already restricts candidates to one hop ahead; the author-view
  row shows only 1-hop checkpoints for the same reason.
- **OOC.** The false positives are in-character commands that read like meta ("HALO, describe the
  room. Every sensor reading." at 0.82; "Continue the story, old man…" at 0.51). The OOC consumer
  and `judge.uses.sceneOoc` are **not built** in v2.2. That is a v2.3 seed, with a question that
  also sees the addressee list.

### Pure core: `src/judge/scene.ts`

- `buildSceneReadQuestions(input)` makes one fan-out call per boundary. It includes only the
  families that passed Phase A, plus:
  - `scene_break` (noul, `SCENE_PLAIN` + `SCENE_STRUCTURED` verbatim);
  - `scene_break_type` (choice, verbatim).
- The state is:

```
{ story: {title},
  scene: {checkpoint, objective},
  cast: [{name, role?}],
  player: <persona name>,
  locations?: [...],
  times?: [...],
  reachable?: [{id, name, objective}],
  transcript: [{id, speaker, text}] }
```

  The transcript is the last `DIRECTOR_WINDOW_MESSAGES` (8).
- The `scene_break` / `scene_break_type` state follows the spike's measured shape
  (`narrative.mts`). The added fields are new state, so Phase A measures `scene_break` again
  inside the full state, and the S01–S22 floor (22/22 at 0.5) must hold there before the trigger
  ships.
- `readScene(answers, input) → SceneRead`:

```
{ boundary, messageId, model,
  sceneBreak: {p, type},
  location?: {value, confidence},
  time?: {value, confidence},
  present?: Record<rosterId, p>,
  ooc?: p,
  headingTo?: Record<checkpointId, p> }
```

- `policy.ts` gains:

| Constant | Value |
|---|---|
| `SCENE_TRIGGER` | 0.4 (revised at calibration; see the calibration record) |
| `SCENE_FIELD_CONFIDENCE` | 0.6 (location/time) |
| `PRESENT_P` | 0.7 |
| `HEADING_P` | 0.7 (Phase A) |
| `SCENE_TIMEOUT_MS` | 2500 (one fan-out call, off the reply path) |

### Format 2: `scene_read?`

`scene_read?: { locations?: string[]; times?: string[]; inject?: boolean }`, added to schema,
validate, the Studio **Story** tab, `storyDiff` (compatible) and copilot ops.

- Locations default to the values of an `enum` quality keyed `location` when the story has one.
  With neither, the location question is not asked: Jev can only select, and span-selection from
  the text is unmeasured.
- `times` defaults to the six buckets.
- `inject` defaults to `true`, but nothing is injected unless the install opted in to
  `sceneTracker`. The story field lets an author switch the block off for one story.
- Diagnostic `scene-read-location-empty` (info) fires when a story has a `location` quality of
  type `string`. That type is useless to the judge; suggest `enum`.

### Coordinator: `runtime/coordinators/sceneCoordinator.ts`

It owns `extras.scene { last: SceneRead | null }`.

- Deps:
  - `getStory`, `getState`, `getWindow`, `getRoster` (with roles), `getPlayerName`;
  - `judge` (injected transport from plan 01);
  - `scheduleRead(reason)`, which is `scheduler.schedule({priority: 0, reason})`;
  - `setInjection` / `clearInjection` (key `sceneTracker`);
  - `recordCall` (plan 01's `extras.judge.calls` ring), `persist`, `notify`.
- `runSceneRead()` is fire-and-forget from boundary work. It is **not** a scheduler job: a job
  would queue behind LLM reads and lose the latency win.
- Freshness: the result is dropped if `lastMessageId` changed while the call was in flight (the
  skill's "check freshness before applying"). A mutation rollback clears `last` when its
  `messageId` is past the rollback point.

On a fresh result:
1. If `sceneBreak.p ≥ SCENE_TRIGGER`, call `scheduleRead("scene:judge")`. The LLM read confirms, as
   today.
2. If `scene_read.inject`, rebuild the tracker block:
   `[Scene: <location>, <time>. Present: <names>.]`. Include only fields over their floors, and
   clear the block when none qualify. The block is injected through the registry key
   `sceneTracker` (`story_orchestrator_scene`, depth 1, writer
   `runtime/coordinators/sceneCoordinator`).
3. Record the call in `extras.judge.calls` (`use: "scene"`, plan 01's ring) with the
   probabilities the policy used.

### Boundary work

- New entry `scene-read`, order 45. It runs when any of `sceneTrigger`, `sceneTracker`,
  `sceneOoc` or `lookahead` is on, and it asks only the question families those usages need.
- `scene-detect` (order 50) keeps advancing the cursor on every boundary, because the probe is the
  condition. While the scene read is active, it schedules a read only when the hit's `signals`
  include a **deterministic** change: `cast` (the enabled members changed) or `location-quality`
  (the blackboard `location` value changed; `sceneDetect.ts` reports that as reason `location`,
  so the check reads `signals`, not `reason`).
- ~~Hits made only of text patterns (`divider`, `location-phrase`, `time_skip`) are ignored, and
  the judge's `scene_break` replaces them.~~ **Revised at calibration (2026-09-19): union, not
  replace.** Text-pattern hits still schedule their read; the judge only **adds** a `scene:judge`
  read when the heuristic did not fire. Replace mode needed 22/22, and the judge missed it twice:
  S08 at p 0.49 on the tuning set, and 2–3 of 12 held-out breaks at p 0.28–0.39. Non-breaks never
  went above 0.20. In union mode a judge miss costs exactly what it costs today (the cadence read
  still confirms), and a judge hit makes the confirming read earlier. The "fewer wasted reads"
  half of the objective is dropped; the latency half stays.
- With the flag off, both entries behave exactly as today.

### Macros

`story_scene_location`, `story_scene_time` and `story_scene_present`, returning `(unknown)` below
floor. They let authors place scene data in their own Author's Note or card text.

### Player surface

`narrative.ts` "now" gains `at <location>` when the location is over floor. No probabilities, no
look-ahead: future checkpoints are spoilers.

### Author view

The engine panel gains **Scene read**: every field with its probability, and **Heading toward**
(checkpoint names with p). The spoiler checklist in `test-plan.md` gains "Heading toward" and the
scene probabilities as author-only.

### OOC consumer (only if Phase A passes)

When `ooc ≥ OOC_P` for the latest user message, the next shared read's window marks that message
`(out of character — not story events)`. This goes through `extraction/chatWindow.ts`, so an OOC
"set trust to 10" cannot become a delta.

- This changes the extraction prompt, so `so-live-suite --min 0.9` must stay green, and a new
  fixture (`extractor23-ooc`) must prove the annotation holds.
- The judge director (plan 01) receives the same flag as `scene.ooc: true` in its state.

### Settings

Four independent opt-ins (overview rule 4), all off by default:

| Flag | Checkbox | Turns on |
|---|---|---|
| `judge.uses.sceneTrigger` | `#so-judge-use-scene-trigger` | `scene_break` questions + the trigger |
| `judge.uses.sceneTracker` | `#so-judge-use-scene-tracker` | location / time / presence + the tracker block, macros, player line |
| `judge.uses.sceneOoc` | `#so-judge-use-scene-ooc` | the OOC question + window annotation (only if Phase A passes) |
| `judge.uses.lookahead` | `#so-judge-use-lookahead` | reachable-checkpoint questions + the author-view "Heading toward" |

### Fixtures

- `test/fixtures/judge/scene.json` (the file name matches `--use scene`, per plan 01's layout):
  promoted from Phase A, plus S01–S22 for `scene_break`.
- `so-judge calibrate --use scene` checks every built family at its Phase A floor.

### J11 scene checks

| Check | What |
|---|---|
| J11.11 | Real play, `sceneTrigger` + `sceneTracker` on. One `scene` record per boundary in `extras.judge.calls`; `extras.scene.last.messageId` equals the newest message |
| J11.12 | A scripted time-skip message (`/sendas`) that the regex misses (taken from S-cases the heuristic failed) → P0 read `scene:judge` is scheduled **on that boundary** |
| J11.13 | The tracker block is present in the payload captured on the next generation (`GENERATE_AFTER_DATA`), with only over-floor fields |
| J11.14 | Swipe/delete past the scene read → `last` cleared, block rebuilt at the next boundary |
| J11.15 | Judge off → no `scene-read` work, the heuristic path unchanged, `judgeCalls = 0`. Judge on + a blackboard `location` change with no text cue → a P0 read is still scheduled (the deterministic trigger kept) |

### Calibration record (off-page, 2026-09-19)

Production code (`src/judge/scene.ts` + `sceneCalibration.ts`) → the real plugin handler → the live
API, `jev-1.13.0`: `scripts/spike/typesafe/calibrate-node.mts scene [--fixture scene-holdout] --record`.
Fixtures are promoted from Phase A (`scripts/spike/typesafe/promote.mts scene|scene-holdout`). The
full cast is sent and asked, the narrator included; only the labelled members are scored.

| Family | Tuning set (R01–R21, S01–S22 ×2 shapes) | Held-out (SH01–SH12 ×2) | Floor | Policy |
|---|---|---|---|---|
| Presence | 48–49/53 (91–92%); every miss is a present member at p 0.47–0.69, so the tracker omits someone and never adds an absent one | — | ≥ 0.9 | `PRESENT_P` 0.7 |
| Location | 19/21 (R03 at 0.43–0.46, not shown; R08 `elsewhere` 0.78, not shown) | — | ≥ 0.85 | `SCENE_FIELD_CONFIDENCE` 0.6 |
| Time of day | 21/21 | — | ≥ 0.8 | 0.6 |
| Look-ahead | 40–41/42 (R04 r1 at 0.88–0.89, the known "later checkpoint on the same path" miss) | — | ≥ 0.85 | `HEADING_P` 0.7 |
| Scene break, replace mode (plan text) | 21/22 at 0.5 (S08 0.49, both shapes) | 21–22/24 at 0.4 | 22/22 | **failed** → union mode |
| Scene break, union mode: recall | 24/24 at 0.4 | 9/12 at 0.4 (SH05 Spanish dawn 0.34–0.39, SH06 "Midnight. Fog…" 0.28–0.41) | > regex's 6/12 | `SCENE_TRIGGER` 0.4 |
| Scene break, union mode: false triggers | 0/20 (max 0.20) | 0/12 (max 0.17) | 0 | — |

Four full runs agreed on every verdict except the rows noted with a range. The held-out set was
written after S08 missed and before 0.4 was scored on anything. The union-mode floors come from
the design (a miss is today's cost, a false trigger is one wasted GPU read), not from the scores.
The first union run is still the result that matters: recall 9/12 held-out is the honest number.
Presence ran with roles; names-only presence was not measured.

### As built (code, 2026-09-19; live gate pending)

Deviations from the plan text, each with its reason:
- **The read lives in `extras.judge.scene`, not a new `extras.scene` slice.** The manager already
  owns and persists the judge slice, and `dropJudgeCallsAfter` now clears a read at or past the
  rollback point, so rollback needed no new manager code. Two manager lines were added
  (`getSceneRead`, `recordSceneRead`): 643 → 645, under the 646 baseline.
- **The coordinator is built in `runtime/index.ts`**, next to `JudgeRuntime` and `TalkController`,
  with constructor-injected deps. It is not a manager field. `runtime/index.ts` subscribes
  `scene.sync()` to the manager's notify, so the block follows the stored read through a new read,
  a rollback, a chat switch that hydrates another chat's read, or a flag switched off.
- **`scene-read` is order 55, after `scene-detect` (50)**, not 45: in union mode it must know whether
  the heuristic already scheduled a read on this boundary (`sceneHeuristicFired` on the context).
- **`scene-detect` is unchanged** (union, see the calibration record).
- The call record's use is `scene` (one fan-out call serves all three usages); `p.break` carries
  the scene-break probability.
- `setSceneRead` keeps typed values verbatim; the parser trims on load. The existing requirement
  lists trim per keystroke and lose typed spaces. That bug predates v2.2 and is filed separately.
- `scene_read.inject` is stored only when `false`.
- The narrator is asked about presence like any member. Its answer only matters if it crosses
  `PRESENT_P`, in which case it would be listed; calibration never saw that.

## Implementation notes

- New coordinator ⇒ `architecture.test.ts` counts it against the coordinator budget automatically.
  Add a guard: `sceneCoordinator` imports no `@memory`, `@generation` or `@pacing`, and calls no
  `enqueue*`. It reads and injects; it never writes the spine.
- The manager gains only the coordinator construction and one `sceneReadActive()` delegate. Pay for
  it by moving the `detectSceneBreak` wiring into the coordinator deps if needed (v2.1 rule 3:
  equal or lower line count).
- Roles come from plan 01. Without roles, presence questions use names only. Phase A measures both,
  and the Gate record says which ran.
- The look-ahead only covers checkpoints the graph can actually reach in 1–2 hops
  (`outgoingByCheckpoint`), capped at 6. Unreachable ones are never sent.

## Leaves the machine

| Question | Data sent |
|---|---|
| Scene read | Last 8 messages with speaker names; player persona **name**; cast names + roles; active checkpoint name + objective; **names and objectives of checkpoints 1–2 hops ahead** (spoilers for the player, sent to TypeSafe, never shown in player mode); location/time vocabularies |

## Validation gate

Harness:
- `npm run typecheck && npm run lint && npm test && npm run build`.
- Pure suites for `readScene` (field floors, freshness) and the tracker text.
- Registry problems empty; the coordinator guard; Storybook for the author scene panel and the
  Studio `scene_read` field.

Live (fresh-start, headed, real):
- J11.11–J11.15, run twice.
- `so-judge calibrate --use scene`.
- J3 and J5 with the scene usages on and off.
- J6.
- `so-live-suite --min 0.9` (always; with the OOC fixture only if the OOC consumer is built).
- J3.3 player sweep (location allowed, "Heading toward" forbidden).

## Persona tags

| Element | Tag |
|---|---|
| Player "now … at <location>" | `player` |
| Scene read panel, Heading toward | `author` |
| `scene_read` Studio field, diagnostic | `author` |
| The four scene checkboxes | `both` |

## Delegated decisions

- Tracker block wording and depth (1 proposed; must not collide).
- Whether an unchanged tracker block is rewritten every boundary or only on change (only on change
  is cheaper).

## Unresolved questions

- Look-ahead sends future checkpoint objectives off-machine. Acceptable under the privacy envelope
  (story text, not user text)? Proposed yes, stated in the settings sentence.
- Should `present` ever feed talk control (skip an absent candidate)? Not in v2.2. It needs its own
  measurement against J5, because absent-but-addressed is a real RP move.
