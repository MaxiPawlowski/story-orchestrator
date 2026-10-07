# Version split and renumbering (2026-10-03)

The v2.7 set was split by the user: **v2.7** = urgent fixes + quick wins whose gates are deterministic (`npm run gates`,
no-LLM scenarios, Storybook; no full LLM suite); **v2.8** = the rest of the defined plans; **v2.9** = everything deferred.
Old numbers (left) are the v2.7 build-order numbers used before this date.

| old v2.7 | new |
|---|---|
| 01 docs-and-in-app-guidance | v2.7 01 |
| 02 v26-carry-in | v2.7 02 (C3/C4/C12, model parts of C11 and owed real-model acceptance rows → v2.8 01) |
| 33 group-chats-only | v2.7 03 |
| 31 story-health-center | v2.7 04 (core; consumers land with their features) |
| 03 story-briefing | v2.7 05 (static briefing, modal, Studio editor, C8 onboarding); LLM drafting → v2.8 10 |
| 04 story-presence-ui | v2.7 06 (A plays index, B badges, the panel frame, per-story toggles, C1–C3, C6, C9 (b) author chips + Activity panel + roll store; user-approved 2026-10-03); C4, C5, C7, C9 (a) public roll chips → v2.8 04; C8 → v2.7 05 |
| 05 adolion-campaign | v2.7 07 (A1–A3, A6, A7, A8); A4, A5 and new campaign rows → v2.8 02 |
| 06 thinking-per-story | v2.7 08 (warning, built); story/checkpoint level (R4) → v2.8 01 |
| 07 commitment-double-negatives | v2.7 09 |
| 08 sp2-recommit-v2 | v2.7 10 (option C, built); option A → v2.8 01 |
| 09 c4-option-b-restage | v2.7 11 (close); E → v2.9 05 |
| 10 model-choice | v2.7 12 (decision + docs); funded thinking A/B → v2.8 01 |
| 10a model-switch-checklist | v2.7 12a |
| 11 warden-lore-one-request | v2.7 13 (close) |
| 13 b10-cli-judge | v2.7 14 (drop as runtime judge; role picker + per-source context table) |
| 16d sp10-tool-call-turns | v2.7 15 (B + C); the rest → v2.9 05 |
| 16 spike-defers (index) | removed; its four children are below |
| 30 player-persona-and-start-setup | v2.8 03 |
| 26 self-contained-images | v2.7 17 |
| 26b sprite generation (no file before) | v2.7 18 (new) |
| 28 talkinghead-review | v2.7 19 talking-sprites (rig option D → v2.9 05) |
| 32 living-cards | v2.7 20 |
| 27 wizard-assistant | v2.8 09 |
| 12 curator-create-op | v2.8 11 |
| 20 j6d-shadow-record | v2.8 12 |
| 14 j7-judge-ideas | v2.8 13 |
| 15 open-source-jev | v2.8 14 |
| 21 cue-scene-read-merge | v2.8 15 |
| 16a sp5-story-scenario | v2.8 16 (C1 SP5.b itself is v2.7 02 C1) |
| 16b sp6-complication-pool | v2.8 17 |
| 19 quests-and-game-layer | v2.8 18 |
| 17 open-stretches | v2.8 19 |
| 18 character-life | v2.8 20 |
| 29 smart-context-harvest | v2.8 21 (E0 + offline group evaluation); runtime verbatim recall → v2.9 05 |
| 24 living-story-director | v2.8 22 |
| 23 d6-t22-revisits | v2.9 04 (decision); Claude's over-steer card + session → v2.8 01 |
| 16c sp1-swipe-back-cache | v2.9 01 |
| 22 sp9-witness-filter-v2 | v2.9 02 |
| 25 new-game-plus | v2.9 03 |

## 2026-10-04: the image track returns to v2.7

The four image plans and the Belle pilot were briefly numbered v2.8 05–08 + `v2.8/image-pilot.md`, then moved to v2.7
by the user on 2026-10-04. Final homes:

| brief v2.8 | v2.7 |
|---|---|
| 05 self-contained-images | v2.7 17 |
| 06 sprite-generation | v2.7 18 |
| 07 talking-sprites | v2.7 19 |
| 08 living-cards | v2.7 20 |
| `image-pilot.md` | v2.7 21 (Belle pilot record) |

The v2.8 numbers 05–08 are retired and not reused. Their live acceptance (LI/CL/RP) stays owned by v2.8 01 / the
final suite under v2.7 rule 5; v2.7 rule 13 records the split.

Also moved on 2026-10-04 (current work, never numbered in v2.8):

| brief v2.8 | v2.7 |
|---|---|
| `local-residency.md` (untracked draft) | v2.7 22 |
| `local-residency-freetoken.md` (untracked draft) | v2.7 23 |

v2.7 rule 14 records that plans 22–23 keep their own LT/LI live rows.

## Review 2026-10-03

Round 3 (Sol): R3-19 applied.

## 2026-10-07 re-scope (user)

v2.7 re-scoped for player experience; every test re-runs from zero (v2.7 39).

| old | new |
|---|---|
| — | v2.7 29 settings by area (new) |
| — | v2.7 30 in-plugin guide (new) |
| — (v2.7 22/23/25 FLUX + tooling clean-up) | v2.7 31 FLUX out, product vs local tooling |
| v2.7 17–21, 24, 26, 28 (product pieces) | v2.7 32 images and living characters |
| v2.8 01 §C, v2.9 04 option D, v2.8 13 N1/N6/J7.2, v2.8 04 C5 | v2.7 33 player loop fixes |
| v2.8 03 | v2.7 34 (file moved) |
| v2.8 17, 18 Q6, 19, 13 N3/N5 | v2.7 35 world pressure and open stretches |
| v2.8 18 Q1–Q5, 04 C4/C7/C9a, 23 option A | v2.7 36 quests and story panels |
| v2.8 20 | v2.7 37 (file moved) |
| v2.8 02 (+ v2.7 07 live rows, v2.7 28 Saga assets) | v2.7 38 (file moved) |
| v2.7 16 close-out, v2.8 01 §A owed rows, v2.8 24 rows for v2.7 plans | v2.7 39 Phase C |
| user ideas 2026-10-07 | v2.8 25–30 |
