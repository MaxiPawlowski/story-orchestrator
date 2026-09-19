---
name: st-lorebook-authoring
description: >
  Author, create and debug SillyTavern World Info / lorebooks: entry anatomy (keys, regex keys,
  optional filter logic, position/depth/role/order), activation (constant, scan depth, recursion,
  probability, inclusion groups, sticky/cooldown/delay, budget), the importable lorebook JSON, and
  creating or activating books via UI, slash commands, JS or our stHost/worldInfo.ts. Use when writing
  a test lorebook for a live run, a story's checkpoint lorebook or `world_info` effects, the wizard's
  upsertLorebookEntry or curator prompts, or when an entry "doesn't fire" or "fires without its keyword".
---

# Lorebook authoring (World Info)

This skill is the practical layer on top of the official doc, `.claude/sillytavern-docs/worldinfo.md`.
Read that doc for feature definitions. This skill adds source-verified behaviour, decision rules and
checklists, community practice, and our code's hooks. ST paths are under `C:\dev\SillyTavern-MainBranch\`.
`world-info.js` means `public/scripts/world-info.js`.

## Mental model

- An entry is text plus the rules for when and where to insert it. **Only `content` reaches the
  model.** Keys, the title (`comment`) and settings never do, so the content must name its subject
  and stand alone.
- Every generation scans the active books. Each entry passes a gate (disabled, trigger type, character
  filter, timed effects, recursion flags), then activates (decorator, forced, constant, sticky, or key
  match), then survives inclusion groups, then the probability roll, then the budget. It's then placed
  by `position` (plus `depth` and `role` for @D) and ordered within its slot by `order`.
  activation-internals.md walks through this.
- Four sources are scanned together: **global** books (selected in the World Info drawer or with
  `/world`), the **character's** books (primary and extra), the **chat's** bound book, and the
  **persona's** book. The chat book has the highest budget priority, then the persona book, then
  character or global by strategy (default: character first).
- A constant entry costs the same as a card field: permanent tokens every turn. Per the guide author,
  what matters is **the depth the text lands at**, not which box it was written in.

## Facts the official doc gets wrong or omits

These come from the source. The ones marked (dry run) were also checked live in a non-persistent
dry-run scan on 2026-09-18.

1. **Constant entries skip every key check, including secondary keys.** `constant` plus a NOT_ANY
   filter still fires (`world-info.js:4893-4897`, dry run).
2. **Scan depth 0 matches nothing.** That applies to recursion text and the Author's Note too, not
   just chat. Only constant, sticky, `@@activate` and force-activated entries survive
   (`world-info.js:280-283`, dry run).
3. **Fresh-install defaults** are recursion **on**, whole words **on**, and insertion strategy
   **Character Lore First** (`default/content/settings.json:14-22`). The official doc calls Sorted
   Evenly the default. This install currently has **recursion off and whole words off**, so read
   `getWorldInfoSettings()` before relying on either.
4. **Budget priority isn't "constants first".** It's sticky, then source (chat, then persona, then
   character/global), then higher `order` (`world-info.js:4625`, `4995-5003`).
5. **`role`: 0 = system, 1 = user, 2 = assistant** (`index.html:7192-7200`). The Seamless Image Gen
   guide calls 1 "assistant". It's wrong.
6. **Whole words**: a multi-word key is a plain substring match. A single-word key uses an ASCII `\W`
   boundary, so accented letters count as boundaries: `caf` matches "café" (`world-info.js:347-360`,
   dry run).
7. **Regex keys** (`/pattern/flags`) ignore the case and whole-words settings, so add `i` yourself. An
   unescaped `/` inside the pattern silently turns the key into plaintext (`world-info.js:338-342`,
   `2901-2926`, dry run).
8. **Undocumented features**: position `7` = Outlet (the text appears only where `{{outlet::name}}` is
   written); `ignoreBudget`; the content decorators `@@activate` and `@@dont_activate`
   (`world-info.js:855-864`, `4875-4884`, `5017-5026`).
9. **Hand-written JSON isn't backfilled at scan time.** A missing `position` means the entry activates
   but is inserted nowhere. A missing `selective` means the optional filter is ignored
   (`world-info.js:2104-2124`, `5212-5261`, dry run). Write every field; start from the template.
10. **Macros resolve in keys and in content** (`world-info.js:4915`, `5058`). `{{char}}`,
    `{{getvar::x}}` and our `{{story_*}}` macros all work. A key that resolves to empty never matches.
11. **Author's Note positions (↑AN/↓AN)** are inserted only on turns where the Author's Note itself is
    inserted, so an interval above 1 skips them (`authors-note.js:351-362`, `world-info.js:5268`).
12. **Timed effects are matched by a hash of the whole entry.** Any edit or toggle of an entry clears
    its running sticky or cooldown (`world-info.js:624`, `4631-4633`).

## Workflow: writing an entry

1. **Title (`comment`)**: unique within the book and stable. Our code finds entries by title (see
   Project hooks). Set `addMemo: true`.
