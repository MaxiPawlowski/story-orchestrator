# 35 — v2.8 test coverage

Imported from `C:\dev\so-coverage-draft.md`: audit of master `c21a42b9`, 2026-10-10.
B6 update 2026-10-11 on `v2.8-pod2`, after merging master. Synthetic fixtures only; no campaign content.
Rows outside the B6 and pose/head updates retain the original audit's evidence, not a new acceptance claim.

## Matrix

J = jest; P = server-plugin node:test; D = no-model browser scenario; L = real-model scenario;
Jy = journey; PG = payload golden; SB = authored Storybook coverage (execution only where cited);
Lab = private campaign lab, counts/features only. A written fixture is not a passed gate.

| Feature | J | P | D | L | Jy | PG | SB | Lab | Evidence / owed |
|---|---|---|---|---|---|---|---|---|---|
| Living director, branching, F24/F25/F26 pace (22) | living, coordinator review, pace, paceL1, rollback, spoilers, authorHold | — | **v28-35-living-rollback PASS ×2** | no committed L1/L5 fixture | — | — | authored | — | B6 covers review, boundary fold, reopen, swipe/delete and graph replay. L1 below floor; M21 after pace2, M22/M24, committed L1/L5 model fixture owed |
| Wizard on Sol/harness, Ask, recipes (09) | yes | — | v28-09-ask-player-clean, scripted | live-v28-09-ask-player-play | J14 | — | authored | — | M18 re-score, M19 at 60/36, Sol default live check owed |
| Briefing drafting (10) | yes | — | v28-10-briefing-draft, scripted | — | — | — | authored | — | Real-model draft and CL floors owed |
| Curator create, A15 near-dup, A16 stamp/reaper, A17 census (11) | yes, mutations 15/15 | — | **v28-35-curator-create PASS ×2** | live-v28-11-create | — | — | authored | — | B6 covers review, boundary write, stamp, duplicate advice/decline and delete-chat Keep/Delete. A15 vectors quality owed; advisory by design (resolved below) |
| Local judge (14) | one file | yes | — | — | — | — | authored | judge use fixtures | Routes refused until calibrated; play-load owed |
| Game layer: quests, life, meanwhile (18 / v2.7 36–37) | yes | — | nine scenarios in original audit | live-v28-meanwhile | — | group-relationships, group-away-notice, F29 capture owed | authored | quests, life, chance | Live quest scenario and M8 re-measure owed |
| Presence panels rest (04) | yes | — | v28-04-presence-panels, scripted | — | — | — | authored | — | C5 CL owed |
| Widgets and A4 follow-ups (23) | yes | — | v28-23-widgets, followups | live-v28-23-widgets | — | — | authored | — | Widgets glance F25 re-run owed |
| GPU broker (28) | two files | broker node:test | — | — | — | — | authored | — | Mocked only; LI/LT owed |
| Story image workflows (29) | yes | — | — | — | — | — | authored | — | LI owed; story-workflow-missing has no firing scenario |
| Model downloads (30) | one file | fake providers | — | — | — | — | authored | — | Original audit: no download evidence |
| X1 context refusal, context-over-server | yes | yes | — | live-f20-long-chat ×2 on 3090 | — | — | — | — | Pod-lane finding potentially false positive, unconfirmed |
| X2 token-count bypass | — | gateway.test | — | — | — | — | — | — | Measured ×2 by private scratch scripts only |
| F27 read budget | yes, S17 replay | — | — | — | — | — | — | life lab rows | PASS ×2 live after fix; earlier failures retained in backlog |
| R7 late lore placement | lorePlacement | — | **v28-35-lore-placement PASS ×2** | model A/B not committed | — | group-lore-placement | — | — | B6 checks off/on scans, depths 5/4, constant/disabled exclusions, repeat equality and disk unchanged. R7 INCOMPLETE; SWA/P5 and F29 owed |
| Guide restructure X8 | yes | release node:test | — | — | — | — | authored | — | Original audit lacked gate record; no new gate claimed here |
| Pose library, character layers B1–B3 (33) | poses, bodyRenderer, importHost, stageBodies, stage choice, VnStage | media preflight, release pose library | — | — | — | — | **plan 33: 120 suites / 760 stories PASS** | — | Deterministic build recorded; 40 labelled replies are not a real-chain CL score. S0, DWPose download, CL ≥80%, GPU Acceptance ×2 owed (handoff A3/A4) |
| Live close-shot head (36) | liveHead, mount, VnStage | rig tooling node:test | **A1 LI3/LI4/LI6 PASS ×2** | — | — | — | **plan 36 master gate: 122 suites / 762 stories PASS** | — | A1 desktop LI1 FAIL/PASS, maxima 51.8/29.3 ms; laptop LI1, LI2 network/chunk and LI5 vision/real rigs owed. Not accepted |

