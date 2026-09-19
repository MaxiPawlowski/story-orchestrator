# Spike: TypeSafe (Jev) for Story Orchestrator's decision passes

2026-09-19. Question: which of our prompt-and-parse LLM passes could a System One model (TypeSafe's
Jev: typed choice / score / yes-no answers with calibrated probabilities) replace or guard, and what
would we gain and lose in convenience, quality and performance?

Not a gate. Nothing in `src/` changed. The harness lives in `scripts/spike/typesafe/`; the machine
report of the run this page summarises is archived next to it (`report.md`, `results.json`).

## Setup

| | |
|---|---|
| Jev | `jev-latest` = `jev-1.13.0`, `POST https://api.typesafe.ai/v1/systemone`, called from Node on this machine (Spain) |
| Current path, live | Artemis 31B Q4 on the RunPod 5090 via llama.cpp, CM profile "Story Orchestrator Memory RunPod" (text completion, Gemma 4 instruct, preset "Artemis Extraction", our override temp 0.1 / top_p 0.9, DRY/XTC/adaptive-P off), sent through the page's own `ConnectionManagerRequestService`, one call at a time |
| Current path, recorded | The 22 live-suite goldens (`test/goldens/live/`, Gemma 4, recorded 2026-07 at v2 acceptance) |
| Prompts and parsers | The real production code, imported into Node: `buildFixtureRun` + `renderSharedReadPrompt`, `parseSharedReadResponse`, `renderDirectorPrompt` + `parseDirectorResponse`, `narrowByMention`, `applyArcSignals`, `consolidateTier`, `detectSceneBreakHeuristic` |
| Question design | Per the TypeSafe agent skill: named JSON state, backticked references, a no-match option on every choice, speculative questions batched into one call per decision |

Every Jev question was asked in two forms where it made sense. **Plain** is the mechanical
migration: the authored rubric verbatim as the instruction, generic options. **Structured** adds
per-option descriptions (`what` / `not_for` / `examples`), i.e. the extra authoring a story would
need. Plain is the fair test of "drop-in"; structured measures what authoring buys.

Run it:

```bash
node --no-warnings --experimental-transform-types scripts/spike/typesafe/run.mts
```

`--dry-run` exercises everything without the API, `--baseline` adds the live current-model calls
(needs the shared ST browser and a free backend), `--only <ids>` narrows. Answers are cached under
`.debug/typesafe-spike/`, so re-running only re-scores.

## Verdict

On typed extraction, Jev **matches** a 31B model, it does not beat it. The gains are elsewhere:
the shared read gets about 12× faster and leaves the GPU, speaker direction gets more accurate
and harder to hijack, and several passes that today run on regexes or Jaccard become real
judgments. Those passes are the scene-break trigger, memory consolidation, memory verification
and continuity. The costs are a proxy, a second backend, per-quality authoring hints for
numbers, one authored role line per character for the director, and chat text leaving the
machine.

## Results by use case

Accuracy is against hand labels. "Current" is today's code path on the same cases.

