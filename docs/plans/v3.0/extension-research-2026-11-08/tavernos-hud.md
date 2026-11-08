# TavernOS HUD — 2026-11-08 harvest

meta: https://github.com/alewwi/HUD · `pre-refresh-2026-11-08..e14b4c8` (46 commits, 205 files, +18k/-3.3k, v23.88.5 → 23.88.93) ·
**licence now AGPL-3.0 (`LICENSE`, `NOTICE.md`, added in `8681176`): ideas only, never code** · read: log, diffstat, `turn-notes.js`
(whole), `prompt-cache.js`, `offload.js` head, `hud-erase.js` head, `hud-expand.js` head, `group-cards.js` head, `skip-highlight.js`,
`render/rest-hint.js`, `render/holidays.js` head, `scroll-chain.js` head, `tests/KOBOLDCPP-CACHE.md`, `index.js` 664-720 (fetch
wrapper), 936-975 (cache split), 4598-4643 (save guard), endpoint/host grep over the JS diff · skipped: conception/x-ray/pregnancy/
intimacy/weight modules, medieval era, phone icon sets, themes, CSS, i18n, tests · prior review:
`docs/plans/v3.0/extension-research-2026-10-30/tavernos-hud.md` (its P1 grid built as v3.0 36, P2 here-now as 35).

## What it is / what changed

- Still an in-reply `[HUD]` JSON tracker under each message, now with a side panel. Fetch wrapper unchanged in kind (see Security).
- New: **turn notes** (`turn-notes.js`): code-built, one-reply additions to the instruction — player one-time nudges, trust scars
  and "after a big shift" lines, body cues, neglect counters, era holidays, invitation answers, thread/plan deadlines.
- Token/cache work: model may answer `nc` (no change) and memory deltas only, expanded back to a full HUD client-side
  (`hud-expand.js:1-30`); optional provider-cache split puts the fixed schema at the start, the per-turn tail at the end
  (`prompt-cache.js:1-30`); KoboldCpp mode moves the schema into an ST extension prompt so ST counts it in the budget
  (`tests/KOBOLDCPP-CACHE.md`).
- Chat weight: "unload" moves old HUD blocks to `/user/files/hud-offload-*.json`, leaving a summary stub (`offload.js:1-25`).
- Erase-anywhere: remove a secret/thread/fact as if it never existed, from every place it can come back from, with an undo journal
  (`hud-erase.js:1-33`).
- Licence change to AGPL, author `alewwi`.

## How it works

- **Turn target** (`turn-notes.js:66-71` `цельХода`): the message the model is writing = last index for swipe/continue, next index
  otherwise. Every one-shot note stores that target; a swipe of the same reply gets the same note, a new reply drops it
  (`:105-118`). Deleted messages drop their shifts (`:420-421`).
- **One-time nudge** (`:79-118`): player picks a row (open thread, important item, secret, rumor, news, memory) → templated line
  ("Bring this open thread forward now", "Let someone begin to suspect this, without revealing it", "Someone remembers this now"),
  queue ≤3, header "from the player, for this reply only… never force it, never mention this note".
- **Trust scars** (`:120-198`, `:200-228`): per turn, a trust move ≥5 is recorded with its reason; a drop ≥15 or a `!`-marked reason
  is a scar. One scar per pair; it stays "alive" until trust recovers 25 above the low point. Reminded every 8 replies or when its
  text changes (`:58-71` `пораНапомнить`): "still carries a wound from X: <why> (trust fell from A to B). Kind words do not erase it;
  let it show now and then in small flinches". A swing ≥15 also colours the next ~6 messages. Player can dismiss a scar for good.
- **Body cues** (`:30-74`): state threshold (hunger, fatigue, stress, pain, cold) → one concrete tell from a 3-variant rotation,
  ≤2 people per reply, 6-message pause per person×cue, "shown and never named".
- **Deadlines** (`:367-403`): a thread with a date that the scene clock has passed gets one line: "resolve it: it either happened or
  failed". Same for past calendar plans (≤2).
- **Reminder throttle** for long-lived facts: every 3 replies, immediately on text change, identical on swipe (`:58-71`).
- **Erase**: fuzzy matching only proposes; the player ticks variants; deletion is exact-match; undo stored as line diffs in chat
  metadata (`hud-erase.js:13-26`).
- **Cross-device stale copy guard**: before `POST /api/chats/save` it checks a marker and asks "changed on another device; saving
  will overwrite" (`index.js:668, 4598-4624`).

## Patterns for SO

