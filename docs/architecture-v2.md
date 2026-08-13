# Architecture (v2)

Story Orchestrator runs a format-2 story as a deterministic checkpoint graph over a live
SillyTavern chat. This is the current source-of-truth layout; the design rationale and per-plan
build history live in [`plans/v2/`](plans/v2/).

## Source layout

```
src/
  index.tsx                  # boots the runtime, mounts settings panel + drawer
  engine/                    # pure — never imports STAPI
    schema.ts validate.ts    # format-2 types, normalization, graph indexes
    storyDiff.ts             # classifies an edit against live state (compatible/invalidating) + state pruning
    blackboard.ts            # typed values, versions, latching, monotonic checks
    gates.ts transitions.ts convergence.ts
    applyQueue.ts engine.ts  # serialized writes drained at boundaries; boundary log; rollback
    replay.ts                # deterministic fixture runner
  extraction/                # off-path shared read
    scope.ts contract.ts parse.ts sharedRead.ts scheduler.ts reconcile.ts
    cues.ts canonLite.ts client.ts chatWindow.ts fixtureRun.ts
  pacing/                    # tension smoothing, dramatic shapes, steering
  memory/                    # tiers, scene detection, supersession, consolidation, arcs,
                             # canon, epistemic, ledger, injection (pure except inject.ts)
  generation/               # background beat expansion + critic
  copilot/                  # authoring + in-play driver over the studio mutation API
  studio/                   # Checkpoint Studio v2 (zustand draft, typed mutations, diagnostics)
                            #   tabs: Graph, Story, Qualities, Checkpoints, Transitions, Roster, Diagnostics
  runtime/                  # ST-facing coordination
    index.ts                # bootstrap, scheduler wiring, TurnBridge, event subscriptions
    runtimeManager.ts       # lifecycle, boundary commit, persistence boundary, event fan-out, delegation
    coordinators/           # the service layer between the pure modules and the manager
      memoryCoordinator.ts      # extras.memory: tiers, arcs, canon, epistemic, ledger, consolidation, WI, injection
      extractionCoordinator.ts  # extras.extraction: audit pipeline, scene/short-term/epistemic passes, memorize backlog
      expansionCoordinator.ts   # extras.expansion: beat cache, generation, staleness revalidation
      copilotCoordinator.ts     # authoring stages, driver read-model, one-turn nudge
      pacingCoordinator.ts      # tension EMA (pending + committed), steering hint
    boundaryWork.ts         # declarative registry of everything a committed boundary schedules
    snapshotBuilder.ts      # composes the one RuntimeSnapshot the UI subscribes to
    roster.ts               # roster <-> ST group/chat resolution
    turnBridge.ts           # ST events -> boundary commits / mutation rollback
    effectsApplier.ts persistence.ts storyLibrary.ts
    extras.ts               # RuntimeExtras factories/sanitizers, hydrateExtras, applyGlobalSettings/stripGlobalSettings
    settingsStore.ts        # install-wide settings home; liftLegacyChatSettings migration
    persistenceMigration.ts # v2 hash-keyed blob -> v3 id-keyed blob with a pinned story copy
    selfTest.ts snapshot.ts # model self-test over fixtures; pure snapshot readouts
    journal.ts              # SessionJournal: status/flag records, payload ring, buildSessionJournal()
    narrative.ts            # the one composed player "where am I" view (drawer, away popup, /story)
    pipeline.ts             # derived working/reading/stalled/idle/not-configured/error signal
    storyUpdate.ts          # the author's save applied to this chat: diff, choice popup, swap, re-pin
    values.ts               # typed text -> PrimitiveValue (author input paths)
    macros.ts slashCommands.ts awayRecap.ts liveSuite.ts
  components/
    studio/                 # 6 reused presentational primitives
    drawer/                 # DrawerTabs (player Overview/Memory; author adds Blackboard/Scheduler/Payload),
                            #   PlayerOverview (narrative view + pipeline signal), HudStrip, DriverPanel (author)
  services/
    STAPI.ts                # the ONLY import surface for host modules
    stHost/*                # one host wrapper per concern (dynamic webpackIgnore imports)
  constants/ utils/
```

