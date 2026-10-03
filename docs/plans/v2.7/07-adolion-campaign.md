# Plan 07 — Adolion campaign: upkeep that needs no model

**Status (2026-10-03): v2.7 plan 07 (was old v2.7 05). Decided ("do all if you can"). A1 and A2 DONE (campaign
`8012a61`, `b61639f`); A3 and A8 open (v2.7 overview step 0b); A6 waits on v2.7 06, A7 on v2.7 05. A4, A5 and the new
campaign rows (review D13) are `v2.8/02-adolion-campaign.md`.** Repo: `C:\dev\adolion-campaign` (HEAD `8012a61`).
Overview: `00-overview.md`. Plugin-side campaign findings live in v2.7 02 C6–C11 (C12, C13 also come from the campaign
lab; their model halves are v2.8 01).
**Gate tiers** (v2.7 overview §Gate taxonomy): implementation D (campaign repo, offline checks); acceptance D, plus a
second-model content review for A7 (CL, recorded in v2.8 02, never the user: rule 11).

No campaign story content is quoted here: rows name files, counts and acts only.

## Current state (2026-10-03 review)

- Clean tree. `build_all` produces no diff. `validate-stories` passes on all nine stories plus the tutorial example.
- `scripts/debug/adolion-fresh.pin.json` still pins `6d974d6` (review A10). HEAD is three commits ahead: one docs-only
  review write-up, then A2 and A1.
- The Saga has 157 checkpoints, 179 qualities, 269 transitions, 125 roster members, 16 lorebooks and 12 chapters. Each act
  has 12–27 checkpoints and 7–40 members.
- Sprites: 2889/2889 (denominator: see v2.8 02 D13e).
- Every v2.6 session finding on the campaign side is fixed. The review's 9 MEDIUM findings were fixed in `38ad45c`.
- **Plugin features not used:** `display` / any player-visible quality, per-checkpoint `reasoning`, authored
  `scaffolding`, `stop_on_player`, `allow_silence`, personas. The 13 A3 stubs rely on background generation.

## Steps

| # | Step | Why | Effort | Depends on | State |
|---|---|---|---|---|---|
| A1 | **Refresh `docs/FEATURE-COVERAGE.md` and `lab/README.md`** to the current plugin: reference commit, judge uses on by default, per-lab verdicts from `v2.6/03-*-restated.md`, a status column for F1–F8 / C1–C14 | the campaign's map was 487 plugin commits stale | S | none | **done** `8012a61` (refreshed to plugin `b2be37ab`) |
| A2 | **Make `check_all.sh` portable**: working-python detection, `--fast` (skip the 8+ min harness), delete the stray `build/story/adolion-adventurer.v6.json` | the check could not run here | S | none | **done** `b61639f` |
| A3 | **Move the pin once**, in the first v2.7 build step (step 0b), and re-freeze story-orchestrator's `test:debug` integration runs in the same change | `test:debug` went red the last time the pin moved alone (`v2.6/15-review.md`); moving it during the playtest re-seeds every lane | S | v2.7 step 0 | open (review A10: still `6d974d6`) |
| A8 | **Harness test vs current plugin types:** `tests/adolion.local.test.ts` fails `typecheck:test` on the plugin (12× `activeCheckpoint` possibly undefined since T6-1 typed it `Checkpoint \| undefined`); a left-over copy in the plugin turned master's gates red on 2026-10-03 | fix with guards in the campaign test; same change as A3 | S | none | open |
| A7 | **Story briefings:** one `briefing` per story plus Saga chapter briefings, built from the authored player copy and scenario framing, checked by `check_player_copy.py` (spoiler terms); content review by an independent model | the opening message lacks context (user, 2026-10-03) | M | v2.7 05 format | waits |
| A6 | **Badge check:** the nine `groupStories` bindings (`build/st-groups.js`) show the v2.7 06 badge, and the saga/act kind is right for each (Sol split item 7) | first real consumer of v2.7 06 | S | v2.7 06 built | waits |
| A4 | lab data for v2.8 measurements | | | | → v2.8 02 |
| A5 | playtest fix round | | | | → v2.8 02 |

## Pilots

All pilots are v2.8 plans now (v2.8 04, 18, 20, 19, 03, 07, 08); the table lives in `v2.8/02-adolion-campaign.md`
§Pilots. In v2.7 the campaign is the live consumer of v2.7 05 (A7) and v2.7 06 (A6).

## Decisions for the user

1. Do A1 and A2 now (campaign-only, no plugin change)? **Recommended: yes.** do all if you can, i love those proposings
2. Pin move at the start of the v2.7 build, not before? **Recommended: yes.** yes
3. Which act pilots plan 19, and which plan 18? **Recommended: the academy act for 19, the 7-member act for 18.** sure

(Decision 3's old numbers: 19 = v2.8 18 quests, 18 = v2.8 20 character life; it is held in v2.8 02.)

## Gates

- Campaign repo: `check_all.sh --fast` green after each row; `validate-stories` on all nine plus the tutorial example;
  `check_player_copy.py` extended to `briefing` text (A7).
- A3 + A8: on the plugin, `npm run gates` (incl. `typecheck:test`, `test:debug`) green with the new pin; one
  `adolion-fresh seed` + `check` on a lane (inventory diff accepted with a reason, `accept-baseline`).
- A6: the v2.7 06 live check on an adolion-fresh lane (D).

## Links

v2.7 05 (briefing format), v2.7 06 (badges, saga/act kind), v2.7 02 (C6–C13 campaign findings), v2.8 02 (A4, A5,
D13a–e, pilots), v2.8 01 §F (lab ratings via Astra).

## Review 2026-10-03

Applied: A10 (pin still `6d974d6`; moved in step 0b with A8), the Claude-A note on the header (C12/C13 also come from the
campaign), Sol split item 7 (A6 badge validation in v2.7), D13 (new campaign rows go to v2.8 02), A1/A2 recorded as done,
B4 (A7 content reviewed by a second model), B12 (references).
