# Plan 04 — Story presence in ST's lists, and the player UI we still owe

**Status: DRAFT 2026-10-03 (topic from the user). Not approved, not built.** Overview: `00-overview.md`.

## Problem

- **ST's lists cannot tell a story chat from an ordinary one.**
  - The left-panel character/group list, the welcome screen's recent chats, and the group's past-chats list all look the
    same whether or not a chat plays one of our stories.
  - A player with several campaigns has to open a chat to find out.
- **The player UI items deferred since v2.4 are still open.** v2.4 rule 7 held back an options menu, visible
  qualities, a cross-chat Continue list, a wand-menu entry and the objective echo until a player session ran
  (`v2.4/00-overview.md:80-82`, `v2.5/00-overview.md:398-399`). The v2.6 playtest is that session.

## Host facts (verified 2026-10-03 by reading the source; re-check against the ST in use before building)

| # | Fact | Where |
|---|---|---|
| H1 | The character list is paginated (`Characters_PerPage`, 10–1000). Each page callback empties the list, renders it again and emits `CHARACTER_PAGE_LOADED`, so anything we inject is wiped on every page turn and has to be re-applied on that event | `script.js:993-1067`; bulk-edit uses the same hook, `bulk-edit.js:126` |
| H2 | A group block is a clone of `#group_list_template .group_select` with `data-grid=<id>`, `.ch_name` and an `.avatar` collage. `updateGroupAvatar` replaces only `.avatar`, so the badge goes on `.ch_name` (or the block) | `group-chats.js:800-848`, `index.html:7571` |
| H3 | Group objects carry no chat metadata: the server strips `chat_metadata`/`past_metadata` on create and edit. Reading a non-open chat's `chat_metadata` costs one request per chat file (`withMetadata`) | `src/endpoints/groups.js:18-28,113-154`, `chats.js:459-463,1138-1141` |
| H4 | Welcome-screen recent chats render as `.recentChat.group[data-group]` from `/api/chats/recent` (no metadata by default) | `welcome-screen.js:763`, `templates/welcomePanel.html:49` |
| H5 | `GROUP_UPDATED` fires on edit; `GROUP_CHAT_CREATED` on a new chat | `group-chats.js:319,1777,2003` |

## What we already have

- **`extensionSettings["story-orchestrator"].groupStories`** (`groupId → storyId`). The settings panel sets it by hand
  (`components/settings/GroupStoryBinding.tsx`, `runtime/groupStoryBindingHost.ts`), and `boundStoryForEmptyChat`
  reads it. It only covers groups someone bound, so it is not evidence that a group plays a story.
- **No chat → story index exists.** `ownedChat` is the loaded chat only. The mirror book name
  (`Story Orchestrator - <title> - <chatId>`) is a heuristic that needs the whole lorebook list. Not used.
- **DOM pattern to copy:** `stHost/inlineMount.ts` (idempotent class-keyed nodes, re-sync on host events, `dispose`).

## Design

### A. Plays index (new, install-wide)

`extensionSettings["story-orchestrator"].plays`: a map from chat id to
`{ storyId, title, groupId?, characterAvatar?, checkpointName, chapterTitle?, updatedAt }`.

- **Written at the persistence boundary we already own.** On select, hydrate, restart and each committed boundary,
  only when a field changes. It is debounced with the other settings writes and never awaited on the reply path.
- **Cleared** on story clear, on chat delete (the mirror reaper already observes deletes, `runtime/mirrorReaperHost.ts`)
  and when a library story is removed.
