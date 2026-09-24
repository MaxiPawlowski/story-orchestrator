### J6 mutation-storm — Edit and delete messages around a committed boundary; the engine rolls back correctly and the player can tell what happened.

| Check | Mode | Findings | Outcome | Detail |
|---|---|---|---|---|
| J6.1 | auto | — | pass |  |
| J6.2 | auto | — | pass |  |
| J6.3 | auto | — | pass |  |
| J6.4 | auto | U5 | pass |  |
| J6.5 | human | U5 | skipped | human check — operator scores it |
| J6.6 | auto | R4 | pass |  |
| J6.7 | auto | M3 | pass |  |
| J6.8 | auto | M4 | pass |  |
| J6.9 | auto | E1 | pass |  |

--- HUMAN CHECKLIST (score 1-5 + free text; record in the Gate record) ---
[J6.5] (U5) After you edited and deleted messages, was it clear what the story did in response?
      anchors: 1 = no idea, felt broken · 3 = worked it out from the drawer · 5 = the system said what it did
[free] What would make you stop using this?
