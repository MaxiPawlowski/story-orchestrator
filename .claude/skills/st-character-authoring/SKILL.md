---
name: st-character-authoring
description: >
  Write, create and clean up SillyTavern character cards: V2 card fields and where each lands in
  the prompt, naming rules, first message, example dialogue, token budget, group behaviour, the
  card-mistakes checklist, TwoList format, and creating cards via UI, /char-create, REST or our
  wizard provisioning. Use when creating a test character (or group) for a live run, writing or
  reviewing the wizard's character/provisioning prompt, importing or editing a card JSON, or
  debugging why a card misbehaves (greeting spam, ignored examples, a requirement that never goes green).
---

# ST character authoring

Card know-how distilled from four community guides, verified against the ST source. **Read first, don't repeat**: `.claude/sillytavern-docs/characterdesign.md` (what each field is for, permanent vs temporary tokens, `<START>`, Character's Note), `groupchats.md` (reply order, Swap/Join), `macros.md` (`{{char}}`, `{{user}}`, …).

Neighbouring skills and docs: lorebooks, `character_book` and WI → `st-lorebook-authoring`. STscript, regex, QR → `st-scripting`. Portraits, sprites, `{{charPrefix}}` → `st-image-generation`. Prompt templates and memory → `.claude/sillytavern-docs/community/prompting-memory-prior-art.md`. Live driving → the `debug` skill.

Path convention: `st:` means `C:\dev\SillyTavern-MainBranch\`. Bare paths are relative to this extension's root.

## 1. Throwaway test character (the common case)

1. Start from `templates/create-body.json` (REST body) or `templates/test-card.v2.json` (importable V2 card). Both are validated against ST's own `TavernCardValidator` and `charaFormatData`. Change `ch_name`/`name` to `SOTEST <Name>` and rewrite the description.
2. Create it in-page with `st-eval`. The exact one-liners are in `references/creating-cards.md` §4. Then `node scripts/debug/st-navigation.mts open-character "SOTEST <Name>"`.
3. For a group, create the cards first, then the group, with members given as **avatar filenames** (`creating-cards.md` §5).
4. Clean up with `node scripts/debug/so-assets.mts list --marker SOTEST`, then `remove --marker SOTEST`. **Read `creating-cards.md` §4 "so-assets semantics" first**: `remove` also deletes what a *test* wizard session (key starts with the slugged marker) recorded as created, even under a non-marker name. Real wizard sessions are never touched.

Test-card rules:
- Keep a **non-empty description**. The wizard's validator rejects empty ones (`src/wizard/provisioning.ts:75`), and an empty card gives the model nothing.
- **No `character_book`.** It pops a blocking "embedded lorebook" confirm on first open (verified: st:public/scripts/world-info.js:5698-5716). Create and link lorebooks separately.
- In a group, give only the lead a `first_mes`. **Every** member's greeting is posted into a fresh group chat (see §6).
- Mind the create-body coercions: `fav` must be the string `"true"`, talkativeness 0 must be sent as the string `"0"`, and `extensions` must be a JSON *string* (verified: st:src/endpoints/characters.js:591-592, 646-654; details in `references/card-fields.md` §3).

## 2. Naming (verified behaviour, not taste)

- **The server sanitizes names.** `/ ? < > \ : * | "`, control characters and trailing dots or spaces are removed, so `Dr. Who?` becomes `Dr. Who` (verified: st:src/endpoints/characters.js:1028, st:node_modules/sanitize-filename/index.js:33-36). Keep names to letters, digits, spaces, `-` and `'`.
- **Duplicates are not rejected.** A second `Brannoc` becomes avatar `Brannoc1.png` with display name `Brannoc` (verified: st:src/endpoints/characters.js:1543-1547). Check `ctx.characters` before creating.
- **Group mentions are word tokens.** Natural order activates a member when any `\b\w+\b` word of its name appears in the input (lower-cased) (verified: st:public/scripts/group-chats.js:1253-1267, st:public/scripts/utils.js:1356-1368). Our talk control does the same (`src/talk/rules.ts:6, 39-43`). Consequences:
  - `SO-J9 Ferryman` splits into `so`, `j9`, `ferryman`, so **every message containing "so" mentions it**. Use a marker that isn't an English word (`SOTEST`).
  - `\w` is ASCII-only, so `Lán Fāng` splits into `l`, `n`, `f`, `ng`. Use ASCII names for group members whose mentions matter.
