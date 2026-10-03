# Plan 13 — B10 CLI model as judge

**Status: SEED from v2.6, not approved.** Source: `docs/plans/v2.6/v2.7-seeds.md` row "B10 CLI model as judge". Overview: `00-overview.md`.

## What it is

- Answer judge questions with a general chat model reached through the harness plugin (a CLI such as `opencode run`;
  originally also `claude -p` and `codex exec`), instead of TypeSafe's Jev.
- The catch: a CLI returns **text**, not probabilities. Every judge threshold today reads a probability, so each use
  would need a new decision rule and its own calibration.
- And it is slow: seconds to spawn, so it can never sit on the reply path.

## History and evidence

| When | What | Where |
|---|---|---|
| v2.5 plan 13 | "LLM-as-judge via a harness" kept as candidate H-S3, belonging to plan 06; harness plugin designed (`/complete`, spawn per call) | `docs/plans/v2.5/13-harness-routing.md:49-50` |
| v2.5 plan 06 J8 | Contract = verbalized label (+ optional stated confidence); corpus = existing fixtures; columns harness vs Jev vs off; off-path only; setting `judge.transport[use]`; privacy row per vendor; "not a v2.5 build unless the user asks" | `docs/plans/v2.5/06-judge-next.md:197-207`; risk note "J8 looks like a cheaper judge and is not one" `:253-254` |
| v2.5 plan 06 J5 | Why the harness is not a Jev host: Jev is a System One classifier; a CLI is "a different contract" | `06-judge-next.md:150-158` |
| v2.6 Q4 | B10 recommendation **defer**: text not probabilities, 2–7 s spawn, needs the harness build | `docs/plans/v2.6/00-overview.md:278` |
| v2.6 W16 | User: plan 12 Phase C spikes it (row C12, floor = the Jev use's floor on the same fixture, its own decision rule declared first); C12 waits on 04 H | `00-overview.md:173`; `12-open-judge.md:97,109` |
| v2.6 W27 | **Harness scope = opencode only, no CLI logins.** "The Claude Code and Codex arms are dropped, not pending" | `00-overview.md:184` |
| v2.6 04 H | Harness plugin built (H1–H4 + agent bridge), opencode only offered; Claude/Codex support kept in code, unoffered | `docs/plans/v2.6/04-remaining-builds.md:12,310,340` |
| v2.6 plan 12 Phase 0 | Survey F6: all three CLIs **verbalized** only; "latency 2-7 s rules out the 1500 ms reply path. Off-path only" | `12-survey.md:73-79,169-177` |
| v2.6 plan 12 Phase C | Never started | `12-open-judge.md:3` |
| v2.6 T6-3 (2026-10-02) | Harness route **never exercised live**: opencode account hit its usage limit ("opencode reports its usage limit"), role Test took 75–89 s to report it | `test/sessions/T6/SUMMARY.md:160,203-218` |

Measured latency (probe, not a judge run):
- `claude -p` haiku, isolated flags: 402 input tokens, wall **2.1–3.4 s** (2 calls) (`13-harness-routing.md:100`).
- `opencode run` gpt-6-astra(-fast): wall **6.0–6.7 s**; inline agent cut input to 133 tokens but wall stayed 6.7 s,
  so startup dominates (`13-harness-routing.md:109-110`).
- `codex exec`: not found (`12-survey.md:196`).

Judge budgets it would have to fit (`src/judge/policy.ts`): director and lore 1500 ms (reply path), scene 2500, critic
2500, memoryVerify/memoryPairs 3000, stall/warden/curatorFilter 4000, typed 5000. **Every one is below opencode's
measured 6–7 s.**

## Why it was deferred

- Contract mismatch: no probability, so no existing threshold, readiness row or floor reasoning carries over.
- Latency: above every current judge budget.
- W27 removed two of the three CLIs, and the remaining one (opencode) ran out of quota in the v2.6 sessions.
- Privacy: opencode's own policy lists prompts for "Improving the Services" and the training question was closed
  unanswered (`12-survey.md:79,173`).

## Current state in code

- `DecisionContract` already has `"verbalized"` (`src/judge/providers.ts:8`), but `JUDGE_PROVIDER_IDS` is only
  `typesafe`, `llama-logprob` (`:3`). No verbalized provider exists.
- Harness plugin: `server-plugin/story-orchestrator-harness/` (`POST /complete`, concurrency 2 and queue 8 per harness,
  single-flight per user/harness/role, admin-only, `offer` gate) (`04-remaining-builds.md:310`). Not offered unless the
  server `config.json` sets `offer: true`.
- Judge plugin provider table: `typesafe`, `llama-logprob` only (`server-plugin/story-orchestrator-judge/index.mjs:9-11`).
- No `judge.transport[use]` setting; routing is `judge.provider[use]` (`src/judge/settings.ts`, plan 12 Phase A).

## Options

**A. Verbalized provider, off-path uses only.** New provider id `harness-verbal` behind the existing seam. One CLI call per
judge *request* (all its questions in one JSON answer), parsed strictly; a parse failure is that use's fallback. Each use
gets a declared decision rule (e.g. Noul → yes/no label, p := 1/0, or a stated-confidence band) and a calibration row on
its existing fixture. Budgets raised per use for this provider only, or the use limited to work nobody waits for (canon
verify, chapter-seal verify, memory backlog). Cost: per-call subscription/API quota; 6–7 s each. Risk: quota outages
(seen 2026-10-02) turn into fallbacks; vendor privacy row needed.

**B. Labelling aid, not a judge.** Use the CLI model offline to *propose* labels for new fixtures (J7, J6d, plan 15),
which a human or a second pass confirms before any judge answer is read. No runtime code, no new provider. Cost: one-off
quota. Risk: model-proposed labels bias the fixture toward that model; mitigate with the user spot-check and by never
calibrating the same CLI model on fixtures it labelled.

**C. Restore Claude Code / Codex arms** (reverse W27) to get the faster `claude -p` (2–3 s). Still above the reply path,
still verbalized; needs logins the user ruled out.

**D. Drop it.** The local judge question is better served by plan 15 (a model that returns real probabilities on this
machine).

## Recommendation

**D for the runtime judge, plus B as tooling.** A verbalized, 6–7 s, quota-bound judge adds a contract, a decision rule
per use and a privacy row, to serve only uses nobody waits on, and it failed on quota the one time it was scheduled.
Plan 15 is the better path to a non-TypeSafe judge. Using the CLI as a labelling aid gets value from the harness without
putting it on any play path.

## Decisions for the user

1. Build a verbalized CLI judge provider in v2.7? **Rec: no (drop B10 as a runtime judge).** I would like to have it for multiple purposes, maybe not for the judge, but for example the wizzard. Idk if CLI is the right approach, but i want to be able to connect to multiple cloud providers. And i think ST do not support this like this.
2. Use the harness CLI as a fixture-labelling aid for J7 / J6d / plan 15 fixtures? **Rec: yes, with your spot-check of 5
   rows per fixture, and the labelling model never calibrated on its own labels.** sure
3. W27 (opencode only, no logins): keep? **Rec: keep.** Reopen only if B10 is wanted as a runtime judge after all. keep
4. If you do want A anyway: which uses? **Rec: only canon verify (plan 14 J7.2) and the chapter-seal verify, which run
   off-path with no player waiting.** what do you recommend? explore uses and come back with proposals

## Floor and measurement before building

Only if decision 1 is "yes" (option A):
- Per use: its decision rule declared **before** any answer is read (`12-open-judge.md:97`), then the Jev use's
  existing floor on the same fixture, ×2, with judge-off and TypeSafe columns (`12-provider-matrix.md` shape).
- p95 latency per use against a budget declared for this provider; quota-failure rate recorded as fallbacks.
- A calibration row per provider × model × use (`readiness.ts`), bound to the fixture revision; an unlisted model is
  refused by the harness allowlist.
- Privacy row for the vendor before any routing (the provider notice, `JUDGE_PROVIDERS`).

For option B: no floor; record which fixture rows were model-proposed and which the user confirmed.

## Gates

- B (tooling): `npm run test:debug` for any script; docs.
- A (provider): judge seam + plugin → `npm run gates` + `npm run test:plugin`; a mutant routing to an uncalibrated
  `harness-verbal` must be refused (Phase A routing test pattern); live: the routed use ×2 on a lane with the harness
  offered and warmed (`HARNESS_LIVE=1`), real model, quota recorded.

## Links

- 15 open-source Jev alternative (the recommended path to a non-TypeSafe judge)
- 14 J7 judge ideas, 20 J6d shadow record (fixtures B10-as-labeller would help build)
- 10 model choice (a hosted model choice may change the harness model list)
- 04 story presence/plays index, 19 quests/game layer, 18 character life, 25 new game plus, 08 SP2, 22 SP9, 16 spike
  defers, 12 curator create op, 11 warden-lore one request, 21 cue+scene read merge, 09 C4 option b, 07 commitment
  double negatives, 23 D6/T22 revisits, 06 thinking per story
