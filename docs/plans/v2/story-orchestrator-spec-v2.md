# Story Orchestrator — Specification v2

Supersedes v1 entirely. Story format is `format: 2`; v1 stories are not loadable — no compat layer, no trigger taxonomy. This is a clean design.

## Problem & approach

SillyTavern (ST) is a self-hosted frontend for roleplay chat with LLMs: persistent characters, lorebooks, prompt controls, and an extension API. Models write a good *next message* but cannot run a *story* — over long play the plot wanders, tension flattens, setups never pay off. Hand-scripting kills improvisation; free generation loses the thread.

Story Orchestrator lets an author define a story skeleton — key moments and the conditions to move between them — as a directed graph. The plugin tracks story state on a structured blackboard, advances by fixed rules, and generates connecting scenes in the background where the author left gaps. Authored reliability, live flexibility, and a system that is tested rather than felt.

## Design spine: deterministic engine, measured AI layer

Story progress lives on a **blackboard** of typed values. Every **transition** carries a **hard gate** — a fixed condition over the blackboard. Gate evaluation is pure arithmetic: same blackboard, same result. The rulebook is deterministic and testable with no AI.

The AI's job is narrow and named: the **extractor** reads recent chat and proposes blackboard changes with evidence. That step is fuzzy — the model interprets prose — and it is the *only* fuzzy step. Consequences:

1. The two layers are tested separately: gate logic against hand-set blackboards; extraction against answer keys.
2. Only the reading step needs hardening, and we know how (closed vocabulary, evidence-backed deltas, latching; below).

Honesty: hard gates do not make the system deterministic end to end — the AI still produces the values gates read. They make the *rulebook* deterministic and relocate all uncertainty into one measurable step. That separation is the payoff.

## Vocabulary

- **Checkpoint** — a story beat. Carries an objective, a `state_snapshot` (blackboard values expected while active — an expectation and generation target, never a write; nothing sets blackboard values on entry), a `tension_target`, a `target_turn_length`, and effects fired on activation.
- **Anchor** — authored checkpoint, guaranteed to happen. **Intermediate** — AI-generated bridge beat, disposable. **Stub** — authored placeholder where intermediates are generated.
- **Transition** — directed edge with a gate, a priority (tie-break), and optional effects (progress increments; below).
- **Gate** — condition tree over the blackboard (grammar below).
- **Extractor / shared read** — the one fuzzy AI pass: reads recent turns, proposes blackboard deltas *and* memory updates in one call. Runs on a separate memory LLM, off the response path.

Exactly one checkpoint is active at a time.

## Blackboard

Typed **qualities** in categories: plot progress (incl. convergence counters), relationships, world facts (flags, location, inventory), tension, meta (message count, elapsed).

Two sources, and only two:

- **`source: code`** — meta counters, convergence progress. Set by the engine. Deterministic end to end.
- **`source: extractor`** — everything narrative. Regex never writes state; a text cue may only *force* an extraction.

A gate on `message_count >= 5` is fully deterministic; a gate on `mara_trust >= 4` is deterministic given the blackboard but rests on a fuzzy reading. The author chooses per gate where on that spectrum to sit.

### Gate grammar

Gates are structured JSON condition trees — no text DSL, no parser. Leaves compare one quality; combinators nest.

```
Leaf:        { q: <quality key>, op: "==" | "!=" | ">=" | "<=" | ">" | "<" | "in", v: <literal | literal[]> }
Combinator:  { all: [Gate...] } | { any: [Gate...] } | { not: Gate }
```

Examples:

```json
{ "all": [ { "q": "player_has_key", "op": "==", "v": true },
           { "q": "mara_trust", "op": ">=", "v": 4 } ] }

{ "any": [ { "q": "location", "op": "in", "v": ["vault", "tunnels"] },
           { "not": { "q": "guards_alerted", "op": "==", "v": true } } ] }
```

Validated at load: every `q` declared, op/type compatible (`>=` needs numeric, `in` needs enum/string), enum values in the allowed set; a stub with no anchor reachable beyond it is rejected. A compact text rendering (`player_has_key == true AND mara_trust >= 4`) is derived for display and Mermaid export — never parsed back.

