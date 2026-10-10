# Lorebook (World Info) mechanics

A capability reference for SillyTavern World Info as the code runs it, and for how Story Orchestrator layers on top. Mechanics only: no story content.

Sources, verified 2026-10-09:

- SillyTavern 1.19.0, commit `ad29cbda6` (2026-10-03). `world-info.js` means `public/scripts/world-info.js`; other ST paths are under `public/` unless they start with `src/` or `default/`.
- Story Orchestrator at `469a73fb`. SO paths are under `src/`.

If this page and the code disagree, the code is right. The official doc (`.claude/sillytavern-docs/worldinfo.md`) is wrong in a few places; they are listed at the end.

## 1. One scan, start to finish

Every `Generate()` call (normal, continue, impersonate, swipe, regenerate, quiet) builds the scan chat and calls `getWorldInfoPrompt` (`script.js:4624-4635`). The scan is `checkWorldInfo` (`world-info.js:4709-5282`):

1. Build the buffer: chat messages newest first, plus extension prompts registered with `scan: true` (`world-info.js:4718-4726`).
2. Compute the budget (`4736-4741`), load and sort every entry (`getSortedEntries`, `4590-4644`), read timed effects (`4746-4747`).
3. Loop: gate each entry, then activate it (`4793-4986`); sort candidates (`4994-5006`); inclusion groups (`5012`); probability, then budget (`5017-5076`); decide recursion, min activations, delayed levels (`5096-5143`); emit `WORLDINFO_SCAN_DONE` (`5175`).
4. Place activated entries by position, ordered by `order` (`5203-5263`); splice the Author's Note positions (`5268-5272`); arm sticky/cooldown (`5274`).
5. Non-dry scans emit `WORLD_INFO_ACTIVATED` (`world-info.js:900-903`).

Our own LLM passes (memory reads, curator, judge) use Connection Manager requests and run no scan.

### Per-entry gate, in order (`world-info.js:4796-4989`)

| # | Check | Result | Line |
|---|---|---|---|
| 1 | Already activated, or already failed its probability roll this generation | skip | 4797 |
| 2 | `disable == true` | skip | 4801 |
| 3 | `triggers` non-empty and lacks the generation type | skip | 4806-4813 |
| 4 | `characterFilter.names` vs current character's avatar file name (`isExclude` inverts) | skip | 4816-4824 |
| 5 | `characterFilter.tags` vs current character's tag ids | skip | 4826-4843 |
| 6 | Delay active | skip | 4849 |
| 7 | Cooldown active and not sticky | skip | 4854 |
| 8 | `delayUntilRecursion` outside a recursion pass, or above the current level (not sticky) | skip | 4860-4868 |
| 9 | `excludeRecursion` in a recursion pass with recursion on (not sticky) | skip | 4870 |
| 10 | `@@activate` decorator | activate | 4875 |
| 11 | `@@dont_activate` decorator | skip | 4881 |
| 12 | Force-activated (`WORLDINFO_FORCE_ACTIVATE`) | activate the forced copy | 4886-4889 |
| 13 | `constant` | activate; keys never read | 4893 |
| 14 | Sticky active | activate | 4899 |
| 15 | No primary keys | skip | 4905 |
| 16 | Primary keys: first match wins | continue | 4911-4922 |
| 17 | Secondary keys (only if `selective` and non-empty) | activate or skip | 4924-4986 |

Forced, decorator and constant entries still pass gates 1-9 and still face groups, probability and budget.

## 2. Activation

| Field | Default | Behaviour | Gotchas | Source |
|---|---|---|---|---|
| `constant` | `false` | Activates on every scan that reaches it | Skips primary AND secondary keys: `constant` + NOT_ANY still fires. Still subject to disable, triggers, filter, timed effects, groups, probability, budget | `world-info.js:4893-4897` |
| `key` | `[]` | Plaintext or `/regex/flags`. Each key is macro-substituted then trimmed; first match wins | A key that resolves to empty never matches. Empty array = only constant/sticky/decorator/forced | `4904-4917` |
| `keysecondary` | `[]` | Optional filter | Ignored unless `selective` is true and the list is non-empty | `4924-4928` |
| `selective` | `true` | Enables the secondary filter | A card book imported without `selective` gets `false`, silently dropping its filter | `4089`, `5634` |
| `selectiveLogic` | `0` | `0` AND_ANY: any secondary matches. `1` NOT_ALL: at least one secondary missing. `2` NOT_ANY: none match. `3` AND_ALL: all match | AND_ANY / NOT_ALL short-circuit on the first decisive key | `33-38`, `4943-4978` |
| `caseSensitive` | `null` | Per-entry override of `world_info_case_sensitive` | Plaintext only; regex keys ignore it | `268-271` |
| `matchWholeWords` | `null` | Per-entry override of `world_info_match_whole_words` | See below | `346-363` |
| decorators | none | Leading content lines starting `@@`: `@@activate`, `@@dont_activate` | Parsed only when content starts with `@@`; every leading `@@` line is consumed and stripped. `@@@x` is a fallback used only after an unknown decorator | `100`, `4652-4698`, `4626-4630` |
| `disable` | `false` | Skipped before any other check | Toggling it changes the entry hash (timed effects, section 7) | `4801` |

### Key matching (`WorldInfoBuffer.matchKeys`, `world-info.js:337-366`)

