# Implementation Overview — Story Orchestrator v2.5: gate lore by view, close what v2.4 measured open

**Status: DRAFT 2026-09-25 — awaits user approval.** Plan docs 01 and 02 are written. Plans 03–10 are outlines here.
Each gets its own doc only once its evidence exists (a spike verdict, a measurement, or a user decision). Nothing in
this file is built. Verified against master `1ad1a5f` (v2.4 plans 06/08 merged as `3dd039b`; their docs are unchanged
from `39aa6b5`). **Reconciled 2026-09-25** with v2.4 E9 (no downgrade or compat work before a public release) and the three
research docs under `research/`: plans 11 (legacy removal) and 12 (release and packaging) were added, rule 3/9 and V7 were retired,
and the production-readiness checklist became plan 10's gate table.

v2.4 made the extension correct under the host as it really is. Its one spike, T13 scan-time World Info gating,
passed all nine predeclared conditions (`v2.4/05-t13-spike-report.md:3`). v2.5 ships that path, which is the only
design here with a measured end state. It also closes the defects and limits v2.4's gate records name. Everything
else the research proposed stays a spike or a question until measured.

## Inputs

1. **v2.4 gate records**: plans 01–08 (`docs/plans/v2.4/0*-*.md`), the spike report, and `v2.4/host-facts.md`. They are
   the source for every carry-in row below.
2. **`v2.4/00-overview.md`** §Out of scope (`:338-363`), D10 (`:396`), D12 (`:398`), X19 (`:447`), X24 (`:452`) and X25 (`:453`).
3. **`v2.4/extension-research/SUMMARY.md`** "Next tier" (`:609-619`) and §7/§8/§11 (`:206-273`). This is research, not
   evidence (v2.4 rule 1).
4. **`v2.3/v2.4-seeds.md:26`**: the plan-10 spikes "recorded as not built rather than shipped unmeasured".
5. **Not yet available:** `docs/plans/v2.4/v2.5-seeds.md`. v2.4 plan 09 owes it (`v2.4/09-acceptance.md:191-198`), and it
   does not exist on any branch. See V6.
6. **`research/legacy-inventory.md`** (H/A/C/I/T/D rows, the v5 reset target, removal order), **`research/code-health-audit.md`**
   (H1–H3, M1–M6, L1–L5 on master `1b4e642`) and **`research/prod-readiness-criteria.md`** (the predeclared checklist).
7. **User decisions 2026-09-25**: "this plugin has never been released to the public … no downgrade leg is needed … I want it
   to be prod ready at the end of 2.5"; and chat story state may be reset, only the debug-run logs matter (v2.4 E9).

## Entry condition (V1)

v2.5 building starts after v2.4 plan 09 closes: accepted, or each remaining row a deferral the user signed off (the
v2.3 rule 14 shape v2.4 used). Evidence that v2.4 is still open, as of 2026-09-25:
- plan 06's live gates are not run (`v2.4/06-steering-stagecraft.md:309,359`), nor are plan 08's (`v2.4/08-author-observability.md:447`);
- plan 02's last open item, the downgrade leg, was dropped by the user (v2.4 E9), so plan 02 no longer holds the entry condition;
- plan 09 is "DRAFT … Not run" (`v2.4/09-acceptance.md:3`).
X19 sent 05b to v2.5 precisely so v2.4's acceptance would stay stable (`v2.4/00-overview.md:447`).

## Rules for every v2.5 build agent

Inherit v2.4 rules 1–8 (`v2.4/00-overview.md:43-87`) and its reconciliation X1–X26, **except rule 3 and X1** (no chat-blob
version bump), which existed for downgrade safety and are retired by E9. The deltas:

9. **Until the first public release, a persisted-shape change is a version bump plus a reset, never a migration.** The chat
   blob takes a new `KNOWN_VERSIONS` value and anything else goes through the unreadable path (read detached, never written,
   a confirmed Restart replaces it: `persistence.ts:121-125,169-175`, `storySelection.ts:115-131`). Install-wide settings get a
   `schema` stamp (plan 11); their sanitizers stay defensive (a malformed field falls back to its default), but carry no
   history branches. Nothing is built to be read by an older build.
10. **A write to a user's lorebook file outside a chat's own path needs an author confirm and a lane-copy live gate.**
    No gate normalises or rewrites books on the user's live install. A lane is a copy
    (`.claude/rules/debug-scripts.md`, Parallel lanes).