## Highest-risk scenario gaps

Original top three now have committed no-model cases:

1. `test/scenarios/v28-35-living-rollback.json`: scripted proposal through `LivingPort`, author acceptance,
   rendered `/sendas` boundary application, same-chat reopen, real ST swipe/delete, graph equality on replay.
   Reads internal graph/history only to assert the applied artifact; does not inject operations into the store.
   Divergence/prefetch and a committed L1/L5 real-model fixture remain owed.
2. `test/scenarios/v28-35-curator-create.json`: two facts from a scripted extraction make a real host-backed
   lore pass eligible; proposal and acceptance do not write before the boundary; disk stamp and one created-ledger
   row checked. Duplicate advice is shown in Scheduler and declined. The owned chat is actually deleted;
   Keep them preserves the disk entry, then replaying its deleted-chat event offers the orphan again and
   Delete entries removes it. The second answer is an event retry, not a second physical chat deletion.
3. `test/scenarios/v28-35-lore-placement.json`: real `getSortedEntries()` host scan, setting-off control vs
   late placement, unchanged persisted entries, repeat scan equality. No cache-reuse or model-accuracy claim.
   Existing group-relationships/away-notice payload captures belong to B5; not counted as B6 passes.

Next gaps, original risk order retained:

4. Story image workflows: story-workflow-missing fires, checkpoint override, on-disk selection untouched.
5. Briefing drafting: real authoring model and spoiler check.
6. Quest discovery/completion with a real reader.
7. Deterministic context-over-server player copy; resolve the pod-lane finding.
8. Local judge route refused until calibrated, visible in Setup.
9. GPU broker/downloads clean-host fail-open without plugins.
10. Storybook execution: original global absence claim is obsolete; plans 33/36 now cite full suites.
    Coordinator's final combined build still needs its full Storybook-inclusive gate. Superseded 2026-10-14:
    full `npm run gates` with Storybook green (130 suites / 790 tests).

## Finding: A15 is advisory, not a refusal (resolved 2026-10-11)

- The draft and architecture invariant say a near-duplicate create is refused with “patch X instead”.
- Initial B6 runs ×2 found a duplicate-band card could become `accepted` through `setCuratorOpDecision`.
  `CreateCard.tsx` also leaves Create it enabled; its `nearDupAdvice` text is guidance, not a guard.
- Final scenario asserts the shipped advice and the author's decline, not the unbuilt refusal. Acceptance
  enforcement is still owed to the curator owner. No product code or floor changed in B6.
- The lane's vector endpoint returned duplicate-band metadata; this is not proof of semantic accuracy or
  of a wording-only fallback. Those classifier/vector quality gates remain open.

## Gate record

- 2026-10-11 · `C:\dev\so-pod2` · `v2.8-pod2`. Initial `git status --short` empty;
  `git merge master` succeeded without conflicts. Plan 39 lists preserved. B6 changes only docs/scenarios.
