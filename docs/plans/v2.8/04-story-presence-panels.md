# Plan 04 — Story panels that need v2.8 18 or a model: Journal, suggestions, stat sheet, public roll chips

**Status (2026-10-10): BUILT (see §Gate record).** C4 Journal, C7 stat sheet and C9 (a) public dice chips were built in
`v2.7/36-quests-and-story-panels.md` and C5 "What could I do?" in `v2.7/33-*.md` W4 (both in their own Gate records;
v2.7 39 ran `v27-36-quests` green ×2). This plan's last pass (2026-10-10, branch `v2.8-panels-rest`) closed the gaps
the audit found: the suggestions read the active quests, a suggestion naming an unreached scene or a quest title the
player has not seen is dropped by code, the C5 spoiler row, the D live check with every panel open and per-story off.
Owed: the C5 CL rows (memory profile, 10 runs) and Storybook. History: on 2026-10-03 the user approved moving C1, C2,
C3, C6, C9 (b), the draggable-panel frame and the per-story toggles into `v2.7/06-story-presence-ui.md`; this plan kept
**C4, C5, C7 and C9 (a) public roll chips**. Overview: `00-overview.md`.
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
could join v2.7 06's Activity panel), v2.8 24 (final suite rows for C5).

## Review 2026-10-03

Applied: the user-approved move of C1, C2, C3, C6, C9 (b), the frame and the toggles to v2.7 06; F12 (body and gates
cover the items kept here), F21 (public chips filtered on `authorView` + `narrate: public`), A2 (C4, C7, C9 (a) after
v2.8 18), A9 (no playtest prerequisite; C8 in v2.7 05), A3 (meters never on the stat sheet), F16 (deps), B10 (registry
gate). F14 (index keeps rows of chats that pin a deleted story) is v2.7 06's.

Round 3 (Sol): R3-05, R3-06, R3-17 applied.

## Gate record

### 2026-10-10: the rest of plan 04 on `v2.8-panels-rest` (from master `9b4572f4`), deterministic tiers + no-model lane

**Audit.** The status line (2026-10-03) was stale. C4 Journal, C7 stat sheet and C9 (a) public dice chips were built in
v2.7 36 (Gate record there; `v27-36-quests` green ×2 in v2.7 39), in the v2.7 06 frame, with the story keys `journal`,
`stat_sheet` and the shared `roll_chips` (player chip only for a `narrate: "public"` check with `roll_chips` shown, every
other chip on `authorView`). C5 was built in v2.7 33 W4 (panel, wand + drawer openers, memory-profile `read` call on
click only, fills and never sends, story key `suggestions`, K1 privacy, Sol findings 7/8). Plan 23's widgets share the
same `PanelFrame` and `#so-panels-root`; nothing here sits beside it. Every item is on by default (`shown = story AND
install`, absent = true). Gaps found and closed:

