# World Info troubleshooting

Open this when an entry doesn't fire, fires when it shouldn't, or fires but has no effect. Every row
names the check that decides it. Line numbers refer to `public/scripts/world-info.js` unless another
file is given. The internals are walked through in `activation-internals.md`.

## Get evidence first (don't guess)

1. **Browser console, Verbose level.** The scan logs a line per entry and per decision. Search for `[WI]`:

   | Log text | Meaning |
   |---|---|
   | `disabled` | `disable: true` (it may have been flipped by a story effect or the curator) |
   | `skipped by generation type trigger filter` | `triggers` excludes this generation type |
   | `filtered out by character` / `filtered out by tag` | character filter. Names are avatar file names; tags are tag ids |
   | `suppressed by delay` / `suppressed by cooldown` | a timed effect is active |
   | `suppressed by delay until recursion` / `exclude recursion` | recursion flags |
   | `suppressed by @@dont_activate decorator` | the first line of content is `@@dont_activate` |
   | `activated because of constant` / `activated because active sticky` / `externally activated` / `activated by @@activate decorator` | it activated without a key match |
   | `has no keys defined, skipped` | normal entry with an empty `key` |
   | `activated by primary key match <key>` | shows exactly which key matched |
   | `skipped. Secondary keywords not satisfied` | optional filter logic failed |
   | `removed as loser from inclusion group` / `score loser` / `non-sticky loser` | inclusion group |
   | `failed probability check` | Trigger % roll |
   | `budget of N reached` | budget overflow. Everything after this point is dropped |
   | `skipped adding to prompt due to empty content` | content is empty after macros or regex |
   | `[WI] Adding N entries to prompt` | final count (`5278`) |

2. **The payload that was actually sent.** Use `node scripts/debug/st-payload.mts arm`, then
   generate, then `node scripts/debug/st-payload.mts last`. ST's per-message "prompt itemization" view
   and the community "Prompt Inspector" extension show the same thing. The guide author's advice was
   to look at the real prompt instead of assuming.

3. **A dry-run scan with no side effects.** Inside the page (`node scripts/debug/st-eval.mts --file x.js`),
   call `ctx.getWorldInfoPrompt(chatNewestFirst, maxContext, true)` (`892-915`). `chatNewestFirst` is
   an array of `"Name: text"` strings. A dry run skips timed effects and doesn't emit events. To test
   entries without writing a book, push them into the lore arrays for one scan:

   ```js
   const h = (lore) => lore.globalLore.push({ ...entry, world: '__dryrun__' });
   ctx.eventSource.on(ctx.eventTypes.WORLDINFO_ENTRIES_LOADED, h);
   try { return await ctx.getWorldInfoPrompt(['User: text with the key'], 1000000, true); }
   finally { ctx.eventSource.removeListener(ctx.eventTypes.WORLDINFO_ENTRIES_LOADED, h); }
   ```

   A large `maxContext` keeps the user's own active books from using up the budget. The result lists
   the user's active books as well, so filter by your own content. Known limit: in a page with no
   chat open, macros came back literal (`{{user}}` stayed as written, observed 2026-09-18 with the
   experimental macro engine on). Open a chat before testing macro keys or macro content.

4. **Entry state** without opening the UI: `node scripts/debug/st-actions.mts wi-status <book> <comment>`.

## Doesn't fire

| Cause | Check / fix |
|---|---|
| Book not active | Global books need `/world state=on <book>`. Or bind the book to the character, chat or persona. Read `selected_world_info`, not `globalSelect` (a debounced mirror, `83-87`). The quick-tips author found this one too: "the lorebook must be active" |
| Key outside the scanned window | Default Scan Depth is **2**: only the newest two non-system messages. Raise the per-entry `scanDepth`, or make the entry constant |
| `scanDepth: 0` on the entry or globally | Nothing can match (`280-283`). The doc's claim about recursion and Author's Note at depth 0 is wrong |
| Whole words on, and the key is inflected ("sword" against "swords", "Sword's") | Add the forms as extra keys, or use a regex such as `/\bswords?\b/i` |
| Case-sensitive on | Add variants, or use a regex with `i` |
| Regex key without the `i` flag | Regex ignores the case setting (`338-342`). Add `i` |
| Regex has an unescaped `/` inside | It silently becomes a plaintext key (`2913`). Escape it as `\/` |
| Key macro resolves to empty (`{{getvar::x}}` unset) | An empty key never matches (`4916`) |
| Secondary logic misunderstood | `selective` must be true. AND_ANY needs one match, AND_ALL all of them, NOT_ANY none, NOT_ALL "not all" |
| `triggers` doesn't include this generation type | For example a quiet-only entry on a normal turn. Empty `triggers` means all types |
| Character filter uses a display name | It needs the avatar file name without extension. `/setentryfield field=characterFilterNames` resolves names for you (`1407-1414`) |
| Delay, cooldown, or probability below 100 | Check `/wi-get-timed-effect`. A failed roll isn't retried during that generation |
| Lost an inclusion group | Only one entry per group label wins |
| Budget exhausted | Look for `budget of N reached`. The budget order is chat book, then persona book, then character/global by strategy, then higher `order`. Set `ignoreBudget` or raise Context % |
| Only reachable through recursion | Recursion is off on *this* install (2026-09-18). A fresh install has it on. `excludeRecursion` and a lower-level `delayUntilRecursion` also block it |
| Author's Note position with the Author's Note off or on an off-interval turn | Entries at ↑AN/↓AN are dropped (`5268`, `authors-note.js:351-362`). Use @D instead |
| Outlet position with no `{{outlet::name}}` anywhere | Outlet text is never inserted on its own |
| Hand-written JSON missing `position` or `selective` | Missing `position` means no insertion. Missing `selective` means secondary keys are ignored. Write every field |
| Keyword is in a hidden message or a `/comment` note | System messages aren't scanned (`script.js:4496`) |
| Swiping | The swiped message isn't in the scan (`script.js:4497-4499`) |
| Our extension's LLM passes (extraction, curator, wizard) | They never run World Info (Connection Manager request). The curator sees entries only through its own prompt |

