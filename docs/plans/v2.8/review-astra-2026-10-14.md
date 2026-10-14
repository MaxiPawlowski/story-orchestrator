# Astra review: v2.8 plans 42-53 (2026-10-14)

Reviewer: gpt-6-astra via codex exec, high reasoning, read-only, on master 2d0eb618. Claude spot-checked: capEpistemic does not reserve secret rows (confirmed), checkpoint entry does not apply state_snapshot (confirmed), 24-test-plan rule 5 still says off by default (confirmed).

## Plans 42-47

**The mechanics are worthwhile, but I would revise all six plans before implementation.** The largest risks are recipient-specific secret reveals, incomplete rollback designs, invented player commitments, and causal claims the logs cannot substantiate.

Reviewed read-only against checkout `2d0eb618`, including relevant local SillyTavern source. No campaign content accessed, files changed, or gates run. Severity: **P0** privacy/invariant blocker; **P1** correctness or acceptance blocker; **P2** efficiency, scope, or documentation issue.

**1. Critical review**

**42 — Witness filter v2: approve B as a measurement; C needs a stronger contract.**

- **P0 — A message is not necessarily one audience unit.** A single reply can contain public dialogue, an aside, and private thoughts. `heard=<members>` cannot represent that safely: keeping the message leaks the aside; removing it loses witnessed dialogue. Define witnessed **spans**, or conservatively mark mixed-audience messages ineligible for recall. A message-level experiment can proceed, but its claims must acknowledge this limitation.
- **P1 — Missing data makes C’s unconditional F2 unattainable.** C keeps messages without witness rows, while the read intentionally lags and can trim its window. It also skips the model entirely when quality scope is empty: [sharedRead.ts:128](../../../src/extraction/sharedRead.ts:128), [sharedRead.ts:244](../../../src/extraction/sharedRead.ts:244). Specify coverage, freshness, outages, and newly arrived messages. Distinguish “correctly filters classified messages” from “no unwitnessed text reaches any request.”
- **P1 — Message-keyed rollback is insufficient.** A witness decision about message 10 may depend on messages 11–15 clarifying who heard it. Editing 14 must invalidate that decision even though message 10 survives. Persist the inference’s input range/revisions and accepted result; define overlapping-read precedence. Re-running an LLM is not deterministic replay.
- **P1 — W4 conceals the dangerous errors.** Ninety-percent exact-set agreement permits false inclusion of unwitnessed recipients. Report false inclusions, false exclusions, coverage, and ambiguous cases separately. Dropping annotator disagreements removes precisely the difficult cases; retain an adjudicated or explicitly unknown stratum. Wc measures added **input** tokens, but one witness line per message primarily expands **output**, truncation risk, and latency.
- **P2 — H5 is plausible, narrowly.** The host’s chat-vector path selects retrieved messages from the interceptor’s supplied array, supporting the splice inference: [vectors/index.js:825](ST:public/scripts/extensions/vectors/index.js:825). That does not close every vector/file/WI channel. Also, ST transforms and filters `coreChat` before interception, so array positions are not original message IDs: [script.js:4496](ST:public/script.js:4496). Specify identity mapping and test continued generations, aborted drafts, nested quiet calls, and depth placement.

**Recommendation:** B first, with span/mixed-audience labels and explicit unknowns. Keep C a separate decision. The cheaper immediate benefit is safe retrieval eligibility for 43, without removing transcript context.

**43 — Verbatim recall: useful, but “exact words” needs stronger identity and provenance.**

- **P0 — `keptFrom` is a lexical safeguard, not a semantic privacy proof.** It uses overlapping content words; short secrets and sufficiently different paraphrases can escape it: [heldSecrets.ts:24](../../../src/memory/heldSecrets.ts:24), [words.ts:25](../../../src/memory/words.ts:25). Keep it, but require provenance-based audience eligibility first. A small presence-proxy fixture cannot establish that every retrieved line was witnessed.
- **P1 — Content hash is not message identity.** Identical words can occur in different scenes, from different speakers, with different witnesses. Use chat/run identity, message identity/revision, speaker, and exact span; use hashes for deduplication or integrity. Likewise, the proposed cache omits query text, witness revision, secret state, and story revision. A current member and message ID alone do not make cached text safe.
- **P1 — Retrieval and quotation are conflated.** A message can mix narration and multiple speakers. Wrapping it as `Name: "…"` can fabricate attribution. Require source-exact spans and speaker evidence; reject ambiguous attribution. Filter eligible candidates before the final top-k selection, or refill after filtering—otherwise eight forbidden hits can starve valid recall.
- **P2 — Two code claims are stale.** E0 code is present in this checkout: [e0Ranking.ts:12](../../../src/memory/e0Ranking.ts:12). A vector host adapter already exists: [vectors.ts:25](../../../src/services/stHost/vectors.ts:25). Reuse it. Implementation presence does not establish an E0 winner.
- **P1 — The floors do not establish added value.** VR7 allows 60% faithfulness even if recall-off performs better. Preserve the existing floor, but add a predeclared paired improvement measure, incorrect-speaker/altered-quote cases, and unsolicited-repetition checks. A hard 250-token cap should be tested as a maximum, not only p95.

