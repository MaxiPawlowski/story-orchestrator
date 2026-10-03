# Plan 14 — J7 judge ideas

**Status: SEED from v2.6, not approved.** Source: `docs/plans/v2.6/v2.7-seeds.md` row "J7 judge ideas". Overview: `00-overview.md`.

## What it is

Seven candidate new jobs for the judge (TypeSafe's Jev today; any calibrated provider later). Each would replace or
check work an LLM pass or a fixed rule does now. None is built, and none has a fixture of its own. Each is a separate
decision: build, measure first, or drop.

## History and evidence

| When | What | Where |
|---|---|---|
| v2.2 acceptance | Listed as v2.3 seeds (plus "recap narrator", which waits on a human eval) | `docs/plans/v2.2/08-acceptance.md:117-126` |
| v2.3 plan 10 §D | Each given a question shape and a predeclared floor; "build only past floor". **None was run**: §C and §D recorded NOT BUILT | `docs/plans/v2.3/10-judge-seeds.md` §D table; Gate record §"C and D — NOT BUILT" (`:196-202`) |
| v2.5 plan 06 J7 | Same table, floors as v2.3; "the user picks"; fixtures ≥ 20 cases with a Spanish slice. Not started | `docs/plans/v2.5/06-judge-next.md:182-195`, `:294` |
| v2.6 Q4 | Recommendation **v2.7, unless one matters for Adolion**; each needs a 20-case English fixture (W25) | `docs/plans/v2.6/00-overview.md:276` |
| v2.6 W16 | User: plan 12 Phase C spikes all of them (rows C5–C11) | `00-overview.md:173`; `12-open-judge.md:96` |
| v2.6 plan 12 | Phase C never started | `12-open-judge.md:3`; no J7 fixture in `test/fixtures/judge/` (listed 2026-10-03) |

General constraints that apply to every idea:
- **Rule (v2.6 Out of scope):** "a judge probability deciding a story-state write" is refused (`00-overview.md`
  §Out of scope). Ideas that would write the blackboard must be review-only or rejected.
- **Provider state:** only TypeSafe is routable. Every llama-logprob row was withdrawn after it answered 0/96 calls under
  play load (`docs/plans/v2.6/12-provider-matrix.md:174`, commit `10a74535`).
- **Judge rule for every idea:** ≥ 20-case English fixture, labelled before any answer is read, a predeclared floor, a
  judge-off column, its own `judge.uses.*` key, and a readiness row per provider × model × use
  (`src/judge/readiness.ts`), bound to the fixture revision (`15-judge-remeasure.md` §What changed).

## Why it was deferred

Every idea needs a labelled fixture first, and the v2.6 time went to the provider seam, the English re-measure and the
autonomous sessions. None was shown to matter for the Adolion lab in v2.6.

## Current state in code

Per idea below. Shared: `JUDGE_USE_KEYS` (`src/judge/settings.ts:7-25`) holds none of them; thresholds live in
`src/judge/policy.ts`.

---

### J7.1 Scene-break confirmation

- **What it would replace:** the LLM's confirmation of a scene break. Today the judge only *triggers*: a
  `sceneBreak.p ≥ SCENE_TRIGGER` (0.4) schedules a `scene:judge` shared read, and the read's `SCENE_BREAK`/`SCENE_NONE`
  line confirms (`docs/plans/v2.2/03-scene-read.md:25-26,63-64,188`; `src/judge/scene.ts:136`;
  `sceneCoordinator.ts:42-43`). Confirmation would let a judge hit start the scene-summary pass without that line.
- **Evidence already on record:** the recorded golden `test/goldens/judge/scene.calibration.json` (2026-10-01,
  `jev-1.13.0`) has break 22/22 and nobreak 18/18. Read from its rows: break p 0.48–0.90, nobreak p ≤ 0.18. So on this
  fixture **any threshold in (0.18, 0.48] meets the v2.3 floor** (≥ 0.95 break, 1.0 nobreak). Caveats: rows come in
  twin pairs (`S01`/`S01t`), so about 11 break and 9 nobreak distinct windows; authored, not mined from play; the lowest
  break (0.48) sits near the trigger.
- **Fixture needed:** the existing `scene.json` break/nobreak rows plus ≥ 10 new distinct English windows from archived
  sessions (hard cases: time skips inside one location, soft location drift), so ≥ 20 distinct windows.
- **Unknown:** how many reads it saves. Count `scene:judge` reads in the v2.6 plan 14/15 session rings before deciding; not
  determined here.
- **Recommendation:** **measure** (cheap: mostly existing data). Build only if the replay holds at floor ×2 and the
  session rings show the confirm reads are a real cost.

### J7.2 Canon verification

- **What it would replace / add:** nothing today checks the canon (P4 LLM regeneration, `src/memory/canon.ts` has no
  judge or verify call, grep 2026-10-03). Verify = one Noul per canon sentence against live facts; unsupported sentences
  dropped before the canon is stored. Players see the canon's history section (`getCanonProse`), so an invented sentence
  is player-visible.
- **Reusable shape:** `memoryVerify` already asks "is this line supported by the transcript" (`buildVerifyRequest`,
  used by `extractionCoordinator.ts:273-280` and the chapter seal `chapterSeal.ts:224-234`). TypeSafe readiness 0.9722,
  p50 236 ms (`readiness.ts:76`).
- **Floor (v2.3):** ≥ 0.9 of unsupported sentences dropped, ≤ 0.1 of supported dropped.
- **Fixture needed:** ≥ 20 English canon sentences with their fact list, about half deliberately unsupported (mined from
  session canons where possible).
- **Recommendation:** **measure first; strongest candidate.** It reuses a measured question shape and guards a
  player-visible text.

### J7.3 Epistemic via the judge

- **What it would replace:** the LLM epistemic pass (`runEpistemicLedgerPass`, `[knows]/[unaware]/[suspects]/…` lines),
  which needs post-filters because the model over-reports (`dropCommonKnowledge`, `capEpistemic`; `.claude/rules/
  gotchas.md` v2 plan 10 handle notes). Judge form: a Choice per (subject, fact) over knows / unaware / suspects / hiding.
- **Cost shape:** subjects × facts questions per pass, so it grows fast with cast and fact count. Not sized here.
- **Floor (v2.3):** ≥ 0.85 agreement vs the LLM pass. Note: agreement with the LLM is a weak target; the fixture
  should be labelled by hand, scored against the labels, with the LLM pass as the judge-off column.
- **Context:** v2.6 T7 found secret spread at prompt level and fixed it in the shared tiers (commits `a19c7023`,
  `f0e62687`). That was an injection-scope bug, not a classification error; a judge would not have prevented it.
- **Fixture needed:** ≥ 20 (subject, fact, window) rows labelled with the four states.
- **Recommendation:** **defer.** Expensive per pass, the LLM pass is not shown to be the weak link, and the recent
  privacy defects were elsewhere.

### J7.4 Cast tuning (curator)

- **What it would add:** a review-only curator that scores each roster member "should speak more / less" from the talk
  decisions ring (`extras.talk.decisions`, v2 plan 14 speaker direction) and proposes `talk` weight changes for the author.
- **Floor (v2.3):** ≥ 0.85 on ≥ 20 labelled rings.
- **Fixture needed:** ≥ 20 talk rings (whole group sessions) labelled by a human for "who was under/over-used". No such
  labels exist; the v2.6 plan 14/15 group sessions are the only source.
- **Writes:** story config only via author review (curator pattern), never the blackboard.
- **Recommendation:** **drop for now** (or wait for a playtest complaint about speaker balance). Labelling whole rings is
  costly, and no session has reported it as a problem.

### J7.5 Two-hop look-ahead

- **What exists:** the scene read already asks `heading` over checkpoints **one and two hops out**
  (`reachableFrom`, `sceneCoordinator.ts:201-208`, capped at `SCENE_MAX_REACHABLE` 6). But pre-generation consumes only
  `hops === 1` at `LOOKAHEAD_PREGEN_P` 0.7 (`expansionCoordinator.ts:192`). So the two-hop *question* is already asked;
  the two-hop *consumer* is not built.
- **What it would add:** pre-generate an expansion chain for a hop-2 checkpoint when the heading p is high.
- **Floor (v2.3):** ≥ 0.85. The `scene.json` heading rows carry no hop field (all 52 reachable entries lack `hops`,
  checked 2026-10-03), so the existing fixture cannot score hop 2.
- **Fixture needed:** ≥ 20 windows with labelled hop-2 headings.
- **Recommendation:** **defer.** A hop-2 pre-generation spends a generation on a route two transitions away; the hop-1
  consumer's live value (`lookahead`: "worth it where prepare-ahead is wanted; dead weight otherwise",
  `readiness.ts:86`) is not established strongly enough to extend.

