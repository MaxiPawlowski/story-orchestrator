# v2.2 acceptance report

Status: **in progress.** The calibration section is complete and recorded. The matrix, the cost
and latency figures and the human-eval sections are filled in as the acceptance runs land — each
one says plainly what is still missing rather than carrying a provisional number.

Model under test: `jev-1.13.0`, through the ST server plugin
`server-plugin/story-orchestrator-judge`.

## Calibration

`so-judge calibrate --use <use> --record`, recorded 2026-09-19, goldens in
`test/goldens/judge/*.calibration.json` (committed 3541af8). Every use ran against the live API,
not a fixture replay.

**11 of 11 uses pass their floor, and no per-family floor is missed.**

| use | fixture | measured | floor | verdict | p50 | non-English |
|---|---|--:|--:|---|--:|---|
| `continuity` | continuity | 85/85 (1.000) | 0.900 | **PASS** | 1075 ms | 18/18 |
| `critic` | critic | 157/160 (0.981) | 0.850 | **PASS** | 1106 ms | 24/24 |
| `curator-filter` | curator-filter | 22/24 (0.917) | 0.850 | **PASS** | 666 ms | 6/6 |
| `director` | director | 29/33 (0.879) | 0.850 | **PASS** | 1208 ms | 7/8 |
| `lore` | lore | 68/77 (0.883) | 0.850 | **PASS** | 559 ms | 16/19 |
| `memory-pairs` | memory-pairs | 29/32 (0.906) | 0.850 | **PASS** | 796 ms | 2/3 |
| `memory-verify` | memory-verify | 47/48 (0.979) | 0.850 | **PASS** | 330 ms | 8/8 |
| `scene` | scene | 172/181 (0.950) | 0.850 | **PASS** | 1595 ms | 37/37 |
| `stall` | stall | 87/87 (1.000) | 0.850 | **PASS** | 1263 ms | 4/4 |
| `typed` | typed | 129/142 (0.908) | 0.850 | **PASS** | 1684 ms | 4/4 |
| `variants` | variants | 20/20 (1.000) | 0.850 | **PASS** | 784 ms | 4/4 |

Per-family floors, which are the ones that actually bind behaviour:

| use | family | measured | floor | verdict |
|---|---|--:|--:|---|
| `continuity` | reply | 28/28 (1.000) | 0.9 | pass |
| `continuity` | broken | 15/15 (1.000) | 0.85 | pass |
| `continuity` | consistent | 42/42 (1.000) | 0.966 | pass |
| `critic` | verdict | 40/40 (1.000) | 1.0 | pass |
| `critic` | contradicts | 38/40 (0.950) | 0.9 | pass |
| `critic` | advances | 39/40 (0.975) | 0.9 | pass |
| `critic` | newCharacter | 40/40 (1.000) | 0.9 | pass |
| `curator-filter` | recall | 13/13 (1.000) | 0.9 | pass |
| `curator-filter` | narrowed | 9/11 (0.818) | — | reported, not gated |
| `lore` | recall | 34/39 (0.872) | 0.8 | pass |
| `lore` | precision | 34/38 (0.895) | 0.7 | pass |
| `scene` | present | 49/53 (0.925) | 0.9 | pass |
| `scene` | location | 18/21 (0.857) | 0.85 | pass |
| `scene` | time | 21/21 (1.000) | 0.8 | pass |
| `scene` | heading | 40/42 (0.952) | 0.85 | pass |
| `scene` | break | 24/24 (1.000) | 0.5 | pass |
| `scene` | nobreak | 20/20 (1.000) | 1.0 | pass |
| `stall` | direct | 28/28 (1.000) | 1.0 | pass |
| `stall` | kept | 59/59 (1.000) | 1.0 | pass |
| `typed` | answered | 64/65 (0.985) | 0.95 | pass |
| `typed` | coverage | 65/77 (0.844) | — | reported, not gated |
| `variants` | pick | 10/10 (1.000) | 0.8 | pass |
| `variants` | rejected | 10/10 (1.000) | 1.0 | pass |

Three of these sit close enough to their floor to be worth watching rather than trusting:
`scene`/`location` at 0.857 over 0.85, `director` at 0.879 and `lore`/`recall` at 0.872. Each is a
small fixture, so a single case moves them by 3–5 points; none of the three should be read as
headroom.

**The scene-setter curator is not in this table.** It measured 15/18 against its own 0.85 floor and
was dropped rather than shipped review-only (user decision, 2026-09-20). Plan 05 records it.

### Calibration latency is not play latency

The p50 column is the calibration harness's, and it understates the reply path in one direction and
overstates it in another: calibration runs warm and back to back, while the first call after an idle
gap pays roughly 650 ms of cold TLS; against that, calibration state is smaller than a real
boundary's. The on-path budget check against 1500 ms is therefore **only answerable from the live
judge-on runs' call rings**, not from this table. The two on-path uses' calibration p50s
(`director` 1208 ms, `lore` 559 ms) are recorded here as a floor on what to expect, not as the
verdict.

## Matrix

**Not yet run.** Plan 08 requires J0–J11, `--strict`, twice each, in both configurations (judge off
as the regression proof, judge on with every usage opted in), plus J7 once per configuration.

What is measured so far, against the judge-on build:

- J11 (the judge journey) stands at **24 of 26 automated checks**, up from 19/26 at the first live
  pass. J11.15 and J11.21 have been fixed but not yet re-run, so they are not counted as green.
- J8 (stagecraft, including the continuity warden) has its three warden checks in place
  (J8.5/J8.6/J8.9), each self-contained.
- The warden is proven live end to end except the final prompt hop: judge flagged in 616 ms,
  injection at depth 0, cleared at generation end, quiet and dry-run vetoes honoured.

Three product bugs were found by the live gates and fixed, all committed:

1. A scene read keyed to a deleted message survived the delete when no boundary had fired on it
   (`dropReadsAfter`, `runtimeManager.ts`).
2. Every off-path use inherited the 1500 ms reply-path budget and timed out; each now has its own
   (`judge/policy.ts`).
3. A stall call that fell back recorded its leaves as answered when nothing had been.

## Cost and latency

**Not yet measured.** It is built from the judge-on runs' `extras.judge.calls` rings, exported per
run with `so-journal.mts export` before cleanup deletes the chats. The spike's $0.08 per 1000
boundaries is the baseline to compare against.

## Human eval

**Outstanding — the user's to score.** Two sessions (player on sun-ruins, author on an Adolion
story), rubrics in `08-acceptance.md`. The carried-over v2.1 rubrics (J8.4, J9.6, J9.7) share these
sessions.

## Recommended configuration

**Pending the matrix and the cost report.** No default changes: every judge usage stays opt-in
(overview rule 4, user decision 2026-09-19). Nothing in the calibration data argues for marking a
usage "not recommended" — all 11 clear their floors.
