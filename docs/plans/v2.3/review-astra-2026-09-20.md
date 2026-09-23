# Peer review of the v2.3 plan set — Astra, 2026-09-20

The plan set was handed to the review's lead author (GPT "astra", via Codex CLI `codex exec`,
model `gpt-6-astra`, read-only sandbox, HEAD `9561bac`) with nine questions: traceability, the
two narrowed claims, the closing mechanism, sequencing, every playbook recipe, the P0 baseline,
the contract changes, what the roadmap asked for that no plan carries, and under-scoping risk.
The full verdict is reproduced below, unedited. Above it: what Claude verified against source
before applying the edits, and the disposition of each.

**Overall verdict: ACCEPT WITH CHANGES.** The three changes Astra ranked highest, and what the
plan set now says:

1. *Replace the marker-count ledger with explicit finding ownership and evidence requirements.*
   Applied: plan 01 §A is now an id-keyed ledger with one owner, an expected failure reason, a
   positive control and an evidence type (`jest | live | human`) per finding; R6/R7/E1 get
   rewritten contract tests instead of marker flips; the count is generated, not quoted.
2. *Specify rollback, provenance, host-effect restoration and migration together before
   implementation.* Applied: plan 04 gains a shared persisted-schema section with plan 05, an
   explicit `historyFrom` horizon, dependency reversal for derived artifacts, and a closure
   dependency on plan 06; plan 06's ledger is write-ahead with stable targets and compare-and-set
   restoration, and "await saveMetadata" is no longer accepted as durability evidence.
3. *Replace the universal P0 comparison with controlled, independently falsifiable recipes.*
   Applied: the playbook's one-variable rule became a per-experiment baseline with declared
   expected differences and a positive-activation prerequisite; P0 is a characterization run
   whose watch table is observer-only, not the v2.2 judge-on player session and not a causal
   baseline.

## Verification of Astra's factual claims (Claude, same day)

Every claim below was checked against the tree before any plan was edited. All hold.

| Claim | Where | Result |
|---|---|---|
| `so-journey` has no `--group` CLI flag | `scripts/debug/so-journey.mts:502–509` | confirmed: `strict/keep/only/allowConfig` only; the group comes from `setup.group` |
| `so-state --expect x=undefined` compares against the string `"undefined"` | `so-state.mts` `parseExpectedValue` | confirmed: `true/false/null/number` only |
| `two-ways-across` has no stub or expansion | `scripts/review/fixtures/two-ways-across.story.json:7–18` | confirmed: four authored transitions, zero `stub`/`expansion` |
| Both Adolion stories require `Adolion World` and allow curator writes only to `Adolion Chronicle` | both story JSONs `requirements.lorebooks`, `stagecraft.lorebooks` | confirmed: the "different lorebook sets" claim in plan 03 was false |
| Lore-select needs a story-declared `lore_select` scope | `src/runtime/loreSelect.ts:34–44` | confirmed |
| `so-judge calibrate --model` does not exist | `so-judge.mts` | confirmed: `model` appears only in the report |
| `so-scenario --group` applies only with `--sandbox` | `so-scenario.mts:892–896` | confirmed |
| `st-payload watch N` prints captures from index 0, including old ones | `st-payload.mts` `watchPayloads` | confirmed |
| A title-only story edit classifies as compatible | `src/engine/storyDiff.ts:229` | confirmed (`text-changed`, compatible) |
| The rebuilt world book has 264 entries, not 146 | `C:\dev\adolion-campaign\INTEGRATION.md:149` | confirmed |
| S10 detection already exists | `so-journey.mts:243–254` | confirmed (`integrity check failed` and `Welcome back` are refused dialogs) |
| Director latency is already recorded | `src/runtime/judge.ts:119` (`latencyMs`) | confirmed |
| J0.3 is capability-guarded and reports `blocked`, never throws | `test/journeys/selftest.journey.json:90–100` | confirmed: plan 01's "J0.3 throw reported as fail" was wrong |
| `saveMetadata` → `saveChatConditional` swallows errors and returns normally | ST `public/script.js:9408–9440` | confirmed: `catch { console.error }`, `finally` |
| Contradiction is a score penalty, not exclusion | `src/memory/score.ts` (`- weights.contradiction`), `budget.ts` | confirmed |
| R6 harness evidence is `"crossed"` (7 chars) and asserts only zero accepted deltas | `scripts/review/reviewRegression.test.ts` | confirmed: a 12-char evidence rule would close it for the wrong reason |
| E1 harness asserts a successful rollback to boundary 0 | `scripts/review/memory-engine.test.ts:160–164` | confirmed: conflicts with plan 04's explicit `unavailable` outcome |
| Bridge/ferry scenarios hard-code `profileId:'so-review-artemis', cadence:0` | `scripts/review/fixtures/live-two-ways-bridge.json:113` | confirmed |
| Two journey processes attach to the same page and share `.debug` artifact names | `scripts/debug/lib/connection.mts:107–111`, `so-journey.mts:17–21` | confirmed: not concurrent runtime load |
| J11 toggles the judge inside its checks | `test/journeys/j11-judgment-backend.journey.json` | confirmed |