### Extraction scope

The quality set is declared once per story; the extractor is never asked about all of it. **Default scope is wide**: while a checkpoint is active, scope = all not-yet-latched qualities whose first gating point lies at or ahead of the active checkpoint on *any* reachable path — union over all reachable next anchors and any inserted intermediates' gates. Evidence for a checkpoint-five gate that appears at checkpoint two is therefore read at checkpoint two and latched.

Scope derives over the current session graph, inserted intermediates included; cached-but-not-yet-inserted scaffolding for the likeliest branch contributes its gate qualities too, so evidence arriving just before a stub is not missed. Narrowing is an opt-in optimization, never correctness-bearing: a quality may declare `scope_hint: { from, until }` to trim its window when the author knows evidence cannot appear elsewhere. Studio previews each checkpoint's derived scope so the effect of a hint is visible. Qualities already latched at terminal values drop out automatically.

## Turn loop & commit semantics

The response path is deterministic and AI-free in steady state:

1. **Refresh mechanical qualities** (code).
2. **Evaluate outgoing gates** over the current blackboard. One opens → advance (priority breaks ties), fire the destination's effects, inject its guidance. No AI.
3. **Main model narrates**, steered by the active beat's guidance and injected memory.

Extraction runs off-path on the memory LLM, on a cadence (every N messages) and on forced cues. A slight lag before a gate opens is acceptable — the story should not advance mid-sentence — and reconciliation catches misses.

