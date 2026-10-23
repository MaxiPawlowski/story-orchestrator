# Plan 05 — Evidenced story threads

**Status: written 2026-10-21 from the v2.9 triage (`01-triage-sol.md`); built 2026-10-21 on branch `v2.9-05-patterns` (slices A-D, authored-only), deterministic gates green, real-LLM and corpus floors NOT run (no GPU); see §Gate record.** Implementation
tier **D** (pure matcher, schema, runtime slice, Studio, no model call). Acceptance **D** (matcher floors on the frozen
corpus, replay, perf) + **CL** (independent labels for the real-play part of the corpus) + **RP/LT** (real-play ref sequences;
narrator-hint slice C only). Overview rules: `docs/plans/v2.8/00-overview.md` §Rules (inherited by v2.9).

## What it is

- Authored **patterns** over what the story already records as typed, public occurrences: transitions, quest status moves,
  milestones, public checks. A pattern is ≤3 ordered steps, optional shared bindings ("the same giver"), optional
  cancellation ("unless … between step 1 and 2"), an optional window.
- Matched deterministically and incrementally at each boundary, no model call. A partial match is a thread in progress; a
  completed match is a **callback** with evidence refs (the exact `EffectRef`s that matched).
- A completed callback can surface an **authored** player line in "What changed" and an **authored** narrator hint. Nothing
  else: no blackboard write, no inferred motive, no generated text.
- Narrow value claim (sol challenge 10): this notices patterns in the refs SO keeps, which are selected state changes, not a
  complete event log. It cannot see a social microstory the log never represented, and never claims causation.

## History and evidence

- Research: `docs/plans/v2.8/extension-research-2026-10-21/niches.md` §7 Felt + Winnow (story sifting as queries over an
  event DB; Winnow's incremental partial matching, `unless` kills a match and records why; clones
  `C:/dev/st-extensions-research/niches/felt`, `…/winnow`, **no licence: ideas only, no code or pattern text copied**), §8 Loose
  Ends (partial matches drive suggestions; dormant threads resurface: v2.9 06). `SUMMARY.md` top-10 #2.
