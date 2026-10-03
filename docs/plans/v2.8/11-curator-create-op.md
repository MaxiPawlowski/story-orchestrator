# Plan 11 — Curator `create` op

**Status (2026-10-03): v2.8 plan 11 (was v2.7 plan 12). Decided: build contract B, review-only, with its own model
selector (the "Lore creation" role). Not built; fixture revision 2 not frozen; no measurement run.**
Source: `docs/plans/v2.6/v2.7-seeds.md` row "Curator `create` op". Overview: `00-overview.md`.
**Gate tiers** (00-overview §Gate taxonomy): implementation D; acceptance CL (frozen-fixture runs and the J8 create
checks on the cloud curator route; no pod).

## What it is

- The World Info curator can only `enable | disable | rewrite | patch` entries that already exist in the story's
  `stagecraft.lorebooks` allowlist (`src/stagecraft/types.ts:24-30`). Its prompt says "Never invent new entries"
  (`src/stagecraft/prompt.ts:53`).
- This plan adds a fifth op, `create`: the curator proposes a NEW keyed entry for a person, place, group or thing that
  play has established (named in ≥ 2 distinct live memory facts, contract B) and no entry covers yet.
- The gap it closes: an entity invented at the table has no keyword trigger, so it only reaches the prompt through
  the memory tiers' budget (`v2.3/10-judge-seeds.md:27-30`).
- The old v2.4 contract (≥ 1 fact) was measured twice below its predeclared "must not propose" floor of 1.00. It is not
  retuned; contract B is a new contract on a new frozen fixture.

**Stagecraft invariant (unchanged, `.claude/rules/architecture.md`):** a create is a **proposal only**. It is applied
at a boundary through the effects path, after the author accepts it. Its write scope is the story's authored
`stagecraft.lorebooks`, minus every `stagecraft.exclude` entry (v2.7 02 C10) and every checkpoint-gated entry,
re-checked at the write edge (`isCuratorWritable`, `src/stagecraft/scope.ts:34`). A create never creates a book
(`createWIEntry` writes into a listed book only; `ensureLorebook` is never called).

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
| v2.7, 2026-10-03 | User: "Yes, i do want this feature … properly made and tested", with its own model selector (cloud model or a harness like opencode); contract B; floors kept | decided | Decisions below; v2.7 14 research §4 (Lore-creation role) |

What the v2.6 misses are (read from `test/goldens/live/curator-create/{p04,n01,n12,n16}.json`, synthetic fixture, no
campaign data):

- **n01, n12:** the model created an entry for a name that only one fact mentions, and said in its `[why]` line that
  the name was "named twice".
- **n16:** labelled `roster`. In 1 of 3 samples the model created an entry for a different, non-roster entity that one
  fact mentions. This is the same named-once failure.
- **p04:** the model patched an existing related entry with the new entity instead of creating one, 3 of 3 times.
  That is a defensible answer that the label counts as a miss.

**Offline replay check (2026-10-03, not a measurement).** I re-scored the 66 recorded v2.6 samples with a Python
copy of `validateCreate`'s matching (`plain`/`mentions`, `src/stagecraft/createCandidate.ts:62-87`) and counted the
facts that name each create card:

- **Guard "≥ 2 facts name the title or any of its keys":** refuses n01 and n16 but still admits n12, because the n12
  card's generic second key matches two facts.
- **Guard "≥ 2 facts name the title or its first key":** refuses all 7 none-misses and keeps all 30 propose passes.
  On these goldens that would read none 1.00, propose 0.909.

This is post-hoc on the same goldens, so it is exactly the retune the v2.4 record forbids. It only chose which
contract gets a fresh fixture (B).

Usage context from the v2.6 sessions (scan of the gitignored `test/sessions/T*/*/journal.jsonl`, 49 sessions,
2026-10-01..03): the existing curator made **241** proposals and only **2** were applied (review mode; autonomous
sessions rarely approve). Curator review is an author-view surface (`StagecraftPanel`, Scheduler tab).

## Why it was deferred before (history)

- The v2.4 and v2.6 runs both missed the predeclared none floor (1.00). Below floor means unbuilt
  (`v2.6/15-judge-remeasure.md:98`), and floors are never retuned (v2.8 rule 2).
- A guard change (≥ 2 facts) is a new contract and needs a new frozen fixture (`v2.4/06-steering-stagecraft.md:393`).
  That is what this plan now schedules.

## Current state in code

