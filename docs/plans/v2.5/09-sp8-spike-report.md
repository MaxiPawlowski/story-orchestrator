# v2.5 plan 09 — SP8 curator write tiers, protected spans, category digest — spike report

**Verdict (v2.6, Adolion): tiers + spans include (W1–W3 PASS), digest drop (W4 b FAIL); see the v2.6 section at the end.** Earlier: pending (W3, W4 b live). W1, W2 and W4 (a) PASS deterministically; W3 and W4 (b) have not run. The conditions and
procedures below were committed in `7776f867`, before any SP8 code existed (rule 1). The conditions are the plan's table
(`09-research-spikes.md` §SP8) and are **never retuned**. This section only fixes how each one is measured.

## What the spike builds (two install-wide flags, both default off, never flipped by this plan; the curator itself stays off by default)

**`spikes.sp8CuratorTiers` (W1–W3): per-entry tiers and protected spans, authored in the entry's own content with ST's comment macro.**

- A marker is `{{// so:auto}}`, `{{// so:protect}}` or `{{// so:end}}` (case-insensitive, spaces allowed after `//`). ST removes every
  `{{// …}}` from World Info content before the prompt: WI content goes through `substituteParams` when an entry activates
  (`public/scripts/world-info.js:5058`), the legacy engine strips `/\{\{\/\/([\s\S]*?)\}\}/` (`public/scripts/macros.js:659`) and the new
  engine registers `//` as a comment macro returning `''` (`public/scripts/macros/definitions/core-macros.js:282`). ST 7c3994196. So the
  markers cost nothing in the prompt and are authored in ST's own WI editor. `{{///}}` (the new engine's scoped comment) is never used.
- **Tier:** an entry whose content carries `{{// so:auto}}` is `auto`; every other entry is `review`. In accept mode `auto`, only ops on
  `auto` entries are accepted on the spot; every other op waits for the author exactly as in `review`. `review` and `off` are unchanged.
- **Protected span:** from a `{{// so:protect}}` to the next `{{// so:end}}`, markers included; an unclosed one protects to the end of
  the content. An op **touches** protected text when it is:
  - a `rewrite` whose new text does not contain every protected span of the current content verbatim, or that carries a marker the
    current content does not (per kind, by count);
  - a `patch` whose replaced region (the span `applyCuratorPatch` would replace) overlaps a protected span or any marker, or whose
    replacement carries any marker;
  - a `disable` of an entry that holds a protected span.
  `enable` never touches. An op that touches is **refused at plan time** (dropped with the reason, never shown as a card) **and at the
  write edge** (re-checked against the entry read at the write edge, `CuratorWriter.writeOp`; the op is marked `failed`). Invariant 6 is
  narrowed only: the scope, the allowlist and the gated-entry rule are untouched, and tiers and spans can only remove writes.

**`spikes.sp8CuratorDigest` (W4): a digest of a large book in the curator prompt.**

