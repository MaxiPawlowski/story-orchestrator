# Reddit threads on Jev and Jeved — v2.4 review

meta: four Reddit threads, 2026-09-19 → 2026-09-23 (UTC, from comment timestamps), 218 comments in total, plus the two Jeved post bodies and live comment trees the user pasted on 2026-09-23 (`_reddit-jev/user-pasted-2026-09-23.md`). Read against `_baseline.md` and `jeved.md` (the Jeved source review; not repeated here). Our judge is TypeSafe Jev behind `server-plugin/story-orchestrator-judge`. Every judge use is off by default, and the judge never writes. `SO:` paths are ours. Quotes are ≤15 words, attributed to u/author.

**Read this first:** the threads contain **no accuracy measurement of Jev by anyone**, and none for any Jeved sensor. All the numbers are cost and latency anecdotes. The strongest content is design criticism: a number without a reason, rerolls cost too much, and calibration is the vendor's claim. That criticism lines up with invariants we already hold. The concrete new input is small: provider/model-id facts (claims), a context-window claim that our plugin cap may exceed, and the observation that our cost column is empty because we drop the `usage` field Jev already returns.

**Update 2026-09-23 (post bodies read):** the two bodies add **no measurement either**; every accuracy statement in them is the author's "in my testing". They add design content: the OP's own rule that objective compliance questions over card + a few replies work while subjective whole-transcript questions do not (supports our judge-question design, C13); a sensor tracked as an **average** that fires below a threshold (C14, vs our pacing EMA); pre-reply sensors that steer the same reply (C15; we already own that seam); per-sensor context and a WI-reading "contradicts the lore" sensor (R14, vs our warden, which reads facts only). New ideas R13–R16; none outranks R1–R3.

## Sources

| Thread | URL | Archived | Missing |
|---|---|---|---|
| r/ArtificialInteligence "Jev (typesafe.ai) is revolutionary as LLMs" (u/Babayaga1664, 2026-09-19) | https://www.reddit.com/r/ArtificialInteligence/comments/1wkhsyh/ | post body + 100 comments | The 100 is probably the fetch cap: 60+ comments are orphan replies whose parents were not returned, so some context is lost. Four screenshots from u/According_Rub_2835 are image links only |
| r/SillyTavernAI "Jev might be the next frontier for improving…" (Jeved launch, u/_Rapalysis) | https://www.reddit.com/r/SillyTavernAI/comments/1wl7uje/ | 90 comments (2026-09-20 → 09-21); **post body from the user's paste (2026-09-23)** | — (was: post body) |
| r/SillyTavernAI "Jeved 0.2" (u/_Rapalysis, 2026-09-20) | https://www.reddit.com/r/SillyTavernAI/comments/1wltedh/ | post body + 11 comments | — |
| r/SillyTavernAI "Jeved 0.4: evolving roleplay quality" | https://www.reddit.com/r/SillyTavernAI/comments/1wmoluu/ | 17 comments (2026-09-21 → 09-22); **post body from the user's paste (2026-09-23)** | — (was: post body; `_reddit-jev/releases.md` had stood in for it) |

Archive: `api.pullpush.io`, rendered by `_reddit-jev/render.py` into `_reddit-jev/<id>.md`. The service rate-limited after these four fetches, so nothing was re-fetched. Every score in the archive is `1` (pullpush records the score at ingest), so **there is no vote signal**. Popularity cannot be read from this data. This supersedes the note in the old `jeved.md` that the threads could not be fetched: that earlier fetch got a Reddit block page.

**User paste (2026-09-23)**, `_reddit-jev/user-pasted-2026-09-23.md`: Reddit is blocked for our tools, so the user copied both bodies from their own browser. It is the authoritative copy of the two bodies. Its comment lists are condensed, so quotes below still come from the archive where both exist. It carries only two vote counts: u/roselan 165 (a joke that a model which cannot write may become the RP favourite) and u/Many_Examination9543 7. The one visible high score is a joke, not a technical claim. **Comment diff against the archive:**
- 1wl7uje: one comment the archive lacked. u/Able-Emu-606 follows up that laya-multilingual has only a 1024-token context, "very limited". This updates C10: the same user first reported laya working "like a charm".
- 1wmoluu: u/evia89's live comment is longer than the archived one. It names Summaryception's "continuity auditor" (dev-states branch), which rebuilds preset-style state with another model in the background between the bot message and the next send, through a local proxy that races 2–3 free LLM providers. This is a peer shape for our off-path warden.
- The archive has comments the paste omits: removed posts, jokes, and an image-prompt question under 1wmoluu. No technical content is lost.

## Per-thread summary

**1wkhsyh (r/ArtificialInteligence, general).** OP gives no numbers and no example. The claim is that Jev is fast, cheap and accurate, and that writing the question is the skill. The comments split three ways:
- (a) **Practitioners using Jev as a gate in front of an LLM.** u/tribat (travel app: completeness scores per dimension, routing), u/Miserable_Store_3269 (disclosed vendor, feed filter with measured cost), u/Apart-Confusion6127 (routing), u/Excellent-Weight1006 (a model router repo), u/Zboubkiller (a game-playing bot repo).
- (b) **Skeptics.** "It's a classifier / not new": u/ComprehensiveWrap230, u/Intelligent-Kiwi118, u/Bright-Energy2339, u/Alive_Thought_5037. "Compare against classical ML/GBDT": u/Key-Violinist-4847. "No reasoning": u/Dull_Republic_7712, u/haquex19. "Modified Qwen": u/According_Rub_2835 (screenshots not archived).
- (c) **Hype and counter-hype.** Astroturf accusations from u/WAGE_SLAVERY, u/Pleasant-Memory-1789, u/cornmacabre and u/johnfkngzoidberg ("You're replying to a bot."). There are also content-free enthusiasm posts.
Useful for us: the gate/uncertain-band pattern, the explainability criticism, and the local and privacy questions.

