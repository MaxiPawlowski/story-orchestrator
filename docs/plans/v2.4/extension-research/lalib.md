# LALib — v2.4 review

meta: author LenAnderson · repo https://github.com/LenAnderson/SillyTavern-LALib · commit `6715da1` (2025-05-31, manifest v3.12.1) · 59 upvotes / 700 msgs · source available: **y** (`source/index.js` 7321 lines, `src/BoolParser.js`, vendored `lib/wiked-diff.js`)

## What it is
Library of ~120 STscript slash commands in one file: expression language (`/=`, BoolParser), list/dict ops, control flow (`/ife`, `/switch`, `/try`/`/catch`, `/whilee`), text/regex utils, WI listing/trigger, swipe/message manipulation (`/swipes-*`, `/message-edit|move|get|list`, `/role-swap`), DOM poking (`/dom`, `/message-on`), QR editing, `/diff` popup, `/fetch`, `/sfx`. No LLM calls, no prompt injection, no settings UI. A scripting toolkit, not a narrative feature. Relevance to SO is indirect: it shows how host state gets mutated *behind our back* and a few host seams.

## How it works
- Pure `SlashCommandParser.addCommandObject(SlashCommand.fromProps({...}))` registrations, direct ES imports of ST internals (`script.js`, `world-info.js`, `group-chats.js`, `quick-reply`) — `index.js:1-21`. Rich `helpString` with examples; dynamic autocomplete via `enumProvider: (executor, scope) => SlashCommandEnumValue[]` (`index.js:86-101`, `:5448` `commonEnumProviders.worlds`).
- Help: `/lalib?` fetches its README, renders markdown, posts it as a system message (`index.js:300-320`); a **body-level click listener executes any `[data-lalib-exec]` attribute as slash commands** (`index.js:288-293`).
- Vars: STscript locals read from `chat_metadata.variables[k]`, globals from `extension_settings.variables.global[k]` (`index.js:28-60`).
- WI: `/wi-list-books source=` reconstructs activation sources — global `world_info.globalSelect`, chat `chat_metadata.world_info`, character `data.character_book.name` + `world_info.charLore[].extraBooks`, group members (`index.js:5217-5268`). `/wi-list-entries` POSTs `/api/worldinfo/get` directly (`:5324-5343`). `/wi-trigger` sets `entry.sticky = 1` **in the book file** if unset, then forges `chat_metadata.timedWorldInfo.sticky["<file>.<uid>"] = {hash, start, end, protected:false}` with a re-derived `getStringHash` (`:5418-5445`). `/wi-activate` calls `getWorldInfoPrompt` over the whole chat to fire automation IDs (`:5398-5401`).
- Chat mutation, all direct array writes + manual DOM re-render: `/swipes-add|del|go` push/splice `mes.swipes`/`swipe_info`, `saveChatConditional()`, then `emit(MESSAGE_SWIPED, idx)` with **no generation following** (`:5822-5866`, `:5986`, `:6093-6094`); `/message-edit` writes `mes.mes` then emits `MESSAGE_EDITED` **and** `MESSAGE_UPDATED` (`:6177-6204`); `/message-move` clicks ST's `.mes_edit` → `.mes_edit_up/down` ×N → `.mes_edit_done` (`:6285-6301`); `/role-swap` flips `is_user` with **no event** (`:6714-6721`).
- `/message-on` attaches DOM listeners to elements in the last message, re-attaches on render/swipe/update/delete, clears on `CHAT_CHANGED` (`:6540-6549`).
- `/swipes-swipe` clicks swipe-right then polls a `GENERATION_ENDED` flag with abort-controller checks (`:6132-6150`).
- `/diff` lazily injects `wiked-diff.js` + a `<style>` into `body`, shows old/new/diff in an ST `Popup`, optional "Use Old/New" buttons (`:2958-3130`).
- Persistence: none of its own. Mutation handling: none (it is the mutator).

