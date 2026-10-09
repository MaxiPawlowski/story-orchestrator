# Plan 31 — Backlog from the v2.7 wrap (2026-10-09)

**Status:** notes, not yet planned. Owner decisions 2026-10-09:
- private plugin, one user;
- every built feature on by default, below its floor too;
- floors are informational;
- versions are symbolic;
- v2.7 wrapped without the pod Phase C;
- no RunPod budget for the rest of October 2026, so the local 3090 takes what it can.

Sources:
- v2.7 39 §B1 records (batch 3);
- v2.8 01 §H;
- the 2026-10-09 lorebook review (`docs/authoring/lorebook-mechanics.md`, campaign `docs/reviews/`).

Where: **pod** needs the pod model (Artemis v1.1, 98K context), **3090** runs on the local controller (model file v1m, 32K: a local variant, valid for model-independent rows), **none** needs no model.

## Measure

| # | What | Why / last result | Where |
|---|---|---|---|
| M1 | 35-K3 and 35-K4 run 2 | run 1 PASS (batch 3); K3 under the fixed carried check (F-B1c-3) | pod |
| M2 | 35-K5 with enough releases (≥ 20 pooled) | 7–8 measured; control arms land under 20 (run variance, F-B1c-5); longer runs or more segments | pod |
| M3 | B1-C3 judge timeouts per use; B1-C12 lore-select requests per turn | pod run killed; the 3090 diagnostic had the warden at 7/118 timeouts and C12 p50 7, max 18 | pod (3090 diagnostic) |
| M4 | B1-EMPTY formal arms A/B | 8/8 recoveries seen incidentally in batch 3, not the formal row | pod |
| M5 | B1-NARR plus its rating pack | P3 Narrator holdings scoping, unmeasured | pod |
| M6 | B1-PFX (prompt-cache reuse) and B1-HIST (32K vs 98K history) | dropped for budget twice; decides the group cache layout (P4) and the history window (P1) | pod |
| M7 | S-17 / 37-S17 on the new scope budget (`extraction/scopeBudget.ts`) | FAIL ×2 at +17 % before the budget; pair fairness may count per axis, not per pair | pod |
| M8 | 36-Q1-M2 quest completion recall, 36-Q1-M1 scope, 37-M1 relationship direction, 37-L6-C voice warden OOC recall | 0.46, split, 0.20, 0.5; features stay on, re-measure after F5–F7 | pod |
| M9 | Lorebook R5: Cast and place sheets "after character definitions" vs depth 4 | needs a real-model A/B on prefix stability and quality; the first same-member diff is earlier (Vector Storage, depth-10 player role) | pod |
| M10 | Lore selection after R12: calls per reply, exclusive-mode effect under scan mode | before: ~5 judge calls per reply, exclusive refused in file mode | 3090 |
| M11 | Send-to-line latency by turn decile after `43a16f4a` and F1 | batch 3 max 4.5 s, mostly 25–40 ms | 3090 |
| M12 | Warden timeouts after the warden fix | see the warden task's record | 3090 |
| M13 | Keyword-scan recall on the lore lab after the campaign key tightening | 0.25 → 0.26 | none |
| M14 | Phase C ×2 from zero on one build | symbolic now; runs when there is budget | pod |
| M15 | v2.8 01 owed: Q-M5/P3, inner voice B2/C, W6, R4, funded thinking A/B | unchanged | pod |

## Fix

| # | What | Evidence |
|---|---|---|
| F1 | Send latency: keep `/api/vector/query` bursts out of the send window | v2.8 01 §H |
| F2 | Saga downtime: a passed posting's scene stays on through the generated stretch. Transitions and generated stubs carry no World Info effects | campaign lore fixes 2026-10-09 |
| F3 | Card pulls starve in crowded reads (1 of 7 kept); consider a minimum share; `REL_AXES_PER_READ` 8 vs 37-M2's 4; author-view overflow checks report budget drops | scope budget task 2026-10-09 |
| F4 | K3 lab check simulates one boundary per turn; real runs commit 1.4–1.6 (multi-voice) | F-B1c-5 |
| F5 | Quest completion recall (0.46 vs 0.80) | 36-Q1-M2 |
| F6 | Relationship direction accuracy (0.20 vs 0.80) | 37-M1 |
| F7 | Voice warden OOC recall (0.5 vs 0.80) | 37-L6-C |
| F8 | The warden counts an empty reply as rendered | B1 attempt 2 |
| F9 | Judge-plugin 429 bursts (13 in 2 min) | C3 local-variant |
| F10 | D rows with no runner | F15 |
| F11 | `sessions:archive` gzips files over 90 MB before pushing | task chip 2026-10-08 |
| F12 | 3090 cannot hold the "normal" profile with the v1m GGUF, and the pods run v1.1; decide model-file parity for local rows | C3 local-variant |
| F13 | Campaign sprite fixes | v2.7 38 |
| F14 | Whatever the owner flags while playing with every feature on | owner sessions |
| F15 | The settings reader writes its full sanitized result back, so a changed default never reaches an existing install (judge uses, `spikes.*`, `cardOverlay`, `onDemand` stay at a stored `false`; R7 needed a `gatingChosen` marker). Persist only what the user changed, then drop the marker | features-on and R7 tasks 2026-10-09 |
| F16 | Lore selection still costs about 5 judge calls per reply (263 candidates in chunks of 64); R12 saved about 0.1. Needs larger chunks or narrower book lists | R12 measurement |

## Develop

| # | What | Plan |
|---|---|---|
| D1 | C12 lore-select batching, C13-b digest, C11 model-driven items, R4 gate lift + Studio control | v2.8 01 |
| D2 | Agenda proposals wired into play (today a harness handle only) | v2.7 37 L3 |
| D3 | Smart-context harvest and inner voice L5, as spikes | v2.8 21, v2.7 20 L5 |
| D4 | Curator `create` op | v2.8 11 |
| D5 | Wizard assistant, briefing drafting | v2.8 09, 10 |
| D6 | Living story director | v2.8 22 |
| D7 | Story widgets (rest after option A) | v2.8 23 |
| D8 | GPU broker in the ST plugin, image workflows per story, model downloads | v2.8 28, 29, 30 |
| D9 | TunnelVision re-harvest | v2.8 25 |
| D10 | Story presence panels C4/C5/C7/C9a (what is left) | v2.8 04 |
| D11 | Lorebook features the campaign could still use: outlets, regex keys, NOT logic, triggers | lorebook review |

## Test setup (next pod round)

- Check the real RunPod balance before any pod run; an approval is not credit.
- No dedicated memory pod: each reply pod runs its own lanes' memory at `LLM_PARALLEL` 4.
- The 3090 takes the light and model-independent rows.
- Use as few pods as possible (39a run plan, e02af9c6).
