# v2.8 work queue

Owner request 2026-10-10: every open feature, fix and measurement queued in one list. Work top to bottom; a row
starts only when the rows above it are done or blocked. Row detail lives in the linked plan or in the backlog
(`31-v27-wrap-backlog.md`, ids F/M/D). Mark a row done here with the commit, and in its source row.

## Now (running)

| # | Item | Source | State |
|---|---|---|---|
| N1 | Living story director: divergence detection, branch-on-divergence, one-checkpoint prefetch | 22, D6 | building; live check on the pod if ready |
| N2 | Wizard assistant on DeepSeek, guide coverage + task recipes | 09, D5 | building |
| N3 | Docs: review, quick start, "Choosing models", tested Artemis 1.1 baseline | owner 2026-10-10 | writing (`v2.8-docs-review`) |
| N4 | Pod round: curator create (M17), meanwhile auto (M16), lore exclusive (M10/F21), warden timeouts (M12/F22), widgets glance | 31 | running |
| N5 | Text vs Chat Completion, thinking on, fair config, blind rating pack | 15-model-config §3 | running on the pod |
| N6 | Merge N1–N3, full gates with Storybook, install | — | after N1–N3 |

## Fixes

| # | Item | Source |
|---|---|---|
| X1 | Long local chats overflow the 32K profile at ~turn 70; controller refuses and tries `normal` | F20. **Done** (`v2.8-local-3090`, commit in the backlog's §Local controller 2026-10-10) |
| X2 | Send latency on the 3090: the player's line waits behind other model calls (10–14 s worst); re-measure after the vector-yield fix, then fix what is left | F1, F18, F19, M11 |
| X3 | Model-file parity: 3090 runs v1m, pods v1.1 | F12. **Done 2026-10-10**: same v1.1 weights, different quantizer (TheDrummer's vs bartowski's Q4_K_M); 3090 serves 32768 |
| X4 | Owner flags from play | F14 |
| X5 | K3 lab check assumes one boundary per turn (real 1.4–1.6) | F4 |
| X6 | Campaign sprite fixes | F13 |
| X7 | Any defect the pod round (N4) or the director check finds | 31 |

## Features

| # | Item | Source |
|---|---|---|
| A1 | Briefing drafting by the wizard: built on `v2.8-briefing` (22286afb + gate record), gates green, no-model lane ×2; CL floors owed, not merged | 10, D5 |
| A2 | Story presence panels: what is left (C4/C5/C7/C9a) | 04, D10; **done** on `v2.8-panels-rest` (C4/C7/C9a were v2.7 36, C5 v2.7 33; gaps closed, lane 52 ×2); owed C5 CL + Storybook |
| A3 | v2.7 carry-over: lore-select batching (C12), curator digest (C13-b), model-driven items (C11), R4 gate lift + Studio control | 01, D1 |
| A4 | ~~Widgets follow-ups: which quality and turn changed a value (author), "changed N replies ago", intents that open a drawer tab or ask for a roll, per-story motion toggle; `roster`/`timeline` kinds~~ built on `v2.8-widgets-followups` 2026-10-10 (`70ab9a78`), gates green, lane 54 19/19 x2; Storybook owed (23 Gate record) | 23 |
| A5 | Lorebook features for the campaign: outlets, regex keys, NOT logic, triggers | D11 |
| A6 | Open stretches (engine half, then M1/M2) | 19 |
| A7 | Local judge provider (decider-4b, then Plumb-4B), opt-in per use | 14 — built on `v2.8-local-judge` 2026-10-10 (unmerged); uses refused until calibrated; calibration waits for a 3090 slot and ~6.2 GB free on C: |
| A8 | J7 judge ideas, Phase A evaluation per idea (J7.1–J7.7, N1–N8) | 13 |
| A9 | GPU broker in the ST plugin | 28, D8 — approved 2026-10-10; built on `v2.8-media-stack` (D gates green), LI/LT open |
| A10 | Image workflows in stories | 29, D8 — approved 2026-10-10; built on `v2.8-media-stack` (D gates green), LI open |
| A11 | Model downloads (Civitai, Hugging Face) | 30, D8 — approved 2026-10-10; built on `v2.8-media-stack` (D gates green), LI open (needs a token; nothing downloaded) |
| A12 | Smart-context harvest (E0 first, offline) | 21, D3 |
| A13 | Inner voice L5 spike | v2.7 20, D3 |
| A14 | TunnelVision pattern harvest (report) | 25, D9; done 2026-10-10 (`25-tunnelvision-report.md` §Re-run) |
| A15 | Curator create near-dup on meaning: vectors bands (0.82/0.55) else trigram at a declared threshold; "patch X instead" on the card. **Proposed, needs owner pick** | 25 rank 1, 11 |
| A16 | `{{// so:created}}` stamp on applied creates; reaper offers to remove stamped entries of deleted chats. **Proposed, needs owner pick** | 25 rank 2, 11 |
| A17 | Lorebook-writer census guard (every WI write site listed with its guard). **Proposed, needs owner pick** | 25 rank 3 (TV #55) |
| A18 | Health check: a story book managed by TunnelVision → `degrades` finding. **Proposed, needs owner pick** | 25 rank 4 (P6) |
| A19 | Curator ops on `constant` entries wait for review in `auto` mode (author decision). **Proposed, needs owner pick** | 25 rank 5 (P5), v2.7 02 C13 |
| A20 | Requirements refresh after a lorebook create/import in ST's UI (verify first). **Proposed, needs owner pick** | 25 rank 6 (TV #60) |
| A21 | Jest case: a swipe during an in-flight read gets its own read; the stale one writes nothing. **Proposed, needs owner pick** | 25 rank 7 (TV #50) |
| A22 | Pose library + cheap re-posing (skeleton-guided Qwen edit, S0 spike first) and layered looks that change with the story; mesh-avatar-studio parked with v2.9 05.1. **Needs owner pick on the options** | 33 |

## Measurements (need a pod or a free 3090)

| # | Item | Source |
|---|---|---|
| R1 | Director false-off-script rate on test windows | 22 |
| R2 | Prompt-cache reuse (B1-PFX) and history window 32K vs 98K (B1-HIST) | M6 |
| R3 | K5 with ≥ 20 pooled releases | M2 |
| R4 | B1-EMPTY formal arms | M4 |
| R5 | B1-NARR + rating pack | M5 |
| R6 | S-17 on the scope budget | M7 |
| R7 | Lorebook R5: sheets after character definitions vs depth 4 | M9 |
| R8 | v2.8 01 owed: Q-M5/P3, inner voice B2/C, W6, R4, thinking A/B | M15 |
| R9 | J6d shadow record, offline replay (option C) | 12 |
| R10 | Cue + scene read merge A/B | 15 |
| R11 | SP5 story scenario live legs | 16 |
| R12 | SP6 complication pool | 17 |
| R13 | Phase C ×2 from zero on one build | M14 |
