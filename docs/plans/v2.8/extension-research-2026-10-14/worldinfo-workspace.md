# WorldInfo Workspace — 2026-10-14 harvest

meta: https://github.com/Alamion/SillyTavern-WorldInfo-Workspace · head `17cf883` (release 0.6.0; single commit in clone) · **MIT** (code reuse allowed, attribution) · read: `src/adapters/{worldInfoAdapter,syncEngine,saveGate,assistantApply}.ts`, `src/core/sync/{divergence,flatten}.ts`, `src/core/assistant/{undo,rules,validate,failures}.ts`, `AGENTS.md`, post · skimmed: picking controller, md sync · skipped: ui/, styles, images, markdown convention detail, specs/, `.specify/`, assets/locales · prior review: none (new repo; builds on WorldInfoDrawer + WREC, WREC reviewed in `docs/plans/v2.4/extension-research/world-info-recommender-wrec.md`)

## What it is / what changed
- Tree workspace (folders/entries/images) stored in `extensionSettings['WorldInfoWorkspace']`; any folder can be a "WI root" flattened into one native book.
- Workspace-authoritative sync: per-entry last-exported fingerprint, 1 s debounced push, flush on `GENERATION_STARTED`, silent merge of native-only changes, conflict banner when both sides changed.
- Two-way markdown folder sync (File System Access API; Obsidian vaults).
- AI assistant: tagged operation blocks -> proposals (create/edit/rename/move/delete), review + diff, accept per item or batch, batch undo that skips items edited since.
- Stale-tab protection for the settings namespace (`_save` marker + `/api/settings/get` check).
- Opt-in main-chat lore picking through `WORLDINFO_FORCE_ACTIVATE` (SO has this: `stHost/worldInfoActivate.ts`, `runtime/loreSelect.ts`).

## How it works
- Self-save detection by **reference identity**: ST caches the outbound payload uncloned (`cloneOnSet:false`, world-info.js:882) and `_save` emits `WORLDINFO_UPDATED(name, data)` with that same object (world-info.js:4160); they keep one outbound ref per book (`worldInfoAdapter.ts:62-73`) and drop the event when `data === getLastOutbound(name)` (`syncEngine.ts:576-582`).
- Clone handoff before save (`worldInfoAdapter.ts:121-126`): `structuredClone` so later mutation of the caller's object cannot alias the cache.
- Unsent-own-write: ST sets the cache BEFORE its fetch (world-info.js:4183), so after a network throw the cache serves the unsent write; they fingerprint it (`worldInfoAdapter.ts:128`, `:241-244`) and treat it as "retry, not a native change" (`syncEngine.ts:354-359`).
- Fresh read bypassing cache: `POST /api/worldinfo/get` with `cache:'no-cache'` (`worldInfoAdapter.ts:51-61`), used when a book is marked stale (other tab) (`syncEngine.ts:344-345`).
- Normalize on read (`worldInfoAdapter.ts:96-119`): entries from other tools lack newer fields; without filling defaults their fingerprints never settle and plan/refresh loops.
- Three-way push (`syncEngine.ts:366-411`): `planBoundImport` vs per-entry baseline hash -> refreshes/additions/deletions merged silently, conflicts block; "push anyway" bypasses conflicts only, never the merge.
- Publish-block (`syncEngine.ts:413-450`): any invalid entity blocks the whole book push; a book is never partially emptied.
- Proposal staleness (`rules.ts:147-163`): proposal carries `baseline {updatedAt, fingerprint over the fields it touches}`; changed/missing at apply -> `stale`, not applied.
- Destructive-edit rule (`rules.ts:30-55`): word-diff removes > half the content, or any key dropped -> destructive (extra confirmation).
- Batch undo (`undo.ts:46-73`, `:86-135`): reverse order; skip item with a reason when edited since (`updatedAt !== afterUpdatedAt`), deleted, folder gained children, parent gone; summary "Reverted N; M skipped (reasons)".
- Failure taxonomy (`failures.ts:10-30`): `thinking-only`, `truncated`, `empty`, `rate-limit`… each with one readable line; auto-retry only `rate-limit|network`, 2x at 10/30 s.
- Stale-tab gate (`saveGate.ts:13-28`): before each settings save read server copy; unchanged -> save with new marker; newer elsewhere + no local edits -> load; older -> write ours back; both changed -> hold pushes + banner.