- Triage: `01-triage-sol.md` N11 (PLAN v2.9 05, narrowly bounded; no general Datalog, no complete simulation log), audit A10
  (rich history recorded, repeated patterns not recognized; "start with public typed events; do not promise detection of
  anything the log never represented"), §"05" spec, challenge 10, build order step 4 (05 → 06).
- Precedent: v2.8 46 consequences recap (`docs/plans/v2.8/46-consequences-recap.md`, typed refs + rollback by boundary),
  its §Harvest 2026-10-16 (v2.8 18 Q7 narrator sheet as a **second reader** of the refs, not a competing boundary-change
  model: this plan is a third reader under the same contract), v2.8 52 codex (`knownEntities`, disclosure ≠ knowledge).
- Where sol and the research disagree, sol wins:
  - research rates V5, effort M–L, with sources including relationship beats, promises, rumors, faction moves, agenda;
    sol: P4, L, **public transition/quest/milestone/check only** in the first slice. Private sources wait for v2.8 42
    witness consumers and v2.9 04 private delivery. Agenda refs (`agenda` kind) are excluded too: their visibility is
    per-step authored and the triage list omits them.
  - research proposes `story.threads[]`; "threads" already names open arcs on player surfaces (below), so this plan
    proposes the schema key `patterns` (owner decision 3).
  - research offers recap "Twice now you've …" generated wording; sol: authored callback labels and hints only.

## Current state in code

Verified on master `6861d989`.

- **Typed refs exist.** `EffectRef {kind, id, from?, to?, boundary, messageId, chapterId, visible, authored, causes}`,
  kinds `transition | quest | milestone | check | agenda` (`src/runtime/recapPort.ts:6`, `:15-26`). Derived per boundary by
  `deriveRefs` (`src/runtime/consequences.ts:175`) from `transitionRef` (`:137`, living excluded from causes `:113-120`),
  `questRefs` (`:145`), `milestoneRefs` (`:157`, `visible: true` always), `checkRefs` (`:164`, visible only for
  `narrate === "public"`), `agendaRefs` (`:171`).
- **Retention and rollback.** `extras.recap.refs` capped at `RECAP_REF_CAP = 600` refs, oldest dropped
  (`recapPort.ts:32`, `:48-52`); rollback keeps refs `≤ engine boundary` (`rollbackRecap`, `:54-55`), called from
  `quarantine()` on every path including history-unavailable (`src/runtime/rollback.ts:116`, `:124-126`). Engine horizon
  `ROLLBACK_HORIZON = 200` boundaries (`src/engine/engine.ts:97`, log cap `:292`). The ref cap is per ref, not per boundary,
  so ref retention and engine retention do not line up.
- **Boundary work.** `recap` order 7, `afterEnd` (`src/runtime/boundaryWork.ts:43-46`); `living-apply` order 8 (`:56`). Recap
  kit is lazy (`loadRecapKit`, `recapPort.ts:38`).
- **Readers.** Recap composer + withheld names (`recapWithheld`, `consequences.ts:182`; `lineFor` `:241`); narrator sheet
  "Just happened" (`src/runtime/narratorSheet.ts:34-43`, excludes secret milestones `:25-26`; port
  `narratorSheetPort.ts:54-55`).
- **Actor fields on public refs are scarce.** Quest `giver` (roster id, `src/engine/gameSchema.ts:75`, validated
  `src/engine/validate/quests.ts:255`); check `quality` (`gameSchema.ts:118-128`); checkpoint `chapter`
  (`src/engine/schema.ts:244`). Milestones carry `secret` (`gameSchema.ts:134`). No other actor on a transition, milestone or
  check.
- **No pattern recognition.** Grep `sift|pattern match` in `src/`: none. Open arcs are free-text model signals deduped and
  resolved by Jaccard (`src/memory/arcs.ts:29-46`), injected as `openArcTexts` (`src/runtime/memoryInjector.ts:78`).
- **"Threads" is taken.** Narrative section `threads` "Open threads" (`src/runtime/narrative.ts:9`, `:169`), `/story threads`
  (`src/runtime/slashCommands.ts:152`), inline category `threads` (`src/runtime/settingsModel.ts:27`), chapter seal
  `open_threads` (`src/engine/schema.ts:279`). All mean arcs.
- **Entity safety.** `knownEntities` (`src/engine/codex.ts:97`); director focus filters unknown names (`src/pacing/focus.ts:20-36`).
- **Suggestions** (v2.9 06 consumer): prompt rules only, no structured seeds (`src/runtime/suggestions.ts:9`, parser `:40`).

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| A. Pure fold over retained refs every boundary | no new stored state; rollback ≡ replay structurally | S | loses partials older than the 600-ref cap; cost grows with refs × patterns |
| **B. Incremental matcher + per-boundary deltas through the engine floor** | advance branches with each boundary's new refs; persist `{base, deltas, tombstones, completed}`; rollback = base + kept deltas | M | delta/floor bookkeeping and stored size; one more slice in `quarantine` |
| C. Own event log + general query engine (Felt-style) | full Datalog over a new event DB | L+ | sol: out; second boundary-change model (v2.8 46 harvest contract) |
| D. Model-detected patterns from transcript | arc-like model signal | M | unsupported causal claims, hidden-name leaks, no replay |

## Recommendation

**B**, public refs only, authored patterns; built-in library only if the owner approves it (decision 1).

### Slice A — schema, validation, pure matcher (D)

- Schema `story.patterns[]` (`src/engine/patternSchema.ts`, game layer, lazy like codex):
  - `{ id, steps: Step[1..3], unless?: Unless[], within?: number /* boundaries, first to last step */, repeat?: "once" | "each",
    label?: { text }, hint?: string, pending?: string }`.
  - `Step = { kind: "transition" | "quest" | "milestone" | "check", id?: string, to?: string, where?: Record<Attr, Value | Var> }`.
  - Attribute vocabulary (owner decision 2), per kind: transition `{to, from, chapter}`; quest `{id, to, giver}`; milestone
    `{id}`; check `{id, outcome, quality}`. `Var` = `"?name"`; ≤2 distinct vars per pattern; a var binds on first use and
    must equal on later steps.
  - `Unless = { between: [i, j], kind, id?, to?, where? }`: a matching ref strictly between steps i and j kills the partial.
- Validation (`src/engine/validate/patterns.ts`): ids exist; quest `to` ∈ statuses except `hidden`; check `outcome` ∈ outcome
  words; vars ≤2; steps ≤3; `within` 1–200 (`ROLLBACK_HORIZON`); a step naming a `liv_` checkpoint, a secret milestone or a
  non-public check is refused (slice 1 is public-only); `label.text`/`hint`/`pending` ≤240 chars (recap's limit). Warnings:
  `pattern-label-names-unknown-entity` (a name not in `knownEntities` at completion time, mirrors
  `disclosure-names-unknown-entity`), `pattern-label-claims-cause` ("because", "so that", "therefore", "led to"; author
  decides), `pattern-never-completes` (a step whose target can never be reached from the graph). Each code in
  `DIAGNOSTIC_CONSEQUENCES`.
- Matcher (`src/runtime/patterns.ts`, pure, lazy kit like `loadRecapKit`):
  - input: patterns, current partials, the boundary's new refs filtered to `visible && kind ∈ slice-1 kinds && !living &&
    !secret milestone`; resolves `giver`/`quality`/`chapter` from the story index, never from text.
  - ref cursor `{boundary, index}`: `index` = position in that boundary's `deriveRefs` output (emission order transition →
    quests → milestones → checks, `src/runtime/consequences.ts:177-178`), before the slice-1 filter. Total order =
    (boundary, index). Intra-boundary order is derivation order, not narrative order (guide states it).
  - a branch = `{patternId, rev, next, bindings, refs: Cursor[]}`; refs are the cursors its matched steps consumed.
  - per ref, in cursor order, fixed precedence:
    1. expire: drop branches whose first ref is more than `within` boundaries before this ref (inclusive: a last step
       exactly `within` boundaries after the first still matches).
    2. advance: for each surviving branch (taken from the pre-ref set) whose `next` step matches the ref with agreeing
       bindings, spawn an advanced copy (`next + 1`). The waiting branch is kept; one ref advances a branch at most one
       step; a step never consumes a ref already in the branch. Step 0 matching the ref spawns a fresh branch.
    3. cancel: `unless.between: [i, j]` is open on a branch that has matched step i and not step j. A ref matching an open
       `unless` kills that branch. Endpoints are exclusive: the ref that matched step i, or the ref that just advanced a
       copy to step j, is never inside the interval, so the advanced copy survives while its waiting parent dies.
       Cancellation runs before completion: no completion is emitted from a branch killed by this ref.
    4. complete: an advanced copy with `next === steps.length` completes. A ref is consumed by at most one completion per
       pattern: every other branch of that pattern sharing a ref with the completion is discarded (non-overlapping
       occurrences). `repeat: "once"` (default): the pattern's tombstone (Slice B) blocks every later completion and its
       branches are dropped.
    5. dedupe and cap: among branches with the same `(patternId, next, bindings)`, drop a branch whose first ref and last
       ref are both ≤ another's (dominated: it can reach no completion the other cannot, with less window and longer
       unless exposure); identical branches collapse. Then ≤16 live branches per pattern; overflow drops the oldest by first
       ref, counted `overflow` (author view).
  - stable order: pattern declaration order, then first ref cursor, then last ref cursor.
  - vars: a `"?v"` binds on its first step; a later step or an `unless` with that var matches only the bound value. An
    `unless` naming a var not bound by step i is refused at validation.
  - killed/expired branches keep `{reason, ref}` (author view, bounded ring 50).
  - completion: `{patternId, rev, occurrence, refs: Cursor[], boundary, messageId}`; `occurrence` = pattern id + rev + the
    ordered cursors (`kind:id:boundary:index`).
  - no blackboard write, no `Math.random`, no wall clock.
- Slice A fixtures, frozen before Slice B: overlapping A–B–B–C (both `once` and `each`, plus an `unless` between B1 and
  B2 on steps [2,3]), two steps matched in one boundary, step and `unless` on the same ref, a bound-variable negative (step 2
  with a different giver), an `unless` endpoint ref, an expiry at exactly `within` and at `within + 1`.

### Slice B — runtime slice, rollback, author view (D)

- Load activation (cross-plan new-only stories): `patterns` joins `usesGameLayer` (`src/engine/validate/gameLayer.ts:25-33`),
  the parse step (`readPatterns` beside `readCodex`, `src/engine/validate.ts:122`) and normalized copying (`gameFields`,
  `src/engine/validate.ts:100-103`). Fixture: a story whose only game-layer field is `patterns` (no quests, codex, checks)
  loads, matches and shows its callback.
- Own slice `extras.patterns = { base, deltas, tombstones, completed, gaps }`, sanitizer like `sanitizeRecap`:
  - `base: { at: Cursor, branches, ring }`: matcher state after consuming every ref with cursor `< at` (exclusive). A
    base taken after boundary b has `at = {boundary: b + 1, index: 0}`.
  - `deltas: { boundary, added, removed, completed, tombstoned }[]`, one per boundary whose matcher state changed. Matcher
    state after boundary t = `base` + every delta with `boundary ≤ t`. Retained through the engine rollback floor: when
    the engine's oldest snapshot (`recordSnapshot`, 200 per chat, `src/engine/engine.ts:520-525`; `rollbackTo` picks the
    greatest snapshot ≤ target, `:301-311`) moves past a delta, that delta folds into `base`. Never tied to the 600-ref cap
    (`appendRefs` slices per ref, `src/runtime/recapPort.ts:48-52`), so a truncation inside one boundary's refs never
    touches matcher history.
  - `tombstones: { patternId, rev, occurrence, boundary }[]`: one per `once` completion, compact, never evicted by display
    caps; rollback metadata is the `boundary` itself. Kept until a rollback below it or a Restart.
  - `completed: Completion[]` (cap 200, display and evidence detail). Evicting a completion never removes its tombstone,
    so an evicted `once` pattern cannot complete again.
  - `gaps: { from, to, reason }[]`: boundaries the matcher did not see (kit outage, below). Any replay comparison across a
    gap is reported unreconstructable, never equal.
- Ready reader contract (cross-plan recap availability): the recap port is the one ref derivation, and its `onBoundary`
  silently returns when the kit is absent (`src/runtime/recapPort.ts:67-70`); startup awaits `loadRecapKit` but swallows a
  failure (`src/index.tsx:47`). So:
  - `recap.onBoundary` returns `{ derived: EffectRef[] } | { unavailable: "kit" }`; the `patterns` boundary work consumes
    exactly that return for this boundary, never re-derives and never reads `extras.recap.refs` (which may already be cut).
  - startup awaits `loadPatternsKit` beside `loadRecapKit`; for a pattern-bearing story both kits are awaited in the story
    activation path before the first commit is accepted for matching. If either is missing, the matcher does not run, the
    boundary is appended to `gaps`, and a `degrades` check `patterns-unavailable` (feature `story-patterns`, consequence +
    player copy, firing fixture) shows in Repair. No second event database.
  - cold-load fixture: fresh page, import a pattern story whose step 0 fires on the first boundary; the first ref is in the
    first delta and the pattern completes later.
- Boundary work `patterns` between `recap` (7) and `living-apply` (8), `afterEnd`. Not a `commitBoundary` step; no compiled
  code key, so no `ROLLBACK_DETECTORS` entry (exempt list unaffected).
- Rollback: `rollbackPatterns(state, engineBoundary)` in `quarantine()` next to `rollbackRecap` (`src/runtime/rollback.ts:116`,
  `:124-126`): drop deltas, completions and tombstones with `boundary > engineBoundary`; the state is `base` + remaining
  deltas. Because deltas live as long as engine snapshots, every target the engine can restore is reconstructable; a target
  the engine reports `history-unavailable` follows the engine's own path and the cut counts as not identical in P4, never
  excluded and never claimed equal.
- Story update reconciliation (cross-plan; `pruneEngineState` alone does not touch extras, `src/runtime/storyUpdate.ts:175-177`):
  an owned hook `reconcilePatterns(extras.patterns, prev, next)` runs before `swapStory`. Identities:
  - definition rev = hash of the normalized matching definition (`steps`, `unless`, `within`, `repeat`); text edits
    (`label`, `hint`, `pending`) keep the rev.
  - edited rev: that pattern's live branches are dropped and refolded only from refs still retained after the oldest delta,
    marked `history-partial` (author view); no branch is invented from the edited schema for older refs.
  - removed: live branches and pending projection dropped; completions and tombstones stay under the original rev and
    text (earned evidence is never regenerated). Re-added with the same id: the tombstone still applies (a pattern id
    completes `once` per chat); a new id is a new pattern.
  - completions keep the `label.text`/`hint` they surfaced with (stored on the completion), so an edit does not rewrite past
    What changed lines.
  - reported `pattern-changed`; classification `compatible`. Test story update, then rollback across it, then reopen:
    state equals the no-update replay for untouched patterns.
- Retention fixture: >600 refs within 200 boundaries (ref cap truncates inside one boundary), rollback to every retained
  boundary, `once` pattern with >200 completions of other patterns evicting its completion, then a later occurrence:
  no second completion.
- Author view: Author page panel "Patterns" (live partials with next step, killed/expired with reason, completions with
  their refs, overflow); inline level 3 chip on the completing message. `#so-author-patterns`.

### Slice C — delivery (D; narrator hint needs RP to accept)

- Public filter (cross-plan held-secret content filter): every authored text (`label.text`, `hint`, `pending`) passes three
  checks before any public projection, and again at delivery for text that waits (a hint over its 3 boundaries, a pending
  hint read later by 06): `recapWithheld` names (`src/runtime/consequences.ts:182`), no `knownEntities`-unknown entity
  (`src/engine/codex.ts:97`), and the resting-audience content filter: `keptFrom(text, heldSecrets, null)`
  (`src/memory/heldSecrets.ts:50-54`) through `MemoryInjector.restingFilter` (`src/runtime/memoryInjector.ts:316-319`). A
  text that restates a held secret is withheld whole (not line-stripped), counted `withheld-secret` (author view). Name
  filtering alone and "authored, public refs only" are not claimed as proof. Fixtures: a secret restated with no unknown
  proper noun; the narrator card privately knowing it (resting view still withholds); a secret learned after completion
  while the hint still waits (withheld at delivery).
- Player line (owner decision 4, rule 4 surface): a completion with `label.text` adds one line to "What changed"
  (`composeLines`) as tier `authored`, only when every matched ref is still `visible` and the public filter passes; never a
  "Because you…" form (the 46 cause rule is not extended). Counts toward `RECAP_LINES`.
- Narrator hint: `hint` rides the narrator sheet as one line under a new header ("A pattern the player has completed; let it
  colour the scene, never restate it as cause") for 3 boundaries after completion, public filter at each delivery, loud
  generations only, through `narratorSheetPort`. Model-consuming: real-Artemis live gate, thinking and inner voice on.
- `pending` (one step left) is published only through §Public projection; director focus reads the same projection
  through `focusSafe`. No player surface of its own in this plan.

### Slice D — authoring surfaces (D)

- Studio: editor under State and rules, ordered step rows (kind, id picker, `to`, bindings), unless rows, preview of the last
  matches against the open chat's refs (read-only). Typed mutations `addPattern`, `updatePattern`, `removePattern`
  (`studio/mutations.ts`); wizard tool `upsert_pattern` / `remove_pattern` (`tools.test.ts` coverage); Ask can read patterns.
- Guide topic `patterns` in `docs/authoring/story-guide.md` + compact twin `src/copilot/guideTopics.ts` (coverage test),
  `npm run docs:guide`, `npm run docs:settings`.
- Feature registry `story-patterns` (in `src/features/recapFeatures.ts`), status `experimental`, needs `story`; install
  setting `recap.patterns` default **on** (rule 9). Storybook stories for the Studio editor and Author panel.
- Built-in library (only if decision 1 = yes): ≤5 entity-free patterns over generic shapes (e.g. same check failed then
  passed; two quests from one giver done; a checkpoint reached again after ≥N boundaries), each with neutral labels from
  `narrative.ts`, off per story via `patterns_library: false`.
- Campaign adoption: explicit decision (owner decision 5); any campaign review goes to another model, counts only.

## Public projection (consumed by v2.9 06)

The one read model other plans use. 06 edits against it in parallel; neither side reads `extras.patterns` directly.

- `patternProjection(story, extras.patterns, engineState, resting): PublicPattern[]`, pure, in the patterns lazy kit,
  exported through a main-entry door `runtime/patternsPort.ts` (absent kit → `[]`, and the `patterns-unavailable` check
  above). Rides the snapshot (`snapshot.patterns`); components and 06 never call the matcher.
- `PublicPattern = { patternId, rev, phase: "pending" | "completed", text, evidence: EvidenceRef[], boundary }`:
  - `pending`: a live branch with exactly one step left; `text` = authored `pending`. One entry per pattern (the branch
    first by stable order); a pattern with no `pending` text emits no pending entry. Dropped when the branch completes,
    is killed, expires or is reconciled away.
  - `completed`: a completion within the last 3 boundaries (the hint window); `text` = the `label.text` stored on the
    completion. Older completions stay author-only.
  - `evidence`: the matched refs as `{kind, id, boundary, index, messageId}` (cursor + message), every one `visible`;
    never `causes`, never `CauseRef`.
  - `boundary`: the boundary of the last matched ref.
- Eligibility: an entry is emitted only when its text passes the public filter at projection time; `focusSafe` names
  filtering does not replace it. Entries whose text fails are omitted, not redacted.
- Consumer contract for 06: eligible `pending` entries are `pattern` anchors (evidence = `evidence`); `completed` entries
  are not unresolved goals and are not anchors unless the author separately writes a goal for them. 06 keeps existing
  memory arcs as `thread` / `dormant-thread` and adds no pattern code.
- Stability: `(patternId, rev, phase, evidence)` is the entry identity; same chat state → byte-identical projection
  (rollback ≡ replay covers it, P4).

## Predeclared floors

Sol's, informational, frozen before inference, never retuned.

| # | Condition | Floor | Tier |
|---|---|---|---|
| P1 | Precision over 50 frozen positive/negative ref sequences (labels from the pattern spec and, for real-play rows, an independent rater against the transcript: opencode `openai/gpt-6.1-sol` default, DeepSeek fallback only) | ≥95% | D (+CL labels) |
| P2 | Recall over the same 50 | ≥85% | D (+CL labels) |
| P3 | Unsupported causal claims and hidden-name disclosures in player lines and hints over the corpus | 0 | D |
| P4 | Replay identical across every edit/delete cut of the corpus runs, including the retained-history floor (ref cap and engine horizon) | 100% of cuts | D |
| P5 | Matcher p95 per boundary on the frozen stress fixture (sol: stress fixture; proposed shape 16 patterns × 3 steps × 16 partials, 600 refs) | ≤2 ms | D |

- Denominators: 50 sequences (report positive/negative split and per-kind counts); every cut of every run for P4. An
  unreconstructable cut (engine `history-unavailable`, or a matcher `gap`) counts as not identical; never excluded.
- Report also, no floor: persisted `extras.patterns` bytes on the stress fixture, `withheld-secret` count, overflow count,
  killed/expired counts, sequences where the story-level pattern held but no ref
  represented it (the recall limit challenge 10 names).
- Not a floor here: whether callbacks help play. Proposed as an unfloored informational row in the v2.9 final suite (open
  question 1).

## Gates by tier

- Slice A (pure): `npm run typecheck && npm run lint && npm test && npm run typecheck:test`; `npm run gates:quick` per
  change. Property test: incremental matcher ≡ fold over refs for random sequences, including >600 refs in 200
  boundaries; Slice A ordering fixtures frozen first.
- Slices B–D (runtime/UI): above + `npm run build` + no-model scenario on a lane (scripted turns completing, killing and
  expiring a pattern; swipe/edit/delete each cut; reload; cold-load first event; patterns-only story; story update +
  rollback + reopen) + Storybook; `so-ui.mts assert-player-clean` with a completion
  shown.
- Slice C narrator hint: real-Artemis live gate (`send_generate`, profile selected, no `debugResponse`), thinking and inner
  voice on, batched into the v2.9 final suite per the build-order rules. Not green on mocks.
- Plan close: `npm run gates` (Storybook included), gate record appended.

## Privacy and spoiler notes

- Slice 1 reads only `visible` refs; secret milestones, non-public checks, living transitions and agenda refs never enter
  the matcher. No private source (rumors, promises, relationship beats, witness) until v2.8 42 consumers pass and v2.9 04
  delivery exists.
- Every authored text (label, hint, pending) passes the public filter (Slice C): `recapWithheld`, `knownEntities` and the
  resting-audience `keptFrom` content check, at projection and again at delivery. A label naming an unknown entity is
  withheld at render and warned at validation. Public refs and authored text are not assumed safe: an authored line can
  restate a held secret with known names, so the content check, not placement, keeps player surfaces identical with and
  without a held secret.
- Author panel shows partials and kills: author-only (Author view). Built-in library lines name no entity.
- Public repo: no campaign patterns in fixtures; corpus from synthetic stories plus counts-only real-play evidence archived in
  `so-sessions`.

## Invariants touched

- **Consequences recap reads after the boundary's whole evaluation order**: patterns consume the refs `recap` (order 7)
  derived for this boundary through its explicit return, never a second derivation; rollback keeps exactly the boundaries the engine kept (`rollbackPatterns` beside `rollbackRecap` in
  `quarantine`).
- **v2.8 46 reader contract**: a reader of `deriveRefs`, adds no ref kind, does not read `CauseRef`, does not change
  `EffectRef` or retention (S4/S5 of v2.8 18 Q7 stay green).
- **Disclosure is not knowledge / `knownEntities`**: the only entity filter for lines.
- **Boundary work is a registry entry**; **chance is seeded** (no randomness at all); **every compiled code key has a
  rollback check** (none added).
- **Engine purity**: schema/validation in `src/engine/`, matcher in runtime over runtime types, no STAPI import.
- **Main bundle budget**: matcher, validation and Studio editor in lazy chunks.
- **Wizard create-only / agentic wizard writes only through tools**: pattern edits are ordinary mutation ops.

## Dependencies and links

- v2.8 46 (refs, recap lifecycle), v2.8 52 (`knownEntities`), v2.8 18 (quests, checks, Q7 reader contract).
- v2.9 06 consumes only §Public projection: eligible `pending` entries as `pattern` anchors; `completed` entries are not
  goals; v2.9 04 optional later for private reaction delivery; v2.9
  07 delayed echoes may schedule from a completion occurrence later (not in this plan).
- Public-only slice does not depend on unpassed witness consumers (v2.8 42).

## Decisions for the owner

1. **Authored patterns plus a small built-in public library, or authored-only?** Recommended: authored-only first; library
   after the corpus shows authored patterns complete in real play.
2. **Approve the bounded initial event vocabulary** (four kinds, attributes above, ≤2 vars, ≤3 steps, ≤16 partials)?
   Recommended: yes.
3. **Schema/UI word `patterns` (player: "callback" lines inside What changed) instead of `threads`**, which already means
   open arcs? Recommended: yes.
4. **Player-visible callback line in What changed** (rule 4 surface)? Recommended: yes, authored labels only.
5. **Campaign adoption** after slice D: which stories, reviewed by another model, counts-only reporting.

## Review 2026-10-21 (sol)

- P1 retained-history replay: applied. Empty-reset fallback removed; `base` (exclusive cursor) + per-boundary deltas kept
  through the engine snapshot floor; exact `{boundary, index}` cursor; >600-refs/200-boundaries fixture with an
  intra-boundary truncation; unreconstructable cuts count as not identical (Slice B, floors note). Verified
  `recapPort.ts:48-52`, `engine.ts:301-311`, `:520-525`.
- P1 recap availability: applied. Ready reader contract: `recap.onBoundary` returns derived refs or `unavailable`; both
  kits awaited before the first matched commit; `gaps` + `patterns-unavailable` check; cold-load fixture. Verified
  `recapPort.ts:67-70`, `index.tsx:47` (load awaited at startup, failure swallowed).
- P1 once-only eviction: applied. Compact `tombstones` outlive the 200 display cap; rollback by their boundary; removed /
  re-added / edited identities specified (id-scoped `once`, rev = matching definition); >200-completions fixture.
- P2 branching and ordering: applied. Per-ref precedence expire → advance (waiting branch kept, one step per ref) →
  cancel (exclusive endpoints, before completion) → complete (non-overlapping) → dominance dedupe → cap; var and `unless`
  rules; A–B–B–C, same-boundary, bound-variable and endpoint fixtures frozen before Slice B.
- Cross P1 held-secret content filter: applied. `keptFrom` through `restingFilter` at projection and delivery for label,
  hint and pending; three fixtures; placement-as-proof claim removed. Verified `heldSecrets.ts:50-54`,
  `memoryInjector.ts:316-319`.
- Cross P1 05/06 projection: applied. New §Public projection (id, rev, pending/completed phase, authored text, evidence
  refs); completed entries are not goals; arcs keep `thread` names.
- Cross P1 new-only stories: applied. `patterns` added to `usesGameLayer`, parse and `gameFields`; patterns-only fixture.
  Verified `gameLayer.ts:25-33`, `validate.ts:100-103`, `:122`.
- Cross P1 story-update reconciliation: applied. `reconcilePatterns` before `swapStory`; earned completions keep original
  rev and text; update + rollback + reopen test. Verified `storyUpdate.ts:175-177`.
- Cross P2 model routing: applied. CL rater = Sol default, DeepSeek fallback only. No floors changed; thinking and inner
  voice untouched.
- Not applicable to 05: 04 typed offer API, 03 settings (05's `recap.patterns` is a feature-registry install setting; it
  extends 09's state mapping and parity fixtures when it lands).

## Unresolved questions

1. Add an unfloored "callbacks help" row (blind A/B of recap/narration with and without callbacks) to the v2.9 final suite,
   or predeclare a floor for it now?
2. Real-play part of the 50-sequence corpus: which lane/model window, and how many rows real vs synthetic?
3. Does `repeat: "each"` need a per-pattern cooldown, or are non-overlapping occurrences plus the 16-branch cap enough?
4. Should a quest `giver` binding also accept codex People entries once v2.8 52 links entries to members?

## Gate record 2026-10-21 (v2.9 build, branch v2.9-05-patterns)

Scope per owner decisions 2026-10-21: authored-only patterns (no built-in library), four-kind vocabulary and bounds as
recommended, word `patterns`, callback line in What changed. No GPU: no Artemis, no real-LLM gate, no RP/LT/CL runs.

### Built

- **Slice A (schema, validation, matcher).** `engine/patternSchema.ts` (`StoryPattern`, `PatternStep`, `PatternUnless`,
  limits: 16 patterns, 3 steps, 2 vars, 4 unless rows, 240-char texts, `within` 1-200, 16 live branches per pattern);
  `engine/validate/patterns.ts` (`readPatterns`, `checkPatterns`) through the game layer (`GAME_LAYER.patterns`),
  `patterns` in `usesGameLayer`, `parseStory` and `gameFields`. Refused: `liv_` checkpoints, secret milestones, non-public
  checks, quest `to: hidden`, unknown attributes per kind, an `unless` var not bound by step i, a pattern with no label,
  hint or pending line. Studio diagnostics `pattern-label-names-unknown-entity`, `pattern-label-claims-cause`,
  `pattern-never-completes` (`studio/patternDiagnostics.ts`), each in `DIAGNOSTIC_CONSEQUENCES` and the guide.
  Matcher `runtime/patterns.ts` (lazy kit, `loadPatternsKit`): refs filtered to visible transition/quest/milestone/public
  check, living and secret excluded; cursor `{boundary, index}` = position in `deriveRefs` output; per ref expire ->
  advance (waiting branch kept) -> cancel (exclusive endpoints, before completion) -> complete (non-overlapping, `once`
  tombstone) -> dominance dedupe -> cap 16 (overflow counted). Attributes from the story index only. No randomness, no
  wall clock, no blackboard write. Frozen fixtures (A-B-B-C once/each, unless B1-B2, same-boundary order, step and
  unless on one ref, bound-variable negative, unless endpoint, expiry at `within` and `within + 1`, public-only filter).
- **Slice B (runtime slice, rollback, author view).** `extras.patterns = {base {at, branches, ring, overflow}, deltas,
  tombstones, completed (cap 200), gaps, partial}`; `runtime/patternsPort.ts` main door (types, `rollbackPatterns`,
  `createPatternsPort`, doors to the kit). `recap.onBoundary` now returns `{derived} | {unavailable: "kit"}`; boundary
  work `patterns` (order 7.5, afterEnd) consumes exactly that return via the work context, never re-derives. Startup
  awaits `loadPatternsKit` beside `loadRecapKit`; a missing kit or recap records a `gaps` row and raises the `degrades`
  check `patterns-unavailable` (feature `story-patterns`, player copy, firing fixture). Deltas fold into `base` when
  `engine.historyFrom()` passes them; `rollbackPatterns` in `quarantine()` beside `rollbackRecap`; a target below the
  base is recorded as a `history` gap, never claimed equal. Re-running a boundary trims first (no doubles). Story update:
  `reconcilePatterns` via `StoryUpdateDeps.reconcile` before `swapStory` (rev = hash of steps/unless/within/repeat; text
  edits keep the rev; edited or removed patterns drop live branches from base and every delta; completions and
  tombstones kept; `once` is per pattern id). Author panel `#so-author-patterns` (Author › Overview) and an inline level 3
  chip `progress:pattern:*` on the completing message. Sanitizer runs in the kit (main keeps a shape guard).
- **Slice C (delivery).** Public filter per text at projection and at delivery: `recapWithheld` names,
  `unknownEntityNames(knownEntities(...))`, and the resting content check (`MemoryInjector.restingFilter` changing the
  text = restates a held secret, withheld whole, counted `withheldSecret`). What changed: completions with `label.text`
  join `composeLines` as tier `authored`, never because, scoped to the current section's boundaries
  (`RecapView.callbacks`). Narrator hint: `hint` rides the omniscient member's private block for 3 boundaries under
  `PATTERN_HINT_HEADER` (`narratorSheetPort` `hints` dep; `memoryInjector` stages the block for pattern stories).
- **Public projection (for v2.9 06), as specified.** `patternProjection(story, extras.patterns, engineState, resting):
  PublicPattern[]` (pure, kit) through the main door `runtime/patternsPort.ts` (absent kit -> `[]`), on
  `snapshot.patterns`. `PublicPattern = {patternId, rev, phase: "pending" | "completed", text, evidence: {kind, id,
  boundary, index, messageId}[], boundary}`; pending = one live branch with exactly one step left (first by stable order)
  and authored `pending` text; completed = completions within the last 3 boundaries with their stored label; entries
  whose text fails the filter are omitted. Byte-identical for the same state (test).
- **Slice D (authoring).** Studio `PatternsEditor` (Game tab, State and rules), typed `addPattern` / `updatePattern` /
  `removePattern` / `setPatterns` (`studio/gameMutations.ts`), agent tool `setPatterns` (`tools.ts`, `gameOps.ts`,
  validated with the story validator), `readStory` lists patterns for Ask. Guide topic `patterns` (`story-guide.md` +
  `guideTopicsRecap.ts`), `npm run docs:guide`, `npm run docs:settings`, setup-path Level 5 row. Feature `story-patterns`
  (`recapFeatures.ts`, experimental, needs story), install setting `memory.patterns` default on, story policy
  `features.patterns.enabled`. Storybook: `Studio/PatternsEditor` (play + phone/tablet/wide), `Drawer/PatternsPanel`.

### Not built, and why

- Built-in pattern library: owner decision 1 = authored-only.
- Studio read-only preview of the open chat's last matches: not built (the Studio has no runtime read seam without
  crossing the components/studio boundary); Author › Overview › Patterns shows the live state instead.
- Refold of an edited pattern from retained refs: not built; an edited pattern's live branches are dropped and the
  pattern is marked `partial` (author view). No branch is invented from older refs, which the plan also requires.
- Chapter title card recap (`cardSections`) does not include callback lines; only the current What changed section does.
- The 50-sequence P1/P2 corpus with independent labels: not built (its real-play rows and the CL rater need model time).
- No-model lane scenario `test/scenarios/v29-05-patterns.json` (pending, completion on the Overview,
  assert-player-clean, delete takes it back) is written and schema-checked (`validateFixture` = `[]`, every eval parses)
  but **not run**: lanes serve the one staged extension slot in the owner's ST tree, and staging this unmerged branch
  there would replace what :8000 and the other v2.9 builders' lanes serve. Lane 43 was never started.

### Deviations from the plan text

- Install setting is `memory.patterns` (no `recap` settings section exists; mirrors `memory.rumors`), plus a story
  feature policy `patterns`.
- Agent tool is `setPatterns` (full list, composes add/update/remove), the repo's idiom (`setRumors`, `setFactions`),
  not `upsert_pattern` / `remove_pattern`.
- Kill ring and completions carry their own boundary; deltas hold `{boundary, added, removed, killed, overflow}`;
  tombstones and completions are top-level and roll back by boundary (equivalent to per-delta storage).
- Boundary work order 7.5 (between recap 7 and living-apply 8) instead of renumbering.

### Floors (informational, not retuned)

- P1 precision, P2 recall (50 frozen sequences, CL labels): **NOT run: no GPU (owner 2026-10-21)**; corpus not built.
- P3 unsupported causal claims / hidden-name disclosures: unit fixtures only (withheld name, unknown entity, restated
  secret, secret learned after completion withheld at delivery): 0 in fixtures; the real-play corpus part NOT run.
- P4 replay identical: property tests (8 seeds x 60 boundaries with persistence and a moving floor; 200 boundaries
  with >600 refs) incremental == fold; every cut from the floor to the end of an 80-boundary run equals the replay to
  that cut (51 of 51 cuts); a cut below the floor is a `history` gap. Real-play runs NOT run.
- P5 p95 per boundary <= 2 ms: stress fixture 16 patterns x 3 steps, 693 refs over 100 boundaries, 52 live branches:
  p95 2.7 to 8.5 ms across 3 jest runs (`SO_PATTERN_PERF=1`), mean ~1.1 ms per boundary for the matcher alone.
  **Below the floor** (recorded, not retuned). Persisted `extras.patterns` on that fixture: 791,630 bytes
  (deltas' added branches 631,542). Overflow, killed and withheld counts are on the author slice.
- Slice C narrator hint real-Artemis gate: **NOT run: no GPU (owner 2026-10-21)**.

### Commands

- Per slice: `npm run gates:quick` (RED first on max-len, a coverage map entry, codeHealth/errorCopy ratchets, golden and
  count updates; each fixed, then the targeted suites and the full jest run green).
- `npm run gates` (full, Storybook included, no `--resume`) on `0a0bda79`: **all green in 229.3s** (build, typecheck,
  test:debug, test:replay 32 of 32 killed, debug:typecheck, typecheck:test, test:release, lint, test:plugin, test
  847 suites / 9823 passed / 1 skipped, test-storybook:ci 158 suites / 948 passed). Earlier full runs on this branch went
  red for environment reasons, not code: port 6006 held by another worktree's Storybook (EADDRINUSE, twice) and
  `childTree.test.mts` timing under machine load (passes alone); one real miss (`suiteCoverage`: no plan 24 matrix row
  for `story-patterns`) was fixed by adding the row.
- Storybook also run on an alternate port (6016) before the final run: 158 suites / 948 passed.
- Main bundle `dist/index.js` 1,296,730 B (budget 1,300,000). The matcher, validation, diagnostics, Studio editor and
  author panel ride lazy chunks; the main entry carries `patternsPort` (types, rollback, port, doors), the check, the
  narrator header and the wiring.
- `SO_PATTERN_PERF=1 npx jest src/runtime/patterns.test.ts` x3 for P5 (numbers above).
- Live no-model lane check: **NOT run** (reason under Not built). Real-LLM gates: **NOT run: no GPU (owner 2026-10-21)**.

### Invariants

Engine purity (schema and validation in `src/engine`, no STAPI), boundary work is a registry entry consuming recap's
return, rollback keeps exactly the boundaries the engine kept (`rollbackPatterns` in `quarantine`), no compiled code key
(no `ROLLBACK_DETECTORS` entry), no randomness or wall clock, propose-never-write (no blackboard write), held secrets
filtered on every public text (resting content check, withheld whole), architecture and code-health guards green.
Thinking and inner voice untouched.

### GPU run 2026-10-22

- Window 2026-10-22 ~21:23-23:20 local (00:23-02:20Z), local 3090 via the controller (`cli.mjs automatic`, text loaded clean
  after the earlier `crashed` code-1 status). Lanes 41 (master `a082a064`, served bundle `cb12b358`) and 42 (`v2.9-03-polish`
  `639ae53c`, bundle `33506e23`, staged into the ST code copy `C:/dev/st-v29-08`), both `--allow-local --headed`, images and sprites
  off in the lane copies, profile `Artemis RunPod RP` -> :18888, context 32768, thinking and inner voice on. Group
  `Group: Arin, DM Narrator` (the lane copy also drafts two members outside each story's roster).
- Rater: opencode `openai/gpt-6.1-sol` (`opencode run`, frozen prompt in the evidence folder). Evidence
  `C:\dev\so-lanes\41\debug\v29gpu\`, `C:\dev\so-lanes\42\debug\v29gpu\` (+ each lane's `debug/runs/`), archived to so-sessions.
- Pilots are NOT the predeclared corpora: small N, fixed fixtures, no frozen 40/100 denominators. They say whether the path works
  with the real model and which way a floor leans; no floor below is claimed met.
- Two model lanes shared one GPU: memory-model calls queued behind the other lane's replies (inner beat timeouts at 35 s,
  suggestions at 50 s, below). Environment, not a product change; recorded.
- Pilot `test/scenarios/v29-05-model-pilot.json` x3 (lane 41, all passed): the two transitions complete the pattern, the hint
  reaches the omniscient narrator's applied block 3 of 3, then one real `/trigger` narrator reply.
- Narrator hint real-Artemis gate (sol rater): reply coloured by the hint **0 of 3**; causal restatement 0 of 3. The hint reaches
  the prompt but Artemis does not use it in this fixture. Recorded, not retuned.
- P1/P2 corpus (not built), P3 real-play part: NOT run (> 1 h).
