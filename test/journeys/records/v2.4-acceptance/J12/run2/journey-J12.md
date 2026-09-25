### J12 unaided-schedule — The configuration every real install runs and no journey covered: the shipped default cadence, three real player turns, no runExtractionNow and no /cp — an extraction read must fire on its own, its deltas must carry evidence quoting what the player wrote, and the checkpoint it opens must apply its effects.

| Check | Mode | Findings | Outcome | Detail |
|---|---|---|---|---|
| J12.1 | auto | S13 | pass |  |
| J12.2 | auto | S13 | pass |  |
| J12.3 | auto | S13 | fail | Evaluation failed in SillyTavern page: page.evaluate: Error: the unaided reads accepted no deltas: [{"reason":"scene:cast","window":{"from":0,"to":1},"rejected" |
| J12.4 | auto | S13 | fail | Evaluation failed in SillyTavern page: page.evaluate: Error: no unaided read accepted anything, so there is no evidence to measure (J12.3 says why)
    at eval  |
| J12.5 | auto | S13 | fail | Evaluation failed in SillyTavern page: page.evaluate: Error: the story is still at guild-hall after three turns: the model did not set `path` (its own gate), so |
