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
- Full coordinator gates, including the whole Storybook suite; the new card interaction passed separately.
- Real-model lore-select/wizard regression on an isolated lane; no GPU/model calls authorized for B2.

## Gate record

Below: the first-pass record (B2 completion) and the second pass.

## Status (WIP 2026-10-10)

Done: everything under Built, tests added. Next: fix the red gates of the first run (typecheck:test, test, lint; replay, typecheck and build green), then run `npm run gates -- --no-storybook --jobs 2` and report the bundle bytes.

## Gate record — B2 completion 2026-10-11

- Scope: `C:/dev/so-lore-features`, `v2.8-lore-features`; clean start at `086b876b`, merged master with existing work preserved. Resolved guide grouping by retaining poses and lore-entries; regenerated pages, never hand-merged the bundle.
- Fixed test fixture typing, lint length/escape errors, and moved the silent-catch inventory with `parseKeyRegex`. Host upsert defaults supplied secondary keys to AND_ANY instead of retaining an old NOT filter. Card accepts explicit `and-any`, preserves commas while typing lists, and stores trimmed lists.
- Added `LoreEntryFeatures` Storybook play: explicit/default logic, NOT_ANY selection, outlet, two typed triggers, applied op, constant-entry refusal. It exposed the comma-loss defect before the fix; final Chromium run passed with no accessibility violations.
- Host source verified read-only: `world-info.js:279-366, 2901-2926, 4718-4726, 4807-4984, 5203-5256`, `constants.js:36-43`, `script.js:4633`, `macros.js:668`. Existing regression cases cover regex/plaintext fallback, all four logics, hidden scan text, trigger mapping/exclusion, unmoved outlets and host field writes; new case covers default logic after a NOT filter.
- `npm run docs:guide && npm run docs:settings`: PASS, 32 guide pages.
- `npm run typecheck:test`: PASS after fixture fix; repeated after final UI change.
- `npm run lint`: PASS, 0 errors; 2 inherited hook warnings in BriefingHost and LiveHead.
- `npm test -- --runInBand`: initial run reported 667 passing suites, 1 failing suite (stale error-copy inventory), 2 skipped; 7,739 passing tests. Tool timeout reported after the summary; this run is NOT a green whole-suite claim.
- `npx jest --runInBand src/runtime/errorCopy.guard.test.ts src/runtime/loreKeyMatch.test.ts src/runtime/lorePlacement.test.ts src/runtime/loreSelect.test.ts src/services/stHost/worldInfo.test.ts src/services/stHost/worldInfoActivate.test.ts src/wizard/provisioning.test.ts src/copilot/parse.test.ts`: PASS, 8 suites / 172 tests after the inventory fix; Jest prints its open-handle warning.
- `npm run gates:quick`: final PASS, typecheck/test-types/lint exit 0, 488 related suites / 6,181 tests passing, 1 skipped; replay 32/32 killed (14 cached). Prior repeat hit EBUSY copying the unresolved merge-index guide path; marking both regenerated conflicts resolved removed the duplicate staging input and the rerun passed.
- `npm run build`: final PASS, webpack compiled successfully; main bundle 1,296,595 B, below 1,300,000 B; sha256 `5d21e7cb092253bd34fefe6f28152532df88c32fb2896ab52a1d89f1f735ff4a`.
- `npm run storybook:build`: PASS with inherited mock-export/asset-size warnings. Targeted runner below: PASS, 1 selected story, 121 excluded; server shut down by concurrently. An earlier attempt with unsupported `--testPathPattern` was refused; switched to the story tag.

```bash
npx concurrently -k -s first "node node_modules/http-server/bin/http-server .sb-static -p 6032 -a 127.0.0.1 -s -c-1" "node node_modules/wait-on/bin/wait-on -t 60000 http://127.0.0.1:6032 && node node_modules/@storybook/test-runner/dist/test-storybook.js --url http://127.0.0.1:6032 --index-json --maxWorkers 1 --includeTags lore-features"
```