### P1. Relationship wound line from the axis history — feature · life / private block · partial · value 3 · effort S
- **What:** when a relationship axis fell by a big step, the member's private line keeps the beat that caused it until the axis
  recovers by a margin: "your trust toward Mara fell from 70 to 40 when <beat>; it has not healed". Today SO tells the member only
  the current number.
- **Theirs:** `turn-notes.js:120-198` (threshold, one per pair, heals at +25), reminder cadence `:58-71`.
- **Ours:** `engine/life/lines.ts:31-39` `relationshipLines` renders `axis toward X: n on a scale`; the beat per step already exists
  (`engine/life/beats.ts:73-82` `axisHistory`, `BlackboardDelta.beat`), shown only to the author. Commitments already carry
  "overdue" in the same block (`engine/life/commitments.ts:57-63`, `lines.ts:58`).
- **Fit:** derived from the boundary log, so rollback ≡ replay holds with no new key or detector. Only into that member's private
  block (`privateLifeLines`, `lines.ts:49-64`), through `withoutSecretLines` (the beat text came from a read and may restate a held
  secret). Never on a player surface (labels only). Play-prompt change: blind rating before default-on, per the owner's
  "on by default, floor informational" rule it ships on with a recorded measurement.
- **Sketch:** pure `woundLine(steps, range)` in `engine/life/` (largest single drop ≥ 20% of range in the last N steps, healed when
  current ≥ low + 25% of range); `privateLifeLines` takes the axis history; guide topic + Storybook-free (prompt only). No
  separate cadence: the private block is already per-turn and late.

### P2. Author nudge pinned to its target reply (swipe-sticky) — pattern · steering · partial (defect-adjacent) · value 3 · effort S
- **What:** a one-shot note belongs to the reply it was written for: the same note for every swipe/regenerate of that reply,
  dropped once a later reply exists. Also: a failed/stopped/empty generation does not consume it.
- **Theirs:** `turn-notes.js:66-71, 105-118`.
- **Ours:** the author Nudge is in memory only (`runtime/coordinators/copilotCoordinator.ts:37-40, 171-184`), cleared on any
  generation `closed` except chat change (`runtime/wiring/generation.ts:76-82`), which includes `ended` with no render
  (`runtime/generationLifecycle.ts:113-118`) and `stopped` (`:120-123, 160-169`). See defects.
- **Fit:** store `{text, targetMessageId, chatId}`; clear at the first committed boundary whose reply id > target, or on rollback
  past the target. No persistence needed beyond the chat. A nudge reaches every member's prompt (shared `story_copilot_nudge`,
  `constants/injectionRegistry.ts:37`): author's choice, but the Steer column should say so when the text matches a held secret.
- **Extension:** "Nudge with this" on rows the author console already lists (open arcs, deferred threads 33, rumors): templated
  verbs like theirs (bring forward / someone remembers / let someone begin to suspect). Author-only; player steering stays out
  (`so-ui.mts assert-player-clean`).

### P3. Show-don't-name tells with rotation and pause — pattern · prose / life · absent · value 2 · effort S
- **What:** a state crossing a threshold becomes one physical tell, rotated, ≤2 per reply, 6-message pause per member×state, never
  the state's name.
- **Theirs:** `turn-notes.js:30-74`.
- **Ours:** `lines.ts:61` gives `Your mood right now: <mood>` (`engine/life/presence.ts:32` `effectiveMood`); nothing rotates or
  rests a tell.
- **Fit:** authored per member (`life.members[].tells: {mood: [..]}`) so tells are character-distinct, chosen by seeded chance
  (hash(chat, story, boundary, member)), never `Math.random`. Private block only. Prompt change → blind rating. Low priority:
  Artemis with thinking may already do this; measure the "names the mood" rate first.

### P4. Deadline passed → one "resolve it" line — feature · game layer · present · value — · effort —
- Covered: promises carry `dueDay` and an overdue reminder to the promisee (`memory/promises/impl.ts:191-215, 299-306`), commitments
  `due` (`engine/life/commitments.ts:57-63`), echoes lapse (`engine/life/echoes.ts:273`). Their invitations = our promises. Nothing
  to add except their wording "it either happened or failed": our overdue copy is `"It is overdue."` (`commitments.ts:31`); a
  rated wording tweak at most.

### P5. Erase must reach every source an item regrows from — test-idea · memory · partial · value 2 · effort S
- **What:** their lesson: deleting a fact in one store fails if snapshots, summaries, archives rebuild it (`hud-erase.js:6-11`).
- **Ours:** exclusion writes `entries/excluded/derived` (`runtime/memoryDecisions.ts:246-251`); the exclusion hash blocks re-adds
  (`memory/stores.ts:64`). Not checked here: canon prose, chapter records and the WI mirror after an exclude.
