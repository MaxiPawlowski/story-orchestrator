# Voice research: character fidelity and distinctness in group chat (angle A, literature and LLM systems)

Slug `voice-research`, 2026-10-31. Research only; no code changed. Question: what does the research on persona fidelity,
persona drift, voice distinctness, thought-before-speech and multi-agent role confusion offer that we could add as
switchable, testable pieces? Speaker choice is out of scope (already covered in `talk-*.md`). Labels: **[M]** measured by
us (cited record), **[P]** number reported by a paper (self-reported by its authors), **[E]** my estimate, **[S]** read
from source.

## 1. Summary

- **Drift over a chat is real and fast, and re-sending the instruction is the cheap fix that works late in a chat.**
  Li et al. measured clear instruction drift within 8 rounds on LLaMA2-chat-70B and ~10 % on GPT-3.5 **[P]**; of three
  fixes, re-injecting the system prompt before user turns did best in later rounds **[P]**. We already re-send each
  member's aims and delivery sheet every draft (private block at depth 4), but **not their persona core**: the card sits
  at the far head of the prompt and is never re-anchored. Members without an authored delivery sheet get no voice anchor
  near the tail at all.
- **We measure voice per reply, never over chat length.** v2.9 02 S6 measures blind speaker attribution on single replies
  (harder set 0/60 to 60/60) **[M]**. Nothing measures whether a member still sounds like themselves at turn 60 versus turn
  6. That is the gap the drift literature says matters most, and it can be scored offline in code.
- **Agents talking to agents converge.** "Echoing" (agents mirror their conversational partner instead of keeping their
  role) reached up to 70 % in some configurations, emerges after ~7 agent turns, and reasoning models still echoed 32.8 %
  of the time **[P]**. Our per-speaker repetition miner only looks at a member's own replies (`src/runtime/delivery/mine.ts:53-63`
  **[S]**); a member copying another member's diction is invisible to it.
- **Generic thinking can hurt role-play; role-aware thinking is the proposed remedy.** Feng et al. (24 models, 6
  benchmarks) found CoT often lowers role-play quality through "attention diversion" and "linguistic style drift", with
  gains on only two benchmarks **[P]**; FURINA found reasoning raises role-play scores and also role-play hallucination
  **[P]**; TBS trains "thinking before speaking" from the character's mindset **[P]**. The owner keeps thinking on, so the
  lever is *what* the thinking is about, not whether it happens.
- **Role confusion has a host-side partial guard we do not extend.** ST's Text Completion stop strings cut a reply at
  `\n<OtherMember>:` (`SillyTavern-MainBranch/public/script.js:3033-3055` **[S]**), but only that exact shape and never on
  Chat Completion (`:3027-3029` **[S]**). The narrator is told not to voice self-voiced members
  (`NARRATOR_SELF_VOICED`, `src/memory/innerRender.ts:100-106` **[S]**); ordinary members get no such clause and nothing
  detects prose-form cross-voicing (`"…," Kael said`, `**Kael:**`).