- Lane setup: `df -h /c`: 82 GB available. With
  `ST_ROOT=C:/dev/SillyTavern-MainBranch SO_LANES_ROOT=C:/dev/so-lanes SO_LANE_OFFLINE=1`,
  `node scripts/debug/st-lanes.mts seed 35 --slim`: offline rewrite verified; images/sprites/judge off,
  model routes closed, server plugins disabled. Then, without `SO_LANE_OFFLINE`, same root prefixes and
  `node scripts/debug/st-lanes.mts start 35`: port 8135, CDP 9335. Live settings reads before/after:
  `image.enabled=false`, `sprites.enabled=false`. Scenario settings use `ext_setting`, restored by runner.
- Setup deviation retained: `.st-root` pointed at the old isolated pod2 host, deriving a nested lanes root.
  First `SO_LANE_OFFLINE=1 node scripts/debug/st-lanes.mts seed 35 --slim` created only an offline copy at
  `C:\dev\so-lanes\so-lanes\35`; the subsequent `no-model 35` refused its existing offline backup.
  It was never started. Explicit roots above selected the intended lane 35 thereafter.
- All batch commands below had the exact prefix
  `ST_ROOT=C:/dev/SillyTavern-MainBranch SO_LANES_ROOT=C:/dev/so-lanes`.
- Initial command: `node scripts/debug/st-lanes.mts batch --lanes 35 --repeat 2 --strict test/scenarios/v28-35-living-rollback.json test/scenarios/v28-35-curator-create.json test/scenarios/v28-35-lore-placement.json`:
  **2/6 GREEN, none incomplete**. Batch `2026-10-11T11-53-18-410Z`.
  Living failed twice: missing authored chapter in synthetic fixture; corrected.
  Curator failed twice: expected acceptance refusal is not implemented; finding above retained.
  **Placement PASS ×2**, 22.292/22.929 s.
- Corrected command: `node scripts/debug/st-lanes.mts batch --lanes 35 --repeat 2 --strict test/scenarios/v28-35-living-rollback.json test/scenarios/v28-35-curator-create.json`:
  **4/4 GREEN, none incomplete**, batch `2026-10-11T11-58-41-553Z`.
  **Living PASS ×2**, 46.642/41.514 s; curator passed before adding reaper legs.
- Final curator command: `node scripts/debug/st-lanes.mts batch --lanes 35 --repeat 2 --strict test/scenarios/v28-35-curator-create.json`:
  **2/2 GREEN, none incomplete**, 39.524/35.624 s, batch `2026-10-11T12-02-59-010Z`; includes Keep/Delete reaper legs.
  Every greening row has runner/record/page/page-summary/server/evidence files and runner cleanup success.
- Page attention was not hidden: offline plugin status/inventory 404s, disconnected text props 500 and
  no-model eligibility probe chat-completions 400s. These are lane-local refusals, not successful model
  calls. No backend/GPU/ComfyUI was enabled. They are recorded in each row's page evidence.
- `npm run gates:quick`: **green in 110.0 s**; typecheck 37.6 s, typecheck:test 56.4 s,
  defect replay 32/32 killed, baseline 559 tests; no changed source files for jest/lint.
  `npm run typecheck:test`: exit 0, no diagnostics.
- First targeted debug command incorrectly named tests under `scripts/debug/lib/`: node could not find
  them (exit 1, no tests run). Corrected command
  `node --test scripts/debug/scenarioSchema.test.mts scripts/debug/scenarioRequires.test.mts scripts/debug/so-scenario.runSteps.test.mts`:
  **36 pass, 0 fail**; includes whole-corpus vocabulary and globals validation.
  `npm run debug:typecheck`: exit 0, no diagnostics.
- Served bundle read from lane 35: **1,293,563 B**, SHA256
  `30f7f3905ca877641b27ab790e299d579c8e3befb3da96c245c278346f0fa9fa`, equal to served manifest.
  Used the existing staged bundle; B6 did not build, stage or install. Not an attestation of a new build.
- `node scripts/debug/so-evidence.mts archive --label v28-b6-coverage-20261011 --lanes 35 --pods none`
  with the explicit root prefixes: **471 files, 34,964,517 B, problems []**. Private archive
  `test/sessions/evidence/phase-c/v28-b6-coverage-20261011` in so-sessions. Greening evidence under
  `lane-35/debug/batch/<batch>/<scenario>-run1|run2/record.json`; initial failed rows retained too.
  Archive copied and hash-verified; private archive commit remains coordinator-owned.
