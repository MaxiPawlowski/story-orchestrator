# Plan 12 — Witness record redesign

**Status: DESIGNED + BUILT OFFLINE 2026-10-26 (branch `v3.0-c1-witness`, owner decision 8: offline now, GPU later).
Design W2 (derived witness) is on master's switch `memory.witness` once merged, still unconsumed. It does NOT clear the W4
floors on its own; with a presence source as good as the labels it clears exact-set and FE and misses FI by the ambiguous
stratum only. Floors kept as written (owner 2026-10-26).** **C1 pass 2 (2026-10-28): W4 failure diagnosed by class (78 % of the read's false inclusions are disabled members and the narrator, code facts; the rest is presence); recommendation O3 = W2 + presence source P1; speaker-own scores: W2 fails, presence-oracle ceiling passes exact-set/FI/FE/coverage, mixed and span FI stay structural. Not merged: the prompt change needs a real-model gate (GPU step 1).** **C1 pass 3 (2026-10-28): P1 presence measured on lane 38 (TypeSafe, 232 calls): pair accuracy 0.817 real / 0.810 lab vs 0.95 FAIL, false-present 0.010 real pass / 0.041 lab FAIL. O3 (W2 + P1): FI 9/465 pass, FE 0.31 and exact-set 0.38 FAIL; W2 merges only after GPU step 1.** **GPU step 1 (2026-10-28): live suite ×2 on Artemis (lane 41, C1 build) NOT green against
its floors (facts 8/20, epistemic 2/3, intents playerAttributed 1), identical on a pre-W2 control build (same prompt
fingerprint, 0 regressed); the fixture prompt never carries the witness section, so the suite cannot see W2. Merged (branch
adds no `src/` over master, which has carried W2 since `49fa0fa5`).** Follows v2.8 42 (`docs/plans/v2.8/42-witness-filter-v2.md`, W4 FAIL).

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

## Owner decisions 2026-10-26 ("as recommended", via the coordinator)

1. **Floors stay exactly as written** (v2.8 42 §7): exact-set ≥ 0.9, FI ≤ 0.02 (incl. ambiguous), FE ≤ 0.10, coverage
   ≥ 0.85, mixed ≥ 0.8, span FI ≤ 0.02, aside exact ≥ 0.8, beat presence on W4a by ≥ 0.3. No retuning after results.
2. **Scoring rule for this result stays as written**: a predicted heard on an `unknown`-labelled message, the speaker
   included, counts as a false inclusion. The scores above are final under it.
   **For future runs (declared now, before any such run):** the speaker hearing their own message is not counted as a false
   inclusion when the label is `unknown` (that pair leaves the ambiguous stratum's numerator and denominator); everything
   else unchanged. Built as `scoreWitness(set, predict, { speakers })` (`memory/witness/score.ts`, test in `score.test.ts`):
   default off, so re-scoring an old result reproduces it; `so-witness.mts derive-score --speaker-own` turns it on and every
   new run passes it. The 2026-10-26 result is not re-scored under it.
3. **Next step: the presence source** (judge scene read history + calibration), design only, no GPU (below).

## Floors

As decision 1. W2 misses exact-set, FI, coverage, mixed and span FI; the presence source must bring exact-set and FI over
before any GPU or consumer work.

## Next step: presence source P1 (design only, not built, no GPU)

Fills rule 6 (`DeriveMessage.present`) from the judge scene read, which already asks `present:<rosterId>` per cast member
at every boundary (`judge/scene.ts:98`, TypeSafe, off the reply path, `PRESENT_P` 0.7).

- **History, not latest.** The scene coordinator keeps only the latest `SceneReadRecord` (`sceneCoordinator.ts:127-129`).
  Add a bounded ring in the scene slice: `{ boundary, messageId, revision, present: { rosterId: p } }` per committed
  boundary (cap 200, oldest folded away, the witness record keeps its own claims). Rollback drops rows with
  `messageId >= m` in `quarantine` (as `rollbackWitness`); a row whose revision no longer matches reads as absent.
  Stored as a detached copy; no compiled code key, so no rollback detector.
- **Message mapping.** A read at a boundary judges presence at its last message. A message takes the row of the first
  boundary at or after it, within the same read window (a player line and the reply that closes its boundary share one
  row). No row (judge off, outage, no key) = no `present`, so the code stage (rule 4) applies: the source only fills gaps.
- **Thresholds, fail closed.** p ≥ `PRESENT_P` = on stage; anything lower is not on stage for adding text. An uncertain band
  (0.3 to 0.7) is counted in the audit, so abstention (`unknown`) can be measured later without a second read.
- **Plumbing.** `WitnessPort` gains `presence(messageId)` reading the ring; `sharedRead.loadWitness` passes it into
  `deriveFromRead`, which sets `present` per message (lazy chunk; the main entry gains only the port method).
- **Calibration (judge rule: no use without a passed row).** Presence gets its own row, `scene.present`, provider ×
  model × use, measured on the adjudicated `present` labels (real 192 messages × members, private), never on public
  fixtures: per-pair accuracy ≥ 0.95 and false-present ≤ 0.02 of absent pairs, declared here before any call. Below the
  floor the use stays refused (`uncalibrated`) and W2 keeps the code stage.
- **Measurement (TypeSafe calls, no GPU; recorder NOT BUILT).** `so-witness.mts presence-read` would run the shipped scene
  read in a lane page for each labelled message (window as the coordinator builds it, ending at that message) and save the
  per-member p to `test/sessions/witness-real/presence-reads.json`: 192 real + 40 lab reads, chunked under the plugin's
  60 calls/min (about 5 min). Then `derive-score --presence <file> --speaker-own` (a new run, so decision 2's rule is on),
  scored against decision 1's floors and the presence null control's exact-set (144/171).
- **Expected ceiling.** The labelled-presence diagnostic (153/155, FI 11/471 under the old rule) is the bound; mixed
  detection stays capped at 6/11 by the cue-less mixed messages, so W4 cannot fully pass on presence alone. The read
  that could close it (a per-message mixed-audience classifier) is a later, separate decision.

## What remains

- **Presence source P1** (above): history ring, calibration row, recorder, then `derive-score --presence --speaker-own`.
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

## C1 pass 2: declarations (2026-10-28, written and committed before any run in this pass)

Coordinator task 2026-10-28 (track C1, offline only). Branch `v3.0-c1-witness`, master merged in first. No GPU, no lanes, no
model call.

- **Diagnosis** (`so-witness.mts diagnose`, new, counts only, no floors): every scored (message, member) pair of the W4 model
  read (2026-10-25 recorded responses replayed), W2 as shipped, and the presence null control is put in one failure class:
  false inclusion = member disabled at read time | omniscient member (not the speaker) | enabled but off stage (not in the
  labelled `present`) | on stage but kept out (aside); false exclusion = the speaker | a present member; no answer = by
  witness state; `unknown` labels = speaker vs others predicted heard; mixed labels = flagged or not, span false inclusions by
  the same classes. Scored under the rule each result was recorded with (decision 2: old results without `--speaker-own`).
- **New scores in this pass**: W2 as shipped and the labelled-presence ceiling, both under `--speaker-own` (decision 2: every
  new run passes it). Floors = decision 1, unchanged: exact-set >= 0.9, FI <= 0.02, FE <= 0.10, coverage >= 0.85, mixed >= 0.8,
  span FI <= 0.02, aside exact >= 0.8, beat presence on W4a by >= 0.3. Expected before the run: neither passes (mixed is
  capped at 6/11 by cue-less mixed messages). No rule, cue list or context length changes in this pass: no tuning on the
  frozen set.
- **No model replay**: Sol (the only allowed offline model) wrote the labels, so Sol as the classifier is not an independent
  measurement; the product read runs on Artemis (GPU, out of bounds), and the presence source P1 is the TypeSafe scene read,
  which needs a lane page. A model pass is therefore not needed and not run.

## C1 pass 2: diagnosis of the W4 failure (2026-10-28, `so-witness.mts diagnose`, counts only)

Private result `test/sessions/witness-real/diagnose-2026-10-28.json` (sha256 `ce828959…`). Old rule (unknown-label speaker
counts). Pairs = (message, member); FI pairs below are on single-audience labels, the ambiguous stratum apart.

**W4 model read, real set (192 messages: 171 single, 11 mixed, 10 `unknown`).** The read wrote 240 lines: 196 `all-present`
(82 %), 40 member lists, 4 `unknown`, 0 `mixed`.

| Failure class | Pairs / messages | Cause |
|---|---|---|
| FI, member disabled at read time | 155 pairs (49 % of 313) | recorder resolved `all-present` to every session member; the product resolves it to the enabled set (artifact, not the model) |
| FI, omniscient member (narrator) not speaking | 92 pairs (29 %) | the read counts the narrator as a listener; labels never do (convention; code rule) |
| FI, enabled member off stage | 66 pairs (21 %) | real presence error: the read says `all-present` for members not in the scene |
| FI, ambiguous stratum (`unknown` labels) | 26 of 60 pairs (12 aside, 8 off stage, 4 narrator, 2 speaker) | counted as FI by rule |
| FE | 4 pairs (1 speaker, 3 present) | negligible |
| No answer (coverage) | 24 messages, 136 pairs | 29 lines rejected because they name the player character as a member (4 distinct player tokens: persona names and role words) |
| Mixed missed | 11 of 11 (10 answered a single set, 1 `unknown`) | the read never writes `mixed` |
| Exact-set misses | 134 of 147 classified | 82 only disabled/narrator pairs (code-fixable), 48 with an off-stage member, 4 FE |

Lab (40): 20 of 40 lines `all-present`; 17 lines rejected (player named), leaving 16 messages uncovered; FI 30 pairs (aside
10, narrator 11, off stage 9) + 5 ambiguous; FE 36 (33 present: the lab's authored listeners include members the read left out).

**Readings.** About 78 % of the read's false inclusions come from two things code knows for certain (who is enabled, who is
the omniscient narrator). The rest is presence. The read added no information about asides or mixed messages (0 `mixed`
lines, 0 asides detected), and its member lists broke coverage when it named the player. A model line per message is the wrong
place for this signal.

**W2 as shipped (same windows), real set.** FI 82 pairs, every one an enabled member off stage, over 51 messages (the whole
exact-set gap); 19 single-audience messages flagged mixed by an aside cue (78 pairs no answer: the coverage loss); 6 of 11
mixed messages carry no cue (missed); FE 5 present members cut by a cue; ambiguous 13 (8 aside, 4 off stage, 1 speaker).
Lab: FI 34 (24 aside kept-out, 10 off stage), FE 34 present (the lab puts the narrator and named listeners in `heard`).

**Presence null control, real set.** 0 non-ambiguous FI; all 27 FE are the speaker (the narrator speaking, not in `present`);
mixed 0/11. Its weakness on the real set is only the speaker rule, which W2 has.

## C1 pass 2: design options and recommendation

| | Design | Real-set evidence | Cost |
|---|---|---|---|
| O1 | Model witness lines in the shared read (v2.8 42 B) | exact 13/147, FI 339/471, mixed 0/11; Wc miss | +150 in / +282 out tokens per read |
| O2 | W2: code rules (speaker, narrator, enabled set, on stage by spoke/named, aside cues), no model (built) | exact 99/152, FI 94/465 (speaker-own) | 0 tokens, 0 latency |
| O3 | **W2 + presence source P1** (judge scene read history, calibrated `scene.present` row) | ceiling with labelled presence: exact 153/155, FI 8/465, FE 5/574, coverage 167/192 | TypeSafe call per boundary, already made (scene read); off the reply path |
| O4 | O3 + per-message mixed/aside classifier (B′) | only path to mixed >= 0.8 and span FI <= 0.02 (6 cue-less mixed messages) | a side pass per message (GPU or a calibrated judge use); not designed |
| O5 | Drop: block level + host-channel alert only | — | 0 |

**Recommendation: O3.** O1 is dominated on every row. O2 is the right skeleton: its remaining error is presence (82 of 94 FI
pairs) and aside-cue false positives (19 messages). O3 replaces the weakest stage with a signal we already compute; its
oracle ceiling clears exact-set, FI, FE and coverage on the real set. It cannot clear mixed (5/11) or span FI (9/79), and
the lab's aside row (W2 6/32 vs control 0/32, margin 0.19 < 0.3) fails under any presence source: those need O4, a separate
decision after O3 is measured. Nothing consumes the record under any option until every floor passes.

## C1 pass 2: scores (2026-10-28, `derive-score --speaker-own`, declared above)

Private result `test/sessions/witness-real/derive-score-speaker-own-2026-10-28.json` (sha256 `6746b5ce…`). FI denominators
drop by the 6 real / 1 lab speaker pairs of `unknown` labels.

| Row (floor) | W2 shipped, real | Ceiling: labelled presence + W2 rules, real | Presence control, real | W2 shipped, lab |
|---|---|---|---|---|
| exact-set (>= 0.9) | 99/152 = 0.651 FAIL | 153/155 = 0.987 pass | 144/171 = 0.842 FAIL | 6/37 FAIL |
| FI incl. ambiguous (<= 0.02) | 94/465 = 0.202 FAIL | 8/465 = 0.017 pass | 13/465 = 0.028 FAIL | 38/426 FAIL |
| FE (<= 0.10) | 5/574 pass | 5/574 pass | 27/574 pass | 34/143 FAIL |
| coverage (>= 0.85) | 162/192 = 0.844 FAIL | 167/192 = 0.870 pass | 181/192 pass | 38/40 pass |
| mixed (>= 0.8) | 5/11 FAIL | 5/11 FAIL | 0/11 FAIL | 0/2 FAIL |
| span FI (<= 0.02) | 16/79 FAIL | 9/79 FAIL | 14/79 FAIL | 0/50 pass |
| aside exact (>= 0.8) | no denominator (0 real asides) | — | — | 6/32 FAIL |
| beat presence on W4a by >= 0.3 | — | — | — | 6/32 vs 0/32 = +0.19 FAIL |

As expected before the run: nothing passes. Under the speaker-own rule the presence-oracle ceiling passes 4 of the 6 real
rows; mixed and span FI stay structural. Floors not retuned.

## C1 pass 2: GPU step proposed (owner decides; nothing here was run)

1. **Before merge to master (GPU, ~30 min of 3090):** W2 removes the witness section from the shared-read prompt, an
   LLM-consuming path, so the project rule wants a real-model gate: one model lane, Artemis read profile, images and sprites
   off, `node scripts/debug/so-live-suite.mts run` twice consecutive on the W2 build against the last green per-tier floors
   and `plotDeltaAccuracy` (the Wc row is 0 added tokens by construction). Estimate from the W4 run's read latency (p95 21 s):
   about 15 min of reads plus lane start and model load per run.
2. **P1 measurement (no GPU, TypeSafe, ~5 min of calls; recorder not built):** as "Next step: presence source P1" above, on a
   no-model lane.
3. **Held-out set (no read-model time):** labels for >= 8 new group sessions from the next owner play batch; W2/O3 derive
   needs 0 reads.
4. **O4 only if chosen after O3 (GPU, ~15 min):** a per-message mixed/aside classifier over the 232 labelled messages, about
   3 s each on the 3090.

## Gate record 2026-10-28, C1 pass 2 (branch `v3.0-c1-witness`, offline, no model, no GPU, no lanes)

- Master `d2006d17` merged into the branch (clean). Declarations `79cea806` committed before any run; diagnosis, options,
  scores `8e7ee711`; errorCopy row `4e145782`.
- Built: `so-witness.mts diagnose` (`scripts/debug/lib/witnessDiagnose.mts`, test `scripts/debug/witnessDiagnose.test.mts`);
  `realSet`/`labSet` exported from `witnessDerive.mts`. No product code changed in this pass beyond the errorCopy inventory row
  for W2's existing `witnessContext` fallback (master's guard postdates the branch).
- Runs (private tree, counts only above): `diagnose --out test/sessions/witness-real --freeze …/freeze-adjudicated.json`
  exit 0 (`diagnose-2026-10-28.json`, `ce828959…`); `derive-score … --speaker-own` exit 0
  (`derive-score-speaker-own-2026-10-28.json`, `6746b5ce…`); a re-run of the 2026-10-26 `derive-score` without
  `--speaker-own` reproduced every row of that result. Totals cross-check: diagnosis FI + ambiguous equals the scorer's FI on
  every design and set.
- Gates: `npm run gates:quick` green in 147.2 s. `npm run gates` (no `--resume`) first run RED: `test` on `errorCopy.guard`
  (W2's silent catch not inventoried, fixed), `test:debug` on 5 campaign-index tests (the worktree's gitignored
  `test/sessions/adolion-stories.json` was a stale copy from 2026-10-26; refreshed from the main checkout, environment) and
  `test-storybook:ci` (port 6006 held by another process, environment). Second run `npm run gates`: **all green in 358.4 s**
  (jest 10,775 passed / 1 skipped; test:debug 1,583 passed; Storybook 167 suites, 1,010 stories; build, typecheck,
  typecheck:test, lint, debug:typecheck, test:replay, test:plugin, test:release ok).
- Not merged to master: the branch (W2, 2026-10-26) removes the witness section from the shared-read prompt, an
  LLM-consuming path with no real-model gate yet (GPU step 1); the record itself stays unconsumed. Not staged, not installed.
  The branch is already inside `v3.0-wave1-integration` (`667471ba`), at its 2026-10-26 head.

## C1 pass 3: presence source P1 measurement, declarations (2026-10-28, committed before any judge call)

Coordinator 2026-10-28: W2 merges only after GPU step 1 (live suite green twice on an Artemis lane); O4 not designed until O3 is
measured; P1 floors accepted as predeclared, informational, never retuned.

- **Recorder** `so-witness.mts presence-read` (no GPU, TypeSafe judge through the lane page's `storyOrchestratorJudge.probe`, the
  key stays in the lane's ST secrets): one shipped scene read (`buildSceneReadRequest`, families = tracker only, as the
  coordinator asks `present:<rosterId>` at a boundary) per labelled message, window = the chat's last
  `DIRECTOR_WINDOW_MESSAGES` (8) message ids ending at that message (system rows dropped), story/checkpoint from the session's
  pinned story and boundary-log state (lab: the scene's checkpoint), cast = the story roster. Saves per member p to
  `test/sessions/witness-real/presence-reads.json` (private). 192 real + 40 lab calls. One no-model lane (30), build served by
  a CDP route holder from the worktree `dist/`, nothing staged.
- **P1 floors (primary, as accepted):** per (message, member) pair over every kept adjudicated label and every label member,
  predicted present = p >= `PRESENT_P` (0.7): pair accuracy >= 0.95 **and** false-present <= 0.02 of labelled-absent pairs.
  Scored on the real set and the lab set apart. A call with no answer counts its pairs as wrong (accuracy) and as not present.
- **Reported, not floors:** the same rows without the omniscient members (W2 rule 2 never consults presence for them);
  the 0.3-0.7 band count (abstention slack); false-absent.
- **O3 score:** `derive-score --presence <file> --speaker-own`, W2 rules with P1 as rule 6, scored against decision 1's W4
  floors and the presence null control (144/171). Expected before the run: mixed stays at most 6/11, so O3 cannot pass W4
  whole. No threshold, window or rule changes after the run.

## C1 pass 3: P1 and O3 results (2026-10-28, lane 38, TypeSafe judge, no GPU)

- **Run.** Lane 38 (no-model, ST server plugins on; offline lanes 30-32 carry no judge plugin), started for this run and stopped
  after. Build served by a CDP route holder from `C:\dev\so-c1\dist` (in-page `dist/index.js` sha256 `29cc7b3df1ed` = worktree
  manifest, 0 chunk 404s); nothing staged, owner ST and lane 0 untouched. Judge plugin status `configured: true` (key never read).
  `so-witness.mts presence-read` through `st-lanes run 38`: 232 calls (192 real + 40 lab), 232 answered, 0 fallbacks, model
  `jev-1.13.0`, latency 140-357 ms (median 169). Private files `test/sessions/witness-real/presence-reads.json` (`13a7ce3e…`),
  `presence-score-2026-10-28.json` (`46d63c97…`), `derive-score-o3-2026-10-28.json` (`5a57bbf5…`).

**P1 presence against its floors (p >= 0.7):**

| Row (floor) | Real (192 msgs, 1104 pairs) | Lab (40 msgs, 600 pairs) | Real, without narrator | Lab, without narrator |
|---|---|---|---|---|
| pair accuracy (>= 0.95) | 902/1104 = 0.817 FAIL | 486/600 = 0.810 FAIL | 746/948 = 0.787 | 486/560 = 0.868 |
| false-present (<= 0.02) | 5/514 = 0.010 pass | 15/362 = 0.041 FAIL | 5/358 = 0.014 | 15/362 = 0.041 |
| false-absent (reported) | 195/590 = 0.331 | 99/238 = 0.416 | 195/590 | 59/198 |
| 0.3-0.7 band (reported) | 177 pairs | 31 pairs | | |

P1 **fails** its floors on both sets. The judge is conservative: it rarely calls an absent member present (real 1 %) but misses a
third of the members who are there, and 177 real pairs sit in the uncertain band.

**O3 = W2 + P1 as rule 6 (`--speaker-own`, decision 1 floors):**

| Row (floor) | O3 real | W2 real | O3 lab | W2 lab |
|---|---|---|---|---|
| exact-set (>= 0.9) | 60/158 = 0.380 FAIL | 99/152 = 0.651 | 19/37 = 0.514 FAIL | 6/37 |
| FI incl. ambiguous (<= 0.02) | 9/465 = 0.019 **pass** | 94/465 = 0.202 | 6/426 = 0.014 **pass** | 38/426 |
| FE (<= 0.10) | 179/574 = 0.312 FAIL | 5/574 | 44/143 = 0.308 FAIL | 34/143 |
| coverage (>= 0.85) | 172/192 = 0.896 pass | 162/192 | 38/40 pass | 38/40 |
| mixed (>= 0.8) | 5/11 FAIL | 5/11 | 0/2 FAIL | 0/2 |
| span FI (<= 0.02) | 5/79 = 0.063 FAIL | 16/79 | 0/50 pass | 0/50 |
| aside exact (>= 0.8) | no denominator | | 19/32 = 0.594 FAIL | 6/32 |
| beat presence on W4a by >= 0.3 | | | 0.594 vs 0/32: **pass** (+0.59) | +0.19 |

Readings:
- O3 trades exclusion for inclusion: false inclusion drops from 0.20 to 0.019 and passes on both sets, the first design to do
  so, and the lab aside row now beats the presence control by 0.59. False exclusion rises from 0.01 to 0.31, which takes
  exact-set down to 0.38. W4 fails as declared (mixed 5/11).
- For the rule that matters to consumers that ADD text (fail closed: a member gets text only on a positive claim), FI is the
  binding row and it now holds; FE is lost recall, not a leak. For a REMOVING filter (v2.8 42 C) FE would hide what a member saw.
- The miss is P1's false-absent (0.33), not the rules: the labelled-presence ceiling stays 153/155 with FE 5/574.
- Not done (no retuning, declared): no threshold change, no band abstention, no window change. O4 stays undesigned
  (coordinator); the O3 numbers above are what the O4 decision reads.

## Gate record 2026-10-28, C1 pass 3 (branch `v3.0-c1-witness`, no GPU, one no-model lane)

- Declarations `40cfa1fc` before any judge call; recorder + result `d3bd132b`.
- Built: `scripts/debug/lib/witnessPresence.mts` (`presence-read`, `presence-score`, `derive-score --presence` via `witnessDerive.mts`
  `O3_VARIANT`), scene read kit exported through `witnessEntry.ts`; test `scripts/debug/witnessPresence.test.mts` (plan, window,
  roster mapping, resume, scoring, rule-6 source). No `src/` change in this pass.
- Live: lane 38 as recorded above (route holder, served hash = manifest, lane stopped after, holder stopped).
- Gates: `npm run gates:quick` green in 121.5 s; `npm run gates` (no `--resume`) **all green in 318.4 s** (jest 10,775 passed /
  1 skipped; test:debug 1,584; Storybook 167 suites / 1,010 stories; build, typecheck, typecheck:test, lint, debug:typecheck,
  test:replay, test:plugin, test:release ok).
- Master re-checked after gates: still `d2006d17` (local and origin), already merged into the branch; the wave1-integration merge
  had not landed. Branch left unmerged (coordinator: W2 merges only after GPU step 1).

## Gate record 2026-10-28, GPU step 1 and merge (branch `v3.0-c1-witness`, one model lane)

- Master `982f945d` merged into the branch (`7ef986c2`, no conflicts). Master already carries W2 (`49fa0fa5`), so the branch
  over master is debug tools (`so-witness diagnose`, `presence-read`, `presence-score`, `derive-score --presence`), this doc
  and nothing in `src/`. The merge auto-kept both copies of the `sharedRead.ts#witnessContext` errorCopy row; the duplicate is
  dropped in `2917ee91` (caught by `errorCopy.guard`).
- `npm run gates:quick` green in 114.3 s after the merge.
- Live (GPU step 1): lane 41 (model lane, `st-lanes start 41 --allow-local --headed`), local controller (Artemis 31B v1.1,
  read profile "Story Orchestrator Memory RunPod" pointed at the controller), images and sprites off, `memory.witness` on.
  C1 build (`7ef986c2`) served by the CDP route holder (`candidate-hold.mjs`) from `C:\dev\so-c1\dist`: in-page
  `dist/index.js` sha256 `9df33a4c3770` = worktree manifest, 0 chunk 404s; nothing staged, owner ST and lane 0 untouched.
  The controller was shared with another agent's lane throughout.
- Command, each run: `node scripts/debug/st-lanes.mts run 41 -- scripts/debug/so-live-suite.mts run --min 0.9 --expect-count 43
  --min-tier facts=0.68,rejected=0.9,epistemic=0.8,ledger=0.8,arcs=0.8 --arm <arm> --no-stop` (floors: v2.5 F2 / v2.6 13, facts
  0.68 per X15, intents default 0.8 + playerAttributed 0; not retuned).
- Run 1 (`c1-w2-r1`) and run 2 (`c1-w2-r2`), identical, both exit 1:
  - deltas 43/43 (`plotDeltaAccuracy` 1.0, last green 1.0), rejected 35/36 ok, arcs 2/2 ok, ledger 2/2 ok;
  - facts 8/20 = 0.40 FAIL (floor 0.68; 12 fixtures emit no fact line at all);
  - epistemic 2/3 FAIL (floor 0.8);
  - intents precision 0.917 / recall 0.917 but playerAttributed 1 FAIL (floor 0).
- Control (not asked; run to attribute the misses): pre-W2 master `d2006d17` built in a detached worktree `C:\dev\so-c1-ctl`,
  served the same way (`3b6cf17a1349`), one run `c1-ctl-d2006d17-r1`: the same rows, the same 12 facts fixtures, epistemic 2/3,
  intents playerAttributed 1 (recall 0.833). Fingerprints equal on all three runs (prompt `5f7a458a0811d117`, scorer 2, config
  `273f74f81de26548`). `so-live-suite compare ctl ctl w2-r1 w2-r2`: comparable, 0 regressed, 1 improved, 162 unchanged.
- Reading: the fixture runner (`runtime/liveSuite.ts` `runFixture` → `extraction/fixtureRun.ts` `buildFixtureRun`) renders the
  read prompt without any witness section in either build, so this suite cannot measure W2's prompt removal; the shipped path
  (`runSharedRead`) is reached only by `runWitnessRead`. The facts, epistemic and intents misses are pre-existing on this
  model/controller, not W2. Recorded, floors not retuned. W2's own real-model proof on the shipped read path stays open.
- Merge decision: the live suite is not green, but it is unchanged against the pre-W2 control and the branch changes no product
  code over master, so it merges.
- Run header: `so-run-header diff` (post vs pre, through `st-lanes run 41`) differs only in the served bundle (the declared
  candidate → control swap); no settings, library or lorebook drift. Holder and lane 41 stopped after.
- `npm run gates` (no `--resume`) in `C:\dev\so-c1`: first run RED (`test`: errorCopy duplicate row, fixed in `2917ee91`;
  `test:plugin`: `comfyReclaim.test.mjs` timing test under load, 418/418 alone, no branch change there). Second run on
  `2917ee91`: **all green in 386.6 s** (jest 10,799 passed / 1 skipped; test:debug 1,635; test:plugin 418; Storybook 167 suites /
  1,010 stories; build, typecheck, typecheck:test, lint, debug:typecheck, test:replay, test:release ok).
- Evidence (counts only): `C:/dev/so-lanes/41/debug/c1live/` (`r1.log`, `r2.log`, `ctl-r1.log`, the three reports `09be4f72…`,
  `b4e373a7…`, `d60d01b2…`, `compare.json`, `run-header-c1-live-{pre,post}.json`, `run-header-diff-end.json`, `hold*.log`), run
  dirs `C:/dev/so-lanes/41/debug/runs/2026-10-28T1[12]-*`; gate logs `C:/dev/so-lanes/reviews/gates-c1-w2-merge{,-2}.log`.

## Pass 4: declarations (2026-10-29, written and committed before any run in this pass)

Coordinator task 2026-10-29 (track C, offline only, branch `v3.0-12-witness-redesign`). CPU only: no GPU, no lanes, no model
call, no judge call. Every number in this pass replays already-recorded evidence (`reads/files`, the sessions' own extraction
audits, `presence-reads.json` from pass 3) against the frozen adjudicated labels (`freeze-adjudicated.json`).

- **Diagnosis added in this pass** (`so-witness.mts candidates`, counts only): (a) the W4 read's prompt shape (contract text
  vs what the labels need); (b) a transcript-signal census over every (single-audience labelled message, listener) pair,
  listener = enabled, not omniscient, not the speaker: labelled present vs W2's code stage (spoke or named, 24 back,
  look-ahead), the scene-reset code stage (D1 below) and P1's p class (>= 0.7, 0.3-0.7 band, < 0.3, no row).
- **Candidates (all three fixed here; no parameter is chosen after a score):**
  - **D1 scene-reset stage (deterministic given the shared read):** W2 with rule 4 replaced by "spoke or named since the
    latest scene break at or before the message (still at most 24 back), look-ahead to the read window's end but not past the
    next break". Breaks = `SCENE_BREAK at=<m>` of the shared read (the persisted `audit.sceneBreak`, already produced; no new
    model work). Offline source, real set: the session's own extraction audits whose window ends at or before the read's
    end (the ring the product would hold then; later audits are not visible); lab set (no session audits): the recorded W4
    reads' `SCENE_BREAK` lines. Fed through rule 6 (`present`), so rules 1-3 and 5 are unchanged.
  - **D2 judge-for-exceptions:** per listener, P1 p >= 0.7 = on stage, p < 0.3 = off stage, band or no row = D1's code
    stage. Thresholds are pass 3's declared `PRESENT_P` and band edge, not new.
  - **D3 D2 + abstention (fail closed):** where P1 is confident and disagrees with D1's code stage for any listener (p >= 0.7
    and not on the code stage, or p < 0.3 and on it), the whole message reads `unknown` (no claim adds text). A message D2
    already makes mixed keeps its spans (they fail closed per span).
