# More Flexible Continues — v2.4 review

LenAnderson · https://github.com/LenAnderson/SillyTavern-MoreFlexibleContinues · `569ec36` (2025-01-20), manifest v1.14.2 · 78 upvotes / 248 msgs · source available: **y** (`source/index.js` 549 lines + `source/lib/injectQuickActionsWrapper.js` 29 lines)

## What it is
Per-message undo/regenerate/branching for **continues**. Every continue of a message becomes a node in a tree stored on the chat message itself. Buttons (↶ undo last continue, ↻ regenerate last continue, ▤ tree view to jump to any branch, ➜ continue) are added at top/bottom of each message. Two slash commands `/continue-undo`, `/continue-regenerate`. No LLM calls of its own beyond ST's `Generate('continue')`, no prompt injection. A chat-UX utility.

## How it works
- **Imports** straight from host modules (`script.js` `Generate, chat, eventSource, event_types, messageFormatting, saveChatConditional, substituteParams`), `extensions.js`, slash-command classes — `index.js:1-5`. No context API.
- **Settings**: `extension_settings.moreFlexibleContinues {buttonsTop, buttonsBottom}` — `index.js:21-28`; panel appended to `#extensions_settings` on `APP_READY` — `index.js:497-537`.
- **Persistence**: non-namespaced fields written onto every chat message object — `mes.continueHistory` (array per swipe, each node `{mes, swipes[], parent[], active}`), `mes.continueSwipe` (object ref into the tree), `mes.continueSwipeId` — `index.js:35-55`. Saved in the chat file by `saveChatConditional()` (`index.js:139,242`). `continueSwipe` is serialized as a copy, so after reload it is no longer the same object as the tree node (identity re-derived in `onSwipe`, `index.js:447-458`).
- **Capture**: `GENERATION_STARTED(type, namedArgs, dryRun)` — ignores dryRun and anything but `continue|normal|swipe`, snapshots `startMes = mes.mes` for continue (`index.js:56-69`). On `CHARACTER_MESSAGE_RENDERED`/`USER_MESSAGE_RENDERED`, the new continue segment = text after `startMes` (`mes.mes.split(startMes)`), pushed as a child node (`index.js:331-360`). `GENERATION_STOPPED` cancels listening (`index.js:328-330`).
- **Undo**: pop the active path, rebuild `mes.mes` by concatenating ancestor segments, rewrite `.mes_text` innerHTML via `messageFormatting`, save, then **emit `MESSAGE_EDITED(chat.length-1)`** — `index.js:111-142`.
- **Regenerate**: truncate `mes.mes` to the parent text **in memory, no event emitted**, then `await Generate('continue')` — `index.js:143-173`.
- **Tree jump**: picks the message by the button's `[mesid]` (`index.js:209`) but emits `MESSAGE_EDITED(chat.length - 1)` regardless (`index.js:243`) — wrong id when the message is not the last.
- **Manual edits**: `onMessageEdited` walks the active path; if the edited text still starts with the concatenated prefix, the extra tail becomes a new continue node (append-only edit = continue); otherwise the diverging point becomes a new branch — `index.js:362-425`.
- **Swipes**: `MESSAGE_SWIPED` → `eventSource.once(GENERATION_STARTED)` + `delay(100)` to tell "swipe that generates" from "swipe navigation", then resets the favorite flag vanilla copied from the previous swipe's `extra` and re-selects the active tree path — `index.js:427-459`.
- **Busy check**: `.mes_stop` has a box — `index.js:12-16`.
- **DOM**: injects `.lacommon--quickActions` wrappers into `#message_template > .mes` so every future message clones them, and into every rendered `.mes` — `lib/injectQuickActionsWrapper.js:1-29`; `makeSwipeDom()` re-runs over the whole chat on every render/delete/chat change (`index.js:305-326`).
- **Migration on read**: `CHAT_CHANGED` moves `swipe_info[].extra.isFavorite` → `swipe_info[].isFavorite` for every message, without saving (`index.js:461-477`).

