# Smart Memory — v2.4 review

Author Senjin · repo https://github.com/senjinthedragon/Smart-Memory · commit `194a011` (2026-07-02, v1.8.1) · 65 upvotes / 1043 msgs · source available: **y** (full clone, `source/`, AGPL-3.0)

**Read this first:** SO's whole memory subsystem is a vendored TS port of this repo, **at this exact commit** (`docs/plans/v2/07-memory-foundation.md:73` records `194a011b…`; spec `docs/plans/v2/story-orchestrator-spec-v2.md:199`; plans 07–10 port `longterm/session/scenes/compaction/prompts/parsers/memory-utils/continuity/embeddings/similarity/arcs/canon/epistemic/state-ledger`). So "what does it add" = what we did NOT port, plus host techniques in `index.js`/`settings.js`/`macros.js` that the port never read. Tiers/prompts/parsers/dedup bands/epistemic tags are not re-reviewed here.

## What it is
Background multi-tier memory for 1:1 and group chats: short-term rolling summary, long-term per-character facts (persisted **across chats** in `extension_settings`), session details, scene history, arcs → canon, epistemic map, state ledger, entity registry + force-graph viewer, generated character/world/relationship "profiles", continuity check + one-shot repair note, "Previously on…" LLM recap, read-only ("fresh start") mode. Memory LLM routable to main API, a Connection Manager profile, Ollama, OpenAI-compat, or WebLLM; auto "hardware profile" A (local) / B (hosted) changes how much work runs.

## How it works
- **Turn hook**: `eventSource.makeLast(CHARACTER_MESSAGE_RENDERED)` (`index.js:1976`) so it runs after other extensions. Handler skips `swipe|continue|impersonate|quiet` types (`index.js:453`) and falls back to "chat did not grow = swipe" (`index.js:462-468`); streaming intermediates gated by a `generationInProgress` flag set on `GENERATION_STARTED` type `normal` only and cleared on `MESSAGE_RECEIVED` (`index.js:1993-2006`). Whole pipeline deferred with `setTimeout(0)` because ST awaits the render emit before `saveChatConditional` (`index.js:420-426`).
- **Groups**: per-member re-injection on `GROUP_MEMBER_DRAFTED(chId)` (`index.js:1347-1395`) — same swap we ported as `onMemberDrafted`; round-level extraction/compaction on `GROUP_WRAPPER_FINISHED` (`index.js:1407`).
- **Mutations**: swipe only aborts the in-flight memory fetch (`index.js:2055-2057`, `generate.js:105`) so a local single-slot backend does not queue the swipe behind extraction; delete only trims the scene buffer (`index.js:2062-2067`). No edit handler; long-term memories never roll back — instead a toast warns on `.mes_create_bookmark, .mes_create_branch` clicks to enable read-only first (`index.js:2036-2048`).
- **Read-only mode** (`longterm.js:1287-1340`, `settings.js:1950-1996`): flag + start index/time in chatMetadata; every write path gated `!isFreshStart()`; on exit a popup offers commit (re-process the window, `settings.js:727`) or discard (purge session rows by timestamp `session.js:201` + `hideChatMessageRange(start,end,false)` `settings.js:1989`).
- **Injection**: one `setExtensionPrompt` slot per tier; optional **unified** mode merges tiers stable→immediate into one slot (`unified-inject.js:63-74,142`); a secondary shallow IN_CHAT **triggered** slot for long-term rows whose triggers match the turn (`longterm.js:1127-1160`). **Macro mode**: each tier also a `{{smartmemory-*}}` macro; if the token appears in the active card's `system_prompt|description|personality|scenario|mes_example` the depth injection is cleared to avoid doubling (`macros.js:81,100-116`, `longterm.js:1110-1124`). Registers into `macros.register` (new engine) or `MacrosParser` by `power_user.experimental_macro_engine` (`macros.js:131-139`).
- **Witness framing**: new long-term rows get `witnessed_by` = speakers in the extraction window (`longterm.js:503-509`); a non-witness responder gets the row as `[secondhand]` (`longterm.js:936-940,1127-1135`).
- **Budgets**: per-tier trim stats (full vs injected) + high-water mark per chat (`trim-stats.js:79-110`), one-time "content trimmed" toast, opt-in `autoTuneBudgets` (`settings.js:523`); per-turn redistribution by a regex turn classifier dialogue/action/transition/intimate (`memory-utils.js:841,881`).
- **Compaction trigger**: unsummarized tokens ≥ X% of `getMaxContextSize()`, cheap char estimate first, real tokenizer only near threshold (`compaction.js:72-99`).
- **LLM routing**: CMRS `sendRequest(profileId, messages, limit)` with a message array (`generate.js:146-164`); direct fetch for Ollama/OpenAI-compat with an abortable controller + local-vs-proxy URL detection (`generate.js:247,281`); reasoning stripped with **ST's own `reasoning_templates` + `parseReasoningFromString(…,{strict:false},tpl)`** (`generate.js:45,86-96`).
- **Continuity**: memory LLM checks last reply vs established facts, generates a repair note, injects it depth-0 IN_CHAT one-shot, stored in chatMetadata until next render (`continuity.js:123-214`).
- **Persistence**: chat tiers in `chatMetadata.smart_memory`; long-term, entity registry, arcs, relationships in `extension_settings` (per character, `saveSettingsDebounced`). Versioned migrations with a structural guard `assertNonDestructive` (deep-compare before/after each step, throws on deleted/overwritten field, explicit `deletePaths` allowlist) (`graph-migration.js:926-983`). Chat-switch race guard = `chatLoadId` counter / chatMetadata object identity (`index.js:494-495,1146-1161`).