- **Join keys**: story `requirements.members` is matched against the group's member *avatar basenames*. The roster and speaker direction match *display names* (case-insensitive) (`src/runtime/requirements.ts:15-19`, `src/services/stHost/selectors.ts:58-64`, `src/runtime/roster.ts:49-54`). Sanitizing or a duplicate suffix silently breaks the first.
- Craft: short and unique, the name you'll actually use. Avoid names the model knows (Sherlock, Einstein…), because training data overrides your card (community-reported, 2025-02).

## 3. Where does it go?

| You want… | Put it in | Because |
|---|---|---|
| Who the character is, always | `description` | Permanent, in every prompt (official doc) |
| A one-line trait summary | `personality` | Permanent. Chat Completion wraps it in `personality_format` (verified: st:public/scripts/openai.js:1369) |
| The situation | `scenario` | Permanent, but **a chat or group scenario override replaces it** (verified: st:public/script.js:3441-3445) |
| Style, length and POV of replies | `first_mes` | The strongest steer at chat start (§4) |
| Voice, concepts, agency | `mes_example` | Pushed out as history grows unless "Always include examples" is set (verified: st:public/index.html:5358-5366) |
| Traits that must survive a long chat | Character's Note (`extensions.depth_prompt`, default depth 4 / system) | In-chat injection near the bottom. In groups: the speaker's note only (Swap), or every member's (Join) (verified: st:public/script.js:4474-4486) |
| Per-character main prompt / PHI | `system_prompt` / `post_history_instructions` | Used when "Prefer Char. Prompt/Instructions" is on, which is **the default** (verified: st:public/scripts/power-user.js:203-204) |
| Rarely needed detail (spell lists, places) | A lorebook entry | Activates on demand → `st-lorebook-authoring` |
| Notes for humans | `creator_notes` | Never sent to the model |
| Filter or folder tags | ST tags (`/tag-add`), not card `tags` | Card tags are embedded metadata (verified: st:public/scripts/slash-commands.js:933) |

Full field and key table, storage precedence (`data.*` beats the top-level fields, `ccv3` beats `chara`): `references/card-fields.md`.

## 4. First message

- It sits at the bottom of the context when the chat starts, so it sets style, format, reply **length**, POV, tone and the relationship. Write it the way you want replies to look (community-reported, 2025-02).
- One convention only: `*action*` + `"speech"`, or narration + `"speech"`.
- **Never narrate `{{user}}`.** The model copies it. Don't write "don't speak for the user" either. Phrase guidance positively (`references/writing-craft.md` §6).
- Five-part test: backstory hint · environment cue · personality showcase · user hook · 3+ senses, with the character in motion (community-reported, 2025-05).
- An empty `first_mes` means no message 0 at all (verified: st:public/script.js:7688-7691). Alternate greetings become swipes of message 0 in solo chats (verified: st:public/script.js:7723-7738).
- If a long-lived greeting over-steers: `/hide 0` keeps it visible but out of the prompt (verified: st:public/scripts/slash-commands.js:1836-1857).

## 5. Example dialogue

- Use it for what descriptions can't carry: accent, how a power works (shown in use), and agency. End each block on a page-turn (a door, a decision, a question) (community-reported, 2025-02).
- Prefer scenes to interview Q&A. Q&A trains the model that the user talks in one-line questions (it hurts Impersonate) and that the character answers instead of acting.
- **Chat Completion drops any block with no `{{user}}:`/`{{char}}:` line.** Narration before the first speaker line is glued onto that message (verified: st:public/scripts/openai.js:753-786). Every block needs at least one `{{char}}:` line.
- A missing leading `<START>` is added automatically (verified: st:public/script.js:3506-3508).

