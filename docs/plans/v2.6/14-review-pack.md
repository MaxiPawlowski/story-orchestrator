# Plan 14 review pack (joint review with the user)

**Status:** being written during Part B (2026-10-01). Sections fill in as tiers finish. Evidence lives under `test/sessions/<tier>/`; findings and fixes in `14-findings.md`.

## For you to look at (decisions and ratings)

| # | Item | What you do | Where |
|---|---|---|---|
| 1 | **Blind model comparison pack** — 20 real turns, each answered by the 2–3 finalist setups from the A100 server/model experiment (Artemis v1.1 with fixes, Artemis v1.2, Cydonia-24B-v4.3, …), shuffled and unlabelled; the answer key is sealed separately. A judge model's first pass is kept apart from your scores. | Rate each turn blind. Your rating picks the model for the remaining tiers. | `test/sessions/rating-pack/model-blind-20/` (`README.md` first; key sealed, sha256 in the README) |
| 2 | **Server/model configuration** recommended by the A100 experiment: server flags unchanged; the fix is three ST preset edits (the third found at T2 start: without it every reply that opens the thought channel came back empty). **Lanes run them from T2 onward** (`adolion-fresh` preset overlay, recorded per session); **your real install is unchanged and awaits you**: (1) Instruct template `Gemma 4`: set "Last Assistant Prefix" (`last_output_sequence`) to `<\|turn>model` + newline + `<\|channel>thought` + newline + `<channel\|>`; (2) Text Completion preset `Artemis v1.1 RP`: move `min_p` to the front of the sampler order (`["min_p","penalties","dry","top_n_sigma","top_k","typ_p","tfs_z","typical_p","xtc","top_p","adaptive_p","temperature"]`), save the preset; (3) Instruct template `Gemma 4`: untick "Sequences as Stop Strings" (`sequences_as_stop_strings: false`), or (1) turns `<\|channel>thought` and `<channel\|>` into stop words | Approve, then apply all three edits on your install (or ask me to, with ST stopped) | `15-model-config.md` §Server-flag A/B and §Lane preset overlay, kit in `C:\dev\so-lanes\artemis-flags\` |
| 3 | **Your real install's profiles** (not edited by me; your ST was running): stale `Artemis RunPod` (instruct/preset), dead `Story Orchestrator Memory Local` (:1235), RP system prompt on memory/image profiles; the selected profile "Artemis Local (Unsloth)" on :18888 answers "Not authenticated" | Apply the script in `15-model-config.md`, or do it in the UI; delete `Memory Local` if you agree | `15-model-config.md` |
| 4 | **Transition chat note now OFF by default** (W11 left it to the sessions): it blocked swiping/regenerating the reply that moved the story; the inline timeline already shows transitions | Confirm or revert | `14-findings.md` T0 player surfaces |
| 5 | **D5 accepted** (SP7 chance rolls ship, `deep_swarm` as the example) with two caveats: `east_upset` can overturn a bout the party won; `night_moon` closes the talk option at the siege | Confirm the caveats are intended | SP7 report, `14-findings.md` |
| 6 | **C4 option (c) consequence**: after a `/cp activate` jump, a checkpoint that relied on an inherited scenario plays unstaged. T1-5 shows the cast side of it: `so-session start` jumped to Kelger Falls, only that checkpoint's cast changes ran, and Kayla and Erevan stayed disabled although the card has them travelling. Product semantics unchanged; the harness now takes the card's `setup.members` and enables them through `/member-enable`, verified, failing the start closed | Keep (c) or revisit (b) | SP5 report, `14-findings.md` T1-6 fix wave |
| 7 | **Campaign rewrites** I made from the findings: guidance stated as pressure not outcome (13 checkpoints), no closing "What do you do?", location `player_labels`, beat-title scene names (96), narrowed triggers, Spanish commit phrases removed | Skim the diff; veto anything | campaign `59e8821` |
| 8 | **Judge per-lane rate** set from an assumed 90/min account budget (TypeSafe documents none); since the T1-6 fix wave each lane gets 2x its even share (4 lanes: 45/min), because T1-4..7 together used at most 56/min and no lane log shows a TypeSafe 429 | Tell me your real TypeSafe limit if you know it | `14-findings.md` T1-6 fix wave |
| 9 | **House-rules judge OFF by default** (first exception to rule 5): re-measured on the campaign's `{{user}}` wording, below floor (broken 0.667 vs 0.85, untouched 0.959 vs 0.966); the judge cannot see the world book | Confirm off; v2.7 seed to give it lore context | `test/fixtures/judge/adolion-house-rules.json`, `v2.7-seeds.md` |
| 10 | **The preset fix and inner voice conflict**: the empty thought channel (item 2, edit 1) stops Artemis from reasoning, so the inner-voice harvest (`memory.harvestReasoning`) gets nothing (T3-3 under the overlay: 0 of 85 replies had reasoning). Pick one per install: the overlay (fewer loops/dropped words) or thinking on (inner voice, loop risk); or a per-story choice (v2.7 seed) | Decide | `test/sessions/T3/T3-3-1`, T3-3 re-run without the overlay |

## Tiers

| Tier | State | Summary |
|---|---|---|
| T0 playable | done (3/3 valid) | `test/sessions/T0/SUMMARY.md` |
| T1 features | done (7/7 valid); fix waves T1-6 and T1-7 merged (one must-not-happen: foreign gated lore on the first reply after a chat switch, fixed) | `test/sessions/T1/SUMMARY.md`, `14-findings.md` |
| T2 memory | done (6/6 valid; DeepSeek outage 19:50–21:32Z cost 4 turns, flagged); 4 fix waves merged (secrets out of shared tiers, lost updates on chat leave, switch attribution, away recap, chapter seal/fold, warden lapse, party moves, beat holds); live check in T3 | `test/sessions/T2/SUMMARY.md`, `14-findings.md` |
| T3–T7 | not started | — |

## Measurements

| Item | State |
|---|---|
| Model config audit | done, `15-model-config.md` |
| English judge re-measure | done, every use at floor, `15-judge-remeasure.md` |
| Plan 03 spikes | SP7 include, SP3 include (director), SP2 drop, SP9 drop, SP5 include, SP8 tiers/spans include (digest dropped, below floor); SP3.b accepted (Phase B 2.01 / 2.87 per 50); SP4 English pairs running, distractor arm skipped (no bar, pod budget); SP6/SP1/SP10 not started |
| Artemis long-prompt degradation | A100 experiment done: flags not the cause; empty thought channel + min_p first fix most of it (lanes run it from T2); blind pack ready for rating |

## Spend

`test/sessions/BUDGET.md` (pods by hand, DeepSeek/TypeSafe per session).

## Open questions for you

Collected from the table above; nothing else blocks.
