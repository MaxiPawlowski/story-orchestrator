# Implementation Overview — Story Orchestrator v2.2: the judgment model

v2.1 is built (plans 01–08; human eval outstanding). v2.2 adds a second kind of model to the
runtime: a **judgment model**, next to the generative memory LLM. It is TypeSafe's Jev, a System
One model: typed choice / score / yes-no answers with calibrated probabilities, about 250 ms per
call, flat in question count.

The driving input is the 2026-09-19 spike, `../../spikes/2026-09-19-typesafe-jev/README.md`. Read
it first; its numbers are the reason each plan below exists.

The framing (user, 2026-09-19): Jev is a **complement** to the LLM, not a replacement.

- The LLM keeps everything that produces text.
- Jev takes everything that is a *decision over text*: who speaks, did the scene break, is this
  line supported, are these two notes the same, which lore matters now, which of N drafts is best.
- Code keeps the policy (thresholds, weights, fallbacks) and owns the workflow, per the TypeSafe
  agent skill.

## What the spike established (and what it did not)

| Measured, ready to build on | Result |
|---|---|
| Speaker direction | Jev hybrid 24/26 vs Artemis 22/26; ignored an OOC "pick Luke" hijack; p50 255 ms vs 458 ms. **Needs a one-line role per candidate**: names only scored 19/26 (plan 01) |
| Memory consolidation (pair relation) | Jev 19/20 vs today's non-LLM path 6/20. That path leaves 5 more "uncertain": both notes kept, the older flagged `contradicted` (a ranking penalty, no model call). Jev was asked about **all** 20 pairs; production only asks about the pairs its candidate generator surfaces. With the Jaccard fallback, 4 of the 20 never become candidates, so plan 02 measures generator recall first |
| Memory-line verification | AUROC 1.00; 16/16 fabricated lines dropped while keeping 90% of good ones; caught 2 real Artemis fabrications at p = 0.04 |
| Scene break | Jev 22/22. The regex trigger is right on 11/22 and catches 6 of the 12 real breaks. The LLM read already confirms breaks (22/22), so the gain is **latency and wasted reads**, not accuracy |
| Continuity check (reply vs facts) | 18/18 replies, against 26 established facts; 1 false alarm among the 17 consistent ones |
| World Info relevance (entry on/off for the scene) | 88%, AUROC 1.00 |
| Background pick from the installed set | 11/12, both "nothing fits" cases right |
| Gate-leaf yes/no (stall re-check shape) | AUROC 0.99; p ≥ 0.9 right 36/36 |
| Typed deltas (the shared read) | Parity with a 31B model (47/48 hard set). **Worse** on tuned fixtures (28/30) and on exact tension level (26/36, one level high on calm scenes) |
| Arc resolution | 21/22 vs Artemis 22/22: stays on the LLM |
| Expansion critic checks | verdict 10/10; the per-check misses trace to labels |
| Cost / latency | $0.08 per 1000 boundaries; p50 270 ms; 64 questions or 96 messages change nothing |

| Not measured: spike before build (rule 2) | Plan |
|---|---|
| Presence, location, time of day, OOC, look-ahead | 03 Phase A |
| "Has the story overtaken this lore entry" (curator pre-filter) | 04 Phase A |
| Memory injection re-rank (recall@budget) | 04 Phase A |
| Stall leaves phrased from rubric + value | 06 Phase A |
| Ranking N generated beat chains | 07 Phase A |
| Names-only director hybrid | 01 (before build) |

## Use-case review

This covers the user's 2026-09-19 candidates, plus everything in the runtime that is a decision
over text.
- **build** = in a v2.2 plan.
- **spike** = a Phase A measurement in its plan first.
- **no** = stays generative or deterministic, with the reason.

