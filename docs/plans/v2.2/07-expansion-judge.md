# Plan 07 — Expansion judge: critic, generate-then-pick, look-ahead

## Objective

Expansion writes beat chains between an authored checkpoint and the next anchor. It is the most
generative thing the runtime does, and it holds two decisions a judge can make better and cheaper:

- **Is this chain acceptable?** The critic. Today it is a second LLM call: a prompt carrying the
  beats JSON, canon and facts, and a 512-token JSON verdict (`critic.ts:74`). In the spike the
  judge's verdict was right 10/10.
- **Which of several chains is best?** The user's "many variations, then pick". Generate N chains
  at a higher temperature, check each in code, score each with the judge, and let code pick.

It also answers "plan checkpoints a couple of steps ahead". The plan-03 look-ahead read says which
reachable checkpoint play is drifting toward, so its stub can be expanded **before** the story gets
there, not only from the active checkpoint.

## Context

- Spike: README §Expansion critic checks (verdict 10/10; the 3 per-check misses trace to labels and
  wording). `experiments/guards.mts:63–66` holds the three nouls:
  - `contradicts`: any beat vs `established_facts`;
  - `advances`: toward `target_checkpoint`;
  - `newCharacter`: a named person not in `cast`.
- Today:
  - `boundaryWork` `expansion` (order 40, P3) calls `scheduleExpansionForActive`, which in turn
    calls `findStubExpansionCandidate(story, activeCheckpointId)`. Only stubs one hop from the
    **active** checkpoint are expanded.
  - `generateReviewedBeats` runs `generateBeats` (2048 tokens, one repair pass), then
    `runCodeChecks` (bridge to target snapshot, progress threshold, ≥ 2 beats, no gate
    contradicting a latched value), then `runCritic` (LLM JSON).
  - `revalidate.ts` marks a chain stale when the blackboard basis drifts. It skips the active
    expansion.
  - `scheduleForActive` returns early whenever an entry already exists for the candidate's key
    (`expansionCoordinator.ts:113`). The key is `source → stub → target`, and nothing clears a
    `stale` or `failed` entry. So one entry per key is ever attempted automatically.
- `callExtractionModel` pins `temperature: 0.1` (`extraction/client.ts:14`), so N variants at that
  temperature would be near-identical. A variant temperature has to be threaded through.
- The memory LLM backend here has 2 llama.cpp slots (`LLM_PARALLEL=2`), shared with the other
  passes. N variants are GPU time on the P3 lane.
- Not measured: ranking N chains. Overview rule 2 applies, so Phase A comes first.
- Consumed: plans 01, 03 (look-ahead). Regression floor: the v2 `plan05-background-generation`
  scenario, and the expansion checks inside J7.

## Scope

In:
- The judge critic.
- N-variant generation + judge scoring + code pick (after Phase A).
- Look-ahead pre-generation.
- Fixtures, and a J11 expansion check.

Non-goals:
- Canon regeneration drafts (a v2.3 seed; the same pattern).
- Changing `runCodeChecks`: the code checks stay first and stay binding.
- Letting the LLM make the final pick. See unresolved questions.

## Deliverables

### Phase A — spike

`experiments/variantPick.mts` + `data/variants.json`: ≥ 10 stubs from sun-ruins and the
Adolion stories. Each stub gets 3 hand-written chains:

- one clean;
- one that contradicts an established fact;
- one that wanders or holds its tension flat against the `tension_trajectory` shape.

The labels are the defect categories, which are objective, not taste. Score each chain with:
- the three critic nouls;
- one new `score`: "How closely do `generated_beats` follow `tension_trajectory`?", 5 described
  levels.

Floors:
- the clean chain ranks first in ≥ 8/10 stubs by the composite below;
- every contradicting chain is rejected at `contradicts ≥ 0.3`.

### Pure core: `src/judge/expansion.ts`

- `buildChainQuestions(chain, {facts, target, cast, trajectory})`: the spike's three nouls verbatim,
  plus the Phase A score. State:

```
{ established_facts, target_checkpoint: {name, objective},
  cast, tension_trajectory, generated_beats: [{objective, guidance?}] }
```

- `judgeVerdict(answers)`: pass iff `contradicts < CRITIC_CONTRADICTS_MAX` (0.3), `advances ≥
  CRITIC_ADVANCES_MIN` (0.5) and `newCharacter < CRITIC_NEW_CHARACTER_MAX` (0.5). The issue
  strings are code-composed from the failing checks, so the existing `CriticVerdict {pass, issues,
  raw}` shape holds.
- `chainScore(answers)` = `advances + shapeScore − 2·contradicts − newCharacter`. The weights live
  in `policy.ts`. Code picks the highest-scoring chain that passes code checks **and** the verdict,
  with ties going to the lowest variant index.

### Critic

`runCritic` gains an injected `judgeCritic?`:
- With `judge.uses.expansion` on, the judge verdict replaces the LLM JSON critic.
- On judge failure, the LLM critic runs exactly as today.
- `needsReview` semantics are unchanged.
- The author view expansion card shows the three probabilities.

