# Architecture

Map of the main modules (not exhaustive: `ls` the dir). Plan numbers and dates live in the plan docs.

```
src/
  index.tsx                  # starts runtime, mounts settings panel + drawer
  engine/                    # pure — never imports STAPI
    schema.ts / gameSchema.ts # format-2 types (+ quests, checks, widgets)
    validate.ts, validate/*  # normalization/validation, graph indexes (requirements -> {personas,members,lorebooks}); validate/life.ts, validate/widgets.ts
    agency.ts                # AgencyPolicy + DEFAULT_AGENCY + prompt clauses
    player.ts                # the story's `player` profile: renderPlayerRoleLine (the one canonical line), carriesPlayerRoleLine
    castNames.ts             # the one cast resolver: roster id -> member card name
    storyDiff.ts             # diffStories(prev,next,state) -> compatible|invalidating + pruneEngineState
    blackboard.ts / gates.ts / transitions.ts / convergence.ts / applyQueue.ts / engine.ts / replay.ts
    life/                    # character life (relationships, mood, agendas, schedule, clock) compiled to qualities; lazy chunk
  runtime/
    index.ts                 # bootstrap; wiring/* (generation, lore, scheduler, talk, judgeScene)
    runtimeManager.ts        # lifecycle + boundary commit + persistence + event fan-out + delegation (managerDelegates/managerWiring)
    coordinators/            # one extras slice each, injected deps: memory, extraction, expansion, copilot, pacing, stagecraft, scene, inner, living, agendaProposal
    boundaryWork.ts          # registry {id, order, when, run} of everything a committed boundary schedules
    snapshotBuilder.ts       # the one RuntimeSnapshot the UI subscribes to
    roster.ts / turnBridge.ts / rollback.ts / talkControl.ts / chance.ts
    effectsApplier.ts        # AN, preset, WI, cast, NPC replies, background; effectLedger.ts (write-ahead ledger), effectExtensions.ts
    samplerOverlay*.ts       # preset effect as a per-request sampler overlay
    replyEffort*.ts          # reply thinking budget (llama.cpp only); thoughtLeak.ts, emptyReply*.ts repair thought-only/leaked replies
    worldInfo*.ts, scanGatePlan.ts # checkpoint WI gating (scan mode default, file mode fallback), normaliser + ledger, evidence ring, matcher
    storyLore*.ts / lorePlacement.ts / loreSelect*.ts / loreExclusive.ts / loreKeyMatch.ts / mirrorScan.ts / memoryMirror.ts / requirementsRead.ts
    persistence.ts / chatSave.ts / saveHealth.ts / saveEvidence*.ts # chat_metadata blob (BLOB_VERSION), save chokepoint + evidence
    storyLibrary.ts / storySelection.ts / storyUpdate.ts / librarySave.ts
    settingsStore.ts / settingsModel.ts / settingsDelta.ts / settingsControl.ts # install-wide settings (stored as delta over defaults)
    passProfiles.ts / requestBudget.ts / modelCall*.ts # per-role model routes (profile or harness), context limits, the model call
    checks.ts / checksSetup.ts / checks*.ts / repair.ts # the one check registry; Repair is its ordering
    narrative.ts / pipeline.ts / inlineTimeline.ts / messageInspector.ts / nextTurn.ts / playerProjection.ts # pure player/author views
    memoryInjector.ts / memoryQueue.ts / continuity.ts / judge.ts / chapters*.ts / chapterSeal.ts
    playerSetup*.ts / playerRoleHost.ts / checksPersona.ts # identity step, persona lock
    makeGroup*.ts / noGroup.ts / noChat.ts # group-only stories
    widgets.ts / gameSnapshot.ts # story widgets + game sheet composition
    livingPort.ts / livingUnit.ts / meanwhilePort.ts / agendaProposalsHost.ts # main-entry doors to lazy chunks
    ownership: runToken.ts / runOwner.ts # RunOwnership / RunGuard
    spikes/                  # spike modules, lazy chunk, each behind `spikes.<id>` (on unless literally false)
  generation/                # expansion planner/critic/merge (paths.ts: every route through a chain); living/ = living director (lazy)
  extraction/                # scope.ts (pure), scopeBudget.ts (token budget for the read's scope), contract/parse, sharedRead, scheduler, reconcile
  pacing/ talk/ memory/ judge/ stagecraft/ wizard/   # pure cores (see invariants)
  copilot/                   # authoring stages; agent/ = agentic wizard + Ask (lazy); guideTopics.ts (compact guide, drift-tested); knowledge/ (lazy)
  studio/                    # Checkpoint Studio: draft.ts (zustand), mutations.ts (typed API), diagnostics, StudioModal, components/*, agentHost.ts
  sprites/                   # VN stage, sprite builder, poses/ (pose library + look layers), liveHead/ (live close-shot head)
  image/                     # image routing, ComfyUI story workflows, model sources/downloads, GPU broker line
  guide/ features/           # in-app guide reader (pages.generated.ts); feature registry + copy; guideTopicGroups.json
  services/STAPI.ts, services/stHost/*  # the only host import surface
  components/                # drawer/, inline/, settings/, briefing/, presence/, widgets/, studio/ (shared primitives + AskBox), ...
  constants/injectionRegistry.ts # single source of truth for injection keys + depths
server-plugin/               # ST server plugins: judge, harness (opencode tool bridge), media (ComfyUI, model downloads), gpu (GPU broker)
```

