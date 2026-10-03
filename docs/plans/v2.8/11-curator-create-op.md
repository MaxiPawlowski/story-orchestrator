# Plan 12 — Curator `create` op

**Status: SEED from v2.6, not approved.** Source: `docs/plans/v2.6/v2.7-seeds.md` row "Curator `create` op". Overview: `00-overview.md`.

## What it is

- The World Info curator can only `enable | disable | rewrite | patch` entries that already exist in the story's
  `stagecraft.lorebooks` allowlist (`src/stagecraft/types.ts:26-31`). Its prompt says "Never invent new entries"
  (`src/stagecraft/prompt.ts:53`).
- The seed adds a fifth op, `create`: the curator proposes a NEW keyed entry for a person, place, group or thing that
  play has established (named in the memory facts) and no entry covers yet.
- The gap it closes: an entity invented at the table has no keyword trigger, so it only reaches the prompt through
  the memory tiers' budget (`v2.3/10-judge-seeds.md:27-30`).
- Twice measured, twice below its predeclared "must not propose" floor of 1.00. Never built.

## History and evidence

| When | What | Result | Source |
|---|---|---|---|
| 2026-09-20 | Found live: a curator-scope book that ships empty gets `NONE` forever, because the curator cannot create | authoring rule: seed the book with entries play will change; new entities belong to memory, arcs, canon | user memory `story-authoring-traps` |
| v2.3 plan 10 | Seed written: create only in the allowlist, **review mode only**, only for an entity a live fact names, per-story `createCap` (default 5); Phase A floor 0.90 should-propose / 1.00 must-not-invent | design only | `v2.3/10-judge-seeds.md:27-30`, `:72-84` |
| v2.4 plan 06 | Full contract written (op shape, code refusals, near-dup trigram τ 0.85 as a warning, excluded from bulk accept, `createWIEntry` host write that never creates a book, rollback deletes under compare-and-set, `extras.stagecraft.created`, `createCap` in the Studio) | design only | `v2.4/06-steering-stagecraft.md:162-198`, overview X21 `v2.4/00-overview.md:452` |
| v2.4, 2026-09-25 | Phase A run 1: 22 cases (9 Spanish) × 3 samples, curator = memory profile on Artemis 31B | propose **1.000** (33/33), none **0.879** (29/33): **NOT BUILT**. Both misses `named-once` (n01 1/3, n07 3/3). Model alone created on 12.1% of none samples | `v2.4/06-steering-stagecraft.md:389-395` |
| v2.4 record | Observation: the code guard needs ≥ 1 live fact naming the entity, while the prompt and the labels say "at least twice". A ≥ 2-fact guard "would be a new contract measured against a fresh frozen fixture, not a retune of this one" | not acted on | `v2.4/06-steering-stagecraft.md:393` |
| v2.6 W25 / AS-16 | Spanish cases removed (13 left, below the declared minimum); 9 English cases added (p12–p15, n12–n16), labelled before any model answer; back to 22 (11/11) | fixture restored | `v2.6/15-judge-remeasure.md:14`, `v2.6/15-review-astra.md:53` |
| v2.6, 2026-10-01 | Phase A run 2 (English re-measure), curator = DeepSeek flash on the lane's role map, 22 × 3 | propose **0.909** (30/33, floor 0.90), none **0.788** (26/33, floor 1.00): **NOT BUILT**. Misses: p04 0/3 (no create), n01 0/3 and n12 0/3 (named-once, created), n16 missed 1 of 3 (roster case; recorded as "n16 2/3"). Model alone: proposeCreated 0.909, noneCreated 0.212 | `v2.6/15-judge-remeasure.md:73`, `:98`, `:167-169` |

What the v2.6 misses are (read from `test/goldens/live/curator-create/{p04,n01,n12,n16}.json`, synthetic fixture, no
campaign data):

- **n01, n12:** the model created an entry for a name that only one fact mentions, and said in its `[why]` line that
  the name was "named twice".
- **n16:** labelled `roster`. In 1 of 3 samples the model created an entry for a different, non-roster entity that one
  fact mentions. This is the same named-once failure.
- **p04:** the model patched an existing related entry with the new entity instead of creating one, 3 of 3 times.
  That is a defensible answer that the label counts as a miss.