## Patterns for SO

### P1. ST's WI save debounce is global: our immediate writes drop the author's pending editor save of another book — host-fact · World Info writes · absent · value 4 · effort S
- What: `saveWorldDebounced` is ONE `debounce` over all books (world-info.js:83, utils.js:574-584, keeps last args); `_save` starts with `cancelDebounce(saveWorldDebounced)` (world-info.js:4151-4153, utils.js:618-623). Any `saveWorldInfo(x, data, true)` cancels a pending debounced save of book Y. ST's own editor and `/setentryfield` save debounced (world-info.js:1337, 1444, 2491, 2680, 2989, 3029, 3061, …).
- Our state: every SO WI write is immediate (`stHost/worldInfo.ts:78-85`); the memory mirror writes per boundary (`runtime/memoryMirror.ts:138`), curator at boundaries, scan-gate normaliser in file mode. An author typing in ST's WI editor on book Y, within 1 s of a mirror write to book X, loses Y's server write; ST's cache keeps it, so it survives only until reload unless another edit re-saves Y. Not in `gotchas.md`.
- Their evidence: they discovered the cache/debounce coupling (`worldInfoAdapter.ts:121-141`) but do not guard cross-book cancel either.
- Sketch: in `saveLorebook`, after our `_save`, if ST's WI editor is open on a different book (`#world_editor_select` / editor-open state, verify selector) re-save that book from cache immediately (`loadWorldInfo` returns the cache clone holding the pending edit). Or narrower: record `input`/`change` on `#world_popup` and only re-save when one happened < 1 s before our write. Add a gotcha line + unit test with a fake debounce map. Verify live with an editor edit + forced mirror write.

### P2. Curator `rewrite` needs a content baseline (stale proposal) — pattern · stagecraft · partial · value 4 · effort S
- What: proposal stamps a fingerprint of the fields it touches when proposed; at apply, a mismatch = `stale`, back to review, never applied.
- Our state: `writeOp` reads live at the write edge and previews against live (`runtime/curatorWriter.ts:73-85`; `stagecraft/proposal.ts:65-70`). `patch` self-protects (anchor must still match). `rewrite` does not: in `review` mode a card can sit for turns; if the author edits the entry meanwhile, accept replaces it with LLM text written against the old content. Before-image makes it revertable, but silently. Revert side already does compare-and-set (`curatorWriter.ts:195-200`) — the write side lacks the mirror check.
- Sketch: record `seenHash` (hash of content shown to the curator, `stagecraft/digest.ts:53-55` already records `seen: "full"`) on rewrite ops; at write edge `hash(live.content) !== seenHash` -> status `stale` with "changed since proposed", card re-offered with fresh preview. No invariant conflict (tightens propose-only).

### P3. Destructive-rewrite guard in `auto` mode — pattern · stagecraft · absent · value 3 · effort S
- What: rewrite removing > 50% of words (word diff, not line diff) = destructive.
- Our state: `auto` accepts ops on `{{// so:auto}}` entries on the spot (`stagecraftCoordinator.test.ts:229-236`); no shrink check (`stagecraft/proposal.ts:65-70`, only length cap + partial-view refusal).
- Sketch: pure `isDestructiveRewrite(before, after)` in `stagecraft/`; in auto mode a destructive op drops to review; card shows "removes N% of this entry". Curator never touches keys, so the key half of their rule does not apply.

### P4. Read-modify-write from a possibly stale cache — pattern · World Info writes · partial · value 2 · effort S
- What: before writing, read the server file when the cache may predate another writer (other tab, another extension like this one in another tab).
- Our state: we load via cache (`stHost/worldInfo.ts:45-50`), patch one entry, write the WHOLE book (`:360-376`, `:399+`), then read the server back to detect a lost write (`:63-76`). A stale cache clobbers other entries changed elsewhere, and read-back cannot see that (our entry is intact).
- Sketch: in `updateWIEntryByUid`/`createWIEntry`, `readServerLorebook` first; if its fingerprint differs from the cache, evict cache, apply the patch to the server copy. One extra POST per curator op (rare). Skip for mirror writes (we own that book).

