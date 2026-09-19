# Card fields: V2 shape, create keys, prompt behaviour

Open this when you need the exact key for a field, want to know what ST does with a field when it builds the prompt, or sent a value and got a different one back. What each field is *for* is covered in `.claude/sillytavern-docs/characterdesign.md` and is not repeated here.

Path convention: `st:` means `C:\dev\SillyTavern-MainBranch\`. Bare paths are relative to this extension's root.

## 1. The V2 card ST reads and writes

- ST's own type for the card is `st:src/types/spec-v2.d.ts:1-23`. The server validator requires these `data` keys: `name, description, personality, scenario, first_mes, mes_example, creator_notes, system_prompt, post_history_instructions, alternate_greetings, tags, creator, character_version, extensions`. `alternate_greetings` and `tags` must be arrays and `extensions` must be an object (verified: st:src/validator/TavernCardValidator.js:104-122).
- `character_book` is optional. When it is present, it needs `extensions` (object) and `entries` (array) (verified: st:src/validator/TavernCardValidator.js:124-141).
- V1 cards only need the six top-level fields `name, description, personality, scenario, first_mes, mes_example` (verified: st:src/validator/TavernCardValidator.js:55-64). V3 (`chara_card_v3`, `spec_version` 3.x) is accepted with any `data` object (verified: st:src/validator/TavernCardValidator.js:143-167).
- **ST writes both shapes at once.** Top-level V1 fields plus `creatorcomment`, `avatar: "none"`, `chat`, `talkativeness`, `fav` and `tags`, then `spec`, `spec_version` and `data.*` (verified: st:src/endpoints/characters.js:580-617).
- **On read, `data.*` wins.** `readFromV2` copies `data.name/description/personality/scenario/first_mes/mes_example/tags` and `data.extensions.talkativeness/fav` over the top-level fields (verified: st:src/endpoints/characters.js:504-557). If you hand-edit an exported JSON, edit `data.*`. Editing the top-level mirror alone does nothing.
- **PNG storage.** The card is base64 JSON in a `chara` tEXt chunk, plus a `ccv3` copy with only `spec`/`spec_version` changed. On read, `ccv3` takes precedence (verified: st:src/character-card-parser.js:15-46, 54-78). An external tool that patches only `chara` will be ignored.
- A validated minimal card is in `templates/test-card.v2.json`. Checked with ST's own validator: `validate()` returns `2`.

## 2. Field table

| V2 path | UI label | `/api/characters/create` key | `/char-create` arg | What ST does with it |
|---|---|---|---|---|
| `data.name` | Name | `ch_name` | `name` | Becomes `{{char}}`. **Sanitized on create**: `/ ? < > \ : * \| "`, control characters and trailing dots or spaces are stripped (verified: st:src/endpoints/characters.js:1028, st:node_modules/sanitize-filename/index.js:33-36). The avatar filename is the sanitized name, with `1`, `2`… appended if taken (verified: st:src/endpoints/characters.js:1543-1547). |
| `data.description` | Description | `description` | `description` | Always in the prompt (permanent). |
| `data.personality` | Personality summary | `personality` | `personality` | Always in the prompt. Chat Completion wraps it in `personality_format`, default `{{personality}}` (verified: st:public/scripts/openai.js:113, 1369). |
| `data.scenario` | Scenario | `scenario` | `scenario` | Always in the prompt. **Overridden by `chat_metadata.scenario`** (the group or chat scenario override) (verified: st:public/script.js:3441-3445). |
| `data.first_mes` | First message | `first_mes` | `firstMessage` | Message 0 of a fresh solo chat. An empty value produces no message 0 at all (verified: st:public/script.js:7688-7691). AI-output regex runs on it (verified: st:public/script.js:7719). |
| `data.alternate_greetings` | Alternate Greetings | `alternate_greetings` (array, or a string that gets wrapped) | none; `/char-create` always sends `[]` (verified: st:public/scripts/slash-commands.js:5229) | In solo chats they become **swipes of message 0**. In groups, each member picks one of `first_mes` plus its alternates at random (verified: st:public/script.js:7723-7738, st:public/scripts/group-chats.js:582-584). |
| `data.mes_example` | Examples of dialogue | `mes_example` | `messageExamples` | Blocks split on `<START>` (case-insensitive). A missing leading `<START>` is added for you (verified: st:public/script.js:3501-3512). Overridden by `chat_metadata.mes_example` (verified: st:public/script.js:3447-3451). Keep/drop behaviour: §5. |
| `data.creator_notes` | Creator's Notes | `creator_notes` | `creatorNotes` | Not sent to the model. Mirrored to top-level `creatorcomment` (verified: st:src/endpoints/characters.js:588). |
| `data.system_prompt` | Main Prompt (Prompt Overrides) | `system_prompt` | `systemPrompt` | Replaces the main prompt **only if "Prefer Char. Prompt" is on, which is the default**. `chat_metadata.system_prompt` beats the card (verified: st:public/script.js:3412-3415, st:public/scripts/power-user.js:203). |
| `data.post_history_instructions` | Post-History Instructions | `post_history_instructions` | `postHistoryInstructions` | Used if "Prefer Char. Instructions" is on (default on) (verified: st:public/script.js:3417-3419, st:public/scripts/power-user.js:204). |
| `data.tags` | Tags to Embed | `tags` (array, or a comma string that gets split) | `tags` (comma list) | Card-embedded tags. **Not** ST's folder or filter tags. Use `/tag-add` or `/tag-import` for those (verified: st:public/scripts/slash-commands.js:933, st:src/endpoints/characters.js:593,609). |
| `data.creator`, `data.character_version` | Created by, Character Version | `creator`, `character_version` | `creator`, `characterVersion` | Metadata. The version is available as `{{charVersion}}`. |
| `data.extensions.talkativeness` | Talkativeness | `talkativeness` | `talkativeness` | Group Natural order roll. Default 0.5. Strings are fine because ST calls `Number()` on use (verified: st:public/scripts/group-chats.js:1280-1291, st:public/script.js:549). |
| `data.extensions.fav` | Favorite | `fav` (**string** `"true"`) | `favorite` | UI only. |
| `data.extensions.world` | Link to World Info (character lorebook) | `world` | `world` | The name of the linked lorebook. On create or edit, that book is **embedded as `data.character_book`** (verified: st:src/endpoints/characters.js:617, 628-644). Lorebook mechanics belong to the `st-lorebook-authoring` skill. |
| `data.extensions.depth_prompt.{prompt,depth,role}` | Character's Note, @ Depth, Role | `depth_prompt_prompt`, `depth_prompt_depth`, `depth_prompt_role` | `depthPrompt`, `depthPromptDepth`, `depthPromptRole` | In-chat injection at that depth. Defaults are **4 / `system`** (verified: st:src/endpoints/characters.js:619-626, st:public/script.js:550-551, 4481-4486). In groups: in Swap mode `getGroupDepthPrompts` returns `[]`, so the solo path injects **only the current speaker's** note. In Join modes every non-muted member's note is injected at its own depth (verified: st:public/scripts/group-chats.js:439-441, 454-465; st:public/script.js:4474-4486). |
| `data.character_book` | (embedded lorebook) | only via `world` | none | Opening the card the first time pops the "embedded lorebook" confirm while "Lorebook Import Dialog" is on (default on) (verified: st:public/scripts/world-info.js:5698-5716, st:public/scripts/power-user.js:210). |
| `data.extensions.regex_scripts` | Scoped regex | none | none | Card-scoped regex scripts (verified: st:public/scripts/char-data.js:77). Format lives in the `st-scripting` skill. |
| `data.extensions.sd_character_prompt.{positive,negative}` | Image Generation character prompt prefix | none | none | Source for `{{charPrefix}}` / `{{charNegativePrefix}}` (verified: st:public/scripts/char-data.js:84). See the `st-image-generation` skill. |