**Recommendation:** retain the R1/R2 comparison, but prefer the cheaper design on a tie. Start with explicit quotation requests and direct source references from promises; broaden to automatic callbacks after measuring usefulness. Clear injections on failure, cancellation, chat changes, and member changes—not only successful generation completion.

**44 — Rumors and gossip: strongest world-building potential; stage 1 is not safe as written.**

- **P0 — Retiring a secret row reveals too broadly.** A `[hiding]` row can protect against several recipients. Retiring it because one recipient is authorized removes that protection for everyone. Retirement operates on the whole row: [epistemic.ts:78](../../../src/memory/epistemic.ts:78); held-secret protection derives from active rows: [heldSecrets.ts:21](../../../src/memory/heldSecrets.ts:21). Introduce recipient-specific reveal state or reversibly replace the restriction while preserving all other exclusions.
- **P0 — Gossip can evict the protection itself.** `capEpistemic` retains newest unpinned rows without reserving secret restrictions: [epistemic.ts:223](../../../src/memory/epistemic.ts:223). Adding rumors to that budget can discard `[hiding]`/`[unaware]` rows. Protection must outlive incidental beliefs. Also reuse a coordinated write API: the existing coordinator refreshes injection **and** resynchronizes the memory mirror when secret state changes; calling only the listed pure helpers omits that behavior: [memoryCoordinator.ts:351](../../../src/runtime/coordinators/memoryCoordinator.ts:351).
- **P1 — The proposed rollback loses pending work.** A hop scheduled before the rollback point and consumed after it must become pending again. Deleting later landed rows does not restore it. The pending schema also lacks the scheduling stamp its rollback rule needs. Use reversible hop events or before-images, stable occurrence IDs, deduplication, deterministic cap ordering, and retention covering the rollback horizon. Never seed extracted rumors from existing random memory IDs: [types.ts:237](../../../src/memory/types.ts:237).
- **P1 — “After meanwhile-land” does not mean after it completes.** That registry entry launches asynchronous work without awaiting it: [boundaryWork.ts:43](../../../src/runtime/boundaryWork.ts:43). Take a stable boundary input snapshot or explicitly sequence dependent work.
- **P1 — Hearsay and truth are mixed.** A receiver knows that someone **said** something, not necessarily that its proposition is true. Separate assertion, source, receiver belief, and authored truth. Otherwise later extraction can promote gossip into canon. Away-from-player also does not mean unavailable to another NPC; current presence compares schedule location with party location: [presence.ts:15](../../../src/engine/life/presence.ts:15). Model channel contact explicitly.

**Recommendation:** authored stage 1 only, initially using typed hearsay and nonsecret subjects. Add selective disclosure before secret rumors. Stage 2 should require explicit topic eligibility, stable source lineage, and crowding measurements. G7/G8 need an off baseline and tests where origin and received versions compete in the actual prompt; G9 needs paraphrased spoilers, not just checkpoint names.

**45 — New Game+: approve typed carry; separate continuity from replay.**

