# Voice research: RP community and products (angle `voice-community`, 2026-10-31)

Research only. Nothing built, staged or run; no ST, lanes or GPU. Mechanic: character voice and consistency in a group
chat. Angle B: card-writing practice, SillyTavern group techniques, extensions, sampler and anti-slop fixes, companion
products, and user reports on Gemma-class models. Speaker choice is out of scope (see `talk-*.md`).

**Already harvested, not repeated here:**
- v2.9 02 `roster[].polish` delivery sheet (notes, prefer, avoid, tics, rhythm, by_mood; `src/engine/deliverySchema.ts`),
  per-speaker repetition miner (`src/stagecraft/repetition.ts:65`), wizard sheet proposal. Measured: blind attribution 60/60
  on both arms of the first set, 0/60 vs 60/60 on the harder set (`docs/plans/v2.9/02-roster-voice-prevention.md`).
- v2.9 03 per-character reply polish (Recast-style rewrite), built and switched off for the playtest.
- v3.0 31 outward narrator clause and swipe contrast (`src/memory/innerRender.ts:96-100`).
- Inner beat (Stepped Thinking analogue, `src/memory/innerBeat.ts`), inner thought carry (v2.8 54), warden voice question
  (`src/judge/warden.ts:82-95`).
- Castward phrase-ban host fact (`{{banned}}` is a token ban on llama.cpp, `banned_strings` not forwarded), NovelAI per-member
  bias (triage N19, v3.0), quirk over-indexing throttle (triage N21, folded into tics), card craft in
  `.claude/skills/st-character-authoring/references/writing-craft.md` (Ali:Chat, PList, Character's Note at depth 4).

This report covers what those passes did not reach: what the owner's own install does to the classic group guards, DRY
behaviour with names, example-message push-out, Gemma 4's literal trait use, backtracking phrase bans as a server feature,
and what companion apps teach.

---

## 1. Summary

- **The standard ST guard against "one member writes the others" is off on this install, on purpose.** ST adds `\nName:`
  stop strings for every other group member only when `names_as_stop_strings` is on
  (`SillyTavern-MainBranch/public/script.js:3033-3055`). The thinking arm turns it off because the reasoning lists the cast
  line by line and was cut at the first name (`scripts/debug/adolion-fresh.presets.json:15,26`; owner `settings.json` reads
  `false`, verified). Names are forced into history (`names_behavior: force`), which primes the model to continue with
  `\nOther:` lines. Nothing in our code trims a reply that does. **Top proposal: a deterministic receipt-time trim of foreign
  speaker lines in the visible reply**, the same seam as thought-leak repair.
- **Non-narrator members get no "others speak for themselves" line.** The narrator has `NARRATOR_SELF_VOICED`
  (`innerRender.ts:98-105`); agency clauses cover only `{{user}}` (`src/engine/agency.ts:23-46`). The community's most
  repeated fix for group cross-voicing is exactly that one sentence ("reply only as {{char}}"). Cheap, static, rateable.
- **DRY punishes names.** The owner's preset runs DRY (multiplier 0.8, base 1.75, allowed length 2, last 4096 tokens,
  breakers `\n : " *`; verified in `TextGen Settings/Artemis v1.1 RP.json`). The DRY author's own note: repeated names get
  penalised and can be corrupted; fix by adding first and last names as breakers. ST runs `substituteParams` on every breaker
  (`textgen-settings.js:1552-1567,1634`), so `{{char}}`/`{{user}}` resolve per request; other members' names need our
  per-request overlay.
- **Example messages fall out of long chats.** `pin_examples` is `false` on this install (verified); ST then adds a member's
  examples only while they fit (`script.js:4957-4969`). At 32K, a long chat pushes the speaker's `mes_example` out of the
  prompt, which is the community's "voice fades after N messages" report. We do not check for it.
- **Gemma 4 31B over-uses authored traits.** A June 2026 r/SillyTavernAI thread: "patient" and "honest" traits announced in
  nearly every scene; tokens near 100% probability. Our private block re-sends drive, motive, beat and the delivery sheet
  every turn. Nobody measures how often a reply restates its own sheet. Proposal: a code-measured trait-echo rate, then a
  "show it, rarely name it" clause or seeded rotation only if the rate is high.
