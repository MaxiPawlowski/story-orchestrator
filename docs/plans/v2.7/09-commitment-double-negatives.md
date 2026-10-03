# Plan 09 — Commitment double negatives

**Status (2026-10-03): v2.7 plan 09 (was old v2.7 07). Decided: keep holding (A), E built and merged (`e9082dd5`), B
only if a session shows the miss, D no. Closes in v2.7 once its deterministic live check runs (`16-test-plan.md` row 09);
the real-play journal check is `v2.8/01-v27-carry-over.md` O11.** Source: `docs/plans/v2.6/v2.7-seeds.md` row
"Commitment double negatives". Overview: `00-overview.md`.
**Gate tiers** (v2.7 overview §Gate taxonomy): implementation D; acceptance D (seeded hold); CL for O11 (v2.8 01).
Model input: none (accept/hold decisions unchanged; only the author journal row grows).

Line references below were re-read on 2026-10-03 after E landed (review A14).

## What it is (plain words, 3–6 lines)

- Some story values only count when the **player commits** to them (taking a job, signing up). An author marks such a
  quality with a `commit_evidence` pattern.
- The commit guard accepts the extracted value only when a line the player wrote matches the pattern **and** no
  negator, hedge or question undoes it.
- A double negative like "I don't see why we wouldn't take it" means yes, but the guard sees `don't`/`n't` before the
  verb and **holds** it, as if it were a refusal.
- It fails safe (the story waits; nothing is decided for the player). The seed asks whether to teach the guard
  negation scope.

## History and evidence

| When | What | Where |
|---|---|---|
| 2026-10-01, T0 blocker | After an edit-rollback, three re-acceptances never moved the story. Cause: the guard judged the line the **reader quoted** (often an NPC line with no commit verb), and never asked who wrote it. Fix: a commit counts only when a **player** line (`isUser`) in the read's window matches; NPC/narrator lines never count | `docs/plans/v2.6/14-findings.md` §"T0 blocker: commit evidence after rollback" (l.24-34); `src/extraction/commitGuard.ts` |
| same day, follow-up | Negation- and value-aware match: no negator (`not`, `never`, `no`, any `n't`, `cannot`, `refuse`, `decline`) before the verb in the same clause; the sentence must be about the claimed value. Test `commitNegation.test.ts` (12 of 19 red before, all green after). **Known limit stated there:** a double negative reads as a refusal ("fails safe, holds") | `v2.6/14-findings.md:35` |
| 2026-10-01, T1 | Recall/precision on a labelled set (44 acceptances, 45 refusals) | `v2.6/14-findings.md:129-147`; `src/extraction/commitRecall.test.ts` |
| | T0 pattern + T0 guard: recall 30/44 (0.682), precision 0.732, refusals committed 11/45 | `v2.6/14-findings.md:143` |
| | T1 pattern + T1 guard (shipped): **recall 43/44 (0.977), precision 1.000, refusals committed 0/45** | `v2.6/14-findings.md:146` |
| T1 follow-up (T2 wave) | An intent-verb bool fix (`objectIsTopic`); T1 recall set unchanged (43/44, 0/45) | `v2.6/14-findings.md:263`; `src/extraction/commitIntentVerb.test.ts` |

Notes on the evidence:
- The labelled set and the negation suite contain **no double-negative acceptance**
  (`grep -i "wouldn\|see why" src/extraction/commit*.test.ts` finds none). The limit is reasoned, not measured.
- Verified by reading the guard: for "I don't see why we wouldn't take it", the verb match is "take";
  `clauseBefore` is "I don't see why we wouldn't "; `NEGATOR` (`commitGuard.ts:50`) matches → held with reason
  `negated` (`lineVerdict`, `commitGuard.ts:198`). `HEDGE` (`:51`) also lists `would`/`should`/`could`, so "we would take
  it" is held too (hedge, not negation).
