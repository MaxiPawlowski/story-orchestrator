# Plan 07 — Delayed story echoes

**Status 2026-10-26: BUILT, on master since 2026-10-22; 40-schedule D floors 40/40, 0 early or unauthorized (jest); narrator acknowledgement 0/5 on 2026-10-22, 18/20 (90 %, floor >= 80 %) after the 2026-10-23 header fix, single-fixture pilot. Left: a larger real-play count (v3.0 optional). Records: §GPU run 2026-10-23.**

**Was 2026-10-21: written 2026-10-21 from the v2.9 triage (`01-triage-sol.md` §"07", verdict N13); not built; owner decisions
pending; revised 2026-10-21 after sol's review (`10-review-sol.md` §07 and Cross-plan findings).** Implementation tier **D**; acceptance **D** (40-schedule fixture, rollback/reopen properties, Storybook) + **LT**
(real Artemis replies on the local 3090, thinking and inner voice on, for the narrator-acknowledgement row; no new model call
during play). Overview rules: `docs/plans/v2.8/00-overview.md` §Rules. Build order: after v2.9 04 (`01-triage-sol.md` §Build
order step 5).

## What it is

- An author declares an **echo**: "when this happened, then after a delay, if the world still supports it, tell this member
  (or the narrator) this cue."
- Scheduled from one **typed occurrence** (a fired transition, a quest closing done/failed, a milestone, a check outcome) at
  the boundary that recorded it. Delay in **story parts** (`story_time`) or **boundaries**, drawn by seed.
- At due time the echo is **revalidated**: its `when` gate, its recipient still enabled, names it carries still allowed for
  that audience. Then it lands, waits, is cancelled or expires. Every outcome is a record.
- **First slice delivers cues only**: a landed echo is handed to v2.9 04's offer API as one offer source; 04 decides whether
  and where it reaches the recipient's private block and records offered/realized. 07 owns no injection path. No blackboard
  write, no host effect, no player surface.
- **Five lifecycle states, never conflated:** scheduled (event exists, due computed) → due (due point reached, not yet
  revalidated) → landed-to-channel (revalidated and handed to 04 as an offer source) → offered (04's rendered-revision
  receipt: the final filtered text reached a generation's private block that rendered a real reply) → realized (04's
  realized record). Terminal non-delivery states: cancelled, expired, lapsed (handed to 04, never offered within `hold`).
- Example shape (synthetic): the player short-changes a trader (transition fires); two to four day parts later, if the
  trader is still in the cast and has not been repaid, the narrator gets "The trader you short-changed is in town and
  remembers." The narrator shows it where it fits; the player decides what happens.

## History and evidence

- **Source:** `docs/plans/v2.8/extension-research-2026-10-21/niches.md` §9 (Crusader Kings III): `trigger_event` follow-ups
  after a random delay that fire only if still valid; `save_scope_as` carries participants. Steal (a) "delayed echoes",
  value 4, effort S–M. Listed 7th in that report's top 10 and in `SUMMARY.md:87` ("S–M → 46/50").
- **Triage:** `01-triage-sol.md` N13 (line 173): **PLAN v2.9 07**, P4, M, risks R/A/K, "reuse concepts, not a second generic
  scheduler". Plan spec §"07" (lines 349–358). Build order step 5: "delayed cues after their recipient/delivery contracts
  exist".
- **Cadence precedent:** `docs/plans/v2.8/extension-research-2026-10-14/multihog-dnd-framework.md` P1 (off-screen cadence
  keyed on elapsed story time). Already folded: `meanwhileDue` is due when `story_time` advanced past the last pass
  (`src/runtime/agendaProposals.ts:132-139`). Echoes reuse the "due on elapsed `story_time`" rule, not meanwhile's scheduler.
- **Related, deferred:** G10 (interrupt a large time jump at a due event) is V3.0 (`01-triage-sol.md:113`). This plan never
  splits a jump; a due echo lands at the first boundary after the jump.
- **Where sol and the research disagree (followed sol):**
  - Research: deliver "cue|effect". Sol: cue-only first slice; arbitrary host effects out; later effects only through
    existing engine writers or the `EffectsApplier` ledger. Reason: an effect at a non-transition boundary is a new writer
    with its own rollback detector and ledger row (risk R); cue-only keeps the slice off the blackboard.
  - Research: "schedule = code int written at the firing boundary … rollback detector on the schedule key". Sol: reuse the
    rumor due/occurrence design. Recommendation A below follows sol (own extras slice, rolled back by message like
    `extras.rumors`); the code-int design is kept as option B.
  - Research effort S–M; sol M. Sol's M stands (Studio, wizard tool, guide, delivery contract with v2.9 04).

## Current state in code

Verified on `6861d989`.

- **Rumor due/occurrence design** (the precedent):
  - Occurrence id from chat, story, rumor, from, to, hop, parent, hashed by `chanceSeed`, no boundary, no `Math.random`
    (`src/memory/rumors/spread.ts:43-46`); delay and version drawn by `unitDraw([chat, story, occurrence, what])` (`:48-49`,
    `src/engine/chance.ts:33`).
  - Delay range `{boundaries:[a,b]} | {days:[a,b]}` (`src/engine/rumorSchema.ts:17`), span picked from the unit draw
    (`spread.ts:51`). `dueOf` (`:55-61`): `days` against `story_day`; **with no clock, a `days` delay silently falls back to a
    zero-boundary delay** (immediate). Echoes must refuse that at validation instead (zero early delivery).
  - `isDue` (`:63-67`), due order by rank then occurrence id (`:176-177`), landing cap `RUMOR_LANDINGS_PER_BOUNDARY` = 3
    (`src/memory/rumors/types.ts:7`, `spread.ts:179`), secret-barred hop held, not landed (`:183-186`).
  - State `{events, hearsay, disclosures, settled}` with `scheduledAt`/`landedAt` stamps (`types.ts:16-55`); eviction only
    below the history floor (`spread.ts:106-121`).
  - `rollbackRumors` drops events scheduled at or after the message, returns later landings to pending
    (`src/memory/rumors/state.ts:19-34`), called in `quarantine()` (`src/runtime/rollback.ts:115`). `quarantine()` runs on
    the no-op path too (`rollback.ts:144-145`), so an extras slice rolls back even when the engine did not move.
