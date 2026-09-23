# Plan 01 — Evidence hardening

**Kind:** tooling, plus one product fix (the self-test grader).
**Roadmap packages:** 0 (reconcile the baseline) and 0b (harden acceptance evidence).
**Closes:** R12, T1–T6, F3, S5–S13. Supplies the retry/reporting verb F1 needs; F1 itself is
plan 02's.
**Revised 2026-09-20** per `review-astra-2026-09-20.md` (edits 1, 5).

## Objective

Make a green result mean something before any later plan claims one. The review showed three ways
this harness passes while the product fails: assertion objects with typos pass vacuously, verbs
report `ok:false` without failing the step, and "strict" excludes human and cleanup outcomes. v2.2
added a fourth from the other side: journeys mutate the install (cadence, lorebooks, the story
library) and leave it that way, so the next run — or a real player — inherits a test's settings.
This plan also brings the review's own reproductions into the tree, so every later plan closes a
finding by flipping a test, not by prose.

## Context

- Review harnesses: `scripts/review/reviewRegression.test.ts` (13), `memory-engine.test.ts` (14),
  `turn-boundary.test.ts` (4), `selftest-grading.test.ts` (3), `independent-story.test.ts` (2).
  Re-run on `9561bac` 2026-09-20: 19 fail / 17 pass; R3 the only fix (see `00-overview.md`).
- Test credibility audit: `../../review/2026-09-18/test-credibility.md`. Current locations:
  `so-scenario.mts:142–330` (`evaluateExpect` has no unknown-key rejection), `:418–462` (verbs
  return `{ok}`), `:834` (first non-modifier key only); `so-journey.mts:427–432` (human → skipped,
  missing capability → blocked), `:463` (`failed = fail>0 || runnerError || strict&&blocked`);
  `so-live-suite.mts:93` (`scoreFixture(expected.deltas, live.deltas)` only).
- Self-test grader: `src/runtime/selfTest.ts:84` (either of two deltas), `:90/:96` (any memory /
  arc line), `:109/:115` (any epistemic / ledger entry), `:146` (capability failure only on empty).
- v2.2 seeds S5–S13 are described in full in `../v2.2/08-acceptance.md` §v2.3 seeds and
  `../v2.2/acceptance-report.md` §Findings register (F1, F3) and §The automatic schedule.
- Already landed since those seeds: `writeGlobalConfig` keeps live `v2Stories` on restore
  (`so-journey.mts:94–116`); `restoreGlobalConfig` refuses an empty snapshot over a populated
  config; step-level `attempts/retryBack` exists for single-sample assertions (c860db2); journeys
  pin their group and activate their lorebooks (31e6f08); `so-assets` baseline trust (1d9510d).
  This plan finishes each of those rather than restarting them.

## Scope

In: promoted review tests; scenario/journey/live-suite/self-test credibility; journey hygiene and
cleanup; J12; the J1 overlay check.

Non-goals: fixing any R/M/E finding other than R12 (those tests land red on purpose); new product
features; the release manifest (plan 08).

## Deliverables

### A0. Observation tooling (lands and is gated before P0)

Three scripts the P0 characterization run needs, built and live-checked on their own before any
other deliverable of this plan:

- `scripts/debug/so-run-header.mts capture --label | diff <file> --allow <fields>`: the run
  header (playbook §Per-experiment baseline), including the `v2Stories`, `wizardSessions` and
  global-lorebook-selection inventories; `diff` fails on any difference not in `--allow`.
- `scripts/debug/so-journal.mts follow --out <jsonl>`: a live tail of boundaries, transitions,
  reads (window, trigger reason, scope, raw response, rejections, applied boundary), talk
  decisions, stagecraft proposals, judge calls and discarded results, persisted as JSONL.
- `scripts/debug/st-payload.mts arm --persist`: keep every generation request of the session on
  disk (today the ring holds 5), with the drafted member.

Gate: the three run against a scripted 10-turn sun-ruins chat; the header diff of start vs end
is empty with `--allow chatId`; the JSONL holds every boundary the journal export lists.

### A. The review's reproductions become the finding ledger

- **`test/findings/ledger.json`**: one row per finding id (R1–R12, E1, M1–M7, C1–C4, T1–T6,
  F1–F6, S1–S13) with `owner` (one plan), `evidence: "jest" | "live" | "human"`, and for `jest`
  rows the **`expectedFailure`** (a substring of the assertion message the open test must fail
  with). An open finding is an ordinary test stating the intended contract, run through
  `finding()`: it must still fail, and fail with the recorded reason, so a broken fixture or an
  obsolete API call is a failing gate rather than a quietly green "open finding". A fix flips the
  row to `closed` and the same body must pass. `it.failing` is deliberately not used — jest passes
  a `.failing` test whenever its body throws, for any reason. `src/runtime/findingsLedger.test.ts`
  checks the ledger is well formed and that every jest row has exactly one declared reproduction;
  `scripts/jest-findings-reporter.cjs` checks each of those actually executed, because a source
  scan cannot see a skipped suite. The open list and count are printed on every run; no document
  quotes a number.
- Split the five harnesses by owning module: `src/runtime/coordinators/stagecraftCoordinator.review.test.ts`
  (R1–R3), `src/engine/engine.review.test.ts` (R4, E1), `src/extraction/authority.review.test.ts`
  (R5, R6), `src/runtime/storyUpdate.review.test.ts` (R7), `src/wizard/ownership.review.test.ts`
  (R8), `src/generation/merge.review.test.ts` (R9), `src/runtime/turnBridge.review.test.ts`
  (R10, R11), `src/runtime/selfTest.review.test.ts` (R12), `src/memory/reversal.review.test.ts`
  (M1–M7). Every file keeps a **positive control** (`it`) beside each open finding.
- Three harness tests are **rewritten as contract tests** rather than promoted verbatim, because
  their assertions conflict with the accepted remedies: **R6** keeps the 7-character `"crossed"`
  evidence and asserts the out-of-scope delta is rejected with `outside requested scope` *and*
  the in-scope short evidence is accepted (so an evidence-length rule cannot close it); **R7**
  asserts the structured description and text-node rendering, not an escaped string; **E1**
  asserts `{ok: false, reason: "history-unavailable"}` and the notice, not a successful rollback
  to boundary 0.
