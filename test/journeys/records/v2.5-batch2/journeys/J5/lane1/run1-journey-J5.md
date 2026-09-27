### J5 group-direction — Speaker direction, npc_replies and cast_changes across checkpoints in a real group chat, with per-speaker private injection asserted in the captured payload.

| Check | Mode | Findings | Outcome | Detail |
|---|---|---|---|---|
| J5.1 | auto | — | pass |  |
| J5.2 | auto | — | pass |  |
| J5.3 | auto | — | pass |  |
| J5.4 | auto | — | pass |  |
| J5.5 | auto | — | pass |  |
| J5.6 | auto | U3 | pass |  |
| J5.8 | auto | U3 | fail | Evaluation failed in SillyTavern page: page.evaluate: Error: Arin: it is an enabled member holding pre-existing private knowledge and the request ST sent for it |
| J5.7 | human | — | skipped | human check — operator scores it |

--- HUMAN CHECKLIST (score 1-5 + free text; record in the Gate record) ---
[J5.7] (—) Did the right characters speak at the right moments, and did silence read as a choice rather than a bug?
      anchors: 1 = wrong speaker constantly · 3 = mostly right · 5 = felt directed by a GM
[free] What would make you stop using this?