- **No author workaround:** the negator check runs on the clause before *any* pattern match, so widening
  `commit_evidence` cannot accept the phrase.
- Session counts: "commitment reading(s) held" rows in Claude's session journals: T0 11, T1 20, T2 1, T3 2, T4 40,
  T5 0, T6 10, T7 0 (`grep` over `test/sessions/T*/**/journal.jsonl`, 2026-10-03). How many were double negatives is
  **not determined** for v2.6: the held record stored the reader's quote, not the player line. Since E it also stores
  the player line and the reason (`runtimeManager.ts:445`, `heldJournal.ts`). The
  sessions were played by Claude, whose lines are plain; a human player is the likelier source.

## Why it was deferred

"Safe direction; needs a negation-scope parser" (seed row). Holding a real yes costs one more player line; committing
a real no would narrate the player into something they refused (the agency defect the guard exists for). v2.6 chose
precision 1.000 over the last recall point.

## Current state in code

- `src/extraction/commitGuard.ts`: `applyCommitEvidence` (l.241), `lineVerdict` (l.198, returns a hold reason since E),
  `NEGATOR`/`HEDGE`/`CLAUSE_BREAK` (l.50-52). Pure; no flag.
- Called once, from `RuntimeManager.enqueueExtractorDeltas` (`src/runtime/runtimeManager.ts:443-445`), for every
  extractor delta batch; judge-typed and stall deltas take the same rule (`v2.6/14-findings.md:34`).
- A held value is journaled author-only (`journalHeld`, `runtimeManager.ts:457`) and dropped for this read; a later read with a clearer player
  line commits. Whether the refusal recovery (`src/runtime/agencyRecovery.ts`) can fire on a held commitment streak is
  **not determined** (it reads audits that "moved nothing", which a held delta may look like).
- Schema: `Quality.commit_evidence` (`src/engine/schema.ts:83`), Studio help and guide topic exist.

## Options

| Option | Design | Cost | Risk | Needs |
|---|---|---|---|---|
| **A. Keep; drop the seed** | nothing | 0 | a double-negative yes waits one more turn | — |
| **B. Idiom list** | a small `AFFIRMING_NEGATION` set checked before `NEGATOR`, scoped to the clause before the verb: `don't see why (we\|i) (wouldn't\|shouldn't)`, `no reason not to`, `can't not`, `wouldn't miss`, `why not` + verb, `not (say\|saying) no` | S (one regex + fixture) | each idiom is a hand rule; misses paraphrases; a sarcastic use commits | ≥ 20 labelled lines (see floor) |
| **C. Negation-scope parser** | count negators that scope over the verb inside the clause (rhetorical "why … not", "not … not"); even count = affirmed, odd = negated; hedges stay hedges | M | parity is wrong for many English cases ("I don't think we won't regret it"); hard to test exhaustively; the guard's precision is the thing at risk | a larger labelled set; mutation tests |
| **D. Ask the judge only on a held negated line** | when a line is held **only** because of a negator, ask one judge question ("does this player line agree to X?"); commit on a calibrated yes | M (new `judge.uses` key, 20-case English fixture, calibration row) | a judge probability would decide a story-state write, which v2.6 lists as **refused** (`docs/plans/v2.6/00-overview.md` §Out of scope: "a judge probability deciding a story-state write") | a scope change by the user |
| **E. Tell the author** | the author view's held-row journal entry shows the player line and the reason ("negated"), so an author sees the miss | S | none to play | journal record gains the player line (author-only) |

## Recommendation

**A now, with E as a cheap aid; B only if a session shows the miss.** The guard is at precision 1.000 and recall
43/44 on the only labelled set, and no recorded session line is a double-negative yes. B is the right size if it is
ever needed; C risks the precision that the T0 blocker fix bought; D is out of scope by a standing v2.6 rule.

## Decisions for the user