- `scripts/review/fixtures/two-ways-across.story.json` moves to `test/fixtures/` with its two live
  scenarios into `test/scenarios/` (their hard-coded `profileId: 'so-review-artemis', cadence: 0`
  replaced by `setup.extraction {profile: "inherit"}`); `independent-story.test.ts` becomes an
  ordinary engine test.
- `scripts/review/*.test.ts` are deleted once promoted (the dossier keeps its evidence copies).
- **Journal contract changes this plan owns** (raised by the §A0 peer review, deferred to here
  because they are product, not tooling): every extraction read carries its audit id through the
  apply queue, so the journal can link read → queued → applied/discarded instead of matching equal
  delta strings (`runtimeManager.ts` enqueue, `journal.ts` `extractionEvents`); an ordinary
  boundary that applied nothing is journaled rather than omitted; a discarded write is named, not
  counted; the live audit ring is exposed on the snapshot so a tail need not read the persisted
  blob, which lags and is capped separately.
- **Tests get a typecheck**: `npm run typecheck:test` (`tsconfig.test.json` over `src/**/*.test.ts`
  and `test/**`), added to the gate line; tests are excluded from the production typecheck and
  lint today (`tsconfig.json`, `package.json`), so an obsolete call in a promoted test would
  otherwise go unnoticed until it "failed as expected".

### B. Self-test grader (R12, product)

`runModelSelfTest` grades semantics, not presence:
- deltas: **both** `location=tunnel` and `has_lantern=true` required;
- memory / arcs: required concept matches (lantern, tunnel; "debt" + "Bel");
- epistemic: subject `Corin`, tag `hiding`, hidden from `Bel`; ledger: entity `Corin`, field
  matching `arm`, value matching `wound`;
- a transport error is reported as `error`, never as a semantic fail, and never yields a
  capability suggestion;
- negative fixtures: well-formed output about the wrong entities (the review's moon/dragon/chess/
  cheese response) fails every tier it should.

### C. Scenario runner (T1, T2)

- Closed schemas for step verbs, `expect`, `expect_ui`, `wait`, `stagecraft`, `ui`: an unknown or
  empty assertion object throws with the key named. Every fixture under `test/scenarios/` and
  `test/journeys/` passes the schema (a jest test loads them all).
- `import_story`, `extract`, `expand`, `restart_story`, `copilot probe` and every verb returning
  `{ok}` **throw** on `ok:false` unless the step carries `expectFail: true`.
- A step with more than one non-modifier key is an error, not "first key wins".

### D. Journey runner (T3, T4, T6, F3, S5)

- Three tallies in the record and on screen: `automated {pass, fail, blocked}`, `human {scored,
  unscored}`, `cleanup {ok, failed, leaked}`. `--strict` fails on `blocked`, `not-runnable`,
  cleanup failure and any leak. `--require-human-record <file>` fails when a human check has no
  scored row.
- `--only` writes `partial: true` into the record; the archive script under `test/journeys/records/`
  refuses a partial record for a gate.
- J9.2 reports each collision subcase as its own outcome; a subcase the install cannot exercise is
  `blocked`, not silently `{skipped}`.
- F3: every J11 check imports its own story, and the runner errors when a `--only` check reaches a
  generation step with no story loaded.
