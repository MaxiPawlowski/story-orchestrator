# Plan 14 review pack (joint review with the user)

**Status:** being written during Part B (2026-10-01). Sections fill in as tiers finish. Evidence lives under `test/sessions/<tier>/`; findings and fixes in `14-findings.md`.

## For you to look at (decisions and ratings)

| # | Item | What you do | Where |
|---|---|---|---|
| 1 | **Blind model comparison pack** — 20 real turns, each answered by the 2–3 finalist setups from the A100 server/model experiment (Artemis v1.1 with fixes, Artemis v1.2, Cydonia-24B-v4.3, …), shuffled and unlabelled; the answer key is sealed separately. A judge model's first pass is kept apart from your scores. | Rate each turn blind. Your rating picks the model for the remaining tiers. | `test/sessions/rating-pack/model-blind-20/` (built after the A100 run) |
| 2 | **Server/model configuration** recommended by the A100 experiment (template thought channel, KV precision, DRY settings, slots, quant) | Approve the production config | `15-model-config.md` §Server-flag A/B, kit in `C:\dev\so-lanes\artemis-flags\` |
| 3 | **Your real install's profiles** (not edited by me; your ST was running): stale `Artemis RunPod` (instruct/preset), dead `Story Orchestrator Memory Local` (:1235), RP system prompt on memory/image profiles; the selected profile "Artemis Local (Unsloth)" on :18888 answers "Not authenticated" | Apply the script in `15-model-config.md`, or do it in the UI; delete `Memory Local` if you agree | `15-model-config.md` |
| 4 | **Transition chat note now OFF by default** (W11 left it to the sessions): it blocked swiping/regenerating the reply that moved the story; the inline timeline already shows transitions | Confirm or revert | `14-findings.md` T0 player surfaces |
| 5 | **D5 accepted** (SP7 chance rolls ship, `deep_swarm` as the example) with two caveats: `east_upset` can overturn a bout the party won; `night_moon` closes the talk option at the siege | Confirm the caveats are intended | SP7 report, `14-findings.md` |
| 6 | **C4 option (c) consequence**: after a `/cp activate` jump, a checkpoint that relied on an inherited scenario plays unstaged. T1-5 shows the cast side of it: `so-session start` jumped to Kelger Falls, only that checkpoint's cast changes ran, and Kayla and Erevan stayed disabled although the card has them travelling. Product semantics unchanged; the harness now takes the card's `setup.members` and enables them through `/member-enable`, verified, failing the start closed | Keep (c) or revisit (b) | SP5 report, `14-findings.md` T1-6 fix wave |
| 7 | **Campaign rewrites** I made from the findings: guidance stated as pressure not outcome (13 checkpoints), no closing "What do you do?", location `player_labels`, beat-title scene names (96), narrowed triggers, Spanish commit phrases removed | Skim the diff; veto anything | campaign `59e8821` |
| 8 | **Judge per-lane rate** set from an assumed 90/min account budget (TypeSafe documents none); since the T1-6 fix wave each lane gets 2x its even share (4 lanes: 45/min), because T1-4..7 together used at most 56/min and no lane log shows a TypeSafe 429 | Tell me your real TypeSafe limit if you know it | `14-findings.md` T1-6 fix wave |
| 9 | **House-rules judge OFF by default** (first exception to rule 5): re-measured on the campaign's `{{user}}` wording, below floor (broken 0.667 vs 0.85, untouched 0.959 vs 0.966); the judge cannot see the world book | Confirm off; v2.7 seed to give it lore context | `test/fixtures/judge/adolion-house-rules.json`, `v2.7-seeds.md` |

## Tiers

| Tier | State | Summary |
|---|---|---|
| T0 playable | done (3/3 valid) | `test/sessions/T0/SUMMARY.md` |
| T1 features | 3/7 done; 4 paused until the T1 fixes merge | `test/sessions/T1/SUMMARY.md` |
| T2–T7 | not started | — |

## Measurements

| Item | State |
|---|---|
| Model config audit | done, `15-model-config.md` |
| English judge re-measure | done, every use at floor, `15-judge-remeasure.md` |
| Plan 03 spikes | SP7 include, SP3 include (director), SP2 drop, SP9 drop, SP5 pending; SP8/SP4 running; SP6/SP1/SP10 not started |
| Artemis long-prompt degradation | sampler A/B done (no preset fix); server/model experiment on A100 running |

## Spend

`test/sessions/BUDGET.md` (pods by hand, DeepSeek/TypeSafe per session).

## Open questions for you

Collected from the table above; nothing else blocks.
