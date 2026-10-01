# Plan 07 — Chapters and saga memory: carry the arc across a story too long for one context

**Status: code parts BUILT 2026-09-30 on branch `worktree-agent-a819623fde6832ab2`, every feature off until the Q-M floors run (see Gate record). Q-M arms, the corpus transcript/needles, D10/D11 and the Studio editor are open.**

The user's request (2026-09-30), made while preparing to play the whole Adolion saga in one group chat:

> "we have a checkpoint system to make the story carry on, but, do we have something to carry the arc? should
> we? … Do we have any kind of compact mechanism or something when a saga end? should we?"

The follow-up asked for a v2.6 plan that is "as feature rich as possible, quality is the most important thing".

The answer from the code is **partly, and not at saga length**. Arcs, scene summaries and canon exist. None of
them know that a story has acts. Every store is capped by recency, so the first act is the first thing forgotten.
The one artifact that remembers the whole run, canon, never reaches the narrator's prompt. This plan adds
**chapters** as authored structure, a **seal** pass that turns a finished chapter into a durable record,
a **chronicle** that carries those records into every prompt at a fixed cost, and a **quality measurement** that
decides the defaults.

Citations were checked against master `544975fb` plus the working tree of 2026-09-30. Adolion citations are
relative to `C:\dev\adolion-campaign`.

## Why this is needed now: the measured gaps

### The saga's shape

`build/story/adolion-saga.story.json` (v10, `scripts/campaign/assemble.py:27`) is a single graph:

| Item | Count |
|---|---|
| Checkpoints | 157 (62 anchors) |
| Transitions | 269 |
| Qualities | 179 |
| Roster | 125 |
| Acts | 8, plus 7 board/downtime checkpoints between them (`assemble.py:323-375`) |

The authored target is about 690 turns (the sum of `target_turn_length`, 61–128 per act) before generated stubs.
The 2026-09-29 playtest reached checkpoint 1 of 157 in 15 messages (`v2.5/19-saga-integration-repair.md`). One chat
will therefore hold something like 1,500–3,000 messages across a full run.

### Gaps

| # | Gap | Evidence | Consequence at saga length |
|---|---|---|---|
| G1 | **Canon never reaches the narrator.** It is not an injection block. It reaches prompts only through the `{{story_canon}}` macro (`runtime/macros.ts:65`) and the copilot, expansion and stagecraft prompts. Open arcs are not injected either: they go only into the extraction contract (`memory/contract.ts:3-17`) and the injection score (`memoryInjector.ts:53`). | No Adolion card or story uses `{{story_canon}}` (grep of `campaign/`, `scripts/`, `build/`: 0 hits; `{{story_player_name}}` 475). | The narrator knows the past only through the four memory tiers and whatever raw chat still fits the context. The "arc" has no prompt presence at all. |
| G2 | **Every store forgets oldest-first.** Caps: facts 50, session_details 40, short_term 10, scene_history 30 (`memory/stores.ts:171-176`); resolved arcs 30, open arcs 40 (`memory/arcs.ts:7-8`); epistemic 80 / 12 per subject (`memory/epistemic.ts:7-8`). `capTier` keeps pinned rows plus the newest unpinned (`stores.ts:161-169`). | Pinning is the only escape. | By Act IV, Act I survives only in what the player pinned. |
| G3 | **Canon is rebuilt from scratch out of the survivors.** `regenerateCanon` feeds every resolved-arc summary plus 30 facts to one call capped at 1,536 output tokens (`runtime/canonSynthesis.ts:48-90`, `extraction/callBudget.ts:32`). | It runs after every arc-summary pass and every 10th boundary (`memoryCoordinator.ts:293,416`, `boundaryWork.ts:137-144`). | Once G2 drops an arc, the next regeneration erases it from canon too. Each rewrite also re-paraphrases old history ("telephone" drift), and a longer input must compress into the same output cap. |
| G4 | **Canon's fact input is the first 30 in store order, not the best 30.** `highImportanceFacts` does `filter(...).slice(0, limit)` (`memory/entities.ts:39-41`). | Store order is append order. | As the facts tier fills, new facts never reach canon. |
| G5 | **Stories have no structure above the checkpoint.** `Checkpoint` has no chapter, act or tag field (`engine/schema.ts:174-190`). Unknown checkpoint keys are dropped silently (`engine/validate/checkpoints.ts:206-246`). | Adolion's act entries and exits live only in build inputs (`assemble.py:33-37`, each act module's `SAGA` dict); nothing reaches the story JSON. | The runtime cannot tell an act ended, so nothing can compact at that moment. |
| G6 | **There is no end of story.** Nothing in the schema, validation or engine marks a terminal checkpoint. At a checkpoint with no exits the boundary still increments with `fired: null` (`engine/engine.ts:225,243-247`). | War's exit `war-the-crown-remembers` has no outgoing transitions. | After the finale the machine keeps reading and steering a story that is over. There is no epilogue, record or "complete" state. |
| G7 | **Old chat falls out of the prompt at an arbitrary cut.** ST fills history newest-first until the budget is spent and breaks at the first message that does not fit (`public/script.js:4902-4927`; CC `public/scripts/openai.js:948-950,1070-1074`). | Nothing replaces what fell out except G1's tiers. | The cut lands mid-scene. Prompt cost stays at the ceiling for the whole saga. |
| G8 | **The player's Overview never shows threads.** `openThreads: []` is hard-coded (`runtime/snapshotBuilder.ts:173`). | `/story threads` does list them (`runtime/slashCommands.ts:130-133`). | This is a defect independent of the saga; it is fixed here because chapters change what "open threads" means. |
| G9 | **`session` expiration never expires.** `expireScoped` has one caller, and it expires only `"scene"` (`memoryCoordinator.ts:169`, `stores.ts:117-119`). | — | Session rows compete with the current act's rows forever, until the cap evicts them oldest-first. |
| G10 | **Canon does not exist before the first arc summary.** `regenerateCanon` returns early without one (`canonSynthesis.ts:52-53`). | The player view shows `""` (`canonSynthesis.ts:44-46`). | A long first act can run with no story-so-far at all. |
| G11 | **Rollback history is 200 boundaries** (`engine.ts:79,246,291,428`). | — | This is acceptable, but it has to be stated: a seal older than the horizon cannot be undone by a mutation, and the plan must not promise otherwise. |

## Principles

These are the rules the design answers to, in priority order.

1. **Quality is measured, not asserted.** A default flips on only after it beats the no-seal baseline at a
   predeclared floor (§Quality measurement), in the plan-10 lore-ranking shape: floors declared first, both arms over
   the same rows, and never retuned after the run.
2. **Seal, don't delete.** A sealed row is folded into its chapter record (`foldedInto`, the existing field). It is
   never removed from the store. Rollback unfolds it, and the author can inspect it.
3. **Once sealed, a chapter's record is stable.** No later pass re-paraphrases it. The chronicle is assembled from
   records by code, not re-summarized by a model. Only the author, or an explicit re-seal, changes a record.
4. **Nothing leaves the prompt without a replacement in it.** Folding old messages out of context (D7) is allowed only
   while the chronicle block is being injected for this generation.
5. **Author structure first, heuristics second.** Authored chapters drive everything. Eras (D11) are the fallback for
   stories without chapters, and they are measured separately.
