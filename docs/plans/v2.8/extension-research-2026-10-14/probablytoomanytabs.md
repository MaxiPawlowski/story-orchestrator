# ProbablyTooManyTabs (PTMT) — 2026-10-14 harvest

meta: https://github.com/IceFog72/SillyTavern-ProbablyTooManyTabs · `pre-refresh-2026-10-14` (799ee26, 0.12.16) .. HEAD `4309420` (0.13.1, 4 commits, 24 files) · **GPL-3.0** (ideas only, no code) · read: full diff, `reload-checkpoint.js`, `startup-screen.js`, `index.js` entry, `settings.js` update, `snapshot.js` restore, `LayoutManager.js`/`SettingsPanel.js` editor render; skipped: CSS (450+211 lines of styling), gradient editor/colorizer UI, theme-engine wallpaper tint · prior review: `docs/plans/v2.4/extension-research/probablytoomanytabs.md`

## What it is / what changed
Same UI layout manager (reparents ST panels into tabbed panes). Dev "paused" (CHANGELOG top). New since 799ee26:
- Tab-local reload checkpoint (sessionStorage) so a reload during a pending settings save keeps the last state.
- Startup cover ("Loading layout…") with 30 s failsafe, cleared in `finally` after two rAFs.
- `settings.update` skips unchanged scalars; `SETTINGS_CHANGED` carries `changed` keys, handlers touch only affected UI.
- Layout editor render deferred while hidden, coalesced into one rAF, ResizeObserver re-renders when it becomes visible.
- Snapshot restore: disposes pane observers/resizers of discarded wrappers, extracts preserved nodes first.
- Browser `theme-color` meta tinted from wallpaper; message rail fixed left; colorizer polish. Removed "optimize long chat" (content-visibility CSS).

Prior-review status in SO: idea 1 (WI activation evidence) built (`src/services/stHost/worldInfoEvidence.ts`, `PayloadTab.tsx`); idea 2 (tokens in next-turn preview) built (`src/runtime/nextTurn.ts:18,33,122,161`); idea 4 (`minimum_client_version`) built (`manifest.json`); idea 3 (manifest `hooks`) still absent; idea 5 mostly moot (see P4); idea 6 partial (`jumpToMessage`, `src/index.tsx:317-324`).

## How it works
- Reload checkpoint: `pagehide` → `captureReloadCheckpoint` writes `{version, settings: {...extension_settings.PTMT, layout}, theme, appearance, background}` to `sessionStorage["ptmt:reload:<userHandle>"]` (`reload-checkpoint.js:8-27`, `index.js:516-517`). Boot: read + remove key, apply only if `performance.getEntriesByType('navigation')[0].type === 'reload'` and version matches, then `settings.save()` (`reload-checkpoint.js:29-48`, `index.js:509`). Skipped while hydrating/resetting (`:13`). No network in unload.
- Startup screen: shown before `APP_READY` (`index.js:535`), `finishStartupScreen()` in `finally` of `initApp` (`:528`), double rAF so the built layout paints first, 30 s timeout (`startup-screen.js:5-31`); removed on disable/delete.
- Unchanged-skip: `if ((value === null || typeof value !== 'object') && Object.is(this.get(key), value)) continue;` (`settings.js:541-544`); objects always count as changed.
- Hidden-render deferral: `scheduleEditorRender` sets dirty, one rAF, renders only if `getClientRects().length` (`LayoutManager.js:36-43`); ResizeObserver on the panel flushes dirty when shown (`SettingsPanel.js:447-452`).

## Patterns for SO

