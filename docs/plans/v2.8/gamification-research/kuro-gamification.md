# Kuro Gamification — v2.8 27 review
meta: Obsidian plugin · clone path `C:\dev\st-extensions-research\gamification\kuro-gamification\source` @ `c0a8f45` (2026-10-04) ·
★ 0 · downloads 856 · licence AGPL-3.0-or-later (`LICENSE`, `LICENSING.md`; dual-licensed, commercial on request); docs
CC BY-SA 4.0 (`LICENSE-DOCS`) ·
files read: `src/engine/LootEngine.ts`, `src/utils/seededRandom.ts`, `src/engine/StreakEngine.ts`, `src/engine/XpEngine.ts`
(aggregate), `src/main.ts` (refresh + regen), `docs/philosophy.en.md`

## What it is
XP, levels, streaks and "loot" (self-chosen rewards) computed from checkboxes in daily/weekly notes. Its stated design
is anti-compulsion: everything off by default, streak freeze tokens so one missed day is not a cliff, deterministic
loot with no re-roll, and an XP breakdown that explains every point. Solo, real-time.

## How it works
- **XP is a fold over sources, recomputed each refresh**: dailies, weeklies, streak bonus, manual adjustments (each
  with a mandatory reason), task notes → `{total, rows[]}` (`src/engine/XpEngine.ts:135-175`, `src/main.ts:253-260`).
  Stored state is small: `redeemedDrops[]`, `manualXpAdjustments[]`, freeze tokens (`src/types.ts:198`, `:202`).
- **Streak**: a pure walk back from today over a set of qualifying dates (day ≥ threshold %) (`src/main.ts:238-249`,
  `StreakEngine.ts:26-56`); a gap is absorbed by a freeze token only once the streak has started (`:40-46`). Bonus
  tiers multiply streak length (`:58-65`). Tokens reset monthly (`:80-91`, `src/main.ts:662-674`); `freezeUsed` is
  recomputed, never decremented, so N tokens cover N gaps across the whole lookback, not per month (quirk).
- **Loot seed**: drops available = level − 1 − redeemed (`LootEngine.ts:11-14`); tier from a level table (`:16-18`);
  options = shuffle(pool, seed) with seed = level·1000 + redeemed·37 + pool length (`:34-37`), PRNG = fractional part
  of sin(seed+1)·10000 (`src/utils/seededRandom.ts:6-9`, Fisher-Yates `:11-18`). Stable until a redeem changes the
  seed; no re-roll control (`docs/philosophy.en.md:48-54`).
- **Philosophy**: opt-in to anything that escalates (`philosophy.en.md:32`), "a missed day is just a missed day"
  (`:36-42`), transparent XP (`:58-68`).

## Overlap with Story Orchestrator
- We do better: our seed is hash(chat, story, checkpoint-entry boundary, key) — keyed by identity, so independent draws
  never collide and editing an unrelated pool does not reshuffle. Theirs is arithmetic over counters (level 2/redeem 27
  and level 3/redeem 0 differ by 1 only through pool length; adding a pool item reshuffles every pending offer) and a
  sin PRNG with visible correlation.
- Same idea, different clock: "stable until consumed" ≈ our "stable until checkpoint re-entry"; both make a swipe or a
  reopen show the same draw.
- They do, we don't: every number carries an explanation row; freeze as forgiveness rather than punishment.

## Patterns (rubric table)

| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| explained total (value + contributing rows) | UI | quality, widget | state-only | derivable | author-only (rows) / player-safe (sum) | OK | needs code | 4 | M | v2.7 36 Q2 |
| offer stable until claimed, no re-roll | mechanic | roll, quest reward | seeded draw | derivable | player-safe | OK | declarative | 3 | S | v2.7 36 Q3 |
| forgiveness token absorbing a miss | mechanic | clock, quest | state-only | derivable | player-safe | OK | declarative | 2 | M | v2.7 35 |
| everything escalating is opt-in | authoring format | — | — | — | — | OK | declarative | 3 | S | v2.7 36 (defaults) |
| counter-arithmetic seed + sin PRNG | anti-pattern | roll | — | — | — | — | — | 1 | — | no |
| streak bonus | anti-pattern | — | state-only | derivable | — | solo | — | 1 | — | no |

## Notes per pattern
- **Explained total** → a `display` quality in plan 36 should be able to show "why": the blackboard already logs which
  boundary/write set a value. Author view gets `{value, contributions: [{boundary, source: code|extractor|reward,
  questId?, delta}]}` derived from boundary logs; player view gets the number only.
- **Stable offer** → a visible check's roll keyed by the check id (not a counter), shown once and never re-rollable by
  swiping; matches our existing `roll` semantics. Do not add a "redeem" counter to the seed.
- **Forgiveness** → if a quest gets a deadline (`failed_when` over a v2.7 35 clock), allow `grace: n` boundaries before
  failure. Cheap, and it softens failure in line with the agency policy.

## Copy / Avoid
- Copy: explanation rows; opt-in defaults; "a miss is not a collapse" as a design rule for `failed_when`.
- Avoid: their seed recipe; streaks of any kind (session length is not story progress).

## Licence note
AGPL-3.0-or-later code: licence-compatible with our AGPL-3.0, but nothing here is worth copying; patterns only. Docs are
CC BY-SA 4.0 — do not paste philosophy text.

## Verdict
Medium (design ethic), low (code). Take: every visible number has a derivable explanation (author view), and failure
gets grace instead of a cliff.