6. **Player copy stays player-safe.** Chapter titles use `player_title` and summaries use player-facing names. The
   spoiler checklist (`docs/plans/v2.1/test-plan.md`) gains every new surface.
7. **Existing invariants hold.** The engine stays pure. Coordinators do not import each other. Every async writer takes
   a `RunOwnership`. Every write that changes injected state refreshes the injection. Every derived artifact records
   its inputs and removals.

## Design

### D1 Chapters as authored structure

**Schema** (`engine/schema.ts`):

```ts
interface Chapter {
  id: string;
  title: string;                      // author-facing
  player_title?: string;              // player-facing; falls back to title
  kind?: "chapter" | "interlude";     // default "chapter"
  seal?: ChapterSealPolicy;
  final?: boolean;                    // D9: sealing this chapter ends the story
}
interface ChapterSealPolicy {
  open_threads?: "carry" | "close" | "decide";  // default "decide" (D3)
  keep_tail?: number;                           // D7: messages kept verbatim after the fold, default 6
  fold_messages?: boolean;                      // D7: default follows the install setting
  record_style?: "prose" | "chronicle";         // D2 voice, default "prose"
}
interface StoryV2 { chapters?: Chapter[]; /* … */ }
interface Checkpoint { chapter?: string; /* … */ }
```

**Rules:**

- `chapters` is a strict object list (`rejectUnknownKeys`, the `storyOptions.ts` pattern). `Checkpoint.chapter` must
  name a declared chapter.
- Once `chapters` is declared, every checkpoint must name one. A story without `chapters` has one implicit chapter,
  which never seals by authored rule (D11 covers it).
- **Membership is per checkpoint, not a list per chapter.** It is local, it survives graph edits, and it is what
  `assemble.py` knows when it writes each checkpoint.
- The normalized story gains `chapterById` and `chapterByCheckpoint` (`schema.ts:322-329` pattern). They are
  computed in `validate.ts`, so the engine stays pure.
- **Diagnostics** (`studio/diagnostics.ts`, each with a `DIAGNOSTIC_CONSEQUENCES` line):

  | Code | Meaning |
  |---|---|
  | `chapter-missing` | A checkpoint names no chapter while chapters are declared. |
  | `chapter-unknown` | A checkpoint names an undeclared chapter. |
  | `chapter-unreachable` | No checkpoint of the chapter is reachable from the start. |
  | `chapter-no-exit` | No transition leaves the chapter, and it is not `final`. |
  | `chapter-reentry` | A transition leads back into a chapter from a later one (D2 re-entry rule). |
  | `story-dead-end` | A checkpoint with no outgoing transitions that is not in a `final` chapter (G6). |

**Why not `start`/`exit` lists per chapter:** Adolion's own build shows why. Acts have a single entry but several
paths through them, a mid-act checkpoint can sit after the exit in array order (`acad-mid-year-ball`), and board slots
jump between acts. Membership plus "the active checkpoint left the chapter" is exact, while an authored exit list
goes stale.

### D2 The seal trigger and the seal pass

**Trigger** (pure, `runtime/chapters.ts`): `chapterExit(before, after, story)`. It returns the chapter that was left
when a boundary fired a transition whose `from` is in chapter A and whose `to` is not. It also fires on `/cp activate`
into another chapter, but only when the author confirms the seal; a manual jump is not evidence the chapter was
played.

- An **interlude** never seals on its own. Its rows seal with the next chapter that seals, as a prefix to that
  chapter's range. Adolion's board and downtime checkpoints are interludes, so "Board 2 → pass" does not produce a
  record of three messages.
- **Re-entry** into a sealed chapter opens a new part (`part: 2`). It seals again as a separate record, because the
  first record is stable (principle 3). `chapter-reentry` warns the author at authoring time.

**Pass** (boundary work entry `chapter-seal`, order 44: after `expansion-commit` at 42 and before `scene-detect` at
50, `boundaryWork.ts:31-145`). It runs as a scheduled priority-1 job, so the reply is never held back. The steps
below run in order under one `RunOwnership`, with a token check before every write:

1. **Close the open scene.** Run the scene-break pass over the chapter's unsummarized tail (`runSceneBreakPass`,
   `extractionCoordinator.ts:345-371`), reason `chapter`. Every range in the chapter then has a scene summary.
2. **Summarize the resolved arcs that have none** (`runArcSummaryPass`, `memoryCoordinator.ts:271-298`).
3. **Assemble the seal input** (pure, `memory/chapterInput.ts`):
   - scene summaries in range;
   - arc summaries of arcs opened or resolved in range;
   - facts and session details created in range (live, not superseded);
   - ledger rows changed in range;
   - the **blackboard diff** between the boundary that entered the chapter and the one that left it;
   - the visited checkpoints' `player_name` values;
   - the roster members active in the chapter;
   - the previous chapter record's `people` and `open` sections, for continuity.

   Each input carries its id, so the model can cite it.
4. **Write the record** (`memory/chapterRecord.ts` prompt + strict parser, the `canon.ts` pattern). It uses the
   input-budget map-reduce of `sceneSummary.ts:49-78` when the input exceeds one window. The output has labelled
   sections:

   | Section | Content | Who sees it |
   |---|---|---|
   | `SUMMARY` | 120–220 words, past tense, player-facing names | player + prompt |
   | `SHORT` | one or two sentences | player + prompt (compressed chronicle) |
   | `CONSEQUENCES` | bullets of durable change, each ending in `[src: id, id]` | prompt + author |
   | `PEOPLE` | one line per member who mattered: where they stand and toward whom | prompt (D8 dossiers) |
   | `OPEN` | one line per open arc: `carry` / `closed-offscreen` / `abandoned`, with a reason | author; `carry` rows stay open |

5. **Verify** (code first, judge second):
   - every `CONSEQUENCES` bullet cites at least one input id that exists;
   - every proper noun in `SUMMARY` and `CONSEQUENCES` appears in the inputs or the roster, which is a hallucination
     guard over the extractor's entity list (`memory/entities.ts`);
   - with `judge.uses.memoryVerify` on, each consequence is checked against its cited sources (`judge/`,
     read-only, as today).

   A failed check re-asks once with the failures listed. A second failure writes a **degraded** record: code-built
   from the arc summaries and scene summaries in range, `status: "degraded"`. It also raises a Repair row, "Chapter
   *X* was sealed without a written summary", which offers Re-seal.
