# Architecture

```
src/
  index.tsx                  # starts runtime, mounts settings panel + drawer (all current UI lives here)
  engine/                    # pure — never imports STAPI
    schema.ts                # format-2 types
    validate.ts              # normalization/validation, graph indexes (requirements normalize to {personas,members,lorebooks})
    storyDiff.ts             # v2.1 plan 05 (pure): diffStories(prev,next,state) -> compatible|invalidating + pruneEngineState
    blackboard.ts            # typed values, versions, latching, monotonic checks
    gates.ts / transitions.ts / convergence.ts
    applyQueue.ts            # serialized writes drained only at boundaries
    engine.ts                # checkpoint state, boundary logs, rollback
    replay.ts                # deterministic fixture runner
  runtime/
    index.ts                 # bootstrap, scheduler wiring, TurnBridge
    runtimeManager.ts        # ST-facing coordinator, persistence boundary
    coordinators/            # v2.1 plan 03: service layer between the pure modules and the manager
      memoryCoordinator.ts   #   extras.memory — tiers, arcs, canon, epistemic, ledger, consolidation, WI sync, injection
      extractionCoordinator.ts # extras.extraction — audit pipeline, scene/short-term/epistemic-ledger passes, memorize backlog
      expansionCoordinator.ts  # extras.expansion — beat cache, generation, staleness revalidation, merge
      copilotCoordinator.ts    # authoring stages, driver read-model, one-turn nudge
      pacingCoordinator.ts     # tension EMA (pending + committed), expected tension, steering hint
    boundaryWork.ts          # v2.1 plan 03: declarative registry of everything a committed boundary schedules
    snapshotBuilder.ts       # v2.1 plan 03: composes the single RuntimeSnapshot the UI subscribes to
    roster.ts                # v2.1 plan 03: roster <-> ST group/chat resolution (enabled ids/names, active speaker, name<->id)
    turnBridge.ts            # ST events -> boundary commits / mutation rollback
    effectsApplier.ts        # AN, preset, WI, cast, NPC replies
    persistence.ts           # chat_metadata.story_orchestrator storage
    storyLibrary.ts          # extension-settings story library
    slashCommands.ts         # /cp state/set/activate/extract/expand/converge/memorize
    macros.ts                # story_blackboard + story_memory_<tier> macros (more in plan 13)
    extras.ts                # v2.1 plan 01: RuntimeExtras factory/sanitizers + hydrateExtras (moved out of runtimeManager)
    journal.ts               # v2.1 plan 01: SessionJournal — status/flag records + payload ring, buildSessionJournal() over the existing rings
    narrative.ts             # v2.1 plan 04 (pure): the one composed player "where am I" view — drawer Overview, away popup, /story recap
    pipeline.ts              # v2.1 plan 04 (pure): derived working/reading/stalled-rechecking/idle/not-configured/error signal
    storyUpdate.ts           # v2.1 plan 05: library -> running chat (diff, choice popup, swap, re-pin, journal record)
    values.ts                # v2.1 plan 05 (pure): typed text -> PrimitiveValue for /cp set and the driver
    awayRecap.ts             # gap detection + welcome-back rendering of narrative.ts (popup injected, module stays pure)
    talkControl.ts           # plan 14: TalkController — real talkControlInterceptor routing, per-pass decision, wrapper-finished reconcile (host seam built in runtime/index.ts)
    hash.ts / requirements.ts / blackboardMemo.ts
  extraction/
    scope.ts                 # active + reachable gate/snapshot scope (pure)
    contract.ts / parse.ts   # shared-read prompt, strict DELTA/FACT parser
    sharedRead.ts            # window -> scope -> prompt -> parse -> audit
    scheduler.ts             # P0/P1 queue, cadence, retry/pause
    reconcile.ts             # stall-triggered targeted reads
    canonLite.ts / cues.ts / client.ts / chatWindow.ts
  pacing/                    # plan 04: tension.ts, shapes.ts, steering.ts
  talk/                      # plan 14 (pure): rules.ts (candidates/mention/weighted chooser), prompt.ts + parse.ts (director SPEAKER: <name|NONE>), types.ts
  memory/                    # plan 07: tier stores (facts/session/short_term/scene), scene detection, injection — pure except inject.ts
  studio/                    # plan 11: Checkpoint Studio v2 — draft.ts (zustand store), mutations.ts (typed API = 12's contract), diagnostics.ts (8 checks), gateOptions.ts, qualityUsage.ts, graphAdapter.ts (v2→GraphPanel + Mermaid), io.ts (export/import), StudioModal.tsx + components/*, *.stories.tsx
                             #   v2.1 plan 05 tabs: Story (id/version/description/arc_template/requirements/arc_bridges) + Roster; save hands the record to the host via onSaved
  services/stHost/           # SillyTavern host wrappers (one module per concern)
  services/STAPI.ts          # only import surface for host modules
  components/studio/         # the 6 reused presentational primitives (GraphPanel, graphPanelUtils, MultiSelect, Toolbar, FeedbackAlert, HelpTooltip) — rest of v1 deleted
  components/drawer/         # DrawerTabs (player: Overview/Memory; author adds Blackboard/Scheduler/Payload + engine panels),
                             #   PlayerOverview (v2.1 plan 04: narrative view + pipeline signal + rollback notice), HudStrip, DriverPanel (author-only)
  utils/ constants/          # constants/injectionRegistry.ts = single source of truth for injection keys+depths
```

