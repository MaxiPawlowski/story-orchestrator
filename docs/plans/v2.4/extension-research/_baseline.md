# Story Orchestrator — capability baseline for the v2.4 extension review

Reference for reviewers comparing community ST extensions against SO v2.3.0 (`manifest.json` version `2.3.0`). Written 2026-09-23 from source + docs, read-only. Paths are relative to the extension root. `src/…:N` = file:line of a grep-able symbol. Status truth for v2.3 lives in `docs/plans/v2.3/00-overview.md` §Replan 2026-09-23 (several "COMPLETE" claims were reopened by the audit); this file lists what EXISTS in code, not what is live-proven.

How to use: for each community extension, ask (a) does SO already do this (section 1), (b) would adopting it break an invariant (section 2), (c) is it already a seed (section 3), (d) is it something SO deliberately does not do (section 4).

---

## 1. Feature inventory by subsystem

### 1.1 Engine — checkpoints, gates, blackboard (pure)
- Format-2 story: typed qualities (`source: extractor|code`, `latching`, `monotonic`, `scope_hint`, `ledger_binding`, `read_as`), checkpoints (objective, `state_snapshot`, `tension_target`, `target_turn_length`, effects, `talk_control`, `agency`, `convergence_threshold`), transitions with gate trees, roster, requirements, stagecraft allowlist. `src/engine/schema.ts:53` `interface Quality`, `:144` `interface Checkpoint`, `:252` `interface StoryV2`.
- Gate grammar `{q,op,v}` + `all/any/not`, evaluated deterministically; rendered text is display-only. `src/engine/gates.ts:17` `evaluateGate`, `:30` `renderGateText`.
- One transition per boundary, highest priority first. `src/engine/transitions.ts:5` `selectFiring`.
- Typed blackboard w/ versions, latching, monotonic checks. `src/engine/blackboard.ts:30` `class Blackboard`.
- Serialized apply queue drained only at boundaries. `src/engine/applyQueue.ts:30` `class ApplyQueue`.
- Engine state, boundary logs, snapshots, rollback, persisted history with explicit horizon (200). `src/engine/engine.ts:100` `class StoryEngine`, `:70` `ROLLBACK_HORIZON`, `:249` `rollbackTo`.
- Convergence: code-owned `progress_toward_<anchor>` qualities, thresholds. `src/engine/convergence.ts:4` `progressQualityForAnchor`, `:8` `chainThresholdFor`.
- Agency policy defaults (`protect_player_choice`, `never_narrate_player_action`, `objective_kind`). `src/engine/agency.ts:6` `DEFAULT_AGENCY`.
- Story diff vs live state for hot-swap / invalidation. `src/engine/storyDiff.ts:100` `diffStories`, `:247` `pruneEngineState`.
- Deterministic replay runner for fixtures. `src/engine/replay.ts:19` `runReplay`.
- Checkpoint `world_info` as gated set, rebuilt from path (never toggled in place). `src/engine/worldInfoEffects.ts:37` `gatedWorldInfo`; `src/runtime/worldInfoGates.ts:12` `worldInfoPlan`.
- Typed read hints (`choice|stated|rating`) with rubric levels. `src/engine/qualityRead.ts:3` `QUALITY_READ_AS`.

### 1.2 Extraction (off-path LLM reads → typed deltas)
- Shared read: window → derived scope → prompt → strict DELTA/FACT/MEMORY parse → audit; response capped at 24 deltas. `src/extraction/sharedRead.ts:87` `runSharedRead`, `:15` `MAX_DELTAS_PER_READ`.
- Scope = reachable-gate qualities (pure), explainable in Studio. `src/extraction/scope.ts:86` `deriveScope`, `:22` `deriveScopeExplained`.
- Strict parser + reasoning-block stripping (`<think>`, Gemma channel, Harmony). `src/extraction/parse.ts:93` `parseSharedReadResponse`, `:51` `stripReasoningBlocks`.
- Evidence-span check (quote must appear in window). `src/extraction/evidence.ts:28` `evidenceInWindow`.
- Scheduler: P0/P1 lanes, cadence, stability lag (default 0), retry/pause. `src/extraction/scheduler.ts:54` `class ExtractionScheduler`.
- Forced cues (regex/text → force a read, never write). `src/extraction/cues.ts:5` `scheduleForcedCues`.
- Stall reconciliation (targeted re-read of unmet-gate qualities). `src/extraction/reconcile.ts:58` `planReconciliation`.
- Canon-lite fallback (anchors + fired gates). `src/extraction/canonLite.ts:4` `getCanonLite`.
- LLM call via Connection Manager profile, message-array + instruct template. `src/extraction/client.ts:11` `callExtractionModel`; `src/services/stHost/connectionProfiles.ts:43` `sendConnectionProfileRequest`.
- Coordinator: audits ring, scene/short-term/epistemic-ledger passes, memorize backlog. `src/runtime/coordinators/extractionCoordinator.ts:47` `ExtractionCoordinator`, `:383` `runMemorizeBacklog`, `:314` `runShortTermCompaction`.
- Model self-test over fixed fixtures (per-tier pass/fail). `src/runtime/selfTest.ts:156` `runModelSelfTest`, `#so-self-test` in settings.

