# ChatsPlus (Recent, Pinned and Folders for Chats) — v2.4 review

meta: author silver / SoFizzticated · repo https://github.com/SoFizzticated/SillyTavern-ChatPlus · commit `ca5e6a8` (2026-05-30), manifest v1.1.1 · 78 upvotes / 162 msgs · source available: y (`source/index.js` 2999 lines, `style.css`, `jquery-highlight.js`). Paths below: theirs relative to `source/`, ours relative to the extension root, ST relative to `SillyTavern-MainBranch/`.

## What it is
Chat-organisation UI. Adds a tab row (Characters / Recent Chats / Folders) to ST's right nav panel, lists every chat across all characters and groups newest-first, searches by character name / chat title / last message, pins chats, and files them into nested folders. Settings drawer: default startup tab, JSON import/export of its own settings. No LLM calls, no prompt injection, no chat mutation. README points to a successor (ChatPlus2, not mirrored).

## How it works
- **Host access**: static relative imports of ST internals — `getGroupPastChats`, `select_group_chats`, `groups` (group-chats.js), `getPastCharacterChats`, `selectCharacterById`, `renameGroupOrCharacterChat`, `setActiveGroup` (script.js), `Popup`, `deleteAttachment` — `index.js:4-11`; rest from `SillyTavern.getContext()` `index.js:13-22`.
- **UI placement**: tab row inserted into `#right-nav-panel` next to `#CharListButtonAndHotSwaps` `index.js:2086-2110`; startup tab activated after a blind `setTimeout(…,1000)` `index.js:2673-2687`; folder collapse state in `localStorage` `index.js:1470`.
- **Enumeration**: per refresh, one `POST /api/characters/chats` per character (`index.js:499`), `POST /api/groups/all` (`index.js:728`), then `getPastCharacterChats`/`getGroupPastChats` per entity for `last_mes` stats (`index.js:771-796`) — O(characters + groups) requests; sorted by `last_mes` via `timestampToMoment` (`index.js:802-815`); paged 100 at a time (`index.js:29`, `:828`).
- **Persistence**: `extensionSettings.chatsPlus = {pinnedChats[], folders[{id,name,parent}], chatFolders{"<characterId>:<file_name>": folderId[]}}` + `saveSettingsDebounced` (`index.js:43-52`, `:69`, `:165`). **Key = numeric `characterId`, i.e. an index into `characters[]`**, which shifts whenever a card is added/deleted/renamed.
- **Keeping keys alive**: subscribes `CHARACTER_RENAMED`, `CHARACTER_DELETED`, `CHARACTER_DUPLICATED`, `SETTINGS_LOADED_AFTER`, `CHARACTER_PAGE_LOADED` (`index.js:2699-2721`); each schedules `setTimeout` 100–1000 ms then `processCharacterRenameUpdate` (`index.js:2768`), which re-fetches every character's chat list and remaps keys by **file name alone** (collides if two characters own same-named chats). Chat rename only survives if done from their UI (`handleChatRename`, `index.js:2729`, after `renameGroupOrCharacterChat` `index.js:1568`); no `CHAT_RENAMED` / `CHAT_DELETED` subscription.
- **Opening a chat**: group = `setActiveGroup(group)` + `select_group_chats(id,true)` + `openGroupChat(groupId, chatId)` (`index.js:1812-1818`, `:541`); character = `selectCharacterById` + 150 ms sleep + `openCharacterChat` (`index.js:1822-1825`).
- **Import**: whole settings object replaced by the parsed file after a confirm, no schema check, `alert()` for result (`index.js:1957`). Startup also deletes a retired attachment-based backup system every load (`index.js:2605-2645`, `deleteAttachment`).
- **Mutation handling / LLM**: none — does not touch messages, swipes or prompts.