| Candidate | Verdict | Plan | Notes |
|---|---|---|---|
| Who speaks next (director) | build | 01 | Hybrid: role choice at ≥ 0.6 confidence → per-candidate composite → today's chain. Adds authored `roster[].role`. The mention rule stops short-circuiting when the judge is on |
| Memory line verify-before-store | build | 02 | Drop at p < 0.2; `confidence = p` for 0.2–0.5 (`memory/score.ts` already weights confidence) |
| Consolidation pair relation | build | 02 | Vectors/Jaccard keep producing *candidate pairs*; Jev decides `duplicate / update / distinct / unrelated`. Replaces the `hasStateChangeMarker` regex and the "uncertain → contradicted" flag. The supersession bridge (update → quality deltas) stays. Candidate-generator recall is measured first |
| Scene break | build (trigger) | 03 | The judge replaces the regex trigger for the P0 read; the LLM read still confirms |
| **"Current scenario data"** (user) | spike → build | 03 | A code-owned **scene read** every boundary, with no authoring: location, time of day, who is present, OOC, look-ahead. It feeds an injected **scene tracker** block + macros, the player "now" line, the OOC annotation of the extraction window, and the look-ahead |
| **"Plan checkpoints a couple of steps ahead"** (user) | spike → build | 03 + 07 | Look-ahead nouls over checkpoints 1–2 hops ahead (plan 03) drive expansion **pre-generation** of the stub play is drifting toward (plan 07) |
| **"High amount of lore items"** (user) | build | 04 | **Lore-select**: one noul per candidate entry per generation, with the top-k force-activated through `WORLDINFO_FORCE_ACTIVATE` at the last awaited event before each scan whose chat already holds the triggering message. Never writes a lorebook. The curator pre-filter and memory re-rank come after their spikes |
| Continuity warden | build | 05 | Designed in `../v2.1/stagecraft-design.md` §5. Jev is the check; the note is a code-composed one-turn injection |
| Scene-setter background | build | 05 | Choice over installed backgrounds + none; an authored `effects.background` always wins |
| Typed deltas via Jev (the shared-read split) | build, **opt-in per quality** | 06 | Only qualities with an authored `read_as` (`choice` / `stated` / `rating`). The win is firing gates on the turn they become true, not accuracy |
| Gate-leaf stall re-check | build | 06 | A judge pre-check before the LLM reconcile read: direct delta at p ≥ 0.9 on simple leaves. Below 0.1 on every leaf, the LLM re-read is skipped and the stall stays visible |
| Expansion critic | build | 07 | JSON verdict → three nouls; the code checks stay first and binding |
| **"Many variations, then pick"** (user) | spike → build | 07 | N beat chains at a higher temperature → code checks → judge scores → the pick is a setting: **code** picks the top score, or the **LLM** picks from the judge's top 2 |
| Arc resolution | no | — | The LLM is 22/22 vs the judge's 21/22, and the shared read already emits `[resolved]`. A second writer would buy nothing |
| Tension | no | — | The judge runs one level high on calm scenes, and pacing steering is sensitive to a one-level bias |
| Cast / npc tuning curator | no (v2.2) | — | Design doc §3; needs the talk decision ring to hold data first |
| Recap narrator | no | — | Generative. The design doc builds it only after a human eval says the composed view reads like a machine |
| Wizard proposal scoring | no | — | Proposals are already reviewed one card at a time by the author |
| Epistemic map via Jev | no (seed) | — | Unmeasured; the LLM pass stays |
| Canon / scene-summary verify | no (seed) | — | Longer texts, unmeasured |

## Verified ST host facts for the new seams

Append these to `../v2/00-implementation-overview.md` §Verified ST host facts when a plan lands
them. Checked in ST source on 2026-09-19.

| Need | Fact | Source |
|---|---|---|
| Server-side proxy | Plugins live at `<ST root>/plugins/<dir>/`. The loader tries `package.json` `main`, then `index.js/.cjs/.mjs`; it needs `info {id, name, description}` + `init(router)`, and `exit()` is optional. Routes mount at `/api/plugins/<id>`. The id must match `/^[a-z0-9_-]+$/`. `enableServerPlugins` is off in this install | `src/plugin-loader.js:150–228`, `:167`; `src/server-main.js:312`; `config.yaml:22` |
| Plugin module format | `plugins/package.json` is `"type": "commonjs"`, so the plugin ships its own `package.json` (`"type": "module"`, `main: "index.mjs"`) | `plugins/package.json` |
| Plugin request context | Plugin routes mount after `setUserDataMiddleware`, CSRF and `requireLoginMiddleware`: `request.user.directories` exists, and clients send `getRequestHeaders()` | `src/server-main.js:164`, `:202`, `:248`, `:313` |
| Key storage | The secrets store accepts any key. The plugin reads it with `readSecret(directories, key)`; the client writes it with `writeSecret(key, value)` and can never read a non-exportable key back | `src/endpoints/secrets.js:204`, `:268`, `:511`, `:568`; `public/scripts/secrets.js:349` |
| Force a lore entry into the next prompt | Emit `WORLDINFO_FORCE_ACTIVATE` with entries carrying `world` + `uid`. The scan adds **the external object itself**, so it must have `getSortedEntries()`'s shape. The map is static, and it is reset only at the end of a scan, so a force waits for whichever scan comes next | `world-info.js:203`, `:1020`, `:4886`, `:4627`, `:5275` |
| Checkpoint gating stays safe | Disabled entries are skipped before the external-activation check, and only entries from active sources are iterated | `world-info.js:4801`, `:4535` |
| Handler order in a generation | `GENERATION_STARTED` is awaited, and ST's emitter awaits each listener. But the player's new message joins `chat` **after** it: `sendMessageAsUser` runs later in `Generate()` and awaits `MESSAGE_SENT`. Generation interceptors (talk control) run before the WI scan | `script.js:4299`, `:4453`, `:5874+`, `:4564`, `:4635`; `public/lib/eventemitter.js:146` |
| Group passes | A group send's top-level `Generate` fires `GENERATION_STARTED`, then hands off to `generateGroupWrapper`, which runs one `Generate('normal')` per member. The **first member's** `Generate` adds the user message, after its own `GENERATION_STARTED`. The wrapper adds it itself only when no member is active. `is_group_generating` is a module `let` and not exported | `script.js:4350–4353`, `:4448`; `group-chats.js:110`, `:1037–1040`, `:1063` |