### 1.3 Memory — tiers, epistemic, ledger, arcs, canon
- Four tiers `facts / session_details / short_term / scene_history`, each its own injection block at a registered depth. `src/constants/injectionRegistry.ts:12` `INJECTION_REGISTRY`; `src/memory/inject.ts:54` `applyMemoryInjection`.
- Stores + message-id rollback, pin (retention) / exclude / edit. `src/memory/stores.ts:26` `addMemoryEntries`, `:77` `dropByMessageId`.
- Scoring/budget (token estimate, diversity floor). `src/memory/score.ts:45` `scoreEntry`; `src/memory/budget.ts:9` `entryTokens`.
- Consolidation P4: dedup bands (ST vectors `/api/vector/*`, Jaccard fallback), supersession, latching bridge. `src/memory/consolidate.ts:54` `consolidateTier`; `src/runtime/consolidationMatches.ts:8` `buildMatchSets`; `src/services/stHost/vectors.ts:31` `vectorQuery`.
- Scene-break heuristic (location/cast change). `src/memory/sceneDetect.ts:34` `detectSceneBreakHeuristic`.
- Epistemic map `[knows]/[unaware]/[suspects]/[believes]/[hiding]`, per-member private block swapped in on draft; never written to WI. `src/memory/epistemic.ts:50` `applyEpistemicSignals`; handle `onMemberDrafted`.
- State ledger `[state:Entity:type] field=value`, blackboard-bound fields single-writer. `src/memory/ledger.ts:31` `applyLedgerSignals`, `:4` `LEDGER_CAP`.
- Arcs open/resolved, arc→anchor bridges (`arc_bridges`). `src/memory/arcs.ts:8` `ARC_OPEN_CAP`.
- Canon synthesis (WHAT HAS HAPPENED / CURRENT STATE), input-hash staleness. `src/memory/canon.ts:23` `buildCanonSummaryPrompt`, `:11` `canonInputHash`.
- Provenance envelope (`source/messageId/boundary/pass/validity/override/inputs/confidence`); quarantined rows excluded from injection. `src/memory/provenance.ts:9` `VALIDITIES`.
- Derived-artifact records + reversal (rollback ≡ replay property). `src/memory/derived.ts:56` `rollbackDerived`; `src/memory/reverse.ts:23` `reverseMemoryState`.
- Conflict/reconciliation queue (resolve, dismiss, lock as canon, re-read, reconfirm). `src/runtime/memoryQueue.ts:144` `resolveMemoryConflict`; `src/components/drawer/ConflictQueue.tsx:96`.
- Memory → WI mirror, one book per chat, chat-bound. `src/runtime/memoryMirror.ts:69` `syncMemoryMirror`, `:50` `mirrorLorebookName`.
- Coordinator (620-line budget). `src/runtime/coordinators/memoryCoordinator.ts:49` `MemoryCoordinator`.

### 1.4 Pacing / tension
- Tension levels → numeric, EMA smoothing, arc templates (dramatic shapes), expected tension by progress. `src/pacing/tension.ts:21` `updateEma`; `src/pacing/shapes.ts:33` `expectedTension`.
- Steering hint injected at depth 2, agency-aware. `src/pacing/steering.ts:47` `getSteeringHint`; `src/runtime/coordinators/pacingCoordinator.ts:25`.

