# obsidian-gamified-pkm — v2.8 27 review

meta: https://github.com/saertna/obsidian-gamified-pkm · clone
`C:\dev\st-extensions-research\gamification\obsidian-gamified-pkm\source` @ `4fef614` (2026-07-13) · ★ 67 ·
downloads 6,295 · licence MIT (`LICENSE:1-3`, © 2023 saertna) · files read: `src/maturitycalculation.ts`,
`src/main.ts` (rating, points, streak, reset paths), `src/Utils.ts`, `src/data/{levels,constants}.ts`, `src/badges.ts`,
`src/GamificationMediatorImpl.ts`, `src/encryption.ts`, `manifest.json`.

## What it is

An Obsidian plugin that scores each note's "maturity" from structural features, writes per-note ratings into the
note's frontmatter, and turns rating *improvements* into points → levels → badges, with streak/booster multipliers and
a crafting side-game. One user, one vault.

## How it works

- **Maturity is state-only, computed from text structure, no model call**: note length class, title-length class,
  inlink and outlink count classes, and a "progressive summarization" class from the share of highlighted/bold text
  (`maturitycalculation.ts:72-99`, banded `if` ladders at `:200-330`). The overall rating averages the classes
  (`:200-228`; note it sums four terms but divides by five, and a high average falls off a cliff to 0 at `:227`).
- **Per-note state lives in the note's frontmatter**: keys `note-maturity`, `title-class`, `note-length-class`,
  `inlink-class`, `outlink-class`, `progressive-summarization-maturity`, written as the new value plus a direction
  arrow (`main.ts:39-47`, `:732-757`, `maturitycalculation.ts:276-289`).
- **Points are a ratchet on improvements only**: points = (new − old) × weight when the class rose, 0 otherwise
  (`Utils.ts:124-133`, applied `main.ts:630-674`; weights 100 for overall maturity, 10 per class, `constants.ts:3-4`).
  A note that degrades loses nothing. Bug: the overall-maturity branch passes a string literal instead of the
  frontmatter value (`main.ts:633`), so that comparison is against `NaN`.
- **Global totals live in plugin settings, AES-"encrypted" with a key hardcoded in the bundle** (`encryption.ts:4-8`,
  `GamificationMediatorImpl.ts:51-88`, `constants.ts:10`) — tamper deterrence, not security.
- **Levels** from a fixed points table (`data/levels.ts:7-30`, lookup `:211-221`); **badges** keyed to level
  thresholds (`badges.ts:9-31`), granted on level-up (`main.ts:1258-1268`).
- **Multipliers stack additively**: badge booster + streak booster + up to nine crafted boosters, some scoped by which
  rating produced the points (`main.ts:1209-1253`).
- **Streaks/decay**: daily/weekly note-creation challenges reset by wall clock (`main.ts:1000-1017`); the streak
  booster grows to a cap of 80 (`main.ts:1274-1290`) and on a missed week decays but **floors at the last multiple of 5**
  (`main.ts:1301-1313`) — a soft streak.
- **Randomness is Math.random**: crafting-ingredient drops (`GamificationMediatorImpl.ts:126`, `:183`) and notice texts
  (`randomNotificationText.ts:219-239`).

## Overlap with Story Orchestrator

- We do better: seeded draws; one durable store that rolls back (theirs splits truth across N note frontmatters plus an
  obfuscated settings blob, so a reverted note does not take its points back).
- They do, we don't: a **state-only, banded rating** of an artefact with a visible direction arrow; milestones
  (badges) as pure functions of a level.
- Opposite: points for producing more text and links is "XP for volume" — the analogue in our product would be XP for
  prose, which we refuse; streaks and wall-clock challenges reward session length.

## Patterns (rubric table)

| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| Banded rating of a number into 0–5 classes (`bands`) | mechanic | quality `display` (`as: word`/meter) | state-only | derivable | player-safe | N+1 OK | declarative | 3 | S | v2.7 36 Q2 |
| Direction arrow (↑ ↓ →) beside a shown value since last boundary | UI | widget, quality display | state-only | derivable (needs prior value from boundary snapshot) | player-safe | N+1 OK | declarative | 3 | S | v2.7 36 W `meters` |
| Badges = pure function of a threshold | data model | milestone | state-only | derivable | player-safe / secret | N+1 OK | declarative | 3 | S | v2.7 36 Q4 (confirms `when`) |
| Points only on improvement (ratchet) | mechanic | quality | state-only | ratchet itself fine if stored as a latching quality | player-safe | N+1 OK | declarative | 2 | S | no (latching already covers it) |
| Truth split across per-artefact metadata + settings blob | anti-pattern | — | — | unrollbackable | — | — | — | 1 | — | no |
| XP for text volume / links | anti-pattern | — | — | — | — | — | — | 1 | — | no |
| Wall-clock challenges, streak booster with floored decay | anti-pattern | — | wall clock | unrollbackable | — | — | — | 1 | — | no |
| Math.random drops | anti-pattern | roll | unseeded | unrollbackable | — | — | — | 1 | — | no |

## Notes per pattern

**Bands for display (Q2).** Their ladders map a raw count to a small ordinal. For our `display`, allow a numeric
quality to render as a word without an enum: `display: {public: true, as: "word", bands: [{max: 2, label: "wary"},
{max: 5, label: "steady"}, {label: "fearless"}]}` — validator: ascending `max`, last band open, labels player copy.
Keeps raw numbers out of player view (spoiler-safe) while staying state-only.

**Direction arrow.** A `trend: true` option on a public meter showing ↑/↓/→ versus the value at the previous boundary,
read from the boundary snapshots we already keep, so it rolls back for free.

## Copy / Avoid

- Copy: bands → words; trend arrows; badges as pure threshold functions.
- Avoid: truth in metadata that cannot roll back with the chat; volume XP; wall-clock streaks; unseeded randomness;
  "encryption" as tamper-proofing.

## Licence note

MIT; patterns only, nothing worth porting. Compatible with AGPL-3.0 if ever needed (keep the notice). No game content.

## Verdict

Relevance **low**. The one thing to take: **`bands` on a numeric public quality, rendered as a word with an optional
trend arrow** — a spoiler-safe way to show a meter.