2. **Trigger.** Choose one:
   - Always relevant: `constant: true`. Keep it short.
   - Relevant when something is mentioned: keys. Lowercase them. Include plurals, inflections,
     synonyms and nicknames. Use `/regex/i` for patterns. Remember the default scan depth is **2
     messages**.
   - Relevant in one story phase: `constant: true` plus `disable: true`, switched on and off by the
     story's `world_info` effect (patterns.md §3).
   - Relevant only for some characters or generation types: `characterFilter` (uses avatar file names
     and tag ids) or `triggers` (for example `["quiet"]`).
   - Occasional flavour: `probability`, with a `group` if variants should exclude each other.
   - Cadence: `sticky`, `cooldown` and `delay`, counted in messages.
3. **Placement.** Choose one:
   - Background facts: ↓Char `1` (or ↑Char `0`).
   - Steering, rules or the current scene state: @D `4` at depth 0–4 with role `0` (system). Lower
     depth is stronger. Use @D0 when something later in the prompt would override the entry
     (community-reported, 2024-09 to 2026-01).
   - Example-dialogue material: ↑EM `5` / ↓EM `6`.
   - A slot a template controls: Outlet `7` plus `{{outlet::name}}`.
   - Avoid ↑AN/↓AN unless the Author's Note is on with interval 1.
4. **Order.** A higher number is placed later in its slot and wins budget ties. In practice, 1 is the
   top and larger numbers go toward the bottom (`world-info.js:88`, `5203`, dry run).
5. **Recursion.** Mention other entries' keys in the content to chain lore. Use `preventRecursion` on
   instruction entries and `excludeRecursion` on entries that must fire only from chat.
6. **Content.** One subject per entry, self-contained and concise. The official doc recommends
   PList-style content; LoreList is a community alternative (patterns.md §10).

## Checklist before handing off a lorebook

- [ ] The book is **active** where it's needed. `requirements.lorebooks` accepts only **globally
      selected** books (`src/runtime/requirements.ts:16-20`).
- [ ] Every entry has every template field, a unique non-empty `comment`, an explicit `position`, and
      an object key equal to `String(uid)`.
- [ ] Keys cover the forms that will actually appear in the last `scanDepth` messages. Regex keys
      have their flags. No key is so common that it fires all the time, and none is a participant's
      name unless intended (Include Names prefixes each message with the name).
- [ ] Constant entries are short, and total constant text fits comfortably inside Context % (default
      25% of the max context).
- [ ] Checkpoint-gated entries ship `disable: true`, and the story disables the previous phase's
      entries.
- [ ] Verified by evidence: `st-actions.mts wi-status`, a dry-run scan, or `st-payload.mts` after a
      real generation (troubleshooting.md).
- [ ] Test books carry a marker prefix and are removed with `so-assets.mts remove --marker <prefix>`.

## Creating and activating

Details: scripting-and-api.md.

- **UI**: open the World Info drawer, click **New World**, add entries with **+**, then pick the book in
  the global selector. Import takes the book name from the **file name**.
- **Slash**: `/getchatbook name=X` (creates and binds), `/createentry file=X key="k" content`,
  `/setentryfield file=X uid=0 field=position 1`, `/world state=on silent=true X`,
  `/getglobalbooks`, and `/wi-set-timed-effect` / `/wi-get-timed-effect`.
- **JS / host quirks, each of which has cost us a debugging session:**
  - `loadWorldInfo(missing)` returns `{entries:{}}`, never null. Check existence with
    `getWorldInfoNames()`.
  - `createNewWorldInfo` doesn't activate the book.
  - Read `selected_world_info`, never `world_info.globalSelect`, which is a debounced mirror.
  - Raw `/api/worldinfo/delete` leaves the name selected and the client cache stale. In-page
    `deleteWorldInfo` cleans up both.
  - `saveWorldInfo` to an unknown name creates the file but doesn't refresh `world_names`.

## Project hooks

- **Host seams**: `src/services/stHost/worldInfo.ts` provides `listAllLorebooks`, `lorebookExists`,
  `listSelectedLorebooks`, `createLorebook`, `activateGlobalLorebook`, `loadLorebook`,
  `enableWIEntry`/`disableWIEntry`, and `upsertWIEntry`. `stHost/selectors.ts` provides
  `listGlobalLorebooks`, which intersects the selection with the books that exist. The only import
  path is `src/services/STAPI.ts:34`.
- **Story effects**: `effects.world_info: {enable|disable: [{lorebook, comments}]}` flips `disable` on
  entries matched by trimmed `comment` (`src/runtime/effectsApplier.ts:63-78`). **No effects run at all
  while the requirements aren't ready** (`effectsApplier.ts:110`). Working example:
  `examples/sun-ruins/Xentar Checkpoints.json`.
