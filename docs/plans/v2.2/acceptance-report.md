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
the regression proof, judge on with every usage opted in), plus J7 once per configuration. The two
journeys that carry the v2.2 features — J11 (the judge) and J8 (the curators and the warden) — are
done and green in the judge-on configuration.

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

### J8 — stagecraft (WI curator + continuity warden): GREEN

| run | strict | result |
|---|---|---|
| A | no | **6/6 automated pass** (J8.4 skipped: human check) |
| B | yes | **6/6 automated pass** (J8.4 skipped: human check) |

This is the whole warden slice proven live: J8.5 (auto mode produces exactly one note), J8.6 (review
mode holds the note for the author, and a newer reply lapses it unapplied), J8.9 (both judge
curators off — a contradicting reply produces nothing). The warden was the last v2.2 feature that
had not been through a full journey.

Cleanup was clean on both runs: `clean: true`, only the run's own `SO-J8 Lore` and its per-chat
mirror book removed, `sessions.dropped: []`, no mirror-book leaks. That is the hardened
`so-assets` scoping proven under live conditions — the same install was carrying nine
newly-installed Adolion lorebooks and a real wizard session, and none were touched.

J8.4 is the operator's to score and is skipped rather than faked green.

### Remaining

J0–J7, J9 and J10 in both configurations; J8 and J11 in the judge-off configuration; J7 once per
configuration. Note J9 currently carries a known flake (F1) that gives any acceptance run of it a
coin-flip chance of a false red until that is fixed.

### Product bugs found by the live gates (all fixed and committed)

1. A scene read keyed to a deleted message survived the delete when no boundary had fired on it
   (`dropReadsAfter`, `runtimeManager.ts`).
2. Every off-path use inherited the 1500 ms reply-path budget and timed out; each now has its own
   (`judge/policy.ts`).
3. A stall call that fell back recorded its leaves as answered when nothing had been.

The warden is proven live end to end except the final prompt hop: judge flagged in 616 ms,
injection at depth 0, cleared at generation end, quiet and dry-run vetoes honoured.

## Cost and latency

**Measured, on a small sample.** 20 judge calls captured across the judge-on runs of J3, J5 and J4
(scope option B, user decision 2026-09-20). The runner now captures the call ring into the run record
before cleanup deletes the chat that holds it — the earlier green J11 and J8 runs proved the
behaviour and lost the measurement, which is why they are not in this table.

| use | calls | p50 | p90 | max | median questions | median state chars | fallbacks |
|---|--:|--:|--:|--:|--:|--:|--:|
| `scene` | 9 | 1797 ms | 2509 ms | 2510 ms | 9 | 2741 | 0 |
| `memoryVerify` | 7 | 639 ms | 671 ms | 733 ms | 2 | 1673 | 0 |
| `warden` | 2 | 255 ms | 2702 ms | 2702 ms | 1 | 1441 | 0 |
| `director` | 2 | — | — | — | — | — | 0 |

- **Zero fallbacks in 20 calls.** No timeout, no error, no ineligible result across every use that
  fired. The revised off-path budgets (plan 00) hold on this hardware.
- **2.5 calls per boundary**, counted over the 8 boundaries where any call fired at all. Most
  boundaries make none.
- `scene` is the expensive use and sits right on its 2500 ms budget at p90 (2509 ms). It did not
  fall back, but it has no headroom: a slower judge or a larger scene would start timing out. Its
  9-question shape and 2741-char state are the largest of any use.

### What this does not answer

- **The on-path 1500 ms budget is still unverified.** `director` fired twice but its summary format
  carries no parseable duration, and `lore` never fired in these three journeys. Those are the only
  two uses on the reply path and therefore the only two where a fallback costs responsiveness rather
  than a feature. The calibration p50s (`director` 1208 ms, `lore` 559 ms) remain the only figures,
  and calibration runs warm — see the caveat under Calibration.
- **$ per 1000 boundaries is not computed.** The sample is 20 calls over 8 boundaries in three
  journeys, none of them a full play-through; extrapolating a rate from it would be a guess dressed
  as a measurement. The spike's $0.08 per 1000 boundaries stands unchallenged rather than confirmed.
- **GPU time saved is not measured.** It needs the judge-off and judge-on runs of the *same* journey
  compared call for call, which option B's scope did not produce.

Closing these needs the full judge-on matrix (option C), and is the main thing v2.2 ships without.

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

### F6 — J5.6 fails with the judge on, and I could not attribute it

**Status: open, unattributed. Do not read this as a confirmed regression.**

J5.6 asserts that a drafted group member is injected their own private epistemic block. It passes
with the judge off and fails with it on, twice, with `block: ""` both times — but naming a
*different* subject each run (Ponticius, then Arin) while the entries themselves existed.