### 1.5 Generation / expansion (stubs → generated beats)
- Planner finds stubs + reachable anchor; generator + reviewed generation; critic + code checks over every route; merge emits one transition per outcome. `src/generation/planner.ts:35` `planExpansion`; `src/generation/generate.ts:55` `generateReviewedBeats`; `src/generation/critic.ts:27` `runCodeChecks`; `src/generation/merge.ts:11` `mergeExpansions`; `src/generation/paths.ts:21` `outcomePaths`.
- Staleness revalidation, cache states `queued/generating/validated/inserted/needs_review/failed/stale`, Regenerate action. `src/generation/revalidate.ts:33` `revalidateExpansion`; `src/runtime/coordinators/expansionCoordinator.ts:33`.
- Agency-refusal recovery derived from boundary log. `src/runtime/agencyRecovery.ts:25` `agencyRecovery`.

### 1.6 Talk control / speaker direction (group chats)
- Per-checkpoint `talk_control` (speakers/weights, lead, no_repeat, allow_silence, LLM director w/ `SPEAKER: name|NONE`); mention → director → weighted rules; enforced through manifest `generate_interceptor`. `src/talk/rules.ts:57` `chooseByRules`; `src/talk/parse.ts:18` `parseDirectorResponse`; `src/runtime/talkControl.ts:78` `TalkController`; `src/runtime/index.ts:186` `talkControlInterceptor`.
- Decisions ring keyed `chatId:checkpointId:lastMessageId`; wrapper-finished reconcile `/trigger`.
- NPC auto-replies effect (`onEnter|afterSpeak|sceneBreak`, scripted|llm). `src/engine/schema.ts:11` `NPC_REPLY_TRIGGERS`.

### 1.7 Stagecraft — effects, WI curator, warden, backgrounds
- Checkpoint effects: Author's Note (+role), preset (textgen only), world_info, cast_changes (per-chat mirror), npc_replies, background. `src/engine/schema.ts:87` `CheckpointEffects`; `src/runtime/effectsApplier.ts:160` `EffectsApplier`.
- Owned-effect ledger: write-ahead pending row, reconcile on hydrate, compare-and-set restore. `src/runtime/effectLedger.ts:112` `restorePlan`, `:72` `reconcileLedger`.
- Background seam (`/bg`, locked bg via chat metadata). `src/services/stHost/backgrounds.ts:50` `applyBackground`.
- WI curator: proposes `first||last` patch ops only within `stagecraft.lorebooks`, gated entries excluded, review|auto|off, boundary-applied, revertible. `src/stagecraft/scope.ts:24` `isCuratorWritable`; `src/stagecraft/proposal.ts:30` `applyCuratorPatch`; `src/stagecraft/types.ts:9` `STAGECRAFT_ACCEPT_MODES`; `src/runtime/coordinators/stagecraftCoordinator.ts:74`.
- Continuity warden: judge contradiction check → one-turn depth-0 note. `src/runtime/continuity.ts:60` `createContinuityCheck`; registry key `continuityNote`.
- Judge lore selection (forced top-K WI entries). `src/runtime/loreSelect.ts:33` `LoreSelector`; `src/judge/lore.ts:78` `pickLore`.
- Scene tracker (location/time/present/heading) injection + macros. `src/runtime/coordinators/sceneCoordinator.ts:33` `SceneCoordinator`.

### 1.8 Wizard / provisioning
- Interview (≤3 questions, "You decide"), staged proposals, create-only provisioning of character cards, story lorebook + entries, group; per-op review cards, never bulk. `src/wizard/interview.ts:4` `YOU_DECIDE`; `src/wizard/provisioning.ts:25` `validateProvisioningOp`; `src/wizard/types.ts:27` `PROVISIONING_OP_KINDS`.
- Host creation seams. `src/services/stHost/provisioning.ts:40` `createCharacterCard`, `:83` `createGroup`; `src/services/stHost/worldInfo.ts:136` `createLorebook`.
- Sessions persisted install-wide with created-asset ledger. `src/runtime/wizardSessions.ts:28` `saveWizardSession`.
- Authoring stages + in-play driver (Suggest/Report/Nudge/Probe/Advance). `src/copilot/authoring.ts:31` `runAuthoringStage`, `:63` `runDriverSuggest`; `src/runtime/coordinators/copilotCoordinator.ts:27`.

