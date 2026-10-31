# Memory research: games and interactive-narrative systems

Angle `game-narrative`, 2026-10-31. Research only; no code changed. Question: how do games and interactive-narrative
research remember and model knowledge with deterministic or symbolic state, and what could complement our off-path LLM
shared read? Sources are linked inline. Where only secondary sources were found, that is said.

## 1. Summary

- **We already own most of the classic toolkit.** Authored cues with gates, cooldowns, `must` lanes and `landed_when`
  (Valve-style rules), topic tiers (Ink/Failbetter-style "said already" depth), social norms with named witnesses
  (Versu-style practices), delayed echoes, seeded rumor spread with versions and stance (Talk of the Town lite),
  story-sifting patterns over the boundary log (Kreminski's Felt), relationship labels with secret reveals (Prom Week /
  CK3 flavour) and New Game+ carry (Wildermyth legacy). The gaps are narrower than "add a game system".
- **Gap 1: nothing tracks what a member already said from memory.** We count surface phrase repetition (author readout
  only) and step topic tiers when the player asks, but an injected memory row, arc or cue that a member has just voiced
  is injected again next turn at the same score. Valve's `norepeat` response groups and Ink's `TURNS_SINCE` solve exactly
  this in code. A per-member mention ledger with a cooldown is cheap, deterministic and rollback-friendly.
- **Gap 2: no per-member memory of the player.** Shadow of Mordor's nemesis, CK3 character memories and Dwarf Fortress's
  8+8 memory slots all keep a small, typed, intensity-ranked list of "what this character went through with you". Our
  facts ledger is shared and topic-shaped; feelings steps carry evidence beats but are not surfaced as memories. A
  code-built slot list per member, fed by things we already record, would give callbacks ("you lied to me at the gate")
  without another model call.
- **Gap 3: no queryable history of social acts.** Comme il Faut's social facts database lets rules ask "was A mean to B
  in the last N turns?". Our gates read current qualities and first-time latches; our sifting patterns read only
  transitions, quests, milestones and checks. A typed player-to-member act log (read from feeling-step evidence, not a new
  pass) would let gates and patterns ask about recent social history.
- **Gap 4: epistemic rows carry no evidence type.** Talk of the Town tags every belief facet with how it was learned
  (observed, told by X, lied to, eavesdropped, confabulated), a strength and decay. Our hearsay rows know their teller
  and stance, but `[knows]` / `[believes]` rows from the shared read do not, so a member cannot say "I heard from X" vs
  "I saw it", and nothing fades.
