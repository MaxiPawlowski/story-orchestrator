# v2.4 plan 05 — T13 scan-time gating spike report

**Verdict: PASS (S1–S8 hold; S9 shows no loss).** Measured live on 2026-09-25 on lane 1, bundle `8b5f9dfe509b`, real LLM (Artemis 31B).
Under the plan's rule, a PASS means build plan `05b-wi-scan-gating.md` is owed **for v2.5**, for user approval. It is not written here.
v2.4 ships the file path. The spike code stays behind `worldInfo.gatingMode = "file"` (the default, not flipped), so nothing is removed.

The conditions are the plan's predeclared table (`05-world-info.md` §T13) and were **not retuned**. The automated legs are in
`test/scenarios/live-v24-05-t13-spike.json` (helpers `test/fixtures/interop/t13-spike.js`). The expected set is recomputed from the authored effects,
independently of `src/runtime`. They ran twice, back to back on one install, and both runs passed with the same values. The legs the design left manual
(S4, S7, S9) ran once through `test/scenarios/live-v24-05-t13-manual.json` (helpers `t13-manual.js`), as the plan's "measured once per condition" says.
S1 (c) needs the extension disabled, so it was finished by hand over `st-eval` on the same lane (record `S1c-extension-disabled.json`). Every book was marker-named
(`SO-T13 …`), and a run header diffed clean around each batch. Records are in `test/journeys/records/v2.4-plan05/live-8b5f9dfe509b/`
(`T13-spike/`, `T13-manual-legs/`, plus the four red attempts `T13-spike-A…D`, which were fixture defects; see below).

