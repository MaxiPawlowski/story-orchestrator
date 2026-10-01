# Plan 01 — Carry-over live proof: every open v2.5 row, on the new baseline

**Status: no-LLM half BUILT 2026-09-30 and on master (`e7af4081`, see Gate record). The LLM rows are regression rows
(overview rule 13): they run in plan 14's tiers, played in plan 15 Part B, ×2 at the T7 freeze.**

No v2.5 plan from 01 to 08 is signed off. Batch 2 (`test/journeys/records/v2.5-batch2/`, 2026-09-26) closed some rows
×1, but it never reached the plan docs, and seven fixes after it were never run live. Plans 14–19 owe their own live
legs. This plan re-runs all of it once (×1) on the v2.6 baseline. The ×2 of record is plan 10's.

## When each row runs (overview rule 13)

- **Now:**
  - the G-L1 U6 diagnosis (a likely product defect);
  - every row that needs no model: the no-LLM scenarios, `test-storybook:ci`, the mutant builds whose control is
    deterministic;
  - the fixes those rows produce.
- **In the final suite (plan 10 phase F):** every row below that needs a real model. This plan's job is to make each one
  runnable (fixture current, Adolion variant built, command written) and to hand the list to plan 13 R5.
- A row whose defect only reproduces with a model gets one targeted run to prove its fix, recorded as such.

## Rules

- **The baseline and corpus follow overview rules 1–2.** A row keeps its v2.5 fixture unless an Adolion variant exists.
  The Adolion variant then runs as an extra column, not as a replacement, so the toy row still guards regressions.
- **Every row lands in its own v2.5 plan's gate record** as `## Gate record (v2.6 carry-over, bundle <sha>)`, and is
  listed here. The v2.5 doc remains the home of the row.
- **Mutant controls run in one window per batch.** A mutant build is served, the listed controls run, and the real build
  is restored (v2.5 overview rule 14). Each control must fail on the mutant.

## Rows

### Fixes after batch 2 (never live)

| Commit | Row that proves it |
|---|---|
| `7663bbb0` manual read passes the chat reader | J3.6, 04 N1, SP2 R4 |
| `76d93f02` group quiet/impersonate closes | J8.10, SP6 K2 |
| `9de35705` private block survives refresh | J5.8 |
| `e062314d` stop disposes the save watcher | E4 disable/enable cycle |
| `64491170` live-suite ledger entity type | F2 live suite |
| `a879b09b` save attributed to armed chat+story | C2 guard + control |
| `f972e24d` judge 429 = busy retry | J13 judge-on arm |

### v2.5 plans 01–08 (from their gate records)

| Plan | Rows |
|---|---|
| 01 | G1(a/b), G2, G5 and G8 (green ×1 in batch 2, write-up owed); G1(c) and G5 with the extension disabled; the mutant control (old `scanGatingActive()` guard); then the inv-14 rewording |
| 02 | C1 plus its mutant (no write check); C2 guard/control; C7 plus a J3 re-run in scan mode; A37; A11 forced arm; A6 and A11 mutants; four host-fact rows; lane reseed |
| 03 | J1, J5, J7, J8, J9 and J10; MemorizeBacklog; turn-types and mutation checks; E4 cycle; E2 sweep; F2/F3; reply-path p95 |
| 04 | N1 re-run; K0 scored into the record (Adolion variant from v2.6 02 D5) |
| 05 | F2 live suite (toy + Adolion D6); J3/J12 after F1a; the F7 CC arm; F3 arm report read into a verdict |
| 06 | J13 judge-on arm (after `f972e24d`); `recommended-config.md` updated to the curator row's bundle; J4/J5 Phase 0 docs |
| 07 | `test-storybook` red/green run for A3; A4 buckets on a CC profile lane |
| 08 | **G-L1 U6 file-mode fallback** (red ×3; treated as a product defect until shown otherwise; diagnose first); G-L4 P2; G-L5 X5 and the story-flag column; L6 step-0 J7 replay; G-J; the Copilot `setLoreSelect` drops `exclusive` (S, fix) |

### v2.5 plans 11–19