## Overlap with Story Orchestrator
- Slash surface: SO has 3 commands (`/cp`, `/so-mem`, `/story`) with one free-text unnamed arg each; `enumList` only on `/story` (`src/runtime/slashCommands.ts:52-58`, `:165`), one-line helpStrings, no `enumProvider`. LALib's autocomplete/help is far richer — but SO's surface is small by design (player/author split).
- WI forcing: SO forces via `WORLDINFO_FORCE_ACTIVATE` (`src/services/stHost/worldInfoActivate.ts:18`, consumed by `LoreSelector` `src/runtime/loreSelect.ts:31`) — one-scan, writes no file. Better than `/wi-trigger`.
- Mutation tracking: SO's `TurnBridge` listens to `MESSAGE_SWIPED/EDITED/DELETED/UPDATED` (`src/runtime/turnBridge.ts:54-57`) and rolls back. It is **event-only**: no content fingerprint of consumed messages exists (grep `fingerprint|messageHash|send_date` in `src/runtime` → only `continueStamp` `turnBridge.ts:24`). Silent mutations (below) go unseen.
- Lorebook requirements: SO counts only globally selected books (`src/runtime/requirements.ts:16-20` `listGlobalLorebooks`). LALib models all activation sources.
- Review UI: curator record already stores `before` content (`src/stagecraft/types.ts:77`, set `src/stagecraft/proposal.ts:86`) but the card renders only the new text in a textarea (`src/components/drawer/StagecraftPanel.tsx:95`). No diff view anywhere.

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | Per-boundary consumed-chat stamp; detect silent mutations on boundary/hydrate → rollback from first mismatch | enhancement | engine/host (TurnBridge, rollback) | absent | 3 | M |
| 2 | Lorebook requirement satisfied by any ST activation source (chat/character/extra/persona), not only global | enhancement | host (requirements) | partial | 3 | M |
| 3 | Before→after word diff on curator op cards (and story-update popup) | ux | stagecraft / player-ui (author) | partial | 3 | S |
| 4 | Author slash autocomplete: `enumProvider` for `/cp activate <cp>`, `/cp set <quality> <enum value>`; `/cp get <q>` returning raw value to the pipe | ux | host (slash) | partial | 2 | S |
| 5 | Silent-mutation probes in `so-turn-types-check`: message move up/down (+cancel), role swap, swipe-add w/o generation, EDITED+UPDATED double emit | testing | testing | absent | 3 | S |
| 6 | Scope harness `[data-so]` queries to SO roots (chat HTML keeps `data-*`) | anti-pattern | testing | partial | 2 | S |

**1. Consumed-chat stamp.** ST's own message move (`script.js:8353` `messageEditMove`) swaps `chat[]` entries and emits nothing; only `messageEditDone` later emits `MESSAGE_EDITED`/`MESSAGE_UPDATED` for the **destination** id (`script.js:8405`, `:8431`). Moving a message *down* from 5→10 therefore rolls back from 10 while 5..9 now hold different messages; move+cancel emits nothing at all. LALib `/role-swap` (`index.js:6714-6721`) flips speaker with no event; any extension writing `chat[i].mes` without emitting is the same class, as is editing while SO was disabled. Idea: at each boundary record a cheap stamp per consumed message (hash of `mes`+`is_user`+`name`+`swipe_id`) or a rolling hash to `lastMessageId`; on hydrate and before each commit, compare and `runRollback` from the first mismatched id. Ours: event-only (`turnBridge.ts:54-57`). Fit: reinforces invariant 11 (rollback ≡ replay) and 17 spirit (read state, not events). Must stay read-only detection; id parsing via `hostMessageId`; stamps live in the engine boundary snapshot (blob version bump, invariant 13). Cost: hashing N messages per boundary — keep per-message stamps so check is O(changed).

