# STscript — syntax, variables, control flow, generation, idioms

Open this when writing or debugging a slash-command script (QR body, chat input, `executeSlashCommandsWithOptions` from JS). There is no official STscript page in `.claude/sillytavern-docs/`; everything here is checked against the parser (ST 1.19.0). `st:` = `C:\dev\SillyTavern-MainBranch\`; `sc/` = `st:public/scripts/slash-commands/`. In-app help: `/help slash`, and every command's autocomplete shows its arguments.

## 1. Syntax

| Construct | Meaning | Source |
|---|---|---|
| `/cmd key=value key2="quoted value" unnamed text…` | named args first, then the unnamed argument (rest of the command) | sc/SlashCommandParser.js:1000-1140 |
| `\|` | end of command; next command receives the result as its **pipe** | SlashCommandParser.js:792-801 |
| `\|\|` | end of command **without** pipe injection into the next | SlashCommandParser.js:795-799 |
| `{{pipe}}` | explicit previous result, anywhere | sc/SlashCommandClosure.js:178 |
| `{: … :}` | closure (a block; passed as an argument, stored in a variable, run later) | SlashCommandParser.js:727-812 |
| `{: … :}()` | closure executed immediately where it stands; its result is the value | SlashCommandParser.js:805-808 |
| `{: a=1 b= /echo {{var::a}} :}` | closure parameters (named args at the start of the closure) | SlashCommandParser.js:758-763 |
| `// text \|` or `/# text \|` | comment up to the next `\|` | SlashCommandParser.js:878-898 |
| `/* … *\|` | block comment (nestable) | SlashCommandParser.js:849-876 |
| `/:"Set.Label" x=1` / `/:myClosure` | shorthand for `/run` | SlashCommandParser.js:928-963 |
| `/parser-flag STRICT_ESCAPING on` · `/parser-flag REPLACE_GETVAR on` | per-script parser flags (defaults in User Settings) | SlashCommandParser.js:36-41, 146-160, 900-926 |
| plain text between commands | silently discarded | SlashCommandParser.js:788-790 |

Pipe injection rule: the previous result becomes the unnamed argument **only if the command has no unnamed argument of its own** (verified: SlashCommandClosure.js:557-561). So `/preset | /setvar key=p` stores the preset name, but `/preset | /setvar key=p x` stores `x`.

Macro timing: `{{…}}` inside arguments is substituted **at execution time, after parsing** (verified: SlashCommandClosure.js:544, 582). Macro values may therefore contain spaces, `|` or quotes without breaking the command. Consequence: a value that itself contains `{{getvar::…}}` can be substituted twice — `REPLACE_GETVAR` rewrites `{{getvar::}}`/`{{getglobalvar::}}` into real variable reads to prevent that (no-op on the new macro engine) (SlashCommandParser.js:148, 647-700, 1251-1253).

### Escaping and quoting (the #1 source of parse errors)
- Default (loose) mode: inside a `"quoted value"` an unescaped `|` (outside `{{…}}`) **ends the value with a parse error** "Unexpected end of quoted value", and so does `:}` inside a closure. Scripts run with command-name verification on (verified live 2026-09-19; SlashCommandParser.js:1235-1245; st:public/scripts/slash-commands.js:7005). Write `\|`.
- Loose mode: `\|`, `\{`, `\}`, `\"`, `\:}` escape a single symbol, and a backslash before anything else stays literal, so there is no way to end a quoted value with a backslash. `\{`/`\}` are unescaped in argument values **after** the macro pass, so `\{\{char\}\}` reaches the command as `{{char}}` (SlashCommandParser.js:626-647; SlashCommandClosure.js:500-505, 586-600).
- There is **no `\n` escape**, so a backslash-n stays two characters (verified live 2026-09-19). A real newline inside a quoted value is kept as-is. Otherwise use `{{newline}}`.
- `|` inside `{{…}}` is fine (SlashCommandParser.js:968-996).
- `STRICT_ESCAPING`: backslashes count only directly before a delimiter the parser is testing at that point. Inside quotes that is `"` alone, so `|` is literal there and `\|` stays two characters. A run of backslashes before `"` collapses in pairs, and an odd one escapes the quote. `a\\b` stays `a\\b` (SlashCommandParser.js:583-624, 1241-1244).
- `executeSlashCommandsWithOptions(text, {parserFlags})` overrides the user's flags for one run. Keys are the `PARSER_FLAG` ids `1` STRICT_ESCAPING and `2` REPLACE_GETVAR (SlashCommandParser.js:38-41, 711; slash-commands.js:6988-7005). With `handleParserErrors: true`, the default, a parse error raises a toast and returns an empty result whose `isError` is `false` (slash-commands.js:7011-7026).
- `rawQuotes` commands (`/sendas`, `/comment`, `/cp`) keep the wrapping quotes and backslashes in their text unless given `raw=false` (SlashCommandParser.js:1020-1023; slash-commands.js:1256, 1409).
- Unknown named arguments are passed through to the callback, not rejected (SlashCommandClosure.js:496-499).

