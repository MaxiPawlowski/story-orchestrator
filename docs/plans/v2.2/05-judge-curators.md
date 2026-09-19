# Plan 05 — Judge curators: continuity warden + scene-setter

## Objective

Build two of the four designed v2.2 curators (`../v2.1/stagecraft-design.md` §2, §5) on the
plan-07 proposal → review → apply contract, with the judge as the check. Both are new
capabilities, and both are measured:

- **Continuity warden.** Did the last reply contradict an established fact? If so, one corrective
  note for the next generation only. Spike: 18/18 replies right, checked against 26 established
  facts, with 1 false alarm among the 17 consistent ones.
- **Scene-setter.** Which installed background fits the scene now that the story has moved
  between checkpoints? Spike: 11/12, and both "nothing fits" cases right.

## Context

- Spike: README §Continuity warden and §Background pick. `experiments/guards.mts` holds
  `CONTRA_PLAIN` + `CONTRA_CRITERIA`, and `experiments/stagecraft.mts:64` the background choice
  ("…File names describe the picture. Pick "none" if no background fits the setting.").
- Contract to reuse (design doc §Contracts):
  - `extras.stagecraft.proposals` (cap 5), per-op status `pending | accepted | rejected | applied
    | failed` with pre-write state;
  - `StagecraftPanel` (author view, Scheduler tab);
  - accept modes `off | review | auto`;
  - `applyAccepted()` inside `commitBoundary`, `revertAppliedSince()` on rollback;
  - journal `kind: "stagecraft"`.
- Host: `stHost/backgrounds.ts` (`getCurrentBackground`, `listBackgrounds`, `backgroundExists`,
  `applyBackground`). A chat-locked background lives in `chat_metadata.custom_background`.
  `effects.background` on the active checkpoint is applied by `EffectsApplier` on activate and
  hydrate.
- One-turn injection precedent: the copilot nudge. `setStoryExtensionPrompt(COPILOT_NUDGE_KEY, …)`
  runs, then `clearCopilotNudge()` on `GENERATION_ENDED` / `GENERATION_STOPPED`
  (`runtime/index.ts:106–107`).
- Isolation guard: `architecture.test.ts:62–66`. `stagecraftCoordinator.ts` imports no `@memory` /
  `@generation` / `@pacing` and calls no `enqueue*` / `applyEntries(` / `setMemory(`. Memory reads
  arrive as injected getters (precedent: `getCanon`, `getOpenArcs`).
- **Pending peer work.** An uncommitted curator change for the Adolion session (2026-09-19) edits
  `stagecraftCoordinator.ts` and `stagecraft/scope.ts`, where checkpoint-gated entries become
  unwritable. It also moves `gatedWorldInfo` into a new pure `src/engine/worldInfoEffects.ts`.
  Rebase on whatever lands before starting.