### P1. Settings write lost to a reload inside ST's 1 s debounce — host-fact + pattern · settings/persistence · absent · value 3 · effort S
What: ST's `saveSettingsDebounced` is a plain 1000 ms debounce with no flush (`SillyTavern public/scripts/utils.js:574-584`, `script.js:466,470`); `beforeunload` guards only `isChatSaving` and an open message edit (`script.js:12593-12598`). A setting toggled <1 s before reload/close never reaches the server. PTMT stashes the final state in sessionStorage on `pagehide` and replays it only on a true reload (`reload-checkpoint.js:11-48`).
Ours: every install-wide write goes `writeSettings` → `recordSettingsWrite(...)` → `saveSettingsDebounced()` (`src/runtime/settingsStore.ts:30-38`). The evidence (`confirmSettingsWrite`, `:21-27`) lives in page memory, so a reload drops both the write and the evidence of losing it: silent revert of a Defaults/Interface/Connections change. Device prefs are localStorage (`src/runtime/featureSettingsHost.ts:5-8`), so unaffected. Harness: `st-session reload` right after a harness settings write has the same race (gotchas already route harness writes through `saveSettingsNow`; product UI does not).
Fit: no invariant conflict; install-wide home stays `extensionSettings`. Sketch: in `settingsStore`, track `pendingSeq > confirmedSeq`; on `pagehide` (new `stHost` listener, ui teardown registry) stash `{handle, delta, seq}` in sessionStorage; at boot, if nav type is `reload` and the server-held delta differs, re-apply once via `writeSettings` and add a `saveHealth` note ("restored a settings change the reload interrupted"). Simpler alternative: warn via ST's `beforeunload` `preventDefault` while a settings write is unconfirmed (mirrors ST's own chat-save guard; costs a browser prompt). Test-idea: jest over the stash/replay with a fake storage + nav type.

### P2. Skip unchanged writes; carry changed keys — pattern · settings · absent · value 2 · effort S
Theirs: `settings.js:541-544` + `changed` set consumed in `index.js` `handleSettingsChanged`. Ours: `setGlobalSettings` always rebuilds, writes, schedules a save and an evidence watcher (`settingsStore.ts:46-60` → `:30-38`), even when the patch equals current (a settings row clicked to its current value, `settingsControl.ts:57-112` callers). Cheap guard: compare `JSON.stringify(globalSettingsDelta(next))` with the stored delta; return early. Fewer evidence rows, fewer `POST /api/settings/save`. Note the delta store already drops values equal to defaults, so this only adds the no-op short-circuit.

### P3. Manifest lifecycle hooks — feature · host · absent (unchanged since v2.4 idea 3) · value 2 · effort M
PTMT now also clears its startup cover in `onDisable`/`onDelete` (`index.js` exports). Nothing new; constraints in the prior review stand (our bundle is not an ES module with exports, `webpack.config.js`).

### P4. PTMT users: Extensions-drawer reveal no-ops when pinned in a tab — host-integration · player-ui · absent · value 1 · effort S
`openSoDrawer` now opens the workspace (`src/index.tsx:326`), a native `<dialog>` in the top layer, so PTMT reparenting no longer affects the main entry (prior idea 5 moot). Remaining: `openExtensionsDrawer` returns early when `#rm_extensions_block` already has `openDrawer` (`src/index.tsx:331-335`) — PTMT keeps adopted drawers `.openDrawer.pinnedOpen` while the tab may be inactive, and `openInlinePanel`'s `offsetParent === null` check (`:337-340`) then clicks a hidden toggle. Only matters if the settings launcher path is still used; could be a `extensionConflicts.ts` row (`src/services/stHost/extensionConflicts.ts:48-50`) rather than code.

## Host facts
- `saveSettingsDebounced` = `debounce(saveSettings, DEFAULT_SAVE_EDIT_TIMEOUT)`, `debounce_timeout.relaxed` = 1000 ms (`script.js:466,470`; `scripts/constants.js:14`); ST's `debounce` has no flush/cancel API (`utils.js:574-584`). Verified.
- `beforeunload` blocks only `isChatSaving || this_edit_mes_id >= 0` (`script.js:12593-12598`); pending settings saves are not guarded. Verified.
- `performance.getEntriesByType('navigation')[0].type === 'reload'` distinguishes reload from fresh open / tab restore; sessionStorage survives reload in the same tab only (PTMT relies on it, `reload-checkpoint.js:34`).
- ST maintains `<meta name="theme-color">` and may rewrite it after extensions init (PTMT observes it, `theme-engine.js` init). Not relevant to SO.

## Not worth taking
- Startup cover: SO mounts nothing that reflows the host layout; a cover would hide ST for SO's sake.
- Hidden-render deferral/rAF coalescing: our hosts return null when closed (`src/index.tsx:206-207,299-300`), React batches `notify()` fan-out (`runtimeManager.ts:166-171`); no measured cost.
- Snapshot-restore disposal, wallpaper browser tint, message-rail centering, colorizer/gradient editor: layout/theme scope, nothing for SO.
- Removed content-visibility long-chat CSS: they dropped it for scroll jumps; confirms not to try it on `#chat`.
