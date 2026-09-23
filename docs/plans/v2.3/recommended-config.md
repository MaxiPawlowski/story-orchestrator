# Recommended configuration (v2.3)

Written by plan 11 **from this plan's own evidence**, which is what the plan asked for: each usage's
final calibration verdict, the latency it was measured at, and whether a journey exercised it. It
**supersedes** `docs/plans/v2.2/recommended-config.md`, which plan 09 linked and which this round
contradicts in two places (below). The panel links here; the v2.2 page is kept for its history.

**No defaults change. Every usage ships off** (user decision 2026-09-19). This is advice for someone
who opts in, not a plan to flip anything.

## What the numbers are, and what they are not

- **Rate and latency are one live run each**, 2026-09-22, against the pinned judge `jev-1.13.0` on
  the real API (`plugin configured`, p50 warm ~1.2 s), recorded in
  `test/goldens/judge/<use>.calibration.json`, which carry the rate, the per-family verdicts and the
  p50 latency behind every row below. The panel reads the same numbers from `src/judge/readiness.ts`.
- **The floors are the fixtures' own** (`test/fixtures/judge/<use>.json > floors`), declared before
  the answers were read — a run cannot pick its own bar.
- **The human column is EMPTY.** Every rubric in plan 11 is unscored: the player and author sessions
  did not run (the LLM pod reached its 8-hour cap mid-run and a restart was refused). Nothing here is
  adjusted for how a usage *felt* to a person, and no row below should be read as if it were.
- **Cost is not measured either.** §Cost and latency's `$/1000 boundaries` and GPU-time figures need
  a metered session; they are not claimed. The latency column is a per-call median, not a turn cost.

## The table

| usage | rate | p50 | budget | families | live | recommendation |
|---|---|---|---|---|---|---|
| `stallCheck` | **1.0000** (89/89) | 1188 ms | 4000 ms | direct 30/30, kept 59/59 | J11.23 | **Recommended.** The strongest measurement in the set — both families perfect. |
| `variants` / `expansionLookahead` / `lookahead` | **1.0000** (20/20) | 812 ms | — | pick 10/10, rejected 10/10 | J11.25 | **Recommended** where prepare-ahead is wanted. It replaces a second story-model call with a judge call, so it pays for itself; dead weight otherwise. |
| `memoryVerify` | **0.9792** (47/48) | 275 ms | 3000 ms | — | J11.7, J11.8 | **Recommended.** Also the cheapest call measured — 275 ms, a tenth of its budget. |
| `continuity` (warden) | **0.9765** (83/85) | 720 ms | 4000 ms | reply 27/28, broken 14/15, consistent 42/42 | J8.5, J8.6 | **Recommended in `review` mode.** `auto` writes a note into the prompt without an author seeing it; sound on these numbers, but `review` is the honest default. |
| `expansionCritic` | **0.9750** (156/160) | 999 ms | — | verdict 40/40, contradicts 37/40, advances 39/40, newCharacter 40/40 | J11.25 | **Recommended.** Its `verdict` family — the one that decides — is perfect. |
| `sceneTrigger` / `sceneTracker` | **0.9503** (172/181) | 1512 ms | 2500 ms | present 48/53, location 19/21, time 21/21, heading 40/42, break 24/24 | J11.11–J11.15 | **Recommended.** Off the reply path, so its latency costs nothing a player feels. This round measured p50 **1512 ms**, where v2.2 recorded 1797/2509 — the headroom v2.2 called absent is real but still thin. |
| `curatorFilter` | **0.9167** (22/24) | 223 ms | 4000 ms | recall 13/13, narrowed 9/11 | J11.26, J8 | **Recommended** once a curator scope exceeds ~40 entries; pointless below that. |
| `director` | **0.9091** (30/33) | 1129 ms | **1500 ms** | — | J11.3, J11.4 | **Recommended only with an authored `roster[].role` on every candidate** — without roles it reports `fallback: "no-roles"` and does nothing. **New this round:** it fits its 1500 ms reply-path budget at p50 (1129 ms), which v2.2 could not say and called unverified. Improved from v2.2's 0.879. |
| `memoryPairs` | **0.9063** (29/32) | 750 ms | 3000 ms | — | J11.9, J11.10 | **Recommended.** |
| `loreSelect` | **0.8974** (70/78) | 509 ms | **1500 ms** | recall 35/39 (floor 0.8), precision 35/39 (floor 0.7) | J11.16–J11.19 | **Recommended with a known weakness.** Both families clear their floors and it fits its reply-path budget at p50, so the *rate* is the strongest it has been. What it does is still rank by a compressed, heavily tied probability (F4; measured tie rate 1.00), so *which* entries win the top-K slots is weaker than the rate suggests — and plan 10's rebuild was refused on that measurement, not on this number. |
| `typedExtraction` | **0.8433** (113/134) | 1290 ms | 5000 ms | answered 56/57 (floor 0.95), coverage 57/77 (floor 0) | J11.20, J11.21 | **Recommended, with the drop explained.** Both families pass — the `coverage` family's floor is 0 by design: it records how often the judge answers *at all*, and an answer under the confidence floor is recorded rather than counted wrong. v2.2 printed 0.908 for this use; the difference is the family split, not a regression. Needs authored `read_as` hints to do anything. |
| `sceneOoc` | — | — | — | — | — | **No evidence, and no consumer.** Not exercised by any journey, not calibrated, and — checked this round — **nothing in the build reads the flag**: its only occurrences are the settings declaration, this readiness table and a Storybook story. Flipping it on does nothing. |
| `memoryRerank` | — | — | — | — | — | **No evidence and no consumer**, as `sceneOoc` (verified the same way: no call site outside the settings declaration and this table). |
| `backgrounds` | 0.8636 (19/22) | 565 ms | — | **pick 15/18 FAILS its 0.85 floor**, none 4/4 | — | **Not recommended, and it is worse than that: nothing calls it.** It is a calibration family with no runtime consumer in this build — its only call site is the calibration dispatcher (`runtime/judge.ts`), and `backgrounds` is not a `JudgeUseKey`, so no setting turns it on. It stays in the calibration set as a measurement; there is nothing to recommend or withhold. |

## Combination advice

- **The two reply-path usages** (`director`, `loreSelect`) are the only ones where a fallback costs
  responsiveness rather than a feature. Both fit their 1500 ms budget at p50 **this** round, which is
  the fact v2.2 lacked; neither has been measured at p90 on this model, so a slow judge still eats
  into a turn before either falls back.
- Everything else is off-path; every calibration row below the confidence floor was recorded as such
  rather than as a disagreement, so turning several on costs boundary work, not turn time.
- `sceneOoc` and `memoryRerank` have neither evidence nor a consumer. Two toggles an author can flip
  that nothing reads is worse than an unproven use, because the panel currently presents them beside
  the measured ones; wiring them or removing the toggles is a v2.4 seed.
- **No row here is human-reviewed.** If the sessions are ever run, a usage with a poor human row
  drops out of this table whatever its calibration says — that is the rule this page was written to
  honour, and it is the one column it cannot fill.
