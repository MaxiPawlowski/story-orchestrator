# Plan 06 — Story presence in ST's lists, and the story UI that needs no model

**Status (2026-10-03): v2.7 plan 06 (was old v2.7 04). APPROVED; not built.** Scope: A plays index, B list badges, and
from §C (moved here from `v2.8/04-story-presence-panels.md`, user-approved 2026-10-03): C1 Continue list, C2 story card
on hover, C3 chapter title card, C6 wand-menu entry, C9 (b) the author Activity panel with the production roll store
(author-only), the draggable-panel frame and the per-story toggles. **C4, C5, C7 and C9 (a) public roll chips stay in
v2.8 04.** C8 onboarding is built in v2.7 05. Overview: `00-overview.md`.
**Gate tiers** (v2.7 overview §Gate taxonomy): implementation D; acceptance D. **Model input: none.** Nothing here may
change what is sent to a model; the payload-invariance check proves it (§Gates).

## Problem

- **ST's lists cannot tell a story chat from an ordinary one.**
  - The left-panel group list, the welcome screen's recent chats, and the group's past-chats list all look the same
    whether or not a chat plays one of our stories.
  - A player with several campaigns has to open a chat to find out.
- **The player UI items deferred since v2.4 are still open.** v2.4 rule 7 held back a cross-chat Continue list, a
  wand-menu entry and the rest until a player session ran (`v2.4/00-overview.md:80-82`, `v2.5/00-overview.md:398-399`).
  The user decided them on 2026-10-03 (v2.8 rule 4, v2.7 rule 10).
- **Dice and other background draws are shown nowhere** (user comment, §Review of the answers).

## Host facts (verified 2026-10-03 by reading the source; re-check against the ST in use before building)

| # | Fact | Where |
|---|---|---|
| H1 | The character list is paginated (`Characters_PerPage`, 10–1000). Each page callback empties the list, renders it again and emits `CHARACTER_PAGE_LOADED`, so anything we inject is wiped on every page turn and has to be re-applied on that event | `script.js:993-1067`; bulk-edit uses the same hook, `bulk-edit.js:126` |
| H2 | A group block is a clone of `#group_list_template .group_select` with `data-grid=<id>`, `.ch_name` and an `.avatar` collage. `updateGroupAvatar` replaces only `.avatar`, so the badge goes on `.ch_name` (or the block) | `group-chats.js:800-848`, `index.html:7571` |
| H3 | Group objects carry no chat metadata: the server strips `chat_metadata`/`past_metadata` on create and edit. Reading a non-open chat's `chat_metadata` costs one request per chat file (`withMetadata`) | `src/endpoints/groups.js:18-28,113-154`, `chats.js:459-463,1138-1141` |
| H4 | Welcome-screen recent chats render as `.recentChat.group[data-group]` from `/api/chats/recent` (no metadata by default) | `welcome-screen.js:763`, `templates/welcomePanel.html:49` |
| H5 | `GROUP_UPDATED` fires on edit; `GROUP_CHAT_CREATED` on a new chat | `group-chats.js:319,1777,2003` |
| H6 | ST's extensions wand is `#extensionsMenu`; `stHost/imageSurface.ts` already adds an entry there | `stHost/imageSurface.ts` |

## What we already have

- **`extensionSettings["story-orchestrator"].groupStories`** (`groupId → storyId`), set by hand
  (`components/settings/GroupStoryBinding.tsx`, `runtime/groupStoryBindingHost.ts`) and read by
  `boundStoryForEmptyChat`. It only covers groups someone bound, so it is not evidence that a group plays a story.
- **No chat → story index exists.** `ownedChat` is the loaded chat only.
- **DOM pattern to copy:** `stHost/inlineMount.ts` (idempotent class-keyed nodes, re-sync on host events, `dispose`).
- **Chance seam:** `src/runtime/chance.ts` (`ChanceDrawKind` = `npc | talk`, `:14`; quality rolls in
  `chanceGateValues`, `:31-36`, announce nothing); the only collector is the dev ring (`runtime/spikes/install.ts:66`,
  under `__SO_DEV__`).

## A. Plays index (install-wide)

