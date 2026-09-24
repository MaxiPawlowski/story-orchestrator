# ProbablyTooManyTabs (PTMT) — v2.4 review

meta: author IceFog (icefog72) · repo https://github.com/IceFog72/SillyTavern-ProbablyTooManyTabs · commit `799ee26` (2026-09-12, manifest 0.12.16) · 35 upvotes / 534 msgs · source available: y (`source/`, ~16k lines JS + 6.7k CSS). README says development is frozen.

## What it is
UI layout manager: turns ST into a multi-column, tabbed, resizable workspace by reparenting ST's own panels (`#sheld`, `#WorldInfo`, `#rm_extensions_block`, other extensions' drawers) into panes. Extras bolted on: layout presets + snapshot persistence, theme engine / palette generator, Dialogue Colorizer (quote tint from avatar colours), avatar↔expression sync, a message "rail" (dot per message for scroll navigation), and two status bars above the input: context-token breakdown and "which World Info entries fired this turn". No LLM calls, no prompt injection, no chat state.

## How it works
- Entry: IIFE registers `eventSource.on(APP_READY, initApp)` (`index.js:497-501`); `initApp` builds layout, publishes `window.ptmtTabs` API (`index.js:205-215, :485`).
- Manifest lifecycle hooks `activate/install/delete/enable/disable/update` → exported `onActivate…onUpdate` (`manifest.json:10-17`, `index.js:504-520`). `onDisable` tears down every subsystem; `onDelete` tears down + `delete extension_settings.PTMT` (`settings.js:576-579`); `onEnable` calls `location.reload()`.
- Panel adoption: `panelMappings` id→title/icon (`settings.js:82-111`); `createTabFromContent` moves node into a hidden staging area then a pane, title from mapping or `data-panel-title` (`tabs.js:324-349`). "Pending/ghost tabs": a MutationObserver re-adopts elements ST or another extension re-creates later (`pending-tabs.js:84-120, :208, :284`).
- Drawers inside tabs kept open with ST's own `.pinnedOpen` contract instead of fighting ST's auto-close handler (`misc-helpers.js:28-56`; ST honours it at `script.js:10960`, `:12184`).
- Host takeovers: moves `#bg1` into `#sheld` (`misc-helpers.js:107-115`), disables ST's `mobile-styles.css` reversibly (keeps node, sets `disabled` + `media="not all"`, restores recorded state on teardown — `st-mobile-styles.js:12-45`).
- Context status bar: on `MESSAGE_RECEIVED/SENT/CHAT_CHANGED/GENERATION_STOPPED` reads ST's `itemizedPrompts` for the last mesId, `itemizedParams()` → per-segment tokens (system/prompt/world/chat/anchors) vs `thisPrompt_max_context`, renders a proportional bar before `#form_sheld` (`context-status-bar.js:4, 9-103, 111-133`).
- WI status bar: `eventSource.on(WORLD_INFO_ACTIVATED, list => …)` groups activated entries by `entry.world`, shows strategy (constant/vectorized/normal), keys, `sticky` rounds, content tooltip; cleared only on `CHAT_CHANGED` (`context-status-bar.js:138-251, 273-274`).
- Message rail: DOM scan of `#chat > .mes` + MutationObserver + refresh on RENDERED/EDITED/DELETED/SWIPED/GENERATION_ENDED (`message-rail.js:48-64, 347-397`).
- Teardown discipline: every observer/listener goes through `trackObserver`/`trackListener`/`bindSource`, one multiplexed debounced body MutationObserver (`utils.js:294-313, 316-405`; `message-rail.js:18-28, 400-423`).
- Persistence: install-wide only (`extension_settings.PTMT`), layout snapshots versioned + migrated (`snapshot.js:577-595`). No chat_metadata, no swipe/edit semantics (nothing to roll back).

