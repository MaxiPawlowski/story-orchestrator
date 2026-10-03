# Plan 05 — Adolion campaign: upkeep and v2.7 pilots

**Status: DRAFT 2026-10-03. Not approved, not built.** Repo: `C:\dev\adolion-campaign` (HEAD `fa3852a`). Overview:
`00-overview.md`. Plugin-side campaign findings live in `02-v26-carry-in.md` C6–C11.

## Current state (2026-10-03 review)

- Clean tree. `build_all` produces no diff. `validate-stories` passes on all nine stories plus the tutorial example.
- `scripts/debug/adolion-fresh.pin.json` pins `6d974d6`. HEAD is one docs-only commit ahead (the Astra review write-up).
- The Saga has 157 checkpoints, 179 qualities, 269 transitions, 125 roster members, 16 lorebooks and 12 chapters. Each act
  has 12–27 checkpoints and 7–40 members.
- Sprites: 2889/2889.
- Every v2.6 session finding on the campaign side is fixed. The review's 9 MEDIUM findings were fixed in `38ad45c`.
- **Plugin features not used:** `display` / any player-visible quality, per-checkpoint `reasoning`, authored
  `scaffolding`, `stop_on_player`, `allow_silence`, personas. The 13 A3 stubs rely on background generation.

## Steps

| # | Step | Why | Effort | Depends on |
|---|---|---|---|---|
| A1 | **Refresh `docs/FEATURE-COVERAGE.md` and `lab/README.md`** to the current plugin: reference commit, judge uses on by default, per-lab verdicts from `v2.6/03-*-restated.md`, a status column for F1–F8 / C1–C14 | the campaign's map for v2.7 authoring is 487 plugin commits stale | S | none |
| A2 | **Make `check_all.sh` portable.** Use `python` / `sys.executable` instead of `python3` (a broken Store shim on this box), add `--fast` (skip the 8+ min harness), delete the stray `build/story/adolion-adventurer.v6.json` | the check cannot run here today | S | none |
| A3 | **Move the pin once, at the start of the v2.7 build**, and re-freeze story-orchestrator's `test:debug` integration runs in the same change | `test:debug` went red the last time the pin moved alone (`v2.6/15-review.md`); moving it during the playtest re-seeds every lane | S | v2.7 build start |
| A4 | **v2.7 lab data:** about 20 labelled relationship-read windows (plan 18 M1); a lab copy of the academy act with quest-shaped qualities (plan 19 M1/M2), whose existing 0–3 clue counter is a natural first quest; stretch-length data for plan 17 (how long the 13 stubs ran in the v2.6 sessions) | plans 19/18/17 gate on Adolion-lab measurements | M | plans 19/18/17 approved |
| A5 | **Playtest fix round:** campaign-side findings from the user's sessions, each citing its session | rule 4 | M | playtest |
| A7 | **Story briefings:** one `briefing` per story plus Saga chapter briefings, built from the authored player copy and scenario framing, checked by `check_player_copy.py` (spoiler terms); content review by an independent model | the opening message lacks context (user, 2026-10-03) | M | plan 03 format |
| A8 | **Harness test vs current plugin types:** `tests/adolion.local.test.ts` fails `typecheck:test` on the plugin (12× `activeCheckpoint` possibly undefined since T6-1 typed it `Checkpoint \| undefined`); a left-over copy in the plugin turned master's gates red on 2026-10-03 | fix with guards in the campaign test | S | none |
| A6 | **Badge check:** the nine `groupStories` bindings (`build/st-groups.js`) show the plan 04 badge | first real consumer of plan 04 | S | plan 04 built |

## Pilots

| v2.7 plan | Fit | What the campaign needs |
|---|---|---|
| 04 story presence | nine bound groups, several chats each, shared members between Saga and acts | a fresh lane with chats in several groups; badge titles use only reached names |
| 19 quests | one act, not the Saga | A4 lab copy; `display.public` on a few existing ints (reputation, rank, debt-like, some already ledger-bound) |
| 18 character life | strongest: motives, drives, per-member guidance and ledger bindings across 125 members | relationship axes on the 7-member act; decide whether motives/drives become L3 agendas |
| 22 open stretches | the 13 downtime/road stubs are exactly the case | convert 2–3 stubs to open stretches on a lab copy; compare against v2.6 sessions |
| 05 / 06 / 11 / 14 | `lab/swipes`, `lab/witness`, `lab/curator`, the campaign's own C4 finding | per plan |

## Decisions for the user

1. Do A1 and A2 now (campaign-only, no plugin change)? **Recommended: yes.** do all if you can, i love those proposings
2. Pin move at the start of the v2.7 build, not before? **Recommended: yes.** yes
3. Which act pilots plan 19, and which plan 18? **Recommended: the academy act for 19, the 7-member act for 18.** sure
