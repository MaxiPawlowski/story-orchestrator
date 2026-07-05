# Implementation Overview — Story Orchestrator v2

How [story-orchestrator-spec-v2.md](story-orchestrator-spec-v2.md) gets built: 13 sequential plans (`docs/01-…13-…`), each executed by one build agent, each ending in a **validation gate** that must be fully green before the next plan starts. No parallel execution; later plans consume contracts earlier plans export.

## Rules for every build agent

1. Read, in order: the spec (`story-orchestrator-spec-v2.md`), this file, your plan file, and the **Gate records of all previously executed plans** (tail sections of their plan docs — they carry as-built truth and deviations). Nothing else is required context.
2. **STAPI boundary**: only `src/services/STAPI.ts` + `src/services/stHost/*` import SillyTavern host modules (dynamic `import(/* webpackIgnore: true */ …)`). Everything else imports through STAPI. New host access = new `stHost/` module.
3. Never typeguard or cast an unverified ST value. Confirm shapes in ST source (`C:\dev\SillyTavern-MainBranch\`, docs in `.claude/sillytavern-docs/`) or add a debug log + local type.
4. No code comments; self-explanatory code. TypeScript strict. Match existing idiom.
5. Engine purity: `src/engine/**` and `src/extraction/scope*` never import STAPI — host effects go through the `EngineHost` seam so the harness can fake them.
6. Fixtures in `test/fixtures/` (stories `*.story.json`, transcripts `*.transcript.json`, answer keys `*.expected.json`); recorded LLM goldens in `test/goldens/`. Live re-record via `LIVE=1 npm test`.
7. On finishing, append a `## Gate record` section to your own plan file: date, command outputs (summary), Playwright checks run and their results, deviations from plan. The next agent reads it.
8. Deviations from your plan are allowed when the code proves the plan wrong — record them in the Gate record. Deviations from the spec are not; stop and surface instead.
9. **Tooling grows with the build**: any plan that adds runtime state or new live behavior must, in the same plan, extend `so-state`'s summary, add the matching `so-scenario` verbs/expectations, and update `scripts/debug/README.md` — the next agent must never explore to see your feature. Gate validations ship as `test/scenarios/*.json` and run via `so-scenario` (exit code = pass).

## Gate protocol (baseline for every plan; plans add specifics)

```
npm run typecheck && npm run lint && npm test && npm run build
```

plus live-ST validation with SillyTavern running at `http://127.0.0.1:8000/` using `scripts/debug/` tools (see `.claude/rules/debug-scripts.md`): minimum `st-navigation.mjs recent-group` → `so-state.mjs current` → plan-specific checks. A gate is green only when both harness and live checks pass.

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
| Presets / AN / WI / slash / events | existing `stHost/` modules: `presets.ts` (`applyTextGenPresetRuntime`…), `authorNotes.ts`, `worldInfo.ts` (`enableWIEntry`/`disableWIEntry`), `slashCommands.ts`, `events.ts` | `src/services/stHost/` |

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
