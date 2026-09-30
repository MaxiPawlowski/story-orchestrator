# Plan 01 — World Info: scan-time gating (build)

**Status: DRAFT 2026-09-25 — awaits user approval.** This is the build plan the T13 spike owed on PASS
(`docs/plans/v2.4/05-t13-spike-report.md:4,42-43`), called `05b-wi-scan-gating.md` there. It depends on
the v2.4 entry condition (overview V1). It runs in parallel with plan 02, because they touch different
subsystems. Verified against master `1ad1a5f` (v2.4 plans 06/08 merged as `3dd039b`) on
2026-09-25. **Re-verify every path:line below before building** (v2.4 rule 1).

**Reconciled 2026-09-25 with v2.4 E9** (never released, no downgrade work): the downgrade leg (G6) is dropped, and W1/W3 no
longer rest on downgrade safety. Their shapes stand for their other reason (W1 extends a key rather than replacing it, W3
keeps the value S1–S8 measured), and plan 11's `schema: 1` stamp is the baseline for any later reshape. It now runs after
plan 11 (overview sequence).

## Goal

Checkpoint `world_info` stops being written into shared lorebook files per chat. Each scan gets a view derived
from the chat's path instead:
- gated entries **rest off** in their files (normalised once);
- the story that owns the chat switches its entries on inside the scan's per-call copies (`05-H2/H3`);
- a no-story chat, another story's chat, and a disabled extension all see the resting state.

The spike measured this end state on marker books (S1–S9). This plan makes it the production path on the
user's real books, behind an author confirm.

## What the spike proved, and what it did not

| Proven (record) | Not proven, owned here |
|---|---|
| S1 no leak to a no-story chat, another story's chat, or with SO disabled (spike report `:17`) | Normalisation of **real** books. The spike's normaliser only touches `SO-T13` books (`worldInfoNormalize.ts:12-14`, `worldInfoScanHost.ts:63`) |
| S2 per-chat sets == `worldInfoPlan`, 0 `/api/worldinfo/edit` during switches (`:18`) | A normalisation ledger that drifts from the files. `known` entries are never re-read (`worldInfoNormalize.ts:54-56`), so an entry re-enabled by hand in the ST editor leaks with SO disabled (S1c no longer holds for it) |
| S3 one-time normalisation, byte-identical non-gated entries (`:19`) | Activation before normalisation. Today the probe turns scan gating on and **then** normalises (`worldInfoScanHost.ts:86-89`); in between, a gated entry whose copy lacks a `disable` key cannot be turned off (`scanGatePlan.ts:72-77`, counted as `missingKey`, never surfaced) |
| S4 vectors still works, calls ≤ file path (`:20`) | A real-book ledger (below) |
| S5 author table matches the scan view (`:21`) | A settings control, a Repair row, a capability row. `wiScanGating` is spike-local, kept out of `CAPABILITY_IDS` (`05-world-info.md:325`) |
| S6 file-path fallback enables from rest-off (`:22`) | An author who toggles a gated entry in ST's editor and sees nothing change |
| S7 lore-select and forces respect the view (`:23`) | Story removal: its entries stay off at rest, and nothing can restore them |
| S8 p95 2.5 ms over 500 entries (`:24`) | 1.18.0 live: `05-H5` (sticky hash across the switch) is static only (`host-facts.md:143`) |
| S9 sticky survives the switch, no loss (`:25`) | The chat-switch save race seen in spike run A (`:33`), owned by plan 02 |

## Scope / out of scope

In scope:
- Production normalisation of every library story's gated set, behind a confirm.
- The ledger: verify it against the files, record provenance, restore on request.
- The ordering fix (normalise, then activate), `missingKey` surfaced.
- The mode control, capability row, Repair rows, author diagnostics.
- The invariant 14 rewording (`.claude/rules/architecture.md:109`), applied when this ships.

Out of scope, with where each goes:
- The unbound mirror, requirements satisfied by bound books, member-scoped lore, per-tier `scan:true`, and
  lore-select "exclusive" mode (`05-world-info.md:32-40`; SUMMARY `:195,200-201`): overview plan 08. They ride
  this seam, so they wait for it.
- Mirror key hygiene: unmeasurable in v2.4 (`05-world-info.md:398-400`); overview plan 08.
- Removing the file path (question Q3; the recommendation is to keep it).

## Verified current state (2026-09-25)

| Claim | Seen | Note |
|---|---|---|
| Mode flag | `settingsStore.ts:29-45`: `gatingMode: "file" \| "scan"`, default `file`; `normalized: Record<book, string[]>` | `sanitizeWorldInfoSettings` rebuilds `{gatingMode, normalized}` only (`:40-43`), so any new key such as `normalizedFrom` is dropped unless the sanitizer is extended |
| Start-up | `runtime/index.ts:211-226` starts `startScanGating` after `settingsReady()`; the flag is read once (`worldInfoScanHost.ts:37`) | a mode change needs a reload today |
| Activation order | `worldInfoScanHost.ts:86-89`: probe → `setScanGatingActive(present)` → `normalize()` | the ordering gap above |
| Provider scope | `worldInfoScanHost.ts:42-51` gates **every** library story; only the normaliser is marker-filtered (`:62-63`) | so turning `scan` on gates real books with whatever ledger exists |
| Owner guard | `worldInfoScan.ts:32-41`: story ∧ `chatId === ownedChat` ∧ requirements ready, else no-story | matches the spike design |
| Compare-and-set | `scanGatePlan.ts:72-89`: on → `disable=false` only when the ledger says the entry rests off; otherwise `keptForeign` | a gated-on entry that rests off but is missing from the ledger stays off |
| Never adds keys | `scanGatePlan.ts:73-74` (`missingKey`) | `05-H5`: adding a key changes the timed-effects hash |
| File path skipped while active | `effectsApplier.ts:232` (apply), `:283` (release) | the S6 fallback is the same code with the flag false |
| Growth | `worldInfoScanHost.ts:85` re-normalises on every settings write (`onSettingsWrite`) | the library save is a settings write |
| Author table | `DrawerTabs.tsx:669-707` `ScanGateTable`, `snapshotBuilder.ts:166` | author-only, S5 |
| Invariant | `.claude/rules/architecture.md:109` (path replay + release; spike note appended) | reworded by this plan |

