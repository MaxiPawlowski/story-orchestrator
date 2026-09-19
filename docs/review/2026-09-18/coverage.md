# Coverage and verification ledger

Statuses: **implemented** means a code path exists; **partial** means part of the stated contract is absent or contradicted; **planned** is design only. Evidence strength is separate: **unit**, **reproduction**, **component browser**, **live**, or **source only**. A passing unit/component check does not imply a passing user journey.

## Capability traceability

Source/test paths are relative to the preserved source archive. Live outcomes and their attempt numbers are in live-review.md. The [per-file ledger](evidence/file-coverage.csv) accounts for every inventoried file without claiming that all files received a line-by-line audit.

| Promised capability / intent | Implementation and UI | Existing verification | This review / status |
|---|---|---|---|
| Typed bool/int/float/string/enum qualities | `engine/schema.ts`, `validate.ts`, `blackboard.ts`; QualityEditor | engine, exampleStory, gateOptions tests | Implemented; type/source distinction fails at extractor ingress R5. |
| Gates, priorities and declaration-order selection | `engine/gates.ts`, `engine.ts`; gate/transition editors | engine and convergence property suites | Implemented; original tests pass; independent 1,000-node traversal passes. |
| Latches and monotonic state | blackboard, validation, generation latch guard | engine, latchGuard | Implemented; source authority must be enforced before latch logic. |
| One transition per boundary | engine, TurnBridge | engine, turnBridge, pipeline | Implemented within engine; lifecycle/concurrency gaps R1; timing-based host dedup fails R10/R11. |
| Reachability / scope previews | validate, extraction/scope, scopeExplain; Studio | scopeExplain, qualityUsage, diagnostics | Implemented; large linear graph measured; worst-case wide/cyclic graphs unmeasured. |
| Convergence progress independent of model | engine/convergence, generation critic/revalidate | 1,000-case property tests | Partial: arithmetic controls pass, R5 allows false source authority, R9 drops paths. |
| Background generated intermediates branch | generation parse/merge/planner; expansion diagnostics | generation, convergence | Partial: R9 reproduced loss of valid alternate outcome. |
| Generator hard checks and critic | generation/generate, critic, revalidate | generation and latch guard | Implemented checks; critic is advisory/needs-review path, not proof of all-path validity. |
| Stale/failed expansion recovery | expansionCoordinator, cache; author controls | generation/runtime tests | Partial; manual regeneration documented, no automatic reliability claim. |
| Serialized queue and overlap suppression | engine/applyQueue | engine/extraction tests | Implemented within instance; current revision not proven by stored version sum alone. |
| Priority/cadence/retry/backpressure | extraction/scheduler; queue diagnostics | scheduler suite | Implemented; source reviewed; missing cancellation/owner checks R1. |
| Off-path shared extraction | extraction/contract, client, sharedRead; profile settings | extraction, parse, fixture goldens | Implemented; R5/R6 validation gaps; live Artemis evidence separate. |
| Evidence-backed deltas | extraction/parse and audit | parse/reconcile | Partial: requires evidence text, does not validate its source span. |
| Targeted reconciliation | extraction/reconcile; stall indicators | reconcile/runtime | Implemented scheduling; matching request ownership/evidence requires hardening. |
| Scene detection | memory/sceneDetect, extractionCoordinator | sceneDetect | Implemented heuristic and confirmation; session cursor lifecycle inspected, needs switch coverage. |
| Malformed/reasoning output handling | extraction/client, parse; self-test | parse, selfTest | Implemented fixture robustness; current parser drift separately retested. Self-test false certification reproduced in R12. |
| Facts/session/short-term/scene memory | memory/stores, inject, coordinators; Memory panel | stores/inject/longFixture | Implemented tiers; rollback provenance partial M1/M2. |
| Deduplication and supersession | memory/similarity, consolidate, supersede | corresponding suites | Partial: old validity not reversed M1; pin conflict M5. |
| Canon and arcs | memory/canon, arcs; narrative/author panels | canon, arcs, narrative | Implemented derivation; downstream provenance/rebuild must follow rollback. Live narrative quality open. |
| Epistemic/private knowledge | memory/epistemic, inject; group drafted hook | epistemic/inject | Implemented filtering; M4/M6 validity gaps; actual speaker request verification delegated live. |
| Ledger and relationships | memory/ledger, format bridges | ledger/runtime | Partial: overwrite loses prior values M3. |
| Pin/edit/exclude/expiry | stores/consolidate; Memory controls | stores/consolidate | Implemented controls; pin semantics conflict M5/M6, edited token cost M7. |
| Bounded injection / scoring | budget/score/inject; diagnostics | budget/score/inject | Partial: estimated/cached controls pass, manual edit invalidation fails. |
| Long session behavior | engine history and memory caps | longFixture/properties | Partial: 205-boundary ancient mutation fails E1; large graph passes. |
| EMA and dramatic shapes | pacing + pacingCoordinator; settings/HUD | pacing suite | Implemented arithmetic; narrative effect subjective and not proven by tests. |
| Story identity / pinned versions | storyLibrary, storySelection, storyUpdate | storyIdentity/storyDiff/storyUpdate | Implemented improvement; reload history R4 and popup rendering R7. |
| Migration of older metadata | persistenceMigration | migration tests | Unit paths pass; live pre-v2.1 fixture gated by journey results. |
| Selection/restart/deletion | selection/persistence; settings and drawer | storyIdentity/runtime | Implemented current-state behavior; retention five, history limits disclosed as gap. |
| Hot-swap invalidating edits | storyDiff/prune/update; choice popup | storyUpdate | Implemented choices; rollback after hydrate and unsafe HTML need correction. |
| Studio graph and schema authoring | studio editors, mutations, draft, io | studio suites; Storybook | Broad format coverage implemented; real end-to-end author workflow separate. |
| Wizard interview/proposals | copilot + wizard; StudioCopilot/ProposalReview | authoring/proposal/provisioning; Storybook | Implemented staged model workflow; fixture questions do not establish model reliability. |
| Provision cards/books/groups | stHost/provisioning + copilotCoordinator | provisioning | Partial create-only promise: R8 dependency/ownership conflation. |
| Player/author separation | drawer/HUD/settings, snapshot/narrative | narrative; J3 selector/content audit | Implemented interface separation; authored text can still contain spoilers, needs editorial contract. |
| Author manual controls / macros / slash | runtime/slashCommands, macros | corresponding suites | Implemented; host lifecycle compatibility and cleanup remain source/live checks. |
| Background checkpoint effect | effectsApplier + stHost/backgrounds | Stagecraft/effects tests | Implemented; actual host effect verification delegated live. |
| WI curator | stagecraft + coordinator; Stagecraft panel | stagecraft/coordinator | Partial: R1/R2/R3; off by default and allowlist are useful safeguards. |
| Stagecraft agent fleet | plan 07 designs | no implemented fleet gate | Planned; scene-setter/cast tuning/continuity warden not counted as shipped. |
| Author Note and preset effects | effectsApplier; stHost adapters | effectsApplier | Implemented baseline role omission and text-completion-only preset limitation. |
| Cast / NPC replies / group direction | roster, talkControl, effects | talkControl/talk/effects | Implemented deterministic/model paths; exact live payload/event semantics require live evidence. |
| Prompt insertion and clearing | stHost/extensionPrompts; injection registry | extensionPrompts/injectionRegistry | Unit passes; coexistence and final network payload are separate gates. |
| Host events / interceptors / cleanup | TurnBridge/runtime/index/stHost | turnBridge/talkControl | Partial lifecycle; inspect session ownership and listener cleanup R1. |
| Connection profile request API | stHost/connectionProfiles | mostly mocks in unit tests | Real Artemis connection exercised; cold/restart/concurrency status in live report. |
| Persistence errors and recovery | runtime/persistence and host saveMetadata | happy-path mocks dominate | Source reviewed: host save helper can catch/log errors; durable acknowledgment/fault injection still needed. |
| Installation and bundles | package/lock/config/manifest/dist | clean installation, typecheck/build | Partial: ambient type collision; contained-type workaround for review, not a production fix. |
| Diagnostics and journals | journal/snapshotBuilder/liveSuite | journal/liveSuite/J journeys | Implemented useful evidence; captured extension blocks are not always the complete host request. |
| UI layouts/accessibility | components/studio/settings/HUD | Storybook interaction+axe | 24 responsive views pass overflow probe; tab keyboard gap; full theme/zoom/assistive-tech coverage open. |
| Adapted vendor algorithms | vendor/smart-memory and first-party memory | vendor fixtures; memory tests | Relevant supersession/token-budget paths compared by Sol; vendor not assumed to meet new rollback contract. |