## Overlap with Story Orchestrator
- Same tiers, prompts, parsers, dedup bands (0.82/0.55), epistemic 5-tag map, ledger, arcs→canon, per-draft private swap — ported (`src/memory/*`, `memoryCoordinator.ts`).
- **We are stronger**: rollback ≡ replay across every derived artifact (`src/memory/reverse.ts:23`, `derived.ts:56`) vs their "use read-only mode before branching"; provenance + quarantine + conflict queue (`memory/provenance.ts:9`, `runtime/memoryQueue.ts`); RunToken ownership per write (`runtime/runToken.ts:138`) vs a load counter; canon story-level with input-hash staleness; deterministic spoiler-safe away recap (`runtime/awayRecap.ts`) vs an LLM recap with generation races they had to patch (`index.js:190-205`); evidence-span check on extraction (`extraction/evidence.ts:28`); non-blocking handlers already (`runtime/turnBridge.ts:52-53` uses `void`).
- **Dropped on purpose (correctly)**: cross-chat per-character memory in `extension_settings` (`docs/plans/v2/09-arcs-canon.md:76`), their scheduler/LLM client, profiles tier.
- **They have, we do not**: macro-mode injection dedupe, witness framing, trim telemetry, triggered shallow slot (our `activationTriggers` is only a score term, `memory/score.ts:69`), entity registry with aliases/merge, context-relative compaction trigger, LLM (non-judge) continuity path, read-only window, abortable memory calls, entity graph viewer.

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | Branch/checkpoint adoption reconciles state to the branch point | host-integration | host/persistence | absent | 4 | M |
| 2 | Macro placement suppresses the depth injection (no doubled tier) | host-integration | memory | absent | 3 | S |
| 3 | Witness-scoped facts (`[secondhand]` / exclude for absent cast) | enhancement | memory | partial | 3 | M |
| 4 | Per-tier trim telemetry (full vs injected, rows dropped, high-water) in next-turn preview | ux | studio/player-ui (author) | partial | 3 | S |
| 5 | LLM-fallback continuity warden via extraction profile | enhancement | stagecraft | partial | 3 | M |
| 6 | Roster `aliases` + entity canonicalization for scoring/ledger | enhancement | memory/engine schema | absent | 3 | M |
| 7 | Context-relative short-term compaction trigger | enhancement | memory | partial | 2 | S |
| 8 | Reasoning strip also reads ST `reasoning_templates` | host-integration | extraction | partial | 2 | S |
| 9 | Migration non-destructive guard as a jest property | testing | host/persistence | partial | 2 | S |
| 10 | Off-the-record window (commit or discard + hide) | new-feature | player-ui/runtime | absent | 2 | M |
| 11 | Yield memory calls to a swipe on a shared single-slot backend | enhancement | extraction | partial | 2 | M |
| 12 | Cross-chat memory in `extension_settings` | anti-pattern | memory | present (avoided) | 2 | S |