## Dispositions

| Astra edit | Disposition |
|---|---|
| 1 Ledger by id with owner, reason, controls, evidence types; adapt R6/R7/E1; fix counts and J0 | applied (plan 01 §A, §D, Verification) |
| 2 Plan 04 horizon, schema, dependency reversal, compaction | applied (plan 04 new §Shared persisted schema, §Engine history, §Dependent artifacts) |
| 3 Plan 06 stable targets, compare-and-set, write-ahead status, real save evidence | applied (plan 06 §Owned-effect ledger, §Save acknowledgment) |
| 4 Plan 05 envelope fields, hard conflict exclusion, legacy/lock rollback | applied |
| 5 Overview: tooling before P0, closure dependencies, F1 to 02, disposition rows | applied; sequence is now 01 → 03 → 02 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 |
| 6 Playbook per-experiment baselines and the per-recipe corrections | applied (file rewritten) |
| 7 Plan 07 generated fixture, refusal recovery, precedence | applied |
| 8 Plan 03 window semantics, coverage beyond coordinators, cleanup, blob readiness | applied |
| 9 Plan 02 span semantics, durable grants, popup and enum fixtures | applied |
| 10 Presets: one decision | applied: chat-completion is **diagnosed unsupported** in v2.3; the OpenAI adapter is a v2.4 seed |
| 11 Plan 08 hashes, attestation, campaign install parameterization | applied |
| 12 Plan 10 §B moves earlier; canon drafts; metrics; `--model` | applied (§B split into plans 02 and 05; canon drafts added to the spike table) |
| 13 Plan 11 J0 gate, per-check config, isolated sessions, P0 vs matched replays, refreshed recommendations | applied |

Two places where Claude kept its wording after reading Astra's objection:

- **Toastr (Q2a).** Astra accepts "does not reproduce in this installed tree" and asks for the
  reproduction on identical bytes under both host layouts. That is what plan 08 already
  specifies; the overview sentence now says "environment-bound *until plan 08 reproduces it on
  identical bytes*" instead of presenting the vendoring as the explanation.
- **M6 (Q2b).** Astra agrees, and notes the overview overstated the disagreement with the
  review. The overview now cites the review's own sentence rather than calling it a narrowing.

---

## Astra's verdict (verbatim)

Overall: **ACCEPT WITH CHANGES** — the objectives stand; several closure gates do not.
Reviewed source: **9561bac74d084e1b7db665f454d459f3f1e6af20** and the supplied plan files.
Read-only review; no files modified and no tests or live sessions run.
**Change 1:** replace the marker-count ledger with explicit finding ownership and evidence requirements.
**Change 2:** specify rollback, provenance, host-effect restoration and migration together before implementation.
**Change 3:** replace the universal P0 comparison with controlled, independently falsifiable recipes.
The numbered findings are broadly covered, but F1 is double-owned and several remedies are incomplete.
I accept the M6 interpretation; I only partly accept the toastr narrowing.
P0 is useful characterization, not a causal baseline or completed v2.2 judge-on evaluation.
Do not approve implementation against the current acceptance wording.

### Q1. Traceability — PARTIAL

- **F1 is explicitly double-owned:** `00-overview.md:191` says "02 + 01." Make 02 accountable for product reliability; 01 supplies retry/reporting infrastructure. Four eventual passes with retries do not establish that the post-repair failure rate improved.
- **F5 disappears from the final findings register**, although the handover and plan 10 cover it. R3/F6 also disappear there. Retain explicit closed/by-design/conditional rows rather than relying on another table.
- **R4/E1 remedy is incomplete:** `04:68–69` clears unknown-history status after the first new boundary. One boundary cannot reconstruct unavailable older history. My remedy required an explicit historical limit, not a temporary boolean (`findings.md:31`).
- **C3 remedy is internally wrong:** `05:92–93` promises conflicted records cannot steer, then merely ranks them as `contradicted`. Current contradiction handling is a score penalty, not exclusion (`src/memory/score.ts:70–86`; `budget.ts:38–40`).
- **C4 lacks the promised recovery choice:** a neutral waiting sentence (`07:75–76`) does not supply an authored alternative or author recovery action (`v2.2-integration-review.md:250–260`).
- **T5 is only partly closed:** `01:119–123` adds tier reporting but specifies no independently binding tier thresholds. My audit expressly required them (`test-credibility.md:66`).

