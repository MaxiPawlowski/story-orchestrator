# Dynamic Response — 2026-10-14 harvest

meta: https://github.com/ExtensionMuncher/DynamicResponse · head `afed203` (single commit, 2026-07-07) · **no licence file = ideas only, no code** · read all 4 files (index.js 478 lines, README, manifest, style.css) + post.md · new repo, no prior review

## What it is / what changed
Model ends a reply with `<dynamic_response>cue</dynamic_response>`. On receipt the extension strips the tag from `message.mes`, stores the cue in `chat_metadata.dynamic_response_pending`, draws a banner above `#send_form`. Player answers as a normal turn; `MESSAGE_SENT` clears it. Newest AI message is "source of truth": no tag clears the banner. Prompt side is a user-pasted post-history instruction, weighted toward restraint ("when in doubt leave it out", once per message). Optional display-only regex to hide the tag on screen.

## How it works
- Regex: `index.js:35-37`, tolerant of `</tag>`, `<tag/>`, case-insensitive. Scrub collapses blank lines, `trimEnd` (`:89-98`).
- Handler on both `MESSAGE_RECEIVED` and `CHARACTER_MESSAGE_RENDERED` (`:468-469`), dedup by `index:len:fnv1a` signature (`:272-291`, `:317-350`). Falls back to `chat.length-1` when id invalid (`:297-310`).
- Strip = `message.mes = cleaned; saveChatDebounced()` (`:342-343`). No `swipes[swipe_id]` write, no re-render.
- Pending state: `ctx.chatMetadata[META_KEY]` + `ctx.saveMetadata()` (`:112-146`); restored on `CHAT_CHANGED` (`:249-256`, `:357-360`).
- Banner: plain div inserted before `#send_form`, click = dismiss with `callGenericPopup` confirm (`:167-232`).
- Not handled: `MESSAGE_SWIPED`, `MESSAGE_EDITED`, `MESSAGE_DELETED`, group chats (any later member reply without tag clears the cue), cue inside `extra.reasoning`.

## Patterns for SO

### P1. "Your move" cue on the HUD — feature · HUD/talk/agency · partial · value 3 · effort S
What: a visible signal that the turn is the player's, with a short in-fiction cue. Theirs: banner above input (`index.js:167-197`).
Our state: hand-back exists but is invisible to the player. Director/judge can answer PLAYER (`src/judge/director.ts:57-64,85,99-101`, `src/runtime/talkControl.ts:333-337`); the chain just aborts (`talkControl.ts:226-228`) and records `chosenName: null` (`talkControl.ts:340-345`). Snapshot only exposes `draftedMember` from the last decision (`src/runtime/snapshotBuilder.ts:366-371`). HUD has scene/tension/pipeline/setup/pending only (`src/components/drawer/HudStrip.tsx:12-50`). Not in plans 42–59 or queue.
Fit: deterministic sources first, no model tag needed: (a) last talk decision `kind: player` for this chat+checkpoint+lastMessageId, (b) active checkpoint `agency.objective_kind === "player_action"` (`src/engine/agency.ts:32-35`), (c) chain ended because `stopOnPlayer`. Copy from `narrative.ts`/`pipeline.ts` (one player-copy source), checkpoint names never ids. Rides the snapshot; no new write. Player-mode safe (no internals).
Sketch: `snapshot.turn = { yours: boolean, cue: string | null, source }` derived in snapshotBuilder; `#so-hud-turn` chip; cleared by `MESSAGE_SENT` implicitly because derivation keys on lastMessageId.

### P2. Model-emitted control tag stripped at receipt — pattern · generation/replies · absent · value 2 · effort M
What: let the reply model hand back explicitly + supply the cue text, removed before it is stored/re-prompted so it does not self-reinforce.
Our state: we already rewrite replies at receipt for thought leaks: `repairThoughtLeak` (`src/runtime/thoughtLeak.ts:6-14`) via `rewriteReplyText` (`src/services/stHost/chatMessages.ts:18-30`), which — unlike theirs — also writes `swipes[swipe_id]`, `swipe_info[].extra.reasoning` and re-renders through `updateMessageBlock`. A tag strip would be a second transform on the same path (`src/runtime/replyEffortHost.ts:117-125`).
Fit / conflicts:
- Complements `NO_CLOSING_QUESTION_CLAUSE` (`agency.ts:30`): we forbid "what do you do?" in prose; the tag moves the question into UI instead. Do not let the tag text re-enter prose or the prompt.
- Must strip before anything reads the reply: extraction, memory mirror, canon, judge windows, payload. Receipt-time rewrite in `MESSAGE_RECEIVED` already precedes boundary flush (`turnBridge.ts:81-84`).
- Order: thought-leak repair first, then tag strip on the visible part; scan `mes` only, never `extra.reasoning` (thinking stays on; a tag inside the thought is ignored, not promoted).
- A tag-only reply strips to `""`: today `isThoughtOnlyReply` (`src/runtime/emptyReply.ts:30-34`) would then count it empty and swipe it. Needs an explicit rule (cue-only = empty reply? or keep the cue as text). Decide before building.
- Prompt cost: one static instruction; keep it in a fixed position (not a per-turn depth block) or it costs prompt-cache reuse (gotchas "No prompt-cache reuse on Artemis").
- Group: one cue per player turn; the last drafted member's tag wins, a later untagged member must not clear an earlier one within the same chain (theirs does).
Verdict: P1 first; add P2 only if P1's deterministic sources miss real hand-backs in sessions.

