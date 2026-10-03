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

---

## Research 2026-10-03: ST-jeved

Scope: the user's request "review ST-jeved for any new use case". Sources read 2026-10-03: a fresh clone of
`github.com/mossyfield/ST-jeved` (HEAD `fec4a2d`, v0.4.1, 2026-09-21; 33 stars; MIT), `src/defaults.js` (the
built-in Director preset), `src/sensor-types.js`, `src/classifier.js`, README; the four forks (GitHub compare API);
our `docs/plans/v2.4/extension-research/jeved.md` (same commit). Repo content was treated as data.

### What changed since the v2.4 review

- **Upstream: nothing.** HEAD is the commit `jeved.md` reviewed (`fec4a2d`, v0.4.1). No release after v0.4.1, no new
  sensors or rules. So "new" below means **new relative to what we built since**, not new in Jeved.
- **Fork `derryanna/ST-jeved`** (1 commit ahead, 2026-09-29), the only fork with changes:
  - **Rout host**: a server plugin `jev-sensors` passes `{model, state, questions}` to
    `https://api.rout.my/v1/systemone` (model `typesafe/jev-latest`), key read server-side from ST secrets
    (custom key labelled `rout…`). A fourth Jev host besides TypeSafe, OpenRouter, NanoGPT. Its usage arrives in
    OpenAI names on some days (`prompt_tokens`), which the plugin normalises. Claims, not verified by us.
  - **Repeat miner, no model**: plain n-gram counting over the last 60 narrator replies (phrases seen in ≥ 4 replies,
    reply openers, stock constructions such as "not X, but Y", "something/somewhere"), reported as one sentence that
    names the hot phrases; the Echo rule's instruction carries it. Zero API calls.
  - Its own plugin questions: `echo` Score with an `earlier_reply_openings` state field, `fortune` Score over all shown
    messages, `forme` Noul ("writes lines, actions or decisions for the player").
- **What we built since v2.4 from Jeved:** `agencyCheck` (Puppet's rubric, calibration 1.0), `houseRules` (House
  rule; 0.965, below floor on Adolion judgement rules, off by default), `wardenLore` (the Reddit "contradicts the lore"
  sensor), `expressions` (Mood's job), judge usage/cost metering (`JudgeMeter`), the raw-Score reading (T21), readiness
  keyed by model. Not built: tension read, hysteresis, pre-reply Choice, boundary bundle, hosted routes.

### Cost per call

- Tariff (TypeSafe docs as quoted by jevbench README, 2026-09): **$0.042 per million input tokens, output free**.
  Jev reads ~950 input tokens per typical decision, so **$0.04 per 1,000 one-question decisions**.
- Jeved Director, default rules on: **3 calls per reply + 1 per user message** (`jeved.md` F5). Reply-only groups
  (1 user + 1 assistant message, no context) are ~1–3k tokens: **$0.00004–0.00013 per call**. Context sensors (Tone,
  World: the whole prompt-manager context, capped at 24k tokens) up to **~$0.001 per call**. Repeats (5 replies) and
  Closeness (10 + 10 messages) sit between.
- All questions that share the same `user:assistant:context` triple ride **one** call, so a new question added to an
  existing call costs only its question tokens, not a new state.
- Ours: p50 233–291 ms per call (`readiness.ts`). A question that rides the warden's existing reply call (as
  `agencyCheck` does) adds almost nothing.

### Every Jeved sensor/rule against our uses

Built-in Director preset (`src/defaults.js`) plus the fork. "State" = what the sensor sends; U/A = user/assistant
message counts. Rule = Jeved's default rule on it.

