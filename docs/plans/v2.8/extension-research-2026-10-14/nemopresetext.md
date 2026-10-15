# NemoPresetExt — 2026-10-14 harvest

meta: https://github.com/NemoVonNirgend/NemoPresetExt · `pre-refresh-2026-10-14` (9c1230b, v6.0.0) .. `d7dd47a` (2026-10-13, v6.0.12), 17 commits, 113 files, +12.9k/−2.0k · **no licence file** (ideas only, never code) · read: full log, diff stat, `features/final-user-role/*`, `features/lorebook-spacing/*`, `core/sha256.js`, `core/user-file-path.js`, `features/prompt-rendering/layout-preservation.js`, README diff, `docs/{COLD_PROMPTS,SHA256_STORAGE,VEX_RUNTIME,RECIPE_RUNTIME}.md` · skimmed/skipped: prompt-rendering virtualization, worker search, category-tray/prompt-manager rewrites, Vex/recipe compilers (Nemo-preset-specific), CSS, tests · prior: `docs/plans/v2.4/extension-research/nemopresetext-presetnavigator-world-info-and.md`

Paths: Nemo relative to its `source/`; `SO:` = `C:/dev/story-orchestrator/`; `ST:` = `C:/dev/SillyTavern-MainBranch/`.

## What it is / what changed
Still a CC prompt workstation. New since 6.0.0:
- 5-stage "large preset performance": recipe/Vex/disabled-prompt bodies moved to content-addressed sidecar JSON in `/user/files/` (SHA-256, read-back verified), prompts kept as shells; worker search; incremental + virtualized Prompt Manager rows (6.0.1–6.0.6).
- 6.0.7 sidecar path fix (`/files/` → `/user/files/`), 6.0.8 software SHA-256 when `crypto.subtle` is missing (HTTP LAN origins).
- 6.0.9 Braille blank (U+2800) treated as a space in WI keys, via scan-copy rewrite on `WORLDINFO_ENTRIES_LOADED`.
- 6.0.10 prompt layout recovery across native redraws with a pending save.
- 6.0.11 opt-in "force final outgoing message to user role" (CC), applied at JSON serialization.
- 6.0.12 Hub entry for Nemo Plotlight.
Prior review ideas: #1 reasoning-safe window is now built in SO (`SO: src/extraction/windowHygiene.ts:100` `stripReasoningBlocks` + fence handling `:70-76`); #2 interference probes built (`SO: src/services/stHost/extensionConflicts.ts:46-50`); #3 CC prompt-toggle effect still absent, nothing new for it.

## How it works
- **Final user role** (`features/final-user-role/controller.js:56-110`): on `CHAT_COMPLETION_SETTINGS_READY` it does not edit the payload; it defines a non-enumerable `toJSON` on the request object (`:67-80`) that calls any earlier `toJSON`, copies the value and rewrites the copy. `JSON.stringify(generate_data)` (`ST: public/scripts/openai.js:3153`) runs after every awaited listener (`:3148`), so the rewrite sees what later listeners appended. The finalizer is also re-placed with `events.makeLast` on `APP_READY`/`GENERATION_STARTED`/`CHAT_COMPLETION_PROMPT_READY` (`:82-100`). A WeakMap guard stops double wrapping (`:62,65`). Rewrite: an `assistant_prefill` becomes a trailing user message; a trailing `tool` result is kept and repeated as user; otherwise the last message is relabelled user, with assistant-only fields removed (`:27-54`).
- **Lorebook spacing** (`features/lorebook-spacing/runtime.js:7-15`, `matching.js:47-61`): a plain `eventSource.on(WORLDINFO_ENTRIES_LOADED)` replaces each entry in the four payload arrays with a shallow copy (`entries[index] = copy`). On the copy, multiword plaintext keys become `/a[ \u2800]b/i` and regex keys get their space atoms widened (`matching.js:4-28`). Saved books are untouched. It is on whenever the event exists, with no setting.
- **Sidecars** (`docs/COLD_PROMPTS.md` §Storage, `core/user-file-path.js:15-31`): immutable `nemo-*-<sha256>.json` files, uploaded and then read back and hash-checked before the inline body is dropped. Legacy and current paths are both accepted, with a retry on 404. There is no GC. A missing file blocks generation/export instead of sending a shell.
- **Serialization barrier** (`docs/RECIPE_RUNTIME.md` §Safety): ST's emitter swallows listener exceptions, so a failed import gets a non-enumerable `toJSON` barrier and the native save cannot persist a broken object.