- **P0 — The epilogue’s claimed secret safety is unproven.** The snapshot contains all non-quiet blackboard values, and `saga()` passes that outcome directly to the model despite filtering chapter records: [chapterSeal.ts:137](../../../src/runtime/chapterSeal.ts:137), [chapterSeal.ts:306](../../../src/runtime/chapterSeal.ts:306). `verifySaga` checks minimum length and unfamiliar proper nouns, not secret disclosure or factual accuracy: [chapterRecord.ts:148](../../../src/memory/chapterRecord.ts:148). Require an explicit public carry projection; do not copy the stored epilogue assuming it is safe.
- **P1 — Blackboard placement is not an audience policy.** A hidden outcome can influence target gates, labels, and injections without its raw key appearing. Source-public knowledge also need not be known by every sequel character. Declare player-visible legacy separately from member knowledge; test a changed target roster.
- **P1 — The picker design contradicts N3.** Reading only the selected blob cannot ensure that exactly five valid entries are *offered*. Either verify candidate blobs before offering them or revise the UI contract to verified-on-selection. `playRowFromBlob` is a lightweight index projection, not a carry validator: [playsIndex.ts:84](../../../src/runtime/playsIndex.ts:84). Clear/recompute `ended` after source rollback and restart.
- **P1 — Sequel carry and same-story replay need different semantics.** Importing “quest completed” into a fresh run can skip the very story being replayed. Declare legacy-only target qualities or explicit mappings. Pin a detached source snapshot at target creation; subsequent source edits must not silently alter it. Revalidate against pinned source content, not merely a current library copy.
- **P2 — The lifecycle and floors need edge cases.** “Until the first seal” can mean forever in chapterless stories or when sealing fails. Define bounded alternatives. N2 cannot require all source errors to be refused at import when the source is unavailable. N7’s “no names outside epilogue + cast” can reject legitimate target-story places; use the target’s authorized opening context.

**Recommendation:** B first, then an explicitly public, bounded C. D is justified only with authored replay mappings. E is a small separate UI feature, not free: index repair and player-safe milestone projection still need work.

**46 — Consequences recap: reverse the recommendation—A first, cautious B later.**

- **P1 — A read window containing a player message does not prove player causation.** It may contain unrelated player dialogue followed by an NPC action. Queue entries provide source/range, not semantic attribution: [applyQueue.ts:9](../../../src/engine/applyQueue.ts:9). `evaluated` is a value snapshot, not a causal proof: [engine.ts:252](../../../src/engine/engine.ts:252). OR gates, already-satisfied conditions, overwritten values, and transition priority defeat the “latest changed key” rule.
- **P1 — Existing log rows lack the references the composer needs.** They contain kind/text/stamp, not quest/check/transition IDs or cause links: [gameTypes.ts:59](../../../src/runtime/gameTypes.ts:59). Derive structured effect references from authoritative records; do not reverse-engineer display text. Player labels describe states and are not necessarily grammatical action clauses.
- **P1 — “Read-time therefore rollback-safe” ignores retention.** The engine log retains 200 boundaries: [engine.ts:276](../../../src/engine/engine.ts:276). A long chapter cannot produce a complete chapter recap from that ring. Either advertise a bounded recent recap or retain reversible chapter-level effect evidence.
- **P1 — Existing projection helps, but does not prove this new surface safe.** Current log composition filters quest visibility at each historical event and includes newly earned milestones: [widgets.ts:79](../../../src/runtime/widgets.ts:79). It does not implement the new recap’s complete spoiler policy. Authored overrides and chapter consequences also need projection; familiar names alone do not make text public.
- **P2 — C1 needs adversarial negatives.** Include NPC-caused effects, coincidental writes, redundant gate operands, reversals, and a neutral “What changed” baseline. Thirty hand-labelled positive pairs can reward the implementation’s assumptions.

**Recommendation:** authored causal lines plus deterministic neutral changes. Emit “Because you…” only with explicit player-action evidence linked to an effect. Falling below attribution precision is a reason to abstain—not evidence that an LLM should invent the missing connection.

**47 — Promises remembered: high player value, but evidence and agency need redesign.**

- **P1 — The commitment guard is not a general promise detector.** Its verdict relies on quality/value relevance, and its functions are private: [commitGuard.ts:199](../../../src/extraction/commitGuard.ts:199). Finding any matching player sentence does not bind the extracted promise’s recipient, content, or deadline. Require an exact source span and attribution; test quotations, sarcasm, conditional offers, casual future tense, and multiple recipients.
- **P1 — “No deadline → overdue after 12 boundaries” invents an obligation.** Group reply count is not an agreed deadline. Keep undated promises open; reminders should arise from relevant situations. Only explicit refusal, contradictory action, or an agreed deadline may support a distinct resolution—and overdue must not automatically mean broken.
- **P1 — Resolution and rollback are underspecified.** Similarity matching can close the wrong promise. Use stable promise IDs and evidence-linked resolution events, including renegotiation/release. Rolling back a closure must reopen an older promise. `reverseMemoryState` currently knows nothing about this proposed slice: [reverse.ts:63](../../../src/memory/reverse.ts:63). Specify cap eviction restoration too.
- **P0 — Director input creates a second privacy path.** Existing director threads are resting-filtered: [livingInputs.ts:30](../../../src/runtime/livingInputs.ts:30). A pinned private-promise list must retain that protection or support audience-scoped hooks. The existing player-action guard is only a lexical check and does not list “keep” or “break”: [guard.ts:3](../../../src/generation/living/guard.ts:3). It cannot establish P6 alone.
- **P1 — Overlap can defeat the promisee-only guarantee.** Arcs already extract unfulfilled promises and are shared: [contract.ts:9](../../../src/memory/contract.ts:9). Prevent duplicate private content entering arcs, summaries, or director hooks. The Overview must display verified player quotes, not extraction paraphrases mislabeled “their own words.” P7 also needs a repetition/harassment measure; maximizing reminders is not maximizing enjoyment.

