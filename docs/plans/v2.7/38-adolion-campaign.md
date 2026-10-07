# Plan 02 — Adolion campaign: lab data, playtest fixes and the v2.8 campaign rows

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
| A4 | **Lab data for v2.8 measurements:** about 20 labelled relationship-read windows (v2.8 20 M1); a lab copy of the academy act with quest-shaped qualities (v2.8 18 M1/M2), whose existing 0–3 clue counter is a natural first quest; stretch-length data for v2.8 19 (how long the 13 downtime/road stubs ran in the v2.6 sessions). Labels drawn from session evidence get a second-model check, never the user (review B4) | v2.8 18/19/20 gate on Adolion-lab measurements | those plans' formats | D (data), CL (second-model label check) |
| A5 | **Playtest fix round:** campaign-side findings from the user's sessions, each citing its session (rule 3) | the user's own play | playtest | D |
| D13a | **`player` blocks:** one story `player` profile per story (nine), from the authored player copy; checked by `scripts/check_player_copy.py` (spoiler terms) extended to `player` text; content review by an independent model, not the user | v2.8 03 decision 6 ("Adolion gets `player` blocks after the format lands") | v2.8 03 format built | D + CL (review model) |
| D13b | **`render_sprites.py` paths off `C:`:** `COMFY_DIR` and the Python path are hard-coded (`scripts/render_sprites.py:102-103`, both on `C:`); take them from env/config, put model weights and caches on the non-`C:` drive, start ComfyUI through the tray entry instead of `subprocess.Popen` (rule 5) | models off `C:`; every server in the tray | tray ComfyUI entry (exists, 2026-10-03) | LI (one set re-rendered byte-equivalent or QA-equivalent) |
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
- D13b: tray status OK for ComfyUI; no model or cache path on `C:` (asserted by the script at start).
- D13d: cue reads per turn on the lab hub checkpoint recorded before and after; no gating transition loses its trigger.

## Links

v2.7 07 (A1–A3, A6–A8), v2.8 03 (player profile), v2.7 17/18/19/20 (images and sprites), v2.8 15 (cue reads), v2.8 18,
19, 20 (pilots), v2.8 01 §F (lab ratings via Astra).

## Review 2026-10-03

Applied: D13 (rows D13a–D13d), C7 (D13d with a coverage gate), D15 (D13e dated inventory), B4 (second-model labels in
A4/D13a), F36 (the old "22 open stretches" pilot row is v2.8 19). A6 badge validation moved to v2.7 (Sol split item 7).
