# Doom's Enhancement Suite — 2026-10-14 harvest
meta: https://github.com/DangerDaza/Dooms-Enhancement-Suite · `pre-refresh-2026-10-14` (f920222, 2.5.0) .. HEAD `c97bac0` (3.0.1), 82 commits, 87 files, +22.8k · licence **AGPL-3.0-or-later** (2.5.1 put the full text in; before that LICENSE was a stub) → ideas only, never code · read: full diff stat, CHANGELOG 2.5.1–3.0.1, `src/systems/voices/{segmenter,segments,stAutoReadGuard,presence,voiceBoot,voiceEngine(head)}.js`, `lorebook/{campaignProfiles(head),autoLink}.js`, `features/characterAliases.js` diff, `utils/offScene.js`, `rendering/glintWords.js` (head), `tools/voices-e2e.cjs`/`campaign-switch-test.mjs` headers · skipped: themes/overhaul CSS, composer, settings rail, workshop UI, voice cloner/studio UI, OpenRouter/Google transport bodies, avatar migration · prior: `docs/plans/v2.4/extension-research/dooms-enhancement-suite.md`

## What it is / what changed
Same narrator-runs-a-cast overlay (tracker, portraits, bubbles, Doom Counter, Lore Library). New since 2.5.0:
- **Voices** (~4k lines): per-character Gemini TTS, segmenter that attributes lines to speakers from the bubbles, a character voiced only while on the Present panel (Narrator otherwise), auto-read once per real reply, ST's own TTS auto-read paused without touching the saved setting, designed and cloned voices.
- **Campaign profiles**: per-campaign versions of one character (portrait, description, voice, knives…), banked on every settings save. Auto-link puts a lorebook named like a cast member into the global selection.
- **Glint Words**: listed words get a styled span in chat text, for display only.
- Five UI "setups", a rebuilt composer, a settings rail.
- Prior ideas 1 (fetch-watcher self-heal) and 2 (one-turn blocks keyed to the loud generation) are now built in SO: `src/services/stHost/persistence.ts:188-213` and `src/runtime/generationLifecycle.ts:1-80`.

## How it works
- ST TTS guard (`stAutoReadGuard.js:38-63`): `Object.defineProperty(extension_settings.tts, 'auto_generation', {get: () => active ? false : real, set: v => real = v})`, plus a non-enumerable `toJSON` that writes the real value. ST's `saveSettings` serialises `extension_settings` whole (`script.js:8085`), so the forced value never reaches disk, even if the browser closes mid-session. No save/restore ledger is needed.
- Auto-read arming (`voiceBoot.js:133-203`):
  - `GENERATION_STARTED` adds one to an arm counter. It skips dryRun, quiet and impersonate, caps at 8 and has a 10-minute TTL. It is a counter, not a flag, because the next group member can start before the last reply is decorated.
  - `MESSAGE_RECEIVED` binds one arm to the message id.
  - The read happens after decoration.
  - `GENERATION_STOPPED`, `CHAT_CHANGED`, swipe and delete all clear the arms.
- Segments (`segments.js:62-117`, a pure module tested in node): merge adjacent lines that share speaker and kind, cap at 24 segments (the overflow goes to the Narrator), split at about 2,500 characters on a sentence end, then a word, then a hard cut. `dropAlreadyRead` makes a Continue read only the new part (`:126-148`).
- Presence for TTS (`presence.js`) is read-only by contract. Re-reading an old message must never record a newly seen character (`:20-23`, contrast `portraitBar.getCharacterList`). An entry whose thoughts match `OFF_SCENE_RE` (`offScene.js`) is dropped. So is a name with an open "same character?" decision (`presence.js:116`).
- Aliases (`characterAliases.js:110-171`):
  - Tier 1 is a structural fold: strip a trailing parenthetical ("Nine (Nine-Coins)" → "Nine"), then article-insensitive exact match ("Gardener" ↔ "The Gardener").
  - `structuralCanonical` is the read-only resolver.
  - `isAliasDecisionOpen` holds downstream renderers until the user answers.
