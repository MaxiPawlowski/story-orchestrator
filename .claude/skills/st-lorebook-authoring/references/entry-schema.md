# Lorebook JSON schema: every field, enum and default

Open this when you are writing or reading lorebook JSON by hand, converting a card's embedded
`character_book`, or scripting `/setentryfield`. The source of truth is
`newWorldInfoEntryDefinition` (`public/scripts/world-info.js:4082-4125`). All paths below are under
`C:\dev\SillyTavern-MainBranch\`. For what each feature *means*, read
`.claude/sillytavern-docs/worldinfo.md`. This file covers the storage shape.

## Book file

```json
{ "entries": { "0": { "uid": 0, "...": "..." }, "1": { "uid": 1, "...": "..." } } }
```

- Stored as `data/<user>/worlds/<name>.json`. **The book name is the file name**: the server sanitizes
  `<name>.json` (`src/endpoints/worldinfo.js:24,151`), and an import takes its name from the uploaded
  file's name, not from its contents (`public/scripts/world-info.js:5896-5897`,
  `src/endpoints/worldinfo.js:102`).
- `entries` is required. `/edit` and `/import` reject a body without it
  (`src/endpoints/worldinfo.js:116,144`). Optional top-level keys: `name` (only `/api/worldinfo/list`
  reads it, `worldinfo.js:55`), `extensions`, and `originalData` (written when a card book is imported).
- **Object key must equal `String(uid)`.** Slash commands index `data.entries[uid]`
  (`world-info.js:1381`), and a new uid is the first integer that isn't already a key
  (`world-info.js:4395-4409`).
- Keep names plain: letters, digits, spaces and dashes. `createNewWorldInfo` checks the sanitized name
  but saves under the raw one (`world-info.js:4455-4462`). `/world` also splits its argument on commas
  (`world-info.js:5776`), so a book name that contains a comma can't be toggled with it.

## Entry fields

"UI" is the label in the entry editor (`public/index.html:6840-7210`). "Card book key" is the
`character_book` (V2 card spec) name, from `originalWIDataKeyMap` (`world-info.js:2687-2724`) and
`convertCharacterBook` (`world-info.js:5626-5670`).

| Field | Type / default | UI | Notes | Card book key |
|---|---|---|---|---|
| `uid` | int | shown next to token count | Must match the object key | `id` |
| `key` | string[] / `[]` | Primary keywords | Plaintext or `/regex/flags`. Macros are substituted before matching (`4915`). An empty array means only constant, sticky, decorator or forced activation (`4905-4908`) | `keys` |
| `keysecondary` | string[] / `[]` | Optional Filter | Evaluated only if `selective` is true and the array is non-empty (`4924-4928`). **Ignored for constant entries** (`4893-4897` returns first) | `secondary_keys` |
| `selectiveLogic` | enum / `0` | logic dropdown | `0` AND_ANY, `1` NOT_ALL, `2` NOT_ANY, `3` AND_ALL (`33-38`) | `selectiveLogic` |
| `selective` | bool / `true` | none | Leave true. False silently disables the secondary filter | `selective` |
| `comment` | string / `''` | Title/Memo | Never sent to the model. **Our code identifies entries by it** (see SKILL.md, Project hooks) | `comment` |
| `addMemo` | bool / `false` | none (legacy) | `/createentry` sets it true along with `comment` (`1329-1330`). Set it true whenever there's a comment | none |
| `content` | string / `''` | Content | The only text inserted. Macros are substituted at activation (`5058`). World Info regex scripts run at insertion (`5205`). Empty after that means skipped (`5207-5210`) | `content` |
| `constant` | bool / `false` | Strategy 🔵 | Always activates; skips keys and secondary keys | `constant` |
| `vectorized` | bool / `false` | Strategy 🔗 | Marks the entry for Vector Storage, which force-activates it (`extensions/vectors/index.js:1725`). Keys still work | `extensions.vectorized` |
| `disable` | bool / `false` | on/off toggle | Disabled entries are skipped before any other check (`4801-4804`) | `enabled` (inverted) |
| `position` | enum / `0` | Position | See the enum below. **Required in practice.** A missing value means the entry activates but is inserted nowhere (`5212-5261`, no default case) | `extensions.position` |
| `depth` | int / `4` | Depth | Used only when `position: 4`. 0 is the bottom of the chat | `extensions.depth` |
| `role` | enum / `0` | the @D ⚙️/👤/🤖 choice | `0` system, `1` user, `2` assistant (`index.html:7192-7200`, `script.js:494-498`). Only used at `position: 4`; null falls back to system (`5236-5243`) | `extensions.role` |
| `order` | int / `100` | Order | Sorted descending, then unshifted, so **lower order is earlier in its slot and higher order is later** (`88`, `5203`). Also the budget and priority tiebreak | `insertion_order` |
| `outletName` | string / `''` | Outlet Name | Used only when `position: 7`. The text reaches the prompt only through `{{outlet::<name>}}` (`script.js:4674-4677`, `macros.js:668`) | `extensions.outlet_name` |
| `probability` | int / `100` | Trigger % | Rolled after inclusion groups. 100 never rolls. Sticky entries don't re-roll (`5028-5049`) | `extensions.probability` |
| `useProbability` | bool / `true` | Use Probability | False means the roll is skipped (`5030`) | `extensions.useProbability` |
| `group` | string / `''` | Inclusion Group | Comma-separated labels (`5392`) | `extensions.group` |
| `groupOverride` | bool / `false` | Prioritize | The prioritized member with the highest `order` wins (`5444-5448`) | `extensions.group_override` |
| `groupWeight` | int / `100` | Group Weight | Weighted random among group members (`5452-5465`) | `extensions.group_weight` |
| `useGroupScoring` | bool? / `null` | Group Scoring | null means use the global setting (`5313`) | `extensions.use_group_scoring` |
| `scanDepth` | int? / `null` | Scan Depth | Per-entry override. **0 means nothing can match** (`280-283`) | `extensions.scan_depth` |
| `caseSensitive` | bool? / `null` | Case-Sensitive | Plaintext keys only (`269`) | `extensions.case_sensitive` |
| `matchWholeWords` | bool? / `null` | Whole Words | Plaintext keys only. Multi-word keys match as a substring. Single-word keys use an ASCII `\W` boundary (`347-360`) | `extensions.match_whole_words` |
| `excludeRecursion` | bool / `false` | Non-recursable | Other entries can't activate this one. Only checked while recursion is on (`4870`) | `extensions.exclude_recursion` |
| `preventRecursion` | bool / `false` | Prevent further recursion | Its content isn't added to the recursion buffer (`5080`) | `extensions.prevent_recursion` |
| `delayUntilRecursion` | bool or int / `0` | Delay until recursion + Recursion Level | Truthy means recursion passes only. A number is the level (`4754-4757`, `4860-4868`). The editor writes `false`/`true`/a number | `extensions.delay_until_recursion` |
| `ignoreBudget` | bool / `false` | Ignore budget | Inserted even after the budget overflows (`5017-5026`) | `extensions.ignore_budget` |
| `sticky` / `cooldown` / `delay` | int? / `null` | Sticky / Cooldown / Delay | Counted in scan-chat messages. 0 or null means off. See activation-internals.md | `extensions.sticky` etc. |
| `automationId` | string / `''` | Automation ID | Any string, not only numbers. Runs Quick Replies that have the same id when the entry activates (`extensions/quick-reply/src/AutoExecuteHandler.js:87-92`) | `extensions.automation_id` |
| `triggers` | string[] / `[]` | Triggers | Subset of `normal, continue, impersonate, swipe, regenerate, quiet` (`constants.js:36-43`). Empty means all (`4807-4813`) | `extensions.triggers` |
| `matchPersonaDescription`, `matchCharacterDescription`, `matchCharacterPersonality`, `matchCharacterDepthPrompt`, `matchScenario`, `matchCreatorNotes` | bool / `false` | Additional matching sources | Append that text to this entry's scan buffer (`299-316`) | `extensions.match_*` |
| `characterFilter` | `{isExclude, names, tags}` | Filter to Characters or Tags | `names` = **avatar file names without extension**, not display names (`4816-4824`, `utils.js:1342-1347`). `tags` = **tag ids** (`4826-4843`, `1420`). In slash commands it's exposed as `characterFilterNames/Tags/Exclude` (`1407-1427`), which resolve names for you | `extensions.character_filter` |
| `displayIndex` | int | none | Editor sort only | `extensions.display_index` |

**Write every field.** Missing fields get backfilled only when the book is *displayed* in the editor
(`addMissingWorldInfoFields`, `2104-2124`, called at `2370`), and even then only in a clone. The scan
reads the raw file. A dry run (2026-09-18) confirmed that an entry without `position` matched its key
and produced no prompt text. Start from `../templates/minimal-lorebook.json`.

## Enums

```js
world_info_position = { before: 0, after: 1, ANTop: 2, ANBottom: 3, atDepth: 4, EMTop: 5, EMBottom: 6, outlet: 7 }  // world-info.js:855-864
world_info_logic    = { AND_ANY: 0, NOT_ALL: 1, NOT_ANY: 2, AND_ALL: 3 }                                           // world-info.js:33-38
role (extension_prompt_roles) = { SYSTEM: 0, USER: 1, ASSISTANT: 2 }                                              // script.js:494-498
world_info_insertion_strategy = { evenly: 0, character_first: 1, global_first: 2 }                               // world-info.js:27-31
```

The editor's position dropdown lists options in this order: ↑Char 0, ↓Char 1, ↑EM 5, ↓EM 6, ↑AN 2,
↓AN 3, @D⚙️ 4 with role 0, @D👤 4 with role 1, @D🤖 4 with role 2, then ➡️ Outlet 7
(`index.html:7173-7203`). **The dropdown order is not the numeric order.** EM is 5/6, not 2/3.

## Global activation settings

Read them live with `(await import('/scripts/world-info.js')).getWorldInfoSettings()`
(`world-info.js:795-812`). New installs take their values from `default/content/settings.json:14-22`.
The code's own fallbacks (`world-info.js:69-82`) differ in two places.

| Key | UI | Fresh install | Code fallback | Notes |
|---|---|---|---|---|
| `world_info_depth` | Scan Depth | 2 | 2 | Only the last 2 non-system messages. Most "doesn't fire" reports come from this |
| `world_info_budget` | Context % | 25 | 25 | % of the max context. Values over 100 reset to 25 (`946-947`) |
| `world_info_budget_cap` | Budget Cap | 0 | 0 | Hard token cap. 0 means off |
| `world_info_include_names` | Include Names | true | true | Prefixes `Name: ` to each scanned message (`script.js:4624`) |
| `world_info_recursive` | Recursive Scan | **true** | false | |
| `world_info_case_sensitive` | Case-sensitive keys | false | false | |
| `world_info_match_whole_words` | Match whole words | **true** | false | |
| `world_info_character_strategy` | Character Lore Insertion Strategy | **1 (Character Lore First)** | 1 | The official doc calls Sorted Evenly the default. Source says otherwise |
| `world_info_min_activations` / `_depth_max` | Min Activations / Max Depth | 0 | 0 | Can't be combined with max recursion steps |
| `world_info_max_recursion_steps` | Max Recursion Steps | 0 | 0 | |
| `world_info_use_group_scoring` | Use Group Scoring | false | false | |
| `world_info_overflow_alert` | Alert on Overflow | false | false | |

Live snapshot of *this* install (2026-09-18 dry run): depth 2, **recursion off, whole words off**,
strategy 1, include names on, budget 25. Don't design a test that depends on recursion until you've
checked this.

## Where books come from (all are scanned together)

| Source | Stored at | Set by |
|---|---|---|
| Global | `selected_world_info` (live array, `world-info.js:66`). `world_info.globalSelect` is only a debounced mirror of it (`83-87`) | World Info drawer selector, `/world` |
| Character primary | card `data.extensions.world` (`4481-4484`) | Character panel globe button, `/getcharbook create=true` |
| Character extra | `world_info.charLore[{name: avatarFile, extraBooks}]` (`4487-4491`) | Globe button, "additional" |
| Chat | `chat_metadata.world_info` (`METADATA_KEY`, `94`, `4544-4562`) | Chat's book button, `/getchatbook` |
| Persona | `power_user.persona_description_lorebook` (`4564-4588`) | Persona panel |

A book bound in several places is loaded once: character and persona sources skip a book that's
already global or chat-bound (`4499-4512`, `4551-4553`, `4572-4580`). In group chats, character lore
and character filters follow the member being drafted, because `setCharacterId(chId)` runs per member
(`group-chats.js:1054`).
