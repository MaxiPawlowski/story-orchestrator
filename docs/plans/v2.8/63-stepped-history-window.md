# Plan 63 — Stepped history window and the front-trim cache A/B

**Status: measurement tooling built 2026-10-17 (§Tooling, §GPU queue); H1/H6r owed on the 3090, H6 owed on CL; B the owner's call. Revised 2026-10-16 after Astra's review (§Review 2026-10-16).** Written
2026-10-14 from the extension harvest (`61-harvest-triage-2026-10-14.md` H3, V10, V12). Not built, not queued. A performance
experiment: **measure first** (latency, not only reuse), then a window only if the measured gain justifies the recall risk.
Implementation tier **D**; acceptance **RP** (llama-server timings with Artemis, the 3090 or a pod; rides the deferred R2 run,
which is not funded by plan 24's 12 h cap) + **CL** (recall probes on the cloud reply model) + a small RP recall leg.
Overview: `00-overview.md` §Rules. Measurement home: queue R2/R7 (`32-queue.md` §Measurements), v2.7 31 §Pod 2.

## What it is

- Once a chat's prompt passes ST's context, ST trims the oldest message every turn. The history shifts by one message per
  turn, so the cached prefix ends right after the system/card/story string and prompt-cache reuse falls to about zero for
  long play at 32K.
- A **stepped window** cuts in steps instead: the cut point advances by a fixed token mass when the prompt passes a
  high-water mark, so between steps the prompt only grows at the end and the prefix stays cacheable.
- The cut works on the generate interceptor's copies (`Symbol.for("ignore")`, the chapter-fold mechanism), never on the live
  chat, and only below text that **durable memory covers**: a sealed chapter record or the short-term summary's range, not the
  read cursor.
- **Measurement first**: the front-trim arm says how much latency (not just reuse) long play loses today.

## History and evidence

- `docs/plans/v2.8/extension-research-2026-10-14/tokensavingplugin.md` P1 (stepped window, value 4, M), P2 (recap before the
  oldest kept message, value 2), P3 (retention ladder, value 2), P5 (front-trim cache A/B, value 3). Their gain comes from the
  hysteresis, not their summary.
- v2.7 31 §Pod 2 measurements: B1-PFX ran with the saga cut to 80 messages so the prompt fitted without front trimming
  (`docs/plans/v2.8/31-v27-wrap-backlog.md`); B1-HIST INCOMPLETE (3 of 30 turns per arm).
- Queue R2 (B1-PFX re-measure owed), R7 (sheets after definitions vs depth 4, cache measurement deferred).
- v2.4 harvest V12 (context-horizon scoring): folded here as H9.

## Current state in code

Verified on master `e8b9dd6d`.

- **Folding exists only at chapter seals.** `fold` / `foldRange` / `foldRows` mark covered rows ignored on the interceptor's
  copies (`src/runtime/chapterKit.ts`, `IGNORE = Symbol.for("ignore")` at `:254`). Nothing else stops ST's per-turn front trim
  (grep `front.trim|frontTrim` = 0).
- **Read coverage is not durable coverage.** `readCoverageEnd` returns the greatest audit endpoint
  (`src/extraction/readCursor.ts:13-15`), not a contiguous covered prefix; `compactableEnd` returns the latest message when the
  read lags by `maxLag` (`:17-19`). Neither proves discarded text is recoverable. The short-term summary's range is
  contiguous by construction (`shortTermSummaryEnd`, compaction windows start at `shortTermSummaryEnd + 1`,
  `src/runtime/coordinators/extractionCoordinator.ts:419`); a chapter seal advances it (`src/memory/chapterFold.ts:50`).
- **The reply model's budget is `readPromptBudget`** (`src/services/stHost/contextBudget.ts:35-38`: context, response reserve,
  prompt) from ST's own `getMaxPromptTokens`. `requestBudget(profileId)` is for routed side-model calls
  (`src/runtime/requestBudget.ts`), not necessarily the active reply model. `src/runtime/promptCost.ts` estimates the assembled
  prompt for the preview.
- **Dry runs skip interceptors** (ST `script.js:4562-4564`), so payload goldens (dry runs) cannot show what an interceptor cut;
  only an actual request capture can.
