# Tavernary Companion — 2026-10-14 harvest

meta: https://github.com/MentallyQuill/TavernaryCompanion · `pre-refresh-2026-10-14` (5515ed6) .. `dd9ae42` (3 commits, 46 files, +4.8k/-0.4k, most of it evidence JSON + tests) · AGPL-3.0 (ideas only, no code) · read: full diff of src/lifecycle, src/catalog, src/host, vendor/tavernary-core/src, the new perf audit doc + plan, `scripts/performance-audit.mjs` head, the new `use-frame-positioning.ts`, the changed install tests; skipped: dist/, evidence JSON bodies, UI card/section diffs beyond the commit message · prior: `docs/plans/v2.4/extension-research/tavernary-org-a-github-website-to-find-st.md`

## What it is / what changed
Still an ST extension manager (browse tavernary.org catalog, install/update Kits). No chat, prompt, WI or LLM involvement. Three commits:
- `4d021c3` "trust native install success": **removes** the verify-after-install readback the v2.4 review held up as a model (prior idea 4). A host-reported install success now stays a success when rediscovery or revision lookup fails or returns nothing. Install contracts no longer need a manifest (`manifestPath: "manifest.json" | null`).
- `fb1fa05` catalog refresh on popup reopen: the cached in-flight `open()` promise was never cleared, so a reopen never revalidated.
- `dd9ae42` perf: render-count audit; unchanged Installed cards keep their render (20,400 -> 400 renders on a 100-row fixture); overlay positioning coalesced to one measure per rAF.

## How it works
- Install trust: `src/lifecycle/verified-install.ts:77-83` builds the installed record from the contract (`third-party/<folderName>`) instead of `exactFolder(await host.discover())`; revision-read failure with no requested SHA returns success with `installedSha: null` (`:92-93`). A *mismatch* against a requested SHA still uninstalls and confirms removal (`cleanupMismatch`, unchanged). `sillytavern-host.ts:224-227` drops the post-install `discover()`. Test: `tests/unit/install-lifecycle.test.ts:175-191` (discover rejects -> receipt `succeeded`, ownership recorded).
- Reopen refresh: `src/catalog/catalog-client.ts:106-118` `open()` shares one in-flight promise, clears it in `finally`, and on later opens calls `refresh()` (which keeps its 15-min throttle and cached failure state).
- Perf audit: `scripts/performance-audit.mjs:39` hooks Preact `options.__r` to count renders per component name, plus a `structuredClone` counter; headless Chromium, 4x CPU throttle, fixed fixture (438 projects / 100 installed with an 80 ms fake inspection delay), saved JSON with build hashes, `--plain` arm without counters. Findings and limits written up honestly (`docs/research/2026-10-13-companion-performance-audit.md`: "do not establish that every reported source of lag has been resolved"; a `content-visibility` experiment was measured and **not shipped** because it broke scroll height).
- Frame positioning: `src/ui/shared/use-frame-positioning.ts` measures once on open, then at most once per rAF on resize/scroll (capture, passive), skips state publication when the position is unchanged, cancels the frame on close.

## Patterns for SO

### P1. "Host said ok, readback unavailable" is a third outcome, not a failure  — pattern · wizard provisioning · partial · value 3 · effort S
What: they learned the hard way that turning a host success into a failure because the post-act readback is unavailable is wrong; only a readback that *contradicts* the request is a failure. Their evidence: `verified-install.ts:77-93` + the reversed test above.
Ours: `src/services/stHost/provisioning.ts:40-67` `createCharacterCard` still returns the **requested** `ch_name`, never reads back (prior idea 4 still open). Our save vocabulary already has exactly this three-way split (`unsaved` = evidence of loss, `unconfirmed` = blind read-back; gotchas §Async writes).
Fit: when prior idea 4 is built, shape it as `{ok:true, stored}` (readback found one match: record its name/avatar), `{ok:true, unconfirmed}` (lists not reloadable: record requested name, flag the requirements row as unconfirmed), `{ok:false, reason:"mismatch"}` (zero or >1 matches for the returned avatar). Do not refuse on `unconfirmed`. No invariant conflict (wizard still create-only).

