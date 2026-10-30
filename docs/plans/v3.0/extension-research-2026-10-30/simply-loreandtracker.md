# Simply LoreAndTracker — 2026-10-30 harvest

meta: https://github.com/rivesatila/SillyTavern-Simply-LoreAndTracker · head `1d6018b` (v1.03, alpha) · licence **MIT**
(`LICENSE`) · read: all of `index.js` (839 lines), README, manifest, post.md, `index.html` (settings markup, skimmed) ·
skipped: `style.css` (219 B) · prior review: none (new) · SECURITY.md: CLEAR.

## What it is

Single-pass tracker + memory: a constant depth-0 lorebook entry tells the main model to append a status footer (date/time,
location, weather, present characters with mood, a 1-2 sentence `SUMMARY #{{lastMessageId}}`) to every reply. The extension
regexes the footer out of the **previous** assistant message and merges it, sorted by message number, into one constant
lorebook entry in a per-character book `slt_mem_<CharacterName>`. No side call. Alpha, small; most value is as an
anti-pattern list and a conflict to detect.

## How it works

- **Directive as a lorebook entry**: `createSystemPromptTemplate` = constant, `position: 4` (at depth), depth 0, order 9999,
  `ignoreBudget`, enabled by the misnamed flag `disableConstraint` (default `true` = on) (`index.js:11-46,316-364`).
- **Memory entry**: constant, at depth (default 4, system role), `excludeRecursion`/`preventRecursion` (`index.js:259-312`).
  Changing "Target Entry Comment" starts a new entry (manual chapters, README).
- **N-1 harvest**: on `CHARACTER_MESSAGE_RENDERED` / swipe, process message `id-1` (or `id-2` if that is the user's)
  (`index.js:798-832`); `processMessage` refuses the newest message (`:544-548`). So a reply is harvested only once a later
  reply exists, i.e. once it can no longer be swiped.
- **Idempotent merge**: split entry content on `# <tag> N`, replace the block with the same N, append otherwise, sort by N
  (`insertInOrder`, `index.js:137-167`). Re-harvest of the whole chat is safe (`harvestAllMessages`, `:624-656`).
- **Writes**: whole-book `saveWorldInfo` **and** a raw `POST /api/worldinfo/edit` of the same data, then emits
  `WORLDINFO_UPDATED` plus a raw string event (`index.js:203-230`). No base check, no revision.
- **Status dots**: book exists / scene entry exists / directive exists / book linked to the card (checks `data.world`,
  `world_info`, `character_book.name`, `extensions.world_info`) (`index.js:393-536`).
- **README vs code**: README says footers are "stripped cleanly from the chat text"; the code never edits `mes`. The footer
  stays in the visible reply and in every later prompt's history.

## Patterns for SO

### P1. Detect an in-reply tracker footer as an extension conflict — host-fact/check · checks, extraction hygiene · absent · value 2 · effort S
- What: this extension (and RPG Companion "together" mode, ScenePulse-style presets) makes every reply end in a structured
  status block that stays in `mes`.
- Why it hurts SO: (1) our shared read takes quoted evidence from the transcript; footer lines like "Location: X" or
  "Characters Present: A (angry)" are the model's own claims, not narrative, and can anchor a delta or a scene break;
  (2) in a group the footer reaches every member through the shared transcript; (3) footers in history shape the next
  reply's style and cost tokens each turn (the "zero extra tokens" claim is false for history). Our hygiene drops
  `details/script/style/template`, hidden elements and reasoning (`src/extraction/windowHygiene.ts:13,24-29`), not a
  plain-text footer.
- Our state: conflict detection exists by folder + settings key (`src/services/stHost/extensionConflicts.ts:60-66`) with
  `degrades` checks (`src/runtime/checksExtensions.ts`). No entry for this one.
- Sketch: add `{ id: "reply-tracker-footer", folder: "third-party/SillyTavern-Simply-LoreAndTracker", settingsKey:
  "simply_lore_and_tracker", on: s => s.disableConstraint !== false }` (folder from `index.js:665`, key `:8`, flag `:45`), a
  `degrades` check with feature `memory`, player copy "Another extension adds a status block to every reply; story reads may
  take it as fact." Firing fixture per `checksRegistry.test.ts`. A generic detector (same labelled lines ending ≥3 recent
  replies) is possible later; do not strip text from the read window without a measured fixture.