## Host facts

Every row is `docs/plans/v2.4/host-facts.md` §Plan 05 (`05-H1`..`H17`, `:125-141`). This plan adds no new host
behaviour. It re-reads these rows on the then-current tree before building (step 0):

| Row | Why this plan depends on it |
|---|---|
| 05-H2/H3 | the event and the per-call copies the view is written into |
| 05-H4 | sort order after the event: "first entry carrying a comment" is the file path's entry |
| 05-H5 | never add a key; the 1.18.0 live re-check is a gate here (G7) |
| 05-H6 | a disabled copy is skipped before the force check (S7) |
| 05-H9 | the CHAT_CHANGED pre-cache scan runs before our hydrate, so it must read as no-story |
| 05-H10 | vectors reads the view, not the file (S4) |
| 05-H11 | listener order is not durable; re-assert per generation, compare-and-set |
| 05-H12/H16 | the lorebook write and list helpers the normaliser and the harness use |

New rows owed if the build touches them: the ST WI editor's read of a book (it shows file state, which is the
point of resting off), and whatever event a mode switch without reload needs.

## Design

### A. Normalisation of real books (confirm first)
- **What it writes:** `disable: true` on each entry of each library story's gated set (`gatedWorldInfo`), in books
  listed in `world_names`. Nothing outside a gated set is written (S3's byte-identical diff is the gate).
- **When:** only after the author confirms a popup that names the books, the entry count per book, and one
  sentence of consequence: *"These entries will rest off. Story Orchestrator switches them on per chat; with the
  extension off they stay off."* The confirm is the mode switch. Cancel leaves `file` mode.
- **Growth:** after the first confirm, a gated set that grows through the author's **own** Studio save or import is
  normalised without a second modal, with a toast and a journal line naming the entries. This follows the one
  automatic library→chat path, the author's own save (`.claude/rules/architecture.md`, invariant "One automatic
  library→chat path").
- **Order fix:** at start-up in `scan` mode, verify and normalise first, then call `setScanGatingActive(true)`.
  A scan before that point runs the file path.
- **Write edge:** each book write is a typed `WriteResult` with read-back, and a `RunToken` check before it, as
  the spike normaliser already does (`worldInfoNormalize.ts:60-76`). Only confirmed writes enter the ledger.

### B. The ledger
- **Keep the shape** `normalized: Record<book, string[]>` (one ledger shape, no reshape). Add provenance as a new key,
  `normalizedFrom: Record<book, {comment, wasOn}[]>`, and extend `sanitizeWorldInfoSettings` (`settingsStore.ts`) to keep
  it. Any later reshape bumps plan 11's `schema: 1`.
- **Verify, never trust:** at start-up and on each library change, read each ledger book and compare. An entry the
  ledger holds that the file shows enabled means **drift** (hand edit, re-import, or a book re-created). Drift is
  a Repair row, *"A story lorebook entry was switched on outside the story; it will show in chats without the
  story"*, with one action: re-normalise that entry. Reads only; the write needs the click.
- **`missingKey` on an owned scan** (a gated entry that cannot be turned off) is journaled once per entry and
  raises the same Repair row. After normalisation it must be 0; the S1 gate re-runs with it asserted.

### C. Mode control and capability
- The settings panel gains a "Lorebook gating" row: `Per chat (scan)` / `File writes`, the ledger summary, and the
  drift count. Switching to scan opens the confirm in A. Switching back to file asks nothing: the file path enables
  from rest-off (S6), and the current chat's path is applied at once.
- `wiScanGating` moves into `CAPABILITY_IDS`. `absent`/`error` keeps the file path and says why in the capability
  read-out. The capability row wording avoids the words "spike" and "T13".
- A mode switch takes effect without a reload (today `startScanGating` reads the flag once, `worldInfoScanHost.ts:37`).

### D. Author legibility
- ST's WI editor shows gated entries as disabled. The author table (`#so-scan-gate`) already shows effective
  state. It gains a "gated by `<story title>`" column, and a Studio diagnostic in the story's world-info editor
  says the entries rest off.
- An entry toggled on by hand in ST's editor is caught by B's drift check, so the author learns why a no-story chat
  no longer sees it off.

### E. Story removal
- Removing a story from the library leaves its entries off at rest, which is what today's release leaves
  (`storySelection.ts:28`). The library removal dialog offers **"Restore these lorebook entries"**, which
  re-enables only the entries whose `normalizedFrom` says `wasOn: true` and that no remaining story gates. It is
  never automatic.

### F. Invariant 14, reworded when this ships
> Checkpoint `world_info` is a per-scan view derived from the chat's path; gated entries rest off in their files;
> the file path (path replay + release) is the capability fallback and the `file` mode.

The path-replay semantics are unchanged: `scanGatePlan` = `worldInfoPlan ∪ releasePlan` (`scanGatePlan.ts:24-37`),
and the 300-seed property test pins it.

### Invariants touched
14 (reworded), 2 (no new host module unless step 0 finds one), 10 (`RunToken` before each normaliser write),
13 (install-wide home for mode and ledger), 16/17 (typed writes, read-back), 6 (the curator scope still excludes
gated entries), 9 (the author table and diagnostics stay author-only), 20 (real-LLM live evidence).

## Decisions taken in this draft (on evidence; the user can overturn any)

| # | Decision | Evidence |
|---|---|---|
| W1 | Keep the `normalized` key shape; add `normalizedFrom` | extending the key keeps one ledger shape for every reader (`settingsStore.ts:40-43` keeps only string arrays today), and plan 11's `schema: 1` stamp is the baseline any later reshape bumps; no downgrade reader exists (E9) |
| W2 | Normalise, then activate | `missingKey` leaks by construction before normalisation (`scanGatePlan.ts:73-74`) |
| W3 | Keep `gatingMode: "scan"` as the stored value | it is the value the spike handler (`worldInfoScanHost.ts:42-51`) was measured under in S1–S8, so the build ships what was measured |
| W4 | No write-ahead row for the normaliser | a crash between the file write and the ledger save leaves the entry off at rest and outside the ledger; the next run records it through the `alreadyOff` branch (`worldInfoNormalize.ts:72-76`). The interval shows the entry off where the path says on; this is stated as a risk, not hidden |
| W5 | Growth through the author's own save needs no second modal | the author's save is already the one automatic library→chat path (architecture invariant) |

## Order of work
0. Re-read the `05-H*` rows used above on the current tree (1.19.0 and, statically, 1.18.0). Correct any drifted row
   in `docs/plans/v2.4/host-facts.md` with the date, or start a `v2.5/host-facts.md` if the overview decides so.
1. Red first (jest): the ledger drift read, the `normalizedFrom` round trip through the current (extended) `sanitizeWorldInfoSettings`, the
   activation order (a scan between probe and normalisation), `missingKey` surfaced, restore-on-removal,
   the mode switch without reload.
2. Ledger verify and Repair row (read-only; no writes).
3. The production normaliser: lift the `spikeBook` filter behind the confirm; the book list comes from the library.
4. Ordering fix and live mode switch.
5. Settings control, capability row, author diagnostics, removal restore.
6. Invariant 14 rewording, `.claude/CLAUDE.md` / `.claude/rules/*` lines that describe gated WI, the gotcha that
   says the spike is behind the flag.
7. Live gates G1–G8, then the gate record.

## Tests and gates

**Jest.** The cases in step 1, plus:
- `scanGatePlan.test.ts` property test re-run over the real shipped stories (sun-ruins, Adolion academy and
  adventurer) as a fixed seed, not only generated libraries.
- The normaliser writes nothing outside the gated set (fake book with non-gated neighbours, JSON diff).

**Mutation checks** (recorded in `test/findings/mutations/v25-01.txt`; deleting the line must fail its own case):
the drift comparison, the order guard, the `missingKey` journal, the `wasOn` filter in restore, the confirm gate
before the first write, the `RunToken` check in the normaliser.

**Census.** The normaliser's `checked` row is re-keyed if it moves; the ledger verifier is read-only (no row).
A fault-matrix row for the normaliser (`wiNormalize`), with `aborted` and `hostDeletes` columns filled.

**Live gates** (real LLM, lane copies of the real install, run-header capture/diff around every batch, `--strict`,
twice consecutive where marked). A lane's data root is a copy (`.claude/rules/debug-scripts.md`, Parallel lanes), so
normalising the lane's real-named books damages nothing real. **No gate normalises books on the user's live install.**

| # | Gate | Pass (predeclared, not retuned) |
|---|---|---|
| G1 | S1 (a/b/c) re-run over the lane's **real** library books after a confirmed normalisation, `missingKey` asserted 0 | 0 gated entries of a non-owning story in any scan view or ring; ×2 |
| G2 | S3 over the real library: first run flips exactly the gated set, second run writes 0, non-gated entries byte-identical | exact; ×2 |
| G3 | J7 (sun-ruins, the gated-WI journey) in scan mode | green ×2 strict |
| G4 | J3 in scan mode, J7 in file mode (regression of the fallback) | J3 ×2, J7 ×1, strict |
| G5 | Drift: hand-enable a normalised entry through ST's API, reload | the Repair row appears on start-up; with SO disabled the entry is the only leak, and re-normalise clears it; ×2 |
| ~~G6~~ | ~~Downgrade leg~~ — dropped by v2.4 E9 | — |
| G7 | Clean host at each ST version the README claims (overview V10): `05-H5` sticky across the switch, live | stays active across the switch; if a one-time loss is accepted instead, the user-visible state and the recovery action are predeclared here before the run, and a recurrence fails (Sol PR-10) |
| G8 | S8 cost over the lane's real library plus the 500-entry bulk book | ≤ 5 ms p95 over 50 scans incl. dry |

**Machine gates:** typecheck, typecheck:test, lint, test, debug:typecheck, build, test:release, test:debug,
Storybook runner (settings row + author table stories), then `st-session.mts reload`.

**Records:** `test/journeys/records/v2.5-plan01/live-<bundle12>/`.

## Risks
- **Real-book writes are the first install-wide lorebook change outside a chat's own path.** Mitigated by the confirm,
  the gated-set-only diff (G2), the typed read-back, and the restore on removal. Residual: an author who shares a book
  with a non-SO workflow sees those entries off at rest. That is the design, and the confirm says so.
- **Listener order** (`05-H11`): a later `.on` from another extension runs after our "last" listener. Compare-and-set
  plus the per-generation re-assert is the mitigation, as in the spike.
- **Ledger/file interval** (W4): stated above.
- **Other extensions that read files directly** (`loadWorldInfo`, not `getSortedEntries`) see rest-off state. Vectors
  reads the view (`05-H10`). Any other reader is found by the interop corpus, not assumed.
- **Shared-browser collisions** during lane runs (gotchas): pin the group, diff run headers.
- **Plan 02's save race** can wedge a lane page mid-gate, as in spike run A (`05-t13-spike-report.md:33`). The
  harness waits already in place stay. A wedge is neither a pass nor a waived attempt: the affected series re-runs in full on a stable lane after 02 C2 closes (overview sequence, Sol PR-09).

## Unresolved questions (the user's)
- **Q1** Approve normalising real library books behind the confirm in A? Without it, this plan stops at step 2
  (ledger verify only) and `file` stays the only production path.
- **Q2** Default for installs that never open the setting: stay `file` until the author confirms (recommended; the
  confirm is the switch), or prompt once via a Repair suggestion when a story with gated WI is first loaded?
- **Q3** File path: keep as fallback and as `file` mode (recommended: S6 proved it enables from rest-off, and it is
  what `absent`/`error` needs), or remove it after one release?
- **Q4** Removal restore (E): offered in the removal dialog (recommended), or not offered at all?

## Gate record (code items)

**2026-09-26, branch `worktree-agent-ae193d3557c84c1ed` (from master `13b76f8`, master `8baa65e` merged in as `fe9e049`). Code items only. Nothing ran live: no lane, no main ST, nothing under `C:\dev\so-lanes`.** Every item whose proof is deterministic is built. The live gates G1–G8 have fixtures and commands (below) and are **pending**. Their sign-off also waits for plan 02 C2's attribution of the save race (overview sequence).

### Decisions this build took (U1 is still the user's; each is the plan's recommendation)

| Q | Taken | Where |
|---|---|---|
| Q1 | Normalise real library books, **only behind the author's confirm**. The spike's `SO-T13` marker filter is gone. | `worldInfoGating.ts` `requestScan` |
| Q2 | **Default stays `file`.** Scan mode is written only by the confirm. An install that never opens the setting is never normalised. No judge default was touched. | `settingsStore.ts` `defaultWorldInfoSettings` |
| Q3 | **The file path is kept**: as `file` mode, and as the fallback when `wiScanGating` is `absent`/`error`. | `effectsApplier.ts` `replayWorldInfoFiles` |
| Q4 | Restore is **offered in the removal dialog**, never automatic. | `index.tsx` `deleteStory`, `worldInfoScanHost.ts` `removalRestore` |

### Step 0: host facts re-read (ST 1.19.0, `7c3994196`, `package.json:118`)

`05-H1`–`H4`, `H6`, `H11`–`H13` hold at their recorded lines: `world-info.js:882` cache, `:902` ACTIVATED emit, `:1013` CHAT_CHANGED pre-cache, `:2036-2042` `loadWorldInfo` cache hit, `:4346-4371` `deleteWorldInfo`, `:4515` per-call spread, `:4590`/`:4604` `getSortedEntries` + ENTRIES_LOADED, `:4801` disable skip, `:4886` forced check; `lib/eventemitter.js:66`/`:90` makeLast/makeFirst; `events.js:77,97,98`. No row drifted, so `v2.4/host-facts.md` is unchanged. New facts this build relies on:

- `/api/worldinfo/get` answers an unknown name with the dummy `{entries:{}}` (`src/endpoints/worldinfo.js:17-31`, route `:71-79`). The drift reader therefore reads only books listed in `world_names`.
- `saveWorldInfo` writes the cache before saving (`world-info.js:4177-4190`), and `loadWorldInfo` serves the cache (`:2041-2042`). The normaliser, re-normalise and restore therefore evict the book before writing (`stHost/worldInfoFiles.ts` `setLorebookEntriesDisabled`), so an API edit the cache has not seen cannot read as "already off".
- The popup OK button is `.popup-button-ok` (`popup.js:255`, template `index.html:6481`). The harness clicks it to confirm the way an author does.
- A mode switch without a reload needs **no host event**: our own settings write already notifies (`librarySave.onSettingsWrite`). The plan's "event a mode switch needs" row is not owed. The "WI editor read" row is not owed either, because the build does not touch the editor.

### Items (failing test first; negative controls; gates green after each)

| Commit | Item | Red first → green | Controls |
|---|---|---|---|
| `cc21c37` | W1 `normalizedFrom` provenance beside the unchanged `normalized` ledger; sanitizer keeps it | `worldInfoSettings.test.ts` 4 red → 4 green | malformed, duplicate and empty rows are dropped |
| `19d20e2` | B ledger verify (read-only), drift/missingKey Repair row, `stHost/worldInfoFiles.ts` (server file, listed books only), `snapshot.wiGating` | `worldInfoLedger.test.ts`, `repair.test.ts` (2 red), `worldInfoFiles.test.ts` | "control: a ledger whose every entry rests off reports no drift"; unlisted book never read |
| `a4509af` | A/C/W2 production normaliser (provenance, `recheck` for re-normalise), host-free controller `worldInfoGating.ts`: confirm → verify → normalise → **then** activate; the mode switch takes effect without a reload (file mode replays the open chat's path at once); growth normalised with a toast and a journal line; missingKey journaled once and raised | `worldInfoNormalize.test.ts` 8 red, `worldInfoGating.test.ts`, `librarySave.test.ts` 1 red | cancelled confirm writes nothing; file-mode sync normalises nothing; absent capability keeps the file path |
| `2e1f789` | C `wiScanGating` in `CAPABILITY_IDS` (temporary no-op handler, always disposed) | `capabilities.test.ts` 2 red | `error` not cached; the detail never says "spike"/"T13" |
| `b3d22db` | E removal restore (`wasOn` entries no remaining story gates; restored entries leave the ledger) | 5 red | a remaining story's entry is never restored; a stopped gating restores nothing |
| `a3e1e9c` | C settings row `#so-wi-gating` (`#so-wi-gating-mode`, `[data-so="wi-ledger"]`, `[data-so="wi-drift"]`, `#so-wi-renormalize`) + stories | repair spoiler case red | player mode shows counts, never entry names |
| `e5bbd14` | D author table "gated by `<story title>`", Studio diagnostic `world-info-rests-off` (info, scan mode only) | `diagnostics.test.ts` 1 red, `worldInfoLedger.test.ts` 1 red | file mode, no mode given, and no world_info all say nothing |
| `6b17d66` | scanGatePlan == file-path oracle over the **shipped** stories (sun-ruins + Adolion academy/adventurer copied to `test/fixtures/scan-gate/`), 60 fixed seeds walking their own transitions | passed on first run; mutant M9 kills it | the 300-seed generated property is unchanged |
| `40546e7` | fault matrix `wiNormalize` (9 cited, `aborted` na) + a write that throws late is journaled instead of an unhandled rejection | "a write that throws late …" red | the next sync still runs |
| `b4da684` | mutation sweep `test/findings/mutations/v25-01.txt`: 12 mutants, 11 killed, M5b equivalent (reason in the file) | — | — |
| `5cf6722` | live vehicles: `--wi-gating` for `so-journey`/`st-lanes batch`, `lib/wiGatingHarness.mts` (node:test 6), `live-v25-01-real-books.json`, `live-v25-01-g7-sticky.json`, helper `test/fixtures/interop/v25-01-gating.js` | harness test written with the lib, not before it | a popup that is not the gating confirm is never clicked |

### Deviations and findings (read before trusting the list above)

- **Two real defects found while building.** (1) The spike host used `onSettingsWrite` while the E3 journal listener also used it, and the listener was a single slot: starting scan mode silently evicted the settings-write journal. It is now a listener set (`librarySave.ts`, test + M10). (2) The mutation sweep found that switching back to file mode mid-normalisation let the remaining book writes continue. The gating's run now lapses when the mode leaves scan (M12).
- **The normaliser's run is the gating's lifetime, not a chat token** (`alive`/`lifetime` in `worldInfoGating.ts`, census rows `createWiGating.*`). Its writes are install-wide, so a chat switch must not leave half a gated set normalised. Dispose and a switch to file mode stop it. This is a reading of invariant 10 for install-wide work, stated in each census row.
- **The Repair detail names books and counts, not entry comments.** The plan's row text implied names, but Repair renders in player mode and checkpoint entry names are spoilers (inv 9). Names show in the settings row only with author view on, and in the journal.
- **Red-first exceptions**: the `draft.ts` context test and `wiGatingHarness.test.mts` were written after their code. The shipped-stories property passed on its first run; M9 proves it can fail.
- **Risk found, not fixed (W4 class):** in scan mode, between page start and activation the file path is still in charge (W2 by design). A hydrate in that window writes the chat's path into the files, and the start-up verify then reads those entries as drift. The Repair row and re-normalise recover it. G5/G1 live will show whether this is seen in practice.
- **Spike fixtures now behave differently:** `live-v24-05-t13-*.json` switch modes by writing the setting and reloading. On a lane that holds real library stories this now normalises the real books too (the marker filter is gone). Do not re-run them on a seeded lane without the save/restore the v25 fixtures do.
- `wiNormalize|persistFailure` is **partial**: a ledger save that never lands loses the entry's original `wasOn`, so a later restore cannot offer it (W4, stated).
- Fault matrix: the plan's "`aborted` and `hostDeletes` columns" was read as the `aborted` shape (na, no model call) plus the host-deletes situation (a book deleted between read and write), which is recorded under `beforeHostWrite`/`afterHostWrite` (the typed write refuses and nothing is recorded). `hostDeletes` is a package in this matrix, not a shape.

### Machine gates on HEAD `5cf6722`

- `npm run typecheck && npm run typecheck:test && npm run lint && npm test` → all exit 0; jest **270 suites / 3946 tests passed**.
- `npm run test:debug` → **301 pass / 0 fail**; `npm run debug:typecheck` → exit 0.
- `npm run build` → OK (bundle `8b34c7da30fb` with `ST_PUBLIC` set).
- `npm run test:release` → **37 / 37** with `ST_PUBLIC=C:/dev/SillyTavern-MainBranch/public`. Without it, 36/37: the worktree is not in ST's tree, so the host-version test cannot find ST. This is an environment limit, not a regression.
- Storybook: `npm run storybook:build` OK, then the runner with `--index-json` (`.debug/ae19_sb.sh`, same as plan 11) → **35 suites / 247 tests passed**, including `Settings/WorldInfoGatingGroup` (5) and the updated `PayloadScanGate`. The plain `test-storybook:ci` finds 0 stories from a nested worktree (the glob escapes `\.claude`); run it verbatim from the main checkout at merge.
- `st-session.mts reload`: not run (nothing live).
- Ownership census and fault matrix green (`wiNormalize` 85 covered / 11 partial / 24 na / 0 todo of 120); manager 740/740 effective lines, untouched.

### Live pending (LANES ONLY; each "×2" is two consecutive runs on one lane, with a run header captured and diffed around the batch)

| Gate | Vehicle | Command |
|---|---|---|
| G1 (a/b), G2, G5, G8 | `test/scenarios/live-v25-01-real-books.json` + `test/fixtures/interop/v25-01-gating.js` | `node scripts/debug/so-run-header.mts capture --label v25-01-books` → `node scripts/debug/st-lanes.mts batch --lanes 1 --repeat 2 --group <group holding Arin> test/scenarios/live-v25-01-real-books.json` → `node scripts/debug/so-run-header.mts diff <capture>` |
| G1 (c), G5 extension-disabled half | same fixture, `_design.G1c` / `_design.G5-disabled` (manual; extension disabled) | run once with `--keep`, then follow `_design` with `st-eval` |
| G3 | J7 in scan mode | `node scripts/debug/st-lanes.mts batch --lanes 1 --repeat 2 --strict --wi-gating scan J7` |
| G4 | J3 scan ×2, J7 file ×1 | `node scripts/debug/st-lanes.mts batch --lanes 1 --repeat 2 --strict --wi-gating scan J3`; `node scripts/debug/st-lanes.mts batch --lanes 1 --strict --wi-gating file J7` |
| G7 | `test/scenarios/live-v25-01-g7-sticky.json` (05-H5 across a **confirmed** switch, no reload; predeclared: no loss accepted) | clean host per README-claimed ST version (overview V10) and one lane: `node scripts/debug/so-scenario.mts run test/scenarios/live-v25-01-g7-sticky.json --sandbox --group <group holding Arin, Ponticius, Luke>` |
| G6 | dropped (v2.4 E9) | — |

Records go to `test/journeys/records/v2.5-plan01/live-<bundle12>/`.

### Proposed, not applied (applied when G1–G8 pass, per the plan's step 6)

- **Invariant 14** (`.claude/rules/architecture.md`, "Checkpoint `world_info` is rebuilt from the chat's path"): replace the closing parenthesis "(v2.4 plan 05: a scan-time alternative exists only as a spike …)" with: *"Checkpoint `world_info` is a per-scan view derived from the chat's path; gated entries rest off in their files (normalised once, behind the author's confirm, `worldInfo.normalized` + `normalizedFrom`, verified against the files at start-up and on every library change); the file path (path replay + release) is the capability fallback and the `file` mode, and is the default until the author switches."*
- `.claude/rules/architecture.md` tree line for `scanGatePlan.ts / … / worldInfoMode.ts` becomes "v2.5 plan 01: per-chat lorebook gating (`worldInfoGating.ts` controller, `worldInfoLedger.ts` verify/restore, `worldInfoNormalize.ts` normaliser, `worldInfoScanHost.ts` wiring)". The components/settings line adds `WorldInfoGatingGroup`. The capabilities bullet in gotchas adds `wiScanGating`.

## Gate record (live, bundle 0f4332fac075)

2026-09-26. Lanes only: lane 3 ran G1/G2/G3/G5/G7/G8, and lane 1 ran G4. Each lane was prepared the same way: `restore-config`, `st-session reload`, served bundle `0f4332fac075` confirmed by `so-run-header` (`bundle.served.sha256`), `open-group 1759606632088`, `/profile Artemis RunPod RP` with a real PONG. `src`/`dist` untouched. Fixture sha256s: `test/journeys/records/v2.5-plan01/fixture-sha256.txt` (lane 3), `test/journeys/records/v2.5-plan01/G4/fixtures.sha256` (lane 1); identical bytes on every run. Records live under `test/journeys/records/v2.5-plan01/<gate>/`, not the `live-<bundle12>/` the plan named (deviation, path only).

### Verdicts

| Gate | Verdict | Runs | Record |
|---|---|---|---|
| G1 (a/b) | **NOT GREEN.** The G1 assertions passed in both attempts (93 matched, 0 wrong, `missingKey` 0; scan view 0 wrong, ring 3 slots / 0 leaks). The vehicle then went red at G5 (step 23), so no ×2 run of the fixture completed | series1-run1 red at step 23; series1-run2 refused the lane (run 1 skipped its cleanup and left scan mode), so it is not an attempt; series2-run1 red at step 23 | `test/journeys/records/v2.5-plan01/G1-G2-G5-G8/` |
| G1 (c) | pass, 1 manual run (×2 not met). All 343 ledger entries were off with SO disabled, so the check was not vacuous | 1 | `test/journeys/records/v2.5-plan01/G1c-G5-disabled/run1/` (`03-G1c-check.json`) |
| G2 | **NOT GREEN** (same vehicle). Its assertions passed in both attempts: 93 of 93 flipped, non-gated entries unchanged, 0 edits on the second run | as G1 (a/b) | `test/journeys/records/v2.5-plan01/G1-G2-G5-G8/` |
| G3 | **GREEN ×2**, strict. J7 in scan mode: 8 pass / 0 fail each run (2830 s, 2151 s), all passes on the first attempt, `drift`/`missingKey` 0, the four gated books identical before and after. J7.9/J7.10 are human rows and stay unscored | 2 | `test/journeys/records/v2.5-plan01/G3/` |
| G4 | **GREEN.** J3 scan: series 1 run 1 red at J3.2 (see below), run 2 green; series 2 runs 1 and 2 green on the first attempt. That is three consecutive greens and a complete ×2 series. J7 file ×1: 8 pass, clean | J3 4, J7 1 | `test/journeys/records/v2.5-plan01/G4/` |
| G5 | **RED: product defect P01-L1.** "Timed out waiting for the drifted entry in the start-up verify". No Repair row after a reload, in 3 of 3 attempts (two series plus the manual re-enable). The extension-disabled half passed ×1: the hand-enabled entry was the only one on. The "re-normalise clears it" half is vacuous, because the start-up release had already switched the entry off | 2 fixture attempts + 1 manual | `test/journeys/records/v2.5-plan01/G1-G2-G5-G8/series1-g5-reload-probe.json`, `test/journeys/records/v2.5-plan01/G1c-G5-disabled/run1/` |
| G6 | dropped (v2.4 E9) | — | — |
| G7 | **NOT GREEN: clean-host half pending.** Lane half GREEN ×2 (series 3: `fired:true`, `hashMatches:true`, books restored identical, header diff clean). In series 1 and 2 the G7 check passed all 4 times, but the post-verdict `wait schedulerIdle` timed out on backend congestion (llama `n_tokens_max 88563` from another lane; one `send_generate` took 298 s), so those series do not count | lane: 2 counted, 4 discounted | `test/journeys/records/v2.5-plan01/G7-lane/` |
| G8 | **NOT GREEN** (same vehicle). Measurements met the floor: p95 2.0 ms / max 3.8 ms (series 1), p95 3.7 ms (series 2), over 50 scans | as G1 (a/b) | `test/journeys/records/v2.5-plan01/G1-G2-G5-G8/` |

### Defects found (not fixed)

- **P01-L1: in scan mode, the file path writes real lorebooks at page start, before the gating activates.** A drifted entry is erased before the start-up verify reads it, and every scan-mode page start rewrites real books. This is the plan-01 goal violation, and the "hydrate before activation" risk from the code record, now observed.
  - Trace (`series1-g5-reload-probe.json`): +4680 ms after reload, `/api/worldinfo/edit` wrote the drifted entry `disable:true` (`chatId:null`, `active:false`), stack `clearStory` → `releaseWorldInfo` → `saveWorldInfo`. The gating showed `busy:true` at +4966 ms and went `active` at +5488 ms.
  - Cause: `src/runtime/effectsApplier.ts:291-292` skips the release only when `scanGatingActive()` is true. `src/runtime/worldInfoScanHost.ts:73` sets it false at start, and `src/runtime/worldInfoGating.ts:171-175` sets it true only after verify and normalise. So `releaseGatedWorldInfo` (`src/runtime/storySelection.ts:34-35`) writes every library story's gated set at start. `src/runtime/effectsApplier.ts:241` (apply) has the same window: a story chat hydrated before activation writes its path, which later reads as false drift.
  - Effects: G5's start-up Repair row can never appear after a reload, and a hand-enabled entry is silently switched off, against design B ("reads only; the write needs the click").
  - Direction: guard both file writes on `gatingMode === "scan"`, not only on `active`. Red first: a jest case in which a release or apply between start and activation writes nothing in scan mode. Mutant: the old `active`-only guard.
- **Harness, G3:** `restoreConfig` resets the ledger while the books stay normalised. Run 2 therefore re-recorded 93 entries through the already-off branch, and their `wasOn` provenance is lost after a J7 scan run. No damage on the lane, but a removal restore after such a run cannot offer those entries.
- **Observation, G7:** after the switch the sticky record renews (start 2→5, end 5→8) instead of carrying the original window, so "fired" may be a keyword re-fire. The predeclared criterion (fired AND hash match) is met and was not retuned.
- **Timing, G4:** J3.2 series 1 run 1 did not see the "Accept the Mission" note within 15 s. cp2's onEnter DM Narrator llm reply is awaited before the note (plan 02 C7), on a shared backend at about 4.3 tok/s. This is not scan-related.

### Pending

- G1 (a/b), G2, G5, G8: re-run the fixture ×2 on a build that fixes P01-L1. G5's re-normalise half needs that build to mean anything.
- G1 (c) and the G5 extension-disabled half: a second manual run (×2).
- **G7 clean host** at each README-claimed ST version (overview V10). Not run.
- Mutant controls: none owed for the live gates. P01-L1 is observed on the shipped bundle, and its fix owes a red jest case plus a mutant (above).
- Machine gates on a fix build, then `st-session.mts reload` on the lane before the re-run.
- Lane state at hand-off: lane 3 in file mode, empty ledger, library as seeded, no SO-V25/SO-T13 assets, and every closing header diff clean apart from `settings.schema null → 1` (plan 11's stamp). Lane 1 is left on a plan 02 C1 sandbox chat (see plan 02's record).

### Sign-off condition

- **Plan 02 C2: met.** 0 of 10 predeclared attempts reproduced the save race (recorded non-reproduction), and the one late save observed was attributed with its stack (plan 02, "C2 attribution").
- **G1–G8: not met.** G1 (a/b), G2, G5 and G8 are not green (P01-L1), and G7's clean-host half has not run.
- **Plan 01 is therefore NOT signed off**, and the invariant-14 rewording ("Proposed, not applied" above) is **left unapplied**: step 6 applies it only when G1–G8 pass. `.claude/rules/architecture.md` is unchanged.

## Gate record (code, P01-L1 fix, 2026-09-26)

Built on master `0ae7107` + the plan 02 C1/C7 commits, in a worktree. Nothing live ran. Plan 01 stays not signed off until the live re-runs below are green.

**P01-L1 fixed: in scan mode no file-path lorebook write happens before the gating activates.** The file path's two writers (`EffectsApplier.applyCheckpoint`'s path replay and `releaseWorldInfo`) used to skip only when `scanGatingActive()`, which is false from `startScanGating` until verify + normalise finish, so the page-start `clearStory` → `releaseGatedWorldInfo` wrote real books first (the +4680 ms edit in `series1-g5-reload-probe.json`). Both now ask `worldInfoFilesHeld()` (`src/runtime/worldInfoMode.ts`): held while the gating is active, **or** while `worldInfo.gatingMode` is `scan` and the gating has not settled on the file path. The mode is read through `readGatingModeWith`, registered first thing in `startRuntime` (`src/runtime/index.ts`), so it is known before the first chat load: ST assigns the stored `extension_settings` before it activates extensions (`extensions.js:1784-1786` before `:1813`), and `getGlobalSettings()` reads without writing back until `settingsAreLoaded()`.

Settling (`src/runtime/worldInfoGating.ts`): the gating settles on the file path only for the S6 fallback, an absent or erroring scan capability. It then marks the file path free (`settle(true)`) and replays the open chat's path once (`replayFilePath`, which is the release plus the owned story's path). Activation never settles (the scan view serves the chat). A sync that throws keeps the file path held and journals, and the next sync retries; a failed start therefore cannot write around the verify. Leaving scan mode (`deactivate`) resets the settle before its replay, so a later switch back holds again. `startScanGating` resets both flags. File mode is unchanged: `worldInfoFilesHeld()` is false whenever the mode reads `file`.

