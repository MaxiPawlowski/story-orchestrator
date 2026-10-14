# Plan 45 — New Game+

**Status: v2.8, owner 2026-10-14, not built.** Moved here from `docs/plans/v2.9/03-new-game-plus.md` (owner
2026-10-14: roleplay mechanics move into v2.8). That plan's history and options are kept; this one restates them on
master `211d8d96`. Overview: `00-overview.md` §Rules (this folder).
**Gate tiers** (v2.8 rule 7): implementation **D**; acceptance **D** for the carry, **CL** + **LT** for the
"Previously…" block (deferred with the rest of model acceptance, owner 2026-10-12).

## What it is

- When a story ends (a `final` chapter seals), how it ended can carry into a new run: a **declared sequel** story, or
  a **fresh run** of the same story.
- Two things carry: **outcome keys** the author declares (typed blackboard values: who survived, which side the
  player took), written into the new run's start state; and the **sealed epilogue**, shown and injected as a short
  read-only "Previously…" block.
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
| Epilogue is held-secret safe | the seal input is the resting view, so the stored record and epilogue carry no held secret | `src/runtime/secretShared.review.test.ts:123` |
| Owner 2026-10-14 | plan it now, in v2.8, with outcome keys + epilogue as "Previously…", sequel or fresh run | this plan |

## Current state in code

| Piece | Where | State |
|---|---|---|
| `Chapter.final` | `src/engine/schema.ts:290` | schema |
| Start state of a run | `Checkpoint.state_snapshot`, `src/engine/schema.ts:234` | schema |
| Final seal: outcome snapshot | `blackboardAt` = whole blackboard minus quiet keys, `src/runtime/chapterSeal.ts:137` | on by default |
| Final seal: epilogue | `saga()` at `src/runtime/chapterSeal.ts:153`; prompt + verifier `src/memory/chapterRecord.ts:148-166` (`buildSagaPrompt`, `verifySaga`: ≥ 120 words, no names outside the records and cast) | on by default |
| Record shape | `ChapterRecord.final`, `.epilogue`, `.blackboardAt`, `src/memory/types.ts:58-82` | — |
| Player view | `ChapterView.ended/epilogue`, `src/runtime/chapters.ts:152-172`; "The End" section `src/runtime/narrative.ts:171` | on |
| Restart carry | `RestartCarry {features, overrides, journal, from}`, `src/runtime/extras.ts:401-418`; used by `restartStory()` `src/runtime/storySelection.ts:157-191`, which re-pins the **library** copy (`:184-186`) | journal + overrides only |
| Plays index | `PlayRow {storyId,title,groupId,checkpointName,chapterTitle,kind,updatedAt}`, `src/runtime/playsIndex.ts:5-13`: **no `ended` field**; written in `src/runtime/playsIndexHost.ts:60` | hint, never truth (v2.7 06 §A) |
| Reading another chat's blob | `playRowFromBlob`, `src/runtime/playsIndex.ts:84`, via the backfill reader `src/runtime/playsBackfill.ts:37-40` | built |
| Story-declared outcome / sequel link | none (`grep -rn "sequel\|carry_from\|outcome:" src/engine` = 0) | absent |

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Keep a seed** | wait for a live final chapter | 0 | none; owner asked to plan now |
| **B. Typed outcome carry** | source declares `outcome: [keys]`; target declares `carry_from {story, map, default}`; values written into the start state before boundary 0 | M: schema, validation, picker, one blob read | low: authored, typed, author-visible |
| **C. Epilogue as "Previously…"** | read-only block (player card + one injected prompt block, capped), **never facts** | M | block competes for prompt space; could steer toward retelling; needs CL/LT measurement |
| **C'. Epilogue as established facts** | epilogue lines stored as locked memory | M | established facts hold every contradicting claim (`isEstablished`, `src/memory/conflicts.ts:294`), freezing sequel memory. Rejected |
| **D. Fresh run of the same story** | B + C with `carry_from.story` = the story's own id, started in a **new** group chat | +S over B | none beyond B |
| **D'. In-place restart with carry** | extend `RestartCarry` | S | restart re-pins the library copy, so a carried key can vanish under an edit; same-chat messages contradict the reset |
| **E. Trophy shelf** | ended runs listed in Continue with ending chapter + milestones | S | by-product of `PlayRow.ended` |

## Recommendation

**B + C + D, new chat only; E as a by-product.**

1. **Schema** (`src/engine/schema.ts`): `NormalizedStoryV2.outcome?: string[]` (quality keys) and
   `carry_from?: { story: string; map: Record<string, string>; epilogue?: boolean; default: "snapshot" | "require" }`.
   `default: "snapshot"` starts with the target's own `state_snapshot` when no run is picked; `"require"` refuses the
   start until one is.
2. **Validation** (`src/engine/validate/*`, diagnostics with consequence lines per `DIAGNOSTIC_CONSEQUENCES`): unknown
   source or target key, type mismatch, an enum value the target does not declare, a mapped key not in the source's
   `outcome`, a `code`-sourced or life-key target. Source-side checks run when the source story is in the library;
   otherwise they run at pick time against the source chat's **pinned** story.
3. **Index hint**: `PlayRow.ended?: true`, set at the final seal. The picker lists ended runs of `carry_from.story`
   from the index, then reads the chosen chat's blob once (`playRowFromBlob` path) as truth: the final record's
   `blackboardAt` for the mapped keys, `epilogue` for C. A run whose blob has no `final` record is dropped silently from
   the list.