- **Regex keys**: `^/pattern/flags$`, flags `gimsuy` (`2901-2926`). A regex overrides case and whole-word settings, and the haystack is NOT lowercased, so add `i` yourself. An unescaped `/` inside the pattern makes the whole key plaintext with no warning (`2913-2915`). A pattern that fails to compile also falls back to plaintext (`2921-2925`).
- The haystack is `\x01` + messages joined with `\n\x01` (`294-297`). A regex `^Name:` with `m` does not match a message start: the line starts with `\x01`.
- **Whole words on**: a key that splits into more than one word (`/\s+/`) is a plain substring match (`350-353`), so `dark sin` matches "dark sinews". A single word uses `(?:^|\W)key(?:$|\W)` (`356`). `\W` is ASCII-only (no `u` flag): an accented or non-Latin letter is a boundary, so `caf` matches "café", and a single CJK key behaves like a substring match.
- **Whole words off**: substring (`361`).
- **Macros**: `{{char}}`, `{{user}}`, `{{getvar::x}}` and extension macros resolve in keys (`4915`, `4947`) and in content at activation (`5058`).

## 3. Scan buffer, depth and global settings

| Setting (`world_info_*`) | Code fallback (`world-info.js:69-82`) | Fresh install (`default/content/settings.json:14-22`) | Behaviour |
|---|---|---|---|
| `depth` | 2 | 2 | Messages scanned, newest first. Per-entry `scanDepth` overrides |
| `include_names` | true | true | Each scanned message is `Name: text` (`script.js:4624`), so participant names are always in the buffer |
| `budget` | 25 | 25 | % of max context. Values over 100 reset to 25 (`world-info.js:946-948`) |
| `budget_cap` | 0 | 0 | Hard token cap; 0 = off (`4738-4741`) |
| `recursive` | false | **true** | Recursion on/off |
| `case_sensitive` | false | false | |
| `match_whole_words` | false | **true** | |
| `character_strategy` | 1 (character first) | 1 | 0 evenly, 1 character first, 2 global first (`27-31`, `4608-4622`) |
| `min_activations` | 0 | absent (0) | Keep widening depth until N entries activated |
| `min_activations_depth_max` | 0 | absent (0) | Stop widening past this depth (0 = chat length) |
| `max_recursion_steps` | 0 | absent (0) | Caps loop count (`4768-4771`); 1 disables recursion |
| `use_group_scoring` | false | absent (false) | Global group scoring |
| `overflow_alert` | false | false | Toast on budget overflow (`5064-5066`) |

Read live values with `getWorldInfoSettings()` (`795-812`); an install can differ from both columns.

**Buffer contents** (`WorldInfoBuffer.get`, `276-326`), in order:

1. The first `depth` messages of the scan chat. The scan chat excludes `is_system` rows (hidden messages, `/comment` notes) (`script.js:4496`), drops the message being swiped (`4497-4499`), and holds the prompt-regexed text (User Input / AI Output regex with `isPrompt`, `4501-4506`).
2. The entry's match sources (section 10).
3. The inject buffer: every extension prompt with `scan: true` (`world-info.js:4718-4726`). This includes the quiet prompt of a quiet generation (`script.js:4623`), the Author's Note when "Allow WI scan" is on (`authors-note.js:388`), Vector Storage injections with "include in WI scanning" (`extensions/vectors/index.js:696`), and any extension block flagged `scan`.
4. The recursion buffer, except during min-activations sweeps (`world-info.js:322-325`).

**Depth 0**: `get` returns `''` when depth is at or below the start depth (`281-283`), BEFORE match sources, injections or recursion are appended. An entry with `scanDepth: 0` (or global depth 0) can never key-match anything; only constant, sticky, decorator and forced activation survive.

**Min activations** widen only the global depth (`getDepth` = global depth + skew, `402-404`, `5110-5126`); an entry with its own `scanDepth` does not widen. Min activations and max recursion steps exclude each other (`4767`).

## 4. Recursion

| Field / setting | Default | Behaviour | Source |
|---|---|---|---|
| `world_info_recursive` | see table above | After a loop, activated content (minus `preventRecursion`) joins the recursion buffer and the scan loops again, unless the budget overflowed | `world-info.js:5097-5100`, `5137-5144` |
| `preventRecursion` | `false` | This entry's content never enters the recursion buffer | `5080` |
| `excludeRecursion` | `false` | Cannot be activated during a recursion pass (only checked while recursion is on) | `4870` |
| `delayUntilRecursion` | `0` | Truthy: never in the first pass. `true` = level 1; a number = that level. Levels open one at a time, lowest first, each after a pass finds nothing new | `4754-4762`, `4860-4868`, `5129-5133` |

Recursion text is macro-substituted content (`5058`), not World Info regex output: WI regex runs only at placement (`5205`). A `delayUntilRecursion` level opens even with recursion off, because delayed levels are processed whenever the scan would stop (`5129`).

## 5. Insertion

| `position` | Name | Lands | Ordering in slot | Source |
|---|---|---|---|---|
| 0 | before | `{{wiBefore}}` / `{{loreBefore}}` in the story string; Prompt Manager `worldInfoBefore` in Chat Completion | ascending `order` | `world-info.js:5213`, `script.js:4711-4714`, `openai.js:1376` |
| 1 | after | `{{wiAfter}}` / Prompt Manager `worldInfoAfter` | ascending | `5216`, `openai.js:1377` |
| 2 | ANTop | prepended to the Author's Note text | ascending | `5229`, `5268-5272` |
| 3 | ANBottom | appended to the Author's Note text | ascending | `5232` |
| 4 | atDepth | an in-chat extension prompt per (`depth`, `role`) pair | ascending; one block per pair, joined by `\n` | `5235-5246`, `script.js:4668-4672` |
| 5 | EMTop | before example messages | ascending | `5219`, `script.js:4639-4656` |
| 6 | EMBottom | after example messages | ascending | `5224` |
| 7 | outlet | only where `{{outlet::name}}` is written | **descending** (pushed, not unshifted) | `5248-5256`, `script.js:4674-4677`, `macros.js:668` |

