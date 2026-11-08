# WorldInfo Workspace — 2026-11-08 harvest

meta: https://github.com/Alamion/SillyTavern-WorldInfo-Workspace · `pre-refresh-2026-11-08..c7c0b02` (1 commit, 0.6.0 → 0.6.1,
42 files +2236/−108) · MIT · read: `src/adapters/{worldInfoAdapter,syncEngine,workspaceActions}.ts` diffs, `src/core/books/renameDraft.ts`,
`specs/010-lorebook-renaming/research.md`, spec 006 R13, CHANGELOG/AGENTS.md diffs · skipped: `dist/index.js` (rebuilt bundle), UI/SCSS,
browser tests · prior: `docs/plans/v2.8/extension-research-2026-10-14/worldinfo-workspace.md` (P1 global WI save debounce → built as
`stHost/worldInfoPending.ts`; P2/P3 curator baseline/destructive guard; K12 conditional writes in v2.8 69).

## What it is / what changed

Maintenance release: reliable lorebook rename (confirm on blur/Enter, identity rename is a no-op, sync records rekeyed, typed
outcome with a cleanup warning), "Lorebook" terminology, bounded mobile scroll windows in ported drawers. No sync-semantics change.

## How it works

- **Rename = save copy → rebind → delete old** (`worldInfoAdapter.ts:222-264`): refuse when the source is absent from `world_names`
  (a failed load is not proof of absence, research R7); resolve the free sanitized name; if it equals the old name, stop (saving and
  deleting the same file would delete the book, R2); save the copy, `updateWorldInfoList`, run the caller's rebind, then delete the old
  book. A failed delete after rebind keeps the new binding and returns a warning; no rollback, no retry (R8).
- **Identity rekey** (`syncEngine.ts:790-819`): per-entry sync records move from the old book name to the new one atomically with the
  folder binding; a binding that changed mid-rename aborts with the original kept.

## Patterns for SO

### P1. A renamed SO-owned book is lost, not followed — pattern + suspected defect · memory mirror · absent · value 2 · effort M
What: ST's own rename (`public/scripts/world-info.js:4192-4223`) and WIW's both save a copy and delete the old file; ST emits no rename
event and relinks only selections, char/persona lore and the **current** chat's `chat_metadata.world_info` (`:4232-4270`). Our state:
the mirror name is fixed in `extras.memory.wiBook` (`src/runtime/memoryMirror.ts:58-61`). After a rename, `ensureLorebook(owned.name)`
misses (`src/services/stHost/worldInfo.ts:233-249`), creates a fresh empty book under the old name, `adopting` resets `writes`
(`memoryMirror.ts:109-111`) and rewrites every live row there. The renamed copy keeps its live rows and its `so-owner` marker but no
longer matches `MIRROR_BOOK_PREFIX`, so the reaper may never offer it. File mode: the chat slot already points at the new name, so the
rebind reports a foreign-slot conflict. Story books (`requirements.lorebooks`, `stagecraft.lorebooks`) degrade into the missing-lorebook
Repair row, which is correct.
Sketch: on a mirror miss, before creating, look for a listed book whose `so-owner` marker names this chat id (the marker is already
written, `memoryMirror.ts:146-156`); adopt it (update `wiBook`, keep `writes`), journal "followed a renamed memory book". Bound the
search to books not matching any story's requirements; only on a miss, so no steady-state cost. Unit test with a fake host.

### P2. `lorebookFileId` diverges from the server's sanitizer — suspected defect · World Info names · partial · value 2 · effort S
The server files a book under `sanitize(name + ".json")` (ST `src/endpoints/worldinfo.js:151`, `node_modules/sanitize-filename`:
illegal chars, C0/C1, `^\.+$`, Windows reserved names, trailing dots/spaces of the whole string, 255-byte truncation). SO's mirror of it
(`src/utils/string.ts:17-22`) also **trims** the name, which the server does not (the `.json` suffix protects edge spaces): a requirement
named `" Foo "` maps to `Foo`, while `world_names` lists `" Foo "` → false "missing lorebook". It does not truncate: a name over ~250
bytes (only a very long story title in `mirrorLorebookName`) is listed truncated, `findLorebook` misses every sync, and
`createNewWorldInfo` (`world-info.js:4448-4463`, case-insensitive check against the sanitized name without `.json`) passes and writes
`{entries:{}}` onto the truncated file each time. Sketch: drop the `trim`, add the 255-byte cap on `name + ".json"` minus 5, reserved-name
and dot-only rules; unit test against the vendored rule list. Low likelihood; cheap.

### P3. A failed read is not absence — pattern · World Info writes · present
WIW R7: never treat a null load as "missing" before mutating. SO already keys existence on `world_names`, never `loadWorldInfo`
(architecture §World Info), and the lore plugin's conditional commit refuses on a base mismatch. Confirmation only.

## Host facts

- ST rename emits no event and is save-new + delete-old (`world-info.js:4208-4209`); relinks `chat_metadata.world_info` only for the
  open chat (`:4266-4269`), char extraBooks, persona lore, and asks before relinking primary character books. Other chats bound to the
  old name keep a dangling link.
- `createNewWorldInfo` compares case- and accent-insensitively against `world_names` (`utils.js:2483-2487`); non-interactive it refuses
  (returns false, warning toast) when a book differs only in case. SO's exact `findLorebook` then returns null from `ensureLorebook`.
- `updateWorldInfoList` keeps the old `world_names` when `/api/settings/get` answers non-OK (`world-info.js:2061-2083`) and throws only on
  a network error.

## Not worth taking

- Blur/Enter rename drafts, mobile virtual-list windowing, top-layer native dialog for the Lorebooks panel: UI; SO already uses native
  `<dialog>` for modals.
- Rename-session controller: SO never renames books.

## Security notes

- SECURITY.md: CLEAR. Bundle fetches are same-origin `/api/worldinfo/get|import|delete`, `/api/images/delete`; Playwright scripts target a
  local test ST. Nothing executed or built; read and `git log/diff/show` by absolute path only.
- `AGENTS.md`/spec docs are maintainer workflow notes ("AGENTS.md now maps all new modules"); no text addressed to a reviewer. Not acted on.
- Interop caveat stands (2026-10-14): binding a story book as a WIW root makes WIW's push authoritative over curator writes. And a WIW
  rename of an SO-owned book triggers P1.
- MIT; nothing above needs code.
