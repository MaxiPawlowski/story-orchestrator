# Plan 66 — Authoring quality: card review on every agent card, lore templates, key lint

**Status: candidate, owner decision pending.** Written 2026-10-14 from the extension harvest (`61-harvest-triage-2026-10-14.md`
H6, H7, and H16 "read-back after wizard creates"). Not built, not queued. Implementation tier **D**; acceptance **D** (pure
checks, Storybook, guide coverage) + **CL** (the wizard on Sol revises a flagged card; templates change what it writes).
Overview: `00-overview.md` §Rules. Home plans: v2.8 09 (wizard assistant), v2.8 34 (lorebook features).

## What it is

Four small authoring aids, all deterministic except the measurement:

1. **Card review on every agent-proposed card.** The Build-a-character tutorial already checks a card for the common
   mistakes (greeting speaks for the player, examples without a `{{char}}:` line, adjective lists, token budget, everyday-word
   names). The agentic wizard's `createCharacterCard` card gets none of that: only a name and a non-empty description. Run the
   same checks on every provisioning card, show them on `ProvisioningCard`, and return them to the agent as the tool
   observation so it can revise before the author sees the card.
2. **Lore activation preview and key lint.** On an `upsertLorebookEntry` card: which story text would fire it ("fires on: the
   opening of Checkpoint 2, the briefing"), or "no story text mentions any key"; warnings for keys under 3 characters, a key
   shared by more than two entries, `and-any` secondary keys that look like synonyms ("move them to primary"), sticky on a
   constant entry.
3. **Per-kind lore content templates.** A guide topic and a wizard prompt rule: what a location, item, faction, history,
   concept or scenario entry should contain (ways in and out and travel distance for a place; limits and who wants it for an
   item; size and reach for a faction; what happened vs what people say for history, with the truth kept out of shared lore;
   limits for a concept). Keep a short patchable "Current state" paragraph the curator can update and the stable text under
   `{{// so:protect}}`. Character behaviour as "When X, they do Y" and a side-cast "why scenes include them" line.
4. **Read-back after a wizard create.** After `createCharacterCard`, read the stored card back and compare name and the six
   authored fields; a lossy or renamed save is reported. "Host said ok, read-back unavailable" is a third outcome,
   `unconfirmed`, not a failure and not a success.

## History and evidence

- `docs/plans/v2.8/extension-research-2026-10-14/creative-studio.md` P1 (card review on agent cards, value 4, S), P2 (activation
  preview + key lint, 3/S–M), P6 (post-create read-back, 2/S), P7 (craft lines for the wizard prompt, 2/S). P3 (stale-tab
  overwrite) goes to plan 69; P4 (proposal staleness) is noted in plan 69 for verification.
- `docs/plans/v2.8/extension-research-2026-10-14/writers-workbench.md` P1 (per-kind templates, 4/S), P2 (behaviour prompts, 3/S).
- `docs/plans/v2.8/extension-research-2026-10-14/nemo-plotlight.md` P1 and `tavernary.md` P1 (read-back; unconfirmed outcome).

## Current state in code

Verified on master `9e96871d`.

- **Tutorial-only review.** `reviewTutorialCard` (`src/copilot/characterTutorial.ts:126`) with `speaksForPlayer` (`:109`),
  `exampleBlocksWithoutChar` (`:111`), adjective, token-budget and greeting checks; its only caller is
  `src/studio/components/CharacterTutorial.tsx:102`.
- **Agent cards.** `validateProvisioningOp` for `createCharacterCard` (`src/wizard/provisioning.ts:93-101`) checks name,
  non-empty description, duplicates. The agent loop adds only `greetingClash` to the observation
  (`src/copilot/agent/loop.ts:339-342`). `ProvisioningCard` shows the grant warning and an entry preview only.
- **Lore checks are shape-only.** `loreEntryShapeProblem` (`src/wizard/provisioning.ts:15-35`). `keywordWillActivate`
  exists (`src/runtime/loreKeyMatch.ts:61`) but the wizard never calls it. The wizard prompt covers key syntax only
  (`src/copilot/prompts.ts:60-73`).
- **No content guidance.** Guide topic `lore-entries` (`docs/authoring/story-guide.md:391-400`, twin
  `src/copilot/guideTopics.ts:261`) covers fields and mechanics; `so:protect` is documented (`story-guide.md:375`); the skill
  says only "one subject per entry, self-contained and concise" (`.claude/skills/st-lorebook-authoring/SKILL.md:121`). The
  tutorial's voice step has no trigger form (`characterTutorial.ts:48-49`).
- **No read-back.** `createCharacterCard` returns `name: body.ch_name` (the requested name) and the avatar text
  (`src/services/stHost/provisioning.ts:40-67`); gotchas already note `/api/characters/create` coerces fields.

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. All four** | shared `cardFindings`, lore preview/lint, guide topic + prompt rule, read-back | S–M | prompt length grows; findings noise |
| **B. Checks only (1, 2, 4)** | no prompt or guide change | S | the wizard keeps writing thin lore |
| **C. Guidance only (3)** | | S | no feedback loop on bad cards |
| **D. Nothing** | | 0 | agent cards skip checks the tutorial has |

## Recommendation

**A.**

- **`cardFindings(op, draft, env)`** in `src/wizard/` reusing the tutorial checks; "opening cast" derived from the draft's start
  checkpoint cast instead of the tutorial checkbox. `blocks` findings refuse the op (as in the tutorial); `warns` show on the
  card and go into the observation ("Card notes: the first message says what the player does; …"). The tutorial switches to
  the shared function (one source).
- **`previewEntryActivation(op, texts)`** pure, over `matchKey` against the draft's own text (checkpoint objectives, briefing,
  opening messages, card descriptions); card line "fires on: …" or "no story text mentions any key". `lintLoreKeys(op, book)`
  warns only (short, shared, synonym-like secondary keys, sticky on constant). Same lines in the observation.