## Patterns for SO

### P1. Last-word request rewrite at serialization — pattern · effects/generation · partial · value 3 · effort S
What: apply the request overlay inside a `toJSON` on the payload, not in the listener body. It then holds against any listener that runs later, and the same hook can record the bytes actually sent. Their evidence: `features/final-user-role/controller.js:63-81`, re-placed last at `:82-100`.
Ours: the sampler overlay subscribes with a plain `on` and no ordering: textgen on `GENERATE_AFTER_DATA`, CC on `CHAT_COMPLETION_SETTINGS_READY` (`SO: src/services/stHost/samplerOverlay.ts:31-40`). The reply-thinking-budget keys ride the same path. A third-party listener placed after ours can still overwrite sampler/budget keys, and the payload capture reads the pre-serialization object. SO already uses `makeFirst`/`makeLast` + reassert for WI (`SO: src/services/stHost/worldInfoEvidence.ts:48-61`), so cheap step 1 is that same reassert on the sampler events.
Fit: no invariant conflict. "Only keys the request carries" and "loud requests only" stay in the handler that decides; toJSON only executes. Verify the stringify site per path first: CC `openai.js:3153`; textgen has more than one site (`ST: public/scripts/textgen-settings.js:1296` streaming, plus the non-streaming path). Keep the dry-run skip. Test: a fake later listener that rewrites `temperature`; assert the serialized body still carries the overlay value.

### P2. Name Nemo in the interference probes — pattern · host/checks · partial · value 2 · effort S
What: add two `KNOWN_EXTENSIONS` rows (`SO: src/services/stHost/extensionConflicts.ts:46-50`):
- (a) `nemo-lorebook-spacing`: folder `third-party/NemoPresetExt`, always on in ≥6.0.9.
- (b) `nemo-final-user-role`: `extension_settings.NemoPresetExt.forceLastUserRole === true`, CC only.
Consequences for SO:
- (a) changes key shape on the scan copies. `aboutMember` compares raw keys to member names with `fold(key)` (`SO: src/runtime/loreKeyMatch.ts:88-91`), so a multiword name key arrives as `/First[ \u2800]Last/i` and the entry stops classifying as "self" in the lore select. `keywordWillActivate` is unaffected because `parseKeyRegex` handles the regex form (`:36-37`). Our ordering is robust: Nemo uses plain `on`, while story lore re-asserts first and scan gating last (`SO: src/services/stHost/worldInfoScan.ts:18-49`), so gating sees Nemo's copies.
- (b) touches main CC `Generate` only. Connection Manager requests emit no settings-ready event (`ST: public/scripts/custom-request.js`: no `eventSource.emit`), so wizard/Ask/extraction are unaffected; SO play is TC (Artemis), so it is not hit today.
Sketch: "present" rows with consequence copy, `degrades`/`info`, never blocks. Optional: make `aboutMember` decode a key that is an escaped-literal regex before folding.