- Consumed: plans 01 (judge), 03 (scene read: `sceneBreak`, `location`), 02 (verified facts make
  the warden's inputs trustworthy). Regression floor: J8 (WI curator), J3, J6 (rollback reverts).

## Scope

In:
- Both curators as new op kinds in the existing coordinator.
- The one-turn continuity note.
- The spec-addendum amendment for presentation timing.
- Settings, calibration fixtures, J8 growth.

Non-goals:
- Cast/npc tuning and the recap narrator. They stay designed; the design doc gives the reasons.
- The warden writing memory, marking facts, or editing a message. Ever.
- The scene-setter creating backgrounds.

## Deliverables

### Design-doc amendment (`../v2.1/stagecraft-design.md`)

The spec addendum already allows "boundary effects or bounded one-turn injections", and it names
the warden's one-turn note (`spec-addendum-v2.1.md` §Stagecraft). The design doc does not match
yet, so amend it (v2.1 rule 5):

- **Invariant 1** ("Writes happen in the runtime, at a boundary"). Add: a one-turn injection is
  applied at the next loud generation's start and cleared at its end. It never persists and never
  touches an ST asset. Writes to ST assets (World Info, background) stay boundary-applied.
- **Invariant 4** ("Curators run on the memory LLM through the P2–P4 scheduler lanes"). Add: a
  judge-backed pass is fire-and-forget off the reply path, not a scheduler job. It is bounded by
  its own timeout and coalescing, and it never waits on or blocks the LLM lanes.
- **§5 Continuity warden**: the lane becomes "judge, fire-and-forget". The trigger becomes each
  committed character reply.
- **§Contracts**: `applyAccepted()` dispatches by op kind (below).

### Op union: `src/stagecraft/types.ts`

The op union gains:

```
| { kind: "note"; text: string; facts: string[]; replyMessageId: number }
| { kind: "background"; name: string; from: string }
```

`CuratorProposalRecord` gains `curator: "wi" | "warden" | "scene"`. Existing records hydrate as
`"wi"` (sanitizer default, v2.1 rule 6).

`applyAccepted()` today sends every accepted op through `writeOp` → `isCuratorWritable(lorebook,
comment)` (`stagecraftCoordinator.ts:175–205`). It becomes a dispatch on `op.kind`:

| Op kind | Path |
|---|---|
| WI kinds | `writeOp`, unchanged, including the allowlist and checkpoint-gated checks |
| `background` | `applyBackground(name)`, at the boundary, with `from` recorded for rollback |
| `note` | **never applied by `applyAccepted`**. It is picked up by the generation-start path below, and `applyAccepted` skips it explicitly, so a note can never reach `writeOp` or a lorebook |

### Pure core: `src/judge/curators.ts`

- `buildContinuityQuestions(reply, facts)`: one noul per fact, `CONTRA_PLAIN` + `CONTRA_CRITERIA`
  verbatim. State `{established_facts: [...], reply: <text>}`.
- `continuityNote(answers, facts)` returns the facts with p ≥ `CONTINUITY_P`, at most 2. The note
  text is **code-composed**: `Continuity: established — <fact>. Keep the next reply consistent
  with it.` The judge supplies the decision, never prose.
- `buildBackgroundQuestion(names, scene)`: a choice over `listBackgrounds()` names, plus `none`,
  with the spike's question and criteria verbatim (`stagecraft.mts:60–66`).
  - State keeps the spike's measured shape, `{scene: <description>}`. The description is composed
    in code from the scene read's location/time (plan 03), the checkpoint name + objective, and
    the last two messages.
  - Composing it is new, so the calibration fixtures measure it; the spike's hand-written
    descriptions do not carry over automatically.
  - Over 254 installed backgrounds, a code pre-filter keeps the 254 whose file-name tokens overlap
    the scene most. The pre-filter is measured in the fixture set.
- `policy.ts` gains:

| Constant | Value |
|---|---|
| `CONTINUITY_P` | 0.7 (planned 0.8, revised at calibration; see the calibration record) |
| `CONTINUITY_MAX_FACTS` | 40 |
| `BACKGROUND_CONFIDENCE` | 0.6 |

### Warden: `stagecraftCoordinator` gains `runWardenPass(replyMessageId)`

Trigger: a committed boundary whose newest message is a character reply (not the player's, not a
`first_message`, not an `extension` post). Fire-and-forget, never a scheduler job; the same reason
as plan 03.

Inputs, through new injected getters:
- `getEstablishedFacts()`: the facts tier plus pinned entries, not superseded, not contradicted,
  top `CONTINUITY_MAX_FACTS` by score.
- The ledger's bound rows, rendered as `Entity field = value`.
- `getMessageText(id)`.

Behaviour:
- It produces a `note` op and records a proposal (`curator: "warden"`).
- In `auto` mode the op is accepted at once. In `review` it waits on the author, and it **lapses**
  (`status: "rejected"`, reason `lapsed`) once a newer character reply commits.
- Applying: the next loud `GENERATION_STARTED` with an accepted, unapplied note sets registry key
  `continuityNote` (`story_orchestrator_continuity`, depth 0, i.e. just before the reply). It then
  marks the op `applied` and clears the key on `GENERATION_ENDED` / `STOPPED`. It follows the
  nudge's shape, not the nudge's key.
- Vetoes:
  - one note in flight;
  - a swipe or delete of `replyMessageId` rolls the op back to `rejected` (`reverted`);
  - no note while the copilot nudge is set for the same generation (the nudge wins; it is the
    author's own steering).
- Settings: `stagecraft.wardenEnabled` (default off) and `stagecraft.wardenAcceptMode` (`off |
  review | auto`, default `review`), next to the WI curator's.

### Scene-setter: `runSceneSetterPass(reason)`

Trigger: a confirmed scene break (the existing `emitSceneBreak` listener), or a plan-03 scene read
whose `location` changed with confidence ≥ `BACKGROUND_CONFIDENCE`. At most once per scene
(`sceneCount`).

Vetoes, in code:
- The active checkpoint authored `effects.background`: the authored background wins, and no pass
  runs.
- The chat has a locked background (`custom_background`).
- The choice is `none`, below confidence, or equal to the current background.

Output: a `background` op (`curator: "scene"`), applied by `applyAccepted()` at the next boundary
through `applyBackground`. `from` is kept for rollback, so `revertAppliedSince` re-applies `from`.

Settings: `stagecraft.sceneSetterEnabled` (default off) and `stagecraft.sceneSetterAcceptMode`
(default `review`).

### Review UI: `StagecraftPanel`

- Cards show the curator label. A `note` card shows the facts and the note text (editable before
  accept). A `background` card shows from → to with thumbnails (`backgrounds/<name>`).
- Storybook stories for both card kinds.

### Architecture guard

- The stagecraft isolation test also forbids the `continuityNote` key being written anywhere except
  `stagecraftCoordinator`, and forbids any tier write from the warden path.
- `findInjectionRegistryProblems` stays empty: depth 0 is free.

### Fixtures

| File | Contents | Floor |
|---|---|---|
| `test/fixtures/judge/continuity.json` | C01–C18 (26 facts) + ≥ 10 from real play (Artemis replies over sun-ruins facts, bringing the fact count to ≥ 60), Spanish slice ≥ 4 | reply-level ≥ 0.9, false alarms ≤ 1 per 30 consistent facts at `CONTINUITY_P` |
| `test/fixtures/judge/backgrounds.json` | the 12 spike cases + ≥ 8 over this install's 22 backgrounds | ≥ 0.85, every `none` case right |

### J8 growth

J8.1–J8.3 are automated and J8.4 is the human presentation rubric (`test-plan.md:258–261`). The new
checks start at J8.5:

| Check | What |
|---|---|
| J8.5 | Warden on (`auto`). A scripted `/sendas` reply that contradicts a seeded fact → the next loud generation's `GENERATE_AFTER_DATA` prompt holds the note; the generation after that does not |
| J8.6 | Warden `review`. The same setup, then a newer reply commits before the author acts → the op lapses and no note reaches any prompt |
| J8.7 | Scene-setter on (`auto`). A checkpoint without an authored background; a scripted move to a place whose background is installed → the background changes at the next boundary. A swipe past it restores `from` |
| J8.8 | Authored `effects.background` on the checkpoint → no scene-setter pass (the call ring shows the veto) |
| J8.9 | Both off → `judgeCalls = 0` for curators, and the WI curator is unchanged |

J8.4's rubric question already covers "background … handled for you". The human session scores it
with the scene-setter on.

The seeded fact comes through the existing debug extraction path, with judge memory off (plan 02's
seeding rule). The judge calls are real.

### Calibration record (off-page, 2026-09-19)

Production code (`src/judge/curators.ts` + `curatorCalibration.ts`) → the real plugin handler → the
live API, `jev-1.13.0`: `calibrate-node.mts continuity|backgrounds [--fixture …] --record`, with
fixtures from `promote.mts continuity|continuity-holdout|backgrounds`.

**Continuity warden.** Tuning set: spike C01–C18 plus CX01–CX10 (hand-written over sun-ruins, 4 in
Spanish). That is 28 replies and 57 facts, 42 of them consistent.

| Cut | Replies right | Breaks caught | False alarms | Floors 0.9 / 0.85 / ≤ 1 per 30 |
|---|---|---|---|---|
| 0.8 (planned) | 25/28 | 12/15 (misses at 0.76, 0.77, 0.78) | 0/42 | **fail** |
| 0.7 (revised) | 28/28 | 15/15 | 0/42 (highest consistent p 0.57) | pass |
| 0.7 on held-out CH01–CH08 (3 Spanish), scored once | **8/8** | **5/5** | **0/14** | pass |

0.8 had been chosen to clear the spike's single false alarm near 0.5. On this data the gap runs
from 0.57 to 0.76. The held-out set was written after the 0.8 run and before 0.7 was scored.
Real-play Artemis replies (plan: ≥ 10) are still owed and come from the live gate.

**Scene-setter: fails its floor, not built in v2.2.** The data is spike B01–B12 plus BX01–BX10,
whose scene text is composed by production code, over this install's 22 backgrounds plus 3
utility files. The candidate filter drops all 3.
- Every "nothing fits" case was right (4/4, floor 4/4).
- Picks were **15/18 (83%)** against a floor of 0.85.
- The misses are the file-name vocabulary: "a market street at night" chooses
  `cityscape medieval market.jpg` over `…night.jpg` (0.82 hand-written; 0.46 vs 0.44 composed),
  and "guild hall, evening" is only 0.50 for `tavern day.jpg`.
- Only one of the 22 would have applied a wrong background.

By the rule that kept OOC out (88% vs 0.9), `sceneSetterEnabled` is not built. The pure code and
the fixture stay, so a v2.3 attempt (author-written background descriptions instead of file names)
starts from a measured baseline. **Question for the user:** ship it review-only anyway? Every change
would need the author's accept.

**Warden runtime: pure core and calibration only so far.** `runWardenPass`, the `note` op kind, its
one-turn injection and the J8 growth all live in `stagecraftCoordinator` / `stagecraft/types.ts`,
which the peer session is still editing on master. They are built after that change lands.

## Implementation notes

- `stagecraftCoordinator` is 252 lines, so there is room under the 620 budget. If it passes 450,
  split the warden into `runtime/coordinators/wardenCoordinator.ts` with the same guard row. No
  coordinator may import another.
- The warden reads the reply at its own `messageId`, never "the last message". By the time the
  judge answers, the player may already have written.
- A wrong note costs one reply's worth of steering, which is why `CONTINUITY_P` sits above the
  spike's 0.5, and why a note carries the fact verbatim. The author can see what was asserted.

## Leaves the machine

| Question | Data sent |
|---|---|
| Warden | The reply text; up to 40 established fact lines; bound ledger rows |
| Scene-setter | Installed background **file names**; last 8 messages; checkpoint name + objective; scene read location/time |

## Validation gate

Harness:
- `npm run typecheck && npm run lint && npm test && npm run build`.
- Stagecraft pure suites for the new op kinds (parse of hydrated records, lapse, veto table).
- The coordinator test for note apply/clear order.
- Architecture guards; Storybook for the two card kinds.

Live (fresh-start, headed, real):
- J8 (all checks), run twice.
- `so-judge calibrate --use continuity` and `--use backgrounds`.
- J3 and J6 with both curators on.
- J3.3 player sweep: warden/scene-setter cards are author-only.

## Persona tags

| Element | Tag |
|---|---|
| Warden and scene-setter cards, settings rows | `author` |
| The note itself | never visible (prompt only) |

## Delegated decisions

- Whether a lapsed review note is shown at all, or pruned from the ring immediately.
- Thumbnail size on the background card.

## Unresolved questions

- `auto` for the warden: its false-alarm cost is one mis-steered reply. Proposed: keep the default
  at `review` until a human session scores it, the same as the WI curator.
