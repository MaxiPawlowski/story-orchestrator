# Plan 38 — Adolion campaign: lab data, playtest fixes and the campaign rows

> **Moved 2026-10-07: now v2.7 38** (was v2.8 02; user: the Adolion campaign in v2.7). Also owns: v2.7 07 A3/A6 live rows; the Saga main-cast assets and 31 authored outfits from v2.7 28; the stub lab copy for v2.7 35 M2 (v2.8 19:205 hand-off); the campaign scripts and lane-pinned scenarios split out by v2.7 31 §B. D13b (weights off `C:`) is superseded by the image-model exception (v2.7 rule 8). Integration ×2 is v2.7 39 C7.

**Status (2026-10-03): v2.8 plan 02 (A4, A5 from v2.7 07, was v2.7 plan 05; new rows from review D13). Decided ("do all if
you can"); nothing here started.** Overview: `00-overview.md`. Campaign repo: `C:\dev\adolion-campaign` (HEAD `8012a61`
on 2026-10-03, after v2.7 07 A1).
**Gate tiers** (00-overview §Gate taxonomy): implementation D (campaign repo, offline checks); acceptance LI (sprite
renders), CL/RP (lab runs on the plugin).

Campaign upkeep that needs no model (A1–A3, A6, A7, A8) is v2.7 07. This plan holds the campaign work that waits on a
v2.8 plan or on a model. No campaign story content is quoted here (rule 11): rows name files, counts and acts only.

**Model-storage correction (user, 2026-10-04):** image models stay on `C:` for autoload; the "off `C:`" clauses below
are about the campaign *script's* hard-coded `COMFY_DIR`/Python paths (portability), not the model location. The image
track (now v2.7 17–20) keeps the models where they are and copies nothing.

## Steps

| # | Step | Why | Depends on | Tier |
|---|---|---|---|---|
| A4 | **Lab data for the v2.7 35–37 measurements** (consumers renumbered 2026-10-07; review 2026-10-07 finding 23): about 20 labelled relationship-read windows (v2.7 37 M1); a lab copy of the academy act with quest-shaped qualities (v2.7 36 Q1 M1/M2), whose existing 0–3 counter is a natural first quest; stretch-length data for v2.7 35 M1 (how long the 13 downtime/road stubs ran in the v2.6 sessions) and the stub lab copy for 35 M2; the SP6 lab journeys (35 Phase 1). Labels drawn from session evidence get a second-model check, never the user (review B4). Needed before v2.7 39 stage B1 | v2.7 35/36/37 gate on Adolion-lab measurements before the freeze | those plans' formats | D (data), CL (second-model label check) |
| A5 | **Playtest fix round:** campaign-side findings from the user's sessions, each citing its session (rule 3) | the user's own play | playtest | D |
| D13a | **`player` blocks:** one story `player` profile per story (nine), from the authored player copy; checked by `scripts/check_player_copy.py` (spoiler terms) extended to `player` text; content review by an independent model, not the user | v2.8 03 decision 6 ("Adolion gets `player` blocks after the format lands") | v2.8 03 format built | D + CL (review model) |
| D13b | **`render_sprites.py` paths from config:** `COMFY_DIR` and the Python path are hard-coded (`scripts/render_sprites.py:102-103`, both on `C:`); take them from env/config, start ComfyUI through the tray entry instead of `subprocess.Popen` (rule 5). Model weights and caches stay where they are (v2.7 rule 8 exception; review 2026-10-07 finding 23) | portability; every server in the tray | tray ComfyUI entry (exists, 2026-10-03) | LI (one set re-rendered byte-equivalent or QA-equivalent) |
| D13c | **`--anim` frames:** blink/mouth variant frames per expression for the sets v2.7 19 animates, through the same edit pipeline, after spike S28 decides the frame count (2 vs 3) | v2.7 19 | v2.7 19 S28 + v2.7 18 builder contract | LI |
| D13d | **Narrow the campaign `extractor_trigger`s** (review C7): broad triggers made one lab turn produce 9 identical cue reads (`v2.8/15-cue-scene-read-merge.md` History). Tighten each to its transition's intent; `scripts/check_triggers.py` gains a coverage gate (every gating transition keeps a trigger that matches its labelled positive lines and none of its negatives) | v2.8 15 decision: "triggers first" | none | D (offline gate) + CL (one lab run: cue reads per turn before/after) |
| D13e | **Dated asset inventory** (review D15): one table in `docs/FEATURE-COVERAGE.md` with the date, and each count's denominator stated (sets covered vs PNG files vs expressions per set), so v2.7 17/18/19/20 cite one source | counts in v2.7 17 and 07 disagreed because they counted different things | none | D |

