# Plan 65 — "Here now" scene card

**Status: candidate, owner decision required first. Revised 2026-10-16 after Astra's review (§Review 2026-10-16).** Written
2026-10-14 from the extension harvest (`61-harvest-triage-2026-10-14.md` H5). Not built, not queued. It **reopens v2.8 51
decision 2** ("no interim surface"), so the owner decides before anything else. Implementation tier **D**; acceptance **D**
(projection properties, Storybook) + a session or an explicit owner decision (00-overview rule 4: player-visible surface).
Overview: `00-overview.md` §Rules.

## What it is

- One compact player card that answers "where, when, with whom": the location word, the time label (only where the author
  displays time), and the **known** members present, each linking to their codex page (52).
- **Version 1 is small**: location, time, known present members, page links. Relationship badges, standing words and
  keepsake counts are a later version, each added only when its own plan is built and shows its own player view.
- **It composes; it adds nothing.** Every line comes from an existing player projection. A member the player has not met is
  not on the card at all: no name, no portrait.
- A `scene` widget kind (v2.8 23 table) is its home, so an author places it like any other widget. Being on by default once
  built does not put a widget in every story; the author places it (decision 2).

## History and evidence

- `docs/plans/v2.8/extension-research-2026-10-14/rpg-companion.md` P1 ("here now" card, value 4, M), P3 (relationship label
  as an avatar badge, inside P1), P2 (time-change chips, folded into v2.8 50), P4 (ambient weather layer, skipped), P6 (guard
  test: nothing of ours inside `.mes_text`, 69 K5).
