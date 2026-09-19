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
      stagecraftCoordinator.ts # v2.1 plan 07: extras.stagecraft — the WI curator pass, the review ring, the boundary write, rollback revert
    boundaryWork.ts          # v2.1 plan 03: declarative registry of everything a committed boundary schedules
    snapshotBuilder.ts       # v2.1 plan 03: composes the single RuntimeSnapshot the UI subscribes to
    roster.ts                # v2.1 plan 03: roster <-> ST group/chat resolution (enabled ids/names, active speaker, name<->id)
    turnBridge.ts            # ST events -> boundary commits / mutation rollback
    effectsApplier.ts        # AN, preset, WI, cast, NPC replies, background (v2.1 plan 07)
    worldInfoGates.ts        # (pure) checkpoint world_info as a gated set: path replay plan + release plan
    persistence.ts           # chat_metadata.story_orchestrator storage
    storyLibrary.ts          # extension-settings story library
    slashCommands.ts         # /cp state/set/activate/extract/expand/converge/memorize
    macros.ts                # story_blackboard + story_memory_<tier> macros (more in plan 13)
    extras.ts                # v2.1 plan 01: RuntimeExtras factory/sanitizers + hydrateExtras (moved out of runtimeManager)
    journal.ts               # v2.1 plan 01: SessionJournal — status/flag records + payload ring, buildSessionJournal() over the existing rings
    narrative.ts             # v2.1 plan 04 (pure): the one composed player "where am I" view — drawer Overview, away popup, /story recap
    pipeline.ts              # v2.1 plan 04 (pure): derived working/reading/stalled-rechecking/idle/not-configured/error signal
    storyUpdate.ts           # v2.1 plan 05: library -> running chat (diff, choice popup, swap, re-pin, journal record)
    storySelection.ts        # v2.1 plan 07: which story this chat plays — import/select/restart/remove against the library + pinned copy
    wizardSessions.ts        # v2.1 plan 06: wizard conversation + stage + created-asset ledger, persisted in extension settings
    memoryMirror.ts          # memory -> World Info mirror over injected host deps: one book per chat (`Story Orchestrator - <title> - <chatId>`, `extras.memory.wiBook`), created via ensureLorebook, bound to the chat lorebook slot
    values.ts                # v2.1 plan 05 (pure): typed text -> PrimitiveValue for /cp set and the driver
    awayRecap.ts             # gap detection + welcome-back rendering of narrative.ts (popup injected, module stays pure)
    judge.ts                 # v2.2 plan 01: JudgeRuntime — availability cache, every call recorded in extras.judge.calls, director() adapter (null = today's chain), probe()/calibrate() for the self-test and so-judge
    talkControl.ts           # plan 14: TalkController — real talkControlInterceptor routing, per-pass decision keyed chatId:checkpointId:lastMessageId (v2.1 plan 08), wrapper-finished reconcile (host seam built in runtime/index.ts)
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
  wizard/                    # v2.1 plan 06 (pure): types.ts (questions + provisioning ops), provisioning.ts (create-only validation, environment fold), interview.ts (session key, answer rendering, "Fix with wizard" seed)
  judge/                     # v2.2 plan 01 (pure): types/questions/client (askJudge: validate, cache, timeout → fallback), policy.ts (every threshold), director.ts (hybrid questions + decision), settings.ts (judge.uses.* all off, dependencies, call ring), selfTest(.Cases).ts
  stagecraft/                # v2.1 plan 07 (pure): types.ts (curator ops, accept modes), prompt.ts, parse.ts (strict line parser), proposal.ts ("first || last" patch application, plan+preview), scope.ts (the stagecraft.lorebooks allowlist)
  memory/                    # plan 07: tier stores (facts/session/short_term/scene), scene detection, injection — pure except inject.ts
  studio/                    # plan 11: Checkpoint Studio v2 — draft.ts (zustand store), mutations.ts (typed API = 12's contract), diagnostics.ts (8 checks), gateOptions.ts, qualityUsage.ts, graphAdapter.ts (v2→GraphPanel + Mermaid), io.ts (export/import), StudioModal.tsx + components/*, *.stories.tsx
                             #   v2.1 plan 05 tabs: Story (id/version/description/arc_template/requirements/arc_bridges) + Roster; save hands the record to the host via onSaved
                             #   v2.1 plan 06: the Copilot tab is the Wizard (StudioCopilot = interview + staged proposals + provisioning), WizardQuestions.tsx, ProvisioningCard.tsx
                             #   v2.1 plan 07: Story tab gained the stagecraft allowlist; EffectsEditor gained Background
  services/stHost/           # SillyTavern host wrappers (one module per concern); provisioning.ts = v2.1 plan 06 character/group creation, backgrounds.ts = v2.1 plan 07 background read/switch, judge.ts = v2.2 plan 01 plugin status/transport + key write to ST secrets
  services/STAPI.ts          # only import surface for host modules
  components/studio/         # the 6 reused presentational primitives (GraphPanel, graphPanelUtils, MultiSelect, Toolbar, FeedbackAlert, HelpTooltip) — rest of v1 deleted
  components/drawer/         # DrawerTabs (player: Overview/Memory; author adds Blackboard/Scheduler/Payload + engine panels, incl. "Fix with wizard"),
                             #   PlayerOverview (v2.1 plan 04: narrative view + pipeline signal + rollback notice), HudStrip, DriverPanel (author-only)
  utils/ constants/          # constants/injectionRegistry.ts = single source of truth for injection keys+depths
