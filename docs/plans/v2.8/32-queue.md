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
| X1 | Long local chats overflow the 32K profile at ~turn 70; controller refuses and tries `normal` | F20 |
| X2 | Send latency on the 3090: the player's line waits behind other model calls (10–14 s worst); re-measure after the vector-yield fix, then fix what is left | F1, F18, F19, M11 |
| X3 | Model-file parity: 3090 runs v1m, pods v1.1 | F12 |
| X4 | Owner flags from play | F14 |
| X5 | K3 lab check assumes one boundary per turn (real 1.4–1.6) | F4 |
| X6 | Campaign sprite fixes | F13 |
| X7 | Any defect the pod round (N4) or the director check finds | 31 |

## Features

| # | Item | Source |
|---|---|---|
| A1 | Briefing drafting by the wizard | 10, D5 |
| A2 | Story presence panels: what is left (C4/C5/C7/C9a) | 04, D10 |
| A3 | v2.7 carry-over: lore-select batching (C12), curator digest (C13-b), model-driven items (C11), R4 gate lift + Studio control | 01, D1 |
| A4 | ~~Widgets follow-ups: which quality and turn changed a value (author), "changed N replies ago", intents that open a drawer tab or ask for a roll, per-story motion toggle; `roster`/`timeline` kinds~~ built on `v2.8-widgets-followups` 2026-10-10 (`70ab9a78`), gates green, lane 54 19/19 x2; Storybook owed (23 Gate record) | 23 |
| A5 | Lorebook features for the campaign: outlets, regex keys, NOT logic, triggers | D11 |
| A6 | Open stretches (engine half, then M1/M2) | 19 |
| A7 | Local judge provider (decider-4b, then Plumb-4B), opt-in per use | 14 |
| A8 | J7 judge ideas, Phase A evaluation per idea (J7.1–J7.7, N1–N8) | 13 |
| A9 | GPU broker in the ST plugin | 28, D8 (needs approval) |
| A10 | Image workflows in stories | 29, D8 (needs approval) |
| A11 | Model downloads (Civitai, Hugging Face) | 30, D8 (needs approval) |
| A12 | Smart-context harvest (E0 first, offline) | 21, D3 |
| A13 | Inner voice L5 spike | v2.7 20, D3 |
| A14 | TunnelVision pattern harvest (report) | 25, D9 (needs approval) |

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