6. **Fold** (D3), **re-derive the chronicle** (D4), refresh the injection, then persist. The fold, the chronicle
   rebuild and the injection refresh share one `commit()` (the "a write that changes injected state refreshes the
   injection" rule, `.claude/rules/gotchas.md`).
7. **Announce** (D6) and journal it: a new `JournalRecordKind` `chapter`, plus an inline-timeline item for plan 08.

**The record** (`extras.memory.chapters: ChapterRecord[]`):

```ts
interface ChapterRecord {
  id: string;                // `${chapterId}#${part}`
  chapterId: string;
  part: number;
  title: string; playerTitle: string;
  range: { from: number; to: number };          // message ids, interlude prefix included
  boundaries: { from: number; to: number };
  checkpoints: string[];                        // visited, in order
  summary: string; short: string;
  consequences: { text: string; sources: string[] }[];
  people: { rosterId: string; name: string; text: string }[];
  open: { arcId: string; text: string; disposition: "carry" | "closed-offscreen" | "abandoned" }[];
  blackboardDelta: Record<string, { from: unknown; to: unknown }>;
  status: "sealed" | "degraded" | "author-edited";
  provenance: Provenance;                        // source "code" | "author"; pass "chapterSeal"
  tokens: { summary: number; short: number };
  sealedAt: { boundary: number; messageId: number; at: number };
}
```

Records are not capped by recency. They are bounded by the number of chapters, with a hard cap of 64 and era merging
beyond that (D4). The Adolion saga yields 8 records.

### D3 Fold: what a seal takes out of the live stores

A seal marks rows `foldedInto: <recordId>`, a field every selector already honours (`inject.ts:35-42`,
`entities.ts:39-41`). It also writes one derived record, kind `chapter_seal`, with `inputs` = the folded row ids and
`removed` = nothing, because nothing is removed (`memory/derived.ts:9,18-33`).

| Store | Folded at seal | Kept live |
|---|---|---|
| `scene_history` | every row in range | none (the record replaces them) |
| `session_details` | every row in range (G9: this is where `session` expiration finally means something) | pinned, locked |
| `short_term` | all; `shortTermSummaryEnd` moves to the record's `range.to` | none |
| `facts` | importance 1 in range | importance ≥ 2, pinned, locked. Facts are the durable tier; D4's selector fixes their order |
| resolved arcs | every arc resolved in range (its summary is in the record) | pinned |
| open arcs | by disposition: `closed-offscreen`/`abandoned` resolve with `resolvedBy: recordId` | `carry`, tagged `originChapter` |
| epistemic | `[hiding]`/`[suspects]` rows whose subject and target both leave the roster at the next chapter's `cast_changes` | everything else. Knowledge persists; a member absent now may return in Act VIII |
| ledger | nothing; it is current state by construction | all |

The caps then act on the current chapter's rows. That is the direct fix for G2: with Act I folded into its record,
Act IV's 30 scene rows are Act IV's.

Open-thread disposition is set by `seal.open_threads`:

- `carry` keeps every open arc.
- `close` resolves every open arc as `closed-offscreen`.
- `decide` (the default) uses the record's `OPEN` section, and falls back to `carry` for any arc the model did not
  name. This is the only disposition a model decides, and a wrong answer is cheap: the arc stays readable in the
  record and the author can reopen it.

### D4 The chronicle: layered canon with a fixed budget

Canon splits into two parts with different lifetimes:

- **`chronicle`** (new, derived by code): the sealed records, rendered newest-last at a compression chosen by budget.
  1. Render every record's `SUMMARY`. If that exceeds `chronicleTokens` (default 700), render the oldest records as
     `SHORT` until it fits, keeping the most recent sealed chapter at `SUMMARY`.
  2. If it still does not fit (more than about 25 chapters), run an **era merge**: one model pass folds the oldest
     *k* `SHORT` lines into a single `era` line. The pass records a derived `era_merge` with `inputs` = those record
     ids, so rollback undoes it. Era merges only ever touch `SHORT` text, never `SUMMARY`.

  Because nothing re-paraphrases a sealed `SUMMARY`, the chronicle cannot drift (principle 3).
- **`canon`** (existing, `canonSynthesis.ts`): now scoped to the **current chapter**. Its inputs are the current
  chapter's resolved-arc summaries plus `selectCanonFacts` (below) plus the checkpoint. That keeps its input bounded,
  so the 1,536-token cap stops being a compression problem (G3). CURRENT STATE keeps its meaning.

**`selectCanonFacts`** replaces `highImportanceFacts` for canon (G4). It ranks by the existing injection score
(`memory/score.ts:18-30`, `:45-88`) with the checkpoint objective and the open arcs as context. It still filters
live, not superseded, not folded, importance ≥ 2. Pinned and locked rows go first. `highImportanceFacts` keeps its
other callers.

**G10:** until the first arc summary exists, `getCanonProse()` falls back to the current chapter's scene summaries
(player-safe prose), never to canon-lite.

### D5 Injection: the story-so-far block

A new registry entry, `storySoFar` → `story_orchestrator_story_so_far`, at depth 8. It is not scannable, because
chronicle proper nouns would otherwise trigger World Info for places the party left long ago. D10 is the deliberate,
bounded version of that recall. The block is:

```
[The story so far]
<chronicle, D4>

[This chapter: <player_title>]
<canon WHAT HAS HAPPENED + CURRENT STATE, current chapter only>