### P3. Derive the cue, never store it — pattern · state homes · n/a (design rule for P1/P2) · value 3 · effort S
What they got wrong: cue persisted in `chat_metadata` (`index.js:129-146`) and only reconciled on receive/send/chat change, so swipe back to a tagged swipe, edit, or delete leaves it stale.
For SO: cue = pure function of (current last reply's current swipe, last talk decision, active checkpoint). Nothing in `extras`, so rollback ≡ replay holds for free, `MESSAGE_SWIPED`/`EDITED`/`DELETED` need no handler beyond the snapshot refresh TurnBridge already triggers (`turnBridge.ts:87-90`). If P2's tag must survive the strip, store the stripped cue on the message (`extra.so_cue` per swipe via `swipe_info[].extra`), not in chat metadata — it then follows swipes natively (ST `syncMesToSwipe` copies `extra`, script.js:6938).

### P4. Strip vs TurnBridge identity — test-idea · turnBridge · present (thought-leak path) · value 3 · effort S
ChatIdentity keys each message by `send_date|name|is_user|len|fnv1a(mes)` (`src/runtime/messageIdentity.ts:41-42`). A receipt-time rewrite changes the key after TurnBridge's `MESSAGE_RECEIVED` handler refreshed identity (`turnBridge.ts:134-135`); it heals only because the `CHARACTER_MESSAGE_RENDERED` handler refreshes again. `updateMessageBlock` emits no `MESSAGE_UPDATED` (ST script.js:2033-2044), so no rollback fires — good. Neither fact is pinned by a test that I found for the thought-leak path. Test: rewrite in a `MESSAGE_RECEIVED` handler subscribed before and after TurnBridge; assert no rollback, no "eventless change" journal (`turnBridge.ts:59-62`), identity equals post-rewrite key after the render event; then swipe away and back and assert the stored swipe is the stripped text.

### P5. Restraint-weighted instruction wording — pattern · prompting · n/a · value 1 · effort S
"Only when continuing would put words in {{user}}'s mouth… when in doubt leave it out… never more than once" (README prompt block). Matches our clause style; only relevant if P2 ships.

## Host facts
- Non-streaming `saveReply` emits `MESSAGE_RECEIVED` **before** `addOneMessage` and `CHARACTER_MESSAGE_RENDERED` after (script.js:6691-6693): a strip there renders clean. Streaming emits both **after** the DOM already holds the streamed text (script.js:3799-3800): mutating `mes` alone leaves the tag on screen until re-render. Theirs calls it a "flash"; it persists until reload/re-render. `rewriteReplyText` re-renders, so SO is fine.
- Swipe away runs `syncMesToSwipe` first (script.js:10340, body 6933-6938), copying `mes` and `extra` into the current swipe slot, so a mes-only rewrite is healed on the next swipe — but a reload before any swipe keeps `swipes[id]` unstripped in the file. Swipe back sets `mes = swipes[id]` (script.js:7011) and emits only `MESSAGE_SWIPED` (script.js:10315), no `MESSAGE_RECEIVED`.
- `syncMesToSwipe` also runs before `MESSAGE_RECEIVED` in streaming (script.js:3780), so the swipe slot holds the pre-strip text at receipt time.
- **Possible SO bug (minor):** `src/runtime/replyEffortLive.ts:26` passes `Number(messageId)` to the leak repair — gotchas forbid this (`Number(null) === 0`); use `hostMessageId` (`turnBridge.ts:19-24`). Effect today: a null id reads message 0; repair then only acts if the reasoning suffix appears in it, so low risk, but it also is not type-filtered (fires on `first_message`).

## Not worth taking
- Persisting pending cue in `chat_metadata` with its own `saveMetadata` — separate save, stale on swipe/edit; see P3.
- Display-only regex to hide the tag — a user-installed regex as a correctness crutch; `rewriteReplyText` re-render covers it.
- Confirm popup to dismiss a banner — toast-like surface; our one-surface rule makes a derived chip dismiss itself.
- Fallback to `chat.length-1` on invalid id — masks host id bugs; we refuse via `hostMessageId`.
