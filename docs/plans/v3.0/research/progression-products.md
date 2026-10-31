# Progression research: games, tabletop, AI-fiction products

Angle `products` (B), 2026-10-31. Research only; no code changed. Question: how do games, tabletop GM practice and
AI-fiction products move a story forward without stalling or rushing, and what could we add as separately switchable
pieces? Sources are linked inline. "Primary" = the designer's own slides, rules or docs; "secondary" = wiki, press or
forum summary; "self-reported" = a user post with no measurement.

## 1. Summary

- **We already cover most of the classic toolkit.** Authored graph with typed gates (quest state machines), agendas that
  step on their own (Dungeon World fronts), PbtA-style checks with miss/weak/strong bands and a twist, clock widgets
  (Blades, display only), a tension EMA against an arc template with escalate/hold/ease hints (a crude L4D director),
  open stretches that pull after N player turns and offer authored encounters when quiet (storylet opportunity deck),
  judge-backed idle and low-adversity hints, divergence branching in living stories, and player skip-ahead (plan 32).
  The gaps are narrow.
- **Gap 1, stall on a task checkpoint (the biggest).** The "nothing is moving" signal (`quietRead`) and the
  escalating pull exist only for open stretches. On an ordinary checkpoint whose exit hinges on one discovery the model
  never delivers, nothing escalates except the generic judge idle hint. Gumshoe's core clues and the Alexandrian
  three-clue rule are the field's answer: redundant authored leads, handed out as play stalls. P1.
- **Gap 2, no rest after a peak.** L4D's director (primary slides) runs build-up, sustain peak, peak fade, then a
  30-45 s relax with minimal threat, and exempts boss encounters. RimWorld's Cassandra forces at least 1.9 days between
  major threats. Our steering follows the expected curve only; after a climax it can go straight back to "escalate",
  and idle/adversity hints and encounter offers do not know a peak just ended. P2.
- **Gap 3, rushing.** User reports and the Hidden Door review agree on the failure: one reply covers several beats,
  objectives appear and complete in the same moment, conflict resolves at once. The most consistent fix in the community
  is "say what must not resolve yet" and "one beat per reply". We have `GUIDANCE_NOT_YET` (one beat at a time) but no
  measure of fast exits and no dwell rule. P3.
- **Clocks the narrator can feel** (Blades danger/racing clocks, DW grim portents): our clock widget shows a number to
  the player, but nothing tells the narrator the danger is near. P4.
- **Player-stated drives** (Burning Wheel Beliefs, Sunless Skies ambitions): the GM aims pressure at what the player
  said they want. We aim pressure at the authored objective only. P5.
