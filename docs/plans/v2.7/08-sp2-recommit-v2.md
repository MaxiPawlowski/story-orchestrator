# Plan 08 — SP2 re-commit after edit, v2

**Status: SEED from v2.6, not approved.** Source: `docs/plans/v2.6/v2.7-seeds.md` row "SP2 re-commit after edit, v2". Overview: `00-overview.md`.

## What it is

- When the newest reply is edited (by the player, or by a post-processor extension such as Recast that rewrites replies
  and emits `MESSAGE_EDITED`), today's runtime rolls back from that message. Then the next request is built from the
  pre-edit state until a re-read lands and another boundary commits. So the story runs one boundary behind the text.
- SP2 re-committed the edited reply right away: roll back, re-apply the writes the edit did not touch, read the edited
  text once, and commit again at the same message id.
- v2.6 measured it on the Adolion lab. It worked for a single player edit and failed for a burst of rewrites, because
  nothing made the next generation wait for the re-read.
- v2 = the same idea, with the next loud generation **held** until the re-commit lands, and one cycle per settled burst.

## History and evidence

**Original hypothesis and bars** (`v2.5/09-research-spikes.md` §SP2, lines 80–101): R1 lag is real; R2 re-commit ≡ replay
(4 seeds × 200 cuts); R3 no double commit; R4 live (next request carries the edited state, J6 ×2); R5 extra reads per edit ≤ 1.
The motivation was Recast, which emits `MESSAGE_EDITED` on every accepted rewrite (`v2.4/extension-research/SUMMARY.md:99,142`;
`recast-st-post-processing-for-better-prose.md:23-24`).

| When | Leg | Result | Citation |
|---|---|---|---|
| v2.5, toy, jest | R2 | 800/800 cuts equal. 240 needed step 2 (re-enqueue + re-commit). Both controls unequal (flag off: seed 1 cut 0; no step 2: seed 1 cut 9) | `v2.5/09-sp2-spike-report.md:72` |
| v2.5, toy, jest | R3 | (a)–(f) all as declared; a mutant without the newest-reply check fails (a) | `:73` |
| v2.5, lane 3, live | R1 | lag real ×2: the request after the edit carried the pre-edit marker only | `:71` |
| v2.5, live | R4/R5 | blocked: the step-3 read threw `a shared read needs a window or a chat reader` (product defect, not the spike) | `:74-75` |
| v2.6, Adolion lab | R1 (control) | lag confirmed 3 of 3 measured cases; 0 reads between edit and next send | `:130` |
| v2.6, Adolion lab | R4 editor leg | **3 of 3 pass**; the spike's read landed about 5 s after the edit | `:132` |
| v2.6, Adolion lab | R4 recast leg | **0 of 2 pass**. In one run the read landed 15 s **after** the next request. A diagnostic arm waited up to 180 s for the spike's `recommit:<id>` audit and **none appeared**. The cycle counted a read, but no audit was written. 2 recast legs not measured (fixture setup races) | `:132`; `v2.6/03-sp2-restated.md` addendum |
| v2.6, Adolion lab | R5 | extra reads per edit 2, 1, 2 → FAIL as declared. The second read is the scene-break read that the re-committed transition triggers; it would otherwise run at the next boundary | `:133` |
| v2.6 | J6 | not run (R4/R5 already failed) | `:132` |

The v2.6 setup was lane 2, adolion-fresh at `adolion-campaign@e1c91fb`, dev bundle `ceb15ac19ec0`. Replies ran on Artemis,
the `read` role on DeepSeek, judge off. The run was ×1 (×2 was owed to plan 10). Records: `test/measurements/v2.6-03/sp2/summary.json`.
The lab covers 4 real gating moments in 3 act stories, each with an editor leg and a recast leg (`03-sp2-restated.md` §What changed).

**Mechanism of the failure** (`v2.5/09-sp2-spike-report.md:135-138`): the re-commit is an **unawaited** model read. One
player edit settles once, the read lands in seconds, and the next request carries the edit. A recast-style burst
(`MESSAGE_EDITED` twice, back to back) queues two cycles. The first cycle's read lands late or writes no audit, and the
second is skipped as "already committed". Nothing holds the next generation.

**Verdict: drop**, code removed in `301b0d5a` (`v2.6/03-spike-reevaluation.md` gate record, partial 2026-10-01). The worth
review named this v2 seed (`v2.5/09-sp2-spike-report.md:148`).

**Fact found on the way that still holds today** (`:93-96`): editing the newest reply rolls back a transition that fired at
that reply's own boundary, even when every write that boundary applied was read before the reply. The next request is then
a checkpoint behind until the priority-0 re-read lands and another boundary commits.

## Why it was deferred

- It failed its predeclared R4 (recast leg 0/2) and R5 (2 reads per edit) bars. Bars are never retuned after a run
  (v2.5 plan 09 rule 1), so it could not be re-run as-is.
- The fix is a different design (an awaited hold), not a re-run (`00-overview.md` §Seeds, "Spike redesigns").
- C12 caps how often it matters on Adolion-like stories. 65 % of saga transitions post an onEnter reply, so the gating
  reply is not the newest message, and only 17 of 63 branch points keep it newest (`v2.6/04-remaining-builds.md:212-218`).