### P5. Batch undo with per-item skip reasons — pattern · Studio/wizard · partial · value 2 · effort M
- What: one "Undo this batch" for N applied agent edits, reverse order, skipping edits touched since, one summary line.
- Our state: Studio draft has a linear undo stack (`studio/draft.ts:33`, `:78`) and agent undo notes (`copilot/agent/loop.ts:172`); an `auto-draft` run interleaved with author edits can only be stepped back linearly. Curator rollback already does per-op skip (`curatorWriter.ts:195-200`, "externally-edited").
- Sketch: tag mutations with the agent turn id; undo-batch = inverse of that turn's mutations whose target paths were not mutated later. Only if owner finds auto-draft runs hard to back out.

### P6. Reply-failure vocabulary incl. `thinking-only` / `truncated` — pattern · model calls · present (mostly) · value 1 · effort S
- Theirs `failures.ts:14-28`. Ours: thought-only reply handling (`runtime/emptyReply.ts`, `thoughtLeak.ts`), model-role outage check. Only the "raise Response length" hint for wizard/Ask harness calls could be borrowed if our copy lacks it. Does not switch thinking off.

### P7. Stale-tab gate for install-wide settings — pattern · persistence · partial · value 2 · effort M
- What: settings namespace carries `{rev, writer, at, hash}`; check server copy on focus/visibility, before saves and every 2 min; newer -> load, older overwrote us -> write back, both -> banner.
- Our state: library saves are verified after the fact (`runtime/librarySave.ts:4-7`, `stHost/persistence.ts:297-318`); chat blob detects another tab's boundary (`runtime/chatIdentity.ts:41`). Nothing stops a second ST tab's `saveSettings` from reverting the library / wizard sessions / settings delta. One-user plugin, rarely two tabs: low value; note only.

## Host facts
- `saveWorldDebounced` is global across books and `_save` cancels it (P1). world-info.js:83, :4151-4153; utils.js:574-584, :618-623. Verified.
- `saveWorldInfo` sets the cache BEFORE the request, uncloned (`worldInfoCache` `cloneOnGet:true, cloneOnSet:false`, world-info.js:882, :4183). Caller must not mutate `data` after saving; after a network throw the cache holds the unsent write. Verified. SO's `saveLorebook` passes the `loadWorldInfo` clone and does not mutate after (ok).
- `_save` ignores the HTTP status and emits `WORLDINFO_UPDATED(name, data)` anyway (world-info.js:4155-4160). Already known (`stHost/worldInfo.ts:63`). Payload is the very object saved: reference equality identifies one's own save (useful for `runtime/worldInfoScanHost.ts:182` mirror watch if it ever needs to ignore self-saves).
- Entries written by other tools can lack newer fields; hash/compare only after normalizing defaults (their `worldInfoAdapter.ts:115-118`). Relevant if our normaliser/ledger ever fingerprints whole entries.
- `/api/worldinfo/get` with `cache:'no-cache'` is the only cache-free read (worldInfoCache cannot be bypassed via `loadWorldInfo`). SO already uses it (`stHost/worldInfo.ts:65-76`).

## Not worth taking
- Tree workspace / flattening folders into books: SO stories own their books; a second authoritative store would fight Studio and curator writes.
- Markdown two-way sync (FSA API): authoring lives in story JSON + campaign repo generators; not on Firefox/mobile.
- Lore picking via `WORLDINFO_FORCE_ACTIVATE` + interceptor: built (`runtime/loreSelect.ts`).
- Context preview with per-item reasons/costs: next-turn preview covers the play path (`runtime/nextTurn.ts`).
- BM25 near matches for dedup: we have vectors 0.82/0.55 + wording fallback (`stagecraft/createNearDup.ts`).
- Interop caveat, not a pattern: if the owner installs WIW and binds a story book as a WI root, its workspace-authoritative push rewrites the whole book and would treat curator writes as native changes (silent merge) or conflicts. No action unless installed.