| # | Condition | Pass | Measured | Result | 1.18.0 note |
|---|---|---|---|---|---|
| S1 | No-story chat sees no gated lore | 0 non-owning gated entries in any scan view or ring | Every normalised gated entry (11) was set ON on disk first. (a) No-story chat: scan view 11/11 correct, 0 leaked; ring over 3 real generations: 3 slots, 0 leaked. (b) Story C chat: 11/11, 0 wrong. (c) Extension **disabled** after normalisation, then reloaded: 0 of 9 normalised comments enabled on disk or in the scan view. Over 3 real sends (7 loud scans, `WORLD_INFO_ACTIVATED`), 0 fired, while the marker book's non-gated keyword entries did fire (the book was live) | PASS ×2 (a/b), ×1 (c) | ENTRIES_LOADED/copy semantics statically the same (H2/H3) |
| S2 | Per-chat correctness without writes | 100% == `worldInfoPlan`; 0 `/api/worldinfo/edit` during switches | A (cp1→cp-4a), B (story A at cp1), C (story C), A→B→C→A ×3: 12/12 checks match, **0** edits | PASS ×2 | same |
| S3 | One-time normalisation | 1st run flips exactly the gated set; 2nd = 0 writes; others byte-identical; growth = only new | The 1st run happens automatically when scan mode starts (the probe fires it), before the fixture's counter is armed. It is measured by the file diff: every gated entry off, 0 gated entries otherwise changed, 0 non-gated entries changed (JSON). 2nd run: 0 writes, 0 edits. Growth (story D v2 adds `General - Magic`): exactly that entry, 1 edit | PASS ×2 | n/a (our code) |
| S4 | Vectors still works | on entry activated, off not; vector calls ≤ file path | Vectors `enabled_world_info`, transformers; `CP4 - Sphinx` (ON at A's path) and `CP2 - Scenario` (OFF) vectorised. The same A, B, A real-turn script per mode, after a collection purge. ON fired in every A leg in both modes, and vectors forced it (`WORLDINFO_FORCE_ACTIVATE`). OFF never fired and was never forced. Calls: file 6 insert / 1 delete, scan **5 / 1** | PASS ×1 | vectors skip `disable` (H10), statically the same |
| S5 | Author view shows effective state | 100% match with `getScannableEntries()`; `assert-player-clean` green | `#so-scan-gate` rows 354 (every library story's gated entries on the lane), 0 mismatched; `assert-player-clean` green | PASS ×2 | n/a |
| S6 | File-write fallback | forced `absent` → file path yields the S2 sets from rest-off | Forced through `gatingMode = file` after normalisation. This takes the same branch as `absent`: `scanGatingActive()` is false either way (`worldInfoMode.ts`); jest covers the `absent` probe. The file path enabled the sets from rest-off: A, B and C each 11/11, 3 edits | PASS ×2 | `makeFirst`/`makeLast` exist (H11) |
| S7 | Force and selector coherence | gated-off pick not a candidate; a forced gated-off copy never lands | Story S gates `General - Magic` OFF at its start. The fixture set it **ON on disk** adversarially, with judge `loreSelect` on, in a real turn. The scan view held it `disable: true`. It was not among the 8 lore-select candidates (the control entry was), and the judge picked nothing. Both it and a control were forced at GAC: the control landed, the gated-off copy did not | PASS ×1 | disable checked before force (H6) |
| S8 | Cost | ≤ 5 ms p95, 500-entry library, 50 scans incl. dry | 50 scans (40 + 10 dry) over the 500-entry `SO-T13 Bulk` plus the lane's library: p95 **2.5 / 2.3 ms**, max 4.2 / 3.7 ms | PASS ×2 | n/a |
| S9 | Sticky survives | stays active, or one-time loss stated; fail if it recurs | `CP1 - Scenario` `sticky: 3`, activated in file mode (ST's sticky record hash `4021784051273102`). Then the switch to scan mode plus normalisation (file now `disable: true`). The entry's scan hash was **identical** before and after the switch, so the sticky record still matches it, and it stayed active on the next real turn. No loss, so nothing can recur | PASS ×1 (no loss) | H5 not re-checked live (this install is 1.19.0); static only |

**Deviations from the fixture `_design` block (measurement procedure only; no condition changed).** Each deviation is there because the design as written measured nothing.
- S4's OFF entry: `CP1 - Mission` is ON at chat A's path, and `CP2 - Mission` is character-filtered to DM Narrator, so its silence proves nothing. `CP2 - Scenario` was used instead. The vector counts come from an identical real-turn script per mode, because the S2 switches generate nothing (0 = 0 by construction).
- S7: lore-select never offers constant entries (`judge/lore.ts` `loreCandidates`), so the design's CP4 constants could not be candidates in either mode. A non-constant gated entry was used.
- S9: `CP1 - Scenario` was used instead of `CP1 - Mission`, whose DM-Narrator filter makes activation depend on who is drafted. Because the entry is constant, the ring alone cannot tell survival from re-activation, so ST's own sticky record and its hash are the evidence.

**Red runs on the way (fixture defects, each fixed and then run ×2 green).**
- (A) Switching chats while a save was pending wrote chat A's metadata (its integrity slug) into the Ponticius solo chat during `/go`. ST's server integrity check refused it, and the popup wedged the page (`isChatSaving` stayed true; after OK the reload hung on "Initializing…" until the lane browser was killed). The fixture now waits for the scheduler to be idle and quiet before every `solo_chat`, and `goto` waits out `isChatSaving`. This is the known save-binds-late race (gotchas 2026-09-24), reported below, not fixed.
- (B) The S1 (a) ring check matched comments without the world. The globally selected `Xentar Checkpoints` carries the same comments and fired them by keyword.
- (C) `goto` opened a group chat with `openGroupChat` alone, from a solo chat. `check()` compared the whole library against the books it read.
- (D) S5 read one book while the author table lists every library story's rows.

**Found by the spike before any live run.** `releasePlan` keyed its keep index by the authored book spelling. The 300-seed property test in `scanGatePlan.test.ts`
compares against a file-path oracle, and it showed the defect: a second story naming the same book in another case released entries the incoming story gates. The fix
(file-id key, merged spellings) is in today's file path, with red tests first. See the Gate record in `05-world-info.md`.

**Owed on PASS:** `05b-wi-scan-gating.md` for v2.5 (inv 14 rewording, production normalisation behind a confirm, the default switch, normaliser ledger rows,
unbound-mirror and bound-book requirements), for user approval.