### 1.9 Studio authoring
- Native `<dialog>` modal, zustand draft, typed mutation API (shared with copilot/wizard), tabs: Story/Roster/qualities/checkpoints/transitions/scope preview/diagnostics/Wizard; graph + Mermaid export; import/export. `src/studio/StudioModal.tsx:35` `STUDIO_TAB_IDS`; `src/studio/mutations.ts:29` `addQuality`; `src/studio/draft.ts:72` `useDraftStore`; `src/studio/graphAdapter.ts:21` `toMermaid`; `src/studio/io.ts:6` `importDraft`.
- Diagnostics with plain-language consequence per code. `src/studio/diagnostics.ts:40` `DIAGNOSTIC_CONSEQUENCES`, `:113` `runDiagnostics`.
- Editors: Gate builder, Effects, TalkControl, Agency, QualityRead, Snapshot. `src/studio/components/*Editor.tsx`.
- Save → library → this chat's hot-swap or keep/restart/cancel popup. `src/runtime/storyUpdate.ts:90` `applyStoryUpdate`.

### 1.10 Player surface — drawer, HUD, recap, settings
- Top-bar drawer: player mode (Overview narrative + Memory curation) vs author view (Blackboard/Scheduler/Payload, engine panels, driver, curator ring, conflict queue, next-turn preview). `src/components/drawer/DrawerTabs.tsx:710` `DrawerTabs`; `src/components/drawer/PlayerOverview.tsx:47`.
- Narrative composition (now/recently/threads/story/status, checkpoint names only) shared by drawer, away popup, `/story`. `src/runtime/narrative.ts:95` `buildNarrativeStatus`.
- Pipeline status (`error > not-configured > stalled-rechecking > reading > working > idle`). `src/runtime/pipeline.ts:47` `derivePipelineStatus`.
- HUD strip above input (checkpoint, tension, pending chip, pipeline chip). `src/components/drawer/HudStrip.tsx:18` `HudStrip`.
- Away recap popup after ≥8h gap. `src/runtime/awayRecap.ts:3` `AWAY_RECAP_MIN_MS`.
- Transition `/comment` notes at boundary (opt-out). `extras.ui.announceTransitions` `src/runtime/extras.ts:142`.
- Settings entry points Start/Continue/Repair/Author; Repair = one worst-first missing step. `src/components/settings/EntryPoints.tsx:28`; `src/runtime/repair.ts:25` `nextRepairStep`.
- Next-turn preview (injected blocks in ST assembly order). `src/runtime/nextTurn.ts:76` `buildNextTurnPreview`.
- Capabilities read-out + "Copy for a bug report". `src/components/settings/CapabilitiesGroup.tsx`.
- Session journal + player flag ⚑. `src/runtime/journal.ts:146` `SessionJournal`.
- Macros `{{story_*}}` (title, checkpoint, transitions, tension, scene_*, blackboard, canon, memory_<tier>, epistemic, ledger, role_<id>). `src/runtime/macros.ts:39` `registerRuntimeMacros`.
- Slash `/cp` (author), `/so-mem`, `/story recap|threads|flag` (player-safe). `src/runtime/slashCommands.ts:61`, `:122`, `:173`.

### 1.11 Judge (TypeSafe Jev behind ST server plugin)
- Typed-judgment client w/ cache, timeout → fallback; plugin holds the key. `src/judge/client.ts:40` `askJudge`; `server-plugin/story-orchestrator-judge/index.mjs`; `src/services/stHost/judge.ts:44` `judgeTransport`.
- 14 use keys, all default off: director, memoryVerify, memoryPairs, sceneTrigger, sceneTracker, sceneOoc*, lookahead, loreSelect, curatorFilter, memoryRerank*, typedExtraction, stallCheck, expansionCritic, expansionLookahead (*no consumer). `src/judge/settings.ts:5` `JUDGE_USE_KEYS`.
- Every threshold in one file; readiness table w/ measured rate + p50. `src/judge/policy.ts:1` `JUDGE_DEFAULT_MODEL`; `src/judge/readiness.ts:25` `JUDGE_READINESS`.
- Calibration/self-test per family vs predeclared floors. `src/judge/selfTest.ts:117` `judgeFamilyScores`. Recommended set: `docs/plans/v2.3/recommended-config.md`.
- Runtime ring `extras.judge.calls` (cap 300). `src/runtime/judge.ts:29` `JudgeRuntime`.