- **Wizard provisioning**: `upsertLorebookEntry {lorebook, comment, keys, content, constant?}` is
  allowed only into the story's own lorebooks (`src/wizard/provisioning.ts:34-39`). It can't set
  position, depth, order or disabled state, so written entries land at ↑Char order 100, **enabled**
  (`worldInfo.ts:141-161`). A phase-gated entry needs a `disable` effect or a manual edit afterwards.
  When writing the wizard prompt (`src/copilot/prompts.ts:47-52`), ask for self-contained content
  and keys that cover the forms that will actually appear.
- **Curator**: it only sees and writes entries with a non-empty `comment` in the books listed under
  `stagecraft.lorebooks` (`src/stagecraft/scope.ts:7-28`). Its prompt's closed vocabulary is those
  titles (`src/stagecraft/prompt.ts`). `upsertWIEntry` re-enables what it writes, so the coordinator
  disables again afterwards (`stagecraftCoordinator.ts:215-221`).
- **Memory mirror**: one book per chat, `Story Orchestrator - <title> - <chatId>`, with comments
  `so_<id>` and keys set to the entities (`src/runtime/memoryMirror.ts`). It is created through
  `ensureLorebook` and bound to that chat's lorebook slot (never activated globally), unless the user
  already bound a book of their own there. Scene summaries carry no keys, so only relationships fire.
- **What our code never scans**: our injected blocks use `scan: false`
  (`src/services/stHost/extensionPrompts.ts:24`), so memory and steering text never trigger entries.
  Our LLM passes use Connection Manager `sendRequest`, which runs no World Info
  (`public/scripts/extensions/shared.js:423-482`). `/comment` transition notes are `is_system`, so
  they aren't scanned either.
- **Macros in content**: story macros such as `{{story_player_name}}` expand inside entries, as the
  Xentar book does.
- **Debug**: `node scripts/debug/st-actions.mts wi-status <book> <comment>`, `st-payload.mts arm|last`,
  `st-eval.mts --file` for a dry-run scan, and `so-assets.mts list|remove --marker`. For the live gate
  procedure, load the `debug` skill.

## References

- `references/entry-schema.md`: every entry field (type, default, UI label, card-book key), the
  enums, the global settings and their defaults, and where books come from. Open it when writing or
  reading JSON.
- `references/activation-internals.md`: the scan step by step, with line references (buffer, gate
  order, groups, budget, recursion, placement, timed effects, events). Open it when behaviour surprises
  you.
- `references/troubleshooting.md`: the console log dictionary, a dry-run recipe, and tables for
  "doesn't fire", "fires when it shouldn't" and "ignored by the model", plus project-specific failures.
- `references/patterns.md`: recipes for keyword lore, constant steering, checkpoint gating, groups, a
  random tagged event, cadence markers (the corrected Seamless lorebook), trigger scoping, vocabulary
  lorebooks, variable-plus-regex toggles, LoreList, outlets, decorators and per-speaker regex.
- `references/scripting-and-api.md`: UI steps, every WI slash command, the JS and REST APIs with their
  quirks, our seams and callers, and the test-lorebook workflow.
- `templates/minimal-lorebook.json`: an importable book with three entries (keyword ↓Char, constant
  @D4 system, disabled checkpoint-gated constant). Validated against `newWorldInfoEntryDefinition`,
  and dry-run scanned on 2026-09-18. Rename the file to the book name before importing.

## Related

- `st-character-authoring` skill: card fields, TwoList, and embedded `character_book` in cards.
- `st-image-generation` skill: tag lorebooks for image prompts, and marker-driven image automation.
- `st-scripting` skill: STscript, Quick Replies (automation ids), and the regex script JSON (for World
  Info placement).
- `.claude/sillytavern-docs/community/prompting-memory-prior-art.md`: Vector Storage and Data Bank,
  and memory-book approaches.

## Sources

| Thread (SillyTavern Discord `st-guides`) | Created / last activity | Upvotes |
|---|---|---|
| [Getting started with World Info (Lorebooks)](https://discord.com/channels/1100685673633153084/1284322277483085844), underscore_x | 2024-09-14 / 2025-12-27 | 62 (49 comments) |
| [Community Quick Tips](https://discord.com/channels/1100685673633153084/1286355628314333335), World Info section | 2024-09-19 / 2025-07-25 | 20 |
| [TwoList Card Templates](https://discord.com/channels/1100685673633153084/1376373277320286258), LoreList part | 2025-05-26 / 2025-05-26 | 1 |
| [Using Lorebooks for Tag Based Image Generation Prompts](https://discord.com/channels/1100685673633153084/1457934981992157224), general WI lessons only | 2026-01-06 / 2026-01-07 | 8 |
| [2.0 Seamless Image Generation](https://discord.com/channels/1100685673633153084/1384178466202845285), §4 lorebook only | 2025-06-16 / 2026-06-24 | 37 (354 comments) |

Local copies are in `docs/tutorials/sillytavern-*.md`. ST source verified at `1.19.0`, commit `7c399419` (2026-09-14).