- **Runtime door:** `createRumorPort` (`src/runtime/rumorPort.ts:39-89`) runs sync at boundary work `rumor-spread` order 9
  (`src/runtime/boundaryWork.ts:65-67`) through the lazy game layer (`gameLayer()?.rumors`), journals landings author-side,
  and delivers hearsay through `memory.injector.addPrivateSource` (`src/runtime/managerWiring.ts:96`). Private sources pass
  `withoutSecretLines` with the member's names (`src/runtime/memoryInjector.ts:136-143`).
- **Typed occurrences:** `deriveRefs(story, entry, records)` (`src/runtime/consequences.ts:175`) yields `EffectRef`s of kind
  transition / quest / milestone / check / agenda (`:140-173`; type `src/runtime/recapPort.ts:6-26`). The recap port appends
  them at order 7 (`boundaryWork.ts:43-46`) **only when its lazy kit is loaded** (`recapPort.ts:67-72`: `!kit` returns), and
  its ring is capped at 600 (`recapPort.ts:33`). An echo scheduler must not depend on that ring.
- **Story time:** one code int `story_time`, `story_day` derived (`src/engine/lifeSchema.ts:9,11`; `src/engine/life/clock.ts`);
  rollback detector `story-time` (`src/engine/rollbackDetectors.ts:58-67`). Echoes read it, never write it.
- **Meanwhile landing:** accepted proposals land at boundary work `meanwhile-land` order 6 (`boundaryWork.ts:49-53`,
  `src/runtime/meanwhilePort.ts:61-75`), journaled author-side.
- **Narrator delivery:** the narrator sheet adds lines only for a roster member with `view === "omniscient"`
  (`src/runtime/narratorSheetPort.ts:48`), via the same private source path (`managerWiring.ts:152`); its "Just happened,
  already decided" header (`src/runtime/narratorSheet.ts:8`) is the closest existing narrator cue wording.
- **Disclosure:** `knownEntities` (`src/engine/codex.ts:97`) is the one entity-discovery projection.
- **Agency lint:** `speaksForPlayer` (`src/wizard/cardChecks.ts:49`) flags text that says what the player does or feels.
- **Authoring precedent:** rumors list in `gameMutations.ts` (`setRumors` `:162`, add/patch/remove `:165-175`), wizard op
  `setRumors` validated by `readRumors` (`src/copilot/agent/gameOps.ts:33,85`), Studio `RumorsEditor.tsx` + story,
  guide topic `src/copilot/guideTopicsRumors.ts`, feature entry `rumors` (`src/features/audienceFeatures.ts:17-24`), setting
  `memory.rumors` default true (`src/runtime/settingsModel.ts:207,239`), game-layer detection of the field
  (`src/engine/validate/gameLayer.ts:27`).
- **Retention limits** (sol finding 1): the boundary log keeps 200 entries (`src/engine/engine.ts:292`); check records keep 100
  (`CHECK_RECORD_LIMIT`, `src/runtime/storyCheckDraws.ts:11`). Each `BoundaryLogEntry` carries `before`/`after` engine state
  (`src/engine/engine.ts:65-75`), so a source's own `story_time` is recoverable from its entry while retained.
- **Held-secret content check** exists only as `keptFrom(text, secrets, member)` (`src/memory/heldSecrets.ts:50-54`); with
  `member = null` it is the resting-audience check behind `restingFilter()` (`src/runtime/memoryInjector.ts:316-319`).
  `knownEntities` and `recapWithheld` (`src/runtime/consequences.ts:182`) are name checks, not content checks.
- **Story update:** `applyStoryUpdate` prunes engine state/history and calls `swapStory` (`src/runtime/storyUpdate.ts:175-177`);
  `StoryUpdateDeps` (`:21-35`) has no extras-reconciliation hook, so an extras slice survives a definition edit untouched.
- **Feature policy:** story features are `FEATURE_POLICY_FIELDS` (`src/engine/featurePolicy.ts:15`, `rumors` at `:28`) with
  controls in `FEATURE_CONTROLS` (`src/runtime/featureControls.ts:21`, `rumors` → `memory.rumors` at `:87-90`).
- **Nothing schedules an authored "after N, if still valid" consequence today** (grep `echo`/`delay` in `src/engine`, `src/runtime`:
  only rumor delays).

## Options

| Design | Cost | Risk |
|---|---|---|
| **A. Echo slice in the game layer, rumor-style** (recommended): authored `echoes[]`; pure `schedule/land` over the boundary log; own `extras.echoes` slice rolled back by message in `quarantine()`; cue handed to v2.9 04's offer API | M | Low R (rumor precedent proven); a cue no gate can read |
| B. Compiled code ints per echo (`echo_due_<id>`, `echo_state_<id>`) written in the latch pass, rollback detector (research sketch) | M–L | Gates can read echo state; but adds engine writers, a `ROLLBACK_DETECTORS` entry, `storyDiff` keys, one occurrence per echo only; touches `BOUNDARY_STEPS` |
| C. Express as a rumor (`starts_when` on a latch + channel delay) | S | Wrong shape: hearsay has teller/stance/contact, no narrator, no cancel/expire, no `story_time` parts; bends 44's privacy contract |
| D. Living director or v2.8 49 complications pick it up | S authoring | Model-driven, not deterministic; no once-only guarantee; violates "reuse concepts" and A (agency) |