- **Keep loudly:** deterministic gates with rollback ≡ replay, the agency policy (no product we found forbids the model
  from narrating the player's choice by code-side policy), typed extraction instead of "is the task done?" prompts every
  N messages (ST Objective), and seeded chance.

## 2. Survey

### 2.1 Left 4 Dead AI Director (Valve, Mike Booth)

- **What.** "Survivor intensity" per player rises with damage taken, incapacitation, ledge pulls and nearby kills, and
  decays toward zero over time, but **not while enemies are actively engaging**. Population is modulated in four states:
  Build Up (full threat until intensity crosses the peak threshold), Sustain Peak (3-5 s more, "ensures minimum build up
  duration"), Peak Fade (minimal threat until intensity decays out of peak range, so the current fight finishes without
  eating the relax time), Relax (minimal threat 30-45 s or until the team has travelled far enough, then Build Up).
  Boss encounters are not affected: "boss encounters are intended to change up the pacing anyhow". Stated principle:
  "Algorithm adjusts pacing, not difficulty"; "Survivor intensity estimation is crude, yet the resulting pacing works".
- **Source.** Primary: [Booth, "The AI Systems of Left 4 Dead", Valve 2009 slides](https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf)
  (text extracted from the PDF for this note). Context: [Wikipedia, Mike Booth](https://en.wikipedia.org/wiki/Mike_Booth).
- **Evidence.** Commercial success and long modding life; no published player study. Designer's claim only.
- **Failure modes.** A crude intensity signal can misfire; the relax window is time-based, which suits a shooter, not a
  turn-based chat (we must count player turns).

### 2.2 RimWorld storytellers

- **What.** Selectable storyteller personalities set threat cadence. Cassandra Classic alternates about 4.6 "on" days
  and 6 "off" days; each on phase sends one or two major threats with **at least 1.9 days between them**. Phoebe has long
  gaps; Randy is random and can leave long quiet stretches.
- **Source.** Secondary: [RimWorld wiki, Cassandra](https://rimworldwiki.com/wiki/Cassandra),
  [AI Storytellers](https://rimworldwiki.com/wiki/AI_Storytellers), [Randy Random](https://rimworldwiki.com/wiki/Randy_Random).
- **Lesson.** A minimum gap between big beats is the cheap rule players notice; personality = parameters of one curve.

### 2.3 Tabletop: three-clue rule, Gumshoe core clues, leads

- **What.** Justin Alexander: "for any conclusion you want the PCs to make, include at least three clues"; node-based
  design wants three clues in each node and three pointing to it; the inverse rule (reach any three clues, reach at least
  one conclusion). Gumshoe (Robin Laws): core clues are handed out without a roll whenever the player looks in the right
  place, so the plot "never stalls out because of a bad die roll"; rolls only buy extra, non-core information.
- **Source.** Primary: [The Alexandrian, Three Clue Rule](https://thealexandrian.net/?p=7985),
  [node-based design follow-up](https://thealexandrian.net/?p=8032). Secondary: [Wikipedia, Gumshoe](https://en.wikipedia.org/wiki/Gumshoe_System),
  [Pelgrane, giving out clues](https://pelgranepress.com/2020/09/16/see-page-xx-give-a-clue-giving-out-clues-in-gumshoe).
- **Evidence.** Widely adopted GM practice; no measurement. Gumshoe's caveat: the guarantee still needs the player to
  look in the right place.
- **Mapping.** Our gates are exactly "conclusions". An exit that hinges on a single extractor leaf is a one-clue node.

### 2.4 Tabletop: clocks, fronts, moves, beliefs

- **Blades in the Dark clocks.** Danger clocks fill on consequences and the danger lands when full; racing clocks pit
  two clocks against each other (Search vs Sunk); tug-of-war clocks fill and empty; 4/6/8 segments by difficulty.
  Secondary: [Roll20 BitD compendium](https://roll20.net/compendium/BITD/Progress%20clocks),
  [Alexandrian cheat sheet](https://www.thealexandrian.net/creations/bladesinthedark/bladesinthedark-cheat-sheet-v2.pdf).
- **Dungeon World fronts.** Each danger has grim portents (1-3 per adventure front) leading to an impending doom; the GM
  advances them when players look away and revises them as players act; fronts stay GM-only. Secondary:
  [Roll20 DW fronts](https://roll20.net/compendium/dw/Fronts), [Sly Flourish](https://slyflourish.com/fronts_in_dnd.html).
- **PbtA moves.** The MC makes a move when players look to the MC or after a miss; "soft" moves set up a threat the
  player can still answer, "hard" moves land it. The soft/hard words come from later PbtA games, not AW 2e. Secondary:
  [Magpie Games, picking GM moves](https://magpiegames.com/blogs/news/picking-the-right-gm-move-in-pbta-part-one).
- **Burning Wheel Beliefs.** Players write Beliefs; they tell the GM what the story is about, the GM's prep should
  challenge them, and pursuing them earns artha. Community warns rewards get gamed if loosely judged. Secondary
  (forums): [BW forums, beliefs as GM signal](https://forums.burningwheel.com/t/interpretation-issues-with-beliefs-and-earning-artha/14470).
  Sunless Skies "ambitions" are the video-game form (player-picked long goal with milestones).

### 2.5 Disco Elysium checks

- **What.** White checks can be retried after the related skill rises by a point (or other unlocks); red checks are
  one-shot, and failing one closes a branch without blocking the main plot. Secondary:
  [Gamepressure guide](https://www.gamepressure.com/disco-elysium/can-skill-checks-be-repeated/zee405).
- **Lesson.** Retry gated on a state change, not on time, keeps a failed check from being a dead end or a spam button.

### 2.6 Storylets and priority systems (Failbetter, Inkle, Supergiant)

- Covered in `memory-game-narrative.md` §2.2 (storylets, salience, visit counts). For progression the relevant part is
  the opportunity deck (a draw of eligible situations), which our open-stretch encounters already are. Hades: story
  events unlock per run and are spread so each run gives some story; detailed mechanism not found in this pass (only
  [Game Developer's summary](https://gamedeveloper.com/design/how-supergiant-weaves-narrative-rewards-into-i-hades-i-cycle-of-perpetual-death)
  of a Kasavin interview). Not used for proposals.

### 2.7 AI-fiction products

- **Hidden Door.** Generated passage plus three choices per beat over a prewritten broad arc. Ian Bicking's review
  reports both failures at once: an intro that drags on choices with no effect, and objectives "created and resolved in
  the same moment" (an objective appears and the chapter ends), actions almost always succeed, cruelty forgiven at once.
  His fix list: outline before prose, decide consequences before choices, track world state, allow failure.
  Self-reported review: [Bicking 2025](https://ianbicking.org/blog/2025/08/hidden-door-design-review-llm-driven-game).
- **Friends & Fables (Franz 2.0).** The GM model rewrites a "plot" summary and an editable "plan" at the end of every
  message; on-the-fly quest generation was removed because plot and plan carry quests narratively; a working-context
  drawer with typed blocks, priorities, expiry and budgets. Primary patch notes:
  [Franz 2.0](https://fables.gg/patch-notes/franz-20-working-context-lore-improved-planning-and-more). No eval.
- **AI Dungeon.** Plot Essentials (always in context), Story Cards (keyword-triggered), Author's Note (last instruction);
  official pacing tip is a line like "Keep scenes moving" in the Author's Note. Primary help:
  [Plot components](https://help.aidungeon.com/faq/plot-components).
- **SillyTavern Objective extension.** The model writes a task list from an objective; every N messages a separate call
  asks whether the current task is done (frequency 1 roughly doubles calls). Primary:
  [ST docs, Objective](https://docs.sillytavern.app/extensions/objective/). Guided Generations, Roadway and CYOA were
  reviewed in `docs/plans/v2.4/extension-research/` (player-side steering and option lists); nothing new for progression.
- **User reports (self-reported, mixed quality).** Models "progress the story too far" in one reply and settle tension
  immediately; suggested fixes are one beat per reply, no location jumps inside a reply, and naming the open threads that
  must not resolve yet, with mixed outcomes ("yes, but"). Sources: [Character.AI rushing guide](https://www.roborhythms.com/character-ai-rushes-the-story/),
  r/SillyTavernAI threads via mirror ([example](https://reddit.sentinel-team.org/posts/1qkknor/snapshots/2026-01-24T06%3A41%3A26.043532Z)).

## 3. Mapping to us

| Technique | What we have (paths) | Real gap | Fit |
|---|---|---|---|
| Quest state machines | `engine/quests.ts` (hidden/offered/active/done/failed, steps, `failed_when`), gates `engine/gates.ts`, one transition per boundary (`engine/engine.ts:103` `BOUNDARY_STEPS`) | None structural. | Have it. |
| Gumshoe / three-clue | Stall check re-reads when extraction missed a met gate (`runtime/coordinators/extractionCoordinator.ts:179-231`, judge use `stallCheck`); author console shows unmet gates | Nothing helps when the gate is truly unmet: no redundant leads, no escalation on a task checkpoint. `quietRead` returns null outside open stretches (`pacing/quiet.ts:46`); `stretchLine` returns null for a non-open checkpoint past its opening (`runtime/coordinators/pacingCoordinator.ts:158-161`). No authoring check for one-clue exits. | Good: code-only, derived from the boundary log. |
| L4D build/sustain/fade/relax, Cassandra gap | Tension EMA + arc template (`pacing/tension.ts`, `pacing/shapes.ts`, `pacingCoordinator.ts:129-146`), steering `pacing/steering.ts:51-61`, committed `tension.history` rebuilt on rollback (`pacingCoordinator.ts:101-122`) | No post-peak state; escalate can follow a climax; judge idle/adversity hints (`runtime/judgeIdeasWarden.ts:45-48`) and encounter offers ignore a recent peak. No "do not decay while engaged". | Good: pure function of `tension.history` + log, so rollback ≡ replay for free. |
| Rush guards | `GUIDANCE_NOT_YET` (one beat at a time, `pacing/guidance.ts:7`), `NO_SKIP_CLAUSE`, agency check judge use, `player_turns_in_checkpoint` counter (`engine/stretch.ts:3`) authors can gate on | No measure of exits fired on the entering turn from a non-player reply; no dwell shorthand; no author warning. | Good for readout + diagnostic; dwell must stay author opt-in. |
| Blades clocks / DW fronts | Clock widget (display, `components/widgets/WidgetCard.tsx:122`), agendas step on pace (`engine/lifeSchema.ts:61-75`), check bands + twist (`engine/gameSchema.ts:121-133`), rolled qualities | Narrator never told a danger clock is near full; check misses do not tick a clock by declaration. Agendas already cover portent sequences. | Medium; verify agenda overlap first. |
| PbtA moves on silence / miss | Idle hint (judge), encounter offers, check outcome block | Covered enough. | Skip. |
| Burning Wheel Beliefs / ambitions | Player profile and identity step (`engine/player.ts`, start pane), objective lines | No player-written drive that steering or offers aim at. | Medium; prompt-visible player text, needs blind rating. |
| Disco white checks | `check_<id>_rolled` latched once (`engine/validate/checkRefs.ts:43`) | Every check is red (one-shot). | Small, pure. |
| ST Objective / Franz plan | Authored objectives, typed extraction, living director plans only at boundaries | None; per-turn LLM plan rewrite would cost a GPU call per turn. | Reject (see §5). |

## 4. Proposals (ranked)

### P1. Stuck ladder with authored leads on any checkpoint (Gumshoe core clues + three-clue rule) — size M

- **Change.**
  - Schema: optional `checkpoints[].leads: string[]` (2-4 short player-safe situations that make the exit reachable,
    e.g. "a dockhand mentions the ledger was moved") and optional `stuck_after` (player turns, default from pace
    `PACE_PULL_AFTER.unhurried` = 6). Validation in `validate/checkpoints.ts`; Studio field; guide topic; wizard parser.
  - Signal: generalize `pacing/quiet.ts` into `stuckRead` for any checkpoint: player turns in the visit ≥ `stuck_after`
    and no watched exit key moved in the last `QUIET_WINDOW_TURNS` (same `watchedQualities`, same window snapshots).
    Rung = 1 + floor((turns − stuck_after) / QUIET_WINDOW_TURNS), reset when any watched key moves (L4D: do not escalate
    while the scene is active).
  - Delivery: `pacingCoordinator.stretchLine` gains a non-open branch: rung k renders lead k (cycling) as "If it fits,
    let the world make this available; never resolve it for the player: <lead>". Past the last lead, fall back to the
    agency `alternate` recovery that already exists, else one generic line "offer one concrete way toward the current
    objective". No leads authored = generic line only from rung 2.
  - Authoring diagnostic `one-clue-exit` (warning, `studio/` diagnostics + `storyChecks.ts`): a non-final checkpoint
    whose every exit needs one specific extractor leaf, with no counter/time fallback leaf, no `alternate` and fewer than
    2 leads. Message cites the three-clue rule in plain words.
- **Cost.** No model call. 30-60 tokens in the guidance tail only while stuck. Pure code.
- **Invariants.** Derived from the boundary log + player turn ids (as `quietRead`), so rollback ≡ replay with no slice.
  Lead text passes the resting filter and the `knownEntities` check, reusing `pacing/focus.ts` `focusSafe`; a lead that
  fails is dropped with an author-only journal line. Guidance block is per-turn already, so the prefix is unchanged.
  Agency: a lead is world pressure, never the player's act (`ONE_SHOT_SCOPE`-style clause). Lazy: the diagnostic in the
  Studio chunk; runtime part is small.
- **Measure.** Jest: rung table on recorded logs; diagnostic fires on a fixture, silent on a three-lead fixture.
  No-model scenario: scripted replies that never satisfy the gate, assert rung 1/2/3 lines appear at the predicted
  player turns and vanish after a watched key moves. Model lane (GPU): a stuck fixture, 10 runs × 2 arms, floor
  (predeclared, informational) "median turns to exit drops by ≥ 30%, flags for heavy-handed/forced ≤ control + 1" with
  blind Sol rating (owner-gated). Payload golden: armed vs not armed shows only the guidance tail.

### P2. Peak, fade and relax window (L4D director, Cassandra minimum gap) — size S/M

- **Change.** Pure `pacing/phase.ts`: from `tension.history` and the boundary log, compute the phase
  `build | sustain | fade | relax`:
  - sustain while committed smoothed ≥ 0.75 (critical) and the newest level is fresh (`tensionEvidenceFresh`);
  - fade once it drops below 0.75; relax begins at the first player turn after fade or after a fired transition out of
    a checkpoint with `tension_target` critical/peak, and lasts R player turns (default 2; per-story `pacing.relax_turns`);
  - exempt: the active checkpoint authors `tension_target: peak` (L4D boss rule: authored climaxes keep their own pacing).
  - Effects during relax: `getSteeringHint` never returns `escalate` (hold or ease); `judgeIdeasWarden` suppresses the
    adversity and idle findings; `quietRead`/P1 rungs do not advance; `pullStage` capped at `gentle`. The author view
    shows the phase on the HUD card's notes level.
- **Cost.** None at runtime beyond a few comparisons; saves judge-hint injections during relax.
- **Invariants.** `tension.history` is already rebuilt from the surviving log on rollback (`replayCommitted`), so the
  phase is replay-safe. Thinking/inner voice untouched. Deterministic.
- **Measure.** Offline, no GPU: run the phase function over archived session tension series (so-sessions) and count
  "escalate hints within 2 player turns after a peak", before vs after (target 0 after, by construction) and how often
  relax fires per 50 turns (sanity: 1-4). Jest property: phase(log) equals phase(replay after random rollbacks).
  Quality: blind Sol pairs for "breathing room" on 2 sessions (GPU, owner-gated).

### P3. Fast-exit readout, dwell shorthand and an open-threads line (anti-rush) — size S

- **Change.**
  - Readout (author-only, on by default): boundary work records a `fast` flag on a fired transition when the deciding
    read's evidence span lies wholly in a non-player reply and the visit had ≤ 1 player turn. Shown in the Author
    console activity tab and the inline timeline at level 3; counted in `so-talk-metrics.mts`.
  - Dwell shorthand: `checkpoints[].min_turns` compiles at validation to an extra leaf
    `player_turns_in_checkpoint >= n` ANDed into each exit gate not marked `urgent: true`. No engine change (the counter
    exists), so `select` stays one transition per boundary. Default absent; the diagnostic below suggests it.
  - Diagnostic `exit-on-entry` (info): an exit whose gate can hold on the entering turn of an anchor with
    `tension_target` ≥ tense and no counter leaf.
  - Open-threads line (switch, prompt change, needs rating): when the active checkpoint has unmet exits, guidance adds
    "The current situation is not resolved yet; resolve it only through what the player does or chooses." Uses no exit
    names, so nothing is disclosed.
- **Cost.** No model call; the line is ~20 tokens in the per-turn guidance.
- **Invariants.** The flag lives on the boundary log entry (rolled back with it). The compiled leaf reads an existing
  counter that already has rollback coverage; `storyDiff` sees the compiled gate like any other. Deferral cannot narrate
  past the graph because the reply already happened: the risk is a mismatch between prose and state, which is why dwell
  stays author opt-in.
- **Measure.** Offline over archived session logs: share of fired transitions flagged fast (baseline first, no target).
  Scenario (no-model): `min_turns` holds an exit until the nth player turn, `urgent` bypasses. Open-threads line: payload
  golden declared hunk + blind rating pack (two arms, Adolion-fresh lane, GPU), floor "fast-exit share drops, decides-for-
  player flags not worse".

### P4. Clocks the narrator can feel (Blades danger clocks, DW portents) — size S/M

- **Change.** A clock widget's quality may declare `ticks_on: [{ check: <id>, on: "miss" | "weak" }]` (applied in the
  latch pass after checks record, like faction moves) and `near: { at: <filled>, line: "<player-safe pressure>" }`. When
  filled ≥ `near.at`, the guidance carries the line until full (then the authored gate on the clock fires as today).
- **Overlap.** Agendas already sequence portent-like steps with public lines; build this only if authoring a danger clock
  as an agenda proves awkward in the Studio (check with the owner first).
- **Cost.** No model call; one short line while near.
- **Invariants.** A new compiled write needs a `ROLLBACK_DETECTORS` entry and a code-only seed in the rollback floor
  (architecture rule). Line passes the resting filter.
- **Measure.** Jest on tick rules and the detector guard; no-model scenario: a miss ticks, near line appears at threshold.

### P5. Player-stated drives (Burning Wheel Beliefs, ambitions) — size M

- **Change.** Optional step in the start pane (`#so-briefing`): up to 3 short lines "what your character wants". Stored
  per chat (`extras.player.drives`, set before boundary 0 like the identity choice; editable later as a new boundary
  event). Used in code only: encounter offers and P1 leads are ranked by word overlap with drives (`memory/words.ts`),
  and the escalate hint says "press on what {{user}} wants: <drive>" when one drive overlaps the active objective.
  Never gates a transition; the graph stays authored.
- **Cost.** ≤ 25 tokens in the steering line when used; stable per chat.
- **Invariants.** Player text reaches prompts (owner is the player; still clip and strip brackets). Rollback: drives are
  keyed by the message index they were set at. Agency: pressure, never the player's choice.
- **Measure.** Blind Sol pairs "the story responds to what I want" with vs without drives on 2 sessions (GPU,
  owner-gated); jest on ranking.

### P6. White-check retry (Disco Elysium) — size S

- **Change.** `checks[].retry: "on_change"`: a rolled check may roll again once any of its modifier qualities changed
  since `check_<id>_rolled`, at most `retry_max` (default 1). New code key `check_<id>_tries` with a detector.
- **Measure.** Jest + rollback guard test; no-model scenario. Low priority: only matters for stories that use checks.

## 5. What we do that the field does not, and rejected ideas

### Keep

- **Deterministic progression with exact undo.** Gates over typed state, one transition per boundary, rollback ≡ replay.
  Products we found (Hidden Door, Franz, AI Dungeon) progress by prose or a model-written plan; none can undo a plot step
  on a regenerated reply.
- **Code-side agency policy.** Steering and guidance never narrate the player's acts (`pacing/steering.ts` playerClause),
  plus a judge agency check. AI Dungeon's official tip ("keep scenes moving") is the opposite pressure.
- **Typed extraction instead of periodic "is it done?" prompts** (ST Objective): one shared read, judge stall check only
  when a met gate was missed.
- **Open stretches with an escalating pull and quiet-triggered encounters**: a storylet deck that respects the player's
  detour; Cassandra-like cadence without randomness.
- **Divergence branching** (`generation/living/divergence.ts`): the living director branches when two committed player
  actions fit no exit, which is closer to a GM following the players than any surveyed product.

### Rejected

- **Per-turn model-written plot/plan (Franz 2.0).** One extra call per turn on the shared 3090, nondeterministic, would
  need freezing for replay; the living director already plans at boundaries.
- **Random storyteller (Randy).** Long random droughts are the documented complaint; our seeded scene test already adds
  bounded surprise.
- **Difficulty adaptation (RimWorld wealth, adaptive success rates).** Booth's own rule is pacing, not difficulty; the
  adversity hint covers "nothing costs anything".
- **Global "keep scenes moving" / per-reply beat cap in the system prompt.** Fights the agency policy and thinking
  closure; P3's narrower line gets a blind A/B instead.
- **Visible clocks for every gate.** Spoils authored structure; disclosure stays a latch (`engine/codex.ts`).
- **Option lists every turn (Hidden Door's three choices, Roadway, CYOA).** We have suggestions on request; forced menus
  were the reviewer's stall complaint.

## Code facts verified

- `src/engine/engine.ts:103` `BOUNDARY_STEPS` = drain, counters, derive, quests, latch, select, entry, latch-after-entry.
- `src/pacing/quiet.ts:46` `quietRead` returns null unless the active checkpoint is an open stretch.
- `src/runtime/coordinators/pacingCoordinator.ts:158-161` `stretchLine` returns null for a non-open checkpoint past its
  opening; `:101-122` `replayCommitted` rebuilds `tension.history` from the surviving log.
- `src/pacing/steering.ts:51-61` hint direction from expected − smoothed only (no peak memory).
- `src/runtime/judgeIdeasWarden.ts:45-48` adversity (18 of 20) and idle (3 of 4) findings, cooldowns 20 and 4.
- `src/engine/stretch.ts:3` `player_turns_in_checkpoint` counter; `:43-47` pull stages gentle/steady/strong.
- `src/engine/validate/checkRefs.ts:43` `check_<id>_rolled` int set once.
