# Danganronpa SillyTavern (DRST) — 2026-10-14 harvest

meta: github.com/LithiumWaves/danganronpa-sillytavern · `d565554` (2026-08-15) .. `9ef9272` (2026-09-29), 13 commits, 28 files, +3.7k/-0.8k · **no licence file** (ideas only, never code) · read: full diff of `overworld/roomPresence.js`, `overworld/roomContextPrompt.js`, `overworld/overworldScene.js` (presence sync), `audio/dynamicSongs.js`, `core/onboarding/bootGreeting.js`, `index.js` diff (gifts, room prompt, BGM), `trial/trialManager.js` diff, README diff · skipped: CSS (ceremony/onboarding), trust animation rewrite, song picker UI · prior: `docs/plans/v2.4/extension-research/your-ultimate-killing-game-rp-experience-begins.md`

## What it is / what changed
Same genre kit. New since v2.4 review, all off by default:
- **Single-Chat Overworld**: one group chat holds the whole cast; walking into a room rewrites `group.disabled_members` so only room occupants can speak; recommends Presence extension so absentees also don't "remember".
- **Room Context Prompt**: `{{room}}` + `{{characters}}` template injected as a system prompt.
- **Dynamic Songs**: majority vote over each in-scene character's latest expression sprite → mood playlist (happy/sad/dramatic/tense/angry/romantic), ties keep current mood.
- **Sprite-click gifts**: queue a gift for a named member; resolves on that member's next rendered reply.
- Boot greeting overlay ("two ways to play"), trust ceremony re-skin.
Prior idea 1 (story-owned scenario) is now built in SO (`src/services/stHost/chatScenario.ts:16`).

## How it works
- Room mute: `computeRoomDisabledMembers` (`overworld/roomPresence.js:149-196`) matches member avatars to room names by full name, avatar stem, unique first token, or substring ≥4 chars (`:109-133`); narrator/system names keep their previous flag (`:9-16`); dead/missing always muted. `syncRoomPresence` (`overworldScene.js:2557-2623`) mutates `group.disabled_members` **and forces `group.hideMutedSprites = true`**, saves `editGroup(id, true, false)`, then hand-toggles `.group_member.disabled` classes (`:2525-2545`) and emits `GROUP_UPDATED` (`:2547-2555`). Never restores either field when the feature is switched off. Debounced; skipped during trials.
- Room prompt: `setExtensionPrompt("dangan_room_context", text, 0, 1, false, "system")` (`index.js` `syncRoomContextPrompt`); position 0 IN_PROMPT so the string role is harmless here. Re-synced on move, chat change, trial state, template edit.
- Dynamic songs: expression from sprite `src` stem/folder (`audio/dynamicSongs.js:64-80`), map table `:17-36`, ignore neutral/dead/specials `:38-45`, vote `pickWinningMood` `:97-114`; manual pick holds until SCAN.
- Gifts: `tryResolvePendingGiftForMessage` (`index.js:5080-5125`): head-of-queue only; a targeted head gift blocks every later gift until that member speaks; `pendingGiftResolutionInFlight` is set before an awaited LLM call and only cleared on success (no try/finally) — one throw wedges gifting until reload.

## Patterns for SO

### P1. Cast writes must announce themselves to the host — host-fact/bug-suspect · effects/cast · our state: absent · value 4 · effort S
- What: ST's own mute toggle flips `.group_member` `disabled` class by hand and emits `GROUP_UPDATED` (ST `group-chats.js:1968-1985`, `:2003`); `editGroup(id, true, false)` → `_save(group, false)` only POSTs (`group-chats.js:155-164`, `:1359-1371`), no re-render, no event. DRST learned this and does both (`overworldScene.js:2599-2614`).
- Ours: `saveGroupFlags` uses `editGroup(group.id, true, false)` (`src/services/stHost/groups.ts:49`) and `setGroupMembersDisabled`/`setGroupMemberFlags` return without emitting (`groups.ts:60-79`, `:100+`). No SO file emits `GROUP_UPDATED`. So after a checkpoint `cast_changes`: ST's member-row mute icons stale; ST Expressions VN "hide muted sprites" (`extensions/expressions/index.js:2366`) and TTS (`tts/index.js:1577`) not refreshed; **our own** sprite stage (`src/sprites/stage.ts:157,191`) and `requirementsWatch.ts:76` never see our write.
- Fit: stays inside stHost; `reload=false` is deliberate (gotcha: `getCharacters()` can resurrect deleted group chats) — keep it, add the emit + class toggle after a confirmed save. Live-verify first (lane, cast_changes checkpoint, check `.group_member.disabled` + stage).
- Sketch: `stHost/groups.ts` after `wrote(...)`: toggle `.group_member[data-id="<avatar>"]` class, `await ctx.eventSource.emit(ctx.eventTypes.GROUP_UPDATED)`; test the order (emit after read-back).