### Q2. The narrowed claims — PARTIAL

**(a) Toastr: PARTIAL.** I accept "does not reproduce in this installed tree." I disagree with treating vendored host interfaces as the explanation or exoneration. The archived failure is concrete: `evidence/typecheck.log:5–8` reports the intersection with `ToastrDisplayMethod`. Current `tsconfig.json` still has no ambient `types` restriction; `global.d.ts:32–37` declares `Window.toastr`; `slashCommands.ts:19–20` still assigns functions returning `undefined`. `hostTypes.ts` does not prevent ancestor ambient declarations from merging. Settle it with identical extension bytes beneath both the failing host dependency layout and the claimed supported clean host, recording resolved type files, lockfiles and compiler version.

**(b) M6: AGREE.** This is already the lead review's wording: "It does **not** demonstrate disclosure to another character or a human data leak." (`findings.md:73`). Calling this a correction to the lead review overstates the disagreement.

### Q3. Closing mechanism — PARTIAL

Jest supports the mechanism (`jest-circus` fails a passing `.failing` test; `--runInBand` and `diagnostics:false` do not change that). The proposed ledger is insufficient: any test-body exception qualifies, so setup and negative controls must prove the intended failure reason; R6 can close for the wrong reason (its evidence is `"crossed"`, seven characters); E1 demands a successful rollback to boundary zero while plan 04 permits explicit unavailability; R7 expects an escaped string while plan 02 returns structured data; the count of nineteen is the pre-R12 R/M/E subtotal, not all open findings; tests are excluded from typecheck and lint (`tsconfig.json:33`; `package.json:20`); a source-count guard cannot prove a test was discovered, executed or unskipped. C4's human agency outcome, popup execution, final host payload privacy, clean-host installation and human UX acceptance cannot be closed by Jest proxies alone.

### Q4. Sequencing — DISAGREE

02 requires request-window revision validation (`02:67–69`) supplied by 03. 04 claims rollback equivalence while deferring pin validity to 05 and missing-effect restoration to 06. 06 contains prerequisites for 04's durable cross-store claim. 10B (source/instruction separation, dependent typed value/evidence) is correctness work belonging with 02/05. 09/10 depend backward on 11's human evaluation. P0 invokes `so-run-header` and `so-journal follow` before 01 builds them. 03 adds persisted fields before 04's migration. Inherited conventions require same-plan documentation updates.

### Q5. Playbook — DISAGREE

The universal "one variable" rule is contradicted by the recipes themselves. Per recipe: 01 — journeys create stories and chats, so the header diff is never empty; `so-journey --group` is not implemented; J12 must distinguish cadence from authored trigger reads. 02 — `/sendas` cannot guarantee an out-of-scope response; `bb.entered_mines=undefined` compares a string; `lastAudit` is a CLI projection; a title-only edit is compatible and may never open the popup; the v6 story has one placeholder, not five. 03 — both stories share `Adolion World` and `Adolion Chronicle`; neither declares `lore_select`; require started calls, equal indices, a release barrier, distinct sentinels; one timeout does not meet a two-failure stale threshold. 04 — seed the superseded fact and two rewrites; define the corrected suffix; hash equality; `reload` already exists. 05 — captures happen before the edit and never after; "warden never flags" passes when the warden never ran. 06 — `--group` needs `--sandbox`; preset expectations contradict the OpenAI adapter; killing the model backend does not fail metadata persistence; `st-payload watch 2` prints old captures. 07 — the R9 recipe is vacuous (no generated branch in `two-ways-across`); `the-lord-spirit`'s only exit accepts `destroyed/appeased`. 08 — the campaign installer hardcodes port 8000 and the group ids belong to the existing install; the world book has 264 entries. 09 — `road-to-wendhope` leaves three speakers; P0 is judge-off so the stale-scene test needs its own baseline; `st-payload last` needs a newly armed capture. 10 — mentioning Belle/Dalan activates their keyword entries without the judge; `so-judge calibrate --model` is not implemented. 11 — J11 toggles judge configuration inside checks; two journey processes share one page and one artifact path.

