# Multihog D&D Framework — 2026-10-14 harvest

meta: https://github.com/MultihogAurelius/SillyTavern-MultihogDnDFramework · `pre-refresh-2026-10-14` (fe3db79, 2026.8.93) .. HEAD `d6aab00` (2026.9.25, 2026-09-27), 28 commits, 50 files, +2.4k/−152 · **GPL-3.0: ideas only, no code** · read: full diff, `src/state/history-file-storage.js`, `history-crypto.js`, `history-retention.js`, `src/features/chat/deleted-chat-data.js`, `purge-orphaned-lorebooks.js`, index.js hunks, commits 8036044/f6acdff/c185368; skipped: test bodies beyond affinity tests, UI/portrait hunks · prior: `docs/plans/v2.4/extension-research/multihog-d-d-framework-modular-rpg-platform-with.md` (its idea 1 refuted by the verification note: ST branches do carry our blob)

## What it is / what changed
Same product (free-text RPG memo tracker + lorebook agent + world progression + map evolution). The "maintenance mode" README note was removed. Almost the whole range is storage hygiene. Their per-chat state lives in `settings.json`, so it bloated:
- history retention cut 1000 → 50 → 25 → 20 entries (`src/state/history-retention.js:3-4`);
- memo/map/Map Evolution histories moved to gzip files under `user/files/`, with a pointer and sha256 kept in settings (`history-file-storage.js`);
- deleted-chat cleanup, plus an explicit confirm before purging orphaned lorebooks (`deleted-chat-data.js`, `purge-orphaned-lorebooks.js`);
- a pure-JS SHA-256 for plain-HTTP LAN clients (`history-crypto.js`);
- stale-`ctx.chatId` affinity fixes (`map-evolution.js` `loadRecentWorldReports(settings, ctx, passChatId)`, `immersion.js` `resolveImmersionChatId`);
- an NPC-profile prompt rewrite (c185368).

No new simulation mechanics.

## How it works
- **Pointer-to-file persistence**:
  - Histories are uploaded via `/api/files/upload` as `multihog_history_<id>.json.gz` (`history-file-storage.js:144-155`), then hidden from settings serialization by making the props non-enumerable (`:106-113`).
  - A new file is never written over the one a persisted pointer names: each change uploads a fresh file and then swaps the pointer (`:239-244`).
  - Superseded files are deleted only after re-reading the on-disk settings with `/api/settings/get`. Both the live pointers and the disk pointers are protected (`:387-405`), so a cancelled settings save cannot orphan the file the disk still points at.
  - Hydrate checks the checksum, then re-checks that the partition and pointer are still the same objects before it writes (`:177-198`). A failed hydrate blocks all history persistence until reload (`index.js` `blockHistoryPersistence` in `onChatChanged`).
  - Files are registered in `extension_settings.attachments` + `disabled_attachments` so Data Maid does not list them as loose (`:131-138`).
- **Deleted-chat cleanup**:
  - Runs on `CHAT_DELETED`/`GROUP_CHAT_DELETED`, re-verified against a full chat inventory built from `/api/chats/recent`, the per-character `/api/characters/chats {simple:true}` lists and `group.chats` (index.js `listExistingSillyTavernChatIds`).
  - Lorebook purge candidates must have been recorded for that chat, not be claimed by another chat or prefix, and not be globally selected. Each candidate is re-checked right before its delete because the popup can sit open (`purge-orphaned-lorebooks.js:64-111`).
- **Chat affinity**: a pass pins `passChatId = getActiveChatId()` at start and threads it into every book lookup, never re-reading `ctx.chatId` (8036044, f6acdff; `tests/map-evolution-affinity.test.js`).
- **Cancel vs disable**: a chat-switch cancel of real-time visualization no longer flips the user's persistent off switch. Only an explicit user stop or a generation failure does (CHANGELOG 2026.8.97, `stopRealtimeLocationGeneration({disable:false})`).
- **NPC creation prompt**:
  - `[CORE]` = lasting identity. Body is usual appearance, not a fresh injury.
  - Strengths and flaws are repeatable tendencies; "a dropped weapon … surviving an ambush are story events", which go in timestamped lines after `[/CORE]`.
  - New: "freely invent plausible details" for missing fields and never write "Unknown" (`src/state/module-instructions.js`, c185368).
  - The shipped paragraph is upgraded in place by exact-string replace, so user edits survive (`upgradeNpcCreationGuidance`).

## Patterns for SO

### P1. Off-screen cadence keyed on elapsed story time — pattern · living/meanwhile · partial (planned: plan 50) · value 3 · effort S
- What: World Progression fires when enough in-world time has passed. Code decides when, the model writes what (prior review, `docs/multihogDnDdoc.md:615-620`). The new commits also pin the reports a pass reads to that pass's chat (8036044).
- Ours:
  - Meanwhile is due only on a fired transition plus a gap of at least 8 boundaries (`src/runtime/boundaryWork.ts:186-191`, `src/runtime/agendaProposals.ts:6,123-128`).
  - Plan 50 B1a builds `story_time` (`docs/plans/v2.8/50-story-calendar.md:19,123-139`) but never mentions meanwhile.
- Fit: pure. `meanwhileDue` gets `storyTimeDelta` from the blackboard, so rollback ≡ replay holds.
- Sketch: once B1a lands, add `due when story_time − lastPass.story_time ≥ N day parts OR the boundary gap holds` to `meanwhileDue`. Record `story_time` in `recordMeanwhilePass`. A time skip then produces off-screen movement without needing a transition. Add a line to plan 50 §B.

