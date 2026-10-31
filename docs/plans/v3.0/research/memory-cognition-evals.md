# Memory research: cognition-inspired mechanisms and how memory is measured (2026-10-31)

Angle `cognition-evals`, one of six memory research notes. Research only: no code, no runs. Two halves:
(1) mechanisms borrowed from cognitive science (forgetting curves, episodic vs semantic, sleep consolidation,
emotional salience, reconsolidation, interference, schema/gist, character-subjective memory); (2) how the field
measures memory (LoCoMo, LongMemEval, MSC, PerLTQA, MemoryAgentBench, character and narrative benchmarks, judge
pitfalls), compared with our harnesses.

## 1. Summary

- **Our biggest gap is measurement, not mechanism.** Every memory harness we have scores one stage in isolation:
  the read (`so-live-suite` tiers), archive retrieval ranking (`src/memory/e0*`), verbatim recall selection
  (`src/memory/recall/score.ts` VR floors), witness labelling (`src/memory/witness/score.ts`), read quality (blind
  Sol rating, plan 25). Nothing asks, end to end, "at turn 150, does the member's reply still know what happened at
  turn 10, and does it get it right?". The long-haul journey's memory check (J7.8) only asserts memory is non-empty.
  LongMemEval's split into "was it stored / was it retrieved / was it used" is the frame to copy.
- **Proposal 1 (top): a long-horizon recall probe set with two scores**: *availability* (the planted fact reaches
  the right member's assembled prompt, checked on ST's dry-run prompt with no model call, deterministic) and
  *utilization* (the real reply answers correctly, or abstains when it should). Probe kinds from LongMemEval and
  TimeChara: single fact, multi-session, temporal order, knowledge update, abstention, kept-out member.
- **Proposal 2: a reply-level contradiction rate** (contradictions per 100 replies against the ledger and earlier
  replies), computed offline over archived sessions with a checker calibrated on planted minimal pairs
  (NoCha/ConStory-Checker pattern). The field's finding that inconsistency grows with story length is exactly our risk.
- **Proposal 3: a behavioural per-member leak rate.** Our privacy is proven structurally on prompt blocks; a reply
  can still leak through inference from the shared transcript. Measure what the kept-out member actually says when
  probed, alongside the structural zero.
- **Mechanism 1: retention by strength, not FIFO.** `capTier` (`src/memory/stores.ts`) keeps the newest N unpinned
  rows per tier regardless of importance or use, and `recallCount` only rises on consolidation confirms
  (`consolidate.ts:152`), never on use. A boundary-clock forgetting curve with spaced reinforcement on use
  (MemoryBank/Generative Agents style), with evicted rows archived for recall instead of dropped, is cheap,
  deterministic and reversible under our rollback model.
- **Mechanism 2: code-derived emotional salience.** Weight scoring and protect rows from gist compression when the
  boundary that wrote them carried high tension or a large life/feeling step. Derive it in code from state we
  already hold; do not add a field to the read contract (plan 25 shows Artemis format adherence is fragile).