- S5: audit every journey for a check that asserts one model output with no `attempts`; give that
  class `attempts/retryBack` (F1's J9.1 first). The record keeps `firstAttempt: pass|fail` per
  check beside the eventual outcome, so plan 02 can state F1's first-attempt rate.
- S10: the chat-integrity and away-recap dialogs are **already** refused by `applied.dialogs`
  (`so-journey.mts:243–254`); this plan verifies it with a planted dialog test and extends the
  same list to `applySetup`'s other blocking popups (import confirm, ST update notice).
- J0 carries an **expected outcome per check** (`expect: "pass" | "blocked" | "fail"`) and the
  runner asserts them: J0.3 stays capability-guarded and must report `blocked` (its throw is
  never reached by design); a new **J0.4** with an unguarded throw must report `fail`; a planted
  wrong-entity self-test response must report `fail`. J0 is the runner's own gate, not an
  all-green product journey.
- `--group <id|name>` override on `so-journey run` (today only `setup.group` pins it), so a
  shared install can pin at the command line the way `so-scenario --sandbox --group` does.

### E. Journeys leave the install as found (S6–S12)

- Every journey declares `setup.extraction {cadence, stabilityLag, profile: "inherit"}`; the runner
  refuses a journey without it. Cleanup restores install-wide settings to the **pre-run** capture,
  not the setup snapshot a check later mutated, and prints any value it writes back that a check
  changed.
- Library safety: restore merges `settings` and `wizardSessions` from the pre-run capture and keeps
  every `v2Stories` record that exists live (already partly true); a jest test over the restore
  function proves a story imported mid-run survives.
- S7: on setup, if `.debug/so-journey-config-snapshot.json` is newer than the live root and the
  live root is empty, apply the recovery and say so.
- S6: `libraryBefore`, the sandbox guard's chat ids and the config snapshot each carry
  `trusted: boolean` like the asset baseline; an untrusted capture narrows scope, never widens it.
- S8: `so-assets remove --baseline <file>` (default: the archived journey baseline when present).
- S9: after deleting a book, `so-assets` evicts the client `worldInfoCache`; it removes marker-named
  regex scripts and QR sets; `--legacy-mirrors` deletes `Story Orchestrator - <title>` books with
  no chat-id suffix **only** when listed by name; a wizard journey names its draft with the marker
  so its session key is deterministic.
- S10: `applySetup` recognises "Chat integrity check failed" by text and fails the run naming it.

### F. Live suite (T5)

- Scores `facts`, `rejected` (by reason), `epistemic`, `ledger`, `arcs` whenever the fixture's
  expected file specifies them; per-tier accuracy in the report; the aggregate is labelled
  "plot-delta accuracy".
- **Per-tier floors bind**: `--min-tier facts=0.85,rejected=0.9,epistemic=0.8,ledger=0.8,arcs=0.8`
  (defaults from the v2.2 goldens, recorded in the Gate record); a tier below its floor fails the
  run whatever the aggregate says. The review's T5 asked for independent thresholds, not a
  report column.
- `--expect-count <n>` for release runs; skipped or incomplete fixtures are listed by name and
  count against the expectation.

### G. New journey J12 — the unaided schedule (S13)

Shipped default cadence, no `runExtractionNow`, no `/cp`: three real player turns; assert
`extraction.audits ≥ 1` with reason `cadence`, a delta whose evidence quotes the player's own
words, the checkpoint moved, and the checkpoint's effects applied. Twice, `--strict`. This is the
configuration every real install runs and no journey covered it.

### H. J1 overlay check

J1 gains an automated check that `#so-new-story-wizard` is the top element at its own centre
(`elementFromPoint`) with the settings drawer open, and that the click opens the wizard. The
review saw the chat overlay intercept it on an isolated host; v2.2's J1 did not. The check settles
it either way.

## Verification

- **Story and recipe:** `live-gate-playbook.md` §Plan 01 — J12 on the adventurer story at
  cadence 3 (the P0 first transition, unaided, with `reason: "cadence"` and no trigger read);
  every journey once on its own story with a run-header diff that shows only the declared
  differences (chat id, the journey's story id, its `v2Stories` record during the run). §A0 is
  gated first, then P0 is recorded, then the rest of this plan.
- `npm run typecheck && npm run typecheck:test && npm run lint && npm test && npm run build`.
  The ledger guard prints the open list; the Gate record pastes it (the R/M/E subtotal is 18
  after R12 closes here; C/T/F/S rows carry their own evidence types).
- Schema test loads every fixture; a planted fixture with a typo'd `expect` key fails.
- `so-journey.mts run J0` with expected outcomes: J0.3 `blocked`, J0.4 `fail`, the planted
  wrong-entity self-test `fail` — the "intentionally failing runner check" the review left
  outstanding, done without pretending a guarded check can throw.
- Judge-off, real LLM, headed: every journey J1–J11 once, to prove the harness changes do not
  alter outcomes against the v2.2 archived matrix; J12 twice `--strict`; J9 four consecutive runs
  with the J9.1 retry (F1 bound).
- After each journey: `so-assets assert-clean`, `so-library` diff against the pre-run list,
  install-wide settings diff empty.

## Persona tags

No UI change except the self-test result panel wording (`both`).

## Delegated decisions

- Whether the promoted review tests keep the review's `describe` names or take the finding ids as
  titles. Proposed: ids first, review title second.
- Retry count for the single-sample class (proposed 3, the curator precedent).

## Unresolved questions

- Should the `it.failing` ledger fail the build if a fix lands **without** flipping its test (i.e.
  the test turns green while still marked failing)? Jest already does this; confirm it is not
  silenced by `diagnostics: false`.

## Gate record — the J1.6 diagnosis, and a send that lied (2026-09-20)

### The backend is down. Every live LLM gate is NOT green.

J1.6's failure is diagnosed, and it is not a regression. Calling each Connection Manager profile
directly:

| Profile | Result |
|---|---|
| Artemis RunPod RP (main) | `API request failed` in **9 ms** |
| Story Orchestrator Memory RunPod (extraction) | `API request failed` in **8 ms** |
| Story Orchestrator Memory Local | `API request failed` in **10 ms** |

All three are unreachable. `ctx.onlineStatus` still names the model, because it is a cached status
and not a live probe — so the install *looks* connected. Per the validation tiers in CLAUDE.md
this is stated rather than worked around: **no real-LLM gate can be run right now**, and none of
the live results in this plan's records depend on one except where explicitly noted.

The full chain behind J1.6: the backend is down → each send still appends an assistant message,
but an **empty** one → the empty message commits a boundary → three boundaries with no content →
extraction has nothing to read and its own profile is down too → `auditCount: 0` → the checkpoint
cannot move → `wait` times out at 300 s. `live-plan03-extraction.json` fails identically and
independently, which is what ruled out anything J1-specific.

### A `send_generate` that produced nothing reported `ok`

The diagnosis exposed a credibility gap of exactly the kind this plan exists to close.
`sendUserMessage` waited for idle and returned success; it computed `newMessages` and never looked
at it. Three sends in a row reported `ok` in 4–8 s each while every reply was zero characters long,
and the check only failed 300 s later on a symptom five steps downstream.

`send_generate` now reports `replied`, `lastSpeaker` and `lastLength`, and warns when nothing
answered. It is **not** fatal by default, deliberately: silence is legitimate under talk control
(`allow_silence`, a director returning NONE), and an unreachable backend is indistinguishable from
it at this layer. A step that requires an answer says `expectReply: true`.

Verified against the down backend, which is the exact condition:

```
{"send_generate": {..., "expectReply": true}}   -> send_generate FAIL ... reported ok:false
{"send_generate": {...}}                        -> ok, with WARNING: send produced no reply
                                                   (last message is "Arin" with 0 characters)
```

Making it fatal by default is the right end state, but it cannot be justified without testing the
silence path, and the silence path needs a working backend. Recorded here rather than guessed.

**Commands and results** (exit codes):

```
npm run typecheck        0
npm run typecheck:test   0
npm run lint             0
npm run debug:typecheck  0
npm run test:debug       0   96 tests
npm test                 0   100 suites, 2001 tests
npm run build            0
```

Install state after every run this turn: `so-run-header diff` reports **0 blocking**.

## Gate record — §H pointer reachability, and F2 reproduced (2026-09-20)

### §H — a scripted click is not a click

The review saw the wizard button intercepted by the chat overlay on an isolated host; v2.2's J1 did
not reproduce it. Both can be true: J1 drives the button with `element.click()`, which fires
whether or not the element is on top, so a control can be unreachable to a real pointer while every
journey that touches it passes.

`so-ui hitTest` asks the browser the question a finger asks — at this element's own centre, which
element is actually topmost — and a new `ui: {action: "hit-test", selector}` step fails when the
answer is anything but the element or its own descendant. **J1.10** hit-tests
`#so-new-story-wizard` and `#so-open-studio`.

**It found a false positive in itself on the first live run.** `#so-self-test` reported
not-clickable, hitting `div.flex.items-center.gap-2` instead. That div is the button's own
*ancestor*: the button is `disabled`, so it is `pointer-events: none` and a pointer passes through
it. Correct behaviour, and conflating it with an overlay would fail a journey for a control the
product deliberately disabled. The check now names the cause — `disabled`, `overlay`, `ancestor`,
`offscreen`, `no-box`, `missing` — and only the covering cases are defects.

**The review's finding is settled**: on this host the wizard entry point *is* pointer-reachable.
J1.10 passed live.

### J1 live — what passed, what did not

```
node scripts/debug/so-journey.mts run J1 --group 1759606632088     exit 1
automated: 6 pass, 2 fail   human: 0 scored, 2 unscored   cleanup: clean
first try: 6 of 6 passing check(s) needed no retry
```

J1.10 passed. **J1.6 and J1.7 failed** and are not claimed as green: after three real turns the
checkpoint never moved, with `auditCount: 0` — no extraction read ran at all. Two observations,
neither a conclusion: each `send_generate` returned in 6.9–8.3 s, well under this backend's
recorded 15–35 s for an ordinary turn, and the step that asserts the profile was configured passed
immediately before. **Cause not established.** My harness changes are ruled out by construction —
nothing in them touches extraction during a run, and the failing step is a `wait` timeout on
product behaviour, not an `ok:false` — but ruling my changes out is not the same as diagnosing the
product, and that diagnosis is still owed.

The config round-trip is proven safe: J1 clears the whole extension settings root, and
`so-run-header diff` across the run reports **0 blocking** — all three stories back, settings
restored. The library was also backed up to `.debug/so-settings-backup.json` first.

### F2 reproduced, traced, and now covered

Inspecting the install afterwards showed `getGlobalSettings().extraction.profileId` holding the
profile while `getSnapshot().extraction.settings.profileId` read `null` on the storyless chat —
**F2**, which the ledger carried as `testPending` for plan 06.

Traced to source: `extras` is built by `createExtras()` on the storyless paths (the field
initialiser and `clearStory`), which fills `settings` from `defaultExtractionSettings()` and never
calls `applyGlobalSettings`. Only `hydrateExtras` — the path a chat *with* a story takes — folds
the install-wide settings in. So a storyless chat presents defaults as settings and cannot
distinguish "not configured" from "not loaded yet".

`src/runtime/settingsView.review.test.ts` states the contract with two controls beside it (a
hydrating chat does see the install settings; the shipped defaults name no profile). F2 is no
longer `testPending`; three reproductions remain to write (C1, C2, C3).

**Commands and results** (exit codes):

```
npm run typecheck        0
npm run typecheck:test   0
npm run lint             0
npm run debug:typecheck  0
npm run test:debug       0   96 tests
npm test                 0   100 suites, 2001 tests; 27 open, 4 settled
npm run build            0
```

## Gate record — live verification of §C and §D (2026-09-20)

The install went quiet (three hours idle, nothing generating, no dialogs), so the two checks the
previous records listed as outstanding were run for real.

### J0 twice, live, `--group` pinned — the runner now gates itself

```
node scripts/debug/so-journey.mts run J0 --group 1759606632088     exit 0, twice
```

```
automated: 4 pass, 0 fail, 0 blocked, 0 not-runnable, 0 skipped
human:     0 scored, 1 unscored
cleanup:   clean
first try: 4 of 4 passing check(s) needed no retry
```

Each check reported the outcome it declared: J0.1/J0.2 `pass`, J0.3 `blocked` with its steps never
run, and the new J0.5 `fail` from an unguarded throw. The human gate was exercised both ways —
`--require-human-record` over a file with J0.4 unscored gives `NOT GREEN: 1 human check(s)
unscored` and **exit 1**; scoring the row gives `1 scored, 0 unscored` and **exit 0**.

**The first live run found a bug in §D's own code.** It reported `first try: 3 of 4 … (retried:
J0.5)`, but J0.5 never retried — it fails once by design. `firstAttempt` was tied to whether the
steps *succeeded* rather than whether they were *re-sampled*, so a check whose declared expectation
is `fail` was always recorded as retried. Every unit test passed with the wrong rule; only running
it showed the misreport. Fixed, re-tested, re-run live: `4 of 4`.

### The mocked corpus under the new `ok:false` rule — and a leak it exposed

All 14 mocked scenarios pass, each `--sandbox --group` pinned: plan02-runtime, plan03-extraction,
plan03a-edit-rollback, plan03a-delete-rollback, plan04-pacing, plan05-background-generation,
plan06-convergence, plan07-memory, plan09-arcs, plan10-epistemic-ledger, plan12-copilot,
plan13-surfacing, effects-slash-quoting, effects-author-note-role — **14 of 14, exit 0**. So §C's
`ok:false` enforcement broke nothing. (`plan08-hygiene` needs a live backend and was not run.)

**But diffing the run header afterwards found a real leak — in the tooling, caught by the tooling.**
After the first corpus run, `so-run-header diff` reported **7 blocking differences**, including:

```
DIFF extraction.enabled       true -> false
DIFF extraction.stabilityLag  0 -> 1
```

Extraction was left **disabled install-wide**. `plan06-convergence` writes `stabilityLag: 1`, and a
failed read pauses extraction for the whole install — and `so-scenario` had no capture-and-restore
at all, only `so-journey` did. A real player opening ST after a corpus run would have got no
extraction at all, silently. This is S11's class, one layer lower than where it was fixed.

Fixed: `scripts/debug/lib/extractionSettings.mts` is the one reader and writer both runners share
(the journey's local copies are gone, so the two ends cannot drift), and `so-scenario --sandbox`
now captures before it touches anything and restores at cleanup with a read-back. Proven against
the scenario that caused it — `cleanup.extraction` reports `restored: true, from stabilityLag 1,
to stabilityLag 0` — and then across the whole corpus:

```
so-run-header capture --label corpus-start
...14 scenarios, all exit 0...
so-run-header diff  ->  progress 0, blocking 0, ok true
```

The install is byte-identical to where it started. The settings I had disturbed before the fix were
restored by hand first, so the user's install was not left broken.

`chat.authorView` also differed across the first diff. That one is not residue: it is a per-chat
override (`chat_metadata`, not install-wide), so a different chat legitimately reads a different
value.

**Commands and results** (exit codes):

```
npm run typecheck        0
npm run typecheck:test   0
npm run lint             0
npm run debug:typecheck  0
npm run test:debug       0   96 tests
npm test                 0   99 suites, 1998 tests
npm run build            0
```

## Gate record — §F live suite, and §D first-attempt reporting (2026-09-20)

### §F — the live suite scores every tier the fixture states (T5)

`so-live-suite` scored plot deltas and nothing else, then reported the result as
"live delta baseline 22/22 = 100%" — read, reasonably, as the memory model being right about
everything. Measured while wiring this up:

| Of 22 extractor fixtures | Count |
|---|---|
| carrying a `facts` expectation that nothing scored | **22** |
| carrying a `rejected` expectation that nothing scored | **21** |
| carrying a needle that cannot fail (`mustContain: ""`) | **16** |

`scripts/debug/lib/liveSuiteScore.mts` (pure, unit-tested) now scores `facts`, `rejected`,
`memory`, `arcs`, `epistemic` and `ledger` whenever the fixture states them, with per-tier totals
and `--min-tier facts=0.85,rejected=0.9` floors that bind independently — one aggregate let a
strong tier carry a weak one. `--expect-count <n>` fails a run whose denominator shrank, because
three of twenty-two fixtures passing used to report 100%. A fixture that errored is named as
`incomplete` and fails the run. The headline is relabelled `plotDeltaAccuracy`, which is what it
has always measured.

A vacuous needle is **reported, never counted as coverage**: `mustContain: ""` matches any output
at all, so the totals carry a `vacuous` list and the console prints it beside the tier.

The live handle (`src/runtime/liveSuite.ts`) now hands back `memory`, `arcs`, `epistemic` and
`ledger` from the same parse it already did, so a fixture can state an expectation for them.

### §D — first-attempt reporting (S5, and what F1 actually needs)

`runSteps` records every retry, and a check now reports `firstAttempt: pass | fail`. The tallies
carry `firstAttempt {pass, retried, retriedIds}` and print
`first try: N of M passing check(s) needed no retry`. Retries do not fail a run — they are the
point of `attempts` — but "passed eventually" and "passed first time" are different claims, and
only the second can say a repair worked. F1's criterion is a reported number now rather than
something read out of a log.

**Commands and results** (exit codes):

```
npm run typecheck        0
npm run typecheck:test   0
npm run lint             0
npm run debug:typecheck  0
npm run test:debug       0   95 tests (was 81)
npm test                 0   99 suites, 1998 tests
npm run build            0
```

Live CLI checks: `--min-tier nonsense=0.5` is refused with `unknown tier "nonsense"` and exit 1;
`--min-tier facts=high` and `facts=5` are refused as not-a-fraction. Mutations: making
`firstAttempt` always pass fails two tests; the scorer's own eleven tests cover an unscored tier
never counting as passed, a tier below its floor failing the run, and a shrunken denominator
failing.

**Not run:** the suite itself needs a real model and a quiet install, so the new per-tier scoring
has not been exercised against live output. The floors are therefore un-calibrated — the Gate
record for the first real run has to set them from what the model actually does, not from the
numbers above.

## Gate record — §D journey gates, part 1 (2026-09-20)

**Three gates, counted apart** (`scripts/debug/lib/journeyTallies.mts`, pure and unit-tested).
One flat tally by outcome hid three different kinds of "not proven": a human check reported
`skipped`, indistinguishable from one `--only` left out; a missing capability reported `blocked`,
which only `--strict` caught; and cleanup failures were in the record but in nothing that decided
the exit code. Now `automated {pass, fail, blocked, notRunnable, skipped}`, `human {scored,
unscored}` and `cleanup {ok, failed, leaked}` are separate, printed, and each can fail the run.
**A cleanup failure or a leak fails the run with or without `--strict`** — a leak is inherited by
the next run or by a real player. `readCleanup` walks the report structurally for `error`,
`failed`, `leaked` and `clean:false`, so a cleanup step added later is covered the day it lands.

**New flags.** `--require-human-record <file>` fails the run when a rubric row has no scored entry
(the file may be a list, a list of objects, or a map; a score of zero counts). `--group <id>` pins
the group from the command line the way `so-scenario --sandbox --group` does, because on a shared
install the journey's own default may not be the group this run should touch. `--only` now writes
`partial: true` into the record, so an archived subset cannot later be read as a full matrix.

**J0 gates the runner.** A check may declare the outcome the runner must produce for it
(`"expect": "blocked"`). J0.1/J0.2 expect `pass`, J0.3 expects `blocked` (its steps must never
run), and a new **J0.5** with an unguarded throw expects `fail`. J0 is green only when the
classifier agrees — previously "J0 passes" meant only that its checks happened to pass, which said
nothing about the runner. The reconciliation lives in the pure module so it is tested without a
browser.

**S11 fixed: extraction settings are install-wide and were being left behind.** Only J1 snapshotted
the config; J8 and J9 set cadence 1 and nothing put it back, which is the class of residue that
degraded a real campaign. The pre-run values are now captured **unconditionally**, before anything
can write them, and restored at cleanup with a read-back, reported as `cleanup.extraction`.

**Commands and results** (exit codes):

```
npm run typecheck        0
npm run typecheck:test   0
npm run lint             0
npm run debug:typecheck  0
npm run test:debug       0   81 tests (was 60)
npm test                 0   99 suites, 1998 tests
npm run build            0
```

Five mutations of the tally logic — ignoring cleanup failures, ignoring leaks, counting human rows
as automated, making the expected-outcome check always agree, and letting `--strict` ignore
skipped — **all caught**, the human-row one by five tests.

**Not done in §D**, and not claimed: the `firstAttempt` record per check (S5), J9.2's per-subcase
outcomes, F3's "every J11 check imports its own story", and requiring `setup.extraction` on every
journey. The last one is deliberately staged: declaring a cadence for journeys that currently
inherit one changes what they exercise, and that cannot be asserted without re-running the matrix
on a quiet install. No journey was run live this turn, for the same reason as §C — a real chat was
open and being played.

## Gate record — §B self-test grader and §C scenario vocabulary (2026-09-20)

### §B — the grader reads meaning (R12 **closed**)

`src/runtime/selfTest.ts` graded presence: any memory line, any arc line, any epistemic entry
passed its tier, and the deltas tier accepted *either* of the two facts the transcript states.
Now each tier checks that the answer is about the fixture — both deltas; a memory line mentioning
the lantern and the tunnel; an arc naming the debt and Bel; an epistemic row that is `hiding`,
subject Corin, hidden from Bel; a ledger row for Corin whose field/value pair carries both "arm"
and "wound" in either order.

R12's contract test then passed on its own, the ledger refused the mismatch
(`R12 is open in the ledger but its contract test passed`), and the row was flipped to `closed`.
That is the whole mechanism working end to end: fix the product, the contract flips, the count
drops. `npm test` reports **27 open, 4 settled**.

Seven new cases in `src/runtime/selfTest.test.ts`: the wrong-entity response fails all five tiers;
reading one of two stated facts fails the delta tier; a fluent memory line about another scene
fails; the secret attributed the wrong way round (Bel hiding from Corin) fails while the ledger
still passes; `arm=wounded` is accepted as readily as `wound=left arm`; a transport failure is an
error and never a semantic fail; and a run that never graded both passes never suggests a
capability change.

Six mutations of the grader, five caught. The sixth — removing a `results.length === 5` guard
before the capability suggestion — changed nothing, because every incomplete path already returns
early. It was unreachable defence, so it was **deleted** rather than kept with a test that does not
cover it; removing the early return instead fails two tests, which is where the protection actually
lives.

### §C — the scenario vocabulary is closed (T1, T2)

`scripts/debug/lib/scenarioSchema.mts` is the single list of what the step engine honours: verbs,
modifiers, `expect` / `expect_ui` / `wait` keys, and the `ui` / `stagecraft` / `copilot` actions.
`so-scenario` and `so-journey` both validate a fixture **before** running it, so a typo is a load
error naming the key rather than an assertion that quietly never fired.

Three vacuous shapes now rejected: an unknown key (with a "did you mean" hint), an **empty**
assertion object, and a step carrying two verbs — which the dispatcher resolved by taking the
first and silently dropping the rest.

Verb results are enforced in one place, in `runSteps`, rather than per verb: a step whose result
reports `ok:false` throws with the detail, and a step that is supposed to fail declares
`expectFail: true`, after which succeeding is the error.

**Writing the schema found my own mistake first.** Built by scanning `expected.x` in the runner, it
condemned eleven assertions across nine fixtures using `auditCount>=`, `reconciliationEvents>=`
and `sceneBreaks>=`. Those are read by bracket access and are honoured — the schema was wrong, not
the fixtures. Validating against the whole shipped corpus is what caught it, and that check is now
a test.

**Commands and results** (exit codes):

```
npm run typecheck        0
npm run typecheck:test   0
npm run lint             0
npm run debug:typecheck  0
npm run test:debug       0   60 tests (was 49)
npm test                 0   99 suites, 1998 tests; 27 open, 4 settled
```

Live, against the running install: a planted typo fixture fails at load with
`unknown key "activeCheckpont" (did you mean "activeCheckpoint"?)` and exit 1, before any step
runs; a two-verb step fails with `only the first would run`; an `ok:false` result fails its step
with the detail; `expectFail: true` accepts it; and `expectFail: true` on a step that succeeds is
an error. All 53 shipped fixtures validate clean. Five mutations of the schema, all caught.

**Outstanding, and it matters.** The `ok:false` rule is a behaviour change to the shared step
engine: any existing fixture with a step that quietly returned `ok:false` will now fail — which is
the point, but it means the mocked scenario corpus has to be re-run before this is trusted. It was
not re-run here, because a real chat was open and being played and a sandbox run would have
created a chat in that group. That run is the first thing to do on a quiet install.

## Gate record — §A the findings ledger (2026-09-20)

**Built**

| Piece | Where |
|---|---|
| The ledger | `test/findings/ledger.json` — 31 rows, one per finding, with owner, evidence type, status and (for open jest rows) the reason it must fail with |
| `finding()` / `control()` / `must()` | `test/findings/ledger.ts` |
| Ledger integrity guard | `src/runtime/findingsLedger.test.ts` |
| Execution guard | `scripts/jest-findings-reporter.cjs`, wired as a jest reporter |
| Promoted reproductions | `src/**/*.review.test.ts` — stagecraft (R1–R3), engine (R4, E1), extraction (R5, R6), storyUpdate (R7), wizard (R8), generation (R9), turnBridge (R10, R11), selfTest (R12), memory (M1–M7) |
| Independent fixture | `test/fixtures/two-ways-across.story.json` + `src/engine/independentStory.test.ts`; its two live scenarios moved to `test/scenarios/` with the review-only `profileId: 'so-review-artemis', cadence: 0` replaced by cadence 3 |
| Test typecheck | `tsconfig.test.json`, `npm run typecheck:test` |

`scripts/review/*.test.ts` are deleted; the dossier keeps its evidence copies.

**`it.failing` was not used, and the reason matters.** Jest reports a `.failing` test as passed
whenever its body throws — so a broken fixture, an obsolete API call or an unrelated typo keeps an
open finding green forever and nobody notices the reproduction stopped reproducing. That is
exactly the objection the peer review raised against the original §A design. Instead an open
finding is an ordinary test stating the **intended contract**, and `finding()` asserts two things:
that it still fails, and that it fails with the message the ledger records. When a fix lands, the
row flips to `closed` and the same body must pass. There is one place to edit and no marker to
forget.

The load-bearing assertion of each contract goes through `must(condition, message)` rather than a
jest matcher, because that message *is* the evidence: it has to describe the defect in words that
survive refactoring, not reproduce a matcher's formatting.

**Commands and results** (exit codes, not summaries):

```
npm run typecheck        0
npm run typecheck:test   0
npm run lint             0
npm run debug:typecheck  0
npm run test:debug       0   49 tests
npm test                 0   99 suites, 1991 tests; "findings ledger: 28 open, 3 settled"
npm run build            0
```

**The gate bites — four ways, each verified by breaking it on purpose**

| Broken on purpose | Result |
|---|---|
| A reproduction skipped inside a `describe.skip` | exit 1, `R12: its reproduction reported "pending", so the ledger's claim about it is unverified` |
| A ledger row with no reproduction anywhere | exit 1, `ZZ9: recorded as jest evidence but no finding("ZZ9") exists` |
| A row marked `closed` while its contract still fails | exit 1, `M6 is closed in the ledger but its contract test failed — a regression` |
| An open row whose reproduction breaks for a different reason | exit 1, `M6 still fails, but not for the recorded reason` |

The last one is the case `it.failing` cannot express at all, and it is why this design exists.

**Two defects found in the gate itself while testing it**

1. **The reporter never enforced.** Jest 30 replaced the `testPathPattern` string with a
   `TestPathPatterns` object, so the "is this a full run" check read a truthy object and concluded
   every run was filtered. The gate was silently inert. Now both shapes are handled.
2. **The reporter reported false failures.** It matched on jest's `fullName`, which is prefixed
   with every enclosing `describe`, so every finding declared inside one looked like it had never
   executed — a clean run exited 1 naming R4, E1 and R6. It keys on the test's own title now.

Both were caught only by checking the **exit code** rather than reading jest's summary line, which
says "99 passed" even when the reporter has failed the run. Every result above is an exit code.

**Honest gaps.** `typecheck:test` is scoped to the evidence surface, because the pre-existing test
corpus has **18 type errors across 10 files** (9 of them in `runtimeManager.test.ts`) that predate
this plan. Widening the include is follow-up work, recorded here rather than hidden. Four ledger
rows are `testPending` — C1, C2, C3 and F2 — whose reproductions belong to plans 03, 05 and 06;
the reporter prints them on every run so they cannot be quietly dropped.

## Gate record — §A0 observation tooling (2026-09-20)

§A0 only. The rest of plan 01 (§A–§H) is not started, and P0 has not been run.

**Built**

| Deliverable | Where |
|---|---|
| `so-run-header capture \| diff \| show` | `scripts/debug/so-run-header.mts` (new) |
| `so-journal follow --out` | `scripts/debug/so-journal.mts` (`followSessionJournal`, `readFollowFrame`) |
| `st-payload arm --persist` | `scripts/debug/st-payload.mts` (`persistPayloads`, `drainPayloads`) |
| Harness unit tests | `scripts/debug/*.test.mts`, run by `npm run test:debug` (new script, `node --test`) |

**Commands and results**

```
npm run test:debug        33 tests, 33 pass, 0 fail
npm run debug:typecheck   green
npm run typecheck         green
npm run lint              green
npm test                  88 suites, 1949 tests, 0 fail (unchanged)
```

Live, against the running install (ST 1.19.0 `7c3994196`, Artemis RunPod, sun-ruins chat open —
read-only, the open chat was not disturbed):

- `so-run-header show` read every pinned field with `warnings: []`.
- `capture` then `diff` on an unchanged install: **0 differences, exit 0**.
- `diff` against a baseline perturbed with the three seeds it exists to catch — cadence 3→50
  (S11), the library reduced to one story (S12), a disabled member added (S2) — reported **3
  blocking, exit 1**; declaring only the library addition still failed on the other two; declaring
  all three passed. The gate bites and its exit code drives a runner.
- `so-journal follow` recorded 53 rows over the open chat: `session 1, status 12, extraction 10,
  story 3, delta 10, judge 5, payload 2, audit 10`, each audit carrying window, scope, prompt,
  raw response and rejections.

Every test file was mutation-tested (revert the index rule, drop the dedupe, neuter the epoch
check, make `matchesPath` always true, widen `shouldCapture`, remove the EPIPE guard, blanket the
`VOLATILE` set): **every mutation was caught**, most by more than one test. The tests bite.

**Four defects found and fixed while building this**

1. **`st-payload`'s capture index collided past the ring cap.** `index: state.entries.length` with
   `entries.slice(-100)` gave every capture after the hundredth the index 100. The shipped `watch`
   stops printing at that point and a persisted record would have lost every later turn silently.
   Now a monotonic `nextIndex`, plus an `epoch` so a reload is distinguishable from more captures.
2. **A closed stdout truncated the record.** `follow | head -12` raised EPIPE inside the emit and
   killed the tail mid-poll — the JSONL kept the events written before it and lost that poll's
   audits with no error. Both tails now swallow console errors; the file is the record.
3. **`authorView` was read from the wrong path** (`snapshot.authorView`; it lives at
   `snapshot.ui.authorView`), so it recorded `null` forever — and a field that never changes can
   never fail a diff. Headers now carry a `warnings` list naming anything unreadable, diffed like
   any other field, so this class of silent null is loud.
4. **The drain could lose captures silently** if the poller fell more than the ring cap behind.
   `drainPayloads` now reports `dropped` and `--persist` warns.

**One documented host fact is stale.** `.claude/rules/gotchas.md` says the experimental macro
engine is off on this install. It is **on** (`ctx.powerUserSettings.experimental_macro_engine ===
true`, measured 2026-09-20). Macros register into whichever engine was active at startup, so this
is worth confirming before trusting `{{story_*}}` behaviour. The rule has been corrected and the
run header records `host.macroEngine` so a future flip shows up as a diff.

**Peer review round (Astra, same day).** The §A0 implementation was handed back to the review's
lead author, who returned **REWORK** with counterexamples. Every one was reproduced before it was
acted on, and all of these were real:

| Finding | Fix |
|---|---|
| `build.dirty` was in the volatile set, so a tree that went dirty mid-run compared clean — the single most important thing a header can catch | removed from `VOLATILE` |
| A played session fails its own start/end diff, because the checkpoint and boundary advance by design | progress fields (`story.activeCheckpointId`, `story.boundary`, `chat.chatLength`) are a separate class: always reported, blocking only under `--strict-progress` |
| The playbook's `--allow chatId` / `storyId` did not match `chat.chatId` / `story.id` | an explicit alias table; last-segment matching is gone, because `--allow enabled` used to clear three unrelated switches at once |
| A malformed item allowance over-permitted: any suffix that was not `+` counted as a removal, and an empty item after `:` became a whole-field pass | `parseAllow` is strict and a bad entry fails the run instead of granting permission |
| `flatten` dropped empty objects, so a whole section appearing or vanishing compared clean | an empty object is a leaf |
| The lorebook read fell back to `[]` when `world-info.js` failed to load — unknown recorded as empty, the exact trap the asset baseline already had to be fixed for | unknown is `null`, and it raises a warning |
| Two captures that both failed to read the same field compared clean | `warnings` fail the diff unless `--allow-warnings` |
| Leftover `storyOrchestratorDebug*` mocks were invisible to the header | recorded and warned |
| The journal event key collapsed two accepted deltas for the same quality with different evidence into one row | the detail is part of the identity |
| `st-payload watch N` printed one row instead of N on a warm ring — a regression from the index fix, since `printed = entry.index + 1` treats a session counter as a count | `watch` counts rows and starts from the arming index; now covered by a test |
| `persistPayloads` reported a reload as a clean run, though captures between the last drain and the restart die with the page and cannot be counted | a restart is an **unknown gap**: named, and the run is not `ok` |
| A failed append was swallowed | write errors stop the run and fail it |
| Ctrl-C dropped whatever arrived after the last poll | a final drain runs after the stop |
| `.debug` rotation could delete a run header before the gate diffed against it | run headers, the asset baseline and `.jsonl` tails are protected artifacts |

Astra also disputed the first round's mutation evidence, naming specific mutations it believed
would survive. Three did: the journal key without the chat stamp (two chats emitting an identical
event), the epoch check alone (the reload test entered through `!armed`), and `watch` (untested).
All three now have tests that fail without the fix. Second round: **49 debug tests**, and the
mutation sweep re-run over the new logic — `build.dirty` back in `VOLATILE`, `matchesPath` always
true, empty objects dropped, the journal key without detail, the restart no longer an unknown gap,
`watch` counting the index — each caught.

Not adopted, and why: Astra asks for read→queued→applied linkage by audit id through
`runtimeManager`, every no-delta boundary journaled, and live rather than persisted audits. Those
are product changes to `src/runtime/journal.ts` and the extraction coordinator, not observation
tooling, and they belong with plan 01 §A/§D where the journal contract is being changed anyway.
They are listed there rather than done here.

**Not done.** The §A0 gate as written ("the three against a scripted 10-turn sun-ruins chat") was
run only read-only against an existing chat, because a real chat was open and being played;
scripting ten turns would have written to someone else's session. Still outstanding before P0:
the scripted sandbox run, the journal-export cross-check, and the volume cases Astra asked for
(more than 100 captures, more than 20 audits, 200 boundaries, an A→B→A excursion, a reload with an
undrained tail). The rollover cases matter most, because they are exactly where the two defects
found today lived.

## §G — J12 written 2026-09-22, after this plan was called complete

**This plan's §G was listed as a deliverable and was never built.** No `j12-*.journey.json` existed
and no Gate record here claimed one: the plan's status line read COMPLETE without it, which is the
kind of over-claim the v2.3 evidence work exists to stop. Found while writing plan 11's docs pass,
because `test-plan.md` had no J12 catalogue row either.

`test/journeys/j12-unaided-schedule.journey.json` now exists: the adventurer story
(`adolion-adventurer` v9, group `1789797226071`) at the **shipped default cadence 3**, three real
player turns, no `runExtractionNow`, no `/cp`, no debug response. Checks and their reasoning are in
`test-plan.md` §J12; the two decisions worth recording here:

1. **J12.1 refuses to run at any cadence but 3** rather than setting one. Setting it would make the
   journey measure a configuration the plan deliberately did not choose, and the whole point of §G is
   the *shipped* default.
2. **"The checkpoint moved and its effects applied" is its own check (J12.5)**, not part of the read
   assertion, because that leg is the model's decision: a model that will not set `path` costs J12.5
   and leaves J12.3/J12.4 — the schedule's actual evidence — intact. This is the rule the J7 runs
   taught (`assert the property the machine guarantees, report the value the model chose`).

**J12 is NOT green and has not been run end to end.** It was validated and partially run live with
the backend down: the fixture loads, passes the closed-vocabulary check, and **J12.1 failed exactly as
it is designed to** — this install's cadence is **1**, not the shipped 3. The value is not
attributable from the page: run headers record 3 on 2026-09-20 and 2026-09-21 10:17 and 1 from
2026-09-21 22:27 onward, so it is either the author's own choice or residue from a harness run that
predates the S11 capture/restore fix. **It was left untouched** — an install-wide setting is the
user's, and J12 says so in the failure instead of quietly changing it.

```bash
node scripts/debug/so-journey.mts run J12 --strict   # needs a live backend and cadence 3
```

## Audit 2026-09-23 — reopened (status: partial, not COMPLETE)

Queue ids from `00-overview.md` §Replan. Verified against the tree unless marked *suspected*.

- **P0 never recorded** (`docs/plans/v2.3/records/` absent) while every later plan proceeded → L1
  re-scopes it as P0′ on the first frozen candidate (overview rule 17).
- **Ledger lacks T1–T6 and S1–S13 rows** (32 rows, none T*/S*); `findingsLedger.test.ts:37-73`
  checks existing rows, not the register id set → V20b.