| Use case | n | Current path | Jev, mechanical migration | Jev, best variant | Read |
|---|---|---|---|---|---|
| Typed deltas, hard set (traps) | 48 | Artemis 46/48 | 47/48 | structured 44/44 (Artemis 43/44 on the same 44) | parity |
| Typed deltas, live-suite fixtures | 30 | Artemis 30/30, recorded Gemma 30/30 | 28/30 | n/a | current path wins: fixtures were tuned on it; both Jev misses need inference |
| Tension level | 36 | Artemis exact 29, within one level 34 | exact 26, within one 35 | n/a | Artemis better on exact level; Jev runs one level high on calm scenes |
| Evidence message | 43 | quotes a span (not scored) | 43/43 | n/a | Jev returns a message id, not a quote |
| Gate-leaf yes/no (stall-reconcile shape) | 104 | full re-read | AUROC 0.99, 95% at 0.5 | n/a | calibrated: p ≥ 0.9 was right 36/36 |
| Speaker direction, director alone | 26 | Artemis 22/26 | names only 19/26 | hybrid 24/26 | **Jev wins**, but only with a one-line role per character, which production rosters do not have yet. Artemis followed an OOC "pick Luke" injection and missed a Spanish follow-up |
| Speaker direction, with the mention rule first | 26 | 77% | 69% | roles 81% | the mention rule itself is wrong on "mentioned, not addressed" |
| Scene break | 22 | regex heuristic 11/22, Artemis 22/22 | 22/22 | 22/22 | parity with the LLM. The regex only triggers an early read, and every LLM read confirms breaks, so the gain is latency and fewer wasted reads, not accuracy |
| Arc resolution | 22 | Artemis 22/22 | 21/22 | 21/22 | Artemis slightly better |
| Memory consolidation | 20 pairs | Jaccard 6/20 right; 5 more left "uncertain" (both kept, older flagged contradicted, no model call) | 15/20 | described labels 19/20 | **Jev wins** over the non-LLM path |
| Memory-line verification | 40 lines | none | AUROC 1.00 | 16/16 bad lines dropped while keeping 90% of good ones | new capability |
| Verification of Artemis's real memory lines | 93 lines | none | 8 flagged | 2 real fabrications flagged at p = 0.04 | 2 false alarms sat at 0.47, so a drop cut near 0.2 is clean |
| Continuity warden | 18 replies | not built | 18/18 replies right, 1 false alarm | n/a | new capability |
| Expansion critic checks | 10 chains | LLM JSON verdict (not compared) | verdict 10/10 | n/a | the 3 per-check misses trace to my labels and wording |
| World Info on/off | 17 | LLM curator (not compared) | 88%, AUROC 1.00 | n/a | toggles only; rewrites stay generative |
| Background pick | 12 | not built | 11/12, both "nothing fits" cases right | n/a | new capability |

## Performance

| | Jev | Artemis 31B (today) |
|---|---|---|
| Shared read | p50 270 ms | p50 3.2 s, p90 4.9 s, max 7.3 s |
| Director decision | p50 255 ms | p50 458 ms |
| 1 → 64 questions in one call | 240 → 275 ms | n/a |
| 2 → 96 messages of state | 262 → 289 ms | n/a |
| 16 calls at once | all back in 0.67 s, no retries | n/a |
| Cold first call | about 1.5 s | n/a |
| Cost | $0.08 per 1000 boundaries (shared read + direction); a full spike run of 386 calls cost $0.014 | pod time; each read holds one of two llama.cpp slots for about 3 s |
| Repeat-run stability | 5/118 answers flipped across 5 identical calls, all near a threshold | not measured (temp 0.1) |

Jev latency is flat in both questions per call and state size, so fan-out is free and cadence 1 is
affordable. The latency floor is the network round-trip from Spain, not the model.

## Gains and costs

**Convenience.** Jev returns typed JSON, so the output grammar, the format-variant tolerance, the
channel-noise stripping and the instruct-template dependency all fall away for these passes. Artemis
wrapped every director answer in a `<|channel>thought` block the parser had to strip. The mechanical
migration, which uses each rubric verbatim, scored 98% on the hard set with no authoring. The costs:

- **A proxy.** The API refuses browser origins, so a key never reaches the page. That means an ST
  server plugin, which needs `enableServerPlugins`, or an external forwarder.
- **A second backend to configure and qualify.** Memory lines, summaries, canon, the epistemic
  map, the ledger, expansion beats, the wizard and curator rewrites all still generate text.
- **Numbers need a hint.** Jev selects from number mentions found in code; it cannot invent one.
  "Cheers rise across the crew" can never become morale 8. A quality needs to say whether it is
  a stated count or a rating on described levels.
- **Criteria authoring is a sharp tool.** I put 8 of my 10 `not_for` clauses on the wrong
  option, which silently inverted their meaning, and only caught it by reading the
  rendered requests. A Studio editor for criteria would need a preview.

**Quality.** Jev is better at direction, and calibrated enough to abstain: accepting only answers
at confidence ≥ 0.95 kept 71% of extraction judgments at 100% accuracy. Where the current path is
not an LLM, the gains are large. Consolidation goes from 30% to 95%. The scene-break trigger goes
from 50% to 100%, but that trigger only decides *when* an LLM read runs, and every LLM read
confirms breaks. So a missed break costs latency (up to one cadence window), not accuracy.
The costs:

- **Parity, not gain, on extraction.** A 31B model already handles these traps.
- **Tension runs high.** Jev's exact level is worse, one level up on calm scenes, though 97% land
  within one level.
- **It reads literally.** "Was an ally wounded?" failed because the text never calls Toma an
  ally. "Three candles gutter" was judged not to support "three candles burn". "A named character
  not in `cast`" counted the player.