- **Guide topic `lore-content`** (story guide + compact twin + coverage test), one short paragraph per kind, our own wording;
  a one-line rule appended to the wizard's lore op grammar; `references/patterns.md` §content in `st-lorebook-authoring`.
  Character voice step `why` text gains the trigger form and the side-cast function line; a `warns` finding "a trait with no
  behaviour". Craft lines (no `{{system}}` macro in examples, never write the player's actions in greetings) go into the
  wizard character prompt.
- **Read-back.** `createCharacterCard` answers `WriteResult` (`stHost/typedResults` rule) with `stored | unconfirmed |
  mismatch(lossy: string[])` after `/api/characters/get` on the returned avatar; the card and the created-asset ledger record
  the stored name. A `mismatch` is shown to the author, never retried automatically.

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| A1 | Parity: `cardFindings` and the tutorial return identical findings on the tutorial's fixture set | identical | D |
| A2 | Planted controls: 12 planted card mistakes (greeting acts for the player, bare example block, adjective list, everyday-word name, over budget, opening member without greeting) each flagged; 0 findings on 6 clean cards | 12/12, 0/6 | D |
| A3 | Activation preview: on a 20-entry fixture with known matches, every "fires on" list equals `keywordWillActivate` over the same texts | 20/20 | D |
| A4 | Key lint planted controls (short key, shared key, synonym secondaries, sticky on constant) flagged; 0 on 10 clean entries | 4/4, 0/10 | D |
| A5 | Read-back: stored/unconfirmed/mismatch each reached by a stubbed host (3 cases); a renamed save records the stored name in the ledger | 3/3 | D |
| A6 | Agent revision: on 10 frozen wizard tasks seeded to produce a flagged card, the agent's next proposal clears the flagged finding | ≥ 7/10 | CL |
| A7 | Template effect: 10 wizard lore entries per arm (rule on/off), second-model rating of "a model could play this entry without inventing its basics" | on ≥ off + 2 | CL |

Floors are informational and never retuned (rule 2).

## Gates by tier

- **D:** `npm run gates`; A1–A5; Storybook for `ProvisioningCard` with findings and a preview line; guide coverage test.
- **CL:** A6, A7 on Sol (the owner's subscription, no marginal cost), ×2.

## Privacy and spoiler notes

- Author-only surfaces. Templates keep secrets out of shared lore (the truth of a history entry goes in a member's own entry
  or drive, guide Part 2 item 16). No campaign content.

## Dependencies and links

- v2.8 09 (wizard assistant, tutorial), v2.8 34 (lorebook features), v2.8 11 (curator patches "Current state" paragraphs),
  v2.8 52 (codex places: player side; templates are model side).

## Decisions for the owner

1. **Refuse an agent card on a `blocks` finding, as the tutorial does?** **Recommended: yes.**
2. **Lore templates as guide + prompt rule (not a structured editor)?** **Recommended: yes.**
3. **`unconfirmed` as a third read-back outcome shown on the card?** **Recommended: yes.**

## Unresolved questions

- Should the activation preview also scan the campaign's checkpoint `world_info` toggles (a gated entry fires only on its
  path)? Proposed: show "gated: fires only on checkpoints …" from the gated set.
- Does the agent loop count a revision after card notes as a repeat (`REPEAT_LIMIT`)? Proposed: no, a changed op is not a repeat.
