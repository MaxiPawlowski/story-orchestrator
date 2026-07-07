# Plan 13 — Surfacing, Polish, Final Validation

## Objective

Finish the author/user surface (v2 macros, WI/AN cadence polish, debug panels), refresh all project docs to v2, optional budget auto-tune, packaging pass — then run the spec's **Success criteria** as the final gate for the whole build.

## Context

- Spec: §Success criteria (the checklist), §ST integration (WI/AN cadence), remaining loose ends recorded in Gate records of plans 01–12 (read them all first).
- Consumes: everything. `MacrosParser` already wrapped (`stHost/context.ts`).

## Scope

**In**: macros, cadence/injection final pass, debug panel polish, docs refresh, `.claude` rules refresh, auto-tune (optional), packaging, success-criteria run.
**Non-goals**: new features. Anything discovered here that isn't polish becomes a logged follow-up, not scope.

## Deliverables

- **Macros** (registered via `MacrosParser`, auto-updated): `{{story_title}}`, `{{story_description}}`, `{{story_current_checkpoint}}`, `{{story_past_checkpoints}}`, `{{story_possible_transitions}}` (gate texts via `renderGateText`), `{{story_blackboard}}` (absorbed from plan 02), `{{story_tension}}`, `{{story_canon}}`, `{{story_player_name}}`, `{{story_role_<role>}}` per roster, per-tier memory macros (`{{story_memory_facts}}`, `{{story_memory_arcs}}`, …) for custom placement (Smart-Memory pattern).
- **Memory slash commands**: `/so-mem list|pin|exclude|backlog` alongside `/cp` (pin/exclude wiring exists from plan 07).
- **Cadence polish**: audit every injection writer (AN, WI, extension prompts, private blocks) for write-on-change discipline and depth collisions; consolidate injection-key registry in one module.
- **Debug panels**: unify drawer debug tabs (blackboard w/ evidence, memory tiers, scheduler queue, extraction audit, expansion cache) + `so-state.mjs`/`so-ui.mjs` final shape; payload-inspector view showing the exact injected prompt blocks per generation (ST-Copilot pattern).
- **Away recap** (Smart-Memory pattern): on reopening a chat after a long gap, one popup summarizing story position (active checkpoint, open arcs, canon excerpt).
- **Budget auto-tune** (optional, keep small): observe trim pressure per tier over a session; suggest budget adjustments in settings (suggest only).
- **Docs refresh**: v1 docs were already removed during the repo move — verify none linger; write `docs/architecture-v2.md` (current source layout + data flow, concise); polish `.claude/CLAUDE.md` + `.claude/rules/*` (skeleton-refreshed in 03a) to final v2 reality; reconcile the build-session root artifacts (`FEATURE_SPECS.md`, `agents.md`, `notes/`) — fold anything load-bearing into the docs, delete the rest; README with Smart-Memory/ST-Copilot/MessageSummarize attribution + AGPL note. Plan docs live under `docs/plans/v2/` — keep references consistent.
- **Packaging**: `npm run build` production; manifest review; version bump; storybook build not required to pass but must not be broken.

## Final validation — Success-criteria run

Assemble one long fixture + one live session and check every spec §Success criteria item as an assertion or recorded observation:

| Criterion | How |
|---|---|
| Early fact constrains late narration; supersession clean | long-fixture replay assertions (08) re-run |
| Every anchor reached, none skipped; bounded convergence | 06 fixtures re-run + live story completion |
| ≥ half of planted arcs resolve; resolutions advance convergence | 09 fixture + live |
| Delta suite live accuracy | suite-A `LIVE=1` exact-match ≥ 90% (default, user-tunable) over a ≥20-fixture corpus; compare against 03's Gate-record baseline |
| Epistemic perspective accuracy | 10 fixtures re-run + live prompt capture |
| Smoothed tension fits shape above threshold | 04 fit metric on the long fixture |
| Critic ≤ 2 rounds ≥ 85% of generations (default, user-tunable); arithmetic always verifies | 05 metrics re-measured |
| Response path AI-free at steady state; effects at boundaries | 08 queue-flood test + live timing spot-check |

Record the full matrix in this plan's Gate record — this is the project's acceptance record.

## Validation gate

1. Baseline green across the whole repo; all prior plans' suites still pass (full `npm test`).
2. Success-criteria matrix complete, all rows green or explicitly waived by the user.
3. Fresh-clone check: `npm ci && npm run build` works; extension installs into ST and a bundled example story (ship one polished format-2 example in `examples/`) runs end to end.