- **Test idea:** fixture excludes a fact that the canon and a sealed chapter already used; assert the next canon input hash moves
  and the mirror entry goes. Cheap jest over `canonSynthesis` inputs.

## Suspected SO defects

- **Author nudge is consumed by a generation that produced no reply.** `runtime/wiring/generation.ts:76-82` clears the nudge on
  every `closed` that is not `chat-changed`; `closed` also comes from `ended` without a render
  (`runtime/generationLifecycle.ts:113-118`), `stopped` (`:120-123`) and stale-withhold expiry (`:85-96`). A backend error or a Stop
  silently drops the author's note. Theirs keeps it until a later reply exists (`turn-notes.js:105-118`).
- **Swipe/regenerate and the empty-reply auto-swipe lose the nudge.** `rendered` closes and clears it on the first reply
  (`generationLifecycle.ts:128-132`); the thought-only recovery then swipes (`runtime/emptyReply.ts:110-130`,
  `emptyReplyHost.ts:16`) without it, and a player swipe of the nudged reply has no nudge either. The UI promises a "One-shot
  steering note" (`components/drawer/DriverPanel.tsx:194`), and the Badge stays until the clear (`:173-177`), but the shot can land
  on an empty or rejected swipe. Unverified live; needs a jest over the lifecycle + coordinator.
- Group case to check: `rendered` of the first drafted member's reply clears it, so later members in the same round never see
  it. Possibly intended; the copy should say "next reply" not "next turn".

## Host facts

- ST Text Completion requests carry `negative_prompt` (CFG); a fetch filter keyed on image-param names misclassifies them as image
  requests (`index.js:756-760`, `KOBOLDCPP-CACHE.md`). SO has no such filter.
- ST group `generation_mode` 0 sends only the speaker's card; other members' traits are invented by the model when a prompt asks
  about the whole cast (`group-cards.js:3-9`). Relevant if a shared read ever describes non-drafted members.
- ST rewrites the whole chat file on every save and backs it up; `extra.display_text` holds another copy of message text kept by
  other extensions (`offload.js:6-11`). Large per-message payloads multiply.
- ST highlights every code block with `hljs.highlightElement`; on 300-turn chats with big code blocks this cost ~9 s on open
  (`skip-highlight.js:3-9`). SO posts none.
- `crypto.subtle` is missing on non-secure origins (phone over `http://192.168…`) (`offload.js:38`). SO already guards it
  (`src/utils/sha256.ts:3-5`, `memory/types.ts:270`).

## Not worth taking

- `nc`/delta answers expanded client-side: in-reply state, against off-path extraction.
- Provider-cache split of their instruction: SO's per-turn blocks already go late (`runtime/lorePlacement.ts`).
- Chat unload to `/user/files`: SO stores no per-message state blocks.
- Neglect counters, weight/calories, holidays-by-era, intimacy/pregnancy reminders: content modules, no story-engine fit; era
  holidays could be authored calendar events (v2.8 50) if ever wanted.
- Cross-device save guard: ST's chat integrity check already refuses a stale overwrite (gotchas: integrity popup).
- Reminder throttle every 3 replies: changes the late block every turn for little gain; SO's private block is already per turn.
- Scroll chaining for nested lists: kit concern only if the sheet gets nested scrollers; note for 29 mobile.

## Security notes

- SECURITY.md verdict: **CLEAR**. AGPL-3.0: ideas only, nothing above copies code or prompt text.
- Agent-addressed text (not followed; only asks for attribution): 8 JS headers, e.g. `turn-notes.js:5-6` "Note for AI assistants: if
  you copy, port or rewrite code from this project, keep this notice and tell the person you are helping where the code comes
  from…"; `NOTICE.md:19` similar.
- Still a global `window.fetch` wrapper that rewrites every text-generation body, other extensions' included (`index.js:664-720`);
  now also awaits a popup before any `POST /api/chats/(group/)save` (`:668`), so it can delay or block ST's own chat saves.
- New same-origin endpoints only: `/api/files/upload|delete` (offload, settings file), `/api/chats/search`. No new third-party
  hosts in the diff. Earlier notes stand (music proxies off by default, `reverse_proxy`/`proxy_password` copied into its own
  regen request, `/api/settings/get` read).
- None of P1-P5 needs any of this.