## Overlap with Story Orchestrator
- We already treat a continue as its own turn: `CONTINUE_MESSAGE_TYPES = {continue, appendFinal}`, keyed `${id}:${gen_finished|len}` so a second continue of the same message is a new boundary — `src/runtime/turnBridge.ts:11,24-29,85`. MFC's segment model (continue = appended tail) matches ours.
- We roll back on every `MESSAGE_SWIPED|EDITED|DELETED|UPDATED` from the event's id, unconditionally — `src/runtime/turnBridge.ts:54-57,170-181`. Memory rows sourced at/after the id are dropped (or quarantined if pinned) — `src/memory/stores.ts:106-116`. So:
  - MFC **undo** → `MESSAGE_EDITED(last)` → we roll back correctly (coarsely: every row from that message goes, including rows read from the kept prefix).
  - MFC **regenerate continue** → no event; the next `continue` render commits a new boundary on the same id. The boundary that read the **discarded** tail is never rolled back; facts/deltas sourced from text no longer in the chat stay `live`. **Real gap for any player running MFC** (and for any extension that rewrites `mes.mes` without emitting).
  - MFC **tree jump on a non-last message** → edit event carries the last id → we roll back from the wrong message; the actually-changed message keeps its stale reads.
- Boundaries record only `{lastMessageId, chatLength}` (`src/engine/engine.ts:12-13,25-26`) — nothing that would let us notice consumed text changed under us.
- Memory rows already carry an `evidence` quote (`src/memory/types.ts:138`) and we have a quote-in-window matcher (`src/extraction/evidence.ts:28` `evidenceInWindow`), so a text-aware rollback is cheap to build.
- UI: MFC's per-message buttons are exactly what SO deliberately does not do (baseline §4: SO never rewrites message DOM). Nothing to take there.

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | Consumed-text fingerprint per boundary; verify on each boundary, roll back from the first changed message | host-integration | engine / host (TurnBridge) | absent | 4 | M |
| 2 | Append-only edit is a continue, not a rewrite; evidence-aware retention on shrink | enhancement | memory / host | absent | 3 | M |
| 3 | Harness case: silent third-party mutation (MFC-shaped regen + wrong-id edit event) | testing | testing | absent | 3 | S |

**1. Consumed-text fingerprint.** What: when a boundary commits, record `{messageId, length, hash}` for the messages it consumed (at least the last N / the window extraction read). At the next boundary (and on hydrate) compare against the live chat; if a consumed message's text no longer starts with / equals what was consumed, run `rollbackFromMessage(firstChanged)` before committing. Makes us correct regardless of whether a third-party extension emits events, and regardless of the id it emits. Theirs: `index.js:143-170` (regen rewrites `mes.mes` silently), `index.js:243` (edit event with wrong id). Ours: `turnBridge.ts:24-29` stamps continues by `gen_finished`/length only; `engine.ts:12-13` records no text identity; rollback trusts the event id (`turnBridge.ts:170-181`). Fit: strengthens invariant 11 (rollback ≡ replay) — today replay over the current chat would NOT reproduce facts from the discarded tail, so we violate it under MFC. Hash must live with the boundary snapshot (engine stays pure: a string hash computed in runtime and passed in the boundary context). Persisting it is a blob-shape change → version bump + migration (invariant 13); absent fingerprint on old boundaries = skip check.

**2. Append-only edit ≠ rewrite.** What: on `MESSAGE_EDITED` for message N, if the new text starts with the text the last boundary consumed at N, treat it like a continue (no rollback; schedule a read of the tail) instead of dropping every row from N. On a shrink (undo/regen/edit-away), keep rows from N whose `evidence` still matches the new text via `evidenceInWindow`, drop/quarantine the rest. Theirs: `index.js:372` (`startsWith` prefix test classifies an edit as continue vs branch). Ours: `stores.ts:106-116` drops by `messageId >= N` only; `evidence.ts:28` exists but is used at parse time, not rollback. Fit: needs idea 1's stored consumed text/length to know the prefix. Engine side stays coarse (roll back to the boundary before N, P0 re-read) — only memory retention becomes evidence-aware, so rollback ≡ replay holds as long as the re-read could reproduce the kept rows. Risk: evidence quotes are short; a row whose quote survives but whose meaning changed stays live — keep it `live` only when the edit is a pure append, and treat shrink-kept rows as candidates for the reconciliation queue rather than silently live. Lower value than 1 because it is precision, not correctness.