**1. Branch adoption.** ST `createBranch`/`createNewBookmark` save the new chat with `{...chat_metadata, main_chat, integrity}` (`bookmarks.js:201,284` → `script.js:7406`), so a branch at message 10 inherits our blob stamped for the parent. V5 reads it as foreign; the player re-selects → `adoptChatState` (`runtime/persistence.ts:87`) → `loadStory` hydrates engine + memory as of the parent's tip (`runtime/runtimeManager.ts:522-551`) with **no check that `engine.lastMessageId < chat.length`** (grep `main_chat|chatLength` in runtime: none). Result: facts/epistemic/checkpoints from messages that do not exist in the branch. Their answer is only a warning (`index.js:2036-2048`) because they cannot roll back; we can. Fix: on hydrate/adopt, if the engine or any memory row is past `chat.length-1`, run `runRollback(chat.length)` (horizon notice path already exists, V11) and journal "adopted at branch point"; optionally detect `chat_metadata.main_chat` to word it. Fits invariants 11/12/17; watch invariant 13 (no blob bump needed).

**2. Macro dedupe.** Ours registers `story_memory_<tier>`, `story_epistemic`, canon, ledger macros (`runtime/macros.ts:53-55`) and always injects the same blocks at depth (`memory/inject.ts:54-60`): an author who places `{{story_memory_facts}}` in a card gets the tier twice. Theirs scans the active card fields for the token and clears the extension prompt (`macros.js:81,100-116`). Scope to memory tiers/canon/ledger only — **not** `story_epistemic`, which renders the active speaker while the private block is per drafted member (gotcha, `getAppliedEpistemicBlock`); invariant 15 forbids trading correctness for placement there. Next-turn preview must show "placed by macro" (invariant 16/composition rule).

**3. Witness scope.** Facts tier filters only by `characterId` (`memory/inject.ts:27`); a shared fact reaches a member who was disabled/absent when it happened. Theirs stamps `witnessed_by` from window speakers (`longterm.js:503-509`) and frames non-witnesses `[secondhand]` (`longterm.js:936-940`). Better for us: stamp from the enabled cast at the source boundary (`runtime/roster.ts`, cast mirror), deterministic, no LLM; epistemic stays the explicit-asymmetry channel. Rollback-safe (field fixed at creation); needs a per-member render like the epistemic swap (invariant 16).

**4. Trim telemetry.** We report only `pinnedOverflow` (`memory/budget.ts:21`, `memory/inject.ts:34`); unpinned rows dropped by budget are invisible. Theirs records full vs injected per tier + per-chat high-water (`trim-stats.js:79-110`) and offers auto-tune (`settings.js:523`). Take the telemetry into `buildNextTurnPreview` (`runtime/nextTurn.ts:76`, author-only per invariant 9); skip auto-tune (it silently rewrites install-wide settings).

