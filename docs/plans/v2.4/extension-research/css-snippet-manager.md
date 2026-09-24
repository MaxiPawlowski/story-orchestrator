# CSS Snippet Manager — v2.4 review

meta: LenAnderson · https://github.com/LenAnderson/SillyTavern-CssSnippets · `835d5f7` (2025-05-17, manifest v1.21.2) · 53 upvotes / 255 msgs · source available: y (`source/`, ~1.8k own lines; `lib/prism-code-editor` vendored, skipped)

## What it is
UI-only utility: manages named custom-CSS snippets, each enabled globally, per ST theme, or per chat (character avatar / group id). Editor in a popout window with Prism highlighting, sort, filter, import/export, `/csss*` slash commands. Optional external-editor live-reload via LenAnderson's Files plugin. No LLM, no prompt, no chat state. Relevance to SO: low — only its slash-command ergonomics and a couple of anti-patterns matter.

## How it works
- Entry `index.js:1-9` imports host modules directly (`script.js` `characters`, `saveSettingsDebounced`; `extensions.js` `extension_settings`, `getContext`; `group-chats.js` `groups`; `power-user.js` `power_user`; `SlashCommand*` classes).
- Persistence: whole model in `extension_settings.cssSnippets` (`index.js:56-57`, `src/Settings.js:37-44` `toJSON`), saved with `saveSettingsDebounced` (`src/Settings.js:47-50`). Snippet = `{id(uuid), name, isDisabled, isGlobal, content, themeList[], charList[avatar], groupList[groupId], isSynced, isDeleted, modifiedOn}` (`src/Snippet.js:34-48`, `:84-100`). Legacy `themeSnippets` map migrated on load (`src/Snippet.js:23-25`).
- Cross-user "sync": a second copy in `localStorage['csss--syncedList']` (`src/Settings.js:53-59`); on init, last-write-wins by `modifiedOn` with `isDeleted` tombstones (`index.js:59-82`). localStorage is per-origin, so this shares snippets between ST user accounts in one browser.
- Apply: one `<style id="csss--css-snippets">` in `<head>` rebuilt in three buckets global → theme → chat, de-duplicated (`index.js:461-499`). Each bucket passes `sanitize` (`index.js:453-460`): parse via a temporary `<style>` and re-serialise `sheet.cssRules`, dropping unparseable rules.
- Change detection: `themeLoop` is an unbounded `while(true)` polling `power_user.theme` and `characterId ?? groupId` every 500 ms (`index.js:403-419`) — no `CHAT_CHANGED` subscription (ST has one, `public/scripts/events.js:19`).
- UI placement: a button appended into ST's `#CustomCSS-block > h4` (`index.js:84-95`; host `public/index.html:5320`). Manager = `window.open(...html/manager.html, 'popup')` (`index.js:959-967`), cloning every non-extension stylesheet into the child (`index.js:1002-1004`), fetching jQuery/jQuery-UI source and injecting it as inline `<script>` for `sortable` (`index.js:1016-1033`).
- Import: file or clipboard paste; JSON array → snippets, else whole text becomes one CSS snippet (`index.js:1113-1138`). Export: selection mode, copy or download.
- Slash: `/csss`, `/csss-on|off|create|delete|get|update`, one command per verb, named args (`name=`, `theme=`, `global=`, `quiet=`), and `enumProvider: ()=>settings.snippetList.map(it=>new SlashCommandEnumValue(it.name))` for live autocomplete (`index.js:108-390`, e.g. `:138`, `:169`, `:241`, `:348`). Host: `SlashCommandArgument.js:32/54` `enumProvider(executor, scope)`.
- No mutation handling (no chat content involved); no LLM calls.

## Overlap with Story Orchestrator
- Chat-scoped config keyed by stable host ids (avatar / group id): we do the same for roster resolution (`src/services/stHost/groups.ts:22` matches `entry.avatar`), and our per-chat state lives in `chat_metadata`, which is stronger than a global list keyed by chat.
- Change detection: we subscribe to host events by constant key (`src/services/stHost/events.ts:54`); their 500 ms poll is worse.
- Slash commands: we register `/cp`, `/so-mem`, `/story` through the context (`src/runtime/slashCommands.ts:60,121,172`), with a static `enumList` only for `/story` (`:165`, `buildEnumList` `:33`). `/cp` and `/so-mem` take one free-form multi-string argument (`:53-58`, `:114-119`) parsed by hand — no autocomplete of checkpoint ids, qualities or memory ids. Theirs is better here.
- CSS: ours is scoped to mount roots (invariant 19); theirs is intentionally global. Not comparable.

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | Dynamic `enumProvider` autocomplete for `/cp activate <id>`, `/cp set <quality>`, `/so-mem pin|exclude <id>`, gated on author view | host-integration | host / player-ui | partial | 2 | S |
| 2 | Never poll host state in an unbounded loop; subscribe to events | anti-pattern | host | present | 2 | S |
| 3 | Do not add story-authored CSS / per-story theming effect | anti-pattern | stagecraft | absent | 1 | M |

