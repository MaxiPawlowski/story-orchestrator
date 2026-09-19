# v2.1 acceptance run — 2026-08-13

The journey matrix that greened the plan-08 gate. `.debug` rotates its artifacts; this directory is
the durable copy.

- **Tree**: v2.1 plans 01–08, working tree at the plan-08 gate (talk-decision key fix + acceptance
  harness verbs included).
- **Model**: `gemma4-mtp` via the "Story Orchestrator Memory Local" Connection Manager profile
  (LM Studio @ :1235) for every off-path pass; same model as the main chat backend. No
  `debugResponse` on any LLM-consuming path except the two deliberately deterministic latch steps
  in J6.
- **Browser**: headed Chromium over the shared CDP session (`st-session start --headed`).
- **Mode**: `so-journey run <id> --strict`, fresh-start setup for every journey.
- **Operator**: automated (agent-driven); the human-eval sessions of plan 08 are recorded separately
  in the plan's Gate record.

| Journey | Result | Exit | Notes |
|---|---|---|---|
| J0 runner-selftest | 2 pass · 1 blocked *by design* · 1 human | 1 (expected under `--strict`) | J0.3 exists to prove `requires` reports `blocked`, not a fake failure — J0 is the harness selftest, not part of the acceptance matrix |
| J1 first-contact | 7 pass · 2 human | 0 | J1.4 now walks the first-run path that shipped (settings → New story (wizard) → wizard on an empty draft) |
| J2 author-loop | 9 pass · 2 human | 0 | |
| J3 player-session | 8 pass · 5 human | 0 | J3.3 = text needles **and** the new selector sweep |
| J4 return-and-adopt | 4 pass · 2 human | 0 | |
| J5 group-direction | 6 pass · 1 human, **three consecutive runs** | 0 | J5.6 was `blocked` at every earlier gate; it now runs the real epistemic pass and asserts per-speaker private injection |
| J6 mutation-storm | 4 pass · 1 human | 0 | |
| J7 long-haul | 8 pass · 2 human | 0 | cp1 → cp2 → cp3 → cp-4a → cp-4a1 → cp-5 → cp-6, ~9 min of real generation |
| J8 stagecraft | 3 pass · 1 human, **two consecutive runs** | 0 | curator proposal edited, accepted, written at a boundary, present in the next payload; `SO-J8` cleanup clean |
| J9 wizard | 5 pass · 2 human | 0 | real card + group + lorebook created and removed; `SO-J9` cleanup clean |
| J10 identity-and-settings | 9 pass · 2 human | 0 | includes J10.11, the migration over a blob captured from a real pre-v2.1 chat |

Totals across J1–J10: **63 automated checks pass, 0 fail, 0 blocked**, 21 human checks left to the
operator.

## Contents

- `journey-<id>.md` — the matrix + human checklist the runner emitted for that journey.
- `journey-<id>.json` — the machine record, where it survived `.debug` rotation.
- `logs/<id>.log` — the runner's step-by-step console output, where it survived rotation.
- `journal-J3-acceptance.md` / `.json` — a session-journal export from an acceptance J3 run: 39
  events on one timeline (status → extraction → delta → boundary → transition → payload → flag).
- `player-selector-sweep.scenario.json` — the non-vacuity proof for the D1 sweep: it asserts the
  three player surfaces exist, that **author view really renders** at least one swept control (so the
  selector list cannot rot into a no-op), then flips to player mode and runs `assert-player-clean`.