### P3. `crypto.subtle` guard / shared hash helper — host-fact → latent bug · media/studio · partial · value 2 · effort S
What: `crypto.subtle` is undefined on insecure origins (http://<LAN-IP>). Nemo ships a software SHA-256 fallback (`core/sha256.js`, `docs/SHA256_STORAGE.md`).
Ours: one guarded site (`SO: src/sprites/builder/recipes.ts:76`, refuses with "open on localhost or HTTPS"). Three unguarded sites throw `TypeError: Cannot read properties of undefined (reading 'digest')`: `SO: src/services/stHost/media.ts:43`, `src/services/stHost/liveHeadAssets.ts:29`, `src/studio/workflowBundle.ts:7`. The owner's 127.0.0.1 counts as a secure context, so it is latent; it breaks when ST is opened from a phone or another PC on the LAN.
Sketch: one `utils/sha256.ts` that every site uses. Either a typed refusal like recipes.ts or a fallback of our own (no Nemo code: no licence). Test with `globalThis.crypto = {}`.

### P4. Serialization barrier when a throw cannot stop the host — pattern/test-idea · runtime · unknown · value 2 · effort S
What: ST's `emit` wraps each listener in try/catch and logs (`ST: public/lib/eventemitter.js:145-151`, same in `emitAndWait` `:175-181`). A handler that throws to "refuse" does not stop generation or save. Nemo blocks the following native `JSON.stringify` with a non-enumerable `toJSON` barrier instead.
Ours: refusals live in the generate interceptor and `EffectsApplier`, which is right. Test-idea: a census, `architecture.test.ts`-style, flagging any `subscribeToHostEvent` handler whose refusal path is `throw`, since that throw reaches no one.

### P5. Content-addressed sidecars for heavy per-chat state — pattern · persistence · absent · value 1 · effort M
What: big immutable payloads go to `/user/files/<kind>-<sha256>.json` (`ST: src/users.js:1218` serves it; upload `src/endpoints/files.js:28`), read back and verified before the inline copy is dropped. Candidate in SO: `pinnedStory` per chat in `chat_metadata`.
Conflicts: BLOB_VERSION invariant (a blob without `pinnedStory` is unreadable), ST chat backups do not include user files, and a missing file adds a failure mode. Only revisit if chat saves become measurably slow on large stories.

## Host facts
- `CHAT_COMPLETION_SETTINGS_READY` is awaited right before `JSON.stringify(generate_data)` (`ST: public/scripts/openai.js:3148-3153`); a `toJSON` on the payload runs after all listeners. `TEXT_COMPLETION_SETTINGS_READY` at `textgen-settings.js:1847`.
- Connection Manager / `custom-request.js` requests emit neither settings-ready event, so extensions hooking those events do not see SO's CM model calls.
- Event emitter swallows listener exceptions (`ST: public/lib/eventemitter.js:145-151`); `makeFirst`/`makeLast` exist (`:66`, `:90`).
- `WORLDINFO_ENTRIES_LOADED` payload arrays are mutable and replaceable per element (`ST: world-info.js:4604`); third parties (Nemo ≥6.0.9) replace entries with copies and rewrite `key`/`keysecondary` to regex. Never assume scan-copy keys equal file keys.
- Multiword plaintext keys are substring-matched even with `matchWholeWords` on (`ST: world-info.js:349-354`); SO mirrors this (`SO: src/runtime/loreKeyMatch.ts:40`). U+2800 is not whitespace to ST.
- Authenticated user files are served at `/user/files/*` (`ST: src/users.js:1218`), not `/files/`.
- Nemo-optimized CC presets can hold disabled prompts as shells (`prompt.content` ≠ source) and refuse sync `extractPromptData()` on them (`docs/COLD_PROMPTS.md` §Correctness). Anything reading CC preset prompt bodies directly sees shells.

## Not worth taking
- Braille-blank key matching: authoring quirk; ST and our wizard never produce U+2800, and our matcher must mirror ST, not Nemo.
- Final-user-role feature itself: CC-only provider workaround; SO plays TC and its CM calls build their own message arrays.
- Prompt Manager virtualization / worker search / incremental rendering: UI perf for 4k-prompt presets; SO lists are small.
- Recipe/Vex compilers: specific to the Nemo preset grammar.
- Layout recovery across pending saves: Nemo-DOM-specific; our save-race class is already guarded (`SO: src/runtime/chatSave.ts`).
- Hub/Plotlight installer: distribution, no product logic.