Consequence for G5: at a scan-mode page start the start-up verify reads the books untouched, so a hand-enabled gated entry is reported as drift (the Repair row) and is switched off only by the author's re-normalise, as design B requires. The "re-normalise clears it" half is no longer vacuous.

Tests (red first): `effectsApplier.test.ts` "v2.5 P01-L1: in scan mode, before the gating activates or settles, neither the path replay nor the release writes a lorebook", "… once the gating settles on the file path (no scan capability), both write again", and the control "file mode is unchanged, the path replay and the release write at once without any gating"; `worldInfoGating.test.ts` "absent capability settles on the file path once and replays", "a scan-mode start-up verifies, normalises and activates without ever releasing the file path", "a sync that fails in scan mode keeps the file path held". Four were red before the change (three failing on the missing export, the absent-capability case on the missing settle/replay), plus the rewritten "switching back to file" order. Mutants 8/8 killed (guards reverted to active-only on apply and on release, held ignoring the mode, held ignoring the settle, fallback without settle, fallback without replay, absent capability without fallback, deactivate keeping the settle).

Machine gates on the C1 + C7 + P01-L1 tree: `npm run typecheck` clean, `npm run typecheck:test` clean, `npm run lint` clean, `npm test` 4039 passed / 1 skipped (fault matrix 85 covered, 11 partial, 24 na, 0 todo), `npm run test:debug` 317 pass / 0 fail (needs a `dist/manifest.json`; a fresh worktree has none, so `npm run build` ran once first).

