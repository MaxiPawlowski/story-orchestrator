# Plan 65 — "Here now" scene card

**Status: candidate, owner decision required first.** Written 2026-10-14 from the extension harvest
(`61-harvest-triage-2026-10-14.md` H5). Not built, not queued. It **reopens v2.8 51 decision 2** ("no interim surface"), so the
owner decides before anything else. Implementation tier **D**; acceptance **D** (projection properties, Storybook) + a
session or an explicit owner decision (00-overview rule 4: player-visible surface). Overview: `00-overview.md` §Rules.

## What it is

- One compact player card that answers "where, when, with whom": the location word, the time label (only where the author
  displays time), the members present with their card portraits, and for each member what the player may already see about
  them: the public relationship label (51), standing word (53), keepsakes from them (58). Each line links to its full page
  in the codex (52).
- **It composes; it adds nothing.** Every line comes from another plan's player projection. If a plan is not built, its line
  is absent. A story with none of those features shows location and presence only (or no card, decision 3).
- A `scene` widget kind (v2.8 23 table) is its home, so an author places it like any other widget; a default placement in
  Overview is the owner's choice.

## History and evidence

- `docs/plans/v2.8/extension-research-2026-10-14/rpg-companion.md` P1 ("here now" card, value 4, M), P3 (relationship label as an
  avatar badge, inside P1), P2 (time-change chips, folded into v2.8 50), P4 (ambient weather layer, skipped), P6 (guard test:
  nothing of ours inside `.mes_text`, bundled in plan 69).
- `docs/plans/v2.8/51-relationship-labels.md:109` ("No interim Journal section") and decision 2 at `:188-189` ("wait; build on
  52's person pages (Astra: no interim surface that is removed at once)", revised 2026-10-14).

## Current state in code

Verified on master `9e96871d`.

- **HUD** `src/components/drawer/HudStrip.tsx:28-49`: scene name (`now.lines[0]`, `:30`), tension, pipeline/setup chip,
  pending count. No location, time, cast or relationship.
- **Overview** `PlayerOverview.tsx:57-70`: "Where you are" (scene, place, tension) from `narrative.ts`; no cast row.
- **Presence is computed but never shown.** `presentRosterIds` (`src/runtime/whereabouts.ts:7`) is read only by
  `runtime/wiring/talk.ts:20`.
- **The `roster` widget** is text only (`src/runtime/widgets.ts:163-174`) and emits `changedAgo` for rows (`:170-171`).
  `WIDGET_KINDS` (`src/engine/gameSchema.ts:117`) has no `scene` kind.
- **No thumbnail access**: `getThumbnailUrl` has 0 hits in `src/`; a portrait needs a new `stHost/avatars.ts`.
- Plans 50 §8 (time label only where displayed, `50-story-calendar.md:176-177`), 51 (labels on person pages), 52 (codex),
  53 (standing words; no recency on a player surface, `53-reputation-factions.md:182`), 58 (keepsakes on the giver's page or
  a Journal list).

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. `scene` widget, composed** | a widget kind reading 50/51/52/53/58 projections + presence; portraits via `stHost/avatars.ts`; author places it | M | reopens 51's decision; one more player surface |
| **B. A + default in Overview** | A, and Overview shows it when the story declares no `scene` widget | M | a surface the author did not ask for |
| **C. HUD line only** | location + present names in the HUD strip, no labels | S | crowds the HUD on mobile |
| **D. Wait for 52** | status quo: labels only on person pages | 0 | "who is here" has no answer in play |

## Recommendation

**A, built after 52 A; owner decides 51 decision 2 first.** The card is not interim (it stays after 52 ships, and links to
52's pages), which is the distinction Astra's objection turns on.

- **Projection.** `GameView.scene = { location: string | null, time: string | null, present: ScenePresent[] }`, with
  `ScenePresent = { name, portrait: string | null, label?, standing?, keepsakes?: number, page?: string }`. Built in the lazy
  game-layer chunk from: `presentRosterIds` filtered to members the player can see (enabled, not away); 52's `knownEntities`
  (an unknown member shows as present by card name only, nothing else); 51's `relations` (public label only; a secret label
  never, not even a badge, before its reveal latches); 53's standing word (no `changedAgo`, no trend); 58's count of
  keepsakes from that member; 50's time label only when the story displays time.
- **Badge (P3).** An optional authored `badge` on a public label (closed icon set, like `WIDGET_ICONS`); shown on the card
  portrait's corner with the word in a tooltip. Never on ST's own `.mes` avatars (architecture guard on message DOM).
- **Portraits.** `stHost/avatars.ts` wraps `getThumbnailUrl('avatar', file)`; `avatar === 'none'` falls back to initials.
  Typed result, capability-probed.
- **Copy** from `narrative.ts` (one player-copy source), checkpoint names, never ids.
- **Widget** `scene` added to `WIDGET_KINDS`, Studio preview, guide topic `widget-scene`; registry feature `scene-card`, on by
  default once built (rule 9).

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| N1 | Byte-identical spoiler properties: for ≥ 500 generated stories the card's text equals the union of 51/52/53/58 player views plus presence and the displayed time; 0 extra strings | 0 extras | D |
| N2 | Unknown member: present by card name only; 0 label/standing/keepsake strings for a member not in `knownEntities` | 0 | D |
| N3 | Secret label never shown (text or badge) before its reveal latches; property over ≥ 500 seeds | 0 | D |
| N4 | No recency: 0 `changedAgo`/trend fields in the scene projection | 0 | D |
| N5 | Away or disabled members never listed as present (4 scripted cast changes) | 4/4 | D |
| N6 | No time displayed → no time line; story with no feature data → location + presence only | holds | D |
| N7 | Mobile 390×844: the card renders without horizontal overflow (Storybook play + `so-responsive`) | holds | D |
| N8 | Rollback ≡ replay of the projection over 4 seeds | 4/4 | D |

Floors are informational and never retuned (rule 2).

## Gates by tier

- **D:** `npm run gates` incl. Storybook stories for the card (empty, full, unknown member, mobile); N1–N8;
  `so-ui.mts assert-player-clean`; a no-model lane scenario with a cast change.
- **Session or owner decision** (rule 4) before it is shown by default.

## Privacy and spoiler notes

- Reads player projections only; inherits every disclosure rule of 51/52/53/58 (N1–N3).
- No Adolion content; the campaign adopts the widget only on the owner's word.

## Dependencies and links

- v2.8 52 A (codex, `knownEntities`) first; 51, 53, 58 lines appear as they are built; v2.8 50 (time label, time-change chips:
  harvest addendum in 50); v2.8 23 (widget kinds).

## Decisions for the owner

1. **Reopen v2.8 51 decision 2: allow this card as a permanent (not interim) surface?** **Recommended: yes**, after 52 A.
2. **Placement: author-placed `scene` widget (A) or also a default in Overview (B)?** **Recommended: A.**
3. **Show the card when a story has none of 50/51/53/58 (location + presence only)?** **Recommended: yes.**
4. **Relationship badges on the card portrait?** **Recommended: yes**, authored, public labels only.

## Unresolved questions

- Should the narrator member appear as present? Proposed: no.
- Keepsakes as a count or as names? Proposed: a count with the names on the giver's page.