| Plan | Rows |
|---|---|
| 11 | `test-storybook:ci` from the main checkout. The human rows J1.8, J1.9, J10.9 and J10.10 move to plan 10 |
| 12 | Live-pending SV, EG, FR, UN, BR, UP, JP, E3, SM 1–4, PS-J 2/3/5/6 and the dev-switch refusals. Rows that depend on decisions A1/A2 wait on those decisions |
| 14 | C1, C2 and C5–C10 live legs; C11 token measurement (v2.6 02 D10); the `test:release` UP/clean-host failure recorded at the time |
| 15 | the automatic image cue firing on a real checkpoint transition |
| 16 | fifth-reply cadence; cadence and cue landing on the same reply; the ComfyUI loop deadline |
| 17 | Pass D/E playtests (machine-driven); cadence |
| 18 | the commit guard triggered live (a planted refusal); `runtimeManager.ts` budget entry |
| 19 | free-text cadence; cadence and cue collapse in real play; Pass D/E; the F1 evidence truncation (160 chars) and the stray progress write (fix or record); a clean fresh-Saga replay |

## Order

Batch A covers the post-batch-2 fixes and the rows that only need the toy fixtures. It runs first and is the cheapest.
Batch B covers the Adolion columns and plans 14–19. It runs after v2.6 02's D1 corpus exists, because several of its
rows read their cadence from that corpus. The G-L1 U6 diagnosis runs before either batch.

## Gate

Every row above is green ×1, or red with a filed defect and its fix, or deferred with a signed reason. The v2.5 plan
docs carry the results.

## Gate record (no-LLM half, 2026-09-30)

Branch `worktree-agent-ad7efe9538a00d38e`, master merged at `fb31e640`. Lane 3 only. No real-LLM run: before the
no-LLM batch the lane copy's `api_key_*` secrets were removed and the judge switched off, so any hidden model call failed
fast instead of reaching a model (that is how A37 and C7 were reclassified below). Records: `test/journeys/records/v2.6-01/`.

**Staging.** `st-lanes.mts status` showed no lane running (lanes 0-3 down). The ST slot was restaged twice from this
worktree (`npm run build:dev && npm run stage -- --flavor dev --st-root C:/dev/SillyTavern-MainBranch`): dev bundle
`c001f0fa8526` (Saga fix), then `f8eaa0675102` (E4 fix). The main ST server on :8000 was up; it serves the same slot on
its next reload. The slot was left on `f8eaa0675102` (master `25b32284` + this branch).

### G-L1 U6 diagnosis: not a product defect (harness race)

- The three red attempts (batch 2, `bffdec6b^:test/journeys/records/v2.5-batch2/plan08/G-L1-U6-file/`):
  - attempt 1 failed at the seed step (window `0..0`; already fixed in `a6cf0d0c`);
  - attempts 2 and 3 failed at "the chat did not record its mirror book: null", right after the scene pass. Attempt 3's
    state shows `scheduler.inFlight: true`, `auditCount: 0`, memory = 1 `scene_history` row.
- Cause: the mirror writes relationship facts only (`mirroredEntries`, `memoryMirror.ts:66`; scene rows are deliberately
  not mirrored). A scene-only memory skips as `nothing-live`, so no book exists until real extraction lands a relationship
  fact. The fixture asserted the book right after the scene pass, racing the in-flight read (attempt 2 also had a 3 s
  second turn). Attempt 1 passed that step because its read had landed.
- Proof: jest `memoryMirror.test.ts` "in file mode the book is adopted by the first relationship fact, never by a scene
  summary" (characterises current code; passes).
- Fixture fixed (`live-memory-mirror.json`): asserts FILE mode, waits `schedulerIdle`, seeds its own relationship fact
  before asserting the book, `expectReply` on every turn, second seed has a distinct text. Its live leg is a final-suite
  row (01-v25-08).
- New no-LLM half `test/scenarios/memory-mirror-file.json`: scene-only memory → no book, no bound slot; first relationship
  fact → book created, listed, pickers, bound, server file holds an `so_` entry; second sync no-op; `checkWorldInfo` dry
  scan activates the mirror entry. Lane 3 ×2 green (`no-llm/memory-mirror-file-run{1,2}.log`), mirror books deleted by
  cleanup.

### Saga cast disagreement (plan 02): product defect, fixed

- Reproduced on lane 3 (`saga-cast/lane3-seed.log`, `run1-*`): after the seed the Saga group kept 17 members disabled,
  exactly the first 17 names of its start checkpoint's disable list; every other group left behind read 0. Plan 02's
  "Leila, Naomi" was mis-read: the lane 1 vs lane 2 difference was Leila and Welden (indices 17-18).