| Piece | Where | State |
|---|---|---|
| Curator ops | `src/stagecraft/types.ts:24-30` | no `create` kind |
| Curator prompt | `src/stagecraft/prompt.ts:53` | "Never invent new entries" |
| Candidate prompt, parser, code guards (allowlist, existing title, empty keys, cast-name key, cast title, ≥ 1 fact names it, near-dup 0.85) | `src/stagecraft/createCandidate.ts` | built, **dev-only** (`src/runtime/devOnly.guard.test.ts:10`), not wired into the coordinator. The prompt is built by string replacement on the base prompt, so editing those base sentences silently disables it (`v2.6/15-prompts.md:137`) |
| Curator scope | `src/stagecraft/scope.ts:21-34` | allowlist minus checkpoint-gated minus `stagecraft.exclude` (v2.7 02 C10), checked at the write edge |
| Live suite | `src/runtime/liveSuite.ts:51,81` (`runCuratorCreate`), `scripts/debug/so-curator-suite.mts` | built |
| Fixture | `test/fixtures/curator-create/cases.json` | revision 1: 22 cases (11/11), floors 0.90 / 1.00, 3 samples, labels frozen |
| Goldens | `test/goldens/live/curator-create/*.json` (22) | v2.6 DeepSeek run, replayed in jest (`createCandidate.test.ts`) |
| Pass roles | `src/extraction/passRole.ts:1` | six roles; no `lore` role. Create would ride `curator` today |
| Host write `createWIEntry`, revert-by-delete, `extras.stagecraft.created`, `createCap` | — | not built |
| Settings | `src/runtime/settingsModel.ts:173` | curator on, accept mode `review` (default) |
| Memory mirror | `src/runtime/memoryMirror.ts:66-67` | mirrors **relationship** rows only into the per-chat book, keyed by `entities` |

## Options

| | Design | Verdict |
|---|---|---|
| **B. New contract: ≥ 2 distinct facts** | Guard: the title, or a proper-name key (first key), is named in ≥ 2 distinct live facts. Prompt sentence unchanged. Rest of the v2.4 contract kept (review only, `createCap` 5, no bulk accept, compare-and-set delete on rollback, never creates a book) | **chosen** (user, decision 2) |

Rejected: A (build the ≥ 1-fact v2.4 contract; measured below floor twice, needs a forbidden retune); C (extend the
memory mirror; a different feature, does not extend the author's book); D (drop; the user wants the feature).

## Recommendation

**Superseded by the user's answers.** The original recommendation ("hold B behind a playtest finding, do D meanwhile")
is replaced by: **B built, review-only (every create waits for the author), with a Lore-creation role selector.**
Sequence:

1. **Contract B in code, still dev-only.** `validateCreate` gains the ≥ 2-distinct-fact guard on the title or first
   key. Jest only; the existing goldens replay (and must still refuse the seven v2.6 none-misses).
2. **Lore-creation role (its own model selector).** A seventh pass role `lore` ("Lore creation") in `PASS_ROLES`,
   default "same as curator". Its picker is the v2.7 14 role picker (profiles grouped by source, cloud vs local
   labelled; harness routes as built, opencode only, W27). Any route kind the role map supports is selectable: a
   Connection Manager profile (any CC source, e.g. DeepSeek, Claude, GPT) or a harness route (opencode).
3. **Eligibility (B1).** The create op runs only on a route with a **passing eligibility row** keyed
   `route model × contract (create-B) × fixture revision (2)`. The model is the profile's resolved model id (CC
   `model` field) or the harness id + model. The selector lists every route but marks unmeasured ones "not measured"
   and the runtime refuses them before any call (journaled reason, no curator create call sent). A **route change
   invalidates eligibility**: repointing the profile to another model, picking another profile, or a fixture revision
   bump makes the row not match, and creates stop until that route is measured. Same shape as the judge's readiness
   rows (`src/judge/readiness.ts`, provider × model × use, bound to `JUDGE_FIXTURE_REVISION`).
4. **Freeze fixture revision 2, then measure (CL).** On the route the user picks first (DeepSeek flash, the shipped
   curator route today, `v2.6/15-prompts.md:5`). Floors below, run ×2 (v2.8 rule 9).
5. **Conditional build.** Only past floor ×2: the op enters the coordinator behind an install-wide
   `stagecraft.createEnabled` switch, **off by default** (v2.8 rule 9), review mode only (`auto` never creates).
   Below floor: recorded, not built, no retune; the dev instrument stays.
6. Each further route the user wants (a Claude or GPT profile, an opencode model) gets its own run ×2 and its own row
   before the selector accepts it.

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

(Decision 4's "plan 10" is v2.7 12 model choice. Its answer now reads per route: the first row is measured on the
shipped curator route; any other model needs its own row, step 6.)