- `depth` (default 4) and `role` (default 0) apply only at position 4. Role `0` system, `1` user, `2` assistant (`script.js:494-498`); a null role falls back to system (`world-info.js:5236-5243`).
- `order` (default 100): entries are sorted descending and `unshift`ed (`89`, `5203`), so lower `order` comes first in a slot. Outlets use `push`, so higher `order` comes first there.
- `outletName` empty at position 7: warned and dropped (`5249-5251`).
- Chat Completion wraps before/after text in the World Info format template (`openai.js:788-801`).
- A missing `position` (hand-written JSON) activates but lands nowhere (`switch` has no default insert, `5260-5261`). Missing fields are backfilled only in the editor (`addMissingWorldInfoFields`, `2097-2130`).
- Empty content after WI regex is skipped (`5207-5210`).
- `generateQuietPrompt({ skipWIAN: true })` drops @D and outlet injections (`script.js:4664-4683`).

**Author's Note positions** (2, 3) are spliced only when `shouldWIAddPrompt` is true (`world-info.js:5268`). That is false outside a chat, when the AN interval is 0, on turns the interval skips, and before the first user message unless the interval is 1 (`authors-note.js:324-362`). The AN that the scan sees (when "Allow WI scan" is on) is the AN before the WI splice.

## 6. Probability, groups, budget

Order per loop: candidate sort, then inclusion groups, then probability, then budget.

**Candidate sort** (`world-info.js:4994-5003`): sticky first, then position in the sorted entry list (section 11). Constant entries get no priority.

| Field / setting | Default | Behaviour | Source |
|---|---|---|---|
| `useProbability` | `true` | Off: no roll | `5030` |
| `probability` | `100` | Roll `random*100 <= p`. 100 never rolls. Sticky entries never re-roll. A failed entry is out for the rest of the generation | `5028-5055` |
| `group` | `''` | Comma-separated labels (`/,\s*/`) | `5392-5400` |
| `groupOverride` | `false` | Prioritized member with the highest `order` wins outright | `5444-5448` |
| `groupWeight` | `100` | Weighted random among the group | `5452-5468` |
| `useGroupScoring` | `null` | `null` uses the global setting. Scoring keeps only the members with the highest key-match count | `5291-5328`, `getScore` `428-473` |
| `ignoreBudget` | `false` | Inserted after overflow | `5017-5026`, `5061` |

**Group winner** (`filterByInclusionGroups`, `5388-5475`), per label:

1. Sticky members win; the rest are removed. Cooldown and delay members are removed (`5338-5374`).
2. Scoring, when enabled globally or on any member: lower scorers among scored members are dropped (`5291-5328`). Score = primary hits, plus secondary hits for AND_ANY, or for AND_ALL when every secondary matched (`461-470`). Skipped when a sticky member exists.
3. If an entry whose `group` string equals this label already activated in an earlier loop, every member is dropped (`5431-5435`). The check compares the whole `group` string: an earlier winner labelled `a,b` does not block label `a`.
4. One member: kept. Otherwise prioritized winner, else weighted roll.

Groups run before probability: a winner that then fails its roll leaves the group empty.

**Budget** (`4736-4741`, `5056-5076`): `budget = round(budget% * maxContext / 100) || 1`, capped by `budget_cap`. Each entry's macro-substituted content is appended to a running string; when tokens of the earlier loops' recursion text plus this loop's text reach the budget (`>=`), the entry is not added and overflow is set. After overflow only `ignoreBudget` entries are added, and recursion stops (`5097`). The entry that overflows still counts toward this loop's text. Text from `preventRecursion` entries is not carried into later loops' count (`5080`, `5139-5143`).

Priority under budget is therefore: sticky, then chat lore, persona lore, then character/global by strategy, each by descending `order` (`4625`).

## 7. Timed effects

| Field | Default | Behaviour | Source |
|---|---|---|---|
| `sticky` | `null` | Stays active N scan-chat messages after activating; ignores cooldown and probability; wins its group | `world-info.js:4854`, `4899`, `5036`, `5345` |
| `cooldown` | `null` | Cannot activate for N messages after activating; starts when sticky ends | `518-529`, `4854` |
| `delay` | `null` | Cannot activate while the scan chat has fewer than N messages | `665-676` |

- **Storage**: `chat_metadata.timedWorldInfo.{sticky,cooldown}["<world>.<uid>"] = {hash, start, end, protected}` (`557-576`, `593-611`). Delay is computed, not stored. Counts are scan-chat lengths, so system and hidden rows never count.
- **Rollback**: a record whose `start` is not behind the current scan-chat length is deleted (swipe, delete) (`626-629`).
- **Edits**: a record is matched to its entry by a hash of the whole entry JSON (`624`, hash at `4630-4633`). After any change to the entry (content, keys, `disable`, any field), the record no longer matches: it stops applying, and because a record still sits under `world.uid`, a new one cannot be armed (`718`) until the old `end` passes and it is swept (`632-637`). Net effect: an edit suspends the running sticky/cooldown and blocks re-arming for the rest of that window.
- **Dry runs** (token counts, prompt preview) neither read nor set sticky/cooldown (`682-686`, `730-731`), so a dry run shows sticky entries missing.
- `/wi-set-timed-effect` and `/wi-get-timed-effect` read and write the state (`1906-1990`).