[Open threads]
- <up to 8 open arc texts, pinned first — openArcTexts(limit)>
```

- Depth 8 puts it above scene history (6) and the fact and guidance blocks (4). That is the "older things further
  up" order the existing depths already follow (`constants/injectionRegistry.ts:14-26`). The registry test gets the
  new key and its allowed depth collisions (none).
- It is written by `MemoryInjector.update()` (`runtime/memoryInjector.ts:73-112`) and budgeted by
  `selectWithinBudget` over three sub-blocks with their own token budgets (`storySoFarTokens`, default
  `{chronicle: 700, chapter: 500, threads: 150}`), stored install-wide beside `tierTokenBudgets`.
- **Mode**, per story: `memory.story_so_far: "block" | "macro" | "off"`, default `block`. `macro` is for authors who
  already place `{{story_canon}}` or the new `{{story_so_far}}` in a card; the block then stays empty, so the content
  never appears twice. Studio shows a warning when a story is in `block` mode and a roster card contains
  `{{story_canon}}` (read from the card text at authoring time, `stHost/characters`).
- `{{story_canon}}` keeps its meaning (full canon, falling back to canon-lite) for existing cards.

**The chapter bridge note.** On the first loud generation after a seal, a one-shot bridge rides depth 1:
*"The chapter <title> has ended: <SHORT>. A new chapter begins: <next chapter player_title>."* It follows the
continuity-warden note's lifecycle exactly (`runtime/generationLifecycle.ts`, OUTERMOST loud generation, applied only
on its own rendered reply, withdrawn by rollback). Without it, the first reply of a new act often narrates straight
past the change.

### D6 Player surfaces

- **Chapter title card.** At the sealing boundary a `/comment` note posts `◆ Chapter <n> — <player_title>` for the
  chapter being entered. It uses the transition-note path (`effectsApplier.ts:193-204`) with the same opt-out
  (`announceTransitions`) and the same ownership guard.
- **"Previously…" popup.** On the first open of a chat whose newest chapter was sealed since the player last saw it,
  a popup shows the sealed chapter's `SUMMARY` under its title. It reuses the away-recap popup machinery
  (`runtime/awayRecap.ts`, chat-scoped) and has its own setting, `display.chapterRecap` (default on).
- **Overview** (`runtime/narrative.ts:102-146`) gains a `chapters` section, "Your story": sealed chapters as
  `player_title` + `SHORT`, the current chapter marked. The section expands to `SUMMARY` on click.
  - `story` (the canon excerpt) becomes this chapter's prose.
  - G8 is fixed: `openThreads` is fed from `openArcs`, with `originChapter` shown as "(since *Chapter I*)".
- **`/story chapters`** lists the sealed chapters; **`/story chapter <n>`** shows one record's summary. Both are
  player-safe.
- **HUD** (`HudStrip.tsx`): the checkpoint chip is prefixed with the chapter's short label when chapters are declared.
- **Macros:**

  | Macro | Value |
  |---|---|
  | `{{story_chapter}}` | current chapter `player_title` |
  | `{{story_chapter_number}}` | its position |
  | `{{story_so_far}}` | the D5 block text |
  | `{{story_previously}}` | the last sealed chapter's `SUMMARY` |

### D7 Context fold: sealed chapters leave the prompt, the chronicle stands in

This is the change that stops prompt cost growing with the saga (G7). At generation time, the
`generate_interceptor` sets `extra[Symbol.for('ignore')]` on every message inside a sealed record's range except the
last `keep_tail` messages. ST honours the symbol on both prompt builders (`public/script.js:5841`,
`public/scripts/openai.js:584`).

- **Why the ignore symbol and not `/hide`:** `hideChatMessageRange` writes `is_system` into the chat file, saves it
  and emits no event (`public/scripts/chats.js:147-169`). It is visible to the player as greyed rows and
  indistinguishable from the player's own hides. The ignore symbol is per-generation and never persisted, so there is
  nothing to undo. Our identity and fingerprint code already treats hiding as not-deleting
  (`runtime/fingerprints.ts:3-8`); the fold never touches it.
- **Host seam:** a new `stHost/promptFold.ts` generalizes the witness-filter spike's use of the symbol
  (`runtime/spikes/witnessFilter.ts:1`) into one seam that sets and clears the symbol and reports
  `{folded, kept, missing}`. The interceptor composes with talk control in the one manifest interceptor
  (`talkControlInterceptor`), and both run in a fixed order.
- **Guards** (principle 4):
  - the fold runs only when this generation's `storySoFar` block is non-empty and holds the record that covers the
    range (checked against `readInjectedPromptBlocks`);
  - it never folds the current chapter;
  - it never folds quiet or impersonate runs, the same scope rule as the sampler overlay;
  - the symbol is cleared after the generation closes (T6 lifecycle), so a later non-SO generation sees the chat
    whole.
- **Setting:** install-wide `memory.foldSealedChapters: "off" | "on"`, default decided by the Q-M3/Q-M1 floors (see
  §Quality measurement). Per chapter, `seal.fold_messages` can opt out, for example for a finale the author wants
  quoted verbatim.
- **Next-turn preview** (`runtime/nextTurn.ts`) shows "*N* earlier messages summarized by the chronicle" so the author
  can see the fold. The payload capture records `folded`.
- **Extraction is unaffected.** Reads use the chat window, never the prompt (`extraction/chatWindow.ts`). Sealed
  ranges are out of scope for cadence reads anyway, because the engine's `lastMessageId` is past them.

### D8 Returning cast: per-member dossiers

Act VIII brings back eleven members from earlier acts (fact sheet §5). Without help, the narrator meets Ronan in the
war camp knowing only his card.

- At each seal, `PEOPLE` lines update `extras.memory.dossiers[rosterId] = {text, chapterId, sealedAt}`. The newest
  line wins. The previous line is kept in `history` (cap 4) for the author view.
- When a member is **enabled by a checkpoint's `cast_changes`** and their dossier's chapter is not the previous
  chapter (a real return), their dossier joins the facts block for that member's drafts. It rides the existing
  per-member staging (`memoryInjector.ts:96-108`, `onMemberDrafted`) as `Returning: <name> — last seen in <chapter>:
  <text>`, for the first 12 messages after the return (`dossierWindow`).
- A dossier is public knowledge about the member. It never carries `[hiding]` content, and the PEOPLE prompt
  forbids it (the epistemic privacy rule: epistemic content is never written to World Info or shared blocks).

### D9 Endings, the saga record and the chronicle export

- A chapter with `final: true` seals when the story reaches any checkpoint in it that has no outgoing transitions
  (G6). Its seal additionally writes a **saga record**: a longer epilogue (400–700 words) built from every chapter
  record's `SUMMARY` + `CONSEQUENCES`, plus the final blackboard of the outcome keys. It is verified like D2.
- After the ending, `narrative.pipeline` reads **complete**:
  - cadence extraction stops (the scheduler skips a story whose engine reports `ended`);
  - steering, pacing and the scene read go quiet;
  - the talk director keeps working, so the player can play on in a free epilogue that commits no boundaries;
  - the Overview shows "The End" with the saga record.
- **Export:** `/story chronicle export`, plus a drawer button, writes a Markdown document: title, chapter titles,
  `SUMMARY` sections, the saga record, and (author only) the consequences with sources. It uses the `stateExport.ts`
  clipboard path, and the console plus a toast when the clipboard refuses. Player export never includes author-only
  sections.
- **Restart and the next saga:** `restartStory()` clears chapters like everything else. A future "new game plus" that
  carries a saga record into a new story is out of scope (Unresolved questions).

### D10 Archive recall (phase C, measured before default)

Folded rows are not lost; D10 lets the current chapter reach them on demand. When the latest player turn or the
active checkpoint's objective mentions an entity whose rows are folded, up to *k* = 4 folded rows are retrieved and
injected for one generation, as `Recalled from <chapter>: …`. The rows mentioned are ranked by the injection score
with vectors when present (`stHost/vectors.ts`, the consolidation bands); Jaccard is the fallback.

- It is bounded by `recallTokens` (default 200).
- It rides the scene-history block rather than a new key, so no depth is spent.
- It is off until Q-M5 passes.

This replaces the tempting alternative of making the chronicle scannable (D5 explains why that is worse): recall is
targeted, capped and journaled.

### D11 Eras: long chats without chapters (phase C, measured before default)

Most stories, including every non-saga story played long, will never declare chapters. For them, an **era seal**
runs at the first scene break after all three of these hold:

- more than `eraMessages` (default 300) messages since the last seal;
- more than 24 unpinned `scene_history` rows;
- more than 20 resolved arcs.

It is the same pass as D2 with `chapterId: "era-<n>"` and a title derived from the checkpoint names visited. Era
records use `record_style: "chronicle"`, the same fold (D3) and the same chronicle (D4). D7's fold for eras is a
separate setting (`foldEras`), default off, because an era boundary is a heuristic and an authored chapter is not.

### D12 Rollback: the seal is a derived artifact

- **Rolling back to before the seal's boundary** (a delete or edit inside the sealed range, or a swipe of the sealing
  reply):
  - `rollbackDerived` drops `chapter_seal` (its `messageId` is the sealing reply) and unfolds its inputs, by clearing
    `foldedInto` where it names the record;
  - it drops the record, and every `era_merge` that took it as input;
  - it rebuilds the chronicle;
  - the dossiers revert to their previous `history` line;
  - the bridge note is withdrawn;
  - the title-card `/comment` stays, because it is a chat row, like the transition note today. The next seal posts a
    new one. Q4 below asks whether to delete it.
- **Rolling back inside a sealed range the engine can no longer reach** (older than the 200-boundary horizon, G11):
  the engine already answers `history-unavailable`. The seal stays, and the Repair row names the chapter whose
  record may now describe messages that were edited. It offers Re-seal (D13).
- `reverseMemoryState` (`memory/reverse.ts`) gains the unfold step between derived rollback and arc rollback. The
  `rollback ≡ replay` property test (`memory/rollbackReplay.property.test.ts`) gains seals in its generator. This is
  the check that found the three v2.3 plan-04 bugs, and it is the reason the fold is `foldedInto` and not deletion.
- A persisted `chapters` record whose `sealedAt.messageId` is at or beyond the chat length on hydrate is dropped
  (`clampToChat` pattern, `engine.ts:330-337`).

### D13 Author controls

- **Studio, Story tab → "Chapters" editor:** the chapter list (id, titles, kind, final, seal policy), plus a checkpoint
  column in the checkpoint editor. `GraphPanel` colours nodes by chapter and draws chapter lanes. All edits go through
  `mutations.ts` (`addChapter`, `setCheckpointChapter`, `setChapterPolicy`), which is the copilot contract.
- **Wizard:** the Turning points step proposes chapters for a long premise (a `setChapters` op through the ordinary
  proposal path). Chapters are optional in every wizard output.
- **Drawer, author view, "Chapters" panel** (Scheduler tab, next to `StagecraftPanel`):
  - each record's sections, sources as `MessageCitation` links, status and token counts;
  - **Edit summary** writes `provenance.override {by: "author"}` and `status: "author-edited"`; a re-seal will not
    overwrite it without a confirm;
  - **Re-seal** re-runs D2 over the same range;
  - **Seal now** for the current chapter (confirm);
  - **Unseal** (confirm) unfolds everything and deletes the record.
- **Slash:** `/cp seal [chapterId]`, `/cp unseal <recordId>`, `/cp chapters`. All are author-only.

## Adolion integration

`scripts/campaign/assemble.py` emits:

- `chapters`: one per act, with `player_title` taken from `docs/ACT-BRIEFS.md` headings, plus the interludes;
- `chapter` on every checkpoint, from the act's index range (fact sheet §1).

| Chapter | Kind | Checkpoints |
|---|---|---|
| `adv` "The Adventurer's Guild" (I–II) | chapter | 0–26 |
| `acad` "Nightriver Academy" (III) | chapter | 27–38 |
| `aegis` "Homecoming" (hub) | chapter | 39–56 |
| `board-1..4` "The Board" | interlude | `aegis-the-board` excepted; `saga-downtime-n`, `saga-board-n` |
| `deep`, `east`, `night`, `esha` | chapter | 57–127 by act |
| `war` "The Muster" (VIII) | chapter, `final: true` | 128–149 |

`build/validate-stories.mjs` fails a saga checkpoint without a chapter. The test `TESTING.md:213` (E6, "ask a
companion about something from the first act") becomes the human row of Q-M1. Saga version bumps to **v11**. The
standalone act stories keep no chapters: a one-act story needs none, and D11 covers them if played long.

## Quality measurement (predeclared, decides every default)

Measured on a long-play corpus before any default flips. Floors are declared here and are not retuned after the run
(`.claude/rules/architecture.md`, the plan-10 invariant).

**Corpus:**

1. **Deterministic:** `test/fixtures/saga-mini.story.json`, 3 chapters + 1 interlude, 14 checkpoints. It is paired
   with a scripted 360-message transcript (`saga-mini.transcript.json`) carrying 40 planted **needles**: facts stated
   once, in chapters 1–3, with a question and an accepted-answer regex each. The shape is adolion `lab/needles`
   (`corpus.json`, `check.py`), which already measures retention across summary windows. Recorded model outputs go
   to `test/goldens/saga/`, so jest replays the pipeline without a model.
2. **Live:** the same transcript replayed through the real memory model on a lane (`so-live-suite.mts` pattern). Then
   30 needle questions are asked of the real narrator profile at the start of chapter 4, with the transcript's
   chapters 1–3 in the chat.
3. **Human:** Adolion saga through at least Act III (acad), with E6 asked after Act III.

**Arms** (same rows, same questions):

| Arm | Seal | Chronicle block | Context fold |
|---|---|---|---|
| A0 baseline | off | off | off |
| A1 | on | on | off |
| A2 | on | on | on |

**Floors:**

| # | Metric | Floor | Decides |
|---|---|---|---|
| Q-M1 | Needle recall at chapter 4, questions about chapter 1 | A1 ≥ 0.80 **and** A1 − A0 ≥ +0.25 | seal + block default on |
| Q-M2 | Record faithfulness: `CONSEQUENCES` bullets whose cited sources support them (judge-scored, human spot-check of 20) | ≥ 0.95; unsupported proper nouns ≤ 2 % | the record prompt ships; below → degraded-only mode stays |
| Q-M3 | Prompt tokens of a chapter-4 generation | A2 ≤ 0.6 × A0 | fold default on |
| Q-M4 | Needle recall, chapter 3 questions (the most recent sealed) | A2 ≥ A1 − 0.05 | fold must not cost recent memory |
| Q-M5 | Needle recall with D10 on vs off, questions whose entity is folded | +0.10, with no increase in wrong-answer rate | archive recall default on |
| Q-M6 | Chronicle drift: `SUMMARY` text of chapter 1 after 3 later seals | byte-identical (unless author-edited) | principle 3, a jest invariant |
| Q-M7 | Seal pass cost | ≤ 6 model calls and p95 ≤ 90 s per chapter on the lane backend; never on the reply path | acceptable to ship at all |
| Q-M8 | Era seal (D11) on a chapterless 600-message fixture | recall ≥ A0 + 0.15 | `eraSeals` default on |

A floor that is missed keeps its feature off by default and records why. Nothing is retuned to pass.

## Suggested answers to the open questions

| # | Question | Suggested answer | Why |
|---|---|---|---|
| Q1 | Chapter membership per checkpoint or list per chapter? | **Per checkpoint** (`chapter: id`) plus a story-level `chapters` list for metadata. | See D1. It is local, survives graph edits, and matches what the build knows. |
| Q2 | Should the seal fold messages out of the prompt by default? | **Only if Q-M3 and Q-M4 pass.** Until then `foldSealedChapters` is off and the saga pays the context cost. | Removing text from the prompt is the one change that can make play worse. The measurement decides. |
| Q3 | `/hide` or the ignore symbol for D7? | **The ignore symbol.** | It is never persisted, has nothing to undo, is invisible to the player, and does not collide with the player's own hides. |
| Q4 | Should rollback delete the chapter title-card `/comment`? | **No, the same rule as the transition note.** It is a chat row; the next seal posts a new one. | Deleting chat rows from a rollback handler is the save-race class v2.4/v2.5 spent weeks on. |
| Q5 | Is this a blob bump? | **Yes, under rule 9.** New `extras.memory.chapters`, `dossiers`, `chronicle`, `ArcEntry.originChapter/resolvedBy`, the `chapter_seal`/`era_merge` derived kinds. **Share plan 08's bump to 6** if both land in the same release; otherwise 7. | The pre-release rule is "a persisted-shape change is a version bump plus a reset". |
| Q6 | Where does the code live, given the budgets? | **New delegated unit `runtime/chapterSeal.ts`** (the `canonSynthesis.ts` pattern, `architecture.test.ts:21` `DELEGATED_UNITS`), pure `memory/chapterInput.ts`, `memory/chapterRecord.ts`, `memory/chronicle.ts`, `runtime/chapters.ts`. `memoryCoordinator` gains one delegate line per public action. | `memoryCoordinator` has 57 lines of headroom (503/560) and `extractionCoordinator` 74 (486/560). The manager is at 628/700 and already on the over-file list. Rule 12: a fix blocked by budget is recorded, not squeezed. |
| Q7 | Who orchestrates scene pass → arc pass → record, across two coordinators? | **The boundary-work entry**, which calls three manager delegates in order under one `RunOwnership`, the same way `runSceneBreakPass` already reaches memory through the manager. | Coordinators never import each other (the invariant). The registry is the declared orchestration point. |
| Q8 | Should the `decide` open-thread disposition use the judge (Jev) or the memory model? | **The memory model**, inside the record call. | One call instead of *n*. A wrong disposition is recoverable (D3). |
| Q9 | Should the chronicle be mirrored to World Info? | **No.** D10's recall does the useful half of that, bounded and journaled. | A scannable chronicle pulls lore for places the party left, on every mention. |

## Tasks

**Phase 0 — defects and the baseline (no schema change)**

1. G8: feed `openThreads` from `openArcs` (`snapshotBuilder.ts:173`). Spoiler checklist row.
2. G4: `selectCanonFacts` for canon (D4). `canonSynthesis.test.ts` asserts that a newer high-score fact beats an
   older low-score one.
3. G10: canon prose fallback to scene summaries.
4. The measurement corpus: `saga-mini` story + transcript + needles, `scripts/debug/so-saga-recall.mts` (asks the
   needle questions, scores with regexes, records every answer). Run arm A0 and archive it under
   `test/journeys/records/v2.6-02/`. This is the baseline every later floor compares against.

**Phase A — chapters, seal, fold, chronicle (blob 6)**

5. Schema + validation + normalization + diagnostics (D1). `validate.test.ts` covers every rule; the diagnostics
   test covers every consequence line.
6. `runtime/chapters.ts` (pure trigger, interlude and re-entry rules) with a table test over the saga-mini graph.
7. `memory/chapterInput.ts`, `memory/chapterRecord.ts` (prompt, parser, verifier), with goldens from the live
   corpus. The parser is strict: a missing `SUMMARY`/`SHORT` is a refusal.
8. `runtime/chapterSeal.ts` (delegated unit): the D2 pipeline, ownership checks before every write, census rows in
   `test/findings/ownership-sites.json`, fault-matrix rows (`faultMatrix.json`: timeout, refusal, chat switch
   mid-seal, rollback mid-seal).
9. D3 fold + `chapter_seal` derived kind + `reverseMemoryState` unfold step. Extend `rollbackReplay.property.test.ts`
   with seals.
10. `memory/chronicle.ts` (D4) + era merge + current-chapter canon scope. Q-M6 as a jest invariant.
11. Blob 6 (Q5), `extras.ts` sanitizers, `BLOB_VERSION` imports in fixtures (never literals, the gotcha).

**Phase B — prompt and player surfaces**

12. `storySoFar` registry key + `MemoryInjector` block + budgets + `memory.story_so_far` mode + Studio card warning
    (D5).
13. Chapter bridge note on the continuity-note lifecycle (D5).
14. Title card, "Previously…" popup, Overview chapters section, `/story chapters|chapter`, HUD label, macros (D6).
    Every string is a spoiler-checklist row; `so-ui.mts assert-player-clean` sweeps them.
15. Dossiers (D8) through `onMemberDrafted` staging.
16. Studio Chapters editor, GraphPanel lanes, wizard `setChapters` op, drawer Chapters panel, `/cp seal|unseal|chapters`
    (D13). Each UI part gets a `.stories.tsx` (interaction + a11y).

**Phase C — context fold, endings, recall, eras**

17. `stHost/promptFold.ts` + interceptor composition + guards + next-turn preview line (D7).
18. Endings: `final` seal, saga record, `ended` state, scheduler skip, chronicle export (D9).
19. Archive recall (D10), off by default.
20. Era seals (D11), off by default.
21. Run arms A1/A2 (+ D10, D11 arms) on the corpus. Record Q-M1..Q-M8 and set the defaults the floors allow.

**Adolion (campaign repo)**

22. `assemble.py` chapters + interludes + `final`; `validate-stories.mjs` rule; saga v11; `install_st.py --update`.
    Harness count and `build_all.py` byte-identical second run, as in plan 19's gate.

## Gates

- **Pure (tasks 1–3, 5–11):** `npm run typecheck && npm run typecheck:test && npm run lint && npm test`. Jest covers:
  - the chapter trigger table;
  - parser refusals;
  - verifier (a planted invented name is caught; a citation to a missing id is caught);
  - fold/unfold round trip;
  - `rollback ≡ replay` with seals;
  - chronicle budget ladder (SUMMARY → SHORT → era);
  - Q-M6 byte-stability;
  - `selectCanonFacts` ordering;
  - dossier return detection;
  - `architecture.test.ts` (new delegated unit, budgets) and the census and fault-matrix guards.
- **UI (tasks 14, 16):** `test-storybook:ci` over the new stories.
- **Build:** `npm run build && npm run test:release` (a new registry key and a new capability-free host seam; the
  release manifest must list `promptFold.ts`'s host file hashes).
- **Live** (real LLM, dev build via `npm run build:dev && npm run serve:dev`, then `st-session.mts reload`; lane
  batch, rule 14: ×1 per plan, ×2 in acceptance). New journey **J13 "Saga"** on `saga-mini`:

  | Check | Asserts |
  |---|---|
  | J13.1 | Crossing chapter 1's exit seals it once: a record exists, status `sealed`, `range` matches, scene/session rows in range are folded, the title card posted, the bridge note rode the next loud generation only |
  | J13.2 | The next generation's captured request (`GENERATE_AFTER_DATA`) contains the `storySoFar` block with chapter 1's `SUMMARY`; `assert-player-clean` passes on the Overview and the popup |
  | J13.3 | Delete a message inside chapter 1 → the seal is undone (record gone, rows unfolded, chronicle rebuilt); crossing again re-seals |
  | J13.4 | An interlude between chapters 2 and 3 produces no record of its own; its messages are in chapter 3's range |
  | J13.5 | With fold on: the chapter-3 request carries no chapter-1 message text except the `keep_tail`, and the next-turn preview names the count; with the block forced empty, nothing is folded (principle 4) |
  | J13.6 | A returning member drafted in chapter 3 gets the `Returning:` line in their own request and no other member does (scoped as J5.8 is: inside the block) |
  | J13.7 | Reaching the `final` chapter's end: saga record written, pipeline `complete`, no cadence reads in the next 3 turns, export produces Markdown without author sections in player mode |
  | J13.8 | Reload mid-seal (the seal job in flight): no half record persists; the seal re-runs at the next boundary |

  Plus regression: J3, J5, J6 and J7 green on the same build.
- **Quality:** the §Quality measurement run, archived. The Gate record lists every floor, its value and the default
  it set.
- **Human:** the Adolion saga through Act III, with E6 asked after Act III; the session journal is exported
  (`so-journal.mts export`).

## Resolved 2026-09-30 (review)

| Question | Answer | Why |
|---|---|---|
| Chronicle budget default | **Predeclared arms of 400 / 700 / 1000 tokens in Q-M1, with 700 as the default arm**, fixed before the run. The floor picks the one that ships. | Overview rules 4 and 11: the bar is fixed before the first arm, never tuned after. |
| New game plus | **v2.7 seed.** | Out of scope here, and nothing measured asks for it yet. |
| Should the D7 fold apply to generations another extension triggers? | **No.** The ignore symbol is set only inside our own loud-generation lifecycle. | The T6 rule: a nested or foreign `{source}` generation is never touched (`runtime/generationLifecycle.ts`). Folding Summarize's input would change another extension's output without its knowledge. |
| Blob bump | **Shared with 08: one bump to 6** (overview rule 18). | Two bumps in one release means two resets for every player. |

## Resolved 2026-09-30 (review)

| Question | Answer | Why |
|---|---|---|
| Chronicle budget default | **Predeclared arms of 400 / 700 / 1000 tokens in Q-M1, with 700 as the default arm**, fixed before the run. The floor picks the value that ships. | Overview rules 4 and 11. |
| New game plus | **v2.7 seed.** | Out of scope; nothing measured asks for it. |
| D7 fold for other extensions' generations | **No.** The ignore symbol is set only inside our own loud-generation lifecycle. | T6 rule (`runtime/generationLifecycle.ts`). |
| Blob bump | **Shared with 08: one bump to 6** (overview rule 18). | Two bumps would mean two resets. |
| Who edits a chapter summary? | **Author view only; a player flags it (⚑)** (overview W21). | User. Author view is a per-chat persona toggle, not access control. |
| Is `aegis` a chapter? | **Yes** (overview W11). | User. |

## Unresolved questions

None.

## Gate record

**2026-09-30, branch `worktree-agent-a819623fde6832ab2` (merged master `180b01ec`). Code, jest, Storybook and the build only. No real-LLM run (overview rule 13: the Q-M arms belong to the final suite, plan 10 phase F), no lane, no scenario run, nothing touched ComfyUI. Every feature ships OFF (`seal`, `storySoFar`, `fold`; recap on) until the Q-M floors pass (principle 1).**

### What was built, per task

| Task | As built | Gate |
|---|---|---|
| 1 G8 | `snapshotBuilder.chapterParts` feeds open threads from `openArcs`, with "(since <chapter>)" for a carried thread | typecheck; narrative render |
| 2 G4 | `memory/entities.selectCanonFacts`: pinned/locked first, the rest by `scoreEntry`, store order kept; folded rows excluded | `memory/chapters.test.ts` "canon fact selection" |
| 3 G10 | `canonSynthesis` prose falls back to non-folded scene summaries; canon excludes folded arcs | jest (existing canon suites green) |
| 4 corpus | `test/measurements/v2.6-07/saga-mini.story.json` (4 chapters + 1 interlude, 14 checkpoints) + `recipe.json` (arms A0/A1/A2, budget arms 400/700/1000 default 700, floors Q-M1..Q-M8, procedure). **Transcript, needles, goldens and `so-saga-recall.mts` NOT built**; no A0 baseline archived (the `v2.6-02/` baseline the lead asked about is not this plan's) | corpus story parses and has no chapter diagnostics (`runtime/chapters.test.ts`) |
| 5 schema | `Checkpoint.chapter`, `Chapter {id,title,player_title?,kind?,seal?,final?}`, `ChapterSealPolicy`, `StoryV2.chapters/memory`; `engine/validate/chapters.ts` (rule table, duplicate/unknown/missing); `chapterById`/`chapterByCheckpoint` on the normalized story; `storyDiff` code `chapters-changed` (compatible). Studio diagnostics `chapter-missing`, `chapter-unknown`, `chapter-unreachable`, `chapter-no-exit`, `chapter-reentry`, `story-dead-end` in `studio/chapterDiagnostics.ts`, each with a consequence line | `runtime/chapters.test.ts` validation + diagnostics; `studio/diagnostics.test.ts` fires every code exactly once (new `chaptered` seed) |
| 6 trigger | `runtime/chapters.ts` (lazy-only): `sealTarget` reads `visitedPath` (a missed seal retries at the next boundary; interludes skipped back over), `sealRange`, `chapterNumber`, settings, `buildChapterView` | table test on `test/fixtures/chapters-mini.story.json` (mutant "no interlude skip" fails 3) |
| 7 record | `memory/chapterInput.ts`, `memory/chapterRecord.ts` (prompt, strict parser, verifier for citation ids + invented proper nouns, degraded record, saga prompt/verify) | `memory/chapters.test.ts` (refusals, planted name + missing id). No goldens: no live corpus yet |
| 8 seal unit | `runtime/chapterSeal.ts` (lazy chunk): close scene, arc summaries, input (trimmed by `fitInput`, not map-reduce), write ×2 then degraded, saga if final, fold + patch + `chapter_seal` derived, era merge, save, journal, title card. `RunGuard` checks before every write; census rows `ChapterSeal.run/seal/mergeEras/unseal/editSummary`, `EffectsApplier.announceText` | `ownership.guard.test.ts`; `passProfiles.test.ts` row. **Fault-matrix rows not added** |
| 9 fold | `memory/chapterFold.ts` (`foldedInto`, never delete; arcs by disposition), `memory/chapterUnfold.ts` (`unfoldChapters`, `unfoldAt`), `reverseMemoryState(…, unfold)`, `chapter_seal` in RE_DERIVED | `rollbackReplay.property.test.ts` generator gains `seal` (4 seeds × 400 cuts + middle deletes, both short-term shapes, plus a control that seals fold rows); mutant "no unfold" fails 16 of 18 |
| 10 chronicle | `memory/chronicle.ts`: `renderChronicle` ladder (oldest to SHORT first, newest stays SUMMARY), era merge candidates/prompt/fallback, markdown export | `memory/chapters.test.ts` ladder, eras, Q-M6 byte-stability |
| 11 blob | no bump: every new field optional and sanitized in `extras.ts` (plan 08 rule), nothing added to `isCurrentRecord` | full jest |
| 12 story so far | registry key `storySoFar` (depth 8), injected by `ChapterPort.inject` from `MemoryInjector.update` | no dedicated test (full jest green) |
| 13 bridge | `chapterBridge` (depth 1), carried on the next loud generation, committed with the continuity note | no dedicated test (full jest green) |
| 14 player | title card `◆ Chapter N — title`, "Previously…" popup after the away recap (`showPreviously`), Overview "Your story" (`PlayerChapters`, ⚑ flags a summary to the journal), "The End" section, pipeline `complete`, `/story chapters|chapter|chronicle`, macros `story_chapter`, `story_chapter_number`, `story_so_far`, `story_previously`; Display group `ChapterControls` (`#so-chapter-seal`, `-story-so-far`, `-fold`, `-recap`, `#so-chapter-budget`) | Storybook `Drawer/PlayerChapters` (3), `Settings/ChapterControls` (2) |
| 15 dossiers | derived from the records' PEOPLE lines at injection time and appended to each member's staged facts ("returning" lines), **not persisted** (deviation) | no dedicated test (full jest green) |
| 16 author | drawer `ChaptersPanel` (`#so-chapters`, Scheduler tab): sections, status, edit summary (`author-edited`), re-seal (confirms over an edit), unseal (newest only), seal now; `/cp chapters|seal|unseal`; Repair row `chapter` for a degraded record; typed mutations `addChapter`, `updateChapter`, `removeChapter`, `setCheckpointChapter`, `setChapterPolicy` (listed in `MUTATIONS_WITHOUT_A_TOOL`: no proposal op yet). **Studio Chapters editor, GraphPanel lanes, wizard `setChapters` op NOT built** | Storybook `Drawer/ChaptersPanel` (4); `tools.test.ts` |
| 17 fold | `chapterKit.fold` via the talk wiring: sealed messages replaced in the per-generation `coreChat` by the `Symbol.for("ignore")` extra, rows matched to message ids by `extra` identity; withheld on quiet/impersonate. Lives in the lazy kit, not a `stHost/promptFold.ts` (deviation). **Next-turn preview fold count and payload `folded` NOT built** | no dedicated test (full jest green) |
| 18 endings | final seal, saga epilogue, `ended` state (steering cleared, boundary work only compacts short-term), chronicle export | no dedicated test (full jest green) |
| 19 / 20 | archive recall (D10) and era seals (D11) **NOT built** | — |
| 21 | Q-M runs **not run** (recipe only) | — |
| 22 | Adolion `assemble.py` / aegis-as-chapter **not touched** (campaign repo, plan 02 owns it) | — |