## Rules for every v2.2 build agent (additive to v2 and v2.1)

1. **The judge never blocks and never writes.**
   - Every consumer keeps its current path as the fallback. It takes that path on timeout, error,
     `judge.enabled=false`, or a missing key or plugin.
   - The judge is a read model: it returns probabilities, and code in `src/judge/policy.ts` turns
     them into actions.
   - Every call is recorded in its **own** per-chat ring, `extras.judge.calls`. Each compact record
     is `{at, boundary, messageId, use, model, latencyMs, stateChars, questionCount, fallback?,
     p}`, where `p` holds the probabilities the policy used. The session journal derives `judge`
     events from that ring at read time, the same way it derives every other ring.
   - The ring is never `extras.journal`. That one is capped at 200 and holds player ⚑ flags, and a
     row per judge call would flush them within a few dozen boundaries.
   - A threshold can be re-tuned from the ring without re-running.
2. **Spike before build.** A question shape not in the spike's results lands first as a Phase A
   experiment in `scripts/spike/typesafe/experiments/`. It needs ≥ 20 hand-labelled cases, labels
   written before any answer is read, a Spanish slice, and a stated floor. The plan's Gate record
   cites the number. A family below its floor is not built, and the record says so.
3. **Calibration is a gate.** `so-judge calibrate` runs the promoted fixtures
   (`test/fixtures/judge/`) through the real plugin, and each use must hold its recorded floor
   (`--min`), like `so-live-suite`. A model-version change re-runs calibration before anything
   else.
4. **Every judge usage is an explicit opt-in, and stays one** (user decision, 2026-09-19).
   - `judge.enabled` is the master switch.
   - Each distinct usage has its own flag, all `false` by default, and **no plan ever flips a
     default**. Plan 08 publishes a recommended configuration; turning a usage on is always the
     user's act.
   - The flag list is fixed here, and each plan implements its rows:

| Flag | Usage | Plan |
|---|---|---|
| `judge.uses.director` | Speaker direction (hybrid) | 01 |
| `judge.uses.memoryVerify` | Verify memory/fact lines before storing | 02 |
| `judge.uses.memoryPairs` | Consolidation pair relation | 02 |
| `judge.uses.sceneTrigger` | Scene-break trigger for the P0 read | 03 |
| `judge.uses.sceneTracker` | Scene tracker block, macros, player "at <location>" | 03 |
| `judge.uses.sceneOoc` | OOC annotation of the extraction window — **not built**: Phase A measured 88% with 3/12 false positives, below its floor (plan 03) | 03 |
| `judge.uses.lookahead` | "Heading toward" read model (author view) | 03 |
| `judge.uses.loreSelect` | Force-activate relevant lore per generation | 04 |
| `judge.uses.curatorFilter` | Narrow the WI curator's prompt (only if Phase A passes) | 04 |
| `judge.uses.memoryRerank` | Relevance re-rank of memory injection — **not built**: Phase A gained 9 points of recall@budget, under the 10-point bar (plan 04) | 04 |
| `stagecraft.wardenEnabled` | Continuity warden (with its own accept mode) | 05 |
| `stagecraft.sceneSetterEnabled` | Scene-setter background (with its own accept mode) | 05 |
| `judge.uses.typedExtraction` | Judged typed read for `read_as` qualities | 06 |
| `judge.uses.stallCheck` | Judge pre-check before a stall re-read | 06 |
| `judge.uses.expansionCritic` | Judge verdict instead of the LLM critic | 07 |
| `judge.uses.expansionLookahead` | Pre-generate the stub play is heading toward (needs `lookahead`) | 07 |
| `judge.expansion.variants` / `.pick` | N chains (1 = off) and who picks: `code` or `llm` | 07 |

   - Curator flags stay in the stagecraft group next to the WI curator's, which is the existing
     home for a flag plus an accept mode.
   - A usage that depends on another (`expansionLookahead` → `lookahead`) is disabled in the panel
     until its dependency is on, and the runtime checks both.
   - A judge call only asks the questions of enabled usages. The scene read, for example, sends no
     presence questions unless `sceneTracker` is on.
