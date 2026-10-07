# Plan 25 — TunnelVision re-harvest: the upstream is back and five months newer

**Status: SEEDED 2026-10-07 from the user's idea list; needs user approval; not run.** Gate tier: docs only (a report
doc; nothing in `src/` changes). Overview: `00-overview.md`. User idea (00-overview tail): "update and explore
tunnelvision extension for pattern harvest. We do have a folder where we clone ST plugin repos to review them."

## Question

What has TunnelVision (TV) added since the v2.4 review read the 2026-03-06 mirror, and which of its new mechanisms fill
a gap in our curator, memory tiers, lore scan or turn handling, without breaking the "reply path never writes" rule?

## Scouting done for this seed (2026-10-07, read-only)

| Fact | Value |
|---|---|
| Corpus folder | `C:\dev\st-extensions-research\tunnelvision-fully-autonomous-and-easy-lorebook\` (`post.md`, `MIRROR-NOTE.md`, `source-mirror/`; no `source/`) |
| What v2.4 read | mirror `Stephanie1364/TunnelVision` @ `da28e58` (2026-03-06, 22 commits, manifest v0.1.0). `git ls-remote` still answers `da28e58`: the mirror never moved |
| Upstream | `Coneja-Chibi/TunnelVision` **exists again** (MIRROR-NOTE said "Repository not found" 2026-09-20). HEAD `a01d7ee` on `main`, last push 2026-08-20, 117 commits, AGPL-3.0, open PRs #12–#23 and others, branch `debug/raya-merge-repro` |
| New top-level modules (GitHub contents API, not cloned) | `llm-sidecar.js`, `sidecar-retrieval.js`, `sidecar-writer.js`, `post-turn-processor.js`, `smart-context.js`, `world-state.js`, `memory-lifecycle.js`, `entry-protection.js`, `entry-scoring.js`, `embedding-cache.js`, `summary-hierarchy.js`, `summary-collapse.js`, `summary-runner.js`, `arc-tracker.js`, `conditions.js`, `turn-classification.js`, `background-events.js`, `message-identity.js`, `world-info-attribution.js`, `prompt-injection-service.js`, `tree-editor.js`, `tree-categories.js`, `feed-ui/`, `tests/` + `vitest.config.js` |
| Recent commit themes | OOC turns read the lorebook but never write it (four write paths suppressed, wrapped-marker classifier, 25 tests); stop cancels a sidecar retrieval and the reply; sidecar no longer leaks the user's ST origin to OpenRouter |
| Derivative | `ExtensionMuncher/TheLibrarian` (2026-07-07, "inspired by TunnelVision", read-only lore via function calling) |

So the thesis may have shifted: v2.4 rated TV "philosophically opposite" (main model writes mid-generation). A
**sidecar** retriever/writer and a **post-turn processor** read like an off-path design, which is ours. That is the
reason to re-harvest rather than re-cite the v2.4 report.

## Why now (consumers)

- v2.8 11 (curator `create` op): TV's `remember`/`entry-scoring`/dedup on create; v2.4 idea #5 (trigram near-dup).
- v2.8 21 (smart-context harvest) and v2.8 22 (living story director): TV's `smart-context.js`, `background-events.js`.
- v2.7 15 (SP10 tool-call turns): TV is still the main co-installed tool user; re-verify its turn shape.
- v2.7 02 C13 (curator tiers, `{{// so:protect}}`): compare `entry-protection.js`.
- v2.6 07 chapters / `memory/chapterFold`: compare `summary-hierarchy.js` / `summary-collapse.js`.
- v2.5 08 L5 (`loreExclusive`) and `runtime/storyLore.ts`: TV's suppression now has company (`world-info-attribution.js`).
- A player-input classifier (OOC) does not exist in `src/` (grep `ooc` finds only `judge/selfTestCases.ts`).

## Sources / prior art

- `docs/plans/v2.4/extension-research/tunnelvision-fully-autonomous-and-easy-lorebook.md` (8 ideas, copy/avoid lists,
  host facts) and `SUMMARY.md` rows citing TV.
- `docs/plans/v2.7/23-local-residency-freetoken.md` (single-repo harvest shape: clone pin, "our target", verdict table).
- Ours: `src/stagecraft/*`, `docs/plans/v2.1/stagecraft-design.md`, `src/memory/*`, `src/runtime/loreExclusive.ts`,
  `storyLore.ts`, `worldInfoEvidence*.ts`, `loreFired.ts`, `turnBridge.ts`, `src/stagecraft/curatorTiers.ts`.

## Method

1. **Update the corpus copy (needs decision 1).** Shallow-clone the upstream into the folder's missing `source/`:
   `git clone --depth 1 https://github.com/Coneja-Chibi/TunnelVision source` and record the commit. Keep
   `source-mirror/` untouched as the v2.4 baseline. Amend `MIRROR-NOTE.md` ("upstream back, seen 2026-10-07") and the
   corpus `README.md` row's Commit cell. Nothing is installed into ST or any lane.
2. **Diff the two trees.** `git diff --no-index source-mirror source --stat`; classify each new module as new feature,
   refactor of a v2.4-read file, or tests. Read the commit log (117 entries) for stated reasons; the author writes long
   commit bodies, which are the cheapest design notes.
3. **Re-check v2.4's eight ideas** against upstream: still true, changed, or gone (e.g. does it still overwrite
   `ToolManager.RECURSE_LIMIT`, still `/profile`-swap for side calls, still `hideChatMessageRange`, still no rollback?).
4. **Read the new modules** in this order: sidecar (`llm-sidecar`, `sidecar-retrieval`, `sidecar-writer`,
   `post-turn-processor`), state (`world-state`, `memory-lifecycle`, `conditions`, `arc-tracker`), lore
   (`entry-protection`, `entry-scoring`, `embedding-cache`, `world-info-attribution`), summaries, turn handling
   (`turn-classification`, `message-identity`, `background-events`), `prompt-injection-service`, `tests/`.
5. **Verify every host claim** in `C:\dev\SillyTavern-MainBranch\` (file:line), as v2.4 did; note where ST moved.
6. **Score** each pattern with the rubric; write the report.

## Rubric (per pattern)

| Column | Values |
|---|---|
| kind | pattern / host-integration / anti-pattern / testing |
| our area | stagecraft, memory, lore scan, turn bridge, judge, director, UI |
| our state | absent / partial / present / we avoid |
| invariant fit | which `architecture.md` invariant it strains or strengthens (reply path never writes, curator proposes only, rollback, privacy per member, group only) |
| value 1–5, effort S/M/L | as v2.4 |
| destination | v2.7 / v2.8 plan id + row, or "no" |
| evidence | TV `file:line` @ commit + ST `file:line` |

Questions to answer explicitly: does the sidecar run on the reply path (blocking) or after it; what happens to its
writes on swipe/edit/delete (`message-identity.js`); is world state typed; how OOC is decided and whether a judge use
would do it better; whether `entry-protection` and our `so:protect` spans can coexist on one book.

## Deliverable

- `docs/plans/v2.8/25-tunnelvision-report.md`: pin table, mirror-vs-upstream diff summary, v2.4 idea re-check, new
  pattern table (rubric), copy / avoid lists, ST host facts learned, candidate rows per consumer plan. Each candidate
  row is a proposal only; consumer plans change only by the user's decision.
- Corpus side (outside this repo): `source/` clone + amended `MIRROR-NOTE.md` and README row.

## Effort

About half a day: clone + diff 30 min, commit log 30 min, ~25 new modules (~2 h), host verification 1 h, report 1 h.
No model calls, no lane, no pod.

## Risks

- **Licence:** TV is AGPL-3.0, same as this repo (`LICENSE`), so code reuse is legally possible with attribution. Rule
  anyway: the harvest takes patterns; any code reuse is a separate, named decision in the consumer plan, with the
  source commit and file recorded. Quotes in the report stay short and cite `file:line`.
- **Provenance:** upstream re-appeared after being gone; record that the account matches the forum post's repo URL, and
  do not install it anywhere.
- **Rate limits:** unauthenticated GitHub API ran out during scouting; use `gh api` (authenticated) or the clone.
- Spoilers: none (no campaign content involved).
- Scope creep into building: the report proposes; it builds nothing.

## Decisions for the user

1. Clone upstream into the corpus `source/` and amend the corpus notes? **Recommend yes** (shallow, read-only, keeps
   the mirror as baseline).
2. Also skim `TheLibrarian` (read-only lore tools) in the same pass? **Recommend yes, 15 min**, one paragraph only.
3. Read open PRs (#12–#23 etc.) as well as `main`? **Recommend no**; `main` plus the commit log is enough.
4. Run it before v2.8 11 (curator create) is designed? **Recommend yes**; that is the plan most likely to change.

## Links

- Corpus: `C:\dev\st-extensions-research\README.md`, `FORUM-INDEX.md`, the TV folder above.
- `docs/plans/v2.4/extension-research/tunnelvision-fully-autonomous-and-easy-lorebook.md`, `SUMMARY.md`
- `docs/plans/v2.7/23-local-residency-freetoken.md`, `15-sp10-tool-call-turns.md`, `02-v26-carry-in.md` (C13)
- `docs/plans/v2.8/11-curator-create-op.md`, `21-smart-context-harvest.md`, `22-living-story-director.md`
- Upstream: <https://github.com/Coneja-Chibi/TunnelVision> · mirror: <https://github.com/Stephanie1364/TunnelVision>

## Decided (user, 2026-10-07)

"Go with the recommendations": every decision in §Decisions above takes its **Recommended** answer.
