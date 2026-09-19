# Creating, activating and editing lorebooks: UI, slash commands, JS, REST, our seams

Open this when you need to *make* a lorebook or change one programmatically: a throwaway test book
for a live run, a wizard or curator write path, or a debug script. Paths are under
`C:\dev\SillyTavern-MainBranch\` unless they start with `src/` or `scripts/`. Those are in the
extension repo.

## UI (for humans; also what a journey step imitates)

1. Open the World Info drawer (globe icon in the top bar). Click **New World** and give it a name.
   The name becomes the file name.
2. Click **+** to add an entry. Fill in Title/Memo (`comment`), keys, content, strategy (🔵/🟢/🔗),
   position, depth and order.
3. **Activate the book.** Pick it in the global selector at the top of the drawer. This step is
   separate from the entry toggles and is easy to forget. Alternatively bind it to the character
   (globe button on the character panel), the chat, or the persona.
4. Import or export: World Info drawer, **Import** (JSON, or a NovelAI PNG/JSON, an Agnai memory book,
   or a Risu lorebook, all converted on import, `world-info.js:5874-5890`). An embedded card book is
   imported with "Import Card Lore". That creates a normal book and links it as the character's
   primary book (`5731-5770`).

## Slash commands (all verified in `public/scripts/world-info.js:1616-2008`)

| Command | Args | Returns / effect |
|---|---|---|
| `/world <name>` | `state=on\|off\|toggle`, `silent=true` | Activates, deactivates or toggles a **global** book. The name is matched case-insensitively against the picker, and commas split it into several names (`5772-5844`). With no name it deactivates **all** books |
| `/getglobalbooks` | none | JSON list of active global books |
| `/getchatbook` | `name=`, `create=` (**default true**) | The chat-bound book. Creates and binds one if the chat has none (`1159-1182`) |
| `/getcharbook [char]` | `type=primary\|additional\|all`, `name=`, `create=` (default false) | The character's books. Needs a character argument in groups (`1115-1152`) |
| `/getpersonabook` | `name=`, `create=` (default false) | The persona book |
| `/createentry file=<book> [key=<k>] [content]` | none | The new uid. Sets `comment=key` and `addMemo` (`1313-1341`). Every other field gets the template default: ↑Char, order 100 |
| `/setentryfield file=<book> uid=<n> field=<f> <value>` | none | Any definition field. Arrays accept a JSON array (use one for regex keys that contain commas) or a comma list (`utils.js:1028-1040`). Booleans and numbers are coerced. Write `\{ \} \|` to keep `{ } \|` literal; they're unescaped before saving (`1371`) |
| `/getentryfield file=<book> [field=content] <uid>` | none | The field value. Arrays come back as JSON |
| `/findentry file=<book> [field=key] <text>` | none | The uid of the best fuzzy match (Fuse, threshold 0.3) |
| `/wi-set-timed-effect file= uid= effect=sticky\|cooldown <on\|off\|toggle>` | none | Needs an open chat and a duration already set on the entry |
| `/wi-get-timed-effect file= effect= [format=bool\|number] <uid>` | none | Whether it's active, or the messages left |

There's no slash command that creates a *global* book. The `get*book name=… create=true` family
creates one and binds it at the same time. Example: build a test book entirely with slash commands:

```
/getchatbook name=SO-T1-lore |
/createentry file=SO-T1-lore key="brass lantern" The Brass Lantern is a harbour tavern. |
/setentryfield file=SO-T1-lore uid=0 field=position 1 |
/world state=on silent=true SO-T1-lore
```

- The last line is needed only for `requirements.lorebooks`, which counts global books only. Once
  the book is global, the chat binding is skipped as a duplicate (`4551-4553`).
- Quote named-argument values that contain spaces.
- Git Bash mangles a leading `/` in CLI arguments. Prefix `st-actions.mts slash` with
  `MSYS_NO_PATHCONV=1`.
- `/createentry` on a book that doesn't exist loads the dummy (`1317`), and that dummy is then
  **saved as a new file** with no picker refresh. Create the book first.

## JS (inside the page)

| API | Where | Behaviour you must know |
|---|---|---|
| `ctx.getWorldInfoNames()` | `st-context.js:284` | Existing books (`world_names`). **This is the only reliable existence check** |
| `ctx.loadWorldInfo(name)` | `world-info.js:2036-2059` | A cached, deep-cloned copy. **An unknown name returns `{entries:{}}`, not null** (`src/endpoints/worldinfo.js:17-30`), and that dummy gets cached |
| `ctx.saveWorldInfo(name, data, immediately)` | `4177-4190` | Updates the cache first, then POSTs `/api/worldinfo/edit`, debounced unless `immediately`. `/edit` **creates the file if it's missing**, but `world_names` isn't refreshed |
| `ctx.updateWorldInfoList()` | `2061-2084` | Reloads `world_names` and the pickers from `/api/settings/get` |
| `ctx.getWorldInfoPrompt(chat, maxCtx, dryRun)` | `892-915` | Runs a scan (see troubleshooting.md, dry run) |
| `ctx.reloadWorldInfoEditor(name, loadIfNotSelected?)` | `st-context.js:280`, `world-info.js:1040-1046` | Refreshes the editor if it's showing that book. Pass `true` to open it |
| `createNewWorldInfo(name, {interactive})` | module export, `4448-4473` | Writes `{entries:{}}` and refreshes the list. **Doesn't activate the book** |
| `createWorldInfoEntry(name, data)` | `4137-4149` | Adds a template entry under the next free uid. You still have to save |
| `deleteWorldInfo(name)` | `4346-4393` | Deletes it **and** clears the cache, the global selection, the persona link, and the link on the *currently open* character. It doesn't clear chat bindings or other characters' links. Prefer it to raw REST |
| `selected_world_info` | `66` | The live global selection. `world_info.globalSelect` is a debounced mirror of it (`83-87`) |
| `newWorldInfoEntryTemplate` / `newWorldInfoEntryDefinition` | `4082-4129` | Field defaults and types |

Module import from inside the page: `await import('/scripts/world-info.js')`. In extension code, go
through `src/services/stHost/modules.ts` (`worldInfoModule`), never import directly.

## REST (server, `src/endpoints/worldinfo.js`)

| Endpoint | Body | Notes |
|---|---|---|
| `POST /api/worldinfo/list` | `{}` | `[{file_id, name, extensions}]` |
| `POST /api/worldinfo/get` | `{name}` | **Returns the dummy `{entries:{}}` for a missing file** (`76`) |
| `POST /api/worldinfo/edit` | `{name, data}` | Create or overwrite. `data.entries` is required |
| `POST /api/worldinfo/delete` | `{name}` | Deletes the file only. **Leaves the name in `selected_world_info` and the client cache** |
| `POST /api/worldinfo/import` | multipart `avatar` file | The name comes from the file name. `entries` is required |

## Our host seams (`src/services/stHost/worldInfo.ts`, re-exported from `src/services/STAPI.ts:34`)

| Function | Does | Watch out |
|---|---|---|
| `listAllLorebooks()` | `getWorldInfoNames()` trimmed | |
| `lorebookFileId(name)` / `findLorebook(name)` | The server files a book under `sanitize(name + ".json")`, so `world_names` holds file ids: `findLorebook` strips what sanitize-filename strips and returns the listed name, case-insensitively | A title with `:` or `?` is listed under a different name than the one it was saved with |
| `lorebookExists(name)` | `findLorebook(name) !== null` | Use this, never `loadLorebook`, to test existence |
| `ensureLorebook(name)` | Returns the listed book; otherwise refreshes `world_names` from the server once (`updateWorldInfoList`), and only then creates it with `createNewWorldInfo` under its file id | Returns `{name, created}` or `null`. The refresh is there because `createNewWorldInfo` checks only the client list and then writes `{entries:{}}` over the file. A book found only after the refresh has its cached copy evicted |
| `listSelectedLorebooks()` | Reads the live `selected_world_info` | `selectors.listGlobalLorebooks()` also intersects with existing books. `requirements.lorebooks` is checked against that |
| `createLorebook(name)` | `ensureLorebook`, then `activateGlobalLorebook` | Returns `{created, activated}` |
| `activateGlobalLorebook(name)` | `/world silent=true state=on <listed name>`, then re-reads the selection | |
| `bindChatLorebook(name, replaceable?)` | Writes the chat's lorebook slot `chat_metadata[METADATA_KEY]` (scanned for that chat only) and marks `.chat_lorebook_button` | Returns `bound`/`already-bound`/`occupied`/`no-chat`. A live book the user bound is `occupied` and kept; a binding to a deleted book counts as empty, as it does for `/getchatbook`. Persisting is the caller's (it rides the next `saveMetadata`) |
| `loadLorebook(name)` | `ctx.loadWorldInfo` of the listed book | `null` for a book that isn't listed: it never asks the host, because `loadWorldInfo` caches the server's dummy for a missing name and `importWorldInfo` never evicts it |
| `enableWIEntry` / `disableWIEntry(book, comments)` | Flips `disable` on the entries whose trimmed `comment` matches, and saves immediately | Returns `false` for a missing book or when no comment matched. Warns about a missing comment and continues |
| `upsertWIEntry(book, comment, content, keys?, {constant?})` | Finds by `comment` or creates from the template, sets content, keys and constant, **forces `disable=false`**, saves | **Never creates a book**: returns `"failed"` if it isn't listed. Creating one is the caller's decision (`ensureLorebook`). Every other field stays at the template default (↑Char, order 100, depth 4) |

Callers:

- Story checkpoint effects: `src/runtime/effectsApplier.ts:63-78`.
- The wizard's `createStoryLorebook` and `upsertLorebookEntry`: `src/runtime/coordinators/copilotCoordinator.ts:59-69`,
  validated create-only by `src/wizard/provisioning.ts:29-39`.
- The curator: `src/runtime/coordinators/stagecraftCoordinator.ts:215-241`, with its scope in
  `src/stagecraft/scope.ts`.
- Memory mirroring: `src/runtime/memoryMirror.ts` (called from `memoryCoordinator.syncWorldInfo`).
  Each chat gets its own book, `Story Orchestrator - <title> - <chatId>`, created with
  `ensureLorebook` on the first relationship or scene entry and bound to that chat's lorebook slot
  with `bindChatLorebook`; the name is recorded in `extras.memory.wiBook`, so renaming the chat keeps
  it. Comments are `so_<memoryId>`, keys are the memory's entities (scene summaries have none, so
  they never fire), and entries that have gone get `disable`. Adopting a book (first write, a branch,
  a restart, or the book deleted) disables any `so_` entry already in it. Books named per story
  (`Story Orchestrator - <title>`) come from builds before 2026-09-19; nothing reads them now.

## Test-lorebook workflow (live runs)

1. **Name it with a marker prefix** (for example `SO-J9 …` or your journey's marker) so
   `node scripts/debug/so-assets.mts remove --marker <prefix>` finds it. Never touch unmarked books.
2. Create it: copy `../templates/minimal-lorebook.json`, rename the file to the book name, and
   import it. Or in-page: `createNewWorldInfo(name)`, then `saveWorldInfo(name, data, true)`, then
   `updateWorldInfoList()`. Or drive the wizard (`so-ui.mts wizard*`).
3. Activate it with `/world state=on silent=true <name>`, or `activateGlobalLorebook`. Check that
   `(await import('/scripts/world-info.js')).selected_world_info` contains it.
4. Verify with `st-actions.mts wi-status <book> <comment>`, the dry run in troubleshooting.md, or
   `st-payload.mts` after a real generation.
5. Clean up with `so-assets.mts remove --marker <prefix>`. It deletes through REST and then deselects
   the book, but it leaves the client's `worldInfoCache` entry behind, so a later `loadWorldInfo` of
   the same name in that page returns the deleted content. In-page, `deleteWorldInfo(name)` also
   clears the cache and the persona link. Chat bindings (`chat_metadata.world_info`) are left
   dangling either way. Delete the sandbox chat or clear the binding.