5. **What leaves the machine is written down.**
   - Every plan has a "Leaves the machine" table.
   - The settings panel states it in one sentence.
   - It never includes character cards, persona descriptions, other chats, or the API key.
   - J11 asserts that with `judge.enabled=false` no request reaches `/api/plugins/`.
6. **Engine purity holds.** `src/judge/` is pure (question builders, parsers, policy), the
   transport is `stHost/judge.ts`, and consumers are coordinators or runtime helpers with injected
   deps. `architecture.test.ts` gains two guards: no `@judge` import under `src/engine/`, and no
   host import under `src/judge/`.
7. **The version is pinned and journaled.** Settings default to the model id the calibration ran
   on (`jev-1.13.0`), never `jev-latest`. Every judge journal row carries the model id that
   answered.

The v2.1 rules still bind: no net `runtimeManager.ts` growth, persona tags, docs truth,
migration-with-gate, the living test plan, and journeys run twice.

Line budgets and seams are measured against the tree **at plan start**, not against these docs.
On 2026-09-19 other sessions had uncommitted work in `talk/`, `stagecraft/`,
`memoryCoordinator.ts` (602 lines), `runtimeManager.ts` (647) and the `GENERATION_STARTED`
handler. Each plan re-reads those before building.

## Plan sequence and exported contracts

Sequential, one build agent per plan; a plan's gate goes green before the next starts. Same
plan-doc template and Gate-record protocol as v2.1.

| Plan | Delivers | Exports (consumed later) |
|---|---|---|
| [01-judgment-backend](01-judgment-backend.md) | Server plugin proxy, `stHost/judge.ts`, `src/judge/` core, settings + self-test, `so-judge`, the `extras.judge` call ring, authored `roster[].role`, **director hybrid**, J11 | `askJudge`, question helpers, `policy.ts`, fallback discipline, calibration layout |
| [02-memory-hygiene](02-memory-hygiene.md) | Verify rung before storage; judged pair relation in consolidation; author "Not stored" list | `consolidateTierJudged`, `runtime/consolidationMatches.ts`, `verifyDrops` |
| [03-scene-read](03-scene-read.md) | Phase A spike; `SceneCoordinator` + `extras.scene`; scene-break trigger; scene tracker block + macros; OOC annotation; look-ahead read; format-2 `scene_read` | `SceneRead`, the `sceneTracker` injection key, `headingTo` |
| [04-lore-relevance](04-lore-relevance.md) | Lore-select (force-activation, authored `lore_select`); curator pre-filter and memory re-rank after their spikes | `stHost/worldInfoActivate.ts`, `runtime/loreSelect.ts` |
| [05-judge-curators](05-judge-curators.md) | Continuity warden (one-turn note) + scene-setter (background) on the plan-07 contract; `stagecraft-design.md` amendments (one-turn injections, judge passes off the LLM lanes) | `note` / `background` curator ops, the `continuityNote` key |
| [06-typed-extraction](06-typed-extraction.md) | Format-2 `read_as` + `criteria` with a Studio preview; judged typed read every boundary with residual LLM fallback; stall pre-check; `so-live-suite --judge` | `read_as` qualities, `judge:typed` audits |
| [07-expansion-judge](07-expansion-judge.md) | Judge critic; N-variant generation + judge scoring + code pick (after spike); look-ahead pre-generation | `chainScore`, the variant temperature option |
| [08-acceptance](08-acceptance.md) | Full matrix with the judge off and on, calibration, cost/latency report, human eval, recommended configuration (no default flips), docs refresh | — |

Why this order:
- 01 is the foundation, and the director is the one place the spike showed a *quality* win on the
  reply path.
- 02 is the largest measured gain with zero authoring.
- 03 turns the scene into data that 05 and 07 consume.
- 04 and 05 are new capabilities on proven questions.
- 06 is the widest change (format 2, Studio, extraction) and waits until the judge has earned
  trust.
- 07 waits on a spike and on 03's look-ahead.

## Cost and privacy envelope