- **Steering on our llama.cpp is mostly closed.** Per request the server takes `lora` and `logit_bias`
  (`llama.cpp/tools/server/server-schema.cpp:229, 440` **[S]**, Oct 2026 checkout), but control vectors are load-time only
  (`common/arg.cpp:2993` **[S]**; runtime control is an open request, [#10685](https://github.com/ggml-org/llama.cpp/issues/10685)).
  Token bans were already ruled out (v2.9 02). Activation methods (persona vectors, assistant-axis capping, split-softmax)
  need a fork patch; one interesting fact: our per-member cache means a fixed per-member vector would not break caching.
- **Fine-tuning work (RoleLLM, CharacterGLM, Character-LLM, Ditto, multi-turn RL) is not usable directly** (a 31B LoRA does
  not train on 24 GB, `llama-fork-opportunities.md` §Dropped). What transfers is their evaluation design: probe questions
  after N rounds, prompt-to-line and line-to-line consistency, and sparse dimensions that need eliciting.

## 2. Survey

### 2.1 Persona drift over long dialogue

- **Li et al., "Measuring and Controlling Instruction (In)Stability in Language Model Dialogs"** (COLM 2024,
  [arXiv 2402.10962](https://arxiv.org/abs/2402.10962)). Two instructed chatbots self-chat for 8 rounds; then the user turn
  is swapped for a **probe question** whose answer a deterministic function scores 0-1 against the system prompt. 100
  system prompts in 5 categories (including "agent character"). Findings **[P]**: LLaMA2-chat-70B drifts significantly
  within 8 rounds and slowly adopts the *partner's* instruction; GPT-3.5 drops ~10 %. Attention share on system-prompt
  tokens drops sharply between turns (correlational). Fixes compared at equal MMLU cost: classifier-free guidance (strong
  in round 1, fades), **system prompt repetition** (best in later rounds, costs context) and **split-softmax** (re-weights
  attention toward the system prompt by a power `k`; best early, training-free but needs an attention patch).
- **Choi et al., "Examining Identity Drift in Conversations of LLM Agents"** ([arXiv 2412.00804](https://arxiv.org/abs/2412.00804)).
  Nine LLMs, two agents over 36 themes, drift scored by topic modelling and PsychoBench. Reported **[P]**: larger models
  drift more; assigning a persona does not significantly stabilise identity. Secondary summaries only; numbers not checked.
- **Abdulhai et al., "Consistently Simulating Human Personas with Multi-Turn RL"** (NeurIPS 2025,
  [arXiv 2511.00222](https://arxiv.org/abs/2511.00222)). Three judge metrics: **prompt-to-line** (does this line fit the
  persona prompt), **line-to-line** (does it contradict earlier lines), **Q&A** (answers to persona questions stay stable).
  Prompt-to-line chosen as the main signal as closest to human judgement; PPO on it cut inconsistency by >55 % **[P]**. The
  metric design transfers; the RL does not.
- **"The Assistant Axis"** (Anthropic, Jan 2026, [research page](https://www.anthropic.com/research/assistant-axis);
  arXiv 2601.10387 per secondary sources). A dominant activation direction measures how far a model sits from its default
  assistant persona; emotionally loaded conversations drift most; capping activations along it cut harmful responses by
  roughly half with capabilities kept **[P]**. For us the inverse matters: a character persona drifting *back toward the
  assistant* (hedging, summarising, asking "what would you like to do?") is a known RP failure, and the paper confirms it
  is a measurable direction. Needs activation access.
- **Failure modes across these:** drift is measured in self-chat with no human; judges are lenient; persona prompts
  of a few lines, not full cards with example dialogue.

### 2.2 Character fidelity benchmarks (evaluation designs worth copying)

- **RoleLLM / RoleBench** ([arXiv 2310.00746](https://arxiv.org/abs/2310.00746)): role-conditioned instruction tuning;
  speaking style imitation scored against reference answers. **CharacterEval** ([arXiv 2401.01275](https://arxiv.org/abs/2401.01275)):
  13 metrics in four dimensions plus a trained reward model; Chinese. **CharacterGLM** ([arXiv 2311.16832](https://arxiv.org/abs/2311.16832)):
  fine-tuned on attributes plus behaviour; human eval for consistency, human-likeness, engagement. **Character-LLM**
  ([arXiv 2310.10158](https://arxiv.org/abs/2310.10158)): "experience reconstruction" and protective scenes to stop a
  character knowing what it should not. **Ditto** ([arXiv 2401.12474](https://arxiv.org/abs/2401.12474)): the model writes
  its own character profiles and in-character dialogues, then fine-tunes on them (self-alignment); claims role-play is a
  superposition the base model already holds **[P]**.
- **InCharacter** ([arXiv 2310.17976](https://arxiv.org/abs/2310.17976)): interview the character with psychological
  scales, score the answers; measures personality fidelity, not voice. **PersonaGym** ([arXiv 2407.18416](https://arxiv.org/abs/2407.18416)):
  persona-relevant environments plus probe questions, judged into one PersonaScore. **CharacterBench**
  ([arXiv 2412.11912](https://arxiv.org/abs/2412.11912)): "sparse" dimensions (memory, morality) need targeted elicitation;
  "dense" ones (style) show in every reply.
- **Group settings.** **SocialBench / RoleInteract** ([arXiv 2403.13679](https://arxiv.org/abs/2403.13679)): agents that
  do well one-on-one do not necessarily do well in groups **[P]**. **FURINA** ([arXiv 2510.06800](https://arxiv.org/abs/2510.06800)):
  test character among other characters; reasoning raises scores and RP hallucination together; established characters
  beat synthesised ones, and reasoning widens the gap **[P]** (our authored cast are "synthesised" in that sense).
- **What transfers:** probes after N rounds (Li), prompt-to-line plus line-to-line split (Abdulhai), sparse versus dense
  dimensions (CharacterBench), group versus solo (SocialBench). None measures one model voicing several distinct members.

### 2.3 Voice distinctness metrics

- **Speaker attribution accuracy**: a classifier or rater must name who spoke. Our S6 does this with a blind Sol rater
  **[M]**. **Šela et al., "From stage to page"** ([arXiv 2301.05659](https://arxiv.org/abs/2301.05659)): language-independent,
  non-parametric distinctiveness of fictional speech by bootstrapped character 3-gram distances and keyness curves over
  ~3,300 drama characters; character variation stays inside authorial bounds **[P]**. Directly usable in code, no model.
- **Authorship verification for quotes** ("Distinguishing Fictional Voices", [arXiv 2401.16968](https://arxiv.org/abs/2401.16968)):
  style embeddings scored by AUC for matching quotes to characters; style models separate characters only partly **[P]**.
  **HANSEN** ([arXiv 2310.16746](https://arxiv.org/abs/2310.16746)): character n-grams were the strongest attribution
  features; attribution among LLM-voiced personas was much harder than among humans **[P]**. That is the "everyone sounds
  like the same model" effect, measured.
- **Failure modes:** n-gram metrics reward tics (a catchphrase repeated scores as "distinct"), so distinctness must be read
  next to our repetition miner, not alone; attribution raters key on content (who knows what) rather than voice unless
  content is controlled (v2.9 01 audit A07 already says: behaviour and speech identity are separate scores).

### 2.4 Thought before speech

- **Feng et al., "Reasoning Does Not Necessarily Improve Role-Playing Ability"** (Findings ACL 2025,
  [arXiv 2502.16940](https://arxiv.org/abs/2502.16940)): 24 LLMs, 6 benchmarks; CoT and reasoning-tuned models often
  *lower* role-play quality; named causes: attention diversion and style drift toward formal reasoning prose; CoT helped on
  InCharacter and RoleBench; future direction "role-aware CoT" **[P]**.
- **TBS, "Thinking Before Speaking: A Role-playing Model with Mindset"** ([arXiv 2409.13752](https://arxiv.org/abs/2409.13752)):
  generates the character's mindset (background, relationships, what they would think) before each reply; fine-tuned
  **[P]**. **"Think Before You Speak"** ([arXiv 2311.07445](https://arxiv.org/abs/2311.07445)): separate thinking and
  speaking roles in one model. **ROLETHINK, "Guess What I am Thinking"** ([arXiv 2503.08193](https://arxiv.org/abs/2503.08193)):
  benchmark for generating a character's inner thought before acting.
- **Read for us:** our inner beat is a TBS-like side pass (one sentence, "from their own point of view",
  `src/memory/innerBeat.ts:25-46` **[S]**) and thought carry reuses the member's native reasoning (v2.8 54). What nobody
  instructs is the *native* thinking itself: Artemis thinks in its default planner voice ("The user wants…"), which is
  exactly Feng's style-drift mechanism; `isMetaCommentary` exists because that voice leaks (`innerRender.ts:17-23` **[S]**).

### 2.5 Multi-agent role confusion

- **"Echoing: Identity Failures when LLM Agents Talk to Each Other"** ([arXiv 2511.09710](https://arxiv.org/abs/2511.09710)):
  66 agent pairings, 4 domains, >2,500 conversations; agents drop their role and mirror the partner, up to 70 % in some
  settings, rising after ~7 turns; more reasoning effort did not help (reasoning models 32.8 %); structured responses cut it
  to 9 % **[P]** (baseline for that comparison not in the abstract).
- **One model voicing several members** has no dedicated benchmark (search found none). Practitioner mechanisms: per-member
  card swap (ST group default), name stop strings (ST, TC only), "write only for X" clauses. Known gaps: prose attribution
  slips past `\nName:` stops; markdown name headers; a member answering *for* another member's question.

### 2.6 Steering a local model

- **Activation steering**: ActAdd ([arXiv 2308.10248](https://arxiv.org/abs/2308.10248)), CAA ([arXiv 2312.06681](https://arxiv.org/abs/2312.06681)),
  representation engineering ([arXiv 2310.01405](https://arxiv.org/abs/2310.01405)), **persona vectors** (Chen et al. 2025,
  [arXiv 2507.21509](https://arxiv.org/abs/2507.21509): trait directions for monitoring and steering). llama.cpp ships
  `cvector-generator` (PCA over contrastive prompt pairs) and `--control-vector[-scaled]`, `--control-vector-layer-range`,
  load-time and global **[S]**. Failure modes: quality loss at high scale, trait vectors that also move content, no
  per-request switching.
- **Logit bias / bans**: per request on llama.cpp **[S]**, but a token ban hits every token of a phrase (Castward host fact,
  v2.9 02 Out). **Antislop** ([arXiv 2510.15061](https://arxiv.org/abs/2510.15061)) backtracks on a banned *string* and
  resamples; 8,000+ patterns kept quality where token bans failed at ~2,000 **[P]**; MIT code; not in llama.cpp server.
- **Split-softmax**: attention re-weighting toward chosen tokens; training-free but a kernel change, output-changing.

## 3. Mapping to us

| Literature mechanism | What we have (path) | Real gap |
|---|---|---|
| System prompt repetition | Aims, beat, delivery sheet re-sent per draft in the private block, depth 4 (`injectionRegistry.ts` `epistemic`; `memoryInjector.ts` `memberBlock`; `delivery/render.ts:3`) | Persona core (card description, speech pattern, example dialogue) never re-anchored; members without a sheet have no voice line near the tail |
| Probe-after-N drift measure | S6 single-reply attribution (v2.9 02); warden `voice` question per reply (`src/judge/warden.ts:82-98`) | No drift-over-length measure; warden voice scores behaviour (role, drive, feelings), not speech |
| Distinctness metric | Per-member repetition miner (`delivery/mine.ts:53-63`), author view readout | No cross-member similarity; no code distinctness score |
| Echo / mirroring | none | Member adopting another member's phrases not detected |
| Thought before speech | Inner beat side pass (`innerBeat.ts`), thought carry (v2.8 54), reasoning harvest (`innerRender.ts:216-224`) | Native thinking uninstructed; its default planner voice is the drift channel Feng names |
| Role confusion | ST TC stop strings `\nName:`; narrator `NARRATOR_SELF_VOICED`; `speaksForPlayer` (`src/wizard/cardChecks.ts:49`) for the player only | No member-side "others speak for themselves" clause; no detector for prose cross-voicing |
| Activation steering | none; control vectors judged global (`llama-fork-opportunities.md:269-270`) | Fork patch only; per-member cache makes it cache-compatible in principle |
| Self-alignment (Ditto) | Wizard proposes a delivery sheet from card example dialogue (v2.9 02 S5) | Covered prompt-side; nothing further without fine-tuning |

Fit with constraints: everything in section 4 is code-only or one static clause. Prompt changes are quality-rated before
adoption (owner decision 2026-10-26). Thinking and inner voice stay on. Private-block lines go through `addPrivateSource`
and `withoutSecretLines`, so held-secret rules hold. Per-member blocks live below the per-turn boundary, so prefix
stability is a payload-golden check, not a design risk. Nothing uses `Math.random` or a model call during play except
where stated.

## 4. Proposals (ranked)

### P1. Voice drift floor: distinctness over chat length (measurement, no product change)

- **What.** A scorer that, over a long chat, buckets each member's replies by position (turns 1-10, 11-30, 31-60, 61+) and
  reports per bucket: (a) Šela-style character 3-gram distance between members (bootstrapped, code), (b) each member's
  distance to their own first bucket and to their card's `mes_example` (code), (c) optional blind Sol attribution on a
  sample per bucket (names and content-revealing nouns masked, as S6 did). Plus Li-style **probes**: at turns 10 and 60
  insert one fixed in-character question per member ("What would you never forgive?") in a sandbox copy and compare the
  two answers by prompt-to-line (card fit) and line-to-line (self-contradiction).
- **Modules.** New `scripts/debug/so-voice-drift.mts` + pure `lib/voiceDrift.mts` (node tests); reads recorded sessions
  (`so-session` evidence) or batch row `page.jsonl`. No `src/` change.
- **Cost.** Code scoring: 0 model calls. Sol attribution: ~4 buckets x members x 10 samples [E] ~120 calls per chat.
  Probes: 2 generations per member per chat on a lane.
- **Invariants.** None (offline). Campaign text stays in the private `so-sessions` repo; reports are counts only.
- **Measure.** This *is* the floor: propose "own-voice distance at 61+ no more than 1.25x the 11-30 bucket" and "between-member
  distance at 61+ no lower than 0.8x the 11-30 bucket" **[E thresholds, to freeze before first run]**. Run first on
  existing recorded long sessions (no GPU); probes need a model lane.
- **Size** M. **GPU**: not for the code part; yes for probes.
- **Why first.** It decides whether P2-P4 are needed and gives them a floor. Feng and FURINA warn that "sounds right on one
  reply" (S6) and "stays right at turn 80" differ.

### P2. Persona re-anchor in the private block (prompt, switch `memory.voiceAnchor`)

- **What.** For each drafted member, one bounded line set near the tail: the card's own speech evidence, never invented.
  Source order: authored `polish.notes` (if present, nothing added), else 1-2 short quoted lines from the card's
  `mes_example` (clipped, quoted as reference: "How {name} sounds, from their card:"), else nothing. Optional adaptive mode:
  only re-sent while P1's code distance for that member exceeds its threshold over the last k replies (code-decided, so
  rollback ≡ replay: a pure function of chat rows).
- **Modules.** `runtime/delivery/` (render), card text via existing `readCharacterCardTexts`
  (`src/services/stHost/characters.ts:37`), cached per chat + member + card hash; source registered with `addPrivateSource`;
  the v2.9 02 staging predicate (`memoryInjector.ts` `update()` capable/voiced/…) must include it, the trap 02 already
  recorded.
- **Cost.** 0 model calls; ~40-80 tokens per drafted member [E] in the per-member block (cache-safe: per-member key,
  below the boundary).
- **Invariants.** Card text is visible author content, not a secret; still pass through `withoutSecretLines`. Wording-only
  clause like `DELIVERY_HEADER` so it never changes facts or agency.
- **Measure.** `so-prompt-arms` new gate `anchor` (synthetic long transcripts, 25 cases at turn 40+); Sol blind pairs on the
  four categories + S6-style attribution; P1 code distance per arm. Floors: attribution gain >= 10 points, no category
  below -0.2 (copy 02/31 floor shapes). Payload golden + `prefix` check.
- **Size** S-M. **GPU** yes (rating window).
- **Basis.** System prompt repetition was the late-round winner in Li et al.; we already repeat aims but not voice.

### P3. Cross-voice guard: clause + detector (switch `talk.othersSpeakForThemselves`)

- **What.** Two parts, measured separately. (a) **Detector (code, always-on readout):** in each rendered member reply, find
  lines or spans attributed to another *enabled* roster member: `^\**Name\**:` headers, `"…," Name said/asked/replied`,
  `Name: "…"`, using the roster name matcher (`@talk/aliases` `nameMatcher`). Report per member in Author view and journal;
  count per 100 replies. (b) **Clause (prompt):** the members' analogue of `NARRATOR_SELF_VOICED`: "Write only {self}'s
  words and actions. {A}, {B} speak for themselves on their own turns." in the drafted member's private block, names from
  the enabled set (same source as `memoryInjector.ts:124`).
- **Optional (c), later:** cut the reply at the first detected foreign speaker line before render, the way ST's stop string
  would have on TC. Only if (a) shows non-trivial rates; a rendered-reply write has the v2.9 03 timing and revision issues,
  so it would reuse that writer's guards. Not proposed now.
- **Cost.** (a) 0 calls, regex over each reply. (b) ~25 tokens per draft.
- **Invariants.** Detector is read-only (no boundary effect). Clause names only enabled members (public). Away members
  (`awayNotice`) excluded.
- **Measure.** (a) First on recorded sessions offline: rate per 100 member replies (S0-style: if < 1 per 100, record and stop
  the clause). (b) `so-prompt-arms` gate with 25 cases where the transcript invites cross-voicing (a member asked about
  another's view); floor: detector hits down >= 50 % vs control, categories no lower than -0.2.
- **Size** S. **GPU** only for (b).
- **Basis.** Echoing (role abandonment after ~7 turns), SocialBench (group harder than solo); ST's guard covers only one
  shape on one API.

### P4. Echo watch: cross-member phrase adoption (code, extends the v2.9 02 miner)

- **What.** Extend per-speaker repetition with an "adopted" list: n-grams (4+ words, quotes removed via `withoutQuotes`) that
  appear in member B's last window, first appeared in member A's replies, and are absent from B's card and earlier replies.
  Feed up to 2 into B's existing "say it differently" line (`renderDelivery` `repeated`, `REPETITION_LINE_MAX`), and show
  per member in Author view. Also report a per-scene "convergence" number (P1 metric (a) over the last window) in the author
  console.
- **Modules.** `runtime/delivery/mine.ts` (`mineRepetitionBy` gets the other members' windows), `render.ts` unchanged
  format; switch `memory.echoWatch`.
- **Cost.** 0 calls; a few tokens when it fires.
- **Invariants.** Pure over chat rows: rollback ≡ replay. Phrases come from visible replies only. Must skip phrases the player
  said (shared-scene words, names, places).
- **Measure.** Offline adoption rate on recorded sessions first (decides value). Then the same prompt-arms gate as P2 with
  long transcripts seeded with planted shared phrases; floor: planted adoption down >= 50 %, categories >= -0.2.
- **Size** S. **GPU** for the arm only.

### P5. Role-aware thinking clause (prompt, switch `memory.roleAwareThinking`)

- **What.** One static sentence for the drafted member's thinking, placed in the private block: "In your thinking, plan as
  {name} would: what they notice, want and would say, in their own words; do not plan as a narrator or assistant." Thinking
  stays on; only its framing changes. Static per member, so cache-safe.
- **Modules.** `memory/innerRender.ts` (`renderOwnAims` header area) or delivery render; reads nothing new.
- **Side benefit.** v2.8 54's thought carry refuses author-voice lines ("I need to…", "the user"); character-voice reasoning
  should raise carry yield (`storyOrchestratorSpikes.thoughtCarry.stats()` `no-aim` share) and lower `isMetaCommentary`
  drops in the harvest.
- **Cost.** ~30 tokens per draft. Could lengthen thoughts (latency): measure thought length.
- **Invariants.** Raise with the owner first: it changes thinking content (owner wants thinking on; this keeps it on).
  Thought content reaches the harvest and carry, both already guarded for meta and other-subject lines.
- **Measure.** `so-prompt-arms` gate `think` (25 cases); Sol blind categories + attribution; code: reasoning tokens, carry
  yield, closure (thinking must still close: 31's closure count). Floors: character category >= +0.2 or attribution >= +10
  points; closure no worse; reasoning length up <= 20 %.
- **Size** S. **GPU** yes.
- **Basis.** Feng (style drift from generic CoT), TBS (character mindset), FURINA (reasoning raises RP hallucination).
  Evidence is mixed, hence the rating gate.

### P6 (spike, deferred). Per-member control vector in the fork

- **What.** Patch `llama-server` to accept a per-request control-vector id (from vectors loaded at start) and key the member
  cache by it. Vectors from `cvector-generator` over contrastive pairs (member's card examples vs a neutral rewrite).
- **Why it is not dead.** The usual objection (global, breaks caching) is weaker here: the RAM member cache already keys per
  member, and a member's vector never changes mid-chat.
- **Why deferred.** Fork patch plus VRAM; vectors of a 31B trained from a handful of lines are untested for voice (persona
  vector work targets traits like sycophancy); output-changing at every scale; one vector per member per story to build.
  Revisit only if P1 shows drift that P2-P5 do not fix. Size L, GPU yes.

## 5. What we do that the field does not, and rejected ideas

**Ours, beyond the literature:**

- **Per-member private context with code-side secret filtering.** Benchmarks give each character a persona prompt; none
  gives each member a private, held-secret-filtered block that changes per draft. Character-LLM's "protective experiences"
  solve knowledge leakage by fine-tuning; we do it in code.
- **Per-member card swap plus a per-member KV cache.** Group-chat studies run one shared context; ours re-centres each draft
  on that member's card without paying a full prefill.
- **Thought carry and inner beat** are a no-training version of TBS, with rollback ≡ replay by construction.
- **Blind attribution with a frozen corpus** (S6) is stricter than most benchmark judges (which score fit, not
  distinguishability).

**Rejected or parked:**

- **Fine-tuning approaches** (RoleLLM, CharacterGLM, Character-LLM, Ditto, multi-turn RL): no 31B LoRA on 24 GB; Ditto's
  self-generated profile idea is already the v2.9 02 wizard sheet.
- **Token bans / logit bias for voice** (avoid lists, tic suppression): already rejected (v2.9 02 Out); a token ban hits every
  token of a phrase.
- **Antislop backtracking in our fork:** strong evidence for slop, not for voice; a sampler patch that touches every
  generation. Note for a prose-quality plan, not this one.
- **Split-softmax / assistant-axis capping:** attention or activation patches, output-changing, global; no voice evidence.
  Recorded for the fork list.
- **Runtime voice judge per reply:** v2.9 01 V06 put a runtime classifier in v3.0, and the warden voice use measures
  behaviour; P1 code metrics are cheaper and do not need a calibration row.
- **Re-sending the whole card each turn:** context cost on 32K and it duplicates the head; P2 sends only voice evidence.
- **Structured responses to stop echoing** (Echoing's 9 % fix): a JSON reply format would damage prose and fight the
  preset; P3/P4 aim at the same failure in prose.

## Unresolved questions

- P1 on recorded campaign sessions: run the scorer inside the private `so-sessions` tree and report counts only. OK?
- P5 changes what Artemis thinks about: owner OK to rate it?
- P3 detector names: count away and disabled members as "others" too, or only enabled ones?