### J7.6 Per-quality floors

- **What it would replace:** the single typed-read floor `EXTRACTION_CONFIDENCE` 0.8 (+0.1 if latching)
  (`src/judge/extraction.ts:161`, `policy.ts:91-92`), with floors keyed by `read_as` kind.
- **Policy, not a new question.** No new call; only thresholds move.
- **Fixture:** `test/fixtures/judge/typed.json` has 55 rows, `read_as` counts choice 61 / stated 13 / rating 2 (counted
  2026-10-03). So choice can be split, stated is short of 20, rating has 2: new rows needed for any per-kind claim.
- **Rule question:** typed deltas already enter as `source: "extractor"` deltas through the apply queue
  (`runtime/typedRead.ts:17-21`). Moving their floors changes which judge answers write state. Whether that counts as
  widening "a judge probability deciding a story-state write" is for the user.
- **Recommendation:** **measure after plan 20 (J6d) replay**, which shows where the judge and extractor disagree by kind.
  Do not move a floor on fixture rows alone.

### J7.7 Canon regeneration drafts

- **What it would add:** when the canon regenerates, store the result as a draft the author approves, with each
  sentence pre-checked by J7.2's verify.
- **Floor (v2.3):** ≥ 0.9 supported sentences kept, 0 unsupported inserted.
- **Fixture:** the same as J7.2.
- **Recommendation:** **fold into J7.2** as an author-review mode, not a separate use. Measure once, two consumers.

