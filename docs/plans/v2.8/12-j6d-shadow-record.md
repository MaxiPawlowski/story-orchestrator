# Plan 12 — J6d shadow record

**Status (2026-10-03): v2.8 plan 12 (was v2.7 plan 20). Decided: option C (offline replay) only; option A (live
author-only shadow) only if C shows ≥ 10 % disagreement. Not built; replay not run.**
Source: `docs/plans/v2.6/v2.7-seeds.md` row "J6d shadow record". Overview: `00-overview.md`.
**Gate tiers** (00-overview §Gate taxonomy): implementation D (reconstruction tool); acceptance CL (the replay calls
the DeepSeek read model; no pod).
**Prerequisite of** v2.8 13 J7.6 (per-quality floors): its gate runs after this replay.

## What it is

- When the judge answers a typed quality (`typedExtraction`), that quality is removed from the extractor's scope, so the
  judge and the extractor never answer the same question and never disagree on record.
- J6d: let the extractor answer those keys too, **in shadow**, and compare. Its answer is never applied.
- Purpose: evidence of how often the typed judge and the extractor agree in real play. Today that number exists only on
  the fixture, never in play.
- As decided, this runs **offline** over archived sessions first (C). A live shadow (A) is a later, conditional build.

## History and evidence

| When | What | Where |
|---|---|---|
| v2.4 research | Idea from Reddit thread R16 (u/curious_biped_dev), same shape as bettersimtracker's shadow arm; scored 2/M | `docs/plans/v2.4/extension-research/SUMMARY.md:258` |
| v2.4 plan 07 | Put out of scope, sent to v2.5 | `docs/plans/v2.4/07-judge.md:52-53` |
| v2.5 plan 06 | Specified as J6d: seam `sharedRead.ts`, Phase 0 none, floor "token overhead ≤ 10 % per read; jest proves a shadow answer is never applied", key `judge.uses.shadowTyped` (author-only, default off, never flipped by a plan). Not started: waited on the user's pick | `docs/plans/v2.5/06-judge-next.md:170-180`, `:294` |
| v2.6 Q4 | Listed as "measurement only", recommendation **v2.7** | `docs/plans/v2.6/00-overview.md:275` |
| v2.6 W16 | User: one plan spikes all of J6a–d; v2.6 plan 12 Phase C row C4 carries it (floor: overhead ≤ 10 %, shadow never applied) | `docs/plans/v2.6/00-overview.md:173`; `docs/plans/v2.6/12-open-judge.md:95` |
| v2.6 plan 12 | Phase C never started. No J6 code exists (`shadowTyped`, `playerIntent`, `tensionRead` appear nowhere in `src/`, `scripts/` or `test/`, grep 2026-10-03) | `docs/plans/v2.6/12-open-judge.md:3`, `docs/plans/v2.6/04-remaining-builds.md:14` (J6a "not started") |

Measurements that bear on it (none of J6d itself):

- **typedExtraction on TypeSafe:** calibration 0.8295, p50 260 ms, live J11.20/J11.21. The rate counts the coverage
  family (how often the judge answers at all), whose floor is 0 (`src/judge/readiness.ts:88-95`).
- **Judge-off column for `typed`:** 0/75 rows right. The judge-off path is "the extractor decides", whose accuracy lives
  in its own suite, not this table (`docs/plans/v2.6/12-provider-matrix.md:23-40`).
- **llama-logprob typed row:** floor met on fixtures ×2 (0.85), then 0 of 96 calls answered in play under load (with
  warden and stall). Withdrawn (`docs/plans/v2.6/12-provider-matrix.md:174`; commit `10a74535`;
  `test/sessions/T6/SUMMARY.md:101`). So in that session the extractor effectively answered those keys anyway.
- **Who uses typed reads:** only qualities with an authored `read_as` hint and `source: "extractor"` are asked
  (`src/judge/extraction.ts:83-88`). The campaign data's build dir holds 84 `"read_as"` occurrences in 9 files (grep
  2026-10-03; includes import scripts, so not a unique-quality count). So the Adolion lab exercises this path.

## Why it was deferred

- It changes no behaviour. It is measurement, and v2.6 Q4 ranked it below J6a (player intent).
- v2.6 plan 12 Phase C was never reached (Phases 0, A, B took the time).

## Current state in code

- **Scope removal:** `src/extraction/sharedRead.ts:229-230`: `answered = judged.answered`; `residual = scope − answered`.
  `screenDeltas` also drops any extractor delta for an answered key (`:63`).
