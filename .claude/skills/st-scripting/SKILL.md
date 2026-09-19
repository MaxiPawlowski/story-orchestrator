---
name: st-scripting
description: >
  SillyTavern scripting know-how: STscript / slash-command idioms (pipes, closures, variables,
  /if /while, /gen /genraw /inject, profile/preset save-restore), Quick Replies (set JSON,
  auto-execute flags, World Info automation IDs), Regex-extension scripts (JSON schema, placement,
  ephemerality, capture groups, HTML/CSS output) and macro tips. Use when writing or importing a
  regex or QR for a test, composing our /cp /story /so-mem commands or {{story_*}} macros with
  STscript, running slash commands through st-actions/st-eval, or debugging why a script, regex
  or QR automation does not fire.
---

# ST scripting — STscript, Quick Replies, Regex, macros

Verified against ST **1.19.0** at `C:\dev\SillyTavern-MainBranch` (commit `7c3994196`). `st:` in citations = that tree. Community claims are marked `(community-reported, yyyy-mm)`. The official macro list is `.claude/sillytavern-docs/macros.md` — not repeated here.

Neighbouring skills own: card fields → `../st-character-authoring/SKILL.md`; WI entry design, keys, recursion, `/world` activation from code → `../st-lorebook-authoring/SKILL.md`; `/sd`, prose-to-prompt, image automation, `/bg` → `../st-image-generation/SKILL.md`; DOM selectors, Custom CSS, themes → `../../sillytavern-docs/community/ui-dom-selectors.md`; reasoning/sampler/preset tips → `../../sillytavern-docs/community/prompting-memory-prior-art.md`.

## Pick the tool

| You need to… | Use |
|---|---|
| Rewrite or restyle message text automatically (display, prompt, or stored) | **Regex script** |
| Run commands from a button, on an event, or when a WI entry activates | **Quick Reply** (body = STscript) |
| Logic, variables, generation, prompt injection | **STscript** (QR body, chat input, `executeSlashCommandsWithOptions`) |
| A dynamic value inside any prompt field / script argument | **Macro** |
| Read Story Orchestrator state from a script | `{{story_*}}` macros — no side effects |
| Author actions on a running story | `/cp …` (author-only; spoils; commits boundaries) |

## Decision rules (the ones that bite)

**Regex** — details `references/regex-scripts.md`
1. **Ephemerality.** No flag = the stored message is rewritten *permanently* at send/receive (and on edit if `runOnEdit`). `markdownOnly` ("Alter Chat Display") = display only; `promptOnly` ("Alter Outgoing Prompt") = prompt only; both = display+prompt, file untouched (verified: st:public/scripts/extensions/regex/engine.js:348-355; editor.html:148-158).
2. **World Info placement (5) needs `promptOnly`** — WI is regexed as prompt (verified: st:public/scripts/world-info.js:5205; editor.html:98).
3. Order global → preset → scoped; scoped/preset scripts run only when allowed for that card/preset (verified: engine.js:11-16, 98-133).
4. Replace With: `$1…`, `$<name>`, `{{match}}`/`$0`; a missing group → `''`; `trimStrings` apply per inserted group; macros resolve last (verified: engine.js:419-445). No `$&`.
5. `findRegex` is `/pattern/flags` or a bare pattern; no `g` = first match only; a bad pattern fails **silently** (verified: st:public/scripts/utils.js:1387-1402; engine.js:411-416).
6. HTML output: turn "Show `<tags>` in responses" **off**; classes get a `custom-` prefix (except `fa-*`, `note-*`, `monospace`) — never type `custom-` yourself; inline `<style>` works (scoped to `.mes_text`); external images are blocked by default → serve from `/characters/<Name>/…` (verified: st:public/script.js:1875; st:public/scripts/chats.js:536-620, 1922-1931, 1973-2010; st:public/scripts/power-user.js:301, 336; st:src/users.js:1214).

**Quick Replies** — details `references/quick-replies.md`
7. A `message` starting with `/` is executed; anything else is typed and sent (verified: st:public/scripts/extensions/quick-reply/src/QuickReplySet.js:153-194).
8. Auto-execute needs *Enable Quick Replies* **and** the set linked in the Global, Chat or Character list (visibility irrelevant) (verified: quick-reply/src/AutoExecuteHandler.js:16-45).
9. `executeOnAi` also fires after Continue/regenerate/swipe. `automationId` QRs fire on `WORLD_INFO_ACTIVATED` **during prompt building, before the reply exists** (verified: quick-reply/index.js:284-302; world-info.js:893-903).
10. Keep `preventAutoExecute` (default **true**, "Don't trigger auto-execute") on — it stops auto-QRs from triggering each other into loops (verified: quick-reply/src/QuickReply.js:39; AutoExecuteHandler.js:16-31).