## Floor and measurement before building

- New fixture `test/fixtures/curator-create/` **revision 2**: ≥ 22 cases, ≥ 10 per label, new ids (p16+, n17+),
  English only (W25), synthetic (no Adolion text), labels frozen and the file hashed before any model answer.
  Negatives must include: named once, named once with a generic second key (n12-style), roster member, roster case
  with a named-once bystander (n16-style), covered, near-dup, nothing new, and an entity whose only matching entry is
  in a `stagecraft.exclude` row or a checkpoint-gated entry (must not be recreated beside it).
- Run `node scripts/debug/so-curator-suite.mts run --expect-count <n> --record` on a lane with the Lore-creation role
  set to the route under test, a run header captured and diffed (`profiles.urls` included). Two runs, page reloaded
  between them: 2 × 66+ curator calls (DeepSeek, no TypeSafe, no pod).
- Floors (predeclared, carried): propose ≥ 0.90 of samples, none = **1.00** of samples, end to end after code guards,
  in **both** runs. Model-alone rates reported, not scored.
- Pass ×2 → an eligibility row (route model × create-B × revision 2) with run ids. Below floor → recorded, not built,
  no retune.
- After a build: the J8 create checks in order. The positive comes first (an entity established in play gets a card,
  is reviewed, written at the next boundary and fires: the activation proof). Then the negatives (unestablished name,
  `createCap`, `auto` never creates, an excluded/gated title is refused at the write edge, an unmeasured route is
  refused before any call). A run whose positive never fires is `blocked` (`v2.3/10-judge-seeds.md:80-84`).

## Gates

- Contract B guard, role, eligibility table (no wiring): `npm run typecheck && npm run lint && npm test` (jest replay
  of the revision-1 goldens; eligibility tests: an unmeasured route, a repointed profile and a stale fixture revision
  are each refused, with a mutant that skips the check going red).
- Build (stagecraft coordinator, host write, Studio `createCap`, role picker row, `stagecraft.createEnabled`):
  `npm run gates`; ownership census rows for the new host write; a fault-matrix cell for the created-entry revert;
  the F5 mutations (`v2.4/06-steering-stagecraft.md:264-267`); Storybook `CreateCardNearDup` and the Lore-creation
  picker row (interaction + a11y).
- Stagecraft guards: `architecture.test.ts` keeps `StagecraftCoordinator` free of engine/memory deps (the fact count
  reaches it through an injected read); bulk accept never reaches a create (jest); rollback deletes a created entry
  only under compare-and-set (jest + fault-matrix cell).
- Acceptance (CL): fixture revision 2 ×2 at floor on the measured route; then the curator live gate: J8 create checks
  ×2 on a lane in a **group chat**, with the curator and the main reply on cloud profiles (no `debugResponse`, no
  pod), `so-assets assert-clean`, and a run-header diff.
- Registered in the v2.7 01 feature registry + Help (registry test) (B10); the switch ships off by default (v2.8 rule 9).
- Author-view only: no player-visible surface (v2.8 rule 4 not engaged); `so-ui assert-player-clean` covers the new
  `[data-so]` selectors.

## Links

- v2.7 14 B10 CLI judge (the role picker and the Lore-creation role decision this plan builds on; W27 kept)
- v2.7 12 model choice (a model switch needs a new eligibility row for that route)
- v2.7 02 C10 (`stagecraft.exclude`, the scope a create must respect)
- v2.7 13 warden-lore one request (the other curator/warden seed)
- v2.8 13 J7 judge ideas (a judge could filter create cards instead of the LLM curator: not proposed here)

## Review 2026-10-03

- **F01:** status line rewritten (decided, not built, fixture not frozen).
- **F03:** the frozen-fixture measurement and the conditional build of B are scheduled (Recommendation steps 1–6,
  Floor); the Lore-creation role from the v2.7 14 research is in the implementation (step 2) and the gate contract.
- **B1:** eligibility keyed route model × contract × fixture revision; unmeasured routes refused before any call; a
  route change or revision bump invalidates (step 3, Gates).
- **"Recommendation should read B built, review-only, with a Lore-creation role selector":** done; the old
  recommendation is marked superseded.
- Stagecraft invariant restated (proposal only, boundary-applied, scope = `stagecraft.lorebooks` minus
  `stagecraft.exclude` and gated entries).
- Also: line refs touched re-verified (`types.ts:24-30`, `liveSuite.ts:51,81`, `settingsModel.ts:173`,
  `createCandidate.ts:62-87`); measurements ×2 per v2.8 rule 9; registry gate (B10); references version-qualified.
