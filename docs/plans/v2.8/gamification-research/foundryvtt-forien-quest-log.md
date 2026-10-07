# Forien's Quest Log (FoundryVTT) — v2.8 27 review

meta: https://github.com/Forien/foundryvtt-forien-quest-log · clone path
`C:\dev\st-extensions-research\gamification\foundryvtt-forien-quest-log\source` @ `cf80921` (2025-05-02) · ★ 25 ·
downloads unknown · licence MIT (`LICENSE`: "MIT License", © 2020-2021 Wojciech "Forien" Szulc, AUTHORS); no game
content shipped · files read: `src/model/Quest.js`, `src/model/constants.js`, `src/control/db/Enrich.js`,
`src/control/db/QuestDB.js` (observability, create), `src/control/Socket.js` (status changes), `src/control/ModuleSettings.js`
(countHidden, showTasks), `templates/quest-preview.html`, `templates/partials/quest-preview/details.html`, `lang/en.json`
(countHidden strings). Not read: views/handlers beyond grep, DB migrations, tracker internals.

## What it is

A Foundry VTT module that stores quests as JSON in a journal entry's module flags and renders a quest log (tabs per
status), a quest sheet (details, GM notes, player notes, management) and a floating tracker. The GM moves quests
between five status lanes by hand; objectives ("tasks") and rewards are lists inside the quest, each with its own
hidden flag. Visibility rides on Foundry document ownership, so quests can be party-wide or "personal" to some players.
Nothing is derived: every state change is a manual click or an API call.

## How it works

- **Quest record** (`src/model/Quest.js:455-547`): name, status, giver (a Foundry UUID or the string `abstract` plus a
  free giver name), description (player-facing rich text), `gmnotes`, `playernotes`, image/splash, location, priority,
  type, `parent` (one quest id), `subquests` (ids), `tasks[]`, `rewards[]`, `date {create,start,end}`. Serialized
  whole by `toJSON` (`Quest.js:770-793`) into one flag (`save`, `Quest.js:645-664`).
- **Status lanes** (`src/model/constants.js:34-40`): `active`, `available`, `completed`, `failed`, `inactive`.
  `inactive` is the "hidden" lane: no non-GM sees it (`Quest.js:256-267`, `QuestDB.js:1072-1097`). `available` is
  "offered, not yet taken"; a setting lets players accept (move to active) themselves (`Socket.js:300-323`,
  `constants.js:85`). An unknown status sanitizes to inactive (`Quest.js:549-550`).
- **Dates are wall-clock**: `setStatus` stamps `Date.now()` into start/end per lane (`Quest.js:680-705`).
- **Task** (`Quest.js:934-1033`): `{name, completed, failed, hidden, uuidv4}`; a three-state cycle open → done → failed
  → open (`toggle`, `Quest.js:1005-1020`). Failure is per objective, not only per quest.
- **Reward** (`Quest.js:845-929`): `{type: item|actor|abstract, data, hidden, locked, uuidv4}`. `hidden` hides it from
  players; `locked` (default true) stops players from dragging an item reward onto their actor (claiming it)
  (`Enrich.js:318-331`).
- **Player filtering is a presentation filter**: if the viewer cannot edit, hidden tasks and rewards are dropped from
  the enriched view (`Enrich.js:349-353`). The quest JSON with every hidden task, reward and the GM notes still sits in
  the document flag that any OBSERVER client receives. GM notes are a GM-only tab (`templates/quest-preview.html:5-7`,
  `:33-36`); inline secret blocks in the description render only for editors/owners (`Enrich.js:162-165`).
- **Counts can leak hidden objectives**: the "N/M objectives" label counts hidden tasks and all subquests when the world
  setting `countHidden` is on (`Enrich.js:267-276`; hint "will include hidden objectives", `lang/en.json:214-216`),
  otherwise only visible ones (`Enrich.js:277-288`). Default off (`ModuleSettings.js:140-146`).
- **Sub-quests**: a quest lists child ids; children appear inside the parent's objectives only when the viewer may
  observe them (`Enrich.js:211-262`), and a child links back to its parent only if the parent is observable
  (`Enrich.js:192-199`).
- **Per-player visibility** ("personal" quest): ownership below OBSERVER by default but OBSERVER for some players
  (`Quest.js:286-309`, `getPersonalActors` `:405-428`). `isHidden` = no player can observe (`Quest.js:215-240`).
- **Player-created quests** land in `available` (or `inactive` for trusted editors) with the creator as owner
  (`QuestDB.js:381-387`). Players may write `playernotes` through a GM-relayed socket message (`Socket.js:657`).
- **Primary quest**: one world setting names the pinned quest; leaving `active` clears it (`Quest.js:707-715`).
- **Status change to hidden closes an open preview** on player clients (`Socket.js:577-586`).

## Overlap with Story Orchestrator

- **We do better**: status is derived from gates over rolled-back state (plan 36 Q1 `questStatus(...)`, never stored);
  theirs is stored and hand-toggled, with `Date.now()` stamps that no swipe could undo. Our player view will never
  receive hidden items at all (plan 36 W: "hidden items never enter the view"), while theirs ships them to the client
  and filters at render.