---

## Options

- **A.** Run every J7 idea as a Phase A (fixture + calibration ×2) in v2.7. Cost: seven fixtures (≥ 140 labelled rows),
  seven calibration runs ×2.
- **B.** Run the cheap and valuable ones only: J7.1 (mostly existing data) and J7.2 + J7.7 (one fixture). Defer J7.3,
  J7.5, J7.6 (J7.6 after plan 20). Drop J7.4.
- **C.** Drop the whole family until a playtest names a problem one of them fixes.

## Recommendation

**B.** J7.2/J7.7 protect a player-visible text with a question shape that already calibrates well, and J7.1 is almost
free to measure.

## Decisions for the user

1. Which J7 ideas get a Phase A in v2.7? **Rec: J7.1, J7.2 (+ J7.7 as its review mode).** Lets do A, and also review https://github.com/mossyfield/ST-jeved/ for any new use case. This is really important for me bcs is cheap, fast and works well.
2. J7.4 cast tuning: drop, or keep as a seed waiting for a playtest complaint? **Rec: keep as a seed, no work.** 
3. J7.6 per-quality floors: does moving typed floors count as a "judge probability deciding a story-state write"?
   **Rec: no, it tunes an existing accepted path, but only after plan 20's replay and new per-kind rows.**
4. J7.2: verify on every regeneration (auto-drop) or draft-only (author approves)? **Rec: auto-drop below the
   threshold in both modes; draft mode as an author option.**
5. Fixture labelling: who labels (the user, Claude, a second model)? **Rec: Claude labels from session evidence, the
   user spot-checks 5 rows per fixture; no Adolion content leaves the private evidence repo.** Lets do ur recommendation

For the unanswered questionns, i dont have the answer. But lets prepare a test set and see if we can get value of those spikes or POCs. If we manage to, we may decide to have those behind a setting

## Floor and measurement before building

| Idea | Floor (predeclared, v2.3 §D, unchanged) | Fixture | Judge-off column |
|---|---|---|---|
| J7.1 | ≥ 0.95 break, 1.0 nobreak | `scene.json` break rows + ≥ 10 new distinct windows (≥ 20 distinct) | the LLM confirm line |
| J7.2 | ≥ 0.9 unsupported dropped, ≤ 0.1 supported dropped | ≥ 20 canon sentences + facts | keep everything |
| J7.3 | ≥ 0.85 vs hand labels | ≥ 20 (subject, fact, window) | the LLM pass |
| J7.4 | ≥ 0.85 | ≥ 20 labelled talk rings | no proposal |
| J7.5 | ≥ 0.85 | ≥ 20 windows with hop-2 labels | hop-1 only |
| J7.6 | none of its own (policy); per kind ≥ the typed `answered` floor 0.95 | ≥ 20 rows per `read_as` kind | the single floor |
| J7.7 | ≥ 0.9 kept, 0 inserted | J7.2's | — |

Every measured idea: calibration ×2 on TypeSafe (`so-judge calibrate --use … --record`, page reloaded between runs),
a readiness row bound to the fixture revision, a jest golden that replays whatever the verdict. A floor missed is
recorded as not built; no floor is retuned.

## Gates

- Fixtures, goldens, policy: pure tier (`npm run typecheck && npm run lint && npm test`).
- Any built consumer (scene, canon, curator, expansion): runtime tier → `npm run gates` + live real-LLM + real-judge
  checks (J11 scene/canon checks extended ×2, judge-off arm makes 0 calls), `so-ui assert-player-clean` for anything
  that reaches the canon prose.

## Links

- 20 J6d shadow record (feeds J7.6)
- 13 B10 CLI judge, 15 open-source Jev alternative (other providers for these uses; each needs its own row)
- 21 cue + scene read merge (J7.1 touches the same scene read)
- 11 warden-lore one request (same "bundle a judge call" question)
- 18 character life (J7.3/J7.4 touch knowledge and speaker balance)
- 04 story presence/plays index, 19 quests/game layer, 25 new game plus, 08 SP2, 22 SP9, 16 spike defers, 12 curator
  create op, 09 C4 option b, 07 commitment double negatives, 23 D6/T22 revisits, 10 model choice, 06 thinking per story
