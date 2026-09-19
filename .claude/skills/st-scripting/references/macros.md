# Macros — engines, evaluation order, tips, our `{{story_*}}` macros

Open this when a macro resolves wrongly, when nesting macros, or when using Story Orchestrator macros from scripts, QRs, regex or World Info. The macro **list** is in `../../../sillytavern-docs/macros.md` (official, not repeated here — note it predates the new engine and says nesting is unsupported, which is only true for the legacy engine). In-app: `/help macros`. `st:` = `C:\dev\SillyTavern-MainBranch\` (ST 1.19.0).

## 1. Two engines — find out which one is running

| | Legacy (regex-based) | New ("Experimental Macro Engine") |
|---|---|---|
| Switch | User Settings → *Experimental Macro Engine* off | on (title: "Allows nested macros to be resolved correctly and has a dedicated, logical replacement order") (verified: st:public/index.html:5455-5459) |
| Default | — | **on for fresh installs** since ST PR #5234 (verified: st:public/scripts/power-user.js:302) |
| This dev install | **off** (`"experimental_macro_engine": false` in `data/default-user/settings.json`, checked 2026-09-18) | |
| Nesting | no | yes |
| Extras | — | `{{if cond}}…{{else}}…{{/if}}`, `{{hasvar::x}}`, `{{deletevar::x}}`, `{{setvarkey}}`/`{{getvarkey}}`, `{{hasExtension::…}}`, `{{space}}`, `{{charCreatorNotes}}`, variable shorthands `{{.local}}` / `{{$global}}` with `= += -= ++ -- ?? ??= \|\| == != > >= < <=` (verified: st:public/scripts/macros/definitions/core-macros.js:134-217, variable-macros.js, state-macros.js; macros/engine/MacroCstWalker.js:526-606) |

Check live: `node scripts/debug/st-eval.mts "ctx.powerUserSettings.experimental_macro_engine"` (`powerUserSettings` is on the context: st:public/scripts/st-context.js:229). Anything you write for other people should work on **both** engines — avoid nesting and the new-only syntax unless you control the setting.

## 2. Legacy evaluation order (why some combinations fail)

`evaluateMacros` runs one ordered list of regex replacements (verified: st:public/scripts/macros.js:612-700):
1. `<USER>`, `<BOT>`, `<CHAR>`, `<GROUP>`, `<CHARIFNOTGROUP>` (case-insensitive)
2. dice `{{roll}}`, instruct macros, **variable macros** (`{{setvar}}`, `{{getvar}}`, …), `{{newline}}`, `{{trim}}`, `{{noop}}`, `{{input}}`
3. env macros: `{{user}}`, `{{char}}`, card fields, **every macro registered by extensions** (our `{{story_*}}`)
4. `{{lastMessage}}`, `{{lastMessageId}}`, time/date, `{{random}}`, `{{pick}}`, `{{//…}}`, `{{outlet::…}}`, …

Consequences:
- `{{setvar::who::<user>}}` works (angle-bracket macros resolve in step 1); `{{setvar::who::{{user}}}}` does not (community tip "`<bot>`/`<user>` can be nested", 2024-09 — confirmed by the order above).
- A variable macro cannot capture an extension macro's value: `{{setvar::cp::{{story_current_checkpoint}}}}` stores garbage. In STscript use `/setvar key=cp {{story_current_checkpoint}}` — arguments are macro-substituted before the command runs.
- Legacy `{{setvar::name::value}}`: name cannot contain `:`, value cannot contain `}` (verified: st:public/scripts/variables.js:240-248).

## 3. Tips that hold on both engines

- `{{trim}}` deletes the newlines around it — lets you keep blank lines in long prompt/lorebook text for readability and strip them on send (verified: macros.js:633; community tip, 2024).
- `{{noop}}` = empty string — handy to "empty" a variable: `/setvar key=x {{noop}}` (macros.js:634).
- `{{getvar::name}}` works **inside World Info keys**: keys are macro-substituted before matching (verified: st:public/scripts/world-info.js:4914-4917). The resolved *value* is then searched for in the scanned text — it is a variable-driven keyword, not an on/off switch; an empty variable matches nothing. Entry design lives in `../../st-lorebook-authoring/SKILL.md`.
- WI **content** macros resolve before World-Info regex scripts run — basis of the section-toggle trick in `regex-scripts.md` §8.3 (world-info.js:5058 → 5205).
- `{{lastGenerationType}}` (`normal|swipe|regenerate|continue|impersonate|quiet`) is the cleanest Continue guard (verified: macros.js:717-735).
- Regex **Replace With** is macro-substituted after capture insertion, so `{{char}}`/`{{getvar::x}}` work there (verified: st:public/scripts/extensions/regex/engine.js:444).
- Chat variables from JS: `SillyTavern.getContext().variables.local.get/set/has/del` and `.global.*` (verified: st-context.js:258-276).

## 4. Story Orchestrator macros

Registered in `src/runtime/macros.ts` through `registerHostMacro` → `MacrosParser.registerMacro` (`src/services/stHost/context.ts:18-22`):

| Macro | Value | Empty value |
|---|---|---|
| `{{story_title}}` / `{{story_description}}` | story metadata | `(no story)` / `(none)` |
| `{{story_current_checkpoint}}` | `Name — objective` | `(none)` |
| `{{story_past_checkpoints}}` | visited names, one per line | `(none)` |
| `{{story_possible_transitions}}` | outgoing transitions with gate text | `(none)` |
| `{{story_tension}}` | current tension level | `(unknown)` |
| `{{story_player_name}}` | persona name | `(player)` |
| `{{story_blackboard}}` · `{{story_canon}}` | blackboard memo · derived canon | `(none)` for canon |
| `{{story_memory_facts}}` · `{{story_memory_session_details}}` · `{{story_memory_short_term}}` · `{{story_memory_scene_history}}` | memory tier blocks (`MEMORY_TIERS`, `src/memory/types.ts:1`) | `(none)` |
| `{{story_epistemic}}` · `{{story_ledger}}` | active-speaker epistemic block · state ledger | `(none)` |
| `{{story_role_<memberId>}}` | roster member's name; re-registered when the roster changes | — |

Rules when scripting with them:
- They **never return an empty string** — `/if left={{story_canon}}` is always truthy and `{{if story_canon}}` always takes the then-branch. Compare against the placeholder: `/if left={{story_canon}} right="(none)" rule=neq {: … :}`.
- Several are spoilers (blackboard, canon, epistemic, ledger, transitions): keep them out of anything a player sees (player/author split: `.claude/CLAUDE.md` → UI entry points).
- `MacrosParser.registerMacro` registers into **whichever engine is active at registration time** (verified: macros.js:81-84, 183-214). Toggling *Experimental Macro Engine* after the extension started leaves `{{story_*}}` unresolved until a page reload.
- Values are computed on every substitution (functions), so they reflect the live snapshot, including unpersisted state.
