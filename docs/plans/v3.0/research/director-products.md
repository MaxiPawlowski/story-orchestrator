# Director research: products and practice

Angle B (products, RP tools, tabletop practice, player reports), slug `director-products`, 2026-10-31. Research only; no
code changed. Question: how do shipped AI-narrative products, SillyTavern director extensions, solo-RPG tools and human GM
craft decide what happens next, and what could the living director (`src/generation/living/`) and expansion
(`src/generation/`) adopt as separate switches? Mythic GME's scene test, Ironsworn/Starforged clocks, oracles and
three-band outcomes are already harvested (`docs/plans/v2.8/27-gamification-report.md` G2, G11, G18-G22; built as v2.8 48)
and are not repeated here. Numbers are marked **measured** (a study ran it), **self-reported** (the vendor says so) or
**estimate** (ours).

## 1. Summary

- **Our director writes a single-lead future.** Each turning point gets one anchor, one stub and one opening gate, plus
  a pace fallback that opens the way in after 3 player turns anyway (`src/generation/living/plan.ts:97-136`,
  `LIVING_PACE_TURNS = 3` in `types.ts:9`). Tabletop practice (Alexander's inverse three-clue rule, node-based design)
  and Hidden Door's scene format ("set-up, a provocation, a limited set of endings", self-reported) both give every
  destination several ways in. **Multi-lead turning points** are the cheapest structural gain, and they are a change to
  one prompt and one op builder.
- **We cannot see how often we railroad.** The boundary log already keeps `evaluated` values for every fired transition
  (`src/engine/engine.ts:78,295`), so we can work out offline whether a living transition fired on its authored lead, on
  stub progress or on the turn-count fallback. A **railroad readout** (pace-forced share, refusal streaks, branches per
  anchor) costs no model call. It is the floor that every other proposal here needs.
- **How to answer a refusal has evidence now.** ChatRPG v3 (Aalborg thesis 2025, **measured**, n=12) compared redirection
  styles. In-world consequences rated best (mean appropriateness 2.19 on a -3..3 scale), then NPC influence (1.94). Hard
  denial rated worst (-2.03), and no participant preferred it. Our refusal path says one neutral sentence and tells the
  director to "let the world answer" (`src/runtime/agencyRecovery.ts:27`, `prompt.ts:79`), but it does not say how the
  world should answer. A **typed redirect** (consequence, NPC appeal or more information), picked from state in code,
  is free in model calls.
- **Hidden Door's main lesson is "turn generation problems into ranking problems"** (self-reported). It writes beats
  offline, and real-time play mostly ranks them. Our one-alternative prefetch (`livingCoordinator.ts:279-296`) is
  halfway there. **Prepare K candidates, then rank them at the boundary** would cut director latency on the reply path
  and give a choice between drafts instead of one take.
- **Fronts (Dungeon World) give world pressure a schedule.** A danger, 1-5 grim portents and an impending doom, plus
  stakes questions the GM refuses to answer in advance. Our director gets agendas and standing but no off-screen threat
  that advances when ignored. A **portent counter** as one director input line is small and deterministic. It must not
  punish inaction (harvest trap T1).
- **Products that write the player's actions get complaints.** Talemate's long-progress arcs may write player-character
  actions with "no way to exclude them" (its docs). FIREBALL raters flagged AI turns that removed player agency.
  Sakellaridis (2024, secondary report) found an LLM DM that "struggled to accommodate" unexpected choices and fell back
  to railroading. Our agency policy, critic and `narratesPlayer` guard are ahead of everything surveyed. Keep them.
- **Per-reply director outlines** (SillyTavern-Director, Talemate scene direction) are the common community pattern.
  For us they are the wrong trade: one more model call per reply on the shared GPU, and a per-turn block that hurts the
  prefix cache. Our checkpoint objective line plus the inner beat already cover that ground.

## 2. Survey

### 2.1 Hidden Door (narrative engine over licensed worlds)

- **What.** Hand-written trope and genre "recipes" (for example a heist: setup, a "something's gone horribly wrong" turn
  with withheld information, resolution), mapped onto each world by a "world seed" of about 100 lines of Python. Stories
  nest: a scene of about 5-8 minutes has a set-up, a provocation and a limited set of endings; an arc is 1-3 scenes (around
  9 for a heist). Each turn runs about 16 tasks, most of them not LLM calls. Classifiers rate how hard an action is for
  this character, and an embeddings ranker picks the next beat from hand-written and pre-generated beats. It also decides
  whether to close the scene toward its goal or open a new adventure. Players get three kinds of suggestion: plot
  progression, mischief and character history. A Postgres state plus an object-property table blocks impossible actions.
  "The LLM does not get to decide what happens." Generation runs offline on owned GPUs, where output is checked and cached.
- **Sources.** Interview with Hilary Mason, [AI Game Changers](https://aigamechangers.substack.com/p/the-machine-is-not-itself-creative)
  (self-reported); [Ian Bicking's design review (2025)](https://ianbicking.org/blog/2025/08/hidden-door-design-review-llm-driven-game);
  [PC Gamer](https://pcgamer.com/hidden-door-ai-game-narrative-rpg).
- **Evidence.** No published metric: the team calls its quality measure engagement, or "vibes".
- **Failure modes (Bicking).** Choices with no effect, and objectives that appear and resolve within one passage
  ("unstable and ungrounded objectives are a serious problem"). Typed input only regenerates the choice list. The
  narration focuses on the player character instead of the world driving the scene. Bicking's fix is the same as our
  design: outline and world state before prose, and choices that carry consequences.

### 2.2 AI Dungeon and Voyage (Latitude)

- **What.** Plot Essentials are always in context and prime the model to bring those details up again. Story Cards are
  keyword-triggered lore (at most 25% of the free context). Author's Note sits near the end, up to 300 characters.
  Scenarios carry essentials and cards into new adventures. Context priority when space runs short: Author's Note, Plot
  Essentials, Instructions, Story Summary. There is no plot structure at all; the player steers by editing these. Voyage
  (expanded beta April 2026) adds a "World Engine" described as an impartial GM over the model, with generated quests and
  "no dialogue trees or pre-planned quests" (press coverage, self-reported).
- **Sources.** [Plot Essentials](https://help.aidungeon.com/faq/plot-essentials),
  [context assembly](https://help.aidungeon.com/faq/what-goes-into-the-context-sent-to-the-ai),
  [Author's Note](https://help.aidungeon.io/faq/what-is-the-authors-note).
- **Takeaway for us.** Their documented caveat, that whatever sits in always-on context gets brought up again, is the
  failure our director's "never put anything private in the name, objective or rubric" rule already guards
  (`prompt.ts:97`). Nothing structural to adopt.

### 2.3 Talemate director agent

- **What.** The world editor holds an **overall intention** and a **current scene intention** (purpose, goals that mark
  success); autonomous Scene Direction requires both. After each turn the director reviews the scene and decides whether
  to act. Users nudge it with `#`/`##` prefixes. A `manage_plan` task list ("not an auto-executing beat queue") has
  statuses planning/ready/executing/completed/cancelled. "Generate long progress" plans 3-24 beats with optional outline
  and critique passes, and can "adjust its strategy between beats". Director personas change tone and pacing.
- **Sources.** [scene direction](https://vegu-ai.github.io/talemate/user-guide/agents/director/scene-direction/),
  [planning](https://vegu-ai.github.io/talemate/user-guide/agents/director/planning/),
  [scene intentions](https://vegu-ai.github.io/talemate/user-guide/world-editor/scene/direction).
- **Failure modes.** Long-progress arcs may write player-character actions and dialogue, with no way to exclude them
  (the docs say so). There is a per-turn director call.

### 2.4 SillyTavern director-style extensions (new since the v2.4/v2.8 harvests)

- **SillyTavern-Director** ([luisbrandao](https://github.com/luisbrandao/SillyTavern-Director), licence unstated). Before
  every bot reply a separate profile writes a short free-text outline of what should happen next. Only the latest outline
  is injected (`<director>{{outline}}</director>`, configurable depth and role). Outlines are stored per message and are
  editable or regenerable. Six prompt profiles: Default, Concise, Slow Burn, Plot Driver, Character Voice, Wildcard.
  There is no agency safeguard beyond prompt wording.
- **StoryMode** ([Prompt-And-Circumstance](https://github.com/Prompt-And-Circumstance/StoryMode), MIT). 43 genre styles
  with tropes and three-act templates. The arc runs over 5-50+ messages in thirds (Setup, Escalation, Resolution).
  Blueprints use `@@BEAT:N@@` / `@@NEXT_SCENE@@` markers, so the reply model itself signals pacing.
- **Pathweaver** (up to 6 next-direction suggestions) and **Super Objective** (chained objectives, the next one loads on
  completion) are suggestion and objective tools that our Now tab and checkpoint graph already cover.
- Already harvested elsewhere: Roadway, Guided Generations, st-gamemaster, Doom's Enhancement Suite twists, CYOA
  (`docs/plans/v2.4/extension-research/`, `docs/plans/v2.8/extension-research-2026-10-14/`).

### 2.5 Inworld, Convai, Character.AI (NPC platforms)

- **Inworld.** Per-character goals with intent or trigger activation, repeatable or one-shot
  ([goals docs](https://docs.inworld.ai/unreal-engine/runtime/character-reference/InworldGraphRuntimeData_Goals/InworldGraphRuntimeData_Goals)).
  Its Narrative Graph (with Xbox) is a design-time tool that generates beats and branches for designers to edit, discard
  and reorder ([blog](https://inworld.ai/blog/developer-facing-ai-game-development-tools-streamline-workflows)). AI
  proposes and the author decides, the same rule as our `suggest` tier.
- **Convai Narrative Design.** A graph of sections (objective and knowledge change per section) joined by named triggers
  that the game fires ([docs](https://docs.convai.com/api-docs/plugins-and-integrations/convai-unity-sdk/features/narrative-design/how-narrative-design-works)).
  This is structurally our checkpoint graph, minus extraction gates and minus any generation.
- **Character.AI Scenes** (2025): guided pre-built story formats. Only secondary coverage was found; no mechanism detail.

### 2.6 Research systems with player studies

- **ChatRPG v3 / SENNA** (Aalborg master's thesis, June 2025,
  [PDF](https://projekter.aau.dk/projekter/files/784680954/Narrative_Adherence_in_LLM_driven_Games.pdf)). The Scribe
  turns an adventure module into a **Narrative Graph** (a DAG of milestones with conditions). The Examiner judges each
  action's narrative validity, the Navigator updates progress, the Narrator writes prose and the Archivist keeps state.
  Six redirection strategies were proposed. Five GMs ranked them (mean rank, 1 = best): more information 1.2, NPC
  influence 2.4, consequences 2.4, illusion of choice (quantum ogre) 4, hard denial 5, humor 5. Players (n=12) rated hard
  denial, more information, NPC influence and consequences in three snapshots (puzzle bypass, enemy, ally mistreated).
  Results (**measured**): consequences was most preferred in every snapshot. Mean appropriateness: consequences 2.19, NPC
  influence 1.94, hard denial -2.03. Strategy had a significant effect (ART ANOVA p<0.001); snapshot type did not.
  Limits: small n, repeated measures, one module.
- **Static vs agentic GM** ([arXiv 2502.19519](https://arxiv.org/html/2502.19519v1), **measured**, n=12, within-subjects).
  Splitting narrator and archivist agents improved coherence (1.00 to 2.25, p=0.04) and immersion (p=0.034). Agency did
  not change significantly (2.17 to 2.67, p=0.19). Coherence decayed as the context filled, and the first version was
  "overly permissive".
- **Sakellaridis** (Utrecht thesis 2024; [secondary report](https://www.wargamer.com/dnd/ai-railroads-players)). Players
  rated the human DM higher on competence, flow and narrative progression, and the LLM DM higher on immersive
  environments. Complaints: railroading when choices were unexpected, information delivered late or unclearly, too little
  challenge.
- **FIREBALL** ([arXiv 2305.01528](https://arxiv.org/pdf/2305.01528)). Raters flagged AI turns that removed player agency,
  including one that dictated creature movement.

### 2.7 Tabletop GM technique

- **Don't prep plots, prep situations; three-clue rule; node-based design** (Justin Alexander).
  [Three Clue Rule](https://thealexandrian.net/wordpress/1118/roleplaying-games/three-clue-rule): any conclusion you need
  the players to reach needs at least three clues. The inverse holds for node-based scenarios: every node needs at least
  three leads into it, which is what makes the players' path free without a dead end
  ([node-based design](https://thealexandrian.net/?p=7949); [Don't Prep Plots](https://thealexandrian.net/wordpress/4147/roleplaying-games/dont-prep-plots)).
  The essays themselves were not fetched this session; the summary is from forum discussion plus prior knowledge.
- **Fronts** (Dungeon World, after Apocalypse World). Each danger has 1-3 grim portents in an adventure front (3-5 in a
  campaign front) that advance over time toward an impending doom if nobody deals with them, plus 1-3 stakes questions
  the GM wants answered by play, not decided in advance ("play to find out"). The front is GM-only. Portents usually
  surface on a failed roll. [Roll20 SRD: Fronts](https://roll20.net/compendium/dw/Fronts),
  [wiki](https://a-dungeon-world.fandom.com/wiki/Fronts).
- **Lazy DM** (Sly Flourish). A strong start in the middle of the action, potential scenes listed loosely, and **ten
  secrets and clues not tied to any location**: whichever scene the players reach can reveal one. They are "the connective
  tissue of a campaign" ([eight steps](https://slyflourish.com/eight_steps_2023.html),
  [resource document](https://slyflourish.com/lazy_gm_resource_document.html)).
- **Solo tools** (Mythic GME, Ironsworn, Starforged). The pattern every AI port keeps is that dice and oracles stay
  deterministic and the model only interprets. Examples: ironsworn-referee and agentic-rpg (Claude Code plugins), and
  Mythmaker, whose marketing says the oracle rolls, not the model. Mechanics already harvested: v2.8 27.

### 2.8 How players react to AI-invented plot (consolidated)

- **Two failure modes, named everywhere:** "overly compliant or rigidly railroading" (ChatRPG v3 intro), and "yes-and
  without but-therefore" (zero-stakes fan fiction; one low-quality source, treat as anecdote). Bicking's "railroaded into
  fun" is the wanted middle: strong situations, and an open answer to them.
- **Acceptance of steering is conditional on grounding.** ChatRPG participants "generally accepted moments of narrative
  steering, especially when grounded in character or world logic" (**measured**, qualitative). Bare refusal is the most
  disliked response measured.
- **Unstable objectives** (Hidden Door: an objective appears and resolves in the same passage) read as meaningless
  choice. Our rule that `opens_when` must not already be true (`prompt.ts:91`) is the right guard.
- **Focus drift onto the player character** (Bicking; also "the AI speaks for me", FIREBALL) is the agency complaint
  our policy targets.

## 3. Mapping to us

| Practice | What we have | Gap |
|---|---|---|
| Situations, not plots | Director objective is "world pressure", never player action (`prompt.ts:86`, `agency.ts:7-12`) | none |
| Inverse three-clue / limited endings | One opening gate per anchor (`plan.ts:97-99`), plus a pace fallback `any[gate, player_turns>=3]` (`plan.ts:126`); one prefetched alternative way only when branching and prefetch are on (`livingCoordinator.ts:279-296`) | **single lead**: when the player does something else, the turn counter carries them along anyway |
| Measure railroading | Boundary log keeps `evaluated` values (`engine.ts:78,295`); refusal streak derived from log plus audits (`agencyRecovery.ts`); divergence state (`divergence.ts`) | **no readout** of how the way in fired (lead, stub progress or pace) |
| Redirection style | Neutral player line `REFUSAL_PLAYER_TEXT` (`agencyRecovery.ts:27`); director told to "let the world answer the refusal" (`prompt.ts:79`); branch prompt "how the world answers" (`prompt.ts:159`) | **untyped**: nothing picks consequence, NPC appeal or information |
| Generation into ranking | Expansion pre-generates stubs; director prefetches one alternative way | **no candidate set and no ranking**; the first draft that passes is the one used |
| Fronts and portents | Agendas, standing, clocks (v2.7 36 G11), complications pool (v2.8 49, gated on SP6), frozen scene test (v2.8 48) | **no off-screen threat schedule** fed to the director |
| Stakes questions | Open threads go to the director (`prompt.ts:75`) | nothing stops the director from settling a question the author wants play to settle |
| Floating secrets and clues | Plan 62 prepared facts (stage 1 probe only), codex latches | belongs to plan 62; no new mechanism here |
| Never write the player | Agency policy, critic (`renderDirectorCriticPrompt`), `narratesPlayer` | **ahead of the field** |

Constraints check: the director runs on the remote authoring route (gpt-6.1-sol subscription), so extra director tokens
do not touch the GPU. Anything per reply on Artemis costs GPU time and prefix stability. The ops pass through
`checkDirectorOps` and fold at boundary work `living-apply`, so rollback ≡ replay holds for anything expressed as ops or
code ints.

## 4. Proposals (ranked)

### P1. Multi-lead turning points (`living.leads`, default on per owner rule)

- **Change.** The director answers `opens_when` as a list of 2-3 leads (each `reuse` or `new`), each a different
  observable step. The way-in gate becomes `any[lead1, lead2, lead3, pace]`. Modules: `prompt.ts` (schema line plus a rule
  "leads must differ in kind: a place, a person, an object or a choice"), `parse.ts` (array, limits),
  `plan.ts buildDirectorOps` (any-gate, renaming per lead), `checkDirectorOps` (each lead not true now and reachable,
  using the existing `gateImpossible`). Count every lead against `LIVING_MAX_NEW_QUALITIES` (2), so at least one lead must
  reuse an existing value. That keeps the extraction scope bounded. Branch prompt unchanged.
- **Cost.** About 60-120 more output tokens per director call (**estimate**), no extra calls. The extractor carries up
  to 2 more rubric lines per living frontier (it already carries 1-2).
- **Invariants.** Still one transition per boundary (one transition carrying an any-gate). Ops fold the same way, so
  rollback ≡ replay. No privacy surface: the rules for private plans apply to every rubric.
- **Measure.** P2's pace-forced share and divergence-branch rate, before and after, on a no-model plumbing scenario
  (debug-response drafts) plus a CL director run offline on Sol (the plan 22 M1 harness shape: impossible or
  open-on-arrival gates must stay 0). The RP effect comes from the living rows in the final suite.
- **Size S-M.** No GPU for D or CL; RP needs it.

### P2. Railroad readout (author-only, pure)

- **Change.** A pure projection over `engine.boundaryLog` plus divergence state. For each living transition it records
  which leaf of the way-in gate held in `evaluated`: lead, stub progress or `player_turns_in_checkpoint` fallback (only
  the fallback = **pace-forced**). Also counted: refusal streaks (`agencyRecovery`), branches per anchor, and leads
  available against leads used. It goes to the Author console health tab and the `so-session digest`. New module
  `runtime/railroadView.ts` (lazy), read from the snapshot only in Author view.
- **Cost.** Zero model calls. Reads the log only.
- **Invariants.** Derived at read time, so reload and rollback reproduce it. Author-only (odds and fallbacks are
  spoilers, trap T9).
- **Measure.** Jest over recorded boundary logs. Then an informational floor, set before the first run and never retuned:
  for example pace-forced share at most 1/3 of living transitions in a session (**estimate**, an owner decision). It
  becomes the yardstick for P1, P3 and P4.
- **Size S.** No GPU.

### P3. Typed redirect for refusal and divergence (`living.redirect`)

- **Change.** When `agencyRecovery` or `stepDivergence` fires, code picks one answer type from state, in the order the
  ChatRPG data suggests:
  - **NPC appeal** when an enabled member with an authored `roster[].role` is on stage;
  - **consequence** when the refused route touched a declared quality or faction;
  - **more information** when the player's turns were question-only (`isQuestionOnly`);
  - never a hard denial.

  The type and a code-built clause go into the director and branch prompts (replacing the bare "let the world answer")
  and into the next loud reply's objective clause, placed late like story lore. Modules: `generation/living/prompt.ts`,
  `runtime/agencyRecovery.ts`, `engine/agency.ts` (one more clause builder).
- **Cost.** No extra calls. One sentence of prompt.
- **Invariants.** The pick is deterministic (seeded tiebreak by hash of chat, story, boundary and key), so rollback ≡
  replay. The agency clauses stay: "consequence" must be the world's fallout, never narrated compliance. Prefix cache:
  inject at the late depth, as `lorePlacement.ts` does.
- **Measure.**
  - A blind Sol rating pack: matched refusal moments, with and without the switch, rated on appropriateness, immersion
    and "did it decide for me", mirroring the ChatRPG rubric.
  - A `so-session` charter that refuses the prepared route three times.
  - D jest for the picker.
- **Size M.** RP needs the GPU for the rating pack. The CL director leg does not.

### P4. Prepare K, rank at the boundary (`living.prepareCandidates`)

- **Change.** While the frontier is idle, prepare K=2-3 next-anchor drafts on the authoring route, each passing
  `checkDirectorOps` and the critic. They are not applied. At the planning boundary, rank them by fit to what the player
  actually pursued:
  - a judge choice question (TypeSafe), the same shape as `buildDivergenceRequest`;
  - else the overlap of `builds_on` with open threads;
  - seeded tiebreak.

  Freeze the pick in a record keyed by frontier and planning boundary (the scene-test pattern, `sceneTest.ts`), so a
  replay picks the same draft. Modules: `livingCoordinator.ts` (job and pool), new `generation/living/rank.ts`, a
  `judge/` question.
- **Cost.** K× director calls (remote subscription; **estimate** 2-3× tokens) and one judge call. Upside: a ready anchor
  removes the director's latency at the boundary (time-to-anchor is not measured yet).
- **Invariants.** An uncalibrated judge use is refused (`uncalibrated`), so code ranking must be the fallback. The pool
  must be dropped on rollback before its planning boundary.
- **Measure.** Blind Sol rating of the ranked pick against candidate 1. Time-to-anchor from the journal. Divergence rate
  (P2).
- **Size M-L.** No GPU for D or CL.

### P5. Portent counter as a director input (`living.fronts`)

- **Change.** Optional authored `living.fronts[]` (danger, 1-5 portent lines, doom; author-only), or one front the
  director proposes per chapter as a typed op. A code int `front_<id>` advances one step in the latch pass when a living
  anchor closes without the player engaging that front's thread (seeded, monotonic, with a `ROLLBACK_DETECTORS` entry).
  The director prompt gets "Off-screen, <next portent> is about to happen" as world pressure. `stakes[]` is a list the
  critic checks: an objective that settles a stakes question fails.
- **Cost.** One prompt line, no calls.
- **Invariants.** Trap T1 (punishing inaction): cap at one step per chapter, never past the last portent without an
  author-set `doom_allowed`. Never on a player surface. Overlap: this must reuse v2.7 36 clocks rather than add a second
  counter type, and it stays out of the SP6-gated complication pool.
- **Measure.** D floors (advance, rollback, detector). Then informationally, the share of director anchors that cite a
  portent.
- **Size M.** No GPU for D.

### Not ranked: floating secrets and clues

Lazy-DM "secrets not tied to a location" is the same idea as plan 62 stage 2 (prepared facts) with no location binding.
Fold it into that owner decision rather than making it a director feature.

## 5. What we do that the field doesn't; rejected ideas

**Ahead of the field.** No product surveyed has:

- graph operations that fold at a boundary with rollback ≡ replay (`fold.ts`);
- a critic plus a guard that refuses drafts narrating the player (Talemate admits it cannot exclude them);
- cast plans given to the director under a never-reveal rule, with the held-secret guard at apply time;
- a two-question divergence judge (fits no exit *and* commits to an action, `divergence.ts:114-140`) that ignores
  question-only and OOC turns;
- a frozen, seeded scene-test draw;
- "Save as story", which turns a living run back into an authored graph.

The closest research system (ChatRPG v3's milestone DAG plus Examiner and Navigator) matches our extraction plus gates,
but it does not generate the graph ahead of the player.

**Rejected.**

- **Per-reply director outline** (SillyTavern-Director, Talemate scene direction): an extra GPU call per reply and a
  moving per-turn block. Our objective line and inner beat cover it.
- **Long-progress beat queues that write player turns** (Talemate): they violate the agency policy.
- **Illusion of choice / quantum ogre as a redirect**: GMs ranked it 4 of 6, with split views, and it dishonestly
  invalidates the player's choice. (Plan 62 is about committing facts, which is different.)
- **Humor redirects** (ranked 5 of 6).
- **Reply-model pacing markers** like StoryMode's `@@NEXT_SCENE@@`: they hand transition authority to Artemis and break
  one-transition-per-boundary determinism.
- **Fine-tuned small narrator** (Hidden Door's early route, criticised by Bicking): out of scope.
- **Choice menus every passage** (Hidden Door): this is chat, and Now-tab suggestions already exist.
- **Fully generated, no-anchor quests** (Voyage): plan 22 deliberately keeps anchors.
