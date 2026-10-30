# ST Memory Books (STMB) — 2026-10-30 harvest

meta: https://github.com/aikohanasaki/SillyTavern-MemoryBooks · `pre-refresh-2026-10-30` `ed12a54` (9.3.8, 2026-10-17) .. HEAD
`07f7310` (9.3.11, 2026-10-29), 4 commits, 23 files (+575/−252) · **AGPL-3.0: ideas only, never code** · read: full diff of
`changelog.md`, `clipManager.js`, `clipReview.js`, `index.js`, `sidePrompts.js`, `stmemory.js`, `outgoingRegex.test.js`, English
reference manual; skipped `index.build.js(.map)` (bundle of the same sources), locales, `clipReviewRegex.test.js` beyond its
name · prior: `docs/plans/v2.8/extension-research-2026-10-21/st-memory-books.md` (P1 → M12, built as A02 in v2.8 69 K13;
P2 → M13 SKIP), `-2026-10-14/`, `docs/plans/v2.4/extension-research/st-memory-books.md`.
`B/` = `C:/dev/st-extensions-research/st-memory-books/source/`.

## What it is / what changed

Same product (chat ranges → LLM memory entries in lorebooks). Small delta:
- `/memory-assist [X-Y]`: run Memory Assistance alone over a range or the current scene, as a retryable queued job
  (`B/clipReview.js:468-516`, registered `B/index.js:12433-12442`).
- Memory Assistance and Topical Clip prompts now pass through the user's selected outgoing/incoming regex scripts
  (`B/clipReview.js:150-182`, `B/clipManager.js:1766-1778`).
- **Outgoing regex fails closed**: an unavailable selected script, a throwing script or a non-text result aborts the request
  before it is sent; incoming stays best-effort (`B/stmemory.js:78-111`, every outgoing call site rethrows, pinned by a source
  test `B/outgoingRegex.test.js:31-37`). Users use outgoing regex to strip content (the test fixture's text is literally
  "private") before it reaches a side model.

## Patterns for SO

### P1. Privacy transforms on side-model input fail closed by type, not by caller discipline — pattern · held secrets / living / chapters · our state: partial · value 2 · effort S
- Theirs: a transform meant to remove content before a side call aborts the call when it cannot run, and a test greps every
  outgoing call site for the strict flag (`B/outgoingRegex.test.js:31-37`).
- Ours: the resting filter is the transform. Three pure helpers take it as an **optional** parameter that defaults to the
  identity function: `storySoFarText` (`src/runtime/chapterKit.ts:282, 287`), `focusCandidates` / `focusSafe`
  (`src/pacing/focus.ts:12, 21, 35`), `projectLivingExport` `scrub` (`src/generation/living/export.ts:12, 62`). Every runtime
  caller passes it or pre-filters today (`chapterKit.ts:194-196`; `livingInputs.ts:31-45` filters `openThreads` before
  `livingCoordinator.ts:250` calls `focusCandidates` without `resting`; `livingCoordinator.ts:494` passes `scrub`). So no leak
  found; the default is fail-open for the next caller.
- Sketch: make `resting` / `scrub` required (tests pass `identity` explicitly where intended). Type-level, zero runtime
  change. Optional: one guard row in `codeHealth.guard.test.ts` refusing `resting ?? ((text` defaults under `src/`.
- Fit: strengthens "a held secret never reaches a kept-out member" (architecture §Memory and privacy). Does not touch thinking
  or the inner voice.

### P2. Run one memory sub-pass on demand over a range — feature · author tools · our state: partial · value 1 · effort S
- Theirs: `/memory-assist X-Y` runs only the review pass, no new memory, no other side prompts.
- Ours: `runExtractionNow(response?, reason?)` and `/so-mem` exist (author view); a chapter re-read of a range is not
  offered. Only worth it if the owner asks for a "re-read this scene" author control; rollback ≡ replay already makes a
  rerun safe. Not proposed.

## Host facts

- STMB runs selected Regex-extension scripts on its own prompts through `getRegexScripts({allowedOnly:false})` +
  `runRegexScript` on a clone with `disabled:false` (`B/stmemory.js:66-96`): a script disabled in ST's Regex UI still runs
  for STMB when selected there (manual states it). Not an SO concern; noted because SO never applies user regex to its side
  calls, so a user's privacy regex does not reach SO's reads (expected: ST's own regex placement rules decide what the main
  prompt carries).
- No new host facts otherwise.

## Security notes

- SECURITY.md verdict CLEAR. `AGENTS.md` holds maintainer style rules; nothing aimed at a reviewer was found in the diff.
- Pre-existing surface (unchanged): reads `/api/settings/get` to recover its own pending state; `api.deepseek.com` appears
  as a `custom_url` passed to ST's own proxy (`stmemory.js:612`); shipped `index.build.js` is a bundle (sources + map in repo).
- Nothing proposed above needs a network call, secrets or a server plugin.

## Not worth taking

- User-regex hooks on SO's side prompts: SO's side-call text is code-built and held-secret filtered; a second, user-edited
  transform layer would make payload goldens and privacy reviews untestable.
- Hidden-message toggle, range prefill (9.3.8): covered in the 10-21 review, verdicts unchanged.
- Stopped-partial policy (10-21 P1 / M12): built on SO's side as A02 (`docs/plans/v2.8/69-harvest-hardening-bundle.md:546`).
