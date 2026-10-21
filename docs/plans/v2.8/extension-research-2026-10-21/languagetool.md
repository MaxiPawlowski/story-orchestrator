# LanguageTool Grammar Checker — 2026-10-21 harvest
meta: https://github.com/IceFog72/SillyTavern-LanguageTool · head `7d4dac9` (single commit) · MIT · read all 6 files (`index.js` 967 lines, manifest, README, settings.html; skimmed style.css) · companion server plugin (`IceFog72/SillyTavern-LanguageToolPlugin`, owns `/api/plugins/languagetool/{status,check}`) is NOT in the corpus · no prior review
`L/` = `C:/dev/st-extensions-research/languagetool/source/`; ST = `C:/dev/SillyTavern-MainBranch/public/`.

## What it is / what changed
New repo. A spell/grammar underline for ST **text boxes** (`#send_textarea`, card fields, quick-edit prompt), click-to-fix
chips, "ignore word" list. It never reads or touches chat replies. All checking happens in the server plugin (presumably a
LanguageTool server or proxy; unverified, not in the corpus). Zero LLM calls. For SO the interest is narrow: LanguageTool as a
deterministic, cheap prose check that could guard the owner's per-character polish idea. The UI itself is not worth taking.

## How it works
- Targets: CSS selector list (`L/index.js:11`), password inputs refused (`:289-295`); MutationObserver + 300 ms value poll
  re-discover inputs (`:306-352, 942, 951-958`).
- Check: debounce `checkDelay` 700 ms, abort previous request, `requestId` stale guard, chunks of ≤ 20,000 chars split at
  whitespace (`:228-243, 562-628`). Matches are LanguageTool's `{offset, length, rule.issueType, replacements, message}`.
- Filters: protected ranges `{{macros}}`, HTML tags, URLs, inline code (`:21, 209-226`); ignored words only suppress
  `misspelling` matches (`:223`).
- `rebaseMatches` (`:249-272`): on each edit, keep matches before the edit, shift matches after it, drop the touched ones,
  so highlights do not flicker while waiting for a new answer.
- Fix applied with `execCommand('insertText')` to keep browser undo (`:805-821`).
- CSRF: prefers `getRequestHeaders()`, retries once on 403 with a fresh `/csrf-token` (`:164-195`).
- Manifest `hooks.clean: onClean` deletes its settings (`L/manifest.json:11-13`, `L/index.js:928-934`).

## For per-character polish
What this repo gives toward a Recast-style per-member polish pass, and what it does not.
- **Mechanism here:** detection only, on input boxes. No reply hook, no rewrite of `mes`, no swipe/edit/stream handling
  for messages. Reusable bits: the protected-range filter and the stale-request guard.
- **What LanguageTool can do for polish (server API, not this repo; verify before planning):** `/v2/check` takes
  `enabledRules`/`disabledRules`/`enabledCategories`/`level=picky`. English has deterministic repetition and style rules
  (word repeated in successive sentences, sentences starting with the same word, wordiness, long sentences). That makes it a
  cheap **regression check on a rewrite**: score a reply before and after a polish pass, and refuse the rewrite if it adds
  grammar/spelling issues or repetition hits. Cost is milliseconds per reply on a local LT server (Java, ~1 GB RAM;
  the public API has request and size limits). No model, no GPU.
- **Safety against adding facts or player actions:** LanguageTool replacements are local token edits from a fixed rule set.
  They cannot invent a fact or narrate the player. But it is a **standard-grammar** checker: a character whose voice is
  deliberately non-standard (dialect, clipped speech, archaic forms) gets flagged everywhere. Auto-applying LT fixes to
  dialogue would erase exactly the voice the polish idea is meant to protect. Use it as a guard or a meter, never as the
  rewriter, and never auto-apply to quoted speech.
- **Per-character config it implies:** per roster member, a rule profile (`disabledRules`/categories; e.g. grammar off for
  a dialect speaker, repetition rules on for everyone) and an ignore list. The ignore list can be generated, not typed:
  roster names, `aliases`, codex names and story lorebook keys. `RosterMember` has no voice/style fields today
  (`src/engine/schema.ts:326-339`), so this would ride the same new per-member voice block the polish plan needs.
- **Swipes/edits/streaming (what SO would need, not what this repo does):** check only the final rendered text
  (`MESSAGE_RECEIVED`, after thought-leak repair), keyed by message revision (swipe id + text hash, as talk control keys
  decisions); a later edit or swipe re-checks. Never mid-stream.