`extensionSettings["story-orchestrator"].plays`: chat id → `{ storyId, title, groupId, checkpointName, chapterTitle?,
kind, updatedAt }` (`kind` = saga | story, v2.7 05's `storyKind`). Group chats only (v2.7 03): no `characterAvatar`.

- **Written at the persistence boundary we already own** (select, hydrate, restart, each committed boundary), only when a
  field changes; debounced with the other settings writes; never awaited on the reply path.
- **Cleared** on story clear in that chat and on chat delete (the mirror reaper already observes deletes,
  `runtime/mirrorReaperHost.ts`). **Removing a story from the library does not clear rows of chats that still pin it**
  (review F14): the chat plays its pinned copy, so its row stays until the chat is deleted or its story cleared.
- **A hint, never truth.** Nothing in the runtime reads it to decide anything. Opening the chat rewrites its row.
- **Capped** at 500 rows, oldest `updatedAt` dropped.
- **Player copy only.** Checkpoint and chapter **names** the player has reached (decision 2), never ids, gates or
  upcoming anchors. Spoiler-checklist row.
- **Group view, derived:** a group is a story group if any of its chats has a row, or `groupStories` binds it; it shows
  the most recently played story.
- **Backfill, seamless (decision 4):** opening a chat writes its row. On the first load after install or after the
  update that adds the index, **one idle background pass** reads group chats' metadata (`withMetadata`), capped and
  throttled, paused while a generation runs (ST's `document.body.dataset.generating`), resumable, never repeated once
  done. No "Scan my chats" button.

## B. List badges (`stHost/charListBadges.ts`, new)

- **Left list.** On `CHARACTER_PAGE_LOADED`, `GROUP_UPDATED`, `CHAT_CHANGED` and index changes, mark
  `#rm_print_characters_block .group_select[data-grid]`: a Font Awesome `fa-route` on `.ch_name` (H2). **Saga vs act**
  (v2.7 05 decision 3): a saga gets its own icon and colour token; the kind is in `title` and the accessible name.
  Groups only; solo characters are never marked.
- **Welcome screen** recent group chats (`.recentChat.group`), and the group past-chats list, per chat from the index.
- **Idempotent and removable**; `dispose` removes every mark.
- **CSS:** the badge lives outside our mount roots, so it gets one named exception scoped to `.so-story-badge`
  (`styles.css`), and it never touches `.avatar`.
- **Guard:** an `architecture.test.ts` entry so only this module touches the list DOM.
- **Setting:** `display.listBadges` (install-wide, default on).

## C. Story UI built here

| # | Item | Shape | Spoiler risk |
|---|---|---|---|
| C1 | **Continue list** | "Your stories" in the Continue entry point (and optionally on the welcome screen): story, last checkpoint name, last played, one click opens the chat. Reads the index | low: names already seen |
| C2 | **Story card on the group** | hovering (or focusing) the badge shows title, kind, chapter, "last played 2 days ago" | low |
| C3 | **Chapter title card** | a full-width inline card when a chapter opens (inline layer, `components/inline/`, `stHost/inlineMount.ts`), instead of a chip; carries the chapter briefing from v2.7 05 when authored | none: the chapter is entered |
| C6 | **Wand-menu entry** | "Story" in `#extensionsMenu` (H6): recap, briefing, flag (Journal joins in v2.8 04) | none |
| C9 (b) | **Author Activity panel + roll store** | §C9 below | author-only |

In v2.8 04: C4 quest log / Journal, C5 "What could I do?" (a model call, CL), C7 stat sheet, C9 (a) public roll chips.
Not proposed: anything that posts into the chat array, and steering controls in player mode (two-personas rule).

## Panel frame (built here; v2.8 04's panels reuse it)

- **Movable, resizable panels** for the v2.7 01 Help panel and the Activity panel now; v2.8 04 adds C4, C5, C7.
  Briefings and confirmations stay modal (native `<dialog>`, gotchas).
- Each panel is its own root in the CSS scope list (`styles.css`) and in `.storybook/preview.ts` `mountRootFor`.
- Position and size persist per install (`extensionSettings["story-orchestrator"].panels[id] = {x, y, w, h}`), clamped
  to the viewport on load and on resize; under 768 px a panel docks full-width instead of floating.
- Keyboard: focusable title bar, arrow keys move when the bar is focused, Escape closes, no focus trap (not modal).

## Per-story toggles

- Story `display` block, authored in the Studio Story tab. v2.7 keys: `{ continueList?, groupCard?, chapterCard?,
  wand?, rollChips? }`, each boolean. v2.8 04 adds `journal`, `suggestions`, `statSheet`.
- Install-wide defaults in `display.*` settings (all on).
- **Precedence:** the story's value wins when present; otherwise the install default. A player can always turn an item
  off install-wide: a story can switch an item off, never force one on against the player's off.
- C1 and C2 read the index, so their story toggle applies only to that story's rows.

## C9 (b) "Behind the scenes" for authors (review F21)

**Roll provenance in production.**
- **Quality rolls are reconstructed, not recorded.** A roll is a pure function of (chat, story,
  `checkpointStartedBoundary`, key) and the quality's `roll {sides, target}`. The snapshot builder recomputes, for the
  active checkpoint's rolled qualities, `{key, sides, target, drawn, outcome, boundary}`, anchored at the message that
  boundary committed. Reopen, rollback and swipe need no store: the inputs already roll back.
- **NPC reply and talk draws are recorded** in a production ring `extras.chance.draws` (cap 100, no text), written
  through `onChanceDraw` with the message id and rolled back by message like `extras.lore.fired`; sanitized in
  `runtime/extras.ts`. The dev ring stays dev-only.
- v2.8 18 Q3 adds `modifier` and `narrate` to the same record shape; v2.8 04 shows public chips from it.

**Who sees what (v2.7).**
- **Author view only:** roll chips at inline level ≥ 2 and the Activity panel. Every chip is filtered on `authorView`,
  **not** on level, because `PLAYER_LEVEL_CAP` = 2 (`src/runtime/settingsModel.ts:37`) lets players reach L2.
- Player mode shows no roll anything in v2.7.

**Activity panel (author only).** A live feed of what the machine did this turn, composed from existing rings plus the
draws ring: boundary logs, extraction audits, judge calls, talk decisions, curator proposals, lore fired, draws, check
findings (v2.7 04), expansions. Each row links to its message. Listed in `PLAYER_FORBIDDEN_SELECTORS`.

## Gates (tier D)

- **Pure (jest):** index writes, caps, F14 (library removal keeps a pinned chat's row), backfill pass (throttle, pause on
  generating, resume); Continue list from the index; toggle precedence; roll reconstruction ≡ the seeded value under
  rollback, swipe, reopen, and with two group replies inside one checkpoint; **rollback ≡ replay for the draws ring**
  (property test over seeds × cuts, the `rollbackReplay.property.test.ts` shape, with a no-rollback negative control);
  badge module over a fake list DOM (page turn re-applies, `dispose` removes all).
- **Storybook (interaction + a11y, 390/768/1440):** badge + hover card (saga and story), Continue list, chapter card
  (with and without a briefing), wand entries, panel frame (move, resize, dock under 768 px, Escape), Activity panel,
  author roll chip.
- **Spoiler:** checklist rows for the index, badge title, hover card, each C-item; `so-ui.mts assert-player-clean`
  sweeps C1–C3, C6, the badge titles and an author roll chip at player L2 (must be absent), and the Activity panel
  selector.
- **Payload invariance:** a dry-run capture of a scripted group turn is byte-identical with every v2.7 06 item on and
  off.
- **Live (D), ×2:** a lane with two group chats in two stories (one saga, one act): page a 10-per-page list across two
  pages, the badges follow and none leak onto unrelated entries; Continue lists both; a deleted library story keeps its
  row while a chat pins it; a deleted chat drops its row; a seeded chapter entry shows the chapter card; the wand entry
  opens each target; per-story off hides the item; panel position survives a reload.
- Registry entries + Help for each item (rule 9). `npm run gates`.

## Unresolved questions

1. Badge on solo characters too, or groups only? Do we support solo chats on this plugin? thought we only supported groupchats. Should we support solo? i think it goes against many of this plugin'ss mechanics. Wdyt?
2. Is the plays index allowed to hold the checkpoint name, or only the story title (safer, less useful)? sure
3. Which C-items to build: wait for the playtest, or pick now? C1 and C3 are cheap; C5 costs a model call per use. I loved those recommendations, lets build them All, the 8. Make them draggable windowss whenever it makes sense. Activables on the plugin per story config.
4. Should "Scan my chats" exist at all, or is backfill-on-open enough? whatever's seamless with the player experience



User comment:
do we have some infomration about the kind of background processses that are happening from behind? like the dice? should we? have you planned some UI for authors too?

## Review of the answers (2026-10-03)

- **1. Solo chats:** stories run in **group chats only** (v2.7 03). Badges mark groups only.
- **2.** The plays index may hold the checkpoint name (player copy, names already reached).
- **3. Build all eight C-items**, draggable where it makes sense, each switchable per story. Split by version: C1, C2,
  C3, C6, C9 (b), the panel frame and the toggles here; C4, C5, C7, C9 (a) in v2.8 04 (C4/C7/C9 (a) need v2.8 18; C5
  calls a model); C8 in v2.7 05.
- **4. Seamless backfill:** no button; opening a chat writes its row; one idle background pass after install or update
  (§A).
- **The comment (dice, author UI):** dice are not shown anywhere today (dev ring only). Answer: C9. Authors get roll
  chips and the Activity panel here; players get roll chips only for rolls a story marks public (v2.8 04 + v2.8 18 Q3).
  The rest of the author UI planned: v2.7 01 Help author topics, v2.7 04 author findings, v2.8 12 shadow record, v2.8 22
  director suggestions, v2.8 08 overlay source.

## Links

v2.7 05 (briefing, chapter briefings, C8, `storyKind`), v2.7 04 (check findings in Activity), v2.7 03 (groups only),
v2.7 01 (Help panel moves into the frame; registry), v2.7 07 A6 (badge check on the campaign), v2.8 04 (C4, C5, C7,
C9 (a)), v2.8 18 (Journal, `display.public`, public rolls), v2.9 03 (new game plus in the Continue list).

## Review 2026-10-03

Applied: the user-approved move (C1, C2, C3, C6, C9 (b), panel frame, toggles from v2.8 04), F12 (body and gates cover
every item built here; idle backfill specified), F14 (library removal keeps pinned chats' rows), F21 (production roll
provenance; Author-view guard, not level), A2 (build split: index, badges and independent UI here; the rest after
v2.8 18), A9 (no playtest prerequisite; C8 in v2.7 05), F08 + v2.7 03 (no solo marks, no `characterAvatar`), B10
(registry gate), B12 (references).