**Recommendation:** C with exact evidence, stable IDs, explicit resolution history, no invented deadline, and relevance-based reminders. Keep authored promises in quests; link to them instead of maintaining competing quest/promise states.

**Cross-plan dependencies and acceptance**

- **One audience/provenance contract first:** distinguish witnessed, told, believed, player-visible, and authorized disclosure. Hearing a rumor does not make someone a witness to its original utterance; 43 must retrieve the transmission they heard.
- **42 + 47 + 15 need a combined read-budget experiment.** Separate token floors can pass while the combined contract truncates or reduces DELTA accuracy. Include empty-quality-scope stories and delayed/failed reads.
- **Define privacy comparisons precisely.** Hold public history constant and vary hidden information. Literal equality of all generated replies is inappropriate after a legitimate reveal. Compare eligibility, projected data, payloads, and forbidden content.
- **Repair the acceptance index.** [24-test-plan.md:18](../../../docs/plans/v2.8/24-test-plan.md:18) still says ship off by default, contradicting current rules; it also lacks 42–47. Add the six plans and their combined cases. Preserve existing floors; declare additional diagnostics before running them. An unbuilt candidate’s build gate is distinct from switching off a built feature.
- Add integration cases for **recall × chapter folding**, **rumor reveal × memory mirror**, **promise × arcs/director**, **recap × log retention**, and **carry × changed roster**. Keep reducers pure, host access behind STAPI, and coordinator interaction through injected dependencies.

**2. Brainstorm**

The best payoff is characters responding differently because of shared history—not more meters.

| Plan | More enjoyable version |
|---|---|
| **42 Witnesses** | Characters acknowledge gaps: ask what happened, recognize conflicting accounts, or notice someone knows too much. Represent “unknown” honestly instead of manufacturing ignorance or certainty. |
| **43 Recall** | Selective emotional callbacks: an earlier joke becomes reassurance; an insult is quoted during reconciliation; a promise returns word-for-word at its fulfillment. Use relevance and deterministic cooldowns so callbacks remain special. |
| **44 Rumors** | Competing attributed accounts, different versions along different relationships, and visible corrections. Let the player trace who told whom through conversation, without exposing an omniscient network diagram. |
| **45 New Game+** | Carry one or two meaningful legacies: a remembered reputation, an inherited responsibility, or a changed institution. Let the new story demonstrate the consequence early instead of relying on a long recap. |
| **46 Consequences** | A brief chapter-end acknowledgment pairing the player’s actual words with an observed change. Include unintended effects only after discovery; attribute uncertainty honestly. |
| **47 Promises** | Remember fulfillment warmly, allow renegotiation, and let the promisee release the player. NPC promises to the player would add reciprocity; reminders alone risk making the system feel like a task tracker. |

**Combinations worth building**

- **Promises × recall × recap:** exact pledge → evidence-backed fulfillment → character callback → one chapter-end consequence. This is the strongest compact emotional loop and needs no general transcript search initially.
- **Witnesses × rumors × codex:** entity pages distinguish “I saw,” “I was told,” and “accounts disagree.” Show only the player’s acquired evidence; never expose hidden truth or hidden-entry counts.
- **Rumors × reputation × relationships:** keep factual events separate from local perceptions. A faction reacts to the version it received; correction can change that belief. Prefer existing authored qualities and directed relationships over another global reputation subsystem.
- **Promises × rumors:** a public fulfillment can become an authored rumor. Private commitments remain private until a permitted disclosure; no automatic “oathbreaker” reputation for elapsed turns.
- **Carry × recap × codex:** a public legacy card records what carries forward and its observed basis, while the sequel controls which members know it.

