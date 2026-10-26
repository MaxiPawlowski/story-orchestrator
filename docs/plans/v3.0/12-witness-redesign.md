# Plan 12 — Witness record redesign

**Status: DESIGNED + BUILT OFFLINE 2026-10-26 (branch `v3.0-c1-witness`, owner decision 8: offline now, GPU later).
Design W2 (derived witness) is on master's switch `memory.witness` once merged, still unconsumed. It does NOT clear the W4
floors on its own; with a presence source as good as the labels it clears exact-set and FE and misses FI by the ambiguous
stratum only. Floors still TO RESTATE by the owner.** Follows v2.8 42 (`docs/plans/v2.8/42-witness-filter-v2.md`, W4 FAIL).

## Goal

A per-message record of which cast members heard what, accurate enough to filter recall and private context by witness,
reversible with the message (rollback ≡ replay), and never adding text a member could not have heard (audience contract,
`memory/audience.ts`, `memory/audienceRules.ts`).

## What failed (v2.8 42 §W4 real run 2026-10-25, build G, lane 45, 74 reads)

- Real sessions: exact-set 13/147 (0.088; floor 0.9), false inclusion 339/471 (0.72; floor 0.02), false exclusion 4/574,
  coverage 153/192, mixed 0/11. The shared read answers `heard=all-present` on almost every message (216 of 280 lines).
- Presence null control: exact-set 144/171 (0.84). Lab: exact-set 3/21, 17 lines rejected ("unknown member player").
- Cost: input p95 +150 tokens (floor 120), output p95 +282 (floor 160), latency p95 24.6 s vs 21.1 s: miss.
- Part of the FI is a recorder artifact: the recorder resolved `all-present` to every session member (group enable history
  was not recorded), while the product resolves it to the enabled members. Re-resolving the recorded lines with the cast
  ledger and the speaker/narrator rules below (offline replay, approximate parser): exact-set 109/161, FI 92/448. Still a
  fail; the read's own member lists add little.

## What the labels say (adjudicated sets, frozen digest `2258f223…`, counts only)

- Real (16 sessions, 192 messages): 171 single-audience, 11 mixed, 10 `unknown`, 0 whole-message asides.
- `heard` = labelled `present` ∪ the speaker on all 171 single-audience messages. The presence control's 27 false exclusions
  are all the narrator speaking (labellers never put the omniscient narrator in `present`).
- So the real problem is **who is in the scene**, plus three exact rules. Presence is a narrative judgement: members leave,
  scenes split, a member enabled in the group sits out the window.
- Lab (40): authored for asides (32), presence structural (cast replay), narrator in `heard` on 10 of 40 after
  adjudication; a different convention from the real set.

## Design W2: derived witness (built)

Code derives the claims after every shared read, over the read's window plus up to 24 earlier messages
(`memory/witness/derive.ts`, lazy chunk with the record kit; `extraction/sharedRead.ts` `loadWitness`). The read's prompt
carries **no witness section** any more (Wc cost 0 tokens, 0 latency); any `WITNESS` line a model still writes is ignored.
Rules, in order:

1. **Speaker** always hears their own message. The player is never a member.
2. **Omniscient roster members** (`view: "omniscient"`) hear only their own lines (option `omniscient: "always"` exists;
   it scores far worse on both sets).
3. **Enabled members only**: the group's enabled set at read time (`enabledCharacterIds`). A disabled member never hears.
4. **On stage** = enabled, not omniscient, and seen in the context so far: spoke, or named by an unambiguous name token
   (a token two members share is dropped), looking ahead to the end of the read's window.
