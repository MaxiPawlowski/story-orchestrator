# Plan 10 — Acceptance

**Status: DRAFT 2026-09-25 — awaits user approval.** Depends on: plans 01–09 and 11–13, each with a `## Gate record` or a
signed deferral; v2.4 plan 09 closed (overview V1). Kind: gate, plus a **Phase 0 harness** build (H-a, H-g, H-j, H-k) with
its own gate record before the matrix. No product code except fixes the matrix finds; a fix bigger
than trivial gets a mini gate record here or goes to the v2.6 seeds. Shape: v2.4 `09-acceptance.md` (the model), with
v2.3 rules 11–17, v2.4 rules 1–8 and v2.5 rules 9–13. Verified against master `e7626d7` on 2026-09-25; Δ marks drift.

## Goal

Accept v2.5 on one frozen candidate, and decide the **production ready** label:
- every journey J0–J12 green ×2 (definition below) in **scan mode**, with every run of every series reported;
- the interop shapes, each plan's live gates, the judge and harness routes, extraction, cost and calibration measured;
- `research/prod-readiness-criteria.md` as a **gate table**: every row met; a deferral the user signs off is allowed but
  makes the verdict PARTIAL; never loosened;
- the artifact proofs (smoke, first run, uninstall), a soak, backend chaos, a touch/keyboard pass, the v2.3 L7 carry-ins;
- a clean host for each ST version the README claims; the player and author sessions scored.

The outcome is an attestation that cites only archived records. **"Production ready" cannot be reached by deferral**
(Sol PR-01): every row met; a deferral the user signs off is allowed but makes the verdict PARTIAL, critical or not. It is
never withheld and never rounded up.

## Entry criteria

1. **Plans 01–09, 11–13:** a green Gate record (machine and live) or a user-signed deferral per open item (v2.3 rule 14). A
   deferred item appears in the matrix as `not run (deferred, <date>)`, never silently absent. **Except 06 J2** (warden/scene
   timeout tables): matrix-phase measurements over this plan's J8/J11/JM records, closed in this plan's register (row J2
   below). If a J2 miss needs a code fix, that is a new candidate and a re-freeze.