### Bundle

Main entry `dist/index.js` **1,192,542 B** (budget 1,250,000; master before this plan 1,242,554). The chapter code is in lazy chunks (`chapterKit`, `chapterSeal`, `ChapterControls`, `PlayerChapters`); the saving over master comes from `copilotCoordinator` importing `@copilot/index` dynamically, which moved copilot + studio diagnostics/mutations out of the main entry.

### Commands (all on the merged tree)

| Command | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run typecheck:test` | clean |
| `npm run lint` | clean |
| `npm test` | 355 suites passed, 1 skipped; 4754 tests passed, 1 skipped |
| `npm run test:debug` | 454/454 (a first run before `npm run build` failed `so-run-header` "reads plan 08s nested manifest" because `dist/` was absent; green after the build) |
| `npm run build` | ok, bundle `ed0931e81d4b` |
| `npm run build:dev` | ok, bundle `03ecd37c86ac` |
| `npm run test:release` | 77 pass, 0 fail, 2 skipped |
| `npm run test:replay` | 25 of 25 killed |
| `npx storybook build -o .sb-static-07 --quiet` + `npx http-server .sb-static-07 -p 6107 -s -c-1` + `npx test-storybook --url http://127.0.0.1:6107 --index-json` | 44 suites, 298 tests passed (incl. the 3 new files); server stopped, dir deleted |

