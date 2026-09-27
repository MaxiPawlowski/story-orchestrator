### J3 player-session — A real play session on the shipped example: transitions announced, memory recalled, nothing the player should not see, and the session journal correlates it all.

| Check | Mode | Findings | Outcome | Detail |
|---|---|---|---|---|
| J3.1 | auto | — | pass |  |
| J3.2 | auto | — | pass |  |
| J3.3 | auto | U3 | pass |  |
| J3.4 | auto | U8 | pass |  |
| J3.5 | auto | U4 | pass |  |
| J3.6 | auto | U5 | fail | Evaluation failed in SillyTavern page: page.evaluate: Error: a shared read needs a window or a chat reader
    at w (http://127.0.0.1:8101/scripts/extensions/th |
| J3.7 | auto | — | fail | memoryInjection.facts: expected present=true, got false |
| J3.8 | auto | — | pass |  |
| J3.9 | human | U4 | skipped | human check — operator scores it |
| J3.10 | human | U3 | skipped | human check — operator scores it |
| J3.11 | human | U8 | skipped | human check — operator scores it |
| J3.12 | human | U5 | skipped | human check — operator scores it |
| J3.13 | human | — | skipped | human check — operator scores it |

--- HUMAN CHECKLIST (score 1-5 + free text; record in the Gate record) ---
[J3.9] (U4) During the session, did you always know where the story was and what it wanted from you?
      anchors: 1 = lost most of the time · 3 = had to open the drawer to be sure · 5 = always obvious from play
[J3.10] (U3) Did anything you saw spoil what was coming, or reveal what a character was supposed to be hiding?
      anchors: 1 = major spoilers · 3 = one small leak · 5 = nothing leaked
[J3.11] (U8) Did the on-screen wording sound like the game, or like the machine running it?
      anchors: 1 = debug output · 3 = mixed · 5 = all in-world
[J3.12] (U5) When the story did not move on a turn, could you tell whether it was stuck, thinking, or waiting for you?
      anchors: 1 = indistinguishable · 3 = guessed right eventually · 5 = always clear
[J3.13] (—) Pacing: did the story push when it should have pushed and breathe when it should have breathed?
      anchors: 1 = fought me constantly · 3 = acceptable · 5 = felt directed
[free] What would make you stop using this?
