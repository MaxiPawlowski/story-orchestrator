# Lore selection research: community practice and products

Angle `lore-community` (B), 2026-10-31. Research only. No code, branches, gates, lanes, browser or GPU were used.
The question was how lorebook systems outside our code decide which entries reach the prompt, when and where, what
their authors report goes wrong, and what we could take as separately switchable additions.

**Already harvested, not repeated here.** ST extension reviews exist for ST Lorebook Ordering (STLO), WREC, TunnelVision,
WorldInfo Workspace (the `WORLDINFO_FORCE_ACTIVATE` picking we already use), NemoPresetExt and Simply-LoreAndTracker
(`docs/plans/v2.4/extension-research/`, `docs/plans/v2.8/extension-research-2026-10-*/`,
`docs/plans/v3.0/extension-research-2026-10-30/`). The skill `.claude/skills/st-lorebook-authoring` and
`docs/guide/author/lorebook-mechanics.md` already document ST's scan line by line (gate order, budget, outlets,
decorators, timed effects). AI Dungeon memory and Auto-Cards are covered for memory in `memory-rp-community.md`. This
report covers what those passes did not reach:
- NovelAI's lorebook (reservation, staged trimming, phrase bias, ephemeral context);
- AI Dungeon Story Cards as a *selection* mechanism;
- RisuAI decorators;
- Agnai's memory book selection code;
- Kobold Lite World Info and TextDB (read from source in the local corpus);
- DeepLore, an Obsidian-backed two-stage keyword-plus-AI selector that nobody had harvested;
- the community failure reports;
- two host facts in ST that our code does not handle yet.
Labels used: **[measured]** (we ran or read a number from our records), **[source]** (read from code), **[doc]**
(vendor documentation), **[self-reported]** (a user or author claim), **[estimate]** (mine).

## 1. Summary

- **The field has split selection into two stages, and we already do the expensive stage well.** DeepLore (keyword or
  BM25 first, then an AI pick from the survivors), AI Dungeon (trigger words, then recency) and Kobold TextDB (BM25 over
  chunks) all filter cheaply before anything costly runs. Our lore select sends *every* candidate in the story's
  `lore_select` books to the judge (`src/runtime/loreSelect.ts:141`). There is no cheap lexical stage before it, and no
  lexical fallback when the judge is cooling or down. Proposal P3 adds one.
- **Two of ST's rolls are unseeded, and story lore inherits them.** An entry's `probability` uses `Math.random()`
  (`world-info.js:5041`), and so does the weighted inclusion-group pick (`:5453`). A story book that uses either feature
  gives a swipe or a replay a different prompt. That breaks the spirit of our "chance is seeded" rule, even though no
  engine state depends on it. Probability can be resolved with a seed on the scan copy without changing what it means
  (P1).
- **Budget starvation is the most-reported lorebook failure, and ST tells nobody.** ST fills the budget greedily. Once
  it overflows, every later non-`ignoreBudget` entry is dropped (`world-info.js:5021-5025`). The toast is off by default
  (`world_info_overflow_alert = false`, `:76`). ST does publish what was cut: `WORLDINFO_SCAN_DONE` carries `new.all`,
  `new.successful` and `budget.overflowed` (`:5150-5175`). We never subscribe to it (no runtime file references it). A
  story's own forced picks, pins or gated entries can be silently starved by an unrelated global book. P2 records it,
  and optionally reserves room for those entries the way NovelAI's "reserved tokens" do.
- **Picks flicker and get re-asked.** AI Dungeon keeps a card active for several turns after its trigger. DeepLore
  reuses the last AI pick unless the new messages name a known entity. Our selection is keyed per message
  (`loreSelect.ts:110`), so an entity that drops out of the short window loses its lore at once, and every turn pays the
  judge again. Novelty-gated reuse plus a lexical carry window (P4) addresses both.
- **Products put a header on each entry; ST sends the text bare.** NovelAI has a per-category "Lorebook Entry Header".
  AI Dungeon prefixes "World Lore:" and tells authors to name the subject inside the entry. A 2026-06 ST extension is
  titled "Stop Sending Anonymous Lorebook Entries" (thread title only; its content was not read). An entry such as
  "She keeps a knife in her boot" is useless when the model cannot tell who "she" is. P5 adds a header on the scan copy
  for entries whose content never names their subject, plus an authoring diagnostic.
