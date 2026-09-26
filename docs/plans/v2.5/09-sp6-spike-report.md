# v2.5 plan 09 — SP6 complication pool spike report

**Verdict: not yet measured.** This commit predeclares the conditions, the measurement procedure and the fixtures (plan 09 rule 1).
The conditions are copied verbatim from `09-research-spikes.md` §SP6 and are never retuned after a run. R13 (the judge adversity read) is
not in this spike. The player-visible copy is U4 (the user's): this spike builds machinery only, with no player surface (rule 7).

## Predeclared conditions

| # | Condition | Pass | Kind |
|---|---|---|---|
| K1 | Deterministic release | jest: release boundary and spent-ness derived from the log; rollback ≡ replay over 4 seeds | deterministic, once |
| K2 | One turn, one block | payload capture: the complication reaches exactly the next loud request, never a quiet/impersonate one | live, ×2 |
| K3 | Agency | 20 released turns: the warden agency family (`agencyCheck`, judge on) flags ≤ the no-release control + 1; judge-off column recorded | live + judge, ×2 per arm |
| K4 | Over-steer | plan 01's probe on those turns: 0 verbatim restatements of the complication text | live, ×2 |
| K5 | It moves the story | on a stalled-tension fixture, committed tension reaches the target band within 6 boundaries of release in ≥ 60 % of releases vs ≤ 30 % control (route recorded) | live + model, ×2 per arm |

## Measurement procedure (fixed before any run; a procedure change is stated here, a bar never moves)

- **Release rule (the design under test).** A checkpoint may author `complications` (strings or `{id, text}`) and `complication_after`
  (default 3). A boundary is *escalate* when the steering direction computed from that log entry's committed `tension_current` against
  its expected tension (the same `getSteeringHint`, default drift threshold 0.3) is `escalate`. A streak counts consecutive escalate
  boundaries at one checkpoint and resets on a transition or a non-escalate boundary; at `complication_after` the next unspent item
  of that checkpoint is released and the streak restarts. Release and spent-ness are both derived from the boundary log alone.
  The block rides the next loud generation after the release boundary only while that boundary is the newest one.
- **K2 procedure.** `test/scenarios/live-v25-09-sp6-k2.json`: two scripted escalate boundaries release `c1`, then a quiet `/gen`, an
  `/impersonate`, a loud turn and a second loud turn. Every `/api/backends/*/generate` request is recorded at the fetch layer; the text
  must be in exactly request 2 (the first loud one).
- **K3/K4/K5 run shape.** Journey `SP6` (`test/journeys/sp6-complications.journey.json`): 72 fixed quiet player turns at a waystation
  that wants `critical` tension (`complication_after: 2`, 24-item pool), real generation, real extraction at cadence 1. Arms:
  release (`spikes.sp6Complications` on) and control (off; it derives the same release points from its own log, injects nothing),
  each crossed with judge on (`--judge-uses agencyCheck --warden-mode auto`) and judge off (`--judge-uses off`). Each run ×2
  consecutive, same lane. A run with fewer than 20 release points measured nothing (rule 1).
- **K3 bar as scored.** For each judge-on release run: agency-family warden notes ≤ mean(judge-on control runs) + 1. The judge-off
  runs' counts are recorded as the judge-off column (expected 0).
- **K4 bar as scored.** Over every release-arm release: the reply N+1 (first character reply after the release boundary) must not
  restate the block: plan 01's `restateCheck` (longest shared span < 6 normalised words) with a `complication` family whose meta tokens
  are the block's framing (`World pressure:`, `Let it land`). Count must be 0.
- **K5 bar as scored.** On the judge-off runs (no warden to confound): a release *reaches the target band* when any of the 6 log
  entries after its boundary has steering direction `hold` or `ease`. Each release run ≥ 60 %, each control run ≤ 30 %. The extraction
  route (pass role `read`) and its profile are recorded with the run header.
