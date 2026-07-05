# Architecture

```
src/
  index.tsx                  # mounts settings/drawer UI and starts v2 runtime
  engine/
    schema.ts                # format-2 types
    validate.ts              # manual normalization/validation and graph indexes
    blackboard.ts            # typed values, versions, latching, monotonic checks
    applyQueue.ts            # serialized writes drained only at boundaries
    engine.ts                # checkpoint state, gates, boundary logs, rollback
    replay.ts                # deterministic fixture runner
  runtime/
    index.ts                 # runtime bootstrap, scheduler wiring, TurnBridge
    runtimeManager.ts        # ST-facing coordinator and persistence boundary
    turnBridge.ts            # ST events -> boundary commits / mutation rollback
    effectsApplier.ts        # AN, preset, WI, cast, NPC replies
    persistence.ts           # chat_metadata.story_orchestrator storage
    storyLibrary.ts          # extension-settings story library
    slashCommands.ts         # /cp state/set/activate/extract
    macros.ts                # v2 story macros
  extraction/
    scope.ts                 # active + reachable gate/snapshot scope
    contract.ts              # shared-read prompt
    parse.ts                 # strict DELTA/FACT parser
    sharedRead.ts            # window -> scope -> prompt -> parse -> audit
    scheduler.ts             # P0/P1 queue, cadence, retry/pause
    reconcile.ts             # stall-triggered targeted reads
    canonLite.ts             # anchors, fired gates, top facts
  services/stHost/           # SillyTavern host wrappers
  services/STAPI.ts          # only import surface for host modules
  components/                # current lightweight settings/drawer UI
  utils/                     # event-source/string/data helpers
```

## Invariants

- `STAPI.ts` is the only public import surface for ST host modules.
- Runtime state is per chat in `chat_metadata`; story library is extension settings.
- Boundary counters and ST message indexes are distinct. Boundary snapshots/logs record `{lastMessageId, chatLength}`.
- Pending queue writes are not persisted. Reload drops them; reconciliation recovers.
- Extraction audits/facts are persisted in runtime extras until plan 07 migrates facts to memory tiers.
- Build output `dist/` is generated and gitignored.

## Path Aliases

```
@components/* -> src/components/*
@services/*   -> src/services/*
@hooks/*      -> src/hooks/*
@utils/*      -> src/utils/*
@controllers/* -> src/controllers/*
@constants/*  -> src/constants/*
@store/*      -> src/store/*
```