**1 — enumProvider autocomplete.** What: give `/cp` subverbs and `/so-mem` ids live completion from the snapshot (checkpoint ids+names, quality keys with type/enum values, memory ids with a text preview), as ST's autocomplete does for their snippet names. Their evidence: `index.js:138,169,241,274,348`. Ours: `src/runtime/slashCommands.ts:53-64` free-form, `lastMemListIds` index hack at `:39-45` (you must `/so-mem list` first to address by number). Fit: invariant 9 — a checkpoint/quality list is a spoiler, so the provider must return `[]` unless `extras.ui.authorView` is on; `/story` stays static. Invariant 2 — `enumProvider` is a callback property on `SlashCommandArgument.fromProps`, no new host import, but the host shape should be recorded in `hostTypes.ts` + 00-overview host facts. Optional companion: split `/cp` into verb commands (`/cp-activate`, `/cp-set`) so each gets its own typed args, as they do — cheap but widens the command surface; only if autocomplete needs it.

**2 — polling anti-pattern.** Their `themeLoop` (`index.js:403-419`) never exits, runs forever at 500 ms, and reacts up to 500 ms late; an extension disable/reload leaves no way to stop it. Ours is event-driven (`stHost/events.ts:54`); our only retry loop, `registerSlashCommandsWhenReady`, is bounded to 100 attempts (`src/runtime/index.ts:33-40`). Keep it that way; if v2.4 ever needs a host value with no event (e.g. theme, `power_user` fields), prefer `SETTINGS_UPDATED` (`events.js:30`) + read-on-use over a poll. No action unless a new watcher is proposed.

**3 — no story-authored CSS.** A tempting stagecraft extension of this extension's "chat-scoped snippet" idea is `effects.css` per checkpoint. Reject: stories are shareable/importable, and arbitrary CSS can beacon out (`url()` in `background-image`/`@import`) — a privacy crossing the `privacy-report.md` inventory would have to name; it would also escape invariant 19's root scoping and hit ST's DOM, which baseline §4 says SO never touches. Their `sanitize` (`index.js:453-460`) only validates syntax, it does not neuter URLs. `effects.background` already covers the legitimate visual case. Our state: absent (grep `effects` schema `src/engine/schema.ts:87` has no css key).

## Patterns to copy / anti-patterns to avoid
- Copy: validate with the host's own parser rather than a regex (`sanitize` round-trips through CSSOM) — same principle as our harness compiling every `eval` with the runner's wrapper. Copy: import accepts either a structured export or a raw payload and says which it took (`index.js:1115-1121`) — only if Studio import ever gains a raw-text path.
- Avoid: unbounded polling loop (above). Avoid: `window.open` popout that clones host stylesheets and injects fetched jQuery source as inline script (`index.js:959-1033`) — popup blockers, desynced theme, CSP-hostile; our native `<dialog>` modal is the right call. Avoid: direct host imports from `script.js`/`power-user.js` (`index.js:1-9`) — breaks on host refactors; our STAPI seam exists for this. Avoid: a second persistence home (`localStorage` sync list) with LWW and tombstones — two copies of settings drift and the "synced" flag is invisible per-user state; our three-homes rule forbids it. Avoid: `sanitize` appends the style to `document.head` before removing it (`index.js:455-458`) — a flash of the unsanitised CSS applied page-wide.

## ST host facts learned
- `SlashCommandArgument.fromProps({ enumProvider })` takes `(executor, scope) => SlashCommandEnumValue[]`, evaluated at autocomplete time (their `index.js:138`; host `public/scripts/slash-commands/SlashCommandArgument.js:32,54,64`). `SlashCommandEnumValue` is exposed on the context (`st-context.js:169`) — consistent with our `buildEnumList` (`slashCommands.ts:33`).
- `#CustomCSS-block > h4` is a stable mount point in User Settings (`index.js:84`; host `index.html:5320`).
- `power_user.theme` holds the active theme name and is reassigned in several paths (`power-user.js:2420,2525,2980,3516`); no dedicated theme-changed event exists in `events.js` — why they poll.
- Group members are identified by avatar filename, characters by `avatar` too (`index.js:634,853`; `src/Snippet.js:61`) — matches our `groups.ts:22`.
- `localStorage` is shared across ST user accounts on the same origin (their sync relies on it, `src/Settings.js:53-59`) — anything we might put there would leak between ST users. No contradiction with our gotchas.

## Verdict
Relevance **low**. A pure CSS utility with no story, prompt or chat-state logic. The one thing worth taking: **author-gated `enumProvider` autocomplete for `/cp` and `/so-mem`** (S effort, removes the `/so-mem list` numbering hack). Everything else is either already done better in SO or an anti-pattern to keep out.
