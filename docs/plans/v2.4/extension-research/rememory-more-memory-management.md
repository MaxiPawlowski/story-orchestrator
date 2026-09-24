# ReMemory: More Memory Management — v2.4 review

> Verification note (2026-09-23, SUMMARY T14): the name-stripping keyword code is `source/src/memories.js:283-288` (names from `getAllNames` `:43`), not `:328-333`, which is a chunk-summary retry popup. Keyed entry creation is `:113-128`. Idea 6: stop mirroring scene rows rather than giving them keys, because scene history is already injected via `INJECTION_REGISTRY.memorySceneHistory` (`src/constants/injectionRegistry.ts:17`), so keyed rows would double-inject.

meta: author Inspector Caracal · repo https://github.com/InspectorCaracal/SillyTavern-ReMemory · commit `2c36625` (2025-10-31), v1.1.1 · 52 upvotes / 560 msgs · source available: **y** (7 JS/HTML files, ~1.1k lines, read in full)

## What it is
Manual-trigger memory tool: user clicks a message button (or slash cmd) to (a) copy a message into a WI entry, (b) LLM-summarize message + N prior into a WI entry, (c) end a scene → summarize everything since the last scene marker, optionally hide the summarized messages. Memories live in **per-character auxiliary lorebooks** as keyword entries with 50% trigger probability, sticky 3, optional low-% constant "pop-up" copies that fade per scene. "Convenience, not automation" — no automatic extraction, no state model.

## How it works
- **Boot**: `fetch('/version')`, refuses unless minor ≥13 (`index.js:18-22` — major-blind, would reject ST 2.0.x). On `APP_READY` loads settings + slash cmds (`index.js:28-31`).
- **Message buttons**: prepends three `.rmr-button` divs into `.extraMesButtons` on `USER_MESSAGE_RENDERED`/`CHARACTER_MESSAGE_RENDERED` (`index.js:32-33`, `src/messages.js:231-256`), re-scans all `#chat > .mes[mesid]` on `CHAT_CHANGED`/`MORE_MESSAGES_LOADED` (`index.js:34-38`, `messages.js:258-260`).
- **Book routing**: `getActiveMemoryBooks()` (`memories.js:105-140`) collects chat book (`chatMetadata.world_info`), persona book (`persona_descriptions[avatar].lorebook`), and per-character book from its own `settings.book_assignments[charFilename]` — chosen from the card's `world_info.charLore[].extraBooks` (`settings.js:235-257`). User picks recipients via `/buttons labels=[...] multiple=true` run through `executeSlashCommandsWithOptions`, result JSON in `.pipe` (`memories.js:142-156`).
- **Entry write**: `loadWorldInfo` → `createWorldInfoEntry(book, data)` → mutate fields → `saveWorldInfo` + `reloadWorldInfoEditor` (`memories.js:158-204`). Entry: `position=4` (@depth), `depth`, `role`, `group='memory'`, `useGroupScoring=true`, `sticky=memory_life`, `probability=trigger_pct`. Pop-up copy: `constant=true`, `probability=popup_pct`, custom field `rmr_fade=true` (`memories.js:184-200`).
- **LLM calls**: `generateRaw({prompt})` with settings templates `{{content}}` (`settings.js:28-37`, `memories.js:299`, `:324`); keyword call adds ephemeral stop `"\n"` (`memories.js:325`, `power-user.js:3017`); reasoning stripped with `parseReasoningFromString` (current reasoning template) (`memories.js:301`, `:326`). Keywords: split on `,`, participant names removed unless `allow_names`, max 5 (`memories.js:328-333`, names from `getAllNames` `:88-103`).
- **Profile override**: switches the **global** connection profile by setting `#connection_profiles` + dispatching `change`, awaits `CONNECTION_PROFILE_LOADED`, generates, switches back; send buttons disabled meanwhile (`memories.js:238-286`).
- **Rate limit**: min spacing `max(500, 60000/rpm)` ms between its own calls (`memories.js:66-69`, `:289-294`, `:317-321`).
- **Window prep**: slice chat, run each message through `getRegexedString(mes, USER_INPUT|AI_OUTPUT, {isPrompt:true, depth})`, drop `is_system` (hidden), keep last span+1 (`memories.js:206-236`).
- **Scene end** (`memories.js:336-415`, `:469-516`): range = after last message with `extra.rmr_scene` → this message; chunk by `getTokenCountAsync` against `maxContext-100`; one summary per chunk (map), empty chunk → Retry/Cancel popup, then summary-of-summaries (reduce); optional chunk summaries posted as `<details>` `/comment`. Output → `/comment at=` in chat, or a memory entry, or nothing. Optional hide: sets `chat[i].is_system=true` + DOM attr + `saveChat()` (`memories.js:399-408`). Marker persisted in `chat[id].extra.rmr_scene` (`:512`), toggleable from the button (`messages.js:209-229`).
- **Fade**: per scene end, every `rmr_fade` entry's probability −= `fade_pct`; ≤0 → deleted from the book (`memories.js:519-555`).
- **Slash**: `/memory-gen`, `/memory-log`, `/scene-end`, `/memory-fade` via `SlashCommand.fromProps`, message-id autocomplete `commonEnumProviders.messages()`, profile enum from `extension_settings.connectionManager.profiles` (`commands.js:8-11`, `:40-197`).
- **Persistence**: install-wide `extension_settings['SillyTavern-ReMemory']` (incl. book assignments keyed by chara filename); memories in WI files; scene markers in chat messages. No `chat_metadata`.
- **Mutations**: none handled. Swipe/edit/delete never touch created entries; a deleted scene-marker message just disappears; `CHARACTER_RENAMED` rekeys assignments (`settings.js:296-302`) but ST emits avatar filenames (`script.js:7246`) while keys are `getCharaFilename` (no `.png`) → likely never matches.