- Full `npm run gates`/Storybook not run, per owner's concurrency restriction; coordinator owes combined
  gate. No master merge/push/deployment, owner ST, GPU, campaign changes or subagents. B6 deterministic
  scenario coverage delivered; whole-plan acceptance remains open. No batch run-header baseline/diff
  was taken; per-row cleanup and archive evidence are the narrower proof.
- `node scripts/debug/st-lanes.mts stop 35` with explicit root prefixes: `stopped: true`,
  `serverUp: false`. `git diff --check`: exit 0.

## Unresolved questions

- None open. A15 near-duplicate advice stays a warning: v2.8 11's A15 record, approved 2026-10-10, says "Still a warning, never a refusal".
  The architecture invariant said "refused" and was corrected to match on 2026-10-11; no product code changed.

## Gate record: combined build (2026-10-12)

- Lane 35, `st-lanes.mts batch --lanes 35 --repeat 2 --strict` on the three B6 scenarios: living-rollback, curator-create and lore-placement all GREEN on both runs (6 of 6). Lane 33, `so-open-stretch-check.mts`: the open-stretch curve scenario `ok` on both runs, 39 of 39 steps each.
- Payload goldens, all six cases captured twice on one served build: `payload invariance: identical`. A comparison against an older master was not made: the capture tool records the staged build, and staging an older build means overwriting the owner's install. Owed with a baseline taken before the owner's next restage. Resolved 2026-10-13: plan 40 integration record, payload identical to predecessor.
- Not run: B4 judge consumer scenarios (none written), B2 provisioning roundtrips and real wizard run, B1 chain voice (all need a model route).

## Gate record: plan 40 §3 no-model scenarios (2026-10-14)

- Seven new deterministic browser rows, each PASS ×2 on lane 44 (isolated ST copy, offline), bundle `9f637c0be010`; full record in plan 40 §Gate record: §3 deterministic browser scenarios.
- Gaps closed from the list above: 4 (story-workflow-missing fires, checkpoint override, selection untouched: `v28-40-workflow-findings`), 7 (context-over-server player copy: `v28-40-context-over-server`), 8 (local judge refused until calibrated: `v28-40-local-judge-uncalibrated`, visible in Connections > Judge, not in Setup), 9 (plugin-less fail-open: broker null, media absence reported, no download probe exists). Also plan 34 provisioning/NOT_ANY dry run (`v28-40-provisioning-roundtrip`), living divergence/prefetch plumbing (`v28-40-living-divergence-prefetch`), B4 judge consumers scripted (`v28-40-judge-consumers`; pictureCue not runnable no-model) and the mobile long-press (`v28-40-mobile-touch-longpress`).
- Two product fixes with jest (lore-select cache key, long-press release tap). Real-model and TypeSafe legs remain owed; scripted rows are plumbing only.

## Harvest phase: grader hygiene, adversarial fixtures, evidence provenance (ex-plan 67, folded 2026-10-16)

Was `67-grader-hygiene-and-adversarial-fixtures.md` (written 2026-10-14, H8); folded here after Astra's review
(`review-astra-harvest-2026-10-16.md` §1, §2 (67)), with the triage rows V1, V33, V37, V47, V60, R13 and R14
(`61-harvest-triage-2026-10-14.md`). Not built, not queued. Implementation **D** (harness and fixtures); acceptance **CL** (read
model; one reply leg). Plan 24 §Measurement rows carries the compare and fingerprint rules. Synthetic fixtures only.

### Current state in code (verified on `e8b9dd6d`)

- **Matching is word-start, not whole-term.** Plan 60's B2 fix: `containsWordStart` (`scripts/debug/lib/liveSuiteScore.mts:46-47`)
  requires a needle starting with a letter or digit to start a word, so `wound` matches `wounded` and **`bel` still matches
  `below`**. The self-test keeps its own copy (`has`, `src/runtime/selfTest.ts:84-85`). No quote or dash normalisation.
  Three scorers: `scoreContains`, `scoreRejected`, `scoreIntents` (`liveSuiteScore.mts:49,83,118`).