- **Scoring:** `scoreWitness(…, { speakers })` (decision 2's speaker-own rule, every new run), decision 1's floors unchanged:
  exact-set >= 0.9, FI <= 0.02 (incl. ambiguous), FE <= 0.10, coverage >= 0.85, mixed >= 0.8, span FI <= 0.02, aside exact
  >= 0.8, beat presence on W4a by >= 0.3. W2 and O3 are re-scored in the same run as references (must reproduce pass 2/3).
- **Expected before the run:** no candidate passes W4 whole: mixed is capped at 6/11 by the cue-less mixed messages and span FI
  sits at or above the labelled-presence ceiling (9/79). The question this pass answers is which design clears the
  presence-bound rows (exact-set, FI, FE, coverage) on the real set, for the GPU decision.
- **Tuning bias, declared:** D1-D3 were designed after pass 2's class diagnosis and pass 3's P1 result on this same frozen set;
  there is no held-out set. Any pass here is optimistic until the held-out run (end-batch check 3). A purely deterministic
  candidate is implemented in `src/` only if it clears every floor offline; none is expected to (mixed cap), so this pass
  changes no product code.

## Unresolved questions

- Is message-level privacy a product goal now (v3.0 02 reopen condition), or only witness-filtered recall?
- P1 calibration floors (pair accuracy ≥ 0.95, false-present ≤ 0.02) are proposed here; confirm before the first call.
- W2 reached master in `49fa0fa5` before GPU step 1; the live suite cannot see it. Is a real-model check on the shipped read
  path (`runWitnessRead`, delta recall with vs without the witness section) owed, or does the unchanged fixture suite suffice?
- Live suite misses on Artemis (facts 0.40, epistemic 2/3, intents playerAttributed 1) are pre-existing: whose track owns them?
- O4 (per-message mixed/aside classifier) worth designing, or accept mixed and span FI as unmet and keep the record unconsumed?