## Baseline commands and outcomes

All commands ran under the isolated copy. [Initial check summary](evidence/checks-initial.json) preserves the dependency-cache failure; [clean summary](evidence/checks-clean.json) is the actual baseline after reinstall. Initial cascading failures caused by missing packages are not product defects.

| Command | Result | Evidence / limitation |
|---|---|---|
| Host and extension `npm ci --no-audit --no-fund` | Pass on retry with isolated npm cache | Initial cache ENOENT preserved in summary; not a lockfile determinism failure. |
| `npm run typecheck` | Fail | `typecheck.log`: TS2322 Toastr fallback conflict with ancestor host ambient types. |
| `npm run lint` | Pass | `lint.log`. |
| `npm run debug:typecheck` | Pass | `debug-typecheck.log`. |
| `npm test` | Pass 60 / 1,589 | `test.log`; most host/model seams are mocked. |
| `npm run build` | Fail | `build.log`, same ambient type error. |
| Review `tsconfig.review.json` / `webpack.review.cjs` | Pass typecheck and production bundle | `typecheck-contained.log`, `build-contained.log`; local typeRoots, unchanged production source. Not a pass for original build configuration. |
| `npm run test-storybook:ci` | Invocation fail | `test-storybook-ci.log`; nested Storybook executable not resolved. |
| Direct Storybook build CLI | Pass | `storybook-direct-build.log`. |
| Direct test-runner CLI against port 16006 | Pass 26 / 107 | `storybook-direct-test.log`; axe checks configured root; color contrast globally disabled; host API mocked. |
| Root review harness | 9 fail / 4 controls pass | `reproductions.json`, `.log`. |
| Sol memory/engine harness | 8 fail / 6 controls pass | `memory-engine-jest.txt`; exact pure operations and specified contracts. |
| Sol existing focused and long/property suites | 79 and 1,006 pass | Controls overlap the original 1,589; do not add totals as independent test count. |
| Current-source comparison | R3 fixed; other R and M/E failures persist | `current-comparison.md`, hashes and JSON evidence. |
| Responsive browser script | 24 observations, no horizontal overflow/errors | `ui/responsive.json` plus screenshots; no general WCAG claim. |
| Keyboard/HTML marker/text scaling | Tab navigation gap; benign marker executes | `ui/interaction.json`; independent blank page for markup, Storybook mock for close. |