Path aliases (tsconfig + webpack): `@components @services @utils @constants @engine @runtime @extraction @pacing @generation @memory @copilot @talk @wizard @stagecraft @judge` -> `src/<name>/*`.

## Invariants

### Layering and guards
- `STAPI.ts` + `stHost/*` are the only files importing ST host modules, via dynamic `import(/* webpackIgnore: true */ …)`.
- `src/engine/**` and `extraction/scope*` never import STAPI. `EngineHost` is a clock seam (`{ now }`, plus `derive` for code writes), not an effects seam: host effects live in `effectsApplier.ts` and coordinators, tested with injected deps.
- Coordinators get constructor-injected deps, never import each other, never call `saveMetadata`; they mutate their extras slice through injected accessors and ask the manager to persist. Engine writes go through injected enqueue callbacks.
- One snapshot, one subscription: read-models ride on the snapshot; drawer/inline components never call manager getters during render.
- `src/runtime/architecture.test.ts` fails the build on: manager > 700 lines, coordinator > 560 (packed lines counted), components<->studio imports, manager getters in drawer/inline, message-DOM writers other than the declared ones (`stHost/inlineMount.ts` is the only `.mes_block` writer), engine/judge/stagecraft purity, stagecraft and living director touching the blackboard/memory, scene coordinator writing, coordinators importing each other.
- Other guards: `ownership.guard.test.ts` (+ `test/findings/ownership-sites.json`: every write-after-await in runtime/wizard/extraction/generation/copilot/agent classified `checked|delegate|local|partial|todo`; a `checked` row means the body has a token check, not that it precedes every write — tests prove order), `faultMatrix.guard.test.ts` (+ `test/findings/faultMatrix.json`), `lorebookWriters.guard.test.ts` (census of every lorebook write site + its guard, planted controls), `lazyHarness.guard.test.ts`, `oneBuild.guard.test.ts`, `soloRemoval.guard.test.ts`, `legacyFree.guard.test.ts`, `codeHealth.guard.test.ts`, `stHost/typedResults.test.ts` (every stHost write answers `{ok:true,…}|{ok:false,reason}`).
- Main bundle budget 1,300,000 B (`webpack.config.js`, `scripts/release/buildChecks.mjs`); harness, calibration, spike, Studio-agent, living and game-layer code ride lazy chunks.
- Every asynchronous writer takes a `RunOwnership`: mint a `RunToken` at the top, re-check before EACH write (inside loops too). A token cannot detect a stale cache entry; key caches by everything they depend on (chat, story, path).
- Boundary work is a registry entry, not a callback. Boundary counters ≠ ST message indexes; logs record `{lastMessageId, chatLength}`.
- **Consequences recap reads after the boundary's whole evaluation order** (boundary work `recap`, order 7, after `game` records checks): effect refs come from the finished `BoundaryLogEntry` (transitions against `evaluated`, quests/milestones/agenda against `after`), never from display text. Refs live in `extras.recap` keyed by boundary; rollback keeps exactly the boundaries the engine kept (`rollbackRecap(state, engine boundary)` in `quarantine`), so the SC1 detectors decide. "Because you…" needs a recorded `playerSpan` (commit guard) on the single deciding write; any doubt abstains to a neutral line. Composer is a lazy chunk (`runtime/consequences.ts`).