## Delegated decisions

Macro naming final call; example story content; auto-tune inclusion (skip if time-boxed out — record).

## Gate record

**Date:** 2026-07-06. Built as milestones M1–M6 (code) + no-model polish round (A–H) + M7/M8 real-LLM acceptance run (this record). **Auto-tune: SKIPPED (user decision).** Version 2.0.0.

**Harness (green, final):** `typecheck` clean · `lint` clean · `test` **44 suites / 1369 tests** (was 42/1345 pre-13) · `build` ok, `dist/index.js` 962 KiB · `test-storybook:ci` **18 suites / 53 tests** · `debug:typecheck` clean · `npm ci` ok. Fresh-clone caveat: `npm run build` only passes **inside the ST tree** (`global.d.ts` imports ST type decls via tree-relative paths) — location artifact, documented in gotchas.

**Acceptance environment:** gemma4-mtp (Gemma4-31B QAT MTP, llama.cpp via llama-swap @ :1235) for both roles; CM profile `afcc7073…` ("Story Orchestrator Memory Local", api generic, mode tc); headed shared browser (CDP :9222); no `debugResponse` anywhere.

**Ship-blocking find #1 — instruct template never applied to memory-LLM calls.** ST's `ConnectionManagerRequestService.sendRequest` applies the profile's instruct template **only when the prompt is a message array**; our `sendConnectionProfileRequest` passed a string, so every real extraction/expansion/copilot call ran as a raw untemplated completion. On this Gemma build that produced token-loop degeneration ("own own own…") in ~half the fixtures and chronic format drift in the rest. Fix: `stHost/connectionProfiles.ts` sends `[{role:"user",content:prompt}]` (identical for profiles without instruct — ST joins content back to the same string; enables templates when set). Profile config gained `instruct: "Gemma 4"`. With the template, the model emits the exact contract format.

**Ship-blocking find #2 — stale-expansion splice-out freezes the engine while standing on a generated checkpoint.** `revalidateInsertedExpansions` → `rebuildMergedStory` removed the active `gen_*` checkpoint from the merged story; `hydrate` then pointed at a nonexistent checkpoint and every subsequent boundary commit died (live-plan06 froze at boundary 4). Two fixes: (a) revalidation skips entries whose `insertedCheckpointIds` contain the active checkpoint; (b) `revalidateExpansion` drift check only counts keys **tracked in the basis** — a value the extractor volunteered mid-flight (absent at plan time) is judged by the beat simulation, not flagged as drift. +3 jest cases.

**Model-quirk hardening (parser tolerance policy, all unit-tested):** `DELTA <key>=<value>` (prefixed bare form) and `DELTA <key> value=<json>` (q-less) now parse (`extraction/parse.ts` — deltaPattern `(?:q=)?`, bare fallback after `DELTA`-strip). Beat JSON gate/delta values coerce `"true"/"false"`/numeric strings against the declared quality type (`generation/parse.ts`) — enums stay strict.

**Live delta-accuracy baseline (first ever — plan 03's "baseline" was void, no live suite existed before 13):** `so-live-suite.mts run --min 0.9 --record` → **22/22 fixtures, accuracy 1.0** (threshold 0.9), goldens recorded to `test/goldens/live/`. Scoring policy documented in the tool: exact-match on plot deltas; `tension_current` judged only when the fixture expects it (|live−expected| ≤ 0.3, the spec's MAE bound) since the contract *instructs* the model to rate tension every read. Dataset QA: `extractor`/`extractor2`/`extractor4` transcripts were undecidable from the window alone ("a little more", "near full" — prompt carries no prior blackboard values); reworded to decidable ("three out of five", "two out of five", "nine-tenths"), goldens+expected updated in lockstep.

