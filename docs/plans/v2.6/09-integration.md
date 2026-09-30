# Plan 09 — Integration pass: every feature on, together, on Adolion

**Status: DRAFT 2026-09-30, awaiting user approval.**

Each v2.5 feature was gated alone, with its switch on and the rest off or mocked. The user's sessions are meant to judge
how the features work together (2026-09-30), so the machine should find the interaction defects first, and the user's
time should go to judgement, not to bug reports the harness could have filed.

## Configuration under test

This is "everything on", the configuration the user will play:
- scan-mode WI;
- judge defaults on (overview rule 5), including every `judge.uses.*`;
- the curator in `auto` and the warden;
- extraction, memory, epistemic/ledger;
- speaker direction;
- image director cues;
- sprites/VN stage;
- chained voices and the commit guard;
- lore select;
- every spike `.b` from 03;
- reasoning effort at 05 R3's recommendations;
- the inner voice (06) and chapters (07) at the defaults their floors chose;
- the inline timeline (08) at its author level.

A second column runs the **shipped defaults**, which differ once 04–08 decide which features default off.

## When

These runs belong to the end of development (overview rule 13). They are the first part of the final LLM suite,
run from `adolion-fresh` (rule 14), and a finding here is fixed before plan 10 phase F starts.

## Runs

| # | Run | Story | Length | Reads |
|---|---|---|---|---|
| I1 | Adventurer full route | `adolion-adventurer` | full route | transitions, lore evidence flags, memory growth, warden notes, image cue cadence, save evidence |
| I2 | Academy full route | `adolion-academy` | full route | epistemic privacy per drafted member, ledger bindings, complication releases |
| I3 | Saga, two acts | `adolion-saga` | 2 acts | cast changes across acts, scenario per act, chained voices, openings |
| I4 | Mutation storm | academy | 60 turns with swipes, edits, deletes and chat switches every ~5 turns | rollback ≡ replay across every store and ledger; no write lands in another chat |
| I5 | Outage mid-play | adventurer | 40 turns; memory model cut twice, judge cut once, GPU broker cut once | every feature takes its fallback; no stale write; the HUD says so |
| I6 | Reload / reopen | each of I1–I3 at 3 cut points | — | reopen equals continuous (WI path replay, sampler overlay, sprites, timeline chips) |

Each run is archived with its run header, journal, payload captures and a `so-run-header diff` taken around it.

## What counts as a finding

A finding is any of the following:
- a feature's output contradicts another's, for example the curator writing lore that a checkpoint gate disables, or
  the warden note fighting a steering hint;
- prompt budget overrun or duplicated injections, read from the next-turn preview vs `capturePayload`;
- a latency p95 above the plan 10 budgets;
- a journal event with no owner;
- any player-surface leak (`assert-player-clean`).

Findings go to `v2.6/09-findings.md` with a repro, and are fixed before plan 10.

## Gate

I1–I6 green ×1 in both columns, with every finding fixed or signed. Then the candidate is frozen for plan 10.