- **A hint, never truth.** Nothing in the runtime reads it to decide anything. A stale row can only mislabel a list entry,
  and opening the chat corrects it (the open chat's `chat_metadata` wins and rewrites the row).
- **Capped** (e.g. 500 rows, oldest `updatedAt` dropped).
- **A player-visible copy, so player copy only.** It holds checkpoint and chapter **names** that the player has already
  seen, never ids, gates or upcoming anchors. It joins the spoiler checklist.
- **Group-level view, derived:** a group is a "story group" if any of its chats has a row, or if `groupStories` binds it.
  It shows the most recently played story.
- **Backfill:** opening a chat writes its row. An optional one-shot "Scan my chats" button reads `withMetadata` per chat
  file and is the only bulk read. Never automatic.

### B. List badges (`stHost/charListBadges.ts`, new)

- **Left list.** On `CHARACTER_PAGE_LOADED`, `GROUP_UPDATED`, `CHAT_CHANGED` and index changes, mark
  `#rm_print_characters_block .group_select[data-grid]`: a Font Awesome `fa-route` (the drawer's icon) on `.ch_name`,
  `title` = story title and the last checkpoint name. Solo characters get the same mark on `.character_select` from the
  `characterAvatar` rows.
- **Welcome screen** recent chats (`.recentChat`), per chat from the index.
- **Group past-chats list** and the group panel's chat list, per chat.
- **Idempotent and removable.** Re-applying is a no-op, and `dispose` removes every mark.
- **CSS:** the badge lives outside our mount roots, so it gets one rule of its own, scoped to `.so-story-badge`
  (`styles.css` currently scopes everything to the five roots; add this as a deliberate, named exception), and it must not
  touch `.avatar` (H2).
- **Guard:** an `architecture.test.ts` entry so only this module touches the list DOM, like the message-DOM list.
- **Setting:** `display.listBadges` (install-wide, default on).

### C. Player UI candidates (rule 7: each needs the playtest to ask for it; ranked by what the index unlocks cheaply)

| # | Item | Shape | Spoiler risk |
|---|---|---|---|
| C1 | **Continue list** | "Your stories" in the Continue entry point and optionally on the welcome screen: story, last checkpoint name, last played, one click opens the chat. Reads the plays index | low: names already seen |
| C2 | **Story card on the group** | hovering the badge shows title, chapter, "last played 2 days ago" | low |
| C3 | **Chapter title card** | a full-width inline card when a chapter opens (inline layer exists, `components/inline/`), instead of a chip | none: chapter is entered |
| C4 | **Quest log / objectives tab** | see plan 19 | gated by plan 19 |
| C5 | **"What could I do?" options** | 3–4 suggestions in the drawer/HUD that **fill the input box and never send** (CYOA/Roadway idea, `v2.4/extension-research/SUMMARY.md` §9). Off-path call on the memory profile, on demand only, agency policy in the prompt (suggest, never decide) | medium: a suggestion can hint at a gated route; prompt sees only player-safe state |
| C6 | **Wand-menu entry** | "Story" in ST's extensions wand: recap, quest log, flag | none |
| C7 | **Visible qualities / stat sheet** | see plan 19 (`display.public` per quality) | gated by plan 19 |
| C8 | **First-run onboarding** | one dismissible card in the drawer the first time a story starts: what the HUD, chips and Memory tab are | none |

Not proposed: anything that posts into the chat array (Roadway's `is_system` cards and CYOA's fake user message are
on the research doc's rejected list), and steering controls in player mode (two-personas rule).

## Gates

- `npm run gates` (pure index module + badge module tests with a fake list DOM; Storybook for C-items).
- Live: page through a 10-per-page list across two pages, open/close chats, delete a chat. The badges follow and none
  leak onto unrelated entries. Run `so-ui assert-player-clean` with the badge title included in its sweep.
- Spoiler checklist rows for the plays index, the badge title and every C-item built.

## Unresolved questions

1. Badge on solo characters too, or groups only? Do we support solo chats on this plugin? thought we only supported groupchats. Should we support solo? i think it goes against many of this plugin'ss mechanics. Wdyt?
2. Is the plays index allowed to hold the checkpoint name, or only the story title (safer, less useful)? sure
3. Which C-items to build: wait for the playtest, or pick now? C1 and C3 are cheap; C5 costs a model call per use. I loved those recommendations, lets build them All, the 8. Make them draggable windowss whenever it makes sense. Activables on the plugin per story config.
4. Should "Scan my chats" exist at all, or is backfill-on-open enough? whatever's seamless with the player experience



User comment:
do we have some infomration about the kind of background processses that are happening from behind? like the dice? should we? have you planned some UI for authors too?