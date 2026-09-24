# Chat Top Info Bar — v2.4 review

> Verification note (2026-09-23, SUMMARY T14): the orphaned mirror book is NOT a global/active lorebook. The mirror creates it with `ensureLorebook` (no activation, `src/services/stHost/worldInfo.ts:116`) and binds only the chat slot (`src/runtime/memoryMirror.ts:122`), so a deleted chat leaves an inert orphan file (WI-list clutter), not live lore. The reaper is still kept, at lower severity.

Author Cohee (ST maintainer) · repo https://github.com/SillyTavern/Extension-TopInfoBar · commit `930be54` (2025-06-13) · 88 upvotes / 126 msgs · source available: **y** (`source/index.js` 685 lines, `style.css`, `jquery-highlight.js`, `i18n/`)

## What it is
Chat-chrome utility. Inserts a bar above `#chat` with chat-file shortcuts (manager, new, rename, delete, close), a chat-name `<select>` that switches between this character's/group's chats, an in-chat text search that highlights matches, a draggable sidebar listing past chats (last message, count, size), and a collapsible connection-profile strip (profile select + "API – model" + online status + API icon). No LLM calls, no prompt injection, no chat metadata. Relevance to a narrative engine is low; value is in three host seams it exercises that SO does not.

## How it works
- Entry `index.js:667-685` IIFE: patch jQuery highlight, patch `#sheld` to flex if still grid (`:122-135`), build DOM, subscribe events.
- Host access: `SillyTavern.getContext()` destructure (`:1-11`: `eventSource, event_types, getCurrentChatId, renameChat, openGroupChat, openCharacterChat, executeSlashCommandsWithOptions, Popup`) **plus static relative imports** of private modules (`:13-17`: `getGroupPastChats` from `group-chats.js`, `getPastCharacterChats, getGeneratingApi` from `script.js`, `utils.js`, `constants.js`, `i18n.js`).
- Events: `CHAT_CHANGED`, `CHAT_DELETED`, `GROUP_CHAT_DELETED` → debounced `setChatName` (`:676-679`); `APP_READY` once → bind profile select + restore panels (`:680-683`); `ONLINE_STATUS_CHANGED` → debounced status refresh (`:684`).
- Chat list: group = `context.groups.find(...).chats` (`:157-161`); solo = `POST /api/characters/chats {avatar_url, simple:true}` → `file_name` minus `.jsonl` (`:195-213`). Sidebar uses `getGroupPastChats`/`getPastCharacterChats` (`:215-232`) which return rows with `file_name, last_mes, mes, chat_items, file_size` (`:422-492`). Switch via `openGroupChat(groupId, chatId)` / `openCharacterChat(chatId)` (`:514-530`).
- Stale-async guard: sidebar populate stamps `container.dataset.processId = uuidv4()` and aborts if it changed after the await (`:420-434`) — same idea as our `RunToken`.
- Search: jQuery highlight wraps matches in `<mark class="highlight">` inside every `.mes_text` (`:239-248`, `jquery-highlight.js`), 500 ms debounce, query split on `/\s|\b/`.
- Connection strip: mirrors `#connection_profiles` by copying `innerHTML` under a `MutationObserver` and re-dispatching `change` both ways (`:348-367`); status reads `ctx.onlineStatus` (`:568-578`), then calls `SlashCommandParser.commands['api'|'model'].callback({quiet:'true'}, '')` directly (`:583`, `:601`) and prettifies via `#rm_api_block` option labels; icon `/img/<getGeneratingApi()>.svg` + global `SVGInject` (`:621-641`).
- Actions are DOM-click proxies to ST menu items (`option_select_chat`, `option_close_chat`, `option_start_new_chat`, `:94-104`); delete = `Popup.show.confirm` → `/delchat` (`:77-82`); rename = `Popup.show.input` → `renameChat` (`:106-120`).
- Persistence: only `localStorage.topBarPanelsState` (`:643-664`), restored by synthesizing clicks. No `extension_settings`, no `chat_metadata`. No mutation (swipe/edit/delete) handling — nothing to roll back.
- i18n: manifest `i18n` map (`manifest.json`) + `t` tag; shipped `i18n/zh-cn.json` is `{}`.