**Five additional mechanics worth considering**

1. **NPC favors and assurances.** Characters remember what *they* owe the player. Existing quests/agendas provide the structure; no automatic player debt.
2. **Shared rituals.** A recurring greeting, joke, or celebration changes after authored relationship milestones. Deterministic eligibility and cooldown; no reward for message volume.
3. **Meaningful keepsakes.** An object links to a specific witnessed moment and unlocks contextual dialogue. Explicit boundary events govern giving, returning, or recognizing it.
4. **Reconciliation beats.** Acknowledgment, apology, and repair are separate evidenced events. They offer conversation opportunities without deciding the player’s feelings or demanding compliance.
5. **Recognized approaches.** Characters remember demonstrated methods—careful negotiation, improvisation, generosity—and offer compatible opportunities. Use authored, reversible evidence thresholds; avoid model-scored personality or XP.

**Build first:** authored/neutral recap, then evidence-backed promises with direct quote callbacks. They deliver visible continuity cheaply. Run 42B alongside that work; build authored rumors after selective disclosure and reversible hops are settled. General recall follows its measurements. New Game+ becomes most valuable once a real completed-run-to-sequel journey can be tested.

## Plans 48-53

**I would build a shared discovery layer for 51–52 first, then authored reputation.** Plan 50 needs a precise boundary contract; 48 should remain a small experiment; 49’s proposed “deterministic half” is too entangled with live behavior.

Reviewed current checkout `2d0eb618`, including relevant code and plans 42/44/47. Read-only review; no files changed, tests or live models run, or campaign content inspected. **P1** means resolve before implementation; **P2** means significant design or validation weakness.

**Shared findings**

- **P1 — “Blackboard state rolls back automatically” is incomplete.** Mutation detection explicitly recognizes transitions, quest changes, agenda changes and queued reads. New derived state can otherwise escape rollback on a non-transition boundary. `lifeMoved` detects landed agenda steps, not arbitrary `life_*` changes. Every new latch, clock, meter and reputation writer needs this integration. [engine.ts:378](../../../src/engine/engine.ts:378), [lines.ts:80](../../../src/engine/life/lines.ts:80)
- **P1 — Define one evaluation order.** Today queued writes drain, derivation runs, quest rewards apply, then a transition may enter another checkpoint. Consequently, an ordinary derive pass cannot see that boundary’s quest rewards or newly reached checkpoint. Plans promising same-boundary reveals, time changes and reputation moves must extend that sequence deliberately. [engine.ts:244](../../../src/engine/engine.ts:244), [engine.ts:482](../../../src/engine/engine.ts:482)
- **P1 — Disclosure and knowledge are different.** Being present, appearing in an open arc, or passing the resting secret filter does not establish player knowledge. Authored text also needs disclosure rules; its provenance does not make it safe.
- **P2 — Add feature-only fixtures.** A story containing only codex/labels/factions can miss the game UI activation path: `hasGameLayer` currently checks quests, milestones, widgets and quality displays. [quests.ts:33](../../../src/engine/quests.ts:33), [gameSnapshot.ts:28](../../../src/runtime/gameSnapshot.ts:28)
- **P2 — Acceptance bookkeeping is stale.** Add 48–53 explicitly to plan 24’s matrix. Its dark-launch rule contradicts the current default-on rule. Preserve frozen floors, report misses, and distinguish quality misses from correctness defects; neither implies permission to switch a built feature off. [24-test-plan.md:18](../../../docs/plans/v2.8/24-test-plan.md:18)

**48 — Director scene test: accept A, narrowed**

- **P1 — A frontier need not have been entered.** With a larger horizon, `findFrontier` searches reachable future anchors. “Seed by the boundary the frontier was entered” is therefore undefined for supported cases. Either restrict scene tests to the active frontier or define an immutable planning event as the seed origin. [frontier.ts:32](../../../src/generation/living/frontier.ts:32)
- **P1 — The proposed chaos writer does not exist.** There is no general checkpoint `set/add` effect. The format also requires “display min/max” while refusing `display`. Give chaos its own author-only bounds, or initially support only the tension mapping. [schema.ts:128](../../../src/engine/schema.ts:128), [48:90](../../../docs/plans/v2.8/48-director-scene-test.md:90)
- **P1 — A stable seed alone does not preserve the outcome.** Changing tension, candidate ordering or open arcs changes the result around the same draw. Freeze the sampled chaos, outcome and focus identity once. Specify how the 50-record cap interacts with retained rollback history and regeneration.
- **P2 — “Unexpected” is not yet operationally defined.** The input describes the current frontier, not a separately planned expected next scene. Altered and interrupt can become indistinguishable instructions to invent something dramatic. Supply an expected continuation constraint or rate against explicit fixture expectations.
- **P2 — Floors measure obedience more than benefit.** S5’s byte identity must hold at *fixed played state*, excluding intended narrative consequences. S8 should compare rates or equal-sized arms: altered plus interrupt contains twice as many anchors as expected. The agency regex is a useful detector, not proof of zero narrated agency. [guard.ts:18](../../../src/generation/living/guard.ts:18)