## 8. Filters and triggers

| Field | Default | Behaviour | Gotchas | Source |
|---|---|---|---|---|
| `characterFilter.names` | `[]` | Include (or exclude with `isExclude`) by avatar file name without extension | Not the display name. With no current character (`getCharaFilename()` null) an include filter never passes | `world-info.js:4816-4824`, `utils.js:1342-1347` |
| `characterFilter.tags` | `[]` | Include/exclude by tag id | Silently passes when the character has no tag map entry | `4826-4843` |
| `characterFilter.isExclude` | `false` | Inverts both checks | | `4818`, `4835` |
| `triggers` | `[]` | Restrict to generation types: `normal, continue, impersonate, swipe, regenerate, quiet` | Empty = all. Any other type (e.g. `appendFinal`) scans as `normal` | `4806-4813`, `constants.js:36-43`, `script.js:4633` |

**Groups**: each member is drafted with `setCharacterId(chId)` (`group-chats.js:1054`), so the current character, and with it `characterFilter`, the character lorebooks and `{{char}}` in keys and content, is the drafted member for that generation.

## 9. Vector Storage activation

Enabled by `vectors.enabled_world_info` (default `false`, `extensions/vectors/index.js:117`). It runs as a generate interceptor before the scan and never for quiet generations (`776-781`, `791-793`).

- Candidates: entries from `getSortedEntries` that are enabled, non-empty, and `vectorized` (or every entry with `enabled_for_all`) (`1623-1670`).
- Query: the last `query` messages (default 2), macro-substituted, not the scan depth (`901-924`, `93`).
- Top K is `max_entries` (default 5) across all books together, after the score threshold (default 0.25) (`src/endpoints/vectors.js:407-421`).
- Hits are matched back by **content hash**: two entries with identical content both activate (`1706-1716`, matched by `getStringHash(entry.content)`).
- Activation is `WORLDINFO_FORCE_ACTIVATE` (`1725`): gates 1-9, groups, probability and budget still apply. `vectorized` does not disable keys.

## 10. Match sources

Each `match*` flag (default `false`) appends that text to this entry's buffer (`world-info.js:299-316`); data from `script.js:4626-4634`.

| Field | Text appended |
|---|---|
| `matchPersonaDescription` | persona description |
| `matchCharacterDescription` | current character's description |
| `matchCharacterPersonality` | personality |
| `matchCharacterDepthPrompt` | character depth prompt (character note) |
| `matchScenario` | scenario |
| `matchCreatorNotes` | creator notes |

They are appended after the depth slice, so they are lost at depth 0 like everything else.

## 11. Book sources and loading

| Source | Stored at | Read by | Skipped when |
|---|---|---|---|
| Global | `selected_world_info` (live); `world_info.globalSelect` is a debounced mirror | `getGlobalLore` `world-info.js:4527-4542` | never |
| Chat | `chat_metadata.world_info` | `getChatLore` `4544-4562` | the book is global |
| Persona | `power_user.persona_description_lorebook` (set per persona, `personas.js:914`) | `getPersonaLore` `4564-4588` | the book is the chat book or global |
| Character primary | card `data.extensions.world` | `getCharacterLore` `4475-4525` | the book is global, chat or persona |
| Character extra | `world_info.charLore[{name: avatarFile, extraBooks}]` | same, `4487-4491` | same |
| Embedded `character_book` | inside the card | **never scanned**. "Import Card Lore" converts it to a book file and links it as the primary book (`5731-5770`, `convertCharacterBook` `5617-5670`); the import prompt appears once per card (`5691-5729`) | |

**`getSortedEntries`** (`4590-4644`): loads the four sources in parallel, emits `WORLDINFO_ENTRIES_LOADED` with the four arrays, then sorts: chat lore, persona lore, then character/global by strategy, each by descending `order` (`4606-4625`). It parses decorators and stamps the hash after the event (`4627-4634`), so a listener's change to an entry is part of its hash. It returns a deep clone (`4639`).