## 2. Variables

| Kind | Lives in | Set / read | Notes |
|---|---|---|---|
| Local (chat) | `chat_metadata.variables` of the **current chat**, persisted | `/setvar key=x v`, `/getvar x`, `/addvar`, `/incvar`, `/decvar`, `/flushvar x`; `{{getvar::x}}`, `{{setvar::x::v}}` | survives reloads; different per chat (verified: st:public/scripts/variables.js:22-60, 422-424, 934-1060, 1534-1560) |
| Global | `extension_settings.variables.global` | `/setglobalvar`, `/getglobalvar`, `/flushglobalvar`, … | shared by all chats |
| Scoped | the running closure (and children) | `/let x v`, `/var x v`, `{{var::x}}`, `{{var::x::index}}` | gone when the script ends — use for temporaries instead of `/setvar`+`/flushvar` (variables.js:2177-2287). To capture the pipe write `/let key=x` — `/let x` has an unnamed argument (the name), so nothing is injected and `x` is declared empty (verified: variables.js:822-846) |

- `index=` + `as=number|string|…` read/write inside JSON arrays/objects stored in a variable (`/setvar key=ages index=John as=number 21`) (variables.js:934-982).
- `/listvar [scope=all|local|global]` lists them (variables.js:904-932).
- Typical community leftovers: `og_preset`, `og_profile`, `chat_history`, `lastmessageid` — `/setvar` temporaries end up saved in the chat file unless flushed.

## 3. Control flow

- `/if left=… right=… rule=eq|neq|in|nin|gt|gte|lt|lte|not [else=…] <then>` — `<then>`/`else` are closures `{: … :}` (preferred) or a quoted/legacy command string. No `right` → truthiness test (verified: variables.js:1298-1397, 388-411).
- **Operand resolution order: numeric literal → scoped var → local var → global var → the string itself** (verified: variables.js:440-480). `left=hp right=10 rule=lt` compares the *variable* `hp`; a literal word that happens to be a variable name is replaced by its value.
- `/while left=… right=… rule=… [guard=off] {: … :}` and `/times n [guard=off] {: … {{timesIndex}} :}` — both stop at **100 iterations** unless `guard=off` (verified: variables.js:20, 304-386, 1399-1533).
- `/break` leaves a loop or a closure run through `/run`/`/:` (SlashCommandParser.js:187-195, 830-846). `/abort [quiet=false] [reason]` stops the **whole** script — closures share the root abort controller (verified: SlashCommandParser.js:752; slash-commands.js:2364-2381).
- `/run name|Set.Label|closureVar [args…]` (aliases `/call`, `/exec`) runs a scoped closure or a QR and returns its result (slash-commands.js:2579-2604).

## 4. Generation and prompt injection