### State homes
- Three lifetimes, three homes: install-wide settings in `extensionSettings["story-orchestrator"].settings`, stored as a **delta over defaults** (`settingsDelta.ts`; `getGlobalSettings` never writes; a value set back to its default leaves the store); per-chat engine state, rings and overrides `{ui.authorView, pacing.shapeOverride, talk.enabled}` in `chat_metadata.story_orchestrator`; authored content in the story record. `stripGlobalSettings` removes the install-wide half before persisting.
- Story identity is the authored `id`, never the content hash. Each chat pins a full copy (`pinnedStory`); library edits never reach a running chat. Stories carry no version: drift = library `hash` vs `contentHashAtLoad`. `restartStory()` is the only reset.
- The stored blob is a detached JSON copy, never the live run (`savePersistedRuntime`/`loadPersistedRuntime` copy). Anything but a stamped `BLOB_VERSION` (7) blob with `engineHistory`, `visitedPath`, `pinnedStory` is unreadable: never written, replaced only by a confirmed Restart.
- Pending queue writes are not persisted; reload drops them, reconciliation recovers. Extraction audits persist in `extras.extraction.audits`; facts live in `extras.memory`.
- Session journal derives from the rings at read time; only status transitions and flags persist (`extras.journal`, cap 200).
- One automatic library->chat path: the author's own save. `applyStoryUpdate` diffs merged stories against live state, hot-swaps when compatible, else keep/restart/cancel; keeping prunes orphaned values. Other chats take it only via their own "Update to the latest" or Restart.

