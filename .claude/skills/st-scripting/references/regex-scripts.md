# Regex scripts — schema, placement, rendering, recipes

Open this when writing, importing, embedding or debugging a Regex-extension script. `st:` = `C:\dev\SillyTavern-MainBranch\` (ST 1.19.0). Official page: <https://docs.sillytavern.app/extensions/regex/>.

## 1. Where scripts live and who runs them

| Type | Stored in | Runs when | Notes |
|---|---|---|---|
| Global | `settings.json` → `extension_settings.regex` | always | (verified: st:public/scripts/extensions/regex/engine.js:112-113, 143-145) |
| Scoped | the card: `data.extensions.regex_scripts` — exported with the card | only if the card's avatar is in `extension_settings.character_allowed_regex` | (verified: engine.js:114-120, 166-207). Cannot be edited while a group chat is open (verified: regex/index.js:1961-1964) |
| Preset | preset extension field `regex_scripts` — travels with the preset | only if allowed in `extension_settings.preset_allowed_regex[apiId]` | (verified: engine.js:121-128, 215-259) |

- Execution order is **global → preset → scoped**, each list top to bottom; order is "the regex script priority" (verified: engine.js:11-16, 98-100 — `Object.values` of `{GLOBAL:0, PRESET:2, SCOPED:1}`). Reorder by drag in the panel.
- Disabling the whole Regex extension short-circuits everything (verified: engine.js:342).
- **Regex presets** (panel section "Presets": "Save and switch between groups of enabled regex scripts") switch which scripts are enabled; `/regex-preset <name|id>` selects one from a script (verified: regex/index.js:264-310, dropdown.html:77-78).
- UI: Extensions → Regex → *Import* (asks global/scoped/preset target), *Debugger* ("Advanced Regex Debugger"), per-script editor with *Test Mode* (verified: regex/dropdown.html:25-35, importTarget.html, editor.html:8-11).

## 2. JSON schema (one script)

`RegexScriptData` (verified: st:public/scripts/char-data.js:88-102). Import accepts one object or an array; `scriptName` is the only hard requirement and `id` is always replaced by a fresh UUID (verified: regex/index.js:1499-1506, 1540-1554). A script embedded straight into a card or preset is **not** re-IDed on the way in, so give it an id.

| Field | Type | Editor label | Meaning |
|---|---|---|---|
| `id` | string (UUID) | — | identity; regenerated on import |
| `scriptName` | string | Script Name | also the handle for `/regex`, `/regex-toggle`, `/regex-state` (case-insensitive) |
| `findRegex` | string | Find Regex | `/pattern/flags` **or** a bare pattern (no slashes = no flags, first match only) (verified: st:public/scripts/utils.js:1387-1402) |
| `replaceString` | string | Replace With | see §5 |
| `trimStrings` | string[] | Trim Out | removed from **each inserted capture** (not from the whole match) before insertion; macros resolved (verified: engine.js:437-438, 457-463) |
| `placement` | number[] | Affects | see §3 |
| `disabled` | bool | Disabled | skipped entirely (verified: engine.js:393) |
| `markdownOnly` | bool | **Alter Chat Display** | see §4 |
| `promptOnly` | bool | **Alter Outgoing Prompt** | see §4 |
| `runOnEdit` | bool | Run On Edit | re-apply when a message is edited (verified: engine.js:356-359, st:public/script.js:8159-8166) |
| `substituteRegex` | 0 / 1 / 2 | Macros in Find Regex | 0 don't substitute · 1 raw · 2 escaped (macro values regex-escaped) (verified: engine.js:298-302, 397-409; editor.html:142-146) |
| `minDepth` / `maxDepth` | number \| null | Min Depth / Max Depth | see §6 |

An invalid pattern returns the text unchanged, silently — "The user skill issued" (verified: engine.js:411-416). Test before trusting.

## 3. `placement` values

Enum `regex_placement` (verified: engine.js:281-292; checkbox values editor.html:80-109):

| Value | Label | Applied to (call sites) |
|---|---|---|
| 0 | *(deprecated MD Display)* | do not use |
| 1 | User Input | user messages on send (st:public/script.js:5875); impersonation output (script.js:6481); user messages in prompt/display |
| 2 | AI Output | model replies on receive (script.js:6481); greetings + alternate greetings when a chat starts (script.js:7719-7724); welcome screen (st:public/scripts/welcome-screen.js:277) |
| 3 | Slash Commands | text created by `/sendas`, `/sysgen`, `/ask` (st:public/scripts/slash-commands.js:5944, 5717, 4716, also 6087); narrator (`/sys`) messages at display time only (script.js:1840-1841) — `/sys` does not regex on creation, and in the outgoing prompt non-user messages are matched as AI Output (script.js:4503) |
| 4 | *(legacy sendAs)* | unused |
| 5 | World Info | activated WI entry **content**, after its macros resolve (st:public/scripts/world-info.js:5058, 5204-5205). **Requires `promptOnly`** — WI is regexed with `isPrompt:true` (editor tooltip: "Requires 'Only Format Prompt' to be checked!", editor.html:98) |
| 6 | Reasoning | reasoning blocks (script.js:5503, 4545-4549; st:public/scripts/reasoning.js:429, 1036, 1215) |

## 4. Ephemerality — what actually changes

The gate is `engine.js:348-355`: a script runs for display if `markdownOnly`, for the prompt if `promptOnly`, and otherwise **only** at the moment text is created/edited (neither `isMarkdown` nor `isPrompt`).

| `markdownOnly` | `promptOnly` | Stored message (chat file) | Chat display | Outgoing prompt |
|---|---|---|---|---|
| false | false | **rewritten permanently** at send/receive (and on edit if `runOnEdit`) | shows rewritten text | sees rewritten text |
| true | false | untouched | transformed on every render (script.js:1859-1864) | original text |
| false | true | untouched | original text | transformed (script.js:4502-4506) |
| true | true | untouched | transformed | transformed |

Consequences:
- A non-ephemeral script added later does **not** touch existing messages (it only runs on creation/edit). Ephemeral scripts apply to history immediately.
- Keep the LLM-facing marker when you only want visuals: `markdownOnly: true`. The model keeps seeing the raw tag it was told to emit, so it keeps emitting it (community rationale, confirmed by the gate above).
- The community tip "strip `<chat>` tags, and tick *alter outgoing prompt* too" (community-reported, 2025) is muddled: with **no** flag the tag is already gone from file, display and prompt. Tick both flags only if you want the chat file to keep the original.
- Story Orchestrator extraction reads the **stored** `mes` (src/extraction/chatWindow.ts:8-10): display/prompt-only scripts are invisible to it; a non-ephemeral script changes what extraction sees.

## 5. Replace With

Order inside the engine (verified: engine.js:419-445):
1. `{{match}}` → `$0` (whole match).
2. `$1`, `$2`… numbered groups and `$<name>` named groups (placeholder text in the editor says the same, editor.html:64). **Named groups can be referenced either way** — `$<name>` or positionally as `$1…`.
3. A group that did not participate becomes `''` (never the literal `$2`).
4. `trimStrings` removed from each inserted group.
5. `substituteParams` over the whole result: `{{char}}`, `{{user}}`, `{{getvar::x}}`, our `{{story_*}}` all work in Replace With — and any `{{…}}` the **model** wrote inside a captured group gets resolved too.

JavaScript's own `$&`, `` $` ``, `$'` are **not** supported — only the forms above.