### P2. Reused in-flight promise must clear in `finally`  — test-idea · runtime/stHost caches · unknown · value 2 · effort S
What: `catalog-client.ts:106-111`: a memoised `#opening` promise outlived its run, so every later open was a no-op. Classic single-flight bug; the fix pairs single-flight with "re-validate on reuse".
Ours: `stHost/capabilities.ts` already does not cache `error` (prior review). Worth one grep pass for other `??=`-style promise memos (lazy chunk loaders, `livingPort.ts`/`meanwhilePort.ts` doors, workspace modal lazy open) to check each clears or is meant to be permanent. Not verified here; no claim of a bug.

### P3. Render-count + clone-count audit harness  — test-idea · UI/harness · absent · value 2 · effort M
What: count renders per component and defensive clones under a fixed, throttled fixture; report median of N starts with build hash; ship only measured wins. Their evidence: `scripts/performance-audit.mjs:39,50`, audit doc tables.
Ours: `scripts/debug/so-soak-probe.mts` measures heap/DOM/listeners, not renders. SO is "one snapshot, one subscription" (architecture.md §Layering); every snapshot publication can re-render drawer + HUD + every mounted inline strip (`src/components/inline/`), and `grep memo( src/**/*.tsx` finds 0 hits. Unmeasured, so no claim of lag. A React Profiler `onRender` counter in a Storybook play or a lane page, driven over a long chat (many `#so-inline-<mesid>` hosts) during a boundary commit, would say whether per-message strips re-render on unrelated snapshot changes. Fits the existing soak-probe evidence style.

### P4. rAF-coalesced, publish-only-on-change overlay positioning  — pattern · UI · partial · value 1 · effort S
`use-frame-positioning.ts`. Ours: popovers/tooltips (`components/studio/HelpTooltip`) — only relevant if P3 shows tooltip churn. Note ST's `<html>` `translateZ(0)` trap (gotchas §ST host) already constrains fixed positioning.

## Host facts
- Post-install `/api/extensions/discover` (or ST's module-state inventory) can be unavailable or not yet list a just-installed extension; the author now treats ST's install response as authoritative (`4d021c3` commit body, `install-lifecycle.test.ts:175-191`). Not verified against ST source here (cheap check: `src/endpoints/extensions.js` install handler vs discover). Relevance to SO: only `npm run plugins:install`-style tooling, which does not use these endpoints.
- ST native Git install works for repos without a root `manifest.json` per their updated contract (`docs/design/04-project-lifecycle-and-trust.md:13`). Irrelevant to SO (we ship a manifest; `minimum_client_version: "1.18.0"` now present, `manifest.json:10`, so prior idea 3 is done).

## Not worth taking
- Kit facet grouping/caching (`kit-discovery-controller.ts`): catalog-search specific.
- Compact-card markup omission: CSS-hidden DOM pruning; SO panels are small.
- `content-visibility:auto` for long lists: they measured it and rejected it (scroll height jump); same risk for ST's chat column.

## Leads
None from this repo. The clone holds no catalog data: only synthetic fixtures (`tests/fixtures/ui-harness-entry.tsx:83` generates 438 fake projects; `vendor/tavernary-core/fixtures/catalog-v7-valid.json` has one `example/alpha`). The live catalog (`tavernary.org/catalog/tavernary-catalog-v8.json`) was not fetched (brief: no network). The only real extension named is Summaryception (`https://github.com/Lodactio/Extension-Summaryception`, test data `tests/unit/inventory-reconciler.test.ts:104`; summarisation/memory extension); not in the corpus under that name, worth a check against `improved-memory-and-summarization` (that folder is qvink_memory, a different repo). Fetching the v8 catalog and filtering by tag (memory/state/director/game) is the cheap follow-up if the coordinator allows network.
