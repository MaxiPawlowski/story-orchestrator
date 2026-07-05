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
    slashCommands.ts         # /cp state/set/activate/extract
    macros.ts                # story_blackboard macro (more in plan 13)
    hash.ts / requirements.ts / blackboardMemo.ts
  extraction/
    scope.ts                 # active + reachable gate/snapshot scope (pure)
    contract.ts / parse.ts   # shared-read prompt, strict DELTA/FACT parser
    sharedRead.ts            # window -> scope -> prompt -> parse -> audit
    scheduler.ts             # P0/P1 queue, cadence, retry/pause
    reconcile.ts             # stall-triggered targeted reads
    canonLite.ts / cues.ts / client.ts / chatWindow.ts
  pacing/                    # plan 04: tension.ts, shapes.ts, steering.ts
  services/stHost/           # SillyTavern host wrappers (one module per concern)
  services/STAPI.ts          # only import surface for host modules
  components/studio/         # DEAD v1 code, zero imports — plan 11 rebuilds
  utils/ constants/
```

## Invariants

- `STAPI.ts` + `stHost/*` are the only files importing ST host modules, via dynamic `import(/* webpackIgnore: true */ …)`.
- `src/engine/**` and `extraction/scope*` never import STAPI; host effects go through the `EngineHost` seam so tests can fake them.
- Runtime state per chat in `chat_metadata`; story library in extension settings.
- Boundary counters ≠ ST message indexes. Boundary snapshots/logs record `{lastMessageId, chatLength}`.
- Pending queue writes not persisted; reload drops them, reconciliation recovers.
- Extraction audits/facts persist in runtime extras until plan 07 migrates to memory tiers.
- Fixtures: `test/fixtures/*.story.json|*.transcript.json|*.expected.json`; recorded LLM goldens in `test/goldens/`, re-record via `LIVE=1 npm test`.
- Build output `dist/` generated + gitignored.

## Path aliases (tsconfig + webpack)

Active: `@components @services @utils @constants @engine @runtime @extraction @pacing` → `src/<name>/*`.
Legacy, no backing dir — do not use: `@hooks @controllers @store`.