## Invariants

- `STAPI.ts` + `stHost/*` are the only files importing ST host modules, via dynamic `import(/* webpackIgnore: true */ …)`.
- `src/engine/**` and `extraction/scope*` never import STAPI. `EngineHost` is the clock seam (`{ now }`), not an effects seam: host effects live in `runtime/effectsApplier.ts` and `runtime/coordinators/*`, which tests fake by injecting deps.
- Three lifetimes, three homes (spec addendum v2.1 §Configuration homes): install-wide settings in `extensionSettings["story-orchestrator"].settings`; per-chat engine state, rings and the overrides `{ui.authorView, pacing.shapeOverride, talk.enabled}` in `chat_metadata`; authored content in the story record. `extras` still exposes a full settings view in memory (`applyGlobalSettings`), but `stripGlobalSettings` removes the install-wide half before persisting.
- Story identity is the authored `id` (+ `version`), never the content hash: the library is keyed by id, the per-chat blob is keyed by id, and each chat **pins a full copy** of the story it plays (`pinnedStory`), so library edits and deletion never reach a running chat. `contentHash` stays for integrity and drift detection (`contentHashAtLoad`). Re-selecting hydrates; `restartStory()` is the only reset.
- One automatic library→chat path, and it is the author's own save (v2.1 plan 05): `applyStoryUpdate(record?)` diffs the **merged** old and new stories against live engine state (`engine/storyDiff.ts`), hot-swaps silently when compatible, and raises a keep/restart/cancel choice when invalidating; keeping prunes exactly the orphaned values (`pruneEngineState`) and re-pins this chat. Other chats are never touched — they take a newer version only through their own "Update to v*N*" or Restart.
- Coordinators (`runtime/coordinators/*`) get constructor-injected deps and never import each other or call `saveMetadata`: they mutate their extras slice through injected accessors and ask the manager to persist/notify. Engine writes go through injected enqueue callbacks — the engine stays manager-owned.
- One snapshot, one subscription: `snapshotBuilder` composes it and coordinator read-models (`ledger`, `driver`, `activeNudge`, plus v2.1 plan 04's `narrative`, `pipeline`, `lastRollback`) ride on it — drawer components never call manager getters during render.
- Two personas, one default (v2.1 plan 04): player mode is the publishable surface; author view **adds**, never conditionally reveals. Steering controls (driver, Advance/Nudge/Probe/Suggest, `/cp`) and every internals panel (epistemic, ledger, arcs bookkeeping, convergence, boundary numbers, superseded/folded memory) are author-only. The spoiler checklist in `docs/plans/v2.1/test-plan.md` is the list, asserted by `so-ui.mts assert-player-clean` and journey J3.3.
- Player copy has one source (v2.1 plan 04): `narrative.ts` composes the "where am I" view and `pipeline.ts` says what the machine is doing; the drawer Overview, the away popup and `/story` all render that one composition. Player text uses checkpoint names, never ids/boundaries; author-grade text rides in `pipeline.detail`, never in `pipeline.text`.
- Boundary work is a registry (`runtime/boundaryWork.ts`), not a callback: new work = a new `{id, order, when, run}` entry.
- `src/runtime/architecture.test.ts` enforces the manager size budget, the coordinator budget, the components<->studio import boundary, drawer-reads-snapshot and engine purity. A failing guard is a failing build.
- Boundary counters ≠ ST message indexes. Boundary snapshots/logs record `{lastMessageId, chatLength}`.
- Pending queue writes not persisted; reload drops them, reconciliation recovers.
- Extraction audits persist in runtime extras (`extras.extraction.audits`); facts moved to the memory tiers (`extras.memory`, facts tier) as of plan 07 — `extras.extraction.facts` no longer exists.
- Journeys (v2.1 layer 5): `test/journeys/*.journey.json`, run by `scripts/debug/so-journey.mts` (wraps the `so-scenario` step engine, never forks it). Catalog + checks: `docs/plans/v2.1/test-plan.md`.
- Session journal derives from the existing rings at read time; only status transitions and player flags are persisted (`extras.journal`, cap 200). Payload captures stay in-memory (ring of 5) inside `SessionJournal`.
- Fixtures: `test/fixtures/*.story.json|*.transcript.json|*.expected.json`; recorded LLM goldens in `test/goldens/`. Jest always runs deterministic goldens. **Live delta accuracy is a browser-driven script, not a jest env flag**: `scripts/debug/so-live-suite.mts` runs each `extractor*` triple through the real memory model via `globalThis.storyOrchestratorLiveSuite.runFixture` (same pure `extraction/fixtureRun.ts` prompt path as jest) and scores exact-match on `{q,v}` deltas; `--record` writes `test/goldens/live/`.
- Build output `dist/` generated + gitignored.

## Path aliases (tsconfig + webpack)

Active: `@components @services @utils @constants @engine @runtime @extraction @pacing @generation @memory @copilot @talk` → `src/<name>/*`. (Dead `@hooks @controllers @store` aliases + their empty dirs removed in plan 13.)
