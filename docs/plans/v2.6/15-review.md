# Plan 15 Part A — review findings and fixes

Findings from the two Part A reviews (plan 15 §Part A). Under the user's amendment of 2026-09-30 (W29) every finding
is fixed right away; a finding that needs a user decision is asked here and the rest are fixed meanwhile.

## Review fixes CR-P (plans and test infrastructure, 2026-10-01)

Scope: the plan set's status and wording against the current truth (W26–W30), and the test infrastructure the plans
cite. CR-P10 is handled with CR-J22 by another agent and is not repeated here. No lane and no model call was used.

Current truth written into the plans:
- Plan 14 is executed by Claude (plan 15 Part B) and reviewed with the user on 2026-10-01; the user's own sessions are
  optional and later (**W26**, overview rule 6 amended).
- Harness: opencode only, no CLI logins (**W27**).
- Artemis on RunPod is the main model; DeepSeek runs the orchestrator passes (**W28**).
- Every review finding is fixed immediately (**W29**).
- The A11 wizard premises are chosen (**W30**).
- English only (W25).

| Id | Finding | Fix | Evidence |
|---|---|---|---|
| CR-P5 | `defect-replay-report.json` said 25 rows, the specs say 30; `decisions.mjs` hard-coded "25/25" and "342 files"; `pendingDecision` (extractor6–20) was stale | Re-ran `npm run test:replay -- --out test/findings/defect-replay-report.json` (**30 of 30 killed**) and committed the report. `decisions.mjs` derives the replay line from the report (killed/mutants, report date, spec count, and says STALE when they disagree) and the jest line from the inventory (file count, summed seconds). `pendingDecision` dropped from `suite-decisions.json` and its branch from `suiteDecisions.mjs` (no extractor fixture carries a vacuous needle any more). `13-decisions.md`, `13-inventory.md`, `13-final-suite.md` regenerated | `scripts/suite/decisions.mjs`, `scripts/lib/suiteDecisions.mjs` (+ test), `test/findings/defect-replay-report.json` |
| CR-P6 | Chapter surfaces missing from the player-clean sweep and the spoiler checklist | Ten rows added to the v2.1 spoiler checklist (player: "Your story", title card, "Previously…" popup, `/story chapters|chapter|chronicle` + macros, pipeline `complete`; both: chapter settings; author: Chapters panel, Studio Chapters editor and lanes, the story-so-far/bridge/returning prompt content, `/cp chapters|seal|unseal` and the jump confirm), plus the sweep's selectors and forbidden text (record ids, `degraded`/`author-edited`, `[src:`, OPEN dispositions). The `so-ui` selectors are another agent's change | `docs/plans/v2.1/test-plan.md` §Spoiler checklist |
| CR-P7 | The Q-M6 test rendered twice and sealed nothing | Removed from `memory/chapters.test.ts`; the new case drives the real `ChapterSeal` four times (arrival, camp, siege, final) and asserts chapter 1's record, SUMMARY included, is byte-identical | `src/runtime/chapterSaga.test.ts` "chronicle drift across later seals (v2.6 plan 07 Q-M6)" |
| CR-P8 | Plan 07 tasks 12, 13, 15, 17, 18 had no dedicated test | One describe each: story-so-far (composition; key/depth, off, paused), bridge (text; spent only on a rendered reply; withheld on quiet/impersonate), dossiers (history; re-enabled after the last seal, window), the interceptor fold (folded/kept/missing on copies; quiet, impersonate, fold off, block missing), endings (epilogue, bridge cleared, view ended, no seal after, export, pipeline `complete`, boundary work only compacts). Plan 07's gate table cites them | `src/runtime/chapterSaga.test.ts` (12 cases); `07-chapters-and-saga-memory.md` §What was built |
| CR-P9 | Plan 11 docs stale: harness route built, 28 edit tools not 24 | Status, A4, task 3, gate record and recipes updated (bridge.ts, opencode); tool count 28 with the four later tools named; `loop.test.ts` case renamed to "refuses the harness route when the plugin offers no transport, and never falls back to the local profile" | `11-agentic-wizard.md`, `src/copilot/agent/loop.test.ts` |
| CR-P11 | Plan status headers stale (03, 06, 11, 12, 00) and the CLAUDE.md row; plan 04 lines 10, 268, 391 | Every v2.6 header now states its real state (01, 03, 04, 06, 07, 09, 10, 11, 12, 13, 14 and 00); overview §Status is one row per plan (00–15); CLAUDE.md row covers plans 00–15 and Part A/Part B; plan 04's H row (built, opencode only), the C3/C4/C12/C13 evidence row (built after approval) and the Claude-login open item (dropped) fixed | `00-overview.md` §Status, `.claude/CLAUDE.md` |
| CR-P12 | Who plays, and when, disagreed across overview rule 6, plan 10 and plan 14 | Rule 6 rewritten ("Claude plays, the user reviews") and recorded as **W26**; plan 10 (title, status, change 0 and 5, the pack and sessions sections, verdict) and plan 14 (status, a "Who plays" block, rule 2) point to plan 15 Part B; plan 09 status and configuration line too | `00-overview.md` rule 6 + W26, `10-acceptance.md`, `14-tiered-testing.md`, `09-integration.md` |
| CR-P13 | Logins still asked for | Opencode only, no logins, everywhere: overview rule 6, the parallelism line, U2; plan 14 T6-3 and "Before T0"; the T6-3 card note in `charters.json` (cards regenerated); plan 04; plan 02-audit's H row; recorded as **W27** | `00-overview.md`, `14-tiered-testing.md`, `test/sessions/charters.json`, `14-cards.md` |
| CR-P14 / CR-P15 | Exit criteria needing human or blind ratings; the pack's timing; plan 11 W6 missing; T5's A1 inspector decision | Every such exit item reads "recorded for the user's review" (T2 Q-M, T3 C3 and C5/C6, T5 W6, T6 R4); the blind-rating pack is built from the recorded arms and goes to the joint review (overview rule 11, plan 10, plan 14 rule 8); 11 W6 added to the pack in all three; T5's "A1 inspector decision" removed (W18 decided it) and plan 10's HU-A1 row says so | `14-tiered-testing.md`, `10-acceptance.md`, `00-overview.md` rule 11 |
| CR-P16 | Plan 09 I1–I6 had no tier slot | Plan 14 T7 is now "Integration, freeze and cumulative run": I1–I6 first, before the freeze, with a runbook (adolion-fresh per run, `so-session start` on T1-1/T2-2/T7/T4-1 with the everything-on settings, the I4 storm, the I5 cuts with the profile restore, the I6 reopen check, findings into `09-findings.md`) | `14-tiered-testing.md` §T7, `09-integration.md` |
| CR-P17 | `architecture.md:89` said `judge.uses.*` all off | Now "all on by default since v2.6 rule 5" | `.claude/rules/architecture.md` |
| CR-P18 | Plans still describing per-plan live ×1 runs | Pointers to rule 13 at 06 §Gates, 07 §Gates, 04 §Gate, 05 §Gates, overview parallelism; also 11 §Gates and 12 §Gates (same wording) | those sections |
| CR-P19 | The run header did not record the campaign | `so-run-header` captures `campaign.pinCommit`/`pinBranch` (the adolion-fresh pin) and `campaign.installed.commit`/`sha256` (the lane's `adolion-fresh/inventory-latest.json`, null off an adolion-fresh lane); a missing or unreadable pin or inventory is a warning; the diff covers every field (a re-import at another commit is three blocking paths) | `scripts/debug/so-run-header.mts` `readCampaign`; `so-run-header.test.mts` (2 cases) |
| CR-P20 | Spanish remnants | `02-audit.md` rows (contradictions, lore-select, commit cases, needles, complications, curator, witness, house rules, player intent) state the English-only counts and drop the Spanish artifacts; overview J6a row (50 English lines); `12-survey.md` finding 8 (no Spanish floor; the column is history). `05-reasoning-control.md:154` was checked and holds no Spanish remnant (the live suite's `--expect-count 29` is the English fixture count) | those files |
| CR-P21 | No aggregate gate command; CI lacked `test:replay` | `npm run gates` (`scripts/release/gates.mjs`): typecheck, typecheck:test, lint, test, build, build:dev, test:debug, test:release, test:replay, test:plugin, test-storybook:ci, stopping at the first red step; `--no-storybook` / `--skip=` (an unknown step is refused). CI gains `test:replay` (`test:plugin` was already there). Rule 16 and CLAUDE.md name the command. `gates.test.mjs` pins the chain, the package scripts, CI coverage and rule 16's text | `scripts/release/gates.mjs` (+ test), `.github/workflows/ci.yml`, `scripts/release/ci.test.mjs` |
| CR-P22 | Duplicate-completion re-delivery and inner delayed-error untested; partial rows | New: extraction re-delivery through the real Extraction + Memory coordinators (fact stored once, same read id, the engine's ApplyQueue applies the duplicate once, control: two windows apply twice); stagecraft re-delivery as a second auto-accepted record (one host write, duplicate op `failed`); inner held rejection after the await; inner same-reply re-delivery (one beat); hostDeletes same deletion twice (one question, one delete). Fault matrix **102 → 106 covered, 15 → 11 partial**, 1 todo | `src/runtime/coordinators/duplicateCompletion.review.test.ts`, `stagecraftCoordinator.test.ts`, `innerCoordinator.test.ts`, `mirrorReaper.review.test.ts`; `test/findings/faultMatrix.json` |
| CR-P23 | `test:replay` ran only the named killers; the mutation baseline predated W25 | `npm run test:replay -- --full` runs the whole jest suite per mutant (baseline too; report `scope: "full"`); the default stays the named killers. The baseline sample re-ran after W25 (below) | `scripts/suite/defect-replay.mjs` `replayScope` (+ test in `suiteMutants.test.mjs`), `13-mutation-baseline.json` |
| CR-P24 | `identityVerbs.test.mts:303` waited on a real 300 ms timer; `test:release` failed from PowerShell | The branch case counts context reads instead of sleeping (it still fails if `branchCreate` stops polling). `versions.test.mjs` resolves Git Bash by path (`scripts/release/gitBash.mjs`: `GIT_BASH`, `git --exec-path`, Program Files), never the WSL `bash` PowerShell finds first; a test pins the candidate order | `scripts/debug/lib/identityVerbs.test.mts`, `scripts/release/gitBash.mjs`, `versions.test.mjs` |
| CR-P25 | `13-final-suite.md` did not say where the suite runs or restate the budget | The generator adds "Where it runs: plan 15 Part B": EUR 20 RunPod (EUR 1 margin, ≈ pod-hours at the measured pod price), DeepSeek per token outside it, lane-hours vs pod-hours at `LLM_PARALLEL` 2, whether the list ×2 fits beside the sessions, and the priority order (T0, the waiting measurements, the tier passes, I1–I6, the built rows ×2, placeholders); anything unrun is listed as "not run: budget" | `scripts/suite/decisions.mjs`, `suite-decisions.json` `partB`, `13-final-suite.md` |
| CR-P26 | `blobUnreadable.review.test.ts:124` title said v5 | Fixed in this commit (title only) | `src/runtime/blobUnreadable.review.test.ts` |

### Fault-matrix rows still partial (11) and todo (1), with the reason each stays

| Cell | Why it is not covered by a cheap test |
|---|---|
| memory\|afterHostWrite | The mirror's mid-sync fault is a chat change; a host write that errors halfway needs a host double for `upsertWIEntry` that fails on the n-th entry and a rollback contract for the entries already written, which does not exist yet |
| scene\|malformedResponse | A wrong-typed scene answer goes through the judge client's validation (`src/judge/`), which another agent owns this round |
| scene\|duplicateCompletion | The scene read's completion lands through `SceneCoordinator.rerun`, which has no re-delivery seam a test can drive without a judge double; covered for the injection (once) |
| lore\|malformedResponse | Same as scene: the unparseable answer is the judge client's case (judge owner) |
| expansion\|duplicateCompletion | A re-delivered chain needs the expansion cache's contract stamp and merge path in one harness; the concurrent-generation half is covered |
| persistence\|afterHostWrite | A save that fails after the host wrote part of the chat cannot be faked below `saveMetadata`, which swallows its own errors; the save evidence covers the observable half |
| effects\|delayedError | Covered except a host write that rejects after a slow await mid-apply; the ledger and refusal paths are covered |
| effects\|aborted | v2.5 C1: the stop runs inside `CHAT_CHANGED`; only a live run shows whether the populated next chat is untouched (plan 14 T4) |
| wiNormalize\|persistFailure | The lost-provenance case is a design gap (no second ledger), not a missing test |
| harnessTransport\|delayedSuccess | The caller's `RunOwnership` decides the write, and that half is the agent bridge's census row |
| agentBridge\|afterHostWrite | Re-offering a provisioning card after the draft run lapsed is not built |
| harnessTransport\|worldSwitched (todo) | The late call is recorded in the open chat's ring (telemetry); pinning that behaviour would bless it, so it waits for the owner's call on whether the ring should drop it |

### Observed while writing CR-P22 (not fixed here: product code outside this change's scope)

- **The extraction audit ring keeps a re-delivered read twice** (`ExtractionCoordinator.applyAudit` appends `audit` to
  `extras.extraction.audits` without checking its id). Nothing is applied twice (memory dedupes the window, the engine
  supersedes the covered write), so it is telemetry only, but the journal and the author's audit list show the read
  twice. Fix belongs to the extraction coordinator's owner: skip an audit whose id is already in the ring.

### Mutation baseline after W25 (CR-P23)

MUTATION_RESULT

### Gates

GATES_RESULT