## 6. Depth (`minDepth` / `maxDepth`)

`0` = last message, `1` = the one before, … System prompt and utility prompts are never affected (editor tooltip, editor.html:112-123). Computed:
- display: position among non-system messages (script.js:1851-1853);
- prompt: `coreChat.length - index - 1` (`-2` during Continue, so blank or `-1` min depth also covers the message being continued) (script.js:4504);
- World Info: the entry's depth when it is `@Depth`, otherwise no depth check (world-info.js:5204).
`null`/blank = unlimited; the checks require `minDepth >= -1` / `maxDepth >= 0` to engage (engine.js:361-372). Use `maxDepth: 0`/`1` to clean only the newest replies (cheap on long chats).

## 7. Rendering HTML from a regex (display scripts)

`messageFormatting` pipeline: regex → markdown auto-fix → `encode_tags` → Showdown markdown → name strip → DOMPurify (verified: script.js:1770-1786, 1958-1968). Rules that follow:

- **"Show `<tags>` in responses" must be OFF** (`power_user.encode_tags`, default false). When on, `<` is escaped and your HTML shows as text (verified: script.js:1875-1879; st:public/scripts/power-user.js:301; st:public/index.html:5449-5452). Same switch the community uses to hide `<thinking>`-style tags.
- **Every `class` gets a `custom-` prefix** except `fa-*`, `note-*` and `monospace` (verified: st:public/scripts/chats.js:1922-1931). Write `class="char-info"` in Replace With and `.custom-char-info` in User Settings → Custom CSS. Typing `custom-` yourself yields `custom-custom-…`. Font Awesome icons (`fa-solid fa-dice`) work unprefixed.
- **Inline `<style>` works in current ST.** A `<style>…</style>` block (exact tag, no attributes) is encoded before sanitizing, then decoded with every selector prefixed by `.mes_text ` and class selectors rewritten to `.custom-…`; `@import` rules are dropped (verified: chats.js:536-541, 551-620; script.js:1966-1968). The Feb-2025 illustrations guide says Regex "does not support inline `<style>`" — **stale/contradicted by source**; the same author's later skill-check script ships a `<style>` block. Still prefer global Custom CSS for anything used in every message (less DOM weight, one place to edit); see `../../../sillytavern-docs/community/ui-dom-selectors.md` for where CSS lives.
- **External media is blocked by default.** "Forbid External Media" defaults on (verified: power-user.js:336); `<img>/<video>/<audio>/…` with an `http(s)://` or `//` src not on ST's origin are removed, and `://` declarations are stripped from inline `<style>` (verified: chats.js:852-867, 1973-2010, 563-565). Use local paths: `/characters/<Name>/<file>` is served from `data/<user>/characters/` (verified: st:src/users.js:1214); also `/backgrounds/*`, `/user/images/*`, `/assets/*` (users.js:1213-1218). Per-character overrides exist (`external_media_allowed_overrides`).
- Showdown runs **after** the regex: keep HTML unindented or on one line (4-space indentation becomes a code block; blank lines split HTML blocks). Derived from the pipeline order above.
- The display regex runs on every render — keep patterns cheap and anchored; the community reports lag/infinite loading in mobile PWAs with heavy regex use (community-reported, 2025-02 and 2025-04).

