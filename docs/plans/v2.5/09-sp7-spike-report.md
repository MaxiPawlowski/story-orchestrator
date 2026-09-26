# v2.5 plan 09 — SP7 seeded chance gates (and the RNG seam) spike report

**Verdict: not yet measured.** This commit predeclares the conditions and the fixtures (plan 09 rule 1). The conditions are
copied verbatim from `09-research-spikes.md` §SP7 and are never retuned after a run. The user decided D1–D5 all run (Q2, 2026-09-26).

## Predeclared conditions

| # | Condition | Pass | Kind |
|---|---|---|---|
| D1 | Replay | jest: same chat/story/boundary → same draw; rollback + replay → same draws, 4 seeds × 200 cuts | deterministic, once |
| D2 | Distribution | 10 000 seeds: observed rate within ± 1.5 pp of `target/sides` | deterministic, once |
| D3 | Engine purity | `architecture.test.ts` green; the seed is a clock-like seam, no host import | deterministic, once |
| D4 | NPC reply roll on the seam | a rolled-back and re-entered checkpoint draws the same outcome, ×2 live | live, ×2 |
| D4b | Talk weighted pick on the seam | a rolled-back and re-entered boundary picks the same speaker, via `options.random` seeded from `hash(chatId, storyId, boundary, 'talk')`, ×2 live; if not built, recorded as a known non-replayable choice | live, ×2 |
| D5 | Authored use | ≥ 1 shipped example story uses a chance gate and the user accepts it | user decision |

## Fixtures

- `test/fixtures/sp7-chance.story.json` — D1: a gate that loops, with two `source: code` roll qualities (`lock_gives` d20 ≤ 12, `clue_die` d6 face), so a draw is taken again at every re-entry at a new boundary.
- `test/scenarios/live-v25-09-sp7.story.json` — the live story: a hall with an equal-weight rules pick (D4b), a gate whose `onEnter` NPC reply rolls at 0.5 (D4), and a chance gate on `lock_gives` (D5 machinery).
- `test/scenarios/live-v25-09-sp7-d4.json`, `test/scenarios/live-v25-09-sp7-d4b.json` — the live legs.

D2's rolls are fixed here: d20 ≤ 12, d6 ≤ 1, d100 ≤ 35, d2 ≤ 1 for the gate draw; NPC probabilities 0.25, 0.5, 0.9; a 3:1 talk pick.
