# Valkyrie Crusade Rebuild — 2026-10-14 harvest
meta: https://github.com/NickChegg/valkyrie-crusade · head `0fd9925` (2026-10-02, single commit) · licence: none in repo = ideas only, never code · read: `index.js` (195 lines), `game/index.html`, `manifest.json`, README, `post.md`, string-grep of `game/Build/game.framework.js` for the JS<->Unity bridge · skipped: `game.wasm`/`game.data` (Unity IL2CPP binaries, 90 MB; game logic not inspectable) · no prior review (new repo)

## What it is / what changed
Unity WebGL build shipped inside an extension folder; a "Play Game" button in the Extensions panel opens it in a separate `window.open` popup (not embedded in ST UI). `index.js` is a postMessage relay: game -> ST (send a user line, swipe, rewrite a message, quiet/raw generation, save state, inject a prompt, token count) and ST -> game (chat opened / message received / "rewound" / generation started, each posting the whole `chat` array + saved blob). State = one opaque JSON string in `chatMetadata.valkyrieCrusadeState`. Little applies to SO; our plan 23 option B and per-chat persistence are already well past it.

## How it works
- Popup, not iframe: `index.js:32` `window.open(gameUrl, …)`; game posts back via `window.opener||window.parent` (`game.framework.js` `_SaveSTGameState`, `_SendSTMessage`, `_NotifySTGameReady` — only 3 of the relay's 9 message types are used by the shipped build).
- Persistence: `index.js:99-103` assigns `context.chatMetadata.valkyrieCrusadeState = state`, no `saveMetadata` — lands only when ST next saves the chat.
- Swipes/branches: `index.js:54-65` clicks `.swipe_left/right` and fires `CHAT_REWOUND` at 100/500 ms; ST events `chat_swiped`/`message_deleted`/`message_updated` also send `CHAT_REWOUND` (`index.js:188-193`). The game page handles only `CHAT_OPENED`, `MESSAGE_RECEIVED`, `BACKGROUND_RESPONSE` (`game/index.html:120-143`) — **`CHAT_REWOUND` is dropped**, so game state never rewinds on swipe/delete/edit. "Save tied to chat history" = one blob per chat file, last write wins.
- Events -> prompt: `setExtensionPrompt(id, text, 0, depth, false, 0)` (`index.js:108-136`).
- Message rewrite: `index.js:68-77` mutates `chat[id].mes` + `innerHTML` with game text, no save, no escaping.
- Listener `index.js:38` accepts any `message` event: no `event.source`/origin check, targetOrigin `"*"` both ways.

## Patterns for SO
### P1. Opaque game-owned state blob vs engine state — anti-pattern · persistence · our state present · value 2 · effort -
What: game keeps its own truth in one per-chat blob; ST history and blob diverge on every swipe/delete/branch (rewind ignored). A branch from an early message inherits the parent's *latest* blob (ST copies `chat_metadata` whole, `script.js:7406` `{...chat_metadata, ...withMetadata}`; `bookmarks.js:201`). Ours: game layer is ordinary engine state (quests/checks compiled to qualities, plan 18), rollback ≡ replay, branch detection + adoption in `src/runtime/chatIdentity.ts:73-120`, stamped blob `persistence.ts:8`. Confirms our design; nothing to take. Test-idea already covered by plan 23 rule "widget rebuilt after a swipe shows the restored state" (`23-story-widgets.md:123`).

### P2. Popup window for a heavy canvas game — feature · UI · absent (by choice) · value 1 · effort M
What: a 1280x720 WebGL game opened via `window.open`, avoiding ST layout/`translateZ(0)` fixed-position trap and mobile collapse. Ours: html widgets are inline sandboxed srcdoc frames (`runtime/htmlWidget.ts:24-28`, `components/widgets/HtmlWidgetFrame.tsx`), CSP `connect-src 'none'`, `img-src data:` — a Unity/large-asset canvas could not load under it. Plan 23 lists fullscreen/PiP panel modes as not taken (`23-story-widgets.md:159`). Only relevant if a story ever ships a real game; a same-origin popup would break the "no allow-same-origin" sandbox invariant. Not recommended.

### P3. Game events -> model via generateQuietPrompt / generateRaw with taskId correlation — pattern · bridge · absent (by design) · value 1 · effort -
What: `index.js:79-97` lets page code run arbitrary quiet/raw generations and returns `{taskId,result}`. Ours: widget bridge is a closed 5-method set, intents only fill the input box (`htmlWidget.ts:6-17,163`); model calls go through role routes. Giving author HTML a generate call would break "widgets propose, never write" + cost control. Do not take.

## Host facts
- `setExtensionPrompt` position `0` is `IN_PROMPT` (`script.js:484-489`); depth only applies to `IN_CHAT` (1). Their `depth || 4` is ignored. (SO uses `constants/injectionRegistry.ts`; no bug seen.)
- No `window.world_info` global of entries exists in ST (grep empty); their keyword->lore lookup is dead code. Matches our rule: read books via `loadWorldInfo`/`world_names`.
- ST branch = parent `chat_metadata` merged with `{main_chat, integrity}` (`bookmarks.js:201`, `script.js:7406`, group `group-chats.js:2370`): extension per-chat state is copied at its *current* value, not its value at the branch message. SO already handles (`chatIdentity.ts:73`).
- Unity WebGL bridge: `unityInstance.SendMessage(obj, method, string)` takes one string arg; JSON must be wrapped in an object for `JsonUtility` (`game/index.html:129-131`).

## Not worth taking
- Clicking `#send_but` / `.swipe_*` DOM buttons + fixed `setTimeout` re-syncs: race-prone; we use TurnBridge events and `stHost/generation.ts`.
- Rewriting `chat[id].mes` + `innerHTML` from game text: unsaved, XSS, breaks our boundary/rollback model.
- Unauthenticated `message` listener with `"*"` origin: any frame can send lines as the player; our frame checks `event.source` + nonce (`HtmlWidgetFrame.tsx:42`, `htmlWidget.ts:59`).
- Posting the whole `chat` array on every event: leaks full transcript to page code; ours posts only the player-safe projection.
- Unsaved `chatMetadata` writes: known gotcha (save chokepoint `chatSave.ts`).