| Command | What it sends | Key args (verified: slash-commands.js:2211-2310, 2893-2960) |
|---|---|---|
| `/gen <prompt>` | a quiet generation **with** the chat and card, your text as the instruction; result → pipe | `as=system\|char`, `length=`, `lock=on`, `trim=true`, `name=` (instruct name, default `System`) |
| `/genraw <prompt>` | only your text — **no chat history, no card** | `instruct=on\|off` (default on), `system=`, `prefill=`, `stop=["\n"]`, `as=`, `length=`, `trim=on`, `lock=` |
| `/profile-genstream [profile=<id\|name>] <prompt>` | raw prompt through **another Connection Manager profile without switching the active one**, with a live stream popup | `system=`, `length=` (2048), `reasoning=`, `onComplete={: … :}`, `stop=true\|false` (stop button, not stop strings), `delay=` (popup auto-hide ms) (verified: st:public/scripts/extensions/connection-manager/index.js:489-560, 1048-1140) |
| `/trigger [await=true] [member]` | a normal reply (group: a specific member) | `await=true` waits for it |
| `/inject id=… [position=after\|before\|chat\|none] [depth=4] [role=system\|user\|assistant] [scan=false] [ephemeral=false] [filter={: … :}] <text>` | persistent per-chat prompt injection (`chat_metadata.script_injects`, key prefix `script_inject_`); `position=none` = hidden, only for WI scanning; `ephemeral=true` removes it after the next generation | slash-commands.js:3773-3842 |
| `/listinjects`, `/flushinject [id]` | inspect / remove script injections | slash-commands.js:2943-2990 |

`/inject` with the same `id` replaces; empty text removes it. Script injections never collide with Story Orchestrator's keys (ours are in `src/constants/injectionRegistry.ts`, set through `setExtensionPrompt`, not `/inject`).

## 5. Everyday commands

| Command | Notes |
|---|---|
| `/echo [severity=info\|warning\|error\|success] [title=] <text>` | toast; returns the text (slash-commands.js:2109-2160) |
| `/delay <ms>` | sleep (slash-commands.js:2478-2500) |
| `/pass <value>` | put a value into the pipe (slash-commands.js:2451-2465) |
| `/rand [from=] [to=] [round=round\|ceil\|floor]` | random number (variables.js:2123-2175) |
| `/messages [names=on] [role=] <index\|a-b>` | message text(s), joined by blank lines; `{{firstIncludedMessageId}}-{{lastMessageId}}` = what is in context (slash-commands.js:2607-2662, 4213) |
| `/preset [name]` | get/set the current API's preset; exact, then **fuzzy** match; no match → returns the current one; waits for reconnection (st:public/scripts/preset-manager.js:917-977, 995-1030) |
| `/profile [name] [await=true] [timeout=2000]` | get/set the Connection Manager profile; exact, then **fuzzy** match; **awaits the switch by default**; `<None>` = no profile (connection-manager/index.js:189-205, 894-960) |
| `/world [state=on\|off\|toggle] [silent=true] <name[,name…]>` | global lorebook activation. Names are **comma-split** and matched case-insensitively; **an empty argument deactivates every global book**, whatever `state` says (verified: st:public/scripts/world-info.js:5772-5821) |
| `/bg <name>` | switch background (fuzzy) — see `../../st-image-generation/SKILL.md` |
| `/regex name=… <text>`, `/regex-toggle`, `/regex-state` | see `regex-scripts.md` §9 |
| `/sendas name=<char> <text>`, `/sys <text>`, `/comment [compact=true] <text>` | post messages as a character / system / comment (slash-commands.js:1255-1430) |
| `/setinput <text>` | fill the input box (slash-commands.js:2663+) |

Not core — seen in community scripts: `/dom` and `/ifempty` come from the third-party **LALib** extension (no definition anywhere in `st:public/scripts/` outside third-party; not installed here). Sorcery `%[1]` markers come from the Sorcery extension. Rewrite those parts before reusing a script.

## 6. Idioms from community scripts (Seamless Image Generation v2 §3/§5, generalized)