- **They do, we don't (yet)**: an `available` lane (offered, ignorable); per-objective failure; reward visibility
  independent of quest visibility; a quest giver; sub-quests; a "primary" pin; inline author-only notes per quest; a
  visible-only progress count.
- **Philosophically opposite**: multi-player ownership (personal quests, player-created quests, player claim of
  rewards). We have one player and the author; per-player permissions do not apply.

## Patterns (rubric table)

| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| Five status lanes incl. `available` (offered, ignorable) | data model | quest | state-only | derivable | player-safe | OK | declarative (`offered_when`) | 4 | S | v2.7 36 Q1 |
| Per-objective three-state (open/done/failed) | data model | quest | state-only | derivable | player-safe | OK | declarative (step `failed_when`) | 4 | S | v2.7 36 Q1 |
| Count only visible objectives (no countHidden option) | UI rule | journal | state-only | derivable | spoiler risk if inverted | OK | needs code | 5 | S | v2.7 36 Q5/W |
| Reward hidden independently of quest | data model | quest | state-only | derivable | player-safe | OK | declarative (`reward.label`, `reward.visible_when`) | 3 | S | v2.7 36 Q5 |
| Quest giver (roster member) | data model | quest, relationship | state-only | derivable | player-safe | OK | declarative (`giver`) | 3 | S | v2.7 36 Q1, v2.7 37 L3 |
| Sub-quest via `parent` (visibility inherits) | data model | quest | state-only | derivable | spoiler risk (child before parent) | OK | declarative (`parent`) | 2 | M | v2.7 36 deferred |
| GM notes tab / inline secrets per quest | authoring format | quest | state-only | n/a (authored) | author-only | OK | declarative (`author_note`) | 3 | S | v2.7 36 Q1 |
| Primary/pinned quest in tracker | UI | widget | state-only | per-chat UI override | player-safe | OK | needs code | 2 | S | v2.7 36 P |
| Hidden data shipped to client, filtered at render | anti-pattern | journal | — | — | spoiler risk | — | — | — | — | no (confirms W rule) |
| Wall-clock start/end dates | anti-pattern | journal | — | unrollbackable | — | — | — | — | — | no (use boundary/message id) |
| Personal quests / per-player ownership, player claim | anti-pattern for us | quest | — | — | — | solo-only assumption inverted (multi-player) | — | — | — | no |
| Player-created quests, player notes | mechanic | journal | state-only | needs own ring | player-safe | OK | needs code | 1 | M | no (plan 36 defers player-editable sheets) |

## Notes per pattern

**`available` lane.** Their `available` is a GM-set status the player may accept. Our shape: optional
`offered_when?` gate on a quest; status order becomes `hidden → offered → active → done | failed`, with `active` meaning
`started_when` holds (or, if no `started_when`, the old `visible_when` behaviour). Journal shows offered quests under
"Leads" with title only. Agency rule (validator + guide): a quest's `failed_when` must not reference only the passage
of checkpoints while it is merely offered; declining an offer is never a failure. This turns the agency policy into
schema.

**Per-step failure.** FQL tasks fail individually (`Quest.js:1005-1020`). Plan 36's steps have only `done_when`. Add
`steps[].failed_when?` and render a struck step; a failed step does not fail the quest unless the quest's own
`failed_when` says so. Step status is derived exactly like quest status (`open | done | failed | hidden`).

**Visible-only counts.** FQL's `countHidden` turns the "2/5" label into a spoiler oracle: the denominator reveals that
hidden objectives exist (`Enrich.js:267-276`). This is the same leak class as our v2.7 K1 rule (an alert that appears
only when a secret is held reveals the secret). Rule for plan 36: any count in a player projection is computed from the
projected (visible) items only; no setting may change that; the W property test also asserts "count == number of
visible items" over random states.

**Reward visibility.** FQL and Monk's both hide rewards separately from the quest. Plan 36 forbids reward effects in
player copy, but a player-facing promise ("the guild will owe you") is useful. Shape:
`reward?: {set, effects, label?, visible_when?}` where `label` is player text, absent = nothing shown; `visible_when`
absent = shown only once the quest is done. `effects` and `set` stay author-only.

**Giver.** `giver?: "<roster id>"` (validator: declared roster member). Journal shows the member's card name; v2.7 37
agendas and the scope source may read it (a giver present in the window pulls the quest's keys).

## Copy / Avoid

- Copy: `available`/offered lane; per-step failed state; reward visibility split; giver; a per-quest author note.
- Copy as a rule: counts from the projected set only.
- Avoid: stored status and hand toggles (ours is derived); wall-clock dates (use the boundary/message id at which the
  status first held, read from the boundary log); shipping hidden data to the player surface; per-player ownership;
  player claim/drag of rewards; deep sub-quest trees (one level at most, if ever).

## Licence note

MIT. Patterns only are used here; MIT code would be compatible with AGPL-3.0 if ever reused, with attribution. No game
content.

## Verdict

Relevance **high** (closest prior art to plan 36 Q1/Q5 and its spoiler rules). The one thing to take: **counts and
lists in the player Journal are computed only from the visible projection**, never from the full quest, and the
`offered` lane makes refusal a first-class, unpunished state.
