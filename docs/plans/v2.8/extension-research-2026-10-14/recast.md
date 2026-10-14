# Recast (ST Post-Processing for Better Prose) — 2026-10-14 harvest
meta: https://github.com/closuretxt/recast-post-processing · head `a7ac25a` (unchanged since prior review) · AGPL-3.0 (`R/LICENSE`) = ideas only · read: `index.js` 318-392, 548-860, 1010-1100, 1395-1546, manifest, `util/contextRegex.js`; skipped UI/CSS/presets (covered before) · prior: `docs/plans/v2.4/extension-research/recast-st-post-processing-for-better-prose.md`
`R/` = `C:/dev/st-extensions-research/recast-st-post-processing-for-better-prose/source/`; ST = `C:/dev/SillyTavern-MainBranch/public/`.

## What it is / what changed
Post-reply rewrite pipeline (N chat-completion passes, diff modal, in-place `msg.mes` overwrite). Repo unchanged. Second look
targets v2.8: SO now has edit re-read + swipe recommit, thought-leak repair, empty-reply recovery, thought carry (54). Prior
idea 1 (re-commit after rewrite of newest reply) is now **built** as spike `editReread`; prior ideas 3/4 still absent. New
findings are about the send lock, swipe sync and listener order.

## How it works (new detail only)
- `setButtonState(true)` = ST `setSendButtonState(true)` = `is_send_press = true` (`R/index.js:323-331, 849`; ST `script.js:7164`).
  ST `isGenerating = () => is_send_press || is_group_generating` (ST `script.js:604`). The lock covers the whole pass
  pipeline and, in default diff mode (`replace_inline: false`), stays on **while the diff modal is open** (released only in
  accept/reject callbacks, `R/index.js:1050-1075, 1095`; intercepted path `:1476-1489`).
- Diff mode: original text is restored behind the modal and `MESSAGE_EDITED` fires (`R/index.js:1052-1058` via
  `safeUpdateMessageText` `:382-388`); accept writes the rewrite + `MESSAGE_EDITED` + `saveChat` (`:1086-1097`), possibly
  minutes after render.
- Writes touch `msg.mes` only. Never `swipes[swipe_id]`, never `extra.reasoning` (`R/index.js:1089, 1021, 1056`).
- `manifest.json` `loading_order: 9`; ours is `1` (`manifest.json:3`).
- Skips replies under `min_chars` (60) and `mesId 0` (`R/index.js:1412`, settings `:24`), so thought-only replies pass untouched.

## Patterns for SO

### P1. A third-party send lock parks our boundary past the flush window — host-fact/test-idea · TurnBridge · our state: absent · value 4 · effort S
- What: while Recast holds `is_send_press`, `isHostGenerating()` (`src/services/stHost/generation.ts:8`) is true, so
  `flushPending` only polls (`src/runtime/turnBridge.ts:172-176`) and gives up after `FLUSH_POLL_MAX_MS` 60 s
  (`turnBridge.ts:11, 211`). Nothing re-flushes until the next `enqueueBoundary`. With a diff modal open longer than 60 s,
  reply N's boundary stays pending; the accept then fires `MESSAGE_EDITED` on an **uncommitted** reply, `editReread.seam`
  returns null for it (needs `committed.messageId === messageId` unless entered, `src/runtime/spikes/editReread.ts:139-143`),
  and the plain rollback path runs. Likely outcome: N never gets its own boundary; the next reply's boundary covers it
  (one-turn lag, no transition on N). Derived from code, not measured.
- Same lock also makes `emptyReply` `busy()` (`src/runtime/emptyReplyHost.ts:14`) and `voiceStart` refuse; harmless but
  journals "still busy a minute later" (`emptyReply.ts:121`).
- Fit: no invariant conflict. Sketch: past the 60 s cap, keep a slow poll (e.g. 2 s) while a pending entry still owns its run,
  and also flush on any mutation event for that message; or let the edit seam treat "pending, not committed" as entered.
  Test: scenario with an in-page stub holding `setSendButtonState(true)` for 90 s then editing the newest reply; assert one
  boundary for N and the checkpoint the real edit implies.

