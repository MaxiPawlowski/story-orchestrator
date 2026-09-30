# Plan 01 — Carry-over live proof: every open v2.5 row, on the new baseline

**Status: DRAFT 2026-09-30, awaiting user approval.**

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
