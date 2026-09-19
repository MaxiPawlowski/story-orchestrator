# Quick Replies — sets, entries, auto-execute, automation IDs

Open this when building or importing a QR set, wiring a QR to an event or a World Info entry, or debugging why a QR does (not) fire. `st:` = `C:\dev\SillyTavern-MainBranch\` (ST 1.19.0); `qr/` below = `st:public/scripts/extensions/quick-reply/`.

## 1. Model

- A **set** is a named list of **entries** (QRs). A set does nothing until it is **linked** in one of three lists in Extensions → Quick Reply: **Global Quick Reply Sets**, **Chat Quick Reply Sets**, **Character Quick Reply Sets**; each link has a visibility toggle (verified: qr/html/settings.html; qr/src/QuickReplySetLink.js:12-13; qr/src/AutoExecuteHandler.js:35-45).
- Master switch: **Enable Quick Replies** — auto-execute checks it (verified: AutoExecuteHandler.js:16-18).
- Storage: one file per set, `data/<user>/QuickReplies/<name>.json` (filename sanitized), written by `POST /api/quick-replies/save`, deleted by `/delete`, and **read from the directory at settings load** — dropping a JSON file there and reloading ST also installs a set (verified: st:src/constants.js:40; st:src/endpoints/quick-replies.js:10-33; st:src/endpoints/settings.js:261, 281).

## 2. Set JSON

What export writes (verified: qr/src/QuickReplySet.js:362-374; defaults 30-39):

| Field | Type | Default | Meaning (UI label) |
|---|---|---|---|
| `version` | int | 2 | import guard: must be an integer |
| `name` | string | — | import guard: must be a string; also the file name and the `/run Set.Label` prefix |
| `disableSend` | bool | false | "Disable send (insert into input field)" — put the text in the input box instead of sending/executing |
| `placeBeforeInput` | bool | false | "Place quick reply before input" |
| `injectInput` | bool | false | "Inject user input automatically" (else use `{{input}}`) |
| `color` | string | `transparent` | button tint (`--qr--color`) |
| `onlyBorderColor` | bool | false | "Only apply color as accent" |
| `qrList` | QR[] | [] | entries (required array — import calls `.map` on it) |
| `idIndex` | int | 0 | last issued id; keep ≥ the highest entry `id` |

Import (Edit Quick Replies → Import): rejects files without integer `version` + string `name`; a same-named set triggers an overwrite confirm that **deletes the old set** (verified: qr/src/ui/SettingsUi.js:427-488). `templates/quick-reply-set.json` passes this guard.

## 3. Entry (QR) JSON

(verified: qr/src/QuickReply.js:30-48 defaults, 1902-1921 export; editor labels qr/html/qrEditor.html:89-125)

| Field | Default | Editor label / meaning |
|---|---|---|
| `id` | — | numeric id within the set |
| `icon`, `showLabel` | `''`, false | Font Awesome icon on the button; show label next to it |
| `label` | `''` | button text; the name used by `/run Set.Label` |
| `title` | `''` | tooltip |
| `message` | `''` | the payload — see §4 |
| `contextList` | [] | context-menu links to other sets, `{set: "<name>", isChained: false}` (verified: qr/src/QuickReplyContextLink.js:10-19) |
| `preventAutoExecute` | **true** | "Don't trigger auto-execute" — while *this* QR auto-runs, no other auto-execute QR can fire (verified: AutoExecuteHandler.js:16-31). Keep it on: it is the loop breaker when a QR generates messages |
| `isHidden` | false | "Invisible (auto-execute only)" |
| `executeOnStartup` | false | "Execute on startup" — `APP_READY` |
| `executeOnUser` | false | "Execute on user message" — `USER_MESSAGE_RENDERED` (registered first) |
| `executeOnAi` | false | "Execute on AI message" — `CHARACTER_MESSAGE_RENDERED` (registered first); also after **Continue**, regenerate and swipe; skipped only for the `'...'` swipe placeholder |
| `executeOnChatChange` | false | "Execute on chat change" — `CHAT_CHANGED` |
| `executeOnNewChat` | false | "Execute on new chat" — `CHAT_CREATED`, `GROUP_CHAT_CREATED` |
| `executeOnGroupMemberDraft` | false | "Execute on group member draft" — `GROUP_MEMBER_DRAFTED` |
| `executeBeforeGeneration` | false | "Execute before message generation" — `GENERATION_AFTER_COMMANDS`; skipped for dry runs and for the group wrapper pass |
| `automationId` | `''` | "Activate this quick reply when a World Info entry with the same Automation ID is triggered" |

Event wiring verified at qr/index.js:214-321 (`makeFirst` for user/AI messages, the `'...'` swipe skip at 285-288, dry-run/group-wrapper skips at 311-318). Auto-executed QRs run in order global → chat → character link lists (AutoExecuteHandler.js:35-45).

## 4. What a QR does when run

- `message` starting with `/` → executed as STscript; anything else → text put in the input box (macros substituted) and sent unless `disableSend` (verified: QuickReplySet.js:139-195).
- Button clicks with `injectInput` on prepend/append the current input text; auto-execute and `/run` never inject input (QuickReplySet.js:153-161).
- Arguments: `/run Set.Label x=1` → `{{arg::x}}` inside the QR; `/qr-arg x default` sets a fallback (verified: QuickReply.js:1878-1885; qr/src/SlashCommandHandler.js:652-679). `/run` also runs closures stored in scoped variables; aliases `/call`, `/exec`, shorthand `/:"Set.Label"` (verified: st:public/scripts/slash-commands.js:2579-2604; st:public/scripts/slash-commands/SlashCommandParser.js:928-963).
- A QR returns its final pipe to `/run` (QuickReplySet.js:185).

## 5. Automation IDs (World Info → QR)

- Each WI entry has an **Automation ID** field (`automationId` in a lorebook JSON; `extensions.automation_id` in a card-embedded `character_book`); it autocompletes from the automation IDs already used by QRs (verified: st:public/scripts/world-info.js:2715, 3817-3827, 3954-3962).
- When WI activates, every linked QR whose `automationId` equals an activated entry's id runs (exact string match; ids need not be numbers — name them `play_rain_sfx`, not `01`) (verified: AutoExecuteHandler.js:85-103).
- **Timing: this happens while the prompt is being built** (`WORLD_INFO_ACTIVATED` is awaited inside `getWorldInfoPrompt`, verified: world-info.js:893-903), i.e. *before* the model replies and the generation waits for the QR. Anything the QR posts appears **before** the reply — this answers the open question in the 2024 SD-automation thread ("in my case, it was before"). Use `executeOnAi` if the effect must follow the reply.
- Every prompt build scans WI — Continue, swipe, regenerate, impersonate and quiet `/gen` included; only dry runs skip it (verified: st:public/script.js:4635; world-info.js:900). So WI-triggered QRs fire again on Continue (guard them, §6.1), and a `/gen` inside an automation QR re-activates the same entries — only "Don't trigger auto-execute" keeps that from recursing.
- Automation entries can have empty content (no tokens spent); turn off recursion so they neither trigger nor get triggered by other entries; filtering to one character is a WI feature — see `../../st-lorebook-authoring/SKILL.md` (community practice, 2024-08).

## 6. Patterns

### 6.1 Skip Continue
Modern (one QR, no state): `{{lastGenerationType}}` holds the type of the last started generation — `normal`, `swipe`, `regenerate`, `continue`, `impersonate`, `quiet` — set on `GENERATION_STARTED` (verified: st:public/scripts/macros.js:717-735; new engine: macros/definitions/state-macros.js).
```
/if left={{lastGenerationType}} right=continue rule=eq {: /abort :} |
/echo only on fresh replies
```
Caveat: any quiet generation started in between (another script's `/gen`, an extension pass that uses the main API) overwrites it.

Classic (2024, still works): a hidden `executeOnAi` QR stores the id, each guarded QR compares.
```
/setvar key=lastmessageid {{lastMessageId}} |
```
```
/if left={{lastMessageId}} right={{getvar::lastmessageid}} rule=eq /abort | /sd <prompt>
```
On a fresh send the last id is the user's message (≠ stored AI id) → proceeds; on Continue nothing new was added → equal → aborts. The unquoted `/abort` after `/if` is a legacy sub-command string; it shares the caller's abort controller, so it stops the whole QR (verified: st:public/scripts/variables.js:388-411, 571-588). Prefer the closure form `{: /abort :}`.

### 6.2 Random-chance auto QR
```
/rand from=1 to=5 round=round |
/if left=1 right={{pipe}} rule=neq {: /abort :}
```
Lower `to=` = fires more often (community, 2025-08). `round` ∈ `round|ceil|floor` (verified: variables.js:2123-2175).

### 6.3 Keyword-driven automation library (SD-automation guide, 2024-08)
One QR per situation, each with an `automationId`, auto-execute flags **unchecked**; one lorebook whose entries carry the situation keywords and the same automation id. The lorebook becomes the trigger table, QRs the actions. The original actions were `/sd …` prompts (see `../../st-image-generation/SKILL.md`); the pattern works for any command (`/bg`, `/inject`, `/setvar`, our `/story flag`).

### 6.4 Do a side task on another model/preset, then restore
See `stscript.md` §6. Community QRs swap `/profile` + `/preset`, run, and restore from variables.

## 7. Managing QRs from scripts

| Command | Purpose (source: qr/src/SlashCommandHandler.js) |
|---|---|
| `/qr <index>` | run the n-th QR, **0-based**, counted across global then chat linked sets, hidden QRs included (line 78; qr/api/QuickReplyApi.js:58-68) — prefer `/run Set.Label` |
| `/qr-set <name>` · `/qr-set-on [visible=false] <name>` · `/qr-set-off <name>` | toggle / add / remove a **global** set link (94-148) |
| `/qr-chat-set …` · `/qr-chat-set-on` · `/qr-chat-set-off` | same for the chat list (149-204) |
| `/qr-set-list [all\|global\|chat]` · `/qr-list <set>` | list sets / labels (205-231) |
| `/qr-create set=… label=… [hidden=] [startup=] [user=] [bot=] [load=] [new=] [group=] [generation=] [title=] [icon=] [showlabel=] <message>` | create an entry; flag args map to `executeOn*` (233-303, 855-877) |
| `/qr-update set=… label=\|id=… [newlabel=] … [<message>]` | update an entry (345-375, 891-915) |
| `/qr-get`, `/qr-delete`, `/qr-contextadd`, `/qr-contextdel`, `/qr-contextclear` | inspect / delete / context menus (304-570) |
| `/qr-set-create <name>` · `/qr-set-update` · `/qr-set-delete <name>` | whole sets (571-651) |
| `/import from=Set.Label x [x as y …]` | import closures that another QR defines with `/let`/`/var` (680-760) |

Gotchas:
- `automationId` is **not a declared argument** of `/qr-create`/`/qr-update`, but undeclared named args are passed through, so `automationId=foo` works (verified: slash-commands/SlashCommandClosure.js:496-499; SlashCommandHandler.js:872, 909).
- **`/qr-update` without `automationId=` clears it** — the handler passes `args.automationId ?? ''` and the API keeps the old value only for `null`/`undefined` (verified: SlashCommandHandler.js:909; qr/api/QuickReplyApi.js:296). Always re-pass it.
- In-page API for tests: `globalThis.quickReplyApi` — `createSet(name, {...})`, `createQuickReply(set, label, {message, isHidden, executeOnAi, …, automationId})`, `updateQuickReply`, `deleteSet`, `addGlobalSet/removeGlobalSet`, `addChatSet/removeChatSet`, `listSets`, `listAutomationIds` (verified: qr/index.js:209-216; qr/api/QuickReplyApi.js:93-172, 203-240, 263-300, 383-500).

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| Auto QR never fires | Enable Quick Replies off; set not linked in any list; flag unchecked; another auto QR with "Don't trigger auto-execute" is running |
| Fires twice / on Continue | `executeOnAi` includes Continue/regenerate/swipe; WI automation re-fires on Continue re-scan → §6.1 |
| Posted image/message lands before the reply | it was WI-automation-triggered (runs during prompt build) — move to `executeOnAi` |
| Endless generation loop | an `executeOnAi` QR generates a message and "Don't trigger auto-execute" was unticked |
| Text got sent to chat instead of executed | `message` does not start with `/` (leading whitespace/newline counts) |
| Automation stopped after `/qr-update` | it wiped `automationId` (§7) |
| Imported set replaced a set you wanted | same `name` → confirm deletes the old one; rename before importing |
