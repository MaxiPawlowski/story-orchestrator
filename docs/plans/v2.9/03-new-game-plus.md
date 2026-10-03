# Plan 03 — New game plus

**Status: DEFERRED to v2.9 (user, 2026-10-03).** Was v2.7 plan 25; moved at the version split
(`docs/plans/v2.7/RENUMBER.md`). Not scheduled until v2.8 closes. Source: `docs/plans/v2.6/v2.7-seeds.md` row "New game
plus". Overview: `00-overview.md` (this folder).

## What it is

When a story reaches its end, something of how it ended carries into a new run: a sequel story, or a fresh run of the
same story. "Something" is open. It could be a few typed outcome values (who survived, which side the player took),
the written epilogue as a "previously" text, or both. Today the end of a story is a dead end: nothing that happened in
one chat can reach another chat, and `restartStory()` wipes everything but the journal. Stories run in group chats only
(v2.7 03), so every run, source and sequel, is a group chat.

## History and evidence

| What | State | Citation |
|---|---|---|
| Seed decision | "v2.7 seed. Out of scope here, and nothing measured asks for it yet." Recorded twice (the review table is duplicated) | `docs/plans/v2.6/07-chapters-and-saga-memory.md:611-626` §Resolved 2026-09-30 |
| Original deferral | "A future 'new game plus' that carries a saga record into a new story is out of scope" | `v2.6/07-chapters-and-saga-memory.md:382-383` §D9 |
| Story end (v2.6 G6) | v2.6 added `Chapter.final`; sealing a final chapter writes a **saga record**: a 400–700-word epilogue from every chapter record's SUMMARY + CONSEQUENCES plus the final blackboard, verified for invented names, then the pipeline reads `complete` and the Overview shows "The End" | `v2.6/07-chapters-and-saga-memory.md:368-381` §D9; `src/memory/chapterRecord.ts:148-166` (`buildSagaPrompt`, `verifySaga`); `src/runtime/chapterSeal.ts:135,151` |
| What the "outcome" is today | `blackboardAt` = the whole blackboard at the seal, minus quiet keys. The saga prompt is told never to quote a key or value. No story declares which keys are its outcome | `src/runtime/chapterSeal.ts:135`; `chapterRecord.ts:151` |
| Where it lives | per chat only: `extras.memory.chapters` (the final record carries `epilogue`), read back as `ChapterView.ended/epilogue` | `src/runtime/types.ts:319`; `src/runtime/chapters.ts:152-171` |
| Export | `/story chronicle export` and a drawer button write Markdown (chapter titles, summaries, saga record) to the clipboard | `v2.6/07-chapters-and-saga-memory.md:378-381` |
| Restart carry | `restartStory()` already carries a small `RestartCarry`: chat overrides, the journal, and a "from" label. Nothing of the story state | `src/runtime/extras.ts:379-393`; `src/runtime/storySelection.ts:142-176` |
| Built, but off | every chapter feature ships OFF until the Q-M floors pass: `seal`, `storySoFar`, `fold`, `archiveRecall`, `eraSeals`, `foldEras` (recap on) | `src/runtime/chapters.ts:91-94`; `v2.6/07-chapters-and-saga-memory.md:637` §Gate record |
| Measured live | Q-M blind pairs: **1 of 20** exist, 0 rated (`test/sessions/rating-pack/Q-M/status.json`). The v2.6 T2 sessions exercised a chapter seal (and found a HIGH: a seal written "without a written summary", fixed, `docs/plans/v2.6/14-findings.md:348`). **No session reached a final chapter, so the saga epilogue has never run live.** Searched every `test/sessions/*/SUMMARY.md` and `v2.6/14-findings.md` for "epilogue"/"saga record": 0 hits | as cited |
| Campaign shape | The Adolion lab imports nine stories (`adolion-fresh`, `.claude/rules/debug-scripts.md`), one of them a single-graph saga with a `final` chapter (v2.6 07 §The saga's shape). So the lab has both shapes NG+ could serve: separate stories that follow each other, and one long saga | `v2.6/07-chapters-and-saga-memory.md:24-37,455-466` |

Verdict so far: the machinery that produces an outcome (final seal + epilogue) exists in code and unit tests
(`runtime/chapterSaga.test.ts` "endings" ×2) but is off by default and unmeasured live. Nothing downstream consumes it.
Q-M5 and the owed Q-M ratings are owned by v2.8 01 (review D10).

## Why it was deferred

- Out of v2.6 plan 07's scope (memory at saga length), and no player, session or measurement asked for it (v2.6 07 §Resolved).
- Its input does not exist in practice yet: the epilogue only appears when `seal` is on and a final chapter is reached,
  and neither has happened live.
- User 2026-10-03: deferred to the next version; at the split it landed in v2.9.

## Current state in code

Verified on master `c7967323`.

| Piece | File | On/off |
|---|---|---|
| `Chapter.final`, `chapter-no-exit`/`story-dead-end` diagnostics | `src/engine/schema.ts:236-243`; `studio/chapterDiagnostics.ts` | schema, always |
| Saga epilogue at the final seal | `src/runtime/chapterSeal.ts:151` | runs only with `memory.chapters.seal` on (default off) |
| `ended` view, pipeline `complete`, scheduler skip | `src/runtime/chapters.ts:152-171` | follows the seal |
| Start state of a run | `Checkpoint.state_snapshot` on the start checkpoint | `src/engine/schema.ts:205` |
| Restart carry | `src/runtime/extras.ts:379-393` | journal + overrides only |
| Chat → story index | the plays index, a **hint, never truth**: v2.7 06 §A | v2.7 (in build) |
| Reading another chat's metadata | one request per chat file (`withMetadata`) | host fact H3 in `docs/plans/v2.7/06-story-presence-ui.md:21` |

Nothing named "carry", "sequel" or "new game" exists in `src/` (grep).

## Options

**A. Drop it / keep it a seed.** Wait until a playthrough reaches a final chapter with `seal` on and a player asks for
it. Cost 0. Risk: none now; the design can still change if the epilogue proves weak.

**B. Typed outcome carry into a declared sequel (deterministic, no model call).**
- The source story declares `outcome: [<quality key>…]` (which keys are its result). The sequel declares
  `carry_from: { story: "<id>", map: { "<source key>": "<sequel key>" }, default: "<what to do when no run is picked>" }`.
- Starting the sequel in a new group chat offers the finished runs of the source story (listed from the plays index,
  v2.7 06 §A; the chosen chat's real `chat_metadata` is read once, because the index is only a hint). The mapped values
  are written into the start state before the first boundary. With none picked, the sequel's own `state_snapshot` stands.
- Rollback ≡ replay holds: the carry is part of the start state, like `state_snapshot`.
- Validation: unknown keys, type mismatches and enum values the sequel does not declare are errors at import, with
  consequence lines (the diagnostics rule).
- Cost: schema + validation + one picker in the Start entry point (inside v2.7 05's "Before you start" modal) + one host
  read. Medium. Risk: low; the carried values are authored-typed and visible to the author.

**C. Narrative carry ("previously, in another life").** The chosen run's epilogue (or chronicle) is injected into the
new run as a read-only, player-safe block, or as established facts.
- Cost: medium. Risk: higher. Established facts hold any contradicting claim (`isEstablished`, gotchas "A new claim
  that lands on an ESTABLISHED fact is held"), so a long epilogue as facts could freeze a sequel's memory. As a plain
  block it competes for prompt space and can steer the model toward re-telling. Needs a measurement.

**D. Same-story NG+ (restart with something kept).** Extend `RestartCarry` with the outcome keys (or a counter such as
`run_number`) so a restart of the same story starts changed. Cost: low. Risk: restart also re-pins the latest library
version (`storySelection.ts:142-143`), so a carried key can disappear under an edit; semantics ("which run wins?") are
unclear for a branching story.

**E. Cross-chat trophy shelf only.** Record per finished run: title, ending chapter title, epilogue, milestones
(v2.8 18 Q4). Show it in the Continue list (v2.8 04, old v2.7 04 C1). Nothing flows into a new run. Cost: low once
the plays index and the Continue list exist.

## Recommendation

**A now, B when it is built.** Nothing here can be judged until one real run reaches a final chapter with `seal` on and
the Q-M floors decide whether the seal ships at all; building a consumer for an output that has never run live is
backwards. When a final chapter has been reached live, build **B**: it is deterministic, needs no model call or floor
of its own, keeps rollback ≡ replay, and is how a campaign split into stories (the Adolion lab's shape) would actually
use it. Add E as a by-product once v2.8 04's Continue list is built. C only behind its own measurement.

## Decisions for the user

**User 2026-10-03: deferred to the next version.** Kept as a seed; nothing built in v2.7.

1. Keep NG+ a seed until a playthrough reaches a final chapter with `seal` on? **Recommended: yes.**
2. What does "outcome" mean? (a) typed outcome keys the author declares; (b) the epilogue text; (c) both.
   **Recommended: (a) first;** the epilogue stays a display, not an input.
3. Target: a declared sequel story, the same story restarted, or both? **Recommended: declared sequel only.**
4. Where does the picker read the finished run from? (a) the plays index (plan 04) as a list, then the chosen chat's own
   metadata as truth; (b) a new install-wide "legacy" store written at the final seal. **Recommended: (a);** (b) adds a
   fourth home for state and breaks the three-lifetimes rule (`.claude/rules/architecture.md` §Invariants).
5. A trophy shelf (option E) in the Continue list? **Recommended: only if plan 04 C1 is built; decide there.**

(Answer above kept verbatim; "next version" = this v2.9 plan. In 4 and 5, "plan 04" = the plays index, v2.7 06 §A, and
"plan 04 C1" = the Continue list, now v2.8 04. The user chose to build all eight C-items, so 5 is decided when v2.8 04
closes.)

## Floor and measurement before building

- Precondition, not a floor: the Q-M floors (v2.6 07 §Quality measurement, Q-M1..Q-M8; ratings owned by v2.8 01) pass
  and `seal` ships on, or the author opts in; and one live run reaches a `final` chapter (J13.7 shape,
  `v2.6/07-chapters-and-saga-memory.md:602`).
- B: deterministic. Property test: a sequel started with a carry equals a sequel started with the same values authored
  in `state_snapshot` (replay + rollback); refusal cases for every validation error. No model floor.
- C (only if chosen): predeclared blind A/B, 20 opening turns of a sequel with and without the carried block, carry
  preferred ≥ 60 % and 0 carried facts contradicted or invented in the 20 (rater reads the epilogue). Data needed: two
  finished runs of a source story, which do not exist yet.

## Gates

- Schema/validation/engine start state: `npm run typecheck && npm run lint && npm test` (pure tier).
- Picker, host read, Start entry point: + `npm run build` + live gate via the `debug` skill (two group chats: finish a
  short fixture story with a `final` chapter, start its sequel in a new group chat, pick the run, assert the start
  blackboard).
- Plan close: `npm run gates`. Spoiler checklist rows for anything player-visible (the picker lists only titles and
  ending chapter names the player has already seen). Registry + Help entry (v2.7 01) for the feature (review B10).

## Links

- v2.7 06 §A plays index: the list of finished runs. v2.8 04: the Continue list hosts option E.
- v2.7 05 story briefing ("Before you start" modal): where B's picker would sit.
- v2.8 18 quests and game layer: Q4 milestones are the natural trophy content; quest state could be outcome keys.
- v2.8 20 character life: relationship axes are qualities, so they could be outcome keys (carry a bond into the sequel).
- v2.8 13 J7 (canon verification could check a carried epilogue).
- v2.8 22 living story director: generated anchors would need to be stable across runs before a sequel carries keys
  from them.

## Review 2026-10-03

Applied from `docs/plans/v2.7/review-2026-10-03.md` (old numbers there): **C10** (marked deferred), **F07** (not active
work), **D10** (Q-M owner = v2.8 01), **B10** (registry + Help gate), **B12** (version-qualified v2.6 refs), **F36**
(cross-refs to new numbers), line refs rechecked (`storySelection.ts:142-176`, `types.ts:319`, `chapterSeal.ts:135,151`).
Group-only per v2.7 03.