- **Suggestions read the quests.** `playedProjection` dropped the narrative `quests` section (active quest titles, the
  same lines the drawer Overview shows), so a suggestion could not engage a side quest (v2.7 36: "suggestions may read the
  Journal projection, never the raw quest list"). `PLAYER_SECTIONS` gains `quests`. Model input: the off-path
  `suggestions` request (and the player Ask projection) only; the main reply payload is unchanged.
- **The C5 floor holds by code.** New pure `withheldNames(story, visitedPath, active)` (unreached checkpoints'
  `player_name` and `name`, every quest title, names of 4+ characters) and `parseSuggestions(text, projection, withheld)`:
  a line naming a withheld name (case-insensitive, whole word) that the projection text does not already show is dropped.
  The "no unreached checkpoint name in 10 runs" row can then only fail on a name that is not a whole-word match.
- C5 spoiler checklist row (`docs/plans/v2.1/test-plan.md`).
- Harness: `st-lanes.mts` accepts lanes 1..99 (was 1..50; this run's lanes are 52-53) and `seed --slim` skips each card's
  sprite folder (a no-model lane on a short disk: 291 MB instead of 1.9 GB).

**Decisions taken (plan recommendations, recorded):** suggestions see active quests through the narrative only, never
the quest list or hidden/offered quests; a dropped line is not replaced (3-4 kept as before, under 3 the panel says none
came back); a withheld name already in the transcript or Overview is not withheld (the player has seen it).

**Tests (jest):** `playerProjection.test.ts` (+2: quests ride the projection, hidden ones never; withheld names),
`suggestions.test.ts` (+1: withheld-name drop, shown name kept, whole word), `suggestionsHost.test.ts` (+2: the host
drops a line naming the unreached scene; control once reached).

**Commands (worktree, ST read-only):**
- `npm run gates -- --no-storybook --jobs 2`: **all green in 301.5 s** (build, typecheck, typecheck:test, lint, test 7426 pass /
  1 skipped, debug:typecheck, test:replay 32 of 32 killed, test:plugin, test:debug, test:release). `test-storybook:ci`
  SKIPPED (worktree). `npm run typecheck:test`: clean. `test/goldens/arrival-findings.json` gains the new fixture story
  (empty entry, `SO_RECORD_ARRIVAL_GOLDEN=1`).
- Main entry `dist/index.js` 1,248,812 B (budget 1,250,000): every change is in the lazy suggestions chunk.

**Live D, no model** (lane 52, private ST copy `C:\dev\so-lanes\agent-st-panels`, lanes root `C:\dev\so-lanes\so-lanes`,
`SO_LANE_OFFLINE=1 seed --slim`; :8000, the real ST slot, the 3090 and pods untouched; copy and seed deleted after, the run
evidence kept under `52\debug\runs`): new `test/scenarios/v28-04-presence-panels.json` (+ `v28-04-panels-off.story.json`)
**18/18 green ×2 consecutive** (`…\52\debug\runs\2026-10-10T11-12-23-033Z-so-scenario-run`, `…T11-14-52-792Z-…`): the
Overview carries the active quest for the suggestions; Journal, Stat sheet and suggestions panels open together from the
drawer openers; the planted reply's lines naming the unreached scene and the hidden quest are dropped, the other four
shown; a click fills the box and the chat length is unchanged; a typed box is never overwritten; no hidden quest, step,
author note or secret milestone in the panels; `assert-player-clean` 0 findings with all three panels open; a story whose
`display` switches `suggestions`/`journal`/`stat_sheet` off shows no opener while the read model is still there.
`v27-36-quests.json` green once on the same lane. Earlier red runs: run 1 the drawer toggle never got stable on a cold
page (slash steps 12-15 s while the memory breaker opened); run 2 all 18 steps green, then cleanup's settings save timed
out behind the fixture's own debounced save (removed from the fixture); runs 3-4 the lane browser could not start because
a Chrome left over from a manual CDP probe held port 9352 (killed). Run 5 logged two `group/save` 500s around the story
swap, no step affected.

**Stories to run in Storybook (not run here, worktree):** `Panels/SuggestionsPanel`, `Panels/JournalPanel`,
`Panels/StatSheetPanel`, `Panels/PanelFrame`, `Inline/RollChips`, `Settings/PlayGroups` (presence controls), each at
390/768/1440.

**Owed:** C5 CL rows on the memory profile (never sent / fill only / no unreached name in 10 runs; the v2.7 33 usefulness
floor), v2.7 39 S-07/S-08; Storybook interaction + a11y.

**User guide:** `player/playing.md` "Stuck?" (the quests it reads, a suggestion naming an unreached place is left out);
author `presentation` topic: `roll_chips` covers the player's public check chips too (`npm run docs:guide`).

**Adolion campaign: yes, use it, as shipped (all on).** Suggestions help the campaign as is; they get better where each
checkpoint has a `player_name` (unnamed scenes are skipped, and the withheld-name guard works on those names). The Journal
and stat sheet show only once a story declares quests or `display.public` qualities, which the v2.7 36 pilot owns; no
campaign change is needed for this plan.
