# Plan 50 — Story calendar

**Status: WRITTEN 2026-10-14 (owner decision 2026-10-14: these roleplay mechanics go into v2.8, plans written now).
Not decided, not built.** Pattern G13 of `v2.8/27-gamification-report.md`. Implementation tier D. Acceptance:

- CL for the read changes (shared read on the memory/orchestrator route, director on the authoring route);
- RP for the final-suite row.

**The premise "L4 gates on time with no convention" is stale.** v2.7 37 built a story clock on 2026-10-07: `time_of_day`
plus `story_day` (§Current state). What does not exist is a **calendar** (date, weekday, month, season), a single
story-time number, and any writer other than the shared read. This plan builds those on top of the clock.

## What it is

- **One rolled-back story-time int, `story_time`:** the number of day parts elapsed since the story's start. It is a
  code quality, written only at a committed boundary, so a swipe rolls it back and a replay rebuilds it.
- **Everything else is derived, read-only:**
  - `time_of_day` and `story_day` (today's keys, kept by name);
  - `is_night`;
  - with an authored `calendar`: `cal_weekday`, `cal_day_of_month`, `cal_month`, `cal_season`, `cal_year`, and a
    player label ("Day 4, evening" or "3rd of Thawmonth, morning").
- **Who advances time:**
  1. **The shared read**, one part forward per boundary at most. This is today's producer, kept.
  2. **Authored effects**, on checkpoint entry. This was v2.7 37 producer (1), never built.
  3. **An explicit time-skip read**, for "the next morning" or "three days later". New; it needs a CL floor.
  4. **The living director**, as a validated op on a generated anchor.
  5. **Scene breaks**, only when a story opts in.
  Every writer is clamped, and none runs on wall-clock (trap 2).
- **Consumers:**
  - character-life schedules and mood (v2.7 37 L2/L4);
  - agendas (v2.7 37 L3);
  - quests (v2.7 36), for deadlines as ordinary gates;
  - widgets (v2.7 36 W / v2.8 23): `clock`, `timeline`;
  - promises (v2.8 47, written in parallel on `v2.8-plans-45-47`);
  - the director (v2.8 22, v2.8 48).

## History and evidence

- `v2.8/27-gamification-report.md`:
  - Ranked row 6: calendarium, "one rolled-back `story_day` int + authored calendar → derived keys".
  - Ranked row 15: simple-calendar, "time is one code quality transitions advance".
  - G13: S, R, player-safe, value 5, effort S–M, targets v2.7 37 L4, v2.8 22 and a new seed.
  - The v2.7 37 L4 row: "gates on 'time' but no time convention exists … `story_day` int … `time_of_day` enum, advanced
    by authored effects `effects.time {advance, set_part}` … optional authored `calendar {weekdays, months[],
    moons[]}`".
  - §Decided 2026-10-07, decision 3: the clock was absorbed into v2.7 37 L4 (`story_day` + `time_of_day` only;
    calendar later).
  - Traps T2 (wall-clock, streaks), T3, T8 and T9.
- `v2.7/37-character-life.md`:
  - §Adopted harvest (`:297-308`): producers (1) authored effects and (2) the read. Clamped forward within a visit, one
    step per boundary, at most +1 day per boundary. A group round counts as one step. Continue adds none, a swipe rolls
    back, OOC never advances, reopen ≡ continuous. Live row v2.7 39 S-19.
  - Gate-record deviation (`:405`): "no authored checkpoint `set` effect exists, so producer (1) is not built; the
    clock moves by the read (one step a turn) and the code day count."
- `docs/authoring/story-guide.md:20`: "Effects are rebuilt from the path the chat took, so they must depend on the path,
  never on the clock."

## Current state in code

Verified on master `211d8d96`.

- **No calendar.** `grep -rniE "calendar|season|weekday|cal_" src docs/authoring` matches only unrelated test strings
  (lore text in `curatorTiers.review.test.ts:159` and `stagecraft/*.test.ts`). There is no `story_time`.
- **The clock (v2.7 37 L4):**
  - Keys: `src/engine/lifeSchema.ts:9-11` (`story_day`, `time_of_day`, `life_time_seen`). Type: `StoryClock {times,
    start_day?}` (`:58-61`). `isLifeKey` (`:95`) reserves both keys.
  - Validator: `src/engine/validate/life.ts:150-159` `readClock` (at least two times; `start_day` ≥ 1).
  - Compiled qualities (`:199-207`):
    - `time_of_day` is a **`source: extractor`** enum, `read_as: choice`, `step_rule {step: 1, cycle: true}`;
    - `story_day` is a code int, monotonic;
    - `life_time_seen` is code.
  - Derive: `src/engine/life/derive.ts:47-55` `clockWrites`. The day becomes +1 when the read's time wraps back
    (index ≤ last seen).
  - Step resolution of the read: `src/extraction/parse.ts:150` (`resolveStep(quality.step_rule, word, values[q])`,
    against the read key's own current value).
  - Scene marker for mood: `location|time_of_day` (`derive.ts:17`).
  - Schedules: `src/runtime/whereabouts.ts:4,7`.
  - Wizard tool `setClock`: `src/copilot/agent/tools.ts:191`.
  - Guide: §Character life (`story-guide.md:493-495`).
- **Code may not write an extractor quality.** The blackboard refuses a source mismatch (`src/engine/blackboard.ts:79`).
  So no effect or director op can move today's `time_of_day`. That is why producer (1) was never built.
- **`state_snapshot` is not applied.** It is validated (`src/engine/validate.ts:72-75`) and read as an expectation by
  the critic and scope (`generation/critic.ts:40,55`; `extraction/scope.ts:69`). It cannot set the time.
- **Wall-clock in the engine:** `elapsed` is seconds of real time since checkpoint entry
  (`src/engine/engine.ts:474-475`, `host.now()`). It is a mechanical quality an author opts into, and it is out of
  this plan's scope, apart from §Decisions 5.
- **Quests:**
  - No deadline field. Deadlines are `failed_when` gates (`src/engine/gameSchema.ts:57-72`).
  - The validator rule "an offered quest cannot fail on time alone" uses
    `TIME_KEYS = [message_count, messages_in_checkpoint, elapsed, player_turns_in_checkpoint]`
    (`src/engine/validate/quests.ts:19,248`). **`story_day` and `time_of_day` are missing**, so an offered quest that
    fails on `story_day >= 5` passes the validator. This is a small existing gap, fixed in T6.
- **Widgets:**
  - `clock` binds one int quality with display min/max 2–12 apart (`src/engine/validate/widgets.ts:78-82`).
  - `timeline` takes authored `dates: {checkpointId: label}` (`:298-300`). Nothing derives a date.
- **Effects:** `CheckpointEffects` (`src/engine/schema.ts:128-140`) has no `time` field.
- **Living director:** `DirectorInput` (`src/generation/living/prompt.ts:19-37`) carries no time. Its ops are checked by
  `checkDirectorOps` (`src/generation/living/plan.ts:160`).

## Options

| | Design | Cost | Risk | Needs |
|---|---|---|---|---|
| **A. Calendar over today's clock** | Derive calendar fields from `story_day` + `time_of_day`. Effects may only add days (a code day offset). Time of day stays read-only by the model | S | Effects cannot set "morning"; deadlines need two keys; a day offset and the read can disagree | D |
| **B. One code int `story_time` as the truth** | `story_time` code int. `time_of_day`/`story_day` become derived code keys (same names, same values). The read writes an input key `life_time_read`, turned into forward steps by the derive seam. Effects, the skip read, the director and scene breaks add to `story_time`. Calendar derived | M | The read key is renamed (extraction prompt hunk); the step baseline must move to the derived value | D + CL (read parity) |
| **C. Time from wall-clock or message counts** | Days from real time, or N messages = 1 part | S | T2: unrollbackable or meaningless in fiction. Refused | — |
| **D. Keep today's clock, no calendar** | Nothing | 0 | Quests, promises and the director have no common time; authored time skips are impossible | — |

## Recommendation

**B, in two steps.** There is no backward compatibility to keep (AGENTS.md: no migrations), so the existing keys
change source without a migration. Story JSON keeps `clock` and gains `calendar`.

### B1 (D implementation; CL acceptance for the read rename)

1. **`story_time`.** A code int, monotonic, starting at `(start_day − 1) × P + start_part`, where `P = clock.times.length`.
   Written only in the derive seam (`runtime/stretchTurns.ts` → `deriveLife`). Derived each boundary:
   - `story_day = ⌊story_time / P⌋ + 1`;
   - `time_of_day = times[story_time mod P]`.
   Both become code qualities. Mood's scene marker, schedules and every authored gate keep working by name.
2. **Read input.** The shared read keeps the same rubric and criteria under the key `life_time_read`. A change of the
   read moves `story_time` forward by `(idx(read) − idx(time_of_day)) mod P` parts, clamped to 1 per boundary (today's
   clamp). The **step baseline is the derived `time_of_day`**, not the read key's last value, so a jump by an effect
   does not make the next read count twice.
3. **`effects.time`** on checkpoint entry: `{advance: {days?, parts?}} | {to: {part, next_day?: bool}}`.
   - It is replayed with the path, like earned effects, so a swipe undoes it.
   - The validator refuses a negative advance, more than `calendar.max_skip_days` (default 30), and an unknown part.
4. **`calendar`** (optional):
   `{start: {year?, month, day}, months: [{name, days}], weekdays?: [names], seasons?: [{name, from_month}],
   night: [part names], label?: "day" | "date"}`.
   - The derived code qualities `cal_*` and `is_night` are read-only.
   - Authored gates may name them. An authored write is refused, and so is a `display` value the projection cannot
     show.
   - Without `calendar`, only `story_day`, `time_of_day` and `is_night` (from `night`, default none) exist.
5. **Scene breaks:** `calendar.on_scene_break?: {parts}` (absent = no advance). It is applied at the boundary whose
   extraction audit carries `sceneBreak` (`extraction/parse.ts:178`), clamped to 1 day.
6. **Quest time rule.** `TIME_KEYS` gains `story_time`, `story_day`, `time_of_day`, `is_night` and `cal_*` (T6).
7. **Widgets.**
   - `clock` may bind a derived `time_part` int (`0..P−1`) when `2 ≤ P ≤ 12`.
   - `timeline` fills a missing `dates` label from the calendar label at the boundary the checkpoint was first reached.
   - A deadline clock (a widget whose bound quality appears in a quest `failed_when` or a promise due) defaults to
     `audience: "author"` (trap 9).
8. **Surfaces.**
   - Player: the time label only where the author puts it (a `display` on `time_of_day`/`cal_*`, or the `timeline`).
     Time of day and date are player-safe facts (G13).
   - Author view: `story_time`, the last writer (read, effect, skip, director, scene break) with boundary and message.

### B2 (CL acceptance)

1. **Skip read.**
   - The shared read gains one optional line family for an explicit skip in the window: `TIME_SKIP days=<n>
     part=<name>`, parsed into an advance of at most `max_skip_days`, applied at the boundary.
   - Only with `clock` declared. Fixtures are English (rule: English only).
2. **Director op.**
   - `DirectorInput` gains the current label ("Day 4, evening").
   - A generated anchor may carry `time: {advance}`, checked by `checkDirectorOps` (same limits as `effects.time`) and
     applied on entering that anchor.
   - Rollback drops later ops, so time follows.
3. **Agendas.** `pace: "per_days"` with `every` days, an addition to `per_chapter`/`per_n_boundaries`.

## Predeclared floors

Committed before any run; never retuned (00-overview rule 2).

| # | Condition | Floor | Tier |
|---|---|---|---|
| T1 | Rollback ≡ replay | `story_time` and every derived key: 0 mismatches over 4 seeds × 100 cuts mixing reads, effects, skips, director ops, scene breaks, OOC lines, Continue, swipes and reopen | D |
| T2 | Calendar derivation | 1,000 consecutive days over an authored calendar with months of unequal length, a weekday cycle not dividing the month, and 4 seasons: exact equality with an independent reference walker written in the test | D |
| T3 | Clamps | read ≤ 1 part per boundary; skip and director ≤ `max_skip_days` per boundary; `story_time` never decreases except by rollback (property) | D |
| T4 | No wall-clock | `engine/life/*`, the calendar module and the derive seam never call `Date`, `performance` or `host.now` (guard test with a planted call as control) | D |
| T5 | Clock parity | on `engine/life/life.test.ts`'s clock and schedule cases, `time_of_day`/`story_day` sequences and schedule drops are identical before and after the re-key (golden) | D |
| T6 | Offered-quest time rule | an offered quest with `failed_when` on any story-time key alone is refused; control on a non-time key passes | D |
| T7 | Player clean | with no `display` and no timeline, player surfaces are byte-identical with and without `calendar`; a deadline-bound clock is author-only by default | D |
| T8 | Read parity (B1) | the existing time windows of the live suite score within its per-tier floors with `life_time_read` (the rename does not cost accuracy); declared payload-golden hunk only on the key name | CL |
| T9 | Skip read (B2) | on 40 synthetic windows with an explicit skip, the parsed advance matches the label (days and part) on ≥ 0.90; on 40 windows without a skip, false advances ≤ 0.05; read prompt growth ≤ +5 % tokens for a story with `clock` | CL |
| T10 | Director time (B2) | 0 director ops over `max_skip_days` reach a story (guard); on 20 frozen frontiers, a second model rates the label-consistency of the anchor (no "morning" scene stated at night) ≥ 0.85 | CL |
| T11 | Played session | in the final suite, a schedule drop and its return happen with time advancing from the read and from one authored effect, and reopen keeps the label | RP |

## Gates by tier

- **D (B1):**
  - `npm run gates`: validator tests, the property tests T1/T3, the golden T2/T5, the guard T4, the quest validator T6,
    and Storybook for the Author-view time row and the timeline label.
  - The payload golden (`so-payload-golden.mts diff`) with the one declared key-name hunk.
  - A no-LLM group scenario that drives the clock through rounds, Continue, a swipe, an OOC line, an authored
    `effects.time` jump and a reopen. It asserts a schedule drop and return, and a quest failing on `story_day`. Run ×2
    on a no-model lane; it replaces v2.7 37's seeded-quality check with an exercised clock.
  - Registry: the `story-calendar` feature and Help.
  - Guide: §Character life splits out a §Story time topic (`clock`, `calendar`, `effects.time`), with guide coverage
    (`copilot/guideCoverage.test.ts`); then `npm run docs:guide` and `npm run docs:settings`.
  - Wizard: `setClock` gains `setCalendar`. `tools.test.ts` needs a tool, or a stated reason, for each new mutation.
  - Campaign: decide whether Adolion uses the calendar. If it does, change the campaign repo, bump
    `adolion-fresh.pin.json` and reinstall (AGENTS.md §Owner and product).
- **CL (B1 T8, B2 T9/T10):** the live suite (`so-live-suite.mts`, per-tier floors) on the memory/orchestrator route; the
  director replay on the authoring route; both ×2, route recorded.
- **RP:** T11 in the v2.8 final suite (v2.8 24).

## Privacy and spoiler notes

- **Odds and countdowns are spoilers (trap 9).** A deadline is a gate on story time. The time itself is player-safe,
  but "2 days left" reveals a hidden quest's or a promise's due date. Deadline-bound clocks default to author-only.
  A player widget may show time-of-day and date, never a countdown to a hidden gate.
- The skip read and the director see only the time label, never private plans beyond what they already receive.
- Calendar names are authored text in the story, not memory. No held secret can enter through them.
- No Adolion content here.

## Dependencies and links

- **v2.7 37** character life: the clock (L4), mood scene marker (L2), agendas (L3). B1 re-keys its clock.
- **v2.7 36** quests and widgets: deadlines as gates, `clock` and `timeline` widgets, `TIME_KEYS`.
- **v2.8 23** story widgets: `timeline` dates.
- **v2.8 22** living director: time label input and the `time` op (B2).
- **v2.8 47** promises (parallel): a promise's due time reads `story_time` and the derived keys. 47 owns the promise
  format; this plan owns the time keys.
- **v2.8 48 / v2.8 49:** a scene test or meter keyed to night or a day is a later row, not built here.
- **v2.7 35** open stretches: `max_turns` stays in player turns; it is not story time.

## Decisions for the owner

1. **Option B (one `story_time` truth, today's keys derived, read re-keyed to an input)?** **Recommended: yes.** It is
   the only option that lets authored effects and the director move time without fighting the extractor-source rule.
2. **Who advances time:** read + authored effects + skip read + director, with scene breaks only by story opt-in?
   **Recommended: yes.** Scene breaks are opt-in because a location change is not always time passing.
3. **Calendar scope:** months, weekdays, seasons and a start date, with no moons, holidays or leap rules for now?
   **Recommended: yes.** Holidays are gates on `cal_*` an author can already write.
4. **Default player visibility:** the time label is shown only where the author asks (a `display` or `timeline`), and
   deadline clocks are author-only by default? **Recommended: yes.**
5. **`elapsed` (real seconds since checkpoint entry, `engine.ts:474-475`):** leave it, or remove it as a T2 wall-clock
   trap? **Recommended: leave it for now** and point the guide at `story_time` for in-fiction time. Removal is its own
   change.

## Unresolved questions

- Must the skip read (B2) wait for v2.8 15's cue + scene-read merge, since both add line families to the same shared
  read? The proposal is to build after 15 lands, or to coordinate in one extraction prompt change.
- Is `on_scene_break` applied when the scene judge (`sceneTrigger`) confirms a break, or on the heuristic signal alone?
  The proposal is the audit's `sceneBreak` as recorded, whichever source produced it.
- Does a reopen with a truncated boundary log rebuild `story_time` exactly? It should, since it is a blackboard value in
  `engineHistory`. T1's reopen case proves it.
- Plan 47's due-time format (absolute day/part vs "within N days") is not known yet. This plan's read model must serve
  both.
