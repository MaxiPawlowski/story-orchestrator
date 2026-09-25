# Plan 08 — Lore on the scan seam

**Status: DRAFT 2026-09-25 — awaits user approval.** Depends on plan 01 (scan-time gating in production) for L1 and L5,
and on plan 03 for any coordinator line (rule 12). L2, L4, L6 and L7 do not need the scan seam; they may start once plan 01
is approved, but they ship with this plan. **Verified against master `e7626d7`** on 2026-09-25 (the overview and plan 01
cite `1ad1a5f`; Δ marks drift). **Re-verify every path:line before building** (v2.4 rule 1). Every build item starts from
a red fixture (v2.4 rule 2); every model-dependent item has a predeclared floor that is never retuned (inv 7 spirit).
If plan 01 does not ship scan mode (overview U1 / plan 01 Q1 = no, so plan 01 stops at step 2), L1 and L5 are recorded not
built, with no production scan seam. G-L1, G-L5 and G-J are dropped, and G-L2 runs in file mode only. L2, L4, L6 and L7 are
unaffected, and L6 is then measured on the file-mode bound mirror. If plan 01 ships scan mode, L1 and L5 act only where scan
mode is active (per plan 01 Q2's answer). G-L1, G-L5 and G-J then run on a lane with scan mode on, and U6 covers file mode.

## Source rows

| # | Item | Source | Evidence today |
|---|---|---|---|
| L1 | Unbound mirror (no chat-slot competition, no branch leak) | overview §08; SUMMARY `:195`; `v2.4/05-world-info.md:32-33` | slot can be `occupied` (`stHost/worldInfo.ts:204`); branch carries the slot (`:213-223` exists to undo it) |
| L2 | Requirements satisfied by chat/character/persona-bound books | SUMMARY `:201`; `v2.4/05-world-info.md:33` | global selection only (`runtime/requirements.ts:16-20`) |
| L3 | Member-scoped lore | SUMMARY `:195`; `v2.4/05-world-info.md:32-33` | ST's own `characterFilter` already does it (05-H17); see decision D3 |
| L4 | Per-tier `scan:true` (never epistemic) | SUMMARY `:200`; `v2.4/05-world-info.md:36-37` | `scan` hard-coded `false` (`stHost/extensionPrompts.ts:45,53`) |
| L5 | Lore-select "exclusive" mode, own recall floor | `v2.4/05-world-info.md:40`; TV research #2 (`extension-research/tunnelvision-…md:44`) | additive force only (`runtime/loreSelect.ts:89-93`) |
| L6 | Mirror key hygiene measurement | `v2.4/05-world-info.md:398-400`; seeds §D P05 (`v2.4/v2.5-seeds.md:61`) | unmeasurable ×3: no mirror book was ever created |
| L7 | R14 lore contradiction in the warden | SUMMARY `:271` | warden holds facts + bound ledger rows only (`runtime/continuity.ts:26-55`) |

## Goal

Lore that belongs to a chat reaches that chat's scans, and only that chat's, without competing for ST's slots; a story's
lore requirement reads the books ST will actually scan; authored lore stops being invisible to the continuity check. The
two items that would change what fires on every turn (L4, L5) ship off by default, behind their own measurement.

## Scope / out of scope

In: L1, L2, L4, L5, L6, L7 as designed below; L3 as a recorded decision.
Out:
- Anything plan 01 owns (normalisation, ledger, mode control, inv 14 rewording).
- Stripping mirror keys unless L6 measures a median ≥ 0.8 (the v2.4 rule, unchanged).
- Mirror budget share / `order` (not scheduled, `v2.4/05-world-info.md:38-39`).
- Epistemic in any WI path, scan buffer included (inv 15).
- A curator `create` op (F5 not built, `v2.4/06-steering-stagecraft.md:323`).
- Plan 13 (harness routing) design. This plan only records the route a model-dependent measurement ran on.

## Verified current state (master `e7626d7`)

| Claim | Seen | Δ |
|---|---|---|
| Requirements read the global selection only | `runtime/requirements.ts:16-20`; `stHost/selectors.ts:28-32` (live `selected_world_info` ∩ existing) | none |
| Repair names the missing book, offers the wizard | `runtime/repair.ts:83-91` | none |
| Requirements refresh on persona/group/WI-settings events | `runtime/requirementsWatch.ts:64-66` | new since the overview; no `CHARACTER_EDITED` |
| Mirror is relationship rows only; scene rows no longer mirrored (T14) | `runtime/memoryMirror.ts:58-62` | Δ `05-world-info.md:55` (`:53-54` mirrored scene rows) |
| No book is created while no relationship row is live | `memoryMirror.ts:102` | explains L6's "nothing to measure" (hypothesis, step 0) |
| Mirror keys = `entry.entities` | `memoryMirror.ts:133` | Δ `:115` |
| Mirror binds the chat slot on adoption | `memoryMirror.ts:158` → `bindChatLorebook` `stHost/worldInfo.ts:196-211` (`occupied` `:204`) | Δ `:127` |
| Mirror syncs only at a scene summary or a consolidation | `extractionCoordinator.ts:337`; `memoryCoordinator.ts:522`, `:563-574`; consolidation every 10 boundaries (`boundaryWork.ts:6,137-142`) | none |
| Scan-gate provider: owner = story ∧ owned chat ∧ ready | `runtime/worldInfoScan.ts:32-42` (owner `:35`) | Δ plan 01 `:32-41` |
| Handler is synchronous, last listener, per-call copies | `stHost/worldInfoScan.ts:15-28` | none |
| Flag read once at start-up; probe → active → normalise | `worldInfoScanHost.ts:37`, `:86-90` | Δ plan 01 `:86-89` |
| Evidence ring stores `{world, uid, comment, constant, key0}`, **no content** | `runtime/worldInfoEvidence.ts:23-29` | matters for L7 |
| Mirror origin = mirror book + `so_` prefix; mirror tallies exist | `worldInfoEvidence.ts:146-148`, `:296-300` | none |
| `hiddenRuns` not chat-keyed | `worldInfoEvidence.ts:178` | owned by plan 02 C3 |
| Extension prompts always `scan=false`; the registry has no scan field | `stHost/extensionPrompts.ts:45,53`; `constants/injectionRegistry.ts:12-24` | A1 fix present (`heldBlock` reads the host, `:12-16`) |
| Lore candidates: listed books, not disabled, not constant, non-empty | `judge/lore.ts:42-45`; forced at `loreSelect.ts:89-93`; cached only when every chunk answered `:79` | none |
| Lore-select is a **judge** use, not an LLM profile | `loreSelect.ts:70` (`judge.ask("lore", …)`); readiness `judge/readiness.ts:48` (calibration 0.8974) | — |
| Warden input: reply, facts, agency, house rules; 40 facts, 4 s | `judge/warden.ts:10-15`; `judge/policy.ts:66,68`; `continuity.ts:62-69` | none |
| Drafted member is known at generation time | `runtime/index.ts:317` (`GROUP_MEMBER_DRAFTED` → `generation.drafted`) | — |
| Budgets (test formula, `architecture.test.ts:17-18,28`) | manager **740/740**; memory 619, extraction 604, stagecraft 601 of 620 | Δ overview says manager 736 |

## Host facts (ST 1.19.0; 1.18.0 static owed in step 0)

Rows 05-H1..H17 stand (`v2.4/host-facts.md` §Plan 05). New rows owed, read on this tree:

| # | Fact | 1.19.0 |
|---|---|---|
| 08-H1 | The four arrays are `const` locals passed by reference to `ENTRIES_LOADED`; entries **pushed** into `chatLore` are sorted, hashed and scanned like loaded ones | `world-info.js:4592-4604`, chat lore first `:4624-4625`, hash `:4628-4633` |
| 08-H2 | Chat slot = `chat_metadata[METADATA_KEY]`, skipped when globally selected | `getChatLore` `:4544` |
| 08-H3 | Character lore = the **drafted** character's `data.extensions.world` + `world_info.charLore[].extraBooks`, deduped against global/chat/persona | `getCharacterLore` `:4475`, `:4481`, `:4490` |
| 08-H4 | Persona lore = `power_user.persona_description_lorebook`, skipped if chat/global | `getPersonaLore` `:4564` |
| 08-H5 | `setExtensionPrompt(key, value, position, depth, scan, role, filter)`; a `scan` prompt is added to every WI scan buffer | `script.js:8926-8935`; `world-info.js:4719-4725` |
| 08-H6 | `WORLDINFO_UPDATED(name, data)` on every book save | `world-info.js:4160` |

## Design

### L1 — Unbound mirror (scan mode only)
- In scan mode `syncMemoryMirror` never binds the chat slot. A slot that names exactly this chat's mirror book is released
  through the existing `unbindChatLorebook` (`stHost/worldInfo.ts:213-223`); any other slot value is never touched.
- The scan handler appends the mirror book's enabled `so_` entries to the `chatLore` copy (08-H1), **for the owning chat
  only** (story ∧ owned chat, i.e. the provider's owner guard at `worldInfoScan.ts:35` minus `ready`: the mirror is memory,
  not gated lore, and file mode scans it regardless of requirements). A branch, another chat, a no-story chat: nothing appended.
- The handler stays synchronous: it appends from an in-memory copy of the book, refreshed after each sync and on
  `WORLDINFO_UPDATED` for that book (08-H6), so an author's edit in ST's editor is what fires. Entries keep their real
  `world` and `uid`, so the timed-effects hash, T12's `mirror` origin and the reaper marker work unchanged.
- **No double:** nothing is appended when the book is already in any of the four arrays (a legacy-bound slot).
- File mode (and `absent`/`error`) keeps today's bound slot. The book, its `so-owner` marker and the reaper are unchanged.

| # | Condition (predeclared) | Pass |
|---|---|---|
| U1 | No leak: no-story chat, a branch of the owning chat, another story's chat; 3 real generations each | 0 mirror entries in any scan view or ring |
| U2 | Parity: the owning chat's appended set vs the book's enabled `so_` entries | 100 %; a scripted turn naming a keyed entity fires it (ring origin `mirror`) |
| U3 | Slot freedom: a user book bound to the chat slot first | mirror entries still scan; the user's slot unchanged (today: `occupied`, 0 mirror entries) |
| U4 | No double with a legacy-bound slot | each mirror entry at most once per scan |
| U5 | Cost | handler p95 ≤ 5 ms over 50 scans incl. dry (the S8 bound) |
| U6 | File-mode fallback | today's bound slot, `live-memory-mirror.json` green |
| U7 | Not-ready parity: story with a missing persona or member, owning chat | mirror entries still scan (ring origin `mirror`) exactly as the file-mode bound slot does; 0 gated entries on; ×2 |

### L2 — Requirements read what ST scans
- `evaluateRequirements` counts a book as present when it is globally selected (today), **or** bound to the chat slot
  (08-H2), **or** the persona's book (08-H4), **or** character-bound (08-H3) under D2.
- `RequirementsState` gains `satisfiedBy: Record<book, "global" | "chat" | "persona" | "character">` for the author view;
  the player-facing Repair copy is unchanged (rule 7).
- The watcher adds `CHARACTER_EDITED` (host key exists, `events.js:44`) and a chat-slot change to its triggers.
- Plan 01's owner guard reads `ready`, so a chat-bound requirement now reads ready in scan mode too. G-L2 checks both modes.
- File mode: the chat slot holds either the story book or the memory mirror, not both (`bindChatLorebook` refuses an
  occupied slot, `stHost/worldInfo.ts:204`; the mirror binds only on adoption, `memoryMirror.ts:158`). The `chat` source
  therefore counts toward `ready` only in scan mode, or in file mode when the slot's book is not this chat's mirror. When a
  file-mode requirement is met by the chat slot, or the slot holds a user book, the author view names the conflict ("memory
  mirror not scanned in this chat"), and so does the Repair step.

### L3 — Member-scoped lore: recorded, not built (D3)
ST filters entries by character before the constant check (05-H17, `world-info.js:4816`), and sun-ruins already authors
it (`CP1 - Mission` is DM-Narrator-only; `v2.4/05-world-info.md:405-408`). A story-owned member filter would duplicate a
host feature on the same entries. It returns only if the user names a path-dependent member rule `characterFilter` cannot
express (Q3).

### L4 — Per-tier `scan:true` (opt-in, off by default)
- `InjectionSpec` gains `scannable?: true` on `memoryFacts`, `memorySceneHistory` and `checkpointGuidance` only.
  `setStoryExtensionPrompt` takes the flag (`extensionPrompts.ts:41-47`); `holds()` compares it too.
- A registry guard fails the build if `epistemic`, `ledger`, a private per-member block, or any key without `scannable`
  scans. Negative control: a test registry that marks `epistemic` scannable must fail the guard.
- Install-wide setting `worldInfo.scanMemory` (default `false`), author-view copy states that memory text will trigger lore.

| # | Condition | Pass |
|---|---|---|
| P1 | Privacy: capture the scan buffer (`WORLDINFO_SCAN_DONE`, 05-H8) in J5 with the flag on | 0 epistemic or ledger text in any buffer, ×2 |
| P2 | Effect recorded, not judged: J3 ×2 on/off with the same scripted turns | activations per loud generation reported per arm (T12 ring); budget-overflow count on ≤ off + 1 per 20 generations |
| P3 | Rollback: a rollback past a facts write | the next scan buffer holds the rolled-back facts block (A1 path), ×2 |

### L5 — Lore-select "exclusive" (opt-in per story and install-wide, scan mode only)
- Schema: `lore_select.exclusive?: boolean` (`engine/schema.ts:249-253`), default false, Studio toggle. storyDiff: the
  existing `lore-select-changed` row (`storyDiff.ts:236`, whole-object compare) already classifies an `exclusive` toggle as
  compatible; reword its message to cover the mode switch (e.g. "What lore-select may judge, or whether it excludes unpicked
  entries, changed.") and add a jest case for the toggle. Diagnostic: new code `lore-select-exclusive-empty` (exclusive with
  no `lore_select.lorebooks`) with its `DIAGNOSTIC_CONSEQUENCES` entry (the `diagnostics.ts:43` guard fails the build otherwise).
- Exclusive mode requires three things: (a) a new install-wide `judge.uses.loreExclusive`, default false and never flipped
  by any plan, added to `JUDGE_USE_KEYS` with `JUDGE_USE_DEPENDENCIES.loreExclusive = "loreSelect"`; (b) the story flag;
  (c) scan gatingMode. If any is missing, the path stays additive force only. The settings copy states that the use sends the
  same `lore` request as loreSelect, so no new privacy row; its readiness is X1/X2 passing on the archived ×2 record.
- After gating, the scan handler sets `disable=true` on non-picked, non-constant entries of the `lore_select` books **only
  when** this generation's selection exists and every chunk answered (the cache condition, `loreSelect.ts:79`). A timeout,
  an unavailable judge or a refused force leaves the keyword scan as it is, never an empty book.
- Picks are never disabled (a disabled copy is skipped before the force, 05-H6). Entries in the story's gated set are never
  suppressed: the checkpoint's authored intent wins.
- Suppression changes the copy's JSON, so it changes the timed-effects hash (05-H5, `world-info.js:4628-4633`). This
  happens both when a key is added and when an existing `false` is flipped. L5 therefore never suppresses an entry that has
  sticky/cooldown/delay authored or an active timed effect. It never adds a missing `disable` key either; such entries are
  counted in `missingKey`, as in `scanGatePlan.ts:69-77`.
- The ENTRIES_LOADED handler also runs for non-scan `getSortedEntries` callers: vectors `activateWorldInfo`
  (`vectors/index.js:1629`, which skips `entry.disable` and deletes vector items absent from the view, `:1646-1649`,
  `:1679-1690`) and the `world-info.js:1017` caller. Exclusive suppression applies only to the main loud scan, otherwise it
  must be proven harmless by X5.
- Route: lore-select is a TypeSafe judge call (`loreSelect.ts:70`), which plan 13 leaves out of its scope. Each record
  names the judge host and model. A cross-host comparison is optional extra evidence, never a floor change.

| # | Condition (floor predeclared, never retuned) | Pass |
|---|---|---|
| X1 | Recall: new fixture, ≥ 30 scripted turns over two stories, EN + ≥ 8 ES, each turn with authored "needed" entries; same turns both arms, T12 ring as the activated set | exclusive recall ≥ 0.85 **and** ≥ keyword+force recall − 0.05 |
| X2 | Noise | non-needed activations per turn ≤ 0.7 × the keyword+force arm |
| X3 | Fallback: judge off, timeout forced, force refused | activated set == keyword scan, 3/3 |
| X4 | Gated intent: a gated-on entry the judge did not pick | still active |
| X5 | Vectors WI enabled across 10 exclusive turns | 0 `deleteVectorItems`/`insertVectorItems` calls caused by suppression, ×2 |
| X6 | A sticky lore_select entry that fires and is then not picked | stays active for its sticky span, and its cooldown is honoured, ×2 |
Fail on X1, X2, X5 or X6 → recorded not built; the flag is removed before plan 10.

### L6 — Mirror key hygiene: make it measurable, rule unchanged
- Step 0 answers why no book appeared: log per sync whether it ran and `live.length` (`memoryMirror.ts:100-102`). The
  predeclared read: no relationship row was live at any sync, or no sync ran.
- New fixture `live-v25-08-mirror-rate.json`: a story whose roster invites relationship claims, ≥ 25 real turns, cadence 2,
  so consolidation (boundary 10, 20) and a scene break both run. The rows come from the memory model, so the record names
  the `read` and `synthesis` role routes (`extraction/passRole.ts:1`; plan 13 may route them). A cross-family run is
  optional evidence, never a floor change.
- Sample floor (predeclared): ≥ 5 `so_` entries each eligible in ≥ 20 loud generations. Below it after 2 attempts → record
  "unmeasurable" with the counts, change nothing.
- Rule unchanged: strip (`v2.4/05-world-info.md:133-141`) only at median rate ≥ 0.8. Runs after L1 so the rate is measured
  on the path that ships.

### L7 — R14 lore contradiction in the warden (judge use; v2.4 rule 4)
- A new use `judge.uses.wardenLore`, off by default, needs `stagecraft.wardenEnabled`. `WardenInput` gains `lore: {comment,
  text}[]`: the story-book entries that fired on **this** reply's generation (T12 slot; activation observed, never inferred),
  capped at 8 entries × 600 chars (`LORE_CONTENT_CHARS`).
- Content source: the evidence observer keeps `content` for story books only (requirements ∪ gated ∪ `lore_select`), never
  for mirror entries (those are facts already) and never for foreign books. The ring stays in memory.
- The finding is the existing one-turn note path (`continuityNote`, depth 0). Never a reroll, never a write.
- `sends` copy for the new use and a privacy-report row: authored lore text + the reply now cross to the judge.
- Phase A fixture `test/fixtures/judge/warden-lore.json`: ≥ 24 (reply, lore) cases, ≥ 6 ES, incl. negation pairs and
  replies that never touch the lore. 3+ real replies from archived records.

| # | Family | Floor (predeclared) |
|---|---|---|
| R1 | contradicts lore | recall ≥ 0.85 |
| R2 | consistent / untouched | specificity ≥ 0.966 (the warden's bar, `v2.4/07-judge.md:415`) |
| R3 | judge-off column | facts-only warden arm on the same replies, reported beside it |
| R4 | latency | the warden call stays within `CONTINUITY_TIMEOUT_MS` 4000 at p95 over the live run, and J2's predeclared timeout bar (at most 1 per 50 warden calls over at least 100) with `wardenLore` on |
| R5 | regression in the combined request | with the lore family present, re-run the continuity, agency (`test/fixtures/judge/agency.json`) and house-rules (`house-rules.json`) fixtures: every existing family at its existing floor (`v2.4/07-judge.md` §6). Any family below its floor → lore goes in its own call (arm B, `WARDEN_ARMS` "separate"), measured again, never a floor change |
| R6 | over-steer | the probe from v2.4 plan 01/07, rubric `v2.4/07-judge.md:1433`: the reply after a lore note must not restate it or swing past it; the warden-facts arm is the baseline (X26); predeclared, live-only, part of the ×2 run |
Below any floor → recorded not built. The route is the judge host + model, recorded per call.

## Decisions taken in this draft (on evidence; the user can overturn any)

| # | Decision | Evidence |
|---|---|---|
| D1 | L1 appends from an in-memory copy refreshed on sync and `WORLDINFO_UPDATED`, not from memory rows | the handler must stay synchronous (`stHost/worldInfoScan.ts:12-14`); the book is what an author edits |
| D2 | A character-bound book satisfies a requirement only when bound to every enabled roster member (solo: the character); otherwise it reads as missing with `satisfiedBy` naming the gap | character lore follows the **drafted** member (08-H3), so a partial binding is a turn-dependent requirement |
| D3 | L3 not built | 05-H17 + sun-ruins already uses `characterFilter` |
| D4 | L4 and L5 default off, each its own install-wide switch; the L5 story flag alone never enables suppression | they change what fires on every turn; inv 7 spirit; every judge usage its own install-wide opt-in |
| D5 | L6 keeps the 0.8 median and adds only a sample floor | `v2.4/05-world-info.md:294-295` fixed the rule; three runs could not reach it |

## Order of work
0. Host facts 08-H1..H6 on 1.19.0 and statically on 1.18.0; L6 step 0 log on an archived J7 replay.
1. Red first (jest): L1 append + owner guard + no-double; L2 each binding source + D2 partial; L4 registry guard + its
   negative control; L5 suppression, fallback and gated-intent cases; L7 request shape and the content cap.
2. L2 (no scan seam needed). 3. L4. 4. L1 (only if plan 01 ships scan mode; otherwise recorded not built). 5. L5. 6. L6
   run. 7. L7 Phase A, then the build only above its floors. L7's live run happens after plan 06 J2 closes; if J2 is still
   open, J2's measurement includes a `wardenLore`-on arm.
8. `.claude/rules/architecture.md` lines for the mirror binding and requirements; gate record.

## Tests

- **Jest:** the step-1 cases; `scanGatePlan` property test extended with an appended mirror book (the gate must never
  touch `so_` entries); requirements over a fake host with each binding source.
- **Mutants** (`test/findings/mutations/v25-08.txt`; each deletion fails its own case): the L1 owner check, the
  no-double check, the D2 every-member check, the L4 registry guard, the L5 "every chunk answered" condition, the L5
  gated-set exemption, the L7 story-book filter on content capture.
- **Negative controls:** L1 with the owner guard stubbed true must leak in U1's branch case; L4's guard with `epistemic`
  scannable must fail; L7's fixture scored with the lore removed from the input must fall below R1.
- **Census:** a `checked` row for the mirror-cache refresh if it awaits; fault-matrix cells for `mirror|chatSwitch` and
  `wiEvidence|content` with citations.

## Live gates

Real LLM, lane copies only (rule 10), run-header capture/diff around every batch, `--strict`, ×2 consecutive where marked.
Records: `test/journeys/records/v2.5-plan08/live-<bundle12>/`.

| # | Gate | Pass |
|---|---|---|
| G-L1 | U1–U7 | as tabled; U1–U7 ×2 (U6 is a live mirror fixture too) |
| G-L2 | a story whose lorebook is only chat-bound, then only persona-bound, then bound to one of two members | ready, ready, missing (D2); `satisfiedBy` correct; both modes; ×2. File-mode leg, two predeclared outcomes: (a) story book bound to the slot first, then adoption — the requirement reads ready, the mirror binding is recorded `occupied`, and the author view names the conflict; (b) mirror bound first, then the author binds the story book through ST's UI — the displacement is detected (0 `mirror`-origin activations over a keyed turn in the T12 ring, plus the author-view notice), never silent |
| G-L4 | P1–P3 | as tabled, ×2 |
| G-L5 | X1–X6 | ×2 consecutive on one bundle, same fixture and turns both runs; a floor miss in either run = recorded not built (no retune). Extra column: `loreExclusive` off with the story flag on, where the activated set must equal the keyword+force arm, 3/3 |
| G-L6 | mirror-rate fixture | ×2 consecutive; pass requires the mirror book to exist and hold ≥ 1 `so_` entry in both runs (step 0 must explain and fix a missing book before the run counts). The 0.8 strip rule is applied only when the sample floor is met; otherwise record "unmeasurable" with the counts and change nothing, and P08 is then PARTIAL, not green |
| G-L7 | Phase A live replies + J8 with `wardenLore` on/off | floors R1–R4; judge-off column recorded |
| G-J | J3 ×2 and J7 ×2 in scan mode with L1 on | green strict |

Machine gates: typecheck, typecheck:test, lint, test, debug:typecheck, build, test:release, test:debug, Storybook runner
(Studio `exclusive` toggle, author requirements view), then `st-session.mts reload`.

## Risks
- **An appended entry is a new host shape.** 08-H1 is read, not yet exercised; U2/U4 are the proof. A future ST that freezes
  or copies the arrays after the event would drop the mirror silently; the T12 ring (`mirror` origin count 0 over a
  keyed turn) is the detector, and `absent` falls back to file mode.
- **Exclusive mode can hide needed lore.** Mitigated by the fallback-on-any-doubt rule and X1's recall floor.
- **`scan:true` makes memory text a lore trigger:** a wrong fact can pull lore. Opt-in, and P2 reports the effect.
- **Budget:** L7 and the L5 schema field touch `stagecraftCoordinator` (601/620) and the manager (740/740). A line that
  does not fit is budget-blocked and routed to plan 03 (rule 12), never squeezed.
- **Save race** (plan 02 C2) can wedge a lane mid-gate; the series re-runs in full (overview sequence).

## Unresolved questions
- **Q1** L1: in scan mode, keep writing the mirror book (recommended: author visibility, reaper, file-mode fallback) or
  keep the rows in memory only and create no book?
- **Q2** L2/D2: accept "bound to every enabled member", or let a story declare a member-scoped requirement?
- **Q3** L3: is there a member rule ST's `characterFilter` cannot express? Without one it stays not built.
- **Q4** L4: install-wide switch (drafted) or per story?
- **Q5** L7: send authored lore text to TypeSafe under a new opt-in? It is a new privacy-report row.