**Offline replay check (mine, 2026-10-03, not a measurement).** I re-scored the 66 recorded v2.6 samples with a Python
copy of `validateCreate`'s matching (`plain`/`mentions`, `src/stagecraft/createCandidate.ts:59-87`) and counted the
facts that name each create card:

- **Guard "≥ 2 facts name the title or any of its keys":** refuses n01 and n16 but still admits n12, because the n12
  card's generic second key matches two facts.
- **Guard "≥ 2 facts name the title or its first key":** refuses all 7 none-misses and keeps all 30 propose passes.
  On these goldens that would read none 1.00, propose 0.909.

This is post-hoc on the same goldens, so it is exactly the retune the v2.4 record forbids. It only says which
contract is worth a fresh fixture.

Usage context from the v2.6 sessions (my scan of the gitignored `test/sessions/T*/*/journal.jsonl`, 49 sessions,
2026-10-01..03): the existing curator made **241** proposals and only **2** were applied (review mode; autonomous
sessions rarely approve). Curator review is an author-view surface (`StagecraftPanel`, Scheduler tab).

## Why it was deferred

- The v2.4 and v2.6 runs both missed the predeclared none floor (1.00). The rule is "below floor means it stays
  unbuilt" (`v2.6/15-judge-remeasure.md:98`), and floors are never retuned (`.claude/rules/architecture.md`, spike invariant).
- A fix that changes the guard (≥ 2 facts) is a new contract and needs a new frozen fixture (`v2.4/06-steering-stagecraft.md:393`).
- Nothing in play asked for it. The authoring rule routes new entities to memory, arcs and canon (`story-authoring-traps`).

## Current state in code

| Piece | Where | State |
|---|---|---|
| Curator ops | `src/stagecraft/types.ts:26-31` | no `create` kind |
| Curator prompt | `src/stagecraft/prompt.ts:53` | "Never invent new entries" |
| Candidate prompt, parser, code guards (allowlist, existing title, empty keys, cast-name key, cast title, ≥ 1 fact names it, near-dup 0.85) | `src/stagecraft/createCandidate.ts` | built, **dev-only** (`src/runtime/devOnly.guard.test.ts:10`), not wired into the coordinator. The prompt is built by string replacement on the base prompt, so editing those base sentences silently disables it (`v2.6/15-prompts.md:137`) |
| Live suite | `src/runtime/liveSuite.ts:127` (`runCuratorCreate`), `scripts/debug/so-curator-suite.mts` | built |
| Fixture | `test/fixtures/curator-create/cases.json` | 22 cases (11/11), floors 0.90 / 1.00, 3 samples, labels frozen |
| Goldens | `test/goldens/live/curator-create/*.json` (22) | v2.6 DeepSeek run, replayed in jest (`createCandidate.test.ts`) |
| Host write `createWIEntry`, revert-by-delete, `extras.stagecraft.created`, `createCap` | — | not built |
| Settings | `src/runtime/settingsModel.ts:158` | curator on, accept mode `review` (default) |
| Memory mirror | `src/runtime/memoryMirror.ts:66-67` | mirrors **relationship** rows only into the per-chat book, keyed by `entities`. It is the one existing path from play-established facts to keyword-triggered lore |

## Options

| | Design | Cost | Risk | Needs |
|---|---|---|---|---|
| **A. Build the v2.4 contract as is** | ≥ 1 fact guard | small build | measured below floor twice; blocked by the rule | a retune, which the rule forbids |
| **B. New contract: ≥ 2 distinct facts** | Guard: the title, or a proper-name key (first key), is named in ≥ 2 distinct live facts. Prompt sentence unchanged. Rest of the v2.4 contract kept (review only, `createCap` 5, no bulk accept, compare-and-set delete on rollback, never creates a book). | fresh fixture of ≥ 22 cases with new ids, including a generic-key trap like n12 and a roster case with a named-once bystander like n16; 22 × 3 = 66 curator calls; then the F5 build (host write, ledger field in `stripGlobalSettings`, mutations, Storybook `CreateCardNearDup`, J8 positive-then-negative checks) | the "first key" choice is a heuristic; p04-style patch answers keep propose near 0.90 | Phase A on the shipped curator route; build only past floor |
| **C. No curator: extend the memory mirror** | mirror entity facts (not only relationship rows) into the per-chat mirror book, keyed by entities | small; no new LLM call | the mirror book is per chat, not the story's book, so the author's curated lore is not extended. Changes what fires every turn (scan budget) | a measurement of WI budget pressure; touches the mirror invariant |
| **D. Drop it** | close the seed; keep `createCandidate.ts` + fixture as a dev instrument, or delete them | none | none; the gap stays covered by the facts tier injection | user decision |