**5. LLM warden.** Our warden is judge-only (`runtime/continuity.ts:60` returns null unless the judge is enabled), so it is dark for anyone without TypeSafe. Theirs runs the check + repair note on the memory LLM (`continuity.js:123-200`) and injects depth-0 one-shot (`continuity.js:179-196`) — the same delivery we already use (`INJECTION_REGISTRY.continuityNote`). A second, opt-in (off) check implementation through the extraction profile behind the same review ring fits invariant 6; it must clear a predeclared floor on the existing continuity fixtures before shipping (invariant 7's spirit), and is a P2/off-path pass (invariant 5).

**6. Aliases.** `turnEntities` = roster names found verbatim in the turn (`runtime/scoreContext.ts:26`), matched exactly against `entry.entities` (`memory/score.ts:59`); `RosterMember` has no aliases (`engine/schema.ts:177-181`). "Luke" never matches "Luke Skywalker". Theirs keeps a registry with aliases, merge-by-name (source becomes alias) and type (`graph-migration.js:304,618`). For us an authored `roster[].aliases` normalized at parse (like requirements aliases, `engine/validate.ts:521`) plus canonicalization of extracted entity/ledger names is enough — no free-form registry. Also answers plan 10's open "ledger entity-naming normalization" question.

**7. Compaction trigger.** Ours fires every 12 messages (`constants/defaults.ts:23`) regardless of context size; theirs triggers on unsummarized tokens vs % of `getMaxContextSize()` (alias of `getMaxPromptTokens`, `script.js:333`) with a cheap pre-check (`compaction.js:72-99`). Add as a second `when` in the boundary-work entry (`runtime/boundaryWork.ts:121`, invariant 22); needs a new `stHost` read (invariant 2).

**8. Reasoning templates.** `stripReasoningBlocks` hardcodes forms (`extraction/parse.ts:51`). ST exposes `reasoning_templates` (`reasoning.js:32`) and `parseReasoningFromString(str,{strict},tpl)` (`reasoning.js:1461`, null when prefix/suffix missing). Feed template prefix/suffix pairs into our form list as extra leading forms (host list injected; parse stays pure). Do **not** copy their `strict:false` — it strips a block anywhere and would eat mid-reply DELTA lines, and the Gemma `<channel|>` no-orphan rule must stay.

**9. Migration guard.** Their `assertNonDestructive` runs after every migration step (`graph-migration.js:926-983`). Our v2→v3 rekeys, so a literal port doesn't fit, but a jest property over `migrateMetadataBlob`/`migrateV3ToV4` + `hydrateExtras` (`runtime/persistenceMigration.ts:20,66`, `runtime/extras.ts:313`) asserting "every leaf of engineState/extras survives, modulo a declared drop list" would catch a sanitizer silently eating fields — today only J10.11 checks it live.

**10. Off-the-record window.** Their read-only mode (`settings.js:1950-1996`). SO equivalent: player toggles OOC; boundaries still record (invariant 3) but extraction/curators pause; on exit "keep" = catch-up read over the window, "discard" = `runRollback(start)` + `hideChatMessageRange` (`chats.js:147`). Largely covered by ST branches + our rollback, so low value; would give the dead `sceneOoc` toggle a neighbour, not a consumer.

**11. Shared-backend yield.** Their swipe abort only works on their direct-fetch paths (`generate.js:105`); CMRS takes no signal (our own note, `runtime/runOwner.ts:58-63`). Realistic SO version: when the extraction profile's endpoint equals the main one, delay P1 start by a short quiet window after the boundary (swipes usually come fast), or skip reads a mutation already invalidated. Only matters on single-slot local servers.

**12. Anti-pattern.** Long-term memory per character in `extension_settings` via `saveSettingsDebounced` (`longterm.js:215-267`): bloats `settings.json`, leaks across chats/branches, cannot roll back — the reason for their branch warning and read-only mode. We dropped it (`docs/plans/v2/09-arcs-canon.md:76`); keep it dropped.

## Patterns to copy / anti-patterns to avoid
Copy:
- Macro-or-inject exclusivity (idea 2) — any block that is both a macro and an extension prompt needs it.
- Two-stage cost gate: cheap char estimate, real tokenizer only near the threshold (`compaction.js:88-99`).
- Structural migration guard with an explicit delete allowlist (`graph-migration.js:961-983`).
- Recap dismissal on `MESSAGE_SENT` + `GENERATION_STARTED(normal)` and suppress-if-sent-while-generating (`index.js:1987-2003`), plus a document event other extensions can fire to dismiss it (`index.js:2011`) — relevant only if our popup ever becomes non-modal.
- Unified stable→immediate ordering (`unified-inject.js:63`) is worth an A/B only for chat-completion backends where 6+ separate system blocks fragment the prompt; not a priority.

Avoid:
- Cross-chat memory in `extension_settings` (idea 12).
- Warning instead of reconciling on branch (idea 1 is the fix).
- Skipping `continue`/`swipe` renders as boundaries (`index.js:453`) — our V4 found continue must commit.
- `strict:false` reasoning parsing over structured output (idea 8).
- Regex turn classifier (`memory-utils.js:841`) redistributing budgets — English-only heuristics, no measurement; our 8/25 Spanish slice would break it.
- Auto-tune writing install-wide budgets from one chat's high-water mark.
- 3.4k-line `settings.js` / 2.3k-line `index.js` with module-level mutable flags (`index.js:180-225`) — the class of race our RunToken + census exists for.

## ST host facts learned
- `eventSource.makeLast`/`makeFirst` exist (`lib/eventemitter.js:66,90`; used `index.js:1976`). `emit` awaits every listener in order (`lib/eventemitter.js:146`) and ST awaits `CHARACTER_MESSAGE_RENDERED` (`script.js:6693`), so a slow handler delays ST's save — their `index.js:420-426`. Consistent with our `void` handlers.
- `GENERATION_STARTED` fires with type `quiet` for other extensions' background calls; gate UI reactions on `type === 'normal'` (`index.js:1993-2003`).
- Branch/checkpoint copy the full `chat_metadata` (verified in ST: `bookmarks.js:201,284`, `script.js:7406`); UI selectors `.mes_create_bookmark, .mes_create_branch` (`index.js:2039`). Not in our gotchas.
- `hideChatMessageRange(start, end, unhide, nameFilter)` in `scripts/chats.js:147` (their `settings.js:82,1989`).
- `reasoning_templates` (`reasoning.js:32`) + `parseReasoningFromString(str,{strict},template)` (`reasoning.js:1461`); returns null if the template lacks prefix/suffix (their `generate.js:45,86-96`).
- `generateRaw`/`generateQuietPrompt` with `responseLength` mutate global `amount_gen` through the `TempResponseLength` singleton (`script.js:4153`); concurrent calls corrupt it (their `index.js:427-434`). We use CMRS only — unaffected, keep it that way.
- `getMaxContextSize` is an alias of `getMaxPromptTokens` (`script.js:333`; their `compaction.js:36,84`).
- CMRS `sendRequest(profileId, messages, maxTokens)` with a message array lets a TC profile apply its instruct template (their `generate.js:155-162`) — agrees with our acceptance fix.
- New macro engine registration: `macros.register(name,{category,description,returns,handler})` from `scripts/macros/macro-system.js:44` when `power_user.experimental_macro_engine` (their `macros.js:131-139`); `MacrosParser.registerMacro` still bridges but logs a deprecation (`macros.js:184`). Agrees with our gotcha.
- **Contradicts our gotcha (their assumption, not evidence):** they skip `impersonate`/`quiet` types on `CHARACTER_MESSAGE_RENDERED` (`index.js:453`), implying ST emits them; our verified note says impersonate/quiet never emit these events. Their skip is harmless defensive code, not proof.
- **Contradicts our design:** they treat `continue` as non-committed (`index.js:448-453`); V4 established continue/appendFinal must commit their own boundary.

## Verdict
Relevance **high** (it is our memory subsystem's parent), but the marginal value is modest: the core was already ported, and our rollback/provenance/ownership layers are stronger than theirs. The one thing worth taking is not in their memory code but in the problem their branch warning admits: **reconcile a hydrated/adopted blob against the chat's actual length (idea 1)** — ST branches copy our blob today and nothing rolls it back to the branch point. Next cheapest wins: macro-placement dedupe (2) and trim telemetry in the next-turn preview (4).