- **Confident misses happen.** Both systems picked the wrong speaker on a pronoun follow-up; Jev
  did so at confidence 0.88.

**Performance.** About 12× on the shared read, with the GPU slot freed for the roleplay model. The
costs: a network dependency sits on the director's path every group turn, so the rules fallback
and a short timeout are mandatory. The last 8 messages of every chat also leave the machine.

## Recommended shape, in order

1. **Director.** Use the Jev hybrid behind an install-wide backend setting: a role choice when
   confidence is at least 0.6, otherwise per-character composite questions, then today's rules
   below the floor. Demote the mention rule, which is wrong whenever a name is mentioned but not
   addressed. The hybrid needs a one-line role per character, which format 2 has to gain.
2. **Consolidation.** Keep the vector/Jaccard bands as a candidate-pair generator. Replace the
   state-change regex and the "uncertain → contradicted" flag with one Jev choice per candidate
   pair. The supersession bridge, which turns an update into quality deltas, stays.
3. **Verify rung.** Check each extracted memory line before storing it: drop below about 0.2,
   down-weight up to 0.5.
4. **New curators.** Build the continuity warden and the background half of the scene-setter on
   Jev.
5. **Shared-read split**, the largest change. Run Jev every boundary for typed qualities, scene
   break, arc resolution and tension, and move the generative memory pass to a lower cadence.
   Format 2 would gain a per-quality extraction hint (stated count or rating) and optional
   criteria.

Every step needs the proxy, stays off by default, and warns that chat text leaves the machine.

The implementation plan that grew from this is `docs/plans/v2.2/`. It refines the order above. It
keeps arc resolution and tension on the LLM, since the LLM was better on both. It moves the
shared-read split late (plan 06) because it is parity, not gain. And it adds measured-first use
cases this spike did not cover: the scene read, lore-select, look-ahead, and generate-then-pick.

## Corrections after review (2026-09-19)

Found while planning v2.2, by reading the production code the numbers were compared against:

- **Consolidation's "deferred to an LLM call" was wrong.** `consolidateTier` marks a pair
  *uncertain* when its bands match but the newer note has no state-change marker.
  `memoryCoordinator.runConsolidation` then keeps both notes and flags the older one
  `contradicted` (a ranking penalty). No model call happens: the supersession bridge runs only for
  superseded winners. The table above is corrected. The archived `report.md` and `results.json`
  still carry the old label "defer to LLM bridge" for those 5 pairs, and
  `experiments/memory.mts` now labels them "uncertain: keep both, flag older".
- **The scene-break comparison was framed as accuracy.** It is latency: see the table row and
  §Quality.
- **The director's win depends on data production doesn't have.** The hybrid's role choice used
  role lines from the spike's `data/worlds.json`. A production `RosterMember` is `{id, name}`, and
  names alone scored 19/26, below Artemis. v2.2 plan 01 adds an authored role and measures a
  names-only hybrid before relying on it.

## Threats to validity

- I wrote the cases, the labels and the questions. Samples are small (10 to 48 per use case),
  and the structured criteria were written knowing the traps, so plain is the fairer Jev number.
- After reading the results I corrected one label. In H28, "forget who's been paying my boys"
  makes Brandt complicit, not the payer, so the suspect label is now `brandt` or `unknown`.
  Three other misses are wording or label issues and are left as scored.
- Only test-story text was sent to TypeSafe. No private chats were used. Only 7 cases were in Spanish.
- Artemis ran with the extraction profile as configured, which also carries a roleplay system
  prompt, "Sphiratrioth - Roleplay - 3rd person". Whether that prompt reaches extraction requests
  was not checked.
- Latencies were measured from one machine on one morning, on a quiet API.

## Unresolved questions

- Would TypeSafe allow-list `localhost` origins, which would remove the plugin? (The plugin ships
  regardless, because keys stay server-side.)
- ~~Where should the key live?~~ Answered in v2.2 plan 01: ST's secrets store. The plugin reads it
  with `readSecret` on its own routes, which run after ST's user middleware; this was verified in
  ST source.
- Should confidence floors be authored per quality or checkpoint, or be one install-wide setting
  with a latching bump in code? (v2.2 plan 06 proposes the latter.)
- ~~Should the hint be authored or inferred?~~ Authored and opt-in (v2.2 plan 06). The copilot may
  suggest one.
