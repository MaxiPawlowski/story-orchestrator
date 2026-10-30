# Small updated repos — 2026-10-30 harvest

Three repos with small diffs since `pre-refresh-2026-10-30`. One idea worth a row (languagetool's message-edit box selector is a host
fact for our selector doc). Everything else confirms existing verdicts.

## 1. CharacterBench (`characterbench`)

meta: https://github.com/RayzerCat76/CharacterBench-SillyTavern `9bf9f33..71ff812` (1 merge, PR #1 "fix/starter-length-gate", 0.1.0 → 0.1.1-alpha,
7 files +33/−19) · **Apache-2.0** (code allowed with notice; nothing taken) · read: full diff (`src/checks.js`, `index.js`, `README.md`,
`docs/VALIDATION.md`) · prior: `docs/plans/v2.8/extension-research-2026-10-14/characterbench.md` (triage H8 FOLD → v2.8 35, R68 SKIP).

What changed: the starter checks stop failing replies on length. Every automatic `max_chars` cap (500–900) was removed from the identity,
persona-pressure, scenario, false-memory, lore, Chinese and drift checks (`src/checks.js:132-207`). The reason given: a tester saw "too long"
failures even with a higher ST generation limit, and "long SillyTavern replies alone are not evidence of character drift". Explicit
`max_chars` in a custom check is still scored. The settings label became "Generation length limit", with a note.

Patterns for SO: one lesson, already followed.
- **A grader must not fail a reply on a property the rubric does not care about.** Their length gate turned verbosity into a drift failure.
  Our graders do not cap length: grep finds no `maxChars`/`max_chars` gate in `scripts/debug/lib` or `scripts/suite`. The only clip,
  `modelBlindPack.mts:46-61`, trims excerpts shown to a rater; it does not score them. Keep it that way when the v3.0 15 end batch adds rubrics.
  Clipped excerpts in a blind pack should say they were clipped, so a rater does not score the cut as an abrupt ending. Not verified that the
  pack says so; worth a glance when 15 runs.
- H8 (needle matching, adversarial probes, noise-aware compare) unchanged.

## 2. LanguageTool Grammar Checker (`languagetool`)

meta: https://github.com/IceFog72/SillyTavern-LanguageTool `7d4dac9..ab8e183` (4 commits, 0.1.2, 5 files +286/−30) · **MIT** · read:
full diff of `index.js`, `README.md`; skimmed `settings.html`, `style.css` · prior: `docs/plans/v2.8/extension-research-2026-10-21/languagetool.md`
(v2.9 triage V03 FOLD 02, V07 → v3.0, V08 FOLD 03).

What changed:
- "Ignore rule" per grammar issue (rule ids are case-sensitive, trimmed and deduped). Ignore lists are managed in settings.
- `ignoreNames` (default on): the persona, the current character and every group member are never flagged as misspelled. Names come from
  `context.groups.find(id).members` (avatars) → `context.characters[].name`, split into words. It re-checks on `CHAT_CHANGED`.
- `#curEditTextarea` (ST's message edit box) added to the default inputs, with a settings migration from the previous default.
- Plugin health: the status line shows plugin-reported `installProblems` and the first line of `workerError`; ok/warn/error classes.
- Results panel: spelling and grammar counts, a detail line only for grammar, hover to emphasise the underline. Language chips with remove,
  and a filter box over the language list. Focusing a box no longer re-sends text that already has results (`checkedText`).

Patterns for SO:
- **V08 (generated ignore list from names) unchanged.** Their name source (group member avatars → card names, word-split) is what our cast
  resolver already does more strictly (`src/engine/castNames.ts`). Their re-check on chat change is the same "derived list is keyed by chat" rule.
- **For v3.0 29 (settings), two small UI shapes:**
  - (a) A long multi-select (their 30+ languages) gets chips for what is selected plus a text filter, instead of a wall of checkboxes. This fits
    our `MultiSelect` (`src/components/studio/MultiSelect.tsx`) where a list runs long (profiles, lorebooks). Value 2, S.
  - (b) A health line shows only the **first line** of a backend error, with the rest behind detail. 29's status rows already do word + icon;
    keep the clip rule. Value 1.
- **Host fact for our selector doc:** ST's inline message editor is `#curEditTextarea` (`ST public/script.js:8273`, input handler `:11862`).
  It is absent from `.claude/sillytavern-docs/community/ui-dom-selectors.md`. Add it (S). It matters for any check that asks "is the player
  editing a message right now" before an in-place write (polish write, chapter fold). Unverified whether SO needs that today.

Not worth taking: rule-level ignore (our checks have `degrades` dismiss and `blocks` cannot be dismissed, by design); the server plugin (see security).

## 3. Your Ultimate Killing Game (`your-ultimate-killing-game-rp-experience-begins`)

meta: https://github.com/LithiumWaves/danganronpa-sillytavern `9ef9272..6715df3` (1 commit "Create a") · licence: none (ideas only) · read:
full diff · prior: `docs/plans/v2.8/extension-research-2026-10-14/danganronpa-sillytavern.md`, `docs/plans/v2.4/extension-research/your-ultimate-killing-game-rp-experience-begins.md`
(triage R35–R38, R76).

What changed: adds `assets/monokubs/a`, a one-line placeholder file (most likely making the folder exist in git). No code. Nothing for SO;
verdicts unchanged.

## Security notes
- SECURITY.md: all three CLEAR.
- characterbench: the diff is a version bump in `package.json` (no scripts added) and the check-length change. It runs checks through the
  user's own ST generation. Not run.
- languagetool: it talks only to its own server plugin at relative `/api/plugins/languagetool`. `getCsrfToken()` fetches `/csrf-token` and
  sends it to that same-origin plugin only (`index.js` per SECURITY.md). **The plugin is a server plugin and not in this repo.** Installing it
  means enabling ST server plugins and running a LanguageTool worker (its status reports a fastText model download). That is unsafe to adopt casually
  after last week's trojan. Nothing proposed here needs it.
- danganronpa: placeholder file only.
- No text addressed to an AI agent in any of the three diffs. The `Co-Authored-By: Claude` trailers in languagetool's log are benign.