- Edited `src/**` restored to CRLF; `git diff --check` clean.
- No full `npm run gates`: coordinator owns the serial final suite. No staging/install, owner ST, lane, GPU, campaign edits or model/judge calls. Deterministic implementation buildable; plan acceptance remains open for full gates and live checks.
- Owed no-model protocol (lane 32, images/sprites off): provision a marked owned book through the card, read back all four fields; dry-run NOT_ANY beside scanned memory, confirm it is not classified certain and ST suppresses it; outlet stays authored, excluded trigger is not forced; cleanup and run-header diff; repeat twice. Real-model protocol: wizard proposes fields, author applies, lore-select rates/forces only eligible entries, capture actual prompt and audit without debugResponse, archive lane evidence privately.

## Gate record — B2 second pass 2026-10-11

- Scope: `C:/dev/so-lore-features`, `v2.8-lore-features`. The worktree held an unfinished merge of master (`MERGE_HEAD` `e68a242c`, equal to master) with the first pass's fixes uncommitted; this pass re-verified them, finished the merge and committed. `git merge master`: already up to date.
- Host source re-read (`C:/dev/SillyTavern-MainBranch/public`): `world-info.js:33-38, 863, 2901-2926, 4807-4812, 4886-4890, 4925-4980, 5248-5256`, `macros.js:668`, `constants.js:36-43`. Our `parseKeyRegex` equals `parseRegexFromString` (first `\/` unescaped only, same flag set, a bad pattern is plaintext).
- Added jest cases so every ST behaviour in the table has a test whose name carries the host file:line:
  - regex keys: `src/utils/wiKeys.test.ts` (new: delimiters, flags, escaped slash, bad pattern, logic codes, trigger list, Generate mapping, outlet position and name), `loreKeyMatch.test.ts` (uncompilable pattern or unknown flag is plaintext and matches literally; a secondary key may be a regex);
  - secondary logic `world-info.js:4925-4980`: four logics, non-selective, empty secondary list, constant skips every check;
  - what a key is matched against `:4718-4726`: NOT logic uncertain while a scanned extension prompt holds text, and the lore-select level (`loreSelect.test.ts`): a NOT entry is left to ST only when the buffer is complete, rated otherwise;
  - outlets `:5248-5256`: placement leaves an outlet entry in place (existing); a blank outlet name writes no outlet position (`worldInfo.test.ts`);
  - triggers `:4807-4812`: certain only for a known listed type; lore select never rates an excluded entry (existing).