### Deviations and open items

- Every default is OFF except the recap; the floors decide (Q-M1 seal + story so far, Q-M3/Q-M4 fold).
- Not built: judge `memoryVerify` in the seal, epistemic fold, D10 archive recall, D11 eras, Studio Chapters editor + GraphPanel lanes + wizard `setChapters` op (mutations exist, no proposal op), `/cp activate` seal confirm, next-turn preview fold line and payload `folded`, map-reduce for oversize input (trimmed instead), fault-matrix rows for the seal unit, the corpus transcript/needles/goldens and `so-saga-recall.mts`, the Adolion change.
- Dossiers are derived, not persisted, so the D12 "dossiers revert" rollback case holds by construction.
- The unit fixture is `test/fixtures/chapters-mini.story.json`; the plan's `saga-mini` name is the Q-M corpus story under `test/measurements/v2.6-07/`.
- The `chapter_seal` derived record lists folded rows as inputs, so a later rollback that removes one of them drops the seal; the property test found no divergence from replay with that rule.

### Addendum 2026-09-30: task 16/17 UI and authoring items (no model)

Worktree `agent-a1cfad589a9bc715f`, master `bd61f23f` merged. No lanes, no real-LLM call, nothing live (rule 13).

| Item | As built | Gate |
|---|---|---|
| Studio Chapters editor | `studio/components/ChaptersEditor.tsx` in the Story tab (`[data-so="chapters"]`): add (typed id or auto `chapter`), title, player title, kind, "Ends the story", seal policy (open threads, messages kept verbatim, record style, "leaves the prompt once sealed"), remove, and a per-checkpoint chapter select (`[data-so="chapter-assignment"]`). Every edit goes through `addChapter`/`updateChapter`/`removeChapter`/`setChapterPolicy`/`setCheckpointChapter` | `ChaptersEditor.stories.tsx` (4 interaction stories + axe) |
| GraphPanel lanes | compound parent node per used chapter (`chapter:<id>`, dashed lane, not tappable, not position-restored so the relayout check counts checkpoints only); Mermaid export draws a `subgraph chapter_<id>` per chapter | `graphPanelUtils.test.ts`, `graphAdapter.test.ts`, `StudioGraph.stories.tsx` ChapterLanes |
| Wizard `setChapters` | agent-only op (full list in play order + `assign {checkpoint: chapter}`, `""` clears), args read by the story validator's `readChapters` (re-exported through the `@engine` barrel), assignment targets checked before the diff card, backed by the new `mutations.setChapters`, which composes all five chapter mutations. `AgentToolSpec.composes` lists them, so `MUTATIONS_WITHOUT_A_TOOL` has no chapter row. Coverage row `story.chapters`; the agent prompt names chapters as optional | `tools.test.ts`, `loop.test.ts`, `mutations.test.ts`, `coverage.test.ts` |
| `/cp activate` seal confirm | `chapters.jumpSeal` asks the ordinary trigger what the jump would seal (interludes skipped back over, final excluded); with seal on, a choice popup: **Seal it, then jump** (seals at the path position the jump takes, so the trigger does not seal twice), **Jump without sealing** (writes `memory.chapterSealSkip {pathLength, messageId}` after the activation; `sealTarget(…, skipAt)` treats it like a record, `liveSkip` ignores it once the path is shorter, and `reverseMemoryState` drops it on a rollback at/before its message), Cancel. A chat that moves while the popup is open cancels (RunGuard) | `chapters.test.ts` (jump + skip rows), `chapterJump.test.ts` (popup, move, skip, rollback) |
| Fold count + payload `folded` | `chapterKit.foldPreview` counts the sealed messages the next loud generation will fold (same coverage rule as the fold: the story-so-far block must carry the record); `snapshot.nextTurnFold` → `[data-so="next-turn-fold"]` in the next-turn preview. The interceptor hands the fold outcome to `manager.noteFolded`, which stamps `folded` on the latest payload capture (`[data-so="payload-folded"]` in the Payload tab) | `chapterJump.test.ts`, `NextTurnPanel.stories.tsx` SealedChaptersFolded / NothingFolded |