Spike measurements: shared read + direction came to $0.08 per 1000 boundaries. Estimates for the
additions:
- scene read every boundary: about +$0.05;
- lore-select at ~100 entries × 8 messages per generation: about +$0.25 per 1000 turns.

A heavy month of play stays under a dollar. Plan 08 replaces these estimates with journal numbers.

Latency budget on the reply path: director ≤ 1.5 s (then today's chain), lore-select ≤ 1.5 s (then
the keyword scan only). Everything else is off-path and fire-and-forget or scheduled.

When enabled, these leave the machine (per plan tables):
- the last 8 chat messages with speaker names;
- the player persona **name**;
- roster names and authored roles;
- checkpoint names and objectives, including 1–2 hops ahead for the look-ahead;
- quality rubrics, values and criteria;
- memory and fact lines;
- lorebook entry text from the story's scoped books;
- installed background file names.

Never: character cards, persona text, other chats, the API key (server-side only).

## Traceability

| Input | Plan |
|---|---|
| Spike §Recommended shape 1 (director) | 01 |
| Spike §Recommended shape 2–3 (consolidation, verify) | 02 |
| User "current scenario data" | 03 |
| User "high amount of lore items" | 04 |
| Spike §Recommended shape 4 (warden, background) | 05 |
| Spike §Recommended shape 5 (shared-read split) | 06 |
| User "plan checkpoints ahead" | 03 (read) + 07 (pre-generation) |
| User "many variations, then pick" | 07 |
| Spike §Unresolved: localhost CORS, key home | 01 (plugin + secrets store, verified) |
| Spike §Unresolved: floors, hint authored vs inferred | 06 (`read_as`, authored) |
| v2.1 seed list: remaining curators | 05 (two of four); cast tuning and recap narrator stay seeds |

## Live gate status (2026-09-20, paused on hardware)

The judgment model itself is fully exercised: **all 11 calibrations pass in-page** (page → plugin →
live API, goldens in `test/goldens/judge/`), continuity 85/85 and stall 87/87 among them.

**J11: 24 of 26 verified live.** Green includes the whole scene slice, lore-select, typed extraction,
the stall check, curator focus (J11.26) and prepare-ahead with variants (J11.25). Two are unverified
because the pod died mid-session: J11.15 (fixed — it now seeds a location before changing it) and
J11.21 (assertion rewritten around the residual-scope invariant). Both need a re-run, not a fix in
anger.

**J8: not yet run.** The warden's whole path *except* the story model was proven live anyway (see the
plan 05 smoke). J8.5/J8.6/J8.9 were made self-contained offline.

**Three product bugs the live gates found**, all fixed: the scene read surviving a deleted message
(the engine declines that rollback), off-path uses inheriting the 1500 ms reply-path budget
(stall failed by luck), and a fallback stall recording every leaf as answered.

**Backend note.** The RunPod pod exited by itself after ~1 h and its host has had no free GPU since,
so live work is paused. A replacement pod on the same network volume in EU-RO-1 is the fallback, at
the same price, and needs the user's go-ahead.

## Latency budgets (revised on live evidence, 2026-09-19)

The reply path keeps the tight default (1500 ms: director, lore-select) — a fallback there is the
point. **Every off-path use now has its own budget**, because a timeout there costs a feature and
buys no responsiveness: typed 5000, stall 4000, warden 4000, curator focus 4000, scene 2500,
critic 2500, memory pairs 3000, memory verify 3000. Live runs produced real timeouts at 1500–2500
(J11.20 typed, J11.23 stall) against calibration p50s of 1684 and 1263 ms.

## Resolved decisions (user, 2026-09-19)

- **`enableServerPlugins: true`: approved.** It is ST-wide and needs an ST restart. Plan 01 flips
  it when it installs the plugin, and it coordinates the restart with the other sessions sharing
  the ST install. It is not flipped before then; the `plugins/` folder is empty until plan 01.
- **Every judge usage is opt-in config** (rule 4). That covers the "many variations" question too.
  Plan 07 ships both pick modes, `code` (the judge scores and code picks) and `llm` (the judge
  shortlists and the LLM makes the final pick), as a setting. Neither runs unless variants are
  turned on.
- **Look-ahead privacy: accepted.** Future checkpoint objectives may go to TypeSafe. The player
  never sees them, and the look-ahead has its own opt-in flag.

## Unresolved questions

- **Would TypeSafe allow-list `localhost` origins?** Even if it would, the skill says keys stay
  server-side, so the plugin ships regardless. Ask; don't wait.
- **Spanish coverage**: 7 of the spike's cases were Spanish. Every Phase A and every calibration set
  carries a Spanish slice before plan 08 recommends a usage.
