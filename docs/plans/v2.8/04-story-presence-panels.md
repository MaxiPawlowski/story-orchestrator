# Plan 04 — Story panels that need v2.8 18 or a model: Journal, suggestions, stat sheet, public roll chips

**Status (2026-10-03): v2.8 plan 04 (the rest of §C of old v2.7 plan 04 "story presence", now v2.7 06). Decided by the
user ("lets build them All"); not built.** On 2026-10-03 the user approved moving C1, C2, C3, C6, C9 (b) (author
Activity panel + the production roll store), the draggable-panel frame and the per-story toggles into
`v2.7/06-story-presence-ui.md`. This plan keeps **C4, C5, C7 and C9 (a) public roll chips**. Overview: `00-overview.md`.
**Gate tiers** (00-overview §Gate taxonomy): implementation D; acceptance D for C4, C7, C9 (a); CL for C5 (the memory
profile on DeepSeek).

C8 "first-run onboarding" is built in v2.7 05. The plays index, badges and the moved items are v2.7 06.

## What the user decided (old 04, verbatim)

- Question 3, "Which C-items to build": "I loved those recommendations, lets build them All, the 8. Make them draggable
  windowss whenever it makes sense. Activables on the plugin per story config."
- The comment that became C9: "do we have some infomration about the kind of background processses that are happening
  from behind? like the dice? should we? have you planned some UI for authors too?"

Rule 4 is met by that decision. Player copy still goes through the spoiler checklist.

## Items

| # | Item | Shape | Spoiler risk | Depends on |
|---|---|---|---|---|
| C4 | **Quest log / objectives (Journal)** | the v2.8 18 Journal as a movable panel in v2.7 06's frame; a Journal entry in the wand menu | gated by v2.8 18's player copy | **v2.8 18** |
| C5 | **"What could I do?" options** | 3–4 suggestions in a movable panel that **fill the input box and never send**. Off-path call on the memory profile, on demand only; the agency policy is in the prompt (suggest, never decide); the prompt sees only player-safe state (reached checkpoint names, player copy, the visible transcript) | medium: a suggestion could hint at a gated route; the projection is the guard | v2.7 06 frame |
| C7 | **Visible qualities / stat sheet** | a movable panel listing qualities the story marks `display.public` (v2.8 18 Q2). Never v2.8 20 relationship meters (author-only, review A3) | gated by v2.8 18 | **v2.8 18** |
| C9 (a) | **Public roll chips** | a roll chip on the message a draw affected, in player mode, only for a roll the story marks public (`narrate: public`, v2.8 18 Q3) **and** with the story's `rollChips` toggle on | low: only rolls the author publishes | **v2.8 18 Q3**; v2.7 06 roll store |

Moved to v2.7 06: C1 Continue list, C2 story card on hover, C3 chapter title card, C6 wand entry, C9 (b) author chips +
Activity panel + the production roll store, the panel frame, the per-story toggles.

## Build split

All four items integrate after v2.8 18 except C5, which needs only v2.7 06's frame and can build earlier.

## Panels and toggles (frame from v2.7 06)

- C4, C5 and C7 are panels in v2.7 06's frame (own CSS root, persisted position, docking under 768 px, keyboard).
- This plan adds the story `display` keys `journal`, `suggestions`, `statSheet` to v2.7 06's block, with the same
  effective value (`shown = story AND install`, absent story key = true; v2.7 06's truth table and its four-combination
  test extended to these keys). `rollChips` (v2.7 06) also governs the public
  chips here. `suggestions` defaults on but calls a model only on click.

## C9 (a) public roll chips (review F21)

- Source: v2.7 06's roll store `snapshot.rolls` only (reconstructed quality rolls + `extras.chance.draws`), to which
  v2.8 18 Q3 adds its `extras.checks` ring as a third producer (`source: "check"`, modifiers, `narrate`), recorded when
  a check is attempted, not when its transition fires (Sol r3 R3-05, R3-06).
- Player mode shows a chip only when the record is `narrate: public` and the story's `rollChips` is on. Level 2 is
  **not** a guard (`PLAYER_LEVEL_CAP` = 2, `src/runtime/settingsModel.ts:37`): every non-public chip stays filtered on
  `authorView`, as v2.7 06 builds it.

## Gates

- **D, per item:** jest (Journal and stat-sheet read models from v2.8 18 state; public-chip filter: public + toggle on →
  shown, anything else → absent in player mode at L2); Storybook interaction + a11y for each panel and the public chip at
  390/768/1440.
- **Spoiler:** checklist rows for C4, C5, C7, C9 (a); `so-ui.mts assert-player-clean` sweeps the three panels and a
  non-public chip at player L2 (absent); a public chip appears only with `narrate: public`.
- **Live (D):** on a lane with v2.8 18's pilot story: Journal and stat sheet open from the wand and the drawer,
  per-story off hides them, a public roll shows its chip in player mode and a non-public one does not.
- **C5 (CL):** suggestions on the memory profile: never sent, fill the input only, no unreached checkpoint name in
  10 runs on a story with a gated route (string check against the story's unreached names).
- Registry: each item registered in the v2.7 01 feature registry + Help (rule 10). `npm run gates`.

## Links

v2.7 06 (index, badges, frame, toggles, roll store, C1–C3, C6, C9 (b)), v2.7 05 (briefing, C8), v2.7 01 (registry),
v2.8 18 (Journal, `display.public`, public rolls), v2.8 20 (meters stay author-only), v2.8 22 (director suggestions
could join v2.7 06's Activity panel), v2.8 23 (final suite rows for C5).

## Review 2026-10-03

Applied: the user-approved move of C1, C2, C3, C6, C9 (b), the frame and the toggles to v2.7 06; F12 (body and gates
cover the items kept here), F21 (public chips filtered on `authorView` + `narrate: public`), A2 (C4, C7, C9 (a) after
v2.8 18), A9 (no playtest prerequisite; C8 in v2.7 05), A3 (meters never on the stat sheet), F16 (deps), B10 (registry
gate). F14 (index keeps rows of chats that pin a deleted story) is v2.7 06's.

Round 3 (Sol): R3-05, R3-06, R3-17 applied.
