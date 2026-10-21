# Niches outside SillyTavern: player-experience scout (2026-10-21)

Docs only. Lens: what the player feels at the table (`_brief.md`). Not repeated: everything in `27-gamification-report.md`
and `C:/dev/st-extensions-research/gamification/README.md` (Iron Vault, clocks, oracles, quest logs, Kanka, …), and every
row of `61-harvest-triage-2026-10-14.md`.

## Method

- 18 sources, picked for code or a detailed design writeup. Papers read as text (pdftotext), not abstracts.
- Code cloned `--depth 1` to `C:/dev/st-extensions-research/niches/<slug>/source`, read only, nothing run or installed:
  - `felt` (`mkremins/felt` @ `5c5146c`, no licence file: ideas only)
  - `winnow` (`mkremins/winnow` @ `22ff8ee`, no licence file: ideas only)
  - `mimir` (`subtalegames/mimir` @ `44e8e4c`, MIT/Apache-2.0)
  - `centrifuge` (`ShiJbey/centrifuge` @ `2f2abfb`, MIT; visual sifting editor for Talk of the Town, skimmed)
- Every "SO has / lacks" claim is checked against master `6861d989` with a cited file. No game rules text or content copied.

## Sources

1. Emily Short, quality- and salience-based narrative: https://emshort.blog/2016/04/12/beyond-branching-quality-based-and-salience-based-narrative-structures/ ; storylets: https://emshort.blog/2019/11/29/storylets-you-want-them/
2. Elan Ruskin, AI-driven dynamic dialog (Valve, GDC 2012): https://www.blog.radiator.debacle.us/2012/07/rule-databases-for-contextual-narrative.html ; code: https://github.com/subtalegames/mimir
3. Hades reactive script (Supergiant): https://gamespot.com/articles/hades-writer-explains-script-philosophy-after-player-discovers-incredible-detail/1100-6482650/
4. Façade, Mateas & Stern, "Structuring Content in the Façade Interactive Drama Architecture" (AIIDE 2005): https://cdn.aaai.org/AIIDE/2005/AIIDE05-016.pdf
5. Versu, Evans & Short (IEEE TCIAIG 2014): https://www.cs.uky.edu/~sgware/reading/papers/evans2014versu.pdf
6. Talk of the Town, Ryan et al., "Toward Characters Who Observe, Tell, Misremember, and Lie" (AIIDE 2015): https://ojs.aaai.org/index.php/AIIDE/article/view/12825 (also covers Dwarf Fortress rumors)
7. Felt (ICIDS 2019) + Winnow (AIIDE 2021), story sifting: https://github.com/mkremins/felt , https://github.com/mkremins/winnow
8. Loose Ends, Kreminski et al. (AIIDE 2022): https://ojs.aaai.org/index.php/AIIDE/article/view/21955
9. Crusader Kings III event modding: https://ck3.paradoxwikis.com/Event_modding
10. RimWorld AI storytellers: https://rimworldwiki.com/wiki/AI_Storytellers
11. Wildermyth (Nate Austin interview): https://turnbasedlovers.com/10-turns-interview/with-wildermyth-developer
12. AI Dungeon context and memory: https://latitudegames.notion.site/What-goes-into-the-Context-sent-to-the-AI-7e5881352de6427da9c92b04149e8e50 , https://help.aidungeon.io/faq/what-is-the-authors-note
13. NovelAI lorebook: https://docs.novelai.net/en/text/lorebook/
14. NovelCrafter codex progressions: https://www.novelcrafter.com/help/faq/codex/track-character-changes , https://docs.novelcrafter.com/en/articles/8675593-progression-additions
15. Hidden Door, and Ian Bicking's design review: https://ianbicking.org/blog/2025/08/hidden-door-design-review-llm-driven-game
16. Disco Elysium (skills as voices, passive checks, Thought Cabinet): https://en.wikipedia.org/wiki/Disco_Elysium , https://www.itechguides.com/how-disco-elysiums-thought-cabinet-and-skill-checks-work/
17. Citizen Sleeper: https://howtomakeanrpg.com/r/a/case-study-citizen-sleeper.html
18. Pentiment typography: https://gamebanshee.com/96xr8 , https://languageatplay.de/?p=3624

---