## 6. Groups

- **A fresh group chat posts the greeting of every member that has one**, each picking randomly among `first_mes` plus its alternates (verified: st:public/scripts/group-chats.js:283-304, 582-584). Leave supporting members' `first_mes` empty.
- Greetings emit `MESSAGE_RECEIVED` / `CHARACTER_MESSAGE_RENDERED` with type `first_message` (verified: st:public/script.js:7705-7706, st:public/scripts/group-chats.js:300-302). `TurnBridge` drops that type, fixed 2026-09-19 (`NON_TURN_MESSAGE_TYPES` in `src/runtime/turnBridge.ts`), so greetings commit no boundary. A fresh chat stays at boundary 0 until the first real reply. That includes reopening a solo chat that holds only its greeting, which re-emits `first_message` on every open (st:public/script.js:7703).
- Talkativeness defaults to 0.5. `0` means the member speaks only when mentioned or when it's the random fallback (verified: st:public/scripts/group-chats.js:1272-1305).
- Swap mode (the default) sends only the speaker's card, including only the speaker's Character's Note. Join modes concatenate description, personality, scenario and examples across members, and inject every non-muted member's Character's Note at its own depth (verified: st:public/script.js:4474-4486, st:public/scripts/group-chats.js:427-466, 547-571). The official doc warns that Join can merge personalities.
- `createGroup` in our provisioning uses Natural order + Swap (`src/services/stHost/provisioning.ts:93-94`). Enum values are in `creating-cards.md` §5.

## 7. Token budget (community practice)

- Character: 200–2000 tokens. Whole permanent block at 8k context ≈ 3k. **Keep about half the context for chat history** (community-reported, 2025-02). ST flags a card over half the context red (official doc).
- No single section above ~30% of the card (community-reported, 2025-05).
- Clear sentences beat compressed notation. Punctuation-stripped "efficient" cards blurred personalities on non-reasoning models (community-reported, 2025-02).

## 8. Card review checklist