**Live scenarios (real model, sandboxed): 10/10 green.** live-plan02 13/13, live-plan03, live-plan04, live-plan05, live-plan06 (after find #2), live-plan07, live-plan09, live-plan10, live-plan12 (scenario gained the missing set-profile eval step all other live scenarios had), plan08-hygiene. plan13-surfacing re-verified 16/16 under the final bundle. Environment repairs on the way: model renamed upstream (gemma4-31b-mtp→gemma4-mtp) — CM profile model field updated + main API re-pointed via `/model` ("no model id could be identified" blocked all group generation).

**Sun-ruins live play-through (end-user path, full story):** imported by pasting JSON into the settings-panel textarea + "Import and Load"; requirements green (4 members + Xentar Checkpoints lorebook); extraction enabled via panel controls (profile, cadence 1). Played cp1→cp2→cp3→cp-4a→cp-4a1→cp-5→**cp-6** — every transition fired by real extraction from real group play: `approached_board` → `mission_accepted` → `luke_decision` "undecided"→"accepted" (enum rewrite) → `riddle_answer` "moon" (scope_hint quality) → `chamber_entered` → `artifact_secured`. cp3 cast effect enabled Luke live. `visitedAnchors` = [cp1,cp2,cp3,cp-5,cp-6] exactly (matches the jest replay). Arc bridge fired live (`progress_toward_cp-6` = 1 from a confirmed `[resolved]`). Final memory state: 13 audits, 12 facts, 25 entries (12/10/0/3 tiers), 3 scenes, 2 open + 2 resolved arcs + 2 arc summaries, canon synthesized, 22 epistemic entries, 39 ledger rows, 3 WI writes. Payload ring captured real generations with all registry blocks at declared depths (pacing@2, ledger@3, session_details@3, epistemic@4 — per-speaker private, present/absent across captures — facts@4, scene_history@6). Macros (`story_current_checkpoint`/`possible_transitions`/`past_checkpoints`) rendered live via `substituteParams`. Group `disabled_members` restored to pre-session state after; play chat + story left in place as the demo.

**Success-criteria matrix (spec §Success criteria — project acceptance):**

| Criterion | Evidence | Verdict |
|---|---|---|
| Early fact constrains late narration; supersession clean | `memory/longFixture.test.ts` (>100-entry corpus, no dup/contradiction survivors, budget-bounded) in the 1369; plan08-hygiene live scenario green | **PASS** |
| Every anchor reached, none skipped; bounded convergence | 06 jest suites green; live-plan06 green; sun-ruins live completion, all 5 anchors, none skipped | **PASS** |
| ≥ half planted arcs resolve; resolutions advance convergence | 09 suites + live-plan09 green; play-through 2/4 arcs resolved live, `[resolved]` → `progress_toward_cp-6` = 1 → threshold reached | **PASS** |
| Delta suite live accuracy ≥ 90% over ≥20 fixtures | **22/22 = 100%** recorded baseline (03 comparison void — first baseline) | **PASS** |
| Epistemic perspective accuracy | 10 suites + live-plan10 green; live capture shows private epistemic block present for capable speaker, absent otherwise; 22 epistemic entries from real passes | **PASS** |
| Smoothed tension fits shape above threshold | `pacing.test.ts` curve-fit replay (MAE tolerance asserted both ways); live EMA tracked 0→0.1275→0.089→0.062 across play | **PASS** |
| Critic ≤ 2 rounds ≥ 85%; arithmetic always verifies | `generation.test.ts` deterministic-golden pass-rate = 1.0; live expansions (plan05/06) passed critic round 1, `codeCheck.ok` before splice | **PASS** |
| Response path AI-free at steady state; effects at boundaries | `scheduler.test.ts` (non-blocking, sync onBoundary, pressure lanes); live: sends returned ~100–200 ms, boundaries committed at render while reads/P2 ran off-path (13 audits over 14 boundaries) | **PASS** |

**Deviations / follow-ups:**
1. Live-suite tension scoring (MAE ≤ 0.3, expected-only) is a deliberate deviation from raw exact-match — recorded in the tool usage text.
2. `stabilityLag 1` means a decisive beat typically lands 1–2 boundaries after it is uttered; the play-through used natural reinforcement turns. Authoring guidance, not a bug.
3. Live model quirks tolerated by the parser (channel-token wrappers, delta format variants) are cosmetic: contract prompt unchanged; with the instruct template the model usually follows it exactly.
4. Play-through preset effect "Story: Sun Ruins" references a textgen preset that may not exist on other installs — effect no-ops with a status warning by design.
5. Fresh-clone out-of-tree build limitation stands (global.d.ts tree-relative types).

### Final review round (2026-07-06, same day — post-acceptance audit + adversarial live session)

Full audit of spec v2 §Success criteria + phase deliverables against the shipped build, forensics over the acceptance artifacts, then an adversarial live session on the sun-ruins riddle-fail branch. Findings, all fixed and gated same-day:

1. **`short_term` was a dead tier** — plan 07 vendored Smart-Memory's `compaction.js` and shipped the tier's budget/depth-2 injection/macro/drawer plumbing, but no writer was ever ported (plan-07 validation item 5 silently dropped). Implemented the spec's rolling compaction: `runShortTermCompaction()`/`shouldCompactShortTerm()` — a single rolling `short_term` entry summarizing play since the `shortTermSummaryEnd` watermark, P2 job every ≥12 messages (`SHORT_TERM_COMPACTION_MESSAGES`), replace-not-append, skipped while pinned, `storyOrchestratorDebugShortTermResponse` for determinism, `buildShortTermSummaryPrompt` incremental-update prompt. 4 jest cases. **Live-validated**: real Gemma wrote an accurate rolling summary; verified injected into a real generation (`story_orchestrator_memory_short_term@2` in the payload capture) and rendered in the drawer.
2. **Channel noise leaked into stored free text** — `<|channel>thought` wrappers were being baked into scene summaries, arc summaries, canon, and the rolling summary, and could silently eat the first `[knows]`/`[state:…]` line of the standalone epistemic/ledger P2 pass. `stripChannelNoise` strengthened (handles the malformed `<|channel>`/`<channel|>` variants per line + drops leading channel-name lines) and applied at all six raw-response consumers (arc/scene/short-term/epistemic/ledger/canon; driver report already had it). Caught live: the first compaction run stored a noise-prefixed summary.
3. **Write-log coverage blocked same-window rolling replace** — `addMemoryEntries`' shared-read idempotence guard discarded a recompaction over an already-covered window; jest missed it (fresh windows per test), live caught it. The rolling entry now inserts directly (the pass owns its idempotence via watermark + replace). +1 jest case for the same-window path.
4. **Unquoted enum values rejected** — the single substantive reject across the play-through's 13 audits (`DELTA q=luke_decision value=undecided`). Parser now accepts bare-word values for enum/string/level qualities (`parseJsonLiteral` fallback), still type-checked; a bare word on a bool/int still rejects. +1 jest case.

**Spec-criteria completions the acceptance matrix had missed:**
- **Rollback (the spec's 9th criterion, dropped from the plan-13 matrix) validated LIVE**: deleting the reply that committed the cp-4a→cp-4a2 transition rolled back checkpoint (cp-4a2→cp-4a), boundary (3→2), and blackboard (delta gone — rollback ≡ never-applied); pre-rollback memory correctly survived; replaying the beat re-fired the transition (recovery proven).
- **Riddle-fail branch live** (third replay branch now real-model-proven): `riddle_answer="wrong"` extracted → cp-4a2.
- **Talk Control counters verified** on the play-through chat: all 4 authored npc_replies (onEnter ×3 incl. finale, afterSpeak ×1) fired exactly once, `firedNpcReplies` persisted (speaker sequence in chat confirms DM Narrator/Ponticius/Luke replies at the authored beats).
- **Away recap live**: backdated 9h → hydrate → real `callGenericPopup` dialog with checkpoint/tension/open-arcs/canon, consume-once verified.
- **Mid-chat adoption live**: `runMemorizeBacklog(4)` → 3 windows processed, entries 6→10, no errors, full-scope read consistent with latched state.
- **/so-mem live**: list rendered real entries; pin on/off round-trip through real ST slash execution.
- **state_snapshot semantics confirmed spec-conformant** (an expectation/scope/generation target, never a blackboard write — `luke_alive` absent from bb is correct).

**Harness after review round:** `test` **44 suites / 1375 tests** · `test-storybook:ci` 18/53 · typecheck/lint/build/debug:typecheck clean. Scratch chat deleted; roster restored to pre-session `disabled_members`; play-through demo chat + example story left in place.

**Known quality observations (model-tier, not system):** the Gemma pair under-delivers tension — extractor rates adventure prose "calm"/"stirring" (live EMA peaked 0.5 in the sphinx-attack scene, 0.25 typical) while the "rising" template expects 1.0 at the finale; the pacing loop itself is correct (hint escalated to "raise the tension now", injected every generation). Legacy stored summaries from the first play-through (pre-fix) carry the cosmetic `<|channel>thought` prefix; canon auto-regenerates clean on the next arc resolution.

### Post-acceptance hardening (2026-07-07 — ST-integration alignment + the 4 review weak points)

Approved plan: ST-integration audit remediation (user-provided, claims re-verified in host source) + full fixes for the review round's weak points. User decisions: stabilityLag default 0; vendor local host types; macro migration simplified to a seam (the audit's `macros.register` swap would have broken flag-off users — `MacrosParser.registerMacro` is itself the dual-engine bridge, macros.js:205, and the new engine is still `experimental_macro_engine`-gated).

**A. ST integration alignment.** (1) Macros through `registerHostMacro`/`unregisterHostMacro` seam (`stHost/context.ts`), MacrosParser underneath, migration = one function body later. (2) Base context from `globalThis.SillyTavern.getContext` (script.js:293) with extensions-module fallback. (3) Module trim 11 → 6: popup/tokenizer/vectors/characters now use context members (`callGenericPopup`+`POPUP_TYPE`, `getTokenCountAsync`, `getRequestHeaders`, `characters`); worldInfo keeps its module only for create/getSettings. (4) `setWIEntryDisabledState` rewritten to load → mutate `entry.disable` → **one** `saveWorldInfo` (was per-entry `/setentryfield` slash round-trips with 500 ms sleeps + the toastr hack as main consumer). (5) Event subscriptions use eventTypes constant KEYS resolved via `getContext().eventTypes[key] ?? key` (kills the `CHAT_CHANGED`≠`chat_id_changed` trap; payload typing now lines up with subscription keys). (6) Dead preset code deleted: `syncTextGenPresetUi` (read never-assigned `ST_applyTextgenPresetToUI`), `upsertTextGenPreset` (zero callers), the global declaration. (7) persistence.ts double-save (debounced+immediate) deduped to the immediate call.

**B. Out-of-tree build.** `stHost/hostTypes.ts` vendors the full host type surface (6 module interfaces + `SillyTavernContext` with the censused members, narrow types + index signatures); `modules.ts` drops all `typeof import("../../…")`; `global.d.ts` drops both tree side-effect imports and self-declares `ExtensionSettingsMap`/`SillyTavernEventSource`/`CustomToastr`. Ledger: one host file:line row per vendored member in 00-overview "Verified ST host facts". **Out-of-tree proof: repo copied to a temp dir outside the ST tree → `npm ci && npm run typecheck && npm run build && npm test` all green (1381 tests).**

**C. Legacy noise migration.** `sanitizeMemory` strips channel noise from persisted `entries[].text`, `arcs[].text/summary`, `canon.text` on hydrate (idempotent). Live: the demo play-through chat now hydrates with zero channel tokens in scenes/canon.

**D. Extraction latency.** `stabilityLag` default 1 → **0** (rollback live-proven; spec: wall-clock is the constraint; existing chats keep persisted values). New scheduler window-arithmetic test (lag 0 → window ends at `lastMessageId`; lag 2 → −2). The one un-cued decisive transition in sun-ruins (cp-4a→cp-4a2 riddle-fail) gained an `extractor_trigger`. README "Extraction timing" section. Live: real cadence read after one send has `window.to == lastMessageId` and accepted the newest message's delta.

**E. Tension.** (1) `computeExpectedTension` prefers the active checkpoint's authored `tension_target` (`levelToNumeric`) over the shape curve — sun-ruins' authored ladder (calm→…→peak) now drives live steering (it was dead data for steering before; only the expansion planner read it). (2) Extractor rubric calibrated: per-level anchoring descriptions + "pick the highest level whose description is met, not the average mood" (`TENSION_SCALE` in extraction/contract.ts). (3) Steering hints tiered: name the expected level (`numericToLevel`), strong wording past 0.5 drift ("escalate sharply toward peak — force a confrontation…"). Live: demo chat at cp-6 shows expected 1.0 + the strong hint; re-recorded goldens show the calibration shifting ratings up (extractor21 "stirring"→"tense").

**Gates:** typecheck · lint · **44 suites / 1381 jest** (+6) · build · debug:typecheck · Storybook 18/53 · out-of-tree proof (above). **Live (headed, real Gemma, no mocks):** noise migration on demo-chat hydrate ✓ · macros substitute through the seam (`substituteParams` incl. `story_role_*`) ✓ · tension target + strong tiered hint live ✓ · WI one-save flip via cp1 activation (primed-disabled entry re-enabled instantly, no sleeps) ✓ · away-recap popup via context `callGenericPopup` ✓ · `so-live-suite run --min 0.9 --record` **22/22 = 100%** re-baseline under the calibrated rubric (goldens re-recorded) ✓ · lag-0 cadence window == lastMessageId with delta accepted from the newest message ✓ · scenarios: live-plan04-pacing (one 30s-timeout flake, clean re-run green), plan13-surfacing 16/16, plan03a-delete-rollback (constant-key event path) ✓ · roster restored, scratch chats deleted.

**Deviations:** macro item simplified from the audit text (seam, not engine switch — flag-gate finding above). live-plan04's boundary waits are 30s-tight for a busy local model; left as-is (documented flake, passes on re-run).