## Invariants

- `services/STAPI.ts` + `services/stHost/*` are the only files importing SillyTavern host
  modules, via dynamic `import(/* webpackIgnore: true */ …)`. The base context comes from the
  official `globalThis.SillyTavern.getContext` (extensions-module fallback); most host access
  goes through context members, leaving six directly-imported host modules (`modules.ts`).
- Host types are vendored locally in `stHost/hostTypes.ts` (narrow interfaces + index
  signatures, one ledger row per member in `docs/plans/v2/00-implementation-overview.md`), so
  typecheck/build work outside the SillyTavern tree; runtime guards remain the safety net.
- Macros register through the `registerHostMacro`/`unregisterHostMacro` seam
  (`stHost/context.ts`) — currently `MacrosParser`, the only API that feeds both the legacy and
  the flag-gated new macro engine; migrating later is a one-function-body edit.
- `engine/**` and `extraction/scope*` never import STAPI. `EngineHost` is a clock seam
  (`{ now }`), not an effects seam: host effects live in `runtime/effectsApplier.ts` and the
  `runtime/coordinators/*`, which tests fake through their injected deps.
- Coordinators own one `extras` slice each, never import one another, and never call
  `saveMetadata`: they mutate through injected accessors and ask the manager to persist/notify.
  Engine writes go through injected enqueue callbacks — the engine stays manager-owned.
- The UI reads one composed model (`snapshotBuilder`) through one subscription; coordinator
  read-models (`ledger`, `driver`, `activeNudge`) are fields on the snapshot, not getters a
  component calls during render. `src/runtime/architecture.test.ts` enforces this, the manager
  size budget and the component/studio import boundary.
- Two personas, one default: the drawer's player mode is the publishable surface (narrative view,
  memory curation, honest status); author view *adds* internals, never conditionally reveals them.
  Everything that steers the story (driver, Advance, Nudge, Probe, `/cp`) is author-only.
  The player composition itself is pure (`narrative.ts` + `pipeline.ts`) and reaches the drawer,
  the away-recap popup and `/story` from the same snapshot fields.
- Runtime state persists per chat in `chat_metadata.story_orchestrator`; the story library lives
  in extension settings.
- A chat plays its own pinned copy of the story. The one automatic path from the library into a
  running chat is the author's own save from that chat (`runtime/storyUpdate.ts`): the edit is
  diffed against live engine state, applied silently when compatible, and put to the author as
  keep / restart / cancel when it invalidates something the run holds. Keeping drops exactly the
  orphaned values and re-pins; every other chat keeps playing what it started with.
- Boundary counters are not ST message indexes; snapshots/logs record `{lastMessageId,
  chatLength}`.
- Pending queue writes are not persisted; a reload drops them and reconciliation recovers.

## Turn flow

