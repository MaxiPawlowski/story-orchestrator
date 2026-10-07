# kanka — v2.8 27 review (tier 2)
meta: https://github.com/owlchester/kanka · clone `C:\dev\st-extensions-research\gamification\kanka\source` @ `c700f46` (2026-09-23) ·
★ 358 · downloads n/a (hosted SaaS) · licence: `LICENSE` (11 lines) is **only** the "Commons Clause" License Condition
v1.0 (no right to "Sell" the Software; Software: Kanka; Licensor: Owlchester SNC); it refers to "the License" but **names
no underlying licence**, and `composer.json:11` says `"license": "proprietary"` — so no usable open grant · files read
(data model only, of 8,398): `app/Enums/{QuestStatus,Visibility,AttributeType}.php`, `app/Models/{Quest,QuestElement,
Relation,Calendar,Reminder,Attribute,Entity}.php`, `app/Models/Concerns/HasVisibility.php`,
`app/Models/Scopes/{VisibilityIDScope,PrivateScope}.php`, `app/Http/Requests/StoreRelation.php`,
`app/Services/Attributes/RandomService.php`, quest/relation migrations

## What it is
A Laravel worldbuilding wiki for tabletop campaigns: typed entities (characters, quests, locations, calendars…) with
relations, posts and attributes, shared between a campaign's admins and players. Its value to us is a mature
two-audience model (GM vs players) and plain quest/relation/calendar schemas.

## How it works
- **Quest:** status enum `notStarted | ongoing | completed | abandoned` (`QuestStatus.php:7-10`; was a boolean until
  migration `2026_03_06_140443`), `instigator_id`, `date`/`calendar_date`, `is_private` (`Quest.php:38-43`,
  `:171-181`). **Quest elements** link a quest to any entity with a free-text `role`, an `entry`, a colour and their
  own `visibility_id` (`QuestElement.php:44-57`) — per-row secrecy inside a public quest. No steps, no conditions:
  status is set by hand.
- **Relation:** `{owner_id, target_id, relation (label), attitude, visibility_id, mirror_id, is_pinned, colour}`
  (`Relation.php:55-65`); attitude is one int bounded −100..100 (`StoreRelation.php:36`). A two-way relation is a
  second row created as a copy with swapped ends, linked by `mirror_id` (`Relation.php:142-158`).
- **Visibility, two layers:** whole entity `is_private` = admins only (`PrivateScope.php:48-49`); sub-rows (quest
  elements, relations, posts) carry a 5-value enum `All | Admin | AdminSelf | Self | Member` (`Visibility.php:7-11`).
  Both are **global query scopes** (`HasVisibility.php:28-33`, `VisibilityIDScope.php:40-75`): a hidden row is never
  fetched for a viewer who may not see it; guests and non-members get `All` only (`:47-56`). Attributes have
  `is_private` + `is_hidden` + `is_pinned` (`Attribute.php:30-32`).
- **Calendar:** authored months, weekdays, years, seasons, moons, epochs, a current `date`, leap/reset rules
  (`Calendar.php:21-35`, `:47-62`); **reminders** pin an entity event to a date with `length`, recurrence
  (`is_recurring`, `recurring_periodicity`, `recurring_until`) and computed `elapsed` (`Reminder.php:20-39`).
- A `Random` attribute type resolves to `Arr::random` once at save and stores the result (`RandomService.php:67`) —
  unseeded.

## Overlap with Story Orchestrator
- We do better: quest status derived from gates; seeded chance; rollback.
- They do, we don't: per-row visibility *inside* a visible container; filtering at the data layer, not the view; a
  label + bounded number per relation; mirrored pairs.
- Opposite: multi-user ACL with roles; we have exactly two audiences (player, author) — keep it two, do not import
  their five.

## Patterns (rubric table)
| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| filter hidden rows at projection, never fetch | data model | widget, journal, quest | state-only | derivable | player-safe | OK | needs code | 5 | S | v2.7 36 W + spoiler checklist |
| per-row visibility inside a public container | data model | quest, widget | state-only | derivable | player-safe | OK | declarative | 4 | S | v2.7 36 Q1 (steps `visible_when`) |
| quest status incl. `abandoned` ≠ `failed` | data model | quest | state-only | derivable | player-safe | OK | declarative | 3 | S | v2.7 36 Q1 |
| quest elements: entity + role per quest | data model | quest, relationship | state-only | derivable | player-safe | OK | declarative | 3 | S | v2.7 36 Q1 (`involves[]`) |
| relation = label + bounded int, mirrored pair | data model | relationship | state-only (extractor writes) | derivable | author-only | OK | declarative | 4 | S | v2.8 20 (v2.7 37) L-relationships |
| calendar + recurring reminders | data model | clock, schedule | state-only | derivable | player-safe | OK | declarative | 2 | L | v2.8 20 schedules / new plan seed |
| unseeded random attribute at save | anti-pattern | roll | — | — | — | — | — | 1 | — | no |

## Notes per pattern
**filter at projection.** Their scope means a page can never render what the query never returned. Ours is the same
rule ("hidden items never enter the view, not hidden DOM"): `runtime/widgets.ts` and the Journal projection must take
the audience as an input and drop rows before building view objects; the player-view property test asserts on the
projection, not the DOM.

**per-row visibility.** Plan 36 Q1 already has step `visible_when`; Kanka adds the case of a *public* quest with a
*secret participant*. Suggest `quests[].involves?: [{roster_id, role, visible_when?}]` — role is a short label,
absent from the player view until its gate holds. Keep the audience binary: `visible_when` (player) vs always (author).

**status.** Distinguish player-chosen `abandoned` from story `failed`? Our agency policy says never punish refusal, so
an `abandoned_when?` (player walked away; neutral copy, no failure styling) is worth one optional field beside
`failed_when`. Derived, never stored.

**relation shape.** Kanka: one attitude −100..100 + a text label. Plan 37/20 uses several axes in [-5,5] per direction —
finer and better for bounded steps. Take the *label* (`relationships[].label?` for author view) and their explicit
mirror: do not auto-mirror; each direction is its own authored entry (A trusts B ≠ B trusts A), as plan 20 has it.

## Copy / Avoid
- Copy: data-layer filtering; per-row visibility; `abandoned` as a neutral end; relation label; recurring events.
- Avoid: five-level ACL; manual status; unseeded random values; copying any code (licence).

## Licence note
Commons Clause over an **unnamed** base licence, `composer.json` "proprietary": treat as **not reusable** — no code, no
text. Patterns (schema ideas) only, described in our own words. Not AGPL-compatible for code.

## Verdict
Relevance **medium-high** for plan 36 visibility. Take: **filter hidden rows at the projection layer with per-row
`visible_when` inside public quests**, plus an optional neutral `abandoned_when`.
