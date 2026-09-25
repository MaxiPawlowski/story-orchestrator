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
| S4 vectors still works, calls ≤ file path (`:20`) | Downgrade to v2.4 with `gatingMode: "scan"` and a real-book ledger (below) |
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
| Mode flag | `settingsStore.ts:29-45`: `gatingMode: "file" \| "scan"`, default `file`; `normalized: Record<book, string[]>` | A v2.4 sanitizer keeps only string arrays (`:40-43`). A reshaped `normalized` is wiped by a v2.4 read |
| Start-up | `runtime/index.ts:211-226` starts `startScanGating` after `settingsReady()`; the flag is read once (`worldInfoScanHost.ts:37`) | a mode change needs a reload today |
| Activation order | `worldInfoScanHost.ts:86-89`: probe → `setScanGatingActive(present)` → `normalize()` | the ordering gap above |
| Provider scope | `worldInfoScanHost.ts:42-51` gates **every** library story; only the normaliser is marker-filtered (`:62-63`) | so a v2.4 install reading `scan` gates real books with whatever ledger it finds |
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
- **Keep the shape** `normalized: Record<book, string[]>`, because the v2.4 sanitizer drops anything else
  (`settingsStore.ts:40-43`). Provenance goes in a **new key**, `normalizedFrom: Record<book, {comment, wasOn}[]>`,
  which v2.4 ignores.
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
1. Red first (jest): the ledger drift read, the `normalizedFrom` round trip through a v2.4-shaped sanitizer, the
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