It runs on every scan, on every `CHAT_CHANGED` as a pre-cache (`1013-1018`, before any extension's chat hydrate), on every Vector Storage WI activation (`extensions/vectors/index.js:1629`) and whenever an extension calls it.

**Cache and names**:

- `loadWorldInfo(name)` serves `worldInfoCache` (clone on get, `882`) and fetches otherwise (`2036-2059`). The server answers a missing name with a dummy `{entries:{}}` (`src/endpoints/worldinfo.js:17-30`, `71-79`), and the client caches it (`world-info.js:2054`): a later import of that name stays shadowed until the cache entry is evicted. Check existence with `world_names`.
- `saveWorldInfo` updates the cache at once (`4183`); a non-immediate save is debounced (`83`, `4189`). `_save` never reads the server's answer (`4151-4161`).
- `createNewWorldInfo` checks only the client `world_names`, writes `{entries:{}}`, and does not select the book (`4448-4470`).
- `deleteWorldInfo` evicts the cache and deselects the book (`4346-4393`); a raw `/api/worldinfo/delete` does neither.
- The book name is the sanitized file name (`src/endpoints/worldinfo.js:24`, `151`); an import takes its name from the uploaded file (`102`).
- `/world` splits its argument on commas (`world-info.js:5776`).

## 12. Events

| Event | When | Payload | Source |
|---|---|---|---|
| `WORLDINFO_ENTRIES_LOADED` | inside every `getSortedEntries`, before sorting | `{globalLore, characterLore, chatLore, personaLore}`, mutable. Listeners may push, remove or edit; `emit` awaits each listener in order (`lib/eventemitter.js:146`) and `makeFirst`/`makeLast` place one (`66`, `90`) | `world-info.js:4604` |
| `WORLDINFO_SCAN_DONE` | after each loop | mutable `state.next`, `activated.text`, `recursionDelay.currentLevel`, `budget.{current,overflowed}` | `5149-5186` |
| `WORLD_INFO_ACTIVATED` | after a non-dry scan that activated something | array of activated entries | `900-903` |
| `WORLDINFO_FORCE_ACTIVATE` | you emit it | entries with `world` and `uid`; held in a static map and activated by the next scan, which clears the map at its end, dry runs included (`5275`) | `1020-1029`, `203` |
| `WORLDINFO_UPDATED` | after `_save` | `(name, data)` | `4160` |
| `WORLDINFO_SETTINGS_UPDATED` | global selection or settings change | none | `5842`, `6228` |

Entries in the loaded arrays are shallow copies (`{uid, world, ...rest}`, `4537`); top-level writes are scan-local, but nested arrays (`key`, `characterFilter`) can still be the cached objects on a first load.

## 13. Automation

| Field | Default | Behaviour | Source |
|---|---|---|---|
| `automationId` | `''` | On `WORLD_INFO_ACTIVATED`, every Quick Reply (global, chat or character set) with the same automation id runs | `extensions/quick-reply/index.js:299-302`, `src/AutoExecuteHandler.js:84-100` |

It fires after a non-dry scan, before the reply is generated, and only for entries that survived budget.

---

## 14. How Story Orchestrator layers on top

SO never selects a story book globally and never edits a book outside the paths below. The extension's own LLM passes run no scan.

### 14.1 Story-scoped lore (`runtime/storyLore.ts`, `storyLoreHost.ts`)

- A story's `requirements.lorebooks` (memory mirror books excluded, deduped by file id) are appended to the `globalLore` array of every scan of the chat that story was loaded into (`storyLore.ts:37-51`, `56-69`).
- The handler is the FIRST `WORLDINFO_ENTRIES_LOADED` listener and is awaited (`services/stHost/worldInfoScan.ts:39-50`, `stHost/worldInfoEvidence.ts:57-65`), so every later listener, the vector pass and the scan see the books as loaded. Order is re-asserted with `makeFirst`; without `makeFirst`/`makeLast` the feature is off (`storyLoreHost.ts:22-23`).
- A book any array already holds (the user's own global, chat, persona or character binding) is not appended twice (`storyLore.ts:59-63`).
- Ownership is re-read after the async load; a chat or story switch mid-load appends nothing (`storyLore.ts:85-89`).
- Appended entries keep their real `world` and `uid`, so force-activation, timed effects (`world.uid`) and evidence match them as ST's own.
- A library story's book that is still selected globally is surfaced for the author (`globalStoryBooks`, `storyLore.ts:104-108`); the fix deselects only after a confirm (`storyLoreHost.ts:37-55`).

### 14.2 Checkpoint `world_info`: the gated set (`runtime/worldInfoGates.ts`, `engine/worldInfoEffects.ts`)

- Effect shape: `{enable|disable: [{lorebook, comments}]}` on checkpoints, quest rewards and agenda steps (`engine/worldInfoEffects.ts:14-35`). Entries are matched by trimmed `comment`, first entry only; books by file id, case-insensitive (`runtime/worldInfoMatch.ts:7-24`).
- Every entry any of these names is the story's **gated set** (`worldInfoEffects.ts:45-58`). Entries outside it are never touched.
- **Path replay** (`worldInfoGates.ts:21-36`): the whole set starts off; each checkpoint on the chat's path applies enables then disables, in order. A continuous run and a reopened chat end the same.
- **Release** (`worldInfoGates.ts:42-48`): leaving or swapping a story disables every library story's gated entries except those the incoming story gates.
- Not-ready requirements skip world info entirely (`runtime/effectsApplier.ts:201-202`).

### 14.3 File mode vs scan mode

| | File mode | Scan mode |
|---|---|---|
| Setting | `worldInfo.gatingMode = "file"`, only as the author's own choice (install-wide settings store only what the user set, F15), or the fallback when the scan capability is absent | `"scan"`, **the default since 2026-10-09** (R7); active only once the scan handler is seen on a probe scan (`stHost/worldInfoScan.ts:56-69`) and gated entries are normalized to rest off (`runtime/worldInfoNormalize.ts`). The first normalization needs no confirm and toasts counts only; switching from file to scan keeps the confirm (`runtime/worldInfoGating.ts`) |
| How | `setWIEntriesState` writes `disable` into the book files, one load, save and read-back per book, and no write at all when no entry's state would change (R13; `runtime/effectSteps.ts` `applyWorldInfo`, `stHost/worldInfo.ts`) | The LAST `ENTRIES_LOADED` listener flips `disable` on the per-scan copies (`runtime/scanGatePlan.ts:74-121`, `runtime/worldInfoScan.ts:26-58`); no file write |
| Cross-chat leak | The flags are global file state; a guard on the scan copies (`runtime/worldInfoScanGuard.ts:33-64`) re-applies the right plan for the chat being scanned | none by construction |
| Timed effects | each file toggle changes the entry hash (section 7) | only the copy's hash; an "on" entry hashes the same every scan. The gate never adds a `disable` key the copy lacks (`scanGatePlan.ts:71-81`) |
| Memory mirror | bound to the chat lorebook slot | appended to `chatLore` at scan time, never bound (14.5) |
| Exclusive lore-select | refused (`not-scan`) | allowed (14.4) |

`worldInfoFilesHeld()` stops file writes while scan mode is active or still settling (`runtime/worldInfoMode.ts:31`; used at `effectsApplier.ts:202`, `296`, `341`).

The normalizer writes `disable: true` only on gated entries of listed books and records what each was (`normalizedFrom`), so a story's removal can offer them back; an entry outside every gated set is never written, whatever its state. An install that never chose file mode stores no `gatingMode`, so it reads the scan default.

### 14.4 Lore-select and exclusive (`runtime/loreSelect.ts`, `loreExclusive.ts`, `judge/lore.ts`)

- Story field `lore_select: {lorebooks, top_k?, min_p?, exclusive?, position?}` (`engine/schema.ts:419-424`); `top_k` 1-12 (rounded), `min_p` 0-1 (`engine/validate/storyOptions.ts:86-108`). Defaults: `top_k` 4, `min_p` 0.6, chunk 64 entries, content clipped to 600 chars, 1500 ms timeout (`judge/policy.ts:60-65`).
- Candidates: entries of the listed books that are enabled, non-constant and non-empty (`judge/lore.ts:42-45`). Fields read: `world`, `uid`, `comment`, `content`, `disable`, `constant`.
- Left to ST's own scan, never rated (R12, `runtime/loreKeyMatch.ts`): an entry the keyword scan is certain to activate for this generation (scan buffer read as ST builds it: non-system messages newest first, `Name: text` with Include Names, the swiped reply dropped on a swipe; `scanDepth` or the global depth, case, whole words, regex keys, secondary logic), and an entry whose primary key equals the drafted member's card name or roster alias. "Certain" excludes any entry with probability < 100, an inclusion group, a character filter, triggers, delay, cooldown, `delayUntilRecursion`, a leading decorator or a macro in a key; budget overflow is not predicted. Measured on Saga chats (263 candidates): 5.00 -> about 4.9 judge calls per reply.
- The judge rates each candidate against the active checkpoint's name, objective and recent window; picks with `p >= min_p`, highest first, at most `top_k` (`judge/lore.ts:50-83`).
- Picks are forced with `WORLDINFO_FORCE_ACTIVATE` for the next scan only (`stHost/worldInfoActivate.ts:16-25`). Runs in the generate interceptor before the scan, or on `MESSAGE_SENT` when the generation adds the user message; never for dry or quiet runs (`runtime/loreSelectTiming.ts:15-37`). Cached per chat, story revision, message, scope, generation type and drafted member (`loreSelect.ts`).
- Forced picks still pass gates 1-9, groups, probability and budget. Judge use `loreSelect` is on by default (`judge/settings.ts:72-74`).
- **Exclusive** (`loreExclusive.ts:37-88`) disables, on the scan copies, every unpicked entry of the `lore_select` books. Needs: judge use `loreExclusive` (depends on `loreSelect`), scan mode, `exclusive: true`, a loud generation, Vector Storage WI off, and a complete selection for this chat, story revision and message. Never suppressed: picked, left to the scan (R12), constant, checkpoint-gated, timed (`sticky`/`cooldown`/`delay` > 0), already disabled, or entries without a `disable` key. In file mode it is refused (`not-scan`).

### 14.4b Late lore placement (`runtime/lorePlacement.ts`, v2.8 B1-PFX)

- On the scan copies only (scan mode, after the gate and exclusive; never a file write), for the chat the story was loaded into: every enabled, non-constant entry of the story's books (`requirements.lorebooks` plus `lore_select.lorebooks`, never the mirror or another book) at position 0 (before char) or 1 (after char) is moved to position 4, role system: after-char entries to depth `worldInfo.lateLoreDepth` (default 4), before-char entries one deeper, so the two groups keep the order the story string gave them. Text, `order`, keys and every other field are unchanged, and the move is the same on every scan, so the entry hash (sticky/cooldown) is stable while the setting holds.
- Why: the story string (system, wiBefore, card, wiAfter, persona) is the start of every prompt; a keyword entry that comes and goes changes it on every new message, so llama-server reuses nothing (B1-PFX pod 2 2026-10-10: reuse p50 0, first difference about 1.1K tokens in). At depth 4 the first per-turn difference is a few messages from the end.
- Install switch `worldInfo.lateLore` (default on, Author view `#so-wi-late-lore`); a story keeps authored positions with `lore_select.position: "authored"`. Forced lore-select picks come from `getSortedEntries`, which runs the same handler, so they carry the moved position. A WI regex script with a depth range now sees the moved entries at their depth. Turning the setting off mid-chat changes the hash of the moved entries once, which ends a running sticky/cooldown on them. Debug: `storyOrchestratorScanGating.lastPlacement()`.

### 14.5 Memory mirror (`runtime/memoryMirror.ts`, `mirrorScan.ts`)

- One book per chat: `Story Orchestrator - <title> - <chatId>` (`memoryMirror.ts:61`, `mirrorReaper.ts:12`), created with `ensureLorebook`. Only live `relationship` rows are mirrored (`memoryMirror.ts:66-67`), comment `so_<id>`, keys = the row's entities, written with `upsertWIEntry` (`138`).
- `upsertWIEntry` writes `comment`, `content`, `key`, optional `constant`, and always sets `disable = false` (`stHost/worldInfo.ts:255-276`). New entries take the template defaults (position 0, order 100). Stale rows are disabled, never deleted (`memoryMirror.ts:118-127`).
- File mode: bound to the chat lorebook slot, unless the user's own book holds it (`memoryMirror.ts:161-164`). Scan mode: the slot is released and the enabled `so_` entries are appended to `chatLore` for the owning chat only, unless the book is already in a scan array (`mirrorScan.ts:17-33`, `runtime/worldInfoScanHost.ts:140-143`). The copy refreshes on `WORLDINFO_UPDATED` (`worldInfoScanHost.ts:166`, `mirrorScan.ts:97-102`).

### 14.6 Stagecraft curator (`src/stagecraft/*`, `runtime/coordinators/stagecraftCoordinator.ts`, `runtime/curatorWriter.ts`)

- Write scope: only `stagecraft.lorebooks`, minus checkpoint-gated entries and `stagecraft.exclude` (`stagecraft/scope.ts:7-37`). Only entries with a non-empty `comment` are shown (`scope.ts:39-49`).
- Ops: `enable`, `disable`, `rewrite`, `patch` (`stagecraft/types.ts:26-31`); no create op in play. Applied at a boundary through `updateWIEntryByUid`, which writes only `content` and `disable` by uid (`curatorWriter.ts:47-87`, `stHost/worldInfo.ts:322-345`). A text op keeps the entry's current `disable` state (`curatorWriter.ts:76`). Keys, position, order and every other field are never written.
- Re-checked at the write edge: allowlist, gated/excluded, the live comment, protected spans (`curatorWriter.ts:52-74`).
- Markers in content (ST strips `{{// …}}` before any prompt, `macros.js:659`, `macros/definitions/core-macros.js:281-297`): `{{// so:auto}}` makes the entry auto-acceptable in accept mode `auto`; `{{// so:protect}}…{{// so:end}}` is a span no op may touch; an op that adds a marker is refused (`stagecraft/curatorTiers.ts:5`, `61-104`).
- Every applied op records the pre-write content and flag, so a rollback restores them (`curatorWriter.ts:75-79`, `110-140`).

### 14.7 Evidence, fired lore, warden lore

- `stHost/worldInfoEvidence.ts:42-78` observes `WORLD_INFO_ACTIVATED` and `ENTRIES_LOADED` first and last. Read-only.
- `runtime/worldInfoEvidence.ts` keeps a per-loud-generation ring. Flags: `lore-force-lost` (a forced pick no loud scan activated) and `lore-constant-missed` (a gated constant the plan switched on that did not fire) (`69-71`, `127-152`). A story book present in the first view and gone from the last is counted as hidden by another listener; two loud generations raise it (`10`, `256-268`, `334-336`).
- `runtime/loreFired.ts` stores, per rendered reply, which entries fired and how (`constant`, `key`, `forced`, `mirror`, plus `gated`), no text, capped at 100 and rolled back by message (`4-64`).
- Warden lore check (`wardenLore`, needs the warden): its own judge call over the text of story-book entries that fired for that reply (`runtime/continuity.ts:76`, `runtime/managerWiring.ts:147`). Text is kept in memory only, and only for story books, never the mirror or a foreign book (`runtime/worldInfoEvidence.ts:226-243`).

### 14.8 Requirements and memory scanning

- A required lorebook is met when ST scans it for this chat: global, chat slot (not the chat's own mirror in file mode), persona, a book bound on every enabled member, or listed on the story when story-scoped lore is active (`runtime/requirementsRead.ts:28-40`). In file mode a chat slot held by another book is reported as a conflict (`42-46`).
- `worldInfo.scanMemory` (default `true`, `settingsModel.ts:135`) registers three SO blocks with `scan: true`: established facts, scene history, checkpoint guidance (`constants/injectionRegistry.ts:16`, `19`, `25`, `runtime/scanMemory.ts:3-6`, `stHost/extensionPrompts.ts:44-51`). Their text can key-match entries. Private per-member knowledge is never scannable.

### 14.9 Extension stance per ST capability

| ST capability | SO | Note |
|---|---|---|
| `constant` | respected | Exclusive never suppresses constants; evidence flags a gated constant that did not fire |
| Keys, secondary keys, regex, whole words, case | respected; never read by SO | Lore-select ignores keys entirely |
| Macros in keys/content | used | `{{story_*}}` macros resolve in entries; `{{// so:…}}` markers ride the comment macro |
| Scan depth, include names | respected | `scanMemory` blocks join the inject buffer, which depth 0 still blanks |
| Recursion flags | respected | Forced picks and appended story lore recurse like any entry |
| `position`/`depth`/`role`/`order` | respected; written only as template defaults by `upsertWIEntry` | Curator and gates never change placement; late lore placement (14.4b) moves story-book per-turn entries to depth on the scan copies |
| AN positions | respected | Subject to the AN interval like any entry |
| `probability`, groups | respected | A forced pick can lose its group or its roll; evidence reports it as `lore-force-lost` |
| Timed effects | respected; conflicts in file mode | Every file write (gate toggle, curator op, mirror upsert, author edit) changes the hash and suspends a running sticky/cooldown (section 7). Exclusive leaves timed entries alone |
| `characterFilter`, `triggers` | respected | Appended story lore keeps its filters; a forced pick filtered out for the drafted member does not land |
| Budget, `ignoreBudget` | respected | Story lore joins `globalLore`, so it has global-lore budget priority |
| `disable` | used | File mode writes it to files; scan mode and exclusive write it on scan copies; mirror upsert forces it `false` |
| Vector Storage WI | coexists | Exclusive refuses while it is on; vectors see appended story lore because they call `getSortedEntries` |
| Match sources, outlets, `automationId`, decorators | ignored | Untouched; an `@@activate` entry in a gated book still fires when enabled |
| Book sources | used | Story books via append, mirror via chat slot (file) or `chatLore` append (scan); never global selection |
| `ENTRIES_LOADED` | used | First listener: story lore + evidence; last: scan gate or file-mode guard, mirror append, exclusive, late lore placement, evidence |
| `FORCE_ACTIVATE` | used | Lore-select only |
| `WORLD_INFO_ACTIVATED`, `WORLDINFO_UPDATED` | used | Evidence; mirror copy refresh |

---

## 15. Authoring implications

- [ ] Write every entry field; never rely on editor backfill. Set `position` explicitly.
- [ ] Give every entry a unique, stable, non-empty `comment`; SO finds entries by comment, first match wins.
- [ ] Keys: lowercase plaintext, plus plurals and forms; regex keys carry `i`; escape `/` inside regex; do not anchor regex with `^` per message (the buffer prefixes `\x01`).
- [ ] With whole words on, multi-word keys are substrings and single-word keys break on accented or non-Latin letters.
- [ ] A participant's name as a key fires on every message they write (Include Names).
- [ ] Never use `scanDepth: 0` expecting AN or recursion matches; depth 0 blanks the whole buffer.
- [ ] Constant entries ignore secondary keys; use a non-constant entry for conditional lore.
- [ ] Use @D (position 4) at shallow depth for steering; avoid AN positions unless the AN interval is 1.
- [ ] Lower `order` sits earlier in a slot and loses budget ties; outlets reverse this.
- [ ] Mark instruction entries `preventRecursion`; mark chat-only entries `excludeRecursion`.
- [ ] Inclusion groups: use one label per entry when "already won" blocking matters; remember a group winner can still fail its probability roll.
- [ ] Sticky/cooldown: do not gate such an entry with checkpoint `world_info` in file mode, and do not let the curator write it, or each write suspends the effect.
- [ ] `characterFilter.names` takes avatar file names; in a group it is evaluated against the drafted member.
- [ ] Embedded `character_book` must be imported and linked before it scans; set `selective: true` on its entries.
- [ ] List story books in `requirements.lorebooks` and do not select them globally; SO loads them only in the story's chats.
- [ ] Checkpoint-gated entries: name them by exact comment; they rest off and are rebuilt from the path; keep them out of `stagecraft.lorebooks` writes (they are hidden from the curator anyway).
- [ ] `lore_select` books: write self-contained content (the judge sees at most 600 chars and the title), keep general world overviews out or constant, and keep the book list to books that matter scene by scene.
- [ ] `exclusive` only acts in scan mode; constant, gated and timed entries in those books always survive it.
- [ ] Curator books: protect fixed wording with `{{// so:protect}}…{{// so:end}}`; mark freely editable entries `{{// so:auto}}`.
- [ ] With `scanMemory` on, memory and guidance text can trigger entries; choose keys that should not fire from summaries.
- [ ] Verify with evidence (activated entries, the payload), never by reading the book flags.

## 16. Where other docs disagree with the source

| Claim | Says | Source says |
|---|---|---|
| `worldinfo.md:38` | Sorted Evenly is the default strategy | Character first: `world-info.js:80`, `default/content/settings.json:21` |
| `worldinfo.md:291` | Depth 0 still evaluates recursion and the AN | `get` returns `''` first: `world-info.js:281-283` |
| `worldinfo.md:322` | Constant entries are inserted first under budget | Sticky, then sorted-list position: `world-info.js:4994-5003` |
| `worldinfo.md:121` | AN positions are ignored only when the AN frequency is 0 | Also on every off-interval turn: `authors-note.js:351-362` |
| skill `SKILL.md:70-71`, `activation-internals.md` §7 (fixed 2026-10-09) | An edit clears a running sticky/cooldown | It suspends it and blocks re-arming until the old end: `world-info.js:624-637`, `718` |
| skill `SKILL.md:105-106` (fixed 2026-10-09) | `requirements.lorebooks` accepts only globally selected books | Global, chat, persona, every member, or story-listed: `runtime/requirementsRead.ts:31-40` |
| skill `SKILL.md:141`, `155-158` (fixed 2026-10-09) | `activateGlobalLorebook` exists; the curator upserts and re-disables | Gone; the curator writes content/flag by uid and keeps the flag: `runtime/curatorWriter.ts:76-81` |
| skill `SKILL.md:163-164`, `activation-internals.md` §2 (fixed 2026-10-09) | SO blocks are `scan: false` | Three blocks scan by default: `constants/injectionRegistry.ts:16,19,25`, `runtime/settingsModel.ts:135` |