### Variants (only if Phase A passes)

- `ExtractionClientOptions` gains optional `temperature` (default 0.1). `callExtractionModel`
  passes it, and every existing call site is unchanged.
- `generateReviewedBeats` gains `variants?: {n, temperature}`. It generates N chains
  **sequentially** (the P3 lane; never more than one generation in flight from expansion), runs the
  one repair pass per chain as today, and filters by `runCodeChecks`.
  - Survivors are judged in one fan-out (a question set per chain over shared facts/target state).
    Code picks.
  - With no survivor, the result is today's failed / needs-review path, keeping the best
    code-check failure for the author.
- Settings: `judge.expansionVariants` = 1 (off) | 2 | 3, default 1, and a temperature of 0.7. The
  expansion entry records each variant's generation time, and the Gate record reports the GPU time
  per expansion from those entries.

### Look-ahead pre-generation

- The `expansion` boundary entry, with `judge.uses.expansion` on and a plan-03 scene read present:
  after the active candidate, it also considers **one** stub whose source checkpoint is one hop
  ahead and whose `headingTo` p ≥ `LOOKAHEAD_PREGEN_P` (0.7, from plan 03's calibration).
  - `findStubExpansionCandidate(story, aheadCheckpointId)` is reused unchanged.
  - One pre-generation in flight at most, and it never displaces the active candidate.
- Pre-generated entries carry `basis` like any other. The existing `revalidate.ts` drift check
  marks them stale if the blackboard moves before the story arrives.
- **Key collision, handled explicitly.** A look-ahead candidate for checkpoint X has the same key
  as the candidate `scheduleForActive` builds when the story arrives at X. Left alone, a stale or
  failed pre-generation would block the real expansion forever. So:
  - expansion entries gain `origin: "active" | "lookahead"` (sanitizer default `"active"`, v2.1
    rule 6);
  - `scheduleForActive` re-queues an existing entry when it is `origin: "lookahead"` **and**
    `stale` or `failed`. The retry is capped by the existing `attempts` counter at 2;
  - an `inserted` look-ahead entry whose basis still holds is used as is, since that is the point.
  With that rule the look-ahead can only waste a generation. It can never block arrival, and it
  can never insert a chain that no longer fits.
- The entry records `origin: "lookahead"` and the `headingTo` p that triggered it. The Scheduler
  tab shows it.

### Fixtures

- `test/fixtures/judge/critic.json` = K01–K10 relabelled where the spike found label errors, plus
  the Phase A chains.
- `test/fixtures/judge/variants.json` (matches `--use variants`).

### J11 expansion check

J11.25: sun-ruins with a stub reachable from the next checkpoint. Play toward it (a scripted
message sequence) → a `lookahead` expansion is queued before the checkpoint fires. On arrival
either:
- the chain is used (basis unchanged); or
- it went stale and is **re-queued** (basis drifted), and the stub is expanded anyway.

The journey logs which branch ran. With variants = 2, the expansion entry shows 2 generations and
1 pick, and the call ring holds the judge scores.

## Implementation notes

- The judge never writes beats. It only accepts, rejects or ranks what the LLM wrote, and code
  owns the pick. That keeps expansion's failure mode where it is today: a failed or needs-review
  entry, never a silently wrong insert.
- `expansionCoordinator` (170 lines) owns the look-ahead scheduling. The pure planner
  (`generation/planner.ts`) is unchanged.
- The critic's LLM call (beats + canon + facts in, 512 tokens out) disappears when the judge is on.
  That is the direct GPU saving; the variants spend it back only if the author turns them on.

## Leaves the machine

| Question | Data sent |
|---|---|
| Critic / ranking | Up to 40 established facts; the target checkpoint's name + objective; cast names; the tension trajectory; generated beat objectives + guidance |

## Validation gate

Harness:
- `npm run typecheck && npm run lint && npm test && npm run build`.
- Pure suites: `judgeVerdict`, `chainScore` pick order, temperature threading (unchanged defaults
  at every existing call site), and look-ahead candidate selection (one at most, never displacing
  the active one).

Live (fresh-start, headed, real):
- J11.25, run twice.
- `so-judge calibrate --use critic` and `--use variants`.
- `plan05-background-generation` green with judge expansion on and off.
- J7's expansion checks.

## Persona tags

| Element | Tag |
|---|---|
| Expansion card probabilities, variants setting | `author` |
| `#so-judge-use-expansion` | `both` |

## Delegated decisions

- The composite weights in `chainScore`: fix them from Phase A, then freeze them in `policy.ts`.
- Whether look-ahead also considers two hops ahead. Proposed: no until J11 data shows one-hop
  pre-generations get used.

## Unresolved questions

- **"Many variations, then the LLM picks."** This plan has code pick from judge scores. If the
  intent was for the LLM to choose from a judge-narrowed shortlist, that is one more generative
  call per expansion; decide before building.
- Is a variant temperature of 0.7 on Artemis (Q4, repetition-sensitive; see the Artemis RP config
  memory) safe from loops at 2048 tokens? Phase A can't answer it; the first live run measures it.