- [ ] The description is non-empty, third person, clear sentences under light headings. No 5000-token lore dump.
- [ ] Traits live in the right fields (physical / behavioural / narrative). Scenario is either developed or empty.
- [ ] ~5 core traits (primary, secondary, depth, contrast, utility), each *shown* by 2+ behaviours.
- [ ] Contextual emotional triggers, not one register.
- [ ] Independent goals: every "loves {{user}}" has a motive that doesn't involve the user.
- [ ] Abilities have cost, limit and an emotional component. Long ability lists go to a lorebook.
- [ ] Era and language anchors are consistent. Backstory is integrated and trauma motivates rather than defines.
- [ ] Open hooks for growth.
- [ ] No "elephants" (things you don't want, mentioned anyway) and no negated instructions. Nothing narrates `{{user}}`.
- [ ] The first message passes the five-part test and uses one formatting convention.
- [ ] Every example block has a `{{char}}:` line and ends on a page-turn.
- [ ] The name is sanitizer-safe, unique on the install, ASCII if it's a group member, and not a famous name.
- [ ] No `character_book` on test cards. Group supporting cast have an empty `first_mes`.
- [ ] Playtest the behaviours you meant to reinforce, or ask the model how it would play the card.

The full 27-mistake table and templates are in `references/writing-craft.md`.

## 9. Writing the wizard's character prompt

The wizard's provisioning grammar and stage text are `src/copilot/prompts.ts:44-54` and `:70`. They are parsed at `src/copilot/parse.ts:415-426` and applied through `src/services/stHost/provisioning.ts:40-68`. The op only carries `name, description, personality?, scenario?, first_mes?, mes_example?, tags?` (`src/wizard/types.ts:19`). Adding a field means extending the type, the parser, the grammar and the create body together. Never add it in the prompt alone. Rules worth encoding in that prompt:

- Names: short, unique on the install, ASCII, none of `/?<>\:*|"`, no famous names, not a common English word. The name is the join key for roster and requirements (§2).
- `description`: third-person clear prose under light headings (appearance, personality, speech, goals). Independent goals. Stay inside the 200–2000 token range (§7), and lean short for group cast.
- `first_mes`: **only for the member who opens the scene.** Never narrate `{{user}}`. One formatting convention. In motion, with senses, ending on a hook.
- `mes_example`: optional. When present: `<START>` blocks, each with a `{{char}}:` line, showing voice or agency.
- Phrase every behavioural rule positively. No "never X" lines about things the story doesn't want.
- `tags` are card metadata only (§3). Don't rely on them for filtering.

## 10. Project hooks

- `src/services/stHost/provisioning.ts`: `createCharacterCard` (form body, hard-coded talkativeness, depth prompt and creator) and `createGroup` (members resolved by name → avatar).
- `src/wizard/provisioning.ts`, `src/wizard/types.ts`: the create-only validator, op shapes, and the environment fold.
- `src/runtime/coordinators/copilotCoordinator.ts:51-58`: `applyProvisioning`, the only write path to the install.
- `src/runtime/requirements.ts`, `src/services/stHost/selectors.ts:58-64`, `src/runtime/roster.ts`, `src/services/stHost/groups.ts:13-25`: the name and avatar join keys.
- `src/talk/rules.ts`: word-token mention matching (the same as ST's).
- `src/runtime/turnBridge.ts`: `NON_TURN_MESSAGE_TYPES`, so greetings (`first_message`) are not turns.
- `scripts/debug/so-assets.mts`: marker plus wizard-ledger cleanup. `test/journeys/j9-wizard.journey.json`: the `cleanup.removeCreatedAssets` pattern.

## References

- `references/card-fields.md`: the exact V2 path, create key, `/char-create` arg and prompt behaviour for each field. Create-body coercions. Storage precedence. Example-dialogue parsing. Open when writing JSON or a body, or when a value came back different.
- `references/creating-cards.md`: every creation, edit and delete path (UI, STscript, REST), test recipes, groups, `so-assets` semantics, wizard provisioning internals, troubleshooting. Open before creating anything from code.
- `references/writing-craft.md`: formats (PList, Ali:Chat, YAML…), templates, first-message and example craft, long-chat tactics, the full 27-mistake table. Open when writing or reviewing card *content*.
- `references/twolist-format.md`: the TwoList spec and example, plus caveats. Open only when asked for TwoList or keyword-dense cards.
- `templates/test-card.v2.json` (import) and `templates/create-body.json` (`POST /api/characters/create`): validated minimal test card "SOTEST Brannoc".

## Sources

Community threads (SillyTavern Discord, `st-guides` forum), scraped 2026-09-18. Dumps are in `docs/tutorials/`.

| Thread | URL | Created → last activity | Upvotes |
|---|---|---|---|
| Basic Character writing Guide (Peter) | https://discord.com/channels/1100685673633153084/1344596229098573844 | 2025-02-27 → 2025-07-30 | 31 (93 comments) |
| 27 Character Card Mistakes to Avoid (Sleep Deprived; drafted with DeepSeek's help) | https://discord.com/channels/1100685673633153084/1374612250026967131 | 2025-05-21 → 2026-01-09 | 41 |
| TwoList Card Templates (Lán Fāng; card part only) | https://discord.com/channels/1100685673633153084/1376373277320286258 | 2025-05-26 → 2025-05-26 | 1 |
| Community Quick Tips (character creation & management section) | https://discord.com/channels/1100685673633153084/1286355628314333335 | 2024-09-19 → 2025-07-25 | 20 |

`community-reported` dates are the thread start month. Where a guide and the source disagree, this skill states the source behaviour and notes the guide claim.