- **Keep what the field lacks**: rollback ≡ replay, derived artifacts with inputs/removed (the 2026 "useful memories
  become faulty" result argues for exactly this), per-member held secrets, sealed blind rating with measured seed
  noise, two-model label rules for fixtures.

## 2. Survey

### 2.1 Cognitive mechanisms in LLM memory work

**Forgetting curves and spaced reinforcement.**
- MemoryBank (Zhong et al. 2023, [arXiv 2305.10250](https://arxiv.org/abs/2305.10250)): each memory has a strength;
  retention decays on an Ebbinghaus curve, recall raises strength and resets the clock, so often-used memories
  persist. Evidence: qualitative companion-bot study; no strong benchmark ablation. Failure mode: wall-clock decay
  forgets rare but critical facts (a vow made once).
- Generative Agents (Park et al. 2023, [arXiv 2304.03442](https://arxiv.org/abs/2304.03442)): retrieval score =
  recency (exponential decay since last *access*) + importance (LLM-rated 1-10) + relevance. Access refreshes
  recency, an implicit spaced-reinforcement effect. Ablations in the paper showed each component mattered for
  believability ratings. Failure mode: importance ratings drift, and "access" counts retrieval even when the model
  ignored the memory.
- Basis: Ebbinghaus (1885); spacing effect (Cepeda et al. 2006, [doi](https://doi.org/10.1037/0033-2909.132.3.354)).

**Episodic vs semantic split; consolidation.**
- Complementary learning systems (McClelland et al. 1995, [doi](https://doi.org/10.1037/0033-295X.102.3.419)): fast
  episodic store, slow semantic store trained by replay. LLM analogues: raw turns or events (episodic) and extracted
  facts/profiles (semantic). PerLTQA ([arXiv 2402.16288](https://arxiv.org/abs/2402.16288)) builds its benchmark on
  exactly this split (semantic profile/relationship memory vs episodic event memory).
- EM-LLM (Fountas et al. 2024, [arXiv 2407.09450](https://arxiv.org/abs/2407.09450)): segments the stream into
  episodes at points of high token surprise (event segmentation theory, Zacks), refines boundaries with graph
  modularity, retrieves by similarity plus temporal contiguity. Reported gains over InfLLM on LongBench and
  ∞-Bench. Failure mode: surprise is noisy on creative text.
- HippoRAG ([arXiv 2405.14831](https://arxiv.org/abs/2405.14831)): hippocampal indexing theory, a knowledge graph
  as index plus personalized PageRank for multi-hop recall.

**Consolidation during "sleep".**
- Sleep-time compute (Letta, [arXiv 2504.13171](https://arxiv.org/abs/2504.13171), [blog](https://letta.com/blog/sleep-time-compute)):
  a second agent reorganises memory while the user is idle; ~5x less test-time compute for equal accuracy on
  stateful reasoning tasks, gains correlated with query predictability.
- LightMem ([arXiv 2510.18866](https://arxiv.org/abs/2510.18866), ICLR 2026): soft online writes, offline
  dedupe/abstract/resolve. Gains reported are mostly efficiency (large token and call reductions on LongMemEval
  and LoCoMo).
- Warning: "Useful Memories Become Faulty When Continuously Updated by LLMs" ([arXiv 2605.12978](https://arxiv.org/abs/2605.12978)):
  repeated LLM rewriting of a memory bank raises then lowers utility, sometimes below no-memory; the regression sits
  in the consolidation step. Recommendation: keep raw episodes as evidence, gate consolidation.

**Emotional salience and mood congruence.**
- Emotional RAG (Huang et al. 2024, [arXiv 2410.23041](https://arxiv.org/abs/2410.23041)): role-play retrieval
  fuses semantic similarity with emotional-state match (mood-dependent memory, Bower 1981); better personality
  consistency on three role-play datasets. Failure mode: emotion classification of short lines is noisy; mood
  congruence can trap a character in a mood loop (sad state recalls sad memories).
- Human basis: arousal enhances consolidation (McGaugh 2004, [doi](https://doi.org/10.1146/annurev.neuro.27.070203.144157)).

**Reconsolidation on recall.**
- Nader, Schafe and LeDoux 2000 ([doi](https://doi.org/10.1038/35021052)): a recalled memory becomes labile and is
  re-stored, possibly altered. LLM work: "Human-Inspired Memory Architecture for LLM Agents"
  ([arXiv 2605.08538](https://arxiv.org/abs/2605.08538)) lists reconsolidation on retrieval among six mechanisms;
  Hou et al. 2024 ([arXiv 2404.00573](https://arxiv.org/abs/2404.00573)) ties recall probability to consolidation.
  Evidence is thin; the faulty-update paper above is the counterweight (each rewrite is a chance to corrupt).

**Interference and retrieval-induced forgetting.**
- Anderson, Bjork and Bjork 1994 ([doi](https://doi.org/10.1037/0278-7393.20.5.1063)): retrieving some items
  suppresses related competitors. In LLM systems the practical form is interference between near-duplicate or
  superseded memories. MemoryAgentBench ([arXiv 2507.05257](https://arxiv.org/abs/2507.05257), ICLR 2026) measures
  "selective forgetting" (FactConsolidation): single-hop conflict resolution ~60% for GPT-4o memory agents,
  multi-hop as low as 7%. Updating is the weakest ability across systems; LongMemEval's knowledge-update category
  agrees.

**Schema and gist memory.**
- Bartlett (1932): recall is reconstructive, drifting toward a schema. LLM analogues: recursive summarisation,
  MemGPT ([arXiv 2310.08560](https://arxiv.org/abs/2310.08560)) recall vs archival tiers, A-MEM
  ([arXiv 2502.12110](https://arxiv.org/abs/2502.12110)) Zettelkasten notes that are re-linked and rewritten.
  FABLES ([arXiv 2404.01261](https://arxiv.org/abs/2404.01261)): book-length summaries are mostly faithful at claim
  level but omit and over-weight the ending; unfaithful claims cluster around events and character states.

**Character-subjective (biased, mistaken) memory.**
- Character-LLM ([arXiv 2310.10158](https://arxiv.org/abs/2310.10158)): "protective experiences" train a character
  to not know what it should not.
- TimeChara ([arXiv 2405.18027](https://arxiv.org/abs/2405.18027), ACL Findings 2024): point-in-time character
  hallucination, i.e. a character revealing knowledge from later in the story; 10,895 instances, GPT-4o
  hallucinates significantly; their Narrative-Experts decomposition helps. This is the closest public analogue to our
  held-secret problem.
- Generative Agents "reflection" produces beliefs, not facts; no system we found deliberately stores per-character
  false beliefs as first-class rows, as our `[believes]` tag does.

### 2.2 Benchmarks and measurement

| Benchmark | What it tests | Mechanism | Notes / failure modes |
|---|---|---|---|
| MSC ([arXiv 2107.07567](https://arxiv.org/abs/2107.07567)) | multi-session persona chat, up to 5 sessions | human-written sessions; perplexity + human ratings | short; persona facts only |
| LoCoMo ([arXiv 2402.17753](https://arxiv.org/abs/2402.17753)) | very long two-agent dialogues (~300 turns, up to ~35 sessions) | QA (single-hop, multi-hop, temporal, open-domain, adversarial), event summarisation | audit found ~6.4% answer-key errors and a lenient judge ([Penfield audit](https://dev.to/penfieldlabs/we-audited-locomo-64-of-the-answer-key-is-wrong-and-the-judge-accepts-up-to-63-of-intentionally-33lg)); vendor score disputes ([Zep](https://blog.getzep.com/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/)); top_k large enough to retrieve the whole chat inflates scores ([arXiv 2604.21284](https://arxiv.org/abs/2604.21284)) |
| LongMemEval ([arXiv 2410.10813](https://arxiv.org/abs/2410.10813)) | 500 questions; extraction, multi-session reasoning, temporal reasoning, knowledge update, abstention | ~115K-token (S) and ~1.5M (M) histories; GPT-4o judge; separates indexing, retrieval and reading | the decomposition (stored / retrieved / used) is its most reusable idea; abstention is a first-class category |
| PerLTQA ([arXiv 2402.16288](https://arxiv.org/abs/2402.16288)) | semantic vs episodic personal memory QA | classification, retrieval, synthesis stages scored separately | synthetic personas |
| MemoryAgentBench ([arXiv 2507.05257](https://arxiv.org/abs/2507.05257)) | accurate retrieval, test-time learning, long-range understanding, selective forgetting | incremental multi-turn feeding | reviewers call the forgetting data synthetic |
| RoleBench / RoleLLM ([arXiv 2310.00746](https://arxiv.org/abs/2310.00746)), CharacterEval ([arXiv 2401.01275](https://arxiv.org/abs/2401.01275)), InCharacter ([arXiv 2310.17976](https://arxiv.org/abs/2310.17976)) | speaking style, role knowledge, personality fidelity | reference answers, reward models, psych-test interviews | mostly single-turn; little long-horizon memory |
| CharacterBench ([arXiv 2412.11912](https://arxiv.org/abs/2412.11912)) | 11 dimensions incl. memory consistency | "sparse" dimensions need targeted elicitation questions | the sparse/dense distinction applies to us: memory does not show in every reply, so probes must elicit it |
| TimeChara ([arXiv 2405.18027](https://arxiv.org/abs/2405.18027)) | knowledge the character should not have yet | point-in-time questions, judge | maps to kept-out members |
| NoCha ([arXiv 2406.16264](https://arxiv.org/abs/2406.16264)) | true/false claim pairs about novels | minimal pairs: a claim and its minimally altered false twin; credit only if both right | pairs defeat guessing and lenient judges |
| ConStory-Bench ([arXiv 2603.05890](https://arxiv.org/abs/2603.05890)) | consistency bugs in long story generation | extract contradiction-prone spans, pairwise compare, evidence-bound verdicts | errors mostly factual and temporal, mid-narrative, growing with length |
| DECODE ([arXiv 2012.13391](https://arxiv.org/abs/2012.13391)) | dialogue self-contradiction | NLI-style classifier over utterance pairs | utterance-pair framing scales to long chats |
| FActScore ([arXiv 2305.14251](https://arxiv.org/abs/2305.14251)) | factual precision | decompose into atomic facts, verify each | atomic decomposition is the standard for claim-level scoring |

**LLM-as-judge pitfalls** (Zheng et al. 2023, [arXiv 2306.05685](https://arxiv.org/abs/2306.05685); self-preference,
Panickssery et al. 2024, [arXiv 2404.13076](https://arxiv.org/abs/2404.13076); Thakur et al. 2024
[arXiv 2406.12624](https://arxiv.org/abs/2406.12624)): position bias, verbosity bias, self-preference for own-family
outputs, leniency toward topically right but specifically wrong answers (the LoCoMo audit's main finding),
agreement with humans much lower on fine-grained scales than on pass/fail, and run-to-run noise rarely reported.

## 3. Mapping to us

### 3.1 Mechanisms

**Forgetting / reinforcement.**
- Have: `src/memory/score.ts` scores importance, durability, confidence, `recallCount`, recency
  `1/(1+age/12)` in boundaries, entity overlap, Jaccard similarity, temporal proximity, activation triggers, arc
  relevance, contradiction. Pins and locks (`stores.ts` `setPinned`/`setLocked`). Intent lapse in `innerVoice.ts`.
- Gap: (a) `capTier` evicts by position (newest N unpinned kept; facts cap 50), so score never decides survival.
  Rows not yet folded into a chapter are simply dropped from state. (b) `recallCount` grows only when consolidation
  confirms a duplicate (`consolidate.ts:152`, undone in `stores.ts:95`), not when a row is injected or used.
  (c) Recency measures age since creation, not since last use, so there is no spacing effect.
- Fit: good. Boundary counters are our clock (no wall clock, matches the T4 guard spirit), use events can be stamped
  with `messageId` exactly like `confirmedAt`, so `stripLinksAfter`/`dropByMessageId` already show how to reverse
  them. Zero model calls. No prompt-prefix effect (memory blocks are already per-turn and late).

**Episodic vs semantic.**
- Have: the split already exists. Episodic: short-term (`historyCompaction.ts`), scene summaries
  (`sceneSummary.ts`, `sceneDetect.ts`), verbatim recall of earlier messages (`src/memory/recall/`), witness spans.
  Semantic: facts tier, ledger (`ledger.ts`), canon (`canon.ts`), chapter records/eras (`chapterRecord.ts`,
  `chapterFold.ts`, `chapterUnfold.ts`), archive recall of folded rows (`archiveRecall.ts`).
- Gap: none structural. Scene detection uses location/heuristics; EM-LLM's surprise segmentation needs token
  logprobs on the play path and would cost cache stability. Not worth it.

**Sleep consolidation.**
- Have: all memory work is already off-path (shared read, consolidation, chapter seal, compaction) and applies at a
  boundary. `derived.ts` records inputs/removed for every derived artifact; `compactionGate.ts` gates compaction;
  short-term compaction never summarises past the last read window.
- Gap: idle-time scheduling. The 3090 is idle while the owner reads and types; consolidation runs on its own triggers
  rather than in idle gaps. That is a controller/scheduler question owned by the context-chunking note
  (`research/context-chunking-web.md` §5), not memory semantics. The faulty-update paper validates our existing
  design (raw evidence kept, gated consolidation, rollback recomposes).

**Emotional salience.**
- Have: `importance` (1-3) from the read; pacing tension (`src/pacing/tension.ts`, HUD tension dots); life feelings
  and mood compiled to qualities (`src/engine/life/derive.ts`, `lines.ts`); feeling steps with evidence beats
  (`engine/life/beats.ts`).
- Gap: none of that state reaches memory scoring or the gist/fold decision. A row written in the climax and a row
  written during shopping are treated alike once importance ties.
- Fit: good if derived in code at write time (boundary tension, size of a feeling step at that boundary). A contract
  field (`salience=`) is a bad fit: plan 25 shows Artemis rewrites formats it is offered and every contract change
  needs a blind rating. Mood-congruent recall (Emotional RAG) is a riskier second step: it can loop moods and
  interacts with privacy (a member's mood is private-block data).

**Reconsolidation on recall.**
- Have: deliberate opposite. Established facts are held, not overwritten (`conflicts.ts` `isEstablished`,
  `heldContradictions`); supersession is a judged pair (`supersede.ts`); edits are author-only (`editEntryText`).
- Gap / fit: rewriting a memory each time it is recalled is the failure the 2026 paper documents and would multiply
  derived records under rollback. The useful kernel is narrower: on recall, *refresh* (use stamp, see forgetting) and
  *re-check* (a recalled row that the current window contradicts becomes a conflict candidate), never re-write.

**Interference / retrieval-induced forgetting.**
- Have: dedup bands 0.82/0.55 and Jaccard fallback (`consolidate.ts`, `similarity.ts`), near-duplicate suppression
  in injection (`inject.ts` `nearDuplicateIds`), supersession, `contradicted` flag with weight 2, epistemic
  `dropCommonKnowledge` and `capEpistemic` (12 newest per subject).
- Gap: measurement. We do not measure knowledge-update correctness end to end (does the reply use the new value after
  a fact changed?), which MemoryAgentBench and LongMemEval both find is the weakest ability in every system.

**Schema / gist.**
- Have: canon prose, chapter records with fold/unfold, eras, scene summaries; `foldEstablished` keeps established
  rows; archive recall brings folded rows back by entity mention.
- Gap: FABLES-style claim faithfulness of our own chapter records is measured only by recorded tests
  (`chapterRecordC2.recorded.test.ts`) and the v2.8 seal row, not as a rate over long sessions.

**Character-subjective memory.**
- Have, ahead of the field: per-member epistemic rows with `[knows] [suspects] [believes] [hiding] [unaware]
  [intends]` (`epistemic.ts`, contract rule "a listener who accepts a lie gets [believes]"), held secrets with
  per-member rendering (`heldSecrets.ts`, `MemoryInjector.restingFilter`), witness record and audience contract
  (`audience.ts`, `audienceRules.ts`), promisee-only reminders, rumors with hearsay rows.
- Gap: no behavioural measure of whether a member *acts* on a false belief or stays ignorant (TimeChara question).
  A biased per-member re-telling of shared episodes ("how she remembers the fight") is possible but adds a
  per-member generation and a second truth to keep straight; deferred (section 5).

### 3.2 Measurement: what we have vs the field

| Stage | Ours | Field analogue | Gap |
|---|---|---|---|
| Write (read quality) | `so-live-suite` tiers: deltas, facts (scorer v3), rejected, epistemic, ledger, arcs, intents; floors per tier; whole-term needles; `inventory --check`; `rescore` | LongMemEval indexing, PerLTQA classification | Fixture count is small (20 facts positives+negatives, 3 epistemic): one fixture moves a tier by 0.05-0.33. No confidence intervals reported. |
| Write (quality, open-ended) | blind Sol rating, sealed key, X/Y by hash, floors declared first, seed-noise run (plan 25: noise up to ~0.21 per category) | LLM-as-judge with bias controls | Already better than most papers. Missing: bootstrap CI, and pass/fail claim checks beside 1-5 scales (judges agree better on binary). |
| Retrieve (archive) | E0 arms: hit@1, hit@4, MRR@4, pool recall, ties, cost (`e0Score.ts`, floors in `e0Ranking.ts`), labels written by Sol and checked by Claude (`e0Labels.ts`) | LongMemEval retrieval recall@k | Good. Questions are about archive recall only. |
| Retrieve (verbatim recall) | VR1-VR8 (`recall/score.ts`): hit rate, secret leaks into the pool (VR2s), forbidden returned, token cap, wrong speaker | none comparable (privacy-aware recall is rare) | Good and privacy-aware. |
| Witness | exact set, false inclusion/exclusion, null-control margin (`witness/score.ts`) | none | Good. |
| Use (reply) | journeys: J7.8 asserts memory non-empty; GS3.6 reads tiers and context readouts | LongMemEval/LoCoMo end-to-end QA, CharacterBench memory consistency, TimeChara | **Missing.** No end-to-end recall, update, abstention, contradiction or behavioural leak score. |
| Privacy | structural: `runtime/secret*.review.test.ts`, payload goldens per drafted member, VR2s | TimeChara (behavioural) | Behavioural leak rate missing. |

## 4. Proposals, ranked

### P1. Long-horizon recall probes: availability and utilization (M)

- What: a probe set over long sessions. Each probe = (plant turn, probe turn, target member, kind, gold, needle
  terms, forbidden terms). Kinds, taken from LongMemEval/TimeChara/MemoryAgentBench:
  1. single fact (said once, asked 20/60/150 boundaries later);
  2. multi-session (needs two facts from different chapters);
  3. temporal order ("before or after X");
  4. knowledge update (a fact changed; gold is the new value, the old value is a forbidden term);
  5. abstention (never established; correct = not inventing, scored by forbidden-term absence plus a pass/fail judge);
  6. kept-out member (gold = ignorance; the secret's terms are forbidden).
- Two scores per probe:
  - **availability** (no model): run the session to the probe turn through the existing dry-run path
    (`so-payload-golden` already records ST's dry-run prompt per drafted member with a tripwire on any model call)
    and check the gold terms are in that member's prompt, and the forbidden ones are not. Deterministic, can run on
    no-model lanes or in jest over recorded memory states. Answers "did memory deliver it?".
  - **utilization** (model): send the probe line in-fiction with `send_generate`, score the reply with
    `termPresent` needles (the same matcher as the live suite) plus a pass/fail judge question
    ("does the reply state X / contradict X / claim knowledge of X?"). Answers "did the model use it?".
  - The pair localises failures: available but unused = prompt layout or model; unavailable = memory pipeline.
    This is LongMemEval's indexing/retrieval/reading decomposition applied to our stack.
- Source of sessions: synthetic test stories (public repo, no campaign) driven by scripted player lines, plus
  probe insertions into archived private sessions evaluated privately (so-sessions repo). Labels: same two-model rule
  as `E0_LABEL_RULES` (writer, independent checker), and a label audit pass (LoCoMo shows 6% key errors is normal).
- Branch points: replay a session prefix once, then fork per probe from the snapshot (the engine already has
  snapshots and rollback ≡ replay), so N probes do not cost N full sessions.
- Cost: availability = zero model calls; utilization = one loud generation per probe (≈ one turn each), off the
  owner's GPU time only on lanes. ~60 probes ≈ 60 turns on the 3090, under an hour.
- Invariants: harness only; no product change. Lane rules apply (no campaign content in the public repo, images off).
- Floors (declare before first run, informational per owner rule): availability ≥ 0.9 at 60 boundaries,
  kept-out availability of forbidden terms = 0 (hard), utilization reported with a bootstrap CI, abstention false
  invention ≤ 0.1. Use the result to decide mechanism work (P4, P5) instead of guessing.

### P2. Reply contradiction rate (M)

- What: offline scorer over archived session transcripts: decompose each reply into atomic claims (FActScore),
  pair claims that share an entity with ledger rows, facts-tier rows and earlier replies, and ask a pass/fail
  judge "consistent / contradictory / unrelated" with quoted evidence (ConStory-Checker, DECODE). Report
  contradictions per 100 replies, split factual / temporal / character-knowledge / relationship, and as a function
  of session length (the field says it grows linearly; we want our curve flatter than the no-memory arm).
- Checker calibration first (NoCha minimal pairs): plant known contradictions and their consistent twins into
  copies of transcripts; the checker must catch both sides of a pair to score. Gives checker recall and false-alarm
  rate, so a "contradiction rate" is never reported from an uncalibrated judge.
- Arms: memory on vs memory tiers off on the same scripted sessions gives the effect size of memory itself, which we
  have never measured.
- Cost: no play-path cost; remote rating calls (Sol, subscription) per claim pair, or the local decider for the
  pair verdict once calibrated per use (judge rule: an uncalibrated use is refused).
- Invariants: none touched (offline). Privacy: transcripts with campaign content are rated only in the private repo
  and never quoted in reports (counts only).

### P3. Behavioural per-member leak rate (S-M, rides on P1)

- What: for each held secret in a probe session, probe a kept-out member in-fiction with an elicitation line
  (CharacterBench "sparse dimension": leaks only show when elicited) and score the reply for the secret's terms and a
  judge question "does the speaker show knowledge of X?". Report leaks per (secret × kept-out member × probe) and
  split by cause: structural (the secret reached the prompt; must be 0, already proven), transcript inference
  (the secret was spoken on stage in the shared transcript earlier; legitimately visible), and model invention.
- Why: our tests prove no block carries the secret, but the player sees the reply. TimeChara shows strong models
  leak point-in-time knowledge readily. This turns "the prompt is clean" into "the character behaves ignorant".
- Cost: same lanes and probe machinery as P1, ~2 probes per secret.
- Measure: kept-out leak rate with CI against a control (same probe to a knower: should answer). Feeds the
  `transcript-copiers` check story with numbers.

### P4. Strength-based retention with spaced reinforcement on use (S-M)

- What, in `src/memory/` (pure) and `memoryCoordinator.ts`:
  1. a use stamp: when an injected row's terms reappear in the committed reply (cheap `termPresent` check at the
     boundary) or the read confirms it, append `{messageId, boundary}` to a `usedAt` list (mirrors `confirmedAt`;
     dropped by `dropByMessageId`/`stripLinksAfter`, so rollback ≡ replay holds);
  2. strength = importance prior × durability, decaying in boundaries since the last use, with the decay slowed
     by each spaced use (gap-dependent increment, Ebbinghaus/SuperMemo-like), replacing `recency` and
     `recallCount` in `score.ts`;
  3. `capTier` evicts lowest strength instead of oldest, never an established (`isEstablished`) or open-promise row,
     and moves evicted facts/session rows into the archive set that `archiveRecall.ts` can bring back by entity
     mention, instead of dropping them.
- Cost: zero model calls, a few ms per boundary. RAM: one small list per row.
- Risks: retention changes what is injected, so the payload goldens move (declare the hunks); stale-but-used rows
  could crowd out new ones (cap the use bonus); the use check must run on the reply revision the boundary
  commits (swipe re-arms).
- Measure: P1 availability at 60/150 boundaries before vs after, plus a jest property test (rollback ≡ replay over
  random swipe/edit sequences with use stamps, extend `rollbackReplay.property.test.ts`). Floor: availability at 150
  improves, at 20 does not drop.

### P5. Code-derived salience (S)

- What: at write time (`extractionCoordinator.applyAudit` boundary), compute `salience` 0-2 in code from what the
  boundary already knows: tension level (`pacing/tension.ts`), whether a transition fired, size of any life
  feeling step at that boundary, quest close or reward. Use it (a) as a score term, (b) to protect the row from
  chapter gist folding (`chapterFold.ts` keeps high-salience rows verbatim, like `foldEstablished`), and (c) as a
  tie-breaker in P4 eviction.
- Not a contract field: no prompt change, no rating needed for format, no risk to the read.
- Cost: zero model calls. Deterministic from engine state, so replay-stable.
- Risks: salience from the *boundary* tags every row of a hot window, including trivia said during the fight;
  combine with importance rather than overriding it. Mood-congruent recall stays out until P1 can measure it.
- Measure: P1 probes planted at climactic boundaries vs calm ones; P2 contradiction rate on climax-related claims.

### P6. Knowledge-update probes in the live suite (S)

- What: add read fixtures where a fact changes inside the window or contradicts a seeded established fact, scored
  on the supersede/hold path (`supersede.ts`, `heldContradictions`), not only on extraction lines. MemoryAgentBench's
  FactConsolidation shows multi-hop updates collapse in every system; our held-conflict design is a deliberate answer
  and deserves a number.
- Cost: fixtures only; runs inside the existing live suite (`--set` can get an `updates` set like `time` and
  `adversarial`). Also report per-tier Wilson intervals in `tierTotals` so a 3-fixture tier stops reading as a rate.

## 5. Keep, and rejected

### Things we do that the field does not (keep)

- **Rollback ≡ replay for memory** (`reverse.ts`, `rollbackReplay.property.test.ts`). No benchmarked system handles
  swipes/edits; most cannot undo a write at all.
- **Derived artifacts with inputs and removals** (`derived.ts`). Exactly the "raw episodes as first-class evidence"
  the 2026 faulty-update paper recommends.
- **Per-member epistemic state incl. false beliefs** and held secrets through every shared tier. TimeChara and
  Character-LLM treat this as a model problem; we treat it as a data-flow invariant, which is stronger.
- **Established facts are held, not overwritten**: conflicts surface for the author instead of silent last-write-wins.
- **Measurement hygiene**: floors declared before candidates, sealed blind keys, X/Y order by hash, seed-noise runs,
  two-model labels, whole-term needles with `inventory --check`, vacuous needles never count, scorer versions in the
  fingerprint. The LoCoMo disputes are what happens without these.

### Rejected or deferred

- **Wall-clock decay** (MemoryBank as written): the owner plays in bursts with long gaps; story time is a code int;
  a week away must not forget the plot. Boundary-clock decay only.
- **Reconsolidation as rewrite on every recall**: multiplies LLM rewrites (the documented failure), multiplies
  derived records under rollback, and costs a model call on the hot path. Keep refresh + re-check only (P4).
- **Surprise-based episode segmentation** (EM-LLM): needs per-token logprobs from the play generation, interferes with
  the patched llama.cpp cache path, and our scene detection plus checkpoints already supply strong boundaries.
- **Salience as a read-contract field**: format risk on Artemis (plan 25), needs a blind rating; code derivation
  gets most of the value.
- **Mood-congruent retrieval now**: mood loops, and mood is private-block data; revisit after P1 exists to measure it.
- **Per-member biased re-tellings of shared episodes** ("how each remembers it"): one extra generation per member per
  episode on the shared GPU, a second truth to keep consistent, and a new privacy surface. Our `[believes]` rows
  already give targeted, evidence-backed subjectivity. Revisit only if P3 shows characters behave too omniscient.
- **Adopting LoCoMo/LongMemEval directly**: assistant-style QA over user chats, not group fiction with secrets; long
  histories exceed 32K by design and test retrieval stacks we do not run. Copy their categories and decomposition,
  not their data.
- **Graph memory with PageRank (HippoRAG) / Zep temporal graphs**: covered by other angles; our ledger + entity
  mentions + chapters already index by entity, and multi-hop questions are rare in play.

## Unresolved questions

- P1 sessions: synthetic public test stories only, or also private archived sessions (rated privately, counts only)?
- P2 rater: Sol (remote, subscription) for claim pairs, or calibrate the local decider for a `memory-contradiction`
  use first?
- P4 changes injected rows, so payload goldens and probably the blind read rating need a re-run; acceptable as one
  measured batch after P1 exists?
