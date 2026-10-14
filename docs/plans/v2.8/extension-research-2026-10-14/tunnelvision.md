# TunnelVision — 2026-10-14 harvest

meta: https://github.com/Coneja-Chibi/TunnelVision · `a01d7ee..cf84ad1` (6 commits, 2026-09-09 authored, merged 2026-10-11; 22 files, +2.1k/−0.4k of which 1.2k `package-lock.json`, 0.6k `style.css`) · AGPL-3.0 (ideas only) · read: full `git diff pre-refresh-2026-10-14 HEAD` minus lockfile/CSS, commit bodies, merge-vs-PR-head diffs (`pr51..422bb53`, `c3ce12c..cf84ad1`), write-permission call sites at HEAD; skipped: CSS, jsdom UI test bodies · prior: `docs/plans/v2.4/extension-research/tunnelvision-fully-autonomous-and-easy-lorebook.md`, `docs/plans/v2.8/25-tunnelvision-pattern-harvest.md`, `25-tunnelvision-report.md` (2026-10-10 re-run already read PR heads #51 #55 #56)

## What changed
- Merged three PRs the 10-10 re-run already reviewed as open: #55 post-turn writer respects read-only (= Q1), #56 test repairs (= Q6), #51 mobile tree editor (= Q7).
- New beyond those PR heads: `adb6d18` (a book holding only summary entries builds its index with no provider call) and a merge-time edit in `ui-controller.js:1738-1750` (move picker re-reads the stored tree before writing).
- Every 10-10 candidate (A15–A21) is built on our side (`32-queue.md:91-97`). Little left to take.

## How it works
- `resolveTargetBook(book, {checkWrite})` (`tool-registry.js:329-360`) is the one permission filter; #55 added `checkWrite: true` to `post-turn-processor.js:242,1371`. Tool actions all pass it (`tools/remember.js:191`, `update.js:67`, `forget.js:60`, `merge-split.js:100`, `reorganize.js:70`, `summarize.js:323`); the sidecar writer routes ops through those tools, so it inherits the check.
- `memory-lifecycle.js:203,228,597,757` still loops `getActiveTunnelVisionBooks()` (read-only included) and calls `updateEntry` directly: the one remaining background writer that ignores `read_only`.
- `splitEntriesForTree` / `pinSummaryEntries` (`tree-builder.js`, `c3ce12c`): summary entries (by `isSummaryTitle(comment)`) skip categorisation and land in a fixed "Summaries" node; summary-only book short-circuits (`tree-builder.js:310-318`).
- `assignEntryToNode` (`ui-controller.js:1738-1750` @ `cf84ad1`): `getTree(book)` fresh, `findNodeById` target, refuse with a toast if the node is gone, write, then sync the closure's view.
- `keyword-trigger-state.js`: module-state split out of `index.js` so siblings don't run its top-level `await init()` (our known lesson, gotchas "A module importing `@services/STAPI` cannot be unit-tested").

## Patterns for SO

### P1. TV read-only detection is now stale — host-fact · lore/checks · present (A18) but over-reports · value 2 · effort S
What: our A18 model says any of `lifecycleEnabled | postTurnEnabled | sidecarPostGenWriter` makes a `read_only` book writable (`src/services/stHost/tunnelVision.ts:22-27`, test `tunnelVision.test.ts:25-26` pins all three). At `cf84ad1` only `lifecycleEnabled` bypasses read-only (evidence above: post-turn fixed in `8b25da3`; sidecar ops go through `checkWrite` tools). Fit: author-only `degrades` row, so a false positive costs one dismissable line, no invariant touched. Sketch: `backgroundWrites = settings.lifecycleEnabled === true`; flip the `it.each` to lifecycle only plus two negative cases. Version-sensitive: an older TV install still bypasses via post-turn. Since we can't read TV's version cheaply (manifest `version` would do: `host.manifest(folder)` already in hand), either key on manifest version or keep the conservative superset and just note it. Recommend keeping superset unless the row fires noisily for the owner.

### P2. Re-resolve the target at write time, not from the snapshot the UI opened on — pattern · studio/curator review · present · value 1 · effort —
What: picker held a tree captured when the editor opened; a background rebuild could replace it, and the write resurrected the old tree. Fix re-reads and resolves by id (`ui-controller.js:1738-1750`). Ours: curator writer reads the before-image by uid at the write edge (`src/runtime/curatorWriter.ts:73-90`) and rollback refuses on external edits (`:196-206`, `:252-253`); Studio edits go through one zustand draft (`studio/draft.ts`, `mutations.ts`). Nothing to take; confirms design.

### P3. Degenerate input skips the model call — pattern · memory/chapters · likely present · value 1 · effort S
What: summary-only book builds a trivial index locally instead of an LLM pass (`adb6d18`, test `tests/summary-only-tree-build.test.js`). Ours: not audited per pass in this review; worth a one-line check only if a pass shows up in `requestBudget`/call logs with empty input. No row.

## Host facts
- None new about ST. TV-side fact for A18: as of `cf84ad1` the post-turn processor and sidecar writer honour `bookPermissions[name] === "read_only"`; memory lifecycle does not (`memory-lifecycle.js:203-232`).

## Not worth taking
- Mobile tree editor / move picker (`flattenNodes`, `tree-store.js:232-247`): TV tree UI, no SO analogue.
- Summaries pinned to a fixed tree node: TV's category tree; we have no category digest (v2.4 idea 6, declined).
- Test-suite repair lesson (91 hidden failures, `describe.skip` contracts for unlanded refactors): we already inventory skips (`scripts/lib/suiteInventory.test.mjs:22`, plan 26 `26-test-and-gate-speed.md:129`).
- `applyRecurseLimit` moved to `tool-registry.js:38-54`: still overwrites `ToolManager.RECURSE_LIMIT` globally; we avoid (v2.4 idea 8).
- jquery added as devDependency for jsdom UI tests: we use Storybook plays.