### 1.12 Host integration seams
- Only host import surface: `STAPI.ts` + `stHost/*` via `import(/* webpackIgnore */)`. `src/services/stHost/modules.ts:5` `importSTModule`.
- Vendored host types; context from `globalThis.SillyTavern`. `src/services/stHost/hostTypes.ts`; `src/services/stHost/context.ts:15` `getContext`.
- Events by constant keys. `src/services/stHost/events.ts:54` `subscribeToHostEvent`.
- Extension prompts (injection). `src/services/stHost/extensionPrompts.ts:19` `setStoryExtensionPrompt`; read-back `src/services/stHost/promptInspector.ts:18` `readInjectedPromptBlocks`.
- Macro seam (MacrosParser, dual-engine). `src/services/stHost/context.ts:49` `registerHostMacro`.
- WI: existence via `world_names`, `ensureLorebook`, `upsertWIEntry` never creates, activate global. `src/services/stHost/worldInfo.ts:117` `ensureLorebook`, `:189` `upsertWIEntry`.
- Typed `WriteResult` for every write (guarded by test). `src/utils/writeResult.ts`; `src/services/stHost/typedResults.test.ts`.
- Capability probes (`macros, slashCommands, backgrounds, vectors, judge` → present|absent|error). `src/services/stHost/capabilities.ts:68` `PROBES`.
- Save evidence (observe `/api/chats/save`, read server chat file back). `src/services/stHost/persistence.ts:107` `readServerBoundary`; `src/runtime/saveEvidence.ts:44` `recordSaveEvidence`.
- Others: AN `authorNotes.ts:29`, presets `presets.ts:36` `presetBackend`, groups `groups.ts:30`, popups (DOM text nodes) `popup.ts:13`, drawers `drawers.ts:3`, tokenizer `tokenizer.ts:3`, slash exec `slashCommands.ts`.

### 1.13 Persistence, identity, rollback, ownership
- Per-chat blob in `chat_metadata.story_orchestrator` (id-keyed, chat-stamped, pinned story copy, 5 story states retained). `src/runtime/persistence.ts:60` `getMetadataBlob`, `:10` `STORY_STATE_RETENTION`, `:97` `restampRenamedChat`.
- Install-wide settings vs per-chat overrides. `src/runtime/extras.ts:288` `applyGlobalSettings`, `:302` `stripGlobalSettings`.
- Story library keyed by id. `src/runtime/storyLibrary.ts:89` `saveStoryRecord`; select/restart `src/runtime/storySelection.ts:97` `restartStory`.
- TurnBridge: rendered reply = boundary; swipe/edit/delete = rollback; denylist non-turn types; continue commits. `src/runtime/turnBridge.ts:37` `TurnBridge`, `:9` `NON_TURN_MESSAGE_TYPES`.
- Cross-store rollback (engine, memory, stagecraft, judge ring, host effects) w/ horizon notice. `src/runtime/rollback.ts:35` `runRollback`.
- Boundary work registry. `src/runtime/boundaryWork.ts:146` `BOUNDARY_WORK`.
- RunToken ownership for every async writer. `src/runtime/runToken.ts:138` `beginRun`, `:71` `tokenMatches`.
- One snapshot for UI. `src/runtime/snapshotBuilder.ts:41` `buildRuntimeSnapshot`.

### 1.14 Testing harness
- Jest (~150 suites, colocated `*.test.ts`), property tests (`*.property.test.ts`), review/ownership tests (`*.review.test.ts`), architecture guard `src/runtime/architecture.test.ts:9` `MANAGER_LINE_BUDGET`, ownership census `src/runtime/ownership.guard.test.ts` + `test/findings/ownership-sites.json`, fault matrix `src/runtime/faultMatrix.guard.test.ts`, findings ledger `test/findings/ledger.json`.
- Storybook interaction + a11y for every UI part (`*.stories.tsx`, `test-storybook:ci`).
- Live harness `scripts/debug/*.mts`: `so-scenario` (closed vocabulary `lib/scenarioSchema.mts`), `so-journey` (J0–J12, `--strict`, automated/human/cleanup gates), `so-live-suite` (real-model delta accuracy), `so-run-header` (pin/diff run variables), `so-journal follow`, `st-payload` capture, `so-assets` cleanup, `so-responsive`, `so-judge`.
- Release: `scripts/release/manifest.mjs` → `dist/manifest.json`, `clean-host.sh`, attestation test.