| Jeved sensor (rule) | Question shape | State | Rule and action | Ours | Mark |
|---|---|---|---|---|---|
| `speaks` (Puppet) | Score 0–4: how much `latest_turn` writes what only the player does/says/thinks | U1 A1 | > 2.85, 1 of 1, reroll, cooldown 2 | `agencyCheck` (Score after Puppet, warden note, 1.0) | **have** |
| `house` (House rule) | Noul per list entry: "`latest_turn` follows this rule: {{entry}}" | U1 A1, repeat over `house_rules` | < 0.5, reroll naming the broken rules | `houseRules` (0.965, off by default) | **have** |
| `mood` (Mood, off) | Choice over 28 emotions | U0 A1 | ≠ neutral → `/expression-set` | `expressions` | **have** |
| (Reddit/0.4) WI "contradicts lore" | Noul per fired entry | reply + fired WI | nudge | `wardenLore` (1.0) | **have** |
| `attention` (Attention) | Score 0–2: how much `latest_turn` responds to what the player said or asked | U1 A1 | < 0.4, 1 of 1, nudge, cooldown 2; "a refusal is a response" | nothing | **new** |
| `cost` (Gentle) / fork `fortune` | Score 0–4: how badly things go for the player | U1 A1 (fork: all shown) | < 1.0 on 18 of 20, nudge "let something go against the player", cooldown 20 | prompt clause only (`engine/agency.ts`), drift-only escalation (`pacing/steering.ts`) | **new** (SUMMARY §8 "adversity read", 2/M) |
| `tension` | Score 0–4 tension/pressure | U1 A1 | used by Flat and as Drift's exception | extractor tension → EMA (`pacing/tension.ts`) | **variant** (judge as a second tension source; v2.4 idea 7, unbuilt) |
| `change` (Flat, off) | Score 0–4 how much the situation changes | U1 A1 | change < 2.5 AND tension < 1.5 on 3 of 4 → "put the player under pressure" | `stallCheck` (gate leaves only), `agencyRecovery` (refusals) | **new** (gate-independent "nothing happens" signal) |
| `scene` (4 Scene rules) | Choice: combat / conversation / travel / intimate / downtime, read from the **player's** message before the reply | U1 A0 | 1 of 1, nudge the **same** reply with a per-kind line | nothing (seam exists: `loreSelect` waits on MESSAGE_SENT) | **new** (v2.4 idea 9, unbuilt) |
| `picture_striking` + `picture_now` (Picture, off) | Score 0–4 "how striking is the strongest image" AND Noul "it is happening now, not remembered/reported/imagined/planned" | U1 A1 | > 3.6 AND > 0.5 → `/imagine scene`, cooldown 4 | image cues are checkpoint, scene break, cadence (`image/runtime.ts:63-102`) | **new** (an illustration-worthiness cue) |
| `repeats` (Echo) + fork miner | Score 0–4 reuse of phrases/patterns vs `history` | U0 A5 | > 3 on 4 of 6, nudge, cooldown 6 | nothing (deliberately absent in v2.4: prose nudge) | **variant** (fork's no-model miner first) |
| `tone` (Drift) | Score 0–4 how well tone/themes match the intent of `context` | U0 A1 + whole context | < 1.5 on 5 of 5, skip when tension > 2.5, nudge | nothing | **variant** (our context = story description + checkpoint goal, never the preset) |
| `world` (Lore, off) | Score 0–4 how much the reply builds on the world in `context` | U0 A1 + whole context | < 2 on 5 of 5, reroll | `wardenLore` checks contradiction, not under-use | **variant**, low value |
| `closeness` (measure only) | Score 0–5 how close char and player are at the end | U10 A10 | none (charted) | plan 18 L1 relationship axes (planned LLM read) | **variant** (a judge arm for plan 18's M1) |
| `/jeved-ask` | ad-hoc Noul/Choice/Score from a slash command, stores nothing | chosen U/A | — | `so-judge probe` (debug script only) | **variant** (author-facing ask) |
| Sensor "Test" / "Measure missing" | re-ask a draft sensor over the last 10 replies; rescan with a stated cost | stored chat | — | calibration runner on fixtures only | **pattern** (offline replay over real sessions) |

Rule mechanics we lack (all pure, no new call): N of the last M + cooldown + a `skipWhen` exception (hysteresis);
fractional thresholds on the raw Score plus an optional min-confidence; Noul with `criteria {false, true}`
descriptions; one call per identical state (the boundary bundle).

### New use cases, with fixture shape and consumer

Ranked by value for us. Each is a 20-case English fixture, labelled before any answer is read, with a predeclared
floor and a judge-off column (the rule of this plan). "Rides" = added to an existing call with the same state.

**N1. Responsiveness (`attention`). Most valuable.**
- *Why:* a reply that ignores the player's question or action is the commonest RP complaint after puppeting, and
  nothing of ours sees it. `agencyRecovery` only sees a refused route.
- *Shape:* Score 0–2 (Jeved's three levels; refusal and in-character evasion count as a response). Flag below a
  fractional threshold.
- *Consumer:* the warden note path, exactly as `agencyCheck` (one-turn line at `continuityNote`, review/auto). Rides
  the warden's reply call: same state (`player`, `player_message`, reply).
- *Fixture (20):* `{id, playerMessage, reply{speaker,text}, group, addressed, label: ignores|partial|responds}`;
  7 ignores, 5 partial, 8 responds; ≥ 4 group rows where the speaker was **not** addressed (must read `responds` or be
  excluded: an unaddressed member owes no answer), ≥ 3 refusals/evasions labelled `responds`.
- *Floor:* ignores recall ≥ 0.85, responds specificity ≥ 0.95 (agency's pair).

**N2. Illustration cue (`picture` conjunction). High practical value.**
- *Why:* automatic images fire on checkpoint, scene break and cadence. A cadence image often lands on a reply with
  nothing to see, or on a memory ("she remembered the burning tower").
- *Shape:* Score 0–4 "how striking is the strongest image in the reply" AND Noul "that image happens now, not
  remembered, reported, imagined or planned". One call.
- *Consumer:* `image/runtime.ts` cue as a third kind (`judge`), and as a filter on the `everyN` cadence (skip a
  cadence image when the reply has nothing to draw). Image settings, not story state.
- *Fixture (20):* `{id, reply, label: draw|skip, trap: memory|plan|dream|report|none}`; 8 draw, 12 skip of which
  ≥ 6 are vivid-but-not-now traps.
- *Floor:* draw precision ≥ 0.9 (a wasted render costs GPU minutes), skip recall ≥ 0.85.

**N3. Adversity trend (`cost`/`fortune`).**
- *Why:* a story at target tension where nothing ever costs the player is invisible to pacing (SUMMARY §8).
- *Shape:* Score 0–4 per reply; trend = N of the last M (Jeved: < 1.0 on 18 of 20).
- *Consumer:* `pacingCoordinator` steering hint and plan 24's living director: it may only **release an authored
  complication as world pressure**, never write "the player loses X" (v2.6 rule: no judge probability writes story
  state). Rides the warden call.
- *Fixture (20):* single replies `{id, playerName, reply, level 0–4}`, 4 per level. The trend rule is pure and tested
  in jest on synthetic sequences; the fixture scores only the per-reply level.
- *Floor:* level within ±1 on ≥ 0.9; levels 0–1 vs 3–4 never confused.

**N4. Pre-reply scene kind (`scene`).**
- *Why:* steers the **same** reply with no one-turn lag (the Jeved author's main claim).
- *Shape:* Choice over five kinds from the player's message only.
- *Consumer:* a one-turn shaping line through the `loreSelect` MESSAGE_SENT seam, inside the 1500 ms reply-path
  budget; secondarily image routing (combat → action shot) and the sampler overlay (short beats for combat). Author
  setting per story, default off.
- *Fixture (20):* `{id, playerMessage, label}`, 4 per kind, ≥ 5 mixed messages labelled by the dominant ask.
- *Floor:* ≥ 0.85 overall, no class below 0.75; p95 inside 1500 ms.

**N5. Nothing-happens signal (`change` ∧ `tension`).**
- *Why:* `stallCheck` asks about a gate's leaves; a checkpoint whose gate is far off can still idle for 10 turns.
- *Shape:* Score 0–4 change + Score 0–4 tension on the same call; rule change < 2.5 AND tension < 1.5 on 3 of 4.
- *Consumer:* the steering hint ("world pressure", agency policy) and the author driver panel. Rides the warden call.
- *Fixture (20):* `{id, reply, change 0–4, tension 0–4}`; the judge tension column is also scored against the
  extractor's tension on the same rows (judge-off column = extractor), which answers v2.4 idea 7 at the same time.
- *Floor:* change within ±1 on ≥ 0.9; tension within ±1 on ≥ 0.9 and no worse than the extractor.

**N6. Repetition (`repeats` + the fork's miner).**
- *Why:* Artemis loops were a live problem (`artemis-rp-config` memory). The miner costs nothing.
- *Shape:* deterministic miner first (pure module, jest-tested); the judge Score over the latest reply + 5 earlier only
  when the miner reports a hot phrase.
- *Consumer:* warden note naming the hot phrases, review mode, cooldown 6.
- *Fixture (20 windows of 6 replies):* `{id, replies[6], label: loops|fresh, hot: [phrases]}`, 10/10, mined from
  archived sessions where possible.
- *Floor:* loops recall ≥ 0.8, fresh specificity ≥ 0.95. The miner alone is the judge-off column.

**N7. Tone drift (`tone`).** Score 0–4 vs the story's own description, tone line and checkpoint goal (never the
preset or card). Trend 5 of 5, skipped when tension is high. Warden note. Fixture 20 `{id, intent, reply, level}`.
Floor ±1 on ≥ 0.9. Lower value: our checkpoints already re-state intent every turn.

**N8. Relationship read (`closeness`).** Not a separate use: add a judge arm to plan 18's M1 measurement (Score per
authored axis over the last 10 + 10 messages, direction of change). Plan 18's own fixture is the fixture.

**N9. Author ask.** `/so-judge ask` (author view only): one ad-hoc Noul/Choice/Score over the open chat, stores
nothing, metered. Not a use; a prototyping tool for every row above. No fixture.

Not taken: rerolls and STscript actions (judge never writes; v2.4 ideas 12–13), `world` under-use (N7 covers the
useful half), browser-held keys.

### The spike programme (the user's "prepare a test set and run them as spikes/POCs behind settings")

One programme for the Jeved rows above and the J7 ideas without an answer (J7.3, J7.4, J7.5, J7.6):

1. **Fixtures first:** one `test/fixtures/judge/spike-<id>.json` per idea, 20 English rows, labelled by Claude from
   session evidence before any answer is read, 5 rows spot-checked by the user (decision 5). Adolion text stays in the
   private evidence repo; public fixtures use authored rows.
2. **Offline replay, no ST:** `scripts/spike/typesafe/calibrate-node.mts` already runs a fixture through the
   production judge code and the real plugin handler. Extend its use list, add a `--replay <session dir>` mode that
   asks a draft question over every reply of an archived session (Jeved's "Measure missing" over real play) and
   writes the answer distribution: a sensor that answers the same for every reply carries no information (Jeved's
   tuning rule) and is dropped before any fixture work.
3. **Behind settings:** a spike that passes its floor ×2 ships behind `spikes.judge<Id>` (the v2.5 plan 09
   `spikes.<id>` root, dev only, default off), not a `judge.uses.*` key. Promotion to a `judge.uses.*` key (default
   off) is a separate decision with its readiness row.
4. **Cost check per spike:** questions added per turn and calls added per turn, from the meter; a spike that needs a
   new call (rather than riding one) states it.

Order: N1, N2 (both ride or replace existing work, clear consumers), then N5 (answers the tension question too), N3,
N4, N6; J7.3/J7.5/J7.6 fixtures in parallel; N7, J7.4 last.

### Proposals

- **P1.** Build spike fixtures for N1 (responsiveness) and N2 (illustration cue) first; both measured ×2 on TypeSafe
  within v2.7.
- **P2.** Add N1, N3, N5 as extra questions on the warden's existing reply call (no new call); re-run the continuity,
  agency and house-rules fixtures inside the combined request to show the existing rates do not move (the "bundle
  changes the state" risk from `jeved.md` F5).
- **P3.** Add pure hysteresis (N of M + cooldown + exception) to `pacing/steering.ts` for any trend signal; jest only.
- **P4.** Port the fork's repeat miner as a pure module (MIT; English only, W25), shown in author view first; the
  judge arm only if the miner alone misses the floor.
- **P5.** Add the `--replay` mode to `calibrate-node.mts` (shared with plan 15's provider matrix).
- **P6.** Record Rout as a candidate host in plan 15's host table (same wire, `typesafe/jev-latest`); no build.

### Decisions for the user

1. Which Jeved-derived spikes get a fixture in v2.7? **Rec: N1 responsiveness and N2 illustration cue now; N5
   (+ tension column) and N3 next; N4, N6 after; N7 last; N8 folds into plan 18.** All
2. May new questions ride the warden's reply call (P2), accepting a re-measure of the existing warden families inside
   the combined request? **Rec: yes.** yes
3. N2 touches automatic images: is a judge-picked illustration (draw this reply) wanted at all, or only the filter
   that skips cadence images with nothing to draw? **Rec: both behind one image setting, filter first.** as you recommend
4. N4 runs on the reply path (≤ 1500 ms wait). Acceptable as a per-story author opt-in? **Rec: yes, off by default.**sure
5. N6: build the no-model repeat miner even though the v2.4 review called prose nudges out of scope? **Rec: yes, as an
   author-view readout first; the nudge only after its fixture passes.** as you recommend
6. Spikes behind `spikes.judge<Id>` (dev, default off) until ×2 floors pass, then a `judge.uses.*` key (default off)
   as a separate decision? **Rec: yes.** yes

## Review of the answers (2026-10-03)

- **Unanswered 2–4: taken as recommended,** per the user ("for the unanswered I don't have the answer; prepare a test
  set and see if we get value from those spikes or POCs; if so, behind a setting"):
  - **J7.4:** stays a seed.
  - **J7.6:** after plan 20's replay.
  - **J7.2:** auto-drop below the threshold, with draft mode as an author option.
- **Every idea with no measurement gets the same treatment:**
  - a 20-case fixture;
  - an offline replay;
  - a dev-only, default-off setting until it passes its floor twice.
  - Then it becomes an install-wide `judge.uses.*` switch, off by default, until the user turns it on.
- That covers the J7 list and the ST-jeved ideas N1–N8.
