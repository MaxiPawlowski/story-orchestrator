# Monk's Enhanced Journal (FoundryVTT) — v2.8 27 review

meta: https://github.com/ironmonk108/monks-enhanced-journal · clone path
`C:\dev\st-extensions-research\gamification\monks-enhanced-journal\source` @ `9d66fb9` (2026-09-13, module 14.01) ·
★ 63 · downloads unknown · licence GPL-3.0 (`LICENSE`: GNU General Public License, Version 3, 29 June 2007); no game
content shipped · files read: `sheets/QuestSheet.js`, `sheets/PersonSheet.js`, `sheets/PlaceSheet.js` (tabs),
`sheets/EncounterSheet.js` (tabs), `sheets/EnhancedJournalSheet.js` (relationships, reveal, allowed types),
`apps/objectives.js`, `apps/objective-display.js`, `templates/objectives.html`,
`templates/sheets/partials/sheet-objectives.hbs`, `templates/sheets/partials/sheet-relationships.hbs`,
`monks-enhanced-journal.js` (status list, Active Tiles action, legacy tracker). Not read: shop/loot economy, slideshow,
encounter placement, ListSheet, the 3,770-line base sheet beyond the relationship code.

## What it is

A large Foundry VTT module that replaces journal pages with **typed sheets**: quest, encounter, person, organization,
place, point of interest, event, shop, loot, list, picture, slideshow. Each type stores its own fields in page flags and
renders its own tabs. Quests have objectives with counters and several reward sets; persons/places/organizations link to
each other through a relationship list with a public label, a secret label and two visibility switches. Hiding is done
per tab and per row for non-GM viewers. All state is GM-edited; one integration lets a map trigger set a quest status.

## How it works

- **Quest page defaults** (`sheets/QuestSheet.js:78-80`): `{rewards, objectives, seen: false, status: 'inactive'}`.
  Status list `inactive` (labelled "unavailable"), `available`, `inprogress`, `completed`, `failed`
  (`QuestSheet.js:175-181`, same list `monks-enhanced-journal.js:5219-5225`). A legacy boolean `completed` is migrated
  to `status` on open (`QuestSheet.js:10-11`).
- **Objective** (editor fields `templates/objectives.html`; row fields `sheet-objectives.hbs:37`, `:42`): `title`,
  `content` (rich text), `required` (a number), `done` (progress count), `available` (player-visible), `status`
  (complete bool). Players see only `available` objectives (`QuestSheet.js:183-185`); the counter renders "done/required"
  when `required` is numeric (`QuestSheet.js:186`). The objectives tab disappears for players when none is available
  (`QuestSheet.js:118-121`). The editor dialog posts the checkbox as `complete` while reading `status`
  (`templates/objectives.html:17`), a field-name drift.
- **Rewards are several named sets** (`convertRewards`, `QuestSheet.js:287-300`): `{id, name, active, visible, items,
  xp, additional, currency}` plus `awarded` (`QuestSheet.js:203`). Players see only `visible` sets
  (`QuestSheet.js:200-204`) and the tab hides when none is visible (`QuestSheet.js:111-116`). XP is handed to another
  module (`onAssignXP`, `QuestSheet.js:813-818`); distribution is a manual GM action.
- **Quest tracker** (`apps/objective-display.js:70-100`): lists quests the player can observe AND the GM flagged
  `display`, each with its `available` objectives and counters, sorted by status order.