## Overlap with Story Orchestrator
- Prompt visibility: SO's next-turn preview (`src/runtime/nextTurn.ts:76`) is richer per-block (owner, depth, freshness, fallback) but reports `characters` only (`nextTurn.ts:24`) — no tokens, no share of the context window, no view of what ST's WI scan actually activated. PTMT shows the whole-prompt split and the fired WI list but knows nothing about why.
- Lore: SO forces judge-picked entries (`src/runtime/loreSelect.ts:31`, `src/services/stHost/worldInfoActivate.ts:18`) and replays checkpoint gated sets (`src/runtime/worldInfoGates.ts:12`); it never observes whether those entries reached the prompt. PTMT observes but does not act.
- Lifecycle: SO manifest has no `hooks` and no `minimum_client_version` (`manifest.json`); webpack emits a non-module bundle (`webpack.config.js:8-11`) that mounts UI at import (`src/index.tsx` tail, `mount()` on load). PTMT uses the full hook set.
- Layout/theme/colourizer/expressions: out of SO scope (baseline §4). Nothing to take.

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | WI activation evidence: record `WORLD_INFO_ACTIVATED` per generation, verify forced lore + gated checkpoint entries actually landed | host-integration | stagecraft / host | absent | 4 | M |
| 2 | Context footprint in next-turn preview: SO blocks in tokens + share of max context | enhancement | player-ui (author view) | partial | 3 | S |
| 3 | Manifest `disable` / `clean` hooks: release owned effects on disable; opt-in wipe of install-wide data | host-integration | host / persistence | absent | 3 | M |
| 4 | `minimum_client_version: "1.18.0"` in manifest | host-integration | host / release | absent | 2 | S |
| 5 | PTMT-aware reveal: HUD/Repair "open drawer" no-ops when our drawer lives in a PTMT tab | host-integration | player-ui | absent | 2 | S |
| 6 | Checkpoint rail / jump-to-transition from "recently" | ux | player-ui | absent | 2 | M |