- Campaign profiles (`campaignProfiles.js:15-50`): a base "shadow" plus a bucket per campaign of per-character slices. `saveSettings` calls `bankActiveCampaign()` first, and a portrait that finishes after a switch lands in the version it started for (the CHANGELOG 2.6.0 "Changed" entry). Portrait files are reference-counted before deletion.
- Glint (`glintWords.js:15-110`):
  - One `MutationObserver` on `#chat` marks messages dirty. A throttled re-wrap pass (160 ms, 12 ms budget per frame) uses a TreeWalker over text nodes, skips `SKIP_SELECTOR` and ignores its own mutations.
  - An `IntersectionObserver` plays each word's entrance once 90% of it is visible.
  - Idle effects play only on at most 20 on-screen spans, in waves of 3 then a 4 s rest. Their 3.0.1 note: continuous animations in a long chat kept the main thread busy and the GPU and memory climbing.

## Patterns for SO

### P1. Pause Summarize while a secret is held, without writing the user's setting — pattern+host-fact · privacy/checks · partial · value 3 · effort S
- **What:** the getter + `toJSON` overlay above, aimed at `extension_settings.memory.memoryFrozen` instead of TTS.
- **Their evidence:** `stAutoReadGuard.js:38-63`.
- **Why it works on Summarize:** it reads the flag live on every message (ST `memory/index.js:434`), so the overlay takes effect immediately and never persists.
- **Why it does not work on Vector Storage:** it copies `extension_settings.vectors` into a module-local `settings` at load (`vectors/index.js:1738`) and reads `settings.enabled_chats` afterwards (`:205, :441, :795, :913`). There the only lever is `/vector-chats-state false` (`:2275-2296`), which drives the checkbox and persists. That makes it an install write: it would need `withLedger` with a compare-and-set restore on leave, and the owner's OK.
- **Our state:**
  - We only detect and tell: `src/runtime/checks.ts:81-101` (`transcript-copiers`, "Switch it off…") and `src/services/stHost/transcriptCopiers.ts:5-36`.
  - Nothing in `src` writes `memoryFrozen` or calls `/vector-chats-state` (grep: 0).
- **Fit:**
  - It would be a new `stHost/` module (the only host surface). It should be an action button on the existing Repair row ("Pause while this story plays"), confirmed, not a silent default: it changes another extension's behaviour.
  - Restore on leaving the chat and on unload. The overlay leaves no state on disk, so a crash cannot strand it.
- **Caveats:**
  - Freezing stops new summaries only. A summary already holding a secret stays injected, so the check must keep firing while the stored summary is non-empty.
  - ST's checkbox keeps showing the real value.
  - No invariant conflict: no blackboard write, and nothing goes through a shared tier.
- **Sketch:** `stHost/summarizePause.ts` with `pause(isActive)`/`release()`; the check row's `detect` reads `paused`; a test asserts the `JSON.stringify` output keeps the real value.

### P2. Structural name fold + read-only resolver for ledger/epistemic subjects — pattern · memory/extraction · partial (prior idea 4) · value 3 · effort S–M
- **What:** fold structural variants before keying (strip a trailing parenthetical, then article-insensitive exact). Keep a read-only resolver for re-reading old messages, separate from the one that records. While a "same as X?" decision is open, its consumers skip that name rather than file it under a new entity.
- **Their evidence:** `characterAliases.js:110-171` (fold + `structuralCanonical`), `:192-198` (`isAliasDecisionOpen`), `presence.js:116`.
- **Our state:**
  - `RosterMember.aliases` exists (`src/engine/schema.ts:329`).
  - Talk folds articles (`src/talk/aliases.ts:3`) and matches aliases (`:37-59`, also used by `src/memory/innerRender.ts:132`).
  - But `ledgerKey` is still `trim().toLowerCase()` (`src/memory/ledger.ts:23`), epistemic subjects too (`src/memory/epistemic.ts:18`), and nothing in `src/extraction` reads aliases (grep: 0). So "The Gardener" and "Gardener", or a roster alias, still split into two ledger entities and two epistemic subjects. A held secret filed under the alias then misses the member's private block.
  - Plan 52 entries take `aliases` (`52-people-places-codex.md:101`) and should share this canonicaliser.
- **Fit:** a pure canonicaliser in `memory/` keyed from the roster (+ codex entries), applied at the parse chokepoint. It is normalisation of a parsed signal, so it keeps the pure-core invariant. No parenthetical fold exists today. The unknown-but-similar card stays the prior proposal (author-only).

