# Core mechanics research shortlist (2026-10-31)

Eight reports, two angles per mechanic: `progression-research.md`, `progression-products.md`, `director-research.md`,
`director-products.md`, `voice-research.md`, `voice-community.md`, `lore-research.md`, `lore-community.md`. Numbers are
estimates or third-party self-reports unless marked measured. Ids = `<report>:P<n>`.

## Defects found (fix regardless of the shortlist)
- Director critic fails open: an unreadable verdict passes the anchor (`generation/living/direct.ts:13,138`, verified).
- Story-book entries with ST `probability` roll `Math.random` (ST `world-info.js:5041`), so a swipe/replay gets a
  different prompt: breaks rollback ≡ replay for prompts (lore-community:P1, S).
- Group name stop strings off on purpose (cut reasoning) with no replacement guard; card examples unpinned and dropped
  in long chats (voice-community facts).

## Measure first (one yardstick per mechanic, mostly offline)
- Progression: transition timing floor over labelled transcripts: early/late/missed/spurious (progression-research:P1).
- Director: railroad readout from the boundary log: fired-by-turn-count share, refusal streaks, branches per anchor
  (director-products:P2).
- Voice: drift floor: cross-member n-gram distance, drift from early replies and card examples, cross-voice detector
  hit count (voice-research:P1, P3 detector, voice-community:P1 count).
- Lore: budget-cut evidence from `WORLDINFO_SCAN_DONE` + `lore-budget-starved` check (lore-community:P2a); ranking
  precision@4 measured 0.485 vs floor 0.85 (lore-research).

## Candidate upgrades, each its own switch
Progression: stuck ladder with authored leads (both reports P1/P2, M); relax window after a peak + reachable-path
tension curve (progression-products:P2, progression-research:P3, S-M); anti-rush exit warnings + `min_turns`
(progression-products:P3, S).
Director: judge-question critic (director-research:P1, S-M); 2-3 leads per turning point (director-products:P1, S-M);
multi-draft pick by code (director-research:P2, M); typed redirect on refusal (director-products:P3, M, rating);
chapter spine (director-research:P3, M).
Voice: trim cross-member lines at reply time (voice-community:P1, S); "others speak for themselves" member clause
(both, S, rating); roster names as DRY sequence breakers (voice-community:P3, S); persona re-anchor from card examples
(voice-research:P2, S-M, rating); in-character thinking clause (voice-research:P5, owner OK first).
Lore: BM25 lexical arm as judge fallback/prefilter/tiebreak (both, S-M, offline on lore-relevance fixtures);
story-state query expansion + alias pass (lore-research:P2, M); hold selection across a round (both, S, saves judge
calls); reserved budget slot for forced picks (lore-community:P2b, S, rating).

## Owner decisions raised
- Lore selection ignores what the player has discovered (codex): intended or not?
- Clocks on check misses overlap agendas (progression-products:P4).
- In-character thinking clause changes what Artemis thinks about (voice-research:P5).
- Phrase bans with backtracking in the patched llama.cpp (voice-community, L).