- **R12 live half dropped**: J0.4 is `steps: []` → V20b.
- **F3 open**: 16/26 J11 checks import no story (J11.1, 3–8, 12, 13, 15, 17–19, 21, 22, 24); no
  `--only` guard for a generation step with no story → V20c.
- **T6 unfixed**: J9.2 step 3 still returns `{ skipped: … }` → V20c. J1.10 hit-tests but never
  clicks → V20c.
- **S6–S9/S12 mostly absent**: `libraryBefore` reads absence as `[]` (`so-journey.mts:334-337`),
  no empty-root recovery, no `so-assets --baseline`, cleanup gaps still "(open)", no journey
  declares `setup.extraction`, `writeGlobalConfig` overwrites `wizardSessions`
  (`so-journey.mts:116-142`) → V20d.
- **§A journal contract not built**: no audit id through the queue; zero-apply boundaries omitted
  (`journal.ts:69`); discarded writes only counted (`journal.ts:70`) → V20e.
- **T2 unpinned**: the `ok:false` rule lives in `runSteps` (`so-scenario.mts:1066-1076`) with no
  execution test; `firstAttempt` reads `pass` on a failed check with no retry
  (`so-scenario.mts:1115`) → V20a.
- **Runner/schema modifier drift**: schema lists `expectFail`, runner does not
  (`so-scenario.mts:1050` vs `lib/scenarioSchema.mts:11`) — a step leading with `expectFail`
  validates then dispatches it as a verb → V20a.
- **E1 ledger test builds its own evidence** (`engine.review.test.ts:99-100`) → V11.
- **§F floors opt-in** (no defaults, `so-live-suite.mts:162`); fixed sleeps
  (`so-journey.mts:140`, `:318`) → V20e.
- **S10 partial**: only "Integrity check failed" refused; other dialogs auto-OK'd; probe failure
  swallowed → V20d.
- No `records/v2.3-plan01/`; the review's 1,000-checkpoint measurement not promoted (low).