## 1. Storylets, QBN, salience (Failbetter / Emily Short)

- **What.** Content = storylets (text + prerequisites + effects). QBN: player picks from every legal storylet. Salience: the
  system picks the best-matching piece; more matched conditions = more salient; ties random; broad defaults first, specific
  variants later. Warning from the writeup: an accidental match fires a bad ending early, so arc variables belong in the gate.
- **Steal.** "Broad default + specific override" as the author's model for reactive content; players prize the rare
  specific line over the generic one (Bee / Short).
- **SO map.** SO is already QBN at the graph level: typed gates on qualities pick transitions (`engine/transitions.ts`),
  quests, codex facts, returns. What it lacks is salience *inside* a beat: no "most specific of these authored lines wins".
  Covered in §2 (rule bank).
- **Fit / value.** Framing only. No separate row.

## 2. Ruskin rule database (Valve) + Mímir (code)

- **What.** World = flat fact map. Rule = set of predicates over facts + outcome. Ruleset query returns the matching rule
  with the most predicates (most specific); ties random. "Once only" is a fact: store what fired in the save and add a
  `not fired` predicate (`mimir/source/docs/src/use-cases/repeated-evaluations.md`, which says do not mutate the ruleset).
- **Steal.** Per-character remark bank: each roster member owns rules `{when, says, once|cooldown}`; at a boundary the most
  specific matching rule per drafted member wins; fired rules recorded as facts so rollback undoes them.
- **SO map.** Nearest: `effects.npc_replies[]` (`schema.ts` `NpcReplyEffect`, guide §npc_replies at
  `docs/authoring/story-guide.md:304`) posts verbatim lines on checkpoint triggers with `maxTriggers`/`probability`; no
  specificity ranking, no per-member bank over arbitrary state, no cue form. Codex `returns` (`engine/codexSchema.ts:28`)
  are page-only acknowledgements, never sent to a model (guide line 596).
- **How in SO.** `roster[].remarks[]: {id, when: GateNode, cue, once?, cooldown?}`. Selection pure in `engine/` (score =
  predicate count of the gate, tie by `unitDraw([chat, story, boundary, "remark:"+member])`). Output is a **cue** in the
  drafted member's private block ("If it fits, you could remark on: …"), so the model voices it in character; never a
  player act. Fired = code int `remark_<member>_<id>` (boundary), rollback detector entry in `ROLLBACK_DETECTORS`. Held
  secrets: cue text passes `withoutSecretLines` like every private line.
- **Value 4 / effort M.** The cheapest way to make cast members notice specific things the player did, in their own voice.

## 3. Hades reactive script

- **What.** Very large pool of short, conditioned lines per character; priority for story-critical lines, then the most
  specific reactive line; a line is played once and remembered; characters comment on the player's recent specifics.
- **Steal.** Two-lane priority: "must say" (story lines that wait their turn) over "may say" (reactions), and played-once
  memory per character.
- **SO map.** Same rule bank as §2; add `priority: "must" | "may"`; a `must` cue repeats until a read confirms it landed
  (extraction already confirms quest/codex facts; reuse a code latch set by an authored `landed_when` gate).
- **Value** folded into §2.

## 4. Façade (beats, mix-ins, reestablish)

Mechanisms read in the paper:
- **Beat goals** with transition-in, body, wait, default transition-out that tells the player how their action moved the
  social game.
- **Global mix-ins**: ~20 satellite topics (marriage, an object, praise, criticism) each with **three tiers** that deepen
  every time the player raises the topic; written causally independent so they can interleave with any beat.
- **Interrupt and reestablish**: a mix-in interrupts a beat goal; if the goal had not passed its "gist point" it is
  repeated, and each beat goal has a `reestablish` line ("So, I was going to say, about Italy…").