- **Relationships** (`EnhancedJournalSheet.js:721-770`): a map keyed by the other page's id, `{id, uuid, relationship
  (public label), secret, revealed, hidden}`. Allowed link targets: nine page types (`EnhancedJournalSheet.js:158-160`).
  A non-GM sees a link only if they can view the target and it is not `hidden` (`:749`). The `secret` label shows to the
  owner, or to everyone once the GM flips `revealed` (`sheet-relationships.hbs:28-37`, `onRevealRelationship`
  `EnhancedJournalSheet.js:2615-2622`).
- **Reverse links are automatic but not symmetric**: adding A→B also adds B→A with only ids and `hidden`; the label is
  not mirrored (`addRelationship`, `EnhancedJournalSheet.js:3176-3217`). So each side carries its own wording.
- **Person sheet**: free-form `attributes` with a per-field `shown` switch kept in sheet settings
  (`PersonSheet.js:62-76`); the player field list includes only shown fields (`PersonSheet.js:133-147`); plus `role` and
  `location` (`PersonSheet.js:124-125`).
- **GM-only tabs by type**: encounter monsters, loot and DCs are removed for non-GM viewers (`EncounterSheet.js:104-109`);
  place tabs for townsfolk/shops appear only when a relationship of that type exists (`PlaceSheet.js:63-71`).
- **External trigger sets status**: an Active Tiles action "change quest status" writes the status flag when a map tile
  fires (`monks-enhanced-journal.js:5196-5235`).
- As with every Foundry module, filtering happens on the client over a document the observer already holds.

## Overlap with Story Orchestrator

- **We do better**: quest/objective status derived from gates, rolled back with the chat; their status, counters and
  `awarded` are hand-written flags. Our player view never receives hidden rows; theirs filters at render.
- **They do, we don't**: numeric objective counters ("3/5"); several reward sets; per-row public/secret relationship
  labels with an explicit reveal; per-field attribute visibility on a person; typed entity pages (person, place,
  organization) that the Journal could index; a per-quest "show in tracker" flag.
- **Philosophically opposite**: XP and currency rewards (plan 36 defers XP/levels); manual reveal toggles where we want
  gates; multi-player permissions.

## Patterns (rubric table)

| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| Objective counter `done/required` bound to an int | data model | quest, widget | state-only | derivable | player-safe | OK | declarative (`steps[].progress`) | 5 | S | v2.7 36 Q1/Q5 |
| Relationship public label + secret label + reveal | data model | relationship | state-only | derivable | spoiler risk until revealed | OK | declarative (`label`, `secret`, `revealed_when`) | 4 | S | v2.7 37 L1 |
| Directed links, each side its own wording | data model | relationship | state-only | derivable | author-only values | OK | declarative (`toward`) | 3 | S | v2.7 37 L1 (confirms) |
| Per-field visibility on an entity sheet | UI rule | quality display | state-only | derivable | player-safe | OK | declarative (`display.public` per quality) | 3 | S | v2.7 36 Q2 (confirms) |
| Tab/section absent when it has no visible row | UI rule | journal | state-only | derivable | player-safe | OK | needs code | 4 | S | v2.7 36 P/W |
| Several reward sets, each visible/awarded | data model | quest | state-only | needs ledger (awarded latch) | player-safe | OK | declarative | 2 | M | v2.7 36 Q5 (one set enough) |
| Typed entity pages (person, place, org) | data model | journal | state-only | derivable | spoiler risk (unmet NPCs) | OK | declarative (roster + `known_when`) | 3 | M | new plan seed (Journal "People/Places") |
| Per-quest "show in tracker" flag | UI | widget | state-only | per-chat UI override | player-safe | OK | declarative (`pin`) or per-chat | 2 | S | v2.7 36 P |
| GM-only DC/monster tabs | UI rule | roll | state-only | derivable | author-only | OK | needs code | 3 | S | v2.7 36 Q3 (confirms `narrate: hidden`) |
| Trigger sets quest status (Active Tiles) | mechanic | transition | state-only | — | — | OK | needs code | 1 | — | no (ours is derived from gates) |
| XP / currency rewards, manual distribution | anti-pattern for us | quest | — | needs own ring | — | — | — | 1 | — | no (deferred) |
| Editor/read field-name drift (`complete` vs `status`) | anti-pattern | — | — | — | — | — | — | — | — | no (closed validator) |

## Notes per pattern

**Objective counter.** Theirs is a manual `done` integer against `required`. Ours: `steps[].progress?: {q: "<int
quality>", of: <int>}`; the step's `done_when` defaults to `q >= of` when `progress` is present and `done_when` is
absent (validator: `q` declared, int, `source: code` or extractor; `of` ≥ 1). The Journal shows "3/5" only when the step
is visible. Rendering a counter needs no new store: it reads the blackboard, so rollback is free. Same count rule as
FQL: totals from visible steps only.

**Public/secret relationship labels.** Theirs: `relationship` text always shown, `secret` text shown once `revealed`.
Plan 37 keeps relationship values private forever (validator refuses `display.public` on `rel_*`). That stays. What can
be public is authored wording, not numbers: `roster[].relationships[].label?` (player text, e.g. "Arin's sister") and
`secret?: {label, revealed_when}` where `revealed_when` is a gate. Before it holds, the player Journal shows only
`label`; after, `secret.label` too. The axis values never enter the player projection. This gives "reveal" drama
without a meter.

**Hide the empty section.** Both repos remove a tab when it has no visible row (`QuestSheet.js:111-121`,
`PlaceSheet.js:63-71`). An empty "Rewards" or "Objectives" heading is itself a hint that something hidden exists. Rule
for W/P: a panel section with zero projected items is not rendered (no "0 objectives" line); the spoiler property test
compares DOM with and without hidden items for equality.

**Entity pages.** A "People" and "Places" index in the Journal, built from roster members with `known_when?` gates and
authored player blurbs, would reuse the same projection. Seed only; plan 36 does not need it.

## Copy / Avoid

- Copy: step counters bound to an int quality; label vs secret label with a gate reveal; omitting sections that have no
  visible rows; per-quality public switch (already plan 36 Q2).
- Avoid: hand-set counters and statuses; XP/currency; several reward sets per quest (one is enough); manual reveal
  toggles; two names for one field (our closed validator prevents it).

## Licence note

GPL-3.0. Patterns only here; no code or text copied. GPLv3 code could legally be combined into an AGPL-3.0 work (both
licences' section 13), but we take no code. No game content.

## Verdict

Relevance **medium-high** (best prior art for plan 37 relationship wording and for step counters; quest model is a
superset of FQL's with no visibility advance). The one thing to take: **relationship rows carry a public label and a
gate-revealed secret label, while the axis numbers stay author-only.**