### P2. Recast-style rewrite is now covered by edit re-read; compat fixture still missing — test-idea · harness · our state: partial · value 3 · effort S
- Prior idea 1 is present: newest-reply edit → `EditReread` settle 750 ms, re-read, recommit (`spikes/editReread.ts:8-9,
  135-146`; seam `turnBridge.ts:268-276`); swipe onto a stored reply recommits (`turnBridge.ts:258, 278`); no-op
  `MESSAGE_EDITED` (Recast's restore-original emits) is skipped by fingerprint (`turnBridge.ts:257`, `chatSave.ts:174`).
- Missing: prior idea 2's fixture. Add a scenario that mimics Recast exactly: mutate `chat[n].mes` without touching
  `swipes`, `updateMessageBlock`, emit `MESSAGE_EDITED`, `saveChat`; legs: immediate, 5 s later, and under P1's lock.
  Assert `editReread.stats.recommits` +1 and no rollback notice.

### P3. Rewrite without swipe sync is lost on swipe-left — host-fact · TurnBridge/swipeBack · our state: present (own writes) · value 2 · effort S
- ST syncs `mes → swipes[swipe_id]` on generation end (ST `script.js:3780`), before a swipe-right (`:10338-10340`) and in
  `updateSwipeCounter` only when swipes are created (`:9133-9135`); **not** for `SWIPE_SOURCE.BACK`/`DELETE`. A Recast
  rewrite swiped left and back returns the original text; SO then recommits the stored swipe (correct: replay of what is
  shown).
- Ours: `rewriteReplyText` writes `mes`, `swipes[swipe]` and `swipe_info[swipe].extra.reasoning` together
  (`src/services/stHost/chatMessages.ts:18-29`) and emits nothing. Keep it so. Note for `swipeBack` cache spike: key by
  content fingerprint, not swipe index, or a rewritten swipe reads as cache hit with stale state (check
  `spikes/swipeBack.ts`).

### P4. Listener order makes thought-leak repair run before Recast — host-fact · reply repair · our state: present (by accident) · value 2 · effort S
- `eventSource.emit` awaits listeners in registration order (ST `lib/eventemitter.js:130-152`); SO (`loading_order 1`)
  subscribes `MESSAGE_RECEIVED` repair (`src/runtime/replyEffortLive.ts:26`) before Recast (9) awaits its pipeline. So
  Recast rewrites the repaired text, and our boundary (`turnBridge.ts:83`) is launched before Recast's await.
- Order depends on `loading_order` and on when each subscribes; nothing pins it. If it ever flips, Recast would rewrite a
  leaked thought into prose and `repairThoughtLeak` (`src/runtime/thoughtLeak.ts:9-10`) would no longer find the suffix tag.
  Cheap guard: a unit test asserting our manifest `loading_order` stays lowest-ish is pointless; better a one-line note in
  gotchas + run-header recording third-party extensions that write `mes` (Recast present → flag).
- Small: `replyEffortLive.ts:26` uses `Number(messageId)`, against the gotcha (use `hostMessageId`); harmless today
  (`readReplyText(NaN)` → null).

### P5. Visible reply and its thought diverge after a rewrite — pattern · inner voice (54) / reasoning harvest / recall (43) · our state: absent · value 2 · effort S
- Recast rewrites `mes` and leaves `extra.reasoning`; it keeps the pre-rewrite text in `extra.recast.original`
  (`R/util/diffViewer.js:438-446`). Thought carry reads the member's own last `extra.reasoning` for its aim
  (`src/runtime/spikes/thoughtCarry.ts`, plan 54 §L5); after a rewrite the aim may name an act the visible reply no longer
  contains. Plan 43 spans must quote `mes` (what the player and later prompts saw), never `extra.recast.original`, and
  carry a content fingerprint so a later rewrite invalidates the span.
- Sketch: thought carry refuses an aim when the row's `mes` fingerprint changed after render (edit re-read already knows);
  plan 43 §3 add "span hash checked at injection". Does not switch thinking or inner voice off.

### P6. Still absent from the prior list — enhancement · extraction · our state: absent · value 2-3 · effort S/M
- Prompt-only regex window (prior idea 3) and the profile's own reasoning template (prior idea 4): `getRegexedString`,
  `reasoning-template`, `parseReasoningFromString` = 0 hits in `src/`. Reasoning tags still come from the global
  `power_user.reasoning` (`chatMessages.ts:44-48`) plus a hard list (`emptyReply.ts:5`). Right for main replies; for the
  extraction profile the CM profile template is the better source. No change in value since v2.4.

## Host facts
- `setSendButtonState(v)` only sets `is_send_press` (ST `script.js:7164-7166`); `isGenerating()` includes it (`:604`). Any
  extension holding it looks like a generation to us (P1).
- `syncMesToSwipe` skipped for swipe BACK/DELETE (ST `script.js:10337-10340`); extension `mes` writes without a swipe sync
  are lost on swipe-left (P3).
- `MESSAGE_RECEIVED` is emitted after `syncMesToSwipe` and before `CHARACTER_MESSAGE_RENDERED`, both awaited (ST
  `script.js:3780, 3798-3799`): a listener that awaits there delays render for all (known, prior review).
- Possible SO bug (P1): boundary for a reply rendered while a foreign lock is held > 60 s is never flushed on its own.

## Not worth taking
- Prose-rewrite passes for Artemis reply quality: an extra model call per reply on the 3090, rewrites after the boundary
  (forces rollback/recommit), and breaks thought/reply agreement (P5). Quality belongs in preset/prompt.
- Stream hiding via `MutationObserver` blanking `.mes_text`: message-DOM writer, banned (`inlineMount.ts` only).
- Emitting `MESSAGE_EDITED` for own writes: we correctly don't.
- `/profile` swap with sleeps, 5 s re-entry set, bulk past-range rewrite: anti-patterns (prior review).