### P2. Harvest only replies that can no longer be swiped — pattern · extraction timing · present · value 1 · effort -
- Theirs: N-1 rule (`index.js:806-812,544-548`). Ours: `stabilityLag` + settled window (`src/runtime/settledWindow.ts`), and the
  RPG Companion N-1 commit was already reviewed (`docs/plans/v2.4/extension-research/rpg-companion-sillytavern-extension.md:17`).
  Nothing new.

### P3. Model-stamped message id for idempotent, ordered memory rows — pattern · memory · present · value 1 · effort -
- Theirs: `{{lastMessageId}}` inside the directive, replace-by-number merge (`index.js:13,25,137-167`). Ours: memory rows carry
  source spans/ranges and rollback by message (`memory/derived.ts`, `memory/audience.ts`, `runtime/rollback.ts`); far stricter.

### P4. Single-pass tracking (state + summary in the main reply) — anti-pattern for SO · extraction · rejected before · value - · effort -
- Rejected in v2.4 (RPG Companion "together" mode: nothing on the reply path,
  `docs/plans/v2.4/extension-research/rpg-companion-sillytavern-extension.md:49`). New reasons from this code: the directive is
  an `ignoreBudget` constant at depth 0 in every request; reply quality with thinking on would spend reply budget on
  bookkeeping; no evidence, no scope, no secret filter; a held secret summarised in the footer reaches every member. Keep the
  off-path shared read.

## Host facts

- Their book-link check reads four card fields (`data.world`, `world_info`, `data.character_book.name`,
  `data.extensions.world_info`, `index.js:495-521`). ST's primary link is `character.data.extensions.world` and extra books
  live in `world_info.charLore[].extraBooks` (`SillyTavern-MainBranch/public/scripts/world-info.js:1127-1132`); they check
  neither, so their "linked" dot is unreliable. Not used by SO (lorebook existence = `world_names`). No SO bug.
- A constant at-depth WI entry with `{{lastMessageId}}` resolves at prompt time to the last existing message id (the player's
  line), not the reply's id, so their numbers are off by one; harmless for them, a reminder that macro values in WI are prompt-time.

## Not worth taking

- Per-character memory book (`slt_mem_<name>`, `index.js:420-422`): every chat with that card shares one memory; our mirror is
  one book per chat by design.
- Double whole-book write (`saveWorldInfo` + raw `/api/worldinfo/edit`, `index.js:208-213`), unconditional: the opposite of our
  conditional commit (v2.8 69 K12).
- No rollback on delete/edit of a harvested reply: rows outlive the message. Our rollback ≡ replay rule covers this.
- Manual "chapter" by renaming the target entry: chapters/seal already exist (`runtime/chapters*.ts`, `chapterSeal.ts`).
- Status dots: our one check registry + Repair already does this, with words (v3.0 29 phase 0a status dots).
- "Copy summaries to an external LLM to condense": manual; our chapter records/eras do it in product.

## Security notes

- CLEAR per SECURITY.md. Same-origin `/api/worldinfo/get|create|edit` with ST's request headers (`index.js:169-230`); static
  imports of ST `script.js`, `world-info.js`, `extensions.js` (`index.js:1-3,58`). No external hosts, no model calls, no secrets.
- Writes lorebooks unconditionally (whole book, twice) and can create a book per character on any chat (`index.js:437-466`,
  `:569-572`): it can clobber concurrent edits to that book, including ST's editor. Not a key-theft risk.
- Exposes `window.autoMemoryHarvest` (`index.js:658`). Directive text is a model instruction shipped in a lorebook entry,
  aimed at the roleplay model, not at agents. README mentions Claude only as an example external LLM. No text addressed to AI agents.
- Nothing we copy needs any of the above.
