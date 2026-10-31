# Progression and pacing research: drama management, experience management, LLM-era beat detection

Angle A (research literature and LLM systems), slug `progression-research`, 2026-10-31. Research only; no code changed.
Question: what do drama management (DM), experience management and recent LLM interactive-drama systems know about
(1) deciding that a story condition has happened, (2) shaping a tension arc, (3) reading what the player intends and
(4) noticing a stuck player, and which of those ideas could become separate, switchable additions to our engine?
Numbers are marked **measured** (ours, in repo), **reported** (a paper's own numbers) or **estimate** (mine).

## 1. Summary

- **Our gate pipeline is already ahead of the published LLM-drama systems on the "has it happened" question.** IBSEN
  and Drama Llama ask a large model one yes/no question about the whole transcript; we split a gate into typed leaves,
  read them in a shared read, cross-check with a calibrated judge (stall pre-check **measured** 85/85, typed read 123/139
  on `jev-1.13.0`), and demand the player's own words for committed choices (`commitGuard.ts`). IBSEN's GPT-class
  checker **reported** precision 0.82 / recall 0.72 / F1 0.77 against humans.
- **The real gap is measurement, not mechanism.** We score delta accuracy per fixture (`so-live-suite`), but nothing
  scores *when* a transition fires in a played transcript: how often it fires early (a false advance the player feels as
  "the story skipped me") or late (lag in messages). Both IBSEN and Drama Llama name timing as their main failure. P1
  adds that floor; every other proposal here needs it.
- **Gated checkpoints have no stuck ladder.** Open stretches escalate gently → steady → strong (`stretch.ts:38`), but a
  gated checkpoint whose stall check answers "nothing shown" (`extractionCoordinator.ts:236`) only records it; the player
  gets no help unless they open "What could I do?". Hint-ladder and accommodation research (Riedl's experience manager,
  adaptive hint systems) supports a graded, turn-counted response that never forces completion (IBSEN force-completes
  after 9 turns; our agency policy forbids that). P2.
- **The expected tension curve is coarse.** `computeExpectedTension` uses visited anchors / all anchors
  (`snapshot.ts:84-86`): a step function, flat inside a checkpoint, and diluted by anchors on branches the run will never
  take. There is no post-peak release (Left 4 Dead's build-up / peak / relax). Human-vs-LLM arc studies **report** that
  LLM prose under-delivers setbacks and climaxes, which is exactly where a steering hint matters. P3.
- **A single-source advance has no confirmation.** A shared-read delta carries no confidence (`types.ts:87-96`); if it
  alone completes an exit gate, the transition fires at the next boundary. Conformal-abstention and calibration work
  argue for a cheap second opinion only at the decision that matters. P4: one judge leaf check (same shape as the stall
  pre-check) only when a delta would fire a transition.
- **We already compute player intent and then throw most of it away.** The divergence call returns a distribution over
  exits but `readDivergence` keeps only `none` (`divergence.ts:131-135`), and it runs only for living stories. A
  PaSSAGE-style "leaning" tally (which exit the player keeps pursuing) would steer the stuck ladder, suggestions and
  encounter order without new calls in living stories. P5.
- **DODM's lasting idea is that interventions have a cost.** We can stack a pacing hint, a pull line, an encounter offer,
  member direction, a one-shot direction and an objective line in one prompt. An intervention budget with an author-only
  ledger is small and measurable. P6.

## 2. Survey

### 2.1 Façade beat manager (Mateas and Stern)

- **Mechanism.** Story = authored beats with preconditions, weights and a tension value. After each beat the beat
  manager picks, among beats whose preconditions hold, the one whose tension best fits an authored target arc (a
  piecewise Aristotelian curve), with "beat goals" and "mix-ins" so a beat can absorb off-topic player input and still
  finish. Story memory = beats done plus affinity outcomes.
- **Sources.** [Mateas and Stern, TIDSE 2003](https://users.soe.ucsc.edu/~michaelm/tenurereview/publications/mateas-tidse2003.pdf);
  [Structuring Content in the Façade Architecture, AIIDE 2005](https://ojs.aaai.org/index.php/AIIDE/article/download/18722/18499).
- **Evidence.** One shipped piece, years of critical attention; ~2,500 joint dialogue behaviours (reported). No
  controlled study of the arc controller itself.
- **Failure modes.** Natural-language understanding was the weak point; players saw "mix-in" deflections as
  stonewalling. Authoring cost per beat was enormous.
- **Relevance.** Our checkpoints are coarse beats; `arc_template` + EMA tension is Façade's arc control done as prompt
  steering instead of beat choice. Façade evaluates tension *inside* beat selection; we only evaluate it at anchors.

### 2.2 Declarative optimization-based DM (Weyhrauch; Nelson, Mateas, Roberts, Isbell)

- **Mechanism.** Plot points + DM actions (hints, denials, causers), each annotated; an author-weighted evaluation
  function scores a whole story (plot-point order, DM action history, features such as "manipulativity", "thought
  flow", "activity"). The DM searches or (later) learns a policy to maximise expected score. TTD-MDP variants aim for a
  target distribution over stories rather than one best story.
- **Sources.** [Nelson et al., IEEE CG&A 2006 preprint](https://www.cs.uky.edu/~sgware/reading/papers/nelson2006declarative.pdf);
  [Authoring with DODM, AIIDE 2006](https://ojs.aaai.org/index.php/AIIDE/article/view/18761);
  [Nelson and Mateas, AAMAS 2008 short paper](https://aamas.csc.liv.ac.uk/Proceedings/aamas08/proceedings/pdf/paper/AAMAS08_0799.pdf).
- **Evidence.** Simulated players on Anchorhead; search did not scale, RL policies did better on the authors' own
  metric. The 2008 paper itself questions whether maximising an experience score is the right goal.
- **Failure modes.** Needs a player model to simulate; evaluation functions are hard to write; manipulation is invisible
  to the metric unless penalised explicitly.
- **Takeaway for us.** Not the optimiser. The **cost accounting**: every DM action counts against the story, so the DM
  intervenes only when it buys something. That maps to P6.

### 2.3 Riedl's experience manager: intervention vs accommodation

- **Mechanism.** A planner holds the story as a causal plan. When the player threatens a causal link, the manager either
  *intervenes* (the action fails or is redirected in-world) or *accommodates* (replans the story around what the player
  did). Later work adds "alibis" so interventions read as natural.
- **Sources.** [Riedl et al., "Dynamic experience management in virtual worlds" (2008)](https://www.cs.uky.edu/~sgware/reading/papers/riedl2008dynamic.pdf);
  [Riedl and Bulitko, "Interactive narrative: an intelligent systems approach", AI Magazine 2013](https://faculty.cc.gatech.edu/~riedl/pubs/aimag.pdf);
  [Intervention alibis through domain revision, AIIDE 2015](https://ojs.aaai.org/index.php/AIIDE/article/view/12827).
- **Relevance.** Our living director's divergence branch is accommodation; the agency policy's "one neutral line and an
  author recovery" for refused routes is a soft intervention. What we lack is the middle case: the player is not
  diverging, just not getting there.

### 2.4 PaSSAGE player modelling (Thue, Bulitko, Spetch)

- **Mechanism.** A vector over Robin Laws' player types (fighter, power gamer, tactician, storyteller, method actor).
  Authored choices and encounter reactions are tagged with type increments; the model accumulates them. At branch points
  the system picks the encounter variant with the best fit to the current vector.
- **Sources.** [Interactive Storytelling: A Player Modelling Approach, AIIDE 2007](https://ojs.aaai.org/index.php/AIIDE/article/view/18780);
  [PaSSAGE demo, AIIDE 2008](https://ojs.aaai.org/index.php/AIIDE/article/view/18705);
  [Thue MSc thesis 2007](https://rise.csit.carleton.ca/pubs/Thue_MSc_2007.pdf).
- **Evidence.** A user study against two fixed-structure versions **reported** higher enjoyment for the adaptive version;
  I could not re-read the effect sizes (PDF unreadable here), and from memory they were modest and group-dependent.
  Treat as weak evidence.
- **Failure modes.** Typologies are coarse; the model needs many tagged choices before it means anything; mis-tagging
  silently biases content.
- **Takeaway.** Do not model "player type". Model *which way forward the player keeps leaning toward* in this visit —
  a much narrower, checkable signal we already compute (P5).

### 2.5 Left 4 Dead AI Director (Valve)

- **Mechanism.** Estimates each player's intensity from damage, nearby deaths, incapacitation; cycles build-up → peak →
  relax, holding a relax window after peaks before building again ("contrast").
- **Sources.** Primary GDC material not re-fetched this round; secondary: [Shacknews on Evolve borrowing the Director](https://shacknews.com/article/82787/how-evolve-assures-action-peaks-and-valleys),
  [modl.ai summary](https://modl.ai/?p=1984). Exact thresholds circulating online are unverified; I use none.
- **Takeaway.** A forced relax window after a peak, not just "steer back toward the curve". Our steering would push to
  escalate again immediately if the curve says so (P3).

### 2.6 LLM-era interactive drama

- **IBSEN** (Han et al., ACL 2024). Director plans objectives; after each actor turn (from turn 5 of an objective) the
  director asks the LLM "is the objective complete?" (JSON `completed` + `reason`); not complete → actors get a synopsis,
  keywords and the objective as guidance; after 9 turns the objective is **force-completed**. Reported: 218 checks, 11
  forced completions over 10 scripts, 5.61 turns per objective, checker P 0.82 / R 0.72 / F1 0.77 vs humans; failures
  cluster where the model "fixates on the objective's wording". [arXiv 2407.01093](https://arxiv.org/html/2407.01093v1),
  [code](https://github.com/OpenDFM/ibsen).
- **Drama Llama** (Sun and Wang, 2025). Storylet triggers written in plain language; after every message the DM checks
  active triggers in order against the full script with a single-token YES/NO, first match fires, one per step (same
  rule as our one transition per boundary). Authors **reported** "detection of triggers did not work as expected" and
  timing jitter from stochasticity; no accuracy number, though they annotated activations. Cooldowns and fallback
  triggers listed as future work. [arXiv 2501.09099](https://arxiv.org/html/2501.09099v1); follow-up
  [Dramamancer (I3D 2026)](https://mkremins.github.io/publications/Dramamancer_I3D2026.pdf).
- **From Role-Play to Drama-Interaction** (Wu et al., 2024) and **Towards Enhanced Immersion and Agency** (Wu et al.,
  ACL 2025). Scenes advance when trigger conditions are met; a "plotline" field steers characters back on target when
  the player wanders. Plot-based reflection every k=5 moments may adjust **one** incomplete plot or insert **one** new
  plot, because larger edits caused incoherence (reported). [arXiv 2405.14231](https://arxiv.org/html/2405.14231v1),
  [arXiv 2502.17878](https://arxiv.org/html/2502.17878v2). Our living director's ≤-bounded ops already match this.
- **Tension measurement.** Human vs GPT-4 story arcs: human stories hold higher suspense, the gap widening after the
  midpoint; LLMs set up well but under-deliver setback and climax ([arXiv 2407.13248](https://arxiv.org/pdf/2407.13248)).
  LM suspense ratings vs humans: binary presence >78% accuracy (reported), weaker on gradual build-up
  ([arXiv 2508.15794](https://arxiv.org/html/2508.15794v1)). Forecast-based tension ("100 endings": tension = how often
  forecasts of the ending miss) reverses LLM-judge rankings of AI vs human fiction
  ([arXiv 2604.09854](https://arxiv.org/abs/2604.09854)); far too expensive per turn, possibly useful offline.

### 2.7 Judging conditions reliably with small models

- **Calibration.** Chat-model token probabilities are miscalibrated but still rank correctness; ~20 labelled examples
  suffice to pick an abstention threshold (Plaut et al., TMLR 2024, [arXiv 2402.13213](https://arxiv.org/html/2402.13213v3)).
  Conformal abstention sets a threshold with a coverage guarantee from a small calibration set
  ([arXiv 2405.01563](https://arxiv.org/html/2405.01563v1)).
- **Patterns that recur** (from the systems above plus dialogue-state-tracking practice): decompose the condition into
  atomic questions (we do: leaves); ask about a bounded window, not the whole script (we do); require quoted evidence
  (we do, plus commit guard); spend the second opinion only at the decision point (we do for stalls, **not** for
  advances); abstain into "not yet" rather than guessing (we do via `genuine`/`reread`). DST's classic failure is error
  propagation from carried state, fixed by periodic full re-reads (our reconciliation every 3 boundaries past target).
- **Hint systems.** Adaptive hint work on puzzle games detects "stuck" from time-without-progress and escalates hint
  specificity, because frustration grows with stuck duration ([Hao et al. 2022](https://faculty.washington.edu/weicaics/paper/papers/HaoHZC2022.pdf)).
  Wall-clock signals are not rollback-safe for us; player turns are.

## 3. Mapping to us

What we have (verified in code 2026-10-31):

- **Selection.** `selectFiring` = first outgoing transition whose gate holds, priority order (`transitions.ts:5-7`);
  one per boundary inside `BOUNDARY_STEPS` (`engine.ts:103`). Gates are pure boolean over the blackboard (`gates.ts:31`).
- **Detection.** Shared read writes deltas with quoted evidence and no confidence (`extraction/types.ts:87-96`); typed
  judged read for author-marked values, accept at p ≥ 0.8 (`judge/policy.ts:105`); commit guard for player-commit
  values (`extraction/commitGuard.ts`).
- **Stall.** `planReconciliation` fires when turns in checkpoint ≥ max(ceil(target_turn_length × multiplier), 6) and every
  3 boundaries after (`extraction/reconcile.ts:78-80`); judge pre-check writes direct values at p ≥ 0.95, calls it
  genuine below 0.1, else LLM re-read (`judge/extraction.ts:258-268`, `policy.ts:108-109`). Genuine stall only marks the
  reconciliation event (`extractionCoordinator.ts:236`). Measured: stall 85/85, typed 123/139 (`test/goldens/judge/stall.json`,
  `typed.json`, recorded 2026-09-19; readiness `readinessRows.ts:74,87`).
- **Stuck help.** Open stretches: pull stages by player turns (`engine/stretch.ts:38`), encounter offers when the quiet
  read holds (`pacing/quiet.ts:43-46`, returns null outside open stretches). Gated checkpoints: idle check (low-change,
  low-tension replies → reviewed hint), "What could I do?" suggestions on demand (`runtime/suggestions.ts:35`).
- **Intent.** Divergence: per player commit turn, a `choice` over exits + `none`, plus a `commits` question
  (`generation/living/divergence.ts:113-129`); only `none` survives `readDivergence`; runs only when living is enabled
  (`runtime/livingWiring.ts:67-69`). Calibration **not measured** (`readinessRows.ts:169`).
- **Arc.** EMA of read tension; expected = template at visited anchors / total anchors (`runtime/snapshot.ts:80-87`);
  steering hint escalate/hold/ease at drift 0.3, strong at 0.5 (`pacing/steering.ts:17,51-60`,
  `constants/defaults.ts:4`).

Real gaps:

1. No played-transcript timing measurement of transitions (early / late).
2. Genuine stall in a gated checkpoint leads nowhere player-facing.
3. Expected tension is flat within a checkpoint, path-blind, has no relax window.
4. Single-source advances are unconfirmed (latching values especially: a wrong latch holds until rollback).
5. Intent distribution is discarded and absent in non-living stories.
6. No cap on how many steering directions stack in one prompt.

Fit with constraints: everything below is code over existing signals or one bounded judge question; no new loud
generation; nothing moves the per-turn prefix except P3/P6 which change the pacing tail block (already per-turn, below
the cache boundary per v3.0 A0; confirm with a `so-payload-golden prefix` run).

## 4. Proposals (ranked)

### P1. Transition timing floor (measurement first) — S-M, CPU for offline arm, GPU for the live arm

- **Change.** New labelled corpus `test/fixtures/timing/*.timing.json`: a recorded transcript (synthetic or public
  fixtures only, no campaign text), its story, and per exit the gold first message index at which a human says the gate
  is satisfied (or "never"). New scorer (`scripts/debug/so-timing.mts`, lazy, harness-only) replays the transcript
  through the real extraction + boundary pipeline on a lane (class R replay of recorded model answers for CI; live model
  for the real arm) and reports per exit: `early` (fired before gold), `late` (lag in player turns), `missed`,
  `spurious` (fired with gold "never"), and which source wrote the deciding delta (shared read, typed judge, stall judge).
- **Cost.** Zero runtime cost. Live arm = one played replay per fixture (GPU minutes).
- **Invariants.** None touched.
- **Floors (predeclared, informational).** spurious ≤ 1/40 exits; early ≤ 2/40; median late ≤ 1 player turn; missed ≤
  2/40. Separate counts per source.
- **Why first.** IBSEN's F1 0.77 and Drama Llama's complaint are both timing; we have no number for our own pipeline,
  and P2/P4 trade earliness against lateness.

### P2. Stuck ladder for gated checkpoints — M, GPU for rating

- **Change.** Generalise `quietRead` beyond open stretches (watched qualities = outgoing gate keys, as today). New pure
  `pacing/stuck.ts`: stage = f(player turns in visit, quiet holds, last stall verdict `genuine`). Stages:
  (1) *notice*: no prompt change, the HUD status chip offers "What could I do?" (existing card, no generation);
  (2) *hook*: one line in the guidance tail, "let one character or event point toward <exit intent>" (exit text from
  `exitDescriptions`, resting-filtered, checkpoint names never ids) — pick the exit from P5's leaning, else the
  highest-priority exit; (3) *press*: the strong pull wording ("the world presses toward …") once per visit.
  Never force completion, never narrate the player (the existing `playerClause`), reset on any watched-quality move.
  Author opt-out `agency.stuck: false` per checkpoint; on by default.
- **Cost.** No extra model calls (reuses stall verdict); a few dozen tokens in the tail when active.
- **Invariants.** Stage is derived from log + player turn ids, so rollback ≡ replay; no blackboard write. Held secrets:
  exit text passes the resting filter; a gate whose rubric names an undisclosed entity is skipped (`knownEntities`).
- **Measure.** Scenario (no-model) for stage derivation and reset; payload golden armed vs not; blind Sol rating of
  ≥ 20 stuck states vs control: "player helped without being decided for" ≥ 15/20, "decides for player" ≤ 1/20; P1
  `late` median improves, `early` does not worsen. Overlaps talk-opus P8 (idle nudge via spotlight); this one keys on
  gate state, adds no generation, and could feed P8 if that is built.

### P3. Path-aware expected tension with in-checkpoint ramp and post-peak relax — S, GPU for rating

- **Change.** In `computeExpectedTension` (`snapshot.ts:80`): progress = visited anchors / (visited + anchors on the
  shortest remaining path to an ending), plus an in-checkpoint fraction min(1, player turns / target_turn_length) scaled
  to that checkpoint's share. In `pacing/steering.ts`: after smoothed ≥ critical for ≥ 2 boundaries, hold expected at
  ≤ tense for N boundaries (relax window, default 3) unless the author's arc point is a peak. Pure functions, switch
  `pacing.arcProgress: "anchors" | "path"` default `path`.
- **Cost.** Zero model calls; graph shortest path once per story load (memoised by story hash).
- **Invariants.** Pure; expected tension is not persisted state (recomputed), so replay holds.
- **Measure.** Jest on curves for branchy fixtures; payload golden diff on the pacing tail; blind Sol rating on matched
  states for "climax lands" / "constant escalation" flags. Literature predicts the climax region benefits most.

### P4. Confirm before advance — S-M, CPU (judge is remote TypeSafe) + P1 to evaluate

- **Change.** When a shared-read batch contains a delta that, applied alone, flips some outgoing gate of the active
  checkpoint from false to true, and that delta has no judge p (not typed, not stall), ask the judge the stall leaf
  question for just those leaves (`buildStallRequest` shape, already calibrated) before enqueueing. p ≥ 0.8: enqueue as
  today. p < 0.1: hold the delta as `unconfirmed` in the audit (author sees it; reconciliation can still write it later).
  In between: enqueue (do not block on doubt; the judge never blocks). Latching qualities use the stricter path by default.
  Judge off or failing → today's behaviour.
- **Cost.** One judge call (~250 ms p50 **measured** for stall) only on advancing reads; estimate 1 call per checkpoint
  visit. Adds latency only off-path; the delta still applies at the next boundary.
- **Invariants.** One transition per boundary unchanged; the judge result is recorded in the audit so replay re-uses it;
  RunOwnership check after the await (ownership census row `checked`).
- **Measure.** P1 `spurious`/`early` must drop and `late` must not rise by more than 1 turn; extend `stall.json`
  calibration with "shown vs not shown" pairs drawn from advances.

### P5. Exit leaning (keep the intent distribution) — S, CPU

- **Change.** `readDivergence` keeps the full exit probability map; a pure `leaning` accumulator per visit (decayed sum
  over commit turns, keyed by checkpoint + visit start) lives in the existing divergence slice. Consumers: P2 picks the
  hooked exit; suggestions prompt orders ideas toward the leaning exit; author console shows "player leans toward …".
  Optional switch `judge.uses.divergence` for non-living stories (one judge call per player commit turn; **estimate**
  ~250 ms off-path) — off unless the owner wants it, since living stories already pay it.
- **Invariants.** Rolled back with the divergence slice (already keyed by turn); no prompt text unless P2 is on.
- **Measure.** Owed divergence calibration doubles as this: label 40 windows with the exit pursued; floor top-1 ≥ 0.8.

### P6. Intervention budget and ledger — S-M, GPU for rating

- **Change.** A pure arbiter in `pacing/` ranks the per-turn steering candidates (pacing hint, pull/stuck line,
  encounter offer, idle/adversity/tone notes, objective line) by specificity and freshness and admits at most K (default
  2) into the tail, always keeping one-shot directions and member direction. Each admitted line is recorded per boundary
  (author-only `extras.pacing.interventions`, capped ring) with why it won. Inspired by DODM's manipulation cost.
- **Cost.** Fewer tokens. **Risk.** Dropping a line that mattered; the ledger makes this visible.
- **Measure.** Count directive lines per payload across a lane replay (before/after); blind Sol rating for "steered
  tone feels heavy-handed" flags; P1 unchanged.

## 5. What we do that the field does not, and rejected ideas

Ours, not seen in the surveyed systems:

- Typed leaf decomposition with per-leaf calibrated judge checks, and a judge that never blocks or writes outside its
  calibrated uses.
- Player-commit evidence in the player's own words (commit guard). Every surveyed LLM system lets an NPC's narration
  complete a player's choice.
- Rollback ≡ replay over transitions; IBSEN and Drama Llama cannot undo a misfired trigger.
- Divergence that branches and returns (bounded living ops), with an explicit agency policy instead of force-completion.
- Per-member privacy of held secrets inside all steering text.

Rejected:

- **Force-completing a stuck objective after N turns** (IBSEN). Breaks agency; P2 escalates pressure instead.
- **Optimiser or RL drama manager** (DODM). Needs a player simulator and an evaluation function per story; the cost-
  accounting idea survives as P6.
- **Player-type modelling** (PaSSAGE's Laws types). Too coarse and slow to converge in 30-turn visits; P5 models exit
  leaning instead.
- **Plain-language triggers checked over the whole script** (Drama Llama). That is our older shape; typed leaves with
  windows are better and measured.
- **Per-turn forecast-based tension** (100 endings). Many generations per sentence; at most an offline rater signal.
- **Wall-clock idle detection** for stuck players. Not rollback-safe; owner may simply be reading (also rejected in
  the 2026-10-26 talk review).
- **Local NLI cross-encoder for gate checks.** Plausible CPU check, but needs a model download OK; parked with the memory
  shortlist's reranker.

## Unresolved questions

- Who labels the P1 timing corpus (Sol on synthetic transcripts, then spot-check), and how many exits is enough (40?).
- P4 hold threshold: reuse 0.1 (`STALL_GENUINE_P`) or calibrate a separate advance threshold on P1 data first?
- P5 for non-living stories: worth a judge call per commit turn, or only consume it where living already pays?
