# Plan 61 — Harvest triage 2026-10-14

**Status: written 2026-10-14, revised 2026-10-16 against Astra's review (docs only).** Triage of every idea from the
2026-10-14 extension pattern harvest (`docs/plans/v2.8/extension-research-2026-10-14/SUMMARY.md` §Top ideas H1–H16, every H16
sub-item, plus the report items each plan picked up) and of every **not-yet-built** idea from the v2.4 harvest
(`docs/plans/v2.4/extension-research/SUMMARY.md`: T1–T25, Next tier, themes 1–11). The first pass verified "not built" on master
`9e96871d`; the 2026-10-16 revision re-checked every claim on master `e8b9dd6d` (plans 45/46/47/50/51/52/53, plan 60's
harvest fixes, 61b's Astra closed-plan fixes and the Claude bridge have landed since). Review:
`review-astra-harvest-2026-10-16.md` (base `167892d9`); finding → resolution in §Review 2026-10-16 (Astra).

**Defects B1–B19 (`_verification.md`) are not all fixed.** Plan 60 fixed B1–B3, B5, B6, B9–B16; B4, B7, B8 and B17 are
PLAUSIBLE and open (`60-extension-harvest-fixes.md` §Not built); B18 and B19 are REFUTED. Rows that depend on an open defect
say so: 69 K4 waits on B8, 69 K17 is B7, H12a is B4 (open).

Verdicts: **NEW** (its own plan: 62, 63, 65, 68), **BUNDLE** (plan 69, small hardening), **FOLD** (a section in the named
plan), **SKIP** (built, anti-pattern, superseded, or low value; reason given). "Built" in a destination means it landed after
the first pass; the plan's gate record has the evidence. Licences: most sources are AGPL/GPL/none, so ideas only, no code.

## Counts

- 2026-10-14 harvest, 47 rows (H1–H16 with sub-items): NEW 10 (62, 63, 65, 68), FOLD 27, BUNDLE 4, SKIP 6. Seven folds
  were built since the first pass (H11a, H11b, H12c claude part, H13a for 47, H14a, H14b for 52, H16d); H4d moved to SKIP
  as built.
- v2.4 harvest, 123 ideas checked: 61 built (no row; §Built), 62 not built: NEW 1, FOLD 13, BUNDLE 5, SKIP 43.
- Report items with no row in the first pass (§Report items added 2026-10-16): 82 rows (R1–R82): BUNDLE 13, FOLD 6,
  SKIP 63 (13 of them a B defect or an anti-pattern).
- Four extra items (x1–x4) are listed but not counted.

## Folds since the first pass

Astra's structural advice, taken where the evidence held (§Review):

| Was | Now | Why |
|---|---|---|
| 64 public sheet to the narrator | **v2.8 18 §Phase Q7** (sheet narration, "just happened", warn bands, header clause) + **v2.8 46 §Harvest 2026-10-16** (the rows are 46's `deriveRefs`, `src/runtime/consequences.ts:175`) | one game-state narration extension; reuses the consequence refs instead of a second boundary-change model |
| 66 authoring quality | **v2.8 09 §Harvest phase** (card checks on agent cards, bounded revision, read-back) + **v2.8 34 §Harvest phase** (key-match preview, key lint, per-kind lore guidance) | shared provisioning checks belong with the wizard; lore guidance with lorebook features |
| 67 grader hygiene | **v2.8 35 §Harvest phase** (matcher, fixtures, compare, untouched proof, fingerprints) + plan 24 §Measurement rows (compare and fingerprint rules) | test infrastructure and coverage, not a product feature |
| 68 "your move" chip | **kept** as its own plan | a new player-visible surface needs its own owner decision (00-overview rule 4); no open HUD or talk plan exists to absorb it (talk control is closed v2.7 work) |
| 65 scene card | kept | a new permanent player surface (Astra agrees) |
| 62, 63 | kept, measurement and feature separated | 62's probe no longer authorises a build automatically; 63 is a performance experiment |

The files 64, 66 and 67 stay as short pointers (history and review section), so links keep resolving. Plan numbers 60
(harvest fixes) and 61b (Astra closed fixes) are taken and not reused.

## Candidate plans

| # | Plan | Pitch | Size |
|---|---|---|---|
| 62 | `62-quantum-ogre-and-prepared-facts.md` | measure contradiction against committed facts, persistence and disclosure; authored prepared facts (seeded pick from authored alternatives) only on an owner decision | probe S–M; authored facts M; model-filled facts L (separate decision) |
| 63 | `63-stepped-history-window.md` | measure front-trim cost first (latency, not only reuse), then a stateless stepped cut over durable coverage | M |
| 64 | pointer → 18 §Phase Q7 + 46 | — | — |
| 65 | `65-here-now-scene-card.md` | where, when, known members present, links; badges and standing later (owner reopens 51 decision 2) | S first version |
| 66 | pointer → 09 + 34 | — | — |
| 67 | pointer → 35 + 24 | — | — |
| 68 | `68-your-move-chip.md` | revision-bound explicit hand-backs only, in v1 | S |
| 69 | `69-harvest-hardening-bundle.md` | 17 small hardening items (BUNDLE rows, x1, x2, R-rows) incl. two P1 stale-write guards | S each |

## Build order (2026-10-16)

Recommended across 60–69, after Astra (§3) with the folds applied:

1. **Reconcile** (this revision). Carry plan 60's open B4, B7, B8, B17 (B7 is 69 K17, B8 gates 69 K4). Build 69 **K11**
   (stale draft proposals) and **K12** (stale whole-book WI writes) first: both are P1 correctness guards.
2. **35 §Harvest phase** matcher and oracle work (G1 prefix-needle inventory before any semantics change, G2 re-score with
   scorer versions), then 69 **K5, K6, K8, K9, K10** and the bounded K1. These make later evidence trustworthy.
3. **09/34 §Harvest phase**: shared card checks, behaviour guidance and safe read-back first; key-match preview and lint after.
4. **18 §Phase Q7**, after the owner fixes its audience default (decision there); reuses 46's refs; acceptance combined with
   56/58 if those are built.
5. **65** after the surface decision (location, time, known members, links only); **68** as a small independent explicit
   hand-back feature.
6. **63** measurement (R2 latency arms); the window only if latency gains justify the recall risk; the recap stays deferred.
7. **62** redesigned continuity probe; authored prepared facts before model-filled facts; model-filled facts a separate
   decision.

Real-model time: plan 24's informational list is already over its 2.5 h share (166 min of items against 150), so every
harvest RP row (62's Artemis leg, 63's Artemis recall leg, 18 Q7 S7) is deferred beyond the 12 h cap with a reopen trigger
unless the owner displaces a named item. No floor moves after a result is seen.

## 2026-10-14 harvest (H1–H16)

Source column: report under `docs/plans/v2.8/extension-research-2026-10-14/`, P-item.

| # | Idea | Source | Verdict | Destination / reason |
|---|---|---|---|---|
| H1 | Prepare world facts before contact (held, distance-scaled) | simulation-blackboard P1 | NEW | 62: authored facts first (seeded pick from authored alternatives), model-filled facts a separate decision; pointer in 22 |
| H1b | Closed lists, commit before the roll | simulation-blackboard P2 | NEW | 62 (with prepared facts only) |
| H1c | Root truth vs player itinerary | simulation-blackboard P3 | NEW | 62 (guide line, not a field) |
| H1d | Swipe A→B→A identity | simulation-blackboard P5 | NEW | 62 Q3 browser leg only: the jest check exists (`src/runtime/spikes/swipeBack.review.test.ts:89-110`, 4 seeds × 200 cuts) |
| H2 | Quantum-ogre probe | simulation-blackboard P4 | NEW | 62 stage 1, redesigned: contradiction against a committed fact, persistence, disclosure; cross-swipe agreement informational |
| H3 | Stepped history window | tokensavingplugin P1 | NEW | 63 |
| H3b | Front-trim cache A/B | tokensavingplugin P5 | NEW | 63 (latency arms on the owed R2 run) |
| H3c | Recap before the oldest kept message; retention ladder | tokensavingplugin P2, P3 | NEW | 63 option C, deferred: reuse chapter records and the short-term summary first |
| H4 | Public sheet reaches the narrator | st-gamemaster P1 | FOLD | 18 §Phase Q7 (ex-64), with an explicit audience contract |
| H4b | "Just happened" lines for quest closes and public moves | st-gamemaster P2 | FOLD | 18 §Phase Q7 over 46's `deriveRefs` (46 §Harvest 2026-10-16) |
| H4c | Warn bands | st-gamemaster P4 | FOLD | 18 §Phase Q7 |
| H4d | One clamp for every int writer from display bounds | st-gamemaster P3 | SKIP | built in 53 (`src/engine/blackboard.ts:94`, range from display `src/engine/validate/display.ts:76`; display clamp gone, `src/runtime/gameSheet.ts:29`) |
| H5 | "Here now" scene card (+ relationship badge, P3) | rpg-companion P1, P3 | NEW | 65; owner call, reopens 51 decision 2 (addendum in 51) |
| H5b | Time-change chips per reply | rpg-companion P2 | FOLD | 50 addendum (not built: 50 B1c rest) |
| H6 | Card-mistake review on every agent card | creative-studio P1 | FOLD | 09 §Harvest phase (ex-66) |
| H6b | Lore key-match preview + key lint | creative-studio P2 | FOLD | 34 §Harvest phase (ex-66), labelled "key matches these draft texts" |
| H7 | Per-kind lore-entry content templates | writers-workbench P1 | FOLD | 34 §Harvest phase (ex-66) |
| H7b | Character behaviour prompts ("When X, they do Y") | writers-workbench P2 | FOLD | 09 §Harvest phase (ex-66) |
| H8 | Grader hygiene, adversarial extractor probes, noise-aware arm compare | characterbench P1–P3, P5 | FOLD | 35 §Harvest phase (ex-67) |
| H9a | Curator `rewrite` content baseline | worldinfo-workspace P2 | SKIP | defect B15, fixed in plan 60 |
| H9b | Destructive-rewrite guard in `auto` mode | worldinfo-workspace P3 | FOLD | 11 addendum |
| H9c | Idempotency receipt on created entries | st-memory-books P2 | FOLD | 11 addendum (durable op identity) |
| H10a | Withhold per-turn blocks on quiet/impersonate | sillytavern-copilot-p3dra P1 | SKIP | defect B10, fixed in plan 60 (structural follow-up 69 K9) |
| H10b | Compaction accepted only if it parses and is shorter | sillytavern-copilot-p3dra P2 | BUNDLE | 69 K1 (bounded retries) |
| H10c | Swipe-back reuses the stored read | sillytavern-copilot-p3dra P3 | SKIP | built and tested: spike `spikes.swipeBackCache` (`src/runtime/spikes/swipeCache.ts`), `src/runtime/spikes/swipeBack.review.test.ts:89-110` |
| H11a | Fresh-beat guard on relationship steps | bb-visual-novel-engine P1 | FOLD | 51, built (`src/engine/life/beats.ts:46-60`); contract restated as temporary repetition suppression |
| H11b | Per-axis breakdown, author view | bb-visual-novel-engine P2 | FOLD | 51, built (`axisHistory`, 51 gate record) |
| H12a | Harness status-code-only classification | sillytavern-subscriptions P1 | SKIP | defect B4: **open** (plan 60 §Not built), queue candidate; needs recorded error bodies |
| H12b | Served model + refusal is final | sillytavern-subscriptions P3 | SKIP | defect B5, fixed in plan 60 |
| H12c | Quota meter from in-stream events (never login files) | sillytavern-subscriptions P2 | FOLD | 09 addendum: claude route built (`server-plugin/story-orchestrator-harness/claudeTransport.mjs:80`, `src/components/settings/MemoryModelGroup.tsx:27`); opencode reports a limit only on failure |
| H13a | Quote lines carry `m=<id>` | timeline-memory P1 | FOLD | 47, built (`src/memory/promises/contract.ts:7,15`; span revision `src/memory/audience.ts:10`); 55 option B still owes it |
| H13b | Time label on recalled spans | timeline-memory P2 | FOLD | 43 addendum (label of the source event, not recall time) |
| H13c | Hidden at query time is not recall-eligible | timeline-memory P3 | FOLD | 42 §0 addendum (cited from 43) |
| H14a | Meanwhile due on elapsed story time | multihog-dnd-framework P1 | FOLD | 50, built (`src/runtime/agendaProposals.ts:132-139`); event fallback kept on purpose, floor made exact |
| H14b | "Lasting identity, not scene events" for creates and codex | multihog-dnd-framework P3 | FOLD | 11 (not built) and 52 (prompt rule built, C7 row owed); reworded so settled past events stay allowed |
| H15 | "Your move" HUD chip, derived | dynamic-response P1, P3 | NEW | 68 (revision-bound explicit hand-backs in v1) |
| H16a | Possession: omission is not loss | bb-interactive-map P3 | FOLD | 18 addendum (58 reuses); no new `loss_when` field |
| H16b | Accepted-uncertainty memo keyed by identity | bb-interactive-map P2 | FOLD | 11 addendum (book + uid + kind; revision and expiry exist) |
| H16c | Pause ST Summarize while a secret is held | dooms-enhancement-suite P1 | FOLD | 42 §9 addendum (build approval separate from default; host fact first) |
| H16d | Structural name fold for ledger/epistemic keys | dooms-enhancement-suite P2 | FOLD | 52, built (`src/memory/nameFold.ts:40-47`) |
| H16e | Anti-limbo line in `CHECK_OUTCOME_HEADER` | filigree P2 | FOLD | 18 §Phase Q7 header clause (no invented costs) |
| H16f | Chance-ramp pressure trigger | filigree P1 | FOLD | 49 addendum (G17 variant, SP6-gated) |
| H16g | Last-word request rewrite via payload `toJSON` | nemopresetext P1 | BUNDLE | 69 K4 (after B8, which is open) |
| H16h | Nemo rows in `extensionConflicts.ts` | nemopresetext P2 | BUNDLE | 69 K2 |
| H16i | Director tag canonicalisation vs Danbooru | booru-autocomplete P1 | FOLD | 41 addendum (aliases first; dropping unknowns gated on a blind image measurement) |
| H16j | Read-back after wizard creates; "host ok, read-back unavailable = unconfirmed" | nemo-plotlight P1, tavernary P1, creative-studio P6 | FOLD | 09 §Harvest phase (ex-66): unconfirmed means "may exist", no duplicate create |
| H16k | Stale-tab settings overwrite detection | creative-studio P3, worldinfo-workspace P7, writers-workbench P3 | BUNDLE | 69 K3 (detection only) |
| x1 | Guard: nothing of ours inside `.mes_text` | rpg-companion P6 | BUNDLE | 69 K5 (report item outside H1–H16) |
| x2 | Receipt-rewrite vs TurnBridge identity test | dynamic-response P4 | BUNDLE | 69 K6 (report item outside H1–H16) |
| x3 | Model-emitted "your move" tag stripped at receipt | dynamic-response P2 | SKIP | deferred in 68: only if explicit hand-backs miss real turns in a session |
| x4 | Ambient weather/time-of-day layer | rpg-companion P4 | SKIP | value 2, M; presentation only, no session asked |

The four anti-patterns the harvest confirmed (pre-publication private turns, choice-bound "forced outcome" steering, opaque
game-owned state blobs, popup/quiet-generation game bridges) stay rejected; none is planned.

(Counting note: H1–H16k are the 47 counted rows; x1–x4 are report items picked up while writing the plans.)

## v2.4 harvest: not-yet-built ideas

Built ideas are listed in §Built. Each row below was checked in code; 2026-10-16 changes are marked "(rev.)".

| # | Idea | v2.4 source | Code today | Verdict | Destination / reason |
|---|---|---|---|---|---|
| V1 | Prompt-only regex parity (`stHost/regex.ts`) | T7 | absent; `CLEANED_FORM.promptRegex` false (`src/extraction/windowHygiene.ts:11`) | FOLD (rev.) | 35 §Harvest phase G9: a compatibility measurement on a lane with prompt-only regex scripts active; build only if reads degrade |
| V2 | Append-only manual edit = continue; shrink keeps evidence rows | theme 1 | partial: only real `continue`/`appendFinal` re-fingerprint (`src/runtime/turnBridge.ts`) | SKIP | the `editReread` spike re-reads the newest edited reply; manual appends are rare |
| V3 | Branch from a chosen checkpoint (picker) | theme 2 | partial: `branchFromOldest` only (`src/runtime/chatIdentity.ts`) | SKIP | value 3/M; any ST branch can "continue from here"; restore horizon bounds it |
| V4 | Continue list for solo chats | theme 2 | rows only for groups (`src/runtime/playsIndex.ts`) | SKIP | group chats only (v2.8 rule 6) |
| V5 | Raw-Score and hybrid lore arms | T21 | rounded arm only (`src/judge/loreScore.ts`) | SKIP | v2.4 D11 dropped the arms (no nDCG gain) |
| V6 | "Costs N calls" confirm on bulk judge calibrate | T24 | absent | SKIP | judge cost meter exists (`src/components/settings/JudgeSettingsGroup.tsx`); calibration is harness-driven |
| V7 | NanoGPT/OpenRouter hosts + model-id alias map | T25 | absent (`server-plugin/story-orchestrator-judge/index.mjs`) | SKIP | narrowed by v2.4 D10; TypeSafe works; local provider is v2.8 14 |
| V8 | Entity canonicalisation + "same character?" card | Next tier | built in 52 (`src/memory/nameFold.ts:40-47`, author-only `same-character` check) | FOLD | 52, built |
| V9 | Append-only short-term rotation | Next tier | absent (`src/memory/sceneSummary.ts`) | SKIP | chapters + compaction cover the window; 69 K1 guards compaction |
| V10 | Interceptor trimming of consumed messages | Next tier | absent | NEW | 63 (stepped window over durable coverage) |
| V11 | Witness-filtered transcript per drafted member | Next tier | absent | FOLD | already v2.8 42 option C; no addendum needed |
| V12 | Context-horizon scoring (`lastInContextMessageId`) | theme 7 | absent | FOLD (rev.) | 63 H9: compare the intended cut with the history ST actually sent (budget estimates, other injections and host trimming move the real horizon) |
| V13 | Macro placement suppresses the depth injection | theme 7 | absent | SKIP | value 3, no author asked. (rev.) Reason corrected: suppression is meant to *prevent* double injection, so the old reason was wrong; deferral stands on value |
| V14 | Context-relative tier budgets / compaction trigger | theme 7 | partial (`src/memory/budget.ts` estimates) | SKIP | value 2; scope budget and request budgets are token-based already |
| V15 | Scene-source recall pass | theme 7 | partial (chapter recall) | FOLD | already v2.8 43 (verbatim recall) |
| V16 | Embedding rerank consumer | theme 7 | spike only (`src/memory/e0Pool.ts`) | FOLD | already v2.8 21 E0 (A12) |
| V17 | Jaccard token normalisation | theme 7 | absent (`src/memory/similarity.ts:1-3`) | BUNDLE | 69 K7 |
| V18 | Author ledger row edit | theme 7 | absent | SKIP | locks/decisions cover author control; reopen on a session ask |
| V19 | Presence-filtered ledger injection | theme 7 | per member, not by presence (`src/runtime/memoryInjector.ts`) | FOLD (rev.) | 58 addendum: presence ("which nearby holders and objects matter now") is a different filter from witness ("who knows this"); audience checks stay separate |
| V20 | Live drift read of owned effects on `PRESET_CHANGED` | theme 8 | absent | SKIP | the preset is a per-request overlay; nothing installed can drift |
| V21 | Judge-picked authored steering (Choice over snippets) | theme 8 | absent | SKIP | v2.8 49's focus picker owns this shape, gated on SP6 and 48 |
| V22 | Adversity read releases from the complication pool | theme 8 | partial: warden note only (`src/runtime/judgeIdeasWarden.ts`) | FOLD | already v2.8 49 Phase 3 (pool release on SP6 PASS) |
| V23 | Publish SO boundary events for peers | theme 8 | absent | SKIP | no peer consumer; one user |
| V24 | Narrow player-safe `globalThis` API | theme 8 | absent | SKIP | same; debug handles stay internal |
| V25 | Gate trace / live-path overlay | theme 9 | partial (Studio gate replay built) | SKIP | value 3; gate replay answers the authoring question |
| V26 | Tension/quality timeline chart | theme 9 | absent | SKIP | value 2; author-only nicety |
| V27 | `/cp get`, typed blackboard editors, enum autocomplete | theme 9 | partial (`/cp set` only) | SKIP | value 2–3; Author view shows the values |
| V28 | One-click `/persona-set` Repair | theme 9 | partial (opens player setup, `src/runtime/checksSetup.ts`) | SKIP | the start step owns persona choice by design |
| V29 | Transition channel comment\|hud\|off | theme 9 | boolean only (`src/components/settings/PlayGroups.tsx`) | SKIP | announcements are off by default; the HUD shows the checkpoint |
| V30 | First-visit coach marks | theme 9 | absent | SKIP | one user who knows the product |
| V31 | i18n | theme 9 | absent | SKIP | English only (owner rule) |
| V32 | Wizard per-field refine, discuss-only turn, reference cards, macro normalisation, story bundle export | theme 9 | absent (Studio undo/redo exists) | SKIP | no session asked. (rev.) Reason corrected: library JSON is not an export bundle with the referenced cards and books, so it is no substitute; deferral stands on value |
| V33 | Prompt-template fingerprint tied to calibration | theme 10 | partial (payload goldens, judge seam golden) | FOLD (rev.) | 35 §Harvest phase G8: record prompt, scorer, model and configuration fingerprints with each measurement; goldens detect change but do not qualify old results |
| V34 | Boot-smoke of the bundle against fake host modules | theme 10 | partial (artifact smoke against live ST) | SKIP | the artifact smoke runs the real host |
| V35 | Dedicated ST user account for destructive journeys | theme 10 | absent | SKIP | lanes (copies) replaced it |
| V36 | Theme axis in `so-responsive` | theme 10 | absent | SKIP | value 2–3; one theme in use |
| V37 | Fixture export from flagged reads | theme 10 | absent | FOLD | 35 §Harvest phase (optional step, unresolved list) |
| V38 | Live shadow extraction arm / judge-vs-extractor live diff | theme 10 | offline replay only (`src/extraction/shadowReplay.ts`) | SKIP | v2.8 12 chose offline replay (option C) |
| V39 | Doc-contract tests for folder rules | theme 10 | partial (citations check) | SKIP | value 2 |
| V40 | Lore "relevant when" arm | theme 11 | absent | SKIP | dropped with T21's arms (v2.4 D11) |
| V41 | General boundary judge bundle | theme 11 | partial (warden riders) | SKIP | riders already merge the same-state uses that matter |
| V42 | Judge tension read into the pacing EMA + hysteresis | theme 11 | partial | SKIP | v2.8 13 J7 consumers own judge tension |
| V43 | Pre-reply player-message Choice on the reply path | theme 11 | offline spike only (`src/judge/ideaSpikes.ts`) | SKIP | v2.8 13 J7 measured it offline; reply-path budget |
| V44 | Strip roster/persona names from mirror keys | T14 | absent (`src/runtime/memoryMirror.ts`) | SKIP | the mirror now holds relationship rows only |
| V45 | Mirror WI budget share cap | T14, theme 6 | absent | SKIP | same: relationship rows only, small |
| V46 | Missing interop fixtures: silent `mes` rewrite, out-of-band swipe append, synthetic messages | T20 | absent (13 v24 shapes exist) | BUNDLE | 69 K8 (with explicit expected outcomes) |
| V47 | Reasoning strip via the profile's `reasoning-template` | theme 3 | absent | FOLD (rev.) | 35 §Harvest phase G10: a profile-specific fixture in role calibration for a separately routed extraction model; implement only on evidence. Main-reply thought-leak repair does not establish parity for side models |
| V48 | Rpm spacing for side calls | theme 3 | absent | SKIP | breaker + scheduler cover it; one subscription user |
| V49 | Opt-in constrained decoding (json_schema/GBNF) | theme 3 | absent | SKIP | native tool calls replaced JSON parsing for the wizard; llama.cpp grammar trap |
| V50 | Community generation mutex events | theme 3 | absent | SKIP | no installed peer emits them |
| V51 | Current values of in-scope qualities in the read prompt | theme 4 | partial: running totals only (`src/extraction/contract.ts`) | SKIP | anchoring risk; needs a live-suite arm first |
| V52 | Signed relative values (`+5`) | theme 4 | absent (`src/extraction/parse.ts`) | SKIP | absolute values + `step_rule` cover it; value 3/M |
| V53 | Negative memory: paraphrase suppression for new facts | theme 4 | partial (exclusions; arcs only) | SKIP | value 3; reopen if discarded facts come back in sessions |
| V54 | Full-restatement read mode spike | theme 4 | absent | SKIP | the read model is capable; value 3/M |
| V55 | Witness-scoped facts | theme 4 | absent | FOLD | already v2.8 42 (witness record) / 21 |
| V56 | Declarative per-generation-kind carry policy on `INJECTION_REGISTRY` | theme 5 | partial: `WITHHOLDING_TYPES` (`src/runtime/generationLifecycle.ts:22`) | BUNDLE | 69 K9 (nested quiet, restoration, early returns, raw paths) |
| V57 | NPC replies trigger by index, not name | theme 5 | `/trigger` by name (`src/runtime/effectSteps.ts:68`) | BUNDLE | 69 K10 |
| V58 | CC `send_if_empty` guard on our `/trigger` paths | theme 5 | detected only (`src/services/stHost/generation.ts`) | BUNDLE (rev.) | 69 K10: one no-model Chat Completion fixture decides whether protection is needed. Text Completion being the play route does not cover every supported `/trigger` path or the cloud validation route |
| V59 | Generation-replacing extension (Polyceph) probe | theme 5 | absent | SKIP | not installed; Nemo is 69 K2 |
| V60 | Hold reads between group-wrapper start/finish (Presence) | theme 5 | Repair warning only | FOLD (rev.) | 35 §Harvest phase G9: a compatibility measurement with Presence active (are reads still correct?); a warning alone does not establish that |
| V61 | Foreign scan filter check for Lorebook Ordering | theme 6 | TunnelVision only (`src/runtime/checksExtensions.ts`) | SKIP | deferred while unused. (rev.) Reason corrected: B19's refutation shows SO removes nothing; it says nothing about another extension removing SO entries. 69 K8 carries a conditional suppression fixture for when such an extension is installed |
| V62 | Ownership marker inside wizard-created books | theme 6 | mirror and curator stamps only | SKIP | the wizard's created-asset ledger owns cleanup |

## Report items added 2026-10-16

Astra found report items with no row; the first pass's inventory implied each was triaged. This table closes the gap: every
P-item of the 2026-10-14 reports that was not already an H, x or B row, plus three named v2.4 items. B-defect rows point at
plan 60; anti-patterns stay rejected.

| # | Idea | Source | Verdict | Destination / reason |
|---|---|---|---|---|
| R1 | Proposal staleness: an accepted old proposal overwrites a manual edit | creative-studio P4 | BUNDLE | **69 K11 (P1)**: `decideStep` checks only that the op still applies (`src/copilot/agent/loop.ts:382-397`) |
| R2 | Read-modify-write of a whole book from a possibly stale cache | worldinfo-workspace P4 | BUNDLE | **69 K12 (P1)**: `updateWIEntryByUid` saves the cached book and checks only the target entry (`src/services/stHost/worldInfo.ts:371-392`) |
| R3 | Recast-style delayed rewrite compat fixture | recast P2 | BUNDLE | 69 K8 (fourth fixture) |
| R4 | Rewrite without swipe sync is lost on swipe-left | recast P3 | BUNDLE | 69 K6 (swipe-left order) |
| R5 | Listener order: thought-leak repair before Recast | recast P4 | BUNDLE | 69 K6 (both listener orders) |
| R6 | Visible reply and its thought diverge after a rewrite | recast P5 | BUNDLE | 69 K6b: a consumer (54 thought carry, 43 recall) never reads `extra.reasoning` across a text revision change |
| R7 | Prompt-only regex and the profile's reasoning template still absent | recast P6 | FOLD | = V1 / V47 (35 G9, G10) |
| R8 | Third-party send lock parks our boundary | recast P1 | SKIP | defect B17, open (plan 60 §Not built) |
| R9 | Bind per-generation state to the rendered message's identity | st-memory-books P3 | BUNDLE | 69 K13 (talk decisions, warden note, expression reads keyed by message revision) |
| R10 | Persist derived expression reads per swipe | rpg-companion P5 | BUNDLE | 69 K13 |
| R11 | Hidden ≠ deleted on re-reads | st-memory-books P4 | SKIP | built (§Built "hidden ≠ deleted") |
| R12 | Merge op for curator duplicates | st-memory-books P5 | SKIP | value 2/M; A15 already flags "patch X instead" |
| R13 | Product-side "the block actually shipped" | sillytavern-copilot-p3dra P4 | FOLD | 35 §Harvest phase G7: assert blocks in the actual outgoing request (dry runs skip interceptors, ST `script.js:4562-4564`) |
| R14 | Swipe input window drops the reply being replaced | sillytavern-copilot-p3dra P5 | FOLD | 35 §Harvest phase G7 (pre-generation read on a swipe; same fixture family) |
| R15 | Realization status for landed meanwhile notes | multihog-dnd-framework P2 | FOLD | 50 addendum (deferred note) |
| R16 | Size budget for the chat blob and the story library | multihog-dnd-framework P4 | BUNDLE | 69 K14 |
| R17 | Active-persona guard around persona writes | nemo-plotlight P3 | BUNDLE | 69 K15 (setup tests) |
| R18 | Rollback a half-created persona | nemo-plotlight P2 | SKIP | low frequency; nothing is deleted from the owner's data; reopen on an orphan in a live run |
| R19 | Self-contained query rewrite for recall | timeline-memory P4 | FOLD | 43 addendum (E0 / option F experiment) |
| R20 | Candidate chapter endpoints with justification, author picks | timeline-memory P5 | SKIP | value 2/M; chapter seals are authored or director-proposed |
| R21 | Hard critic evidence must be a verbatim quote, checked in code | filigree P4 | BUNDLE | 69 K16 (measure first) |
| R22 | Required evidence per target; "resolved" cites the changed state | simulation-blackboard P6 | BUNDLE | 69 K16 |
| R23 | Ending verdict from accumulated check results | filigree P3 | SKIP | value 2/M; endings are authored checkpoints |
| R24 | Cue fade after repetition | filigree P5 | SKIP | value 1; 49 G19 spent-ness owns the shape |
| R25 | Craft lines for the wizard prompt | creative-studio P7 | FOLD | 09 §Harvest phase (ex-66) |
| R26 | Targeted missing-field re-ask + keep-the-better-answer | creative-studio P5 | SKIP | value 2; the agent loop's refusal observations already name the missing field |
| R27 | Tri-state boundary signal with a quoted move | bb-interactive-map P4 | SKIP | value 2; reads already carry evidence spans |
| R28 | Map widget route + travel intent | bb-interactive-map P5 | SKIP | value 2/M; no map widget in use |
| R29 | Mention cards over codex entries | bb-interactive-map P6 | SKIP | value 3/M; 52 person/place pages answer it; message DOM writes are guarded |
| R30 | Frozen, versioned read API with `isCurrent` | bb-interactive-map P7 | SKIP | = V24 (no peer consumer) |
| R31 | Author override of one past extracted delta, with undo | bb-visual-novel-engine P3 | SKIP | = V18 (locks and decisions); value 2/M |
| R32 | Code-measured diversity retry for "What could I do?" | bb-visual-novel-engine P4 | SKIP | value 2; no session asked |
| R33 | Style-only reference slot for portraits | bb-visual-novel-engine P5 | SKIP | value 2/M; image track (41) owns references |
| R34 | Co-occurrence for missing companion tags | booru-autocomplete P2 | SKIP | value 1 |
| R35 | Room presence by muting the group | danganronpa-sillytavern P2 | SKIP | `cast_changes` and away members cover it |
| R36 | Fuzzy member↔name matching | danganronpa-sillytavern P3 | SKIP | built: 52 name fold (unambiguous or nothing) |
| R37 | Scene mood → ambient effect | danganronpa-sillytavern P4 | SKIP | value 2/M; = x4 family |
| R38 | Targeted deferred delivery queue | danganronpa-sillytavern P5 | SKIP | value 1 |
| R39 | Display-only codex-term marks in message text | dooms-enhancement-suite P3 | SKIP | message DOM writers are guarded (`src/services/stHost/inlineMount.ts` only); 52 pages answer it |
| R40 | Per-roster voice, present-gated | dooms-enhancement-suite P4 | SKIP | value 2/L; ambient voice out of scope |
| R41 | Restraint-weighted instruction wording | dynamic-response P5 | SKIP | value 1 |
| R42 | Serialization barrier when a throw cannot stop the host | nemopresetext P4 | BUNDLE | 69 K4 (same item) |
| R43 | Content-addressed sidecars for heavy per-chat state | nemopresetext P5 | SKIP | 69 K14 measures size first |
| R44 | Persona/card name clash fixture | persona-sync P1 | SKIP | the `persona-fit-cast` check fires correctly; fixture only if its copy confuses |
| R45 | Skip unchanged writes; carry changed keys | probablytoomanytabs P2 | SKIP | settings are stored as a delta over defaults; value 2 |
| R46 | Manifest lifecycle hooks | probablytoomanytabs P3 | SKIP | value 2/M; one build, no update flow |
| R47 | Extensions-drawer reveal no-op under PTMT | probablytoomanytabs P4 | SKIP | value 1; not installed |
| R48 | Optional tiers never fail the whole self-test | smart-memory P2 | SKIP | value 2; per-tier pass/fail exists; reopen if a self-test misleads |
| R49 | Model-call "thinking tail" while a self-test runs | smart-memory P3 | SKIP | value 2/M |
| R50 | Codex via `app-server` | sillytavern-subscriptions P4 | SKIP | value 2/L |
| R51 | max_tokens hidden-resume trap | sillytavern-subscriptions P6 | SKIP | built: the claude bridge stops at the first `max_tokens` (`server-plugin/story-orchestrator-harness/README.md`) |
| R52 | cwd-sensitive safety classifier | sillytavern-subscriptions P7 | SKIP | host fact noted; the harness runs in an owned tmp home |
| R53 | Reused in-flight promise must clear in `finally` | tavernary P2 | SKIP | `src/services/stHost/capabilities.ts` does not cache errors; reopen on a stuck lazy door |
| R54 | Render-count + clone-count audit harness | tavernary P3 | SKIP | value 2/M |
| R55 | rAF-coalesced overlay positioning | tavernary P4 | SKIP | value 1 |
| R56 | Fatal-error circuit breaker for background calls | tokensavingplugin P4 | SKIP | built (`src/extraction/breaker.ts`) |
| R57 | TunnelVision read-only detection over-reports | tunnelvision P1 | SKIP | value 2; over-reporting is the safe direction; reopen when TV is installed |
| R58 | Re-resolve the target at write time | tunnelvision P2 | SKIP | B15 (rewrite baseline) and 69 K12 (whole-book stale write) |
| R59 | Degenerate input skips the model call | tunnelvision P3 | SKIP | value 1 |
| R60 | Batch undo with per-item skip reasons | worldinfo-workspace P5 | SKIP | value 2/M; Studio undo/redo exists |
| R61 | Reply-failure vocabulary incl. thinking-only / truncated | worldinfo-workspace P6 | SKIP | built (empty-reply and finish-reason handling) |
| R62 | Write only what changed; count, never cut | writers-workbench P4 | SKIP | value 1 |
| R63 | Location layout → prose (exits, distances) | writers-workbench P6 | SKIP | value 2/M; 34 §Harvest phase location guidance names ways in and out |
| R64 | Static relationship graph view | writers-workbench P7 | SKIP | value 2/M; 51 labels and 52 pages |
| R65 | Unambiguous-or-nothing matching | persona-sync P2 | SKIP | built (52 name fold) |
| R66 | Response-close cancellation | sillytavern-subscriptions P5 | SKIP | present in the harness |
| R67 | Ownership tags on synced entries | writers-workbench P5 | SKIP | present (created stamps) |
| R68 | Grading a synthetic prompt instead of the host's | characterbench P4 | SKIP | anti-pattern we avoid |
| R69 | Choice-bound steering | bb-visual-novel-engine P6 | SKIP | anti-pattern |
| R70 | Pre-publication private turn | simulation-blackboard P7 | SKIP | anti-pattern (the judge never blocks) |
| R71 | Opaque game-owned state blob | valkyrie-crusade-rebuild P1 | SKIP | anti-pattern |
| R72 | Popup window for a heavy canvas game | valkyrie-crusade-rebuild P2 | SKIP | anti-pattern |
| R73 | Game events → model via quiet/raw generation | valkyrie-crusade-rebuild P3 | SKIP | anti-pattern |
| R74 | Self-test budget must match the runtime read | smart-memory P1 | SKIP | defect B1, fixed |
| R75 | Settings write lost inside ST's 1 s debounce | probablytoomanytabs P1 | SKIP | defect B3, fixed |
| R76 | Cast writes must announce themselves | danganronpa-sillytavern P1 | SKIP | defect B6, fixed |
| R77 | `crypto.subtle` unguarded | multihog-dnd-framework P5, nemopresetext P3 | SKIP | defect B9, fixed |
| R78 | Slash guard on every chat-box fill | bb-interactive-map P1 | SKIP | defect B11, fixed |
| R79 | Profile tool bridge reads the wrapper | st-memory-books P1 | SKIP | defect B12, fixed |
| R80 | Injection write log | v2.4 next-turn preview (dooms) | SKIP | the effect ledger records host writes; the next-turn preview composes from the registry |
| R81 | Requirement provenance + "Import from source" | v2.4 CHUB search | SKIP | the wizard is create-only and offline; no network import |
| R82 | Fresh-state isolation test | v2.4 theme 10 (superobjective) | SKIP | journeys and scenarios start fresh; jest order dependence is a defect by rule |

(Covered elsewhere and not re-listed: global WI save debounce = B14, curator baseline = B15, quest reward clamp = B16,
gotchas doc = B13, faction `changedAgo` = B18 refuted and the 53 addendum, WI recursion = B19 refuted.)

## Built (v2.4 ideas verified in code, no action)

T1 identity-snapshot delete decode (`src/runtime/messageIdentity.ts`); T2 branch follow (`src/runtime/chatIdentity.ts`);
T3 fingerprints + same-chat reconcile (`src/runtime/fingerprints.ts`); T4 abortable calls + backlog Stop
(`src/services/stHost/modelReply.ts`, `src/runtime/memorizeBacklog.ts`); T5 breaker, no install-wide pause, dangling
profile (`src/extraction/breaker.ts`); T6 outermost loud generation (`src/runtime/generationLifecycle.ts`); T7 window cleaner
(`src/extraction/windowHygiene.ts`); T8 settings save evidence + re-wrap (`src/services/stHost/persistence.ts`);
T9 chunker + whole-scene summaries (`src/extraction/chunker.ts`, `src/memory/sceneSummary.ts`); T10 active speaker
(`src/runtime/roster.ts`); T11 downgrade guard + `minimum_client_version` (`src/runtime/persistence.ts`, `manifest.json`);
hidden ≠ deleted; mirror reaper (`src/runtime/mirrorReaper.ts`); integrity stamp; Continue list
(`src/components/settings/ContinueList.tsx`); records keyed by chat/group id; re-commit after third-party rewrite (spike
`editReread`); swipe-back cache (spike `swipeBackCache`); T22 agency check and T23 house rules (`src/judge/warden.ts`); T24
usage + `measuredOn` (`src/judge/client.ts`, `src/judge/readiness.ts`); T25 token guard (narrowed); PERSONA_CHANGED
re-evaluation (`src/runtime/requirementsWatch.ts`); complication pool (spike `sp6Complications`); story-owned scenario
(`src/runtime/storyScenario.ts`); sampler overlay incl. CC (`src/services/stHost/samplerOverlay.ts`); objective block + AN
diagnostic (`src/engine/agency.ts`, `src/studio/diagnostics.ts`); seeded chance; next-turn token share
(`src/runtime/nextTurn.ts`); `/chat-jump` provenance (`src/runtime/messageJump.ts`); message inspector + `/story flag`; Studio
gate replay (`src/studio/gateReplay.ts`); per-quality macros (`src/runtime/qualityMacros.ts`); wand menu
(`src/services/stHost/storyWand.ts`); "What could I do?" (`src/runtime/suggestions.ts`); player-visible qualities; judge-off
column; over-steer probe (`scripts/debug/lib/overSteer.mts`); lore contradiction in the warden; `memoryRerank` removed.
T12 WI activation evidence (`src/runtime/worldInfoEvidenceHost.ts`); T13 scan-time gating (`src/services/stHost/worldInfoScan.ts`,
`src/runtime/scanGatePlan.ts`); T14 event typing, reaper, scene rows no longer mirrored (`src/runtime/memoryMirror.ts`);
T15 `evidence_from` + `player_attempts_only` (`src/engine/schema.ts`); T16 objective line in the guidance block +
AN-inheritance diagnostic; T17 curator hardening (`src/stagecraft/proposal.ts`, `src/stagecraft/parse.ts`, word diff); T18
per-role routes (`src/runtime/passProfiles.ts`); T19 next-turn tokens, foreign blocks, memory fate, chat-jump; T20 interop
corpus (13 `v24-*` scenarios) + event-name guard (`scripts/debug/eventNames.test.mts`); finish-reason truncation,
degenerate-loop detector (`src/extraction/degenerate.ts`), input-proportional `maxTokens` (`src/extraction/callBudget.ts`), CC
sampler payload rule; `step_rule`; deterministic OOC (`src/engine/ooc.ts`); `[intends]`; dry-run skips; tool-call turns; lore
forced from the interceptor (`src/runtime/loreSelectTiming.ts`); per-tier `scannable`; requirements from chat, persona and
character books (`src/services/stHost/selectors.ts`); `worldInfoCache` eviction.

## Decisions for the owner (2026-10-16)

1. **Accept the folds (64 → 18 + 46, 66 → 09 + 34, 67 → 35 + 24) and keep 68 separate?** **Recommended: yes.**
2. **Build order as §Build order, K11 and K12 first?** **Recommended: yes.**
3. **Real-model time:** the informational list is already 16 min over its share; harvest RP rows stay deferred beyond the
   cap unless a named item is displaced (only the over-steer card, 120 min, is large enough). **Recommended: defer them;
   keep the cap.**

## Unresolved questions

- 65 needs the owner's call on 51 decision 2 before anything else in it matters.
- 18 §Phase Q7 needs the owner's audience default (omniscient-only vs shared).
- 62 and 63 each produce a measurement that informs, but no longer authorises, a build; the owner decides each build after
  the record.
- Three spikes the v2.4 ideas map to (`swipeBackCache`, `editReread`, `sp6Complications`) are on by default but still labelled
  experimental; promoting or retiring them is outside this triage.

## Review 2026-10-16 (Astra)

Source: `review-astra-harvest-2026-10-16.md` §1 (triage audit), §3 (build order). Verified on `e8b9dd6d`.

- **"B1–B19 fixed in plan 60" is false.** Accepted. `60-extension-harvest-fixes.md` §Not built leaves B4, B7, B8, B17 open,
  B18/B19 refuted. → status line rewritten; H12a now says B4 is open; 69 K4 waits on B8; B7 is 69 K17.
- **V12 (horizon) is not superseded by an intended cut.** Accepted: host trimming happens after the interceptor and budget
  estimates can differ. → FOLD 63 H9 (compare intended with sent).
- **V19 presence ≠ witness.** Accepted. → FOLD 58 addendum, audience checks kept separate.
- **V33 goldens do not qualify old measurements.** Accepted. → FOLD 35 G8 (fingerprints recorded with results).
- **V58 TC route does not cover every `/trigger` path.** Accepted (`src/runtime/effectSteps.ts:68` triggers by name on any
  route). → BUNDLE 69 K10 with one no-model CC fixture.
- **V61 reason wrong.** Accepted. → reason corrected; conditional suppression fixture in 69 K8.
- **V13 / V32 substitutes not equivalent.** Accepted; deferral kept on value. → reasons corrected.
- **V47 main-reply repair ≠ side-model parity.** Accepted. → FOLD 35 G10 (profile fixture in role calibration).
- **V1 / V60 need compatibility measurements.** Accepted. → FOLD 35 G9 (conditional on the extension or setting active).
- **64/66/67 should be folds; 68 too.** Accepted for 64, 66, 67 (§Folds). 68 kept: rebutted for 68 only, because it adds
  a player-visible surface that needs its own owner decision and no open HUD/talk plan exists.
- **Keep 65, separate 62's measurement from its feature, 63 a separate experiment.** Adopted.
- **P1 omission: stale draft proposals (creative-studio P4).** Accepted: `decideStep` re-checks `editProblem` against the
  current draft only (`src/copilot/agent/loop.ts:382-397`); 66 claimed 69 noted it, 69 did not. → R1, 69 K11.
- **P1 omission: stale whole-book writes (worldinfo-workspace P4).** Accepted: `loadExisting` reads ST's cache
  (`src/services/stHost/worldInfo.ts:46-51`), `updateWIEntryByUid` saves the whole book and verifies only the target
  (`:371-392`); B14/B15 do not close it. → R2, 69 K12.
- **Other omissions (Recast P2/P5, Memory Books P3, RPG P5, Copilot P4, Multihog P2/P4, Plotlight P3, Timeline P4,
  Filigree P4, Blackboard P6) and the lower-value list.** Accepted. → §Report items added 2026-10-16, R1–R82, each with a
  verdict; the three older items (injection log, requirement provenance, fresh-state isolation) are R80–R82.
- **Swipe-back "first A→B→A check" false.** Accepted (`src/runtime/spikes/swipeBack.review.test.ts:89-110`). → H1d is a
  browser/model leg only.
- **51 fresh-beat guard, 52 name fold, range clamp already built.** Accepted (`src/engine/life/beats.ts:46-60`,
  `src/memory/nameFold.ts:40-47`, `src/engine/blackboard.ts:94`). → H11a/H11b/H16d marked built, H4d SKIP built; addenda
  reconciled with the gate records.
- **64 display-clamp claim stale.** Accepted (`src/runtime/gameSheet.ts:29` uses the value). → 18 §Phase Q7 current state.
- **65 portrait host module overstated.** Accepted (`src/services/stHost/sprites.ts:83` builds `/characters/<avatar>`). → 65.
- **Build order.** Adopted with the folds applied (§Build order).
- **12 h cap needs an actual allocation.** Accepted: 25 + 21 + 120 = 166 min against 150. → §Build order note, decision 3,
  plan 24 §Measurement rows.
- Label drift found while revising (not in the review): the 41, 49 and 52 addenda used H16f, H16d and H16e for booru, chance
  ramp and name fold, against this table's H16i, H16f and H16d. → addenda relabelled to match.
- Rebutted: 68 as a fold (above). Everything else accepted.
