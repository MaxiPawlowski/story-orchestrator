# v3.0 42 — Core mechanics: fixes, yardsticks, upgrades

Source: `research/mechanics-shortlist-2026-10-31.md` and its eight reports. Owner 2026-10-31: "as recommended, start
with the CPU ones first". Same rules as 41: each upgrade its own switch, on by default, offline before→after number
with a floor stated first, one GPU A/B row per item in `gpu-queue-2026-10-30.md`. At most two code agents at once, so
42 starts when 41 A and B have merged.

## Owner decisions (2026-10-31, as recommended)
1. Lore vs discovery: no hard filter (characters may know lore the player has not met); a soft "prefer known
   entities" bias as its own switch (lore-research:P2).
2. Clocks on check misses: not built (overlaps agendas).
3. In-character thinking clause: GPU wave only, built with its rating; thinking stays on.
4. Phrase bans in the patched llama.cpp: not now (L).
5. `worldInfo.lexicalPrefilter` ships off (owner, later 2026-10-31): shortlist recall 0.517 vs floor 0.95, calibration recall
   26/30 -> 22/30 (Gate record G); fallback and tiebreak stay on.

## Wave 42a — CPU, two agents
Agent F (fixes + progression/director):
- Seeded ST `probability` on story-book scan copies via `runtime/chance.ts` (lore-community:P1).
- Director critic fails closed on an unreadable verdict (`generation/living/direct.ts:13,138`).
- Transition timing scorer over labelled transcripts (progression-research:P1).
- Railroad readout, author-only (director-products:P2).
- Reachable-path expected tension + relax window after a peak (progression-research:P3, progression-products:P2).
- Anti-rush warnings + optional `min_turns` (progression-products:P3).
Agent G (voice/lore):
- Cross-voice detector, offline count on archived sessions, then reply-time trim switch (voice-community:P1, voice-research:P3).
- Voice drift scorer, code part (voice-research:P1).
- Roster names as DRY sequence breakers per request (voice-community:P3).
- Lore budget evidence from `WORLDINFO_SCAN_DONE` + `lore-budget-starved` check (lore-community:P2a).
- BM25 lexical arm: judge fallback / prefilter / tiebreak, offline on lore-relevance fixtures (lore-research:P1, lore-community:P3).
- Hold lore selection across a round (lore-research:P3, lore-community:P4).
- Prefer-known-entities bias (decision 1).

## Wave 42b — CPU, after 42a numbers
Stuck ladder with authored leads + `one-clue-exit` warning; judge-question director critic; 2-3 leads per turning
point; story-state lore query + alias pass; example-dialogue drop warning.

## GPU wave (owner "resume")
Rating rows: others-speak clause, persona re-anchor, typed redirect, multi-draft pick, chapter spine, reserved lore
slot, in-character thinking clause, plus each 41/42 switch A/B.

## Agent F items and floors (declared before measuring, 2026-10-31)

Branch `v3.0-42a-f`. No GPU, no lanes, no ST (brief). Floors are informational unless marked hard; a miss is recorded,
never retuned.

- F1 seeded lore chance (defect, `worldInfo.seededChance`, on): story-book entries with `useProbability` and
  `probability < 100` resolved on the scan copy by `runtime/chance.ts` keyed chat, story, boundary, book, uid (pass:
  `useProbability` off, fail: `disable`); sticky entries skipped (ST checks `disable` before sticky, world-info.js:4801/4899,
  roll :5041). Scan mode only. Inclusion groups with 2+ members and no priority entry (weighted roll :5453) = author info
  check `lore-weighted-groups`. Floors (hard): same boundary = identical scan copies; 50% entry over 400 boundaries fires in
  (170, 230).
- F2 critic fail-closed (defect): unreadable verdict is re-read once, then the issue
  "the critic's verdict could not be read" goes through the ordinary retry/refusal (stage `critic`). Floor (hard): the
  regression test.
- F3 transition timing scorer (yardstick, no switch): `pacing/timing.ts` + labelled corpus `test/fixtures/timing/`
  (synthetic public fixtures; recorded reads written as reader answers; gold first message per exit, or never), replayed
  through the real `StoryEngine` with the one-boundary read lag. Floors (progression-research P1): spurious <= 1/40 exits,
  early <= 2/40, median late <= 1 player turn, missed <= 2/40; counts per deciding source (shared read, typed judge, stall
  judge, mechanical). The live arm (real reads) is a GPU row.
