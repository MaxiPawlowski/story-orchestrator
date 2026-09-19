# Plan 06 — Typed extraction on the judge (the shared-read split)

## Objective

Let authored qualities that opt in be read by the judge on **every** boundary, while the
generative shared read keeps everything else at its cadence. The win is not accuracy: on the hard
set the judge scored 47/48 against Artemis's 46/48, which is parity. The win is **when**. Today a
gate's quality changes only after an LLM read: a cadence read (every third non-firing boundary), a
forced cue, a scene trigger or a stall re-check. A judged quality is read at every boundary, so its
delta applies at the next boundary and the transition can fire there. It also takes about 3 s of
GPU per read away from the roleplay model.

This is the widest change in v2.2 (format 2, the Studio, the extraction path, the live suite), so
it comes after the judge has earned trust in plans 01–05.

## Context

- Spike: README §Typed deltas, §Tension, §Evidence, §Gate-leaf yes/no. `experiments/extraction.mts`
  holds `planCase`. The migration strategies:

| Quality type | Question |
|---|---|
| bool / enum | choice with a `not shown` option; **plain** = rubric verbatim + "Judge only from what `transcript` shows." |
| rating numbers | score on levels parsed from "from N (x) to M (y)" in the rubric, or authored levels |
| stated numbers / strings | choice over candidates found in code (`lib/numbers.mts` `findNumbers`, `findStringCandidates`) + `none` |
| every case | an evidence choice over message ids |

- Results:
  - Plain migration: 47/48 on the hard set.
  - Live-suite fixtures: 28/30. Both misses need inference.
  - Confidence ≥ 0.95 kept 71% of judgments, at 100% accuracy.
  - Tension: exact 26/36, running one level high when calm. **Tension stays on the LLM.**
  - Gate leaves: AUROC 0.99, and p ≥ 0.9 was right 36/36.
- **The criteria lesson.** 8 of the spike's 10 `not_for` clauses were written on the wrong option,
  which silently inverted their meaning. They were caught only by reading the rendered request.
  Authoring criteria therefore needs a rendered preview.
- Extraction today:
  - `ExtractionScheduler.onBoundary` queues a P1 `cadence` read over the last `cadence` messages
    when `boundary % cadence === 0` and the boundary did not fire.
  - `runSharedRead` runs window → `deriveScope` → prompt → `parseSharedReadResponse` → audit.
  - `applyAudit` → `enqueueExtractorDeltas` → the engine applies at the next boundary, with
    latching and monotonic checks in the engine.
  - Stall re-check: the `reconciliation` boundary work runs `maybeScheduleReconciliation`, which
    queues a P0 `reconcile:<keys>` read over the checkpoint span.
- Consumed: plans 01 (judge), 02 (verify rung), 03 (OOC annotation, if built). Regression floor:
  `so-live-suite --min 0.9` (always), J3, J6, and J7 once.

## Scope

In:
- Format-2 `read_as` + `criteria`.
- Validate, Studio and diagnostics with a rendered preview.
- The judged typed read (every boundary) with residual fallback into the LLM read.
- Judged evidence.
- The judge stall pre-check.
- `so-live-suite --judge`, fixtures, J11 extraction checks.

Non-goals:
- Tension, arcs, memory lines, facts, epistemic and ledger lines. They stay on the LLM read.
- Qualities with no hint: they never touch the judge.
- Inferring hints from rubrics. An author opts in explicitly; a copilot op may *suggest* one.

## Deliverables

### Format 2: `Quality` gains two fields

- `read_as?: "choice" | "stated" | "rating"` (called "the hint" in the rest of this plan). It is
  **not** called `extraction_hint`:
  `Transition.extraction_hint` already exists as free text for the LLM read (`schema.ts:138`,
  `extraction/scope.ts:60`, spec v2), and two meanings under one name would confuse authors and
  the copilot.
  - `choice` is for bool/enum;
  - `stated` is for number/string: select a value the text states, from code-found candidates;
  - `rating` is for number: a position on described levels.