## 3. Create-body coercions (`POST /api/characters/create`)

`charaFormatData` expects **HTML-form semantics**, so the body is a flat form model and not a V2 card (verified: st:src/endpoints/characters.js:565-657). The results below come from running ST's own `charaFormatData` source against probe bodies (2026-09-18):

| You send | Stored | Why |
|---|---|---|
| `fav: true` (boolean) | `false` | `data.fav == 'true'` (line 592, 616). Send the string `"true"`. |
| `talkativeness: 0` (number) | `0.5` | `data.talkativeness \|\| 0.5` (line 591, 615). Send `"0"` for a shy card. |
| `depth_prompt_depth: ""` | `0` | `Number("")` is 0 and not NaN (line 622). Omit the key or send `"4"`. |
| `extensions: {…}` (object) | ignored, with a server warning | `JSON.parse(data.extensions)` (line 646-654). Send a JSON **string**, e.g. `"{\"foo\":1}"`, which gets deep-merged. |
| `tags: "a, b"` | `["a","b"]` | split and trim (line 593, 609) |
| `alternate_greetings: "hi"` | `["hi"]` | wrapped (line 573-577) |
| `json_data: "<full card JSON>"` | base object | Unknown keys survive. This is how `/edit` keeps foreign fields (line 567). |
| `file_name: "x"` | avatar `x.png` | optional. Otherwise it's the sanitized name (+ a digit if taken) (line 1031). |