- **What the audit records** (`SharedReadAudit`, `src/extraction/types.ts:107-127`; built at `sharedRead.ts:254-276`):
  - `window` holds **endpoints only** (`{from, to}`), not the messages read;
  - `scope` and `prompt` are the **residual** scope and the prompt rendered from it (answered keys absent);
  - `judged` holds the **answered keys**, the model and confidences; the judge's values appear only as deltas in
    `acceptedDeltas`, so an answered key whose value did not change leaves no value on record;
  - `trimmedFrom` / `truncated` / `budget` record a window cut to the read budget (`fitReadWindow`, `:174-190`).
- **Audit retention:** the per-chat ring keeps the last **20** audits (`extractionCoordinator.ts:259`, `extras.ts:303`,
  verified 2026-10-03). Older audits survive only in the session journal tails.
- **Typed judge:** `src/runtime/typedRead.ts` (deltas enter as `source: "extractor"` with a `judge` confidence);
  floors `typedFloor` = `EXTRACTION_CONFIDENCE` 0.8 + 0.1 if latching (`src/judge/extraction.ts:161`, `policy.ts:91-92`).
- **No key** `shadowTyped` in `JUDGE_USE_KEYS` (`src/judge/settings.ts:7-25`). `JUDGE_USES_OFF_BY_DEFAULT` holds only
  `houseRules` (`settings.ts:70`).

## Options

**C. Offline replay (chosen).** No product code. A `scripts/debug/` tool reconstructs each judged read and asks the read
model the answered keys too (design below).

**A. Live shadow inside the same read (conditional, decision 2).** Keep answered keys in the extractor prompt;
`screenDeltas` routes their deltas into `audit.shadow[]` instead of the queue. Built only if C's disagreement rate is
≥ 10 % of judge-answered keys.

Rejected: B (separate sampled shadow read; another call competing with play, the T6-2 lesson); D (drop; the user chose C).

## Design: reconstruction (option C)

The audits alone **cannot** reproduce the comparison input (F30): the window holds endpoints only, the prompt uses the
residual scope, and unchanged judge answers are not recorded. So each case is rebuilt from four archived sources, and
a case that cannot be rebuilt exactly is **refused**, never compared on a different input.

| Input | Source (per session dir, `test/sessions/<tier>/<id>/`, private copies in `so-sessions`) |
|---|---|
| the read itself: reason, window endpoints, residual scope, prompt, raw response, accepted deltas, `judged.keys`, confidences, `trimmedFrom`/`truncated` | `journal.jsonl` tail `audit` events (full audit; not capped at 20 like the in-chat ring). Note: these rows carry `boundary: -1`; the boundary is located by message id |
| the messages in the window, with swipes and edits as they stood | `transcripts.jsonl` / `chat-full-*.json` |
| the story the chat played | `pinnedStory` in the archived runtime blob (`runtime-*.json`) |
| the engine state at that read (blackboard values, active checkpoint, scope) | the boundary history in the runtime blob (`engineHistory` snapshots `{lastMessageId, chatLength}`) matched to the read's window, cross-checked with the journal's `boundary` events |

Steps per judged read:

1. Rebuild the window from the transcript, then apply the same trim the read applied (`trimmedFrom`, `truncated`,
   using `fitReadWindow` with the recorded budget). A window whose rebuilt messages do not cover `{from, to}` → refused.
2. Rebuild the residual contract and render it with the production `renderSharedReadPrompt`. **It must match the
   archived prompt byte for byte.** A mismatch (memory context that cannot be rebuilt, a story edit, a missing
   snapshot) → refused, with the reason recorded. Only matched cases continue.
3. Render the **full-scope** prompt (residual + answered keys) from the same contract and ask the read model
   (the DeepSeek read profile, real model, no `debugResponse`), ×2 per case.
4. Judge side per answered key: the judge's delta value if one was accepted; otherwise **the reconstructed blackboard
   value** (the judge answered "unchanged"). Extractor side: its accepted delta for that key after the production
   `screenDeltas` evidence checks, or "unchanged".
5. Classify per key: agree (same value or both unchanged), disagree (different values), judge-moved/extractor-not,
   extractor-moved/judge-not. Report per `read_as` kind and per judge confidence band.

A replay that ends with fewer than 20 rebuilt judge-answered keys is reported as **insufficient**, not as a rate.

## Recommendation

