# ST Memory Books (STMB) — 2026-10-21 harvest

meta: https://github.com/aikohanasaki/SillyTavern-MemoryBooks · `pre-refresh-2026-10-21` (`b1e6ad2`, v9.3.7) .. HEAD `ed12a54` (v9.3.8), 6 commits, 32 files · **AGPL-3.0: ideas only, never code** · read: full diff of `clipManager.js`, `index.js`, `templates.js`, `autocreate.js`, `chatMessagePicker.test.js`, `changelog.md`, English reference manual; skipped `index.build.js(.map)`, locales, translated manuals · prior: `docs/plans/v2.8/extension-research-2026-10-14/st-memory-books.md`, `docs/plans/v2.4/extension-research/st-memory-books.md`

## What it is / what changed
Same product (chat ranges → LLM memory entries in lorebooks). Small, UI-only delta:
- Topical Clip: new install-wide toggle "Also use hidden messages" (default off) for ranges and Extract selections; reads hidden text without unhiding, independent of `unhideBeforeMemory` (`clipManager.js:2163-2166`, `:2454-2458`, `:2570`, `:2594-2596`). Source hashes now record only messages actually used (`:2578-2580`).
- Range start/end prefill: scene markers, else highest processed memory id, else 0 / last id (`clipManager.js:2282-2284`).
- Lorebook name template result `.trim()`ed after the 60-char cut (`autocreate.js:47`).
- Manual: narrator cast snapshot survives GENERATION_ENDED-before-finalize, and **"Stopped or failed partial replies are not automatically tagged"** (manual en §12.4, +2 lines).

Prior review rows: P1 → R79 fixed (B12); P2 → H9c FOLD into 11; P3 → R9 BUNDLE 69 K13 (built `aab4a05a`, revision keys); P4 → R11 SKIP built; P5 → R12 SKIP. Nothing in this delta changes those verdicts.

## How it works
- Hidden toggle is a pure read-filter on `compileScene(..., {includeHiddenMessages})`; chat objects untouched (test `chatMessagePicker.test.js:+62`, asserts `chat` deep-equals before). Toggle change clears the draft (stale-source guard).
- Partial-reply policy: cast stamp binds at GENERATION_ENDED only when the stream was neither stopped nor aborted, so a user-stopped partial gets no cast and falls back to manual confirmation.

## Patterns for SO

### P1. Decide what a user-stopped partial reply is — host-fact / test-idea · turnBridge, extraction · our state: undecided · value 3 · effort S
What: STMB now states policy explicitly: stopped/failed partials are not treated as finished generations for derived state. Ours: `GENERATION_STOPPED` only flushes pending (`src/runtime/turnBridge.ts:83`); ST's stop path still emits `MESSAGE_RECEIVED`/`CHARACTER_MESSAGE_RENDERED` (prior review host fact, `script.js:3797-3801`, `:3847-3850`), so a stopped half-reply commits a boundary, is extraction input and can fire a transition. 69 K13 covered swipe/edit revision, not stop; no grep hit for a stopped-partial decision in `docs/plans/v2.8/` or `scripts/debug/so-turn-types-check.mts`. Player feel: a player who stops a reply going the wrong way (common at the table) can have the story advance on half a sentence; a later swipe rolls it back, but an edit-and-keep or plain re-send does not. Not re-proposing R9; this is the sub-question R9/K13 left open. Sketch: record `stopped` on the pending turn at `GENERATION_STOPPED`; owner picks (a) commit as-is (today), (b) commit but skip extraction/transition until the player sends again, (c) no boundary. Pin chosen behaviour in `so-turn-types-check.mts`. No invariant conflict; does not touch thinking.

### P2. Hidden messages: read-filter, never visibility flip — pattern · confirms R11 · present · value 1 · effort —
Confirms SO's stance (`src/extraction/windowHygiene.ts:115` drops `is_system` as `hidden`; SO never hides). Only note: with STMB installed and `unhideBeforeMemory` on, STMB still runs `/unhide`/`/hide` around memory runs, so `is_system` can flip while SO reads; fingerprints ignore it (`fingerprints.ts:7`). Nothing to build.

## For per-character polish
Nothing relevant. STMB does no reply post-processing, voice or style work; its only per-character state is narrator cast association (which members a message belongs to, explicitly "association, not a semantic analysis of prose"). The one transferable bit for a Recast-style per-member pass: bind the rewrite to the rendered message identity at GENERATION_ENDED and **skip stopped/failed partials** (P1), so a polish pass never rewrites a half-stream or the wrong swipe.

## Host facts
- No new host facts in this delta. Manual reconfirms: GENERATION_ENDED can precede message finalize; stopped/failed partials do not count as complete generations for STMB.

## Not worth taking
- Range prefill from highest processed id: SO has no manual range picker; extraction windows are automatic.
- Name `.trim()`: SO's `stHost/worldInfo.ts:28` already trims names.
- Combine Clips format/prompt editors (manual §15.3): presentation for WI text; R12 SKIP stands.