5. **Asides fail closed**: a sentence with a hearing-limiting cue (whisper, murmur, mutter, under one's breath, low voice,
   barely audible, too low for, only X can hear, X aside, X's ear, to/for X alone) reaches only the speaker and the
   listeners it names. A cue in the first sentence makes the whole message the aside; a later cue makes the message mixed
   with sentence spans covering the whole text (a span query that does not fall inside one derived span reads unknown).
6. **Presence source hook**: a message carrying `present` (a per-message presence read) replaces rule 4 for that message,
   still bounded by rule 3. Nothing fills it yet; this is where a model (or calibrated judge) only fills gaps.

Claims land through the unchanged record (`acceptWitnessRead`, read id = the shared read's audit id), so rollback,
tombstones, folding and the six witness states are as built in v2.8 42. Status is always `accepted` (the claims do not
depend on the model's answer); a failed read still records `outage` through the scheduler.

## Offline scores (2026-10-26, `so-witness.mts derive-score`, no model, no GPU)

Same windows as the W4 run (`reads/files`, real 2 reads per session, lab 5 × 8), cast ledger as the enabled set, scored by
`memory/witness/score.ts` against the adjudicated sets. Private result `test/sessions/witness-real/derive-score-2026-10-26.json`
(sha256 `55b80715…`). Omniscient = speaker-only throughout. FI includes the ambiguous stratum (`ambiguous` = predicted heard
on `unknown` labels, of 60 real / 15 lab pairs).

| Design (real set, 192) | exact-set | FI | FE | coverage | mixed | span FI | ambiguous |
|---|---|---|---|---|---|---|---|
| W4 model read (2026-10-25) | 13/147 | 339/471 | 4/574 | 153/192 | 0/11 | 70/79 | 26/60 |
| enabled + rules 1-3 | 102/171 | 166/471 | 0/574 | 181/192 | 0/11 | 30/79 | 39/60 |
| on stage, window only | 80/171 | 97/471 | 75/574 | 181/192 | 0/11 | 23/79 | |
| on stage, 24 back (no asides) | 113/171 | 121/471 | 0/574 | 181/192 | 0/11 | 24/79 | 25/60 |
| **W2 shipped: on stage 24 back + asides** | **99/152** | **95/471** | **5/574** | **162/192** | **5/11** | **16/79** | **13/60** |
| diagnostic: labelled presence + rules | 171/171 | 19/471 | 0/574 | 181/192 | 0/11 | 14/79 | 19/60 |
| diagnostic: labelled presence + rules + asides | 153/155 | 11/471 | 5/574 | 167/192 | 5/11 | 9/79 | 11/60 |
| presence null control (labelled `present`) | 144/171 | 18/471 | 27/574 | 181/192 | 0/11 | 14/79 | 18/60 |

Lab (40): W2 shipped exact 6/37, FI 39/427, aside exact 6/32; best lab variant (window only + asides) 15/37, aside 15/32
(beats the control's 0/32 by 0.47, margin 0.3); presence control 5/37, aside 0/32. The lab and real sets prefer different
context lengths; W2 follows the real set.

Readings:

- **W2 beats the model read on every row** (exact-set 0.65 vs 0.09, FI 0.20 vs 0.72, span FI 0.20 vs 0.89, mixed 5 vs 0)
  at zero prompt cost, but stays far from 0.9 / 0.02 and below the labelled-presence control (an oracle input).
- **The rules are right; presence is the gap.** With labelled presence as the presence source, the derived rules give
  exact-set 153/155 (0.987), FE 5/574, coverage 167/192 (0.87); every FI pair left (11) is in the ambiguous stratum, so
  non-ambiguous FI is 0/411. Deterministic presence (spoke or named) tops out near 0.66.
- **Two floors are structurally out of reach without a reader**: mixed detection (5 of the 11 mixed messages carry no
  lexical cue, so the ceiling is 6/11 < 0.8) and FI ≤ 0.02 while `unknown` labels count every predicted heard (the speaker
  included) as a false inclusion: with oracle presence and no abstention the stratum alone is 19/471 = 0.040.
- Tuning bias: the cue list, the first-sentence rule and the 24-message context were chosen on these same sets (no held-out
  set). Treat the W2 numbers as optimistic until the held-out run below.

## Floors (TO RESTATE by the owner)

W4 floors as declared (v2.8 42 §7): exact-set ≥ 0.9, FI ≤ 0.02 (incl. ambiguous), FE ≤ 0.10, coverage ≥ 0.85, mixed ≥ 0.8,
span FI ≤ 0.02, aside exact ≥ 0.8, beat presence on W4a by ≥ 0.3. Not retuned here. For the owner's restatement (proposals,
not decisions): report FI split into non-ambiguous and ambiguous pairs; a design must beat the presence null control's
exact-set on the real set, since the real set has no whole-message asides for W4a.

## What remains

- **A presence source** (rule 6). Cheapest candidate: the judge scene read already asks `present:<rosterId>` per cast member
  every boundary (TypeSafe, off the reply path, no GPU) but keeps only the latest record (`sceneCoordinator.ts`) and has no
  calibration row for presence. Needs: a per-boundary presence history in the scene slice (rolled back with the message),
  a calibration row on the adjudicated `present` labels, then `derive-score` with that source. Not built.
- **Abstention on ambiguity**: a cue-sentence or low-confidence message could read `unknown` instead of a set (fail closed,
  costs coverage, 25 messages of slack at 0.85). Only worth it after the presence source.
- **Live plumbing** of W2 (no-model lane): `test/scenarios/v28-42-witness.json` updated to the derived claims; not run.
- Consumers (v2.8 43 recall, 44 overhearing) still may not read the record.

## End-batch checks (not run; no GPU, no lanes this pass)

1. Live plumbing, no-model lane (no GPU), after `npm run build && npm run stage`:
   `node scripts/debug/st-lanes.mts run <lane> -- scripts/debug/so-scenario.mts run test/scenarios/v28-42-witness.json --sandbox --group "Group: Arin, DM Narrator"`, twice.
2. Presence source measurement (TypeSafe judge, no GPU; recorder NOT BUILT): proposed
   `node scripts/debug/so-witness.mts presence-read --out C:/dev/story-orchestrator/test/sessions/witness-real --sessions C:/dev/story-orchestrator/test/sessions`
   (runs the shipped scene read per labelled message, saves `present` p per member), then `derive-score` with that source.
3. Held-out set (GPU, at the end batch): after the next play batch yields ≥ 8 new qualifying group sessions, write, check,
   adjudicate and freeze labels for them only (`so-witness.mts label-write | label-check | adjudicate | freeze --adjudicated`
   on a fresh `--out`), then
   `node scripts/debug/so-witness.mts derive-score --out <fresh dir> --sessions C:/dev/story-orchestrator/test/sessions --freeze <fresh dir>/freeze-adjudicated.json`.
   No read-model time is needed for W2 itself (0 reads); GPU time is only the play batch that produces the sessions.

## Gate record 2026-10-26 (branch `v3.0-c1-witness`, offline, no model, no GPU, no lanes)

- Built: `memory/witness/derive.ts` (+ `derive.test.ts`, 15 cases: speaker, narrator view, disabled members, look-ahead
  bound, context, presence hook, asides whole and mixed with record lookups, shared name tokens, read shape, rollback ≡
  replay of the kept read); `extraction/sharedRead.ts` derives instead of adding the witness section; `witness.test.ts`
  read cases updated; `so-witness.mts derive-score` + `scripts/debug/lib/witnessDerive.mts` (+ `witnessDerive.test.mts`);
  feature copy and `docs/guide/player/memory.md` updated; scenario `v28-42-witness.json` updated (not run).
- Gates: `npm run gates:quick` green in 88.9 s (typecheck, typecheck:test, lint changed, jest related, defect replay 32/32
  killed); `npm run debug:typecheck` clean; `node --test scripts/debug/witnessDerive.test.mts scripts/debug/witness.test.mts
  scripts/debug/witnessRecord.test.mts` 12/12; jest guards (codeHealth, architecture, lazyHarness, ownership, features, guide)
  177/177; `npm run build` main bundle 1,268,666 B (budget 1,300,000). Full `npm run gates` not run (not asked).
- Deviations: live gate not run (no lanes this pass), so the ST-facing change (prompt loses the witness section) is NOT green
  live.

## Unresolved questions

- Keep W4's 0.9 exact-set floor, or accept presence-plus-exceptions with a lower floor and a stricter false-inclusion bound?
- Should FI count the speaker of an `unknown`-labelled message as a false inclusion (the rubric says the speaker always hears)?
- Is message-level privacy a product goal now (v3.0 02 reopen condition), or only witness-filtered recall?
- Build the scene-read presence history + calibration (no GPU, TypeSafe calls) next, or park until a playtest flag?