---

## 2. Hard invariants a v2.4 idea must respect

1. Engine purity: `src/engine/**` never imports STAPI/judge; `EngineHost` = clock only (`engine.ts:7`). Build-enforced.
2. Host access only via `STAPI.ts` + `stHost/*` dynamic imports; new host access = new `stHost/` module; verify ST shapes in source, no blind casts.
3. All blackboard writes go through the apply queue, drained only at rendered-reply boundaries; one transition per boundary; nothing mid-generation.
4. Regex/text never writes state — a cue may only force a read. Extractor cannot write `source: code` qualities or out-of-scope qualities; evidence must be in window.
5. Reply path never waits on the off-path scheduler; extra compute only off-path.
6. Stagecraft proposes, never writes directly; write scope = authored `stagecraft.lorebooks` minus checkpoint-gated entries, re-checked at write edge; applied at a boundary; journaled + revertible; coordinator has no engine/memory deps (build-enforced).
7. Judge never blocks and never writes; every use is its own install-wide opt-in, all OFF by default, never flipped by a plan; a use ships only past its predeclared floor; floors are never retuned after seeing a score.
8. Wizard is create-only, enforced in `wizard/provisioning.ts` (not prompt); provisioning excluded from bulk accept; personas never provisioned; a requirement is not ownership.
9. Player/author split: player surface shows no future checkpoints, gates, epistemic/ledger internals, or steering controls; author view adds, never conditionally reveals; player copy uses checkpoint names; `assert-player-clean` checks it.
10. Every async writer mints a `RunToken` and re-checks before EACH write (inside loops too); census must classify every write-after-await.
11. Rollback ≡ replay without the removed input, across engine, memory, epistemic, ledger, scene, stagecraft, judge ring, host effects.
12. Story identity = authored `id`+`version`; each chat pins a full copy; library edits never reach a running chat except via the author's save/update/restart in that chat.
13. Three config homes: install-wide settings / per-chat `chat_metadata` (only `authorView`, `shapeOverride`, `talk.enabled` overrides) / story record. Persistence changes bump blob version with migration.
14. Checkpoint `world_info` rebuilt from path replay, never toggled in place; only gated sets touched.
15. Epistemic content never written to World Info (privacy); quarantined rows excluded from every injection/canon/warden list.
16. A write that changes injected state refreshes its own injection; host write results are typed `WriteResult`, never boolean/void.
17. Save success is read from evidence (server read-back), never from `saveMetadata`'s return/exception.
18. Coordinators never import each other nor call `saveMetadata`; UI reads one snapshot, never manager getters in render. Manager ≤700 lines, coordinator ≤620.
19. CSS scoped to SO mount roots; modals are native `<dialog>` + `showModal()`.
20. Live gates are real-LLM; `debugResponse` mocks never sign off an LLM path; journeys run twice, archived.
21. Preset effects are textgen-only today (refused w/ reason elsewhere).
22. Boundary work = registry entry `{id, order, when, run}`, not ad-hoc callbacks.

---

## 3. Known gaps / v2.4 seeds already listed (`docs/plans/v2.3/v2.4-seeds.md`)

A. Decisions owed
- `player_summary` optional per-checkpoint player-facing field — pending player sessions.
- OpenAI/chat-completion preset adapter — contract question (build vs textgen-only).
- Human-eval rubrics (J8.4, J9.6/J9.7, all v2.3) — outstanding plan-11 obligation, not a seed.

B. Judge/agentic family below floor or never run
- Lore-ranking rebuild via Score arm — spike REFUTED on nDCG@4 (0.886 vs 0.927). The tie rate 1.00 (vs Noul 0.08) was an artifact of rounding the Score answer to a level (`Math.round`); the raw Score ties 0.04 (see SUMMARY T21, verified 2026-09-23).
- precision@4 ≥ 0.85 floor — unreachable by construction; re-declare metric. "A six-level Score ties more, so try a finer scale" does not follow: the ties came from the rounding (SUMMARY T21).
- Narrow WI curator `create` op (F5) — needs own Phase A ≥20 cases.
- Remaining plan-10 spikes: scene-break confirmation, canon verify, epistemic-via-judge, cast-tuning curator, two-hop look-ahead, per-quality floors, canon-regeneration drafts.
- `so-lore-probe diff` — needs played chat + control arm.
- Judge drift — unmeasurable while `jev-latest` = `jev-1.13.0`.
- `sceneOoc` / `memoryRerank` toggles — no consumer; wire or remove.