### 7.1 Reasoning / thinking tags (Quick Tips thread, 2025)
- A thinking model whose `<thinking>…</thinking>` stays inline instead of collapsing into the reasoning block: Advanced Formatting → **Reasoning** → **Reasoning Formatting** → set **Prefix**/**Suffix** to the model's actual tags (defaults `<think>` / `</think>`) **and** tick **Auto-Parse** ("Both fields must be defined and non-empty"), which defaults **off** — the community tip omits it (verified: st:public/scripts/power-user.js:274-282; st:public/index.html:4556-4622).
- Parsed reasoning is stored in `message.extra.reasoning` and regexed through **placement 6 (Reasoning)** — on display, on edit, and (with `promptOnly`) when reasoning is added back to prompts (script.js:5503, 4545-4549; st:public/scripts/reasoning.js:429, 1215). Target it with placement 6, not AI Output.
- Hiding tag *markup* without deleting it: "Show `<tags>` in responses" off (see above) — tag contents stay visible. Model/preset-side reasoning advice: `../../../sillytavern-docs/community/prompting-memory-prior-art.md`.

## 8. Recipes

Every find/replace pair below was run through a line-for-line copy of `regexFromString` (utils.js:1387-1402) and the engine's replace callback (engine.js:419-445) against a sample of the shown input.

### 8.1 Character illustration / sticker from a model-emitted tag (Rivelle, 2025-02)
Technique (images, sprite folders, prompts) belongs to `../../st-image-generation/SKILL.md`; the reply-format lorebook entry to `../../st-lorebook-authoring/SKILL.md`. Regex part:
- Model emits (instructed by a constant WI entry): `[{{char}}: <keyword> | *<one-line inner monologue>*]`
- Find (fixed — the posted `(?<name>[^:]+)\s*:` captures the space before `:`, so `[John : …]` gave `$1 = "John "`, verified by test):
  `/\[\s*([^:\]]+?)\s*:\s*([^|\]]+?)\s*\|\s*\*([^*]+)\*\s*\]/g`
- Replace With (one line in practice): `<div class="char-info"><img class="char-expr" src="/characters/$1/$2.webp" alt="$2"><div class="char-monologue">$3</div></div>`
- Script: `placement [2]`, `markdownOnly true`, `runOnEdit true`. Name the folder after the character and one file per keyword; spaces in names/keywords are fine (the browser URL-encodes them).
- The original posted CSS (polaroid tilt, hover-fade monologue caption on `.custom-char-monologue:hover`) is trimmed here; it is plain CSS against `.custom-*` classes.
- Caveat from the author: keep the format simple; weak models drift and one-regex-per-expression does not scale — route the keyword list through one lorebook entry instead (community-reported, 2025-02/2025-11).

### 8.2 Styled "skill check" chip (Rivelle, `help_help.json`, posted 2025-04-23)
- Model writes: `[ Check: Acrobatics - Difficulty: 25 ... Roll: 16 - Result: Failure! ]`
- Find: `/\[\s*Check:\s*(.+?)\s*-\s*Difficulty:\s*(\d+)\s*\.\.\.\s*Roll:\s*(\d+)\s*-\s*Result:\s*(.+?)\s*\]/g`
- Replace skeleton: `<div class="skill-check"><i class="fa-solid fa-dice"></i> <span class="challenge-type">$1</span> Check - Difficulty: <span class="difficulty">$2</span> … You roll: <span class="roll-result">$3</span> - <span class="outcome">$4</span></div>` (the original prepends a ~90-line `<style>` block with a pulse animation — trimmed).
- `placement [1, 2]`, `markdownOnly true`, `runOnEdit true`. Pros claimed: saves tokens vs. asking the model for HTML, avoids layout breakage. Our `templates/regex-script.json` is a compact variant using named groups.

### 8.3 Toggle part of a World Info entry from a script (underscore_x, Quick Tips thread)
No need to split the entry: wrap the optional part in variable sentinels and strip it when the variable holds the sentinel text.
```
The Kingdom of Ordolin is one of the most prosperous kingdoms in Cyralden

{{getvar::optional_section}}
Optional lore lines…
{{getvar::optional_section}}
```
- Regex: find `/optional_section([\s\S]*?)optional_section/gm`, replace empty, `placement [5]`, **`promptOnly: true`** (the posted tip omits this; without it a World-Info script never runs).
- Hide: `/setvar key=optional_section optional_section` · Show: `/flushvar optional_section` or `/setvar key=optional_section {{noop}}`.
- Works because WI content macros resolve **before** the WI regex runs (verified: world-info.js:5058 then 5205).

### 8.4 Small utilities
| Goal | Find | Replace | Flags |
|---|---|---|---|
| Curly → straight double quotes (the dump flattened the posted pattern; this is the intent) | `/[“”]/g` | `"` | AI Output; no ephemeral flag = permanent |
| Strip wrapper tags | `/<\/?chat>/gsi` | *(empty)* | AI Output; no flag = gone everywhere |
| Show a glossary name without touching the prompt | `Suou Tamaki` (bare, first match) or `/Suou Tamaki/g` | `{{match}} (須王環)` | AI Output, `markdownOnly` |
| Hide OOC asides from the display only | `/\(OOC:[^)]*\)/g` | *(empty)* | User Input + AI Output, `markdownOnly` |

Other community uses (no recipe posted): affection meters, RPG level bars, fake social-media or SMS threads, full gacha systems — "if you're pulling off something that advanced, why not just make a dedicated extension?" (community-reported, 2025-02).

## 9. Slash commands for regex

| Command | Does | Source |
|---|---|---|
| `/regex name=<script> <text>` | runs one **enabled** script on `<text>` regardless of placement/ephemerality flags; returns the result (a regex as a text transformer inside STscript) | regex/index.js:1422-1445, 2051-2070 |
| `/regex-toggle [state=on\|off] [quiet=true] <script>` | enable/disable/toggle, saves, and **reloads the current chat** so display scripts re-render — don't call it mid-generation | regex/index.js:1453-1490, 553-561, 2102-2146 |
| `/regex-state <script>` | `true` if enabled, `false` if disabled | regex/index.js:2071-2100 |
| `/regex-preset [quiet=true] [<name\|id>]` | select a regex preset; no arg = current preset id | regex/index.js:264-310 |

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Nothing happens, no error | pattern failed to compile (silent), wrong placement, script disabled, or a scoped/preset script not allowed for this card/preset. Test Mode first. |
| Only the first occurrence changes | missing `g` flag (or a bare pattern without slashes) |
| World Info regex never fires | `promptOnly` not ticked |
| HTML shows as literal text | "Show `<tags>` in responses" is on |
| CSS does not apply | selector lacks the `custom-` prefix, or loses to ST's own message styles — raise specificity (`#chat .custom-…`, as the illustrations guide does) |
| Image missing | external URL blocked by Forbid External Media; use `/characters/<Name>/…` |
| Old messages unchanged after adding a script | non-ephemeral scripts only run on creation/edit — use `markdownOnly`/`promptOnly`, or edit the messages |
| Model stopped producing the marker | a non-ephemeral script removed it from history, so the model no longer sees examples of it — make the script `markdownOnly` |
| Captured name has a trailing space / broken image path | greedy `[^:]+` before `\s*:` — use lazy `+?` (see 8.1) |
| Scoped script cannot be edited | a group chat is open (edit from a solo chat) |
