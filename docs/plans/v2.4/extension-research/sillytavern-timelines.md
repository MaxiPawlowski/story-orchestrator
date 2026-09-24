# SillyTavern Timelines — v2.4 review

Aero / city-unit (later maintained under SillyTavern org, Technologicat) · https://github.com/city-unit/SillyTavern-Timelines · `03f7434` 2024-06-24 · 96 upvotes / 230 msgs · source available: **y** (paths below relative to `C:/dev/st-extensions-research/sillytavern-timelines/source/`)

## What it is
Loom-style graph view of every chat file of the current character or group. Messages at the same depth with identical text merge into one node, so branches and checkpoints show as a DAG (cytoscape + dagre). You can navigate to any message or swipe in any chat file, branch from any node (ST `createBranch`), and search with AND-fragment "swoop". Read-only over chat content. Its only writes are a swipe switch and branch creation. No LLM calls, no prompt injection.

## How it works
- **Entry/UI**: `index.js:1638-1644` appends `timeline.html` to `#timelines_container ?? #extensions_settings`. It registers `/tl` (`/tl r` = reload) via the legacy `registerSlashCommand` (`index.js:1644`). The modal is a plain div moved onto `document.body` (`tl_utils.js:188-224`), not a `<dialog>`.
- **Data fetch** (on open, cached by `characterId`, `index.js:1487-1532`):
  - Solo chats: `POST /api/characters/chats {avatar_url}` lists the chats (`tl_node_data.js:426-436`). Then `POST /api/chats/get {ch_name,file_name,avatar_url}` runs per file, and the first line (the metadata header) is shifted off (`tl_node_data.js:456-483`).
  - Groups: `context.groups.find(id).chats`, then `POST /api/chats/group/get {id}` (`index.js:1493-1502`, `tl_node_data.js:458-460`).
  - Every chat file is refetched in full, with no incremental path.
- **Graph build** (`tl_node_data.js:14-191`):
  - Chats are transposed by message index. Messages at each depth are grouped by exact text after CRLF→LF (`:300-316`).
  - Each group becomes one node. Edges go from each file's previous node, so the graph is always acyclic because merging happens only at equal depth.
  - Swipes are deduped per parent and stored on the parent, to be revealed on long-press (`:101-157`).
  - A checkpoint is a message with `extra.bookmark_link` (or a legacy system-message anchor), and a dead link is dropped when `${name}.jsonl` is not in the list (`:214-260`).
  - The checkpoint colour comes from a seeded hash (cyrb128 → sfc32) of the text (`:359-415`).