- **Cue specificity as a tiebreak** (Valve "most criteria wins") is a small, safe improvement over declaration order.
- **What to keep loudly:** our code-side held-secret filter over every shared tier is stronger than anything shipped in
  LLM-NPC products. ConfAIde shows prompt-only secrecy fails: GPT-4 leaked private information in about 39% of cases
  where humans would not, even with privacy prompts ([Mireshghallah et al., ICLR 2024](https://arxiv.org/abs/2310.17884)).

## 2. Survey

### 2.1 Valve dynamic dialogue (Left 4 Dead, Portal 2, TF2)

- **What.** A rule database picks speech lines. A "query" is a bag of facts (concept, speaker, map, health, who is near,
  plus world and character memory facts). Each rule lists criteria; the matching rule with the most criteria wins, so a
  broad default line is overridden by specific ones without if-else forests. Responses can **write facts back** (for
  example "said the warning about the witch", or a timer stamp), and response groups can be `norepeat` / sequential, so
  characters do not repeat themselves and running gags can escalate.
- **Sources.** Elan Ruskin, GDC 2012, [slides (Valve CDN PDF)](https://cdn.fastly.steamstatic.com/apps/valve/2012/GDC2012_Ruskin_Elan_DynamicDialog.pdf),
  [GDC Vault listing](https://www.gdcvault.com/play/1015528/AI-driven-Dynamic-Dialog-through),
  [Emily Short's recap](https://emshort.blog/2012/03/16/gdc-2012-talk-on-dynamic-dialogue/) ("applies the most specific
  rule it can find, using less-specific ones as fall-backs").
- **Evidence.** Shipped in several Valve titles with thousands of lines and hundreds of facts; the talk's claim is writer
  autonomy (special cases without programmer work). No quantitative eval.
- **Failure modes.** Fact sprawl; ties between equally specific rules; memory facts written by a line that the player
  never heard (interrupted audio) still count as said.

### 2.2 Storylets, qualities and salience (Failbetter, Ink, Emily Short)

- **What.** Content units with prerequisites, content and effects on world state ("qualities"). Selection is either by
  availability (quality-based) or by picking the most applicable unit from a pool (salience-based). Ink adds built-in
  visit counts and `TURNS_SINCE(knot)` so authors write "if seen twice, say it shorter" or "not within 3 turns".
- **Sources.** [Short, "Beyond Branching" (2016)](https://emshort.blog/2016/04/12/beyond-branching-quality-based-and-salience-based-narrative-structures/),
  [Short, "Storylets: You Want Them" (2019)](https://emshort.blog/tag/quality-based-narrative/),
  [Kreminski on storylets](https://emshort.blog/2019/01/06/kreminski-on-storylets/),
  [Ink docs (Writing with ink)](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md),
  [Ink cheat sheet on TURNS_SINCE](https://cheatography.com/menaechmi/cheat-sheets/ink-1-2-0-inky-0-15).
- **Evidence.** Fallen London, Sunless Sea, 80 Days, Heaven's Vault, Overboard. Long-running commercial use.
- **Failure modes.** Quality explosion; salience ties; content that is eligible forever gets shown forever unless the
  author adds a seen flag by hand (exactly what visit counts automate).

### 2.3 Versu and social practices (Evans and Short)

- **What.** Characters act inside "social practices" (a dinner, a conversation, a greeting) that offer actions and
  norms; each agent evaluates actions against its own desires and relationships. State lives in an exclusion-logic
  database (Praxis), where a predicate like `x.mood!angry` excludes other moods by construction.
- **Sources.** Evans and Short, "Versu: a simulationist storytelling system", IEEE TCIAIG 2014 (not fetched; secondary
  summaries only); a later formal treatment: [Social Practices: a Complete Formalization](https://arxiv.org/pdf/2206.06088).
- **Evidence.** Shipped interactive stories (Blood and Laurels); praised for reactive social texture, commercially small.
- **Failure modes.** Very high authoring cost; practices must be hand-built for each social situation.

### 2.4 Façade's drama manager (Mateas and Stern)

- **What.** A beat manager picks the next authored beat whose preconditions match player interaction and story memory,
  preferring beats whose effects move the tension toward the authored arc. Each beat is 10-100 joint dialogue behaviours.
- **Sources.** [Mateas and Stern, TIDSE 2003](https://users.soe.ucsc.edu/~michaelm/tenurereview/publications/mateas-tidse2003.pdf),
  [Structuring Content in the Façade Architecture, AIIDE 2005](https://ojs.aaai.org/index.php/AIIDE/article/download/18722/18499).
- **Relevance.** Story memory is "which beats happened, with what affinity outcome", used both for selection and for
  callbacks. We already have this shape (checkpoint path, boundary log, pacing tension).

### 2.5 Comme il Faut / Prom Week (McCoy, Treanor, Samuel, Wardrip-Fruin, Mateas)

- **What.** Social state = relationship networks, statuses, traits plus a **social facts database (SFDB)**: a history of
  past social exchanges ("A embarrassed B at turn 12") that rules query with time windows. Social exchanges have intent,
  preconditions, influence rules ("more likely if B was mean to A recently") and effects. Each character weighs thousands
  of considerations.
- **Sources.** [Comme il Faut, AIIDE 2011](https://ojs.aaai.org/index.php/AIIDE/article/view/12454),
  [journal version PDF (TCIAIG 2014)](https://cs.uky.edu/~sgware/reading/papers/mccoy2014cif.pdf),
  [Kill Screen interview](https://www.killscreen.com/the-indie-talks-we-chat-with-the-creators-of-prom-week/).
- **Evidence.** IGF finalist; players read characters as reacting to history. The SFDB is what makes "remembers you
  insulted her friend" possible.
- **Failure modes.** Rule authoring volume; opaque outcomes to players unless explained.

### 2.6 Talk of the Town and Bad News (James Ryan et al.)

- **What.** Each NPC holds a mental model of other people and places: per attribute a "belief facet" with an **evidence
  chain** (observation, reflection, statement from someone, lie, eavesdrop, declaration, confabulation, mutation,
  forgetting), a strength, and decay. Knowledge spreads through conversation chosen by salience and familiarity; it
  mutates and is forgotten. Repeating a belief raises commitment, so a repeated lie can become believed.
- **Sources.** [Ryan, Summerville, Mateas, Wardrip-Fruin, "Toward Characters Who Observe, Tell, Misremember, and Lie" (AIIDE EXAG 2015)](https://ojs.aaai.org/index.php/AIIDE/article/view/12825),
  [PDF](https://cdn.aaai.org/ojs/12825/12825-52-16341-1-2-20201228.pdf),
  [Bad News, CHI 2016](https://eis.ucsc.edu/papers/ryanEtAl_BadNewsCHI2016.pdf),
  [Short on Ryan's dissertation, "Curating Simulated Storyworlds"](https://emshort.blog/2019/05/28/curating-simulated-storyworlds-james-ryan-ch-6f/),
  follow-on [Gossamer (Kreminski et al., CoG 2023)](https://mkremins.github.io/publications/Gossamer_CoG2023.pdf).
- **Evidence.** Bad News won IndieCade's Developers' Choice; players found the town's knowledge state legible through a
  human actor. Simulation scale was the point; no player study of misremembering specifically.
- **Failure modes.** Huge state; most of it never surfaces. Ryan's later work is about *curating* (sifting) what matters.

### 2.7 Story sifting: Felt, Winnow (Kreminski, Dickinson, Mateas)

- **What.** Declarative queries over an event database find emergent story shapes ("A betrayed B, then later B helped A")
  and surface them as storylets or recaps.
- **Sources.** [Felt (ICIDS 2019)](https://mkremins.github.io/publications/Felt_SimpleStorySifter),
  [Winnow (AIIDE 2021)](https://ojs.aaai.org/index.php/AIIDE/article/download/18903/18668/22669),
  [Select the Unexpected (ICIDS 2022)](https://mkremins.github.io/publications/StU_ICIDS2022.pdf).
- **Evidence.** Used in Why Are We Like This? and research prototypes. Sifting patterns are only as good as the event
  vocabulary they can query.

### 2.8 Dwarf Fortress memories and legends

- **What.** Each dwarf has 8 short-term memory slots; a new thought joins an existing group or replaces the weakest. After
  a year a short-term memory is promoted to one of 8 long-term slots if stronger than what is there, otherwise dropped.
  Long-term memories are periodically re-experienced (affecting mood); some become core memories that permanently shift
  personality. Separately, world generation keeps a full event history (legends) per historical figure.
- **Sources.** [DF wiki: Memory (thought)](https://dwarffortresswiki.org/index.php/Memory_(thought)),
  [DF2014 version](https://dwarffortresswiki.org/index.php/DF2014:Memory_(thought)),
  [Polygon on the memory update (2018)](https://www.polygon.com/2018/4/16/17242932/dwarf-fortress-update-memories-pixar-inside-out).
- **Evidence.** Widely discussed emergent stories; the fixed slot budget is what keeps it tractable.
- **Failure modes.** Negative memories dominate long-term slots (the wiki notes most core memories are negative);
  re-experiencing loops can spiral mood.

### 2.9 Crusader Kings III: memories, secrets, hooks

- **What.** Character memories (since 1.7) are a typed log of what each character experienced; some fade on a timer,
  others stay; private memories are visible only to the owner. Secrets are created by wrongdoing and have a set of
  knowers; discovering one lets you expose it (opinion and legal effects) or blackmail for a **hook** (weak hooks are
  spent, strong hooks get a cooldown). Opinion modifiers carry their own decay.
- **Sources.** [CK3 Dev Diary 5: schemes, secrets and hooks](https://forum.paradoxplaza.com/forum/threads/ck3-dev-diary-5-schemes-secrets-and-hooks.1289167),
  [Dev Diary 105 (1.7 Bastion, memories)](https://admin-forum.paradoxplaza.com/forum/developer-diary/development-diary-105-1-7-bastion-update.1540182),
  [PC Gamer hooks guide](https://www.pcgamer.com/crusader-kings-3-ck3-intrigue-hooks).
- **Evidence.** Core loop of a commercially large game; memories were added because players wanted characters to
  reference history in events.
- **Failure modes.** Memory events repeat; hook economy can trivialize relationships.

### 2.10 Shadow of Mordor / War: the Nemesis system

- **What.** Each orc captain carries a record of encounters with the player (killed you, fled, was burned, humiliated);
  dialogue taunts and scars reference it; outcomes promote or change the orc. The world advances a step on each player
  death.
- **Sources.** No developer technical talk was found in this pass; player-side descriptions:
  [Warner Bros. overview](https://www.warnerbros.co.uk/news/articles/2020/01/22/nemesis-system-middle-earth's-game-changing-mechanic),
  [GamesRadar](https://gamesradar.com/shadow-of-mordor-excellent-nemesis-system),
  [Gameranx: enemies remember players](https://gameranx.com/updates/id/20914/article/middle-earth-shadow-of-mordor-s-enemies-remember-players/).
- **Evidence.** Widely cited as the strongest "the NPC remembers me" experience in AAA. The memory is tiny (a handful of
  typed encounter outcomes) but always surfaced at the right moment (the encounter intro).
- **Lesson.** Few typed memories, surfaced at the moment of meeting, beat many memories surfaced always.

### 2.11 Wildermyth

- **What.** Heroes accumulate **history lines** (short text memorials of moments) and **aspects/hooks** (queryable tags
  such as a flaw or a bond); events query aspects, not history text. Legacy carries heroes into new campaigns.
- **Sources.** [Wildermyth wiki: History](https://wildermyth.com/wiki/History),
  [Story Inputs and Outputs](https://wildermyth.com/wiki/Story_Inputs_and_Outputs),
  [Tag Reference](https://wildermyth.com/wiki/Tag_Reference).
- **Lesson.** Split the memory into prose for display and tags for logic; only tags drive selection.

### 2.12 LLM-NPC systems combining symbolic state with text

- **Generative Agents / AI Town.** Memory stream; retrieval = recency + importance (LLM-rated) + relevance (embedding);
  periodic reflections cite their source memories; ablations show observation, planning and reflection each matter for
  believability. [Park et al. 2023](https://arxiv.org/abs/2304.03442), [a16z AI Town](https://github.com/a16z-infra/AI-town).
- **Inworld.** "Flash memory" (facts pulled from conversation) plus "long-term memory" (topic summaries synthesized from
  flash); "knowledge filters" (strict / mild / off) restrict what a character may know to authored fields.
  [Long-term memory docs](https://docs.inworld.ai/docs/tutorial-basics/long-term-memory/),
  [Knowledge filters blog](https://inworld.ai/blog/knowledge_filters).
- **Hidden Door.** Structured cards (characters, places, objects, plot directions) serialized into the prompt; state
  besides the prose. [Ian Bicking's design review (2025)](https://ianbicking.org/blog/2025/08/hidden-door-design-review-llm-driven-game).
- **ConfAIde.** LLMs leak secrets to the wrong party at high rates even when told not to; theory-of-mind tiers are the
  hardest. [arXiv 2310.17884](https://arxiv.org/abs/2310.17884), [site](https://confaide.github.io).
- **Failure modes across these.** Prompt-only knowledge restriction leaks (ConfAIde); reflection costs a model call per
  agent; importance scoring by LLM is noisy and unreproducible; no product we found supports exact undo of memory on a
  regenerated reply.

## 3. Mapping to us

| Technique | What we have (paths) | Real gap | Fit |
|---|---|---|---|
| Valve rules + specificity | `roster[].cues[]`, `engine/cueSchema.ts`, `engine/life/cues.ts`, `engine/life/offers.ts` (must/may lanes, cooldown, `landed_when`, priority, kind, declaration order; `cue-tie` warning) | Ties fall to declaration order, not to "more criteria". | Good. Pure, deterministic. |
| Valve `norepeat` / Ink `TURNS_SINCE` for memory | Topic tiers step on a player raise (`topic_<member>_<id>`); may cues spent once; phrase repetition readout (`features/presenceFeatures.ts` `repetition-readout`, author only, nothing reaches the prompt); `recallCount` rises only when a read re-confirms a row (`memory/consolidate.ts:152`) | No record that a member *voiced* an injected row, arc or codex fact. `memory/score.ts` has no "recently mentioned" term, so the same callback is offered every turn. A tier a member volunteers without being asked is not stepped. | Good. Code-only match of reply text against what was injected; keyed by message id, so rollback drops it. Per-turn block, so the prompt prefix is untouched. |
| CiF social facts DB | Feelings axes with evidence beats (`engine/life/beats.ts`, `BlackboardDelta.beat`), latches, factions moves (`validate/factions.ts`), patterns over the boundary log (`engine/patternSchema.ts`: transition, quest, milestone, check) | No typed, windowed record of social acts (lied to, helped, insulted, protected) that gates and patterns can query. Beats are free text for the author view. | Medium. Must come from an existing read, not a new pass; a code act-type vocabulary mapped from the feeling step that already carries evidence. |
| Nemesis / CK3 / DF per-character memory of the player | Facts ledger and tiers are shared and topic-shaped (`memory/ledger.ts`, `memory/stores.ts`); per-member private blocks exist (`runtime/memoryInjector.ts`); promises per promisee (`memory/promises/`); hearsay per receiver (`memory/rumors/`); witness record per read (`memory/witness/`, consumes nothing until W4 floors pass) | No small "you and the player" list per member. Relationship feeling has a number, not remembered moments. | Good if built from existing rows in code. Privacy: lines go only to that member's private block through `withoutSecretLines`. RAM negligible. |
| Talk of the Town evidence chain | `EpistemicEntry` tags knows/suspects/believes/hiding/unaware/intends (`memory/epistemic.ts`), provenance per row (`memory/provenance.ts`: source extractor/author, messageId, pass); hearsay rows with `teller` and `stance` (`memory/rumors/types.ts`); `intentLapsed` decays only `intends` (`memory/innerVoice.ts`) | No evidence type (saw / was told by X / inferred / rumor) on shared-read epistemic rows; no decay for `suspects`/`believes`; repetition does not raise commitment. | Medium. One optional field on the `[knows]` line (`via=saw|told:<name>|guess`); fail-closed default "unknown". Decay keyed by boundary is replay-safe. |
| Talk of the Town propagation | Rumor spread in code (`memory/rumors/spread.ts`, seeded, ≤3 landings, versions, `leaks_to`), disclosures feed `heldSecrets` | Spread is authored-rumor only; knowledge told in-chat between members is learned only if the read notices. The witness record (42 B) is the right base; W4 failed, so nothing consumes it. | Do not duplicate; wait on witness. |
| Story sifting | `engine/patternSchema.ts` (16 patterns, 3 steps, vars, `unless`, `within`) | Event kinds exclude social acts and memory events. | Extends naturally once an act log exists. |
| CK3 hooks | Who-knows grid (`runtime/whoKnows.ts`, `memory/heldSecrets.ts` `secretAudience`), author only | "Knowing someone's secret" is not offered to the knower as leverage. | Risky: nudges the model toward disclosure scenes. Keep author-only or authored. |
| Façade drama manager | Checkpoint graph, transitions, pacing tension, living director (`generation/living/`) | None worth taking. | Already covered. |
| Inworld knowledge filters | Held secrets filtered in code through every shared tier; player projection (`runtime/playerProjection.ts`) | None; ours is stronger. | Keep. |
| Generative Agents retrieval | `memory/score.ts` already weighs importance, recency, entity overlap, Jaccard similarity, activation triggers, arc relevance, contradiction | No novelty/habituation term (see Valve row). Reflections exist as chapters/canon, not per member. | Add the novelty term only. Per-member reflections cost model calls on the play GPU. |
| DF slot budget | Caps everywhere (`EPISTEMIC_SUBJECT_CAP` 12, `HEARSAY_SHOWN_PER_RECEIVER` 6, `BEAT_RING_CAP` 6) | Caps evict by age, not by intensity with promotion. | Use for the per-member list only. |

## 4. Proposals (ranked)

### P1. Mention ledger: "said already" for injected memory (Valve norepeat, Ink TURNS_SINCE) — size S/M

- **Change.** After each rendered member reply (the same boundary hook that commits a turn), code compares the reply
  text with what that member's prompt carried: injected memory rows, open arcs, offered cue/topic/echo lines, codex
  lines. Match = the row's distinctive content words restated (reuse `memory/words.ts` `restatesWords`, the same matcher
  the secret filter trusts) or its activation trigger present (`utils/termPresent.ts`). Record
  `{rowId, member, messageId, revision, boundary}` in a new extras slice (`extras.mentions`, capped ring).
  - `memory/score.ts`: a `novelty` penalty per member, e.g. `-w * 1/(1 + turnsSinceMentioned)` for rows that member
    mentioned in the last N boundaries, unless the turn text itself names the row's entities (the player brought it up).
  - `engine/life/offers.ts`: a volunteered topic tier (member said it unasked) steps the topic like a raise, so the
    next ask gets the next tier instead of a repeat.
  - Author view: inline level 3 shows "mentioned again" counts beside the existing repetition readout.
- **Cost.** No model call, no tokens added (it removes repeats, so it saves a little). Matching is a few hundred word-set
  comparisons per reply. RAM trivial.
- **Invariants.** Keyed by message id + revision, so a swipe or edit re-decides; rollback drops entries at or after the
  message (add to `rollback.ts` quarantine like witness and rumors); needs a `ROLLBACK_DETECTORS` entry only if it ever
  compiles to a code key (it should not: keep it a scoring input). Per-member, so no privacy cross-talk. Lives in the
  per-turn block, so the prompt prefix and RAM cache are unaffected. Lazy chunk for the matcher.
- **Measure.** New deterministic floor on recorded transcripts (the payload golden fixtures plus archived session
  transcripts): "a row injected and voiced by member M is not re-injected to M within K boundaries unless the player
  names it" = 100% in jest; a quality floor: share of replies that restate a row voiced in the previous 2 replies, before
  vs after, on one replayed session (`st-lanes replay`), target a clear drop. Blind Sol pairwise rating of 2 sessions for
  "repetitive" (owner-gated). Payload golden diff should show only per-turn block changes.

### P2. Per-member "you and the player" memory slots (Nemesis, CK3, DF) — size M

- **Change.** A pure projection `memory/playerMemories.ts` (lazy) that, for each roster member, builds up to 6 short
  typed memories of moments with the player, from rows we already have, never from a new pass:
  - feeling steps toward the player with their evidence beat (`engine/life/beats.ts`), sign and size of the step;
  - promises to/from that member and their kept/broken events (`memory/promises/`);
  - faction moves the member witnessed (`rep_<faction>_seen_<member>`), norm breaks it noticed (`cue_norm_*`);
  - check outcomes and quest closes where the member was present.
  Each item gets an intensity (step size, broken > kept, authored weight) and DF-style slots: short ring of 6, promotion
  to a long list of 4 by intensity after M boundaries, weakest evicted. Optional CK3-style decay per type.
  Surface: at most 2 lines in that member's private block, chosen by relevance to the current turn (entity overlap with
  the turn, as `score.ts` does) and by the P1 novelty rule, rendered "You remember: <beat> (<n> days ago)". The
  Nemesis lesson: favour the moment the member re-enters the scene (presence change from `engine/life/presence.ts`).
- **Cost.** No model call; ≤ ~60 tokens per drafted member per turn, in the per-turn block. Pure code.
- **Invariants.** A derived projection from rolled-back sources is rollback ≡ replay for free (no own slice). Every line
  passes `withoutSecretLines` for that member and names no `knownEntities`-unknown entity on player surfaces (none here:
  model-facing only). Beats are evidence text the read quoted; clip like `BEAT_CHARS`.
- **Measure.** Jest property test: projection equals replay after random rollbacks. Live: an L-row journey where the
  player wrongs a member, leaves for 10+ turns, returns; floor = the member's private block holds the memory on return,
  and a blind rating (Sol) of "the character remembers me" on the replies, arms with and without. Payload golden for the
  block shape.

### P3. Social act log, queryable by gates and patterns (CiF SFDB + Felt) — size M

- **Change.** A small closed vocabulary of acts (`helped`, `protected`, `lied`, `threatened`, `insulted`, `gifted`,
  `betrayed`, `confided`) attached to the evidence of a feeling step the read already emits, as an optional tag on the
  feeling line (contract change in `memory/contract.ts`, parsed in `extraction/`). Stored in `extras.acts` keyed by
  message id with the source span (`memory/audience.ts` span shape, player span required for player acts, as plan 33's
  deferral guard does). Gates gain one leaf, `{"act": "lied", "by": "player", "to": "mara", "within": 10, "count": ">=1"}`,
  evaluated from a compiled count so the engine stays pure; `engine/patternSchema.ts` gains kind `act`. P2 reads it too.
- **Cost.** A few extra tokens in the existing shared read output; no extra call.
- **Invariants.** New compiled code keys need a `ROLLBACK_DETECTORS` entry and a code-only-boundary seed in the rollback
  floor (rule in `.claude/rules/architecture.md`). Acts are per pair; an act whose evidence restates a held secret is
  dropped at write like curator ops (`keptFrom`). Author-facing gate; no player surface by default.
- **Measure.** so-live-suite: a new `acts` tier with recorded fixtures (precision/recall on tagged acts against quoted
  spans; floor predeclared, e.g. precision 0.85); `rollbackDetectors.guard.test.ts` covers the key; a no-model scenario
  for the gate leaf.

### P4. Evidence type and fade on epistemic rows (Talk of the Town) — size S/M

- **Change.** Optional `via=` on `[knows]` / `[believes]` / `[suspects]` lines: `saw`, `told:<name>`, `guess`, `rumor`
  (hearsay already knows its teller). Default `unknown`. Rendering in the private block varies the verb ("you saw",
  "X told you", "you suspect"), which the model can voice as a source ("I heard it from X"). `suspects`/`guess` rows fade
  after N scenes without reaffirmation, using the existing `intentLapsed` clock (`memory/innerVoice.ts`). A row reaffirmed
  by a later read raises a commitment counter (Ryan's "repeating raises commitment") that the cap/eviction respects.
  `told:<name>` gives `heldSecrets` a better knower signal than word echo alone, but only as an additional knower; the
  barred set and fail-closed rules stay.
- **Cost.** A few tokens per epistemic line in the read; none extra in play beyond verb changes.
- **Invariants.** Fade keyed by boundary/scene records is replay-safe. Must not widen any secret audience on its own:
  a `told:` claim about a secret goes through `audienceRules.mayAdd` (positive relation required, unknown fails closed).
- **Measure.** Epistemic recorded tests (`epistemicPass.recorded.test.ts` style) with goldens; live suite knowledge tier
  accuracy for `via` on fixtures; secret review tests (`runtime/secret*.review.test.ts`) unchanged and green.

### P5. Specificity tiebreak for cues (Valve) — size S

- **Change.** In `compareOffers` (`engine/life/offers.ts`), after lane and priority, prefer the candidate whose gate has
  more leaf criteria (count from `gateKeys`) before kind and declaration order. Update the `cue-tie` diagnostic so it
  fires only on equal specificity. Guide topic `cues` gets one sentence.
- **Cost.** None at runtime. **Invariants.** Pure; deterministic. **Measure.** Unit tests on tie cases; a story-diff
  check that existing fixtures pick the same cue when priorities differ.

### P6 (optional, later). Leverage line for knowers (CK3 hooks) — size S, author-gated

- Only as an authored opt-in per secret (`leverage: true`): the knower's private block gets "you know <holder> hides
  this; it is leverage", never reaching anyone else. Rank last because it can steer scenes toward disclosure; needs the
  owner's call.

## 5. What we do that the field does not, and rejected ideas

### Keep

- **Rollback ≡ replay for memory.** No game or LLM-NPC system we found undoes memory exactly on a regenerated reply;
  games do not need to, chat RP does.
- **Code-side secret filtering over every shared tier** (`memory/heldSecrets.ts`, `withoutSecretLines`, resting view).
  ConfAIde shows prompt instructions alone leak at high rates; Inworld's filters are prompt-level.
- **Audience contract that fails closed** (`memory/audience.ts`, `audienceRules.ts`): richer than Talk of the Town's
  evidence chain on the safety side; Ryan's system allows lies and mutation freely, which we only allow in authored
  rumor versions.
- **Byte-exact promise quotes with source spans** (`memory/promises/`): no surveyed system ties a remembered commitment
  to the player's exact words.
- **Disclosure is not knowledge** (`engine/codex.ts` `knownEntities`) and **seeded, model-free rumor spread** with
  `leaks_to` (`memory/rumors/spread.ts`): deterministic where Talk of the Town is stochastic simulation.
- **Authored cues as suggestions, never forced lines**: Valve plays the line; we offer one optional line per generation,
  which suits an LLM voice better.

### Rejected

- **Per-member reflections every N turns (Generative Agents).** One model call per member on the shared 3090 competes
  with play; chapters, canon and inner voice already cover summarizing. Revisit only if P2 proves too thin.
- **LLM-rated importance per memory row.** Noisy, unreproducible across rerolls, breaks replay unless frozen; our
  `importance` from the read plus code signals is enough.
- **Full Versu/Praxis or CiF social simulation.** Authoring cost per social situation is the documented failure; our
  norms and cues are the cheap slice of it.
- **Dwarf Fortress legends / world simulation.** We run authored stories, not a simulated world; the boundary log plus
  chapter records is our legend.
- **Free belief mutation and lying in the knowledge model (Talk of the Town).** Mutated beliefs would need to pass the
  held-secret filter in every variant and cannot be validated by the author; authored rumor versions cover the effect.
- **Drama-manager rewrite (Façade).** Transitions, pacing tension and the living director already select the next beat.
- **Inworld-style strict knowledge filters by prompt.** Strictly weaker than what we do in code.