## Overlap with Story Orchestrator
- **We do more/better**: automatic off-path extraction into 4 typed tiers (`src/extraction/sharedRead.ts:87`), provenance + rollback (`src/memory/stores.ts:77`), deterministic scoring w/ recency decay (`src/memory/score.ts:45-60`), dedup/supersession (`src/memory/consolidate.ts:54`), per-member private epistemic (`src/memory/epistemic.ts:50`) — ReMemory's "which characters remember this" is a manual, WI-based, non-private version of that. Profile calls via `ConnectionManagerRequestService` without touching the user's active profile (`src/services/stHost/connectionProfiles.ts:43`). Template-independent reasoning stripping (`src/extraction/parse.ts:51`) vs their current-template-only parse.
- **They do and we don't**: scene summary over the **whole scene** since the previous break, token-chunked map→reduce; regex-processed windows; player-initiated "remember this message"; manual scene-end; request spacing; name-stripped WI keys.
- **Both**: WI as a memory surface — ours is the per-chat mirror (`src/runtime/memoryMirror.ts:69`), relationship + scene rows only (`:52-53`).

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | Scene summary spans the whole scene since previous break (chunked map→reduce) | enhancement | memory | partial | 4 | M |
| 2 | Token-budget chunker for whole-chat reads (`memorize:full`, backlog) — closes seed D | pattern | extraction | partial | 4 | M |
| 3 | Run ST regex scripts (prompt placement) over extraction windows | host-integration | extraction | absent | 3 | S |
| 4 | "Remember this" message action / `/so-mem remember <id> span=` → targeted P0 read | new-feature | memory / player-ui | absent | 3 | M |
| 5 | Manual scene end `/story scene-end [id]` → forces scene-break pass | new-feature | memory | absent | 3 | S |
| 6 | Mirror key hygiene: strip participant names; scene rows are keyless → inert | enhancement | memory | partial | 3 | S |
| 7 | Request spacing (rpm cap) at the single memory-model choke point | enhancement | extraction | absent | 2 | S |
| 8 | `CHARACTER_RENAMED` → Repair step for roster name drift | host-integration | host / repair | absent | 2 | S |
| 9 | Probabilistic / pop-up / fading recall | anti-pattern | memory | present (we're deterministic) | 2 | S |
| 10 | Swapping the user's global connection profile via DOM for side calls | anti-pattern | host | present (we avoid) | 2 | S |
| 11 | Hiding summarized messages by writing `is_system` directly | anti-pattern | host / extraction | present (we never mutate chat) | 2 | S |

**1. Whole-scene summary.** Theirs: range = last `rmr_scene` marker → message (`memories.js:340-342`), chunk + reduce (`:347-395`). Ours: `runSceneBreakPass` summarizes `audit.window` only (`src/runtime/coordinators/extractionCoordinator.ts:287-300`), i.e. the cadence window that detected the break, so a 40-message scene becomes a summary of its last few messages. Fix: keep a scene-start cursor (message id of the previous break, already implicit in `sceneDetect` cursor) and summarize `[prevBreak+1, to]`, chunked by #2. Fits invariants: off-path, RunToken over the wider range (edit inside it → stale, same rule as today), derived record `range` for rollback (`src/memory/derived.ts:56`) must carry the wider span. No conflict.

**2. Token-budget chunker.** Theirs `memories.js:344-360` (greedy pack by `getTokenCountAsync`) + map/reduce `:362-395` + retry on empty chunk. Ours: `memorize:full` sends `getChatWindow(0, chat.length-1)` as one request (`extractionCoordinator.ts` in `runMemorizeBacklog`, reason `"memorize:full"`), listed as seed D ("no request-size bound"). We already have `countTokens`/`countTokensBatch` (`src/services/stHost/tokenizer.ts:3`, `:10`). Do it better than they do: budget against the **memory profile's** context, and subtract the prompt template + expected response (theirs uses main `maxContext-100` and ignores the template, `:344`). Reduce step must stay a *read* (DELTA parse), not free prose, for the full pass. Pure chunker in `src/extraction/` → jest-testable.

**3. Regex-processed windows.** Theirs `memories.js:214-224`: `getRegexedString(mes, placement, {isPrompt:true, depth})` (`public/scripts/extensions/regex/engine.js:334`), so the memory model sees what the main model sees (stat blocks/HTML/thinking stripped by user regex). Ours: `readMessage` uses raw `entry.mes` (`src/extraction/chatWindow.ts:6-14`). New `stHost/regex.ts`, applied in `getChatWindow`; evidence check (`src/extraction/evidence.ts:28`) and conflict re-read use the same window, so they stay consistent. Invariant 4 untouched (transform of read input, never a write). Capability-probe it (`capabilities.ts`) — absent regex ext = raw text.

**4. "Remember this".** Theirs: brain button + `/memory-gen id span` (`messages.js:242-248`, `memories.js:418-442`, `commands.js:40-86`). Ours: player can only curate (pin/exclude/edit); `/so-mem` = list|pin|exclude|backlog (`src/runtime/slashCommands.ts:155`); no player-initiated read. Shape that respects invariants: a request enqueues a P0 targeted read over `[id-span, id]` (same lane as forced cues, `src/extraction/cues.ts:5` — invariant 4 "a cue may only force a read"), memory rows land with `source` tagged as requested, any DELTA still boundary-applied. Button in `.extraMesButtons` = new `stHost/messageActions.ts` with CHAT_CHANGED/MORE_MESSAGES_LOADED re-render (their `index.js:34-38`); slash form first (S), button second. Player-safe: shows only the memory row produced, never deltas.

**5. Manual scene end.** Theirs `memories.js:469-516` + toggle `messages.js:209-229`. Ours: heuristic (`src/memory/sceneDetect.ts:34`) + opt-in judge `sceneTrigger`; no manual trigger (no scene verb in `slashCommands.ts`). Add `/story scene-end` (player-safe) → forced `scene:manual` read + #1 summary. **Do not** copy their persistence (marker in `message.extra`, survives edits, no rollback): store break ids in extras keyed by messageId so `rollbackFromMessage` drops them.

**6. Mirror key hygiene.** Theirs strips participant names from keys (`memories.js:328-333`) — a name key fires on nearly every turn. Ours: mirror writes `entry.entities` as keys (`src/runtime/memoryMirror.ts:110`); relationship rows keyed by character names ≈ constant; scene rows are created with `entities: []` (`extractionCoordinator.ts:300`) → keyless, non-constant → ST skips them (`world-info.js:4904-4907`), i.e. inert. Decide per row type: strip roster/persona names from keys (roster via `src/runtime/roster.ts`), and either give scene rows keys or stop claiming they recall. Check first that mirrored rows don't double-inject with the tier blocks (`src/constants/injectionRegistry.ts:12`) — not verified live here.

**7. Request spacing.** Theirs `memories.js:66-69`, `:289-294`. Ours: no throttle in `src/extraction/scheduler.ts` / `client.ts` (grep throttle|cooldown|429: 0 hits); backlog + scene + epistemic + canon + curator can burst on metered APIs (OpenRouter free = rpm-limited), and a failed read pauses extraction install-wide. Min-interval gate inside `callExtractionModel` (`src/extraction/client.ts:11`), install-wide setting default 0. Off-path only → invariant 5 fine.

**8. Rename drift.** Theirs subscribes `CHARACTER_RENAMED` (`index.js:39`) though with a key-mismatch bug. Ours: roster matched by name (`src/runtime/roster.ts:8`, `:38`); no rename subscription (grep 0 hits) → renamed card silently drops out of talk control/requirements. Event gives `(oldAvatar, newAvatar)` (`script.js:7246`). Invariant 12 forbids silently rewriting the pinned story → surface as a Repair step (`src/runtime/repair.ts:25`) pointing at Studio Roster.

**9–11. Anti-patterns** — see next section; all three conflict with our invariants (11 rollback≡replay determinism; 5/host purity; "SO never rewrites chat").

## Patterns to copy / anti-patterns to avoid
Copy:
- Greedy token packing + map→reduce + per-chunk retry (`memories.js:344-395`).
- Regex-for-prompt parity on memory inputs (`memories.js:214-224`).
- Name-stripping for generated WI keys (`memories.js:328-333`).
- `useGroupScoring` + one inclusion `group` so keyword rows outrank constant ones (`memories.js:177-179`, `:194-196`) — useful if the mirror ever mixes constant and keyed rows.
- Slash arg autocomplete for message ids via `commonEnumProviders.messages()` (`commands.js:56`).

Avoid (each seen in their code):
- **Probabilistic recall** (`probability` 50/10, `memories.js:181`, `:198`) and **probability-decay-then-delete** (`:519-555`): nondeterministic prompts, non-replayable; deletion is irreversible and unjournaled. Our recency decay in scoring (`src/memory/score.ts:56`) is the deterministic equivalent.
- **Global profile swap via DOM** (`memories.js:244-256`, `:278-282`): mutates the user's active connection, races a user generation, locks send buttons; a thrown error mid-swap still restores but the user's UI flickers. We use per-request profile calls.
- **Hiding by direct `is_system=true` + `saveChat`** (`memories.js:399-408`): no event fires, other extensions (incl. us) never learn; our `chatWindow.ts:8` then silently excludes those messages from every later read/re-read.
- **Module-global `commandArgs`** reassigned per call (`memories.js:59`, `:419`, `:446`, `:470`): two concurrent generations (button + slash) read each other's options — the exact class our RunToken rule exists for.
- **State in `message.extra`** without mutation handling (`:512`).
- Small bugs as a checklist of what review misses: popup role written to the wrong entry (`memories.js:192`), checkbox bound to non-existent key `rmr_allow_names` (`settings.js:192`), `"#"+Number(cid)+1` string concat (`memories.js:378`), unused settings `memory_max_tokens`/`tools_enabled` (`settings.js:25`, `:40`), major-blind version gate (`index.js:20`), selectors that originally hooked every textarea in ST (post.md author follow-up) — i.e. unscoped selectors, which our CSS/root scoping rule already prevents.

## ST host facts learned
- `createWorldInfoEntry(_name, data)` only allocates a free uid from `newWorldInfoEntryTemplate` and inserts into `data.entries`; caller must `saveWorldInfo` (`public/scripts/world-info.js:4137-4149`). Their use + `reloadWorldInfoEditor` (`memories.js:169`, `:202-203`; `st-context.js:280`).
- WI template defaults: `probability 100`, `useProbability true`, `group ''`, `sticky null`, `position 0` (`world-info.js:4093-4118`).
- Keyless non-constant entries are skipped in the scan (sticky-active excepted) (`world-info.js:4898-4907`) — **relevant to our mirror** (idea 6).
- Ephemeral stop strings: `addEphemeralStoppingString`/`flushEphemeralStoppingStrings` (`power-user.js:3017`, `:3024`), merged into custom stops (`power-user.js:3111`), flushed after main generation (`script.js:5702`) — so a `generateRaw` caller must flush itself (they do, `memories.js:277`).
- `parseReasoningFromString(str, {strict}, template)` uses the *currently selected* reasoning template and returns `null` if it lacks prefix/suffix (`reasoning.js:1461-1467`) — consistent with our gotcha that inline reasoning must be stripped template-independently.
- `getRegexedString(raw, placement, {isPrompt, depth})` (`extensions/regex/engine.js:334`) — the seam for prompt-parity text.
- `CONNECTION_PROFILE_LOADED` emitted by connection-manager on switch (`events.js:81`; `connection-manager/index.js:752`).
- `CHARACTER_RENAMED` emits `(oldAvatar, newAvatar)` (`script.js:7246`) — avatar filenames, not names.
- Per-character extra books: `world_info.charLore[{name: charaFilename, extraBooks}]` (`world-info.js:1131-1135`).
- `/buttons labels=[...] multiple=true` returns selected labels as JSON in `.pipe` via `executeSlashCommandsWithOptions` (their use, `memories.js:148-151`; not re-verified in ST source).
- Custom fields on WI entries (`rmr_fade`) survive a raw `saveWorldInfo` (`/api/worldinfo/edit` posts `data` as-is, `world-info.js:4151-4158`); whether the WI editor preserves them on a UI save is **unverified**.
- No contradictions with our gotchas found. Their `loadWorldInfo` truthiness check (`memories.js:162`) is exactly the trap in our gotchas (`loadWorldInfo` answers a missing book with a dummy) — their "book missing" toast can never fire for an unlisted name.

## Verdict
Relevance **medium**. Much weaker memory model than ours, but it solves two things we don't: bounded, chunked summarization of long spans and prompt-parity (regex) input. The one thing worth taking: **token-budget map→reduce chunking, applied to scene summaries (whole scene since last break) and `memorize:full`** — it fixes a real under-summarization in `runSceneBreakPass` and closes seed D in one pure module.
