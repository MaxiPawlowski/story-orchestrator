# Implementation Overview — Story Orchestrator v2

How [story-orchestrator-spec-v2.md](story-orchestrator-spec-v2.md) gets built: 13 sequential plans (`docs/01-…13-…`), each executed by one build agent, each ending in a **validation gate** that must be fully green before the next plan starts. No parallel execution; later plans consume contracts earlier plans export.

## Rules for every build agent

1. Read, in order: the spec (`story-orchestrator-spec-v2.md`), this file, your plan file, and the **Gate records of all previously executed plans** (tail sections of their plan docs — they carry as-built truth and deviations). Nothing else is required context.
2. **STAPI boundary**: only `src/services/STAPI.ts` + `src/services/stHost/*` import SillyTavern host modules (dynamic `import(/* webpackIgnore: true */ …)`). Everything else imports through STAPI. New host access = new `stHost/` module.
3. Never typeguard or cast an unverified ST value. Confirm shapes in ST source (`C:\dev\SillyTavern-MainBranch\`, docs in `.claude/sillytavern-docs/`) or add a debug log + local type.
4. No code comments; self-explanatory code. TypeScript strict. Match existing idiom.
5. Engine purity: `src/engine/**` and `src/extraction/scope*` never import STAPI — host effects go through the `EngineHost` seam so the harness can fake them.
6. Fixtures in `test/fixtures/` (stories `*.story.json`, transcripts `*.transcript.json`, answer keys `*.expected.json`); recorded LLM goldens in `test/goldens/`. `LIVE=1` re-record not implemented yet (deterministic goldens only) — real re-record path lands in plan 13.
7. On finishing, append a `## Gate record` section to your own plan file: date, command outputs (summary), Playwright checks run and their results, deviations from plan. The next agent reads it.
8. Deviations from your plan are allowed when the code proves the plan wrong — record them in the Gate record. Deviations from the spec are not; stop and surface instead.
9. **Tooling grows with the build**: any plan that adds runtime state or new live behavior must, in the same plan, extend `so-state`'s summary, add the matching `so-scenario` verbs/expectations, and update `scripts/debug/README.md` — the next agent must never explore to see your feature. Gate validations ship as `test/scenarios/*.json` and run via `so-scenario` (exit code = pass).

## Gate protocol (baseline for every plan; plans add specifics)

```
npm run typecheck && npm run lint && npm test && npm run build
```

plus live-ST validation with SillyTavern running at `http://127.0.0.1:8000/` using `scripts/debug/` tools (see `.claude/rules/debug-scripts.md`): minimum `st-navigation.mts recent-group` → `so-state.mts current` → plan-specific checks. **Live checks run as an end user would: real main-model generation for chat-path behavior, and real extraction/expansion/memory passes via the selected Connection Manager profile (no `debugResponse`) for every LLM-consuming pipeline the plan touches.** `debugResponse` mocks are for unit determinism and scenario plumbing only — never gate sign-off. A gate is green only when both harness and live checks pass; if the real-LLM live gate cannot run (ST down, no backend, no profile), the Gate record must say so explicitly and the gate is not green.

## Verified ST host facts (cite these; re-verify only if ST version changes)

| Need | API | Source |
|---|---|---|
| Memory LLM call | `ConnectionManagerRequestService.sendRequest(profileId, prompt, maxTokens, custom?, overridePayload?)` | `public/scripts/extensions/shared.js:392` |
| Main-model background call | `generateRaw` via `getContext()` | proven by v1 arbiter |
| Per-chat storage | `chat_metadata`, `saveMetadata`, `saveMetadataDebounced` via `getContext()` | `public/scripts/st-context.js` |
| Prompt injection at depth | `setExtensionPrompt` via `getContext()` | `st-context.js:40` |
| Macros | `MacrosParser` (already wrapped in `stHost/context.ts`) | existing |
| Roster toggle | group `disabled_members` | `public/scripts/group-chats.js` |
| Per-character draft hook | event `GROUP_MEMBER_DRAFTED` (`'group_member_drafted'`) | `public/scripts/events.js:59` |
| Persona names (story requirements picker) | `getContext().powerUserSettings.personas` — `Record<avatarFile, name>` | `public/scripts/st-context.js:229`, `public/scripts/power-user.js:286` |
| Three-way popup (v2.1 plan 05 invalidation choice) | `callGenericPopup(content, POPUP_TYPE.CONFIRM, "", { customButtons: [{text, result}] })`; results start at 2, built-ins are AFFIRMATIVE=1 / NEGATIVE=0 / CANCELLED=null | `public/scripts/popup.js:24`, `public/scripts/popup.js:288` |
| Create a character card (v2.1 plan 06 provisioning) | `POST /api/characters/create`, **JSON** body (`ch_name`, `description`, `first_mes`, …) with `getRequestHeaders()`; returns the avatar filename as plain text. No multipart needed — the server writes the default avatar when `request.file` is absent | `public/scripts/slash-commands.js:5237`, `public/scripts/welcome-screen.js:869`; server `src/endpoints/characters.js:1024` (`if (!request.file)` at :1037) |
| Create a group (v2.1 plan 06 provisioning) | `POST /api/groups/create`, JSON body (`name`, `members` = avatar filenames, `chat_id`, `chats`, …) with `getRequestHeaders()`; returns the created group object including `id` | `public/scripts/group-chats.js:2119`; server `src/endpoints/groups.js:156` (`response.send(groupMetadata)` at :187) |
| Reload the host's character **and group** caches after creating either | `getContext().getCharacters()` — it calls `getGroups()` internally, so one call refreshes both | `public/scripts/st-context.js:230`; `public/script.js:1293` (`await getGroups()` at :1326) |
| Request headers / chat-name stamp for direct endpoint calls | `getContext().getRequestHeaders()`, `getContext().humanizedDateTime()` | `public/scripts/st-context.js:129`, `:237`; `public/scripts/RossAscends-mods.js:169` |
| Create a lorebook **and make a story's `requirements.lorebooks` see it** | `createNewWorldInfo(name, { interactive: false })` writes the file and refreshes the picker but does **not** touch `globalSelect`; activation is a separate step (`/world silent=true state=on <name>`) | `public/scripts/world-info.js:4448` (no globalSelect write), `world-info.js:5799` (`/world state=on` pushes onto `selected_world_info`), `world-info.js:85` (`globalSelect` mirrors it) |
| List every existing lorebook (not only the active ones) | `getContext().getWorldInfoNames()` | `public/scripts/st-context.js:284` |
| Whether a lorebook exists (2026-09-19) | `world_names` only — its entries are **file ids** (`src/endpoints/settings.js:257`), the server files a book under `sanitize(name + ".json")` (`src/endpoints/worldinfo.js:151`), and `loadWorldInfo` answers an unknown name with the dummy `{entries:{}}` **and caches it**; `importWorldInfo` refreshes `world_names` but never evicts that cache | `src/endpoints/worldinfo.js:18,76`, `public/scripts/world-info.js:2036-2058` (cache set at `:2054`), `:882` (`worldInfoCache`), import path never touches the cache |
| Create a lorebook without emptying one that exists | `createNewWorldInfo` checks only the client `world_names` before `saveWorldInfo(name, {entries:{}})`; refresh the list from the server first (`updateWorldInfoList`) | `public/scripts/world-info.js:4448-4470`, `:2061`; `utils.js:2483` (`checkOverwriteExistingData`) |
| Bind a lorebook to one chat | `chat_metadata[METADATA_KEY]` (`'world_info'`), saved with the chat metadata; scanned for that chat only and skipped when the same book is also global; `/getchatbook` treats a binding to a missing book as empty and marks `.chat_lorebook_button` `world_set` | `public/scripts/world-info.js:94`, `:4544` (`getChatLore`), `:1159-1181` (`getChatBookCallback`), `:5951` (`assignLorebookToChat`) |
| Prove a WI entry fired | `WORLD_INFO_ACTIVATED` with the activated entries (each carries `world`), emitted per non-dry-run scan | `public/scripts/events.js:62`, `public/scripts/world-info.js:900-902` |
| Delete a provisioned asset (journey cleanup only) | `POST /api/characters/delete {avatar_url, delete_chats}`, `POST /api/groups/delete {id}`, `POST /api/worldinfo/delete {name}` | `src/endpoints/characters.js:1414`, `src/endpoints/groups.js:203`, `src/endpoints/worldinfo.js:81` |
| Read the active background (v2.1 plan 07 stagecraft) | `background_settings` from `/scripts/backgrounds.js` — a live `export let` carrying `{name, url}`; the context exposes **no** background API. A chat-**locked** background lives in `chat_metadata.custom_background` as a css `url("backgrounds/<encoded name>")` instead | `public/scripts/backgrounds.js:108` (export), `:380` (lock branch), `:1407` (`generateUrlParameter`) |
| Switch the background by name | `/bg <name>` — fuzzy-matches the `.bg_example` thumbnails and clicks one, which updates either the global setting or the chat lock. Partial names match; the thumbnails are also the only list of installed backgrounds | `public/scripts/slash-commands.js:675` (command), `:6203` (`setBackgroundCallback`), `backgrounds.js:369` (`onSelectBackgroundClick`), `:187` (`bgfile` attribute) |
| Presets / AN / WI / slash / events | existing `stHost/` modules: `presets.ts` (`applyTextGenPresetRuntime`…), `authorNotes.ts`, `worldInfo.ts` (`enableWIEntry`/`disableWIEntry`), `slashCommands.ts`, `events.ts` | `src/services/stHost/` |

Vendored host-type ledger (post-acceptance hardening 2026-07-07; `src/services/stHost/hostTypes.ts` — verify against these host locations before widening a type):

| hostTypes member | Host source |
|---|---|
| `globalThis.SillyTavern.getContext` (base context) | `public/script.js:293` |
| `MacrosParser.registerMacro/unregisterMacro` (via `registerHostMacro` seam) | `public/scripts/macros.js:184,227` (dual-engine bridge at `:205`) |
| context `eventTypes` constants (keys resolved in `stHost/events.ts`) | `public/scripts/events.js` |
| context `callGenericPopup`, `POPUP_TYPE` | `public/scripts/st-context.js:195,225` |
| context `POPUP_RESULT` (CONFIRM popups; `AFFIRMATIVE=1` at `public/scripts/popup.js:25`) | `public/scripts/st-context.js:226` |
| script.js `doNavbarIconClick` (top-bar drawer toggle; ST binds it at `:12121`, non-delegated — extension binds it to its own `.drawer-toggle` via `stHost/drawers.ts`) | `public/script.js:10926` |
| `/comment compact=true` message shape (`is_system: true`, `extra.type: COMMENT`, `isSmallSys`, persisted via `saveChatConditional`; emits only MESSAGE_SENT/USER_MESSAGE_RENDERED — TurnBridge-inert) | `public/scripts/slash-commands.js:6113` |
| `MESSAGE_RECEIVED`/`CHARACTER_MESSAGE_RENDERED` `(messageId, type)` (`HostEventPayloads` in `stHost/events.ts`). Generated replies carry the generation type: `normal`, `swipe`, `regenerate`, `continue`, and `appendFinal` for a non-streaming continue; `impersonate` and `quiet` never emit. `first_message` comes from greetings: on open when `chat.length === 1`, when a character edit rewrites the greeting, and from every greeting member of a fresh group, *before* `CHAT_CHANGED`. `extension` comes from `/sd` posts and `command` from `/sendas`. `TurnBridge` drops `first_message` and `extension` (`NON_TURN_MESSAGE_TYPES`, 2026-09-19) | `public/script.js:3799,6691-6783` (streaming, `saveReply`), `:7705`, `:9916`; `public/scripts/group-chats.js:300` (vs `CHAT_CHANGED` at `:318`); `extensions/stable-diffusion/index.js:4997`; `slash-commands.js:6006` |
| context `sendSystemMessage` (GENERIC type `'generic'` at `system-messages.js:22`; pushes to chat + `addOneMessage`, saved on next chat save) | `public/scripts/st-context.js:159` |
| context `getTokenCountAsync` | `public/scripts/st-context.js:151` |
| context `getRequestHeaders` | `public/scripts/st-context.js:129` |
| context `characters` | `public/scripts/st-context.js:119` |
| context `saveWorldInfo`, `loadWorldInfo` | `public/scripts/st-context.js:107` |
| context `executeSlashCommandsWithOptions` (+ `parserFlags` option keyed by `PARSER_FLAG` ids 1/2, `handleParserErrors`) | `public/scripts/st-context.js` (slash-commands.js:6988-7033; SlashCommandParser.js:38-41) |
| context `SlashCommandEnumValue` (required since v2.5 plan 11 C3, no `contextFallback`: `runtime/slashCommands.ts` `buildEnumList` calls `new context.SlashCommandEnumValue(value, description)` for the `/story` argument enum list; re-verified on ST 1.19.0, 2026-09-26) | `public/scripts/st-context.js:98` (import), `:169` (context member); class `public/scripts/slash-commands/SlashCommandEnumValue.js:42`, constructor `:62` `(value, description = null, type = 'enum', typeIcon = '◊', …)` |
| `ScriptHostModule.setGenerationParamsFromPreset` | `public/script.js:8095` |
| `ScriptHostModule.isGenerating` | `public/script.js:604` |
| `ScriptHostModule.stopGeneration` (streaming stop + `abortController.abort`, emits `GENERATION_STOPPED`, returns whether anything stopped; v2.5 plan 02 C1) | `public/script.js:5607-5620` |
| `WorldInfoHostModule.getWorldInfoSettings/createNewWorldInfo/createWorldInfoEntry/saveWorldInfo` | `public/scripts/world-info.js:795,4448,4137,4177` |
| `WorldInfoHostModule.METADATA_KEY/updateWorldInfoList/worldInfoCache` (2026-09-19 lorebook existence fix) | `public/scripts/world-info.js:94,2061,882` |
| `WorldInfoHostModule.getSortedEntries` + `WORLDINFO_FORCE_ACTIVATE` (v2.2 plan 04 lore-select: the scan's own entry objects, forced into the next scan through a static map cleared by any `checkWorldInfo`; disabled entries are skipped before the force check; `getSortedEntries` emits `WORLDINFO_ENTRIES_LOADED`) | `public/scripts/world-info.js:4590,4603,1020-1029,203,4801,4886-4889` |
| context `mainApi`, `chatCompletionSettings` (`send_if_empty`) and Generate()'s add-a-player-message condition (`willAddUserMessage`, v2.2 plan 04) | `public/scripts/st-context.js:200,227`; `public/script.js:4299,4399-4401,4448,4455`; `public/scripts/chats.js:348` |
| `TextgenSettingsHostModule.*` (presets, names, setting_names, setSettingByName) | `public/scripts/textgen-settings.js:245-248,1199` |
| `LogitBiasHostModule.BIAS_CACHE/displayLogitBias` | `public/scripts/logit-bias.js:5,13` |
| `RossModsHostModule.getMessageTimeStamp` | `public/scripts/RossAscends-mods.js:192` |
| `GroupChatsHostModule.editGroup` | `public/scripts/group-chats.js:1359` |
| `BackgroundsHostModule.background_settings` (v2.1 plan 07) | `public/scripts/backgrounds.js:108` |
| `ExtensionsSharedHostModule.ConnectionManagerRequestService.{getSupportedProfiles,sendRequest}` | `public/scripts/extensions/shared.js:530,423` |
| Text Completion output budget with a preset (v2.5 plan 02 A37, ST 1.19.0 `7c3994196`, 2026-09-26): `sendRequest` puts `maxTokens` in `max_tokens` and spreads `overridePayload` after it; `TextCompletionService.processRequest` runs `createRequestData` (`max_tokens` + `max_new_tokens: max_tokens`), then with a preset `presetToGeneratePayload` builds the preset payload with `createTextGenGenerationData(settings, model, prompt, preset.genamt)` and spreads the request over it, so only keys the request names win. `createTextGenGenerationData` fills `max_new_tokens`, `max_tokens`, `n_predict`, `num_predict` from its `maxTokens` (= the preset's `genamt`), and llama.cpp obeys `n_predict`, Ollama `num_predict` (`OLLAMA_KEYS`). So `modelReply.samplerPayload` names all four on a TC profile. Chat Completion: the CC preset path also spreads the request last, so `max_tokens` holds; o1/o3/o4/gpt-5/gpt-6-astra models move the PRESET's `max_tokens` into `max_completion_tokens` before the spread (not covered, no such profile here) | `public/scripts/extensions/shared.js:447,460,473,478`; `public/scripts/custom-request.js:86-91,287,320,395-414,575-605`; `public/scripts/textgen-settings.js:1587,1603-1604,1696-1697`; `src/constants.js:321-322`; `public/scripts/openai.js:3052,3075,3098` |
| context `characterId` = `this_chid` (numeric **string** or undefined — `setCharacterId` stringifies; parse before use) | `public/scripts/st-context.js:123`, `public/script.js:7096-7110` |
| context `chatId` (a group's `chat_id`, else the character's `chat`; v2.1 plan 08 scopes the talk-decision cache with it) | `public/scripts/st-context.js:125` |
| events `GROUP_WRAPPER_STARTED/FINISHED` (`{selected_group, type}`; fire even when no member drafted — MANUAL empty pass) | `public/scripts/events.js:60-61`, emitted `public/scripts/group-chats.js:1049,1088` (finished emits AFTER `is_group_generating=false` at `:1078` — safe to `/trigger` from the handler) |
| `GENERATION_STARTED` payload carries `force_chid` and fires BEFORE interceptors | `public/script.js:4273` vs `:4538` |
| `generate_interceptor` contract: `(chat, contextSize, abort, type)`, runs once per drafted member inside `Generate()`, loud only (`dryRun` skips), `abort(false)` skips just that member and the wrapper loop continues; abort → `unblockGeneration` | `public/scripts/extensions.js:2015-2040`, `public/script.js:4536-4544` |
| group dispatch: `force_chid` checked first; per-member loop `setCharacterId` → awaited `GROUP_MEMBER_DRAFTED` → `Generate` (auto-continue re-enters as type `continue`) | `public/scripts/group-chats.js:1006,1051-1076` |
| per-member speak button = `Generate('normal', {force_chid})` | `public/scripts/group-chats.js:1998` |

## External bases

| Repo | License | Used by | Take |
|---|---|---|---|
| [Smart-Memory](https://github.com/senjinthedragon/Smart-Memory) | AGPL-3.0 | 07–10 | Vendor: pin a commit, port modules to TS under `src/memory/`. Tiers, prompts, parsers, consolidation, embeddings, supersession, epistemic, ledger, canon. Read its `docs/architecture.html` first. |
| [ST-Copilot](https://github.com/Supker/ST-Copilot) | MIT | 12 | Patterns: OOC assistant window, proposal + diff-review-before-apply, context pickers. |
| [MultihogDnDFramework](https://github.com/MultihogAurelius/SillyTavern-MultihogDnDFramework) | MIT | 02, 12 | Patterns: state-memo injection, snapshot/delta log, narrative hooks. |
| [SillyTavern-MessageSummarize](https://github.com/qvink/SillyTavern-MessageSummarize) | AGPL-3.0 | 03-amendment, 07, 13 | Patterns only, no code vendored: extraction stability lag, manual memory controls (pin/exclude/edit), memory slash commands. |

AGPL note: repo is private/unlicensed; vendoring Smart-Memory means the extension is AGPL-3.0 **if ever distributed**. Add `LICENSE` (AGPL-3.0) in plan 07.

## Plan sequence and exported contracts

| Plan | Spec phase | Exports (consumed by later plans) |
|---|---|---|
| [01-engine-core](01-engine-core.md) | P0 (+ v1 removal) | `StoryEngine`, `EngineHost`, `NormalizedStoryV2`, `Blackboard`, `BlackboardDelta`, `evaluateGate`/`renderGateText`, apply-queue semantics, replay harness, fixture formats |
| [02-st-runtime](02-st-runtime.md) | new | `runtime/` host binding: persistence, `TurnBridge`, `EffectsApplier`, TalkControl v2 triggers, minimal UI, `/cp` commands |
| [03-extractor](03-extractor.md) | P1 | `SharedRead` contract+parser, `deriveScope`, `Scheduler` (P0/P1), `Reconciler`, `getCanon()` (canon-lite), extraction eval suites, memory-LLM profile client |
| [03a-hardening](03a-hardening.md) | review | fixes from the plans-01–03 implementation review: message-id↔boundary mapping, queue flush on rollback, terminal-value latching, snapshot-quality scope, stability lag + in-flight guard, property tests, live burn-down, LIVE eval baseline, `.claude` rules skeleton |
| [03b-devtools](03b-devtools.md) | tooling | persistent browser session, `so-scenario` runner (assertions + exit codes, sandbox), swipe/edit/delete + WI-status + payload-capture verbs, st-search root fix, README + rules refresh. **Execute before 03a's live burn-down** |
| [04-pacing](04-pacing.md) | P2 | `tension_current` pipeline, `getSteeringHint()`, shape configs |
| [05-background-generation](05-background-generation.md) | P3 | `ScaffoldingGenerator`, `Critic`, `ExpansionCache` + `revalidate()`, scheduler P3 |
| [06-convergence](06-convergence.md) | P4 | proven convergence loop (increments, thresholds, stall+reconcile live) |
| [07-memory-foundation](07-memory-foundation.md) | P5a | `src/memory/` stores (facts/session/scenes), shared-read memory tags, `SceneDetector`, cast model, `MemoryInjector` (depth) |
| [08-memory-hygiene](08-memory-hygiene.md) | P5b | supersession bridge, consolidation+embeddings, relevance scorer, budgets, WI write-on-change, scheduler P2–P4 pressure |
| [09-arcs-canon](09-arcs-canon.md) | P5c | `ArcStore` lifecycle, arc→convergence bridge, derived canon behind `getCanon()` |
| [10-epistemic-ledger](10-epistemic-ledger.md) | P6 | epistemic tier + private injection, `StateLedger` w/ blackboard-shared fields |
| [11-studio](11-studio.md) | P7 | Studio v2: quality editor, gate builder, scope preview, diagnostics |
| [12-story-copilot](12-story-copilot.md) | new | authoring copilot (premise→draft w/ diff review), in-play driver panel |
| [13-surfacing-polish](13-surfacing-polish.md) | P8 | v2 macros, cadence polish, docs refresh, packaging, success-criteria run |
| [14-speaker-direction](14-speaker-direction.md) | post-acceptance | `talk_control` checkpoint schema, `src/talk/` chooser+director prompt/parse, `TalkController` + real `talkControlInterceptor`, npc_replies `after_member`/`enabled` (v1 parity), Studio TalkControlEditor, drawer decision panel |

## Spec → plan traceability

| Spec v2 section | Plan |
|---|---|
| Design spine, Vocabulary | all (context) |
| Blackboard: qualities, sources, gate grammar | 01 |
| Blackboard: extraction scope | 03 |
| Turn loop & commit semantics | 01 (queue), 02 (live boundaries) |
| Extractor hardening (incl. reconciliation) | 03 (mechanism), 06 (in anger) |
| Tension & pacing | 04 |
| Convergence | 01 (mechanics), 06 (in play) |
| Background generation (incl. revalidation, canon-lite consumer) | 05 |
| Memory: tiers, shared read, scene detection | 07 |
| Memory: supersession, consolidation, scoring | 08 |
| Memory: arcs, canon | 09 |
| Epistemic map, state ledger | 10 |
| Cast model | 02 (effects), 07 (per-character stores) |
| Off-path scheduler | 03 (core), 08 (pressure) |
| ST integration | 02 (runtime), 07/08 (WI/AN/injection), 13 (polish) |
| Data model | 01 (authored), 02/07 (runtime state) |
| Checkpoint Studio | 11 |
| Evaluation framework | L1+L3: 01 · L2: 03 · L4: 05 |
| Talk Control addendum (user decision) | 02 (onEnter/afterSpeak), 07 (sceneBreak) |
| Story creation/driving assistance (user decision) | 12 |
| Success criteria | 13 (final run) |

## Plan document template

Every plan doc has exactly: **Objective** · **Context** (spec sections, consumed contracts, code paths, external pointers) · **Scope** (in / non-goals) · **Deliverables** (modules + exported contracts) · **Implementation notes** (data shapes, algorithms, ST facts, absorb/delete list) · **Validation gate** · **Delegated decisions**. Build agents append **Gate record**.