### Where stories run
- **No chat, no story**: with no chat open nothing activates; import saves to the library only (`snapshot.noChat`); `EffectsApplier` refuses (`NO_OPEN_CHAT`). Restore on leave still runs.
- **No group, no story**: one-on-one chats keep the runtime inactive (no reads, injections, effects, HUD; `NO_OPEN_GROUP`). A one-on-one chat offered a story shows the make-a-group card (`runtime/makeGroup.ts`: the story's own cast, validated with `validateProvisioningOp`, create-only, binds and opens). Solo code is removed (`soloRemoval.guard.test.ts`).

### World Info
- Lorebook existence is `world_names`, never `loadWorldInfo` (it answers a missing name with a cached dummy). `upsertWIEntry` never creates a book; callers that must create call `ensureLorebook` (only the memory mirror does).
- **A story's lorebooks reach only the chats that play it**: nothing selects a story book globally. `storyLore.ts` appends the playing story's `requirements.lorebooks` (mirror excluded) to every scan of the chat it was loaded into, as the FIRST awaited `WORLDINFO_ENTRIES_LOADED` observer; a book any array already holds is not appended twice. A story book still selected globally raises an author-only Repair row (deselect after confirm, or keep).
- **Checkpoint `world_info` is derived from the chat's path, never toggled in place.** Every entry any checkpoint enables/disables is the story's gated set; the plan starts the set off and replays `engine.checkpointPath` (plus earned switches: rewarded quests, landed agenda steps). Default `worldInfo.gatingMode = "scan"`: a per-scan view on ST's scan copies (`scanGatePlan`), gated entries rest off in their files (normaliser + ledger `worldInfo.normalized`, drift = Repair row). `file` mode (path replay + release, one batched write per book) is the author's choice and the capability fallback. The normaliser writes only gated entries.
- WI activation is observed (`WORLD_INFO_ACTIVATED`, `WORLDINFO_ENTRIES_LOADED`), never inferred; the evidence ring is read-only.
- The memory mirror (one book per chat, `extras.memory.wiBook`) is scanned, not bound, in scan mode; file mode binds the chat slot and names a foreign slot as a conflict.
- Exclusive lore-select only narrows, only when every signal agrees (use on, story `exclusive`, scan mode, loud generation, vectors WI off, complete selection); never touches constant, gated or timed entries.
- Per-turn story lore lands late (`lorePlacement.ts`): in scan mode, non-constant entries of the story's own books at position 0/1 move to depth `worldInfo.lateLoreDepth` (default 4) on the scan copies only, so the prompt prefix stays cacheable. Opt-out: `lore_select.position: "authored"`.

### Stagecraft, curator, warden
- **Stagecraft proposes, never writes**: curators return typed ops; accepted ones apply at a boundary through the effects path, within the story's authored `stagecraft.lorebooks` only, re-checked at the write edge (`isCuratorWritable`), and never on a checkpoint-gated entry. Each applied op records the entry's pre-write state so a rollback reverts it; every proposal/application is journaled. Accept mode `review` (default) | `auto` | `off`.
- Entry markers `{{// so:auto}}` (tier) and `{{// so:protect}}`…`{{// so:end}}` only remove writes: `auto` mode accepts on the spot only for `auto` entries; an op touching a protected span is refused at plan time and at the write edge.
- **Curator create**: a new entry that near-duplicates an existing one (vectors 0.82/0.55, wording fallback 0.45/0.25) is flagged on its card with "patch X instead" (a warning, never a refusal: the author decides, v2.8 11 A15); an applied create carries a `{{// so:created <chat> | <group>}}` stamp (`stagecraft/createdStamp.ts`), kept by rewrites, refused when forged; deleting the chat offers its stamped entries for removal after confirm.
- The continuity warden's note is the one non-boundary output: injected for the outermost loud generation, marked applied only when that generation renders a real reply; lapses after the player writes again and a newer reply arrives; rollback withdraws it.
- `upsertWIEntry` always re-enables what it writes: re-disable an entry the author had switched off.

### Wizard, Ask, personas
- **The wizard is create-only; validation is the guard**: `wizard/provisioning.ts` decides whether a provisioning op may run (UI card and `applyProvisioning` both call it). Provisioning ops never reach bulk accept. Created assets leave the story only through ordinary mutation ops. **The wizard never touches personas**; a persona is created only by the player's click in the start step, only ever added. Every story start locks the chosen persona to the chat. `requirements.personas` names missing from the install are refused. A group holds only the draft's own cast.
- **The agentic wizard writes only through its tools, and only the author confirms an asset**: `checkToolCall` (unknown tool/arg refused with did-you-mean), edits wait in `review` or apply in `auto-draft`; provisioning calls ALWAYS wait. The loop refuses repeats locally (rejected ops, created assets, read guide topics, unchanged reads); `REPEAT_LIMIT` (3) stops the run. `tools.test.ts` fails when a `mutations.ts` export has neither a tool nor a stated reason. The harness tool bridge (`server-plugin/story-orchestrator-harness/agentBridge.mjs`, opencode only, one MCP shim exposing exactly the page's tool schemas, run as a session on OpenCode's own service through its client library in `opencodeTransport.mjs`; no opencode login file is read, copied or refreshed, and a missing or expired sign-in is a status the owner can act on) changes the transport, not the rule; `driveAgent` checks the draft's `RunOwnership` after every turn.
- **Wizard default model** (owner 2026-10-10): an unset authoring role resolves to opencode `openai/gpt-6.1-sol` on the harness tool bridge when the plugin offers it, else the install's first DeepSeek Chat Completion profile (native tool calls via `stHost/profileToolBridge.ts`, text route on auth/quota/transport/timeout failure), else the memory model (`passProfiles.ts` `roleDefaultFrom`/`AUTHORING_DEFAULT_HARNESS`, `studio/agentHost.ts`). An assigned profile or harness route wins; a routed harness that is not offered is refused, not silently replaced. Every other role keeps the memory model. Ask runs on the authoring role, so it follows. Tests: `runtime/authoringDefault.test.ts`, `studio/agentHost.test.ts`, `stHost/profileToolBridge.test.ts`.
- **Ask cannot write**: neither Ask tool set holds an edit/provisioning tool; `checkAskCall` refuses anything else before it runs; player Ask builds from `runtime/playerProjection.ts` alone and refuses draft reads.
- Every authorable field has a guide topic (`copilot/guideCoverage.test.ts`; `PENDING_GUIDE_TOPICS` for unbuilt features). Guide source: `docs/authoring/story-guide.md` with `<!-- topic: id -->` markers; `npm run docs:guide` splits it into `docs/guide/author/fields/<page>.md` grouped by `src/features/guideTopicGroups.json` (each topic a `##` anchored by its id) and rebuilds the bundle.
- Wizard sessions live install-wide (`wizardSessions`, cap 8) and carry the created-asset ledger that `so-assets.mts` cleans against.

### Judge
- **The judge never blocks and never writes.** Read model behind `server-plugin/story-orchestrator-judge` (the only place a provider key is read). Providers: `typesafe` (default), `llama-logprob`, `systemone-local` (local decider model on 127.0.0.1). A use routed to a provider with no passed calibration row for provider × model × use is refused (`uncalibrated`); an answer from another served model is discarded (`model-mismatch`). TypeSafe size limits are enforced before sending (`too-large`, never truncated); plugin rate limits adapt to 429/`Retry-After`. Every use is its own switch (`judge.uses.*`, all on by default); no key = fallback. Calls land in `extras.judge.calls` (cap 300). `src/judge/` is pure. The judge director runs only when every candidate has an authored `roster[].role`.
- A spike or calibration is decided by its predeclared floor; an unreachable floor is not retuned. Measurements are kept as goldens that replay in jest.

### Effects, generation, replies
- A preset is a per-request sampler overlay on loud requests only, only over keys the request carries; never an install write. Kobold/Novel/Horde are refused with a reason.
- The reply thinking budget is the one overlay that adds keys: exactly `TEXTGEN_BUDGET_KEYS`, only on llama.cpp (TC `api_type === "llamacpp"`, or CC `custom` with `llamacpp`-owned models, inside `custom_include_body`), only loud requests in the story's chat, only when the setup thinks. Off = budget 1. A cut thought leaked into the visible reply is moved back into `extra.reasoning` (`thoughtLeak.ts`).
- A thought-only reply is not a turn (`emptyReply.ts`): no boundary, swiped once under a `RunGuard`, second empty kept and shown to the player.
- Deterministic stagecraft first: `effects.background` applies on activate and hydrate, idempotently.
- Host effects go through `EffectsApplier.withLedger`: a `pending` row persisted (and its save verified) BEFORE the host call; refused (`PENDING_NOT_SAVED`) if the save did not land; restore on leave is compare-and-set.
- **Every generated outcome is a route**: `mergeExpansions` emits one transition per outcome, priority = declaration order DESCENDING; anchor threshold = min over routes unless authored. Checks enumerate every route (`generation/paths.ts`); a chain with any unusable route is `needs-review`. `sanitizeExpansion` drops entries from another `EXPANSION_CONTRACT`. One generation per chain writes (`liveJobs`).
- **The living director writes only the future, and only at a boundary**: typed graph ops (new `liv_` checkpoints, stubs, transitions, chapters, ≤2 namespaced qualities) checked by `checkDirectorOps` at proposal and apply; applied in boundary work `living-apply`; the played story is `fold(authored, folded, ops)`; rollback drops later ops (also on the no-transition rollback path), reopen replays. Pace: a code fallback opens director way-ins after a few player turns; divergence (judge read or two refusals, counted on committed turns) may branch (`liv_b<n>_way`), one per checkpoint, never where the director leads. `suggest` waits for the author; a player always gets `auto`.
- **The agency policy's defaults ARE the policy**: absent `Checkpoint.agency` = `DEFAULT_AGENCY`. A player who refuses the prepared route gets one neutral line and an author recovery, never narrated compliance.
- **Chance is seeded, never `Math.random`**: rolls, NPC reply `probability` and the talk pick draw from hash(chat, story, boundary, key); rollback ≡ replay.
- Talk control: `globalThis.talkControlInterceptor` is set once in `startRuntime()`; decisions keyed `chatId:checkpointId:lastMessageId`. A chained voice yields to the player (`stHost/voiceStart.ts`).

### Memory and privacy
- **A held secret never reaches a kept-out member through a shared tier.** `[hiding]`/`[unaware]` rows become `HeldSecret`s; every shared tier, the ledger, the WI mirror, archive recall, the canon (input and every reader), chapter records/eras, scene summaries, the player's Memory tab and every other shared text built from memory are rendered per drafted member or through the resting view (`MemoryInjector.restingEntries`/`restingFilter`, `withoutSecretLines`). A read's knowledge lines apply before its memory rows; short-term compaction never summarizes past the last read window. Player surfaces are identical with and without a held secret. ST Summarize / Vector Storage copy the transcript and cannot be filtered: the `transcript-copiers` check names them. Tests: `runtime/secret*.review.test.ts`.
- If a write changes injected state, the write refreshes the injection (not the caller).
- Derived memory artifacts record `inputs`/`range` and `removed` (`memory/derived.ts`); `reverseMemoryState` composes the rollback; `rollback ≡ replay` is a property test.
- Character life is ordinary story state compiled to qualities; agendas never call a model; life lines reach only the drafted member's private block. Meanwhile proposals are text only, propose only (`stagecraft.meanwhileAcceptMode` `auto` default | `review` | `off`), land at a boundary, roll back by message.
- **Faction standing is ordinary story state** (v2.8 53): `rep_<faction>`, `rep_<faction>_seen_<member>`, `rep_<faction>_move_<move>` code ints compiled in `validate/factions.ts`; moves apply in the latch pass after quest rewards (and again after a fired transition), once ever, the record written only when the add applied; `factionsMoved` is the rollback detector (SC1 registry entry `FACTION_ROLLBACK_DETECTOR`). Never written by `state_snapshot`; a lowering move needs an evidenced event (`faction-move-on-inaction`). Players get band words of visible factions only; the director gets visible bands and `introduce` names, never a hidden faction's band, members or lore.
- **One range clamp**: `Blackboard.applyDelta` clamps every int/float write into `Quality.range` (compiled from `display.min/max` or a faction range) before the type check; player view = blackboard (no display-time clamp).
- Epistemic data is never written to World Info.

### Model routes and context
- Each pass role resolves a route (`passProfiles.resolveRoute`): role harness > assigned profile > install default (authoring only) > inherited role > memory model. A routed role that is not answering is the `degrades` check `model-role-outage`, not a blocker.
- Requests over the served context are refused before sending, and a profile asking more than the server serves raises `context-over-server` (`checksSetup.ts`). The extraction read's scope is cut to a token budget (`extraction/scopeBudget.ts`).
- The GPU broker (`server-plugin/story-orchestrator-gpu`, adapters `none|observe|supervise|managed`) shares one GPU between the local text model and ComfyUI; its text gateway forwards `/tokenize`/`/detokenize` outside the text queue. Loopback only.

### UI and checks
- Two personas, one default: player mode is the publishable surface; author view adds, never conditionally reveals. Steering controls and internals panels are author-only (`so-ui.mts assert-player-clean`).
- Player copy has one source: `narrative.ts` (where am I) + `pipeline.ts` (what the machine is doing); checkpoint names, never ids.
- **One check registry; Repair is its ordering** (`runtime/checks.ts`, `checksSetup.ts`, …): `{id, area, scope, audience, severity: blocks|degrades|info, feature, detect}`; `detect` is pure over the snapshot. `blocks` cannot be dismissed. One surface, no toasts: drawer `#so-setup`, HUD count chip, settings Repair row. A new check needs consequence + player copy, an existing `feature`, and a firing fixture (`checksRegistry.test.ts`). The start pane opens on its own only before the first committed reply.
- The inline timeline renders into the DOM and never posts a chat message; effective level `min(level, authorView ? 4 : 2)`.
- The next-turn preview is composed from `INJECTION_REGISTRY` + the blocks ST holds, in ST's assembly order.
- Every diagnostic code declares its consequence (`DIAGNOSTIC_CONSEQUENCES`); one save vocabulary (`Saved "X" to the library.` / `Applied to this chat: …`).
- Modal overlays are native `<dialog>` + `showModal()`.

### Tests and fixtures
- Fixtures: `test/fixtures/*.story.json|*.transcript.json|*.expected.json`; recorded LLM goldens in `test/goldens/`. Live delta accuracy is `scripts/debug/so-live-suite.mts`, not a jest flag.
- Journeys: `test/journeys/*.journey.json` via `scripts/debug/so-journey.mts`; acceptance runs `--strict`, twice, archived under `test/journeys/records/<gate>/`.
- Build output `dist/` is generated and gitignored.