C. Calibration without meaning yet
- Live-suite per-tier floors (facts 0.7273 vs 0.85; rejected 0.6667 vs 0.9) — set from measurement or re-read fixtures.
- `backgrounds` judge use 0.8636 fails own floor; no runtime consumer.

D. Follow-ups from live work
- Expansion `generating` marker wedges after chat switch — key by chat or expire.
- `so-assets remove` leaves `worldInfoCache` stale; doesn't remove test regex/QR sets.
- Out-of-horizon history for a player: "re-read from checkpoint start" vs "restart".
- No request-size bound on extraction path (shared read, scene/epistemic passes, curator filter, `memorize:full` whole-chat read) — cap/chunk.
- Id-keyed restore in `memoryQueue.commitDecision` (currently array restore can clobber) — compare-and-set like `effectLedger`.
- Button labels overflow at ≤213 px CSS width (200% zoom) — wrap/stack `menu_button` rows.

E. Save-evidence asymmetry (keep, don't unify): `withLedger` refuses on sticky `hasUnsavedChanges`; `commitDecision` refuses only on `saveWasLost`.

Also open from `00-overview.md` §Replan work queue (todo): V8 (M7 token recompute, Discard via commitDecision), V13 (refusal signal, headingTo consumer), V14 (token-boundary evidence match), V15b (AN + background through `withLedger`), V17 (probe fixes, inferred-return typed-results guard), V18, V19 (hide dead toggles, next-turn "open owning editor", keyboard authoring), V20a–e (harness), V22 (docs/status), V24 (stale scenario corpus); live queue L1–L8 (P0′ playthrough, strict matrix ×2, fork scenarios, host restore, turn types, plan 09/11 live rows, clean-host).

---

## 4. Not in scope today (evidenced)

- No image generation: zero references to `/sd`, `imagine`, SD extension in `src/` (grep 2026-09-23). The `st-image-generation` skill is reference knowledge only. Background switching (`/bg`) is the only visual effect.
- No ambience/music/TTS: addendum §Stagecraft lists them as "candidates later only if a verified host seam exists"; zero `tts|speech` hits in `src/`.
- No expression sprites / Live2D / avatar control (no `expression|sprite` usage in runtime).
- No stat-tracker / HP / inventory UI or HTML-rendered message widgets: zero `inventory|statbar|hp_` hits; state lives in blackboard + ledger, shown only in author view and via macros. SO never rewrites message DOM (`mes_text` unused; it only subscribes to render events for boundaries).
- No regex scripts or Quick Reply sets created/managed by the product (zero `regexScripts|quickReply|/qr-` hits in `src/`); only the harness cleanup gap mentions test regex/QR.
- No function-calling / tool registration (`ToolManager`, `registerFunctionTool` absent).
- No translation feature (zero `translate` hits in `src/`).
- No own vector DB: uses ST's `/api/vector/*` (`source: transformers`) or Jaccard fallback.
- No chat-completion preset effects (refused, `src/services/stHost/presets.ts:41` `PRESET_UNSUPPORTED_REASON`).
- WI curator cannot create entries/books (edit ops within allowlist only); curator/wizard entry step never create books; epistemic never mirrored to WI.
- Wizard never edits existing user cards / non-story lorebooks, never provisions personas.
- No cloud sync or remote storage; all state in `chat_metadata` + extension settings.
- No autonomous story rewriting of authored content: expansion only fills stubs; copilot never writes state directly (Probe → extraction, Advance → manual path, Nudge → one-turn steering).
- Judge is one external provider (TypeSafe Jev via server plugin), not a general multi-LLM router; memory LLM = one Connection Manager profile.
- Player cannot steer (no Advance/Nudge/Probe/`/cp` in player mode).
- Single human, two hats (player/author) — no multi-user or shared-session play model (spec addendum v2.1 §Personas).
