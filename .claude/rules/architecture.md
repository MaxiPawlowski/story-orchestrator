# Architecture

```
src/
  index.tsx                 # Entry: mounts React roots, registers talkControlInterceptor
  Apps.tsx                  # Exports SettingsApp, LoreManagerApp
  services/                 # Core business logic
    StoryOrchestrator.ts    # Main engine (~998 lines): checkpoint state, triggers, evaluations
    CheckpointArbiterService.ts  # LLM evaluation via ST's generateRaw (JSON-only mode)
    PresetService.ts        # Runtime preset management (Story:<id>), role overrides, UI sync
    TalkControlService.ts   # NPC reply injection, generation intercept, trigger queues
    STAPI.ts                # Facade over SillyTavern host globals (dynamic imports)
    TalkControl/            # Subsystem: CharacterResolver, MessageInjector, ReplySelector
  controllers/
    orchestratorManager.ts      # Singleton lifecycle for StoryOrchestrator
    turnController.ts           # ST event listener, dedup (TurnGate), epoch-based role tracking
    requirementsController.ts   # Validates persona, group members, world info, lorebooks
    persistenceController.ts    # Load/save runtime state keyed by (chatId + story title)
    storyRuntimeController.ts   # Re-export of orchestratorManager (not a real controller)
  store/
    storySessionStore.ts    # Zustand vanilla store (story, runtime, requirements, turns)
    requirementsState.ts    # Immutable helpers for diffing/cloning requirement snapshots
  components/
    context/                # StoryContext + ExtensionSettingsContext providers
    drawer/                 # Requirements badges, checkpoint progress
    settings/               # Arbiter config, story selection, Studio launcher
    studio/                 # Checkpoint editor (tabbed), graph view (Cytoscape/dagre), diagnostics
    common/                 # Shared UI components (RequirementIndicator)
  utils/
    story-schema.ts         # Zod schema for story JSON
    story-validator.ts      # Normalization: ordered checkpoints, transition maps, regex compilation
    story-state.ts          # Runtime persistence helpers, checkpoint status derivation
    story-library.ts        # CRUD for story library in extension settings
    story-macros.ts         # Macro registration via MacrosParser (story_title, chat_excerpt, etc.)
    slash-commands.ts       # /checkpoint (/cp): list, prev, eval, activate by index/id
    checkpoint-studio.ts    # Studio draft models, regex helpers, Mermaid export
    arbiter.ts              # Arbiter frequency/prompt sanitization
    event-source.ts         # Event subscription helpers
    settings.ts             # Extension settings persistence (getExtensionSettingsRoot)
    groups.ts               # Group chat utilities
    string.ts               # String manipulation (quoteSlashArg, etc.)
  constants/
    main.ts                 # extensionName, PLAYER_SPEAKER_ID/LABEL
    defaults.ts             # DEFAULT_INTERVAL_TURNS=3, ARBITER_SNAPSHOT_LIMIT=10, etc.
    presetSettingKeys.ts    # Text generation preset key mappings
  hooks/
    useStoryContext.ts      # Access StoryContext
    useStoryLibrary.ts      # Story library CRUD
    useStoryOrchestrator.ts # Orchestrator lifecycle binding
  types/
    cytoscape-dagre.d.ts    # Type defs for graph library
```

## Path Aliases (tsconfig + webpack)

```
@components/* → src/components/*
@services/*   → src/services/*
@hooks/*      → src/hooks/*
@utils/*      → src/utils/*
@controllers/* → src/controllers/*
@constants/*  → src/constants/*
@store/*      → src/store/*
```
