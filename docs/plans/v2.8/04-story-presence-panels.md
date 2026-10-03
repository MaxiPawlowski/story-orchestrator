# Plan 04 — Story panels: the player UI we still owe, and "Behind the scenes"

**Status (2026-10-03): v2.8 plan 04 (§C of v2.7 plan 04 "story presence", now v2.7 06). Decided by the user ("lets build
them All"); not built.** Overview: `00-overview.md`.
**Gate tiers** (00-overview §Gate taxonomy): implementation D; acceptance D for every item except C5 (CL: the memory
profile on DeepSeek).

v2.7 06 builds the plays index (A) and the list badges (B). C8 "first-run onboarding" is built in v2.7 05 as the
briefing modal's "How Story Orchestrator works" section (old 03 decision 5). This plan builds the rest of §C: C1–C7 and
the new C9.

## What the user decided (old 04, verbatim)

- Question 3, "Which C-items to build": "I loved those recommendations, lets build them All, the 8. Make them draggable
  windowss whenever it makes sense. Activables on the plugin per story config."
- The comment that became C9: "do we have some infomration about the kind of background processses that are happening
  from behind? like the dice? should we? have you planned some UI for authors too?"

Rule 4 is met by that decision: these surfaces need no further playtest before building. Their player copy still goes
through the spoiler checklist.

## Items

| # | Item | Shape | Spoiler risk | Depends on |
|---|---|---|---|---|
| C1 | **Continue list** | "Your stories" in the Continue entry point and optionally on the welcome screen: story, last checkpoint name, last played, one click opens the chat. Reads the v2.7 06 plays index (entries kept while a chat still pins its story, review F14) | low: names already seen | v2.7 06 index |
| C2 | **Story card on the group** | hovering the v2.7 06 badge shows title, chapter, "last played 2 days ago" | low | v2.7 06 badges |
| C3 | **Chapter title card** | a full-width inline card when a chapter opens (inline layer, `components/inline/`), instead of a chip; it can carry the chapter briefing from v2.7 05 | none: the chapter is entered | v2.7 05 chapter briefings |
| C4 | **Quest log / objectives (Journal)** | the v2.8 18 Journal as a movable panel | gated by v2.8 18's player copy | **v2.8 18** |
| C5 | **"What could I do?" options** | 3–4 suggestions in a movable panel that **fill the input box and never send**. Off-path call on the memory profile, on demand only; the agency policy is in the prompt (suggest, never decide); the prompt sees only player-safe state (reached checkpoint names, player copy, the visible transcript) | medium: a suggestion could hint at a gated route; the projection is the guard | none |
| C6 | **Wand-menu entry** | "Story" in ST's extensions wand (`#extensionsMenu`, as `stHost/imageSurface.ts` does for images): recap, briefing, Journal, flag | none | — |
| C7 | **Visible qualities / stat sheet** | a movable panel listing qualities the story marks `display.public` (v2.8 18 Q2). Never v2.8 20 relationship meters (author-only, review A3) | gated by v2.8 18 | **v2.8 18** |
| C9 | **"Behind the scenes"** | (a) **roll chips** on the message a draw affected; (b) an author **Activity panel** (movable): a live feed of what the machine did this turn | see §C9 | (a) public chips: **v2.8 18 Q3**; author chips and (b): none |

Not proposed: anything that posts into the chat array (rejected list in `v2.4/extension-research/SUMMARY.md`), and
steering controls in player mode (two-personas rule).

## Build split (review A2)

1. **First:** C1, C2, C3, C5, C6, the panel frame (below), the per-story toggles, C9 (b) and C9 (a) for authors.
2. **After v2.8 18:** C4, C7 and C9 (a) public roll chips.

## Panels

- **Movable, resizable panels** for C4, C5, C7, C9 (b) and the v2.7 01 Help panel. Briefings and confirmations stay
  modal (native `<dialog>`, gotchas).
- Each panel is its own root in the CSS scope list (`styles.css`) and in `.storybook/preview.ts` `mountRootFor`.
- Position and size persist per install (`extensionSettings["story-orchestrator"].panels[id] = {x, y, w, h}`), clamped
  to the viewport on load and on resize; at widths under 768 px a panel docks full-width instead of floating.
- Keyboard: focusable title bar, Escape closes, no focus trap (a panel is not modal).

## Per-story toggles

- Story `display` block: `{ continueList?, groupCard?, chapterCard?, journal?, suggestions?, wand?, statSheet?,
  rollChips? }`, each boolean, authored in the Studio Story tab.
- Install-wide defaults in `display.*` settings (all on, except `suggestions`: on, but it calls a model only on click).
- **Precedence:** the story's value wins when present; otherwise the install default. A player can always turn an item
  off install-wide (a story can switch an item off, never force one on against the player's off).
- C1 and C2 read the index, not a story, so their story toggle applies only to that story's rows.

## C9 "Behind the scenes" (review F21)

**Roll provenance in production.** Today `ChanceDrawKind` is only `npc | talk` (`src/runtime/chance.ts:14`), quality
rolls (`chanceGateValues`, `:31-36`) announce nothing, and the only collector is the dev ring
(`runtime/spikes/install.ts:66`, installed under `__SO_DEV__`, `runtime/index.ts:85`). So:

- **Quality rolls are reconstructed, not recorded.** A roll is a pure function of (chat, story,
  `checkpointStartedBoundary`, key) and the quality's `roll {sides, target}`. The snapshot builder recomputes, for the
  active checkpoint's rolled qualities, `{key, sides, target, drawn, outcome, boundary}` and anchors the chip at the
  message that boundary committed. Reopen, rollback and swipe need no store: the inputs already roll back.
- **NPC reply and talk draws are recorded** in a production ring `extras.chance.draws` (cap 100, no text), written
  through `onChanceDraw` with the message id, rolled back by message like `extras.lore.fired`. Persisted with the chat.
- Any later modifier (v2.8 18 Q3 checks) adds `modifier` to the same record shape; it is declared there.

**Who sees what.**
- Author view: roll chips at inline level ≥ 2 and the Activity panel.
- Player mode: a roll chip only when the story marks that roll public (`narrate: public`, v2.8 18 Q3) **and** the
  player-side toggle is on. Level 2 is **not** a guard: `PLAYER_LEVEL_CAP` = 2 (`src/runtime/settingsModel.ts:37`), so
  players reach L2. Every non-public chip is filtered on `authorView`, not on level.

**Activity panel (author only).** Composed from existing rings, no new store except the draws ring above: boundary
logs, extraction audits, judge calls, talk decisions, curator proposals, lore fired, draws, check findings (v2.7 04),
expansions, complications released (v2.8 18). Each row links to its message. Listed in `PLAYER_FORBIDDEN_SELECTORS`.

## Gates

- **D, per item:** pure modules with jest (Continue list from the index; precedence of story vs default toggles;
  roll reconstruction ≡ the seeded value, under rollback, swipe, reopen, and with two group replies inside one
  checkpoint; draw ring rollback by message); Storybook stories for every panel and chip at 390/768/1440 with a11y
  plays; panel persistence (move, reload, same place; viewport shrink clamps; mobile docks).
- **Spoiler:** checklist rows for every C-item; `so-ui.mts assert-player-clean` sweeps C1–C7, every panel and a
  non-public roll chip at player L2 (must be absent); a public roll chip appears only with `narrate: public`.
- **Live (D):** a lane with two group chats in two stories: Continue lists both, a deleted library story keeps its
  row while a chat pins it, chapter card on a chapter entry, wand entry opens each target, per-story off hides the item.
- **C5 (CL):** suggestions on the memory profile: never sent, fill the input only, no unreached checkpoint name in
  10 runs on a story with a gated route (string check against the story's unreached names).
- Registry: each item registered in the v2.7 01 feature registry + Help (registry test, rule 10).
- `npm run gates`.

## Links

v2.7 06 (index + badges), v2.7 05 (briefing, C8 onboarding, chapter briefings), v2.7 04 (check findings in Activity),
v2.7 01 (Help panel, registry), v2.8 18 (Journal, `display.public`, public rolls), v2.8 20 (meters stay author-only),
v2.8 22 (director suggestions could join Activity), v2.8 08 (overlay source at L3).

## Review 2026-10-03

Applied: F12 (body and gates cover every item, panels, per-story toggles; idle backfill is v2.7 06), F21 (production
roll provenance: reconstructed quality rolls + a recorded draws ring; Author-view guard, not level), A2 (build split:
C4, C7 and public chips after v2.8 18), A9 (no playtest prerequisite, rule 4; C8 built in v2.7 05), A3 (meters never on
the stat sheet), F14 (Continue keeps rows of chats that pin a deleted story; the index itself is v2.7 06), F16 (deps),
B10 (registry gate).
