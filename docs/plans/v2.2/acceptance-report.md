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

**Partial.** Plan 08 requires J0–J11, `--strict`, twice each, in both configurations (judge off as
the regression proof, judge on with every usage opted in), plus J7 once per configuration. One
journey is done.

### J11 — judgment backend: GREEN

| run | strict | result |
|---|---|---|
| A | no | **26/26 pass** |
| B | yes | **26/26 pass** |

Two consecutive clean full runs, the second `--strict`, archived with logs under
`test/journeys/records/v2.2-acceptance/`. J11 moved 19 → 21 → 22 → 24 → 26 across the session.

Three defects in the checks themselves were fixed to get here (`053dd81`), and they are worth
recording because two of them had been mistaken for product faults:

- **J11.15 had never passed.** It seeded `location` with a value the story's enum does not declare,
  so `setQuality` dropped it silently and the scene cursor was never seeded. A previous commit
  claimed to fix this check and did not. It also inherited the previous check's cadence; at cadence
  1 the cadence read masks the scene-triggered read entirely.
- **J11.16** hit a hard-coded 15 s pre-send idle wait that the check's 300000 ms budget never
  reached — invisible on the old 5090, fatal at ~33 tok/s on the replacement card.
- **J11.23 / J11.25** failed once, then passed twice untouched: model-output variance. J11.23's
  stall call answered at `max p 0.94` against a 0.95 floor. **No threshold was changed** — loosening
  a calibrated floor to fit a single sample trades a real guard for a green tick.

### Remaining

J0–J10 in both configurations, J11 in the judge-off configuration, and J7 once per configuration.

### Product bugs found by the live gates (all fixed and committed)

1. A scene read keyed to a deleted message survived the delete when no boundary had fired on it
   (`dropReadsAfter`, `runtimeManager.ts`).
2. Every off-path use inherited the 1500 ms reply-path budget and timed out; each now has its own
   (`judge/policy.ts`).
3. A stall call that fell back recorded its leaves as answered when nothing had been.

The warden is proven live end to end except the final prompt hop: judge flagged in 616 ms,
injection at depth 0, cleared at generation end, quiet and dry-run vetoes honoured.

## Cost and latency

**Not yet measured.** It is built from the judge-on runs' `extras.judge.calls` rings, exported per
run with `so-journal.mts export` before cleanup deletes the chats. The spike's $0.08 per 1000
boundaries is the baseline to compare against.

## Human eval

**Outstanding — the user's to score.** Two sessions (player on sun-ruins, author on an Adolion
story), rubrics in `08-acceptance.md`. The carried-over v2.1 rubrics (J8.4, J9.6, J9.7) share these
sessions.

## Findings register

Findings raised by the acceptance work, each with a disposition. A finding stays open until it is
fixed, bounced to v2.3, or argued as by-design with a reason.

### F1 — the wizard's rating rubric fails validation intermittently, and the single repair pass does not save it

**Status: open, mine to fix (acceptance-found).** Found by the peer session's J9 runs on 2026-09-20,
handed over rather than fixed there because it is out of scope for the cleanup-scoping work.

J9.1 validates the wizard's post-interview proposal from **one** sample. The proposal failed twice
with `qualities.N.criteria: a rating needs criteria.levels or a rubric that reads "from N (low) to
M (high)"` (quality index 2, then 0), then passed twice on the same binary, pod and preset. So it is
intermittent model output meeting a strict validator, not a regression.

Two things make it worse than a flaky test:

- `runAuthoringStage` (`src/copilot/authoring.ts`) allows exactly **one** repair pass. The failures
  above are *post-repair*, so the model misses the required shape twice in a row. A real author
  driving the wizard hits the same wall and just sees a failed proposal.
- `ratingLevels` (`src/engine/qualityRead.ts`) accepts only `criteria.levels` (≥2) or a rubric
  matching `/from\s+(-?\d+)\s*\(([^)]+)\)\s*to\s+(-?\d+)\s*\(([^)]+)\)/i`. That regex
  requires the literal word "from" and parenthesised labels at both ends, so near-misses like
  "1 (low) to 5 (high)" or "from 1 (lowest) through 5 (highest)" are rejected.

The repair prompt names the requirement but never shows the shape to emit, which is the likely
reason a second sample misses it the same way.

Candidate fix, in preference order — none applied yet, because this is queued behind the J11/J8
live gates:
1. Put a literal example in the failure message the repair prompt carries
   (`rubric: "from 1 (barely) to 5 (completely)"`). Cheapest, and it helps a human author too.
2. A bounded retry in the journey's wizard step, mirroring the curator's `expectOps/attempts`, so
   one bad sample is not a red.
3. Only if 1 and 2 are not enough: widen `ratingLevels` to accept the common near-misses. Listed
   last deliberately — loosening a validator to absorb model noise trades a visible failure for a
   silent bad rating scale.

This is not counted against the matrix until it is fixed: any acceptance run of J9 currently has a
coin-flip chance of a false red on J9.1.

### F2 — the runtime's in-memory settings view can disagree with stored settings

**Status: open, unverified — do not act on this without reproducing it properly.**

After a page reload on a chat with **no story loaded**, `getSnapshot().extraction.settings.profileId`
reads `null` and `pipeline` reads `not-configured`, while both `getGlobalSettings()` and the raw
`extensionSettings` hold the correct profile. Calling any setter (`setExtractionSettings`) heals it
immediately (observed `null` → `c400ff9a…`, pipeline `not-configured` → `idle`).

