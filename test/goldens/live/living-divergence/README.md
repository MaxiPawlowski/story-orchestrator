# Divergence readings, live (v2.8 plan 22, L3, pod run 2026-10-10)

adolion-adventurer at guild-hall, master `a11cb81e`, Artemis v1.1 reply model, judge use `divergence` (the `fit` question only; the `commits` question did not exist yet).
Each run: 8 on-script turns that pursue a posting without taking it. Both runs branched under the old rule (0.6 x2 / 0.9 x1).
Replayed by `src/runtime/coordinators/livingCoordinator.review.test.ts` ("live L3 goldens").

- Each turn lists the `divergence` readings taken after it (one per committed boundary). `p` is the judge's probability for "none".
- `recorded: true` readings are the ones the pod agent reported (every reading >= 0.6). The others were below 0.6 and their exact
  values were not reported; they stand in at 0.2 and cannot branch under any rule here.
- Run 1: 7 readings over 8 turns, so one turn has none. Its 0.77 and 0.95 are placed on consecutive turns (the worst case for a streak).
- Run 2: 9 readings over 8 turns, so one turn was read twice (a group answers one line with several replies, each a boundary).
  The double is put on the 0.63 / 0.75 pair, the "back to back" pair that branched.
- The player text is a reconstruction of each turn's shape (the run's lines were not archived with the numbers). The turns read as
  "none" were questions about pay and supplies, so those rows are question-only lines.
- `true-positive.json` is a constructed off-script sequence (the player commits to leaving every posting) that must still branch.