**2. Activation-source-aware lorebook requirements.** ST activates books from global `selected_world_info`, chat `chat_metadata.world_info`, character `data.extensions.world` + `world_info.charLore[].extraBooks`, persona `power_user.persona_description_lorebook`, deduped in that precedence (`world-info.js:4475-4590`). LALib enumerates most of them (`index.js:5217-5268`, with flaws — see host facts). Ours: `requirements.ts:20` global only, which forces install-wide selection and is the root of the "journey must activate lorebooks" trap (debug-scripts rule, v2.3 plan 04). Fit/conflict: the chat slot is already taken by the memory mirror (`src/runtime/memoryMirror.ts:122` `bindChatLorebook`), so chat-binding a story book competes with it; character-linked books are per-character install-wide and in groups apply only on that member's draft (`this_chid`). Invariant 14 unaffected (gated-set flags live in the book file regardless of how it is activated). Worth a decision: accept "active by any source" for readiness, keep `/world` activation as the Repair action.

**3. Diff on review cards.** LALib `/diff` (`index.js:2958-3130`) shows old/new/diff side by side with "use old/new" buttons. Ours already carries `before.content` on every curator op record (`stagecraft/types.ts:77`) and a `previewCuratorOp` (`proposal.ts:49`) that yields the after content; the card shows only the editable new text (`StagecraftPanel.tsx:95`). Render a word-level diff (pure util in `src/stagecraft/` or `utils/`, React spans — do NOT copy the lazy `<script>`/global `<style>` injection, invariant 19). Same component fits the story-update keep/restart popup. Author-only (invariant 9). Low risk.

**4. Author slash autocomplete + pipeable reads.** `enumProvider` gives live completions (`index.js:86-101`, `:5448`). Ours: `/cp` takes one free-text arg (`slashCommands.ts:52-58`). Add dynamic enums for subcommand, checkpoint ids, quality keys and their enum values (from snapshot), and a `/cp get <q>` returning the raw value so QR/STscript can branch on story state. Author-only (`/cp` already spoils). Must go through the existing `getContext().SlashCommand*` factories, no direct imports (invariant 2).

**5. Silent-mutation probes.** `scripts/debug/so-turn-types-check.mts` covers greeting swipe, same-id swipe, duplicates (`:18-20`, `:353-436`) but no move/role-swap/swipe-without-generation (grep `mes_edit_up|messageEditMove` across `scripts/ test/ src/` → none). Drive ST's own `.mes_edit_up/down` like `index.js:6285-6301`, and emit the double `EDITED`+`UPDATED` pair `index.js:6199-6200` does. Either proves idea 1 is needed or closes it. Cheap, and matches the "run the real host path" rule.

**6. Chat HTML carries `data-*`.** ST's message sanitize config (`script.js:1958-1967`) does not disable data attributes and the hook only rewrites `class` to `custom-*` (`scripts/chats.js:1910-1930`), so a model reply can contain `data-so="curator-accept"` or LALib's `data-lalib-exec="/…"` — the latter is executed on click by LALib's body listener (`index.js:288-293`), i.e. a model-authored clickable slash command. SO product code has no global delegated handlers (grep clean), but the harness has unscoped queries: `scripts/debug/so-responsive.mts:72` (`querySelectorAll('[data-so]')`) and `scripts/debug/so-ui.mts:425`. Scope them to the five mount roots.

## Patterns to copy / anti-patterns to avoid
Copy:
- `enumProvider` + example-rich `helpString` per command; `returns` declared so commands compose in pipes.
- `/swipes-swipe`'s wait: event flag + abort-controller poll, never a fixed sleep (`index.js:6139-6147`) — same lesson as our fixed-timeout gotcha.
- Popup with explicit "Use old / Use new" as the decision (maps to keep/restart choice UX).