## Overlap with Story Orchestrator
- UI mount above chat: we mount the HUD into `#form_sheld` (`src/index.tsx:585`) and the drawer into the top bar (`src/index.tsx:573`), scoped CSS, React; theirs is raw DOM in `#sheld` with a flex patch. Ours is sturdier (scoped roots, one snapshot).
- Stale async: their `processId` ≈ our `RunToken` (`src/runtime/runToken.ts:138` `beginRun`) — ours is chat-scoped and census-enforced; theirs is per-widget.
- Chat identity events: we consume `CHAT_RENAMED` (`src/runtime/turnBridge.ts:59`) but **declare and never consume** `CHAT_DELETED`/`GROUP_CHAT_DELETED` (`src/services/stHost/events.ts:11-12`, typed as payload-less — wrong, see host facts).
- Connection status: they display it; we deliberately don't trust `onlineStatus` (gotchas: "cached label, not a probe") and probe profiles in self-test/harness. But a failed read turns extraction **off install-wide** (`src/runtime/runtimeManager.ts:430-432` writes `extraction.enabled=false`) with no recovery path.
- Chat switching / past chats: none in SO. "Continue" only speaks for the current chat (`src/components/settings/EntryPoints.tsx:41-48`).
- Search/highlight: none. Provenance renders "message N" as inert text (`src/components/drawer/ConflictQueue.tsx:17-19`, `StagecraftPanel.tsx:58-60`, `ScenePanel.tsx:13`, `DrawerTabs.tsx:372`).

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | Reap the per-chat memory-mirror lorebook on `CHAT_DELETED`/`GROUP_CHAT_DELETED` | host-integration | memory / host | absent | 4 | S |
| 2 | Fault-pause ≠ user-disable for extraction; re-arm on `ONLINE_STATUS_CHANGED` + profile probe | enhancement | extraction / pacing(pipeline) | partial | 4 | M |
| 3 | Provenance "message N" is a link → `/chat-jump N` | ux | player-ui (drawer) | absent | 3 | S |
| 4 | Cross-chat "Continue": install-wide index of chats playing a story, open via `openGroupChat`/`openCharacterChat` | ux | player-ui / host | absent | 3 | M |

**1. Mirror-book reaper.** What: subscribe `CHAT_DELETED` (payload = chat file name without `.jsonl`) and `GROUP_CHAT_DELETED` (payload = chat id; group deletion emits one per chat); find `world_names` entries of the form `Story Orchestrator - <title> - <chatId>` (`src/runtime/memoryMirror.ts:50` `mirrorLorebookName`) whose suffix is exactly the deleted id, and delete them (or queue a one-click "remove N orphaned story memory books" in Repair). Their evidence: `index.js:677-679` subscribes both; ST emits at `script.js:1354`, `:1401`, `:10884`, `group-chats.js:1334`, `:2269`, `:2308`. Our evidence: events declared but unconsumed (`events.ts:11-12`); debug-scripts rule says "deleting the chat does not delete it" and only the harness (`so-scenario --sandbox`, `so-journey`) cleans them — a real player accumulates one orphan global lorebook per deleted story chat, visible in every WI list. Fit: the book is ours by name and chat suffix (same ownership rule harness cleanup already uses); `CHAT_DELETED` fires **after** `chat_metadata = {}` for the current chat (`script.js:1350-1352`), so `extras.memory.wiBook` is gone — match by name suffix from `world_names`, never by metadata. Deletion is destructive → default to Repair-listed confirm, not silent. Needs a new `stHost/worldInfo` delete seam returning `WriteResult` (inv 2, 16). Fix `HostEventPayloads` types first.

**2. Pause reason + auto re-arm.** What: a failed read currently sets install-wide `extraction.enabled=false` (`runtimeManager.ts:430-432`, called from `extraction/scheduler.ts:180`), conflating "the player turned tracking off" with "the backend blipped" — a RunPod restart silently ends tracking for every chat until someone flips the checkbox. Store `pausedReason: "fault"` separately from the user's `enabled`; on `ONLINE_STATUS_CHANGED` to a non-`no_connection` value (and on a timer backoff) run the existing PONG-style profile probe and, if the **extraction profile** answers, clear the fault and pump the scheduler. Their evidence: `index.js:684` + debounce `:251`; ST emits only on change (`script.js:7151-7157`). Our evidence: pipeline already has `error`/`not-configured` states (`src/runtime/pipeline.ts:61-67`). Fit: `onlineStatus` tracks the **main** API, not our CM profile — treat the event as a trigger to probe, never as proof (our gotcha). Respects inv 5 (off-path) and 13 (a fault must not masquerade as a user setting; arguably fixes a current strain of 13). Player copy: pipeline "reconnecting…" instead of "turn that on in settings".

**3. Message links.** What: every "message N" in Memory rows, conflict queue, scene panel, stagecraft/warden cards becomes a button that runs `/chat-jump N`. Their evidence: in-chat search + highlight (`index.js:239-248`) is the need; the better seam is ST's own `/chat-jump` (`slash-commands.js:3449-3486`: loads older messages via `showMoreMessages`, scrolls `#chat`, `flashHighlight` 2 s). Our evidence: inert text at `ConflictQueue.tsx:19`, `StagecraftPanel.tsx:60`, `ScenePanel.tsx:13`, `DrawerTabs.tsx:372`; only intra-drawer reveal exists (`DrawerTabs.tsx:190-197`). Fit: SO never rewrites message DOM (baseline §4) — `/chat-jump` keeps that true (ST highlights its own node). Player-safe for Memory tab (it's the player's own chat, inv 9); guard `messageId < 0` (legacy) as `originLabel` already does. Needs `executeSlashCommands` through the existing seam; skip when id ≥ chat length.

