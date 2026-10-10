# v2.8 34: Lorebook features (queue A5, backlog D11)

Outlets, regex keys, NOT logic and generation triggers: what SillyTavern does with each, what our runtime does with each, the gaps, and what was built. ST checked at `C:\dev\SillyTavern-MainBranch` (`public/scripts/world-info.js`, `macros.js`, `constants.js`, `script.js`).

## What ST does

| Feature | ST behaviour (source) |
|---|---|
| Regex keys | A key `/pattern/flags` is a RegExp and overrides case and whole-word settings; an unescaped `/` inside, or a bad pattern, makes it plaintext (`parseRegexFromString`, `world-info.js:2901-2926`, `matchKeys` `:337-366`). Primary and secondary keys alike. |
| Secondary logic | Only when `selective` and `keysecondary` non-empty, after a primary match: `AND_ANY` 0, `NOT_ALL` 1, `NOT_ANY` 2, `AND_ALL` 3 (`:4925-4980`). Constant entries skip all of it. |
| What a key is matched against | Chat messages to the scan depth, plus each `match*` source the entry sets (persona, card description, personality, depth prompt, scenario, creator notes), plus every scan-flagged extension prompt (Author's Note, other extensions' blocks), plus the recursion buffer (`:279-327`, `:4718-4726`). |
| Outlets | Position 7 with `outletName`; the text is pushed (higher `order` first) into `outletEntries` and appears only where `{{outlet::name}}` is written (`:5248-5256`, `macros.js:668`). No name = skipped with a warning. |
| Triggers | `triggers` lists generation types (`normal, continue, impersonate, swipe, regenerate, quiet`, `constants.js:36-43`); the scan's trigger is the Generate type, anything else `normal` (`script.js:4633`). Checked before forced activation (`:4807-4812` before `:4886`), so a forced entry with a non-matching trigger never fires. |

## What we did with each (before)

| Area | Regex | NOT logic | Outlet | Triggers |
|---|---|---|---|---|
| `loreKeyMatch` (R12 "left to the scan") | matches ST | applied on the chat buffer only | n/a | entry with any trigger: never certain |
| Lore select | rates all | **unsound**: a NOT entry could be "certain" while our own scanned memory blocks or the AN held a secondary key, so it was left unrated and ST then did not fire it | rated + forced; lands in its outlet | **wasted**: an entry whose triggers exclude this generation was rated and forced, and could never land |
| Lore placement | n/a | n/a | not moved (correct, unpinned) | n/a |
| Exclusive | n/a | n/a | suppressed like any unpicked entry (correct) | same |
| Scan gate / curator | untouched fields | untouched | untouched | untouched |
| Wizard `upsertLorebookEntry` | keys pass through, no check | cannot author | cannot author | cannot author |
| Host `upsertWIEntry` | | | | "unchanged" when only keys differed (stale keys kept) |
| Guide | lorebook-mechanics only | | | |

## Built (deterministic)

- `src/utils/wiKeys.ts`: ST's `parseRegexFromString`, logic codes, trigger list, outlet position, `regexKeyProblem`, `outletNameProblem`, `triggerGenerationType` (Generate's mapping).
- `readScanBuffer` reports `trigger` and `injected` (a scan-flagged extension prompt holds text). `keywordWillActivate`: NOT_ANY/NOT_ALL certain only with `injected === false` and no `match*` source; triggers certain when the known generation type is listed.
- `LoreSelector` never rates an entry whose triggers exclude the known generation type (`excludedByTrigger`).
- Lore placement: outlet entries pinned unmoved by a test.
- Wizard: `upsertLorebookEntry` gains `secondaryKeys`, `logic` (`and-any | not-all | not-any | and-all`), `outlet`, `triggers` across the op type, staged parser and prompt, agent tool schema, provisioning card (list / select / text fields) and coordinator. `loreEntryShapeProblem` refuses: a pattern key ST would read as plain text, logic without secondary keys, secondary keys on a constant entry or with no keyword, an outlet name with `{`/`}`, an unknown trigger. Host `upsertWIEntry` writes `keysecondary`+`selective`, `selectiveLogic`, `position 7`+`outletName`, `triggers`; "unchanged" now compares keys and every given field.
- Guide: topic `lore-entries` (story-guide + compact twin, Story tab, Lore and memory page); lorebook-mechanics §14.4/14.4b updated.

## Not built, with reasons

- **Curator** authoring these fields: its create op is keys + text under a closed vocabulary, and its edits touch only `content`/`disable`; the fields it never writes are preserved. Adding logic/outlet to an LLM-proposed op widens a write scope plan 11 kept narrow. Owner call if wanted.
- **"Outlet nothing writes" check**: `{{outlet::name}}` can sit in a card, preset prompt (prompt manager or instruct story string), the AN, another entry or a macro; a check that misses one source would cry wolf. Documented as a trap instead.
- **Studio lorebook editor**: Studio does not edit entries; SillyTavern's own editor already has every field.
- **Triggers + character filter in candidates**: a character filter is also checked before forcing (`:4816-4850`); excluding filtered entries needs the drafted member's avatar and tags. Left as owed.

## Owed

- Live no-model lane check of the provisioning card with the new fields, and a dry-run scan of a NOT_ANY entry beside a scanned memory block (`st-eval --file`).
- Storybook story for the card's new select field (gates run `--no-storybook`).

## Gate record

See the final report of the A5 build (commit on `v2.8-lore-features`).

## Status (WIP 2026-10-10)

Done: everything under Built, tests added. Next: fix the red gates of the first run (typecheck:test, test, lint; replay, typecheck and build green), then run `npm run gates -- --no-storybook --jobs 2` and report the bundle bytes.