## Current state in code

- **Removed:** `recommitEdit.ts`, its review test, the `spikes.recommitEdit` flag, the census row, the v2.5 live fixtures
  (`301b0d5a`). Guarded by `DROPPED_SPIKES` + a planted-import control in `src/runtime/devOnly.guard.test.ts:30`.
- **Kept** (SP1 uses them): the bridge mutation seam `TurnBridge.setMutationSeam` (`src/runtime/turnBridge.ts:96`, asked at
  `:249`) and `RuntimeManager.writes.requeue` (`src/runtime/runtimeManager.ts:471-472`).
- **Today's edit path:** `MESSAGE_EDITED`/`MESSAGE_UPDATED` → `TurnBridge.onMutation` (`turnBridge.ts:81,83,228`). This
  asks `rollbackOnEnter` first (C12, `runtimeManager.ts:356`), then the seam (none in prod), then the ordinary rollback.
- **C12 is new since the spike ran.** An edit of the gating reply while its onEnter post is the chat's tail now rolls back
  the transition and `/cut`s the post (`04-remaining-builds.md:412`). A v2 re-commit would re-fire that transition, and with
  it the onEnter reply. The spike never met this path.
- **Holding precedent already in prod.** The generate interceptor already awaits work before ST builds the prompt:
  - `gatedInterceptor` runs `hold?.()` first (`src/runtime/loudGenerationGate.ts:36`). `holdForChat` waits for the chat's
    story load, up to `CHAT_SETTLE_TIMEOUT_MS` = 20 s, then goes ahead and leaves a recap note
    (`src/runtime/wiring/talk.ts:43-48`, `src/runtime/chatSettle.ts:1`).
  - The talk director and the lore intercept are awaited model work in the same interceptor (`wiring/talk.ts:52-59`).
- **Not documented:** the lag is not in `README.md` (grep for edit/lag/behind: no hit). v2.5 said a FAIL would leave the lag
  "stated in the README troubleshooting (plan 12)" (`09-research-spikes.md:101`). Not done.
- **Recast is not installed** on this ST (`public/scripts/extensions/third-party/` lists no Recast). Whether the user runs
  any post-processor that rewrites replies: not determined.

**Host facts** (ST `7c3994196`):

| # | Fact | Where |
|---|---|---|
| H1 | ST awaits each generate interceptor in manifest order, and only on a non-dry run | `public/script.js:4562-4573`; `public/scripts/extensions.js:2024-2049` |
| H2 | The Author's Note (`setFloatingPrompt`) and the World Info scan buffer are built **after** the interceptors, so a write that lands during a hold reaches this request | `script.js:4619,4624` (interceptors at `:4564`) |
| H3 | In-chat extension prompts are read later still, at prompt assembly | `script.js:5647` |
| H4 | `GENERATION_STARTED` fires before the interceptors. Anything we stage on that event has to be re-staged if the hold changes the state | `script.js:4299` |
| H5 | ST's editor emits `MESSAGE_EDITED` then `MESSAGE_UPDATED` for one edit | `script.js:8405,8431` |
| H6 | Recast awaits its whole pipeline inside `MESSAGE_RECEIVED`, then writes `mes` and emits `MESSAGE_EDITED` itself, once per accepted rewrite and again on restore paths | `recast-…md:11,23-24` (their `R/index.js:334-389,1538-1546`) |

Open: with Recast, the rewrite can land **before** our boundary for that reply commits (it runs inside `MESSAGE_RECEIVED`,
and our boundary waits for render and `GENERATION_ENDED`). Then the edit is not of a committed reply, and today's path may
already be correct. Not determined: needs a step-0 trace with a recast-style emitter in the real event order.

## Options

| | Design | Cost | Risk | Needs |
|---|---|---|---|---|
| **A. Awaited re-commit** | The spike's three steps (rollback, re-enqueue untouched writes + commit, one read of the edited text, commit), plus: (1) a settle window per message id, so a burst becomes one cycle on the last text; (2) a hold in the interceptor's `hold` slot (H1, H2) that waits for a pending cycle, loud generations only, with a timeout like `holdForChat`'s; on timeout, go ahead and journal it; (3) the cycle takes a `RunOwnership`; (4) re-stage what `GENERATION_STARTED` set (H4); (5) a defined C12 interaction (re-fire the transition only when the edited text still satisfies the gate) | M–L. About 150 lines plus the hold; one extra read on the `read` route per settled edit (about 5 s on DeepSeek, `09-sp2-spike-report.md:145`) | Touches `rollback ≡ replay` and the mutation path. A held reply is visible latency. A hung read blocks up to the timeout. The "no audit" case seen in v2.6 is unexplained | Step 0: find why the 180 s diagnostic saw no audit; the H6 ordering trace |
| **B. Deterministic half only** | Keep step 2 (re-enqueue the writes read before the reply, re-commit at the id). No model read, no hold | S. No model call | Fixes only the overshoot (a transition rolled back although nothing it used changed). An edit that newly satisfies a gate still lags | R2-style jest only |
| **C. Document and signal** | README troubleshooting: "an edit of the last reply is read at the next turn". The HUD pipeline chip says "catching up after your edit" while the priority-0 re-read runs (`#so-hud-pipeline`, `runtime/pipeline.ts`) | S | None to state | Copy review; player-safe wording |
| **D. Drop for good** | Nothing; the lag stays undocumented | 0 | Silent one-turn lag on edits | — |