**STscript** — details `references/stscript.md`
11. The previous result is injected only into a command **without** its own unnamed argument; `||` blocks injection; `{{pipe}}` is explicit (verified: st:public/scripts/slash-commands/SlashCommandClosure.js:557-561; SlashCommandParser.js:792-801). So a **getter after a value-returning command becomes a setter**: `/setvar key=a x | /preset |` switches to the preset that fuzzy-matches `x` — write `||` before `/preset`, `/profile` and other no-arg getters (verified: st:public/scripts/preset-manager.js:917-977).
12. An unescaped `|` or `:}` inside a `"quoted value"` is a parse error — write `\|`. There is no `\n` escape; use `{{newline}}` (verified: SlashCommandParser.js:1235-1245).
13. Macros in arguments resolve at execution time, after parsing — macro values may contain spaces and pipes safely (verified: SlashCommandClosure.js:544, 582).
14. `/if` operands resolve numeric → scoped var → local var → global var → literal; loops cap at 100 without `guard=off` (verified: st:public/scripts/variables.js:20, 440-480).
15. Temporaries: `/let key=x` (dies with the script), not `/setvar` (persists into this chat's `chat_metadata.variables`). Capture the pipe with `key=` — `/let x` after a pipe declares `x` empty (verified: variables.js:822-846).
16. `/gen` = quiet generation with chat + card; `/genraw` = only your text; `/profile-genstream profile=…` = another profile **without switching** (verified: st:public/scripts/slash-commands.js:2211-2310; extensions/connection-manager/index.js:1048-1140). `/profile` awaits its switch by default — community `/delay` after it is legacy (connection-manager/index.js:904-957).
17. `/world` with an empty name (e.g. an empty variable) deactivates **all** global lorebooks; names are comma-split (verified: world-info.js:5772-5821).

**Macros** — details `references/macros.md`
18. Two engines. New ("Experimental Macro Engine") is the default for fresh installs and supports nesting and `{{if}}`; **this dev install runs legacy**, where `<user>` nests but `{{user}}` inside `{{setvar::…}}` does not (verified: st:public/scripts/power-user.js:302; st:public/scripts/macros.js:612-700; `st:data/default-user/settings.json`, 2026-09-18).
19. `{{story_*}}` macros never return `''` (placeholders like `(none)`), so truthiness tests always pass — compare against the placeholder.

## Workflows

### A. Regex script for a test or a feature
1. Copy a real model output as the test string. Write the pattern with lazy groups (`+?`) and the `g` flag.
2. Choose placement + flags with rules 1–2. Marker the model must keep seeing → `markdownOnly`.
3. Start from `templates/regex-script.json` (valid import shape). Extensions → Regex → Import → choose global/scoped/preset. Test Mode / Debugger in the panel.
4. Verify each surface you changed: display (reload the chat), outgoing prompt (`node scripts/debug/st-payload.mts arm` then `last`), stored text (`/messages <id>` or `so-state`).
5. From scripts: `/regex name=<script> <text>` transforms arbitrary text; `/regex-toggle state=off <script>` (reloads the chat); `/regex-state <script>`.

### B. Quick Reply automation
1. Start from `templates/quick-reply-set.json` (a button, an `executeOnAi` QR with a Continue guard, an `automationId` QR). Extensions → Quick Reply → Edit Quick Replies → Import; link it under Global Quick Reply Sets.
2. Event-driven: tick exactly one `executeOn*`. Situation-driven: set `automationId` on the QR and the **same string** on a WI entry (keys = situation words, empty content, recursion off — lorebook skill).
3. Guard re-runs: `/if left={{lastGenerationType}} right=continue rule=eq {: /abort :} |` first.
4. Anything that must appear *after* the reply belongs in `executeOnAi`, not in a WI automation.

### C. Scripted side task on another model/preset
Prefer `/profile-genstream profile=<name> <prompt>` (no global swap). If you must swap (e.g. `/sd` uses the main API): `/profile || /let key=og ||` … `/profile {{var::og}}`, `||` before every getter (rule 11), restore on every path, never `/abort` between swap and restore. Full pattern: `references/stscript.md` §6.

### D. Compose Story Orchestrator with STscript
Separate one-liners (each runs on its own):
- Read without side effects: `/echo {{story_current_checkpoint}} · tension {{story_tension}}`
- Branch on state (placeholders, never empty): `/if left={{story_tension}} right="(unknown)" rule=neq {: /setvar key=so_last_tension {{story_tension}} :}`
- Capture a command's answer: `/story recap | /let key=recap ||` then use `{{var::recap}}` later in the same script (`/let recap` would stay empty — the name is its unnamed argument, so no pipe is injected; st:public/scripts/variables.js:822-846).
- Author write: `/cp set <quality> <value>` — enqueues the delta **and commits a boundary immediately**.

Every `/cp`, `/so-mem`, `/story` callback returns its text into the pipe. List-style answers (`/cp list|state|converge`, `/so-mem list`, `/story recap|threads`) are **also posted to chat** as a system message (`dump()` → `sendSystemChatMessage`); status answers (`set`, `activate`, `pin`, `flag`) are a toast (`show()`) (`src/runtime/slashCommands.ts:17-25`). Macros are the side-effect-free read path.

## Tooling (our debug scripts)

- **Git Bash mangles a leading `/`** into a Windows path and the command silently no-ops — prefix `MSYS_NO_PATHCONV=1` (`.claude/rules/debug-scripts.md`):
  `MSYS_NO_PATHCONV=1 node scripts/debug/st-actions.mts slash "/story recap | /echo"` → JSON with `ok`, `pipe` (first 500 chars) and chat length before/after (`scripts/debug/st-actions.mts:152-185`).
- **PowerShell** does not mangle paths but interpolates `$…` inside double quotes — single-quote anything containing `$1`/`$<name>`/`$var`.
- In-page, no quoting games: `node scripts/debug/st-eval.mts "(await ctx.executeSlashCommandsWithOptions('/getvar so_last_checkpoint')).pipe"` (`ctx` = `SillyTavern.getContext()`, `rt` = our runtime; `scripts/debug/st-eval.mts:7-27`).
- Chat variables directly: `ctx.variables.local.get('x')` (st:public/scripts/st-context.js:258-276). QR API: `globalThis.quickReplyApi` (see `references/quick-replies.md` §7).

## Checklists

**Regex pre-flight** — test string copied from real output · `g` flag · lazy groups, no greedy `[^:]+\s*:` · placement matches the message source (user / AI / slash / WI / reasoning) · ephemerality chosen on purpose · WI placement ⇒ `promptOnly` · HTML: no `custom-` typed, no external URLs, unindented · `runOnEdit` if edits should re-render · `minDepth/maxDepth` null unless intended.

**QR pre-flight** — message starts with `/` (no leading whitespace) · set linked (global/chat/character) · Enable Quick Replies on · one trigger per QR · `preventAutoExecute` on · Continue guard where it matters · `automationId` identical on QR and WI entry (and re-passed on every `/qr-update`) · temporaries via `/let`.

**Script pre-flight** — `\|` inside quotes · `{{newline}}` not `\n` · commands that need the pipe have no unnamed arg · `/if` literals don't collide with variable names · loops `guard=off` only with a real exit · swap/restore without `/abort` in between · no empty `/world` argument.

**Cleanup after a live test** — `so-assets.mts` only knows characters, groups and lorebooks (`scripts/debug/so-assets.mts:34-36`), so remove scripting assets yourself: `/qr-set-delete so-test-scripting` (quick-reply/src/SlashCommandHandler.js:627-651); global regex via `st-eval` → filter `ctx.extensionSettings.regex` by the `so-test` name prefix, then `ctx.saveSettingsDebounced()` (engine.js:113, 143-145); `/flushvar` any chat variables the test set; `/flushinject` any `/inject` ids. Name every test asset with the `so-test` prefix.

## Project hooks

- `src/runtime/slashCommands.ts` — registers `/cp` (alias `/checkpoint`; author: `list|state|activate|set|converge|memorize`, debug `extract|expand`), `/so-mem` (`list|pin|exclude|backlog`) and the player-safe `/story` (`recap|threads|flag`). All `rawQuotes`, one space-split string argument; callbacks return the text (pipeable) and `dump()` also posts it as a system message. `/cp set` enqueues a delta and commits a boundary immediately (`src/runtime/runtimeManager.ts:255-276`) — never put it in an `executeOnAi` QR.
- `src/runtime/macros.ts` — the `{{story_*}}` macros (table in `references/macros.md` §4), registered via `registerHostMacro` (`src/services/stHost/context.ts:18-22`); they are resolved in prompts, WI, A/N, regex Replace With, QR bodies and script arguments alike.
- `src/services/stHost/slashCommands.ts` — our only way to run STscript from the extension: `executeSlashCommands()` wraps `executeSlashCommandsWithOptions` with pinned parser flags (strict escaping on, getvar rewriting off), silenced success toasts and error handling, and returns `ok` (a parse error is `false`). Callers: `/note*` (`stHost/authorNotes.ts:30-42`), `/bg` (`stHost/backgrounds.ts:53`), `/world silent=true state=on` (`stHost/worldInfo.ts:123`), `/sendas`, `/trigger await=true`, `/comment compact=true` (`src/runtime/effectsApplier.ts:89-106`, `src/runtime/index.ts:99`).
- `src/utils/string.ts` `quoteSlashArg` — encodes for **STRICT_ESCAPING**, which `executeSlashCommands` pins on every run through `parserFlags` (the user's STscript setting never applies to our commands). Inside quotes only `"` is special, so `|` stays literal, and backslashes double only before a quote or the closing quote. Real newlines pass through, and `{`/`}` become `\{`/`\}` so macros reach the command unresolved. Never hand-build a quoted argument for `executeSlashCommands`, and pass `raw=false` to `rawQuotes` commands (`/sendas`, `/comment`), which would otherwise post the quotes. Before 2026-09-19 it used `\n` and left `|` bare, so an AN with `|` never landed and multi-line text arrived with a literal `\n` (live-verified).
- `src/constants/injectionRegistry.ts` — our prompt injections use `setExtensionPrompt` keys `story_orchestrator_*`; script `/inject` uses `script_inject_<id>` (st:public/scripts/slash-commands.js:3773), so they never collide; `/listinjects` does not show ours.
- `src/extraction/chatWindow.ts:8-10` — extraction reads the **stored** `mes` and skips system messages: display/prompt-only regex is invisible to it, a permanent regex changes what it extracts from, and `/story`/`/cp` output and transition `/comment`s never feed it.
- `scripts/debug/st-actions.mts slash`, `scripts/debug/st-eval.mts`, `scripts/debug/st-payload.mts` — run/inspect scripts (see Tooling). `so-scenario` has a `slash` step too (`scripts/debug/README.md`).

## References

- `references/regex-scripts.md` — open to write, import, embed or debug a regex: storage, full JSON schema, placement table, ephemerality matrix, depth, HTML/CSS rendering rules, recipes (illustrations, skill chips, WI section toggle, quote/tag cleanup), `/regex*` commands, troubleshooting.
- `references/quick-replies.md` — open to build or debug QRs: set/entry JSON with defaults, event mapping per flag, automation-ID timing, Continue/random guards, `/qr-*` commands and `quickReplyApi`, troubleshooting.
- `references/stscript.md` — open to write a non-trivial script: syntax table, escaping, variables, control flow, `/gen`/`/genraw`/`/profile-genstream`/`/inject`, everyday commands, community idioms (swap/restore, prompt-from-context), LALib-only commands, pitfalls.
- `references/macros.md` — open when a macro misbehaves or you use `{{story_*}}`: engine switch, legacy order, tips, our macro table.
- `templates/regex-script.json` — importable display-only chip (named groups, `markdownOnly`, AI Output).
- `templates/quick-reply-set.json` — importable set `so-test-scripting`: button, `executeOnAi` with Continue guard, `automationId: so_test_hook`.

Both templates were checked against the import guards (regex/index.js:1499-1506; quick-reply/src/ui/SettingsUi.js:437-443) and the field lists (st:public/scripts/char-data.js:88-102; QuickReply.js:1902-1921; QuickReplySet.js:362-374), and the regex was run through a copy of the engine's `regexFromString` + replace logic.

## Sources

| Thread (SillyTavern Discord `st-guides`) | Created → last activity | Upvotes | Used for |
|---|---|---|---|
| [Using Regex to Insert Character Illustrations/Stickers in Chats](https://discord.com/channels/1100685673633153084/1342397452933664768) — Rivelle | 2025-02-21 → 2025-11-17 | 36 | regex JSON, capture groups, `custom-` prefix, display-only scripts |
| [Custom CSS snippet compilation](https://discord.com/channels/1100685673633153084/1226855443586879519) §19 + `help_help.json` — underscore_x (curator), Rivelle | 2024-04-08 → 2026-05-10 | 82 | regex + CSS skill-check chip |
| [Community Quick Tips](https://discord.com/channels/1100685673633153084/1286355628314333335) — wit et al. | 2024-09-19 → 2025-07-25 | 20 | macro, regex, reasoning-tag tips, WI section toggle |
| [Automated Stable Diffusion Quick Reply System](https://discord.com/channels/1100685673633153084/1269752398310670471) — Idiot | 2024-08-04 → 2024-12-29 | 5 | automation IDs, Continue guard |
| [2.0 Seamless Image Generation Guide](https://discord.com/channels/1100685673633153084/1384178466202845285) §3, §5 — closure [DORK] et al. | 2025-06-16 → 2026-06-24 | 37 | QR JSON, swap/restore, `/gen`/`/genraw` piping idioms |
