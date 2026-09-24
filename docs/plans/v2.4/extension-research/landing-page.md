# Landing Page — v2.4 review

Author LenAnderson · repo https://github.com/LenAnderson/SillyTavern-LandingPage · commit `62e3982` (2025-02-17) · 23 upvotes / 422 msgs · source available: yes (manifest v2.17.2, ~1.5k lines JS excl. the seasonal FizzPopCrackle fireworks module).

## What it is
Cosmetic shell replacement: when no chat is open, hides ST's `#sheld` and shows a full-screen page of the N most-recent (or favorite) characters/groups as expression-sprite or avatar cards, with the last message of each card's last chat on hover. Click = open that chat with a zoom animation. Extras: user-defined STscript menu buttons, STscript-predicated background list (image/mp4 + optional `-Intro` video), `/lp*` slash commands, New Year fireworks. No LLM, no prompt injection, no story state. Largely superseded by ST's own welcome screen (`public/scripts/welcome-screen.js:226`, recent chats via `/api/chats/recent`).

## How it works
- **ST hooks**: static imports of `script.js`, `extensions.js`, `group-chats.js`, `slash-commands.js`, `tags.js` (`index.js:1-7`, `src/Card.js:1-3`). Events: `CHAT_CHANGED` (`index.js:471`) and `APP_READY` once (`index.js:464`). Landing = `CHAT_CHANGED` with `chatFile === undefined` (`index.js:57`) — ST emits it with `getCurrentChatId()` undefined on close chat (`script.js:10760`, `:10913`).
- **Shell takeover**: inline `#sheld` `opacity:0` + `pointerEvents:none` (`index.js:59-60`), overlay appended to `body` (`index.js:61`), window-wide `keydown` listener that re-reveals `#sheld` when the user types (`LandingPage.js:443`, `:522-536`). `hideTopBar` = body class (`LandingPage.js:64-66`).
- **Card data**: sorts `[...characters, ...groups]` by `fav` then `date_last_chat` (`LandingPage.js:87-98`); per card POSTs the WHOLE last chat to `/api/chats/get` or `/api/chats/group/get` (`Card.js:91-96`) to get the last message, the last ~25 distinct speakers for group avatars (`Card.js:117-141`) and `chat_metadata` — solo from line 0, group from `groups[].chat_metadata` (`Card.js:102`). Reads `chat_metadata.triggerCards.costumes` to pick a costume sprite (`Card.js:197`) — the one cross-extension metadata read.
- **Sprites**: HEAD-probes `/characters/<name|costume>/<expression>.<ext>` per configured extension, falls back to avatar (`index.js:16-27`, `Member.js:59-72`).
- **Last-message preview**: `substituteParams` + `messageFormatting` → `innerHTML` in a `.mes_text` div (`Card.js:226-236`).
- **Open chat**: `selectCharacterById` + `applyTagsOnCharacterSelect` workaround + `setActiveCharacter/Group` (`Card.js:54-62`); groups `openGroupById` (`Card.js:41-45`).
- **Backgrounds**: first `bgList` item whose STscript returns truthy wins, evaluated by `executeSlashCommands(item.command)` on every update (`LandingPage.js:124-130`); media preloaded into blob URLs with a cache-buster (`LandingPage.js:141-170`).
- **Persistence**: `extension_settings.landingPage` via shallow `Object.assign` defaults (`LandingPage.js:46-63`), incl. `lastChat {character, group}` rewritten on every `CHAT_CHANGED` (`index.js:68-71`).
- **Slash**: `/lp`, `/lp-continue` (reopen `lastChat`, `index.js:520-536`), `/lp-set key value` which sets settings by writing DOM inputs and dispatching `click`/`change`/`input` (`index.js:538-574`), `/lp-closechat` (fade + clicks `#option_close_chat`, `index.js:576-591`), `/lp-exit`.
- **Mutation handling / LLM**: none.

## Overlap with Story Orchestrator
- SO has no "no chat open" surface; its **Continue** entry point is scoped to the open chat only — "Playing X" or "No story is playing in this chat yet" (`src/components/settings/EntryPoints.tsx:41-48`). A player who plays several stories across chats has no in-SO way to find them; they rely on ST's chat list.
- SO already reads another copy of chat metadata from the server: `readServerBoundary` POSTs `/api/chats/get|group/get` and reads line 0's `chat_metadata.story_orchestrator` (`src/services/stHost/persistence.ts:109-131`) — the same header read Landing Page does, with the modern group path (header line), which LP gets wrong.
- Away recap (`src/runtime/awayRecap.ts:3`, 8 h gap) covers "welcome back" *inside* a chat; LP covers "which chat" outside of one. Complementary, no overlap.
- SO's host access is dynamic-import only and CSS is root-scoped (invariants 2, 19); LP's static imports and `#sheld` inline styling are exactly what those forbid.

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | "Stories in progress" list in Continue: recent chats whose header carries an SO blob, one request via `/api/chats/recent {metadata:true}` | new-feature | player-ui | absent | 3 | M |
| 2 | Don't take over ST's shell (inline `#sheld` styles, window keydown, DOM-event-driven settings command) | anti-pattern | host | present | 1 | S |