### Q6. P0 baseline — PARTIAL

Keep an observational pre-fix run; reject its status as the universal comparison. Final play changes code and configuration; free play changes transcript, timing, outputs and route; the watch table tells the player which hidden qualities to produce; refusing both spirit outcomes can prevent completing all fourteen anchors; judge-off P0 cannot satisfy the v2.2 judge-on player rubric. Record additionally: raw transcript, message/swipe revisions, timestamps, every manual intervention; per-read window, trigger, scope, raw response, rejection and application boundary; payload/request ids, drafted speaker, model/template/sampler settings, asset hashes; persisted blobs and host before/after state; first-attempt failures, retries, latency/cost, checkpoints not reached.

### Q7. Contract changes — PARTIAL

No entire contract category is unjustified; every row traces to the roadmap or the integration review. Several defaults are: twelve-character evidence matching (new, rejects legitimate short evidence); the explicit grant contradicts the addendum's ledger-only wording; "until first new boundary" is unjustified; the provenance envelope omits source revision, blackboard provenance and multi-input dependencies; host restoration needs target identity, conflict handling and durable status; the generation cache jumps from review states to inserted; agency "absent = today" conflicts with conservative defaults; `player_summary` is assigned to plan 09, which postpones it to 11.

### Q8. Missing — PARTIAL

Derived-history reversal (exclusion, duplicate confirmation, folded memory, summary dependencies, canon lineage); the unknown-history boundary and compaction alignment (five versions per key can destroy rollback inside the 200-boundary window); host acknowledgment (the host catches save errors and returns normally, `script.js:9408`); compare-and-set restoration for all shared effects; bounded extraction responses; binding per-tier floors; theme, zoom and assistive-technology coverage; canon regeneration drafts; refreshed recommendations after final evidence. Also: S10 protection already exists (`so-journey.mts:243–254`); director latency already exists (`runtime/judge.ts:119`); J0.3 is capability-guarded and cannot throw.

### Q9. Under-scoping risk — PARTIAL

Highest first: 04, 06, 05, 03, 01, 10, 07, 11, 09, 08, 02. Expand 04, 06 and 05 first; their missing semantics determine whether later tests can assert anything meaningful.

### Concrete edits, ordered by importance

1. `01-evidence-hardening.md` §A/Verification: id-based ledger with one owner, executed test ids, expected failure reasons, positive controls, separate live/human evidence; adapt R6/R7/E1; fix counts and J0.
2. `04-rollback-invariant.md`: recoverable intervals, non-recursive snapshot/journal schema, unavailable-history behaviour, dependency reversal; remove "until first new boundary"; align compaction horizons.
3. `06-host-integration.md`: stable targets, compare-and-set restoration, partial-write status, crash recovery; replace "await saveMetadata" as proof.
4. `05-provenance-and-pins.md`: source revisions, blackboard provenance, dependency references; conflicts ineligible for injection; legacy unknown provenance; lock/manual-fact rollback.
5. `00-overview.md`: observational tooling before P0; cross-plan closure dependencies; F1 to 02; R3/F5/F6 disposition rows.
6. `live-gate-playbook.md`: per-experiment baselines, positive activation prerequisites, request/state assertions, explicit expected differences.
7. `07-generated-branching-and-agency.md`: a generated multi-outcome story; `two-ways-across` as authored-branch regression only; refusal recovery and precedence tests.
8. `03-async-ownership.md`: source-window invalidation vs appends; writes outside coordinators and catch/finally paths; old-task cleanup must not clear new-chat state; legacy-blob readiness.
9. `02-input-authority.md`: tested span semantics instead of an evidence-length rule; durable explicit grants; invalidating-popup and historical-enum fixtures.
10. Presets: choose OpenAI support or diagnosed unsupported; keep a dedicated preset fixture.
11. `08-release-reproducibility.md`: source and bundle hashes, not commit ancestry; separate build manifest from acceptance attestation; parameterize campaign installation and create fresh groups.
12. `10-judge-seeds.md`: move structural correctness work earlier; add or defer canon drafts; define ranking metrics; implement the model-selection flag.
13. `11-acceptance.md`: J0 expected-outcome gate; per-check judge configuration; isolated browser sessions and artifact paths; P0 characterization vs matched comparisons; refresh recommendations from final evidence.