- `docs/plans/v2.8/51-relationship-labels.md` ("No interim Journal section") and its decision 2 ("wait; build on 52's person
  pages (Astra: no interim surface that is removed at once)", revised 2026-10-14).

## Current state in code

Verified on master `e8b9dd6d`.

- **HUD** `src/components/drawer/HudStrip.tsx`: scene name, tension, pipeline/setup chip, pending count. No location, time or
  cast. **Overview** `PlayerOverview.tsx`: "Where you are" from `narrative.ts`; no cast row.
- **Presence.** `presentRosterIds` is "enabled minus away" (`src/runtime/whereabouts.ts:7-10`): away comes from character life
  schedules; without life it is every enabled member. It is not evidence of physical presence in the scene; the card says
  "with you" only in that sense.
- **Disclosure.** `knownEntities` keeps an enabled member unknown when its authored person entry has not latched
  (`src/engine/codex.ts:81-88`: a member with an own entry is known only by that entry; without one, while enabled).
- **The `roster` widget** is text only (`src/runtime/widgets.ts`); `WIDGET_KINDS` (`src/engine/gameSchema.ts`) has no
  `scene` kind.
- **Portraits.** Host code already builds a character image URL `/characters/<avatar>` (`spriteBuilderMembers`,
  `src/services/stHost/sprites.ts:83`). Thumbnail-sized images (`getThumbnailUrl`) are not wrapped; a thumbnail helper is an
  optimisation, not a new capability.
- Plans 50 §8 (time label only where displayed), 51 (labels on person pages), 52 (codex, built), 53 (standing words; no
  recency on a player surface), 58 (keepsakes on the giver's page or a Journal list).

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. `scene` widget, v1 small** | location, time, known present members, links; author places it | S | reopens 51's decision; one more player surface |
| **A+. A, then badges/standing/keepsakes** | each line added when its plan is built | +S each | more disclosure surface per line |
| **B. A + default in Overview** | Overview shows it when the story declares no `scene` widget | S | a surface the author did not ask for |
| **C. HUD line only** | location + known present names in the HUD | S | crowds the HUD on mobile |
| **D. Wait** | status quo: labels only on person pages | 0 | "who is here" has no answer in play |

## Recommendation

**A (v1 small), owner decides 51 decision 2 first.** The card is not interim: it stays after 52 and links to 52's pages, which
is the distinction Astra's 51 objection turns on.

- **Projection.** `GameView.scene = { location: string | null, time: string | null, present: ScenePresent[] }`, with
  `ScenePresent = { name, portrait: string | null, page: string | null }`. Built in the lazy game-layer chunk from
  `presentRosterIds` **intersected with `knownEntities(...).members`**. An unknown member is omitted entirely; the count of
  present members is not shown (a count would disclose an unmet member too). The narrator member is never listed.
- **Portraits** from the existing `/characters/<avatar>` path (as `src/services/stHost/sprites.ts:83`), only for listed
  members; `avatar === 'none'` falls back to initials. Optional later: a `stHost` thumbnail helper (typed result,
  capability-probed).
- **Copy** from `narrative.ts` (one player-copy source), checkpoint names, never ids. The heading says "With you", not "Here",
  because presence is enabled-minus-away.
- **Widget** `scene` added to `WIDGET_KINDS`, Studio preview, guide topic `widget-scene` (states the presence limitation);
  registry feature `scene-card`, on by default once built (rule 9).
- **Later lines (A+)**, each only with its plan built and each passing its own disclosure floor: 51 public label (a secret label
  never, not even a badge, before its reveal latches; badges authored from a closed icon set, never on ST's `.mes` avatars), 53
  standing word (no `changedAgo`, no trend), 58 keepsake count from that member.

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| N1 | Card text equals the union of the location, displayed time and the known-present names; ≥ 500 generated stories, 0 extra strings | 0 extras | D |
| N2 | Unknown member: a planted present member whose person entry has not latched contributes no name, portrait, initials, page link or count | 0 | D |
| N2p | Planted unknown portrait: no `/characters/` URL or `<img>` for an unknown member in the rendered card (Storybook + no-model scenario DOM) | 0 | D |
| N3 | A+ only: a secret label never shown (text or badge) before its reveal latches; property over ≥ 500 seeds | 0 | D |
| N4 | A+ only: no recency (`changedAgo`, trend) in the scene projection | 0 | D |
| N5 | Away or disabled members never listed (4 scripted cast changes) | 4/4 | D |
| N6 | No time displayed → no time line; no codex → location and known members only | holds | D |
| N7 | Mobile 390×844: the card renders without horizontal overflow (Storybook play + `so-responsive`) | holds | D |
| N8 | Rollback ≡ replay of the projection over 4 seeds | 4/4 | D |

Floors are informational and never retuned (rule 2).

## Gates by tier

- **D:** `npm run gates` incl. Storybook stories for the card (empty, full, planted unknown member, mobile); N1–N2p, N5–N8
  (N3, N4 with A+); `so-ui.mts assert-player-clean`; a no-model lane scenario with a cast change and an unknown member.
- **Session or owner decision** (rule 4) before it is shown anywhere by default.

## Privacy and spoiler notes

- Reads player projections only and drops unknown members before rendering (N2, N2p). Names and portraits both count as
  disclosure.
- No Adolion content; the campaign adopts the widget only on the owner's word.

## Dependencies and links

- v2.8 52 (codex, `knownEntities`, built); 50 (time label; time-change chips in its addendum); 23 (widget kinds); 51, 53, 58 for
  A+ lines.

## Decisions for the owner

1. **Reopen v2.8 51 decision 2: allow this card as a permanent (not interim) surface?** **Recommended: yes.**
2. **Placement: author-placed `scene` widget only (A), not a default in Overview (B)?** **Recommended: A.**
3. **v1 = location, time, known present members, links; badges, standing and keepsakes later?** **Recommended: yes.**

## Unresolved questions

- Keepsakes (A+) as a count or as names? Proposed: a count with the names on the giver's page.

## Review 2026-10-16 (Astra)

Source: `review-astra-harvest-2026-10-16.md` §2 (65). Verified on `e8b9dd6d`.

- **P0 — N2 showed an unknown member's card name.** Accepted: `knownEntities` keeps such a member unknown
  (`src/engine/codex.ts:81-88`). → unknown members are omitted entirely (name, portrait, initials, link, count); N2 rewritten,
  N2p added.
- **P2 — `presentRosterIds` is enabled minus away, not physical presence.** Accepted (`src/runtime/whereabouts.ts:7-10`). →
  limitation stated in current state, copy ("With you") and guide topic.
- **P2 — N1 compares to projections without establishing their safety.** Accepted. → N2/N2p plant an unknown identity and a
  portrait.
- **Start small; badges, standing, keepsakes later; keep the explicit surface decision.** Adopted (v1 and A+; author-placed;
  default-on does not place a widget).
- **"Portrait needs a new host module" overstated.** Accepted (`src/services/stHost/sprites.ts:83`). → reuse the existing URL;
  a thumbnail helper is optional.
- Rebutted: none.