## Overlap with Story Orchestrator
- Chat rename: we already do it right — `CHAT_RENAMED` subscribed (`src/runtime/turnBridge.ts:59`), blob restamped (`src/runtime/persistence.ts:97` `restampRenamedChat`). Their "known issue" is solvable on current ST (event emitted `public/script.js:10717`).
- Typed event payloads: we declare payload tuples per event (`src/services/stHost/events.ts:6`), which would have caught their `CHARACTER_DELETED` bug (below). But our `CHAT_DELETED: []` / `GROUP_CHAT_DELETED: []` typing is wrong vs host (both carry the chat name) — harmless only because nothing subscribes.
- Cross-chat view: we have none. "Continue" in settings only speaks about the open chat (`src/components/settings/EntryPoints.tsx:41-47`); no code enumerates chats (`grep /api/chats/recent|getPastCharacterChats|openGroupChat` in `src/` = 0 hits).
- Per-chat asset cleanup: memory mirror leaves one book per chat (`src/runtime/memoryMirror.ts:50`), only the harness reclaims them; product has no delete/orphan path (`grep -i orphan|deleteWorldInfo src/` → no runtime hit).

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | "Your playthroughs" list from `/api/chats/recent {metadata:true}` | ux / host-integration | player-ui (settings Continue) | absent | 4 | M |
| 2 | Orphaned memory-mirror book reclaim (chat-delete event + metadata sweep) | host-integration | memory (mirror) | absent | 3 | M |
| 3 | Fix `CHAT_DELETED` / `GROUP_CHAT_DELETED` payload typing | host-integration | host | partial (wrong) | 2 | S |
| 4 | Stable entity keys (avatar / group id + file), never `characters[]` index, in any persisted cross-chat record | anti-pattern / pattern | host, persistence | present (runtime-only index use) | 3 | S |

**1. Playthroughs list.** What: Continue row lists recent chats whose metadata carries a `story_orchestrator` blob — story title, current checkpoint *name* (player-safe), last played; click opens that chat. Their evidence: the whole extension exists because cross-character resume is painful (`post.md`), done with N requests (`index.js:499,728,771`). Better host path verified: `POST /api/chats/recent` walks character + group chat dirs server-side, sorts by mtime, honours `pinned`, and with `metadata: true` returns each chat's `chat_metadata` (`src/endpoints/chats.js:1054-1149`, `getChatInfo` `:459-462`); ST's own welcome screen uses it (`public/scripts/welcome-screen.js:763-770`). Our evidence: `EntryPoints.tsx:41-47` open-chat only. Fit: derived at read time → no new config home (inv 13); new `stHost/chats.ts` seam (inv 2); only checkpoint names, no future nodes (inv 9); read-only so no RunToken, but the open action must pin group then chat (`openGroupChat` silently no-ops unless the chat is in `group.chats`, our gotcha + `public/scripts/group-chats.js:2199`). Cost: `metadata:true` reads the first line of every returned file — cap `max`.

**2. Orphaned mirror books.** What: on `CHAT_DELETED`/`GROUP_CHAT_DELETED` (payload = chat name), look for `Story Orchestrator - * - <name>`; plus an author-view "unreferenced story books" sweep = SO books not named in any chat's `chat_metadata.world_info` / `story_orchestrator` (from idea 1's metadata read). Offer delete with confirm, never auto. Their evidence (negative): their `handleCharacterDelete` cleanup silently never runs (see anti-patterns) — cleanup-on-delete is easy to get wrong without a typed payload + test. Our evidence: `memoryMirror.ts:50` naming; `.claude/rules/debug-scripts.md` "deleting the chat does not delete it"; harness-only reclaim. Fit: destructive → author-only + confirm; name match must require the SO prefix **and** an exact chat-id suffix (same rule as harness cleanup); rename caveat — book name keeps the pre-rename chat id (`memoryMirror.ts:48-49`), so the metadata sweep, not the name, is the truth.

**3. Event typing.** `events.ts:11-12` declares no args; host emits `CHAT_DELETED(name)` (`public/script.js:1354`, `:1401`, `:10884`) and `GROUP_CHAT_DELETED(chatId)` (`public/scripts/group-chats.js:1334`, `:2269`, `:2308`). Prerequisite for idea 2; add a `hostTypes` ledger row.

