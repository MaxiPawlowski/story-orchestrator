# Production-readiness criteria — v2.5 acceptance (proposal, 2026-09-25)

**Status: PROPOSAL, awaiting the user.** Source: `code-health-audit.md` (same directory), measured on master `1b4e642`.
The legacy/compat inventory runs separately, and its criterion (P1) only points at it.
The v2.3/v2.4 rule applies: each threshold is **predeclared here and never retuned to pass**. A row that cannot be met is
recorded as a deferral the user signs off, never loosened.

"Prod ready" = a SillyTavern user can install, run, update and uninstall the extension from a release artifact. The artifact
has no debug surface and no dev leftovers. Its data egress is disclosed, and the code meets the guards below without any
budget being raised.

## Checklist

| # | Criterion | Threshold (today → target) | Verified by |
|---|---|---|---|
| **Release and install** | | | |
| R1 | Install without a toolchain | `npm` required → **0 manual build steps**. ST's "Install extension" on the release URL/branch loads the extension on a clean ST 1.19.x | `clean-host` variant that installs from the **release artifact** (not the repo) and runs one live journey; archived record |
| R2 | Update path | `auto_update: true` with untracked `dist/` → the update source carries the built bundle for the same version | install N, update to N+1 on a clean host; `dist/manifest.json` `bundle.sha256` matches the release's |
| R3 | Artifact allowlist | whole repo (20.6 MiB pack, `.debug` 245 MB served) → artifact = `manifest.json`, `dist/**` (current build only), `LICENSE`, `README.md`, `CHANGELOG.md`, `examples/**`, `server-plugin/**`. No `docs/plans`, `test/`, `scripts/`, `.claude/`, `.debug/` or source maps | packaging script plus a `test:release` case that lists the artifact against the allowlist |
| R4 | One version everywhere | 2.3.0 while v2.4 is on master → `package.json` = `manifest.json` = `dist/manifest.json` = top `CHANGELOG.md` heading = git tag `v2.5.0` | `test:release` assertion |
| R5 | Declared host support | `minimum_client_version 1.18.0`, never played → minimum = the oldest ST version that ran the **full** acceptance. README states a support policy (e.g. "latest ST release + previous, re-verified per release") | README text plus the clean-host record for each claimed version |
| R6 | Clean `dist/` | stale 4.4 MB map and 2025 chunks → `output.clean: true`. No source map in the artifact, or one that is current | `test:release` checks every file in `dist/` against `dist/manifest.json` |
| **Debug surface** | | | |
| D1 | No debug-response globals in prod | 12 `storyOrchestratorDebug*` read on live paths → **0 occurrences in the prod `dist/index.js`** (build-time flag or a separate debug module) | grep on the built bundle in `test:release`; harness still green on a dev build |
| D2 | Debug handles gated | 22 `storyOrchestrator*` globals → prod exposes **only** what the host needs (`talkControlInterceptor`) plus at most one documented, read-only handle. Debug scripts need a dev build or an explicit opt-in | bundle grep allowlist; `npm run test:debug` against a dev build |
| D3 | Measurement code out of the bundle | ~82 KB source (`liveSuite`, `*Calibration`, `selfTestCases`, `createCandidate`) reachable → 0 of those modules in the prod entry graph | import-graph guard (TS-API script as a jest guard, like `architecture.test.ts`) |
| D4 | No UI links into internal docs | `JudgeSettingsGroup.tsx:124` → `docs/plans/…` becomes 0 hrefs into `docs/plans` | grep guard over `src/**/*.tsx` |
| **Structure and budgets** | | | |
| S1 | Legacy paths removed | per the separate legacy inventory → **0 rows open** | that inventory's own guard |
| S2 | Guarded budgets met by extraction, not raising (V4) | manager 736/740 → **≤ 700**; every coordinator (memory 619, extraction 601) → **≤ 560**; constants unchanged or lowered | `architecture.test.ts`; a diff shows `MANAGER_LINE_BUDGET`/`COORDINATOR_LINE_BUDGET` not raised |
| S3 | Every prod file budgeted | `DrawerTabs.tsx` 972, `index.tsx` 760, `validate.ts` 829 unguarded → **every prod file ≤ 600 effective lines** | new guard in `architecture.test.ts` (same `effectiveLines`) |
| S4 | Function size | 13 functions > 150 lines, 2 with > 40 branches (`readOp` 89, `parseStoryV2` 45) → **0 functions > 150 lines, 0 with branch count > 40, nesting ≤ 5** | TS-API guard test (the audit's metric, committed) |
| S5 | No line packing | 390 prod lines > 200 chars (max 1 291) → **0 lines > 200 chars** | guard test |
| S6 | Host boundary | 6/7 coordinators import `@services/STAPI` → **0**; host calls injected as deps | `architecture.test.ts` import rule |
| S7 | No import cycles | 1 SCC (engine ↔ pacing via `runReplay`) → **0** | cycle guard test |
| S8 | No dead or duplicated helpers | 9 dead values + 1 type; `isRecord` ×16, withholding set ×3 → **0 dead exports; one definition each** | dead-export guard (allowlist for the public format types); grep guard for `const isRecord =` outside `utils/` |
| **Types and style** | | | |
| T1 | Casts at the boundary only | `as unknown as` 24 (7 outside `stHost/`) → **0 outside `stHost/`**; non-null `!` 42 → **0** (or an allowlist ≤ 5 with a reason each) | eslint `@typescript-eslint/no-non-null-assertion: error` plus a guard |
| T2 | Lint is complete and strict | hand-enumerated dirs (`lint:fix` misses `src/judge`), `no-explicit-any: warn` → a glob over `src/**`; `no-explicit-any`, `no-non-null-assertion`, `no-console` (except via the logger) all `error` | `npm run lint` exits 0 |
| T3 | Comment policy decided and enforced | 1 708 comment lines, ≥ 574 citing plans/ids/dates → **per the user's call (Q1)**: 0 comments, or 0 plan/ticket/date references with host-fact citations allowlisted | comment-scanner guard |
| T4 | Toolchain current | `@types/react` 18 vs React 19, eslint 8 EOL, unused `yaml`, leftover `eslintConfig` → matched types, a supported eslint, 0 unused deps | `npm ls`; a dependency-usage script; `npm audit --omit=dev` high/critical = 0 |
| **Robustness** | | | |
| E1 | One logger | 47 `console.*` under 10 prefixes, `console.log` on every AN apply → **0 direct `console.*`**; one `[Story Orchestrator]` logger, debug level off in prod | grep guard |
| E2 | Error copy reviewed | 7 raw `error.message` templates, 33 silent `catch {}` → every user-visible string inventoried and reviewed. **0 raw `error.message` in player mode**. Each silent catch either logs at debug level or is allowlisted as a probe | a string-inventory file checked by jest; `so-ui assert-player-clean` extended to error states |
| E3 | Global `fetch` wrapper justified | always on, can refuse host saves → decide keep/replace (Q4). If kept: a live check with ≥ 2 other fetch-wrapping extensions installed, saves verified, no double-report | archived live record |
| E4 | Clean stop | React roots never unmounted, 2 listeners never removed → `stopRuntime` + disable leaves 0 roots, 0 listeners, 0 globals | jest (jsdom) test plus a live disable/enable cycle |
| **Performance** | | | |
| F1 | Bundle budget | 1 817 880 B (508 KB gzip), no webpack budget → main entry **≤ 1.25 MB** minified, with Studio + cytoscape as a lazy chunk; webpack `performance` set to that number, so the build emits **0 warnings** | `test:release` reads `dist/manifest.json` `bundle.bytes`; build log |
| F2 | Snapshot cost | 4+ `buildRuntimeSnapshot` per `notify()`, one per macro resolution → **≤ 1 build per state change**, 0 per macro resolution when state is unchanged | jest structural bound (count calls; rule 11: no wall clock) |
| F3 | Settings render cost | preset walk on every render → the profile limit is read once per profile/preset change | jest call-count bound |
| **Tests and CI** | | | |
| Q1t | No wall-clock tests | the 5 ms `windowHygiene` floor; sleeps of 1 200 ms ×3 and 900 ms ×2 → **0 `performance.now` asserts, 0 real sleeps > 50 ms** in jest | grep guard; `npm test` ×3 under parallel load, all green |
| Q2t | CI exists | none → a CI workflow runs `typecheck`, `typecheck:test`, `lint`, `test`, `build`, `test:release`, `test:plugin`, `test-storybook:ci` on every push to master | green run on the release commit |
| Q3t | Test-only code out of `src` prod paths | `fakeDocument.ts`, `replay.ts` in the barrel → test support lives under `test/` or `src/**/testing/`, excluded from the bundle | D3 import-graph guard |
| **Accessibility, i18n, docs, privacy** | | | |
| A1 | a11y | `color-contrast` disabled globally; 7 UI units without stories → contrast on (per-story exemptions only, each with a reason). Every component has a story, `SettingsPanel` included. `test-storybook:ci` finds 0 violations | Storybook run record |
| A2 | i18n stance | none → a README statement: English-only UI and prompts in 2.5, or ST i18n hooks for the panel (Q3) | README |
| P1 | Privacy disclosure | none → a README section: what each role sends where (main model, memory model, judge → TypeSafe with `state` contents), what is stored per chat and install-wide, and how to switch each off | doc review |
| P2 | Multi-user secret scope | env/dotenv judge key shared across ST users → an explicit decision (Q5), and the README says which | plugin test plus README |
| P3 | Nothing sensitive in the served tree on the dev box | `.debug/chromium-profile` (Cookies, Login Data) served → `.debug` browser profile outside `public/` | `curl` status 404 on the old path |
| U1 | User docs | developer README → install (no npm), first-run walkthrough, uninstall/cleanup (mirror lorebooks, wizard-created assets), troubleshooting (backend down, stale bundle, profile missing), supported versions | doc review by the user |
| U2 | Changelog | stops at 2.3.0 → 2.4.0 and 2.5.0 entries | R4 guard |
| **Acceptance evidence** | | | |
| H1 | Human sessions | v2.1/v2.3/v2.4 sessions open → v2.4's player and author sessions run and scored. Every rubric row scored (`--require-human-record`) | archived human records |
| H2 | Automated acceptance | per plan 10: every journey twice, consecutively, `--strict`, archived; run-header diff around the batch = 0 undeclared | `test/journeys/records/v2.5/` |

## How this lands in the plan set

- **Plan 03 (Budget headroom and harness hardening)** takes S2–S8, T1, Q1t, Q3t, E1 and F2/F3, because they are the same
  extraction work. Its current outline target (≥ 60 coordinator lines, ≥ 30 in the manager) becomes S2's numbers.
- **A new plan (Release and packaging)** takes R1–R6, D1–D4, F1, P1–P3, U1–U2, A2 and Q2t. It is independent of 01/02.
- **Plan 10 (Acceptance)** adds the whole checklist as a gate table, with H1/H2 as its existing items.
- Every new guard lands with a **negative control** (a planted offender that fails it), per the census lesson in
  `.claude/rules/gotchas.md`.

## Open questions for the user

1. **Comments (T3):** enforce "no code comments" literally (delete about 1 700 lines, including host-fact `file:line` citations),
   or delete only plan/ticket/date narration and keep host-fact citations and the JSDoc on host seams?
2. **Distribution (R1/R2):** a `release` branch with `dist/` committed (works with ST's installer and `auto_update`), GitHub
   release zips only, or both?
3. **i18n (A2):** English-only for 2.5?
4. **`fetch` wrapper (E3):** keep the save-refusing wrapper in prod, or replace it with a non-intercepting observation?
5. **Judge key scope (P2):** drop the env/dotenv fallbacks in multi-user installs, or document them as install-wide?
6. **Debug handle (D2):** does any end-user/support flow need `storyOrchestratorRuntime` in prod (e.g. bug reports), or dev builds only?
7. **Bundle target (F1):** is ≤ 1.25 MB main entry (Studio lazy) acceptable, or do you want a lower number measured first?
8. **Minimum ST version (R5):** keep claiming 1.18.0 (needs a full acceptance run there) or raise the minimum to 1.19.0?