**Cheaper design:** one frozen scene-mode signal, tension-derived initially, with focus optional. Add a blind “surprising but causally coherent” rating and a repeated-interruption check. No authored-story injection yet.

**49 — Complications and twists: reject B as currently scoped**

- **P1 — Its first phase changes model input indirectly.** `world_info` switches change supplied lore; `set` can change transitions and other injections. Calling this “no model input change” is false. Moreover, `applyEarnedEffects` currently accepts quest/agenda origins and has no `set` effect. Meter occurrences require new state, origin and replay integration. [effectsApplier.ts:83](../../../src/runtime/effectsApplier.ts:83), [effectsApplier.ts:339](../../../src/runtime/effectsApplier.ts:339)
- **P1 — Persisting spent IDs does not preserve release timing.** The spike reconstructs its escalation streak from zero. After log truncation, remembering used lines prevents duplicates but does not restore the streak’s phase. Persist enough state at the retained-history base—streak, last counted turn and release sequence—or store these as authoritative rolled-back state. [sp6Complications.ts:69](../../../src/runtime/spikes/sp6Complications.ts:69)
- **P1 — Focus safety is overstated.** Presence filtering only removes away members; resting filtering removes recognized secret content. Neither proves that an arc was opened by the player, and removing secret content does not necessarily remove its subject’s name. C4’s “never choose a held-secret subject” is also too broad: a known person may hold secrets. Test forbidden information, not blanket person exclusion. [whereabouts.ts:7](../../../src/runtime/whereabouts.ts:7), [livingInputs.ts:31](../../../src/runtime/livingInputs.ts:31)
- **P2 — Boundary counting can amplify group size.** The spike deduplicates releases by player turn when supplied turn IDs. “Fill every boundary” can accelerate pressure during multi-member replies or Continue. Declare the counting unit explicitly. [sp6Complications.ts:66](../../../src/runtime/spikes/sp6Complications.ts:66)
- **P2 — SP6 success does not validate weighted/focused production behavior.** C9 reruns K2, while weights and focus change the distribution relevant to K3–K5. Re-run affected outcome floors. Also reconcile the automatic “drop spike” branch with the newer default-on owner rule.

**Cheaper design:** extract the reusable pure focus picker now if 48 needs it; otherwise choose A and finish SP6 first. Build meters independently only for a concrete authored use case. Avoid a shadow UI and permanently unsupported pool fields.

**50 — Story calendar: B is the right long-term model, but B1 is too broad**

- **P1 — Multiple writers need arbitration and exactly-once application.** One boundary may contain a normal time read, explicit skip, scene-break signal and checkpoint entry advance. Define precedence versus composition, evidence IDs, consumed-event tracking and handling of stale reads. Repeated extraction windows must not repeat “three days later.”
- **P1 — Renaming the read key is not enough.** Step resolution currently uses that key’s stored value. The proposed baseline is another derived key, requiring a real parser/resolution change. An effect advancing time must also prevent an older pending read from advancing it again. [parse.ts:150](../../../src/extraction/parse.ts:150)
- **P1 — Entry effects need a new engine transaction point.** Running `effects.time` later through host effects would leave the committed snapshot and consumers inconsistent. Calculate state changes in the pure boundary transaction; use runtime effects only for host operations.
- **P2 — Several calendar semantics remain undefined:** start date versus `start_day`, initial part, weekday origin, season wrap, same-part `to`, and where `night` lives without `calendar`. `time_part` also needs declaration, reservation and writer protection.
- **P2 — First-visit dates cannot always be reconstructed.** The engine retains 200 log entries; `visitedPath` retains checkpoint identities, not their historical calendar values. Preserve first-visit time explicitly if timeline labels must survive truncation. [engine.ts:276](../../../src/engine/engine.ts:276)
- **P2 — The quest validator gap is real, but narrower than claimed.** Temporal keys are missing, yet runtime already returns `offered` before testing failure. Test acceptance after the deadline and time-dependent proxy gates, not just adding names to `TIME_KEYS`. [quests.ts:10](../../../src/engine/quests.ts:10), [validate/quests.ts:248](../../../src/engine/validate/quests.ts:248)