**4. Stable keys.** Their pins/folders keyed by `characters[]` index (`index.js:165`), then patched by delayed remaps. We use numeric chid only transiently (`onMemberDrafted`), roster by name/id. Rule for any v2.4 cross-chat record (idea 1 cache, if ever persisted): key like ST's `PinnedChatsManager.getKey` — `group_<id>` / `char_<avatar>` + `_<file_name>` (`public/scripts/welcome-screen.js:118`).

## Patterns to copy / anti-patterns to avoid
- Copy: none of their code. Copy the *host* path they didn't use: `/api/chats/recent` (+`metadata`, +`pinned`) instead of per-entity fan-out.
- Anti: persisting a volatile index as identity, then "healing" with `setTimeout(…, 100–1000)` remaps on five events (`index.js:2699-2721`, `:2901-2999`) — race-by-design, same class as our debounced `globalSelect` trap.
- Anti: untyped event payload — `CHARACTER_DELETED` emits `{id, character}` (`public/script.js:10888`) but `handleCharacterDelete(characterId)` compares it to string ids (`index.js:2929`), so orphan cleanup is a permanent silent no-op.
- Anti: remap by file name alone across characters (`index.js:2768+`) — cross-entity collision.
- Anti: fixed sleeps around navigation (`index.js:1823`, `:2673`) — we already forbid this in the harness (hardware-assumption gotcha).
- Anti: wholesale settings import with no validation (`index.js:1957`) — if we ever ship library import/restore, validate + diff + confirm per record (Studio import already validates per story).
- Anti: a one-time migration cleanup (`removeAllBackupFiles`) run on every page load forever (`index.js:2669`).

## ST host facts learned
- `POST /api/chats/recent {max, pinned, metadata}` — server-side cross-entity recent list, pinned first, then mtime; `metadata:true` includes `chat_metadata` (`src/endpoints/chats.js:1054-1149`, `:459-462`). Verified in ST source, not in their code (they predate/ignore it).
- ST has native chat pinning keyed `group_<id>`/`char_<avatar>` + `_<file_name>` in `accountStorage` (`public/scripts/welcome-screen.js:41`, `:118`).
- `CHAT_RENAMED` payload `{avatarId, groupId, oldFileName, newFileName}` with `.jsonl` suffixes (`public/script.js:10716-10717`) — **contradicts their README** "limitation on the events ST emits"; consistent with our `events.ts:8` + `restampRenamedChat`.
- `CHARACTER_DELETED` payload `{id, character}` (`public/script.js:10888`); `CHARACTER_RENAMED(oldAvatar, newAvatar)` (`:7246`); `CHARACTER_DUPLICATED({oldAvatar,newAvatar})` (`:6077`).
- `CHAT_DELETED(name)` / `GROUP_CHAT_DELETED(chatId)` carry the chat name — **contradicts our `events.ts:11-12`** typing (no args).
- Opening a group chat from elsewhere: their working sequence is `setActiveGroup` → `select_group_chats(id, true)` → `openGroupChat(id, chat)` (`index.js:1815-1818`); `select_group_chats` is not a declared export but is re-exported (`public/scripts/group-chats.js:106`). Consistent with our gotcha that `openGroupChat` returns silently when the chat is not in `group.chats` (`group-chats.js:2199`).
- `openCharacterChat(file_name)` and `openGroupChat` are on the context (`public/scripts/st-context.js:156-157`).

## Verdict
Relevance **low** (pure chat-list UI, no narrative/LLM/prompt mechanics). The one thing worth taking is not their code but the gap it exposes: a cross-chat **"your playthroughs"** Continue list built on ST's own `/api/chats/recent {metadata:true}`, which also gives us the data to find orphaned per-chat memory-mirror books. Fix our `CHAT_DELETED` payload typing on the way.