- `criteria?`:
  - for `choice`: `Record<value | "true" | "false", string | {what, not_for?, examples?}>`;
  - for `rating`: `{levels: Array<{value: number, label: string}>}`.

These land in `engine/schema.ts` and `validate.ts`:
- errors: a hint incompatible with the type; criteria keys that are not enum values (or
  `true`/`false`); a `rating` with neither rubric levels nor `criteria.levels`; `source !==
  "extractor"`;
- warning: `not_for` text that names the option it sits on.

`storyDiff`: adding or changing a hint is **compatible**. `examples/sun-ruins` gains hints on the
qualities where the spike showed parity, with a version bump.

### Studio: `QualityEditor`

- An **Extraction** section: a hint select and a criteria editor (per option: what / not for /
  examples; per level: value + label).
- **Preview request**: renders the exact Jev question this quality will send, as JSON, the same
  function the runtime uses. It sits beside a sample window picked from the fixture corpus.
- Diagnostics: `quality-hint-no-criteria` (info) on an enum whose values are single words with no
  criteria, since the plain form works but criteria disambiguate. `quality-hint-latching-note`
  (info): latching raises the confidence floor.
- Copilot ops: `addQuality` / `updateQuality` carry both fields (`copilot/prompts.ts:20–21`, plus
  the op validators). The wizard may *suggest* a hint in a staged
  proposal, and the author accepts it per card.

### Pure core: `src/judge/extraction.ts` + `src/judge/numbers.ts`

- `numbers.ts`: promote `findNumbers` / `findStringCandidates` from the spike, with unit tests over
  the spike's cases (word numbers, "zero point six", fractions, percentages, Spanish).
- `buildTypedQuestions(qualities, window, story)`: the spike's `planCase` strategies. A quality
  with criteria uses the structured form, otherwise plain. Each question's state reference is
  `transcript`. One call carries every hinted quality in scope plus one evidence choice.
- `readTypedDeltas(answers, qualities, blackboard)`:
  - returns `ParsedDelta`s for answers over the floor;
  - `not shown` / `none` / below floor → no delta;
  - evidence = the chosen message's text, ≤ 160 chars.
  - Values are coerced exactly as `parseSharedReadResponse` does (the same coercion helpers), so
    the engine sees one shape.
- `policy.ts` gains `EXTRACTION_CONFIDENCE = 0.8`, `EXTRACTION_LATCHING_BUMP = 0.1` and
  `STALL_DIRECT_P = 0.95` (measured, see Phase A below). It also gets `STALL_GENUINE_P = 0.1`: when every judged leaf of an unmet
  gate sits below it, the stall is taken as genuine.

### Judged read in the extraction pipeline

- `runSharedRead` gains an optional injected `judgeTyped` step. It is injected so that
  `sharedRead.ts` stays testable with a fake transport and the judge seam stays in `stHost/`.
  (`extraction/` as a whole is not host-free: `client.ts` and `chatWindow.ts` import `STAPI`, and
  only `scope*` is pure.)
- On a **cadence or triggered read**, with `judge.uses.typedExtraction` on:
  1. The judge answers the hinted qualities in scope.
  2. Qualities answered over the floor are removed from the LLM scope.
  3. The LLM prompt covers the residual scope, so a below-floor quality is still read.
  4. `acceptedDeltas` = judged ∪ LLM.
  - The audit records each delta's source (`judge` | `llm`) and the judge's confidence.