**1. Stories in progress (cross-chat Continue).** What: the settings Continue row (and optionally `/story continue`) lists recent chats that play a story — story title, current checkpoint *name*, played version, last activity, last-message snippet — and opens the chat on click. Theirs: header-metadata read per recent entity (`Card.js:89-104`), recency sort (`LandingPage.js:87-98`), `lastChat` + `/lp-continue` (`index.js:68-71`, `:520-536`). Better host route than theirs: ST's `/api/chats/recent` takes `{max, metadata:true}` and returns each chat's line-0 `chat_metadata` plus `mes`/`last_mes` in ONE request, server-side streaming (`src/endpoints/chats.js:1054`, `:1137-1141`, `getChatInfo` `:393` with the metadata branch in the readline loop) — no whole-chat downloads. Ours: no cross-chat read anywhere (grep `api/chats/recent` in `src/` = 0); Continue is per-chat (`EntryPoints.tsx:41-48`). Fit: read-only, so no RunToken/ownership rows; new `stHost/` module (invariant 2) + a pure read-model beside `narrative.ts`. Must reuse the blob rules: only `version === 4` blobs whose `chatId` stamp equals that chat's own file id (`src/runtime/persistence.ts:34` `belongsHere`) — a branched/copied chat carries a foreign stamp (V5) and must show as "needs opening" not as a second run of the same story; v2/v3 blobs migrate only on open. Player-safe copy only (invariant 9): checkpoint name from `pinnedStory`, never ids/boundaries/tension. Install-wide index (LP's `lastChat` style) is NOT needed and would add a fourth config home (invariant 13) — derive from the server each time. Value is modest: ST's own welcome screen already lists recent chats; the add is "which of them is a story, and where am I in it".

**2. Shell takeover (anti-pattern).** LP hides `#sheld` with inline styles and re-reveals it from a global `keydown` (`index.js:59-60`, `LandingPage.js:522-536`), so any other extension or ST update touching `#sheld` fights it; `/lp-set` mutates settings by setting `.value` and dispatching synthetic `click`/`change` (`index.js:538-547`) — the same trap as our label-wrapped checkbox gotcha (a synthetic click on a hidden panel / double-toggle). Ours already avoids all three: dialogs are native `<dialog>` (`src/studio/StudioModal.tsx`), CSS root-scoped, settings written through `runtime/settingsControl.ts`, never via DOM events. No action; keep the rule.

## Patterns to copy / anti-patterns to avoid
- Copy: guard every chat-file read with `Array.isArray` (`Card.js:98-99`) — `/api/chats/get` answers `{}` (object) for a missing dir/file (`src/endpoints/chats.js:602-609`). Ours does (`persistence.ts:125`).
- Copy (for idea 1): re-check the open chat after the await before acting, as ST's own welcome screen does (`welcome-screen.js:232-236`) — the equivalent of our RunToken for a UI read.
- Avoid: reading group chat metadata from `groups[].chat_metadata` (`Card.js:102`) — current ST keeps it in the group chat file's header line (`group-chats.js:268-274`).
- Avoid: downloading N whole chats to read N headers (`Card.js:91`); use `/api/chats/recent {metadata:true}`.
- Avoid: executing user STscript on every render with default parser flags (`LandingPage.js:125`); our `executeSlashCommands` pins flags (gotchas: slash quoting).
- Avoid: `Object.assign` shallow defaults over saved settings (`LandingPage.js:46-62`) — nested defaults never merge; our extras use factories + sanitizers.
- Avoid: static imports of `script.js` internals (`selectCharacterById`, `setActiveGroup`, `applyTagsOnCharacterSelect` workaround `Card.js:55-61`) — brittle across ST versions; opening a chat from SO should go through an `stHost/` seam (our debug harness already uses `openGroupById`-style navigation; product has none yet).

## ST host facts learned
- `CHAT_CHANGED` fires with `undefined` chat id when a chat is closed / no chat is open (`script.js:10760`, `:10913`; used by LP `index.js:57`). ST's welcome screen hooks the same event with `eventSource.makeFirst` (`welcome-screen.js:928-931`). Consistent with our gotcha that after reload no chat is open.
- `/api/chats/recent` accepts `{max, pinned, metadata}`; with `metadata:true` each item carries line-0 `chat_metadata`, plus `mes` (last message), `last_mes` (mtime), `chat_items`, and `avatar` or `group` (`src/endpoints/chats.js:1054-1146`, `:393-470`). Not used by LP; found while verifying its approach. New to our docs.
- `/api/characters/chats` also takes `metadata:true` per character (`src/endpoints/characters.js:1522`).
- `/api/chats/get` **creates the character's chat directory** as a side effect when missing and returns `{}`; `ch_name` in the body is ignored (`src/endpoints/chats.js:592-609`). LP sends `ch_name` (`Card.js:65`) for nothing. A "read" that writes — relevant to `readServerBoundary`, which only calls it for an existing avatar.
- Group chat metadata lives in the group chat file header (`group-chats.js:268-274`); **contradicts LP's** `groups.find(...).chat_metadata` (`Card.js:102`), agrees with our `persistence.ts:127`.
- `date_last_chat` is maintained on both characters (`script.js:7419`) and groups (`group-chats.js:630`, `:2205`) — usable for recency without a server call.
- Third-party chat_metadata seen in the wild: `triggerCards.costumes[<name>]` (LP reads it, `Card.js:197`) — another extension writing `chat_metadata`, so our blob is not alone there (no collision: we key `story_orchestrator`).

## Verdict
Relevance **low**. A cosmetic shell extension, mostly obsoleted by ST's native welcome screen. The one thing worth taking: a player-safe **cross-chat "stories in progress" Continue list**, built on `/api/chats/recent {metadata:true}` (one request, headers only) and our existing blob stamp rules — not LP's per-chat full downloads.