**4. Continue across chats.** What: maintain an install-wide ring (like `wizardSessions`) of `{chatId, groupId|avatar, storyId, title, checkpointName, at}` updated at boundary; the Continue row lists recent plays and opens one. Their evidence: chat list + switch (`index.js:153-183`, `:405-530`). Our evidence: Continue shows only this chat (`EntryPoints.tsx:43`); no index exists (grep `recentPlays|lastPlayed` = 0). Fit: never read other chats' files (privacy report) — the index is written by the chat itself. Checkpoint **names** only (inv 9). Open via `open-group` first: `openGroupChat` returns silently unless the chat is in `group.chats` (our gotcha, `group-chats.js:2195`). Also gives idea 1 an authoritative chat→book map. Strain: a fourth kind of install-wide data (inv 13) — precedent is `wizardSessions`; cap it.

## Patterns to copy / anti-patterns to avoid
Copy:
- Subscribe the deletion events, not just rename — identity lifecycle has three edges (`index.js:677`).
- Debounce host-event fan-out (`debounce_timeout.short`, `:676`) — CHAT_CHANGED bursts.
- Per-widget `processId` abort after await (`:420-434`) — cheap guard for pure-UI async refresh where a full `RunToken` is overkill.

Avoid:
- Static relative imports of `script.js` / `group-chats.js` (`:13-16`) — breaks outside the ST tree and bypasses our seam (inv 2).
- DOM-click proxies to ST menu items (`:94-104`) and restoring state by synthetic clicks (`:658-662`) — silently no-op when ST renames an id.
- Mirroring an ST `<select>` by copying `innerHTML` under a MutationObserver (`:361-364`).
- Calling `SlashCommandParser.commands[x].callback` directly (`:583`, `:601`) — skips parser flags/closures; we pin parser flags in `executeSlashCommands`.
- Displaying `onlineStatus` as health (`:570`) — it is a cached label; shows the model while the backend is dead.
- Highlighting by splicing `<mark>` nodes into `.mes_text` (`:239-248`) — mutates message DOM ST re-renders; SO must not.
- `localStorage` for UI state (`:644`) — a fourth, per-browser config home.

## ST host facts learned
- `CHAT_DELETED` payload = chat name without `.jsonl` (`script.js:1349-1354`, `:1401`, `:10884`); for the current chat it fires **after** `chat_metadata = {}` + `replaceCurrentChat()` (`script.js:1350-1352`). **Contradicts our typing** `CHAT_DELETED: []` (`src/services/stHost/events.ts:11`).
- `GROUP_CHAT_DELETED` payload = chat id (`group-chats.js:2269`, `:2308`); deleting a whole group emits it once per chat (`group-chats.js:1331-1335`). **Contradicts our typing** `GROUP_CHAT_DELETED: []` (`events.ts:12`).
- `ONLINE_STATUS_CHANGED(status)` emitted only when the value changes, via `emitAndWait` (`script.js:7151-7157`); `'no_connection'` is the offline sentinel (their `index.js:570`). Tracks the main API only.
- Context exposes `renameChat`, `openGroupChat`, `openCharacterChat`, `onlineStatus` (`st-context.js:131`, `:133`, `:156-157`); `mainApi`, `SlashCommandParser` also read off context (their `index.js:568`).
- `POST /api/characters/chats {avatar_url, simple:true}` lists a character's chat files (their `index.js:197-208`); `getPastCharacterChats` rows carry `file_name, last_mes, mes, chat_items, file_size` (`script.js:8506-8527`, used `index.js:422-492`); group chats list = `group.chats` (their `index.js:158-160`).
- `#movingDivs` + `<template id="generic_draggable_template">` is ST's draggable-panel kit (`index.html:6434`, `:7737`; their `index.js:297-328`).
- Extension manifest `i18n: {locale: file}` is fetched and merged via `addLocaleData` (`extensions.js:848-875`); `t` tag from `i18n.js:81`.
- Not from their code but found while checking idea 3: `/chat-jump N` (aliases `chat-scrollto`, `floor-teleport`) loads hidden older messages and flash-highlights (`slash-commands.js:3449-3486`; `flashHighlight` `utils.js:2184`).
- Consistent with our gotcha: they populate the group select from `group.chats`, the only ids `openGroupChat` accepts (`group-chats.js:2195`).

## Verdict
Relevance **low** (chat-chrome utility, no story/memory/prompt logic). The one thing worth taking: **consume `CHAT_DELETED`/`GROUP_CHAT_DELETED`** — fix our payload typing and reap (or offer to reap) the orphaned per-chat memory-mirror lorebook, which today leaks one global book per deleted story chat. Runner-up: separate fault-pause from user-disable for extraction, re-armed by `ONLINE_STATUS_CHANGED` + a real profile probe.