### P3. Display-only codex-term marks in message text (for plan 52) — pattern · player-ui · absent · value 2 · effort M
- **What:** mark known People/Places names in reply text, for display only, robust to every host rewrite. The model, copy, edit and saved text all keep the original.
- **Their evidence:** `glintWords.js:15-40` (MutationObserver dirty set + throttled budgeted pass + ignores its own mutations), `:96-108` (skip code, links, controls, reasoning, edit box), `:50-82` (on-screen cap, waves, `prefers-reduced-motion` `:206`).
- **Our state:** no `mes_text` writer. `src/runtime/architecture.test.ts:98-103` lets only declared modules touch message DOM, and `stHost/inlineMount.ts` is the only `.mes_block` writer. Plan 52 has no in-text mark.
- **Fit:**
  - Needs a new declared writer `stHost/textMarks.ts` added to the guard.
  - Spoiler rule: mark only entries the player already knows (52's `known_when` / discovery scope), never by roster id. Player copy uses names only.
  - Take the perf lesson for any animated mark: static by default, animate only what is on screen.

### P4. Per-roster voice, present-gated, narrator fallback — feature · presentation · absent · value 2 · effort L
- **What:** each roster member can carry a voice; lines are attributed per segment, and anyone not present is read by the narrator.
- **How they do it:** auto-read is armed per loud generation and read once after render. A Continue reads only the new part. A stop clears the arms.
- **Their evidence:** `segments.js:62-148`, `voiceBoot.js:133-203`, `presence.js:150-160`.
- **Our state:** no TTS anywhere in `src`. Talking sprites flap on streaming, not on audio (`docs/plans/v2.7/19-talking-sprites.md:100`). Our lifecycle reducer already gives the "outermost loud generation" signal the arm needs (`src/runtime/generationLifecycle.ts:57-70`).
- **Fit:** it could ride ST's own TTS extension (`/speak voice=`) and a `roster[].voice` field rather than a provider of our own. Keys stay in ST secrets (DES keeps a Google key in its own settings: anti-pattern). Not planned; owner's call.

## Host facts
- ST TTS reads `extension_settings.tts.auto_generation` at message time (`tts/index.js:1108, :1226`), so a getter overlay pauses it. It has no stop API: `#ttsExtensionMenuItem` toggles play/pause and starts playback when idle (`:441`), so click it only while `#tts_audio` (`:318`) is playing. Verified.
- `saveSettings` serialises `extension_settings` by reference (`script.js:8085`), so a `toJSON` on a sub-object controls what reaches disk. Verified.
- Summarize reads `memoryFrozen` live (`memory/index.js:434`). Vector Storage works on a load-time copy (`vectors/index.js:1738`), so writing to `extension_settings.vectors` changes nothing until reload. `/vector-chats-state <bool>` exists and persists (`:2275-2296`). Verified; new to us.
- Text sent to `/speak` containing `|` splits the command and `{{` expands as a macro (CHANGELOG 3.0.1 Fixed). Consistent with our `quoteSlashArg` gotcha.
- `GENERATION_STOPPED` fires before ST saves the partial reply (`voiceBoot.js:153-156`; ST `stopGeneration` `script.js:5607-5618`). Consistent: `src/runtime/turnBridge.ts:82` flushes on it.
- The phone layout's transform on the page root breaks `position:fixed`; their fix is to place by measurement (3.0.1). Consistent with our `translateZ(0)` gotcha; we use `<dialog>`.
- Nothing found that looks like a bug in SO.

## Not worth taking
- UI setups, themes, composer re-host, settings rail: cosmetic. Re-hosting `#send_form` fights other extensions.
- Auto-link: it puts a book named after a cast member into the global selection. That breaks "a story's lorebooks reach only the chats that play it" (`storyLore.ts`); our requirements already scan per chat.
- Campaign profiles as such: we already have per-story sprite bodies (`src/sprites/castLoad.ts:107-110`), and pinned stories own their content. Banking state into install-wide settings on every save is the opposite of our state homes.
- Voice cloning, designed voices, OpenRouter/Google transport: provider UX outside scope; cloning carries consent and legal weight.
- Glint Words as a word-list feature: player decoration with no story meaning (only P3's codex variant is worth it).
- Off-scene regex over model "thoughts": a heuristic on free text. Our scene read is typed.