**Commit semantics.** All blackboard writes — extraction deltas, reconciliation, mechanical updates — enter one **serialized apply queue**, drained only at **turn boundaries**: after a reply is fully rendered and before the next generation starts. Checkpoint activation and its effects (preset swap, author's note, world info, cast changes) obey the same rule — never mid-generation. In group chats every fully rendered member reply is a boundary; a checkpoint may advance mid-round and its effects apply to subsequent members. Each extraction result records the turn range it read; a completed read whose range is fully covered by a newer completed read is discarded whole. Applied deltas pass type and latching checks individually.

**Chat mutations.** Swipes, edits, and deletions rewrite history the scoreboard already read. The engine keeps a boundary-indexed log of applied deltas and fired transitions (bounded window). On a mutation at turn T: if nothing applied references turns ≥ T, it is a no-op; otherwise restore the nearest snapshot before T, re-apply older log entries, revert any transition fired after T (re-applying the restored checkpoint's effects idempotently), drop memory entries created at turns ≥ T, and schedule a forced re-read over the mutated window.

## Extractor hardening

A missed reading is load-bearing — a gate can fail to open because a flag was never set. Defenses:

- **Closed vocabulary.** The extractor chooses from declared qualities and allowed values; it cannot invent keys. Failures become "wrong value from a known list" — detectable and scorable.
- **Rubric per quality, phrased as a question.** Each quality carries reading instructions, ideally question + scale: "Did anything this turn change Mara's trust? By how much, and quoting what?" Defined once, inherited by every gate reading it. A transition may add an `extraction_hint` — a scene-specific cue that augments *how to read*, never the value range. The engine assembles the active contract from each in-scope quality's rubric plus hints. Rubrics double as the answer-key schema for extraction tests, so reading rule and labeling convention stay identical by construction.
- **Evidence-backed deltas, not re-snapshots.** Only the changes this turn justifies, quoting supporting text. Incremental justified changes drift less than full re-reads.
- **Latching / monotonic values** where the story allows: progress only rises, key flags latch true. A missed reading self-corrects next turn instead of silently reverting.
- **Low temperature.** Near-greedy over a closed vocabulary: low variance.
- **Reconciliation on stall.** Stall = no gate has fired for `max(1.5 × target_turn_length, 6)` turns (multiplier configurable); re-checks every 3 thereafter. A beat meant to run long is thereby allowed to breathe — stall is measured against intended beat length, not a flat cadence. Reconciliation runs a *targeted* re-read — window: turns since the active checkpoint was entered, capped — for the specific unmet-gate qualities only. Evidence quotes are mandatory, same as normal extraction. It may set or raise an under-read value on that evidence; **un-latching** (reverting a latched value) requires explicit contradicting evidence and a strict confirmation, since a flipped latch can retro-invalidate a fired transition. Reconciliation may never write `source: code` qualities — convergence cannot be forced by a stalled re-reader.

## Tension & pacing

Tension is read as one of **five named, rubric-anchored levels** — `calm | stirring | tense | critical | peak` — not an absolute scalar; models label reliably from anchored rubrics where 0–1 ratings are noisy and model-dependent. The extractor's delta carries the level; an apply-time transform maps levels to numeric (0, .25, .5, .75, 1) and smooths with an EMA (α configurable) into the blackboard quality `tension_current` (float) — gates read the smoothed value; raw level history stays in runtime state.

The author picks a dramatic shape — rising-to-climax, fall-then-recovery, three-act, custom — defining an expected curve over story progress. Each turn the engine compares smoothed tension to the expected value and feeds the main model a one-line steering hint (escalate / hold / ease off), and biases background generation the same way. Pure arithmetic plus a sentence; no AI call of its own.

## Convergence

Each upcoming anchor has a `progress_toward_<anchor>` quality — **`source: code`**, fully deterministic. Generated intermediates declare progress increments on the transitions **between intermediates**; the engine applies an increment when its transition fires. The transition **entering the anchor** carries the condition `progress_toward_<anchor> >= threshold` and **no increment** — the progress available when that gate is evaluated is therefore exactly the chain's declared sum. Conditions are conjoined only into transitions arriving from generated intermediates; direct authored transitions into an anchor are untouched.

Arithmetic contract: threshold is authored per anchor, or defaults to the cumulative sum of the generated chain's declared increments (the chain exactly suffices). The generator is constrained to emit chains whose increments sum ≥ threshold; the critic verifies this arithmetic. Arc resolution (memory layer, below) may also contribute a declared increment — applied by the engine at the bridge point, still code-set. Pacing thus decouples from raw message count: anchors land on narrative progress, and nothing fuzzy can write the counter.

## Background generation

When the player enters the checkpoint leading toward a stub, the plugin generates **scaffolding** for the in-between beats ahead of time — not prose. The main roleplay model narrates every scene at runtime, steered by the scaffolding; a generated beat is mechanically identical to an authored one.

Scaffolding per beat: gate, target `state_snapshot`, `tension_target`, generation guidance, possible outcomes (which become multiple outgoing gates, so generated beats branch), and declared per-transition blackboard deltas + progress increments.

Process:

1. **State delta** — current blackboard vs the next anchor's `state_snapshot`: exactly which qualities must change, by how much.
2. **Tension trajectory** — current tension, anchor's target, chosen shape → ideal tension per step.
3. **Generate N beats' scaffolding** (N scales with delta size and arc distance), each declaring its outcome deltas and tension level. Context: the anchor snapshots plus **canon-lite** — a deterministic concatenation of passed anchor objectives, fired-gate history, and top-importance facts, exposed as `getCanon()`. (The derived canon of the memory layer later replaces canon-lite behind the same interface; there is no maintained prose roadmap anywhere — it would drift.)
4. **Critic check** — a fresh-eyes AI call, off the critical path: declared deltas move *cumulatively* to the anchor snapshot, progress increments sum ≥ threshold, tension follows trajectory, guidance contradicts no known fact (facts + canon-lite until the full memory layer exists). On failure, revise — bounded rounds, stop at first pass, accept with `needs_review` rather than block. Extra rounds only on a genuine flaw.
5. **Insert** validated beats as intermediates; cache against the stub.

**Cache revalidation.** Scaffolding was computed from the blackboard at entry; the player may have moved it. At stub entry the engine re-runs the arithmetic: does the cached chain's cumulative declared delta still bridge the *current* blackboard to the anchor snapshot (numeric tolerance; exact for flags/enums)? Pass → use. Partial → play the valid prefix while regenerating the tail. Fail → regenerate. When a checkpoint branches, the likeliest branch is pre-generated; an unexpected branch falls back to on-demand scaffolding — a short wait on the rare path only.

## Memory subsystem

The blackboard drives *gates*; memory grounds the *narration* — "should the story advance?" vs "what must the next scene stay faithful to?". Two layers with explicit bridges. All memory work runs on the separate memory LLM, off the response path.

**Tiers** (independently extracted, independently budgeted, injected at controlled depths):

| Tier | Scope | Content |
|---|---|---|
| Facts | per character | durable truths, tagged `[fact\|relationship\|preference\|event : importance(1-3) : expiration(scene\|session\|permanent)]`, optional `:entity=` |
| Session details | story | finer within-chapter specifics |
| Short-term | story | automatic rolling summaries of recent play; complements scene history in long scenes |
| Arcs | story | open narrative threads; lifecycle open → resolved + summary; pinnable across chapters |
| Epistemic map | per character | `knows / suspects / believes(false) / unaware / hiding(from X)` |
| Relationship state | per pair | emotional descriptors with magnitude (`trusting(high), wary(medium)`) |
| State ledger | per entity | right-now physical state; gate-relevant fields *are* blackboard qualities |
| Scene history | story | short summaries of completed scenes, rolling window |
| Canon | story | derived prose synthesis of resolved arcs + high-importance facts; replaces canon-lite; auto-derived so it cannot drift |

**Shared read.** The cadenced extractor pass proposes blackboard deltas *and* memory updates (tagged lines) in one call — one read, two consumers — scoped to the active extraction scope. Heavier per-tier passes (arcs, epistemic, ledger, canon) run at scene breaks or on cadence, async.

**Scene detection** is the scheduling heartbeat, and costs no extra AI call: code heuristics run per message (time-skip phrasing, location-quality change, `---` divider, cast change); a heuristic hit forces an immediate shared read, and *every* shared read's contract includes "did a scene break occur, and where?". A confirmed break triggers the heavy per-character passes and a scene summary. Scenes are finer than checkpoints — several per beat; a break schedules evaluation, it is not a transition.

**Supersession** — the narration-layer twin of latching. A changed fact retires its predecessor instead of coexisting with it. Two-pass: cheap pattern check for state-change language; only same-subject pairs without a pattern match spend one LLM call ("update or independent?"). A supersession and a blackboard mutation are the same event seen from two layers.

**Consolidation** — per type, new entries are deduped against the base: dropped, folded, or kept; embeddings catch paraphrases, keyword overlap is the fallback.

**Relevance scoring** — when a tier exceeds its token budget, entries score by weighted blend (importance, durability, confidence, recall count, recency, entity overlap, arc relevance, temporal proximity, semantic similarity to the last turn, minus contradiction penalty), with a diversity floor per type and activation triggers boosting entries whose keywords appear in the current turn. Lowest trims first.

**Bridges to the gate spine** — arc resolution applies a declared convergence increment; gate-relevant ledger fields are blackboard qualities; supersession ≡ quality mutation. Defined points, no blurring.

## Mid-chat adoption

A story may be adopted on an established chat: windowed shared reads over the existing history backfill the memory tiers, then one full-scope blackboard read runs over that history under normal evidence rules (latching honored). All of it off-path; live play is unaffected while the backlog processes.

## Cast model

A story is a group chat with a **roster**; enabling/disabling a character is a **checkpoint effect**, tying the dynamic cast to the deterministic spine. Only enabled characters respond. Each carries per-character tiers (facts, epistemic, relationships, profile, ledger entries); the responding character receives *their own* facts and epistemic block, injected privately, so behavior stays perspective-accurate about who knows what.

## Talk Control

NPC auto-replies are checkpoint effects: `npc_replies[] { trigger: onEnter | afterSpeak | sceneBreak, member, kind: scripted | llm, maxTriggers, probability? }`. `onEnter` fires on checkpoint activation, `afterSpeak` after an NPC reply, `sceneBreak` on a confirmed scene break. Per-checkpoint fired counters persist, so hydration never re-fires a reply. The generation intercept aborts loud generations only, never quiet ones.

## Off-path scheduler

One work queue on the memory LLM, priority-ordered:

| P | Work |
|---|---|
| 0 | forced extraction (cue hit, reconciliation) |
| 1 | cadenced shared read |
| 2 | scene-break tier passes (epistemic, ledger, relationships, summary) |
| 3 | scaffolding generation + critic |
| 4 | consolidation, canon refresh |

Coalescing: pending cadence reads with overlapping turn ranges merge; results superseded per the commit-semantics staleness rule drop. Under pressure (queue depth past a threshold): cadence N widens automatically; scene-break passes coalesce to the latest break. The reply path never waits on this queue — that boundary is absolute. Within it, extra compute is spent only when it buys a real quality gain (a critic round fixing a genuine flaw), never gratuitously: unfinished background work the player reaches *becomes* latency.

The memory LLM is chosen as capable as possible while keeping pace with realtime play — **cost is not the constraint; wall-clock is**. All rich features default on. A **capability profile** downgrades a feature only when the model cannot do it well (e.g. a small local model and epistemic extraction) — never to ration calls.

## SillyTavern integration

All verified against ST source:

- **Second model**: `ConnectionManagerRequestService.sendRequest(profileId, prompt, maxTokens, ...)` (`public/scripts/extensions/shared.js`) — the memory LLM is a Connection Manager profile; the roleplay connection is untouched.
- **Background structured calls**: `generateRaw` for anything on the main connection (already proven by the v1 arbiter).
- **Per-chat storage**: all runtime state — blackboard, memory tiers, expansion cache, scene history, cast state, story selection — lives in `chat_metadata` (via `getContext()`, persisted with `saveMetadataDebounced`), saved with the chat file and naturally per-chat. Extension settings hold only the story library and global config; nothing per-chat, so `settings.json` never bloats. Caps: expansion cache bounded per stub; scene history rolling.
- **Roster**: group `disabled_members` (`public/scripts/group-chats.js`) mutated by checkpoint effects.
- **Private injection**: on `GROUP_MEMBER_DRAFTED` (`public/scripts/events.js`), swap in the drafted character's facts + epistemic block before their generation.
- **World Info**: memory tiers that fit the lorebook model (relationship state, epistemic block, scene descriptions) written as WI entries; rewritten only on meaningful change to avoid churn.
- **Author's Note**: pacing hint + next-anchor description as narrative target.
- **Repo seams kept**: the STAPI facade remains the only file importing ST modules; debug scripts (`scripts/debug/`) and the Studio shell carry over.
- **Macros**: state and memory surface to authors via template macros — `{{story_blackboard}}` (compact state memo), `{{story_canon}}`, per-tier memory macros, `{{story_role_<role>}}`, and the story/checkpoint set.

**Provenance & licensing.** The memory subsystem is a vendored TypeScript adaptation of [Smart-Memory](https://github.com/senjinthedragon/Smart-Memory) (AGPL-3.0 — the extension is AGPL if ever distributed); the copilot's proposal/diff-review pattern comes from [ST-Copilot](https://github.com/Supker/ST-Copilot) (MIT); the state-memo and delta-log/rollback patterns come from [MultihogDnDFramework](https://github.com/MultihogAurelius/SillyTavern-MultihogDnDFramework) (MIT).

## Data model

```
Quality:
  key, type (int|float|bool|enum|string), values? (enum),
  source (code|extractor), latching?, monotonic?,
  rubric            question + scale for reading from prose;
                    doubles as the answer-key schema
  scope_hint?       { from?, until? } — narrowing optimization only
  ledger_binding?   { entity, field } — bound fields are written only via the
                    blackboard, mirrored read-only into the state ledger;
                    rejected on source: code qualities

Gate:               condition tree (grammar above)

Checkpoint:
  id, name, objective, type (anchor|intermediate; stub = empty intermediate)
  state_snapshot?   expected values while active; generation target
  tension_target?   calm | stirring | tense | critical | peak
  target_turn_length?
  effects?          author_note, preset, world_info, cast_changes,
                    npc_replies (§Talk Control)
  guidance?         steering text while active (authored or generated)

Transition:
  from, to, gate, priority
  effects?          { progress: { anchor, amount } }   ← code-applied on fire
  extractor_trigger?  regex/text cue forcing an extraction (never sets state)
  extraction_hint?    scene-specific reading cue (augments rubric, never range)

Scaffolding (cached per stub, AI-produced):
  beats[]: { gate, state_snapshot, tension_target, guidance,
             outcomes[] → outgoing gates + declared deltas + progress increments }
  basis: blackboard snapshot at generation time (for revalidation)
  needs_review?

Story:
  format: 2, title, description
  qualities[], checkpoints[], transitions[], roster[]
  arc_template?     dramatic shape
  arc_bridges?      { arcMatch, anchor, amount }[] — authored-only; increment
                    applied code-side at confirmed arc resolution
  requirements?     personas, group members, lorebooks that must be active;
                    unmet ⇒ checkpoint effects deferred until satisfied,
                    surfaced in the UI
```

Runtime (in `chat_metadata`, automatic): `blackboard` (values + versions + latch state), `facts`, `session_details`, `arcs`, `epistemic_map`, `relationship_state`, `state_ledger`, `scene_history`, `canon`, `cast_state`, `expansion_cache`, `active_checkpoint`, `tension` (raw levels + EMA); pending apply-queue writes are deliberately not persisted — a reload drops them and stall reconciliation recovers. Memory entries carry importance, expiration, confidence, entities, activation triggers, supersession links.

## Checkpoint Studio

The graph editor is a first-class deliverable — authoring is heavier than v1 (typed qualities, rubrics, gates) and the tooling must absorb that weight:

- **Quality editor** — type, enum values, source, latching, rubric (question + scale), scope hint.
- **Gate builder** — tree editor over declared qualities: dropdowns, type-aware operators, live text rendering. No free-text conditions.
- **Scope preview** — per checkpoint, the derived extraction scope and why each quality is in it.
- **Diagnostics** — gate references undeclared quality; op/type mismatch; enum value outside allowed set; anchor unreachable (no path whose cumulative deltas can produce its entry gate); quality latched by an earlier snapshot yet gated later at a conflicting value; stub with no anchor beyond it; threshold unsatisfiable by declared increments.
- Graph view, Mermaid export, and the tabbed editor carry over from the existing Studio shell.

## Story Copilot

Two optional assistant surfaces on the memory LLM. **Authoring copilot** (Studio): premise + questionnaire → staged proposals — quality set with rubrics → anchor checkpoints → transitions with gate trees and stub placement → effects/cast — each proposal schema-validated and diagnostics-checked *before* being offered, then applied through diff review using the same draft-mutation API the human editor uses. **In-play driver** (drawer): reads the live blackboard, unmet gates, upcoming anchors, and canon; offers Suggest (display only), Nudge (one-shot steering note, cleared after the next generation), Probe (forced targeted extraction), Advance (manual checkpoint activation with confirmation), Report (story-position summary). Invariant: the assistant never writes state directly — Probe goes through extraction, Advance through the manual path, Nudge only steers prose.

## Evaluation framework

A first-class pillar — the reason for the hard-gate design. Four layers; the harness for 1 and 3 is built first.

1. **Gate logic (deterministic, no AI).** Known blackboard in, assert exactly which transitions are eligible and which fires; priority tie-breaks; convergence thresholds; property tests (monotonic never decreases, latched never unlatches without strict path, entry gate held at entry). Fast, exhaustive, pinned.
2. **Extraction accuracy — two suites.** (a) *Blackboard deltas*: exact-match answer keys — expected key, direction/magnitude, and evidence that quotes the transcript; closed vocabulary makes exact labeling cheap, and this is the load-bearing failure mode. (b) *Memory tiers*: per-tier minimum counts plus `must_contain`/`must_not_contain` with flexible matching, tolerant of paraphrase. Both run against recorded **goldens** by default (deterministic); `--live` re-runs the memory LLM and re-records. Parser unit tests run first, fail fast.
3. **Replay / integration.** Saved transcripts replayed headlessly through the full engine (STAPI faked at the facade seam): final blackboard, anchors reached and none skipped, tension-curve fit, arcs resolved.
4. **Generation quality.** Critic pass-rate; verify declared deltas move cumulatively to target snapshots and increments satisfy thresholds; contradiction catches.

## Build plan

Operational sequencing, contracts, and gates live in `docs/00-implementation-overview.md` (plans 01–13); the phases below are design intent. Each phase leaves the plugin working. Every *done when* includes harness assertions **and** live-ST validation via the `scripts/debug/` Playwright tools — no phase signs off on harness alone.

- **Phase 0 — Engine core + harness.** Blackboard (types, latching, versions), gate evaluator, apply queue + turn-boundary commits, convergence mechanics, transition engine; eval layers 1 and 3 over hand-set states. *Done when* gate logic, commit ordering, and convergence are fully asserted against fixtures and a transcript replays headlessly with assertable end state.
- **Phase 1 — Extractor + shared read + canon-lite.** Memory LLM via Connection Manager profile; capability profile switch; cadenced shared read producing evidence-backed deltas + first-cut facts; scope derivation (wide default); `getCanon()` returning canon-lite; layer-2 suites (goldens + `--live`); live blackboard debug panel. *Done when* extraction fills the scoreboard in play, both golden suites pass deterministically, and stall reconciliation recovers a deliberately induced missed reading.
- **Phase 2 — Pacing.** Level-based tension + EMA, shape arithmetic, steering hint, author controls. *Done when* a replayed curve recognizably fits the chosen shape.
- **Phase 3 — Background generation + critic.** State-delta computation, N-beat scaffolding with declared deltas/increments prioritized by branch likelihood, critic with bounded revision, cache + entry revalidation, on-demand fallback; layer-4 tests. *Done when* transitions into pre-generated stubs are instant, revalidation catches a deliberately drifted blackboard, and critic pass-rate is measured.
- **Phase 4 — Convergence in play.** Code-applied progress increments, thresholds in anchor gates, stall detection + reconciliation in anger. After Phase 3: convergence passes through beats only the critic has reviewed. *Done when* a drifting fixture provably reaches every anchor within a bounded horizon.
- **Phase 5a — Cast + scenes.** Roster with enable/disable effects via `disabled_members`; heuristic + shared-read scene detection; scene-history tier. *Done when* cast changes apply on checkpoint fire and scene breaks are detected on a labeled fixture.
- **Phase 5b — Memory hygiene.** Supersession (pattern + confirm) wired to the latching bridge; per-type consolidation with embedding dedup; relevance scoring with diversity floor + activation triggers; per-tier budgets and depth-stacked injection. *Done when* memory stays clean across a long fixture (no duplicated or contradicted facts) and injection respects budgets.
- **Phase 5c — Arcs + canon.** Full arc lifecycle with resolution summaries; arc-resolution → convergence bridge; derived canon replacing canon-lite behind `getCanon()`. *Done when* arc resolution provably advances convergence and canon regenerates without drift.
- **Phase 6 — Epistemic + ledger.** Per-character knowledge extraction with private injection on `GROUP_MEMBER_DRAFTED`; state ledger sharing gate-relevant fields with the blackboard. *Done when* dramatic-irony fixtures stay perspective-accurate, the responding character sees only their own knowledge, and ledger fields match blackboard qualities.
- **Phase 7 — Studio v2.** Quality editor, gate builder, scope preview, diagnostics. Stories are hand-written JSON until here; this phase makes the format authorable. *Done when* every diagnostic fires on a seeded-error fixture story and a full story is authorable without touching JSON.
- **Phase 8 — Surfacing.** WI/AN writes on change-only cadence, blackboard/memory template variables, debug panel polish, optional budget auto-tune. *Done when* state surfaces without WI churn and authors read scoreboard values in templates.

## Success criteria

On a replayed long transcript, every one an assertion in the harness, none a judgement call:

- A fact established early still constrains the AI late; supersession retires changed facts cleanly (no contradiction survives consolidation).
- Every authored anchor reached, none skipped; a drifting run converges within a bounded horizon.
- At least half of planted arcs resolve; resolutions advance convergence.
- Relationship and flag values track hand-labeled events (exact-match delta suite ≥ 90% live by default, user-tunable).
- Chat mutations (swipe/edit/delete) roll state back correctly — rollback ≡ never-applied, asserted as a layer-1 property.
- Epistemic map stays perspective-accurate on dramatic-irony fixtures.
- Smoothed tension fits the chosen shape above a set threshold.
- Generated beats pass the critic in ≤ 2 rounds almost always; declared arithmetic always verifies.
- Steady-state response path is AI-free: gates deterministic, extraction and generation async on the memory LLM, all effects at turn boundaries.