1. ST renders a reply → `TurnBridge` detects a boundary and calls `runtimeManager` to commit.
2. The engine drains its apply queue, evaluates gates, fires at most one transition, applies
   checkpoint effects (author's note, world info, cast changes, NPC replies, preset), and logs
   the boundary.
3. `runtime/boundaryWork.ts` (a declarative registry `runtime/index.ts` just runs) schedules
   off-path work: forced cues over the boundary window, cadence
   extraction, reconciliation, expansion, scene-break, short-term rolling compaction (a single
   `short_term` entry summarizing play since the last watermark, updated every ~12 messages,
   replaced not appended, skipped while pinned), and consolidation passes.
4. The `ExtractionScheduler` runs a shared read on the memory LLM; accepted deltas are enqueued
   and applied at the *next* boundary — the response path stays AI-free. Cadence windows end
   `stabilityLag` messages behind the newest (default 0; swipes are covered by rollback + a P0
   re-read); cue/scene/rollback/reconcile reads always include the newest message.
   Live expected tension prefers the active checkpoint's authored `tension_target`
   (`levelToNumeric`) and falls back to the `arc_template` curve; steering hints name the
   expected level and switch to stronger wording past 0.5 drift.
5. `generation_started` captures the injected prompt blocks into a ring buffer for the Payload
   tab; `generation_ended` clears the copilot nudge and private per-speaker injection.

## Injection registry

All extension-prompt injection keys and depths are declared once in
`src/constants/injectionRegistry.ts` and projected into `constants/defaults.ts`. Same-depth
`IN_CHAT` prompts merge deterministically (key-sorted by the host), so intentional depth
collisions are recorded in an allowlist and asserted by a unit test.

| Key | Depth | Writer |
|---|---|---|
| `story_orchestrator_memory_facts` | 4 | memory/inject |
| `story_orchestrator_memory_session_details` | 3 | memory/inject |
| `story_orchestrator_memory_short_term` | 2 | memory/inject |
| `story_orchestrator_memory_scene_history` | 6 | memory/inject |
| `story_orchestrator_epistemic` | 4 | memory/inject |
| `story_orchestrator_ledger` | 3 | memory/inject |
| `story_orchestrator_pacing` | 2 | runtimeManager |
| `story_copilot_nudge` | caller | runtimeManager |

Epistemic state is never written to World Info (privacy).

Write-on-change: `stHost/extensionPrompts.ts` caches the last written `{text, depth}` per key and
skips identical rewrites (the wrapper is the only writer of `story_*` keys), so per-boundary
re-injection is a no-op when nothing changed. Author's Note and World Info toggles write
unconditionally by design — they only fire on checkpoint activation/hydrate, and `upsertWIEntry`
already skips unchanged content.

## Testing & tooling

- Jest suites are colocated as `src/**/*.test.ts` (excluded from tsconfig/lint), run
  `--runInBand`. Fixtures live in `test/fixtures/`, recorded goldens in `test/goldens/`.
- Storybook stories (`*.stories.tsx`) cover studio and drawer components with play-function
  interaction + a11y checks (`npm run test-storybook:ci`).
- `scripts/debug/*.mts` drive a live SillyTavern over CDP for E2E validation; `so-scenario.mts`
  replays scenario JSON in `test/scenarios/`.
- **Journeys** (v2.1 evaluation layer 5) are the composition gate above scenarios:
  `scripts/debug/so-journey.mts` runs `test/journeys/*.journey.json` fresh-start against the real
  model, wrapping the same `so-scenario` step engine. Per-check outcomes are
  `pass|fail|blocked|not-runnable|skipped`; catalog, checks and the spoiler checklist live in
  `docs/plans/v2.1/test-plan.md`.
- **Session journal**: `runtime/journal.ts` merges the persisted rings (boundary log, transitions,
  extraction audits + accepted deltas, reconciliation, payload captures, talk decisions) with
  status transitions and player ⚑ flags into one ordered timeline. Only status/flag records are
  persisted (`extras.journal`, cap 200); everything else is derived at read time. Handle:
  `getSessionJournal()`; export: `scripts/debug/so-journal.mts`.
- **Live delta accuracy** is measured by `scripts/debug/so-live-suite.mts`, which runs every
  `test/fixtures/extractor*` triple through the real memory model
  (`globalThis.storyOrchestratorLiveSuite.runFixture`, built from the same pure `fixtureRun.ts`
  path the deterministic jest suite uses) and scores exact-match on `{q,v}` deltas. The corpus is
  directory-discovered (a complete `.story/.transcript/.expected` triple auto-joins both suites);
  an `.expected.json` may carry an optional `spec` (activeCheckpointId/window/canon/blackboard)
  and `promptExcludes` (e.g. proving a latched quality is never asked about).
- Studio diagnostics include `quality-never-in-scope` (warning): an extractor quality in no gate
  or `state_snapshot` never enters extraction scope, so the extractor is never asked about it.

## Packaging

`manifest.json` loads the gitignored `dist/index.js` produced by `npm run build`. The
`generate_interceptor` (`talkControlInterceptor`) is a retained no-op stub for manifest
compatibility; it performs no interception.