1. Keep holding double negatives (fail safe) for now? **Recommended: yes.** yes
2. Add the player line and hold reason to the author-only journal row (E)? **Recommended: yes, small.** sure
3. If a session shows the miss, build B (idiom list) rather than C (parser)? **Recommended: B.** B
4. Should D (judge confirms a negated hold) be reopened against the "judge never decides a story-state write" rule?
   **Recommended: no.** no

## Floor and measurement before building

- **Trigger:** ≥ 2 recorded holds in sessions (any player) where the held player line is an affirmation by double
  negative, each cited by journal line. Requires E (or a manual window read) to see the player line.
- **Fixture (English only, generic, no campaign text):** `src/extraction/commitDoubleNegation.test.ts` with ≥ 20
  double-negative acceptances and ≥ 20 negated refusals of the same surface shape ("I don't think we should take it",
  "not that we'd ever take it", "I can't see us taking it"), plus the existing recall set.
- **Floors (predeclared):** refusals committed **0** on both the new refusals and the existing 45; existing recall
  **≥ 43/44**; new double-negative acceptances **≥ 0.8**. A build that commits any refusal is not built.

## Gates (per repo CLAUDE.md tiers)

- A: none.
- B/C (pure `extraction/`): `npm run typecheck && npm run lint && npm test` (+ `npm run typecheck:test`); hand mutants
  on each new rule. The guard is on an LLM-consuming path, so a live real-LLM check (one held-then-committed
  double negative through `send_generate`) joins the batched final suite, per v2.6 rules 13–17.
- E (runtime journal row): runtime tier: `npm run gates` + live `so-journal.mts show` on a held row.

## Links

- v2.8 01 O11 (real-play journal check), v2.8 01 §B C11-F1/F2 (other commitment-guard changes; semantics, v2.8).
- v2.9 04 D6/T22 revisits (deferred; agency, player-line evidence), v2.8 13 J7 judge ideas (D's judge question would be
  one; refused here).
- No direct dependency: v2.7 06, v2.8 18, v2.8 20, v2.9 03 (deferred), v2.8 01 §C SP2, v2.9 02 SP9 (deferred), v2.8 12,
  v2.7 14, v2.8 11, v2.7 13, v2.8 15, v2.7 11, v2.7 12, v2.7 08, v2.8 14.

## Gate record — option E (2026-10-03)

**As built:** `src/extraction/commitGuard.ts`: the per-line check returns a reason instead of a bool (`lineVerdict`,
same control flow, so accept/hold decisions are unchanged). A held delta carries `reason` (`HOLD_REASONS`: negated,
hedged, asked as a question, names nothing it agrees to, not about this value, no player line names the commitment,
no player line in the window) and `playerLine` (the newest player line in the read's window that tried to commit,
else the newest player line). `src/runtime/heldJournal.ts` `heldNote` renders the author-only journal detail:
`key="value" (reason) from "<reader quote>", the player wrote "<line>"` (both cut at 120 chars).
`RuntimeManager.journalHeld` uses it for commit and rating holds.

This is the instrument decision 3's trigger needs: a held double negative now shows as `(negated)` with the player's
own line in `so-journal.mts show`.

**Tests:** `src/extraction/commitHoldReason.test.ts` (each reason, newest attempting line, no player line, accepted
control), `src/runtime/heldJournal.test.ts`; the existing `commitGuard`/`commitNegation`/`commitRecall`/
`commitIntentVerb` suites are green unchanged (recall 43/44, refusals committed 0/45).

**Gates:** see the v2.7 08 gate record (old plan 06; one run).

**Live: NOT run** (no ST lane available to this agent). Owed: `so-journal.mts show` on a held commitment row.

## Review 2026-10-03

Applied: A14 (line refs re-read: `lineVerdict`, `applyCommitEvidence:241`, `NEGATOR`/`HEDGE` at `:50-51`; the generic
held summary line stays as built), the Claude-A note on Links (deferred plans named as deferred), Sol split item 2 (O11
in v2.8 01), B12/F36 (references).