## Fires when it shouldn't

The guide author's checklist, extended from the source:

1. **Recursion.** Another active entry's content contains this key. Set `excludeRecursion` on this
   entry, or `preventRecursion` on the other one.
2. **Additional matching sources.** A `match*` flag scans the character description, persona or
   similar, and the key appears there permanently.
3. **Vectorized.** Vector Storage matched it by similarity (`vectorized`, or "enabled for all entries"
   in the vector settings).
4. **Constant, sticky, or `@@activate`.** None of these need a key. **Secondary keys can't stop a
   constant entry** (`4893-4897`). Confirmed by dry run.
5. **Injected text is scanned.** The Author's Note (when it allows WI scan), Data Bank injections set
   to include in scanning, and the quiet prompt of `/gen` or image generation (`script.js:4623`).
6. **Include Names.** The key is a participant's name, and the `Name: ` prefix matches it on every
   message.
7. **Substring matching.** Whole words is off (the default on *this* install), or the key has several
   words, or the text has accented letters (`caf` matches "café").
8. **Min Activations.** It scans further back than Scan Depth until N entries have fired.
9. **You forgot a bound book.** Chat, persona, or a character's extra books. Check with
   `/getchatbook create=false`, `/getpersonabook`, and `/getcharbook type=all`.
   `/getchatbook`'s `create` **defaults to true**, so without `create=false` it creates and binds a
   new book (`1661`, `1176-1178`).
10. **A macro in the key** resolves to something common, such as `{{char}}`.

## Fires but the model ignores it

- **Placement too far up.** ↑Char/↓Char text sits near the top of a long prompt and fades as the chat
  grows. Put steering text at @D, depth 0 to 4, with role system (community-reported, 2024-09 to
  2025-12): a constant @D4 system entry for what must hold every turn, and @D0–2 for immediate
  formatting or scene rules. One user reported markdown compliance with @D2 system at 500 max tokens.
  The guide author's framing is attention: the insertion depth matters, not which UI field the text
  was written in.
- **Overridden by a later instruction** (community-reported, 2026-01). An image-prompt template that
  opened with "Ignore previous instructions" wiped out the lorebook text above it. The author's fix:
  every entry at @D0, and the template line changed to "Ignore all previous instructions that do not
  regard image generation". This fits the source: the quiet prompt is appended as a control prompt
  after the chat history (`openai.js:1229-1235`), so @D0 is as close to it as World Info can get.
- **The content only makes sense with its key.** Keys and titles aren't sent. Each entry's content has
  to name its subject and stand alone.
- **Too long, or competing with the card.** Trim it. Check whether a constant entry repeats the card.
  Per the guide author, a constant entry is the same thing as a card field: permanent tokens every turn.

## Project-specific failures

| Symptom | Cause |
|---|---|
| A story's `world_info` effect does nothing | `comment` doesn't match exactly (compared after trim), or the book name is wrong, or the requirements aren't ready, in which case `applyCheckpoint` returns before *any* effect runs (`src/runtime/effectsApplier.ts:110`). `wi-status` shows the result |
| Requirement "lorebook missing" stays red after creating it | The book exists but isn't **globally selected**. `requirements.lorebooks` only counts `selected_world_info` intersected with existing books (`src/runtime/requirements.ts:16-20`, `src/services/stHost/selectors.ts:28-31`) |
| Phantom active book after cleanup | Raw `/api/worldinfo/delete` leaves the name in `selected_world_info`. `listGlobalLorebooks` intersects with the books that exist, so requirements stay honest (`selectors.ts:28-31`). Code that reads the raw selection doesn't, and needs the same intersection. `so-assets.mts remove` also deselects |
| `loadLorebook("typo")` returns `{entries:{}}` | The server's dummy object (`src/endpoints/worldinfo.js:18,27-29`). Use `lorebookExists()` |
| Curator never proposes anything for an entry | Entries without a `comment` are left out of its scope (`src/stagecraft/scope.ts:19-28`). The book also has to be in `stagecraft.lorebooks` |
| An entry the author switched off comes back on | `upsertWIEntry` always writes `disable: false` (`src/services/stHost/worldInfo.ts:158`). The curator disables it again afterwards (`stagecraftCoordinator.ts:220-221`). Other callers have to do the same |