## Recommendation

Option A, in four slices. Each builds and gates alone.

### S1 — Schema, validation, pure due helpers (D)

- `src/engine/echoSchema.ts` (game layer, lazy):
  ```
  echoes?: Array<{
    id: string;
    after: { transition: string } | { quest: string; to: "done" | "failed" } | { milestone: string } | { check: string; outcome: PrimitiveValue };
    delay: { parts: [number, number] } | { boundaries: [number, number] };
    when?: GateNode;          // must hold at due time
    cancel_when?: GateNode;   // holds at any boundary before landing -> cancelled
    expires?: { parts: number } | { boundaries: number };   // window after due; default per owner decision 2
    to: string;               // roster id, or "narrator" (the omniscient member)
    cue: string;
    hold?: number;            // boundaries the landed cue stays offered, default 2, max 6
  }>
  ```
- `src/engine/validate/echoes.ts`. `echoes` is added explicitly to the game-layer load detector's closed field list
  (`usesGameLayer`, `src/engine/validate/gameLayer.ts:24-30`), to parsing and to normalized copying, so an echo-only story (no codex, quests,
  checks or rumors) loads the lazy chunk; feature-only fixture `echo-only.story.json` proves it. Errors: unknown source id,
  unknown check outcome, `parts` without `life.clock` (never the rumor fallback), `to` not a roster id, `"narrator"` with no
  `view: "omniscient"` member, ranges not ascending/non-negative, `hold` out of range, duplicate ids. Warnings:
  `echo-speaks-for-player` (`speaksForPlayer` on `cue`), `echo-names-unknown-entity` (cue names an entity no gate discloses
  before due; mirrors `disclosure-names-unknown-entity`), `echo-gate-holds-never`. Each code gets a `DIAGNOSTIC_CONSEQUENCES`
  row.
- Extract the rumor helpers `span`, `dueOf`, `isDue`, `dueRank` (`spread.ts:51-69`) into one pure `src/engine/life/due.ts`
  with due `{boundary} | {day} | {part}`; rumors keep their behaviour byte-identical (existing rumor tests are the guard).
  This is the "reuse concepts" line: one due rule, two narrow consumers, no generic scheduler.
- **Story update reconciles extras, not only engine keys** (cross-plan finding): definition identity = echo `id` + `after` +
  `to` + delay unit; `revision` = hash of that identity plus `when`/`cancel_when`/`expires`/`hold`. Each event stores the
  identity and revision it was scheduled under. `diffEchoes` classifies: cue-text-only change = compatible, pending events
  land with the new text (still filtered at delivery); changed gates/expiry = pending events dropped and rescheduled from the
  retained log; changed identity or removal = pending events dropped. Terminal events and settled identities (S2) are kept
  under their original identity as earned history, never re-derived from the edited schema. Applied through an owned hook
  `reconcileExtras(next, diff)` added to `StoryUpdateDeps` and called before `swapStory` (`storyUpdate.ts:175-177`), shared
  with 04/05/08's slices. Test: update → rollback → reopen gives the same event list as replay on the new story.

### S2 — Pure scheduler core (D)

- `src/runtime/echoes/schedule.ts` (lazy chunk with the game layer): `stepEchoes({state, story, entries, records, values,
  at, chatId, storyId, enabled, known, secretFor})` → `{state, scheduled, landed, waiting, cancelled, expired, held}`.
- **Source capture is guaranteed at commit, not by rescanning** (sol finding 1): in an echo-bearing story the echo kit is
  awaited before the first commit (load owned by a `RunToken`, checked before the slice write); each finished boundary is
  scheduled from its own `BoundaryLogEntry` plus that boundary's check records, in boundary work `echoes`. Rescan is a
  catch-up path only (reopen, kit loaded late): permitted only over a verified contiguous retained range — log entries
  `state.scannedTo+1 … current` all present (200-entry log, `engine.ts:292`) and check records covering every boundary in it
  (100-record cap, `storyCheckDraws.ts:11`). A gap is never papered over: `scannedTo` jumps past it and an author-side
  `gaps[]` row `{from, to, reason}` is recorded and shown in `#so-echoes`. Catch-up due time is computed from each source
  entry's recorded `after` values (`after.values.story_time`, `after` boundary), never today's `story_time`. The recap ring
  (lazy, cap 600) is never a source. Occurrence id = `chanceSeed([chat, story, echoId, ref.kind,
  ref.id, ref.to, ref.boundary])`; an existing id is skipped (idempotent rescan). Delay = `unitDraw([chat, story,
  occurrence, "delay"])`. `parts` due is `story_time` at schedule + span; `boundaries` due is boundary + span (min 1, never the
  same boundary).
