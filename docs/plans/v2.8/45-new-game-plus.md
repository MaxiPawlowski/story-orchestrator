# Plan 45 — New Game+

**Status: v2.8, owner 2026-10-14, not built. Revised 2026-10-14 against the Astra review (owner approved; §Review
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