The response body is the avatar filename **as text** (`Name.png`) (verified: st:src/endpoints/characters.js:1032, 1039). The endpoint **never rejects a duplicate name**: it creates `Name1.png`. Any create-only rule is the caller's job (ours: `src/wizard/provisioning.ts:73-77`). `templates/create-body.json` is a verified body: all its keys are read by `charaFormatData`, and the result passes `validateV2()`.

## 4. Where the fields land in the prompt

- **Permanent**: name, description, personality, scenario (official doc). In Text Completion, the Default context template's story string order is `system → wiBefore → description → personality → scenario → wiAfter → persona` (verified: st:default/content/presets/context/Default.json:2). So "Description vs a constant WI entry" is a question of before- or after-char position, not of permanence. In Chat Completion the order comes from the Prompt Manager (see `community/prompting-memory-prior-art.md`).
- **Name prefixes** depend on settings. Plain Text Completion writes `Name: text` for every message (verified: st:public/script.js:5846). Instruct mode defaults to `names_behavior: force` (verified: st:public/scripts/power-user.js:237). Chat Completion's default prefixes names only in groups or on forced-avatar messages (verified: st:public/scripts/openai.js:206-211, 595-611). Only in some setups is the card name "sent with every message", which is a common community claim.
- **Macros** in every field run through `baseChatReplace` (verified: st:public/script.js:3410-3463). `.claude/sillytavern-docs/macros.md` lists them.
- **Group Join mode** concatenates description, personality, scenario and examples across members. Muted members are included only under "Join, include muted" (`APPEND_DISABLED`). Example blocks that lack `<START>` get one (verified: st:public/scripts/group-chats.js:547-571, 129-133).

## 5. Example dialogue: keep, push out, parse

- **Setting**: User Settings → Chat/Message Handling → **Example Messages Behavior** = `Gradual push-out` (default) / `Always include examples` / `Never include examples` (verified: st:public/index.html:5358-5366, st:public/scripts/power-user.js:121-122, 1541-1551). Community advice to move examples into a lorebook "so they stay" is superseded by `Always include examples` (community-reported, 2025-02).
- **Chat Completion ordering**: with push-out, chat history fills the budget first and examples get what's left. With "always", examples are reserved first (verified: st:public/scripts/openai.js:1336-1343).
- **Chat Completion parsing is line-based** (verified: st:public/scripts/openai.js:729-787):
  - The first line of each block (the `<START>` heading) is skipped (753).
  - A line starting with `{{user}}:` begins an `example_user` message. A line starting with `{{char}}:` or any group member's `Name:` begins an `example_assistant` message. Both are sent with role `system` and a `name` (758-776).
  - Lines before the first speaker line are **glued onto that first message**.
  - **A block with no `{{user}}:` or `{{char}}:` line is dropped entirely.** A pure prose "example scene" (`[Scene: …]` narration only) never reaches a Chat Completion model. Put at least one `{{char}}:` line in every block.
- In Text Completion the block text is kept verbatim. Non-instruct mode heads each block with the context template's example separator. Instruct mode and Chat Completion keep a `<START>` heading for later formatting (verified: st:public/script.js:3510-3512).