### P2. Room presence by muting the group — anti-pattern (confirms our design) · talk/life · our state: present (better) · value 2 · effort S
- Theirs: whereabouts → `disabled_members` on the shared group object, plus a permanent `hideMutedSprites = true`, never restored (`overworldScene.js:2607-2612`).
- Ours: schedules drop members from speaker candidates without a cast write (`src/runtime/whereabouts.ts:7-10`, `src/runtime/wiring/talk.ts:13`), an `awayNotice` when the player addresses an absentee (`src/runtime/awayNotice.ts:17-26`, registry `injectionRegistry.ts:31`), scene tracker injects location/present (`injectionRegistry.ts:23`). Owner decision 2026-10-03 "no cast change" (`00-overview.md:145`). Nothing to take; record that a group-level mute leaks across every chat of the group (our `effectLedger.ts:13` note).
- Their "Presence so absentees don't remember" = what v2.8 42 witness filter does in-product; nothing new.

### P3. Fuzzy member↔name matching rules — pattern · roster/castNames · our state: partial · value 2 · effort S
- Theirs: unique-first-token alias only when the first token is unique across room + members; substring match needs ≥4 chars; unresolved avatar = muted, not present (`roomPresence.js:87-133`, `:11-13`).
- Ours: one resolver `src/engine/castNames.ts`, `resolveGroupMemberId`. Worth borrowing only the "unique first token" + "fail closed on unresolved" rules as test cases if `addressedAmong` (`awayNotice.ts:21`) misses nicknames. Gotcha already notes ST splits names into words for mentions.

### P4. Scene mood → ambient effect (majority vote, tie keeps current) — feature · stagecraft/presentation · our state: absent · value 2 · effort M
- Theirs: `dynamicSongs.js:97-114` vote + hysteresis (tie keeps current; neutral ignored; manual pick holds until rescan).
- Ours: per-member `effectiveMood` exists (`src/engine/life/presence.ts:32-36`) but no audio effect anywhere (`src/` grep music/bgm = 0). Could be a deterministic presentation effect like `effects.background` (applied idempotently), driven by present members' life moods instead of sprite filenames. No plan covers it. The tie/hysteresis rule is the reusable bit for any derived presentation switch (background, sprite pose) to avoid flapping.

### P5. Targeted deferred delivery queue — anti-pattern/test-idea · game layer · our state: n/a · value 1 · effort S
- Head-of-line blocking on a target-specific item and an in-flight flag without finally (`index.js:5080-5125`). If v2.8 58 keepsakes (option C) or a player "give" action ever queues per-member work, key the queue per member and release in `finally`; add a test where the head target never speaks.

## Host facts
- `editGroup(id, immediately=true, reload=false)` = bare POST: no `getCharacters()`, no `printGroupMembers`, no `GROUP_UPDATED` (ST `group-chats.js:155-164`, `:1359-1371`). The UI's own mute path toggles the row class itself and emits `GROUP_UPDATED` (`:1968-1985`, `:2003`). Listeners of `GROUP_UPDATED`: Expressions VN mode (`extensions/expressions/index.js:2366`), TTS (`extensions/tts/index.js:1577`). See P1 — likely SO bug.
- `group.hideMutedSprites` is a per-group flag (`group-chats.js:1774`, checkbox `:1835`) that Expressions reads; DRST force-sets it and never restores. If a lane shows hidden sprites for muted members, check this flag before blaming SO's stage.
- `setExtensionPrompt` string role still used (`'system'`), harmless at position 0 IN_PROMPT; prior review's IN_CHAT NaN fact stands.

## Not worth taking
- Boot greeting overlay: body-level fixed div with z-index max; our onboarding gap is unchanged since v2.4 (prior idea 4); nothing new.
- Song picker / SCAN toast UI: genre presentation.
- Trust ceremony re-skin: CSS/animation only.
- Room context prompt: SO scene tracker already injects location + present (`sceneCoordinator.ts:67-75`, `injectionRegistry.ts:23`).