- Cause (`saga-cast/run1-saga-ledger-read.md`): the effect ledger kept its newest 200 rows whatever their status. The Saga
  start writes 119 cast rows; a concurrent hydrate apply duplicated rows and 15 write-aheads were refused, so the oldest
  APPLIED rows were evicted and the leave-restore could not put those members back. The count depends on timing (17/19).
- Fix: `trimLedger` (`effectLedger.ts`) trims settled rows only, oldest first; an applied/pending row it still owes a
  restore is never dropped. `extras.ts` uses it on hydrate. Red first: 2 new cases in `effectLedger.test.ts` failed on the
  old slice. Defect replay `effect-ledger-evicts-owed-restore` kills the old slice.
- Harness: `adolion-fresh` now judges the cast by the OPEN group (its start cast in force; every other group must read 0,
  a leftover is "cast left behind after its chat was left"), waits for the start cast after each import (a shortfall is
  a note: a refused write-ahead is re-applied by the next hydrate), and keeps extraction OFF for the whole seed. The old
  seed never switched it off, so every import made real extraction reads through the lane's copied DeepSeek profile
  (27-32 completions in lane 3's `server.log` across the two seeds; plan 02's seeds did the same).
- Fixed seed (`saga-cast/lane3-seed-fixed.log`, `run2-*`, bundle `c001f0fa8526`): `problems: []`, Saga 0 disabled, the
  open group (Fire and War) holds its 13, 9/9 ready. Exit 1 only for the drift from the defect run (`disabled: 17 vs 0`).
- Recorded here as open, since fixed (plan 15 AS-10, `15-review.md` "Review fixes AS (product)"): the ledger's live
  rows were unbounded by design (a long saga kept every applied cast row until left or rolled back), and one checkpoint
  was applied twice on import (activate + hydrate). Now `compactLedger` (inside `trimLedger`) drops no-op rows and merges
  chained rows on one target at one message, and `EffectsApplier.applyCheckpoint` is a door: a hydrate of the same
  checkpoint in the same chat awaits the running apply. Tests: `effectLedgerCompaction.review.test.ts`,
  `effectsDuplicateApply.review.test.ts`.

### Rows run now (no model)