**3. Harness: silent mutation.** What: add cases to `scripts/debug/so-turn-types-check.mts` (event-level, no backend for the second half): (a) commit a continue boundary, then set `chat[N].mes` to the prefix and trigger a `continue` render without any edit event — assert the tail's facts are gone; (b) emit `MESSAGE_EDITED` with the last id while message N-2 was changed — assert N-2's reads are gone. Theirs: the two call sites above. Ours: `so-turn-types-check.mts:10-21` covers greetings/images/swipe identity, nothing on silent or mis-addressed mutation. Fit: red until idea 1 lands — a good pre-registered failing check; doubles as a gotcha regression.

## Patterns to copy / anti-patterns to avoid
Copy:
- Prefix-preservation as the edit classifier (`index.js:372`): cheap, deterministic, covers "user typed more at the end" and manual continues.
- Skip `dryRun` and non-reply types at `GENERATION_STARTED` (`index.js:58`) — we already do for lore (`runtime/index.ts:156`); keep it everywhere new.

Avoid (all seen here):
- Writing un-namespaced fields onto chat message objects (`continueHistory`, `continueSwipe` — `index.js:38-53`); serializing an object reference that loses identity after reload. We keep state in `chat_metadata` — keep it that way.
- Rewriting `mes.mes` without emitting any mutation event (`index.js:158`) and emitting an event with an id other than the one changed (`index.js:243`). Never do this in our effects/npc paths; assume other extensions do.
- Timing heuristics to classify host events (`once(GENERATION_STARTED)` + `delay(100)`, `index.js:429-431`) — racy on slow backends (our 33 tok/s lesson).
- Direct `innerHTML` rewrite of `.mes_text` + whole-chat DOM rescans on every render (`index.js:138,305-326`).
- Mutating persisted chat data during a read (`CHAT_CHANGED` favorite migration without save, `index.js:461-477`).
- Direct imports from `script.js` instead of the context API (`index.js:1`) — breaks on host refactors; our `stHost/` seam exists for this.

## ST host facts learned
- `GENERATION_STARTED` handler args are `(type, namedArgs, dryRun)`; dry runs fire it too — `index.js:56-58` (matches ST `script.js:4299`). Consistent with our handler (`runtime/index.ts:189`).
- `USER_MESSAGE_RENDERED` and `CHARACTER_MESSAGE_RENDERED` both pass the message index as first arg — `index.js:542-543`.
- Swipe navigation vs swipe generation is only distinguishable by whether `GENERATION_STARTED` follows `MESSAGE_SWIPED` — `index.js:429-431` (their inference; no dedicated host signal used).
- Vanilla swipe generation copies the previous swipe's `extra` (incl. a favorite flag) into the new swipe; per-swipe metadata lives in `mes.swipe_info[i]` — `index.js:434-446` (author's comment, not re-verified in ST source).
- `#message_template > .mes` is the clone source for every rendered message; elements appended there appear in all future messages — `lib/injectQuickActionsWrapper.js:2-3,15-21`.
- `.mes_stop` having a layout box = generating — `index.js:12-16`. Consistent with our gotcha (button swap), which also notes `document.body.dataset.generating` is sturdier and that a disconnected ST hides both buttons.
- Third-party extensions can rewrite `chat[i].mes` and call `Generate('continue')` with no `MESSAGE_EDITED`/`MESSAGE_UPDATED` — `index.js:143-170` — and can emit `MESSAGE_EDITED` with an id that is not the edited message — `index.js:209,243`. **Extends our gotchas**: TurnBridge assumes mutation events are complete and correctly addressed; that assumption does not hold on installs running this extension. No direct contradiction of an existing gotcha.
- `SlashCommandParser.addCommandObject(SlashCommand.fromProps({name, callback, helpString}))` — `index.js:482-495`.

## Verdict
Relevance **low** (UX utility; nothing to adopt feature-wise, and its DOM-button model is out of scope for SO). The one thing worth taking: **stop trusting mutation events as complete** — fingerprint the text each boundary consumed and verify it at the next boundary (idea 1), with the MFC-shaped silent-regen case as a pre-registered failing harness check (idea 3). Under MFC today, regenerating a continue leaves facts and deltas from discarded text live.