**1wl7uje (Jeved launch).** The richest thread for SO.

*Post body (user paste).* Everything in it is an OP claim, and none of it is measured:
- **The model.** Jev is "roughly equivalent to high Luna/Terra" (hype: unverifiable, Jev is closed). It returns typed JSON only, at ~200 ms and ~$0.0005 per call.
- **Sensors.** The newest reply (or replies) goes to Jev as it lands, with several questions batched in one call. The flagship sensor is a 0–4 Score, "tone and themes match the intent of the system prompt", with five described levels. Its score is **tracked as an average across replies**, and the rule fires when the average dips below 2.
- **Its caution.** Subjective questions like "is my roleplay slop" over a dumped transcript are called "a complete waste of time". Objective compliance questions, with the card/system prompt and a few replies, are "very accurate in my testing".
- **Rules.** A seven-step example: a low reply scores 1.2 and the average drops below 2. An OOC instruction is appended to the latest user message and the reply is auto-swiped. The new reply scores 3.4, and the instruction is then stripped from the message.
- **Example pairs:**
  - **cost to the user (positivity bias)** below 1.5 → "make something go wrong for the user";
  - **tension** below 2 → "put the user under pressure";
  - **energy** above 3 → `/imagine`;
  - **world** (accuracy to lore and setting) below 3 → auto-swipe.
- **Other claims.** It worked with every model tried; hundreds of messages cost "a few cents". "Jev is ZDR on OpenRouter". The OP does not plan long-term maintenance.

*Comments.* Topics:
- NanoGPT compatibility, confirmed by u/Milan_dr (apparently NanoGPT staff).
- Local Jev-likes: laya, openjev, and laya-multilingual reported working.
- Idea proposals:
  - pair Jev with flash models;
  - multiplayer POV;
  - route to recast passes;
  - use Jev as a director that picks hand-written prompt components;
  - NSFW rule toggling by context;
  - memory/context pruning, with a claimed ~90% cut;
  - pick the next speaker in groups;
  - detect a location change.
- Criticism: reroll cost, "zero reasoning", OOC over-reaction. Also a provenance dispute (u/ECrispy vs u/_Rapalysis / u/ArtificialTalent) with no evidence either way in the archive.

**1wltedh (Jeved 0.2).** A release post: multi-host, Score/Choice/Noul sensors, unrestricted scripts. Two feature requests were answered **the same day** by 0.4:
- per-sensor context isolation, from u/majesticjg: isolate preset rules and ask Jev "did we follow these rules?";
- World Info in the sensor context, from u/GaiusVictor.

One user asks what it adds in plain terms. This is a UX signal: the value of a sensor layer is not self-evident to players.

**1wmoluu (Jeved 0.4).**

*Post body (user paste).* It frames Jeved as building blocks over "Decision model APIs" and names **Jev and Laya side by side**. Most of the changelog matches `_reddit-jev/releases.md` and the source review in `jeved.md`. Points beyond those:
- Extra prompts go to the model "only when they're needed" and are stripped from history afterwards.
- **Pre-reply** classification of the player's message (combat / conversation / travel / NSFW) adds guidance to **that same reply**, "no delay of one turn" (0.3, "Assistant messages" = 0).
- **Sensors read active World Info**, so a sensor can ask "does this reply contradict the lore" and auto-swipe.
- **Per-sensor Context** (None / Everything / Custom): ticked prompt-manager rows, WI before/after, chat examples. The intended use is one prompt per sensor and "does the reply follow this?".
- **Lists** for inventory, quest log and open threads, and **a trust meter per NPC** (one sensor per NPC, charted, readable by macro). Both are presented as what 0.4 "can theoretically support", not as shipped presets.
- A change made by a rule is undone on swipe/edit/delete, and a change made by the user stays. An edited message is measured again, and that fires no rule.
- Director cost: 3 calls per reply + 1 per user message. Its thresholds "come from test calls". No fixtures are published (as `jeved.md` F4).

*Comments.* Topics:
- **Reroll waste** (u/dudemeister023). The author's answer: nudging is the main path, reroll is optional.
- **Nuance doubt** (u/GeniusSpuncker): can it tell whether "boring" is bad? The author's answer: per-message plot-advance reads are "spot-on" and the trend is trivial. No numbers.
- **Lorebook activation** blocked by Jev's 32k context. u/DevGnoll: send the triggers rewritten as Nouls, not the book.
- **A parallel extension** (u/Many_Examination9543): pre-gen next speaker, main-model tool calls to Jev for action probabilities, a dice-roll preset.
- **Async background use** (u/evia89). The live comment names a background "continuity auditor" (see the comment diff). Ours is the same shape: the warden runs off-path after the reply (`SO: src/runtime/coordinators/stagecraftCoordinator.ts:380-430`).
- **A judge over another agent's output** (u/BaseballRelevant4149): wants Jev to "spray bottle" a lorekeeper agent that creates bad entries. Ours: the WI curator already proposes only, behind an author review ring (inv 6), and `curatorFilter` narrows what the curator is shown (`SO: src/judge/settings.ts:117`). No judge vetoes its proposals.

## Community signals

Strength: **high** = several independent commenters, or a number with a stated method. **medium** = one credible practitioner with numbers, or several without. **low** = a single claim, second-hand, or evidence not archived. **none** = assertion or hype.