- **Already ours, deterministic, and closer to the polish idea than LT:** `mineRepetition` (`src/stagecraft/repetition.ts:65-78`):
  3-8-word phrases repeated in ≥ 2 of the last 6 replies plus four stock constructions; author view only
  (`src/runtime/snapshotBuilder.ts:348`), feeding the warden's `repetition` family (`src/stagecraft/warden.ts:52, 103`).
  It pools **all** replies (`replyTexts`, `repetition.ts:80-84`), so one member's tic is diluted by the others and a phrase
  two members share reads as a loop. See P2.

## Patterns for SO

### P1. LanguageTool as a before/after guard on a polish rewrite — feature · polish / stagecraft · our state: absent · value 3 · effort M
- What: per-reply LT score (issue counts by rule family) taken on the original and the rewritten text; a rewrite that raises
  spelling/grammar issues or repetition-rule hits is rejected and the original stays. Their evidence: the check/filter
  pipeline `L/index.js:171-226`; LT rule controls are server-API facts, verify against the LT docs first.
- Ours: no polish pass exists; Recast patterns are triaged (61 rows R3-R8, all compat). Nothing scores prose deterministically
  except `mineRepetition`.
- Fit: needs a server plugin like `story-orchestrator-judge` (the only place an external service is called; loopback, a
  reserved port in `lib/laneRange.mts`), a tray entry, and a new `stHost/` module if the page calls it. A guard never blocks
  a reply, it only refuses a rewrite (like the judge, never writes). Value depends entirely on the polish plan existing; on
  its own LT adds little the player feels.
- Sketch: `server-plugin/story-orchestrator-prose` proxying a local LT; `scoreProse(text, profile)` returns counts by family;
  polish pass keeps a rewrite only when `after <= before` per family. A floor-style measurement on recorded replies first.

### P2. Per-member repetition window in `mineRepetition` — pattern · stagecraft / polish · our state: partial · value 3 · effort S
- What: run the miner per speaker (`name` on each chat row) as well as pooled, so "Mara always narrows her eyes" surfaces as
  Mara's loop, and a phrase two members share is not one member's tic. Prompted by this repo's lens, not by its code.
- Ours: pooled window only (`src/stagecraft/repetition.ts:65-84`).
- Fit: pure, deterministic, no model. Feeds the warden note per drafted member (private block route) instead of a global
  note, which is also the natural input for a per-character "avoid" list in the polish plan. Author view keeps the pooled
  report. No invariant conflict; does not touch thinking or the inner voice.
- Sketch: `mineRepetitionBy(rows)` → `Map<speaker, RepetitionReport>`, `REPETITION_WINDOW` counted per speaker (6 of that
  member's replies); warden family `repetition` names the member; fixture with two members sharing one phrase.

### P3. Generated ignore list for any lexical prose check — pattern · polish · our state: absent · value 2 · effort S
- What: their ignore list is typed by hand (`L/index.js:823-832`). For SO the list is already known: roster names, aliases,
  codex names, lorebook keys, player name. Same list keeps invented names out of any spelling or repetition count
  (`mineRepetition` already skips all-proper-noun grams, `repetition.ts:47-50`).
- Fit: only matters once P1 exists. Fold into P1.

## Host facts
- ST extension manifests support `hooks` (`install|update|delete|clean|enable|disable|activate`), called with a timeout
  (ST `scripts/extensions.js:385-461`). SO's manifest declares none (`manifest.json`). A `delete` hook could offer the memory
  mirror cleanup; owner rule "nothing is deleted from the owner's ST data" says leave it.
- `APP_READY` is a sticky event: late listeners fire immediately (ST `scripts/events.js:113`), which they rely on
  (`L/index.js:961-967`).
- Their toggle positions itself inside `#send_textarea`'s parent and forces it `position: relative` (`L/index.js:408-412`).
  Our HUD sits above the chat input; if the owner installs this, check `#so-hud` placement once (not verified).

## Not worth taking
- The overlay/mirror highlight UI, click-to-fix chips, 60-language picker: authoring/typing aid, no player value for SO.
- `rebaseMatches`: neat, but we never highlight live text.
- Spellcheck on the player's own input: install this extension if wanted; nothing for SO to build.
- Auto-applying LT replacements to replies: erases character voice (see polish section).