- **Late lore placement** (`src/runtime/lorePlacement.ts`) moves per-turn story lore to depth 4; unmeasured on a chat long
  enough to front-trim. `storySoFar` sits at depth 4 (`src/constants/injectionRegistry.ts`).

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Measure only** | latency arms on the R2 run; no product change | S + pod or free 3090 time | the problem stays; we know its size |
| **B. A + stepped window** | stateless step cut over durable coverage | M | a cut drops text whose summary is thin; a discontinuity every step |
| **C. B + boundary recap** | a recap of the rows below the cut just before the oldest kept message | M + a memory call per step | a second summary family |
| **D. Nothing** | | 0 | long local play keeps ~0 reuse |

## Recommendation

**A first. B only if A shows a latency gain worth the recall risk (owner decision on the record). C deferred: reuse chapter
records and the existing short-term summary; add a new summary family only if its incremental value is shown.**

- **The A arms** (R2 `place-all.sh` A/B). Matched workloads, same chat and turn script per arm:
  - `front-trim`: the full saga (no `/del` cut) at `LLM_CTX` 24576 so ST trims, late lore on;
  - `fits`: the same turns with the saga cut so nothing trims (the R2 baseline);
  - each arm in two speaker patterns (same speaker repeated; alternating members) and warm and cold (first turn after a
    server restart vs steady state), with enough turns to span at least three of B's would-be steps.
  - Record per turn from llama-server timings: sent tokens (`prompt_n + cache_n`), reuse `cache_n / (cache_n + prompt_n)`,
    prefill ms and time to first token. Report medians **and** the per-step cost (the turn where a cut would land).