Trigger counts on 2026-10-03 (`build/story/*.json`, transitions carrying `extractor_trigger`): 15 to 69 per act story,
269 in the Saga.

## Pilots (v2.8)

| v2.8 plan | Fit | What the campaign needs |
|---|---|---|
| 04 story panels | nine bound groups, several chats each | a fresh lane with chats in several groups; badge and panel text uses only reached names |
| 18 quests | one act, not the Saga (decision 3: academy act) | A4 lab copy; `display.public` on a few existing ints |
| 20 character life | the 7-member act (decision 3) | relationship axes on that act; whether motives/drives become L3 agendas |
| 19 open stretches | the 13 downtime/road stubs | convert 2–3 stubs to open stretches on a lab copy; compare against v2.6 sessions |
| 03 persona | nine stories, two storyline families with different player characters | D13a |
| 07 talking sprites, 08 living cards | existing sprite sets | D13b, D13c |

## Decisions (from v2.7 07)

1. Do A1 and A2 now? **Recommended: yes.** do all if you can, i love those proposings
2. Pin move at the start of the v2.7 build, not before? **Recommended: yes.** yes
3. Which act pilots quests (v2.8 18), and which character life (v2.8 20)? **Recommended: the academy act for 18, the
   7-member act for 20.** sure

Decisions 1 and 2 are carried out in v2.7 07. Decision 3 holds here.

## Gates

- Campaign repo: `check_all.sh --fast` (v2.7 07 A2) green after each row; `validate-stories` on all nine plus the
  tutorial example; `check_player_copy.py` and `check_triggers.py` with the new coverage rule.
- Plugin side: any campaign change that reaches an adolion-fresh lane moves the pin once and re-freezes `test:debug`
  integration runs in the same change (v2.7 07 A3 rule).
- D13b: tray status OK for ComfyUI; `COMFY_DIR` and the Python path come from env/config, and no hard-coded `C:`
  script path remains (asserted by the script at start). Model and cache locations are NOT asserted: the existing
  image models stay on `C:` (v2.7 rule 8; header and §Model-storage correction; review 2026-10-07 finding 23).
- D13d: cue reads per turn on the lab hub checkpoint recorded before and after; no gating transition loses its trigger.

## Links

v2.7 07 (A1–A3, A6–A8), v2.8 03 (player profile), v2.7 17/18/19/20 (images and sprites), v2.8 15 (cue reads), v2.8 18,
19, 20 (pilots), v2.8 01 §F (lab ratings via Astra).

## Review 2026-10-03

Applied: D13 (rows D13a–D13d), C7 (D13d with a coverage gate), D15 (D13e dated inventory), B4 (second-model labels in
A4/D13a), F36 (the old "22 open stretches" pilot row is v2.8 19). A6 badge validation moved to v2.7 (Sol split item 7).

## C7 integration criteria (proposed 2026-10-07, test review; frozen before the first run)

v2.7 39 C7, each of the nine stories on `adolion-fresh`, ×2: **N = 12 player turns** (the Saga: 20, crossing one
chapter seal if seals are on). Pass per story: every reply rendered; one boundary committed per reply; no `error` or
stalled pipeline state for > 2 consecutive turns; at least one checkpoint transition by turn N (stories whose first
exit needs more turns declare their own N in the campaign story index); reopen after turn 6 restores the same
checkpoint, memory counts and talk state; one swipe + one edit roll back and replay to the same state; save health ok;
`assert-player-clean` green; no ComfyUI call unless the story enables images. Reports carry pass/fail and counts only
(no campaign content; v2.7 rule 11).

**Added by review 2026-10-07 (finding 18):**
- "Replay to the same state" means the run's captured accepted inputs (audits, accepted deltas, typed reads) applied
  to the edited chat (v2.7 39 rule 12). It does not mean a regenerated reply.
- The story that pilots character life (the 7-member act, decision 3) must exercise it on each run: ≥ 1 relationship
  axis moved by a read, ≥ 1 agenda step advanced and reverted by the swipe, ≥ 1 schedule drop driven by the story
  clock, ≥ 1 mood re-read at a scene break. Without them the run is INCOMPLETE for that story, not a pass. The quest
  pilot (academy act) needs ≥ 1 quest activated and ≥ 1 step done. Counts only in reports.