- F4 railroad readout (author-only, no switch, lazy): per living transition the leaf of the way-in gate that held
  (`lead`, `stub`, or only `player_turns_in_checkpoint` = pace-forced), refusal streaks, branches per anchor. Floor: pace-forced
  share <= 1/3 of living transitions per session (estimate, owner decision). Baseline over whatever recorded boundary logs
  exist locally (lane chat blobs), counts only.
- F5 path-aware expected tension + relax window (`pacing.arcProgress`, `"path"` default, `"anchors"` = before): progress =
  visited anchors / (visited + anchors on the shortest remaining path to an ending) plus an in-checkpoint ramp
  (player turns / `target_turn_length`, default 6, capped at that checkpoint's share); after 2+ committed boundaries at smoothed
  >= critical, once it drops below critical, expected is capped at tense for 3 boundaries unless the active checkpoint's
  `tension_target` is `peak`. Floors: (hard) zero escalate hints inside a relax window; (hard) path progress never decreases
  along a played path; (before -> after) share of played paths on the branchy fixtures whose final anchor reaches progress
  >= 0.95: after = 100%; (informational) relax windows per 50 boundaries in 1..4 on recorded tension series, if any exist.
- F6 anti-rush: Studio info diagnostic `exit-on-entry` (an exit of an anchor with `tension_target` >= tense whose gate has no
  turn counter leaf) and optional authored `checkpoints[].min_turns` (compiled at validation into an extra leaf
  `player_turns_in_checkpoint >= n` ANDed into every exit not marked `urgent: true`; the counter is declared as a code int if
  missing). No switch: `min_turns` is absent unless authored, the diagnostic changes no play. Floors: (hard) `min_turns`
  holds an exit until the nth player turn and `urgent` bypasses; (baseline, no target) `exit-on-entry` count over the test
  fixture stories.

## Agent G items and floors (declared before measuring, 2026-10-31)

Branch `v3.0-42a-g`. No GPU, no lanes, no ST (brief). Corpus for the offline counts: the group chats under
`C:\dev\so-lanes\*\data\default-user\group chats` (seeded copies, deduplicated by speaker + text), counts only.
Floors are informational unless marked hard; a miss is recorded, never retuned.

- G1 cross-voice (`talk.crossVoiceTrim`, on): detector `talk/crossVoice.ts` (a line headed by another member's or the
  player's name; `"…," Name said` prose for another member or the player, readout only). S0 baseline: header hits and
  prose hits per 100 member replies; research stop lines recorded (voice-community P1: under 1 in 50 replies; voice-research
  P3: under 1 per 100), the switch is built either way (plan lists it). Trim at the reply-repair chain right after the
  thought-leak pass: cut from the first foreign header line. Hard: `extra.reasoning` never edited; a reply that would keep
  fewer than 40 visible characters is kept as written (journaled); story chat and member replies only; after the trim the
  corpus has 0 header hits in trimmed replies.
- G2 voice drift scorer (yardstick, no switch): `scripts/debug/lib/voiceDrift.mts` + `so-voice-census.mts drift`;
  character 3-gram cosine distance per member and position bucket (replies 1-10, 11-30, 31-60, 61+): between members,
  to the member's own first bucket, to the card's `mes_example` when the card is readable. Floors (voice-research P1 E
  thresholds, frozen now): own-voice distance at 61+ <= 1.25x the 11-30 bucket; between-member distance at 61+ >= 0.8x
  the 11-30 bucket. Baseline on chats with a member past 61 replies.
- G3 DRY name breakers (`talk.dryNames`, on): the overlay appends roster card names, their given names, aliases and the
  persona name to the request's own `dry_sequence_breakers` (textgen, loud story-chat requests, only when the request
  carries the key; never replaces, never an install write). S0 baseline: near-miss spellings (edit distance 1-2, same
  initial, name length >= 4) of speaker names per 1000 member replies; research stop line 0 in a large sample, recorded.
  Hard: append-only, idempotent, request-scoped (unit tests).
- G4 lore budget evidence (`worldInfo.budgetEvidence`, on): read-only `WORLDINFO_SCAN_DONE` observer; an entry in
  `new.all` and not in `new.successful` while `budget.overflowed`, minus failed probability checks, is "cut by budget".
  Check `lore-budget-starved` (author, degrades): a story-book entry we forced, pinned or gated on was cut in >= 2 of
  the last 10 loud scans; names the book that held the most budget. Author console row "cut by budget". Hard: firing
  fixture; no host write. No offline baseline (needs scans): live row in the GPU queue.
- G5 BM25 lexical arm (`worldInfo.lexicalFallback`, `worldInfo.lexicalPrefilter`, `worldInfo.lexicalTiebreak`, on):
  pure `judge/loreLexical.ts` (BM25 over comment + keys + content, query = window with the newest line x2, roster names
  and aliases, plural/possessive folding). Measured on `lore.json` (11 rows, judge answers replayed from its golden) and
  `lore-relevance.json` (17 graded rows, golden answers). Floors (lore-research P1, lore-community P3): (a) fallback:
  lexical precision@4 >= 0.6 and recall of `needed` in the top 4 >= 0.8 on lore-relevance, lexical recall@2 >= 0.6 on
  lore.json; (b) prefilter M = 12: recall of judge picks inside the top M >= 0.95, calibration recall drops <= 1 row;
  (c) tiebreak: tie rate falls and nDCG@4 does not drop.
- G6 hold lore across a round (`worldInfo.holdRound`, on): the judge's scores are reused until a new player message, a
  checkpoint change or a change in the set of entries named in the window; picks are still cut per drafted member (member
  filters). Offline over the corpus: lore-select judge rounds per player round before (one per member generation) and
  after. Floor: after <= 0.6x before on chats with multi-member rounds. Hard: a player message always reselects;
  checkpoint or entity change reselects (unit tests).
- G7 prefer known entities (`worldInfo.preferKnown`, on; owner decision 1): a candidate naming a codex entity the player
  has not met loses 0.1 of its judge p before the cut and is never forced by the lexical fallback. Hard: both rules
  (unit tests). Offline: the lore fixtures carry no codex, so before = after there (structural, recorded).

## Gate record F

2026-10-31, branch `v3.0-42a-f`.

- `npm run gates` (Storybook included, no `--resume`) on `7d4b1cab6`: **all green in 711.6s** (typecheck,
  typecheck:test, test 990 suites, test:replay, build, debug:typecheck, test:debug, test:plugin, lint, test:release,
  test-storybook:ci). After it, docs only: plan 24 matrix rows, master `2f7d5252d` merged (docs only); not re-gated.
- Main bundle 1,249,116 B (budget 1,300,000). Railroad readout rides the lazy author-console chunk; `pacing/arc.ts`,
  `runtime/loreChance.ts` are in the main bundle (synchronous scan and pacing paths, ~3 KB).
- F1 seeded lore chance (`worldInfo.seededChance`, on): hard floors met. Same boundary = identical scan copies
  (`loreChance.test` defect case, fails without the pass: the module did not exist); 50% entry fired 193/400 (floor
  170..230). Sticky entries and other books untouched; scan mode only (file mode keeps ST's roll). Info check
  `lore-weighted-groups` with a firing fixture.
- F2 critic fail-closed: unreadable verdict re-read once (`CRITIC_READS` 2), then "the critic's verdict could not be
  read" goes through the draft retry and a `critic` refusal; regression case in `living.test.ts`.
- F3 timing scorer (`pacing/timing.ts`, `timing.measure.test.ts`, 5 fixtures / 40 labelled exits in
  `test/fixtures/timing/`). Baseline, structural arm (recorded reads = a correct reader, one-boundary read lag):
  early 0/40, missed 0/40, spurious 0/40 (20 never-exits quiet), on time 7, late 13, median lag 1 player turn, max 1.
  By source: shared read 5 on time / 10 late, typed judge 1/1, stall judge 1/1, mechanical 0/1 (the counter starts one
  turn late because the exit before it fired late). All floors met. The number measures the pipeline's lag only; the
  reader's own errors need the live arm (M42-F3).
- F4 railroad readout (`runtime/railroadView.ts`, `RailroadPanel` in Author › Health). Deviation: counted over way-ins
  (frontier -> `_way` stub) only; a stub's arrival (`LIVING_STUB_TURNS` 1) is a bridge and would read as pace-forced.
  Baseline over the lane chat blobs in `C:\dev\so-lanes` (538 chats, 69 distinct logs, counts only): 6 chats with living
  play, 7 way-ins, 2 pace-forced = 0.29 pooled (floor <= 1/3 met pooled); per session 2 of 6 sessions above 1/3 (one
  way-in each); 8 quiet runs of 2+ player turns, longest 11; 2 branches.
- F5 path arc + relax (`pacing.pathArc`, on; boolean instead of the declared `"anchors" | "path"` enum, off = anchors).
  Hard: path progress never decreased on any of 280 played paths of 81 fixture stories; zero escalate hints inside a relax
  window (synthetic series), window = 3 boundaries, `peak` beats exempt. Before -> after: paths whose final anchor reaches
  progress >= 0.95: 276/280 -> 280/280 (branchy paths 0/4 -> 4/4). Informational miss: relax windows per 50 boundaries =
  0 over 28 recorded tension series / 767 boundaries, because no recorded series ever reached critical (floor 1..4).
  `runtimeManager.test` pacing case now expects 0 at the start anchor (path) and 0.5 with the switch off.
- F6 anti-rush: info diagnostic `exit-on-entry` (`studio/rushDiagnostics.ts`, via `hookDiagnostics`) + authored
  `checkpoints[].min_turns` (1..20) and `transitions[].urgent`, compiled in `validate/dwell.ts` (idempotent; declares
  `player_turns_in_checkpoint` when missing; refused on an open stretch). No switch (absent unless authored). Hard:
  `dwell.test` holds a non-urgent exit to the 3rd player turn, urgent fires on the 1st, storyDiff sees the change.
  Baseline: 13 findings on 4 of 81 fixture stories (every exit of a tense-or-hotter anchor); the Sun Ruins example keeps
  one (its finale exit), allowed in `exampleStory.test`.
- Other test changes: `arrival-findings.json` golden re-recorded (adds the 5 timing fixtures, all empty);
  `settingsAreas.test` pacing defaults; the `pacing` feature now owns `pacing.hintEnabled` only.
- No live gate: no ST, no lanes, no GPU (brief). GPU rows M42-F1/F3/F5/F4-F6 in `gpu-queue-2026-10-30.md`. Studio has no
  form field for `min_turns`/`urgent` yet (JSON only).

## Gate record G

2026-10-31, branch `v3.0-42a-g`.

- `npm run gates` (Storybook included, no `--resume`) on ``9085d9ec1``: **all green in 527.7s (typecheck, typecheck:test, test, test:replay, build, debug:typecheck, test:debug, test:plugin, lint, test:release, test-storybook:ci). The run before it was red on one test only, the error-copy guard (a silent catch in the breaker parser, now logged); after the green run, docs only (this record, master docs merged), not re-gated**.
- Main bundle 1,257,905 B (budget 1,300,000; +8.7 KB over F: settings/feature copy, `loreBudget.ts` (snapshot + checks),
  `loreLexicalPlan.ts`, the breaker helper in `samplerKeys.ts`). The trim pass, DRY handler, budget observer host, BM25
  scorer, codex lookup and `LoreBudgetPanel` ride lazy chunks.
- Corpus (G1-G3, G6): lane group chats plus the 64 chat dumps in the private `so-sessions.git` (read through git), longest
  copy per chat id, replies deduplicated by speaker + text: 258 chats, 1,768 distinct member replies. Counts only
  (`node scripts/debug/so-voice-census.mts all`).
- G1 cross-voice (`talk.crossVoiceTrim`, on): header lines for another member or the player 14 replies (0.79 per 100),
  every one at offset 0 (the whole reply written under another name, mostly the narrator speaking as a member), so the
  trim cuts 0 of 1,768 and keeps those 14 as written (journaled); prose attribution `"…," Name said` 20 (1.13 per 100,
  mostly narrator replies voicing members), player 0. Stop lines: under voice-community P1 (1 in 50) for headers, under
  voice-research P3 (1 per 100) for headers, over it for prose. Switch built per plan: pass after `thought-leak` in the
  reply-repair chain, reasoning untouched, < 40 visible characters kept (hard floors met in `crossVoicePass.test`,
  `crossVoice.test`; after-trim header hits 0). The prose shape is readout only.
- G2 drift scorer (`scripts/debug/lib/voiceDrift.mts`, node tests): floors not measurable, no member reaches 61 replies
  (max 40). Baseline on 44 chats / 67 members past 10 replies: own distance 11-30 = 0.107 (43 members), 31-60 = 0.149 (2);
  between members 1-10 = 0.152, 11-30 = 0.136 (0.90x); distance to card `mes_example` (read from the lane card PNGs) in
  1-10 = 0.347 (88 members). Rerun on any long session (M42-G2).
- G3 DRY names (`talk.dryNames`, on): near-miss spellings 3 per 1,768 replies (1.7 per 1000, 3 spellings); research stop
  line (0) not hit, so the GPU row stands. Method: candidates that are English words (seen lowercase in the corpus),
  plurals, possessives or names established in 3+ chats are skipped; a first draft without those filters counted 80, nearly
  all sentence-initial words. Overlay: appended to the request's own `dry_sequence_breakers` (array or JSON string, ST
  textgen-settings.js:1634/1822), loud story-chat textgen only, idempotent, never replaces (hard, `dryNames.test`).
- G4 budget evidence (`worldInfo.budgetEvidence`, on): host fact corrected from lore-community §2.8: `new.successful` still
  holds budget-cut entries (only failed probability rolls leave it, world-info.js:5079), so cut = successful and not in
  `activated.entries` while `budget.overflowed`; recorded in the v2 overview host facts. Checks `lore-budget-starved`
  (author, degrades, 2 of the last 10 loud scans, names the book that used the budget) and, by owner decision 2026-10-31,
  `lore-budget-uncapped` (player, info: ST `world_info_budget_cap` 0 and the story's own enabled entries over ~2,500
  tokens by `estimateTokens`; says what it costs and how to set a cap; never a write). Firing fixtures in
  `checksRegistry.test`, `loreBudget.test`; "Cut by budget" panel in Author › Prompt. No offline baseline (M42-G4).
- G5 BM25 (`worldInfo.lexicalFallback`, `lexicalPrefilter`, `lexicalTiebreak`, all on per the features-on rule;
  `loreLexical.measure.test`). lore-relevance (17 rows): judge precision@4 0.485 / nDCG@4 0.921 / tie 0.059; lexical
  0.265 / 0.427. (a) fallback: precision@4 0.265 vs 0.6 MISS, needed in top 4 0.538 vs 0.8 MISS, lore.json recall@2 0.714
  vs 0.6 met (fallback picks right 15 of 21). (b) prefilter M = 12: judge picks inside the pool 0.517 vs 0.95 MISS,
  calibration recall 26/30 -> 22/30 (drop 4 vs <= 1) MISS; capped arm precision@4 0.324, nDCG 0.618. (c) tiebreak: tie rate
  0.059 -> 0 met, nDCG 0.921 -> 0.919 (-0.002) MISS ("does not drop"), precision@4 unchanged. Not retuned. The prefilter
  costs real recall on these fixtures: owner may want it off (Settings › World & lore, Author view).
- G6 hold across a round (`worldInfo.holdRound`, on): judge asks per member generation over the corpus 2,532 -> 1,813
  (0.72x); on the 672 multi-member rounds 1,567 -> 848 (0.54x, floor <= 0.6x met). Proxy: the named set is the chat's cast
  names in the 8-message window (those chats' lore entries are not available offline). Hard: player message, checkpoint
  and named-entry changes reselect; per-member filters still cut (`loreSelectLexical.test`).
- G7 prefer known (`worldInfo.preferKnown`, on): -0.1 before the cut, never a lexical force (hard, `loreSelectLexical.test`);
  fixtures carry no codex, so before = after there.
- Ownership census: `LoreSelector.lexicalFallback` added as `delegate` (awaits `LoreSelector.forced`). Plan 24 matrix rows
  added. GPU rows M42-G1..G7 in `gpu-queue-2026-10-30.md`.
- No live gate: no ST, no lanes, no GPU (brief). Not built: an Author-view undo record for a trimmed reply (journal only).