- **The window (B).**
  - **Stateless cut.** New pure module `runtime/historyWindow.ts`: `cutFor({ rows, tokens, budget, coveredTo, step })`.
    Token mass from chat start is quantised into steps of `S = (high − low) × budget` (high 0.90, low 0.65). The cut is the
    first row past `k × S`, with the smallest `k` such that the rows after the cut fit under `high × budget`, clamped to
    `coveredTo`. A pure function of the rows, so reopen, branch and replay recompute it with nothing stored; an edit anywhere
    in the covered prefix shifts token mass and may move the cut (a cache miss, accepted and measured), a settings, model or
    member change changes `budget` and recomputes.
  - **Durable coverage.** `coveredTo = max(shortTermSummaryEnd, last sealed chapter end)`, never `readCoverageEnd` or
    `compactableEnd`. Below `coveredTo` the text is held by a summary or a chapter record.
  - **Budget.** `readPromptBudget()` prompt tokens (response reserve already subtracted), minus the estimated non-history
    overhead of the assembled prompt (`promptCost.ts`).
  - Applied in the generate interceptor on copies only, after the chapter fold, through the same `IGNORE` marker. No
    live-chat write, no `is_system` toggle, no `/hide`. Loud generations in the story's chat only; quiet/impersonate
    untouched. Per-member views unchanged.
  - A cut inside a same-speaker run snaps forward to the next player message.
  - Author view: the next-turn preview names the cut ("History from message N; earlier messages are covered by the story's
    summary").
  - Registry feature `stepped-history`, on by default once built (rule 9), install-wide switch in Defaults.
- **The recap (C)**, deferred: only if B's recall probe shows a loss that chapter records and the short-term summary do not
  cover. Then a resting-view recap (`MemoryInjector.restingEntries`) of the rows below the cut, placed before the oldest kept
  message, with P3's retention ladder in its prompt.

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| H1 | Front-trim cost: per-turn sent tokens, reuse, prefill ms and first-token ms for `front-trim` vs `fits`, both speaker patterns, warm and cold | recorded (medians + per-step cost) | RP |
| H2 | With the window: same arms and shape; first-token ms median vs `front-trim` | recorded; the build decision is the owner's on H1/H2 | RP |
| H3 | The cut never passes durable coverage (`max(shortTermSummaryEnd, sealed chapter end)`): property over ≥ 500 generated chats | 0 violations | D |
| H4 | Copies only: the live `chat` array and every message object byte-identical before and after the interceptor on 4 seeds | 4/4 | D |
| H5 | Stateless: the cut recomputed from scratch equals the running cut after reopen, branch, an edit inside the covered prefix, a budget change and a member change (6 scripted cases × 4 seeds) | 24/24 | D |
| H6 | Recall, cloud reply model: 20 probes about events below the cut (10 critical-fact, 10 detail strata), second-model rater, window on vs off | on: ≥ 16/20 overall and ≥ 9/10 critical; and on ≥ off − 1 per stratum | CL |
| H6r | Recall on Artemis: 10 probes (critical stratum) window on vs off, 32,768 context | recorded (informational, deferred with R2) | RP |
| H7 | Privacy: the actual outgoing request (not a dry run) of a held-secret fixture carries no secret line with the window on; secrecy instructions above the cut are not dropped (guidance and private blocks are injections, not history rows) | 0 leaks, 4/4 | D |
| H8 | No window, no change: a chat under the high-water mark sends a byte-identical actual request | identical | D |
| H9 | Horizon (V12): the oldest message ST actually sent equals the computed cut (or an earlier host trim, recorded) on 20 captured requests | recorded; any mismatch named | D (no-model lane request capture) |

Floors are informational and never retuned (rule 2). H6's numbers are set before the run.

## Gates by tier

- **D:** `npm run gates`; H3–H5, H7, H8 (request capture on a no-model lane, `st-payload.mts arm --persist`), H9; Storybook for
  the preview line.
- **RP:** H1, H2, H6r with Artemis, folded into the deferred R2/R7 run (pod P2 or a free 3090 night). That run is deferred
  work, not funded time: it is outside the 12 h cap only because it has not been scheduled.
- **CL:** H6 on the cloud reply model.

## Privacy and spoiler notes

- Ignoring rows adds no bytes, but altered history can drop context that matters and change downstream scans; H7 checks the
  actual request. The recap (C) would be a shared tier and must use `MemoryInjector.restingEntries`.
- No campaign content; the saga chat used by R2 is the owner's evidence chat on a lane copy.

## Dependencies and links

- Queue R2/R7 (shares the run), v2.8 21 (retrieval side), plan 40 (lore placement built), chapter folding
  (`src/runtime/chapterKit.ts`) stays the first cut.

## Decisions for the owner

1. **Add the latency arms (H1) to the owed R2 run?** **Recommended: yes.**
2. **Decide the window on H1/H2 latency and H6 recall, not on a fixed reuse threshold?** **Recommended: yes.**
3. **Coverage = summary or chapter only (never the read cursor)?** **Recommended: yes.**
4. **High/low 0.90/0.65 of the prompt budget as starting values, recorded with the run?** **Recommended: yes.**

## Unresolved questions

- Does the reply thinking budget change the response reserve `readPromptBudget` reports? Check the llama.cpp path before H2.

## Review 2026-10-16 (Astra)

Source: `review-astra-harvest-2026-10-16.md` §2 (63), §1 (V12). Verified on `e8b9dd6d`.

- **P1 — coverage premise unsafe.** Accepted: `readCoverageEnd` is the greatest audit end (`src/extraction/readCursor.ts:13-15`)
  and `compactableEnd` can return the latest message under lag (`:17-19`). → coverage is `max(shortTermSummaryEnd, sealed
  chapter end)` (`src/runtime/coordinators/extractionCoordinator.ts:419`, `src/memory/chapterFold.ts:50`); H3 re-stated.
- **P1 — wrong budget API.** Accepted: `requestBudget` serves routed side calls. → `readPromptBudget`
  (`src/services/stHost/contextBudget.ts:35-38`) minus assembled-prompt overhead.
- **P1 — "derived from rows and the last cut" is stateful hysteresis.** Accepted. → a stateless quantised step cut (pure
  function of rows, budget and coverage); H5 covers reopen, branch, edits anywhere in the covered prefix, budget and member
  changes.
- **P1 — H6 lets both arms score zero; ten cloud probes do not establish recall on Artemis.** Accepted. → absolute floors,
  critical-fact and detail strata, 20 probes; H6r Artemis leg.
- **P1 — R2 reuse alone does not show worthwhile latency savings.** Accepted. → H1/H2 record sent tokens, prefill and
  first-token latency, warm/cold, same-speaker and alternating, enough turns for several steps, per-step cost; the build
  decision is the owner's on that record.
- **P2 — "ignoring rows cannot leak" too strong; dry-run goldens skip interceptors.** Accepted (ST `script.js:4562-4564`).
  → H7/H8 use actual request capture; privacy note rewritten.
- **V12 fold.** Adopted as H9.
- **Cheaper design: measure first, reuse chapter coverage and summaries.** Adopted; the recap (C) stays deferred.
- **"Outside the cap" identifies deferred work, it does not fund a run.** Accepted. → gates text says so.
- Rebutted: none.

## Tooling 2026-10-17 (branch `v2.8-62-63`)

Owner decision 2026-10-16 (61 §Owner decisions): decide on latency and recall; coverage from summaries and chapters only.
The window (B) is not built: nothing in `src/` changed. What is built is measurement tooling, gated without the GPU.

- `scripts/debug/lib/historyWindow.mts`: the plan's cut as a harness function (`cutFor`: steps of (high − low) x budget,
  high 0.90, low 0.65, the smallest k whose kept rows fit under high x budget, snapped forward to a player message, clamped to
  `coveredTo = max(shortTermSummaryEnd, last sealed chapter end)`; `stepTurns` for where a step would land; `coveredToOf`
  reads the chat blob's memory). B's product module would mirror it; H3/H5 parity is owed with B.
- `scripts/debug/so-trim-arms.mts` (H1): `seed-saga` (private saga chat into a stopped lane, cast ledger, story binding,
  profile by name, response length, every side model call and images off), `prep --arm front-trim|fits`, `drive` (one arm-run:
  optional cold command before turn 0, one player line + one drafted member per turn, same or alternating speakers, an in-page
  recorder of llama-server `timings` and first-token time per streamed request, history tokens per turn, the run's turns deleted
  after), `score` (per arm x pattern, warm and cold: sent tokens, reuse, prefill ms, first-token ms p50/p95, decode; the
  would-be step turns and their cost; overhead measured from the fits arm; trimmed turns in fits flagged). `--plumbing` serves
  scripted replies with made-up timings (a harness check, never a measurement).
- `scripts/debug/so-history-recall.mts` (H6/H6r): `plan`, `draft` (Sol drafts candidate probes from the rows below the cut
  into a private file), `ask --arm on|off` (one probe per turn, the pair deleted after, so every probe sees the same history;
  `--relay sol` for H6 on CL, `none` for H6r on Artemis), `rate` (blind Sol rater), `floors` (H6: on ≥ 16/20, ≥ 9/10
  critical, on ≥ off − 1 per stratum; H6r recorded). Window "on" is simulated: a wrapper around the extension's generate
  interceptor marks rows below the cut ignored on ST's copies (the chapter-fold `IGNORE` mechanism, loud generations only);
  the live chat is never written. Probe files and runs are refused outside `test/sessions/` (gitignored `test/sessions/hist63/`).
- Unresolved question answered (read, 2026-10-17): the reply thinking budget adds only `TEXTGEN_BUDGET_KEYS`
  (`src/runtime/replyEffort.ts:14`) and never changes `amount_gen`; `readPromptBudget`'s reserve is unchanged and the thought
  spends from it.

### GPU queue (owner's 3090): H6r then H1, about 125 GPU-minutes

Git Bash in the worktree (or master after merge). The saga chat is the private B1 copy; probe files stay private and are
picked by a second model, never the owner.

```bash
export SO_LANES_ROOT=C:/dev/so-live-lanes ST_ROOT=C:/dev/st-live-6263 ST_DEBUG_TIMEOUT_MS=900000
L=84; O=test/sessions/hist63; R="node scripts/debug/st-lanes.mts run $L --allow-load --"
npm run build && npm run stage
node scripts/debug/st-lanes.mts stop $L
ST_ROOT=C:/dev/SillyTavern-MainBranch node scripts/debug/st-lanes.mts seed $L --fresh --slim
node scripts/debug/so-trim-arms.mts seed-saga --lane $L --chat C:/dev/so-lanes/b1c-2026-10-08/private/saga-247.jsonl --group "Adolion - The Saga" --story adolion-saga --profile "Artemis RunPod RP" --amount-gen 300
node scripts/local/cli.mjs start
node scripts/debug/st-lanes.mts start $L --allow-local
$R scripts/debug/st-navigation.mts open-group "Adolion - The Saga"
$R scripts/debug/so-run-header.mts capture --label h63 --out $O/header.json
# H6r (about 15 GPU-minutes): 10 critical probes, window off then on, ST context 32,768
$R scripts/debug/so-trim-arms.mts prep --arm front-trim --max-context 32768
$R scripts/debug/so-history-recall.mts draft --out $O/h6r-draft.json --count 30
#   pick 10 critical candidates into $O/h6r-probes.json ({chat, group, responder, probes[{id, stratum, question, answer, source}]})
$R scripts/debug/so-history-recall.mts plan --probes $O/h6r-probes.json --kind H6r
$R scripts/debug/so-history-recall.mts ask --probes $O/h6r-probes.json --kind H6r --arm off --relay none --out $O/h6r
$R scripts/debug/so-history-recall.mts ask --probes $O/h6r-probes.json --kind H6r --arm on --relay none --out $O/h6r
# H1 (about 110 GPU-minutes): 4 arm-runs of 50 turns, each starting cold
C="node scripts/local/cli.mjs unload && node scripts/local/cli.mjs load"
$R scripts/debug/so-trim-arms.mts prep --arm front-trim
$R scripts/debug/so-trim-arms.mts drive --arm front-trim --pattern same --turns 50 --out $O/h1 --cold-cmd "$C"
$R scripts/debug/so-trim-arms.mts drive --arm front-trim --pattern alternating --turns 50 --out $O/h1 --cold-cmd "$C"
$R scripts/debug/so-trim-arms.mts prep --arm fits
$R scripts/debug/so-trim-arms.mts drive --arm fits --pattern same --turns 50 --out $O/h1 --cold-cmd "$C"
$R scripts/debug/so-trim-arms.mts drive --arm fits --pattern alternating --turns 50 --out $O/h1 --cold-cmd "$C"
$R scripts/debug/so-run-header.mts diff $O/header.json
node scripts/debug/st-lanes.mts stop $L
# no GPU from here
node scripts/debug/so-history-recall.mts rate --run $O/h6r --probes $O/h6r-probes.json
node scripts/debug/so-history-recall.mts floors --run $O/h6r --probes $O/h6r-probes.json --kind H6r
node scripts/debug/so-trim-arms.mts score $O/h1 --out $O/h1/score.json
```

Estimate (3090, Artemis 31B Q4, 300-token replies, side calls off): front-trim ~40 s a turn (a ~21K-token prompt
re-prefilled each turn) x 100 = 67 min; fits ~14 s a turn (only the tail prefilled) x 100 = 23 min; 4 cold reloads ~6 min;
ST overhead ~4 s a turn x 200 = 13 min; H6r 20 replies at ~30 s plus two cold prefills = 12 min; first load ~3 min. About
125 GPU-minutes. Order matters: H6r and front-trim before `prep --arm fits`, which cuts the chat to 60 rows (re-run
`seed-saga` on the stopped lane to restore it). 50 turns add about 16K tokens, three steps of (0.90 − 0.65) x ~21K; `score`
reports `stepsSpanned` (fewer than 3 = add turns). Deviation: the arms run at ST `max_context` 24576 (front-trim) and 32768
(fits) against the 3090's 32,768 server context, not `LLM_CTX` 24576 on a pod; ST's trim is what the arm measures.

### CL owed (no GPU)

- H6: 20 probes (10 critical, 10 detail) on the same saga chat on an offline lane with `--relay sol --kind H6`, both arms,
  then `rate` and `floors`. Needs the private probe pick first (`draft`, then a second model picks).

## Gate record 2026-10-17 (tooling, branch `v2.8-62-63`)

- No product change; B, C and H2–H5/H7–H9 not built (B is the owner's call on H1/H2 + H6).
- `node --test scripts/debug/historyWindow.test.mts` 10/10: cut formula (k x S, kept under high x budget), H3 shape over 600
  generated chats (never past `coveredTo + 1`, pure), snap and clamp, step turns, coverage from summary and sealed chapters
  only, H1 scoring (reuse, prefill, first token, warm/cold, step turns, overhead from fits, trimmed-turn flag), H6 probe-file
  checks and verdict per the predeclared floors, the simulated window marks copies only (live chat byte-identical, quiet
  untouched), `seed-saga`.
- Plumbing on lane 84 (offline, served `557d5bc013d9`), no model, no GPU: `so-trim-arms prep` both arms (max_context read back
  24576 / 32768 after a readback fix), `drive --plumbing` 4 arm-runs x 4 turns with a cold command, turns deleted after each,
  `score` over the 4 files (`test/sessions/hist63/plumb-trim`). Plumbing green; the numbers are scripted, never a measurement.
- Recall plumbing, CL (Sol relay), synthetic 61-row chat in the lab group, 20 synthetic probes (10 critical, 10 detail), the
  cut forced at row 41 (`--cut`, no durable coverage on that chat): off 20/20 correct; on 3/20 correct, 15 contradictions,
  41 rows marked ignored on every loud request. This is the harness control (with nothing covering the cut, recall collapses;
  the wrapper really removes the rows), not H6: H6 needs the saga chat, whose coverage (`shortTermSummaryEnd` 224 of 247 rows)
  is what B would rely on. Evidence `test/sessions/hist63/plumb/` (gitignored).
- Gates: as plan 62's gate record (same branch, same runs).
- Owed: H1 and H6r on the 3090 (GPU queue above, about 125 GPU-minutes); H6 on CL (private probe pick, then `ask --relay sol`).

## Folds from v2.9 triage (applied 2026-10-25, owner)

- M05; M07; M14; M15.
- Source: `docs/plans/v2.9/01-triage-sol.md`. Not built; each item is scheduled with this plan's next build pass.