- **Player-claim guard scope.** `CLAIM_RULE` (`src/memory/contract.ts:31`) speaks of "a character's claim"; whether the read
  applies it to the player's own lines is untested. `evidence_from` rules are per quality and opt-in.
- No extractor fixture plants a false-memory claim or a persona-pressure line.
- No cross-arm fixture diff (`so-live-suite`, `so-role-calibration verdict`, `so-run-header diff`, `so-payload-golden diff`
  each answer a different question). Recorded results carry no prompt or scorer fingerprint.
- Payload goldens are dry runs, and **dry runs skip interceptors** (ST `script.js:4562-4564`); only a captured actual request
  (`st-payload.mts arm --persist`) shows what was sent.

### Design

1. **Matcher, inventory first.** Before changing semantics, inventory every needle in `test/fixtures` and `test/goldens/live`
   that relies on prefix matching (a needle that matches only as a word prefix in its recorded live text). Then one pure
   `termPresent(haystack, needle, mode)`: NFKC, ’ → ', “” → ", en/em dash → -, then `mode: "term"` (whole term: no letter or
   digit on either side) or `mode: "prefix"` (today's word start), chosen per needle and recorded in the fixture; the default
   for new needles is `term`. One helper for the self-test and all three scorers.
2. **Re-score with versions.** `so-live-suite.mts rescore test/goldens/live/` writes old vs new verdict per fixture, each
   result stamped with a scorer version; old records are kept untouched, the re-score is a new record beside them.
3. **Adversarial fixtures, attribution-aware.**
   - False memory (`extractorNN-false-memory`): the player asserts a shared past the transcript never shows. Expected: no
     stored fact, ledger row or canon line **asserts the event**; an **attributed** row ("the player says …") is allowed. The
     assertion checks a structured field (asserted vs attributed), not `mustNotContain` words, because the attributed form
     contains the same words. Negative controls: a legitimate player action ("I hand her the key") must still be stored.
   - Persona pressure (`extractorNN-persona-pressure`): a line asking a member to talk like a customer-service bot. Reader leg
     (scripted reply): no memory row quotes the line, the warden `voice` family stays clean. This tests the reader and warden
     only. A **reply leg** (G4r) on the cloud reply model checks whether generated replies resist the pressure; only that leg
     supports a claim about reply behaviour.
4. **Noise-aware compare.** `so-live-suite compare <a-r1> <a-r2> <b-r1> <b-r2>` (pure `lib/armCompare.mts`): stable-pass,
   stable-fail, flaky (r1 ≠ r2), new, removed; "regressed" only on stable-pass → stable-fail. Two repetitions support
   "observed stable / observed flaky", nothing stronger.
5. **Chat untouched, defined.** `lib/chatUntouched.mts` hashes, per message: `name`, `is_user`, `is_system`, `mes`, `swipe_id`,
   every swipe's text, `extra.reasoning`; and the SO blob minus audit bookkeeping that off-chat runs legitimately write
   (`extras.extraction.audits`, `extras.judge.calls`, the self-test record). A difference fails the run and names the first
   changed field.
6. **Shipped-block verification (R13, R14).** A no-model scenario captures the actual outgoing request for a normal turn,
   a swipe and an impersonate, and asserts which `story_*` blocks it holds; the swipe case also checks that a pre-generation
   read on a swipe does not read the reply being replaced.
7. **Fingerprints with results (V33).** Every measurement record (live suite, role calibration, arm runs) stores the prompt
   fingerprint (hash of the assembled template), scorer version, model id and the run-header config hash; a compare across
   different fingerprints is labelled "not comparable" unless declared.
8. **Compatibility measurements (V1, V60).** Conditional rows, run only when the setting or extension is active on a lane:
   prompt-only regex scripts (V1) and Presence (V60); each runs a read fixture with and without it and records whether reads
   stay correct. A warning alone is not evidence.
9. **Side-model reasoning template (V47).** A role-calibration fixture where the extraction profile's reasoning template
   differs from the main reply's; record whether `stripReasoningBlocks` leaves reasoning in the parsed read. Implement the
   profile-template path only on a recorded failure.
10. Optional (V37): an author-flagged read (`/story flag`) exported as an extractor triple skeleton, lab text only.

### Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| G1 | Prefix inventory complete (every prefix-dependent needle listed with its mode); planted controls in `term` mode: "bel" not in "below", "arm" not in "harm", "don't" equals "don’t", "—" equals "-"; `prefix` mode keeps "wound" in "wounded" | inventory complete; 5/5 | D |
| G2 | Offline re-score of every recorded live golden completes with a scorer version; each changed verdict listed with its fixture; old records unchanged | complete, 0 unlisted | D |
| G3 | False memory: 0 rows asserting the fabricated event (attributed rows allowed); the legitimate-action control stored | 0 asserted, control 1/1, ×2 | CL |
| G4 | Persona pressure, reader leg: 0 memory rows quoting the line; warden `voice` finds nothing (scripted reply) | 0, ×2 | CL |
| G4r | Persona pressure, reply leg: 10 generated replies on the cloud reply model, second-model rater | recorded (final suite) | CL |
| G5 | Compare classifier on a synthetic 4-report set with known classes | 100 % | D |
| G6 | Untouched proof: a planted write to any hashed field fails the run; a clean run with audit bookkeeping passes | 1/1, 1/1 | D |
| G7 | Shipped blocks: the actual requests of a normal turn, a swipe and an impersonate hold exactly the expected `story_*` blocks; the swipe's pre-generation read excludes the replaced reply | 3/3, 1/1 | D (no-model lane) |
| G8 | Fingerprints: every measurement record written after the change carries prompt, scorer, model and config fingerprints; a compare across differing fingerprints is labelled | holds | D |
| G9 | Compatibility (conditional): read fixture with prompt-only regex active (V1) and with Presence active (V60) | recorded per extension when active | CL |
| G10 | Side-model reasoning template fixture (V47) | recorded | CL |

Floors are informational and never retuned (rule 2). G3/G4 misses are product findings for the memory reader.

### Gates by tier

- **D:** `npm run gates`, `npm run test:debug`; G1, G2, G5, G6, G8; G7 on a no-model lane.
- **CL:** G3, G4 ×2 inside plan 24's CL budget; G4r in the final suite; G9 only when the extension or setting is active; G10
  in role calibration.

### Decisions for the owner

1. **Inventory prefix needles before changing the default to whole-term matching?** **Recommended: yes.**
2. **Re-score recorded goldens as new, versioned records (old ones kept)?** **Recommended: yes.**
3. **A failed G3 opens a memory-reader fix as its own queue row?** **Recommended: yes.**

### Review 2026-10-16 (Astra)

Source: `review-astra-harvest-2026-10-16.md` §2 (67), §1 (V33, V47, V1/V60, Copilot P4, fold advice). Verified on `e8b9dd6d`.

- **P1 — B2 is word-start, not a shared whole-term helper; `bel` still matches `below`.** Accepted
  (`scripts/debug/lib/liveSuiteScore.mts:46-47`; separate copy `src/runtime/selfTest.ts:84-85`). → inventory first, per-needle
  mode, one helper; G1.
- **P1 — G3 must distinguish asserted from attributed; `mustNotContain` rejects the allowed form.** Accepted. → structured
  asserted/attributed check plus a legitimate-action negative control.
- **P1 — G4's scripted reply tests only the reader/warden.** Accepted. → G4 scoped to reader; G4r reply leg.
- **P2 — `mes + swipe_id` misses fields; audit bookkeeping should not fail the blob hash.** Accepted. → hashed field list and
  exclusions defined (design 5).
- **Preserve old results, version re-scores; two repetitions justify only stable/flaky.** Accepted (design 2, 4).
- **V33, V47, V1/V60, Copilot P4 folds.** Adopted (G8, G10, G9, G7).
- **Fold 67 → 24 + 35.** Adopted; `67-grader-hygiene-and-adversarial-fixtures.md` is a pointer.
- Rebutted: none.

### Gate record 2026-10-16, harvest phase G1/G2 (branch `v2.8-harvest-k11-k12`, commit `b8701973`, unmerged)

- **Matcher.** `src/utils/termPresent.ts`: NFKC, curly quotes and dashes folded, `term` (default: no letter or digit on either
  side) or `prefix` (the B2 word start). One helper for the self-test (`selfTest.ts`: names `bel`/`corin` are terms, topic
  stems `lantern`/`tunnel`/`debt`/`arm`/`wound` stay prefix) and all three live-suite scorers (`scoreContains`,
  `scoreRejected`, `scoreIntents`, which were word start, substring and substring). Per-needle mode in the fixture:
  `modes: {needle: "prefix"}` on a tier spec or intents claim, `mode` on a rejected entry; absent = term. G1 controls
  (`termPresent.test.ts`, `liveSuiteScore.test.mts`): `bel`/`below`, `arm`/`harm`, `don't`/`don’t`, `—`/`-` in term mode,
  `wound` in `wounded` in prefix mode: 5/5.
- **Inventory first** (`node scripts/debug/so-live-suite.mts inventory`, offline): 43 fixtures, 22 with a recorded live answer,
  84 needles: 11 term, 0 prefix-dependent, 0 substring-only, 10 absent, 63 unrecorded (the 14 intents fixtures and
  extractor23–29 have no recorded live answer). So no fixture needed a `prefix` mode and no fixture changed (the hash-frozen
  extractor23–29 untouched). Record `test/goldens/live/rescore/needle-inventory.json`. G1 inventory: complete.
- Advisory run over the hand-written goldens (`inventory test/goldens`, `needle-inventory-hand-goldens.json`): 2 needles are
  prefix-dependent there, `bandit` (extractor-intents02 intents) and `poison` (extractor24 epistemic, hash-frozen). Not
  changed: the plan's rule is the recorded live text, and extractor24 is frozen. **Design question**: declare both `prefix`
  before the next live run (and re-freeze extractor24's hash), or let the next live run's inventory decide.
- **Re-score with versions** (`node scripts/debug/so-live-suite.mts rescore`): 22 recorded fixtures re-scored under scorer v1
  and v2 (`SCORER_VERSION` 2), 0 changed verdicts, 21 unrecorded listed; written as a new record
  `test/goldens/live/rescore/scorer-v2.json` (the CLI refuses to overwrite a record); raw responses untouched. G2: complete,
  0 unlisted.
- Not built from this phase: G3–G10 (fixtures, compare, untouched proof, shipped blocks, fingerprints, compatibility rows).
- Gates: `npm run gates:quick` green; `npm run test:debug` 1318/1318 before commit.
- Full gates with the plan 69 items on the same branch: all green (plan 69 §Gate record 2026-10-16), Storybook 147/882.

### Gate record addendum 2026-10-16, owner decision on the two hand-golden needles (branch `v2.8-harvest-followup`, unmerged)

- `bandit` declared `prefix` in `test/fixtures/extractor-intents02.expected.json` (`modes`, Doran's claim; commit `619ffb6c`):
  that fixture is not hash-frozen. The hand-golden inventory now reads it as declared.
- `poison` left as a term in `extractor24.expected.json`: extractor23–29's expected files are hash-frozen by
  `scripts/debug/liveSuiteScore.test.mts` ("frozen as written before any live answer", v2.5 plan 05 F2), and adding a mode
  after seeing an answer would break that freeze. A miss on `poisoned` in a future live run is a scorer miss to record, not a
  reason to re-freeze.
- Gates: `npm run gates:quick` green; full gates green with the plan 69 addendum (plan 69 §Gate record addendum 2026-10-16).
