# v3.0 43 — Roadmap from the 2026-10-31 research

One place for everything the 2026-10-31 research proposed, in phases. Sources: `research/memory-shortlist-2026-10-31.md`,
`research/mechanics-shortlist-2026-10-31.md`, `research/context-census-2026-10-31.md` and their reports. Rules (owner):
every upgrade its own switch, on by default, floor declared first, offline before→after, then a GPU A/B; CPU first;
at most two code agents; finished work is installed into the owner's ST as it merges.

## Phase 1 — CPU, in build (2026-10-31)
- 41 memory wave 1: B merged (`a0d49e1d3`); A in build (real-token compaction, summary collapse guard, idle supersession,
  place/item name fold, long-horizon availability probes).
- 42a: F merged (`6d4bde3c0`); G in build (cross-voice detector + trim, voice drift scorer, DRY name breakers, lore budget
  evidence + `lore-budget-uncapped` warning, BM25 lore arm, hold lore across a round, prefer-known bias).
- Campaign (private repo): lore budget guideline + check (story books ≤ ~2,500 tokens together), drop image-only
  `Appearance:` lines from lore. After 41 A.

## Phase 2 — CPU, after phase 1 numbers
- 42b: stuck ladder with authored leads + `one-clue-exit`; judge-question director critic; 2-3 leads per turning point;
  story-state lore query + alias pass; example-dialogue drop warning; Studio fields for `min_turns`/`urgent`.
- Context savings (census): dedupe the 33-token guidance/pacing line; empty sheet block skipped; recap tiers stop
  re-summarising messages still in the window (switch, rating in phase 4); move fixed instruction text below the
  cacheable prefix only where it rates neutral.
- Lore lifetime (owner 2026-10-31): checkpoint `world_info` enables get an end ("this chapter" / until checkpoint X;
  chapter close switches them off unless marked lasting), Studio warning when enabled entries along a path pass the
  lore budget, guide update (stop "keep cast and truths on" without an end). Switch + before/after (campaign path
  worst-case tokens from `check_lore_budget.py`).
- Campaign lore trim: another model (owner never reads the campaign) moves the 5 over-budget stories onto lore
  lifetimes; `check_lore_budget.py` must pass with the baseline file emptied; pin bump + reinstall.
- Memory measurement: reply contradiction scorer (offline, calibrated on planted pairs); echo/vagueness floors for
  compaction ratings; probes extended to search archive recall (B3 at 150 could not see its gain).

## Phase 3 — read-contract changes (CPU build, adoption needs live suite x2 on GPU)
- Memory wave 2: neighbour-aware read (`same=`/`update=`); write-time retrieval keys; relation rows with several values;
  social act tags on feeling lines.

## Phase 4 — GPU wave (owner "resume"), with the existing G1-G5 queue
- CTX-BENCH 40K/48K + B7 decode-loss diagnosis (~1 h).
- A/B rows for every 41/42 switch (MW1-*, M42-*), utilization half of the recall probes, behavioural leak rate.
- Ratings: others-speak clause, persona re-anchor, typed redirect on refusal, multi-draft director pick, chapter spine,
  reserved lore slot, recap de-duplication, in-character thinking clause (owner OK'd for the rating only).
- Phase 3 live suite x2 per read change.

## Phase 5 — character features (blind rating each)
- Memory wave 3: "you and the player" memories per member; "what changed" + private "since you last spoke"; per-member
  perspective recap at chapter seal.
- Director: setup/payoff ledger; motive check; re-plan after divergence.
- Lore: reserved budget slot for forced picks (if phase 4 rates it well).

## Spikes for GPU time (owner 2026-10-31: not rejected, try them)
Each a spike behind `spikes.<id>` (lazy `runtime/spikes/`), CPU-built ahead, decided on GPU by a floor declared first.
- `checkClocks`: clocks that tick on check misses and give the narrator a pressure line; blind rating + turns-to-exit,
  checked against the agenda overlap.
- `phraseBans`: phrase bans with backtracking in the patched llama.cpp; floors: banned-phrase rate down, decode >= 95 %
  of base, blind rating neutral or better.
- `relationGraph`: entity-relation graph view over the ledger vs the flat ledger; multi-hop recall fixture +
  contradiction rate.
- `selfEditMemory`: a MemGPT-style core block the memory route edits by small deltas (never the play model); floors:
  rollback ≡ replay property test, held-secret leak 0, long-horizon probe gain.
- `promptCompress`: LLMLingua-style compression of history/lore on CPU; floors: tokens saved, blind rating neutral,
  prefix-cache reuse not worse.
- `cpuReranker`: small cross-encoder via llama.cpp `--reranking` for lore/recall (needs the owner's download OK);
  floors: E0 hit@4 and lore precision@4 up.

Lore budget cap: for this one case the owner keeps ST settings unchanged (warning + campaign guideline instead).

## Phase 2 agent P — progression and director (floors committed before measuring)

Sources: `research/progression-products.md` P1, `research/progression-research.md` P2, `research/director-research.md` P1,
`research/director-products.md` P1. Every switch on by default; floors informational, never retuned after the run.

- P1 stuck ladder (`pacing.stuckLadder`): authored `checkpoints[].leads` (1-4) + `stuck_after` (1-20, default 6) on gated
  checkpoints. Rung derived from the boundary log + player turn ids (no slice, no model call): quiet player turns since
  the last watched exit key moved; rung 1 at `stuck_after`, +1 every 3 quiet turns; rung k shows lead k, past the last
  lead (or with none from rung 2) one generic line. Never forces completion. Hard floors: rung table on fixtures, reset
  on a watched-key move, same rung on a replayed log (rollback = replay), no line on open stretches/finals/counter-only
  exits. Studio warning `one-clue-exit`: fires on a one-key fixture, silent with 2+ leads, an alternate or a counter leaf.
  Baseline: count of fixture checkpoints it flags. GPU row M43-P1: median turns to exit on a stuck fixture -30% or more,
  heavy-handed/forced flags at most control + 1 (blind rating owner-gated).
- P2 judge director critic (`judge.uses.directorCritic`): five nouls (player-act, contradicts, outcome-name, new-person,
  follows-thread), verdict in code, falls back to the LLM critic when the judge is off/unavailable. Floors on labelled
  director drafts (recorded director answers + authored synthetic cases, no campaign text): player-act recall >= 0.9,
  false refusals <= 0.15. Live row stays M21.
- P3 multi-lead turning points (`stagecraft.livingLeads`): director `opens_when` may be a list of 2-3 leads, way-in gate
  `any[lead..., pace]`, still one transition per boundary; every new lead counts against `LIVING_MAX_NEW_QUALITIES`.
  Hard floors: recorded single-lead goldens replay unchanged; a 3-lead draft builds one transition with an any-gate;
  impossible/open-on-arrival leads stay refused (0 on the goldens).
- P4 Studio fields for checkpoint `min_turns` and transition `urgent` with stories (no switch).