Avoid:
- Writing to the user's lorebook to make a runtime trick work (`/wi-trigger` sets `sticky = 1` in the file, `index.js:5430-5433`) and forging host-private state (`timedWorldInfo` with a re-derived hash that must match ST's `JSON.stringify` key order, `index.js:5434-5443` vs `world-info.js:4632`). SO's `WORLDINFO_FORCE_ACTIVATE` path is the right one.
- Global delegated handlers keyed on attributes that can appear in chat content (`data-lalib-exec`).
- Direct `chat[]` mutation + manual `.mes_text` re-render + hand-picked event emit; different commands emit different subsets (`SWIPED` only; `EDITED`+`UPDATED`; nothing). Consumers must not assume one mutation = one event.
- Direct imports of ST internals (`index.js:1-21`) — breaks on ST refactors; SO's dynamic `stHost` seam + vendored types is the better contract.
- Lazy-injecting third-party `<script>`/unscoped `<style>` into `body` (`index.js:2960-2975`).
- String expression language with assignment side effects (BoolParser `a = b`, `++a`) — SO gates stay typed JSON, evaluated purely (invariant 3/4); no reason to add a text expression DSL.

## ST host facts learned
- `messageEditMove` swaps adjacent `chat[]` entries + itemized prompts, saves, emits **no event** (`script.js:8353-8393`); only `messageEditDone` emits `MESSAGE_EDITED` then `MESSAGE_UPDATED` for the final edit id (`script.js:8405`, `:8431`). Driven by LALib at `index.js:6285-6301`. **Not in our gotchas** — TurnBridge assumes every reorder is evented.
- Third-party programmatic swipes emit `MESSAGE_SWIPED(idx)` with no generation after (`index.js:5866`, `:5986`, `:6094`); `/message-edit` emits `MESSAGE_EDITED` + `MESSAGE_UPDATED` back to back (`index.js:6199-6200`); `/role-swap` mutates `is_user` silently (`index.js:6714-6721`).
- STscript variables: local `chat_metadata.variables[name]`, global `extension_settings.variables.global[name]`, values stored as strings (JSON for lists) (`index.js:28-60`).
- WI activation sources + dedupe precedence: global → chat (`chat_metadata.world_info`) → persona (`power_user.persona_description_lorebook`) → character (`data.extensions.world` + `world_info.charLore[{name: avatar-without-ext}].extraBooks`), each skipped if already active from an earlier source (`world-info.js:4475-4590`). **LALib contradicts ST**: it reads the character book from `data.character_book.name` (`index.js:5222`, `:5255`) — that is the embedded book's name, not the linked `extensions.world` ST actually loads — and omits persona lore. Do not copy.
- Timed WI: `chat_metadata.timedWorldInfo[type]["<world>.<uid>"] = {hash, start, end, protected}`; dropped if chat has not advanced past `start` (unless protected), if the entry lacks a nonzero `[type]` field, or after `end` (`world-info.js:593-650`). Entry `hash = getStringHash(JSON.stringify(entry))` after decorator parsing (`world-info.js:4632`) — fragile to reproduce.
- `WORLDINFO_FORCE_ACTIVATE` stores into `WorldInfoBuffer.externalActivations` keyed `<world>.<uid>` (`world-info.js:1020-1028`) and is cleared at the end of every scan (`world-info.js:418`, `:5275`) — one scan, any scan. Consistent with our LoreSelector.
- Chat message sanitize keeps `data-*` attributes; only `class` is rewritten to `custom-*` (except `fa-`, `note-`, `monospace`) (`script.js:1958-1967`, `scripts/chats.js:1910-1930`).
- `SlashCommandArgument`/`SlashCommandNamedArgument` accept `enumProvider(executor, scope)`; `commonEnumProviders.worlds` exists (`index.js:86-101`, `:5448-5455`).
- `executeSlashCommandsWithOptions(cmd, {handleExecutionErrors, handleParserErrors, parserFlags, scope})` runs with the caller's scope/flags (`index.js:6848-6856`) — consistent with our pinned-parserFlags gotcha.

## Verdict
Relevance **low-medium**. Nothing to adopt as a feature; it is a scripting toolkit. Its value is as a map of how host state gets mutated without the events SO relies on. The one thing worth taking: **idea 1 (consumed-chat stamp) validated by idea 5's probes** — ST's own message move already reorders the chat with no event, so an event-only TurnBridge can hold memory/boundaries pinned to the wrong messages.
