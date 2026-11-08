# Castward — 2026-11-08 harvest

meta: https://github.com/i5031337/ST-Castward · `pre-refresh-2026-11-08..d7471a4` (8 commits, 2026-10-29..11-03, 87 files
+1920/−573) · MIT · read: commit log; full diff of `src/prompts/{history-window,prompt-slot,dialogue-format,prompt-texts-reader}.js`,
`src/entry/entry-history-notes.js`, `src/tracker/tracker-read-gate.js`, `src/expressions/{npc-expressions,host-expression-generation,
expression-source-policy,expression-image-source,expression-message-groups}.js`, extractor prompt diffs, `src/tts/{npc-tts,voice-cue-format}.js`,
`src/ui/shared/ui-generation-notice.js`, settings defaults · skipped: TTS UI, tests, eval docs · prior:
`docs/plans/v3.0/extension-research-2026-10-30/castward.md` (P1 → plan 34, P2 → 34 lore pins, P4/P6 → 37/34, P3 dropped in
`30-harvest-index.md`).

## What it is / what changed

Same tracker. New: opt-in narrator history window (min/max tokens, cache reuse), per-message NPC expressions (one emotion per NPC per
reply), refresh of generated expressions when the character's image prompt inputs change, image edits that wait for the reply's tracker
read, expression edits sized to the reference image, player-line TTS, a cost notice before automatic NPC creation. Removed: the "put my
block in ST's prompt list" option (CC preset entry), with a long comment explaining why it was wrong.

## How it works

- **History window** (`src/prompts/history-window.js:2-27`, `src/entry/entry-history-notes.js:12-46`): in the generate interceptor,
  for `normal|swipe|regenerate|continue`, count tokens newest→oldest; once the kept span passes `max` (default 16k), jump the start to
  the newest **user message preceded by a non-user row** whose suffix is ≤ `min` (8k). The start `first` is persisted in
  `chatMetadata.sillynpc_narrator_history_window` keyed by the limits, so the prompt start stays fixed until `max` is hit again.
  Rows are spliced off ST's prompt copy (`chat.splice(0, start)`), saved chat untouched. Chat/metadata identity re-checked after
  the async token count.
- **Image source fingerprint** (`expression-source-policy.js:4-18`, `host-expression-generation.js:74-81`): each generated sprite label
  records `JSON.stringify([imageUrl, prefix, image-prompt profile fields, image items])` on save. A sprite with no recorded source is
  treated as user-supplied and never replaced; one whose source moved is regenerated on next use (opt-in).
- **Read gate** (`tracker-read-gate.js:1-46`, `npc-expressions.js:52-71`): expression edits for a reply wait (WeakMap keyed by the
  message object, abortable) until that reply's tracker read and its pending image-collection review settle, so a reply that changes
  clothing is drawn with the new look.
- **Reference-sized edits** (`host-expression-generation.js:52-64`): decode the reference, pass its natural width/height to the edit
  workflow; fall back to the configured portrait shape.
- **Prompt-list removal** (`prompt-slot.js` diff, removed comment): ST's CC assembly copies placement from a listed prompt with the
  same identifier but never lists extension prompts; listing one means writing a real preset entry, which is saved/exported/replaced
  with the preset and double-injects if the extension slot is also set. Now: only `setExtensionPrompt(IN_CHAT, depth)`, and leftover
  list entries are removed.

## Patterns for SO

### P1. Compaction cut snaps to a player message — pattern · plan 40 compaction · partial · value 2 · effort S
What: start the kept history at a whole exchange (a player line preceded by a non-player row), never mid-round. Their evidence:
`history-window.js:17-19`. Our state: `src/memory/historyCompaction.ts:28-49` cuts at whatever row the band reaches; with N members per
player send the first kept row is often a member reply whose prompting player line was dropped. Fit: move the planned cut backward to
the nearest player row (keeps more, never past `ceiling`, still a pure function of rows → rollback ≡ replay holds). Needs `is_user` on
`CompactionEntry` (`compactRows`/`compactionEntries`, `src/runtime/compactHistory.ts:34-39`). Do it before the A3-R rating runs
(40 §Rating prep), so the rated arm is the shipped one. Prompt layout is quality-rated: no separate rating needed if folded into A3-R.

### P2. Confirmation: compaction keyed by message identity, not prompt-copy index — host-fact/pattern · plan 40 · present
Castward persists `first` as the prompt-copy `index` (`history-window.js:6-7`). ST sets `index` = position in the filtered copy
(`public/script.js:4496-4529`: system rows filtered out, swipe pops the last), so any system row added or removed before the cut (our
`/comment` notes, `so_row` images, hidden messages) shifts which message `first` names. SO maps rows through `extra` object identity
(`src/runtime/compactHistory.ts:24-31`) and stores nothing (pure replay). Keep it that way; never persist a copy index.

### P3. Generated sprites are replaced only when owned and their visual source moved — pattern · 39 / sprites · present
Castward's "no recorded source = user's, never replace" rule matches ours: the media plugin replaces only an owned file whose sha256
matches its manifest row (`server-plugin/story-orchestrator-media/files.mjs:179-202`), and changed looks are fingerprinted
(`src/sprites/lookHealth.ts:26`). No action.

## Host facts

- Interceptor `chat[i].index` is the filtered prompt-copy position, not the ST message id (`public/script.js:4501-4529`). Unsafe to persist.
- An async interceptor that awaits token counting over the whole history (Castward with the window on) delays every generation; with SO
  in a group that is N delays per player send. Interop only, off by default.
- Extension prompts never appear in the CC prompt manager list; a same-identifier list entry only lends its placement (Castward's
  removed comment, `openai.js` `preparePromptsForChatCompletion`). Matches SO's `INJECTION_REGISTRY`-only approach; do not add a
  preset entry for any block.

## Not worth taking

- Per-message single expression per NPC: SO classifies per passage segment (`src/sprites/classify.ts:60-80`), finer.
- Reference-dimension edits: the builder already sizes to the reference (`src/sprites/builder/builder.ts:72-75`).
- Read gate for image work: SO applies read deltas at the next boundary by design; looks follow committed state.
- Player-line TTS, voice-cue parsing, Speech tab: not in scope (SO lipsync uses its own path).
- Cost notice before automatic creation: one owner, subscription models.
- Reader state that includes NPCs created this reply: SO's living director already writes new people only at a boundary.
- Persisted min/max window settings: plan 40 band is derived from the prompt budget.

## Security notes

- SECURITY.md: CLEAR (AGENTS.md note unchanged). Nothing executed, built or imported; read and `git log/diff/show` by absolute path only.
- `AGENTS.md` still holds the pre-existing agent-directed text (sandbox escalation via `require_escalated`, driving the live ST at :8000).
  Not followed. No new agent-addressed text in this diff.
- New network: `src/tts/speech-catalog.js` plain GETs next to the user-set TTS endpoint (no ST headers). Image/sprite calls stay
  same-origin. `getTokenCountAsync` is ST-local. Nothing above needs network or secrets.
- MIT: code could be reused; nothing above needs code.