- **Every boundary**, with `judge.uses.typedExtraction` on and at least one hinted quality in
  scope:
  - New boundary work `typed-read` (order 15, after `scheduler-tick`). It is fire-and-forget, not a
    scheduler job.
  - It runs `judgeTyped` alone over the last 3 messages.
  - Its deltas go through `enqueueExtractorDeltas`, the same path as `applyAudit`'s first step,
    so they queue for the next boundary. The judged-read record lands in its **own** ring,
    `extras.extraction.judgedReads` (cap 20, sanitizer default `[]`).
    - It does not go in `extras.extraction.audits`. That ring is capped at 20 and holds the LLM
      reads the author debugs from; a judged read every boundary would push them out within
      twenty turns.
    - The Scheduler tab and the session journal read both rings.
  - Freshness guard as in plan 03.
  - **Skip rule.** It skips when this boundary's `scheduler-tick` (order 10) queued a cadence
    read, because that read will carry the judge step. The predicate is the scheduler's own:
    `!fired && boundary > 0 && boundary % cadence === 0 && !underPressure()`
    (`extraction/scheduler.ts:88`). The scheduler exposes it as `cadenceQueuedAt(boundary)`.
    `lastReadBoundary` can't serve: it is written only when an audit *lands*
    (`extractionCoordinator.ts:99`), seconds after this entry runs.