`getGlobalSettings()` also **writes its sanitized result back** into `extensionSettings`, so an early
call can in principle stamp defaults over real settings before ST has loaded them
(`src/runtime/settingsStore.ts`). ST emits `EXTENSION_SETTINGS_LOADED` (`public/script.js:8025`)
right after `loadExtensionSettings`, which is the seam a fix would hang off.

**Why this is not yet called a bug:** the only reproduction is on a storyless chat, where `extras` is
initial state and nothing reads it. `hydrateExtras` re-applies global settings on `loadStory`, so a
chat that actually plays a story may never be affected. One attempt to test that was inconclusive
because the story import silently failed. It was originally mistaken for the cause of the J11.15 /
J11.21 failures, which turned out to be the `--only` coupling below.

### F3 — most J11 checks do not import their own story

**Status: open, by-design for full runs, a trap for single-check debugging.**

17 of 26 J11 checks have no `import_story` step and inherit the story from an earlier check. A full
run is therefore fine, but `--only` gives each check a fresh chat, so a single-check run of one of
those 17 seeds nothing and fails with an empty-scope symptom (`audits: 0`) that looks like a product
fault. This cost real time on 2026-09-20 when J11.15 and J11.21 were tested with `--only`.

The v2.1 J9 finding already warned about this class, and five J11 checks (J11.6/9/10/11/14) plus
J8.5/6/9 were made self-contained for exactly this reason; the rest were not. Either finish the job
or make the runner say plainly that a story-less check was run in isolation.

### F4 — lore-select uses a Noul's probability as a ranking key

**Status: bounced to v2.3** (seeded in `08-acceptance.md`). Raised 2026-09-20 while auditing whether
each judge use asks the right primitive.

All three primitives are in use — 16 Noul, 9 Choice, 2 Score — and most of the mapping is sound:
a Score over authored levels paired with a separate `presence` Noul (`extraction.ts`), a Choice plus
per-candidate Nouls composed in code (`director.ts`), a speculative "if it is a break, what kind"
Choice asked alongside the break Noul (`scene.ts`), no-match outcomes on Choices (`SCENE_UNCLEAR`),
and a pure keep/drop Noul where nothing is ordered (`curatorFilter.ts`).

Lore-select is the exception. `buildLoreRequests` asks one Noul per entry; `pickLore` filters at
`LORE_MIN_P` (0.6), **sorts by that probability**, and takes `LORE_TOP_K` (4). Ordering by a Noul
treats "probability the condition holds" as if it were relevance magnitude.

The recorded calibration (`test/goldens/judge/lore.calibration.json`, 77 rows) shows the cost:

| band | rows |
|---|--:|
| p ≥ 0.90 | 0 |
| 0.60 ≤ p < 0.90 | 72 |
| p < 0.60 | 5 |

Most common values: 0.76 (×10), 0.82 (×10), 0.85 (×8), 0.87 (×6).

So the floor admits almost everything, top-K does nearly all the selection, and it selects on a
compressed, heavily tied signal — ten entries tied at 0.82 are ordered by `entry.uid`, i.e. by
insertion order. The model never expresses high confidence on this question at all, which suggests
the binary framing ("does the next reply *need* these facts") forces uncertainty that a graded
question would not.

Corroboration in our own source: `lore.ts:31` records a world-overview entry rating "active" in
every scene at 0.65–0.84 and taking a top-k slot each time, fixed by rewording the binary criteria —
patching a ranking problem with better filter wording.

Lore is also one of only two on-path uses and carries the weakest calibration pair in the table
(recall 0.872, precision 0.895), so this is where the headroom is.

**Why not now:** changing the primitive invalidates the lore calibration and J11.16–J11.19 in the
middle of acceptance. v2.2 should measure and ship lore as it actually is. The human-eval rubric row
"did lore you asked about show up?" is the symptom to watch, because a weak ranking shows up there
before it shows up in precision/recall.

### F5 — the WI curator cannot create entries

**Status: by-design, recorded so nobody designs around an op that is not coming.** A narrowed
version is seeded for v2.3 (`08-acceptance.md`).

`WiCuratorOp` is `enable | disable | rewrite | patch`, and the curator prompt tells it never to
invent entries. A lorebook designed to be *filled* by the curator therefore returns NONE forever.
Raised 2026-09-20 by the Adolion campaign session, which had designed exactly that book.

This is the contract working, not a defect: the curator proposes changes inside the story's authored
`stagecraft.lorebooks` allowlist and never invents. Unrestricted creation would give an author a book
that grows by an entry a session with nothing pruning it.

**J8 is not affected, and the reason is worth keeping.** J8.2 and J8.3 were rewritten op-agnostic
after a 2026-09-19 finding: they drive the review ring with `pick: "text-first"` and assert
`opsAtLeast` rather than naming an op kind. So a real model choosing `patch` or `disable` over
`rewrite` is not a failure. Confirmed live during the J8 run of 2026-09-20, where the curator chose
`disable` — a check that named `rewrite` would have failed there for the wrong reason. Do not
reintroduce a hard-coded op kind into these checks.

## Recommended configuration

**Pending the matrix and the cost report.** No default changes: every judge usage stays opt-in
(overview rule 4, user decision 2026-09-19). Nothing in the calibration data argues for marking a
usage "not recommended" — all 11 clear their floors.