## Recommendation

**Hold B behind a playtest finding, and do D in the meantime.**

- Value is narrow. A create card waits for an author's review, and in 49 sessions 2 of 241 curator proposals were
  ever applied. A player-only user never sees the cards.
- The memory facts tier already carries established entities into every prompt.
- If a session shows a play-invented recurring entity being forgotten (a `14-findings`-style row), run B. B is the only
  shape that can pass without a retune, and the replay above suggests the ≥ 2-fact guard is where the misses are.

## Decisions for the user

1. Build a curator `create` op at all in v2.7? **Recommended: not now.** Re-open on a playtest finding. Yes, i do want this feature, but lets be mindful, in order to add value, it should be properly made and tested. I would have its own model selctor, maybe people want to use a cloud model for it. Or something like opencode
2. If yes, contract: ≥ 2 distinct facts naming the title or its first key (B), measured on a new frozen fixture?
   **Recommended: yes (B).** A is forbidden and C is a different feature. B
3. Floors: keep propose ≥ 0.90, none = 1.00, 3 samples? **Recommended: keep** (predeclared since v2.3; never retuned). keep
4. Which model to measure on: the shipped curator route at run time (DeepSeek flash today, `v2.6/15-prompts.md:5`),
   re-measured if plan 10 switches models? **Recommended: yes.** sure
5. Keep review-only + `createCap` 5 + no bulk accept + delete-on-rollback under compare-and-set (X21)?
   **Recommended: keep.** keep
6. Meanwhile, keep `createCandidate.ts`, the fixture and `so-curator-suite` as a dev instrument? **Recommended: keep**
   (cheap, drift-tested by the jest replay). keep

## Floor and measurement before building

- New fixture `test/fixtures/curator-create/` revision 2: ≥ 22 cases, ≥ 10 per label, new ids (p16+, n17+), English
  only (W25), labels frozen before any model answer. Negatives must include: named once, named once with a generic
  second key, roster member, roster case with a named-once bystander, covered, near-dup, nothing new.
- Run `node scripts/debug/so-curator-suite.mts run --expect-count <n> --record` on a lane, with a run header captured
  and diffed. 66+ curator calls (cost: DeepSeek, no TypeSafe).
- Floors (predeclared, carried): propose ≥ 0.90 of samples, none = **1.00** of samples, end to end after code guards.
  Model-alone rates reported, not scored.
- Below floor → recorded, not built, no retune.
- After a build: the J8 create checks in order. The positive comes first (an entity established in play gets a card,
  is reviewed, written and fires: the activation proof). Then the negatives (unestablished name, `createCap`, `auto`
  never creates). A run whose positive never fires is `blocked` (`v2.3/10-judge-seeds.md:80-84`).

## Gates

- Fixture/guard only: `npm run typecheck && npm run lint && npm test` (jest replay of the goldens).
- Build (stagecraft coordinator, host write, Studio `createCap`): `npm run gates`, plus the curator live gate: J8
  create checks ×2 on a lane, `so-assets assert-clean`, and a run-header diff. Real model (no `debugResponse`).
- Ownership census rows for the new host write, a fault-matrix cell for the created-entry revert, and the F5 mutations
  (`v2.4/06-steering-stagecraft.md:264-267`).

## Links

- 16 spike defers, 14 J7 judge ideas (a judge could filter create cards instead of the LLM curator: not proposed here),
  10 model choice (re-measure on a model switch), 11 warden-lore one request (the other curator/warden seed).
- Others: 04 story presence/plays index, 19 quests/game layer, 18 character life, 25 new game plus, 08 SP2, 22 SP9,
  20 J6d shadow record, 13 B10 CLI judge, 21 cue+scene read merge, 09 C4 option b, 07 commitment double negatives,
  23 D6/T22 revisits, 06 thinking per story, 15 open-source Jev alternative.
