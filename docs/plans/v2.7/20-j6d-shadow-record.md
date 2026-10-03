# Plan 20 — J6d shadow record

**Status: SEED from v2.6, not approved.** Source: `docs/plans/v2.6/v2.7-seeds.md` row "J6d shadow record". Overview: `00-overview.md`.

## What it is

- When the judge answers a typed quality (`typedExtraction`), that quality is removed from the extractor's scope, so the
  judge and the extractor never answer the same question and never disagree on record.
- J6d: let the extractor answer those keys too, **in shadow**. Its answer is never applied. The two answers are compared
  and the difference is logged author-only.
- Purpose: live evidence of how often the typed judge and the extractor agree in real play. Today that number exists
  only on the fixture, never in play.

## History and evidence

| When | What | Where |
|---|---|---|
| v2.4 research | Idea from Reddit thread R16 (u/curious_biped_dev), same shape as bettersimtracker's shadow arm; scored 2/M | `docs/plans/v2.4/extension-research/SUMMARY.md:258` |
| v2.4 plan 07 | Put out of scope, sent to v2.5 | `docs/plans/v2.4/07-judge.md:52-53` |
| v2.5 plan 06 | Specified as J6d: seam `sharedRead.ts`, Phase 0 none, floor "token overhead ≤ 10 % per read; jest proves a shadow answer is never applied", key `judge.uses.shadowTyped` (author-only, default off, never flipped by a plan). Not started: waited on the user's pick | `docs/plans/v2.5/06-judge-next.md:170-180`, `:294` |
| v2.6 Q4 | Listed as "measurement only", recommendation **v2.7** | `docs/plans/v2.6/00-overview.md:275` |
| v2.6 W16 | User: one plan spikes all of J6a–d; plan 12 Phase C row C4 carries it (floor: overhead ≤ 10 %, shadow never applied) | `00-overview.md:173`; `12-open-judge.md:95` |
| v2.6 plan 12 | Phase C never started. No J6 code exists (`shadowTyped`, `playerIntent`, `tensionRead` appear nowhere in `src/`, `scripts/` or `test/`, grep 2026-10-03) | `12-open-judge.md:3`, `04-remaining-builds.md:14` (J6a "not started") |

Measurements that bear on it (none of J6d itself):

- **typedExtraction on TypeSafe:** calibration 0.8295, p50 260 ms, live J11.20/J11.21. The rate counts the coverage
  family (how often the judge answers at all), whose floor is 0 (`src/judge/readiness.ts:88-95`).
- **Judge-off column for `typed`:** 0/75 rows right. The judge-off path is "the extractor decides", whose accuracy lives
  in its own suite, not this table (`docs/plans/v2.6/12-provider-matrix.md:23-40`).
- **llama-logprob typed row:** floor met on fixtures ×2 (0.85), then 0 of 96 calls answered in play under load (with
  warden and stall). Withdrawn (`12-provider-matrix.md:174`; commit `10a74535`; `test/sessions/T6/SUMMARY.md:101`).
  So in that session the extractor effectively answered those keys anyway. Nobody can say whether that was worse.
- **Who uses typed reads:** only qualities with an authored `read_as` hint and `source: "extractor"` are asked
  (`src/judge/extraction.ts:83-88`). The campaign data's build dir holds 84 `"read_as"` occurrences in 9 files (grep
  2026-10-03; includes import scripts, so not a unique-quality count). So the Adolion lab exercises this path.

## Why it was deferred

- It changes no behaviour. It is measurement, and v2.6 Q4 ranked it below J6a (player intent).
- Plan 12 Phase C was never reached in v2.6 (Phases 0, A, B took the time).

## Current state in code

- **Scope removal:** `src/extraction/sharedRead.ts:229-230`: `answered = judged.answered`; `residual = scope − answered`.
  `screenDeltas` also drops any extractor delta for an answered key (`:63`).
- **What is already recorded:** the audit carries `judged: {keys, model, confidences, fallback?}` (`sharedRead.ts:267`),
  so the judge's side is logged per read. The extractor's side for those keys does not exist.
- **Typed judge:** `src/runtime/typedRead.ts` (deltas enter as `source: "extractor"` with a `judge` confidence);
  floors `typedFloor` = `EXTRACTION_CONFIDENCE` 0.8 + 0.1 if latching (`src/judge/extraction.ts:161`, `policy.ts:91-92`).
- **No key** `shadowTyped` in `JUDGE_USE_KEYS` (`src/judge/settings.ts:7-25`).