- **Invalidation**: `lastContext = null` on `CHARACTER_MESSAGE_RENDERED`, `USER_MESSAGE_RENDERED`, `CHAT_DELETED`, `MESSAGE_SWIPED` and **`event_types.CHATLOADED`**. That last constant does not exist (ST has `CHAT_LOADED`, `events.js:21`), so it subscribes to `undefined` (`index.js:1451-1455`, the author's own TODO says so).
- **Navigation** (`tl_utils.js:36-129`):
  - `openCharacterChat(name)` is imported straight from `script.js`, with no group path (TODO at `:47`).
  - It then loops un-hiding `.mes` / clicking `#show_more_messages` until `div[mesid=N]` is visible, and scrolls.
  - Branch: `createBranch(mesId)` from `bookmarks.js`, then `openCharacterChat(branch)`.
  - A swipe on a non-last message force-creates a branch (`:100-116`).
- **Swipe switch** (`tl_utils.js:242-292`):
  - Mutates `chat[last]` directly: `swipe_id`, `mes`, `send_date` and a deep-copied `extra`, dropping `extra.memory`/`display_text`.
  - Re-renders with `addOneMessage(..., {type:'swipe'})` and **emits `MESSAGE_SWIPED` itself**.
  - Then runs a debounced `saveChat`.
- **Persistence**: `extension_settings.timeline` (layout/theme/zoom), defaults merged key-by-key (`index.js:110-160`), `saveSettingsDebounced`. Nothing is kept per chat, and no `chat_metadata` is used.
- **Mutation handling**: none beyond invalidating its cache. It is a viewer.

## Overlap with Story Orchestrator
- The graph tech is the same: we ship cytoscape + dagre (`package.json:6-7`) in `src/components/studio/GraphPanel.tsx` and use it only in the Studio (`src/studio/components/StudioGraph.tsx`). Nothing shows the *played* path on it.
- Swipe/edit/delete: we do far more. `TurnBridge` rollback (`src/runtime/turnBridge.ts:54`), and rollback ≡ replay across the stores. Timelines only refreshes.
- Chat-file enumeration: we read only the open chat's server copy for save evidence (`src/services/stHost/persistence.ts:115`). We never enumerate a character's chats, so we are **blind to ST branches/checkpoints** (grep `main_chat|bookmark|branch` in `src/`: only a comment at `src/runtime/memoryMirror.ts:65`).
- Search: our Memory find is a single lowercase substring (`src/components/drawer/DrawerTabs.tsx:178-181`). Theirs is an AND-fragment search (`tl_graph.js:74-81`, `:107-130`).
- Jump to message: we have none (no `mesid`/`chat-jump` in `src/`). Provenance and conflict rows cite a message id without a way to open it.

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | Branch-aware hydrate: detect an ST branch/checkpoint and rewind the inherited state to the branch point | host-integration | engine/persistence | absent | 5 | M |
| 2 | Unbind the parent's memory-mirror book in an un-adopted branch (active cross-chat memory leak) | enhancement | memory | absent | 4 | S |
| 3 | Journey: branch mid-story (`/branch-create`, `/checkpoint-create`), assert no leak + correct rewind | testing | harness | absent | 4 | S |
| 4 | "Show message": jump from memory/conflict/warden/journal rows to the source message via `/chat-jump` | ux | player-ui | absent | 3 | S |
| 5 | "Replay from here": branch at a past checkpoint's start message and continue the story from that boundary | new-feature | player-ui/engine | absent | 3 | M |
| 6 | Swoop (AND-fragment) matching for Memory find | ux | player-ui | partial | 2 | S |
| 7 | Refuse unknown event keys instead of subscribing to the literal string | host-integration | host | partial | 2 | S |

**1. Branch-aware hydrate.**
- **What ST does**: ST's branch (`createBranch`, `bookmarks.js:187-243`, used by Timelines `tl_utils.js:92`) and checkpoint (`createNewBookmark`, `bookmarks.js:255-298`) save the new file with `{ ...chat_metadata, ...{main_chat, integrity} }` (`script.js:7406`; groups: `group-chats.js:2370`). So **the branch carries our `story_orchestrator` blob, stamped for the parent**, plus `main_chat`.
- **Our current behaviour**:
  - We read that blob as foreign ("No story selected… stamped for another chat", `src/runtime/persistence.ts:59-70`, `src/runtime/storySelection.ts:40-46`), so the branch silently has no story.
  - If the player then selects the story, `adoptChatState` (`persistence.ts:87`) hydrates the **parent's latest engine state**: boundaries, memory and blackboard for messages the branch no longer contains.
  - `loadStory` has no "state ahead of chat" check (`src/runtime/runtimeManager.ts:539-541`; `engine.hydrate` only repairs the active checkpoint, `src/engine/engine.ts:140-148`).
- **Fix**: when `chat_metadata.main_chat` is set and the stamp mismatches, offer "Continue this branch". It adopts, then runs `runRollback(chat.length)` (`src/runtime/rollback.ts:35`), which already covers engine/memory/stagecraft/effects and the horizon notice.
- **Invariants**:
  - Fits 11 (rollback ≡ replay does the work).
  - Needs a new `stHost` read of `main_chat` plus a hostTypes row (inv. 2).
  - No blob bump (inv. 13).
  - Also corrects a wrong doc claim: `docs/plans/v2.3/03-async-ownership.md:2715` says "a branch does NOT copy our blob, `bookmarks.js:201`". Line 201 builds only the *override* object, and `saveChat` spreads the full `chat_metadata` under it.

**2. Mirror-book leak.**
- **The leak**:
  - The branch also inherits `chat_metadata.world_info` (`world-info.js:94` `METADATA_KEY = 'world_info'`), which is the parent's per-chat mirror book.
  - Until the player adopts, SO in the branch reads "no story", but ST keeps firing the parent's `so_` entries (relationships and scene summaries, `memoryMirror.ts:51-52`), including ones from after the branch point.
  - The parent keeps writing to that same book as it continues.
- **What it breaks**: this contradicts `memoryMirror.ts:46-47` ("another chat of the same story cannot fire them").
- **What already works**: adoption rebinds correctly (`memoryMirror.ts:82-88`, `bindChatLorebook(..., [book.name])`, `src/services/stHost/worldInfo.ts:151-159`).
- **The gap**: the un-adopted branch. Fix on load: if the slot holds a `Story Orchestrator - … - <otherChatId>` name while the blob is foreign, unbind it (or rebind a fresh book on adopt). Reuse the mirror name parser from harness cleanup.

**3. Testing.** ST ships `/branch-create` (`bookmarks.js:495`) and `/checkpoint-create` (`:524`), both scriptable from `so-scenario`. Two journey checks, following the "run twice" and "assert the property" rules:
- Play to cp2, branch at a message before the cp1→cp2 transition, open the branch. Assert no SO injection and no parent mirror entries in the captured prompt.
- Adopt, then assert active checkpoint = cp1 and memory rows past the branch point are gone.

**4. Show message.**
- **Their approach**: `navigateToMessage` (`tl_utils.js:66-89`) un-hides and loads messages until `mesid` is rendered.
- **ST now does this natively**: `/chat-jump N` (`slash-commands.js:3449-3485`) loads earlier messages, scrolls and flash-highlights.
- **Our side**: provenance `messageId` is on every row (`src/memory/provenance.ts`), and the conflict queue and warden cite it. A button calling `/chat-jump` through the existing slash seam is S effort and player-safe, because it prints no ids or checkpoint internals. Hide it for `messageId < 0` (legacy).

**5. Replay from here.**
- **The idea**: the Loom idea mapped onto our spine. In the Overview's past-checkpoint list, "Replay from <name>" calls `createBranch(checkpointStartedMessageId)` / `/branch-create`, opens the branch, and runs the idea-1 rewind. This gives save-slot semantics without our own snapshot store.
- **Depends on 1.**
- **Player-safe**: past checkpoints only (inv. 9).
- **The engine already has what it needs**: the boundary log records `lastMessageId` per boundary (`src/engine/engine.ts`).
- **Risk**: a group branch uses `saveGroupBookmarkChat` and `openGroupChat` (`bookmarks.js:470-473`). Pin the group per the gotchas.

**6. Swoop.** Split the query on whitespace and require every fragment in `text + characterId`. It is a pure 3-line change at `DrawerTabs.tsx:181` plus a story case. Low value, since only the ≥50-row list is searchable.

**7. Event-key typo.**
- **Their bug**: `index.js:1454` subscribes to `event_types.CHATLOADED`, which is `undefined`, so the listener never fires and nothing reports it.
- **Our exposure**: `resolveEventName` falls back to the raw key (`src/services/stHost/events.ts:50-51`), so an unknown key subscribes to a never-emitted string, equally silently. The `HostEventName` union covers typed call sites, but the signature accepts `string`.
- **Fix**: warn, or refuse and report `absent`, when the key is not in `eventTypes`.

## Patterns to copy / anti-patterns to avoid
- **Copy**:
  - Dead-link tolerance: verify a referenced chat exists before trusting a link (`tl_node_data.js:255-260`), the same "existence from the list, not the read" rule as our `world_names`.
  - Merge-only-at-equal-depth keeps a text-dedup graph acyclic (`tl_node_data.js:90-93`). Useful if we ever graph runs across chats.
  - Deterministic seeded colour per name (`tl_node_data.js:404-415`) for stable checkpoint colours in the Studio graph.
- **Avoid**:
  - Importing `script.js`/`bookmarks.js` internals directly. ST keeps `createBranch` alive only for this extension ("Export is used by Timelines extension. Do not remove.", `bookmarks.js:186`); use the slash commands through our seam.
  - Mutating `chat[last]` and emitting `MESSAGE_SWIPED` yourself (`tl_utils.js:263-291`). Also note that other extensions DO emit host events, so our `TurnBridge` must keep treating event args defensively (`hostMessageId`).
  - Refetching every chat file in full on each open (`tl_node_data.js:456-483`).
  - Caching keyed on `characterId` only (`index.js:1489`).
  - A modal made from a moved div rather than `<dialog>` (the mobile issues the author mentions in `post.md` follow-ups).

## ST host facts learned
- A branch or checkpoint file's metadata is `{...chat_metadata, main_chat, integrity}`. **Every extension's chat-metadata keys are copied into the branch**, ours and the chat lorebook slot included (`script.js:7406`, `group-chats.js:2370`, `bookmarks.js:201,284`). **Contradicts** `docs/plans/v2.3/03-async-ownership.md:2715` ("a branch does NOT copy our blob").
- `createBranch(mesId, {swipeId})` slices the chat to `mesId`, saves under `"<main> - Branch #N"`, and appends the name to `chat[mesId].extra.branches` without saving the parent (`bookmarks.js:187-243`). A checkpoint writes `extra.bookmark_link` on the source message and saves it (`bookmarks.js:293-298`). Overwriting a checkpoint severs the old link but keeps the file (README §Checkpoints).
- `/api/characters/chats {avatar_url}` lists a character's chat files. `/api/chats/get` returns the file with the metadata header as element 0. `/api/chats/group/get {id}` returns messages only (`tl_node_data.js:426-483`).
- The group's chat list is `context.groups[i].chats` (`index.js:1496-1500`).
- `event_types.CHATLOADED` does not exist; it is `CHAT_LOADED` (`events.js:21`; their `index.js:1454`).
- Third-party code emits `MESSAGE_SWIPED(lastMessageId)` after mutating the message itself (`tl_utils.js:290`).
- Message DOM is `#chat .mes[mesid=N]`, and lazy-loaded history needs `#show_more_messages` or `showMoreMessages` (`tl_utils.js:68-89`). `/chat-jump` wraps this (`slash-commands.js:3461-3466`).

## Verdict
Relevance **medium**, which is unexpected for a pure viewer. The thing worth taking is not the graph. It is the host fact the graph exposed: **ST branches and checkpoints copy our chat-metadata blob and our mirror-book binding into the new chat**. Today that gives an un-adopted branch the parent's live memory lorebook, and an adopted branch the parent's future state. Idea 1 (+2, tested by 3) is a correctness fix built on existing rollback. "Replay from here" (5) is the feature it unlocks.
