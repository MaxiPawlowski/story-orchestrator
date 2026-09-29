# Plan 17 — Authored story openings, group-to-story binding, and broker recovery

Status: implemented and live-verified on the prod build 2026-09-29. The Adolion campaign's Pass D/E long playtests remain a separate gate.

## What changed

### One authored opening per new group chat

- `src/engine/schema.ts` — `NpcReplyEffect` gained `new_chat_only?: boolean`.
- `src/engine/validate/checkpoints.ts` — `new_chat_only` is accepted only on a scripted `onEnter` reply; any other use is a validation error.
- `src/runtime/effectsApplier.ts` — a `new_chat_only` reply fires only when the open chat has no messages. Because the authored opening is a real message, a following `afterSpeak` reply would otherwise read the opening as "someone else spoke": `fireNpcReplies` now suppresses `afterSpeak` while one of this applier's own replies is being posted.
- `src/runtime/effectsApplier.ts` — **the opening is posted FIRST, before any staging.** Verified live on the Saga: firing it at the end of `applyCheckpoint` meant it went out after ~117 sequential group writes, so a brand-new chat stayed empty for 35–60 s, and an interrupted apply (a page move, a second load) lost it entirely — the chat then hydrated `fired: {}` forever. `fireNpcReplies` gained an `allow` predicate; `applyCheckpoint` now fires the `new_chat_only` onEnter replies on both `activate` **and** `hydrate` before world info and cast staging (so re-opening an empty chat that never got its opening heals it), and the late onEnter pass runs only the non-Saga-transition replies (`new_chat_only !== true`).
- `src/runtime/groupStoryBinding.ts` (+ `groupStoryBinding.test.ts`) — pure `boundStoryForEmptyChat(root, groupId, chat)`: a binding applies only to a group with an empty transcript.
- `src/runtime/runtimeManager.ts` — `loadSelectedFromChat` falls back to the group's bound story when the chat has no selected story and no messages.

### Campaign side

- `scripts/campaign/openings.py` (new) — the nine openings, one per story, written as a scripted `onEnter` Narrator reply with `new_chat_only`. For the eight standalone acts it also drops any model-generated `onEnter` start reply, so a new chat opens instantly without waiting for the model; the Saga keeps its start beats for act transitions.
- `scripts/write_group_script.py` — now also writes `extensionSettings["story-orchestrator"].groupStories`, mapping each installed group id to its story id, and saves settings. Group ids are install-specific, so the campaign repository is the re-creatable source.
- `scripts/write_import_payloads.py` (new) — emits the nine ignored `build/_import-*.js` dev import snippets.
- `scripts/preflight.py` — fails unless every story carries exactly its own authored opening at the first checkpoint, and no standalone act has a model-generated start reply behind it.
- `scripts/build_all.py` — the openings and import-payload steps were added to the ordered build.
- Version bumps: Adventurer and Academy v19, Aegis v6, Deep/East/Eshalanore/War v5, Night v4, Saga v5.

### GPU broker recovery

The image path could leave ComfyUI's model cached after a lost lease while the broker returned to text, so text reloaded on top of an image model.

- `server-plugin/story-orchestrator-gpu/gate.mjs` (+ `gate.test.mjs`) — `recover()` no longer resumes text directly. Once the lease is older than 60 s and ComfyUI is idle it runs the same `release()` path (unload `unload_models`/`free_memory`), and it never resumes text if ComfyUI cannot free its model. `interrupt` is now only sent at the long (600 s) timeout. The installed copy was refreshed with `node scripts/plugin-install.mjs`.

## Gate record — 2026-09-29

- Extension: `npm run typecheck && npm run typecheck:test && npm run lint && npm test -- --silent && npm run test:debug && npm run test:plugin` → all green, Jest 340 suites / 4,562 tests, debug 416/416, plugin 24 pass / 1 skip. `npm run build:dev && npm run build && npm run test:release` → webpack success, release 77 pass / 2 skip / 0 fail. Prod bundle `7f6a3b8b1ab0`; `dist/manifest.json` flavor `prod`.
- Live (dev build), all nine Adolion groups: a fresh `/newchat` auto-selected the bound story and posted exactly its own authored Narrator opening as the only message; reopening the chat and a cache-disabled reload did not duplicate it. One real Adventurer player turn was answered by Tobias (989 chars) and the extraction pass settled (boundary 2, pipeline idle, 4 audits).
- Live (prod build) after the ordering fix: a fresh Saga chat showed its opening within ~4 s (previously 35–60 s and often never); re-opening a Saga chat that had been left empty posted its missing opening. The nine-group audit then read one message each, every one the story's own opening, and the three pre-existing test chats and the stray image-only Adventurer chat were removed through ST with no reap prompt left open.
- Saved-state audit (prod): nine of nine groups bound to the matching story and holding one authored opening; broker `phase: text`, no lease; ComfyUI queue empty.
- Campaign: `sh scripts/check_all.sh` (`SKIP_BUILD=1`) → validate-stories OK, check-scope clean, harness 85/85, 0 muted speakers, 146/146 cards, 0/9 labs failing, `ALL GREEN`.
- GPU: an idle ComfyUI image-model cache held the 24 GB card at 24,164 MiB with an empty queue; `POST /free` returned it to 939 MiB within seconds. Root cause was `recover()` resuming text without the unload; the fixed recovery is live after an ST restart (broker `phase: text`).

## Unresolved questions

- The group-to-story binding is install settings; a fresh campaign install must run `build/st-groups.js` (or an equivalent) to recreate it. There is no in-extension UI to edit the mapping.
- Opening into a group whose story was edited: the chat keeps its pinned copy, so a changed opening appears only in a new chat (or after Restart/Update).
- The fifth-reply image cadence, the campaign Pass D/E playtests and the v2.5 acceptance matrix remain unmeasured.