| Row | Result | Record |
|---|---|---|
| G-L1 U6 no-LLM half | green ×2 | `no-llm/memory-mirror-file-run{1,2}.log` |
| 03 E2 sweep (player clean after a failed pass) | green ×2, new fixture `test/scenarios/e2-failed-pass-player-clean.json` (the pass fails for real: no key) | `no-llm/e2-sweep-run{1,2}.log` |
| 03 E4 disable/enable cycle (no-LLM half) | **red on the first run: `storyOrchestratorWizardAgent` survived stop** (set at module scope by the lazy Studio chunk, outside the mount registry). Fixed: registered through `ui.global` from `index.tsx`; guard `src/studio/lazyGlobals.guard.test.ts` + replay `studio-chunk-global-outlives-stop`. Fixed bundle `f8eaa0675102`: green ×2 (4 roots → 0, 17 globals → 0, `{{story_title}}` unresolved, reload restarts) | `no-llm/e4-stop-run1.log`, `e4-stop-fixed-run{1,2}.log`, `e4-reload-run{1,2}.log` |
| 03 mutation check | green ×2 | `no-llm/mutation-check-run{1,2}.log` |
| 03 turn-types (`--image synthetic --skip-reply`, group "Group: Arin, DM Narrator") | run 1 green (b, c, d-reopen, d-swipe, e-*); run 2 green except `d-solo`: "no usable solo character" (the lane has three candidates with alternate greetings and run 1 left none usable). Harness candidate pool, not product. Never `/sd`. | `no-llm/turn-types-run{1,2}.{log,json}` |
| 07 A3 Storybook red/green (+ 11 `test-storybook:ci`) | green: 41 suites / 289 tests; red (the two A3 `src` hunks reverted): 1 failed, `RowsKeepTheirWidthUnderStCss` "expected 21.98 to be greater than 80". `test-storybook:ci` itself finds no tests from a worktree (jest rootDir resolves through the `node_modules` junction to the main checkout); run with `--index-json` as plan 07 prescribes | `storybook/test-storybook-green.log`, `a3-red.log`, `test-storybook-ci.log` |
| 01 scanGatingActive mutant | now a deterministic kill: replay `scan-mode-file-writes-before-gating` | `test:replay` |
| 02 C1 mutant (no write check) | deterministic kill: replay `npc-stream-lands-in-next-chat` (5 failing) | `test:replay` |
| 08 Copilot `setLoreSelect` drops `exclusive` | fixed (parser, prompt, tool doc); red first in `parse.test.ts`; replay `lore-select-drops-exclusive` | `test:replay` |
| 02 A37 output budget | **needs a model** (asks every role's profile; failed fast with no key). Final suite | `no-llm/live-v25-02-a37-output-budget-run1.log` |
| 02 C7 note order | note-before-onEnter half passed; the onEnter NPC reply is an LLM reply (5 min wait, no key). Final suite | `no-llm/live-v25-02-c7-note-order-run1.log` |
| Run header around the batch | 6 blocking paths, all build/bundle (the declared mid-batch restage); no inventory, library or settings residue | `no-llm/header-diff.json` |

Harness fix found on the way: `st-navigation.mts open-group` failed on an `adolion-fresh` lane because the character list
pages groups out of the DOM (175 entries, 50 per page); it now falls back to `openGroupById`.

### Vacuous extractor needles (plan 13 decision)

14 fixtures fixed: 4 live-scoped claims (`extractor12` pact, `17` nightingale, `18` toma, `19` official; `scope: "live"`
because the hand goldens carry no FACT line), 1 negative (`extractor13` never mentions a chest), 9 explicit
`facts: { none: "<reason>" }`. The scorer and the inventory understand `none` and `scope`, and flag a spec that claims
nothing (`no assertion`). The live needles were chosen from the transcript's own durable content with the 2026-09 live
goldens visible; jest asserts they hold on those archived answers. The facts column now scores 5 of 29 fixtures honestly.

### Rows handed to the final suite (plan 13 R5)

`test/findings/suite-decisions.json` carry-over rows are real now (commands, plan 14 tier per row) and
`13-final-suite.md` / `13-decisions.md` are regenerated (`node scripts/suite/decisions.mjs`). Not run here and why:
- every row needing a model (E4's one real turn, F2 live suite, J13 on-arm, G1/G2/G5/G8 real books, C7 reply, A11/A6,
  MemorizeBacklog, N1/K0, F7 CC, A4, G-L1 U6 live, G-L4/L5, G-J, plans 14-19 legs);
- C2 guard/control (no model, but its attempt script hard-codes lane 1's 2026-09-26 sandbox chat and story; needs a
  rebuild on a fresh lane) — open;
- plan 12 SV/EG/FR/UN/BR/UP/JP/E3/SM/PS-J and the dev-switch refusals (no model, but they restage prod, reinstall the
  server plugin or need a separate ST tree; every lane shares one ST tree, so they would change the slot the main ST and
  other agents serve) — deferred to plan 10 phase F step 1 on a clean-host tree;
- the four host-fact rows (one-shot facts) and plan 18's `runtimeManager.ts` budget entry — not reached.

### Overall gates (after merging master `fb31e640`)

| Gate | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run typecheck:test` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | 357 suites (1 skipped), 4775 tests pass (1 skipped) |
| `npm run build` | exit 0, bundle `53266bcc965f` |
| `npm run build:dev` | exit 0, bundle `550074d2e910` |
| `npm run test:debug` | 457 pass, 0 fail |
| `npm run test:release` | 77 pass, 0 fail, 2 skipped |
| `npm run test:replay` | baseline 459 tests green; 30 of 30 killed (5 new: scan-mode-file-writes-before-gating, npc-stream-lands-in-next-chat, lore-select-drops-exclusive, effect-ledger-evicts-owed-restore, studio-chunk-global-outlives-stop) |

Lane 3 stopped after the batch (its copy lacks its API keys until the next `adolion-fresh seed 3`).

### 2026-10-01 — C2 attempt script rebuilt (plan 15 AS-15)

`scripts/debug/so-c2-save-race.mts` (+ `lib/c2SaveRace.mts`) seeds its own sandbox (pinned group, `/newchat`, its own story and solo chat), alternates guard and control, cleans up, and refuses any chat it did not create, including the old lane-1 ids. Command: `node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-c2-save-race.mts run --group <id> --attempts 2 --out test/journeys/records/<gate>/C2/run-1.json`. Not run live: C2 is not live-green. Gates and the full table: `15-review.md` §Review fixes AS (measurement).
