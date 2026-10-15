# Plan 45 — New Game+

**Status: v2.8, owner 2026-10-14; built 2026-10-15 on `v2.8-p45-carry` (not merged; §Gate record). Revised 2026-10-14 against the Astra review (owner approved; §Review
2026-10-14).** Moved here from `docs/plans/v2.9/03-new-game-plus.md` (owner 2026-10-14: roleplay mechanics move into
v2.8). That plan's history and options are kept; this one restates them on master `211d8d96`. Overview:
`00-overview.md` §Rules (this folder).
**Gate tiers** (v2.8 rule 7): implementation **D**; acceptance **D** for the carry, **CL** + **LT** for the
"Previously…" block (deferred with the rest of model acceptance, owner 2026-10-12).

## What it is

- When a story ends (a `final` chapter seals), how it ended can carry into a new run: a **declared sequel** story, or
  a **fresh replay** of the same story. The two have different semantics (§Sequel vs replay).
- Two things carry, both through an explicit **public carry projection** built at pick time:
  - **Outcome values** the author declares, each marked **legacy** (player-visible, shown on a legacy card, readable by
    target gates through legacy-only qualities) or **state** (written into the sequel's start state), plus which target
    members **know** it.
  - A short read-only **"Previously…"** text composed from player-visible material only. The stored epilogue is not
    copied as-is (§Current state: its input includes non-public values).
- Today the end is a dead end: nothing from one chat reaches another, and `restartStory()` keeps only the journal and
  chat overrides.
- Group chats only (v2.7 03): source and target runs are both group chats.

## History and evidence

| What | State | Citation |
|---|---|---|
| Seed and deferral | out of v2.6 07 scope; "nothing measured asks for it yet" | `docs/plans/v2.6/07-chapters-and-saga-memory.md:382-383` §D9, `:611-626` |
| v2.9 03 | deferred 2026-10-03; recommended "A now, B when built" because `seal` was off and no final chapter had run | `docs/plans/v2.9/03-new-game-plus.md` §Recommendation |
| Blocker 1: `seal` off | **gone.** Owner features-on rule 2026-10-09 (v2.8 rule 9); every chapter feature now defaults on | `src/runtime/chapters.ts:91-94` |
| Blocker 2: no live final chapter | still open: no session record mentions an epilogue (`grep -ril epilogue test/sessions` = 0 hits on `211d8d96`) | — |
| Epilogue in tests | `chapterSaga.test.ts:110` "the final seal writes the epilogue, ends the story, clears the bridge" | `src/runtime/chapterSaga.test.ts:110` |
| Seal input is resting-view | the **chapter records** are built from the resting view (`secretShared.review.test.ts:123`); the epilogue prompt additionally receives the whole outcome blackboard (below) | `src/runtime/secretShared.review.test.ts:123`; `src/runtime/chapterSeal.ts:137,306-311` |
| Owner 2026-10-14 | plan it now, in v2.8, with outcome keys + epilogue as "Previously…", sequel or fresh run | this plan |

## Current state in code

Re-checked on `3a716f2b` for the review.

| Piece | Where | State |
|---|---|---|
| `Chapter.final` | `src/engine/schema.ts:290` | schema |
| Start state of a run | `Checkpoint.state_snapshot`, `src/engine/schema.ts:234` | schema |
| Final seal: outcome snapshot | `blackboardAt` = whole blackboard minus quiet keys, `src/runtime/chapterSeal.ts:137` | on by default |
| Final seal: epilogue | `saga()` passes `blackboardAt` as FINAL STATE to the model (`src/runtime/chapterSeal.ts:153,306-311`; `buildSagaPrompt` `src/memory/chapterRecord.ts:148-159`) while filtering only the chapter records through the resting view; `verifySaga` checks ≥ 120 words and unfamiliar proper nouns (`:161-166`), not secret disclosure or accuracy | on by default; **not proven public** |
| Record shape | `ChapterRecord.final`, `.epilogue`, `.blackboardAt`, `src/memory/types.ts:58-82` | — |
| Player view | `ChapterView.ended/epilogue`, `src/runtime/chapters.ts:152-172`; "The End" section `src/runtime/narrative.ts:171` | on |
| Restart carry | `RestartCarry {features, overrides, journal, from}`, `src/runtime/extras.ts:401-418`; `restartStory()` re-pins the **library** copy (`src/runtime/storySelection.ts:184-186`) | journal + overrides only |
| Plays index | `PlayRow {storyId,title,groupId,checkpointName,chapterTitle,kind,updatedAt}`, `src/runtime/playsIndex.ts:5-13`: **no `ended` field** | hint, never truth (v2.7 06 §A) |
| Reading another chat's blob | `playRowFromBlob`, `src/runtime/playsIndex.ts:84-95`: a lightweight index projection (title, checkpoint, chapter), **not a carry validator** | built |
| Story-declared outcome / sequel link | none (`grep -rn "sequel\|carry_from\|outcome:" src/engine` = 0) | absent |

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Keep a seed** | wait for a live final chapter | 0 | none; owner asked to plan now |
| **B. Typed outcome carry** | source declares `outcome`; target declares `carry_from` with per-key `as: legacy | state` and `known_by`; values projected, pinned and written before boundary 0 | M: schema, validation, projection, picker, blob read | low: authored, typed, author-visible |
| **C. Public "Previously…"** | read-only text **composed from the public carry projection** (authored legacy lines, ending chapter player title, player-visible chapter lines), capped, bounded lifetime, **never facts** | M | block competes for prompt space; needs CL/LT measurement |
| C₀. Stored epilogue as-is | copy `ChapterRecord.epilogue` | S | **refused**: its input carries non-public outcome values |
| **C'. Epilogue as established facts** | epilogue lines stored as locked memory | M | freezes sequel memory (`isEstablished`, `src/memory/conflicts.ts:294`). Rejected |
| **D. Replay of the same story** | B + C with `carry_from.story` = own id, new group chat, **legacy-only or authored replay mappings** | +S over B | needs authored mappings so a carried "done" never skips the story being replayed |
| **D'. In-place restart with carry** | extend `RestartCarry` | S | restart re-pins the library copy; same-chat messages contradict the reset. Rejected |
| **E. Trophy shelf** | ended runs listed in Continue with ending chapter + player-safe milestones | S + index repair | needs `ended` kept correct and a milestone projection |

## Recommendation

**B first, then a public, bounded C; D only with authored replay mappings; E as a small separate UI item. New chat
only.**

1. **Schema** (`src/engine/schema.ts`):
   - Source: `outcome?: [{ key, legacy_text?: Record<value, string> }]` (quality keys; `legacy_text` per value is the
     authored player-facing line, defaulting to the quality's `player_labels`).
   - Target: `carry_from?: { story, mode: "sequel" | "replay", map: [{ from, to, as: "legacy" | "state",
     known_by?: [rosterId] | "all" | "none" }], previously?: boolean, default: "snapshot" | "require" }`.
   - `as: "legacy"` writes a target **legacy-only quality** (`legacy_` namespace, writer `code` at start only, never
     written by extraction or effects); gates may read it; it never stands in for in-world progress. `as: "state"`
     writes an ordinary target quality.
   - `known_by` decides which target members get a private-block line about the carried value (default `"none"`);
     source-public does not mean every sequel character knows it.
2. **Sequel vs replay:** in `mode: "replay"` only `as: "legacy"` entries are allowed unless the target authors an
   explicit `replay_map` entry naming a non-progress quality; mapping into any key read by a transition, quest or
   milestone gate of the target as progress is refused at validation. In `mode: "sequel"`, `as: "state"` is allowed.
3. **Public carry projection** (pure, `src/runtime/carryProjection.ts`): from the source's pinned final record take
   only the mapped keys, render each value through `legacy_text`/`player_labels`, add the ending chapter's player title,
   and the chapter records' player-visible lines as `playerProjection` would show them. Unmapped keys, quiet keys,
   `code`-sourced keys, secret milestones and hidden checks never enter. The projection is the only input to C, the
   legacy card and the picker.
4. **Saga input fix (source side):** `saga()` gets the public projection of the outcome (declared `outcome` keys
   through `player_labels`) instead of the whole `blackboardAt`; stories without `outcome` pass no FINAL STATE. This
   makes the existing "The End" epilogue public too; C still never copies it.
5. **Validation** (`src/engine/validate/*`, diagnostics with consequence lines): unknown source or target key, type
   mismatch, enum value not declared by the target, mapped key not in the source's `outcome`, `code`-sourced or life
   target key, replay mapping into a progress key, `known_by` naming a member outside the target roster. Source-side
   checks run at import when the source story is in the library, else at pick time against the source chat's
   **pinned** story; the record says which.
6. **Picker: verified before offered.** The index lists candidate chats of `carry_from.story` with `ended`; the picker
   reads up to 20 newest candidate blobs and runs a carry validator (`carryCandidateFromBlob`: pinned story id and
   hash, a `final` record, every mapped key present and valid) before listing a run. Unverified candidates are not
   shown. `PlayRow.ended` is set at the final seal and **cleared** when a rollback crosses the final seal or the source
   restarts.
7. **Pinned source snapshot:** at target creation `extras.carry {fromChat, fromStory, sourceStoryHash,
   projection, values, knownBy, createdAt}` stores a detached copy. Later source edits, rollbacks or deletion never
   change it. Target restart keeps `extras.carry` (added to `RestartCarry`) and re-validates it against the target's
   re-pinned copy; a key that no longer validates is dropped with an author journal row.
8. **Start:** `as: "state"` values merge over the start checkpoint's `state_snapshot` and `legacy_` values are written
   before boundary 0, as part of the engine history base (rollback ≡ replay as for `state_snapshot`). `known_by`
   lines enter those members' private blocks.
9. **"Previously…" (C), bounded:** a start-pane card (`#so-briefing`) and one injected block (new registry key),
   capped at 350 tokens (sentence cut), present until the **first** of: the target's first chapter seal, 12 committed
   boundaries, or the player dismissing the card. Chapterless stories and failed seals are covered by the boundary
   bound. Withheld from quiet/impersonate.
10. **E (separate item):** trophy shelf in Continue listing verified ended runs with ending chapter player title and
    earned non-secret milestones from the same projection.
11. Registry + Help entry (v2.8 rule 10), guide topics for `outcome` and `carry_from` (`guideCoverage.test.ts`),
    `npm run docs:guide`.

## Predeclared floors

N1–N7 first written 2026-10-14; N2/N3/N5/N7 revised and N8–N13 added by the review (none run).

| # | Condition | Floor | Tier |
|---|---|---|---|
| N1 | Carry ≡ authored snapshot | a target started with a carry equals the same target with those values authored in `state_snapshot` (+ `legacy_` keys), after replay and after rollback to boundary 0: 100 % of ≥ 200 generated cases (property test) | D |
| N2 | Validation | every error class in §Recommendation 5 refused with a consequence line, at import when the source is in the library and at pick time otherwise; one planted fixture per class and per timing; 0 misses | D |
| N3 | Picker truth | fixture of 10 chats (5 ended and valid, 3 index-says-ended but blob not final, 1 final but missing a mapped key, 1 other story): exactly the 5 offered, all verified before listing | D |
| N4 | Edited source / target | key removed or retyped after the run: 0 silent writes; each skip journaled | D |
| N5 | Block lifecycle | dry-run payloads: block present before the first bound, absent after a first seal, after 12 boundaries in a chapterless story, after a failed seal + 12 boundaries, after dismiss, and on quiet/impersonate; ≤ 350 tokens | D |
| N6 | Held secret | player-visible output of picker, card, legacy card and block byte-identical with and without a held secret in the source run | D |
| N7 | "Previously…" helps | blind A/B, 20 opening turns of a sequel with and without the block: carry preferred ≥ 60 %, 0 carried facts contradicted, 0 names outside the projection + the target's authorized opening context (start checkpoint briefing, cast, start places' player names) | CL rater, LT replies |
| N8 | Public projection | property over generated source states with planted hidden outcomes (unmapped keys, quiet keys, secret milestones, hidden checks, non-public values): 0 such keys, values or labels in the projection, card, block or saga input | D |
| N9 | Changed roster | target roster differs from source (members added, removed, renamed): `known_by` lines only to named present members; 0 lines to others; 0 refusals for legacy-only keys | D |
| N10 | Replay semantics | replay carry writes 0 target progress keys; every planted progress mapping refused | D |
| N11 | Pinned snapshot | source story edited, source chat rolled back or deleted after target creation: target carry and block byte-identical | D |
| N12 | `ended` hint | rollback across the final seal and source restart clear `ended`; 0 stale offers | D |
| N13 | Saga input | the saga prompt holds only declared-outcome public labels; planted secret value absent (golden) | D |

N7 needs two finished runs of a source story. Until a final chapter has run live, N7 is not runnable (recorded, not
red). C stays on by default regardless (v2.8 rule 9); the floor is informational.

## Gates by tier

- **D (implementation):** schema/validation/engine/projection: `npm run typecheck && npm run lint && npm test` (+
  `typecheck:test`). Runtime/UI: + `npm run build` + no-LLM scenario on a lane: finish a short fixture story with a
  `final` chapter (`debugResponse` seal is plumbing only), start its sequel in a new group chat with a changed roster,
  pick the run, assert the start blackboard, `legacy_` keys, `known_by` lines and the block in the dry-run payload.
  Integration case **carry × changed roster**. Storybook stories for the picker, legacy card and "Previously…" card.
  Plan close: `npm run gates`.
- **CL / LT (acceptance, deferred per owner 2026-10-12):** one real final seal on the 3090 (epilogue passes
  `verifySaga` and N13), then N7.
- Spoiler checklist rows for the picker, legacy card and "Previously…" card.

## Privacy and spoiler notes

- The carry is a public projection (N8); the stored epilogue is never copied. Held secrets are excluded by the resting
  view and by the projection's declared-keys-only rule.
- `as: "state"` values land in the blackboard, not in prose. A key that encodes a secret reaches a prompt only where
  that quality already would; `known_by` defaults to nobody.
- The picker shows only what the player saw: run title, ending chapter player title, date.
- No Adolion content in fixtures; the fixture story is synthetic.

## Dependencies and links

- v2.7 06 §A plays index (the hint) and the Continue list (option E).
- v2.7 05 story briefing (start pane hosts the picker and cards).
- v2.6 07 §D9 (final seal, saga record).
- v2.8 18 quests, v2.8 20 character life (relationship axes as outcome keys; life keys excluded as targets because
  `deriveLife` recomputes them).
- v2.8 22 living director: `liv_` qualities are namespaced per run, refused as outcome keys.
- v2.8 46 consequences recap: an end-of-story recap is a candidate second carried text (not in v1).
- v2.8 52 codex: a legacy card could later become a codex page.

## Decisions for the owner

1. **Targets:** declared sequel and replay of the same story, both in a new group chat, with distinct semantics?
   **Recommended: yes; replay carries legacy-only values unless authored replay mappings exist; no in-place restart
   carry (D').**
2. **What carries:** declared outcome keys through a public projection, each `legacy` or `state`, with `known_by`?
   **Recommended: yes; `known_by` defaults to nobody.**
3. **"Previously…" source:** compose from the public projection; never copy the stored epilogue. **Recommended: yes;
   also fix the saga input (step 4).**
4. **How long the block stays:** **Recommended: first of first seal, 12 boundaries, or dismiss.**
5. **Picker contract:** verify candidates before offering (up to 20). **Recommended: yes; no install-wide legacy
   store.**
6. **Trophy shelf (E):** **Recommended: yes, as a separate small item after B, with `ended` repair and a milestone
   projection.**

## Unresolved questions

- Does adding `extras.carry` need a `BLOB_VERSION` bump? Expected no (optional slice in extras); verify against
  `persistence.ts` before building.
- Should a story be able to require a carry from **one of several** source stories (branching campaigns)? v1: one.
- Live-director stories with a generated `final`: carry works on authored keys only; is that enough?
- Whether 20 verified candidates is enough on installs with many finished runs (paging later if not).

## Review 2026-10-14 (Astra)

Source: `review-astra-2026-10-14.md` §Plans 42-47 (45). Verified on `3a716f2b`.

- **P0 — epilogue secret safety unproven.** Accepted. Verified: `saga()` passes the whole `blackboardAt`
  (`chapterSeal.ts:137,306-311`), `verifySaga` checks length and names only (`chapterRecord.ts:161-166`). → C₀
  refused; public carry projection (step 3, N8); saga input fixed to declared public labels (step 4, N13).
- **P1 — blackboard placement is not an audience policy.** Accepted. → per-key `legacy | state` and `known_by`
  (default nobody); legacy-only `legacy_` qualities; N9 changed-roster test.
- **P1 — picker contradicts N3.** Accepted. Verified `playRowFromBlob` is an index projection (`playsIndex.ts:84-95`).
  → verified-before-offered with a carry validator (step 6), N3 extended; `ended` cleared on rollback/restart (N12).
- **P1 — sequel vs replay semantics; pinned source.** Accepted. → `mode`, replay limited to legacy or authored
  mappings, progress mappings refused (N10); detached pinned snapshot (step 7, N11); validation against the pinned
  source.
- **P2 — lifecycle and floor edge cases.** Accepted. → bounded lifetime (step 9, N5); N2 split by timing; N7 checks
  the target's authorized opening context.
- **Recommendation (B, then public bounded C; D only with mappings; E separate).** Adopted.
- Rebutted: none.


## Gate record

Built 2026-10-14/15 on branch `v2.8-p45-carry` (base master `cc38c5b1`, then merged with master `7a74fecc` (plan 50) and
`0279441d` (plans 50/51, image fixes)): B + bounded C + D with authored replay mappings, the revised design and every
recommended decision (owner: "yes to all from your recommendations"). E (trophy shelf) is a separate queue row (M45e), as
recommended. Not merged, not pushed.

What was built

- Schema (`engine/carrySchema.ts`, imported directly, not re-exported from `gameSchema.ts`, so it stays out of the main entry;
  the fields join `StoryV2` by module augmentation because schema.ts is at its file budget): source `outcome [{key,
  heritage_text}]`; target `carry_from {story, mode sequel|replay, map [{from, to, as heritage|state, known_by}], replay_map,
  previously, default snapshot|require}`.
- Validation (`engine/validate/carry.ts`, game layer, one `readCarry` call from `parseStoryV2`): every §5 class refused with a
  consequence clause. Outcome keys are authored qualities, a quest's `quest_<id>_closed` or a faction's `rep_<id>` (plan 53's
  real standing key), never code, tension or `liv_`. `heritage_*` qualities must be `source: "code"`, carried into, and never
  written by a `state_snapshot` or reward. Replay ⇔ own id; a replay `state` entry needs `replay_map`; a `replay_map` key read by
  any transition, quest or milestone gate is refused. Pair checks (`checkCarryPair`) run at library import when the source is
  in the library (`importCarryErrors`, "…cannot carry from it until that is fixed") and at pick time against the run's pinned
  copy ("this run is not offered").
- Public projection (`engine/carry.ts` `publicOutcome`, `runtime/carryCandidate.ts`): mapped declared keys only, each through
  `heritage_text`, `player_labels` or its `display` label; a quest only while visible (title + done/failed word); a faction
  only while visible (band word); the run's chapter `short` lines through that run's held secrets (`heldSecrets` +
  `withoutSecretLines` over the blob's epistemic rows). The stored epilogue is never read.
- Saga input fix (`chapterSeal.saga`, `buildSagaPrompt`): the epilogue gets `sagaOutcomeLines` (declared public labels,
  resting-filtered) under "HOW IT ENDED", and no end state for a story without `outcome`; the whole-blackboard FINAL STATE is gone.
- Picker verified before offered (`carryUnit.carryCandidates`, lazy): plays-index rows of `carry_from.story` marked `ended`,
  newest 20, not the open chat; each blob is read (`readGroupChatMetadata`) and verified (`carryCandidateFromBlob`: stamped
  `BLOB_VERSION`, chat id, the story's record, a pinned copy that parses, a `final` record, pair checks, every mapped key
  present) before it is listed. `PlayRow.ended` is derived from a final chapter record at each index sync (`PlaysPort.ended`),
  so a rollback that unseals the final chapter or a restart clears it; `playRowFromBlob` reads it for backfilled rows.
- Pinned snapshot: a pick writes a detached `extras.carry {fromChat, fromStory, sourceStoryHash, mode, projection, values
  [{from, key, as, value, label, knownBy}], previously, block, createdAt, dismissed?}`; a declined start stores `{declined, at}`.
  No `BLOB_VERSION` bump (optional extras slice). `RestartCarry.carry` keeps it; restart re-validates against the re-pinned story
  (`startSeed`): a value that no longer fits is dropped and journaled ("carried value dropped: <key>").
- Start: `StoryEngine.loadStory(story, seed)` applies the values before boundary 0, so they are part of the history base
  (rollback ≡ replay); `runtimeManager.loadStory` seeds on activate (not on hydrate); a pick at boundary 0 reseeds.
  `heritage_*` keys get a `ROLLBACK_DETECTORS` entry `heritage` (SC1). No SC2 step is occupied: nothing is written at a boundary.
- `known_by` (default nobody): one private line per named member ("- From an earlier story, you know: <label>") through the
  memory injector's private source, so `withoutSecretLines` applies; disclosure to the player writes no member knowledge (SC3).
  Members are re-resolved against the current roster on every seed.
- "Previously…": composed at pick time from the projection (ending title, heritage lines, newest chapter lines), cut at a
  sentence to 350 tokens including its header; injected per loud generation as `INJECTION_REGISTRY.previously` (depth 4) through
  the away-notice helper, withheld from quiet/impersonate; live until the first of: first target seal, 12 committed boundaries,
  Dismiss. Shown in the start pane and on the drawer Overview card with Dismiss (`#so-carry-dismiss`).
- UI (lazy): `components/carry/CarryPane.tsx` (picker `#so-carry-picker`, Start fresh unless `require`, a refusal line in player
  words, the reason journaled), `CarryCard.tsx` (`#so-carry-legacy`: heritage lines, Previously, Dismiss); the start pane opens
  for a pending carry at boundary 0. Stories: `CarryPane.stories.tsx` (Picker, NoRuns, Required, Replay, Refused, Picked),
  `CarryCard.stories.tsx` (LegacyAndPreviously, PreviouslyEnded, NoLegacyLines, Phone).
- Feature `new-game-plus` (Help → drawer Overview), guide topics `outcome` and `carry-from` (`copilot/guideTopicsCarry.ts`;
  guideTopics.ts is at budget), doc sections, `npm run docs:guide`, `npm run docs:settings`, Studio Chapters tab guide,
  architecture.md bullet, census rows (`ownership-sites.json`), error-copy row, arrival golden re-recorded.

Floors (D, jest; all green)

- N1 `engine/carryRollback.property.test.ts`: 200 generated cases, carried start ≡ the same start authored as a seed, after
  random replay, after a reload (hydrate) and after rollback to boundary 0.
- N2 `engine/carry.test.ts`: 11 local classes at import + 4 pair classes at both timings (import, pick) + wrong source id; 0 misses.
- N3 `runtime/carryCandidate.test.ts`: 10 chats (5 valid, 3 index-ended but not final, 1 final missing a mapped key, 1 other
  story): exactly the 5 offered; cap 20, the open chat and non-ended rows never listed.
- N4 `engine/carry.test.ts`, `runtime/carryPort.test.ts`: removed / retyped / enum-narrowed keys dropped with a reason,
  journaled, 0 writes.
- N5 `runtime/carryPort.test.ts`, `carryCandidate.test.ts`: present at boundaries 0–11, absent at 12, after a first seal,
  chapterless at 12, after dismiss, on quiet/impersonate; block ≤ 350 tokens. Dry-run payload on a lane: owed (below).
- N6: picker row, card, heritage lines and Previously byte-identical with and without a live held secret in the source run; a
  chapter line restating it is dropped.
- N8: 400 random endings (unmapped, quiet, unlabelled, hidden quest/faction values) → 0 in projection or saga lines; blob control.
- N9: changed roster (one member removed, one added): lines only to named present members, `all` = current roster, 0 refusals.
- N10: replay carries heritage only; 4 planted progress/replay mappings refused; 0 progress keys written.
- N11: source blob edited, rolled back and deleted after the pick: pinned state byte-identical.
- N12 `carryCandidate.test.ts`, `playsIndexHost.test.ts`: `ended` set, then cleared when the final record goes; blob rows read it.
- N13 golden: the saga prompt holds declared public labels only; the planted secret value is absent; no outcome → no end state.

Gates (worktree `C:\dev\so-p45-carry`)

- `npm run gates:quick` (pre-merge): typecheck, typecheck:test, lint (changed), jest related (7,087 passed) green;
  `defect replay (--cached)` red with an empty `jest --listTests` error, the fresh-worktree tooling failure plan 53 recorded
  (no cache, command line too long). The full replay below is green.
- `npm run gates -- --jobs=2 --no-storybook` before the master merges: all green in 426.7 s (test 8,725 passed, 1 skipped).
- `npm run gates -- --jobs=2 --no-storybook` on the final merged commit: all green in 419.0 s on `c7f29cd5`: test (8,893 passed, 1 skipped), build, test:debug, test:replay, typecheck, typecheck:test, lint,
  debug:typecheck, test:release, test:plugin. An intermediate run on the merge was red on the manager line budget (702 of 700 after
  master reached 700) and one line over 200 characters; fixed by calling the start seed through `extras.ts`.
- Storybook (gates hardcode port 6006): `npm run storybook:build`, `http-server .sb-static -p 6245` + test-runner
  `--url http://127.0.0.1:6245 --maxWorkers 2`: 147 suites, 882 tests passed on `c7f29cd5` (an earlier pre-merge run: 146 suites, 872 tests).
- Main bundle `dist/index.js` 1,299,804 B on `c7f29cd5` (master 1,296,940; +2,864; budget 1,300,000; 196 B left). Main holds
  only doors: `carryPort.ts` (snapshot slice and seed calls into the game layer, the lazy action proxy, type augmentations), the
  plays `ended` field, the import pair-check call, the `readCarry` call, the engine seed loop, the `heritage` detector, the
  restart carry and the injection key. Validation, projection, picker, UI, view and seed logic ride the game-layer, carry-unit,
  chapter-seal and component chunks.

Deviations

- `legacy` is renamed `heritage` (`as: "heritage"`, `heritage_` keys, `heritage_text`): `legacyFree.guard.test.ts` refuses the
  word anywhere in `src/` (closed baseline, v2.5 plan 11).
- No `carry-required` check (built, then removed for the main bundle): with `default: "require"` the start pane offers no
  "Start fresh"; a story started without a run plays from its own start.
- N1's comparison is the engine's own start seed with the values authored directly: master never applies `state_snapshot` at
  start (confirmed by the review), so "authored in `state_snapshot`" has no runtime meaning to compare with.
- Heritage values are authored target qualities (`source: "code"`), not compiled: the target needs the type at validation and
  the source may be absent at import.
- Codex facts (52) do not carry: `codex_*` latches are refused as outcome keys (a latch boundary means nothing in another
  chat). Standing (53) carries through its real key `rep_<id>` as its band word, into a heritage key or an ordinary target
  quality, never into the target's `rep_*` (code). Story time (50) is not carried: `story_time` is code-written and owned by the
  target's own clock; left out of v1.
- A value whose ending was not shown to the player is skipped (the run is still offered); a missing mapped key hides the run.
- No Studio editor or wizard tool for `outcome` / `carry_from` (JSON + guide only).
- Restart keeps the pinned run; picking a different run needs a new chat.

Owed

- Live gate NOT green: no isolated ST copy was staged from this branch. Coordinator to run after the merge on a no-model lane:
  finish a short fixture story with a `final` chapter (`debugResponse` seal is plumbing only), open a new group chat on its
  sequel with a changed roster, pick the run in the start pane, assert the `heritage_*` and state keys on the start blackboard,
  the `known_by` line in the named member's applied private block only, the Previously block in the dry-run payload; swipe,
  reopen, `so-ui.mts assert-player-clean`; payload goldens. Fixtures to reuse: `test/fixtures/carry-source.story.json`,
  `carry-sequel.story.json`.
- N7 (CL rater, LT replies): not runnable until two finished runs of a source story exist; recorded, not red.
- One real final seal on the 3090 (epilogue passes `verifySaga` and N13 live).
- Spoiler checklist rows for picker, heritage card and Previously card; plan 24 matrix row.
- Adolion: not changed; whether the campaign declares `outcome`/`carry_from` is the owner's call (content review by another model).
- E (trophy shelf) → M45e.
- Main-entry headroom is 196 B after this plan: the next plan that touches the main entry needs a trim first.

Unresolved questions

- Should a sequel be able to seed its own faction standing (`rep_*` start) or story time from a carried value? Not in v1.
- Carry from one of several source stories (branching campaigns)? v1: one.
- Live-director stories with a generated `final`: carry works on authored keys only.
- Are 20 verified candidates enough on large installs (paging later)?
