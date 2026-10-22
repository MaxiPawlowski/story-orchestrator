# Small updated repos — 2026-10-21 harvest

Three repos with tiny diffs since `pre-refresh-2026-10-21`. None touches chat, prompts, WI, generation or replies, so
none has a `## For per-character polish` section. Verdict for all three: nothing to adopt.

## 1. Tavernary Companion (`tavernary-org-a-github-website-to-find-st`)

meta: `dd9ae42..a19eaf6` (1 commit "feat(kits): simplify creation and deletion", 2026-10-15, 37 files, +2418/−418, about half
tests and snapshot PNGs) · **AGPL-3.0** (ideas only) · read: full diff of docs, `kit-store.ts`, `kit-delete-dialog.tsx`,
`popup-host.tsx`; skipped: `dist/`, CSS, PNGs · prior: `docs/plans/v2.4/extension-research/tavernary-org-a-github-website-to-find-st.md`,
`docs/plans/v2.8/extension-research-2026-10-14/tavernary.md`

What changed: Kits (named lists of extensions) UX only. **New Kit** is back on the Kits screen, the builder gets extension
search, save opens the saved Kit's details, a failed save keeps the draft with a retry error. New **Delete Kit** confirm
dialog (`src/ui/kits/kit-delete-dialog.tsx`: names the Kit, focus trap, `inert` on siblings, Escape cancels unless busy,
blocked during lifecycle review/execution). `KitStore.update` re-checks the Kit still exists inside the profile write
(`src/kits/kit-store.ts:106-108`). `syncKits` now hands back a shared in-flight task (`popup-host.tsx`).

Patterns for SO: none new.
- Delete confirm that says what stays (extensions keep their enabled state) — SO already does this style (Restart confirm,
  `#so-memory-undo`); modals are native `<dialog>` + `showModal()`, which gives the focus trap and inert for free, so their
  hand-rolled inert walk is not worth copying.
- Re-check existence inside the write — same as triage H16j / SO's run-token-before-each-write rule; nothing to add.
- Reused in-flight sync promise — triage R53 (SKIP) covers it; verdict unchanged.

Leads (newly indexed extensions, prose / post-processing / per-character voice): **none found.** The catalog is not in the
repo; Companion fetches it from tavernary.org at runtime. The only catalog data are synthetic test fixtures
(`vendor/tavernary-core/fixtures/catalog-*.json`, e.g. project "Alpha"), unchanged by this commit. Finding new prose
extensions needs a live browse of tavernary.org (network, out of scope for this brief).

## 2. ProbablyTooManyTabs (`probablytoomanytabs`)

meta: 1 commit `440143b` (0.13.1 → 0.13.2, 2026-10-19), 2 files, 6 lines · **GPL-3.0** · read: full diff · prior:
`docs/plans/v2.8/extension-research-2026-10-14/probablytoomanytabs.md`

What changed: `manifest.json` version bump; `palette-generator.js` raises `uiAlpha` 0.6 → 0.7 in all five palette profiles
(less transparent UI panels). Cosmetic. Nothing for SO; triage rows R45–R47, R75 unchanged.

## 3. Valkyrie Crusade rebuild (`valkyrie-crusade-rebuild`)

meta: 2 commits `ef56177`, `3b5aef5` ("Version 0.8", 2026-10-21) · read: full text diff · prior:
`docs/plans/v2.8/extension-research-2026-10-14/valkyrie-crusade-rebuild.md`

What changed: rebuilt Unity WebGL binaries (`game.data` 67→77 MB, `game.wasm` 25→26 MB, minified `game.loader.js` one
line) and `productVersion` "0.7" → "0.8" in `game/index.html`. No change to the ST-side `index.js`, so the prior anti-pattern
verdicts (triage R71–R73, SKIP) stand. Nothing for SO.
