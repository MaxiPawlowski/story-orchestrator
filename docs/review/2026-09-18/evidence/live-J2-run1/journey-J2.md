### J2 author-loop — Author a playable mini-story in the Studio without touching JSON, play it, hit a wrong gate, edit, continue the same chat — including an invalidating edit that goes through the choice popup. Includes one author-view driver pass (Probe + Nudge).

| Check | Mode | Findings | Outcome | Detail |
|---|---|---|---|---|
| J2.1 | auto | U7 | pass |  |
| J2.2 | auto | U7 | pass |  |
| J2.3 | auto | U7 | pass |  |
| J2.4 | auto | U2 | pass |  |
| J2.5 | auto | U2, U7 | pass |  |
| J2.6 | auto | U2 | pass |  |
| J2.7 | auto | U2 | pass |  |
| J2.8 | auto | U2 | pass |  |
| J2.9 | auto | U3 | pass |  |
| J2.10 | human | U7 | skipped | human check — operator scores it |
| J2.11 | human | U2 | skipped | human check — operator scores it |

--- HUMAN CHECKLIST (score 1-5 + free text; record in the Gate record) ---
[J2.10] (U7) Could you author a playable checkpoint — quality, gate, transition, cast, requirements — without opening a JSON editor?
      anchors: 1 = impossible without JSON · 3 = possible but I had to work around gaps · 5 = everything the story needed was authorable
[J2.11] (U2) After you edited the story mid-play, did the running chat behave the way you expected — including when it asked you to choose?
      anchors: 1 = lost my progress · 3 = confusing but recoverable · 5 = exactly as expected
[free] What would make you stop using this?
