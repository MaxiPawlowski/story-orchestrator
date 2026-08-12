# Architecture

```
src/
  index.tsx                  # starts runtime, mounts settings panel + drawer (all current UI lives here)
  engine/                    # pure — never imports STAPI
    schema.ts                # format-2 types
    validate.ts              # normalization/validation, graph indexes
    blackboard.ts            # typed values, versions, latching, monotonic checks
    gates.ts / transitions.ts / convergence.ts
    applyQueue.ts            # serialized writes drained only at boundaries
    engine.ts                # checkpoint state, boundary logs, rollback
    replay.ts                # deterministic fixture runner
  runtime/
    index.ts                 # bootstrap, scheduler wiring, TurnBridge
    runtimeManager.ts        # ST-facing coordinator, persistence boundary
    turnBridge.ts            # ST events -> boundary commits / mutation rollback
    effectsApplier.ts        # AN, preset, WI, cast, NPC replies
    persistence.ts           # chat_metadata.story_orchestrator storage
    storyLibrary.ts          # extension-settings story library
    slashCommands.ts         # /cp state/set/activate/extract/expand/converge/memorize
    macros.ts                # story_blackboard + story_memory_<tier> macros (more in plan 13)
    extras.ts                # v2.1 plan 01: RuntimeExtras factory/sanitizers + hydrateExtras (moved out of runtimeManager)
    journal.ts               # v2.1 plan 01: SessionJournal — status/flag records + payload ring, buildSessionJournal() over the existing rings
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
  services/stHost/           # SillyTavern host wrappers (one module per concern)
  services/STAPI.ts          # only import surface for host modules
  components/studio/         # the 6 reused presentational primitives (GraphPanel, graphPanelUtils, MultiSelect, Toolbar, FeedbackAlert, HelpTooltip) — rest of v1 deleted
  components/drawer/         # plan 13: DrawerTabs — overview/blackboard/memory/scheduler/payload debug tabs (moved out of index.tsx)
  utils/ constants/          # constants/injectionRegistry.ts = single source of truth for injection keys+depths
```

## Invariants

- `STAPI.ts` + `stHost/*` are the only files importing ST host modules, via dynamic `import(/* webpackIgnore: true */ …)`.
- `src/engine/**` and `extraction/scope*` never import STAPI; host effects go through the `EngineHost` seam so tests can fake them.
- Three lifetimes, three homes (spec addendum v2.1 §Configuration homes): install-wide settings in `extensionSettings["story-orchestrator"].settings`; per-chat engine state, rings and the overrides `{ui.authorView, pacing.shapeOverride, talk.enabled}` in `chat_metadata`; authored content in the story record. `extras` still exposes a full settings view in memory (`applyGlobalSettings`), but `stripGlobalSettings` removes the install-wide half before persisting.
- Story identity is the authored `id` (+ `version`), never the content hash: the library is keyed by id, the per-chat blob is keyed by id, and each chat **pins a full copy** of the story it plays (`pinnedStory`), so library edits and deletion never reach a running chat. `contentHash` stays for integrity and drift detection (`contentHashAtLoad`). Re-selecting hydrates; `restartStory()` is the only reset.
- Boundary counters ≠ ST message indexes. Boundary snapshots/logs record `{lastMessageId, chatLength}`.
- Pending queue writes not persisted; reload drops them, reconciliation recovers.
- Extraction audits persist in runtime extras (`extras.extraction.audits`); facts moved to the memory tiers (`extras.memory`, facts tier) as of plan 07 — `extras.extraction.facts` no longer exists.
- Journeys (v2.1 layer 5): `test/journeys/*.journey.json`, run by `scripts/debug/so-journey.mts` (wraps the `so-scenario` step engine, never forks it). Catalog + checks: `docs/plans/v2.1/test-plan.md`.
- Session journal derives from the existing rings at read time; only status transitions and player flags are persisted (`extras.journal`, cap 200). Payload captures stay in-memory (ring of 5) inside `SessionJournal`.
- Fixtures: `test/fixtures/*.story.json|*.transcript.json|*.expected.json`; recorded LLM goldens in `test/goldens/`. Jest always runs deterministic goldens. **Live delta accuracy is a browser-driven script, not a jest env flag**: `scripts/debug/so-live-suite.mts` runs each `extractor*` triple through the real memory model via `globalThis.storyOrchestratorLiveSuite.runFixture` (same pure `extraction/fixtureRun.ts` prompt path as jest) and scores exact-match on `{q,v}` deltas; `--record` writes `test/goldens/live/`.
- Build output `dist/` generated + gitignored.

## Path aliases (tsconfig + webpack)

Active: `@components @services @utils @constants @engine @runtime @extraction @pacing @generation @memory @copilot @talk` → `src/<name>/*`. (Dead `@hooks @controllers @store` aliases + their empty dirs removed in plan 13.)