- **Tone alternates**: most lines authored 3–5 times for affinity × tension, plus 2–4 equivalent alternates per tone.
- **Recapitulation**: patterns in the social games are remarked on in crisis and climax beats.
- Selection: unused beat whose preconditions hold and whose tension effect best matches the authored arc, plus weights.
- **Steal (A) hot-button topics.** Per member `topics[]: {id, keys|when, tiers: [cue, cue, cue]}`; each time the player
  raises the topic (key match on the player's in-character line, or an extraction bool) a code counter steps; the member's
  private block gets the current tier's cue. Player feels characters have depth that unlocks by asking.
- **Steal (B) reestablish.** After an open stretch digression or a mid-beat detour, one line pulls back to the beat's
  thread in the narrator's voice ("back to what X was saying"), only once per detour.
- **SO map.** Tension arc selection exists (`pacing/shapes.ts`, `fall_recovery`, `three_act`; living director 22). Open
  stretch pull exists (`pacing/steering.ts:63`), but it pulls toward the *next place*, not back to an interrupted
  conversation. No tiered topic progression (grep `tier` in `engine/life` finds only presence tiers). Recap of patterns: 46
  (`runtime/consequences.ts`).
- **Fit.** Deterministic counter, code key + rollback detector; key match on the player's line only reads, never writes
  the player's act. Tier cues go to the private block only (held-secret filtered).
- **Value 4 / effort S–M** for (A); (B) value 2, S, fold into pacing guidance.
- **Per-character polish.** Tone alternates keyed to affinity/tension = per-member voice notes keyed to mood/tension band
  (see §For per-character polish).

## 5. Versu (social practices, evaluations, per-character verbs)

- **What.** Practices offer affordances, agents choose by utility; DM rarely intervenes, only tweaks desires ("lower
  Brown's desire to respect norms when it wants outrageous behaviour"). Norms: violating one spawns a reaction practice
  (disapprove, forgive, evict) so a violation is **noticed**. **Mood with a reason**: clicking a portrait shows who the
  emotion is toward and the event that caused it. **Role evaluations** stored with an explanation
  (`Agent.relationship.Other.role.Role!Value!Explanation`), can be told to others and disputed. **Per-character text
  overrides** for the same action (one swaggers, one hobbles). Player chooses how to *react*, not only how to act.
  Deterministic simulator with exact playback.
- **Steal.** (a) mood/feeling **cause**: each relationship step and mood change keeps `{toward, messageId}`; a "why"
  readout. (b) norm noticed: an authored `norms[]` per checkpoint (`{when_broken: gate, reaction_cue}`) so the cast reacts
  to the player breaking a social rule. (c) per-character verb/adverb overrides → voice sheet (§polish).
- **SO map.** Mood is `values/baseline/lasts` only (`engine/lifeSchema.ts:49-53`), rendered "Your mood right now: X"
  (`engine/life/lines.ts:60`), no cause. Relationship steps carry `beat` evidence (`engine/life/beats.ts`, per-axis history,
  author view) but life never reaches a player surface (guide §relationships: "None of it ever reaches a player surface").
  Norms: nothing; 56 social permissions is the nearest plan (check before building).
- **Fit.** Cause = data the read already sees; stored on the existing step record; rollback by boundary. A player "why"
  needs the owner to reopen 51 decision 2 / 20 "meters private for players". Norm reaction is a cue, never narrates the
  player's act.
- **Value 3 / effort S** (cause, author view), 3 / M (norms).

## 6. Talk of the Town (+ Dwarf Fortress rumors)

- **What.** Per character mental model per entity; facets with value, predecessor, evidence list, strength, accuracy.
  Evidence types: observation, transference, confabulation, lie, statement, eavesdropping, mutation, forgetting. Strength
  decays with time; told evidence weighted by affinity to source and source's own strength; retelling strengthens the
  teller's belief; contradicting evidence is adopted only when stronger, the loser kept as a candidate. Recipients treat a
  lie as a statement; the system keeps the truth for a post-game "true knowledge trajectory" reveal. DF: rumors carried
  between places by travellers; false witness reports.
- **Steal.** (a) Belief **revision by weight**, not last-write: a member keeps a held version until stronger hearsay
  arrives (two tellers, or a trusted one). (b) End-of-story **"how word travelled" reveal**: after the final record, show the
  player the path a rumor took and who held which version (spoiler-safe once the story is over).
- **SO map.** 44 stage 1 built: versions with authored truth, seeded version pick, stance believes/doubts/unsure from the
  receiver→teller relationship (`44-rumors-and-gossip.md:102-127`); option F = conflicting testimony (line 78). Missing:
  accumulation (a second telling can flip `doubts` to `believes`) and the post-story reveal.
- **Fit.** Weight sum is pure code over landed events; rollback already via `rollbackRumors`. Reveal reads the rumor slice
  after the story's final record; never during play (secret tiers untouched). Memory fallibility (mutation/forgetting) is
  skipped: a player wants the cast to remember.
- **Value 2–3 / effort S** (accumulate), 3 / S (post-story reveal; pairs with 45 epilogue).

## 7. Felt + Winnow (story sifting, code)

- **What.** Sifting pattern = datalog query over an event DB: ordered events with bound actors, attribute tests, and
  `unless-event between` (e.g. "violation of hospitality": guest enters, host hosts guest, host harms guest, guest never
  left between). Winnow compiles to Felt and adds **incremental, partial matching** on a live sim
  (`winnow/source/runner.js:29-79` `tryAdvance`: each new event advances every partial match, spawns new branches, or
  kills a match whose `unless` constraint fired, recording `deathDetails`).
- **Steal.** Typed microstory patterns over SO's *already typed* event log, matched incrementally per boundary, with
  partial matches kept as "threads in progress".
- **SO map.** Substrate exists and is typed: consequence refs `transition | quest | milestone | check | agenda`
  (`runtime/consequences.ts:140-173`), relationship steps with beats (`engine/life/beats.ts`), promise events
  (`memory/promises/`), rumor landings (`extras.rumors`), faction moves (`rep_<f>_move_<m>`), codex latches. Open "arcs"
  are free-text model signals (`memory/arcs.ts`, Jaccard dedup), not structured threads. No sifter anywhere (grep `sift`: 0).
- **How in SO.** `story.threads[]` (authored) or a built-in library: `{id, steps: [{event: kind, where: {...}, bind:
  {actor: "?a"}}], unless?: [...], recap?}`. Pure `engine/threads.ts` advances partial matches at boundary work (after
  `recap`, order 7), keyed by occurrence; state in `extras.threads` rolled back by boundary like recap refs. Uses: (1) 46
  recap "Twice now you've …"; (2) chapter titles/records; (3) director focus (`pacing/focus.ts`) gets "open threads with
  one step left"; (4) §8.
- **Fit.** Deterministic, no model call; reads only typed events; player-visible lines only from `visible` refs and
  `knownEntities` (the codex projection), so nothing undisclosed leaks. Never writes the blackboard.
- **Value 5 / effort M–L.** Biggest structural gap: SO records rich typed history but nothing notices *patterns* in it.

## 8. Loose Ends (sifting drives suggestions)

- **What.** Storytelling goals = Winnow patterns parameterised by characters; a goal is a partial match. Every candidate
  next action is scored: +1 per active goal it advances, +0.5 if only possible because of a goal, +random 0–0.5 to rotate
  ties, so suggestions alternate between parallel threads and **resurface dormant threads** after a subplot closes. Partial
  matches past 33% are auto-promoted to suggested goals (shown faded); hover shows which goals an action would advance or
  cut off. Reported: less directionlessness than earlier co-creative systems.
- **Steal.** Ground "What could I do?" in thread state: rank suggestion seeds by threads advanced; rotate ties with a
  seeded draw; resurface a dormant thread after another closes.
- **SO map.** "What could I do?" (v2.8 04 C5 = v2.7 33 W4) is a model-written list from the player projection
  (`components/panels/SuggestionsPanel*`, `features/presenceFeatures.ts`); no structured ranking, no dormant-thread recall.
- **Fit.** Seeds are thread names/next-step hints from §7 (player-visible only); the model still words them; never an
  action the player is forced into (agency: suggestions are offers). Seeded tie rotation, never `Math.random`.
- **Value 4 / effort S once §7 exists.**

## 9. Crusader Kings III events

- **What.** `random_events` with weighted entries and an explicit **no-event weight**; `trigger_event` follow-ups after a
  random **delay** (`days = {7 14}`), which fire only if still valid at execution; `save_scope_as` carries the same
  participants across a chain; `triggered_desc`/`first_valid` vary text by state; `show_as_unavailable` shows an option
  greyed instead of hiding it.
- **Steal.** (a) **Delayed echoes**: an authored consequence `{after: {parts: n} | {boundaries: n}, when, cue|effect}`
  scheduled when a transition or quest close fires, landing later only if `when` still holds ("the merchant you cheated
  shows up two days later"). (b) **Greyed options**: in "What could I do?", an authored option that needs a missing
  quality shown as unavailable with its reason, which teaches the player the world's rules.
- **SO map.** Story time is one code int (`engine/life/clock.ts`, 50); meanwhile is due on elapsed time
  (`runtime/agendaProposals.ts:132-139`); complications are 49. No authored "after N parts, if still valid" consequence.
- **Fit.** Schedule = code int written at the firing boundary, due check pure, delay drawn by `unitDraw`; rollback detector
  on the schedule key; delivered as private cue or `effects`. Never narrates the player.
- **Value 4 / effort S–M** (a); 2 / S (b).

## 10. RimWorld storytellers

- **What.** Event timing reads wealth, population, recent deaths/injuries and **time since the last major event**;
  Cassandra = strike, recover, strike; storyteller and difficulty are separate, swappable mid-game without penalty.
- **Steal.** Recovery after a peak keyed to *what just happened to the player* (a failed check, a lost companion), not only
  to a curve position; storyteller ≠ difficulty as two player-facing knobs.
- **SO map.** Curves exist (`pacing/shapes.ts`), director scene test odds from tension (guide line 679). Pacing shape
  override is per chat (`chat_metadata` `pacing.shapeOverride`). No "since last major event" input.
- **Value 2 / effort S.** Note for 22/49 tuning, no plan.

## 11. Wildermyth (casting, legacy)

- **What.** Hybrid: handcrafted chapter bookends, procedural middle. Events have **role targets filled like casting a play**
  by personality traits; the game looks for which "plays" it can stage with the heroes present. Heroes carry history and
  become legacy for later campaigns.
- **Steal.** Authored set-pieces with role slots filled from the present cast by tags (`role`, `drive`, a relationship
  sign), seeded pick, so the same authored scene stars different members.
- **SO map.** Encounters are model-written situations without roles (`generation/encounters.ts`, guide line 205); legacy =
  45 NG+ carry (built). No role-slot casting.
- **Fit.** Pure selection over roster + qualities; output = a cue/offer to the narrator in quiet stretches; agency rule
  (offer, never resolve). Absent members (schedule) excluded.
- **Value 3 / effort M.**

## 12. AI Dungeon (story cards, plot essentials, author's note)

- **What.** Plot Essentials always in; Story Cards keyword-triggered; Author's Note ≤300 chars, bracketed, near the end;
  trimming keeps Author's Note first, then Essentials.
- **SO map.** All present in richer form (lore placement `runtime/lorePlacement.ts`, injection registry, budgets). Nothing
  new for players. **Skip.**

## 13. NovelAI lorebook

- **What.** Per entry: token budget, reserved tokens, insertion order/position, key-relative insertion, trim rules,
  cascading activation; **phrase bias per entry, active only while the entry is active** (options: invert when inactive,
  "unbias when generated", ensure completion). Categories with a shared subcontext and a category-level bias.
- **Steal.** The phrase-bias-while-active pattern, moved to roster members: **per-member logit bias / banned phrases applied
  only on that member's loud generation** (see §polish). "Unbias when generated" = a one-shot catchphrase that stops being
  pushed after it appears once.
- **SO map.** Sampler overlay is per request but per story/checkpoint preset (`runtime/samplerOverlay.ts`,
  `samplerOverlayHost.ts`; no member key). `logit_bias` is touched only in preset plumbing (`services/stHost/presets.ts`).
- **Fit.** Same rules as the existing overlay: loud requests only, only keys the request carries, never an install write.
  llama.cpp `logit_bias` accepts string pieces in recent builds: verify on the served version before building (host fact).
- **Value 4 / effort S–M** (as part of polish).

## 14. NovelCrafter codex progressions

- **What.** A progression attaches to a manuscript point; *addition* layers detail, *replacement* overrides; the AI sees it
  only at or after that point, and going back drops it.
- **Steal.** `replaces: <factId>` on codex facts: the People/Places page shows the current truth, the older fact as
  history ("used to run the inn").
- **SO map.** Codex facts only add (`engine/codexSchema.ts:21-27`: `id, text, known_when, source, rev`); rollback by latch is
  already the "going back drops it" half.
- **Fit.** Projection-only change in `runtime/codexView.ts`; no new writer.
- **Value 3 / effort S.**

## 15. Hidden Door + Bicking's review

- **What.** Cards (characters, places, objects, plot directions) as state; chapter objectives shown; three suggested
  actions; success labels. Review: no ground truth behind text ("a chest has no trap until the text says so"), setting
  drift, trait over-indexing (a quirk mentioned every passage), characters knowing authorial foreshadowing, objectives that
  open and close in one beat, the player always succeeds. Advice: keep objective state, write the consequence of each
  choice before the prose, allow consequential failure, add non-plot choices (ask how someone feels).
- **SO map.** Ground truth: engine + 62 prepared facts; foreshadowing leak: secrets/epistemic tiers; failure: checks with
  `miss` (`docs/authoring/story-guide.md:515`). **Trait over-indexing** is the one not addressed: a member's card quirk
  repeating every reply.
- **Steal.** Quirk throttle as a polish check (§polish): count a member's authored tics per window, cue "not this time".
- **Value** folded into polish.

## 16. Disco Elysium (skills as voices, passive checks, Thought Cabinet)

- **What.** 24 skills speak to the player as inner voices with their own personalities; **passive checks** fire with no
  visible roll and add a line (you just remember a name, notice a detail); active checks show odds; Thought Cabinet:
  thoughts unlocked by what you say, slots, researching takes time and costs, then gives a lasting effect.
- **Steal.** **Player-side whispers**: authored `whispers[]: {voice?, when, text, passive?: {quality, target}}`; at a
  boundary a passive check rolls seeded dice against a *player* quality; on success the line appears on a player surface
  (HUD story card), never in chat and never sent as the player's act. Optional named voices ("Instinct", "Memory") give
  the player's own head a personality.
- **SO map.** SO's inner voice is the NPC's own intent (`memory/innerVoice.ts`, plan 54 thought carry: "Your intent this
  turn" in the member's private block). Checks are seeded and public or author-narrated (guide line 515); grep `passive`
  in `src`: 0. No player-side inner voice.
- **Fit.** Seeded draw `unitDraw([chat, story, boundary, "whisper:"+id])`; latch `whisper_<id>` with rollback detector;
  text authored (model-drafted lines would be propose-only in the wizard); only disclosure the author wrote, through the
  player projection (`runtime/playerProjection.ts`), so nothing unknown leaks; never decides what the player does.
- **Value 4 / effort M.** Thought Cabinet: skip (perk economy; 27 covers progression).

## 17. Citizen Sleeper (dice shown before you commit)

- **What.** Dice rolled at cycle start and shown; the player spends a die on an action knowing its value; clocks; condition
  spiral. Precarity by knowing the risk before choosing.
- **Steal.** **Stakes preview**: SO already rolls check dice when the checkpoint starts (seeded, `check:<id>:<die>`, guide
  line 515), and modifiers can change the outcome ("finding the rope can turn a miss into a success"). Show the player,
  before they act, which *visible* modifiers would help ("You'd fare better with: a rope, a friend's help") without the
  dice. Turns a hidden roll into a choice.
- **Fit.** Pure read of check + modifiers whose qualities are player-visible; labels from public `label`; never reveals
  target or dice; spoiler rule = modifier hidden if its quality is not shown.
- **Value 3 / effort S.**

## 18. Pentiment (typography as character)

- **What.** Each character's text has a script matching education; scripts change as the protagonist learns about them.
- **Steal.** Per-member speech styling in our own surfaces (VN stage caption, HUD card, journal quotes): font/colour per
  member, and a styling change when a codex fact about them latches (the player sees that their view of the person
  changed).
- **SO map.** Sprites/VN stage `src/sprites/`; codex latches. Chat `.mes_text` is ST's (69 K5: nothing of ours inside it),
  so chat bubbles stay untouched.
- **Value 2 / effort S.** Cosmetic.

---

## For per-character polish

Owner's idea: Recast-style passes configured per roster member. Relevant mechanisms from the sources:

- **Versu**: per-character override text for the same action (walk = swagger/hobble/waddle); adverbs carry mood and reason.
- **Façade**: 3–5 tone alternates per line keyed to affinity × tension, plus 2–4 equivalent alternates for freshness.
- **NovelAI**: phrase bias that is active only while its entry is active; "unbias when generated".
- **Hades / Ruskin**: per-character line banks, played-once memory (anti-repetition per speaker).
- **Bicking on Hidden Door**: trait over-indexing is a real failure in LLM play.
- **Pentiment**: presentation can carry voice too.

Proposed shape for SO (one plan, three layers, cheapest first):

1. **Voice sheet** `roster[].voice: {notes, lexicon[], avoid[], rhythm?: "clipped"|"flowing"|…, tics?: [{text, max_per: n}],
   by_mood?: {<mood>: notes}}`. Injected in that member's private block only (`engine/life/lines.ts` private lines path), so
   it is held-secret filtered and never in the resting block. Mood band picks `by_mood` (Façade tone alternates). No model
   call. Value high, effort S.
2. **Per-member bias at generation**: on that member's loud request only, a sampler overlay adds `logit_bias` for `avoid`
   (negative) and optionally `lexicon` (small positive), with "unbias after used" for tics (NovelAI). Same guard as the
   preset overlay: loud only, story chat only, llama.cpp only until verified elsewhere. No text rewrite, so swipes, edits
   and streaming are untouched. Effort S–M.
3. **Post-reply check and optional rewrite** (Recast-like), only when a deterministic check fails: `avoid` hit, tic over
   `max_per` in the window, n-gram repetition against the member's own last N replies, cross-member similarity (two
   members sounding alike). Rewrite prompt = voice sheet + the reply + "change wording only".
   - **Safety:** diff guard refuses a rewrite that adds a proper noun, number, codex name, or a sentence whose subject is
     the player (reuse plan 54's player-subject matcher); refuses length outside ±20%; falls back to the original.
   - **Boundary:** TurnBridge commits on `MESSAGE_RECEIVED` (`runtime/turnBridge.ts:84`), so a rewrite after render is a
     mutation and rolls back. Either finish before ST emits it (rewrite in the generation path, needs a host fact), or mark
     our own rewrite as the same identity with a revision bump (69 K6 receipt-rewrite vs TurnBridge identity test is the
     prerequisite). Keep the original in `extra` so a swipe restores it.
   - **Cost:** one model call only on a failed check (authoring/cheap route, never Artemis for the check itself).
   - **Streaming:** player sees a swap at stream end; label it in author view only.

## Top 10 additions for SO

1. **Per-member voice sheet + bias** (§polish 1–2; Versu, Façade, NovelAI): each character sounds like themselves, no rewrite risk. V5, S–M.
2. **Story sifting threads** (§7 Felt/Winnow): typed microstory patterns over the boundary log; feeds recap, chapters, director. V5, M–L.
3. **Grounded "What could I do?"** (§8 Loose Ends): suggestions ranked by threads they advance, dormant threads resurface. V4, S after 2.
4. **Per-member remark bank, most specific wins** (§2–3 Ruskin/Mímir/Hades): characters notice specifics, once each. V4, M.
5. **Hot-button topic tiers** (§4 Façade): asking a character about X again digs deeper. V4, S–M.
6. **Player whispers / passive checks** (§16 Disco Elysium): seeded perception lines on the player's own surface. V4, M.
7. **Delayed echoes** (§9 CK3): authored consequences that land days later if still valid. V4, S–M.
8. **Stakes preview** (§17 Citizen Sleeper): show which visible things would help a pending check before acting. V3, S.
9. **Role-cast set-pieces** (§11 Wildermyth): authored scenes whose roles go to whoever fits in the present cast. V3, M.
10. **Codex replaces + post-story rumor trail** (§14 NovelCrafter, §6 Talk of the Town): current truth on pages; after the end, how word travelled. V3, S.

Also noted, lower: mood cause and norms noticed (§5), polish layer 3 rewrite (after 69 K6), reestablish line (§4B),
greyed options (§9b), recovery after a player loss (§10), per-member typography (§18).

## Unresolved questions

- Polish layer 3: is a pre-`MESSAGE_RECEIVED` rewrite hook available in ST, or does it need the 69 K6 identity path?
- Does the served llama.cpp accept string `logit_bias` entries (host fact to verify before layer 2)?
- Player-visible "why" for mood/feelings (§5) reopens the owner's private-meters decision (20, 51 decision 2).
- Threads (§7): authored per story, a built-in library, or both? Library patterns must not name undisclosed entities.
