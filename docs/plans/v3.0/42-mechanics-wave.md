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