- Applies only when the curator's scope holds **≥ 40** entries (`DIGEST_MIN_ENTRIES`); below that the prompt is byte-identical to today.
- **Full** (content, keys, state, exactly today's rendering) for at most **16** entries (`DIGEST_FULL_LIMIT`): those whose title — the
  text before ` - ` when there is one, else the whole title — or any key of ≥ 3 characters occurs as a whole word, case-insensitive, in the
  checkpoint name + objective + canon + open threads; ranked by the number of distinct terms that hit, then list order.
- Every other entry is listed **title-only** (`#ref "title"` and `[currently off]`), grouped under an index by the title's initial letter,
  with one rule line: those may only be switched on or off. A `rewrite` or `patch` naming a title-only entry is refused at plan time.
- The spike modules (`src/stagecraft/curatorTiers.ts`, `src/stagecraft/curatorDigest.ts`) load only through a dynamic `import()` behind
  their flag and are on plan 12 D3's list with a planted static import as the negative control. The W4 live harness is dev-only
  (`liveSuite`, `__SO_DEV__`).

## Conditions and how each is measured

| # | Condition | Pass (plan, verbatim) | Procedure (fixed before the run) | Kind |
|---|---|---|---|---|
| W1 | Protected spans | jest + mutant: an op touching a protected span is refused at plan time **and** at the write edge | Entry `The Crown` = `The realm is at peace. {{// so:protect}}The king died in the winter of 402.{{// so:end}} His heir is young.` plus an unclosed-span entry. **Ten violations**: v1 rewrite dropping the span; v2 rewrite changing one word inside it; v3 patch whose region starts before and ends inside the span; v4 patch starting inside and ending after; v5 patch covering the whole span; v6 patch covering only the `{{// so:end}}` marker; v7 `disable` of `The Crown`; v8 rewrite that adds `{{// so:auto}}` to a review entry; v9 patch whose replacement carries `{{// so:protect}}`; v10 patch after an unclosed `{{// so:protect}}`. **Four controls**: c1 `enable`; c2 patch outside the span; c3 rewrite keeping the span verbatim; c4 rewrite of an entry with no marker. Plan time: each case as a real curator reply through `StagecraftCoordinator.runCuratorPass` with the flag on — pass iff 10/10 violations are dropped with the protected-text reason and 4/4 controls become cards. Write edge: each case as an accepted record injected past the plan (the author's edited card, or a replay) and written by `applyAccepted` — pass iff 10/10 end `failed` with the file unchanged and 4/4 controls are written. Flag-off control: the same ten are accepted today. **Mutants** (each must turn a W1 test red, recorded in `test/findings/mutations/v25-09-sp8.txt`): M1 no plan-time check; M2 no write-edge check; M3 overlap test made strict at the span's first character; M4 an unclosed span treated as closed. | jest, once |
| W2 | Tier routing | in `auto`, only `auto`-tier entries apply without review; others wait, 100 % | Eight entries, four carrying `{{// so:auto}}`, none protected; one curator reply proposing one op per entry (two of each kind: enable, disable, rewrite, patch), accept mode `auto`, flag on, through `runCuratorPass` then `applyAccepted`. Pass iff 4/4 auto-tier ops are `accepted` and then `applied`, and 4/4 review-tier ops stay `pending` and are not written (100 % both ways). Controls: flag off in `auto` → 8/8 accepted (today); flag on in `review` → 8/8 pending. | jest, once |
| W3 | Live safety | ≥ 20 real `curator` proposals over a book with protected spans: 0 span violations applied; share of proposals refused ≤ 0.25 (route recorded, rule 5) | `test/scenarios/live-v25-09-sp8-w3-safety.json` (helpers `test/fixtures/interop/v25-09-sp8.js`, generator `scripts/spike/v25-09/sp8-fixtures.mjs`) on a lane, sandbox group chat, real LLM. A marker-named book `SO-V25-09 Protected` (12 entries: 6 with a protected span, 3 `auto`, 3 plain) on the story's `stagecraft.lorebooks`; curator on, accept mode `auto`, `sp8CuratorTiers` on (all put back in the last step). 24 rounds of: one real turn (`send_generate`) whose line overtakes some of the book's facts, protected and not; one curator pass; accept every card still pending (the author says yes to everything); one boundary apply. **Proposal** = one op the model proposed that named an entry in scope (plan records + plan-time refusals; lines the parser drops for other reasons are not proposals). **Refused** = proposals refused for touching protected text, at plan time or at the write edge. **Violation** = an applied op whose entry, read back from the book, no longer holds every protected span it held before, checked by the fixture's own span parser (independent of `src/`), plus a final read-back of every seeded span. Pass iff proposals ≥ 20, violations = 0 and refused / proposals ≤ 0.25, in **both** runs of the series. Fewer than 20 proposals = "measured nothing": re-run with more rounds, stated here (rule 1). Route: the `curator` role's profile, logged by the arm step and in the run header. | live ×2 |
| W4 | Digest | on an Adolion-sized book (≥ 150 entries): prompt chars ≤ 40 % of the full list, and the role-calibration floors above still met | (a) jest `src/stagecraft/curatorDigest.spike.test.ts`: a 264-entry book synthesised from the size profile of the install's `Adolion World` (`test/fixtures/spikes/v25-09/adolion-world-profile.json`: per-entry title/content/key lengths and initial, no text; sha256 `90195cea…`), padded under each of the 20 curator calibration cases (`test/fixtures/role-calibration/curator.json`) with the case's own entries first. Ratio = digest prompt chars / today's prompt chars over the same entries (`buildWiCuratorPrompt`). Pass iff the **maximum** ratio over the 20 cases ≤ 0.40. (b) live: `so-role-calibration.mts run --role curator --digest-pad "Adolion World"` — the same 20 cases, each padded with the lane's real `Adolion World` (read only), prompted through the digest, parsed against every entry, refused per the title-only rule, and scored by today's `scoreCurator` rules and floors (validity ≥ 0.9, opShape ≥ 0.85, decision ≥ 0.7, `roleCalibration.ts:207`). Pass iff every floor is met in **both** runs; the run also records the real book's ratio beside (a). | jest once + live ×2 |

A PASS of W1–W3 unlocks tiers and spans; W4 is judged separately and unlocks the digest (plan).

## Results

| # | Measured | Result | ST version note |
|---|---|---|---|
| W1 | Cases in `test/support/curatorSpikeCases.ts` (each first checked to be a change today's `previewCuratorOp` accepts, so a refusal is the spike's). Pure (`curatorTiers.test.ts`): 10/10 violations refused, 4/4 controls pass. Plan time through `runCuratorPass`, flag on (`curatorTiersSpike.review.test.ts`): **10/10** violations never become a card and each drop carries the protected-text/marker reason; **4/4** controls become cards. Write edge through `applyAccepted` with the ten injected as accepted: **10/10** end `failed` with the reason, **0** host writes; the four controls are written (4 writes) and the span survives; an op planned against an unprotected entry is refused when the entry holds a span at the write. Flag-off controls: all ten become cards, and an accepted `disable` of the protected entry is written. Mutants M1–M4 all **killed** (`test/findings/mutations/v25-09-sp8.txt`: M1 10 failed, M2 2, M3 4, M4 4 of 42). | **PASS** | markers rely on `world-info.js:5058` + `macros.js:659` + `core-macros.js:282` at ST 7c3994196; re-check on the release version (plan 12 R5) |
| W2 | Accept mode `auto`, flag on, two real passes proposing the eight ops (two per kind): the **4/4** auto-tier ops `accepted` and then `applied`, the **4/4** review-tier ops `pending` after the apply, and exactly the four auto entries written (100 % both ways). Controls: flag off in `auto` → 8/8 accepted (today); flag on in `review` → 8/8 pending, 0 writes. | **PASS** | n/a (our code) |
| W3 | 2026-09-27 lane 3, dev `fd8efa441c80`, ST 1.19.0 (7c3994196), route `curator` = the shared read profile `Story Orchestrator Memory RunPod` (run header), ×2: run 1 **84** proposals, **80** refused (all at plan time, 0 at the write edge), **4** applied, **0** violations (op and final book read-back), refused share **0.952**; run 2 **92** proposals, **91** refused (plan time), **1** applied, **0** violations, refused share **0.989**. Most refusals are `patch` ops whose region touches a protected span (the log tallies about 60/17 and 67/16 patch/rewrite drops; a further 64/72 lines per run were dropped by the 4-change cap and are not proposals). Book deleted, curator and flags restored (`disarmed`), header diff 0 blocking. Record `test/journeys/records/v2.5-batch2/plan09/SP8/W3/` | **FAIL** (violations 0 in both runs, but refused share 0.95 / 0.99 > 0.25) | ST 1.19.0 (7c3994196) |
| W4 (a) | 20 cases, each padded to 265–267 entries with the synthesised Adolion-sized book: today's prompt 117 252–117 713 chars, digest 9 145–9 606; **maximum ratio 0.0816** (bar 0.40). Informational: on this padding no required entry whose required kinds are text edits only is title-only in any case (`hiddenRequired` empty), so the live floors are not handicapped by the digest's selection on the synthetic book; the real book's own terms may crowd the 16 full slots, which (b) measures. | **PASS** | n/a (pure) |
| W4 (b) | 2026-09-27 lane 3, dev `fd8efa441c80`, pad = the lane's `Adolion World` (264 entries, read only), route `curator` → `Story Orchestrator Memory RunPod` (fallback), ×2: both runs identical per case (real calls, 4–8 s each): validity **20/20** (floor 0.9 ok), opShape **20/34 = 0.588** (floor 0.85, **below**; es 6/13 = 0.46), decision **18/20 = 0.90** (floor 0.7 ok). Real book ratio max **0.0864**, mean 0.0784 (bar 0.40). Six cases kept nothing (c04, c05, c08, c10, c15, c17), e.g. c04 proposed `enable` on two entries already on. Verdict `not recommended` (run 1 and 2 below a floor). Goldens `test/goldens/live/role-calibration/curator-digest-fd8efa441c80-r{1,2}.json`, record `test/journeys/records/v2.5-batch2/plan09/SP8/W4b/` | **FAIL** (opShape floor missed in both runs; ratio half met) | ST 1.19.0 (7c3994196) |

Commands: `npx jest src/stagecraft/curatorTiers src/runtime/coordinators/curatorTiersSpike src/stagecraft/curatorDigest src/runtime/curatorDigestRunner`
(ratios printed with `SO_SPIKE_REPORT=1`), mutants `node .debug/mutate-sp8.mjs` (worktree scratch; the record is committed), 2026-09-26.
The floors cited in W4 now sit at `roleCalibration.ts:209` (the SP8 code added the `scoreCurator` pad/narrow parameters above them;
the floors are unchanged).

## Negative controls

- D3 (plan 12): `devOnly.guard.test.ts` lists `src/stagecraft/curatorTiers.ts` and `src/stagecraft/curatorDigest.ts`; neither is
  statically reachable from `src/index.tsx` (the coordinator loads them with `import()` only while a flag is on; `liveSuite`, itself
  dev-only, imports the digest for W4 b). The planted-import control covers the list.
- Flag off: the coordinator does not even await an import (`spikesOn()`), so today's pass and apply keep their microtask order;
  every flag-off control above reproduces today's behaviour.
- `curatorDigestRunner.test.ts`: the W4 (b) harness pads, digests, prompts the `curator` role, scores with the title-only refusal
  (an unseen rewrite is dropped, the enable survives), and refuses a missing or too-small pad book.

## Cost so far (for the worth review)

Prod graph: main entry 1 175 103 → **1 176 800 B** (+1 697; budget 1 250 000) for the flag reads, `renderCuratorEntry` /
`NO_CURATOR_ENTRIES` (a refactor of `buildWiCuratorPrompt`, byte-identical output) and the writer's optional `guard`. Spike chunks:
tiers 3 346 B, digest 3 151 B, both lazy. `stagecraftCoordinator.ts` +22 lines (budget 560), `curatorWriter.ts` +3. New host
seam: none; one new host fact (ST's comment macro) for the marker syntax. Invariant 6 (stagecraft proposes, never writes; scope =
`stagecraft.lorebooks` minus gated entries, re-checked at the write edge): only narrowed — both checks remove writes, neither adds
a book, an entry or an op kind.

## Live legs (pending)

The curator stays **off by default**; each leg switches it on for its own run and puts it back (W3 in its score step; W4 b never
switches it, it calls the curator role directly). Both need the dev build served on the lane:

```
npm run build:dev && npm run serve:dev
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/st-session.mts reload
```

W3, ×2 in one series (`--repeat 2`), a sandbox group chat on the lane's Arin group:

```
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-run-header.mts capture --label v25-09-sp8-w3
node scripts/debug/st-lanes.mts batch --lanes <n> --repeat 2 --strict --group 1759606632088 test/scenarios/live-v25-09-sp8-w3-safety.json
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-run-header.mts diff <capture.json>
```

Pass iff each run's score step logs `proposals >= 20`, `violations = 0`, `refusedShare <= 0.25` (the last step throws otherwise).
A crashed run leaves the marker book: `node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-assets.mts remove --marker SO-V25-09`.

W4 (b), ×2 consecutive on one lane and one route (the curator role's shared route, as the recorded calibration goldens):

```
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-run-header.mts capture --label v25-09-sp8-w4
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-role-calibration.mts run --role curator --digest-pad "Adolion World" --expect-count 20 --arm digest-<bundle12>-r1 --record
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-role-calibration.mts run --role curator --digest-pad "Adolion World" --expect-count 20 --arm digest-<bundle12>-r2 --record
node scripts/debug/so-role-calibration.mts verdict test/goldens/live/role-calibration/curator-digest-<bundle12>-r1.json test/goldens/live/role-calibration/curator-digest-<bundle12>-r2.json
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-run-header.mts diff <capture.json>
```

Pass iff the verdict is `recommended` (every floor met in both runs). Each report carries `digestRatio` (the real book's ratio).
Records under `test/journeys/records/v2.5-plan09/sp8/live-<bundle12>/`.

## v2.6 Adolion re-run (plan 03, 2026-10-01) — tiers + spans **include**, digest **drop**

Restated: `docs/plans/v2.6/03-sp8-restated.md` (+ addenda 1–2, each committed before its run). Lane 2 (adolion-fresh at
`59e8821`), served bundle `6566f7f8e418` (shared slot dev; C8 "plan-time refusals reach DECLINED" and C9 "digest index
line" built). Route: `curator` → `deepseek 4.1 flash`; W3's turns on `Artemis RunPod RP`. Record
`test/measurements/v2.6-03/sp8/summary.json` (logs in `w3/raw/`, `w4b/raw/`; goldens
`test/goldens/live/role-calibration/curator-digest-6566f7f8e418-r{1,2}.json`).

| # | Measured | Result |
|---|---|---|
| W3 | The real `Adolion Chronicle` (13 entries, 5 protected, 3 auto), 24 real act lines. Run 1: **23** proposals, **3** refused (all plan time), **20** applied, **0** violations, refused share **0.130**. Run 2: **32** proposals, **2** refused, **30** applied, **0** violations, share **0.0625**. Two earlier runs not measured (host disk full; a 300 s generation timeout on the shared pod), addenda 1–2 | **PASS ×2** (v2.5 on the synthetic book: 0.95 / 0.99) |
| W4 (b) | 12 English cases padded with the lane's `Adolion World` (264 entries), ×2: validity 11/12, 12/12 (ok); **opShape 13/16 = 0.81, 13/17 = 0.76** (floor 0.85, **below**); decision 10/12 both (ok). Real ratio max 0.122. Misses: `enable` of entries already on (c04, c05) despite C9, and c08 disabling the first four index entries alphabetically (`1001 Ways to Mate`, `Adolion`, `Adventurer`, `Adventurer Rank`) | **FAIL** (opShape in both runs) |

## Worth review (v2.6)

| | Tiers + protected spans (W1–W3) | Category digest (W4) |
|---|---|---|
| Measured value | 0 span violations over 55 real applied ops on the campaign's own book; the author's invariant canon (house founders, past losses, who woke) survives an `auto` curator; refusal share 6–13 % (v2.5's synthetic book 95–99 %, which the C8 DECLINED fix and purposeful spans both cut) | Prompt 12 % of the full list, but a model shown an index proposes no-op enables and alphabetical disables: opShape below floor twice |
| Cost | Prod +1 697 B already measured for the flag reads + writer guard; `.b` moves the 3 346 B tiers chunk into the main entry (≈ +3–5 KB of 1 250 000). `stagecraftCoordinator.ts` +22 lines. Prompt tokens 0 (ST strips `{{// …}}` before the prompt). Latency: none (plan-time check is pure; one re-read at the write edge already exists). | n/a |
| Surface | Authors: `{{// so:auto}}`, `{{// so:protect}}…{{// so:end}}` in ST's own WI editor (Studio help text owed). Players: none. The campaign's Chronicle already carries the markers. | — |
| Call | **include → `SP8.b`** | **drop** (removal commit + planted-import control). For Adolion the curator's real scope is the 13-entry Chronicle, below the 40-entry threshold anyway (lab README). |