Blob stays v6: `chapterSealSkip` is optional and sanitized (`extras.ts`). Main entry **1,208,407 B** (was 1,206,807 on the merged master; budget 1,250,000); editor, lanes and the agent tool are in the lazy Studio chunk, the confirm in the lazy chapter kit.

Commands (after the last edit): `npm run typecheck` 0 · `typecheck:test` 0 · `lint` 0 · `npm test` 365 suites (1 skipped), 4885 pass, 1 skipped · `build` 0 (bundle `1cff5a1536cc`) · `build:dev` 0 · `test:debug` 457/457 · `test:release` 77 pass, 2 skipped, 0 fail · `test:replay` 30 of 30 killed · `npx storybook build -o .sb-static-p07` + `http-server -p 6122` + `npx test-storybook --url http://127.0.0.1:6122 --index-json`: 49 suites, 324 tests pass (server stopped, dir deleted).

Found on the way: the first Storybook run failed every Story tab story with React #185, because the editor selected `draft.chapters ?? []` from zustand (a new array per render). Fixed; jest could not see it.

Still open from this plan: judge `memoryVerify`, epistemic fold, D10, D11, map-reduce, seal fault-matrix rows, corpus transcript/needles/`so-saga-recall.mts`, Adolion, the staged wizard's Turning points `setChapters` proposal op (only the agent has the tool), a chapter column inside the checkpoint editor (the assignment lives in the Chapters editor), and every live J13 row.