Two candidates, and the evidence does not separate them:

- **(a) A judge-on product regression.** Something in the judge-on path leaves the private block
  unbuilt at draft time.
- **(b) A latent check defect exposed by model variance.** `stagedPrivate` is populated only for
  `enabledCharacterIds(story)`, and `onMemberDrafted` injects an empty epistemic block by design for
  a member that is not among them. The check chooses its two subjects from whichever epistemic
  entries happen to have character cards and never asserts those subjects are *enabled* — while
  J5.2, earlier in the same journey, runs `cast_changes`, which disables members. A run whose
  epistemic pass named a disabled member would then fail exactly this way.

(b) is the better fit: the subject varied between the two failures but the empty block did not, and
the product's behaviour for a non-enabled member is correct by design. That is a reason to suspect,
not a reason to conclude.

**What would settle it**, and was not done because the sample cost more than the answer was worth at
this point in the gate: assert in the check that each chosen subject is an enabled roster member and
re-run; if it then passes with the judge on, it is (b). If it still fails, it is (a) and wants a
proper investigation.

Until then J5 is **not** green in the judge-on configuration, and this is the one place where a
v2.2 opt-in path is unproven at composition level.

## Recommended configuration

**No default changes. Every usage ships off, and this table is advice for someone who opts in, not a
plan to flip anything** (overview rule 4, user decision 2026-09-19).

Read it with one caveat in front: the evidence behind each row is calibration (11/11 uses at floor,
recorded against the live API) plus the J11 and J8 journeys, both green twice. The judge-on matrix
was run at option-B scope, so no usage below has been proven across the whole journey set.

| usage | calibration | live | recommendation |
|---|---|---|---|
| `stallCheck` | 1.000 (both families at floor 1.0) | J11.23 | **Recommended.** The strongest measured use. |
| `memoryVerify` | 0.979 | J11.7, J11.8 | **Recommended.** Also the cheapest on-boundary call measured (p50 639 ms). |
| `expansionCritic` | 0.981 | J11.25 | **Recommended.** Replaces a second model call, so it pays for itself. |
| `expansionLookahead` / `lookahead` | variants 1.000 | J11.25 | **Recommended** where prepare-ahead is wanted; it is dead weight otherwise. |
| `curatorFilter` | 0.917 | J11.26, J8 | **Recommended** once a curator scope exceeds ~40 entries; pointless below that. |
| `typedExtraction` | 0.908 | J11.20, J11.21 | **Recommended.** Needs authored `read_as` hints to do anything. |
| `memoryPairs` | 0.906 | J11.9, J11.10 | **Recommended.** |
| `sceneTrigger` / `sceneTracker` | 0.950 | J11.11–J11.15 | **Recommended, watch latency.** The most expensive use: p50 1797 ms, p90 2509 ms against a 2500 ms budget. It did not fall back in 20 calls, but it has no headroom — a larger scene or a slower judge starts timing out. |
| `director` | 0.879 | J11.3, J11.4 | **Recommended only with authored `roster[].role` on every candidate** — without roles it reports `fallback: "no-roles"` and does nothing. It is on the reply path and its 1500 ms budget is **unverified live** (see Cost and latency). |
| `loreSelect` | 0.883 (recall 0.872 / precision 0.895) | J11.16–J11.19 | **Recommended with a known weakness.** It ranks by a Noul's probability, and those probabilities are compressed and heavily tied (F4) — so *which* entries win the top-K slots is weaker than the pass/fail numbers suggest. On the reply path, budget unverified. |
| `sceneOoc` | — | — | **No evidence.** Not exercised by any journey and not separately calibrated; treat as unproven rather than recommended. |
| `memoryRerank` | — | — | **No evidence.** As above. |

### Warden and curator (stagecraft, separate switches)

| | |
|---|---|
| `stagecraft.wardenEnabled` | **Recommended in `review` mode.** `continuity` calibrated 1.000 (85/85) and J8.5/J8.6/J8.9 are green. `auto` applies a note without an author seeing it — sound on the measurements, but it writes into the prompt, so `review` is the honest default. |
| `stagecraft.curatorEnabled` | **Recommended in `review`.** Green in J8 across two runs. It has no `create` op by design (F5), so a book that ships empty stays empty. |

### Combination advice

- The two reply-path uses (`director`, `loreSelect`) are the only ones where a fallback costs
  responsiveness rather than a feature, and they are the two with unverified live latency. Someone
  who cares more about turn latency than about either feature should leave both off and lose
  nothing else.
- Everything else is off-path and fell back zero times in 20 calls, so turning several on costs
  boundary work, not turn time.
- `sceneOoc` and `memoryRerank` have no evidence behind them at all. They should not be in a
  recommended set until something exercises them.