The direct CLIs were `node node_modules/storybook/bin/index.cjs build --output-dir .sb-static --disable-telemetry` and `node node_modules/@storybook/test-runner/dist/test-storybook.js --url http://127.0.0.1:16006 --maxWorkers 1`. An initial wrong test-runner path was a review harness error and corrected. The contained webpack configuration changes type checking only; it is not included in the reviewed production source.

## Evidence boundaries and closure

Strict live journeys/features, intentionally failing runner self-test, backend restart/autoload, concurrent model demand and any additional live failures are accounted for in live-review.md. A run blocked by a broken UI action remains blocked/failed; retries are separate attempts. Do not turn missing capability checks or skipped human judgments green.

This review identifies and substantiates release blockers even where later live gates are blocked. A full ship-readiness acceptance still requires all unexecuted/unclosed cells in the live report, fault-injected persistence/coexistence checks, multiple supported host versions, theme/real-browser zoom/assistive-tech coverage, independent long-form roleplay and unfamiliar-player/author validation. The review does not claim those passed.

See [test-credibility.md](test-credibility.md) for the closed-schema assertion gap, false operation return handling, strict-mode skip/cleanup semantics, incomplete live-fixture scoring and permissive model self-test grading. These are separate from product correctness failures.


Supplementary root harnesses: event deduplication 2 expected failures/2 controls (	urn-boundary.json); semantic model self-test grading 1 expected failure/2 controls (selftest-grading.json). The independent Two Ways Across fixture validates both authored routes and convergence (2 passing tests, independent-story.log); its real-model runs belong to the live report. These are separate from the 13-test current-source comparison.