11. **No wall-clock floor in jest.** A cost claim is a structural bound in jest (passes, calls, allocations) or a
    measured p95 in a live probe. Evidence: the 5 ms `windowHygiene` floor (`src/extraction/windowHygiene.test.ts:190-201`)
    flaked under load three times (`v2.4/04-extraction-input-quality.md:533-534`, `v2.4/07-judge.md:1124`,
    `v2.4/08-author-observability.md:429`).
12. **A fix blocked by a line budget is recorded as budget-blocked and routed to plan 03, never squeezed in.** Evidence:
    `judge.uses.memoryPairs` was left unwired because `memoryCoordinator` had no line to spare (`v2.4/07-judge.md:1059-1062`),
    and a rule withdrawal went lazy for the manager's 4 lines (`:1226-1227`).
13. **Touching a function with a `checked` census row re-reads every write after each of its awaits.** C1 in plan 02 is a
    `checked` row with an unchecked write after its await (`src/runtime/effectsApplier.ts:383-384`,
    `test/findings/ownership-sites.json:252-254`). This is the census gotcha (`.claude/rules/gotchas.md`, "A `checked` row …").

## Plan sequence

| # | Plan | Items | Depends on | Bucket | Doc |
|---|---|---|---|---|---|
| 11 | **Legacy removal** (runs first) | blob v5 + reset-on-unknown, delete `persistenceMigration` and the v2/v3 branches, required `provenance`/`engineHistory`/`visitedPath`, library id-only, settings history lifts, authoring aliases → validation error with a hint, `schema: 1` stamp, one-time cleanup on this install and the lanes | V1 | L | outline |
| 01 | **WI scan-time gating** (the spike's `05b`) | real-book normalisation behind a confirm, ledger verify/provenance/restore, normalise-then-activate, mode control + capability + Repair, inv 14 rewording | 11 | W | `01-wi-scan-gating.md` |
| 02 | **Carry-in** | C1 in-flight generation (the ownership check itself lands in v2.4, U5), C2 save race (diagnose, then guard), C3 `hiddenRuns` chat keying, C4 stale host facts, C5 intermittents (conditional) | 11 | H, T | `02-carry-in.md` |
| 03 | **Code health and budget headroom** | prod-readiness S2–S8, T1–T4, E1, E2, E4, F2, F3, Q1t, Q3t: extraction to budgets (V4), every prod file budgeted, host deps injected, no cycles/dead/duplicate helpers, one logger, snapshot memoised, no wall-clock tests | 11 | T | outline |
| 04 | **Memory contradictions, second pass** | polarity/negation, low-overlap-low-cosine miss, ordinary rows under the band, `memoryPairs` on the write path (Phase A) | 03 | X, J | outline |
| 05 | **Extraction and off-path follow-ups** | FACT/MEMORY window check (X26 seed), whole-scene epistemic/ledger, reasoning-template strip, rpm/mutex, constrained decoding, token estimate | 02 | X | outline |
| 06 | **Judge: hosts and next uses** | D10 hosted routes (user's call), boundary bundle, tension read, pre-reply Choice, R16 disagreement record, v2.3 plan-10 spikes | 03 | J | outline |
| 07 | **Author tools** | per-message inspector (D12), `{{story_quality::<key>}}` (X24), Studio gate replay, CC `promptManager` breakdown | V1 | U | outline |
| 08 | **Lore on the scan seam** | unbound mirror, bound-book requirements, member-scoped lore, per-tier `scan:true`, lore-select "exclusive", mirror-key measurement, R14 lore contradiction | 01 | W | outline |
| 09 | **Research spikes** (the user picks) | swipe-back cache, re-commit after rewrite, roster aliases, append-only short_term, story-owned scenario, complication pool (+R13), seeded chance gates, write tiers, witness filter, tool-call policy | per item | S, X | outline |
| 12 | **Release and packaging** | prod-readiness R1–R6, D1–D4, F1, P1–P3, U1–U2, A1, A2, Q2t, E3: release artifact + allowlist, one version, clean `dist/`, debug surface out of the prod bundle, Studio lazy chunk, `.debug/` out of `public/`, user docs, privacy section, CI | V1 | R | outline |
| 10 | **Acceptance** | v2.4 plan 09's shape, scan-mode journeys, and the production-readiness checklist as a gate table | all | — | outline |

11 runs first: it deletes read branches and narrows the types every later plan touches, and it frees `memoryCoordinator`
and manager lines (legacy inventory §5 ranks 2–3). Then 01 and 02 run in parallel (different subsystems). 03 comes before
04 and 06, because both need coordinator lines. 07 is independent. 08 waits for 01. 12 is independent of all of them and
can start at once, except that its bundle budget (F1) is measured after 03's extractions. Each item in 09 is its own spike
with predeclared conditions, the T13 pattern.

## Plan outlines (03–10)

### 11 Legacy removal (runs first)
- **Source:** `research/legacy-inventory.md` §2–§5, measured read-only on this install (59 old blobs, 8 fixed-name mirror
  books). Every H row is our own history; none protects a user (E9).
- **Target (§3):** blob **v5**, `KNOWN_VERSIONS = [5]`; the fields that are optional only for old blobs become required
  (`engineHistory`, `engineState.visitedPath`, row `provenance`, expansion `contract`/`origin`, `pinnedStory`). Every other
  version takes the existing unreadable path, and `unreadableNotice` loses its "newer build" branch.
- **Order (§4):** the policy bump → H1/H2/H3/H5 (the migration module and v2/v3 branches) → H10/H11 (required provenance, the
  pin prompt and its census row) → H6/H7/H9 (library and settings history) → the small rows → A1–A3/A7 → debug and docs rows →
  the one-time data actions.
- **Decisions (V10):** the library is kept; old chats get a notice and a confirmed Restart; the old books move to a backup
  folder outside the ST tree, never deleted; aliases become a validation error with a did-you-mean hint.
- **Done:** 0 H rows open (prod-readiness S1), `npm run typecheck:test` green (jest does not type-check), J10 ×2 on a re-seeded
  lane (select, hydrate, restart, unreadable → Restart).

### 12 Release and packaging
- **Source:** `research/code-health-audit.md` H1–H3, M5, L5, §6–§7; `research/prod-readiness-criteria.md` R, D, F1, P, U, A, Q2t.
- **Install:** today ST's installer clones a repo whose `dist/` is gitignored while `manifest.json` sets `auto_update: true`,
  so an install has no bundle and an update never rebuilds. The artifact is an allowlist (manifest, `dist/**` current build
  only, LICENSE, README, CHANGELOG, `examples/**`, `server-plugin/**`), one version everywhere, `output.clean`. Distribution
  form is U6.
- **Debug surface:** the 12 `storyOrchestratorDebug*Response` globals silently replace real model output. They, the runtime
  handle and the ~82 KB of measurement code leave the prod bundle behind a build flag (V11). The harness runs on a dev build.
- **Served tree (P3):** done for the browser profile on 2026-09-25 (`0e1bbbe`: `browserProfileFor` puts it under
  `<so-lanes>/0/chromium-profile`; the old `Login Data` URL now answers 404). Still served: the rest of `.debug/` (run logs,
  journals and payload captures, which hold chat text) and `docs/`/`test/`. This plan moves the default `SO_DEBUG_DIR` out
  of `public/`, the way the lanes already are; a release artifact without them closes it for users.
- **Bundle (F1):** ≤ 1.25 MB main entry with Studio + cytoscape as a lazy chunk (V11), webpack `performance` set to it.
- **Docs:** install without npm, first run, uninstall/cleanup (mirror lorebooks, wizard assets), troubleshooting, supported
  ST versions, a privacy section (what each role sends where; the judge sends `state` to TypeSafe), changelog 2.4/2.5.
- **CI:** every gate on push to master.

### 03 Code health and budget headroom
- **Targets (prod-readiness S2–S8, predeclared, never retuned):** manager ≤ 700 and every coordinator ≤ 560 effective lines
  with the constants unchanged or lowered; every prod file ≤ 600; 0 functions > 150 lines or > 40 branches; 0 lines > 200
  chars; 0 `@services/STAPI` imports under `coordinators/`; 0 import cycles; 0 dead exports; one definition of each shared
  helper. Each new guard lands with a negative control.
- **Comments (T3, V11):** plan/ticket/date narration goes; host-fact `file:line` citations and JSDoc on host seams stay, allowlisted
  by a scanner guard.
- **Budgets:** `MANAGER_LINE_BUDGET = 740` and `COORDINATOR_LINE_BUDGET = 620` (`src/runtime/architecture.test.ts:17-18`).
  Measured with the test's own formula: manager **736/740**, `memoryCoordinator` **619/620** on master HEAD, and the same on
  the 06/08 integration branch. Every v2.4 plan cites 736–737 and 619 (`v2.4/06-steering-stagecraft.md:344`,
  `v2.4/07-judge.md:913`, `v2.4/08-author-observability.md:433`).
- **Direction (V4): extract, do not raise.** The first candidate is the memory-queue wiring (`queueDeps()`, which
  `v2.4/07-judge.md:1059-1062` names) and the warden's deps, which plan 07 already moved once (`:1213`). The design is written
  after reading the file, not here.
- **Harness:** replace the wall-clock `windowHygiene` bound (rule 11), unless v2.4 plan 09 already did, which
  `v2.4/07-judge.md:1124` routes to it.
- **Done:** the S2–S8 targets above, T1–T4, E1/E2/E4, F2/F3 and Q1t/Q3t from the checklist; `npm test` ×3 under a parallel load
  with no timing failure.

### 04 Memory contradictions, second pass
- Limits as recorded (`v2.4/07-judge.md:1094-1101`):
  - a contradiction with Jaccard < 0.4 **and** cosine < 0.55 is missed;
  - there is no polarity/negation check, and polarity barely moves a sentence embedding (`:1020-1022`);
  - agreeing paraphrases of an established row are held;
  - two ordinary (non-established) rows that disagree still slip under the vectors band.
- **Candidate:** the `judge.uses.memoryPairs` release on the write-path hold. It exists, is off by default, and is wired only
  into consolidation (`:1059-1062`). It is a judge use, so v2.4 rule 4 applies: a ≥ 20-case fixture with a Spanish slice
  including negation pairs, a predeclared floor, and a judge-off column. A deterministic negation-token screen is measured as
  the no-judge arm first.
- **Open questions carried from plan 07** (`:973-974`): should `isEstablished` count a story-authored seed? Should the copy
  say "a character claimed"?
- Needs 03 (the `MemoryQueueDeps` line).

### 05 Extraction and off-path follow-ups
Each needs its own measurement before a build. None has one yet.
- **FACT/MEMORY evidence window check** (X26 seed): facts are stamped `messageId: audit.window.to` and never screened
  (`v2.4/04-extraction-input-quality.md:32-39`). It moves quarantine attribution and the facts tier together, so it needs
  its own predeclared floor. The facts tier stands at 0.727 against a 0.68 floor and a 0.85 target (`:676-678`).
- **Epistemic/ledger over the whole scene**: today they run on the detecting window only (`v2.4/03-off-path-call-hygiene.md:41,363-364`;
  `src/runtime/coordinators/extractionCoordinator.ts:369-374`).
- **Theme-3 items marked "not scheduled"** (`v2.4/03-off-path-call-hygiene.md:37-40`): constrained decoding (the `json_schema`
  trap), rpm spacing / generation mutex, and the reasoning-template strip.
- **Token estimate:** it uses the main API's tokenizer (03-H11) and runs about 1 % low (`:1006-1008`), inside the 10 % margin.
  Only a measured overrun on a non-textgen profile reopens this.
- **Theme-4 extraction items** (`v2.4/04-extraction-input-quality.md:43-45`): current values in the prompt, signed `+5`,
  min/max step, negative memory, full restatement, `[intends]`, witness sets.

### 06 Judge: hosts and next uses
- **D10 hosted routes** (NanoGPT, OpenRouter) and local Jev-likes: the model-id map "takes them in v2.5"
  (`v2.4/07-judge.md:49,252-253`). Each host adds a second third party per call, plus a calibration per host × model
  (`v2.4/00-overview.md:396`). **This is the user's call (U2).** Nothing on this install needs it.
- **Judge-shaped candidates** (`v2.4/07-judge.md:52-53`; SUMMARY `:268-270`): the boundary judge bundle, the judge tension
  read, the pre-reply player-message Choice, and the R16 disagreement record. The v2.3 plan-10 spikes (`v2.3/v2.4-seeds.md:26`)
  also belong here: scene-break confirmation, canon verify, epistemic via the judge, and the rest.
- Every one is its own Phase A under v2.4 rule 4. Here the pre-reply Choice is the cheapest (SUMMARY `:270`, 2/S-M); the
  seam exists (`loreSelect` after `MESSAGE_SENT`).
- `sceneOoc` / `memoryRerank` come back only through a new Phase A at the v2.2 floors (`v2.4/07-judge.md:290-292`).

### 07 Author tools
- **Per-message inspector** (`.extraMesButtons`, D12): v2.4 used `/chat-jump` instead (`v2.4/00-overview.md:398`). It is
  author-only, so rule 7 is not triggered. Build it only if the jump proves too coarse in an author session.
- **`{{story_quality::<key>}}`**: needs a new-engine-only seam (`registerMacro` with `unnamedArgs`), and resolves to
  literal text on a legacy-engine install (`v2.4/08-author-observability.md:47-48,420`). The per-key form ships
  (`runtime/qualityMacros.ts`). The ST default for `experimental_macro_engine` has to be verified first (gotchas: measured ON
  here, 2026-09-20).
- **Studio gate replay** over recorded blackboard history, with no LLM (SUMMARY `:273`, 3/M).
- **CC `promptManager` bucket breakdown**: CC-only (`v2.4/08-author-observability.md:40-41`); waits for a CC profile in the
  live gates.

### 08 Lore on the scan seam (after 01)
- The **unbound mirror** (no chat-slot competition, no branch leak), **member-scoped lore**, and **requirements satisfied by
  chat/character/persona-bound books** (SUMMARY `:195,201`; `v2.4/05-world-info.md:32-33`). Today requirements read the
  global selection only (`src/runtime/requirements.ts:16-20`).
- **Per-tier `scan:true`** (never epistemic, inv 15) and **lore-select "exclusive"** with its own recall floor
  (`v2.4/05-world-info.md:36-40`).
- **Mirror key hygiene**: unmeasurable in v2.4, because J3/J7 never create a mirror book (`:398-400`). This needs a session
  long enough to reach a scene-summary sync. The 0.8 median rule stands and is not retuned.
- **R14 lore contradiction in the warden** (SUMMARY `:271`): needs T12's ring, which is built, plus its own fixture.

### 09 Research spikes (the user picks; each is a spike with predeclared conditions)

| Candidate | Source | Why a spike, not a build |
|---|---|---|
| Swipe-back cache | SUMMARY `:143`; `v2.4/02-*.md:44` | "fingerprints cannot deliver it". The key must be a text hash |
| Re-commit after a third-party rewrite | SUMMARY `:142`; `v2.4/02-*.md:45` | recast emits `MESSAGE_EDITED` per rewrite; today that is a rollback |
| Roster aliases / canonicalisation | SUMMARY `:209` | touches director, epistemic and memory keys at once |
| Append-only short_term | SUMMARY `:206` | a rollback-locality claim, to be measured against `rollback ≡ replay` |
| Story-owned scenario | SUMMARY `:219`; `v2.4/06-*.md:36-37` | a per-chat `chat_metadata.scenario` override through `withLedger` |
| Complication pool (+ R13 adversity read) | SUMMARY `:222,226` | R13 only after the pool exists |
| Seeded chance gates | SUMMARY `:223` | needs an RNG seam; replay determinism |
| Write tiers / protected spans, category digest | `v2.4/06-*.md:36-37` | curator scope change (inv 6) |
| Interceptor trimming / witness-filtered transcripts | SUMMARY `:212` | re-decides "no message-level hiding" (SUMMARY open question 9, `:795`) |
| Tool-call policy, post-processor rewrites | `v2.4/01-carry-in.md:43` | no fixture yet |

### 10 Acceptance
- v2.4 plan 09's shape, with rules 11–13 of v2.3 applied: archived records, "twice" meaning consecutive, `--strict`.
- Added: every journey in scan mode (plan 01 G3/G4), a clean host for each ST version the README claims (V10: the latest
  stable ST at release), the plan 02 C1 live proof of the generating branch, the human sessions (below), and
  **`research/prod-readiness-criteria.md` as a gate table**: every row met or a deferral the user signs off, never loosened.

## v2.4 residue: enters v2.5 only if v2.4 plan 09 defers it

These are v2.4's to finish. A row moves here only by a deferral the user signs off, and then it goes to the plan named.

| Item | Record | Plan if deferred |
|---|---|---|
| Plan 06 live gates (T16, T17, seed A overlay) | `v2.4/06-steering-stagecraft.md:309,352-356` | 10 |
| F5 curator `create`: Phase A not run live | `v2.4/06-steering-stagecraft.md:323` | below its floor → recorded not built (not a v2.5 item); not run → 06 |
| Plan 08 live gates; T18 per-role calibration | `v2.4/08-author-observability.md:446-447` | 10; calibration → 06 |
| ~~Plan 02 downgrade leg~~ | dropped by v2.4 E9 (user, 2026-09-25) | none |
| Plan 07: agency and house-rule effect on replies (needs a control arm) | `v2.4/07-judge.md:1350-1356` | 06 |
| Plan 07: in-flight call missed by the journey meter; TypeSafe terms row; warden 4 s timeout | `v2.4/07-judge.md:1399-1401,1437,1027-1028` | 03 / 06 |
| Plan 01: phantom outermost mitigation not built; T1 hashing cost unmeasured | `v2.4/01-carry-in.md:637-643,571` | 02 |
| Plan 02: hidden re-read report, requirements-refresh group/lorebook halves, solo `CHAT_DELETED` fixture | `v2.4/02-*.md:910,700,774` | 02 |
| Plan 03: `storyStart` live check | `v2.4/03-off-path-call-hygiene.md:943-947` | 02 |
| Intermittents J6.4 / J6.7 / J5.8 / J8.5 | `v2.4/01-carry-in.md:819-822` | 02 C5 |
| Wall-clock flake | `v2.4/07-judge.md:1124` | 03 |

## Human sessions (not a plan item; where they sit)

- **v2.1:** "automated matrix GREEN; human-eval sessions OPEN" (`v2.1/08-acceptance.md:58`), "the user's to play and score" (`:63-64`).
- **v2.3:** L1 (the P0′ playthrough) and L7's human legs are not run (`v2.3/11-acceptance.md:1012-1013`). Outstanding since
  2026-08-13 (`:16`).
- **v2.4:** "The user runs both sessions" (`v2.4/09-acceptance.md:167`), player (adventurer) and author (academy). Without them
  plan 09 is PARTIAL (`:180`).
- Waiting on them: every rule-7 item (player-facing surface), the D6/T22 default revisit (`v2.4/04-*.md:403-404`), the
  over-steer rubric rows (`v2.4/07-judge.md:1433`), and plan 07's inspector decision. v2.5 adds no new session type. It reuses
  v2.4's two and adds a scan-mode note to the author session's rubric.

## Decisions made on evidence (2026-09-25; reversible, the user can overturn any row)

| # | Question | Decision | Evidence |
|---|---|---|---|
| V1 | Entry condition | **After v2.4 plan 09 closes** | §Entry condition |
| V2 | What is plan 01 | **Scan-time gating**, as the only full build besides carry-in | T13 PASS S1–S9 (`v2.4/05-t13-spike-report.md:3-25`); every other candidate is unmeasured |
| V3 | NPC-reply ownership (C1) | **v2.5 plan 02**, fixture first; the stop is built only if a reply is shown landing in the next chat | `effectsApplier.ts:383-384`; `faultMatrix.json:440-442`; the census note "trigger branch … still unproven live" (`ownership-sites.json:254`) |
| V4 | Budgets at 736/740 and 619/620 | **Extract, do not raise** | `architecture.test.ts:17-18` came in with v2.1 plan 03's coordinator split (`.claude/rules/gotchas.md`, "v2.1 plan 03 runtime layout"); raising it removes the pressure that showed `memoryPairs` blocked |
| V5 | Wall-clock tests | **Structural bounds in jest; p95 in live probes** (rule 11) | three recorded flakes (rule 11) |
| V6 | The v2.5 seeds file v2.4 plan 09 owes | **This overview is the plan set.** When plan 09 writes `v2.4/v2.5-seeds.md`, any row missing here is added by a reconciliation section, not the reverse | `v2.4/09-acceptance.md:191-198`; the file does not exist |
| V7 | Chat-blob version bump in v2.5 | **Yes, to v5, in plan 11**, with reset-on-unknown (rule 9). Superseded the earlier "none" | v2.4 E9; `research/legacy-inventory.md` §3 |
| V8 | Research candidates | **Spikes with predeclared conditions, never direct builds** | the T13 path (X19 → spike → PASS → plan 01) is the one research item that reached a build plan on evidence |
| V9 | Judge-shaped items | **v2.4 rule 4 unchanged**: own Phase A, own key, off by default, judge-off column | `.claude/rules/architecture.md` "The judge never blocks and never writes"; `v2.4/00-overview.md:65-69` (rule 4) |
| V10 | Legacy inventory Q1–Q6 | Q1 the library is **kept** (only chat state resets). Q2 old chats: the unreadable path's **notice + confirmed Restart**, never silent replacement. Q3 the 8 fixed-name and unmarked per-chat mirror books are **moved to a backup folder outside the ST tree**, not deleted. Q4 the declared minimum is **the latest stable ST at release**, verified by a clean host; 1.18.0 is kept only if a full acceptance runs there. Q5 after the first public release, **real migrations** (the `schema: 1` stamp is the baseline). Q6 aliases are **removed**, and an unknown key is a validation error with a did-you-mean hint | E9 (user); the unreadable path already exists and is tested (`blobUnreadable`, J10.13); a moved file can be restored, a deleted one cannot |
| V11 | Code-health questions that are engineering calls | Comments: narration goes, host-fact citations and host-seam JSDoc stay (allowlisted). i18n: **English-only for 2.5**, stated in the README. `fetch` wrapper: **kept**, because it refuses the measured empty-chat-under-another-id write (v2.4 plan 02, `.claude/rules/gotchas.md` "ST binds a chat save…"); E3's live check with two other fetch-wrapping extensions is its evidence. Debug handles and response globals: **dev builds only**; prod keeps `talkControlInterceptor` and at most one read-only handle. Bundle: **≤ 1.25 MB** main entry with Studio lazy | `research/code-health-audit.md` M1, M5, M6, H2; `research/prod-readiness-criteria.md` open questions 1, 3, 4, 6, 7 |

## Questions that are the user's

- **U1** Plan 01: approve normalising real library books behind a confirm; the default for installs that never open the
  setting; keep or remove the file path; offer restore on story removal (`01-wi-scan-gating.md` Q1–Q4).
- **U2** Hosted judge routes (D10): wanted at all? If not, plan 06 covers only the judge-shaped uses.
- **U3** Which plan-09 spikes, and in what order (the table above)?
- **U4** Human sessions: when? They gate rule-7 surface, the D6/T22 revisit and the over-steer rubric in both v2.4 and v2.5.
- **U5** ~~C1's one-line ownership check~~ — built as a v2.4 fix (branch `644aa05`), merged after v2.4's plan 06/08 live gates,
  with its own live check ×2. v2.5 plan 02 keeps only the in-flight generation half.
- **U6** Distribution (prod-readiness R1/R2): a `release` branch with `dist/` committed (works with ST's installer and
  `auto_update`), GitHub release zips only, or both? It decides where the artifact lives on your GitHub.
- **U7** Judge key scope (P2): in multi-user ST, the env and `~/.typesafe` fallbacks are shared by every user. Drop them in
  multi-user installs, or document them as install-wide?

## Out of scope for v2.5

- **Refused, not deferred** (inherited): auto-reroll or swipe QA, judge-driven rewrite or recast, rules that run STscript, a
  browser-held judge key, and a judge probability deciding a state write (`v2.4/00-overview.md:340-345`; SUMMARY `:275`).
  Also per-checkpoint house rules and a Copilot/wizard op for `house_rules` (`v2.4/07-judge.md:54-55`).
- **Player-facing surface until the sessions run** (rule 7): the options menu, visible qualities, the cross-chat Continue
  list, a wand-menu entry, `player_summary`.
- **Multiplayer POV** (R10).
- **Not scheduled** (v2.4's own call, unchanged): preset drift read on `PRESET_CHANGED` (`v2.4/06-*.md:38`),
  context-horizon scoring, auto-tuning budgets (`v2.4/08-*.md:42-46`).

## Status

| Plan | Status |
|---|---|
| 00 overview | DRAFT 2026-09-25, reconciled the same day (E9 + research); awaits user approval |
| 01 | DRAFT written (`01-wi-scan-gating.md`); open: U1 |
| 02 | DRAFT written (`02-carry-in.md`) |
| 03–12 | outline only; a doc is written when its evidence or decision exists. 11 and 12 have their research docs as evidence |
