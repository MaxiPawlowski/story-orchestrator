# Director research: LLM story planning and generation

Angle A (research literature and LLM systems), 2026-10-31. Mechanic: the living director, which writes the story's
future graph at boundaries (new `liv_` anchors, stubs, transitions, chapters, branches), plus the expansion
planner/critic. Research only; no code changed. Sources are linked inline. Numbers are marked **measured** (ours, with
a record), **reported** (a paper's own numbers) or **estimate**. Where only an abstract or secondary summary was read,
that is said.

## 1. Summary

- **We already have the neuro-symbolic shape the field is moving toward.** The LLM proposes one typed anchor; code
  checks it (`checkDirectorOps`: no impossible or open-on-arrival gate, only `liv_` ids, frontier-only writes, at most 2
  new qualities), a regex guard refuses narrated player acts and restated secrets, and an LLM critic reviews it. Wang
  and Kreminski (2025) find LLMs are causally sound only at small scale and need external verification; Drama Llama's
  users found free natural-language triggers unreliable. Our narrow, code-checked `opens_when` is the right call.
- **Gap 1, the director's critic is the weakest link and the cheapest fix.** It is one free-form LLM yes/no
  (`direct.ts:131`). Our own spike: run 0 refused **5 of 9** critic calls, many wrongly (a dog's movement read as the
  player's); after a prompt revision run 2 passed 11 of 14 (**measured**, `v2.8/22` §M1). FlawedFictions shows
  frontier models near random at whole-story consistency checks on long text (**reported**). The expansion chain
  already has the better pattern: atomic judge questions plus a code verdict and a code pick (`judge/expansion.ts:70,
  83`). The director doesn't use it.
- **Gap 2, one candidate, no choice.** The director writes one anchor per call. LLM plots are measurably homogeneous
  (Sui Generis, PNAS 2025: human stories score significantly higher on plot uniqueness than GPT-4/Llama-3 ones,
  **reported**). The expansion already draws variants and picks by code. Best-of-k with a code-scored pick (thread
  coverage, novelty against the path, tension fit) is a natural switch.
- **Gap 3, no plan above the next anchor.** Re3, DOC, Dramatron, IBSEN and StoryVerse all plan in layers (log line,
  then acts or outline, then scenes). DOC beat Re3 by **+22.5** plot coherence and **+28.2** outline relevance in
  pairwise human judgments (**reported**). Our director sees the path, canon and open threads, and nothing about where
  the chapter is going. A frozen, author-only **chapter spine** (dramatic question plus 3-5 abstract beats, world side
  only) fits the "one anchor at a time" rule.
- **Gap 4, setups are never tracked to their payoff.** CFPG (2026) turns foreshadowing into checkable predicates. Only
  setups whose trigger holds become eligible, and a verifier retires a setup once its payoff lands (**reported**, abstract
  and summaries only). Our gates and latches can express exactly that. Today a director anchor can plant something that
  no later anchor ever pays off.
- **Gap 5, motivation is not checked.** In Wang and Kreminski, GPT-4-class plans that failed on intentionality were
  often causally valid but gave characters invented motives (**reported**, summary). The director prompt lists each cast
  member's drive, but nothing asks the anchor to name whose want drives it, or which earlier event causes it.
- **Mythic-style structure is already built** (scene test, v2.8 48, `sceneTest.ts:80`), and so is spoiler-safe focus
  (`pacing/focus.ts:38`). This angle adds nothing there except one small weighting idea (§5).

## 2. Survey

### 2.1 Hierarchical planning: Re3 and DOC (Yang, Klein, Peng, Tian)

- **Mechanism.** Re3 runs plan, draft, rewrite and edit: a premise, a setting, characters and an outline go into every
  drafting prompt, then a reranker and an editor check relevance and consistency. DOC adds a **detailed outliner**,
  which expands a brief outline into a deeper tree, and a **detailed controller**, which keeps each passage faithful to
  its leaf.
- **Sources.** [Re3, EMNLP 2022](https://arxiv.org/abs/2210.06774);
  [DOC, ACL 2023](https://arxiv.org/abs/2212.10077).
- **Evidence (reported).** DOC beat Re3 by +22.5 on plot coherence, +28.2 on outline relevance and +20.7 on
  interestingness in pairwise human judgments. The controller raised leaf faithfulness from 37.8% to 58.5%, so even with
  control about 4 in 10 passages drift from the plan. Humans judged DOC more controllable in interactive use.
- **Failure modes.** Rigid outlines suit non-interactive prose. With a player, the outline must bend. The rewrite step
  edits the past, which we cannot do (rollback ≡ replay).

### 2.2 Dramatron (Mirowski et al., DeepMind)

- **Mechanism.** Hierarchical prompting goes from a log line to characters, a plot (scene summaries with beats),
  locations and dialogue. Writers can go back up a level and regenerate, and the change cascades down.
- **Sources.** [arXiv 2209.14958](https://arxiv.org/abs/2209.14958),
  [code](https://github.com/google-deepmind/dramatron).
- **Evidence (reported).** A qualitative study with 15 theatre and film professionals. Output was called "formulaic"; it
  was useful for world building and for exploring alternatives, and it needed detailed log lines to start.
- **Relevance.** The log line plays the part of our premise. What we lack is the middle layer (a plot of beats).

### 2.3 Agents' Room (Huot, Amplayo et al., DeepMind)

- **Mechanism.** Planning agents (conflict, character, setting, plot) write to a shared scratchpad, and only writing
  agents produce text. An orchestrator picks the next agent.
- **Sources.** [arXiv 2410.02603](https://arxiv.org/abs/2410.02603) (ICLR 2025 poster per the authors' slides).
- **Evidence (reported, from summaries).** Variants with planning plus writing agents beat end-to-end baselines in human
  ratings of plot, creativity, development and language.
- **Relevance.** The gain comes from making intermediate decisions explicit (conflict, who wants what) before writing.
  We can get much of it with structured fields in one call instead of four agents.

### 2.4 IBSEN (Han et al., ACL 2024)

- **Mechanism.** A director agent holds plot objectives per act, instructs actor agents, checks after each turn whether
  an objective is reached and reschedules when a human player deviates.
- **Sources.** [arXiv 2407.01093](https://arxiv.org/abs/2407.01093), [code](https://github.com/OpenDFM/ibsen).
- **Evidence (reported).** Complete, diverse scripts from a rough objective list (7 acts, 14 objectives in the eval);
  later summaries say character consistency holds only "to a certain extent".
- **Relevance.** It is our checkpoint model (objectives as gates) with a director that keeps a list of objectives
  ahead. That list is the chapter spine below.

### 2.5 StoryVerse (Wang, Zhou, Ledo, FDG 2024)

- **Mechanism.** The author writes **abstract acts** (high-level plot steps with conditions). An Act Director
  instantiates them into concrete character actions against the current world state, through LLM narrative planning.
  Its output is called "living stories".
- **Sources.** [arXiv 2405.13042](https://arxiv.org/abs/2405.13042).
- **Relevance.** Abstract acts are authored intent that survives improvisation, which is our hybrid `authored_until` idea
  taken one level up. An author could write the spine (P3) and let the director instantiate it.

### 2.6 WHAT-IF (Huang, Martin, Callison-Burch, 2024)

- **Mechanism.** It turns a linear plot into a branching game. It extracts key decisions, meta-prompts the LLM to
  write story-specific "what if" questions, branches at each decision, then **merges branches back** into the main plot
  tree (stored as a graph).
- **Sources.** [arXiv 2412.10582](https://arxiv.org/abs/2412.10582).
- **Relevance.** This is our branch-and-converge (`buildBranchOps`, `plan.ts`, converge to an anchor). It confirms the
  shape and offers nothing we lack, except that it branches at **authored key decisions** rather than on measured
  divergence. Our divergence judge is the more player-led variant.

### 2.7 Drama Llama and Dramamancer (Sun, Wang et al., 2025)

- **Mechanism.** These are LLM storylets with natural-language trigger conditions and natural-language actions, and
  an LLM checks whether a trigger holds.
- **Sources.** [Drama Llama, arXiv 2501.09099](https://arxiv.org/abs/2501.09099);
  [Dramamancer (UIST 2025 demo)](https://johnr0.github.io/assets/publications/UIST25-dramamancer-demo.pdf).
- **Evidence (reported).** Flexible and engaging, but a participant said "detection of triggers did not work as
  expected".
- **Relevance.** This supports our narrow `opens_when` (one observable yes/no rubric, code-checked to be not already
  true and not impossible), and keeping the rubric short (`LIVING_MAX_RUBRIC_CHARS`).

### 2.8 Narrative planning with LLMs (Wang and Kreminski, CoG 2025)

- **Mechanism.** A benchmark scores LLM-written plans for causal soundness, character intentionality and dramatic
  conflict.
- **Sources.** [arXiv 2506.10161](https://arxiv.org/abs/2506.10161) (abstract and summaries read).
- **Evidence (reported).** GPT-4-class models are causally sound at small scale and drop as problems grow.
  Intentionality and conflict are hard for one-off prompting, and reasoning models do better. Failed intentionality
  cases were often valid plans with **invented motivations**. External verification helps "at substantial token and
  time cost". Symbolic planners (Glaive) are still faster and more diverse for real-time play.
- **Relevance.** The director already runs on a reasoning model (Sol). The cheap lever is to make causality and motive
  explicit fields that code can check (P5).

### 2.9 Plot-hole detection: FlawedFictions (Ahuja, Sclar, Tsvetkov, 2025)

- **Mechanism.** A benchmark of stories with planted continuity errors, posed as classification ("is there a hole?")
  and localization.
- **Sources.** [arXiv 2504.11900](https://arxiv.org/abs/2504.11900).
- **Evidence (reported, from abstract).** Most frontier models struggle. Longer stories are much worse
  (FlawedFictionsLong is near random), and a larger reasoning budget did not help. LLM generation and summarization
  **introduce** more plot holes than human text does.
- **Relevance.** A single "does this contradict the canon?" critic over a growing canon is the hard version of the
  task. Atomic questions against a short, specific fact list are the tractable version (our expansion judge already
  asks it that way, `judge/expansion.ts:38-41`).

### 2.10 Foreshadowing and payoff: CFPG (Yun et al., 2026)

- **Mechanism.** Setups become **executable causal predicates**. Only foreshadows whose trigger holds join an active
  set. The model writes conditioned on eligible payoffs, and a verifier detects a realized payoff and retires the setup.
- **Sources.** [arXiv 2601.07033](https://arxiv.org/abs/2601.07033),
  [code](https://github.com/LongfeiYun17/CFPG) (abstract and summaries only).
- **Evidence (reported).** On 629 BookSum pairs (mean payoff distance 20.9 sentences), with a Should-Payoff rate above
  0.96 under oracle timing. They claim large gains over plain prompting. Unverified against the full paper.
- **Relevance.** Our engine already has typed predicates (gates over qualities), latches and a boundary log. A setup
  ledger is a small extension of what anchors carry.

### 2.11 Plot diversity: Sui Generis (Xu et al., PNAS 2025)

- **Mechanism.** It samples many continuations of a story prefix and scores how unique each actual plot element is
  among them.
- **Sources.** [arXiv 2501.00273](https://arxiv.org/abs/2501.00273).
- **Evidence (reported).** Human stories score significantly higher than GPT-4 and Llama-3 stories. Scoring across
  models raises scores only slightly, so the homogeneity is shared between models. The score correlates moderately with
  human surprise.
- **Relevance.** A director that always takes the first sample converges on the obvious next beat. Sampling k and
  picking for novelty against the path is the cheapest counter. The full metric is too expensive at runtime but usable
  offline.

### 2.12 Player-driven emergence (Peng et al., CoG 2024)

- **Mechanism.** It converts player logs into strategy graphs and compares them with the designer's graph. "Emergent
  nodes" are the player strategies the designer did not anticipate.
- **Sources.** [arXiv 2404.17027](https://arxiv.org/abs/2404.17027).
- **Evidence (reported).** 28 players; the players with the most emergent nodes favoured discovery play. The authors
  suggest feeding emergent nodes back to designers.
- **Relevance.** This is the offline twin of our divergence judge plus "Save this run as a story". It offers a
  measurement idea (§4, P2 floor), not a runtime change.

### 2.13 Mythic GME and oracle randomness

Covered in `v2.8/27-gamification-report.md`, `gamification-research/mythic-gme-support.md`, plan 48 (built: seeded
expected/altered/interrupt, chaos from tension, frozen per frontier) and plan 49 (focus pick built; complication pool
gated on SP6). This angle adds nothing beyond §5's list weighting.

## 3. Mapping to us

| Field technique | What we have (paths) | Real gap |
|---|---|---|
| Code verifier on LLM plans | `checkDirectorOps` (`living/plan.ts`), `gateImpossible`, open-on-arrival check; expansion `runCodeChecks` with route enumeration (`critic.ts`, `paths.ts:20` cap 256) | none; this is ahead of most systems |
| Atomic judge critic + code verdict | expansion only: `buildChainRequest`/`judgeVerdict`/`pickChain` (`judge/expansion.ts:30,70,83`), readiness lists only `expansionCritic` (`judge/readiness.ts:97`) | the director critic is one free-form LLM call (`living/direct.ts:131`); an unreadable verdict counts as a pass (`UNREADABLE_VERDICTS`, `direct.ts:13,138`) |
| Best-of-k + pick | expansion variants (`VariantRecord`, `generation/types.ts:79`) | the director writes 1 candidate; 2 attempts are retries, not alternatives (`DIRECTOR_ATTEMPTS`, `direct.ts:11`) |
| Hierarchical plan (outline, acts) | premise, path (last 8, `prompt.ts:42`), canon, open threads (last 10), cast drives, tension suggestion from `arc_template`, chapter counts | no layer between premise and next anchor; no dramatic question per chapter |
| Setup/payoff tracking | open arcs (memory) and promises reach the director; `builds_on` names a thread | nothing records what an anchor planted or requires a payoff before `final` |
| Causality / intentionality | cast `drive` listed in the prompt; `builds_on` free text | neither `builds_on` nor any motive is checked against existing items (unlike `advances`, which must copy a thread exactly, `sceneTest.ts:122`) |
| Branch and merge | `buildBranchOps` with converge-to-anchor, one branch per checkpoint, divergence judge (`living/divergence.ts`) | none |
| Oracle randomness | scene test (`sceneTest.ts:80`), seeded focus (`pacing/focus.ts:38`) | none |
| Recent context | branch prompt gets the latest messages; anchor prompt gets canon only (`DirectorInput`, `prompt.ts:20`) | intentional (canon is filtered); no change proposed |

Constraints that shape every proposal:

- **Authoring model is remote** (Sol on opencode, subscription). Director calls do not use the 3090. Extra director
  tokens cost latency off-path, not GPU time, so best-of-k is cheap in the resource that matters.
- **The judge refuses uncalibrated uses.** Any new judge use needs a calibration row for provider × model × use before
  it routes. Until then it falls back (here, to the LLM critic).
- **Rollback ≡ replay.** Anything the director plans must be frozen at its planning event (the scene-test pattern:
  keyed by chat + story + frontier + `plannedAt`, dropped by `plannedAt`, read on regenerate, never re-rolled).
- **Privacy.** Spine, setups and motives can mention cast plans. They must pass `guardDraft`'s `restatesSecret`, stay
  author-only, and never reach a player surface (`livingSpoilers.review.test.ts` is the guard to extend).
- **Agency.** Nothing may narrate or decide the player's act. A spine is world pressure only and is outranked by the
  player's open threads in the prompt order.

## 4. Proposals (ranked)

Each is its own switch, on by default per the owner rule, with its floor informational.

### P1. Atomic judge critic for the director (`living.judge_critic`) — size S-M, no GPU

- **Change.** Add `judge/director.ts`, modeled on `judge/expansion.ts`. Its nouls, over a short state (the frontier
  line, the anchor name and objective, the cast including the player, up to N canon facts, the open threads):
  1. *player-act*: does the objective decide what the player does, says, chooses or feels?
  2. *contradicts*: does it contradict a listed fact?
  3. *outcome-name*: does the name state how the scene ends?
  4. *new-person*: does it name someone outside the cast?
  5. *follows-thread*: does it follow one of the listed threads or the frontier?

  A code verdict combines them with thresholds in `judge/policy.ts`, and the issues are composed in code. Route it
  through `critique()` in `living/direct.ts` the way `runCritic` takes `judgeCritic` (`critic.ts`). Fall back to
  today's LLM critic when the judge is unavailable or the use is uncalibrated. Separately, an unreadable LLM verdict
  should count as "unknown, retry" rather than pass.
- **Why.** Our own measured false refusals (5 of 9, then 3 of 14 failed). FlawedFictions shows that whole-text
  consistency yes/no answers are weak, and that atomic, short-context questions are the tractable form. The expansion
  already shipped this pattern.
- **Cost.** One judge call (TypeSafe, ~250-650 ms per `gotchas.md`) replaces one remote LLM call of up to 384 tokens.
  Neutral to slightly cheaper. **Estimate.**
- **Invariant risk.** Low: the judge never writes; the verdict only gates a proposal. A new use name needs readiness and
  settings rows and a calibration row.
- **Measure.** Label the 22 recorded director answers plus the 9 run-0 critic cases from
  `test/goldens/live/living-director/` (human or delegated Sol labels: real player act vs cast act). Floors: player-act
  recall ≥ 0.9 and false refusal ≤ 0.15 on that set. Replay it in jest as goldens (like `directorGoldens.test.ts`). The
  live row stays M21.

### P2. Director variants with a code pick (`living.variants`, k=2-3) — size M, no GPU

- **Change.** Ask for k candidates: one call returning a JSON array (cheaper, but the candidates correlate), or k calls
  on a varied seed line (an estimate says these are more diverse). Run each through parse, `buildDirectorOps`,
  `checkDirectorOps`, `guardDraft` and the critic (P1 when on). Score the survivors in code:
  - thread coverage: `builds_on` copies an open thread exactly;
  - novelty: 1 minus the maximum word-set Jaccard of the name and objective against the last 8 path anchors and the
    rejected proposals for this frontier;
  - tension fit: distance from `suggested`;
  - the P1 judge's `follows-thread` p when present.

  Break ties with a seeded draw keyed like the scene test. Freeze the pick and keep the other variants on the proposal,
  so the author's "Write it again" can offer the runner-up without a new call.
- **Why.** Sui Generis: LLM plots are homogeneous and the first sample is the most predictable. Dramatron's
  "formulaic". The expansion already does variants plus `pickChain`.
- **Cost.** k× director tokens (≤1024 output each) on the remote authoring model, off-path. Latency is +0 for the
  parallel calls and about +1.5 s per extra serial call (median call measured at 1.4-1.5 s in M1). **Estimate.**
- **Invariant risk.** Determinism: the pick must be code plus a seeded draw, with model answers frozen in the proposal;
  regenerate reads the frozen set. Rollback drops proposals by boundary as today.
- **Measure.** Offline with the M1 harness (lane-free coordinator, synthetic premise and hybrid stories). Score novelty
  across 7-pass runs, k=1 vs k=3, with an offline Sui-Generis-lite: sample 5 alternatives per frontier and measure the
  picked anchor's overlap. Then blind Sol pairs (M24 pack) "which run reads less predictable and still coherent". Floor:
  a pairwise preference ≥ 60% for k=3, with no rise in refusal rate.

### P3. Chapter spine (`living.spine`) — size M, no GPU to build; GPU for the play floor

- **Change.** When the director opens a living chapter (`planChapter` creates `liv_ch_<n>`), one extra call writes a
  private spine: a dramatic question (one sentence, world side) plus 3-5 abstract beats (situation headings, never
  outcomes, never player acts). It is checked by `guardDraft` and by the `narratesPlayer` regex on every field. It is
  stored in `extras.living.spines` keyed by chapter id and `plannedAt`, frozen, and dropped on rollback before
  `plannedAt` (the `dropSceneTestsAfter` pattern).

  Each anchor prompt gets one block, placed **after** open threads: "Where this chapter is heading (soft; the player's
  threads come first): …". The anchor JSON gains `spine_beat` (an index or null), checked in code. In a hybrid story an
  author may write the spine (StoryVerse abstract acts) as a `living.spine` field, validated like any story field.
  Author-only: the Author console's living panel shows it, and no player surface reads it.
- **Why.** Every layered system (Re3, DOC, Dramatron, IBSEN, StoryVerse) plans at least one level above the scene. DOC
  measured large coherence gains (+22.5, **reported**) from a deeper outline plus a controller. IBSEN's director holds
  objectives ahead and reschedules on player deviation, which our branch path already does.
- **Cost.** +1 remote call per chapter (3-5 anchors), about +200 prompt tokens per anchor call. **Estimate.**
- **Invariant risk.** Railroading: mitigated by the prompt order, the soft wording, `spine_beat: null` being legal, and
  divergence branches that ignore the spine. Privacy: it can paraphrase cast plans, so it gets the same secret guard
  and an extension of `livingSpoilers.review.test.ts`. Bundle: rides the lazy living chunk.
- **Measure.** The M1 harness for the plumbing (refusals, spine-beat coverage). Blind Sol pairs of chapter excerpts,
  spine on vs off, for "does the chapter build toward something" (M24-style). Floor: a preference ≥ 60% with no rise in
  the critic's player-act refusals. The real-play floor needs the Artemis reply model (GPU), batched into the final
  suite.

### P4. Setup/payoff ledger (`living.payoffs`) — size M, no GPU to build

- **Change.** The anchor JSON may declare `plants`: at most 1 world-side element ("a sealed letter the steward keeps")
  with an optional trigger (reuse a gate, or count toward the 2-quality cap as a new extractor bool). Store it on the
  `add-checkpoint` op payload, so rollback and fold carry it with no new slice.

  The director prompt gets "Planted and now ready to pay off" (setups whose trigger holds or which are older than K
  anchors) and "Still planted" lists. The anchor JSON may set `pays_off` to one ready setup, copied exactly and checked
  in code like `advances`. With `ending: director-proposes`, `final: true` is refused while more than N setups are
  unpaid (N=1 default). With a required ending it is only a prompt line. Author view shows planted vs paid.
- **Why.** CFPG: LLMs leave Chekhov's guns unfired even with the context present. Predicate-gated eligibility plus
  verification fixes most of it (**reported**). The engine already has the predicate machinery.
- **Cost.** About +100 prompt tokens per call and no new calls. **Estimate.**
- **Invariant risk.** Low. It is derived from ops (rollback ≡ replay holds by construction) and the setup text passes
  `guardDraft`. The risk is over-constraining the ending; it stays soft except on `director-proposes`.
- **Measure.** Count in the M1 harness: setups planted, setups paid, mean distance in anchors, and unpaid at final.
  Floor: ≥ 60% of setups paid within 4 anchors in 7-pass premise runs. Deterministic replay goldens.

### P5. Cause and motive fields with a code check (`living.causal`) — size S, no GPU

- **Change.** The anchor JSON gains two fields. `because` copies one existing item exactly: a path anchor name, an
  open or resolved thread, or a canon line id. `driven_by` names a cast member whose listed drive or agenda pushes this,
  or "world" for an event nobody wants. Code checks both, the way `sceneAnswerIssues` checks `advances` (exact copy,
  case-insensitive), with a retry on mismatch. The fields are never shown to the player. They join the author's reason
  line.
- **Why.** Wang and Kreminski: intentionality failures are invented motives in otherwise valid plans. Agents' Room's
  gain comes from explicit conflict and character decisions before writing. This forces both into checkable fields at
  near-zero cost.
- **Cost.** About +40 output tokens per call. It may raise first-attempt refusals: measure with the M1 harness. Refusal
  stage "ops". **Estimate.**
- **Invariant risk.** `driven_by` naming a cast member's private plan could hint at a secret. Mitigation: it holds a
  name only, never text, and it never leaves the author view.
- **Measure.** M1 harness: first-try pass rate (floor: no worse than run 2's 11 of 14 by more than 1). Blind Sol on "do
  characters act for reasons the story set up", on vs off.

### P6. Spine-aware re-plan of unreached anchors (optional, after P3) — size S

With `horizon > 1`, a fired divergence branch or a spine revision withdraws unreached `liv_` anchors past the branch
target, the way Dramatron cascades a regenerated plot level and IBSEN reschedules. Today `withdraw()` exists
(`livingCoordinator.ts:362`) but fires on rollback and author updates, not on divergence. The value is low while the
default horizon is 1 (`frontier.ts`, `livingHorizon`), so build it only if P3 lands and horizons above 1 get used.

## 5. What we do that the field doesn't, and rejected ideas

**Ahead of the literature:**

- **Code-verified graph ops with rollback ≡ replay.** None of the surveyed systems (Re3, DOC, Dramatron, Agents' Room,
  IBSEN, StoryVerse, WHAT-IF, Drama Llama) treats generated plot as typed, undoable ops with a frozen history. Ours fold
  over the authored story and are dropped by boundary.
- **Gates that are proven reachable and not already open** (`gateImpossible`, the open-on-arrival check), and route
  enumeration for every generated outcome (`paths.ts`). WHAT-IF and StoryVerse rely on the model for this.
- **Agency as a checked policy** (regex guard plus critic plus `DEFAULT_AGENCY` in every prompt). The papers rarely
  model the player at all: Dramatron and Re3 have none, and IBSEN lets the human join but does not protect their
  choices.
- **Per-member privacy for cast plans in the director prompt** ("never name or reveal them", plus `restatesSecret`
  refusal). This is absent everywhere surveyed.
- **Measured divergence branching** (a judge reading with a streak, a branch that converges back) instead of WHAT-IF's
  pre-authored decision points.
- **Seeded, frozen oracle structure** (scene test), where solo tools use live dice and allow rerolls.

**Rejected:**

- **Full multi-agent planning (Agents' Room).** Four or more calls per anchor for a gain that structured fields mostly
  capture (P5). Not worth the latency and failure surface.
- **Re3-style rewrite of written text or past anchors.** It breaks rollback ≡ replay and the "only the future" rule.
- **A symbolic planner (Glaive or PDDL) generating anchors.** It needs an action-schema authoring layer the owner would
  have to write per story. Wang and Kreminski confirm planners are faster, but the authoring cost is the blocker.
- **Natural-language triggers for every transition (Drama Llama).** Their own users report unreliable detection. Keep
  the single short rubric, checked by code.
- **The full Sui Generis metric at runtime.** It needs many samples per segment; offline only (P2 measure).
- **A reroll button or unfrozen variant re-draws.** Trap T3 (`v2.8/27`). Variants are frozen in the proposal.
- **Mythic list weighting (threads and characters entered once per mention, picked uniformly).** Considered for
  `focusPick`. The marginal value is small and it needs mention counts we do not record per arc. Defer to the memory
  work's mention ledger (memory shortlist, gap 1) if that lands, then revisit as an S change.