Owned here from v2.7 31 §B: the Saga/campaign scripts (`so-saga-*`, `saga-*.py`, `so-adolion-rollout`,
`so-production-rollout`) and lane-pinned scenarios, de-pinned to `requires.group` by name.

## Review 2026-10-07 (Sol)

Source: v2.7 39 §Review 2026-10-07 (Sol). Campaign references stay abstract (rule 11).

| Finding | Change | Where |
|---|---|---|
| 18 | C7 must exercise the new character-life (and quest-pilot) behaviour, or the run is INCOMPLETE; replay means captured accepted inputs | §C7 integration criteria |
| 23 | D13b and its gate line now match the header: script paths from config, models stay where they are (rule 8 exception); A4's consumers renumbered to v2.7 35/36/37 and due before 39 stage B1 | §Steps A4, D13b; §Gates |

## Gate record (2026-10-07, deterministic rows)

Campaign branch `v2.7-38` (from master `40dd2d0`), not merged or pushed: `b1b9002` D13b, `c576932` D13e, `d4c7627`
D13a, `9d493da` D13d, `f58a509` A4, `35ad032` D13d follow-up. Pin moved to `35ad032` (branch `v2.7-38`; move it to the
master commit when the branch merges); `so-session.mts index` re-froze the story index, charters and plan 14 cards,
and `test/measurements/v2.6-09/runs.json` takes the same commit (route files unchanged, hashes hold). Counts only
(rule 11).

| Row | Built | Counts |
|---|---|---|
| D13b | render scripts read ComfyUI dir, Python, output dir and tray file from env or a gitignored local config; start goes through the tray entry; a check refuses a drive-letter path in the render scripts | 0 machine paths left; LI re-render owed |
| D13e | dated asset inventory table in `docs/FEATURE-COVERAGE.md` with denominators, generated by `scripts/asset_inventory.py` | 146 characters, 201/201 sets, 2889 expressions, 4544 PNGs, 146 cards, 16 lorebooks / 600 entries, 9 stories |
| D13a | one `player` profile per story (8 act stories + Saga, two families); `check_player_copy.py` checks the profile (present, no fixed name, caps, no macro or quality key, no spoiler term) | 9/9; control test catches a missing profile and a planted term; plugin `player-spoiler-risk` hit once, fixed |
| D13d | triggers narrowed; a trigger only where a gate reads an extractor quality; `check_triggers.py` coverage, negatives and sibling cross-cue rules; `scripts/trigger_report.py` | 514 → 493 triggers; v2.6 session stay turns cued 274/495 → 117/495, exit turns cued 81/96 → 58/96; 227 cases, 267 cue lines, 6 negatives |
| A4 | `lab/life`, `lab/quests`, `lab/stretches` in the campaign repo (counts-only data stays there: this repo is public) | life: 6 members, 16 axes, 3 agendas, 1 schedule, 20 windows, 20 voice rows; quests: 3 quests + arms 0/5/10/20, 20 cases (14/6); stretches: 3 open stretches on 2 copies, M1 baseline 21 stubs / 9 visits |

Plugin changes: `checkQualitiesInScope` counts quest gates as scope (v2.7 36 gap: quest-only qualities warned
`quality-never-in-scope`); `src/studio/adolionPinnedBuild.test.ts` reads the pinned build through git (skipped when the
campaign checkout is absent) and asserts parse, no blocking/warning diagnostics, the D13a/D13d/A4 shape counts.

Gates:
- `ST_ROOT=… npm run gates -- --no-storybook`: all green in 271.4 s (jest 6824 passed, 1 skipped). Storybook skipped:
  it cannot run from an agent worktree. The pinned-build test takes about 268 s of the jest phase.
- Campaign `check_all.sh` (full, harness included, against this worktree): ALL GREEN, harness 94/94, check_lab 12/12.
  The first full run failed commit-evidence calibration on 3 stories (narrowed triggers are the guard's intent);
  fixed in `35ad032`.
- `adolion-fresh` lane checks not run (not offline).

Deviations: trigger tuning is in-sample on the same v2.6 sessions; the stub baseline is thin (9 visits); A4 labels and
D13a profiles need a content review by another model before B1. Owed: A5, D13c, the D13b LI re-render, the D13d CL
cue-read run, every v2.7 39 B1 measurement on these labs, the C7 rows.
