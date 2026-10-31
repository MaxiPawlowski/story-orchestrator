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