- **Once only, terminal-state policy** (sol finding 2): in the recommended once-per-chat mode, every terminal outcome
  (landed-to-channel, cancelled, expired, lapsed) consumes the echo until a rollback reverses that outcome; a later source
  occurrence of a looping transition never reschedules it. Once-per-occurrence mode (owner decision 3) consumes per
  occurrence id instead, same rule. Identity survives detail eviction: `settled` keeps compact `{echoId, occurrenceId,
  status, closedAt, closedMessageId, revision}` rows (rumors' `settled` pattern, `types.ts:16-55`), never evicted while the
  story runs; only the detail row is evicted.
- **Each boundary, in this exact order** (sol finding 3), for every pending event ordered by due rank then occurrence id:
  1. **cancel**: `cancel_when` holds at this boundary → cancelled.
  2. **expiry**: due point exists and this boundary is past `due + expires` (window inclusive at both ends: an event due at
     d with `expires: {boundaries: n}` may land at d … d+n, expires at d+n+1; `parts` the same over `story_time`) →
     expired. A jump that crosses both due and expiry in one boundary expires, never lands.
  3. **due/revalidate**: boundary (or `story_time`) ≥ due → due; revalidate (`when` holds; recipient enabled; narrator cue
     names only `knownEntities`; held-secret content filter, Privacy) → eligible, else waiting with reason.
  4. **bounded landing**: at most 2 eligible events per boundary are handed to 04 (landed-to-channel); the rest wait,
     counted, reason `capacity`. Capacity waiting never resets due or expiry; a capacity-held event can still expire.
  A time jump makes several echoes due at once: they land over the next boundaries, never early, never by moving
  `story_time`. These expectations are frozen as named cases in the 40-schedule corpus.
- **State** `extras.echoes = {events: EchoEvent[], settled: SettledEcho[], gaps: EchoGap[], scannedTo: number}`;
  `EchoEvent {occurrenceId, echoId, revision, source:{kind,id,boundary,messageId}, scheduledAt, due, status:
  scheduled|due|waiting|landed|cancelled|expired|lapsed, reason?, landedAt?, offerId?, closedAt?}` (offered/realized live in
  04's records, joined by `offerId`); cap 200 detail rows, eviction only of closed events below the history floor
  (`spread.ts:106` pattern) and only after their `settled` row exists. `sanitizeEchoes` as `sanitizeRumors`.
- **Rollback:** `rollbackEchoes(state, messageId, keptBoundary)`: drop events and settled rows scheduled at or after the
  message; reopen events (and remove settled rows) closed at or after it; `scannedTo = min(scannedTo, keptBoundary)` so a
  no-op rollback re-derives the same ids over the kept log. 04's offer rows for those events roll back in 04's own slice.
  Called in `quarantine()` beside `rollbackRumors`.
- Jest also: looping source after detail eviction, and after cancellation, before a later source occurrence (no
  reschedule); catch-up over a contiguous range vs a range with a gap (gap row, no schedule invented); catch-up due from
  the source entry's `after` time after a later jump; cancel/expiry/capacity precedence cases above.
- Jest: the 40-schedule fixture (floors below), property test `rollback ≡ replay` at every edit/delete cut (generator copies
  rows, never mutates), reopen = sanitize(serialize) round trip.

### S3 — Runtime wiring and delivery (D, then LT)

- `src/runtime/echoPort.ts` (main-entry door, injected deps, no coordinator imports; shape of `rumorPort.ts`): boundary work
  entry `echoes`, order 11 (after `rumor-spread` 9 and `scheduler-tick` 10; reads only the committed log and values).
  Sync like rumors; the kit load at story activation is owned by a `RunToken` and re-checked before the slice write.
- **Delivery = v2.9 04 §"Offer API (consumed by v2.9 07)"; 07 has no injection path of its own** (no `addPrivateSource`
  call, no narrator-sheet line). On landing, the port hands 04 one typed offer source of the echo-occurrence variant of
  04's source union: `{kind: "echo", occurrenceId, echoId, revision, recipient: <roster id | omniscient member>, text: cue,
  eligibleFrom: landedAt, expiresAfter: hold}`. 04 owns, per sol's listed fields: arbitration (one cue per drafted member
  per generation), eligibility at draft time, expiry, and rendered-revision receipts. 07 counts an echo **offered** only
  from 04's receipt that the final filtered text reached that generation's private block and the generation rendered a
  real reply; **realized** only from 04's realized record. An offer 04 never renders within `hold` boundaries is `lapsed`
  in 07. Wording header (synthetic, carried in the offer text, 04 may own it): "Coming back now, already decided by earlier
  events (show it if it fits; never decide what the player does, says or feels):".
- **Competition pinned** (sol cross-plan): for one member in one generation, 04's arbitration decides between a `must` cue,
  a raised topic and an echo. 07's proposed position, to be frozen in 04's Offer API section: `must` cue > echo > raised
  topic > `may` cue; a displaced echo stays eligible (not offered, `hold` keeps counting) and lapses when `hold` ends. Fixture
  `echo-vs-must-vs-topic` in both plans' corpora with identical expected winners.
- If 04's Offer API section changes these fields, S3 follows 04; the source variant and receipt join are the only coupling.
- Never in shared tiers, the resting view, the director, the canon, recap, journal player side, or chapter records.
- **Author surfaces only** (no rule-4 decision needed): Author view rows in Memory (author) → "Echoes" (`#so-echoes`):
  one row per event in its lifecycle state (scheduled with due, due/waiting with reason, landed-to-channel with offer id,
  offered and realized from 04's records, cancelled/expired/lapsed) with source ref, plus catch-up `gaps`; inline level 3
  chip on the landing message; journal author entries "N echo(es) landed to channel, O offered, R realized, M waiting,
  K expired" with ids (`rumorPort.ts:75-80` pattern).
- Settings through the resolver (cross-plan, per 09): story feature `echoes: { enabled: toggle }` in
  `FEATURE_POLICY_FIELDS` (beside `rumors`, `featurePolicy.ts:28`), controls `enabled("memory.echoes")` in `FEATURE_CONTROLS`
  (`featureControls.ts:87-90` pattern); install master `memory.echoes` default true; precedence install master → authored
  default → chat override in `extras.overrides` (never `extras.ui`). Feature entry `echoes` (area characters, audience
  author, status experimental, needs story + group-chat), registry row in `src/features/registry.ts`; extend 09's state
  mapping and parity fixtures with the `echoes` row when this lands.

### S4 — Authoring and docs (D)

- Typed mutations `setEchoes`/`addEcho`/`patchEcho`/`removeEcho` (`gameMutations.ts` list pattern); wizard tool `setEchoes`
  validated by `readEchoes` (`gameOps.ts` pattern); `tools.test.ts` coverage.
- Studio `EchoesEditor.tsx` + `.stories.tsx` under Story features (source picker from existing transitions/quests/
  milestones/checks, delay unit, gates via existing gate editor, recipient select).
- Guide topic `echoes` in `docs/authoring/story-guide.md`, compact twin `src/copilot/guideTopicsEchoes.ts`, group in
  `guideTopicGroups.json`; `npm run docs:guide`, `npm run docs:settings`.
- Campaign adoption: owner decision 4; counts only in reports.

Later, not this plan: echo effects through existing engine writers or `EffectsApplier.withLedger`; echo state readable by
gates (option B); echo-to-echo chains (out per sol); player-visible "because you…" echo lines in recap (new surface).

## Predeclared floors

Sol's, frozen as written (informational; never retuned):

- **40 schedules** covering time jumps, invalidated targets, absent recipients and rollback (denominator 40; split recorded,
  e.g. 10 time-jump, 10 invalidated `when`/`cancel_when`, 10 absent/disabled recipient or unknown-entity, 10 rollback cuts).
- **Exact once-only due/cancel behaviour: 100%** (40/40).
- **Zero early or unauthorized delivery** (count over every boundary of every schedule; unauthorized = cue in a non-recipient
  block, a shared tier, or naming an entity unknown to that audience).
- **Narrator acknowledges ≥80% of eligible visible cues in real play** (denominator = narrator cues landed and offered while
  a narrator reply rendered; real Artemis, thinking and inner voice on; independent rater, not the reply model; abstentions
  reported). "Offered" here = 04's rendered-revision receipt for the echo's offer (a definition, not a retune).
- **Same result after reopen and replay** (every fixture: serialize/sanitize round trip and replay from each cut give
  identical event lists).

## Gates by tier

- S1, S2 (pure: `engine/`, game-layer validate, scheduler core): `npm run gates:quick` until green; `npm run typecheck && npm
  run lint && npm test && npm run typecheck:test`. 40-schedule fixture and properties are jest.
- S3, S4 (runtime / UI / ST-facing): above + `npm run build` + live gate via `debug` skill on a lane (`st-lanes.mts`, lane
  30+, images/sprites off): `st-navigation.mts recent-group` → `so-state.mts current` → no-LLM scenario
  `test/scenarios/echoes-*.json` (schedule, due, cancel, expiry, capacity, absent recipient, displaced by a must cue,
  held-secret restatement, story update, edit/delete rollback, reopen, echo-only story) with
  `expect` on `extras.echoes`, 04's offer/receipt rows for the echo source, and the applied private block (`getAppliedEpistemicBlock()` style probe, block named, not
  whole body). Payload golden: a new `test/scenarios/payload/echo-*.json` case proving the cue sits only in the recipient's
  block; declared hunks only.
- Acceptance LT row: real `send_generate` turns on the local Artemis, profile selected, no `debugResponse`, for the narrator
  floor. Authorized GPU window only (never while the owner plays). If it cannot run, say so; the row stays NOT green.
- Plan close: `npm run gates` (Storybook included), exact outputs in the Gate record. Main bundle under 1,300,000 B (echo
  code rides the game-layer chunk).

## Privacy and spoiler notes

- Authored cue text can name a held entity or restate a secret **using only known names**; private placement alone does not
  prove safety (sol cross-plan). Name checks (`knownEntities`) and content checks (`keptFrom`) are both required.
- **Member cue:** per-recipient content filter `keptFrom(cue, secrets, recipientNames)` (`heldSecrets.ts:50`); barred →
  waiting, reason `secret`.
- **Narrator cue:** the narrator's reply is shared with the player, so its cue passes the **resting-audience** content filter
  (`keptFrom(cue, secrets, null)`, the `restingFilter()` path, `memoryInjector.ts:316-319`) even though the omniscient
  narrator privately knows the secret, plus the `knownEntities` name check; barred → waiting, reason `secret`/`unknown-name`.
- **Filtered twice:** at revalidation (step 3) and again at delivery, because text can wait between landing and render: 04
  re-applies the same filter (recipient or resting audience) at draft time to the final text, and a secret introduced after
  scheduling holds the offer. Only that final filtered text counts toward an offered receipt.
- Tests: a secret restated with no unknown proper noun; a narrator who privately knows it; a secret introduced after
  scheduling and before render. All three must never reach a block.
- Cues reach exactly one private block, only through 04's channel. Never a shared tier, the resting view, the ledger, WI
  mirror, canon, chapter records, recap, player Memory tab or Journal. Player surfaces are identical with and without a
  pending echo.
- No player-visible surface in this plan. Author rows are Author view only (`so-ui.mts assert-player-clean`).
- Test material is synthetic and English; no campaign content; owner-facing reports give counts only.

## Invariants touched

- **Engine purity:** schema, validation, `due.ts` and the scheduler core import no STAPI; host access only through the port's
  injected deps.
- **Boundary work is a registry entry:** `echoes` order 11; no fan-out callback; the boundary order (`BOUNDARY_STEPS`) is
  untouched (no blackboard write).
- **Rollback ≡ replay; quarantine on every path:** `rollbackEchoes` beside `rollbackRumors` (events and `settled` rows);
  cursor rewinds to the kept boundary; 04's offer rows roll back in 04's slice; property tested. No compiled code key, so `ROLLBACK_DETECTORS`/`uncoveredCodeKeys` unaffected (option B would
  need a detector).
- **Chance is seeded:** delay from `unitDraw`; occurrence id from `chanceSeed`; no `Math.random`.
- **Story time is one code int:** read only; echoes never advance `story_time` and add no `effects.time` writer.
- **Held secret never through a shared tier; disclosure is not knowledge:** see Privacy. An echo landing writes no
  epistemic row and no latch.
- **Agency policy:** cue wording header forbids deciding for the player; `echo-speaks-for-player` warning; a refused or
  ignored cue resolves nothing (resolving the player's response is out).
- **Coordinators never import each other / never call `saveMetadata`:** port with injected `extras`, `persist`, `refresh`,
  `journal` (rumor wiring pattern); `architecture.test.ts` budgets kept.
- **RunOwnership:** kit load and any async step mint a token and re-check before the slice write.
- **One snapshot:** author rows ride the snapshot (`RuntimeSnapshot.echoesAuthor`), no getters in drawer render.
- **Main bundle budget:** lazy game-layer chunk.
- **One check registry:** no new Repair check unless a story declares echoes with a missing narrator (validation error, not a
  runtime check).
- **Thinking and inner voice:** untouched; the plan consumes neither.

## Dependencies and links

- v2.8 46 (consequence refs, `deriveRefs`), v2.8 50 (`story_time`), v2.8 52 (`knownEntities`, disclosure contract), v2.8 44
  (rumor due/occurrence design, `keptFrom` hold). Code for all four is present on `6861d989`.
- v2.9 04 §"Offer API (consumed by v2.9 07)": typed offer source union (echo-occurrence variant), arbitration, eligibility,
  expiry, rendered-revision receipts, realized records. S3 depends on it (sol build order step 5); 07 has no fallback
  injection path.
- Shared story-update extras-reconciliation hook with 04/05/08 (cross-plan finding); first plan to build it owns it.
- v2.9 09: `echoes` row in its state mapping and parity fixtures.
- v2.8 18 agency clause and G07 (player authors feelings) for the cue wording header.
- Not dependent on v2.8 42 witness consumers (recipient is authored, not inferred).
- Later effect expansion: existing engine writers or `EffectsApplier.withLedger` only.
- G10 (time-jump interrupt) deferred to v3.0; v2.9 05 patterns could later be an echo source (not this plan).

## Decisions for the owner

1. **Cue-only first slice** (sol's recommendation): yes / also allow effects now (not recommended).
2. **Temporarily invalid at due time:** wait until `expires` then expire (recommended; default window 6 boundaries or 4
   parts) / expire at once / wait without limit.
3. **Repeats:** once per echo per chat (recommended) / once per source occurrence (a looping transition re-arms it).
4. **Campaign adoption** after the floors run (counts only).
5. ~~Narrator-only delivery ahead of v2.9 04~~ — withdrawn after sol's review: no independent injection path; S3 waits for
   04's Offer API for both recipients.
6. **Independent rater route** for the narrator floor: Sol (opencode `openai/gpt-6.1-sol`) is the default; DeepSeek only
   as fallback when Sol is unavailable; never the reply model. Approving the route does not authorize model time, a GPU
   window or a pod.

## Unresolved questions

- Should `after` accept agenda steps (`EffectRef` kind `agenda`) in S1, or wait for a use?
- Does a check source key on outcome value only, or also on whose attempt (v2.8 18 G02)?
- Is 2 landings per boundary right after a long jump, or should it match rumors' 3?
- Does 04's Offer API freeze the proposed arbitration order (`must` > echo > raised topic > `may`) and the echo source
  fields as listed in S3, or adjust them? S3 follows 04's section either way.
- Who builds the shared extras-reconciliation hook first (04, 05, 07 or 08)?

## Review 2026-10-21 (sol)

- P1 rescanning cannot guarantee recovery: applied. Kit awaited before commits in echo-bearing stories; schedule from each
  finished boundary plus its check records; catch-up only over a verified contiguous range (200-entry log `engine.ts:292`,
  100 check records `storyCheckDraws.ts:11`), gaps reported; catch-up due from the source entry's `after` time.
- P1 closed-event eviction loses once-only identity: applied. `settled` identity rows outlive detail eviction; every
  terminal outcome consumes the echo until rollback reverses it; looping-source tests after eviction and cancellation.
- P2 expiry/capacity precedence: applied. cancel → expiry → due/revalidate → bounded landing, inclusive endpoints, capacity
  never resets due/expiry; frozen in the 40-schedule corpus; floors unchanged.
- P1 cross-plan, 04 delivery API: applied. Independent injection path removed; S3 hands an echo-occurrence offer source to
  04 §"Offer API (consumed by v2.9 07)"; lifecycle scheduled / due / landed-to-channel / offered (04 receipt) / realized
  (04 record); competition with must cue and raised topic pinned with a shared fixture; owner decision 5 withdrawn; stale
  Unresolved sentence replaced.
- P1 cross-plan, held-secret content filter: applied. Member cue `keptFrom` per recipient; narrator cue resting-audience
  `keptFrom(…, null)` plus `knownEntities`; filtered again at delivery; three named tests; placement-proves-safety claim
  removed.
- P1 cross-plan, story-update reconciliation of extras: applied. Definition identity + revision per event; owned
  `reconcileExtras` hook before `swapStory` (`storyUpdate.ts:175-177`); earned history kept under original identity.
- P1 cross-plan, new-only stories activate chunks: applied. `echoes` added to `usesGameLayer` (`gameLayer.ts:24-30`),
  parsing and normalized copy; echo-only fixture.
- P1 cross-plan, settings through `FEATURE_POLICY_FIELDS`/`extras.overrides` per 09: applied (S3 settings bullet; 09 mapping
  row); old "setting home" unresolved question removed.
- P2 cross-plan, model routing: applied. Sol default, DeepSeek fallback only (decision 6). Thinking and inner voice untouched.

## Gate record 2026-10-22 (v2.9 build, branch v2.9-07-echoes)

Worktree `C:/dev/so-v29-07-echoes`, off master `74420f97`. Owner decisions applied: cue-only; wait until `expires`, then expire
(default 6 turns / 4 day parts after due); once per echo per chat. No GPU, no lanes, no model calls.

Built:

- S1: `engine/echoSchema.ts` (own schema module; `schema.ts` untouched), `engine/validate/echoes.ts` (errors as planned; `parts`
  without a clock refused, never the rumor zero-delay fallback), `echoes` in `usesGameLayer`, parse + normalized copy through
  `gameFields`; `engine/life/due.ts` (`span`, `dueRank`, `dueNow`, `byDue`) now used by rumors (rumor tests unchanged and green).
  Diagnostics `echo-speaks-for-player`, `echo-names-unknown-entity` (narrator cues), `echo-gate-holds-never` (`cancel_when`
  holds at start), each with a consequence and guide topic. Story update: `reconcileEchoes` in the existing `reconcileExtras`
  hook (identity = id + after + to + unit, revision adds delay range, gates, expiry, hold; cue-only edit keeps pending events;
  changed revision drops pending events and rewinds the scan cursor; a new identity rescans the kept log; terminal events kept).
- S2: pure scheduler `engine/life/echoes.ts` (game-layer chunk): schedule from each `BoundaryLogEntry` + check records,
  idempotent occurrence ids (`chanceSeed`), delay by `unitDraw`, catch-up only over a contiguous kept range with `gaps[]`
  rows (`log`, `checks`), due from the source entry's own `story_time`; per boundary cancel -> expiry -> due/revalidate ->
  at most 2 landings; `settled` rows on eviction; `rollbackEchoes` in `quarantine()`; `sanitizeEchoes` in extras.
- S3: `runtime/echoPort.ts` (thin main-entry door) + lazy `echoRuntime.ts`/`echoRuntimeHost.ts`; boundary work `echoes`
  order 11. Delivery only through plan 04: `CuePort.addOfferProvider("echoes", …)` (echo source variant, priority 20, lane may,
  window `landedAt … landedAt + hold - 1`, spend once) and `onLapse("echoes", …)` closes an unoffered landing as `lapsed`.
  Offered = 04 receipt joined by offer key. Author rows `#so-echoes` (Memory, Author view) with every lifecycle state and
  gaps, inline level-3 "Echo landed" chip, journal author rows. Feature `echoes` in `FEATURE_POLICY_FIELDS` /
  `FEATURE_CONTROLS`, install switch `characters.echoes` (default true), registry row `delayed-echoes`, `FEATURE_STATE` row,
  settings copy, setup-path row, plan 24 matrix row.
- S4: typed mutations `newEcho`/`setEchoes`/`addEcho`/`updateEcho`/`removeEcho`, wizard tool `setEchoes`
  (`readEchoList` + cross-checks), Studio `EchoesEditor` (+ stories) under the game editor, `EchoesPanel` (+ stories), guide
  topic `echoes` (`story-guide.md`, `copilot/guideTopicsEchoes.ts`, `guideTopicGroups.json`), `npm run docs:guide`,
  `npm run docs:settings`.

Floors (deterministic, predeclared, not retuned):

- 40-schedule corpus `engine/life/echoSchedules.corpus.test.ts` (10 time-jump, 10 invalidated `when`/`cancel_when`, 10 absent or
  refused recipient / unknown entity, 10 rollback cuts): exact once-only due/cancel 40 of 40; early deliveries 0; unauthorized
  deliveries 0; planted controls caught.
- Rollback = replay at every cut 0-9 (`echoes.test.ts`), sanitize(serialize) round trip, update -> rescan equals replay on
  the new story.
- Privacy (`runtime/echoes.review.test.ts`): member cue restating a secret with no unknown proper noun, narrator who knows
  the secret (resting audience), secret introduced after landing and before render, narrator cue naming an unmet person: 0
  reached a block; echo never offered to a non-recipient. `echo-vs-must-vs-topic`: must cue, then raised topic, then echo
  (04's pinned order).
- Narrator acknowledgement >= 80% (real Artemis): NOT run: no GPU (owner 2026-10-21).

Commands and results (final tree):

- `npm run gates:quick`: green after fixes (typecheck, typecheck:test, lint, jest related, replay 32 of 32).
- `npm run gates` (plain, Storybook included): RED only at `test-storybook:ci` because :6006 was held by another worktree's
  http-server (`C:\dev\so-image-acceptance`, not stopped), and at `test:release` (bundled guide stale after a line-ending
  rewrite; regenerated). Then `npm run gates -- --no-storybook` twice: RED only at `test:debug` under parallel load (alone
  `npm run test:debug`: 1484 pass, 0 fail). Final: `npm run gates -- --no-storybook --serial` -> `gates: all green in 406.6s`
  (test:replay, test, build, test:debug, typecheck, typecheck:test, lint, debug:typecheck, test:plugin, test:release).
- Storybook on its own port: `npm run storybook:build`, test-runner on :6207 `--maxWorkers 2`: 164 suites, 985 of 985 passed
  (one EchoesEditor play fix: select-and-type instead of clear on a controlled number field).
- Main bundle `dist/index.js` 1,292,147 B (master 1,290,479; +1,668 B, budget 1,300,000 not raised). Echo logic, editors and
  panels ride lazy chunks; main holds the door, feature control row, setting and the wiring lines.

NOT run:

- Lane live scenario `test/scenarios/v29-07-echoes.json` (written, schema-checked by `scenarioSchema.test.mts` 17 of 17,
  evals syntax-checked): NOT run: unmerged branch, no staging.
- Payload golden `test/scenarios/payload/echo-*.json`: not written (needs a lane capture baseline).
- Real-LLM narrator floor and final-suite rows: NOT run: no GPU (owner 2026-10-21). Campaign adoption: none (owner).

Deviations:

- Scheduler core lives in `engine/life/echoes.ts` (pure, game layer), not `runtime/echoes/schedule.ts`: the game layer is an
  engine module and cannot import runtime.
- Install switch is `characters.echoes` (beside `characters.cues`, the channel it rides), not `memory.echoes`.
- `due` and `waiting` (with its reason) are derived at view time, not stored, so persisted state is exactly replayable;
  stored statuses are scheduled / landed / cancelled / expired / lapsed.
- Kit load needs no RunToken: echoes are game-layer fields, and a game-layer story does not load before the layer; a late
  echo runtime chunk is covered by the cursor catch-up.
- Plan 04 contract unchanged; one additive internal change: `addOfferProvider(id, provider, relevant?)` and
  `OfferRegistry.relevance`, so a registered echo provider wakes the cue channel (and the per-draft staging path) only for
  stories with echoes. Without it, registering any provider made `cues.active()` true for every story.
- Echo cue header stays 04's `CUE_COPY.echo` text.

### GPU run 2026-10-22

- Window 2026-10-22 ~21:23-23:20 local (00:23-02:20Z), local 3090 via the controller (`cli.mjs automatic`, text loaded clean
  after the earlier `crashed` code-1 status). Lanes 41 (master `a082a064`, served bundle `cb12b358`) and 42 (`v2.9-03-polish`
  `639ae53c`, bundle `33506e23`, staged into the ST code copy `C:/dev/st-v29-08`), both `--allow-local --headed`, images and sprites
  off in the lane copies, profile `Artemis RunPod RP` -> :18888, context 32768, thinking and inner voice on. Group
  `Group: Arin, DM Narrator` (the lane copy also drafts two members outside each story's roster).
- Rater: opencode `openai/gpt-6.1-sol` (`opencode run`, frozen prompt in the evidence folder). Evidence
  `C:\dev\so-lanes\41\debug\v29gpu\`, `C:\dev\so-lanes\42\debug\v29gpu\` (+ each lane's `debug/runs/`), archived to so-sessions.
- Pilots are NOT the predeclared corpora: small N, fixed fixtures, no frozen 40/100 denominators. They say whether the path works
  with the real model and which way a floor leans; no floor below is claimed met.
- Two model lanes shared one GPU: memory-model calls queued behind the other lane's replies (inner beat timeouts at 35 s,
  suggestions at 50 s, below). Environment, not a product change; recorded.
- Same pilot as 04 (x5): echo `unpaid` (`to: narrator`, omniscient) scheduled at the transition, landed the next boundary,
  staged in the narrator's applied block only (never Arin's), one real `/trigger` narrator reply, echo receipt from the real
  settle path 5 of 5.
- Narrator acknowledgement (sol rater): **0 of 5** (floor >= 80 %: MISSED on the pilot; denominator 5 landed-and-offered echoes,
  0 abstentions). A loose lexical match hit 1 of 5, which the rater scored no. Artemis ignores a `may` narrator cue here.
  Recorded, not retuned.

### GPU run 2026-10-23

- Window 2026-10-23 ~05:40-09:00Z, local 3090 through the controller (`cli.mjs automatic`), ONE model lane at a time: lane 42
  on branch `v2.9-gpu2-fixes` (base master `1b2beb9e`, fixes `137a359b`, served bundle `c28c0dcf`, staged into the ST code copy
  `C:/dev/st-v29-08`), `--allow-local --headed`, images and sprites off, profile `Artemis RunPod RP` -> :18888, context 32768,
  thinking and inner voice on, group `Group: Arin, DM Narrator` (members Luke, Ponticius, Arin, DM Narrator). Lane 41 (master
  `45e4a83b` bundle) served the diagnosis runs before the fix. Rater opencode `openai/gpt-6.1-sol` (frozen prompts in each
  `rate/` folder). Evidence `C:\dev\so-lanes\41\debug\v29gpu2\`, `C:\dev\so-lanes\42\debug\v29gpu2\` (+ each lane's
  `debug/runs/`), archived to so-sessions.
- Diagnosis (lane 41, payload capture `p07-diag-payloads.jsonl`, pilot `v29-04-07-model-pilot.json`): the echo reached the
  narrator's reply prompt on the turn it was due, in the depth-4 system block, but as a bare bullet with no header ("- If it
  fits, you may bring up: … Say it as yourself …") right under the narrator's self-voiced directive, and with none of the plan's
  S3 wording ("Coming back now, already decided by earlier events …"). Nothing was withheld; placement and timing were right; the
  wording was ours. Side finding, not fixed: the narrator's inner beat for that turn (which itself picked the echo up) lost the
  3 s draft wait (`INNER_DRAFT_WAIT_MS`) because it queued behind the extraction read on the one GPU, so the reply had no beat.
- A/B on the captured narrator prompt (same request body to the controller, 10 seeds per arm, sol rater blind to arm,
  `ab/ab07-r2.json`, `rate/p07-ab/`): current copy **0/10**, plan header **8/10**, header + "bring it into this reply through the
  world or the people in it" **10/10** (player narration 1/10).
- Fix `137a359b` (`src/engine/life/offers.ts` `ECHO_HEADER`): an echo renders as that header line plus its own bullet; guide and
  tests follow. `gates:quick` green.
- Re-measure on the real path (lane 42, fixed build, same pilot, full replies kept in localStorage, `pilot-replies.json`,
  `rate/p07-real/`): narrator acknowledged **18 of 20** (90 %, floor >= 80 %: met on this pilot; denominator 20 landed echoes,
  each staged in the narrator's applied block with one rendered narrator reply; 0 abstentions), player narration 0/20. Runs 1-8 of
  the 28 kept only the runner's 800-character line; the 20 rated are runs 9-28. Still a single-fixture pilot, not the 40-schedule
  corpus (which is D and green in jest).