## Options

**A. Shadow inside the same read (v2.5 design).** Keep answered keys in the extractor prompt. `screenDeltas` routes their
deltas into `audit.shadow[]` instead of the queue. Diff = per key: judge value, extractor value, agree/disagree, judge
confidence. Shown in the author view (Scheduler tab or the inline timeline at level 3+). Cost: prompt tokens for the extra
keys on every cadence read. Risk: the extra keys change what the extractor writes for the *other* keys (prompt is no
longer identical); must be measured, see floor. Needs: one author-only key, an audit field, an author panel row.

**B. Separate shadow read, sampled.** Every Nth read (or on demand from the author view), a second, small extractor call
asks only the answered keys. Main read unchanged byte-for-byte. Cost: an extra model call per sample (DeepSeek or the
memory profile). Risk: another call competing with play on a shared backend (the T6-2 lesson). Needs: a scheduler slot,
the RunOwnership census row.

**C. Offline replay only.** No product code. A harness script replays archived session audits (windows are stored in
`extras.extraction.audits`) through the extractor with the answered keys in scope, and diffs against the recorded judge
answers. Cost: lane time, no play impact. Risk: answers the question once, not continuously; old windows only.

**D. Drop it.** The typed fixture (`test/fixtures/judge/typed.json`) already scores the judge; live agreement stays
unknown.

## Recommendation

**C first, then A only if C shows meaningful disagreement.** C answers the actual question (how often do they disagree,
and who is right) on the session corpus v2.6 plan 14/15 already archived, with zero risk to play and no new setting. If the
disagreement rate is low, A is not worth a prompt change on every read. If it is high, A gives the ongoing author-only
signal, and the C numbers become its baseline.

## Decisions for the user

1. Build J6d at all in v2.7? **Rec: yes, as option C (offline replay) only.** C
2. If C shows a disagreement rate above a threshold, build A (live author-only shadow)? Threshold proposed: ≥ 10 % of
   judge-answered keys disagree on the replay corpus. **Rec: yes, at that threshold.** yes as you recommend
3. Who arbitrates a disagreement (which side was right)? Options: the user labels a sample; a second model labels; no
   arbitration, rate only. **Rec: the user labels a 20-row sample from the disagreements; rate alone says nothing about
   which side to trust.** Sure
4. Where does the live shadow (if A) show? **Rec: author view only, inline timeline level 3 (Author) detail plus the
   Scheduler tab; never player mode (spoiler checklist row).**  As you recommend

## Floor and measurement before building

- **C (replay):** ≥ 20 judge-answered keys in English from archived windows (v2.6 plan 14/15 sessions, `test/sessions/*`,
  private evidence in `so-sessions`). Report: disagreement rate, per `read_as` kind (`choice`, `rating`, …), with the
  judge confidence band. No floor to pass: it is a measurement that decides decision 2.
- **A (live), predeclared:** token overhead ≤ 10 % per read (v2.5 floor); jest proves a shadow delta never reaches the
  apply queue (mutant: route shadow into the queue → red); **new:** the non-shadow keys' deltas on the J11 typed checks
  are unchanged in an on/off pair (the prompt-perturbation risk of option A).
- Judge rule: J6d adds no judge question, so no new calibration row. It reads typedExtraction's existing row; any
  provider other than TypeSafe needs its own row first (`readiness.ts` provider × model × use).

## Gates

- C: docs + a `scripts/debug/` replay tool → `npm run test:debug` for the tool; the measurement record archived beside
  its sessions.
- A: runtime / extraction host path → `npm run gates`, plus live: real-LLM J11 typed checks ×2 with the shadow on and
  off (real extraction profile, no `debugResponse`), plus `so-ui assert-player-clean`.

## Links

- 14 J7 judge ideas (J7 "per-quality floors" uses the same typed path; J6d evidence would inform per-kind floors)
- 13 B10 CLI judge and 15 open-source Jev alternative (any new typed provider is the thing a shadow would compare against)
- 10 model choice (an extractor model change moves the extractor side of the diff)
- 21 cue + scene read merge (touches the same shared read)
- 04 story presence/plays index, 19 quests/game layer, 18 character life, 25 new game plus, 08 SP2, 22 SP9, 16 spike
  defers, 12 curator create op, 11 warden-lore one request, 09 C4 option b, 07 commitment double negatives, 23 D6/T22
  revisits, 06 thinking per story