### P2. Realization status for landed meanwhile notes — pattern · living/meanwhile · absent · value 2 · effort M
- What: each world report is stamped per site as `materialized | already_realized_by_play | considered`. The stamps now persist with the history files (`history-file-storage.js:13-17`; prior review idea 9).
- Ours: `applied` is terminal (`src/runtime/agendaProposals.ts:96`). Nothing says play has since delivered the note, so it can keep steering after it is stale.
- Fit: needs a read. Candidates are the judge (it never blocks and never writes) or the shared read; a status change is a boundary write.
- Sketch: a cheap `realized?` judge use per applied note at a cadence. If realized, the note lapses from injection. Its own switch, on by default, floor informational.

### P3. "Lasting identity, not scene events" rule for created entries — pattern · stagecraft create / plan 52 codex · absent · value 2 · effort S
- What: the c185368 prompt splits enduring traits from one-off events (see How it works).
- Ours:
  - The create prompt requires at least 2 established facts and no existing entry (`src/stagecraft/createCandidate.ts:36-43`), but it has no lasting-vs-event rule. An injected-forever WI entry can therefore freeze a single scene into "who they are".
  - Plan 52 facts carry `known_when` but have no such rule either.
- Take only the split. **Do not take "invent missing fields"**: SO's create is evidence-gated, and invention would break the near-dup/fact discipline (`createCandidate.ts` `CREATE_MIN_FACTS`).
- Gate: prompt change, so it needs a real-LLM CL check.

### P4. Size budget for the chat blob and the story library — test-idea · persistence · absent · value 2 · effort S
- What: their whole release series was settings.json bloat: retention caps, file offload and an opt-in migration popup.
- Ours:
  - Per-chat state is in `chat_metadata`, which is right, but the blob is re-sent on every chat save.
  - The library (`v2Stories`, `src/runtime/storyLibrary.ts:9`) and `wizardSessions` ride every settings save.
  - Nothing measures either size: no byte or size count in `src/runtime/*` apart from judge `stateChars`.
- Sketch:
  - `so-run-header` records `blobBytes`, `libraryBytes` and `settingsBytes`.
  - Add an `info` check above a threshold, naming the largest rings.
  - If offload is ever needed, copy their invariant: write a new file, swap the pointer, and delete the old file only when neither the live nor the on-disk settings (`/api/settings/get`) names it.

### P5. Secure-context gap: `crypto.subtle` is undefined over plain-HTTP LAN — host-fact / latent bug · stHost/sprites/studio · present-unguarded · value 2 · effort S
- What: d6aab00 exists because phones on `http://<lan-ip>:8000` have no `crypto.subtle` (a secure-context-only API).
- Ours, unguarded `crypto.subtle.digest` in:
  - `src/services/stHost/media.ts:43` (sprite fingerprint);
  - `src/services/stHost/liveHeadAssets.ts:29`;
  - `src/sprites/builder/recipes.ts:77`;
  - `src/studio/workflowBundle.ts:7`.
- `crypto.randomUUID` is already guarded (`src/memory/types.ts:238`). Owner plays on 127.0.0.1, which is a secure context, so this is latent until a phone or LAN client is used (mobile layouts are supported).
- Sketch: one `utils/sha256.ts`, pure-TS fallback written ourselves (theirs is GPL), plus a `capabilities.ts` row or an explicit refusal message.

## Host facts
- `/api/chats/recent` (no `max`) lists every chat, but silently drops any chat whose `getChatInfo` rejects or has no `file_name`. Its directory walkers run under `Promise.allSettled`, so a failed readdir just shortens the list (`SillyTavern-MainBranch/src/endpoints/chats.js:1124,1144-1145`). Absence from `/recent` is not proof of deletion. SO already uses per-owner tri-state probes (`src/services/stHost/chatFiles.ts:39-64`), so there is nothing to fix.
- Data Maid treats `user/files/*` as loose unless referenced by message `extra.file(s)`, chat-metadata `attachments`, or `extension_settings.attachments`/`character_attachments` (`src/endpoints/data-maid.js:245-300`). `user/images/*` count as known only through message `extra.image|video|image_swipes|media[].url` or chat-metadata `chat_backgrounds`, not `custom_background` (`:173-238`). SO's generated images are placed as `extra.media` (`src/image/runtime.ts:369-377`, `castSceneHost.ts:105`), and candidates that are not chosen or not placed are deleted. Safe today. Any future SO upload not attached to a message must register itself or Data Maid will offer to delete it.
- `ctx.chatId` is computed when `getContext()` is called (`public/scripts/st-context.js:125-127`). Their "stale ctx.chatId during CHAT_CHANGED" came from holding a `ctx` captured before an await. SO's `getContext()` is called fresh (`src/services/stHost/context.ts:15`), and RunOwnership carries the chat. Not a bug for us.
- `CHAT_DELETED` is emitted at `script.js:1354,1401,10884`, and `GROUP_CHAT_DELETED` at `group-chats.js:1334,2269,2308`. SO already handles both events and does not trust them alone (`src/runtime/mirrorReaperHost.ts:72-83`, `chatFiles.ts:3-6`).

## Not worth taking
- File-backed history and its migration popup: it solves settings.json-hosted chat state, which we never had.
- Deleted-chat cleanup and the lorebook purge confirm: already built, and stronger (`mirrorReaperHost.ts`, created-entry reap with confirm, `playsIndexHost.ts:103`).
- Retention caps of 20/5: ours exist per ring (judge 300, journal 200, wizard sessions 8).
- Cancel ≠ disable: already split (`src/utils/signals` `abortReasonName`, `src/judge/types.ts:89`).
- Upgrading the shipped prompt text by exact-string replace: we keep no user-editable prompts in settings, so there is no need.
- Swipe/LIVE history-index pairing fixes: specific to their snapshot model. We roll back and replay.
