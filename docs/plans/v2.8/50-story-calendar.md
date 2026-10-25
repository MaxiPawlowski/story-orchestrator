# Plan 50 — Story calendar

**Status: B1a + B1b + B1c core BUILT 2026-10-15 on `v2.8-p50-time` (not merged; owner: yes to all recommendations).
Live lane, CL, RP and B1c surfaces, B2, B3 owed (§Gate record 2026-10-15).** Pattern G13 of `v2.8/27-gamification-report.md`. Implementation tier D. Acceptance:

- CL for the read changes (shared read on the memory/orchestrator route, director on the authoring route);
- RP for the final-suite row.

**Revised 2026-10-14 against the Astra review**: §Review 2026-10-14 (Astra) records each finding; the shared contract
(SC1–SC5) lives in v2.8 52 §Review 2026-10-14 (Astra). B is now built in four steps (canonical time + read parity →
entry advances → calendar formatting → skip read and director); scene-break advancement is deferred.

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
  5. **Scene breaks**, only when a story opts in. **Deferred** (revised 2026-10-14) until 1–4 prove stable.
  Every writer is clamped, arbitrated per boundary (§Recommendation, Writer arbitration), applied exactly once, and
  none runs on wall-clock (trap 2).
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

**B, in four steps** (revised 2026-10-14, Astra's sequence): **B1a** canonical `story_time` + read parity; **B1b**
authored entry advances; **B1c** calendar formatting; **B2** skip read and director op. Scene-break advancement
(old item 5) is **B3, deferred** until B1–B2 have run stable. There is no backward compatibility to keep (AGENTS.md:
no migrations), so the existing keys change source without a migration. Story JSON keeps `clock` and gains `calendar`.

### B1 (D implementation; CL acceptance for the read rename). B1a = items 1–2 and 6; B1b = item 3; B1c = items 4, 7, 8

1. **`story_time`.** A code int, monotonic, starting at `(start_day − 1) × P + start_part`, where `P = clock.times.length`.
   Written only in the derive seam (`runtime/stretchTurns.ts` → `deriveLife`). Derived each boundary:
   - `story_day = ⌊story_time / P⌋ + 1`;
   - `time_of_day = times[story_time mod P]`.
   Both become code qualities. Mood's scene marker, schedules and every authored gate keep working by name.
2. **Read input (a parser and resolution change, not a rename).** Today the read key is stepped in the parser against
   its own stored value (`src/extraction/parse.ts:149-151`, `resolveStep(quality.step_rule, word, values[q])`).
   - `life_time_read` is compiled as a plain extractor choice over `clock.times` **with no `step_rule`**, so the parser
     stores the absolute part word the read names and never steps it.
   - The derive step (SC2 step 3) turns it into an advance: `(idx(read) − idx(time_of_day)) mod P` parts against the
     **derived** `time_of_day`, clamped to 1 per boundary (today's clamp).
   - **Stale reads.** Each applied read carries its window end (`turnRange.to`). If a non-read writer advanced time at
     a boundary whose `lastMessageId` is after that window end, the read is stale and yields no advance (the effect
     already moved time past what that window described).
   - `life_time_seen` is retired; `story_time` is the only history.
3. **`effects.time`** on checkpoint entry: `{advance: {days?, parts?}} | {to: {part, next_day?: bool}}`.
   - Computed in the **pure entry pass** (SC2 step 7) inside `commitBoundary`, as a code write to `story_time`, so the
     committed snapshot and every consumer see it in the same boundary. Never through `EffectsApplier` (host work
     only). Rolled back with the blackboard; the rollback detector registry covers story-time keys (SC1).
   - The validator refuses a negative advance, more than `clock.max_skip_days` (default 30), and an unknown part.
   - `to` semantics: a later part today moves to it; the current part is a no-op unless `next_day: true` (then +P);
     an earlier part moves to that part tomorrow.
4. **`calendar`** (optional):
   `{start: {year?, month, day, weekday?}, months: [{name, days}], weekdays?: [names], seasons?: [{name, from_month}],
   label?: "day" | "date"}`. Semantics, fixed (Astra P2):
   - `calendar.start` is the date of **story day 1**. `clock.start_day` (default 1) only moves where the story begins:
     day N is `start + (N − 1)` days. `clock.start_part` (default `times[0]`) is the initial part, so
     `story_time₀ = (start_day − 1) × P + idx(start_part)`.
   - Weekday origin: `start.weekday` (index, default 0) is the weekday of story day 1.
   - Seasons are ordered by `from_month`; a month before the first season's `from_month` belongs to the last season
     (wrap); years advance after the last month.
   - `night` lives on **`clock`** (`clock.night: [part names]`, default none), so `is_night` exists without a calendar.
   - The derived code qualities `cal_*`, `is_night` and `time_part` (`0..P−1`) are reserved like `story_day`
     (`isLifeKey`, `src/engine/lifeSchema.ts:95`): an authored quality with those names, a `reward.set`, a move or any
     effect targeting them is refused; only the derive and entry passes write them.
   - Authored gates may name them; a `display` value the projection cannot show is refused.
   - Without `calendar`, only `story_time`, `story_day`, `time_of_day`, `time_part` and `is_night` exist.
5. **Scene breaks (B3, deferred):** `clock.on_scene_break?: {parts}`, applied at the boundary whose audit carries
   `sceneBreak` (`extraction/parse.ts:178`), only when no read, skip or entry advance moved time that boundary.
   Not built until B1–B2 are stable.
6. **Quest time rule, scoped (Astra P2).** Runtime already reports an offered quest as `offered` before it tests
   failure (`src/engine/quests.ts:10-14`), so the risk is acceptance **after** the deadline (the quest fails the moment
   it is taken) and proxy gates. `TIME_KEYS` (`src/engine/validate/quests.ts:19`) gains `story_time`, `story_day`,
   `time_of_day`, `time_part`, `is_night` and `cal_*`; tests cover acceptance after the deadline and a gate on a
   derived time key. An author code quality that merely follows time cannot be detected: no refusal, a guide note.
7. **Widgets.**
   - `clock` may bind a derived `time_part` int (`0..P−1`) when `2 ≤ P ≤ 12`.
   - `timeline` fills a missing `dates` label from the checkpoint's **first-visit time**, stored explicitly: the entry
     pass writes `time_reached_<cp>` (code int, the `story_time` at first entry, only for checkpoints a `timeline`
     names without a date). The engine keeps only 200 log entries (`src/engine/engine.ts:277`) and `visitedPath` holds
     ids, not times, so the label cannot be rebuilt after truncation without it.
   - A deadline clock (a widget whose bound quality appears in a quest `failed_when` or a promise due) defaults to
     `audience: "author"` (trap 9).
8. **Surfaces.**
   - Player: the time label only where the author puts it (a `display` on `time_of_day`/`cal_*`, or the `timeline`).
     Time of day and date are player-safe facts (G13).
   - Author view: `story_time`, the last writer (read, effect, skip, director, scene break) with boundary and message.
9. **Writer arbitration (Astra P1).** Per boundary, candidate advances are collected with an evidence id:
   - read step: `read:<turnRange.to>`; skip line: `skip:<messageId>:<hash(line)>`; entry effect: `entry:<cp>`;
     director op: `op:<opId>`; scene break: `break:<messageId>`.
   - Precedence: an entry `to` sets the part last; entry and director advances **compose** (they are path events);
     an explicit skip **supersedes** the read step from the same window (the skip names the part); a scene-break
     advance applies only when nothing else moved time.
   - The total is clamped to `max_skip_days` per boundary.
   - **Exactly once:** skips and breaks are consumed by message id. `life_time_consumed_to` (code int, rolled back with
     the blackboard) holds the highest consumed message id; a candidate whose evidence message is at or before it is
     dropped, so overlapping read windows never repeat "three days later".

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
| T1 | Rollback ≡ replay | `story_time` and every derived key: 0 mismatches over 4 seeds × 100 cuts mixing reads, effects, skips, director ops, OOC lines, Continue, swipes, reopen and a code-only boundary (SC1) | D |
| T2 | Calendar derivation | 1,000 consecutive days over an authored calendar with months of unequal length, a weekday cycle not dividing the month, and 4 seasons: exact equality with an independent reference walker written in the test | D |
| T3 | Clamps | read ≤ 1 part per boundary; skip and director ≤ `max_skip_days` per boundary; `story_time` never decreases except by rollback (property) | D |
| T4 | No wall-clock | `engine/life/*`, the calendar module and the derive seam never call `Date`, `performance` or `host.now` (guard test with a planted call as control) | D |
| T5 | Clock parity | on `engine/life/life.test.ts`'s clock and schedule cases, `time_of_day`/`story_day` sequences and schedule drops are identical before and after the re-key (golden) | D |
| T6 | Offered-quest time rule | an offered quest with `failed_when` on any story-time or derived time key alone is refused; a runtime case accepts a quest after its deadline and shows the failure the validator prevents; control on a non-time key passes | D |
| T7 | Player clean | with no `display` and no timeline, player surfaces are byte-identical with and without `calendar`; a deadline-bound clock is author-only by default | D |
| T8 | Read parity (B1) | the existing time windows of the live suite score within its per-tier floors with `life_time_read` (the rename does not cost accuracy); declared payload-golden hunk only on the key name | CL |
| T9 | Skip read (B2) | on 40 synthetic windows with an explicit skip, the parsed advance matches the label (days and part) on ≥ 0.90; on 60 windows without a real skip, 10 each of quotation, hypothetical, flashback, negation, duplicate window and multi-member round, false advances ≤ 0.05 overall and ≤ 1 per kind; read prompt growth ≤ +5 % tokens for a story with `clock` | CL |
| T10 | Director time (B2) | 0 director ops over `max_skip_days` reach a story (guard); on 20 frozen frontiers, a second model rates the label-consistency of the anchor (no "morning" scene stated at night) ≥ 0.85 | CL |
| T11 | Played session | in the final suite, a schedule drop and its return happen with time advancing from the read and from one authored effect, and reopen keeps the label | RP |
| T12 | Exactly once | the same skip line present in 3 overlapping read windows advances once; a multi-member round with one skip advances once (property over window overlaps) | D |
| T13 | Stale read and arbitration | a read whose window ends before an effect's advance yields no advance; precedence and composition match a reference table of every writer pair | D |
| T14 | Calendar semantics | the fixed cases (start date vs `start_day`, `start_part`, weekday origin, season wrap, `to` same/earlier/later part, `is_night` without calendar) match the reference walker | D |
| T15 | First-visit time | a timeline label survives a reopen with the log truncated past the visit (`time_reached_<cp>`) | D |
| T16 | Entry consistency | after a boundary that enters a checkpoint with `effects.time`, the committed snapshot, the derived keys and the next quest/schedule evaluation all see the advanced time (no host-path lag) | D |

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
2. **Who advances time:** read + authored effects + skip read + director; scene breaks deferred (B3), opt-in when
   built? **Recommended: yes** (revised 2026-10-14). A location change is not always time passing.
3. **Calendar scope:** months, weekdays, seasons and a start date, with no moons, holidays or leap rules for now?
   **Recommended: yes.** Holidays are gates on `cal_*` an author can already write.
4. **Default player visibility:** the time label is shown only where the author asks (a `display` or `timeline`), and
   deadline clocks are author-only by default? **Recommended: yes.**
5. **`elapsed` (real seconds since checkpoint entry, `engine.ts:474-475`):** leave it, or remove it as a T2 wall-clock
   trap? **Recommended: leave it for now** and point the guide at `story_time` for in-fiction time. Removal is its own
   change.
6. **Build sequence** B1a → B1b → B1c → B2, B3 deferred? **Recommended: yes**, each step its own `npm run gates`.
7. **Writer arbitration** (item 9: compose path events, skip supersedes read, break only alone, consumed by message
   id)? **Recommended: yes.**

## Unresolved questions

- Must the skip read (B2) wait for v2.8 15's cue + scene-read merge, since both add line families to the same shared
  read? The proposal is to build after 15 lands, or to coordinate in one extraction prompt change.
- Is `on_scene_break` applied when the scene judge (`sceneTrigger`) confirms a break, or on the heuristic signal alone?
  The proposal is the audit's `sceneBreak` as recorded, whichever source produced it.
- Does a reopen with a truncated boundary log rebuild `story_time` exactly? It should, since it is a blackboard value in
  `engineHistory`. T1's reopen case proves it.
- Plan 47's due-time format (absolute day/part vs "within N days") is not known yet. This plan's read model must serve
  both.

## Review 2026-10-14 (Astra)

Source: `review-astra-2026-10-14.md` §Plans 48-53, checked on master `3a716f2b`. Shared findings resolve through the
shared contract in v2.8 52 §Review 2026-10-14 (Astra): SC1 rollback detectors (T1 code-only seed), SC2 order
(read-steps in step 3; `effects.time` and `time_reached_<cp>` in the step 7 entry pass), SC3 (time is player-safe;
deadlines stay author-only), SC4 (a clock-only story has no game view unless `display`/`timeline` is authored; T7
covers it).

- **P1 Multiple writers need arbitration and exactly-once application.** Accepted. → Item 9: evidence ids per writer,
  precedence vs composition, a consumed-message watermark in the blackboard (rolled back with it), stale-read rule in
  item 2. Floors T12, T13; decision 7.
- **P1 Renaming the read key is not enough.** Verified: stepping happens in the parser against the read key's own
  value (`src/extraction/parse.ts:149-151`); the day count derives from `life_time_seen` (`src/engine/life/derive.ts:47-55`).
  → `life_time_read` loses its `step_rule`, the parser stores the absolute word, and the derive step resolves against
  the derived `time_of_day`; an older pending read that predates an effect's advance is stale and yields nothing.
- **P1 Entry effects need a new engine transaction point.** Verified: entry `effects` leave `commitBoundary` for the
  runtime (`engine.ts:269,280`); derive runs on the pre-transition view (`:482`). → `effects.time` is computed in the
  pure entry pass (SC2 step 7); runtime effects stay host-only. Floor T16.
- **P2 Calendar semantics undefined.** Accepted. → Item 4 fixes start date vs `start_day`, `start_part`, weekday
  origin, season wrap, `to` same/earlier/later part (item 3), `night` on `clock`, `time_part` declared and reserved.
  Floor T14.
- **P2 First-visit dates cannot be reconstructed.** Verified: 200-entry log (`engine.ts:277`), `visitedPath` ids only.
  → `time_reached_<cp>` written at first entry, only for undated timeline checkpoints. Floor T15.
- **P2 Quest validator gap narrower than claimed.** Verified: `liveStatus` returns `offered` before testing failure
  (`src/engine/quests.ts:10-12`); `TIME_KEYS` lacks story-time keys (`src/engine/validate/quests.ts:19,248`). →
  Item 6 rescoped: acceptance after the deadline and derived-key proxies are the tested cases; T6 extended.
- **Cheaper sequence.** Adopted as B1a → B1b → B1c → B2, scene breaks deferred (decisions 2, 6). T9 strengthened with
  quotations, hypotheticals, flashbacks, negation, duplicate windows and multi-member rounds.
- **Brainstorm: recurring social rhythms, appointments, seasonal atmosphere; time opens opportunities without closing
  others.** Schedules already read `time_of_day`; appointments are v2.8 47 due points and v2.8 55 commitments
  (candidate); recurring rhythms are v2.8 57 rituals (candidate). No time-based closing is added here: a deadline
  stays an authored `failed_when`.

## Harvest 2026-10-14 addendum

From `docs/plans/v2.8/61-harvest-triage-2026-10-14.md`. Ideas only (source licences: AGPL/GPL/none unless noted). First verified against master `9e96871d`; revised 2026-10-16 on `e8b9dd6d` after `review-astra-harvest-2026-10-16.md`. The owner decides with the rest of this plan.

- **H14a meanwhile due on elapsed story time** (`docs/plans/v2.8/extension-research-2026-10-14/multihog-dnd-framework.md` P1, 3/S). **Built with B1a**:
  `meanwhileDue` (`src/runtime/agendaProposals.ts:132-139`) makes a pass due when story time moved since the last pass, or on a
  story event once `MEANWHILE_MIN_GAP` (8, `:6`) boundaries have passed. The event fallback is **intentional**: a long scene in
  one time part may still get off-screen news, at most once per 8 boundaries. Exact floors: (a) 20 boundaries, 2 time
  advances, no events: exactly 2 passes, on the advancing boundaries (built, `src/runtime/meanwhilePlay.review.test.ts`); (b)
  20 boundaries in one time part with an event at every boundary, an open agenda and no proposal left waiting
  (`meanwhileDue` skips while one waits, `:134`): passes exactly at boundaries 0, 8 and 16 (3); (c) a time
  advance inside the gap: a pass on that boundary and the gap counted from it, D.
- **H5b time-change chips per reply** (`docs/plans/v2.8/extension-research-2026-10-14/rpg-companion.md` P2, 3/S). Not built (B1c rest). When `story_time` advanced at a
  boundary, the inline strip shows "evening → night" on that reply; a skip shows "→ next morning". Only when the story displays
  time (§8, T7 identical without it); derived from the boundary log, so rollback-safe. Floor: chip present exactly on advancing
  boundaries over a 20-turn scripted run, D. The "here now" card (v2.8 65) reads the same label.
- **R15 realization status for landed meanwhile notes** (`docs/plans/v2.8/extension-research-2026-10-14/multihog-dnd-framework.md` P2, 2/M). Deferred note: a landed
  note could be marked realized when a later read evidences its event, or lapsed after N boundaries. Not planned until a
  session shows unrealized notes contradicting play.

## Gate record 2026-10-15 (B1a, B1b, B1c core on `v2.8-p50-time`)

Built on branch `v2.8-p50-time` from master `cc38c5b1`, the owner's recommended options throughout (B, B1a → B1b → B1c; scene
breaks deferred; writer arbitration as item 9). Not merged.

What landed

- B1a canonical time: `story_time` (code int, monotonic) is the one truth, compiled in `validate/life.ts`; `story_day`,
  `time_of_day`, `time_part`, `is_night` (from `clock.night`) are derived code keys, written only by the derive step and the
  entry pass (`engine/life/clock.ts`). `life_time_seen` retired.
- Read parity: `life_time_read` is an extractor choice over `clock.times` with no `step_rule`; the parser stores the
  absolute part; the derive step (SC2 step 3) turns it into at most one part against the derived `time_of_day`, using
  `DerivedQualityView.applied` (new: keys applied this boundary with their read-window end, `applyQueue.appliedKeys`).
  Stale rule: a read whose window ends at or before `life_time_moved_at` (the message of the last author or checkpoint
  move) moves nothing. The read is scoped while a transition gate names any story-time key (`extraction/scope.ts`).
- Author recovery: `/cp set time_of_day|story_day|time_part|story_time` moves `story_time` forward (derive step), so
  existing scenarios that set `time_of_day` keep working.
- B1b entry advances: `effects.time {advance: {days?, parts?}} | {to: {part, next_day?}}` applied in the pure entry pass
  (`GAME_LAYER.entryWriters`, SC2 step 7) in `commitBoundary` and `activateCheckpoint`, never through `EffectsApplier`;
  clamped to `clock.max_skip_days` (default 30). Validator refuses a negative/empty advance, over-limit, unknown part, the
  start checkpoint, no clock.
- B1c calendar (core): `calendar {start, months, weekdays?, seasons?, label?}` with the fixed semantics of item 4
  (`engine/life/calendar.ts`); `cal_year`, `cal_month`, `cal_day_of_month`, `cal_weekday`, `cal_season`; labels
  "Day 4, evening" / "3rd of Thawmonth, morning"; `clock.start_part`, `clock.night`.
- Reserved keys (`isStoryTimeKey`): authored qualities named like a time key refused when the story has a clock; a quest
  `reward.set` on a time key refused; `TIME_KEYS` rule for offered quests extended to every story-time key (item 6); faction
  inaction rule reads the same predicate.
- First-visit time: `time_reached_<cp>` (entry pass) for checkpoints a `timeline` names without a date; the timeline fills
  the missing label from it (`runtime/widgets.ts` via `life.reachedLabel`).
- SC1: rollback detector `story-time` (story_time compared with undefined read as the start, plus `time_reached_*`); the
  `clock` exemption is gone.
- Author view: Character life shows the time label, `story_time` and the last move (reader, checkpoint or author, message,
  boundary) from the boundary log (`clockMoves`, `storyTimeRow`).
- Harvest H14a: meanwhile passes record `storyTime`; a pass is due when story time moved since the last pass, or on a
  story event after the boundary gap; boundary work `meanwhile-proposals` now also triggers on a non-firing boundary
  that moved time (reason `time`).
- Docs and registry: guide §Story time (`story-time`, compact twin `copilot/guideTopicsTime.ts`), §Character life points
  to it; feature `story-calendar`; wizard tool `setCalendar` (`gameMutations.setCalendar`; `setClock(null)` drops the
  calendar too); `npm run docs:guide`, `npm run docs:settings`; architecture invariant line.

Tests (D floors as jest)

- `src/engine/life/clock.test.ts` (44): T1 rollback ≡ replay, 4 seeds × 100 cuts over reads, entry effects, author sets,
  OOC lines, continues, reopen every 10th cut, plus a code-only boundary (author set, no read window, no transition)
  and a control; T2 1,000 days vs an independent walker (unequal months, 5-day week, 3 seasons with wrap); T3 clamps over
  4 seeds × 200 turns; T4 no-wall-clock guard with a planted control; T5 parity with a reference of the v2.7 37 clock,
  4 seeds × 120 boundaries (time_of_day, story_day and schedule drops); T6 offered-quest rule on every time key and a
  calendar key, control, runtime acceptance after the deadline, reward refusal; T13 stale read, read + entry composing,
  author over read; T14 calendar semantics; T15 first-visit time past a truncated log and reopen; T16 entry consistency;
  Author-view writer row; timeline label.
- `src/extraction/clockScope.test.ts` (5): the read is asked for the time of day when a gate names a time key; control.
- `src/runtime/meanwhilePlay.review.test.ts` (+2): H14a scripted 20-boundary run with 2 advances → passes exactly on the
  2 advancing boundaries; no-clock control.
- Updated: `engine/life/life.test.ts`, `engine/validate/life.test.ts` (read key), `copilot/guideCoverage.test.ts`.
- `test/scenarios/v28-50-story-time.json` written, NOT YET RUN (no-model group scenario: author sets, schedule drop and
  return, entry jump in the same boundary, deadline quest, time row writer, reload).

Gates

- `npm run gates:quick`: typecheck, typecheck:test, lint, jest related (6,847 passed) green; `defect replay --cached` red
  because a fresh worktree has no `.build/defect-replay-cache.json`, so the changed list is every file and `jest
  --listTests` overflows the Windows command line (tooling, not the change); the full replay below is green.
- `npm run gates -- --jobs=2 --no-storybook`: all green in 448.2 s (test 8,730 passed / 1 skipped; build; replay 32 of 32
  killed; typecheck; test:debug 1,296; typecheck:test; lint; debug:typecheck; test:release; test:plugin).
- Storybook: gates hardcode port 6006, so `npm run storybook:build`, `http-server .sb-static -p 6150`,
  `test-storybook --url http://127.0.0.1:6150 --maxWorkers 2`: 863 of 864 passed in 144 suites (1,051 s); the one failure, `WorkspaceShell` Desktop ("heading features" not found), passed on retry alone (2 of 2): a load flake.
- Flake: `runtime/consequences.test.ts` C6 (p95 ≤ 5 ms) failed once in a full parallel jest run, passed alone and in the
  gates run.
- Bundle: main `dist/index.js` 1,295,374 B (was 1,293,107; +2,267; budget 1,300,000). Clock, calendar and validator ride
  the game-layer chunk (`2070.index.js`).

Deviations

- First-read rule: a clock with no authored `start_part` is unanchored until its first read or move; that first read lands
  the part it names on day 1 (more than one part), exactly as the v2.7 37 clock did. T3's one-part clamp is asserted from
  anchoring on. With `start_part` authored, every read moves at most one part.
- Stale read uses `window end ≤ life_time_moved_at` (the plan says "after"): a window ending on the message the jump
  happened at describes the time before it.
- `effects.time` is not on `CheckpointEffects` (schema.ts is at its 600-line budget); it is typed by `TimedEffects` in
  `lifeSchema.ts`; `StoryV2.calendar` shares a line with `clock`.
- Reserved time keys are refused only when the story declares a clock (stories without a clock may still author e.g.
  `time_of_day`).
- `time_part`, `is_night` and `cal_*` exist; the `clock` widget binding `time_part`, the deadline-clock author default,
  a player `display` on time keys and the H5b time-change chips are not built (no player display path for compiled keys
  yet); T7 holds trivially (nothing player-facing shows time except an authored timeline).
- The read is scoped only while a transition gate names a time key (unchanged from v2.7 37); the guide says so.
- A read drained at a manual `activateCheckpoint` does not step time (that path never runs derive).

Owed

- Live no-model lane: `test/scenarios/v28-50-story-time.json` ×2 on an isolated ST copy, plus the payload golden diff
  (declared hunk: `time_of_day` → `life_time_read` in the read). Not run here: flagged NOT green, to run after merge.
- CL T8 read parity (live suite), RP T11 (final suite).
- B1c rest: `clock` widget on `time_part`, deadline clocks author-only, player time display, H5b chips.
- B2 (skip read, director op, `per_days` agendas, T9/T10/T12) and B3 (scene breaks).
- Campaign: Adolion not changed (no calendar decided); pin not bumped.

## Review 2026-10-16 (Astra)

Source: `review-astra-harvest-2026-10-16.md` §Addenda requiring correction. Verified on `e8b9dd6d`.

- **P1 — "time advanced or boundary gap" does not prevent frequent same-evening news; is the event fallback intentional; make the
  floor exact.** Accepted. → the fallback is intentional and bounded (one pass per `MEANWHILE_MIN_GAP` = 8 boundaries,
  `src/runtime/agendaProposals.ts:6,138`); three exact floors (no events, event every boundary, advance inside the gap).
- **Multihog P2 → 50.** Adopted as a deferred note (R15).
- Rebutted: none.

## Live gate 2026-10-16 (no-model lane, branch `v2.8-owed-live-fixes`)

- Setup: no-model offline lane 61 (`SO_LANES_ROOT=C:/dev/so-live-lanes`, `SO_LANE_OFFLINE=1`, no server plugins, no GPU,
  images and sprites off). Main build: master `7b3ef38b` (bundle `1d806c43b088`) staged into a private ST copy
  `C:/dev/st-live-owed`, because `C:/dev/st-live` was restaged by a parallel agent mid-batch (two runs died on
  `Loading chunk ... failed`; those runs are discarded). Served `dist/index.js` hash checked before and after every batch.
- Each item `st-lanes.mts batch --lanes 61 --repeat 2 --strict`; batch dirs under `C:/dev/so-live-lanes/61/debug/batch/<stamp>/`,
  archived with `so-evidence.mts archive --label owed-nomodel-2026-10-16`.
- `test/scenarios/v28-50-story-time.json`: green x2 on `d1f9ede2` (batch `2026-10-16T17-40-07-788Z`, `C:/dev/st-live`)
  and x2 on `7b3ef38b` (batch `2026-10-16T18-34-44-462Z`). No model call: plumbing.
- Still owed: payload golden diff (no c0 baseline captured in `test/measurements/v2.7/payload/`); CL T8 read parity, RP T11.

## Folds from v2.9 triage (applied 2026-10-25, owner)

- M02 story-time span on chapter cards; M03 chronology (with 69 K1).
- Source: `docs/plans/v2.9/01-triage-sol.md`. Not built; each item is scheduled with this plan's next build pass.
