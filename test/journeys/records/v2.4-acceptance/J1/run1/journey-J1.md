### J1 first-contact — A new user with a cleared install: install state → import the example → configure → first real transition fires.

| Check | Mode | Findings | Outcome | Detail |
|---|---|---|---|---|
| J1.1 | auto | U6 | pass |  |
| J1.2 | auto | U1 | pass |  |
| J1.3 | auto | U1, I3 | pass |  |
| J1.4 | auto | U6 | pass |  |
| J1.10 | auto | U6 | pass | reported pass as expected |
| J1.5 | auto | U6 | pass |  |
| J1.6 | auto | U1 | pass |  |
| J1.7 | auto | U6 | fail | #chat: expected to contain "Accept the Mission" |
| J1.8 | human | U6 | skipped | human check — operator scores it |
| J1.9 | human | U1, U6 | skipped | human check — operator scores it |

--- HUMAN CHECKLIST (score 1-5 + free text; record in the Gate record) ---
[J1.8] (U6) From opening SillyTavern with the extension installed, could you tell what to do to get a story running?
      anchors: 1 = no idea where to start · 3 = worked it out by poking around · 5 = the next step was obvious at every point
[J1.9] (U1, U6) Once you were playing, was it clear that the story was actually running (and would advance on its own)?
      anchors: 1 = no signal at all · 3 = guessed from the drawer · 5 = unmistakable
[free] What would make you stop using this?