**Cheaper sequence:** canonical time plus read parity; then authored entry advances; then calendar formatting; then skip extraction/director integration. Defer scene-break advancement until the earlier pieces prove stable. Strengthen T9 with quotations, hypotheticals, flashbacks, negation, duplicate windows and multi-member rounds.

**51 — Relationship labels: accept A with discovery and truth separated**

- **P1 — Missing extraction scope.** A reveal depending only on `saw_letter` may never be read. Existing scope sources do not enumerate the new label gates. Add budgeted reveal/public-label gate sources and starvation tests. [scopeSources.ts:67](../../../src/extraction/scopeSources.ts:67)
- **P1 — Labels can reveal unknown people.** An unconditional public label projects holder and target names without checking whether either identity is known. Use the same entity-discovery projection as 52, including NPC-to-NPC relationships.
- **P1 — “Secret kept” allows a leak.** R8 permits one explicit disclosure in ten replies. That cannot support a secrecy claim. Keep zero-leak correctness checks separate from behavioral quality ratings; test other drafted members, transcript reuse and downstream summaries as well as the holder.
- **P2 — Options and implementation disagree.** Option A says first matching row wins; the design says last matching row wins. The example requires the latter. Freeze that rule.
- **P2 — Option B’s rejection is inconsistent.** A public label gated on `rel_trust >= 3` is functionally a band. Decide which coarse observations are intentionally public; a warning does not eliminate the information revealed.
- **P2 — Learned once does not mean true forever.** “You discovered their loyalty” can remain known while current loyalty changes. Separate a historical discovery from a present-tense relationship assertion.

**Cheaper design:** build labels into 52’s person pages directly. Avoid an interim Journal surface that is immediately removed. Prefer event-driven labels initially; add hysteresis if axis-driven labels flicker.

**52 — People and Places codex: strongest immediate option, with two blockers**

- **P1 — Discovery can deadlock.** The scope proposal reads unknown facts only on already-known entries, while a first fact may be what makes an entry known. Include entry-discovery gates and eligible first-fact gates, with bounded rotation. Quest scope already handles hidden entities’ activation gates. [52:108](../../../docs/plans/v2.8/52-people-places-codex.md:108), [quests.ts:42](../../../src/engine/quests.ts:42)
- **P1 — Keeping a latch by ID can expose rewritten content.** Replacing an earned fact’s text or gate under the same ID would immediately show the replacement. Current story diffing does not understand codex fact semantics. Distinguish editorial corrections from new discoveries; semantic replacement needs a new identity or explicit compatibility handling. [storyDiff.ts:339](../../../src/engine/storyDiff.ts:339)
- **P2 — Rejecting facts known at start is counterproductive.** A codex should support the player’s established background and opening location. C7 and the validator currently prohibit useful initialization. Add explicit initially-known facts and test their safe projection.
- **P2 — Plan 42 is necessary but not sufficient for B.** Its proposed witness record names members who heard a message; the codex needs evidence that the *player character* learned a fact, potentially derived from several messages. Specify player participation and fact provenance, plus stable entity IDs/aliases rather than display-name matching. [42:90](../../../docs/plans/v2.8/42-witness-filter-v2.md:90)
- **P2 — Four rollback seeds are weak coverage.** Add unknown-to-known entry transitions, same-boundary checkpoint discoveries, independent People/Places IDs, hot edits, and history truncation. Specify whether `fresh` means “last boundary” or “not yet viewed.”

**Recommendation:** A now, B later. Journal placement and no per-fact chip are sensible. Show “learned from…” provenance where available; it adds more roleplay value than extra page furniture.

**53 — Reputation: accept authored moves; defer hidden-faction director input**