- **Backtracking phrase bans are the field's real anti-slop tool**, not token bans: exllamav2 banned strings, KoboldCpp
  phrase banning, Antislop sampler (8,000+ patterns; token banning unusable near 2,000; [arXiv 2510.15061](https://arxiv.org/abs/2510.15061)).
  We own a patched llama.cpp, so the earlier "llama.cpp can't do phrase bans" verdict is a fork question, not a host wall.
  Large, GPU-evaluated, owner-gated.
- **Companion apps (Kindroid, Nomi, Character.AI) teach little new** beyond what we have: always-on directives, a small
  editable state block, memory visibility. Their one consistent user lesson: an uncorrected bad reply becomes the pattern.
  That supports trimming foreign lines **before** they enter history.

## 2. Survey

### 2.1 SillyTavern group mechanics (host facts, verified in source)

- **Generation modes** ([docs](https://docs.sillytavern.app/usage/core-concepts/groupchats/)): Swap (default, only the
  speaker's card and Character's Note), Join (all cards concatenated; docs warn of "characters being confused about
  themselves"), Join with/without muted. Our provisioning uses Swap (`src/services/stHost/provisioning.ts:136`); joined cards
  were also rejected for the cache layout by measurement (`research/llama-fork-opportunities.md:91`).
- **Names as stop strings** (`script.js:3033-3055`): text completion only; adds `\n{{user}}:` and `\n<member>:` for every
  other member. Chat Completion gets only custom stops. Off here, see §1.
- **Example messages** (`script.js:4957-4969`): unpinned examples are added one by one until the context is full; the rest
  are dropped. `pin_examples` (power-user "Always include examples") keeps them. Off here.
- **Allow Self Responses** (off by default), mute, force talk: speaker-order tools, covered by talk research.
- **Group nudge / post-history instruction:** users rewrite the nudge to "reply only from {{char}}'s point of view this
  turn" ([search summary of r/SillyTavernAI threads](https://reddit.sentinel-team.org/posts/1rkvo2i/snapshots/2026-03-05T09%3A06%3A08.118804Z);
  anecdotal). Sukino's presets: a GM template "has no concept of separate characters"; use an empty unmuted narrator card or
  Join with one unmuted card ([README](https://huggingface.co/Sukino/SillyTavern-Settings-and-Presets/raw/8aadae25d6bed50a3e51b879040e01e3544c93fd/README.md)).
- **Failure modes:** a member writes `Other: "..."` lines (caught only by name stops), or voices another member in prose
  (`"Fine," Bram said.`), which no stop string catches.

### 2.2 Card and prompt craft for distinct voices

- **"Why all your AI characters sound the same"** (r/SillyTavernAI, Feb 2026, 224 points,
  [mirror](https://reddit.sentinel-team.org/posts/1qvkkha/snapshots/2026-02-06T18%3A11%3A41.924807Z)): 3-5 sample lines
  over trait paragraphs; at most two speech quirks; per-character used/avoided words plus a global overused-word list; a
  **same-stressor test** (does each member react differently to one event); blind spots; "cover the names, can you tell who
  is speaking". Comments push back: samples get **copied verbatim**; samples make main characters into parodies; with long
  contexts recent history dominates and early examples fade; the root cause is motive, not tics. All self-reported.
- **Character's Note at depth 4** (card `extensions.depth_prompt`): the community's standard anchor against long-chat drift;
  in Swap only the speaker's note is sent (skill `writing-craft.md` §7). Our delivery line in the private block is the same
  idea, owned by the story.
- **"Edit the bad reply"**: models align on the last few replies, so cleaning history fixes speaking-for-user faster than any
  rule (same skill §6). Kindroid users say the same: an uncorrected form "becomes more ingrained"
  ([summary of r/KindroidAI](https://reddit.sentinel-team.org/posts/1regvuq/snapshots/2026-02-27T16%3A30%3A16.187539Z)).
- **Persona drift guides** ([roborhythms](https://www.roborhythms.com/?p=32860), vendor blog, low weight): write anchors as
  shared memories not rules, keep each under ~100 tokens, re-anchor after a model change.

### 2.3 Samplers: DRY, XTC

- **DRY** ([PR #5677 by p-e-w](https://github.com/oobabooga/text-generation-webui/pull/5677)): penalises extending a
  sequence that already occurred; breakers stop matches across template tokens. Author's guidance: "add first and last names
  there as separate strings"; very long repeated names "can get penalized too heavily and get corrupted"; strong loop
  pressure plus strong penalty "will often produce garbage". Defaults in the demo: 0.8 / 1.75 / 2 (= the owner's preset).
  DRY catches verbatim repeats only, not paraphrase ([techtactician guide](https://techtactician.com/sillytavern-repetition-fixes-best-settings/)).
- **XTC** removes the top tokens when several are viable; suggested threshold ~0.1-0.15, probability ~0.5. Owner preset has
  `xtc_probability: 0` (off). Memory note: an earlier preset with adaptive-P and `dry_penalty_last_n: 0` looped.
- **Our overlay** carries numeric keys only (`src/utils/samplerKeys.ts:3,19-35`); `dry_sequence_breakers` is a list and is
  not in the map.

### 2.4 Anti-slop: banned strings with backtracking

- **Antislop** (Paech et al., Oct 2025, [arXiv 2510.15061](https://arxiv.org/abs/2510.15061), MIT code): backtracks to the
  first token of a banned word/phrase/regex, lowers it, resamples. Abstract: some slop patterns are >1,000x more frequent than
  in human text; sampler handles 8,000+ patterns; token banning unusable at ~2,000; FTPO fine-tune ~90% reduction. Throughput
  cost from backtracking is reported by secondary sources only.
- **Lineage:** exllamav2 "banned strings" first, KoboldCpp phrase banning (Sukino's list is KoboldCpp-only and warns that
  other backends ban tokens, not phrases), [antislop-vllm](https://github.com/sam-paech/antislop-vllm) as an
  OpenAI-compatible proxy needing `/v1/completions` with top logprobs. No merged llama.cpp server feature found.
- **Failure modes:** whack-a-mole (a banned phrase is replaced by a sibling), throughput, streaming must hold back text until
  a match is ruled out.

### 2.5 Companion products

- **Kindroid:** backstory, key memories, example message, response directive and group context are injected every message;
  a brain icon shows which memories a reply used ([Medium 2024](https://medium.com/@adlerai/types-of-memory-within-kindroid-5659410c07ca)).
  Users keep a small `[STATE]` block in key memories as the one updatable relationship line; directive rules fix POV slips.
- **Nomi:** Identity Core (Dec 2024, marketing claim), shared notes (backstory is main) and "inclinations" applied to every
  message. Users report inclinations **override the situation** (a joker who jokes when the scene is serious)
  ([r/NomiAI wiki](https://axebps-redlib.hf.space/r/NomiAI/wiki/index/faqs/shared-notes)). Same trait over-indexing as §2.6.
- **Character.AI:** pins (15 per chat), a Story Memory + Facts + usage meter redesign (May 2026, secondary sources disagree;
  [roborhythms](https://www.roborhythms.com/character-ai-adds-chat-memories/)). Voice features: none we lack.

### 2.6 Gemma-class user reports

- **Gemma 4 31B over-literal traits** ([r/SillyTavernAI, Jun 2026](https://reddit.sentinel-team.org/posts/1u18pna/snapshots/2026-06-09T21%3A14%3A02.206628Z)):
  every lore trait worked into every chapter; recurring structure "when user did A, then quickly B"; token probabilities near
  100%. Suggested fixes: "use traits sparingly", vary prompt lines between messages, min_p/top_p matter. Self-reported.
- Gemma 4 is "sensitive to the correct presets"; disabling reasoning removed a bug for one user
  ([Apr 2026 timeline](https://reddit.sentinel-team.org/subreddits/SillyTavernAI/snapshots/2026-04-11T09%3A15%3A38.506745Z)).
  The owner wants thinking on; noted only.
- Gemma 3 launch reports: identical swipes; prompt rules against writing `{{user}}` only partly worked. No Gemma report
  found that isolates group cross-voicing; the mechanism in §2.1 is host-level, model-independent.

## 3. Mapping to us

| Community technique | What we have | Real gap |
|---|---|---|
| `\nName:` stop strings | Off by design (thinking arm, presets.json:26) | No replacement guard; foreign lines enter history |
| "Reply only as {{char}}" | Narrator only (`innerRender.ts:98`); `{{user}}` clauses (`agency.ts:23-46`) | No member-to-member clause |
| Per-character voice notes near the bottom | Delivery line in private block (v2.9 02), depth 4 (`injectionRegistry.ts:35`) | None |
| Example dialogue 3-5 lines | Card `mes_example`, Swap sends the speaker's | Push-out unobserved (`pin_examples` false) |
| Used/avoided words, tics | `prefer`/`avoid`/`tics`, per-speaker miner | Prompt-side only; no sampler-side ban |
| Same-stressor test | Blind attribution (v2.9 02 S6, harder set) | Not split by stressor; fine as is |
| Trait sparing | N21 throttles tics | Drive/notes restatement unmeasured |
| DRY with name breakers | DRY on, default breakers | Names penalised |
| Edit bad replies early | Thought-leak / empty-reply repair before the boundary (`replyEffortHost.ts:116-125`, `emptyReply.ts`) | No foreign-line repair |

Constraints that shape the proposals: prefix stability (static text, per-turn churn at or after the private block only);
thinking stays on (no fix may cut or shorten reasoning); rewrites of a rendered reply must land before the boundary or not at
all (v2.9 03 timing contract); `extra.reasoning` untouched; one build, new code lazy.

## 4. Proposals (ranked)

### P1. Foreign-speaker trim at receipt (switch `delivery.foreignTrim`)

- **Change.** At reply receipt, before the boundary (same observer as `repairThoughtLeak`, `replyEffortHost.ts:116-125`),
  scan the visible `mes` (never `extra.reasoning`) for the first line matching `^\s*(<name>)\s*:` where `<name>` is another
  roster card name, an alias, or the player's persona name, resolved by the existing name fold/cast resolver
  (`src/engine/castNames.ts`). Truncate from that line; keep the original in a per-message author record so Author view can
  show it and undo. Pure detector in `memory/` or `talk/` (lazy); host write through `stHost/chatMessages.ts` (swipe-synced).
  Skip if the trim leaves < N characters (keep the reply, journal it). Narrator (`view: omniscient`) members: trim only
  self-voiced names (the narrator may voice NPCs).
- **Cost.** Zero model calls; regex per reply.
- **Invariants.** Writes before the boundary like thought-leak repair; fingerprints see the final text. Rollback: the
  record is keyed by message and swipe id (gotcha: `extra` rides across swipes). Privacy: removes text, adds none.
- **Measure.** S0 offline first (no GPU): over recorded sessions in `so-sessions`, count replies with a foreign `Name:` line
  and the share of reply chars after it. If < 1 in 50 replies, record and stop. Then jest goldens from real hits, a no-model
  scenario posting a planted reply, payload golden showing the trimmed text in the next prompt.
- **Size** S. GPU: no for S0 and the build; one live-gate turn on a model lane.

### P2. Member self-voiced clause (switch `delivery.othersSpeak`)

- **Change.** Add one static line to every drafted non-narrator member's private block, mirroring `NARRATOR_SELF_VOICED`:
  "Speak and act only as {name}. {A}, {B} speak for themselves on their own turns; never write their words or choices." Names
  from the enabled set already computed (`memoryInjector.ts:124`). Changes only when the enabled set changes, so the per-member
  prefix stays stable.
- **Cost.** ~25-40 tokens per member prompt (estimate); no calls.
- **Invariants.** Wording only; not a guarantee. Thinking untouched.
- **Measure.** Pairs with P1's detector as a counter: foreign-line rate and a prose-voicing count (`"…," <OtherName>
  said|asked|…` within a reply, regex + Sol label on a sample) per 50 replies, control vs arm, plus blind Sol quality pairs
  (no category below -0.2). Prompt layout is quality-rated (owner decision), so it rides a rating window with P3 or v3.0 31.
- **Size** S. GPU: yes for the arm corpus (~25 turns x 2 arms, est.).

### P3. DRY name breakers (switch `sampler.dryNames`)

- **Change.** Extend the sampler overlay to one list key, `dry_sequence_breakers`, appended (never replaced) with the roster
  card names' words, aliases and `{{user}}`, on loud requests in the story chat where the request already carries the key
  (overlay rule: only keys the request carries). Today the overlay map is numeric (`samplerKeys.ts:3`); a list key needs a
  small typed exception. Zero-code alternative for the owner: add `"{{char}}", "{{user}}"` to the preset's breakers (ST
  resolves macros per request, `textgen-settings.js:1552-1567`); it misses other members' names.
- **Cost.** None at run time; DRY work grows marginally with breaker count (estimate, unmeasured on b11888).
- **Invariants.** Request-scoped, never an install write. Check multi-token breaker handling in our llama.cpp build before
  building (not verified here).
- **Measure.** S0 offline: count near-miss spellings (edit distance 1-2) of roster names in recorded replies; if 0 in a
  large sample, stop. Else one lane run, arm vs control, same metric plus repetition miner hits (DRY must still bite).
- **Size** S. GPU: only if S0 finds misspellings.

### P4. Example-message survival check (check `voice-examples-pushed-out`, info)

- **Change.** A pure check over the payload/next-turn preview (`runtime/nextTurn.ts` composes ST's blocks) that reports
  when the drafted member's card has `mes_example` and the last loud prompt held none of it. Repair row (author audience)
  suggests "Always include examples" (install-wide, owner's click) or moving 3-5 lines into the delivery sheet. Never writes
  ST settings.
- **Cost.** Zero calls.
- **Measure.** Firing fixture in `checksRegistry.test.ts`; a payload golden at a long-chat seed showing the drop.
- **Size** S. GPU: no. Value depends on how many story cards carry examples; quick inventory first.

### P5. Trait-echo meter, then sparing (measurement first; switch `delivery.sparing` only if warranted)

- **Change.** Offline scorer: per member, rate of replies that restate content words of their own `drive`, `motive`, beat,
  `polish.notes`/`prefer` (stemmed, stop-worded, ≥ 2 content-word overlap, or a direct trait adjective). Author readout next
  to the per-speaker miner. If the rate is high (predeclare: > 30% of a member's replies), arm A adds "let these show in
  choices; name them rarely" to `renderOwnAims` (`innerRender.ts:86-93`); arm B rotates `prefer` items with a seed over
  (chat, member, boundary), which churns only the already per-turn private block.
- **Cost.** Scorer: none. Arms: none at run time.
- **Invariants.** Seeded, no `Math.random`; owner wants inner voice on, and both arms keep it.
- **Measure.** so-sessions corpus for the meter (no GPU); arms via blind Sol pairs + meter delta + attribution must not drop.
- **Size** S (meter), M (arms). GPU: arms only.

### P6. Backtracking phrase ban in the patched llama.cpp (fork research, owner-gated)

- **Change.** A server-side banned-strings sampler (exllamav2/Antislop style) in our llama.cpp patch: per-request list from
  the drafted member's `avoid` + `tics` (only when the miner shows them over-used) + an owner-curated global list; backtrack
  on a match in the **visible** channel only (after the reasoning end tag), holding streamed text until a prefix match
  clears. Triage N19/challenge 6 rejected token bans; this is not a token ban.
- **Cost.** No extra calls; decode throughput loss from backtracking (unmeasured; must be bounded, cf. 42 → 20 tok/s
  regressions rejected before). Interacts with MTP drafting and the member cache.
- **Measure.** Controller regression list (`research/feature-impact-controller.md`), tok/s floor, ban-hit rate, sibling-phrase
  substitution rate (whack-a-mole), blind Sol pairs.
- **Size** L. GPU: yes.

## 5. What we do that the field does not, and rejected ideas

**Ahead of the field:**
- Voice is story-owned and per-turn: drive, checkpoint motive, inner beat and a bounded delivery sheet reach only the drafted
  member's private block, while the community hand-edits Character's Notes per card.
- Repair before history: thought-leak and empty-reply repair already apply the community's "fix the reply before it teaches
  the model" rule in code; P1 extends it.
- Measured voice: blind attribution and per-speaker repetition with predeclared floors. No community tool measures voice.
- Narrator outward clause and swipe contrast (v3.0 31) have no product equivalent.

**Rejected:**
- **Join cards / one combined card / GM template.** Docs warn of merged personalities; rejected for the cache by measurement.
- **One model instance per character** (community's "nuclear" fix). We already isolate per-member prompts in Swap with a
  per-member cache; separate models do not fit one 3090.
- **Turning names-as-stop-strings back on.** Cuts the reasoning at the first cast name (presets.json:15). Would need
  reasoning-aware stops in the server; P1 gets the same effect after the fact.
- **Re-injecting card example lines into the private block.** Users report verbatim copying; P4 diagnoses first.
- **Token-level `logit_bias` bans of avoid lists.** Already rejected (Castward fact, triage challenge 6).
- **XTC on by default.** Changes the owner's rated preset; a sampler A/B is a preset decision for the owner, not a story
  switch.
- **Companion-style "inclinations" (always-on behaviour rules).** Users report them overriding the scene; that is the trait
  over-indexing P5 measures.

Numbers: DRY parameters, `pin_examples`, `names_as_stop_strings` and preset values are **verified** in files on this machine.
Antislop figures are **self-reported** by the paper's abstract. Community claims are **self-reported** anecdotes. Token
costs and throughput are **estimates**. No proposal here was measured.