### 6.1 Swap → run → restore (Hitch's idiom, 2025)
```
/preset ||
/let key=og_preset ||
/profile ||
/let key=og_profile ||
/profile Image_Generation |
/preset Guide_ImageGen |
/gen Summarize the scene as tags. |
/let key=result ||
/profile {{var::og_profile}} |
/preset {{var::og_preset}} |
/echo {{var::result}}
```
- **`||` before every getter is load-bearing.** `/preset` and `/profile` with no argument are getters, but a piped value becomes their argument and they **switch — by fuzzy match** (verified: st:public/scripts/preset-manager.js:917-977; connection-manager/index.js:189-205, 921-940). `/setvar` and `/let key=` return the stored value (variables.js:935, 822-846), so `/setvar key=og_preset | /profile |` would try to switch to a *profile* named like the preset. In the community scripts the `/delay 20` between those lines is what saves them — `/delay` returns `''` (slash-commands.js:4278-4291). The guide's IMG QR starts with `/echo Generating image... |` straight into `/preset |`, which feeds the toast text to `/preset` as a fuzzy preset name — a plausible cause of its known issue "the preset goes back to some other preset when using the QR IMG" (source-derived explanation of a community-reported bug, 2025).
- The original uses `/setvar`/`{{getvar::}}` + `/delay 1500` after each switch. `/profile` now awaits the switch by default and `/preset` waits for the API to reconnect, so the long delays are legacy; `/let` keeps temporaries out of the chat file.
- **Never `/abort` between swap and restore** — the restore lines are skipped and the user is left on the side profile ("Character only responds with image prompts" in the guide's troubleshooting). Branch with `/if … else=` instead.
- Profile and preset are global UI state: anything else generating meanwhile (another extension's summarizer) uses the swapped profile — the guide reports qvink memory colliding (community-reported, 2025). If you only need text from another model, `/profile-genstream profile=… ` avoids the swap entirely; Story Orchestrator itself uses per-request profiles (`src/services/stHost/connectionProfiles.ts:44`, `ConnectionManagerRequestService.sendRequest`) for the same reason.
- `/sd`-based variants keep the swap because the Image Generation extension builds its prompt with the main API — details in `../../st-image-generation/SKILL.md`.

### 6.2 Build a prompt from the visible context
```
/messages names=on {{firstIncludedMessageId}}-{{lastMessageId}} |
/let key=history ||
/genraw lock=on system="You write concise scene descriptions." Describe the location only.{{newline}}{{var::history}} |
/let key=description
```
`||` stops the history text from being injected into `/genraw` as an extra unnamed argument (the original Lazuli script used `/setvar key=chat_history ||`). `{{firstIncludedMessageId}}` is only known after one generation in the session (`../../../sillytavern-docs/macros.md`).

### 6.3 Silence helpers around a request (cupcake, 2025)
Turn a marker lorebook off while asking the side model, then on again: `/world state=off silent=true _ImageGeneration` … `/world state=on silent=true _ImageGeneration`. Guard against the empty-name trap above.

### 6.4 Use a command's return value only if it succeeded
```
/sd quiet=true edit=false you |
/if left={{pipe}} {: /echo got {{pipe}} :}
```
`/sd` returns the image URL, or `''` on failure (verified: st:public/scripts/extensions/stable-diffusion/index.js:5493-5494); `/if left={{pipe}}` with no `right` is a truthiness test. Same shape for any command that returns a value.

## 7. Pitfalls

| Symptom | Cause |
|---|---|
| "Unexpected end of quoted value" | unescaped `\|` or `:}` inside quotes |
| Literal `\n` in the result | STscript has no `\n` escape — use `{{newline}}` |
| `/setvar key=x` stored the previous result, not your text | no unnamed arg → pipe injected |
| `/let x` after a pipe is empty | the name is the unnamed arg, so no injection — `/let key=x` |
| `/preset` or `/profile` switched to something random | a getter received the previous result through the pipe and fuzzy-matched it — put `\|\|` before getters |
| `/if left=foo …` compares the wrong thing | `foo` is also a variable name |
| Loop stops at 100 | default guard — `guard=off` |
| Script leaves the wrong profile/preset active | aborted between swap and restore |
| `/world` turned every lorebook off | empty name after macro substitution |
| Command "does nothing" when run from Git Bash tooling | MSYS path conversion of the leading `/` — see SKILL.md §Tooling |