## Recommendation

**C now. A parked with its floors written below.** Build A only if the user answers yes to decision 1.

- The case that worked (one player edit) already works unawaited when the player takes more than about 5 s before the
  next send (3 of 3, `09-sp2-spike-report.md:132`).
- The case that failed is post-processor bursts. No such extension is installed here.
- C12 caps the reachable cases to about 35 % of transitions on the campaign.
- A holds the reply and re-opens `rollback ≡ replay` for a case this install does not produce.
- B is attractive (no model call) but closes only half of the lag. The user would still see the edit ignored for a turn.
  So it is not worth a build on its own.

## Decisions for the user

1. Do you (or a player you target) edit the last reply to steer the story, or run a post-processor that rewrites replies
   (Recast or similar)? **Recommended: answer honestly. If no, take C and park A.** Yes, i do. This is actually an important feature for me.
2. Ship C (README line + "catching up after your edit" pipeline text)? **Recommended: yes.** yes
3. If A is built: is a held reply acceptable, and how long may it wait? **Recommended: loud generations only, 15 s cap,
   then go ahead and journal "the edit was not read in time".** Whatever u recommend
4. If A is built: R5 counted the scene read that the re-commit pulls forward as an extra read. Should v2 count reads **net
   of displaced reads**? This is a new condition, declared before any run, not a retune of v2.5's R5. **Recommended: yes,
   stated as R5′ with the reason.**yes
5. B alone (no model call, half the lag)? **Recommended: no, unless A is refused and C is judged too little.**

## Floor and measurement before building

Predeclared, for A only. Committed before any code (v2.5 plan 09 rule 1).

| # | Condition | Floor | Data |
|---|---|---|---|
| V0 | Step 0, no code | the 180 s "no audit" case explained from the v2.6 records; the H6 ordering traced with a recast-style emitter | `test/measurements/v2.6-03/sp2/`; a scripted emitter fixture |
| V1 | Re-commit ≡ replay | R2 unchanged: 800/800 over 4 seeds × 200 cuts, both negative controls unequal | v2.5 harness (`test/fixtures/spike-edits.story.json`), rebuilt |
| V2 | One cycle per settled burst | R3 (a)–(f), plus a burst of 2–5 rewrites within the settle window = 1 cycle on the last text | jest |
| V3 | Recast leg live (**measured first**, it is the one that failed) | the next request carries the settled text in **every** burst case, ×2 | `lab/swipes/` recast legs (4 cases; the 2 not measured in v2.6 included) |
| V4 | Editor leg live | 4 of 4 cases, ×2 | `lab/swipes/` editor legs |
| V5 | Cost | R5′: extra reads per settled edit net of displaced reads ≤ 1 (route recorded); hold p95 recorded | V3/V4 runs vs a flag-off control arm |
| V6 | Hold safety | a hung read releases at the cap; the reply goes out; journal row present | jest + one live fault run |
| V7 | C12 interaction | editing the gating reply with an onEnter post present ends in the same state as a replay of the edited chat | jest (`onEnterRollback.review.test.ts` style) |
| V8 | Rollback journey | J6 green ×2 with the flag on | J6 |

## Gates

- C: docs + runtime copy (pipeline text). `npm run gates` (includes typecheck, lint, test, build, test:release). The
  spoiler/copy check: `so-ui.mts assert-player-clean` on a live chat after an edit (live gate per `CLAUDE.md`, runtime/UI tier).
- A: runtime + ST-facing. `npm run gates`, then the live gate: real-LLM V3/V4 on an adolion-fresh lane ×2, J6 ×2, run header
  diff around the batch. New async writer → ownership census row (`test/findings/ownership-sites.json`). New mutation
  shape → fault-matrix row. Bundle budget (`architecture.test.ts`; main entry headroom about 8 KB, `v2.6/14-findings.md` row 1b).

## Links

- 22 SP9 witness filter v2: the other dropped spike that needs a new design.
- 16 spike defers: SP1 shares the bridge seam and `writes.requeue` with this plan; its fate decides whether the seam stays.
- 21 cue + scene read merge: R5's second read is the scene read; a merged read would change R5′.
- 09 C4 option (b): also about what a re-applied checkpoint re-stages.
- 04 story presence, 19 quests, 18 character life, 25 new game plus, 20 J6d shadow record, 14 J7 judge ideas, 13 B10 CLI
  judge, 12 curator create op, 11 warden-lore one request, 07 commitment double negatives, 23 D6/T22 revisits, 10 model
  choice, 06 thinking per story, 15 open-source Jev alternative: no direct dependency.