- A judge failure makes the cadence read ask the LLM about every quality (today's scope). The
  every-boundary read is skipped, and the call ring records `fallback`.

### Stall pre-check

With `judge.uses.stallCheck` on, the `reconciliation` entry asks the judge first. It sends one noul per unmet
**extractor** leaf, phrased from the leaf and the quality rubric ("Does `transcript` show that
<rubric> is <v>?") over the reconcile window.

- A bool/enum leaf with op `==`, or `in` with one value, at p ≥ `STALL_DIRECT_P` (0.95) → a direct delta
  `{q, v}` through `judge:reconcile`.
- Every leaf below `STALL_GENUINE_P` → no LLM re-read.
  - The event stays **unresolved**, with its `evidence` gaining `judge: nothing shown (max p …)`.
  - The player's stall signal therefore stays: `pipeline.ts:28` shows `stalled-rechecking` only
    while an event is unresolved, and resolving it would hide a real stall.
  - The next reconciliation check (every 3 turns past the target) asks again.
- Anything else → today's LLM `reconcile:` read.

The question shape differs from the spike's gate-leaf set (which phrased leaves directly), so
Phase A re-measures it: ≥ 30 leaves from the fixture corpus, with floor AUROC ≥ 0.95.

**Measured 2026-09-19** (`run.mts --only stall-leaves`). The question is `Does \`transcript\` show that
the answer to "<rubric>" is <yes|no|"value">?`, asked over the hard set plus the live-suite
fixtures: 122 leaves over 49 cases (59 shown, 63 contradicted or never shown).

| Measure | Result |
|---|---|
| AUROC | **0.98** (floor 0.95, passes) |
| Accuracy at 0.5 | 91% |
| Shown leaves below 0.1, i.e. a real stall the pre-check would miss | **0** |
| Direct deltas at p ≥ 0.90 | 36/37 right. The one miss is H12, a trap where "moon" is guessed and then corrected, at 0.93 |
| Direct deltas at p ≥ **0.95** | **27/27** right, covering 27 of the 59 shown leaves; the rest take today's LLM re-read |

So `STALL_DIRECT_P` is 0.95. Shown leaves whose value is `no`/`false` score low: the negated
phrasing is weak, so they never write directly and fall through to the LLM re-read. That is the
safe direction.

### Journal and author view

- The Blackboard tab shows each quality's last source (`judge` / `llm`) and confidence.
- The Scheduler tab shows `judge:typed` reads beside cadence reads.
- Player surfaces are unchanged: the stall signal already covers what the player sees.

### Settings

Two independent opt-ins (overview rule 4), both off by default: `judge.uses.typedExtraction`
(`#so-judge-use-typed-extraction`) and `judge.uses.stallCheck` (`#so-judge-use-stall-check`). A
story's `read_as` hints do nothing on an install that hasn't opted in.

### Live suite

`so-live-suite.mts --judge` runs each `extractor*` fixture through the judged path, using the same
`runFixture` harness plus `judgeTyped`. Hints come from a fixture sidecar
(`test/fixtures/<name>.hints.json`), so fixture stories stay as recorded. It scores the same
exact-match `{q, v}` per whole fixture, as today. Record the goldens under
`test/goldens/judge/live/`.

The floor is `--judge --min 0.85`. The spike's comparable whole-fixture rate was 19/21 = 0.90
(`report.md:20`), which leaves no margin at 0.9. Both spike misses needed inference.

The rule is that every judged miss is triaged in the Gate record: either remove the quality's
`read_as` (it needs inference, so leave it on the LLM), or add criteria that fix it. After triage,
the hinted set must reach 0.9. The LLM-only run keeps `--min 0.9`.

### Fixtures

- `test/fixtures/judge/typed.json` = H01–H32, L01–L03, plus the 30 live-suite judgments.
- `test/fixtures/judge/stall.json` = the Phase A leaves. The file name matches `--use stall`, per
  plan 01's layout.

### J11 extraction checks

| Check | What |
|---|---|
| J11.20 | Sun-ruins with hints, judge extraction on. The player's message makes a hinted gate true at a **non-cadence** boundary. The transition fires at the next boundary, where today it waits for the next cadence read. Assert the boundary number against a judge-off run of the same script |
| J11.21 | A below-floor judged answer → the next LLM read's prompt contains that quality (residual scope). Assert on the audit's prompt |
| J11.22 | A latching quality with a judged answer at 0.85 (under 0.8 + 0.1) → no delta from the judge |
| J11.23 | An induced stall where the fact was stated two turns ago (bool leaf) → `judge:reconcile` delta, and no LLM reconcile read in the fetch counter. A second stall where nothing was stated → no LLM re-read, the event stays unresolved, and `#so-stall-signal` stays visible |
| J11.24 | Judge off → audits carry no `judge` source, and the live suite matches the recorded goldens' rate |

## Implementation notes

- One writer per quality per read: the judge wins over the floor, the LLM covers the rest. The
  audit says which. Never merge two values for one quality.
- The judged read is cheap enough for cadence 1, but only hinted qualities in the **current scope**
  (active + reachable gates, `extraction/scope.ts`) are asked. Scope already keeps the question
  count small.
- `extractionCoordinator` (290 lines) owns the new boundary entry's `run`. The manager gets one
  delegate at most, paid for elsewhere (v2.1 rule 3).
- Hints are opt-in per quality **and** gated by the install-wide flag. A story authored with hints
  plays exactly as today on an install without the judge.

## Leaves the machine

| Question | Data sent |
|---|---|
| Typed read | Last 3 messages (every boundary) or the read window (cadence/triggered); each hinted quality's rubric, values and criteria; code-found candidate numbers/spans |
| Stall pre-check | The checkpoint span window; the unmet leaves' rubrics and values |

## Validation gate

Harness:
- `npm run typecheck && npm run lint && npm test && npm run build`.
- Pure suites: `numbers.ts`, `buildTypedQuestions` snapshots per type, `readTypedDeltas` coercion
  parity with the LLM parser, residual-scope split.
- Validate tests for every new error/warning.
- Storybook: the QualityEditor Extraction section + preview.

Live (fresh-start, headed, real):
- `so-live-suite --min 0.9` **and** `--judge --min 0.85`, then 0.9 after the miss triage.
- J11.20–J11.24, run twice.
- `so-judge calibrate --use typed` and `--use stall`.
- J3 and J6 with judge extraction on, run twice.
- J2 (a hint authored through the Studio, preview checked).
- **J7 once with judge extraction on**: full sun-ruins play-through, every gate fired by real
  extraction. This is the change that can stall a story, so the long-haul journey is part of its
  gate.

## Persona tags

| Element | Tag |
|---|---|
| Extraction section, preview, diagnostics | `author` |
| Blackboard source column, `judge:typed` rows | `author` |
| `#so-judge-use-typed-extraction`, `#so-judge-use-stall-check` | `both` |

## Delegated decisions

- The every-boundary window size (3 proposed).
- Whether `rating` qualities show their levels in the Blackboard tab.

## Unresolved questions

- Per-quality floors: this plan ships one install-wide floor plus the latching bump. It adds an
  authored `criteria.min_confidence` only if the live suite shows a quality that needs one.
- Should the wizard suggest hints by default for new stories? Proposed: suggest, never apply.
  Accept stays per card.