| # | Signal | Who | Strength | Bearing on SO |
|---|---|---|---|---|
| C1 | **A number, not a reason.** Jev cannot say *why*, so a workflow that needs an explanation must get it elsewhere | u/Dull_Republic_7712 ("We don't know the reason why jev made certain decision"), u/Miserable_Store_3269, u/haquex19, u/Key-Violinist-4847 (GBDT explainability), u/Ok_Strategy_2420 quoting OP "Zero reasoning" | **high** (5 independent) | Supports our design: the *question* is the reason. The warden note cites the broken fact verbatim (`SO: src/judge/curators.ts:26-34`), and every call is ringed with its `p` (`SO: src/judge/types.ts:80-91`). Rule for v2.4: any judge-driven output must name the question and the record that fired it (T22/T23) |
| C2 | **Jev as a cheap gate; send the uncertain band to a real model** | u/Miserable_Store_3269 (disclosed vendor): 47 h, 54 of 63 runs never woke the LLM, $0.0017 total, "its calibration is the vendor's claim"; u/tribat (logs, no numbers); u/Apart-Confusion6127 ("5-30s" LLM → "1s"); u/GasSmooth7439 "sensor instead of a writer" | **medium** (one set of numbers, disclosed interest) | Matches inv 7: each consumer keeps today's path on low confidence or fallback. It argues against any use whose fallback is "do nothing" when the band is wide |
| C3 | **Rerolls are waste; OOC nudges over-steer** | u/dudemeister023 ("rerolling inefficient and wasteful"), u/Caminn (cost), u/BriefImplement9843 ("react fervently to occ commands"), u/typical-predditor (steer proactively, pick hand-written components) | **medium** (4 independent, no numbers) | Supports jeved.md idea 12 (no auto-reroll). **New risk**: our one-turn depth-0 notes (warden; T22/T23) can over-steer too. Measure it (R9) |
| C4 | **Latency ~200 ms, cost fractions of a cent** | u/Grandon-Selvey ("adds like 200ms"), u/aroughdot ("like 200ms"), u/Subushie (650 requests, 1.3 Mtok, $0.04), u/No_Map1168 quoting OP ($0.0005 per response); the OP body states ~200 ms and ~$0.0005 per call first-hand (paste) | **low-medium** (anecdotes; the OP figure is now first-hand but still unmeasured, with no state size) | Our measured p50 ranges from 223 ms (`curatorFilter`) and 275 ms (`memoryVerify`) to 1512 ms (`scene`), with cold ~650 ms (`recommended-config.md`, gotchas). **"200 ms" holds only for small states.** Do not size reply-path budgets from it. We cannot check the cost claims, because we record no tokens (R1) |
| C5 | **Context window ~32k tokens** | u/aroughdot ("Jev has a 32k context window"), u/_Rapalysis, Jeved README (`jeved.md` §How it works) | **low-medium** (3 sources, none cites TypeSafe docs) | Our plugin refuses above 140,000 **chars** (`SO: index.mjs:10,96`). At ~4 chars/token that is ~35k tokens, and Spanish packs fewer chars per token, so the refusal can sit *above* the claimed limit. The overflow behaviour (error vs silent truncation) is unknown (R4) |
| C6 | **Calibration is the vendor's; compare against a control** | u/Miserable_Store_3269, u/Key-Violinist-4847 ("hesitant to believe marketing"), u/Innomen (control group: the same framework emulated by the LLM), u/Mart-McUH | **medium** | Supports inv 7 (own fixtures, predeclared floors). The control-arm point is unbuilt on our side (`so-lore-probe diff`, R8) |
| C7 | **Plot-advance per message is reliable; the trend is code** | u/_Rapalysis (author: "spot-on", "fairly deterministic"; the 1wl7uje body applies the same shape to tone); u/GeniusSpuncker doubts it has the nuance | **low** (author claim, no data) | Consistent with our `stallCheck` 1.0000 (89/89), which is gate-directed, not a "boring" detector. It backs jeved.md ideas 7/8 (tension read, hysteresis) only weakly |
| C8 | **Numeric tension grading is awkward** | u/Zeeplankton (tried "tension=5 do this", "still wasn't good"; predicting next beats worked better) | **low** (one builder) | A caution for jeved.md idea 7. Our tension steering is authored (`tension_target`) and EMA-smoothed. A judge tension read must beat the extractor on the live-suite MAE fixtures, not just exist |
| C9 | **Hosted routes exist (NanoGPT, OpenRouter)** | u/MisanthropicHeroine quoting a NanoGPT announcement; u/Milan_dr (apparently NanoGPT) "tested ST-jeved's exact request format" | **medium** (vendor statements) | See Provider/API claims. Relevant to T25 and `modelMatched` |
| C10 | **Local/open alternatives and privacy** | u/Goodboyzee (wants local, "for privacy purposes"); u/denpa_kei (laya 421M, 512–8k context; openjev = Qwen3.5); u/MultiBotRun citing Laya docs: typed-decisions 0.362 zero-shot vs 0.766 fine-tuned; u/Able-Emu-606 (laya-multilingual "worked like a charm"; openjev "speaks a different contract"; in the paste, a follow-up: laya has "only 1024 token context"); u/aroughdot (laya 1k vs Jev 32k) | **low** (claims; one user report, which the same user then qualified) | A local Jev-like would remove the third party from the privacy report, but by these claims it is far weaker zero-shot. **At ~1k tokens, laya cannot hold any of our states** (a lore chunk is up to 64 × 600 chars). openjev needs an NLI adapter, which fits in our plugin rather than in the page. Neither is drop-in. Each model is its own calibration (R2/R3) |
| C11 | **Model identity** | u/According_Rub_2835 ("Jev is just a modified Qwen model", screenshot not archived); u/ComprehensiveWrap230 (speculation) | **none** (evidence missing) | Irrelevant to design. Relevant only as a reason to pin the version and to record the answering model (we do: `modelMatched`) |
| C12 | **Hype / astroturf** | Content-free enthusiasm: u/QuietStream87, u/Saint_Nitouche, u/_Cromwell_, u/Odd_Football2923. Overclaims: u/Subushie ("cannot hallucinate or returned malformed answers"), u/aroughdot ("smart like a frontier model"). Accusations: u/WAGE_SLAVERY, u/Pleasant-Memory-1789, u/cornmacabre, u/johnfkngzoidberg. Self-promotion: u/Sea_Supermarket_5891 (madewithjev.com) | **none** | Ignore. Our own ring has an `invalid` fallback (`SO: src/judge/types.ts:78`); whether Jev ever returns malformed answers is a count to read from our ring, not a Reddit claim. The OP body adds "roughly equivalent to high Luna/Terra", "20x as fast" and "extremely accurate", all without a method |
| C13 | **Objective compliance questions work; subjective whole-transcript questions do not** | OP body (paste): subjective questions over the whole transcript are "a complete waste of time", while the card + a few replies and "does the story comply" are accurate "in my testing"; u/GasSmooth7439 ("is the response following the character card?"); u/_Rapalysis in 1wmoluu (per-message reads are "fairly deterministic") | **low-medium** (the author + one practitioner, no numbers; it is also the vendor's own guidance) | **Supports our judge-question design**: a small typed `state` per use, and per-question `criteria` for both answers (`SO: src/judge/curators.ts:5-17`). Each use declares what it `sends` (`SO: src/judge/settings.ts:109-122`), never a transcript dump. Our best-measured families are the objective ones: stall 1.00, continuity 0.9765. A future "is it boring / is it slop" use would be the family this caution warns about. Keep T23's rule-per-question shape |
| C14 | **Trend, not one-shot: fire on an average below a threshold** | OP body: the tone sensor is an average across replies and fires when it dips below 2; u/_Rapalysis in 1wmoluu: per-message read, "then tracking a trend … is trivial"; 0.4 rules: `need` N of the last M measured messages (`jeved.md` §How it works) | **low** (author claims) | **Ours already trends, on a different input.** Pacing keeps an EMA (α 0.3, `SO: src/constants/defaults.ts:4`, `src/pacing/tension.ts:21-25`) of the **extractor's** tension level. It steers on drift from the **authored** expected tension (`SO: src/pacing/steering.ts:48-56`), not on a fixed floor. The warden, by contrast, is one-shot per reply. Nuance: an EMA never "fires"; it moves the hint's direction each boundary. Jeved's rule fires once and then cools down. That is jeved idea 8 (hysteresis), which this supports weakly |
| C15 | **Pre-reply reads steer the same reply, with no one-turn delay** | OP 0.4 body (four Scene rules read the player's message); u/StringSpecialist4437 ("use Jev before LLM"); u/nerdswithfriends (a call before generation) | **low** (no numbers) | **We already own the seam.** `loreSelect` waits for MESSAGE_SENT so the player's message is in its window, then forces lore for the same reply (`SO: src/runtime/index.ts:149-158`). The judge director also runs pre-reply. The warden runs post-reply, so its note lands on the *next* generation. This lowers jeved idea 9's effort (no new host seam). The 1500 ms reply-path budget (`SO: src/judge/policy.ts:2,9,36`) still binds |
| C16 | **Vendor risk: closed model, disputed attribution, "Jev-like" peers named as equals** | u/ECrispy vs u/_Rapalysis / u/ArtificialTalent (dispute, no evidence); u/MultiBotRun ("smart like a frontier model" is unverifiable, "because Jev is closed"); the 0.4 body names Laya beside Jev | **low** (the dispute is none; closedness is fact) | No design change. Jev being closed is why our floors are our own (inv 7), and why every use keeps its non-judge path. The ecosystem treats Jev and Laya as interchangeable, but by the numbers above they are not (C10) |
| C17 | **Privacy: "Jev is ZDR on OpenRouter"** | OP body only | **none** (single claim, no link to terms) | Not citable. `docs/plans/v2.3/privacy-report.md` T2 states what we send, but cites no retention terms for any host. A per-host row (T25) would need the host's own published terms, not this |

## Ideas for v2.4

These add to jeved.md ideas 1–14 and do not repeat them. Where a thread only *supports* a Jeved idea, it is noted in the per-idea paragraphs, not re-listed.

| # | idea | kind | our area | our state | value | effort | invariant conflict |
|---|---|---|---|---|---|---|---|
| R1 | Record judge `usage` (tokens, and provider cost when sent) per call. Session totals in author view. Fill the empty cost column of `recommended-config.md` | observability | judge ring / author view | partial: `JudgeResponse.usage` is typed (`types.ts:62`) but never copied into `JudgeCallRecord` (`:80-91`) | 3 | S | inv 9 (author-only); ring cap unchanged. Merges jeved.md idea 6 |
| R2 | Readiness names the model it was measured on. The panel says "not measured on <model>" when `settings.model` or the answering model differs | calibration/ux | judge readiness | absent: `readiness.ts:15-40` has no model, while `settings.ts:38,55,69` lets the model be changed | 3 | S | inv 7: a use on an unmeasured model reads `unproven`, never re-floored |
| R3 | Plugin host table: base URL + path + model-id map per host (TypeSafe, NanoGPT, OpenRouter, a local Jev-like); record the answering model; one calibration per host×model | host-integration | judge transport | partial: `TYPESAFE_BASE_URL` override exists (`index.mjs:22`), path fixed to `/v1/systemone` | 3 | S-M | inv 7; the key stays server-side. Extends jeved.md idea 5 |
| R4 | Token-based request guard: verify Jev's context limit and overflow behaviour; refuse above an estimated-token cap, never truncate | hygiene | judge plugin | partial: 140k-**char** refusal (`index.mjs:10,96`) | 2 | S | none (refusal, as today) |
| R5 | Judge-picked authored steering: a Choice over a checkpoint's authored complication/beat snippets → one-turn steering block. Proactive, never a reroll | new-feature | pacing / stagecraft | absent: steering text is code (`steering.ts:47`); the complication pool is next-tier (dooms) | 3 | M | inv 7 (own fixture + floor, off); C4 (snippets are world pressure); schema addition → storyDiff row + `DIAGNOSTIC_CONSEQUENCES`; inv 16 |
| R6 | Lore "relevant when" arm: a Noul over a short authored or derived trigger statement per entry, instead of 600 chars of content | calibration spike | judge / lore | absent (`LORE_CONTENT_CHARS` 600, `policy.ts:35`) | 2 | M | inv 7: predeclared arm, fresh rows; run with T21's arms |
| R7 | A consumer spike for the dead `memoryRerank` toggle (judge-ranked memory under budget), or remove the toggle | calibration spike | memory / judge | absent (toggle only, `recommended-config.md:41`) | 2 | M | inv 7; V19 wire-or-remove |
| R8 | Judge-off control arm as standard for every use: same transcript, judge off, in journeys and human sessions | harness | judge / eval | partial (`so-lore-probe diff` not built) | 2 | S | inv 20 |
| R9 | Over-steer check for one-turn notes: the reply after a warden/agency/house-rule note must not restate it or swing (probe + rubric row) | harness / rubric | stagecraft (warden) | absent | 2 | S | none |
| R10 | Multiplayer per-player POV | new-feature | — | out of scope (`_baseline.md` §4, single human) | 1 | L | spec addendum v2.1 §Personas |
| R11 | Judge as router for post-reply rewrite passes (recast) or auto-swipe QA | anti-pattern | — | absent by design | 1 | M | inv 3, 7, 11 (same as jeved.md ideas 12/13) |
| R12 | Judge probabilities + dice to resolve attempted actions | anti-pattern (for now) | engine | absent | 1 | L | inv 7 (a judge answer deciding a write), C4 agency; needs the RNG seam of "seeded chance gates" |
| R13 | **Adversity read** ("does anything cost the player?") as the *trigger* for R5 / the complication pool, not a steering text of its own | calibration spike | pacing / stagecraft | absent: the world-pressure clause is prompt-only (`engine/agency.ts:9,26-29`), and escalation fires only on tension drift (`pacing/steering.ts:26-38`) | 2 | M | inv 7 (own fixture + floor, off); C4: the answer may only release **world** pressure (an authored complication), never narrate the player's loss; inv 16 |
| R14 | **Lore contradiction in the warden**: hold the reply to the story's own authored lore as well as to facts | new-feature (judge family) | stagecraft (warden) / WI | absent: the warden's fact list is live facts + bound ledger rows only (`runtime/continuity.ts:25-52`) | 2 | M | inv 7 (a new family: lore entries are prose, not one-line facts, so they need their own fixture); privacy (`sends` gains lore text, which `loreSelect` already sends); R4 (state size); needs T12 for "activated" lore |
| R15 | Per-quality macro `{{story_quality::<key>}}` (Jeved's `{{jeved::sensor_id}}`, the per-NPC "trust meter") | ux | macros | partial: `story_blackboard` and `story_ledger` render whole blocks (`runtime/macros.ts:50,56`) | 2 | S | inv 2 (through the `registerHostMacro` seam; parametric macros need the new engine, `macro-system.js:44-58`, so capability-probe it); inv 9 (the key names are the author's) |
| R16 | **Judge-vs-extractor disagreement record**: when both could answer a quality, log where they differ (author-only), as calibration evidence | harness / observability | extraction / judge | absent: a judge-answered quality is removed from the extractor's scope and its stray lines are dropped (`extraction/sharedRead.ts:34-39,94-95`), so the two never disagree on record | 2 | M | inv 7 (logging only, no floor moves); costs extractor tokens for the shadowed qualities; overlaps bettersimtracker's shadow arm (SUMMARY §10) |

**R1. Usage and cost.** Every cost number in the threads is an anecdote (C4). Ours is worse: `recommended-config.md:22-23` says cost "is not measured". Yet Jev already returns `usage`, which we type (`types.ts:62`) and then drop. Copy `input_tokens`/`output_tokens` (and a provider `cost`, if a hosted route sends one) into the call record. Sum them per session in the author view. Then one metered session answers "$ per 1000 boundaries" per use. This is the cheapest idea here with a direct payoff.

**R2. Readiness by model.** The panel shows jev-1.13.0 rates whatever model is configured. A user who sets `jev-latest` today gets jev-1.13.0 (so the numbers happen to hold). A hosted `typesafe/jev-1.13` or a local laya would inherit rates nobody measured. Add `measuredOn` to each fact, and compare it with `settings.model` and the last answering model in the ring. This is the in-product half of `modelMatched`.

**R3. Host table.** Jeved's F3 route and the NanoGPT confirmation make hosted routes real (claims, C9). Laya-multilingual reportedly works through Jeved's custom provider (C10), so a local host speaks the same contract. Our plugin already has a base-URL override, but the path is fixed and there is no model map, so `modelMatched` fails on `typesafe/jev-1.13` vs `jev-1.13.0`. Each host×model pair gets its own calibration run (inv 7), and the privacy report needs a row per host.

**R4. Context guard.** The C5 arithmetic: 140,000 chars ÷ ~4 chars/token ≈ 35k tokens, above a claimed 32k. No current use comes near the cap: a lore chunk is ≤64 × 600 chars, and the warden holds ≤40 facts. So this is a latent edge, not a live bug. First find out what the API does on overflow (it might truncate silently, i.e. context rot). Then cap by estimated tokens.

**R5. Judge-picked authored steering.** u/typical-predditor's idea is to have Jev choose which *hand-written* component to feed the writer, instead of an LLM writing a steering prompt. This is the one idea in the threads that fits our invariants natively: the author writes the text, the judge only picks, and code injects it for one turn. It pairs with the dooms complication pool (SUMMARY next tier) and T16's objective block. It needs its own ≥20-case fixture ("which snippet fits this moment", with NONE as an option) and a floor.

**R6. Lore trigger-statement arm.** u/DevGnoll's point: to decide whether an entry applies, the judge needs the *trigger*, not the entry. Today we send title + 600 chars per entry. A one-line "relevant when …" (authored in the story's lore scope, or derived once from the entry) shrinks the state and may spread probabilities. Run it as a fourth predeclared arm beside T21's raw-Score and hybrid arms, on the same fresh rows.

**R7. memoryRerank.** u/KuziKuzina claims a self-made Jev setup cut chat-history tokens ~90% as an alternative to RAG. There is no code and no method, so the evidence is low. It is still the only concrete candidate consumer for our dead toggle besides vecthare's embedding rerank. It feeds the V19 wire-or-remove decision; it does not justify building.

**R8. Control arm.** The "compare against a control" criticism (C6) is the one our process only half answers. Floors test the judge against labels, not the product against the product-without-judge. `so-lore-probe diff` was the plan-10 instance and is unbuilt. Make the judge-off arm a standard column in live gates and human sessions.

**R9. Over-steer.** OOC nudges "swing it wildly" (C3). Our notes are system-role depth-0 lines, not OOC in the user turn, but a loud one-turn instruction can still over-correct. Add a probe: the reply after a note does not quote it and does not make the noted fact its subject unprompted. Add a human-rubric row too. This applies to the warden today and to T22/T23 if built.

**R10–R12.** Out of scope or anti-patterns. They are listed so that a later reviewer does not re-propose them from the same threads. R12 is distinct from "seeded chance gates" (SUMMARY §8): there, code rolls against an authored probability; here, the judge would supply the probability that decides a state write. u/_RaXeD's recast idea (a sensor picks which of "hundreds of recast prompts" rewrites the reply) is R11 again. Our invariants forbid it: inv 3, 7, 11, since the judge would decide a write to the chat. The recast review treats a post-processor rewrite as a host mutation shape to survive (SUMMARY §1, "re-commit newest reply after a third-party rewrite"), not as a feature to drive.

**R13. Adversity read.** The OP's "cost to the user" sensor, with its rule "make something go wrong for the user", targets **positivity bias**: the writer model never lets anything cost the player. Ours has no read for it. `objective_kind: "world_pressure"` adds a clause to every prompt (`engine/agency.ts:26-29`). The escalate hint says "force … a hard consequence", but only when the tension EMA sits below the authored target (`steering.ts:31-38`). A story at its target tension with no cost ever landing is invisible to us. The shape that fits C4: the read only *triggers*, the text is authored. Let an adversity Score below a floor, over N of the last M boundaries (jeved idea 8), release one authored complication (R5 / dooms pool) as world pressure. Never "the player loses X". Value is low until R5 exists; without it, this would be a second steering text, and C3 says those over-steer.

**R14. Lore contradiction.** Jeved 0.4's WI-reading sensor asks "does this reply contradict the lore". Our warden asks the same Noul over facts and bound ledger rows (`judge/curators.ts:11-17`, `runtime/continuity.ts:25-52`), never over authored lore. Authored lore is exactly what a writer model drifts from over a long run. Two costs keep this at 2:
- lore entries are long prose, so one Noul per entry changes the question the warden family was calibrated on (0.9765), and it needs its own fixture;
- "activated" lore needs T12's WORLD_INFO_ACTIVATED ring. The alternative, the whole lore-select scope, is the 32k risk of R4.
Start with the story's `stagecraft.lorebooks` or lore-select scope, capped like `CONTINUITY_MAX_FACTS`.

**R15. Per-quality macro.** Jeved's per-NPC trust meter is one sensor per NPC read by `{{jeved::sensor_id}}`. We already have the substance: an authored quality per NPC, typed on the blackboard, or a ledger `[state:Entity:type] field=value` row, optionally bound to a quality (`ledger_binding`). Both are rolled back with the story. What is missing is addressing **one** value in a card or preset, because `story_blackboard` renders the whole memo. It is cheap, but check whether `registerHostMacro` can register a parametric macro on the legacy `MacrosParser` path before promising it.

**R16. Disagreement record.** u/curious_biped_dev asks what happens when the narrator's implication and Jev's classification disagree. Ours: for typed reads the judge **replaces** the extractor on answered qualities (`sharedRead.ts:94-95` removes them from the extractor's scope, and `:39` drops a stray line for them). Store-level disagreements go to the reconciliation queue (`runtime/memoryQueue.ts`), and a warden disagreement becomes a one-turn note plus an author card. So nothing is lost at runtime, but the calibration signal "the extractor would have said otherwise" is never recorded. A shadow mode that keeps both and logs the diff is harness work, and it costs extractor tokens. Same shape as bettersimtracker's shadow arm.

**Evaluated from the bodies, no new row** (ours already covers it, or an existing row does):
- *Instructions stripped after their turn*: present by construction. Our one-turn blocks are extension prompts (`setStoryExtensionPrompt`, cleared at GENERATION_ENDED, `stagecraftCoordinator.ts:462-471`), never text written into a chat message. Jeved moved to the same model in 0.4. The known flaw is *which* ENDED clears them: T6.
- *An edited message is re-measured, and no rule fires*: different by design. An edit is a mutation, so we roll back and re-read (`turnBridge.ts`). T3 (content fingerprints: skip no-op edits) is the refinement in the same direction.
- *Lists (inventory, quest log, open threads), undone on swipe/edit/delete, user changes kept*: present in substance. Ledger rows, arcs and memory are reversed by `reverseMemoryState` (`memory/reverse.ts:23`, plan 04). The player sees "Open threads" (`runtime/narrative.ts:118`). Author decisions carry `override` provenance, and pins are retention. Jeved's per-swipe persistence on `message.extra` is jeved idea 11.
- *Per-sensor context from the prompt manager*: we choose the opposite on purpose. Each use sends a fixed typed state, disclosed in `sends` (`judge/settings.ts:109-122`), not user-ticked prompt rows. Rows would send the persona and card to a third party wholesale (`jeved.md` avoid-list). The useful half, "one rule, one question", is T23.
- *u/DevGnoll, WI triggers rewritten as Nouls*: this is R6. The new detail: pre-filter entries on cooldown or blocked by inclusion groups before asking, a cheap cut to the question count.
- *u/typical-predditor*: R5. *u/KuziKuzina*: R7 (the ~90% claim still has no method or code). *u/Innomen*: R8. *u/BriefImplement9843*: R9. *u/Zeeplankton*: C8.
- *u/Zeeplankton's `prediction` key* (the main model predicts the next beats in its own reply JSON) is a counter-signal to judge-driven numeric steering. Ours predicts structurally: an authored checkpoint graph, generated beats (expansion) and `lookahead` ("Heading toward"). So the lesson for us is only C8's: a judge tension read must beat the extractor on the MAE fixtures before it steers anything.

**Support for existing Jeved ideas** (no new rows):
- idea 2, agency check: u/FromSixToMidnight and u/GasSmooth7439 describe "adhere to the character card / ruleset" sensors as the value.
- idea 3, house_rules: u/majesticjg asked for exactly "isolate parts of my preset and ask Jev 'Did we follow these rules?'". The author shipped per-sensor context isolation in one day. The shape to copy: each rule question sees the reply and the rule, not the whole preset.
- idea 9, pre-reply player-message Choice: u/nerdswithfriends (toggle content rules by context before generation), u/FR-1-Plan (scene category + who-at-whom → code-side tendency), u/Zeeplankton. The 0.4 body ships it as four Scene rules. **Effort M → S-M**: the pre-reply seam already exists in `loreSelect` (C15).
- idea 7, tension read: C7 supports it weakly, C8 cautions against it. The OP's tension sensor ("nothing interesting happening", below 2 → pressure) is the same idea without a fixture.
- idea 8, steering hysteresis: C14 (average + threshold, `need` N of M).
- idea 3 / T23, house rules: C13, the OP's own rule that objective compliance questions over the card + a few replies work, which is the rule-per-question shape.

## Criticisms and risks

- **Explainability (C1).** This is the most repeated criticism. Our mitigation is structural: the question text and the cited record are the explanation. **Risk:** a use whose output is a bare number shown to an author, such as a future tension read, would carry exactly this criticism. Show the rubric level wording, not just the number.
- **Cost of rerolls and wasted calls (C3).** Not ours, since we never reroll. The analogue is judge calls whose answer nothing reads (the `sceneOoc`/`memoryRerank` toggles). Jeved's "measure only what an enabled rule reads" already answers it.
- **Trust in vendor calibration (C2, C6).** Our floors are our own. **Gap:** no judge-off control arm (R8), and no human column (`recommended-config.md:19-21`).
- **Drift, `jev-latest` vs pinned.** NanoGPT exposes both `typesafe/jev-1.13` and `~typesafe/jev-latest` (C9). Our `jev-latest` currently answers as `jev-1.13.0`, so drift is unmeasurable (`_baseline.md` §3B). **New risk:** a hosted route may not report which version actually answered, which would blind `modelMatched`. R3 must record what the host returns, and treat "unknown" as unmeasured.
- **Privacy / third party.** Users want local for privacy (C10). u/Mocoberci claims TypeSafe says it cannot train on user data. That is second-hand and unverified, and they add it is not enough for legal teams. Our privacy report (`docs/plans/v2.3/privacy-report.md` T2) states what we send per use. A hosted route adds a **second** third party per call. No thread gives data terms for NanoGPT or OpenRouter. The OP body says "Jev is ZDR on OpenRouter" (C17): one claim, no link, so it is not citable in the report.
- **Vendor lock-in.** Jev is closed. The open alternatives are much weaker zero-shot by their own docs (Laya 0.362 vs 0.766 fine-tuned, as quoted by u/MultiBotRun), and openjev reportedly speaks a different contract. laya's context is reported as ~1k tokens (C10, paste), below every state we send. **Mitigation today:** every use is optional and keeps its non-judge path, so losing the vendor costs features, not function. Keep it that way. No use may become the only path.
- **Provenance dispute** (u/ECrispy: Typesafe derived from Laya's author; disputed by u/_Rapalysis, u/ArtificialTalent). No evidence either way in the archive or the paste. Not a technical risk. Noted only because a user may raise it. The part that matters is closedness (C16): nobody outside TypeSafe can check the model, so our own calibration is the only evidence we hold.
- **Context window (C5).** Latent. See R4.
- **Hype distortion (C12).** A large share of 1wkhsyh is noise or accusation. None of the enthusiasm carries a method. Weight nothing in this file above what our own calibration measured.

## Provider/API claims

All **claims, not verified by us**. No network call was made for this review.

| Claim | Source | Note |
|---|---|---|
| NanoGPT serves Jev via a **Decisions API** `/v1/decisions` (state + typed Choice/Score/Noul questions) **and** via Chat Completions, Anthropic Messages and Responses shapes with an "endpoint-specific questions response format" that returns answers as JSON text | NanoGPT announcement quoted by u/MisanthropicHeroine | The chat-shaped routes return answers **as text**, which would need a parser. Prefer the decisions route |
| NanoGPT model ids: `typesafe/jev-1.13`, `~typesafe/jev-latest`; `typesafe/jev-latest` accepted as an alias | same | Differs from TypeSafe's `jev-1.13.0`. R3 needs a map, or `modelMatched` fails |
| NanoGPT endpoint `https://nano-gpt.com/api/v1/decisions`, Bearer NanoGPT key; ST-jeved's exact request "received a valid response" | u/Milan_dr (tested with Codex) | Agrees with Jeved source (`jeved.md` F3) |
| OpenRouter serves Jev ("Jev through OpenRouter and NanoGPT") | u/_Rapalysis | Path and model id come only from Jeved source: `…/api/alpha/decisions`, `typesafe/jev-1.13` (`jeved.md` F3). An `alpha` path suggests an unstable API |
| DeepSeek or other LLM APIs do not speak the Decisions API | u/_Rapalysis | Consistent with our plugin: TypeSafe-only contract |
| Context ~32k tokens | u/aroughdot, u/_Rapalysis, Jeved README | See C5/R4 |
| ~200 ms per call; ~$0.0005 per Jeved response; 650 requests / 1.3 Mtok = $0.04; 47 h feed watcher = $0.0017 | u/Grandon-Selvey, u/aroughdot; OP via u/No_Map1168; u/Subushie; u/Miserable_Store_3269 | Input-weighted pricing is implied (1.3 Mtok over 650 requests is ~2k tokens/request). u/Dull_Republic_7712's "4x more for the input tokens" is a garbled second-hand Twitter claim. Unusable |
| Laya: 421M params, 512–8k context; openjev: Qwen3.5 converted; laya-multilingual worked with Jeved's custom provider | u/denpa_kei, u/MultiBotRun, u/Able-Emu-606 | A local server must also serve our `/v1/systemone` path (R3) |
| laya-multilingual has only a 1024-token context; openjev speaks an NLI contract, so an adapter server is suggested | u/Able-Emu-606 (the follow-up is in the user paste only) | Too small for any of our states. An NLI adapter would live in our plugin (R3), never in the page |
| ~200 ms and ~$0.0005 per call; batched questions per call | OP body (paste) | First-hand, but no state size is given. Compare C4: our p50 is 223–1512 ms by use |
| "Jev is ZDR on OpenRouter" | OP body (paste) | Unlinked. Not citable in `privacy-report.md` (C17) |
| Jev ≈ "high Luna/Terra", "20x as fast"; "zero reasoning" | OP body (paste) | The first two are hype and unverifiable (C12, C16). "Zero reasoning" is a description (no reasoning tokens), and it is C1's root |

## What this changes in SUMMARY.md

- **Repo index:** rows for Jeved and for these threads.
- **New theme §11 Judge (Jev)** gathers jeved.md ideas 1–11 and R1–R9. §8 "Post-reply agency check" moves from 3/M to 4/M (jeved.md idea 2).
- **Top recommendations T21–T25**, all "unverified (added after the verification pass)":
  - T21 raw Score read + predeclared hybrid lore arm;
  - T22 agency check through the warden;
  - T23 authored `house_rules`;
  - T24 judge usage + readiness by model (R1 + R2);
  - T25 plugin host table + token guard (jeved.md idea 5 + R3 + R4).
- **New section "Community signals (Reddit, Jev)"** before the open questions.
- **Open questions:**
  - hosted routes as a second third party;
  - agency-note accept mode;
  - house-rule scope;
  - doubling lore questions on the reply path;
  - what TypeSafe's data terms actually say.
- **Seeds table:** seed B's "Score arm refuted" is qualified by T21 (the refutation rounded the Score). The drift seed gains the hosted-alias case.
- **Post-body update (2026-09-23):**
  - Method bullet: the bodies come from the user's paste.
  - Community signals rows for C13–C17.
  - R13 → §8, R14 → §11, R15 → §9, R16 → §10.
  - §11 pre-reply bullet: the seam exists (C15).
  - T23/T25 get one source line each; neither changes scope.
  - No T is renumbered.

## Verdict

Relevance **medium-low** as evidence, **medium** as design pressure. The threads measure nothing, so no calibration number or floor of ours moves. They confirm, from independent practitioners, the three positions our judge design already takes: judge answers are gates with a fallback, explanations come from the question rather than the model, and the judge does not reroll. They add three cheap, concrete items: record `usage` (R1), key readiness by model (R2), and a host table with a model map (R3). R5 (judge-picked authored steering) is the one new feature that fits every invariant natively. The post bodies (2026-09-23) do not change this. They state the vendor's own guidance for writing questions (C13), which our design already follows. They show that Jeved's core mechanism is a trend with a threshold (C14), which our pacing EMA already is. And they add one judge family worth a spike, lore contradiction in the warden (R14, 2/M).