- **Authors debug lore with "why did it fire" and "why didn't it" views.** DeepLore's Context Cartographer and
  `/dle-inspect`, AI Dungeon's Context Viewer and NovelAI's "No space" reason all do this. We record what fired
  (`runtime/loreFired.ts`, ring of 100) but not what was cut or what never fires. P2 and P6 close that gap.
- **What not to copy:** key-relative insertion (NovelAI), per-entry phrase bias, re-injection cooldowns and duplicate
  stripping. Each one fights either our prefix cache or story consistency (§5).

## 2. Survey

### 2.1 NovelAI lorebook

- **Mechanism [doc]** ([Lorebook](https://docs.novelai.net/en/text/lorebook/),
  [community context guide](https://tapwavezodiac.github.io/novelaiUKB/Context.html)):
  - *Keys.* Plain keys are case-insensitive. `/regex/` keys are case-sensitive and take flags. `&` requires all listed
    terms. The search range is set in characters (at most 10,000).
  - *Insertion order.* Entries are sorted by insertion order. Higher values reserve tokens **and** insert first.
  - *Reserved tokens.* Each entry can reserve up to N tokens (a value below 1 means a fraction of the context). All
    reservations are made before any entry is placed. This is a guaranteed slot.
  - *Token budget.* A per-entry token cap.
  - *Staged trimming.* An entry that does not fit is trimmed to a newline, then to a sentence, then to tokens. A step
    is skipped if it would keep less than 30% of the entry. "Do not trim" means the entry goes in whole or not at all.
  - *Insertion position.* Measured from the top or bottom of the context. Key-relative insertion places the entry next
    to where its key appeared.
  - *Cascading activation.* Entries can scan other entries' text, without the range limit.
  - *Categories and subcontexts.* A category can be built into one block with its own placement. Newer models get a
    per-category "Lorebook Entry Header".
  - *Phrase bias.* Each entry can bias generation toward or away from phrases while it is active. Options include
    "when entry inactive", "ensure completion after start" and "unbias when generated".
  - *Advanced conditions.* Newer models only: keyword, other-entry-active, random chance, numeric and string
    comparisons, AND/OR/NOT.
  - *Ephemeral context.* `{start+delay r~duration,position:text}` inserts text on a step schedule, with repeat and
    inversion.
- **Evidence.** None quantitative. The vendor's position is that reservation plus trimming keeps important lore from
  being crowded out.
- **Failure modes [doc].** Bloated entries get trimmed or omitted (shown in the Context Viewer). Ephemeral entries
  overlap when the delay is shorter than the duration. Bracketed text leaks into output.

### 2.2 AI Dungeon Story Cards

- **Mechanism [doc]** ([Story Cards help](https://help.aidungeon.com/faq/story-cards)):
  - Triggers are case-insensitive substrings, and spaces count. A card is used once its trigger appears in the player's
    input or the AI's output.
  - A card triggered mid-output takes effect only from the next output.
  - Cards "stay active for a variable number of turns, depending on context size". Latitude's older context doc says
    inclusion depends on how recently and how often the triggers were used
    ([search summary of the Notion page](https://latitudegames.notion.site/What-goes-into-the-Context-sent-to-the-AI-7e5881352de6427da9c92b04149e8e50);
    the page did not render for us).
  - Each entry is shown to the model prefixed "World Lore:". Cards are among the first content cut when the context
    fills.
- **Author advice [doc].**
  - Name the subject inside the entry, because the model never sees the card name.
  - Put key facts at the start and end, and keep entries short. Long entries are "only partly used".
  - Avoid short triggers that appear inside common words.
  - Use truncated stems for plurals.
- **Failure modes [doc, self-reported].** Help calls triggers firing at the wrong time "very common" and points to the
  Context Viewer. A [community thread (2025-02)](https://reddit.birdcat.cafe/r/AIDungeon/comments/1iym68s/designing_triggers_to_work_organically_and)
  warns that generic trigger words flood memory.

### 2.3 RisuAI lorebook

- **Mechanism [doc]** ([Lorebook docs](https://kwaroran.github.io/docs/characterconfig/lorebook)):
  - Keys, an insertion order, a global token cap (lower-order entries are dropped first), recursive scanning, whole-word
    matching and a search depth.
  - Behaviour is set with `@@` decorators in the prompt text:
    - placement: `@@depth N`, `@@reverse_depth N`, `@@role`, `@@position pt_<name>` (a slot the prompt template
      declares);
    - scanning: `@@scan_depth`;
    - timing: `@@activate_only_after N`, `@@activate_only_every N`;
    - budget: `@@ignore_on_max_context` (dropped first when the context is full);
    - keys: `@@additional_keys`, `@@exclude_keys`;
    - other: `@@probability N`, `@@activate`, `@@dont_activate`.
- **Mapping.** Most of these have ST equivalents: depth/role, outlets (= `pt_<name>`), per-entry scan depth, delay and
  cooldown, AND/NOT logic, probability, decorators. `@@ignore_on_max_context` is a "drop me first" priority. ST
  expresses that only through `order`. Nothing here is new to us.

### 2.4 Agnai memory books

- **Mechanism [source]** (`common/memory.ts`, [agnai repo](https://github.com/agnaistic/agnai)):
  - Keywords become whole-word, case-insensitive regexes. `*` and `?` are wildcards.
  - Each entry's `messageAge` is the distance to the newest message containing any of its keywords.
  - **Priority decides survival:** entries are sorted by priority, then recency, and kept until the next one would
    reach the budget (default 500 tokens). The loop `break`s, so one large entry blocks every smaller one after it.
  - **Weight decides placement:** survivors are re-sorted by weight, then recency, and the heaviest goes last (closest
    to generation).
- **Lesson.** Survival and placement are separate axes, with recency as the tie-break for both. ST folds both into one
  `order`. A big entry that blocks smaller ones is the same greedy hole ST has.

### 2.5 Kobold Lite World Info and TextDB

- **World Info [source]** (local `koboldcpp/embd_res/klite.embd`):
  - Entries have keys, selective secondary keys, `constant`, `probability` (`Math.random`, `:21665`) and `wigroup` (a
    UI folder with group toggling, not an inclusion group, `:28485-28505`).
  - The total WI text is capped at 50% of the allowed context characters (`max_wi_len`, `:21544`).
- **TextDB [source]** (`DatabaseMinisearch`, `:30632`):
  - BM25-style lexical search (minisearch) over chunks of pasted documents, and optionally over **chat history that has
    already scrolled out of context** (`documentdb_searchhistory`, `:21730`).
  - Two weighted queries: the newest input at strength 2 and the recent text at strength 1. Scores are normalised and
    summed per chunk.
  - Text still inside the active context is removed from the corpus before searching (`replaceAll(allText,
    recentTextStr, "")`), so it never retrieves what the model can already see.
  - Up to N results are inserted before the WI block. An import dialog offers "Import World Info / Lorebook into
    TextDB?", so a whole lorebook can be turned into a keyless retrieval corpus.
- **Failure modes [self-reported].** World Info is hard to manage on its own
  ([discussion #515](https://github.com/LostRuins/koboldcpp/discussions/515)).

### 2.6 DeepLore (ST extension, Obsidian vault, formerly DeepLore Enhanced)

- **Mechanism [doc]** ([wiki](https://github.com/pixelnull/sillytavern-DeepLore/wiki),
  [AI Search](https://github.com/pixelnull/sillytavern-DeepLore/wiki/AI-Search),
  [Pipeline](https://github.com/pixelnull/sillytavern-DeepLore/wiki/Pipeline)):
  - *Modes.* Two-stage by default: keyword matching narrows the vault, then one AI call picks entries. AI-only and
    keywords-only modes also exist.
  - *Keyword stage.* Scan depth 4, recursion 3, BM25 fuzzy matching (minimum score 0.5, top 20), an "active character
    boost", per-entry `warmup: N` (the key must appear N times), `cooldown`, `probability` and cascade links.
  - *AI manifest.* One `<entry>` block per candidate: name, token cost, wikilink relations, and a `summary` field (or
    the content cut to 600 characters).
  - *Confidence.* The AI returns high, medium or low with a reason. DeepLore over-requests twice the entry limit and
    fills the budget by tier.
  - *Cache.* One slot. It is reused on an exact hash match, on swipe or regenerate, **and when only the chat changed but
    the new messages mention no vault entity name or key**.
  - *Large vaults.* Above 40 entries and 4 categories, a hierarchical pre-filter picks categories first.
  - *Failure handling.* A circuit breaker opens after 2 failures for 30 s. An AI error falls back to the keyword
    results.
  - *Overrides and gating.* Per-chat pin and block. Contextual gating fields (era, location, scene type, characters
    present). An optional re-injection cooldown and duplicate stripping keyed `title|position|depth|role|contentHash`.
  - *Diagnostics.* `/dle-inspect` "why not" traces (gated, cooldown, dedup, probability, warmup, budget). A warning when
    lore exceeds 20% of the context. Seed and bootstrap entries for chats under 3 messages.
- **Evidence [doc].** Cloud AI search takes 5-15 s (their figure, with a 20 s timeout), roughly one extra call per
  turn. No quality numbers.
- **Failure modes.** Running it alongside its deprecated standalone predecessor "corrupts prompt injection". The AI
  stage is slow on local models (they suggest a 60-120 s timeout).

### 2.7 What ST lorebook authors report goes wrong (2025-2026)

From Reddit (mirror snapshots), guides and the ST docs, all [self-reported]:
- **Budget starvation.** "No more entries are activated even if the keys are present" once the budget fills
  ([ST docs](https://docs.sillytavern.app/usage/worldinfo)). The usual first step is to turn on the overflow alert,
  which ships off ([roborhythms guide](https://www.roborhythms.com/sillytavern-lorebooks/), which also reports a 2-message
  scan depth and a 25% budget on some installs).
- **"Delay until recursion" ticked by accident.** The entry never fires on the first pass
  ([snapshot](https://reddit.sentinel-team.org/posts/1rcub8q/snapshots/2026-02-27T16%3A12%3A57.42274Z)).
- **Per-entry "use global" overrides.** Whole-word matching did not apply until the entry was set to "yes" explicitly.
- **Over-triggering.** Usually unbounded recursion ("if you've allowed infinite recursion, everything will load").
  Advice is max recursion 1 or tighter keys.
- **Alias misses.** Plurals, nicknames and inflections that no key covers. Hence AI Dungeon's stems, DeepLore's BM25
  fuzzy stage and the community's natural-language keys.
- **Inconsistent triggering with no explanation,** "fixed" by rebuilding the book. This reflects the missing "why not"
  view.

### 2.8 Two ST host facts our code does not handle

- `WORLDINFO_SCAN_DONE` (`world-info.js:5175`) is emitted once per scan loop with `new.all` (candidates after
  inclusion groups), `new.successful`, `activated.entries`, `budget.{current, overflowed}` and `timedEffects`. When
  `budget.overflowed` is true, the difference between `all` and `successful` is exactly what the budget cut. This
  assumes no probability failures; those are tracked separately in `failedProbabilityChecks`, so the difference has to
  be read carefully. No `src/runtime/*` file subscribes to it.
- `probability` (`:5041`) and inclusion-group weights (`:5453`) roll `Math.random()`. A sticky entry never re-rolls
  (`:5034`). The gate checks `disable` (`:4801`) before sticky (`:4899`), so disabling an entry on the scan copy also
  cuts an active sticky.

## 3. Mapping to us

| Field mechanism | What we have (paths) | Real gap |
|---|---|---|
| Keyword triggers, recursion, groups, timed effects | ST's own scan, read through `worldInfoEvidence.ts`, `loreFired.ts` | none (host owns it) |
| Phase or path gating | `scanGatePlan.ts` scan-copy view replaying the checkpoint path; normaliser + ledger | none; stronger than DeepLore's contextual gating |
| Per-chat scoping of books | `storyLore.ts` appends the story's books only to chats that play it; foreign-stamped entries dropped | none |
| AI selection stage | `loreSelect.ts`: judge Noul per candidate (`judge/lore.ts:33` criteria), `top_k` 4 / `min_p` 0.6 (`judge/policy.ts:67-68`), 1500 ms timeout (`:73`), one force write | no cheap stage before it; no lexical fallback; per-message key |
| Exclusive narrowing | `loreExclusive.ts` (narrow-only, refuses unless every signal agrees, spares constant/gated/timed) | none |
| Placement for cache | `lorePlacement.ts` moves story-book position 0/1 to depth 4 (`:58`) | headers not added; outlets untouched (fine) |
| Pins (here, met) | `lorePins.ts` (codex-latched, held-secret refusal) | none |
| Budget reservation | none: forced/pinned picks compete in ST's greedy budget | **P2** |
| "Why not" diagnostics | `loreFired.ts` records what fired, with `via` | cut-by-budget and never-fires not recorded (**P2**, **P6**) |
| Seeded chance | NPC replies, talk, rolls are seeded | ST `probability` in story books is not (**P1**) |
| Entry headers | none | **P5** |
| Carry-over across turns | ST `sticky` for keyword entries; forced picks get none | **P4** |

Constraints this must respect:
- the prefix cache: per-turn lore lands late, at depth 4, so anything above that boundary must stay byte-stable;
- the main bundle budget, so new code goes in lazy chunks;
- rollback ≡ replay;
- the held-secret filter;
- the narrow-only rule for exclusive selection.

Everything below is a scan-copy view or a read-only observer, the same shape as `scanGatePlan` and `lorePlacement`. None
of it writes a lorebook file.

## 4. Proposals (ranked)

### P1. Seeded resolution of story-book `probability` (switch `worldInfo.seededChance`, on by default once green)

- **Change.** In the scan-copy pass that `lorePlacement` already runs, take each entry of the playing story's books with
  `useProbability` and `probability < 100` and roll it with the existing seeded chance helper (`runtime/chance.ts`),
  keyed `chat, story, boundary, book, uid`.
  - Pass: set `useProbability = false` on the copy.
  - Fail: set `disable = true` on the copy.
  - Skip entries with `sticky > 0`, because the gate checks `disable` before sticky (§2.8).
  - Leave entries outside the story's books alone.
  - Inclusion-group weights cannot be pre-resolved before matching. Report them as an author `info` diagnostic
    ("weighted group picks are random per generation; swipes differ") instead of rewriting them.
- **Open choice.** Whether a swipe re-rolls. Seeding by boundary gives a swipe the same draw (consistent with "rollback ≡
  replay"). Adding the swipe id restores per-swipe variety.
- **Cost.** No model calls. Microseconds per scan.
- **Invariant risk.** Low. The semantics are the same in expectation, because ST's roll is independent of key matching.
  Must not touch gated entries (`scanGatePlan` owns them), so apply it after the gate view.
- **Measure.**
  - Unit tests: a pure function, same seed gives same output.
  - A no-model `so-scenario` with one 50% entry: dry-run payload captured 10 times on the same boundary gives identical
    `story_*` and WI blocks, and across 40 boundaries the fire rate is within binomial bounds.
  - `so-payload-golden` stays byte-stable.
- **Size.** S. **GPU.** No.

### P2. Lore budget evidence and a reserved slot for story picks (two switches)

- **P2a `lore.budgetEvidence` (observer, on).**
  - Subscribe read-only to `WORLDINFO_SCAN_DONE` through a new `stHost/` event mapping.
  - On each loud scan, record the entries in `new.all` but not in `new.successful` while `budget.overflowed`, after
    excluding `failedProbabilityChecks`. Record `{book, uid, comment, via: forced|pinned|gated|key}` into the
    evidence ring next to `loreFired`.
  - Add a check `lore-budget-starved` (`area: lore`, author, `degrades`) when a story-book entry that we forced, pinned
    or gated *on* was cut in at least 2 of the last 10 loud generations. It names the book that consumed the budget.
  - Author console Prompt tab gains a "cut by budget" row (DeepLore "why not", NovelAI "No space").
- **P2b `lore.reserve` (scan-copy, on once measured).**
  - On the scan copy, set `ignoreBudget = true` on the story's forced picks and pins only, capped at `reserveTokens`
    (default 600 [estimate], about 4 entries at 600 characters).
  - Entries over the cap keep competing normally.
  - This is NovelAI's reserved-tokens idea expressed through ST's own `ignoreBudget`. ST already continues past an
    overflow for `ignoreBudget` entries (`world-info.js:5021-5024`).
- **Cost.** No model calls. P2b adds up to the cap in prompt tokens, but only when the budget is already full.
- **Invariant risk.** P2a: none (read-only). P2b changes which lore lands, so it is output-changing and needs a blind
  rating. It must never apply to entries that `loreExclusive` suppressed or the gate turned off.
- **Measure.**
  - P2a: a no-model scenario with a deliberately tiny WI budget and a large global book; assert the check fires and
    names the book.
  - P2b: the same scenario; assert forced picks land; payload prefix unchanged above depth 4.
  - Blind Sol rating on a lab session pair.
- **Size.** S (P2a), S/M (P2b). **GPU.** No for P2a; P2b's rating uses recorded sessions.

### P3. Lexical recall arm: BM25 over lore candidates (switch `loreSelect.lexical`)

- **Change.** A pure, lazy scorer `judge/loreLexical.ts`, written in-house with no dependency:
  - BM25 over each candidate's comment, keys and content.
  - Queries in Kobold's two-strength shape: the newest player line at weight 2, the judge window at weight 1.
  - Expanded with the roster's card names and `aliases` (`castNames.ts`), plus simple stemming of plural and
    possessive endings, which covers the reported alias misses.
- **Uses, each behind its own sub-switch.**
  - (a) *Fallback.* When the judge is cooling, timed out or absent, force the top `top_k` lexical picks above a score
    floor instead of leaving only ST's keyword scan. Same force path, same `left`/eligibility filters.
  - (b) *Pre-filter (two-stage, as DeepLore does).* Ask the judge only about the top M lexical candidates, plus every
    entry whose keys match the window. Fewer Nouls means fewer judge requests. The v2.8 C12 note recorded about 5
    lore-select judge requests per turn before batching [self-reported in `docs/plans/v2.8/01-v27-carry-over.md`].
- **Cost.** No model calls. Below 5 ms for under 200 entries in the browser [estimate]. (b) cuts judge questions by
  (N − M)/N.
- **Invariant risk.** Low. It is deterministic over transcript text, and selection stays force-only (no write).
  Exclusive mode must treat a lexical fallback selection as `complete` only when it covered every candidate. Otherwise
  it must refuse (`no-selection`), keeping exclusive narrow-only.
- **Measure (offline, decides adoption).** Replay `test/fixtures/judge/lore-relevance.json` (17 labelled rows) through
  the lexical arm with the `judge/loreRanking.ts` metrics:
  - (a) floor: `precisionAt4` ≥ 0.6 and recall of `needed` ≥ 0.8 [predeclare before running];
  - (b) floor: recall of judge-picked entries within the top M ≥ 0.95 at M = 12, so the pre-filter loses almost
    nothing against the current judge arm (nDCG@4 0.927 [measured, v2.3 seeds]).
  - Then `so-live-suite` lore fixtures unchanged with (b) on.
- **Size.** M. **GPU.** No.

### P4. Novelty-gated reuse and a carry window for picks (switch `loreSelect.carry`)

- **Change.**
  - (1) *Reuse.* If the messages since the last complete selection mention none of the candidates' comments, keys or
    member aliases, and the checkpoint and location are unchanged, reuse that selection instead of asking again.
    This is DeepLore's cache rule. It needs a second, lexical key beside the per-message key at `loreSelect.ts:110`.
  - (2) *Carry.* A picked entry stays forced for up to K = 3 more player turns while its name or key still appears in
    a longer lexical window (default 12 messages), unless a scene break or location change intervenes. This is AI
    Dungeon's "active for several turns", made deterministic and computed from the transcript, so no new persisted
    state. Rollback just recomputes.
- **Cost.** Fewer judge calls. Estimate 30-50% of turns reuse in conversation-heavy scenes [estimate, to measure]. Up to
  K extra entries per turn (bounded by `top_k` plus carry cap 2).
- **Invariant risk.** It changes which lore lands, so it is output-changing and needs a rating. It must respect member
  eligibility per drafted member: carry is re-filtered through `eligibleLoreMember` each generation. Held secrets are
  unaffected, because candidates already exclude gated and secret entries.
- **Measure.**
  - Count judge `lore` requests per player turn on a journey (GS2.6), before and after.
  - `so-payload-golden prefix` (late block churn should drop).
  - Blind Sol rating of 20 paired replies for continuity ("does the reply keep details of an entity mentioned 3-6
    messages ago").
- **Size.** S/M. **GPU.** Rating replays only; the request count needs the TypeSafe judge, not the GPU.

### P5. Entry headers on the scan copy, plus an "anonymous entry" diagnostic (switch `lore.headers`)

- **Change.**
  - (1) *Diagnostic.* A validator/Studio diagnostic `lore-entry-anonymous` (info) on story-book entries whose content
    contains neither the entry's comment nor any primary key nor a roster name. This is AI Dungeon's "name the subject
    in the entry".
  - (2) *Header.* In the `lorePlacement` pass, prepend `[<comment>]\n` to those same entries on the scan copy only, so
    the late block reads as labelled facts. This is NovelAI's entry header.
- **Cost.** About 5-10 tokens per labelled entry [estimate]. No model calls.
- **Invariant risk.** The comment becomes model-visible: a new surface. Only label when the comment passes the resting
  filter (`withoutSecretLines`) and is not a curator `{{// so:...}}` marker. Gated entries are already off. The diagnostic
  alone is risk-free and can ship first. Output-changing, so it needs a rating.
- **Measure.** Count anonymous entries across library stories (no content printed). Blind Sol rating on replies where
  such an entry fired.
- **Size.** S. **GPU.** No.

### P6. Lore firing analytics: over-trigger, never-fires, lore share (switch `lore.analytics`, author-only)

- **Change.** Pure read over the `loreFired` ring (100) plus P2a, three author checks (`info`):
  - `lore-fires-always`: an entry fired by key in at least 80% of the last 20 loud generations. Suggest `constant` or
    tighter keys.
  - `lore-alias-miss`: a story-book entry never fired while its comment or a roster alias appeared in at least 3 player
    or reply messages. This is the reported "doesn't fire" case.
  - `lore-share`: activated WI text above 20% of the served context (DeepLore's warning threshold).
- **Cost.** None at runtime beyond reading the ring.
- **Invariant risk.** None (author-only, read-only).
- **Measure.** Firing fixtures per check (`checksRegistry.test.ts` requires one). A no-model scenario with a
  deliberately over-keyed entry.
- **Size.** S. **GPU.** No.

## 5. What we do that the field doesn't, and rejected ideas

**Ours, not seen elsewhere:**
- Lore gated by the replayed checkpoint path, on per-scan copies with files left resting. Rollback is free and nothing
  is written.
- Story books scoped per chat, with foreign-stamped curator entries hidden from other chats.
- A calibrated relevance judge with predeclared floors and frozen goldens. We refuted our own Score arm with them
  (v2.3 seeds). No product publishes selection quality numbers.
- Exclusive mode that only narrows, with a refusal list.
- Lore moved late for prefix caching.
- Per-member eligibility mirrored from ST's `characterFilter`.
- Pins refused on held secrets.

DeepLore's contextual gating and pin/block are the closest analogues, and they are hand-set per chat, not derived.

**Rejected:**
- *Key-relative insertion (NovelAI).* Puts lore at the key's position in history, so it moves every turn and breaks
  the prefix cache and `lorePlacement`.
- *Per-entry phrase bias (NovelAI).* It is tokenizer-specific and interacts with thinking tokens. It would compete with
  the owner-tuned preset overlay. Name drift is better fixed by P5 headers.
- *Re-injection cooldown and duplicate stripping (DeepLore).* Dropping lore the model saw a few turns ago trades
  consistency for tokens. Late placement already handles the cache side.
- *Warmup counts (DeepLore).* A narrow over-trigger fix. P6 plus tighter keys covers it without a new authored field ST
  cannot read.
- *Hierarchical category pre-filter (DeepLore).* Only pays above about 40 candidates. Judge chunking already packs 64
  questions a request (`judge/policy.ts` `LORE_CHUNK`). P3(b) is the cheaper pre-filter.
- *AI-only full-vault mode, and one generative AI call per turn for lore (DeepLore).* 5-15 s on cloud models by their
  own figures. Our judge Nouls fit the 1500 ms reply path.
- *Ephemeral context (NovelAI) and `@@activate_only_every` (Risu).* Covered by checkpoint gating, the story clock and
  ST cooldown.
- *TextDB over scrolled-out history (Kobold).* That is memory recall, which `memory-rp-community.md` and the memory
  shortlist own.
- *Agnai's priority/weight split as a new authored field.* Worth knowing. P2b gives the survival half without new
  schema, and placement is already decided by `lorePlacement`.