4. **Start**: the carry lands in the target chat as `extras.carry {fromChat, fromStory, sourceHash, values, epilogue}`
   and the mapped values are merged over the start checkpoint's `state_snapshot` before boundary 0. It is part of the
   engine history base, so rollback ≡ replay holds as for `state_snapshot`. Restart of the target chat keeps
   `extras.carry` (added to `RestartCarry`) and re-validates it against the re-pinned library copy; a key that no
   longer validates is dropped with an author journal row, never written.
5. **"Previously…"** (C): the player sees a card in the start pane (`#so-briefing`) with the epilogue text. One
   injected block (`INJECTION_REGISTRY`, new key) carries it, capped at 350 tokens (cut at a sentence), **until the
   target's first chapter seals**; after that the chapter records carry the story. Withheld from quiet/impersonate.
6. **Picker UI**: inside the Start entry point (v2.7 05 "Before you start"): "Carry over from a finished run" with run
   title, ending chapter player title, date. Nothing else.
7. Registry + Help entry (v2.8 rule 10), guide topics for `outcome` and `carry_from` (`guideCoverage.test.ts`),
   `npm run docs:guide`.

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| N1 | Carry ≡ authored snapshot | a target started with a carry equals the same target with those values authored in `state_snapshot`, after replay and after rollback to boundary 0: 100 % of ≥ 200 generated cases (property test) | D |
| N2 | Validation | every error class in §Recommendation 2 refused at import with a consequence line; one planted fixture per class; 0 misses | D |
| N3 | Picker truth | fixture of 10 chats (5 ended, 3 index-says-ended but blob not final, 2 other story): exactly the 5 offered | D |
| N4 | Edited source / target | key removed or retyped after the run: 0 silent writes; each skip journaled | D |
| N5 | Block lifecycle | dry-run payloads: block present at its registry key and depth before the first seal, absent after, absent on quiet/impersonate; ≤ 350 tokens | D |
| N6 | Held secret | player-visible output of picker, card and block byte-identical with and without a held secret in the source run | D |
| N7 | "Previously…" helps | blind A/B, 20 opening turns of a sequel with and without the block: carry preferred ≥ 60 %, 0 carried facts contradicted, 0 names outside epilogue + cast | CL rater, LT replies |

N7 needs two finished runs of a source story. Until a final chapter has run live, N7 is not runnable (recorded, not
red). C stays on by default regardless (v2.8 rule 9); the floor is informational.

## Gates by tier

- **D (implementation):** schema/validation/engine: `npm run typecheck && npm run lint && npm test` (+
  `typecheck:test`). Runtime/UI: + `npm run build` + no-LLM scenario on a lane: finish a short fixture story with a
  `final` chapter (`debugResponse` seal is plumbing only), start its sequel in a new group chat, pick the run, assert
  the start blackboard and the block in the dry-run payload. Storybook story for the picker and card. Plan close:
  `npm run gates`.
- **CL / LT (acceptance, deferred per owner 2026-10-12):** one real final seal on the 3090 (epilogue passes
  `verifySaga`), then N7.
- Spoiler checklist rows for the picker and card.

## Privacy and spoiler notes

- The epilogue is built from the resting view (`secretShared.review.test.ts:123`), so it carries no held secret into
  the sequel's shared block. N6 proves the player side.
- Outcome values land in the blackboard, not in prose. A key that encodes a secret reaches a prompt only where that
  quality already would.
- The picker shows only what the player saw: run title, ending chapter player title, date. Nothing about the sequel's
  graph.
- No Adolion content in fixtures; the fixture story is synthetic.

## Dependencies and links

- v2.7 06 §A plays index (the hint) and the Continue list (option E).
- v2.7 05 story briefing (start pane hosts the picker and card).
- v2.6 07 §D9 (final seal, saga record).
- v2.8 18 quests (quest state and milestones as outcome keys), v2.8 20 character life (relationship axes as outcome
  keys; life keys are excluded as targets in v1 because `deriveLife` recomputes them).
- v2.8 22 living director: `liv_` qualities are namespaced per run, so they are refused as outcome keys.
- v2.8 46 consequences recap: its end-of-story recap is a candidate second carried text (not in v1).

## Decisions for the owner

1. **Targets:** declared sequel and fresh run of the same story, both in a new group chat? **Recommended: yes; no
   in-place restart carry (D').**
2. **What carries:** outcome keys and the epilogue? **Recommended: both; the epilogue as a read-only block, never as
   facts (C' rejected).**
3. **How long the "Previously…" block stays:** **Recommended: until the target's first chapter seals.**
4. **Picker source:** plays index as a list, the chosen chat's blob as truth? **Recommended: yes; no install-wide
   legacy store (it would be a fourth state home).**
5. **Trophy shelf (E) in Continue:** **Recommended: yes, as the `ended` hint's by-product, no new data.**

## Unresolved questions

- Does adding `extras.carry` need a `BLOB_VERSION` bump? Expected no (optional slice in extras); verify against
  `persistence.ts` before building.
- Should a story be able to require a carry from **one of several** source stories (branching campaigns)? v1: one.
- Live-director stories with a generated `final`: carry works on authored keys only; is that enough?