Live re-runs owed (lane 3, after `npm run build` and `node scripts/debug/st-lanes.mts run 3 -- scripts/debug/st-session.mts reload`, `open-group 1759606632088`, `/profile Artemis RunPod RP` with a PONG):
- G1 (a/b), G2, G5, G8: `node scripts/debug/st-lanes.mts batch --lanes 3 --repeat 2 --group 1759606632088 test/scenarios/live-v25-01-real-books.json`. G5 green = the drifted entry appears in the start-up verify after the reload (Repair row) and the re-normalise then clears it, on both runs. Re-run the reload probe once with the edit trace armed: no `/api/worldinfo/edit` before the gating reads `active` (or before it settles on the file path).
- G1 (c) and the G5 extension-disabled half: a second manual run (×2), as in the record above.
- Control on a mutant build with the old `scanGatingActive()`-only guard: expect G5 red again with the +4680 ms edit.
- G7 clean host: still owed, unchanged by this fix.

## Gate record (v2.6 carry-over, bundle f8eaa0675102)

- Mutant control (old `scanGatingActive()`-only guard): now a deterministic kill, defect replay `scan-mode-file-writes-before-gating` (killed by `effectsApplier.test.ts`).
- G1(a/b), G2, G5, G8 and the G1(c)/G5 extension-disabled half: need a model (the vehicle plays real turns); v2.6 final suite row 01-v25-01. The inv-14 rewording stays unapplied until they pass.

Full record: `docs/plans/v2.6/01-carry-over-proof.md` §Gate record (no-LLM half, 2026-09-30); records under `test/journeys/records/v2.6-01/`.
