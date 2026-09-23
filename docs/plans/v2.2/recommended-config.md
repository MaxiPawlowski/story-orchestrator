# Recommended configuration

Extracted unchanged, 2026-09-22 (v2.3 plan 09), from `acceptance-report.md` §Recommended
configuration, so the settings panel can link it. The report keeps the evidence; this file is the
table an author reads before opting in.

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

## Warden and curator (stagecraft, separate switches)

| | |
|---|---|
| `stagecraft.wardenEnabled` | **Recommended in `review` mode.** `continuity` calibrated 1.000 (85/85) and J8.5/J8.6/J8.9 are green. `auto` applies a note without an author seeing it — sound on the measurements, but it writes into the prompt, so `review` is the honest default. |
| `stagecraft.curatorEnabled` | **Recommended in `review`.** Green in J8 across two runs. It has no `create` op by design (F5), so a book that ships empty stays empty. |

## Combination advice

- The two reply-path uses (`director`, `loreSelect`) are the only ones where a fallback costs
  responsiveness rather than a feature, and they are the two with unverified live latency. Someone
  who cares more about turn latency than about either feature should leave both off and lose
  nothing else.
- Everything else is off-path and fell back zero times in 20 calls, so turning several on costs
  boundary work, not turn time.
- `sceneOoc` and `memoryRerank` have no evidence behind them at all. They should not be in a
  recommended set until something exercises them.
