### J7 long-haul — Full sun-ruins play-through to the finale on the real model: every anchor reached, convergence honoured, success-criteria hooks recorded. Expensive — run at plan 01 (baseline) and plan 07/08 (acceptance) only.

| Check | Mode | Findings | Outcome | Detail |
|---|---|---|---|---|
| J7.1 | auto | — | pass |  |
| J7.2 | auto | — | pass |  |
| J7.3 | auto | — | fail | Timed out waiting for {"timeoutMs":900000,"checkpointIn":["cp-4a","cp-4b","cp-4a1","cp-4a2","cp-5","cp-6"]}. Last state: {"chatId":"2026-09-22@16h15m48s288ms"," |
| J7.4 | auto | — | fail | Timed out waiting for {"timeoutMs":900000,"checkpointIn":["cp-4a1","cp-4a2","cp-5","cp-6"]}. Last state: {"chatId":"2026-09-22@16h15m48s288ms","activeCheckpoint |
| J7.5 | auto | — | fail | Timed out waiting for {"timeoutMs":900000,"checkpointIn":["cp-5","cp-6"]}. Last state: {"chatId":"2026-09-22@16h15m48s288ms","activeCheckpoint":"cp3","boundary" |
| J7.6 | auto | — | fail | Timed out waiting for {"timeoutMs":900000,"checkpointIn":["cp-6"]}. Last state: {"chatId":"2026-09-22@16h15m48s288ms","activeCheckpoint":"cp3","boundary":14,"bl |
| J7.7 | auto | — | fail | Evaluation failed in SillyTavern page: page.evaluate: Error: anchors skipped: cp-5, cp-6 (visited cp1, cp2, cp3)
    at eval (eval at <anonymous> (eval at evalu |
| J7.8 | auto | — | fail | Evaluation failed in SillyTavern page: page.evaluate: Error: expected 5+ transition events, got 2
    at eval (eval at <anonymous> (eval at evaluate (:290:30)), |
| J7.9 | human | — | skipped | human check — operator scores it |
| J7.10 | human | — | skipped | human check — operator scores it |

--- HUMAN CHECKLIST (score 1-5 + free text; record in the Gate record) ---
[J7.9] (—) Over the whole play-through, did the story feel authored — arriving where it was meant to — or did it feel like it was dragging you along rails?
      anchors: 1 = pure rails · 3 = authored but visible machinery · 5 = felt like a GM running my choices
[J7.10] (—) Did the finale land, given what actually happened in your run?
      anchors: 1 = disconnected from my choices · 3 = generic ending · 5 = paid off my run specifically
[free] What would make you stop using this?