**1. WI activation evidence.** What: subscribe (new `stHost` seam, event by constant key `WORLD_INFO_ACTIVATED`) and keep a per-generation ring `{uid, world, comment}`; LoreSelector compares its picks to it and records `forced-but-dropped`; the effect ledger / next-turn preview marks gated entries that were enabled but never fired; journal gets a `lore` event. Why it matters: `forceActivateEntries` answers `wrote({entries})` the moment it emits (`worldInfoActivate.ts:18-26`), but a forced entry still goes through the probability roll (`world-info.js:5043-5054`) and the WI budget (`:5059-5071`), and the force map is consumed by ANY `checkWorldInfo`, dry runs included (our own note, `worldInfoActivate.ts:16-17`). So "forced" is not evidence — the project rule "when a call's return value is not evidence, read the state that is". Theirs: `context-status-bar.js:244-247, 273`. Ours: grep `WORLD_INFO_ACTIVATED|world_info_activated` in `src/` = 0 hits. Traps: event fires only when `!isDryRun && size>0` (`world-info.js:900-903`), so "nothing fired" must be inferred by clearing on `GENERATION_STARTED` (PTMT's bar goes stale exactly here); quiet/impersonate generations also scan. Invariants: read-only observation, no write → fits 2/5/7; author-only display (9); ring must be chat-scoped + rollback-trimmed like other rings (11).

**2. Context footprint.** What: next-turn preview adds tokens per contributor (existing `countTokens` seam, `src/services/stHost/tokenizer.ts:3`; `src/runtime/entryTokens.ts` already wraps it) and a total vs the main API's max context, optionally beside ST's last itemized split. Theirs: `context-status-bar.js:43-99`. Ours: `nextTurn.ts:24` characters only; tier budgets exist (`src/memory/inject.ts:11` `tokenBudgets`) but the sum of all SO blocks is never shown. Do NOT call `itemizedParams`/`findItemizedPromptSet` per render: they re-tokenize every field and `findItemizedPromptSet` mutates module globals and `console.log`s per entry (`itemized-prompts.js:109-138, 228-245`). Author view only; fits.

**3. Lifecycle hooks.** What: `disable` → run the same leave path as a chat switch (effect-ledger compare-and-set restore, `src/runtime/effectLedger.ts:112`; release gated WI sets; clear extension prompts) so disabling SO mid-story does not leave AN text, disabled group members and gated entries behind; `clean` → delete `extensionSettings["story-orchestrator"]` (library, wizard sessions, settings) and REPORT (not delete) leftover `Story Orchestrator - … - <chatId>` mirror books. Theirs: `manifest.json:10-17`, `index.js:504-520`. Ours: manifest has no `hooks`. Constraints: ST imports the entry URL to call the export (`extensions.js:438-446`) — our bundle is not a module with exports (`webpack.config.js:8-11`) and mounts runtime + UI at import, so a hook on a disabled SO would boot it; needs `output.library.type: "module"` + side-effect-free hook path. 5 s race, errors swallowed (`extensions.js:447-465`), page reloads right after (`:490-500`). Writes must take RunTokens (10) and save evidence cannot be awaited past reload (17) → hook must be best-effort and the next hydrate's `reconcileLedger` stays the real guard. Value capped at 3 because hydrate reconcile already heals on re-enable.

**4. `minimum_client_version`.** README declares 1.18.0 the older host and says "not tested on other versions" (`README.md:57-78`); ST refuses to load below the declared version and lists it in `extensionLoadErrors` (`extensions.js:580-590, 658-660`). Turns an unexplained seam failure into ST's own message. Release test could assert manifest field == README row. Fits.

**5. PTMT-aware reveal.** If a user maps `#drawer-manager` into a PTMT tab, PTMT pins it `.openDrawer.pinnedOpen` (`misc-helpers.js:34-56`); our `openSoDrawer` checks `classList.contains("openDrawer")` and does nothing (`src/index.tsx` `openSoDrawer`), so the HUD chip / "open drawer" silently fail while the tab may be collapsed. Fix: capability-probe `window.ptmtTabs` in a new `stHost/thirdParty` seam, `openTab(panelId)` when our content sits in `.ptmt-panel-content`; set `data-panel-title="Story"` on the content so PTMT names it (`tabs.js:348`). Unverified live; only matters for PTMT users (popular: 534 msgs). Fits (host access stays in `stHost`).

**6. Checkpoint rail.** Rail-of-dots pattern (`message-rail.js:48-64`) applied to SO: boundary logs already hold `lastMessageId` per transition; the Overview "recently" could link each past checkpoint name to its message (scroll to `.mes[mesid]`). Player-safe if only past checkpoints (9). Grep `mesid|scrollToMessage` in `src/` = 0. New DOM surface → must be its own scoped mount root (19); nice-to-have, low.

## Patterns to copy / anti-patterns to avoid
Copy:
- Reversible host mutation: record prior state, keep the node, restore exactly that on teardown (`st-mobile-styles.js:12-45`) — same shape as our compare-and-set restore; apply to any future host CSS/DOM tweak.
- Tracked teardown registry: every `eventSource.on`/listener/observer through one helper so disable is complete (`message-rail.js:18-28, 400-423`, `utils.js:294-313`). Our `subscribeToHostEvents` would need this if idea 3 lands.
- Use ST's `.pinnedOpen` contract rather than fighting ST's global auto-close (`misc-helpers.js:28-33`).
Avoid:
- `onDelete` wiping settings unconditionally (`settings.js:576-579`): ST has a separate opt-in `clean` hook, run only when the user asks (`extensions.js:1560-1568`). Wipe in `clean`, never `delete`.
- `onEnable` calling `location.reload()` inside the hook (`index.js:512-514`): ST runs it BEFORE removing the name from `disabledExtensions` and saving (`extensions.js:473-477`) — a race with the save (not verified live).
- Reparenting host-owned DOM (`#sheld`, `#bg1`, `#form_sheld` inside panes) — breaks every other extension's position assumptions; PTMT then needs per-extension shims (`positionAnchor.js:20` hard-codes `stqrd--`/`stwid--`).
- Status derived from an event that never fires for the empty case (WI bar stale after a turn with no activations).
- `innerHTML = ''` full rebuild per update (`context-status-bar.js:64, 185`) — fine for them, our React snapshot model already avoids it.

## ST host facts learned
- `WORLD_INFO_ACTIVATED` payload = `Array` of activated entry objects (fields used: `world`, `uid`, `key`, `comment`, `content`, `constant`, `vectorized`, `sticky`); emitted only when not dry run AND ≥1 entry (`world-info.js:900-903`; `entry.world` set at `:1473`, `:1522`; consumer `context-status-bar.js:216-231`).
- Externally forced entries (`WORLDINFO_FORCE_ACTIVATE`) are still subject to probability and WI budget (`world-info.js:4885-4888`, `:5043-5054`, `:5059-5071`). Consistent with, and sharper than, our note that the force map is cleared by any scan.
- `itemizedPrompts`, `itemizedParams`, `findItemizedPromptSet` are exported from `public/scripts/itemized-prompts.js:16, :109, :228`; params include `worldInfoStringTokens`, `chatInjects` (all depth injections, not only ours), `thisPrompt_max_context`; `itemizedParams` tokenizes every field per call; `findItemizedPromptSet` has side effects + per-item `console.log` (`:228-245`).
- Manifest `hooks` names: `install|update|delete|clean|enable|disable|activate` (`extensions.js:385`); `callExtensionHook` does `import(url)` of `manifest.js` and calls the named export, 5000 ms race, errors caught (`:406-466`); `activate` runs after the script loads (`:637`); `clean` precedes `delete` only when requested (`:1560-1568`); disable/enable hooks run before the setting is saved and the page reloads (`:473-500`).
- `minimum_client_version` blocks activation with a visible load error (`extensions.js:580-590, :658-660`).
- ST's global drawer auto-close skips `.pinnedOpen` (`script.js:10960`, `:12184`).
- No contradiction with our gotchas found.

## Verdict
Relevance **low** (UI layout tool, no story/LLM logic). The one thing worth taking: **observe `WORLD_INFO_ACTIVATED` as evidence** that forced lore and gated checkpoint entries actually reached the prompt — today both report success on emit/enable while ST may drop them to probability, budget or a dry-run scan. Secondary cheap wins: `minimum_client_version`, token footprint in the next-turn preview.