- `npx jest --runInBand src/utils/wiKeys.test.ts src/runtime/loreKeyMatch.test.ts src/runtime/loreSelect.test.ts src/services/stHost/worldInfo.test.ts`: PASS, 4 suites / 117 tests (one new case first failed on a wrong literal in the test, fixed in the test; product unchanged).
- `npm run typecheck`, `npm run typecheck:test`: exit 0. `npm run lint`: 0 errors, 2 inherited hook warnings.
- `npm test`: exit 0, 670 suites passed, 1 skipped; 7,757 tests passed, 1 skipped (the first pass's 667/1-failing run is superseded).
- `npm run gates:quick`: green, 489 related suites / 6,193 tests passed, 1 skipped; replay `--cached` ok. Storybook beside the change not run by quick gates; the targeted `lore-features` play passed in the first pass and the card was not touched since.
- Not run: full `npm run gates`, build (no non-test source changed since the first pass's 1,296,595 B build), Storybook, any lane, GPU, model or judge call, staging, install.
- Owed: unchanged from the first pass (no-model lane 32 provisioning-card read-back and NOT_ANY dry run; real-model lore-select/wizard run; coordinator full gates).

## Harvest phase: key-match preview, key lint, per-kind lore guidance (ex-plan 66, folded 2026-10-16)

Was half of `66-authoring-quality-cards-and-lore.md` (written 2026-10-14, H6b, H7); folded after Astra's review
(`review-astra-harvest-2026-10-16.md` §1, §2 (66)). The card half is `09-wizard-assistant.md` §Harvest phase. Not built,
not queued. Implementation **D**; acceptance **D** + **CL**. Sources:
`docs/plans/v2.8/extension-research-2026-10-14/creative-studio.md` P2 (activation preview + key lint, 3/S–M),
`writers-workbench.md` P1 (per-kind templates, 4/S).

### Current state in code (verified on `e8b9dd6d`)

- Wizard lore checks are shape-only (`loreEntryShapeProblem`, `src/wizard/provisioning.ts:15`). The wizard prompt covers key
  syntax only.
- `matchKey` (`src/runtime/loreKeyMatch.ts:35`) answers "does this key match this text". `keywordWillActivate` (`:61`) answers a
  narrower question and **deliberately returns false for uncertain entries** (`certain`, `:51-59`: probability, groups,
  triggers, character filters, delay/cooldown, `@@` content, `{{` keys, scan depth 0). Real activation also depends on
  checkpoint gating, scan sources and depth, secondary logic, recursion and budgets (this plan's §What ST does).
- Guide topic `lore-entries` (`docs/authoring/story-guide.md:392`, twin `src/copilot/guideTopics.ts:264`) covers fields and
  mechanics; `{{// so:protect}}` is documented; no per-kind content guidance.

### Design

1. **Key-match preview, honestly labelled.** `previewKeyMatches(op, texts)` (pure, over `matchKey`) lists which of the
   draft's own texts (checkpoint objectives, briefing, opening messages, card descriptions) a primary key matches. Card line:
   **"key matches these draft texts: …"** or "no draft text contains any key". It never says "fires on". Where
   `keywordWillActivate` would call the entry uncertain, the card adds the reason ("may not fire: probability 40", "gated:
   only on checkpoints …" from the gated set). Actual activation is tested separately (below), not claimed by the preview.
2. **Key lint, warnings only**, each with an operational rule: a key under 3 characters; a key shared by more than two entries
   in the book; a secondary `and-any` key that is also one of the entry's primary keys or whose first 5 letters equal a primary
   key's (labelled "secondary repeats a primary key; it narrows nothing"); `sticky` on a constant entry.
3. **Per-kind lore guidance.** A guide topic `lore-content` (story guide + compact twin + coverage test), one short
   paragraph per kind in our own wording: place (ways in and out, travel distance), item (limits, who wants it), faction (size,
   reach), history (what happened vs what people say; the truth kept out of shared lore), concept (limits). A short patchable
   "Current state" paragraph for the curator; the stable text under `{{// so:protect}}`. A one-line rule appended to the
   wizard's lore op grammar; `references/patterns.md` §content in `st-lorebook-authoring`.

### Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| A3 | Preview: on a 20-entry fixture with known matches, every listed text equals `matchKey` over the same texts, and every entry `keywordWillActivate` calls uncertain carries its reason | 20/20 | D |
| A3a | Activation, separately: on a no-model lane, 6 fixture entries (certain, probability, gated, secondary NOT, group, scan depth 0) are checked against ST's own activation evidence (`WORLD_INFO_ACTIVATED`); the preview never claims an entry fires | recorded per entry; 0 "fires" claims | D |
| A4 | Key lint planted controls (short key, shared key, secondary repeating a primary, sticky on constant) flagged; 0 on 10 clean entries | 4/4, 0/10 | D |
| A7 | Guidance effect: 10 wizard lore entries per arm (rule on/off), arms blinded; two raters score each entry 1–5 on "a model could play this entry without inventing its basics" (rubric in the fixture); arm score = median of the per-entry mean | recorded; on − off reported with both raters' medians | CL |

Floors are informational and never retuned (rule 2).

### Gates by tier

- **D:** `npm run gates`; A3, A3a (no-model lane), A4; Storybook for the provisioning card preview line; guide coverage.
- **CL:** A7 on Sol, ×2.

### Decisions for the owner

1. **Preview labelled "key matches these draft texts", with uncertainty reasons, never "fires on"?** **Recommended: yes.**
2. **Lore guidance as guide topic + prompt rule (no structured editor)?** **Recommended: yes.**
3. **Build after 09's card checks and read-back (lower priority)?** **Recommended: yes.**

### Review 2026-10-16 (Astra)

Source: `review-astra-harvest-2026-10-16.md` §2 (66), §1 (fold advice). Verified on `e8b9dd6d`.

- **P2 — "fires on" overclaims; `keywordWillActivate` excludes uncertain cases.** Accepted (`src/runtime/loreKeyMatch.ts:51-61`).
  → relabelled "key matches these draft texts", reasons for uncertain entries, A3 rewritten against `matchKey`, actual
  activation tested separately (A3a).
- **P2 — "synonym-like" needs an operational definition; A7 needs a scale, aggregation and blind rubric.** Accepted. → lint
  rule defined (secondary repeats a primary or shares its first 5 letters); A7 1–5 scale, two blind raters, median of means.
- **Preview sophistication can wait.** Adopted (decision 3).
- **Fold 66 → 09 + 34.** Adopted; `66-authoring-quality-cards-and-lore.md` is a pointer.
- Rebutted: none.

## Gate record — Harvest phase 2026-10-16 (branch `v2.8-harvest-09-34`, worktree `../so-h0934`, from master `d1f9ede2`)

Owner decisions 2026-10-16 (`61-harvest-triage-2026-10-14.md`): all three recommended options taken (preview labelled
"key matches these draft texts" with reasons, never "fires on"; guidance as a guide topic + prompt rule; built after 09's
card checks and read-back).

- **Design 1, preview: built.** `src/copilot/lorePreview.ts` `previewKeyMatches(entry, texts, gated)` over `matchKey`; draft
  texts = story description, checkpoint objectives, briefing sections, and the descriptions and first messages of the cards
  among the wizard's own provisioning ops (`draftLoreTexts`, `opCards`). Uncertainty reasons come from
  `activationUncertainty` (`src/runtime/loreKeyMatch.ts`), now the one source `keywordWillActivate` also uses (refactor,
  behaviour unchanged: the 63 existing loreKeyMatch/loreSelect tests pass unchanged), plus "gated: on only from <checkpoint
  names>" from the draft's `world_info.enable`. Card lines: "Key matches these draft texts: …" / "No draft text contains any
  key." / "May not fire: …" (`ProvisioningCard` `LorePreview`, shown when the card has a `context`: Agent wizard and staged
  proposal review).
- **Design 2, key lint: built**, warnings only (`loreKeyLint`): a non-regex key under 3 characters; a primary key shared by
  more than 2 entries in the book (siblings = the wizard's own entry ops for that book; the host book is not read, stated
  as a limit); an `and-any` secondary key equal to a primary or sharing its first 5 letters (both at least 5 long), "it
  narrows nothing"; sticky on an always-in-context entry (the wizard op cannot set sticky, so this row fires only for host
  entry shapes).
- **Design 3, per-kind guidance: built.** Guide topic `lore-content` (story guide, compact twin, Studio World tab, Lore and
  memory page), `LORE_CONTENT_RULE` in the staged provisioning grammar and the agent rules, `lore-entries` gains "On the
  wizard's card", `st-lorebook-authoring` `references/patterns.md` §14. `npm run docs:guide && npm run docs:settings`: 32 pages.
- **A3: 20/20 (floor 20/20, met).** `src/copilot/lorePreview.test.ts`: 20 fixture entries; every listed text equals
  `matchKey` over the same texts and the expected labels; 12 uncertain entries each carry a reason and
  `keywordWillActivate` is false for them; 8 certain entries carry none (and activate where a key matches); no card line
  contains "fire".
- **A3a: recorded, 0 "fires" claims (met).** No-model lane 65, `test/scenarios/v28-34-a3a-preview-activation.json`, the six
  entries of `test/fixtures/lore-preview-a3a.json` (+ a group rival), 20 real ST scans per run through `getWorldInfoPrompt`,
  activations read from `WORLD_INFO_ACTIVATED`. Preview reasons for the same entries (jest, parity with the scenario's
  entries asserted): certain none; probability "probability 40"; gated "gated: on only from The Vault"; secondary NOT
  "not-any depends on every text SillyTavern scans"; group "inclusion group so-a3a"; scan depth 0 "scan depth 0 matches
  nothing". ST, per run of 20 (counted runs on the private copy `C:\dev\st-live-h0934`, served bundle `60a064dd1a39`, source
  `7a25a7c47e98` before and after each run):
  - run 1: certain 20, probability 8, gated 0 (fires at The Vault after `/cp activate vault`), secondary NOT 20, group 9 +
    rival 11 (exactly one per scan), scan depth 0 0;
  - run 2: certain 20, probability 5, gated 0 (fires at The Vault), secondary NOT 20, group 12 + rival 8, scan depth 0 0.
  - Two earlier runs on the shared `C:\dev\st-live` (11/9 probability, same pattern) are not counted: that copy's dist was
    overwritten by other agents during the session.
  - Evidence `C:\dev\so-live-lanes\65\debug\runs\2026-10-16T19-40-32-380Z-so-scenario-run`, `…19-41-03-052Z…`.
- **A4: 4/4 and 0/10 (met).** Planted short key, shared key (3 entries), secondary repeat (prefix and exact), sticky on
  constant each flagged alone; 10 clean entries read as one book: 0. A NOT secondary repeating a primary and regex keys are
  never lint.
- **A7: not run, owed (CL).** Needs a measurement arm with `LORE_CONTENT_RULE` off and a blind two-rater scoring run (no
  harness command or rubric fixture exists yet); nothing model-facing was tuned against it.
- Storybook: `ProvisioningCard` `LoreKeyPreview` play (match line, reasons, lint, no "fires" in the preview).
- Gates and commits: see `09-wizard-assistant.md` §Gate record (2026-10-16, harvest phase), same branch: final `npm run gates -- --jobs=1 --no-storybook` green on `1dfdcc5f`, Storybook 147 suites / 886 tests green.

## Gate record — A7 2026-10-17 (branch `v2.8-65aplus-09a7`, worktree `../so-65a7`, from master `64287be2`)

- Prerequisites built (`090630e9`): the measurement switch, the `lore-guidance` arm runner and the blind two-rater command;
  detail in `09-wizard-assistant.md` §Gate record (2026-10-17).
- Fixture `test/measurements/v2.8/34/lore-guidance.json`, declared before any run: 10 tasks (2 each place, item, faction,
  history, concept) in a synthetic seed story, each asking for one entry; rubric 1–5 "could a narrator play a scene with
  this entry without inventing its basics" (generic, not the rule's list). Declared limit: the guide topic `lore-content`
  stays readable in both arms; reads recorded.
- Writer: opencode `openai/gpt-6.1-sol` through the harness tool bridge, lane 82 (private copy `C:\dev\st-live-65a7`, staged
  `9690eefcaf9d` before and after). Run 1 `2026-10-17T06-41-04-753Z`, run 2 `…06-56-12-009Z`: 10/10 entries per arm per run,
  0 missing, 0 transport problems, 0 retries; every on-arm prompt carried the rule and no off-arm prompt did (switch
  verified per bridge open). **The agent read `lore-content` in 40 of 40 runs**, so the off arm still received the same
  guidance through `readGuide`: A7 measures the rule line's marginal effect, not the guidance's.
- Raters, blind (one pack of 40 shuffled entries, key sha256 `49dde917…`): Claude `claude-opus-5-5` and `claude-sonnet-5-5`
  through the claude CLI, served model checked, 40/40 each. Pack, scores, raw replies and summary:
  `test/measurements/v2.8/34/a7/`.
- **A7 (recorded, floor informational): run 1 on 4.25, off 4.00, on − off +0.25 (opus 4.00/4.00, 0.00; sonnet 4.50/4.00,
  +0.50). Run 2 on 4.00, off 4.00, on − off 0.00 (opus 0.00, sonnet 0.00).** All 80 scores were 4 or 5 (opus 35×4, 5×5; sonnet
  28×4, 12×5), exact rater agreement 31/40: a ceiling, with no room for a difference to show. No floor moved.
- Questions:
  1. A second arm with the `lore-content` topic hidden too ("guidance off")? Recommended: yes if the owner wants the
     guidance's own effect; this run cannot tell it, because Sol read the topic every time.
  2. The rubric saturates at 4–5 for Sol. Recommended: if re-run, rate pairwise (on vs off for the same task, blind order),
     which a ceiling does not flatten; the 1–5 row stays as recorded.