**C first, then A only if C shows ≥ 10 % disagreement** (decisions 1–2). C answers how often they disagree with zero
play impact. If A is built, it is an author-only, **default-off** use: `judge.uses.shadowTyped` is added to
`JUDGE_USES_OFF_BY_DEFAULT` (it does not take v2.6 rule 5's default-on), ships dev-only first, and is never flipped by a
plan (v2.8 rule 9). C's numbers become its baseline.

## Decisions for the user

1. Build J6d at all in v2.7? **Rec: yes, as option C (offline replay) only.** C
2. If C shows a disagreement rate above a threshold, build A (live author-only shadow)? Threshold proposed: ≥ 10 % of
   judge-answered keys disagree on the replay corpus. **Rec: yes, at that threshold.** yes as you recommend
3. Who arbitrates a disagreement (which side was right)? Options: the user labels a sample; a second model labels; no
   arbitration, rate only. **Rec: the user labels a 20-row sample from the disagreements; rate alone says nothing about
   which side to trust.** Sure
4. Where does the live shadow (if A) show? **Rec: author view only, inline timeline level 3 (Author) detail plus the
   Scheduler tab; never player mode (spoiler checklist row).**  As you recommend

## Review of the answers (2026-10-03)

- **Decision 3 is narrowed by the no-spoiler rule** (v2.8 rule 11, review B4). The replay corpus is Adolion sessions,
  which the user has not played. So the 20-row arbitration sample is labelled by a **second model** (not the read
  model and not the typed judge), and the user is shown none of it. The user may spot-check synthetic rows only.
- Decisions 1, 2, 4: applied as answered.

## Floor and measurement before building

- **C (replay, CL):** ≥ 20 rebuilt judge-answered keys from the v2.6 plan 14/15 session corpus (journal tails +
  archived chats + runtime blobs), English only. Report: refused cases with reasons, disagreement rate, per `read_as`
  kind, per confidence band, and the second model's arbitration of a 20-row disagreement sample. No pass floor: it
  decides decision 2.
- **A (live), predeclared:** token overhead ≤ 10 % per read (v2.5 floor); jest proves a shadow delta never reaches the
  apply queue (mutant: route shadow into the queue → red); the non-shadow keys' deltas on the J11 typed checks are
  unchanged in an on/off pair (the prompt-perturbation risk).
- Judge rule: J6d adds no judge question, so no new calibration row. It reads typedExtraction's existing row; any
  provider other than TypeSafe needs its own row first (`readiness.ts` provider × model × use).

## Gates

- C (D): the replay tool → `npm run test:debug`, with fixtures for the refusal paths (a window the transcript does not
  cover, a prompt that does not re-render byte-identically, a missing boundary snapshot) and a positive case whose
  residual re-render matches; an unchanged judge answer reads the reconstructed blackboard value (test).
- C (CL): the replay run on the DeepSeek read profile, ×2; record archived beside its sessions in `so-sessions`
  (private evidence), summary numbers only in the public repo.
- A (if built): runtime / extraction host path → `npm run gates`; `judge.uses.shadowTyped` in
  `JUDGE_USES_OFF_BY_DEFAULT` (jest); live real-LLM J11 typed checks ×2 with the shadow on and off (cloud read profile,
  no pod); `so-ui assert-player-clean`; registered in the v2.7 01 feature registry + Help (registry test) (B10).

## Links

- v2.8 13 J7 judge ideas (J7.6 per-quality floors waits on this replay)
- v2.8 14 open-source Jev alternative and v2.7 14 B10 CLI judge (any new typed provider is what a shadow compares
  against)
- v2.7 12 model choice (an extractor model change moves the extractor side of the diff)
- v2.8 15 cue + scene read merge (touches the same shared read)

## Review 2026-10-03

- **F01:** status line rewritten (decided C, not built, not run).
- **F30:** reconstruction designed from journal audit rows + transcripts + pinned story + boundary snapshots,
  including trim/truncation and unchanged answers; byte-identical residual re-render required; incomplete cases
  refused (§Design).
- **C5:** source is the session journal tails plus reconstructable state; the in-chat ring cap of 20 verified
  (`extractionCoordinator.ts:259`, `extras.ts:303`); any runtime shadow defaults off via `JUDGE_USES_OFF_BY_DEFAULT`.
- **C6:** acceptance tier CL (DeepSeek read model), not RunPod.
- Prerequisite of v2.8 13 J7.6 stated in the header.
- Decision 3 reconciled with the no-spoiler rule (B4): a second model arbitrates, not the user.
- References version-qualified (B12); Links cut to the plans that matter.