- **P1 — Snapshot writes are a false claim.** `state_snapshot` supplies expectations to generation/scope; checkpoint entry does not apply it. Plan 50 correctly identifies this. Remove snapshot standing changes from 53 or explicitly build a state-write facility. [engine.ts:260](../../../src/engine/engine.ts:260), [critic.ts:40](../../../src/generation/critic.ts:40)
- **P1 — Bounds are not enforced by existing writes.** Blackboard validation checks type, source, monotonicity and latching—not numeric range. Quest rewards add directly. Compiling `step_rule.min/max` does not guarantee standing remains bounded. Centralize clamping across every permitted writer and atomically record move completion. [blackboard.ts:72](../../../src/engine/blackboard.ts:72), [quests.ts:77](../../../src/engine/quests.ts:77)
- **P1 — Move gates need extraction scope**, just as labels do. “After quest rewards” also requires the shared ordering change identified above.
- **P1 — Existing spoiler tests do not protect arbitrary hidden factions.** The director’s secret guard uses the resting memory filter; unknown authored faction lore is not automatically represented there. A prompt instruction is insufficient evidence for F2 once generation can surface it. Initially send only disclosed faction context, or define explicit introduction permissions. [livingInputs.ts:43](../../../src/runtime/livingInputs.ts:43), [guard.ts:30](../../../src/generation/living/guard.ts:30)
- **P2 — F8 permits the forbidden behavior.** “Unchanged unless an authored move names that outcome” can authorize a penalty for ignoring a request. Require an affirmative, independently evidenced event; authoring it does not make punishment for inaction acceptable.
- **P2 — Clarify once-only and knowledge semantics.** F3 says “once per onset,” while the design says once ever. Also, faction membership should not automatically mean instant knowledge of every standing change. `changedAgo` reveals hidden movement and conflicts with the stated rejection of trends.

**Cheaper design:** authored moves, visible band words, existing roster widget, personal feelings kept independent. Defer extractor nudges and hidden-group hints. F7 should test personal warmth versus institutional distrust, not merely whether “Hostile” produces colder prose.

**Brainstorm: make the mechanics matter in play**

| Plan | Most valuable addition |
|---|---|
| **48** | Interruptions that advance an existing thread and preserve the intended destination: a changed circumstance, not another compulsory detour. Use deterministic spacing to avoid repeated interruptions. |
| **49** | Complications with several viable responses—including leaving them alone—and consequences that become recognizable callbacks. Exhaustion can produce quiet rather than mandatory replacement trouble. |
| **50** | Recurring social rhythms: familiar people available at different times, appointments and seasonal atmosphere. Time creates opportunities without automatically closing others. |
| **51** | Labels tied to remembered interactions: “trusts your discretion” is richer than “trust +2.” Different relationships can remain simultaneously warm, indebted and competitive. |
| **52** | An evidence notebook: known fact, source and what corrected it. Keep “heard a rumor” distinct from “established truth.” |
| **53** | Institutional standing affecting access, greetings and competing invitations. Let a friendly individual bend an unfriendly institution’s rules without erasing either relationship. |

Useful combinations:

- **Witness × rumors × codex:** a witnessed event becomes an attributed report; recipients hold beliefs; the player’s codex records it only when learned. A correction retires the mistaken belief without deleting the history of hearing it.
- **Promises × calendar × relationships:** an explicit promise creates an appointment and a private reminder. Fulfilment enables a relationship discovery; overdue status alone does not impose damage or reputation loss.
- **Reputation × rumors:** standing changes when an authorized report reaches the relevant faction, rather than granting every member omniscience. Require explicit permission before transmitting held secrets.
- **Scene tests × complications × agendas:** one shared eligibility/spacing policy prevents three systems from introducing competing disruptions on the same turn.
- **Codex × faction standing:** explain visible changes through already-known events, without showing hidden move counts or numeric contributions.

Up to five additional mechanics worth considering:

1. **NPC commitments to the player.** The reciprocal half omitted from plan 47: authored or accepted commitments, resolved through existing agenda/state machinery.
2. **Social permissions.** Earned introductions, invitations and privileges—concrete consequences more interesting than higher scores.
3. **Shared rituals.** Established greetings, recurring meals or running jokes become optional callbacks; no streaks or missed-session penalties.
4. **Return visits.** Places acknowledge known past events through gated descriptions and available interactions.
5. **Conflicting testimony.** Track “who claims what” separately from truth, letting conversation resolve disagreement without omniscient exposition.

**Build order:** fix the shared boundary/scope/disclosure contracts; build 52A with 51 on its pages; add 53A; build 50 incrementally; measure 48; integrate 49 after SP6. Among the additional mechanics, build NPC commitments and social permissions first: both give characters recognizable intentions and make player actions matter using machinery the extension already has.