```

## Invariants

- `STAPI.ts` + `stHost/*` are the only files importing ST host modules, via dynamic `import(/* webpackIgnore: true */ …)`.
- `src/engine/**` and `extraction/scope*` never import STAPI. `EngineHost` is the clock seam (`{ now }`), not an effects seam: host effects live in `runtime/effectsApplier.ts` and `runtime/coordinators/*`, which tests fake by injecting deps.
- Three lifetimes, three homes (spec addendum v2.1 §Configuration homes): install-wide settings in `extensionSettings["story-orchestrator"].settings`; per-chat engine state, rings and the overrides `{ui.authorView, pacing.shapeOverride, talk.enabled}` in `chat_metadata`; authored content in the story record. `extras` still exposes a full settings view in memory (`applyGlobalSettings`), but `stripGlobalSettings` removes the install-wide half before persisting.
- Story identity is the authored `id` (+ `version`), never the content hash: the library is keyed by id, the per-chat blob is keyed by id, and each chat **pins a full copy** of the story it plays (`pinnedStory`), so library edits and deletion never reach a running chat. `contentHash` stays for integrity and drift detection (`contentHashAtLoad`). Re-selecting hydrates; `restartStory()` is the only reset.
- **The wizard is create-only, and validation is the guard** (v2.1 plan 06): `src/wizard/provisioning.ts` decides whether a provisioning op may run, folding the environment forward so a step can depend on the previous one; the UI card and `copilotCoordinator.applyProvisioning` both call it, so nothing reaches the install because a prompt asked nicely. Provisioning ops travel in the `ProposalOp` union but `applyOp` deliberately ignores them and `diffProposal` keeps them out of `items` — bulk accept can never reach them. What a created asset leaves in the story is a `setRequirements`/`addRosterMember` op through the ordinary mutation path (`provisioningFollowUpOps`), which is why the requirements panel goes green from evidence. Personas are never provisioned.
- Wizard sessions live install-wide (`extensionSettings["story-orchestrator"].wizardSessions`, cap 8, `runtime/wizardSessions.ts`), keyed by draft id/title, and carry the created-asset ledger that `so-assets.mts` cleans up against.
- One automatic library→chat path, and it is the author's own save (v2.1 plan 05): `applyStoryUpdate(record?)` diffs the **merged** old and new stories against live engine state (`engine/storyDiff.ts`), hot-swaps silently when compatible, and raises a keep/restart/cancel choice when invalidating; keeping prunes exactly the orphaned values (`pruneEngineState`) and re-pins this chat. Other chats are never touched — they take a newer version only through their own "Update to v*N*" or Restart.
- **The judge never blocks and never writes** (v2.2 rule 1). It is a read model behind `server-plugin/story-orchestrator-judge` (the only place the TypeSafe key is read: ST secrets, env, `~/.typesafe/api-key/.env`). Every usage is its own install-wide opt-in (`judge.uses.*`), **all off by default and never flipped by a plan**; each consumer keeps today's path and takes it on disabled/unavailable/timeout/error/ineligible. Calls land in the per-chat `extras.judge.calls` ring (cap 300), never `extras.journal`; the session journal derives `judge` events from it. `src/judge/` is pure and the engine never imports it (`architecture.test.ts`). The judge director runs only when every candidate has an authored `roster[].role` (names-only measured 21/26, below the LLM director).
- **Stagecraft proposes, it never writes** (v2.1 plan 07, spec addendum §Stagecraft): a curator returns typed ops, the runtime applies accepted ones **at a boundary** through the effects path, and its whole write scope is the story's authored `stagecraft.lorebooks` — nothing is inferred from `requirements` or from `world_info` effects. That scope excludes every checkpoint-gated entry: the curator is never shown one, and `isCuratorWritable(story, lorebook, comment)` refuses one at the write edge. Otherwise a curator write would fight the path replay (2026-09-19). The allowlist is re-checked at the write edge (`isCuratorWritable`), so an edited or replayed proposal cannot widen it. `StagecraftCoordinator` has no engine, memory, generation or pacing dependency **by construction**, and `architecture.test.ts` fails the build if one appears. Every proposal and application is journaled (`kind: "stagecraft"`), each applied op records the entry's pre-write state so a mutation rollback reverts it, and the curator is capability-flagged off by default (`stagecraft.curatorEnabled`) with accept mode `review | auto | off` (default `review`). The fleet design and the per-curator veto rules live in `docs/plans/v2.1/stagecraft-design.md`.
- Lorebook existence is `world_names`, never `loadWorldInfo` (it answers a missing name with a cached dummy). `upsertWIEntry` never creates a book; a caller that should create one calls `ensureLorebook` first. The memory mirror does (per chat, chat-bound); the curator and the wizard's entry step never do.
- **Checkpoint `world_info` is rebuilt from the chat's path, never toggled in place** (2026-09-19). The flags live in global lorebook files, so switching them per checkpoint leaked across chats and stories. Every entry any checkpoint of a story enables or disables is that story's *gated set*. On each apply (activate, hydrate, rollback, story swap), `worldInfoPlan` starts the whole set off and replays `engine.checkpointPath` in order (enables, then disables): a continuous run and a reopened chat end in the same state. On load and clear, the manager releases (disables) the gated sets of every library story plus the story being left, minus the incoming story's own set. Entries outside any gated set are never touched, and neither are books that are not listed. Not-ready requirements leave world info alone. `EngineState.visitedPath` records every checkpoint entered, intermediates included (`visitedAnchors` skips them, and sun-ruins gates CP4 on `cp-4a`/`cp-4b`). State saved before it existed infers the intermediates wherever the graph leaves a single way in.
- Deterministic stagecraft first: `effects.background` (`"file.jpg"` or `{name}`, normalized at parse) is applied by `EffectsApplier` on activate *and* hydrate, idempotently — an agent is only justified where no checkpoint effect can express the decision.
- Coordinators (`runtime/coordinators/*`) get constructor-injected deps and never import each other or call `saveMetadata`: they mutate their extras slice through injected accessors and ask the manager to persist/notify. Engine writes go through injected enqueue callbacks — the engine stays manager-owned.
- One snapshot, one subscription: `snapshotBuilder` composes it and coordinator read-models (`ledger`, `driver`, `activeNudge`, plus v2.1 plan 04's `narrative`, `pipeline`, `lastRollback`) ride on it — drawer components never call manager getters during render.
- Two personas, one default (v2.1 plan 04): player mode is the publishable surface; author view **adds**, never conditionally reveals. Steering controls (driver, Advance/Nudge/Probe/Suggest, `/cp`) and every internals panel (epistemic, ledger, arcs bookkeeping, convergence, boundary numbers, superseded/folded memory) are author-only. The spoiler checklist in `docs/plans/v2.1/test-plan.md` is the list, asserted by `so-ui.mts assert-player-clean` and journey J3.3.
- Player copy has one source (v2.1 plan 04): `narrative.ts` composes the "where am I" view and `pipeline.ts` says what the machine is doing; the drawer Overview, the away popup and `/story` all render that one composition. Player text uses checkpoint names, never ids/boundaries; author-grade text rides in `pipeline.detail`, never in `pipeline.text`.
- Boundary work is a registry (`runtime/boundaryWork.ts`), not a callback: new work = a new `{id, order, when, run}` entry.
- `src/runtime/architecture.test.ts` enforces the manager size budget, the coordinator budget, the components<->studio import boundary, drawer-reads-snapshot, engine purity and the stagecraft coordinator's isolation from the blackboard and the memory tiers. A failing guard is a failing build.
- Boundary counters ≠ ST message indexes. Boundary snapshots/logs record `{lastMessageId, chatLength}`.
- Pending queue writes not persisted; reload drops them, reconciliation recovers.
- Extraction audits persist in runtime extras (`extras.extraction.audits`); facts moved to the memory tiers (`extras.memory`, facts tier) as of plan 07 — `extras.extraction.facts` no longer exists.
- Journeys (v2.1 layer 5): `test/journeys/*.journey.json`, run by `scripts/debug/so-journey.mts` (wraps the `so-scenario` step engine, never forks it). Catalog + checks: `docs/plans/v2.1/test-plan.md`. Acceptance runs use `--strict` (a `blocked` check fails) and are archived under `test/journeys/records/<gate>/`, because `.debug` rotates; a gate is called green only after the journey ran **twice** (v2.1 plan 08 found two second-run-only defects).
- Session journal derives from the existing rings at read time; only status transitions and player flags are persisted (`extras.journal`, cap 200). Payload captures stay in-memory (ring of 5) inside `SessionJournal`.
- Fixtures: `test/fixtures/*.story.json|*.transcript.json|*.expected.json`; recorded LLM goldens in `test/goldens/`. Jest always runs deterministic goldens. **Live delta accuracy is a browser-driven script, not a jest env flag**: `scripts/debug/so-live-suite.mts` runs each `extractor*` triple through the real memory model via `globalThis.storyOrchestratorLiveSuite.runFixture` (same pure `extraction/fixtureRun.ts` prompt path as jest) and scores exact-match on `{q,v}` deltas; `--record` writes `test/goldens/live/`.
- Build output `dist/` generated + gitignored.

## Path aliases (tsconfig + webpack)

Active: `@components @services @utils @constants @engine @runtime @extraction @pacing @generation @memory @copilot @talk @wizard @stagecraft @judge` → `src/<name>/*`. (Dead `@hooks @controllers @store` aliases + their empty dirs removed in plan 13.)
