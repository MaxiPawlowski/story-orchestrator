### J10 identity-and-settings — Story identity and settings homes: a chat plays its pinned copy through library edits and deletion, a new chat inherits the install profile, Restart is the only reset, and a chat saved by another version is refused until a confirmed Restart replaces it.

| Check | Mode | Findings | Outcome | Detail |
|---|---|---|---|---|
| J10.1 | auto | U2 | pass |  |
| J10.2 | auto | U1, I3 | pass |  |
| J10.3 | auto | U2 | pass |  |
| J10.4 | auto | U2 | pass |  |
| J10.5 | auto | U2 | pass |  |
| J10.6 | auto | U1, I3 | pass |  |
| J10.7 | auto | U2 | pass |  |
| J10.13 | auto | T11 | pass |  |
| J10.14 | auto | T2 | fail | Evaluation failed in SillyTavern page: page.evaluate: Error: a shared read needs a window or a chat reader
    at w (http://127.0.0.1:8102/scripts/extensions/th |
| J10.15 | auto | T11 | pass |  |
| J10.9 | human | U6 | skipped | human check — operator scores it |
| J10.10 | human | U6 | skipped | human check — operator scores it |

--- HUMAN CHECKLIST (score 1-5 + free text; record in the Gate record) ---
[J10.9] (U6) Reading the settings panel, was it clear which settings apply to every chat and which only to this one?
      anchors: 1 = no idea · 3 = worked it out · 5 = obvious at a glance
[J10.10] (U6) The memory-model self-test: did its result tell you something you could act on?
      anchors: 1 = meaningless · 3 = confirmed it works · 5 = told me exactly what this model can and cannot do
[free] What would make you stop using this?