2. **Machine gates on the candidate:**
   `npm run typecheck && npm run typecheck:test && npm run lint && npm test && npm run test:debug && npm run test:plugin && npm run debug:typecheck && npm run build && npm run build:dev && npm run test:release && npm run test-storybook:ci`.
   `test:plugin` covers **both** plugins (today `package.json:33` runs the judge's only). Census files hold 0 `todo`
   (`test/findings/ownership-sites.json`, `test/findings/faultMatrix.json`). `npm test` ×3 under plan 03's declared load.
3. **Harness owed**, each with node:test coverage and a negative control (seeds §C, §D; `v2.4/09-acceptance.md` A3, A25–A31).
   Owners: H-a, H-g, H-j, H-k are built in **Phase 0 harness** (below); H-b–H-f by plan 03; H-h by plan 13
   (`13-harness-routing.md` H4 run header, Live gates diff); H-i by plan 12:

| # | Item | Seed / evidence |
|---|---|---|
| H-a | Sandbox cleanup **stops and awaits** an in-flight generation before switching; the run header flags `chatLength` growth on a chat the run does not own as blocking | A3, reproduced twice (`v2.4-acceptance/J1/run2/`, `cost/J7-judge-on/A3-residue-*`) |
| H-b | `so-scenario` removes a library record an `expectFail` `import_story` added | A25 |
| H-c | `live-v24-05-forced-pick.json` removes and deselects its `SO-V2405 Lore` book | A27 |
| H-d | `so-run-header` captures group chat lists (a resurrected chat must diff) | A28 |
| H-e | `st-lanes run` streams child stdout with per-line timestamps | A29; today `st-lanes.mts:179-181` buffers until exit (Δ `:180-182`) |
| H-f | journey records write `fileSha256` | overview residue → 03 |
| H-g | `attestationRules.mjs` implements the ×2 definition below; today `seriesVerdict` takes **any** adjacent green pair on one build+fixture (`scripts/release/attestationRules.mjs:87-107`) | seeds §A; PR-19 |
| H-h | the run header records per-role routes (ST profile / harness id + CLI version) and the lane backend | H1–H5 below |
| H-i | a black-box artifact driver (`scripts/release/artifact-smoke.mts`, plan 12) using DOM, network and data files only | PR-02 |
| H-j | soak/chaos probes over CDP (heap after GC, long tasks, event timing) that need no runtime handle | SK, CX |
| H-k | before sandbox cleanup, `so-journey` writes `dumpPersistedRuntime()` of the sandbox chat (engineState + engineHistory) to `<record>/engine-history-<check>.json`; the attestation test fails if a cited file is missing | plan 07 A3 (its replay input); journey records hold no engine history today |

   Without an item, its rows are `not-runnable`, which is not green.

   **Phase 0 harness** (owned here, before the matrix): H-a, H-g, H-j and H-k are built with node:test coverage and the
   negative controls listed for each (H-g's under §What "×2" means), and get their own `## Gate record (Phase 0)` in this
   doc. Plans 02 (C6) and 03 route the A3 harness half here.
4. **Freeze** (A31): see §Environment. `dist/manifest.json` of each flavour names the candidate; every run header's
   `bundle.served` equals the flavour the row declares; `build.head` = the candidate on every header.
5. **Install at REF-2.5**, captured by `so-run-header capture --label v25-acc-start`: cadence 3 (J12.1 refuses others),
   `stagecraft.acceptMode` review, judge off with every use off, every harness route off, Stepped Thinking `is_enabled`
   recorded. WI `gatingMode` recorded twice. **REF-2.5-default** (`v25-acc-start`) holds plan 01's shipped default (`file`
   per `settingsStore.ts:36`, unless U1 decides otherwise). **REF-2.5-scan** (`v25-acc-scan`) is REF-2.5-default plus plan
   01 §A's confirmed normalisation, driven through the confirm popup on the lane after seeding. The header records
   `worldInfo.gatingMode = scan`, the `normalized` ledger per book, and `missingKey = 0`. Scan-mode rows diff against
   REF-2.5-scan. File-mode rows (J7f, J3f) diff against REF-2.5-default.
6. **Backends up per lane** (§Environment), confirmed by a real `PONG` on every profile the panel offers (J1 picks the
   first), not by `onlineStatus`; each harness CLI's `/status` probe logged-in.
7. **One human-score file:** `test/journeys/records/v2.5-acceptance/human/scores.json`, preflighted before the batch (PR-20).

## What "×2" means (seeds §A; stated before the matrix)

v2.4 left this open: the lanes called J3, J12, P03 and I1 red, each with two consecutive greens **after** failures on an
unchanged fixture, while `attestationRules.mjs` read them as ×2 (`v2.4/09-acceptance.md` Gate record, Deviations; seeds §A:
J3 2/4, J12 seriesB 2/3, P03 memorize B 3/4, I1 fork 3/6). This plan settles it:

| Term | Definition |
|---|---|
| Series | consecutive runs of one row on one candidate bundle, one fixture sha256, one lane, one backend configuration, with **no change** between runs |
| Run passes | strict: no fail/blocked/not-runnable/skipped check, cleanup clean, header diff 0 undeclared, human rows scored where the row requires |
| `green ×2` | the **first two runs** of a series pass |
| A failure | ends the series; it is classified in the register (product / fixture / harness / environment) with a measured cause |
| New series | only after a **named change** recorded in the register (product fix → re-freeze and restart every affected row; fixture, harness or environment fix). Re-running without a change continues the same series |
| `flaky k/n` | a series that failed and later passed with no change between. **Red.** Greens after an unexplained failure measure luck |
| Model-leg rows | Default: none — every row is ×2. Only if the user answers Q1/U10 yes before the matrix: J7 and J3.7's FACT leg are judged by pass rate over exactly 4 runs, floor ≥ 3/4, each failure a named model leg with no product/harness cause |
| Reporting | every run of every series is listed; `--only` runs are `partial` and never count; `firstAttempt` reported per check |
| Row predicate | every matrix row declares one in its Runs column: **`×2 series`** (the definition above); **`one-shot`** (×1, green iff within its stated budget/floor); **`recorded`** (never green or red, never in `notGreen`, never feeds ACCEPTED) |

The predicate (H-g) gets negative controls for: pass-fail-pass-pass with no change (not ×2); fail, change, pass, pass (×2);
a pair across two builds; `--only`; failed cleanup; an unscored human row; a cited path outside the records root.

## Environment

| Item | Rule | Why |
|---|---|---|
| Backend per lane (E1) | each LLM-heavy lane has its own llama-server (own pod or GPU), `LLM_PARALLEL` ≥ 2; never two LLM-heavy lanes on one backend | one server for three lanes caused every timeout-red run in v2.4 (E1: 8-token curl 38.9 s) |
| Throughput pre-check | before each batch and recorded in the header: 8-token PONG ≤ 5 s and single-stream decode ≥ 20 tok/s (proposal, Q2); a batch whose check fails does not start; a monitor samples every 5 min | a slow backend is an environment failure, and it ends the series |
| Memory model separate | the memory profile points at a different server than the main profile | CX needs to cut one without the other |
| Frozen tree | a dedicated ST clone at the claimed tag (`C:\dev\so-acc\st-<tag>`, clean, not the patched staging checkout); the extension is a `git worktree` at the candidate, built (`build` → `dist/`, `build:dev` → `dist-dev/`, plan 12 §R) and staged into that clone with the flavour named explicitly (plan 12 `npm run stage --flavor prod|dev`); `st-lanes` runs from the worktree with `ST_ROOT` = the clone (`scripts/debug/st-lanes.mts:26`) | master may move freely; A31 is closed by construction; the live host is a clean ST, which closes v2.4's "patched host" risk |
| Seeding | the clone's `data/default-user` is seeded once from the dev install minus backups/vectors/thumbnails (the `st-lanes seed` exclusions, `st-lanes.mts:78`); its inventory captured. After seeding the clone and before seeding lanes, list every Connection Manager profile and PONG each one; on the CLONE only (never the dev install), repoint or delete any profile that does not answer (v2.4 E2: `Story Orchestrator Memory Local` :1235); the final profile list with each api-url goes in the `v25-acc-start` header (`profiles.urls`), and entry criterion 6 is measured against it — a profile added later that fails PONG is an environment failure that ends the series. Lanes are seeded from the clone with `seed n --fresh` after plan 11's one-time data actions; then, per lane that runs scan-mode rows, switch to scan through the plan 01 confirm (never on the user's live install) and capture REF-2.5-scan. A re-seeded lane (`seed n --fresh`, e.g. J10) repeats that step before any scan-mode row | lanes must not carry pre-v5 blobs |
| Headed lanes | `st-lanes start <n> --headed` (`st-lanes.mts:15,171`); `session.json headed: true` checked per run; windows tiled, never occluded | v2.4 lane 1 was headless; occluded pages starve rAF (gotchas) |
| Dialogs | `settleDialogs` on every attached page (`lib/connection.mts`) | a crashed runner skips cleanup |
| Harness lanes | every lane shares this machine's CLI logins and quotas, so H1–H5 run **one harness lane at a time** (`13-harness-routing.md` §Live gates); CLI versions pinned for the matrix and recorded in each header | a CLI update or an exhausted quota mid-series is a changed environment |
| Flavours | instrumented rows run on the **dev** bundle; SM, FR, UN, BR, UP, SV, EG, SK, TK run on the **prod** artifact | D2 removes the handles the journeys read (`so-journey.mts:270,283,375`) |

## Row naming

Checklist rows keep their ids (R1–R6, D1–D4, S1–S8, T1–T4, E1–E4, F1–F3, Q1t–Q3t, A1–A2, P1–P3, U1–U2). The checklist's
H1/H2 are written **ck-H1** (human sessions) and **ck-H2** (automated acceptance) here, because matrix rows H1–H5 are the
harness routes. The P0′ replay is **RP**, not R1.

## Matrix

Records: `test/journeys/records/v2.5-acceptance/<row>/`; `.debug` is never cited. Protocol for every run: headed, real
model, no `debugResponse` (except the host-mutation fixtures that seed by design, as v2.4 I4/I5/I7), `so-run-header capture`
before and `diff` after, one header pair per **batch** too, archived when the run ends.

| Row | What | Runs | Owner |
|---|---|---|---|
| J0 | runner self-test: J0.3 `blocked`, J0.5 `fail`, J0.4 human placeholder | `×2 series` `--strict` | harness |
| J1–J6, J8–J10 | `so-journey.mts run <id> --strict --group <id> --require-human-record …/human/scores.json`, **scan mode**; J8/J9 end with `removeCreatedAssets` clean and `so-assets assert-clean`; J10 on a re-seeded lane covers select, hydrate, restart, unreadable → Restart (plan 11) | ×2 each | 01–11 |
| J7 | long haul, sun-ruins, scan mode (plan 01 G3) | `×2 series` (model-leg rule only if Q1 approved) | 01 |
| J7f, J3f | file-mode regression (plan 01 G4): J7 ×1 (`one-shot`, as plan 01 G4 predeclares; restated only if U1 keeps the file path as a shipped mode, hard rule 5); J3 `×2 series` whenever `file` ships as the default or as a fallback (U1) | as stated | 01 |
| J11 | judgment backend; plugin configured; judge config recorded **per check** | ×2 | 06 |
| J12 | unaided schedule at cadence 3, no `runExtractionNow`, no `/cp` | ×2 | 04/05 |
| I1–I7 | v2.4's interop rows with their recipes (`v2.4/09-acceptance.md` I1–I7); I1 live replay-equality on an uncontended backend (seeds §D: base 1/4, fork 3/6 on E1); I7 now expects the A1 probes (`test/scenarios/v24-acc-A-*.json`) **green** | ×2 each | 01/02 |
| P01 | plan 01 G1–G8 (G7 on each claimed ST version) | per G row | 01 |
| P02 | C1 live proof of the generating branch; C2 attribution or recorded non-reproduction (gates P01 sign-off, Sol PR-09); C3; C5 intermittents; live checks of the post-freeze fixes not on v2.4's bundle (A1/A2, AE-01, AE-03, AE04-L1, AE04-S1; commit ids as in 02-carry-in C8) unless v2.4's closure recorded them. The extraction post-freeze fixes (A5/A7, A6/A11, A10) are gated as plan 05 F0 and A8 as plan 06 J2, both under row P04–P09 | post-freeze checks `×2 series` each; C5 each journey ×5 consecutive, per 02 C5 | 02 |
| P03 | E4 live disable → enable cycle (0 roots, 0 listeners, 0 globals after disable); `npm test` ×3 under load (record) | ×2 | 03 |
| P04–P09 | each plan's own live recipe, as named in its Gate record (incl. 05 F0 and 06 J2's A8 live check); P08 includes a mirror-rate recipe that **builds** a mirror book (A34): P08's mirror-rate row is green only if a book was built in both runs, and a met sample floor or a recorded 'unmeasurable' count is a reported value, not a pass condition; P09: a chosen spike is green when its report records a verdict (PASS or FAIL) on every predeclared condition, each measured ×2 where plan 09 marks ×2, in archived records; a FAIL also needs the spike code removed and its flag gone, confirmed by a jest/grep guard; a FAIL verdict is not a red row. Every run spike is either built with its gate record or absent from the prod graph | `×2 series` each | 04–09 |
| P11 | one-time data actions: every moved book restores byte-for-byte, no unlisted book moved (Sol PR-08) | `one-shot` ×1 + restore test | 11 |
| P12 | plan 12's live checks re-run on the candidate: SM, FR, UN, BR, UP, SV, EG, JP, PS-J, PS-H, E3 | ×2 each | 12 |
| JM | judge-on matrix: every built `judge.uses.*` + the warden baseline, on/off columns, `so-judge calibrate --record` at its predeclared floor, over-steer probe, privacy row per host; the judge-on warden columns together are sized to reach ≥ 100 warden calls (about 200 boundaries at the recorded 0.5 calls per boundary, `v2.4/07-judge.md:1383-1387`) so 06 J2 can close | `×2 series` per column | 06 |
| J2 | plan 06 J2's predeclared close over this plan's J8/J11/JM records: warden ≤ 1 timeout per 50 calls over ≥ 100 calls; 0 scene bursts, ≤ 1 timeout per 20 scene calls; J11.25 ×2. Fewer than 100 warden calls → `unmeasured (n = N)`, an open row, not deferred | `one-shot` over the records | 06 |
| LS | `so-live-suite.mts run --min-tier <floors> --expect-count <n> --record`; facts floor 0.68 (X15), not retuned; every tier reported, `incomplete` fails | ×2 | 04/05 |
| CAL | role calibration per **profile** route (the local memory route among them; H2 owns the harness routes, so the shared baseline arm is measured here only) at the existing floors, never retuned (authoring es ≥ 0.90, A14; curator validity/opShape/decision, now at floor on `65733265d301`) | ×2 consecutive per role × route, same labels; verdict only when both runs meet every floor (plan 06 J1 protocol; 06:114) | 06/13 |
| CL | cost/latency from the rollback-exempt meter, never summed from the ring; includes one judge-on run that drafts through the director and lore (seeds §D: no metered sample in v2.4); director/lore on-path vs 1500 ms | `recorded`, once over the runs | 06 |
| H1 | harness-route live gates: for each supported harness (Claude Code `claude -p`, Codex `codex exec`, opencode `opencode run`; a harness that failed plan 13 Phase 0 H-N1/P0-2 is not offered and is recorded `not offered`), the roles the recommended config routes, through plan 13's recipe (J3 and J7 with those roles routed, narrative on the local profile) plus each routed role's own live fixture; header records routes + CLI versions | ×2 per harness | 13 |
| H2 | per role × route calibration at the role's existing floor (v2.4 plan 08's fixtures; read through the live suite), never retuned; anything plan 13 leaves open is **set by plan 13 Phase A** before this row runs; verdict per pair `recommended` / `usable` / `refused`, written to `recommended-config.md`, no default flipped | ×2 per role × route (Phase A's rule) | 13 |
| H3 | fallback chaos per harness: binary missing (off `PATH`), not logged in (empty CLI home), quota/429 (a shim replaying the CLI's recorded rate-limit output, plus any real one observed), timeout (shim sleeps and forks; kill tree verified), malformed output. Pass: each maps to plan 13's kind (`config`/`auth`/`quota`/`timeout`/`malformed`); the role uses the author's `onFailure` profile (only for `auth`/`quota`/`transport`/`timeout`, never `config`) or pauses per the breaker (`quota` until `retryAt`, `auth` until a status refresh); **the reply is never blocked** (`send_generate` `expectReply: true` within baseline + budget); the pipeline names the cause and Repair offers the step; no stale apply | ×2 per fault × harness | 13 |
| H4 | egress: harness off → **0 spawns** (plugin spawn counter delta 0, OS scan for `claude`/`codex`/`opencode` empty, 0 run requests to the plugin) over a full J3 and the SK soak; harness on → spawns only for routed roles, stdin = the documented role prompt | ×2 | 12/13 |
| H5 | cost/latency per route from plan 13's per-route meter (`extras.modelCalls`), never summed from a ring that rolls back: p50/p90 per role × route (`ms` and `spawnMs`), tokens and `costUsd` where the CLI reports them, calls per J3 session per role, fallback rate by kind, compared with the ST-profile route; the director's p90 against its budget over 20 group turns (plan 13 H5). Recorded, not a floor | `recorded`, once over H1–H3 | 13 |
| L7a | live fault-matrix run: inject each `covered`/`partial` cell's fault on a lane where a live injection exists (v2.3 recipe, `v2.3/11-acceptance.md:297`) | `one-shot` ×1 per cell, archived | AE-05 |
| L7b | three independently authored stories played through branches, **both routes** of a generated fork (`v2.3/11-acceptance.md:12-14,189`) | ×2 per story | AE-05 |
| L7c | privacy capture across two stories: two chats, two stories, one page; no request of one carries a block of the other | ×2 | AE-05 |
| L7d | NVDA trace over the tablist, wizard cards and dialogs (`v2.3/09-player-author-flows.md:101,240`) | `one-shot` ×1 (user) | AE-05 |
| SK | soak (below) | `one-shot` ×1 each leg, at the predeclared budgets | 10 |
| CX | backend-outage chaos (below) | `×2 series` | 10 |
| TK | touch/keyboard pass (below) | `one-shot` ×1 per viewport × theme | 10 |
| RP | P0′ matched replay: runnable only if the player session records L1; a log, not a gate; not-runnable without an L1 record is logged, not a `notGreen` line | `recorded` ×1 | 01 |
| CH | clean host per claimed ST version: `clean-host.sh --ref <tag> --gates typecheck,typecheck:test,lint,test,test:debug,test:plugin,build,storybook,release`; the default gates gain storybook (today `clean-host.sh:19`) | ×2 per version | 12 |
| HU | human sessions (below) | per session | user |

Commands per journey run: v2.4's shape (`v2.4/09-acceptance.md:96-102`), run through `st-lanes run <n> -- …` from the
worktree; the record, log, journal tail and header pair are copied into `…/v2.5-acceptance/<row>/run<k>/` as the run ends
(`so-journey.mts` takes no records-dir flag today; the copy is the lane wrapper's job, archived with the run).

## Production-readiness gate table

Critical ranks severity inside a PARTIAL; every row is required for the label (overview §10, Sol PR-01). Evidence = the
plan-10 row that proves it on the candidate.

| Row | Criterion (target) | Critical | Owner | Evidence |
|---|---|---|---|---|
| R1 | install without a toolchain, from the artifact | **yes** | 12 | P12-SM on a fresh ST at each claimed tag |
| R2 | update carries the built bundle | **yes** | 12 | P12-UP |
| R3 | artifact = allowlist only | **yes** | 12 | `test:release` + P12-SV |
| R4 | one version everywhere, tag `v2.5.0` | **yes** | 12 | `test:release` |
| R5 | minimum = oldest ST that ran the full acceptance; policy in README | no | 12 | CH + the live matrix host tag |
| R6 | clean `dist/`, no stale map | no | 12 | `test:release` |
| D1 | 0 debug-response globals in prod | **yes** | 12 | `test:release` grep; SM globals check |
| D2 | prod globals ⊆ allowlist | **yes** | 12 | SM, TK globals check |
| D3 | measurement code out of the prod entry graph; every run plan-09 spike built with its gate record or absent from the prod graph | **yes** | 12 | jest import-graph guard |
| D4 | 0 UI hrefs into `docs/plans` | no | 12 | grep guard |
| S1 | 0 legacy rows open | **yes** (hard rule 1) | 11 | legacy inventory guards (src/ and scripts+test); J10 |
| S2–S8 | budgets by extraction (manager ≤ 700, coordinators ≤ 560), files ≤ 600, functions, lines, host boundary, cycles, dead/dup | no | 03 | `architecture.test.ts` + guards; constants not raised |
| T1–T4 | casts, lint strict + complete, comment policy, toolchain | no | 03 | `npm run lint`, guards, `npm audit --omit=dev` |
| E1, E2, E4 | one logger; error copy inventory; clean stop | no | 03 | guards; `assert-player-clean` on error states; P03 |
| E3 | `fetch` wrapper beside two wrappers | no | 12 | P12-E3 |
| F1 | main entry ≤ 1 250 000 B, Studio lazy, 0 build warnings | no | 12 | `test:release`, build log |
| F2, F3 | snapshot and settings render bounds | no | 03 | jest structural bounds |
| Q1t–Q3t | no wall-clock tests; CI; test-only code out | no | 03/12 | guards; green CI run on the release commit |
| A1 | contrast on, every component storied, 0 violations | no | 12 | `test-storybook:ci`; TK |
| A2 | English-only stated | no | 12 | README |
| P1 | privacy disclosure written from measured egress | **yes** | 12 | P12-EG + H4 |
| P2 | key scope decided (U7) and tested | **yes** | 12 | P12-PS-J step 4 |
| P3 | served tree: 404 on every sensitive path, dev and artifact | **yes** | 12 | P12-SV |
| U1 | user docs; first run, uninstall, backup tested | no (FR, BR); UN **yes** | 12 | P12-FR, P12-UN, P12-BR; rubric review |
| U2 | changelog 2.4.0, 2.5.0 | no | 12 | R4 guard |
| SM | artifact smoke journey | **yes** | 12 | P12-SM |
| UN | create → uninstall inventory, foreign untouched | **yes** | 12 | P12-UN |
| JP | judge plugin install on the artifact | no | 12 | P12-JP |
| PS-J | judge plugin security gate | proposed **yes** (Q3) | 12 | P12-PS-J |
| PS-H | harness plugin security gate (if the plugin ships) | proposed **yes** (Q3) | 12/13 | P12-PS-H |
| H4 | harness off → 0 spawns | proposed **yes** (Q3) | 13 | H4 |
| LI | SBOM + notices + source offer | no | 12 | `test:release` |
| SK, CX, TK | soak, chaos, touch/keyboard | no | 10 | rows below |
| ck-H1 | player and author sessions scored, every rubric row | **yes** (v2.4 precedent: without them PARTIAL, `v2.4/09-acceptance.md:189`) | user | HU |
| ck-H2 | every matrix row meets its declared predicate (`recorded` rows excluded), header diffs 0 undeclared | **yes** | 10 | the matrix |

## Soak (SK; Sol PR-11)

On the **prod artifact**, lane copy, headed Chromium 1920×1080; reference hardware and backend recorded in the header.
Budgets are proposals until the user confirms them (Q2); once confirmed they are never retuned.

| Leg | Setup | Budget |
|---|---|---|
| Baseline | a 100-message chat, story selected, 10 real turns; same with the extension disabled (control) | — |
| Long chat | a 1 000-message chat imported through ST's chat import (built from archived transcripts), story selected, 10 real turns | open-to-HUD p95 over 5 opens ≤ 1 500 ms and ≤ 2× baseline; prompt-path overhead (`GENERATION_STARTED` → `GENERATE_AFTER_DATA`, minus the disabled control) p95 ≤ 250 ms; long tasks > 200 ms ≤ 1 per turn |
| Sustained | 100 real turns in one session | retained JS heap after forced GC (CDP) sampled at turns 20/40/60/80/100: slope ≤ 0.5 MB per 10 turns and final ≤ turn-20 + 20 MB; DOM node count slope ≤ 0 after turn 20; 0 lost boundaries (committed boundaries = rendered turn replies, read from the saved chat file); inventory diff = only the expected owned assets |

## Backend-outage chaos (CX; Sol PR-12)

Dev build (the tails need `so-journal follow` and `st-payload arm --persist`), lane copy, memory model on its own server.

| # | Fault | Pass |
|---|---|---|
| CX1 | kill the memory server during an in-flight extraction read; restore after 3 min | no result from the cut read applies; during the outage `snapshot.pipeline` = `{state: "stalled-rechecking", text: TRANSPORT_PLAYER_TEXT ("The memory model is not answering — the story will catch up when it does.", `src/runtime/pipeline.ts:33`, `:76-77`), nextAction: "retry"}` with `pipeline.detail` = the breaker's last transport failure (`src/extraction/scheduler.ts:229`); the journal carries the "memory model not answering; reads held" record (`scheduler.ts:320` → `noteRecap`, `runtime/index.ts:87`), and after restore a "memory model answering again" record (`scheduler.ts:277`/`:298`); `so-ui.mts assert-player-clean` passes in the outage state; the player keeps generating on the main model; after restore the breaker closes and held work resumes or is discarded **with a journal record** |
| CX2 | kill it during a boundary with accepted pending writes | pending writes apply at the next boundary or are discarded explicitly; no duplicate apply after recovery |
| CX3 | CX1, then switch chats during the outage, then restore | 0 writes land in the new chat from the old chat's reads (ownership); the old chat resumes on reopen |
| CX4 | kill the main server | ST's own error; the extension does not wedge; the HUD recovers after restore |

Archive per run: the journal and payload tails, the header before and after, the outage timeline (kill/restore times).

## Touch and keyboard (TK; Sol PR-13)

On the **prod artifact**. Viewports: `mobile` preset 390×844 (touch emulated, UA mobile) and desktop 1920×1080. Themes: ST's
default and one contrasting bundled theme (Custom CSS snapshotted first: applying a bundled theme wipes it). Surfaces:
first-run settings (entry points, Repair), drawer (player and author view), HUD, Studio dialog, wizard steps and cards,
Repair reveal, confirmations (restart, author view, remove data). DOM-only drivers (`ui: {action: "hit-test"}`, keyboard
events), no runtime-handle verb. Pass: every action reachable by touch and by keyboard alone (Tab, Shift+Tab, Enter, Space,
Escape); `hit-test` never `overlay`/`ancestor`/`offscreen` (`disabled` is correct); visible focus on every stop; Escape
closes each dialog and returns focus to its opener; no clipped control at 200 % zoom. The NVDA trace is L7d.

## Human sessions (HU)

**The user runs both** (overview U4). v2.5 adds no session type; it reuses v2.4's two and adds a scan-mode note to the author
rubric. Dev build of the candidate (the live tails need the handles). Each session: `so-journal follow --out …`,
`st-payload arm --persist --out …`, flags with ⚑, every flag triaged (fixed / v2.6 / by-design, with a reason).

| Session | Story / config | Rubric | Waits on it |
|---|---|---|---|
| Player | `adolion-adventurer` from `guild-hall`, the recommended config (JM, CAL, H2) | v2.1 player rubric, v2.2 player rows, v2.4's railroading/restatement rows; if recorded as L1, RP becomes runnable | D6/T22 default revisit; rule-7 items (options menu, visible qualities, Continue list, wand entry, objective echo, `player_summary`) |
| Author | `adolion-academy` in the Studio | v2.4 author rubric + scan mode: can the author see which gated entries a chat's scan turned on (S5 table), and does a hand toggle show a Repair row | T18/T19 usability, `house_rules` wording, plan 07's inspector decision |
| Journey human rows | `human/scores.json` | every human row of J0–J12 | `--require-human-record` fails an unscored row |

The Author session rubric carries the plan 07 A1 row, worded exactly: "Starting from a message in the chat, I could find why
it looks like this (pass/fail + notes; also record whether the author asked for per-message entry)".

HU outcomes do not ship in the frozen candidate. The rule-7 items are already out of scope for v2.5 (00-overview §Out of
scope). C7 (A4 note order, `02-carry-in.md` C7) and the D6/T22 default revisit either (a) are decided by the user before the
freeze, or (b) run HU on a pre-freeze dev candidate, then do a scored confirmation session on the frozen one. Otherwise they
go to `v2.6-seeds.md` with the HU record as their measurement.

## Attestation

`docs/release/2.5.0/attestation.json`, v2.4's shape (`kind, extension, status, candidate, build, served, host, browser,
models, judge, journeys, rows, notGreen, evidence`) plus:
- `artifact` `{zip, sha256, allowlistSha256, prodBundle, devBundle, source}`: `prodBundle` cites `dist/manifest.json`,
  `devBundle` cites `dist-dev/manifest.json` (plan 12 §R); both bundles from one `source.sha256`; each
  run cites the flavour its row declares, and the predicate checks it against the run header's `bundle.served`;
- `environment` `{lanes: {n: {backend, throughputPreCheck}}, stTag, worktreeCommit}`;
- `harness` `{routes, cliVersions}`;
- `productionReadiness` `{<row>: {verdict, critical, evidence[]}}` for every row of the gate table;
- `deferred[]` `{row, date, reason, signedBy: "user"}`; the test refuses `ACCEPTED` when `deferred.length > 0`;
- `series` on each run (`{id, changeBefore: <register id> | null}`) so the ×2 predicate reads series, not adjacency.

`evidence.journeys` = `test/journeys/records/v2.5-acceptance/`; every cited path exists under it; `current` is computed at
test time (V21). `npm run test:release` runs during preflight **and again after** the attestation is written.

## Verdict rules

| Verdict | When |
|---|---|
| `ACCEPTED` — production ready | every matrix row meets its declared predicate (model-leg rows at their floor only if Q1 was approved before the matrix; otherwise ×2); every checklist row met; `deferred[]` empty; HU scored; `notGreen` empty; `test:release` green after writing |
| `PARTIAL` | anything else. `notGreen` names each red, partial, not-run and not-runnable row; every row in `deferred` (critical or not) is itself a `notGreen` line |

- A deferral is never a pass; any deferral produces PARTIAL, never `ACCEPTED`.
- `not-runnable` and `blocked` are not green; `flaky k/n` is red.
- A fix re-freezes, restarts every affected series, and is named in the register.
- Release docs (README Tested on, CHANGELOG, `.claude/CLAUDE.md` status line, `docs/plans/v2.5/recommended-config.md` from JM,
  CAL, H2 and HU) are touched only after the matrix.

## Findings and seeds

- **Register** in this doc, v2.4's shape: id `B<n>`, row, measured symptom, cause, status (`fixed <sha/record>` | `v2.6` |
  `by-design`). A harness finding is a finding, fixed by property.
- **Seeds:** `docs/plans/v2.5/v2.6-seeds.md`, v2.4's shape: every seed with its reason and a measurement, or `unmeasured`.

## Risks

- **Backends per lane cost money and GPUs.** Pods can be refused, lack a GPU, or hit the 8 h cap mid-series; a cap breaks a
  series (environment failure). Plan series inside one pod window; state each pod's price before starting it.
- **The stricter ×2** will turn rows v2.4 called green-after-failure red. That is the intent; the model-leg list (Q1), if
  approved, is the only exception, and it is predeclared.
- **CLI harnesses are vendor-owned and quota-bound**: H1/H3 can exhaust a subscription, and a CLI update mid-matrix is a
  changed environment (new series). Pin CLI versions in the header.
- **Two flavours**: an instrumented pass that the artifact fails (or the reverse) is a finding against the build flag
  (plan 12 D1), not noise.
- **Install-wide leakage** across a batch (cadence, curator mode, disabled members, WI mode, harness routes): one header
  pair per batch; H-d closes the resurrected-chat blind spot.
- **Lane copies**: a lane result is evidence about the lane's copy of the install; lanes are re-seeded after plan 11.

## Unresolved questions

- Q1 Model-leg rows: J7 (and J3.7's FACT leg) judged at ≥ 3 of 4 with every failure a named model leg, or held to ×2 like
  every other row?
- Q2 Proposed numbers, to confirm before the runs (never retuned after): throughput pre-check (PONG ≤ 5 s, ≥ 20 tok/s); soak
  budgets (open ≤ 1 500 ms and ≤ 2× baseline, overhead p95 ≤ 250 ms, heap slope ≤ 0.5 MB/10 turns, final ≤ +20 MB).
- Q3 Add PS-J, PS-H (if shipped) and H4 to the critical set? The overview's list names neither plugin gate.
- Q4 One claimed ST version (the latest stable at release, V10) or more? Each claimed version needs the full live matrix
  (R5), not only CH.
- Q5 L7b "independently authored": by whom — the user, the wizard, or an outside author? The v2.3 recipe does not say.
- Q6 Should HU run on the prod artifact with an opt-in read-only handle for the tails (plan 12 D2 allows one), so the
  sessions also exercise the shipped bundle?
