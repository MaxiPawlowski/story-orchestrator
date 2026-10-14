# Plan 61 — Harvest triage 2026-10-14

**Status: written 2026-10-14 (docs only).** Triage of every idea from the 2026-10-14 extension pattern harvest
(`docs/plans/v2.8/extension-research-2026-10-14/SUMMARY.md` §Top ideas H1–H16, every H16 sub-item, plus the report items each
plan picked up) and of every **not-yet-built** idea from the v2.4 harvest (`docs/plans/v2.4/extension-research/SUMMARY.md`:
T1–T25, Next tier, themes 1–11). "Not built" was verified in current code (master `9e96871d`, src/, server-plugin/, scripts/),
not in docs. Defects B1–B19 (`_verification.md`) are fixed in plan 60 and skipped here except where an idea depends on one.

Verdicts: **NEW** (its own plan, 62–68), **BUNDLE** (plan 69, small hardening), **FOLD** (a "Harvest 2026-10-14 addendum"
section appended to the named plan), **SKIP** (built, anti-pattern, superseded, or low value; reason given). Licences: most
sources are AGPL/GPL/none, so ideas only, no code.

## Counts

- 2026-10-14 harvest, 47 rows (H1–H16 with sub-items): NEW 20 (into plans 62–68), FOLD 18, BUNDLE 4, SKIP 5.
- v2.4 harvest, 123 ideas checked: 61 built (no row; listed in §Built), 62 not built: NEW 1, FOLD 7, BUNDLE 4, SKIP 50.
- Totals over the 109 open rows: NEW 21, FOLD 25, BUNDLE 8, SKIP 55. Four extra report items (x1–x4) are listed but not
  counted.

## New plans

| # | Plan | Pitch | Size |
|---|---|---|---|
| 62 | `62-quantum-ogre-and-prepared-facts.md` | measure whether swipes invent different unstated facts; prepare held facts before contact only on a miss | probe S–M; stage 2 L |
| 63 | `63-stepped-history-window.md` | cut history in steps instead of ST's per-turn front trim so the prompt prefix stays cacheable; front-trim arm first | M |
| 64 | `64-public-sheet-to-narrator.md` | the narrator is told what the player visibly holds, quest closes and public moves; warn bands | S |
| 65 | `65-here-now-scene-card.md` | one player card: where, when, who is here and what the player may see about them (owner reopens 51 decision 2) | M |
| 66 | `66-authoring-quality-cards-and-lore.md` | tutorial card checks on every agent card, lore activation preview + key lint, per-kind lore templates, read-back | S–M |
| 67 | `67-grader-hygiene-and-adversarial-fixtures.md` | quote-normalised graders, false-memory/persona-pressure extractor fixtures, noise-aware arm compare, chat-untouched proof | S–M |
| 68 | `68-your-move-chip.md` | a derived HUD chip when the turn is the player's | S |
| 69 | `69-harvest-hardening-bundle.md` | ten small hardening items (BUNDLE rows and x1, x2) | S each |

## 2026-10-14 harvest (H1–H16)

Source column: report under `docs/plans/v2.8/extension-research-2026-10-14/`, P-item.

| # | Idea | Source | Verdict | Destination / reason |
|---|---|---|---|---|
| H1 | Prepare world facts before contact (held, distance-scaled) | simulation-blackboard P1 | NEW | 62 stage 2, gated on H2; pointer addendum in 22 |
| H1b | Closed lists, commit before the roll | simulation-blackboard P2 | NEW | 62 (with stage 2 only) |
| H1c | Root truth vs player itinerary | simulation-blackboard P3 | NEW | 62 (guide line, not a field) |
| H1d | Swipe A→B→A identity | simulation-blackboard P5 | NEW | 62 Q3 (the swipe-back spike exists; first check of it) |
| H2 | Quantum-ogre probe | simulation-blackboard P4 | NEW | 62 stage 1 |
| H3 | Stepped history window | tokensavingplugin P1 | NEW | 63 |
| H3b | Front-trim cache A/B | tokensavingplugin P5 | NEW | 63 (arm on the owed R2 run) |
| H3c | Recap before the oldest kept message; retention ladder | tokensavingplugin P2, P3 | NEW | 63 option C (only on a recall miss) |
| H4 | Public sheet reaches the narrator | st-gamemaster P1 | NEW | 64 |
| H4b | "Just happened" lines for quest closes and public moves | st-gamemaster P2 | NEW | 64 (shared "what changed" rows with 46) |
| H4c | Warn bands | st-gamemaster P4 | NEW | 64 |
| H4d | One clamp for every int writer from display bounds | st-gamemaster P3 | FOLD | 53 addendum (B16 narrow fix in plan 60 first) |
| H5 | "Here now" scene card (+ relationship badge, P3) | rpg-companion P1, P3 | NEW | 65; owner call, reopens 51 decision 2 (addendum in 51) |
| H5b | Time-change chips per reply | rpg-companion P2 | FOLD | 50 addendum |
| H6 | Card-mistake review on every agent card | creative-studio P1 | NEW | 66 |
| H6b | Lore activation preview + key lint | creative-studio P2 | NEW | 66 |
| H7 | Per-kind lore-entry content templates | writers-workbench P1 | NEW | 66 |
| H7b | Character behaviour prompts ("When X, they do Y") | writers-workbench P2 | NEW | 66 |
| H8 | Grader hygiene (quote normalisation beyond B2), adversarial extractor probes, noise-aware arm compare | characterbench P1–P3, P5 | NEW | 67 (after plan 60's B2) |
| H9a | Curator `rewrite` content baseline | worldinfo-workspace P2 | SKIP | defect B15, plan 60 |
| H9b | Destructive-rewrite guard in `auto` mode | worldinfo-workspace P3 | FOLD | 11 addendum |
| H9c | Idempotency receipt on created entries | st-memory-books P2 | FOLD | 11 addendum |
| H10a | Withhold per-turn blocks on quiet/impersonate | sillytavern-copilot-p3dra P1 | SKIP | defect B10, plan 60 |
| H10b | Compaction accepted only if it parses and is shorter | sillytavern-copilot-p3dra P2 | BUNDLE | 69 K1 |
| H10c | Swipe-back reuses the stored read | sillytavern-copilot-p3dra P3 | SKIP | built: spike `spikes.swipeBackCache` (`src/runtime/spikes/swipeCache.ts`), on by default |
| H11a | Fresh-beat guard on relationship steps | bb-visual-novel-engine P1 | FOLD | 51 addendum |
| H11b | Per-axis breakdown, author view | bb-visual-novel-engine P2 | FOLD | 51 addendum |
| H12a | Harness status-code-only classification | sillytavern-subscriptions P1 | SKIP | defect B4, plan 60 |
| H12b | Served model + refusal is final | sillytavern-subscriptions P3 | SKIP | defect B5, plan 60 |
| H12c | Quota meter from in-stream events (never login files) | sillytavern-subscriptions P2 | FOLD | 09 addendum (only if the opencode stream carries usage events) |
| H13a | Quote lines carry `m=<id>` | timeline-memory P1 | FOLD | 47 addendum (+ 55 option B) |
| H13b | Time label on recalled spans | timeline-memory P2 | FOLD | 43 addendum |
| H13c | Hidden at query time is not recall-eligible | timeline-memory P3 | FOLD | 42 §0 addendum (cited from 43) |
| H14a | Meanwhile due on elapsed story time | multihog-dnd-framework P1 | FOLD | 50 addendum (B1a) |
| H14b | "Lasting identity, not scene events" for creates and codex | multihog-dnd-framework P3 | FOLD | 11 and 52 addenda |
| H15 | "Your move" HUD chip, derived | dynamic-response P1, P3 | NEW | 68 |
| H16a | Possession: omission is not loss | bb-interactive-map P3 | FOLD | 18 addendum (58 reuses) |
| H16b | Accepted-uncertainty memo keyed by identity | bb-interactive-map P2 | FOLD | 11 addendum |
| H16c | Pause ST Summarize while a secret is held | dooms-enhancement-suite P1 | FOLD | 42 §9 addendum (host fact first) |
| H16d | Structural name fold for ledger/epistemic keys | dooms-enhancement-suite P2 | FOLD | 52 shared-contract addendum (with v2.4 roster canonicalisation) |
| H16e | Anti-limbo line in `CHECK_OUTCOME_HEADER` | filigree P2 | NEW | 64 header clauses (noted in the 18 addendum) |
| H16f | Chance-ramp pressure trigger | filigree P1 | FOLD | 49 addendum (G17 variant, SP6-gated) |
| H16g | Last-word request rewrite via payload `toJSON` | nemopresetext P1 | BUNDLE | 69 K4 (conditional on B8 not being enough) |
| H16h | Nemo rows in `extensionConflicts.ts` | nemopresetext P2 | BUNDLE | 69 K2 |
| H16i | Director tag canonicalisation vs Danbooru | booru-autocomplete P1 | FOLD | 41 addendum (measure first) |
| H16j | Read-back after wizard creates; "host ok, read-back unavailable = unconfirmed" | nemo-plotlight P1, tavernary P1 | NEW | 66 item 4 |
| H16k | Stale-tab settings overwrite detection | creative-studio P3, worldinfo-workspace P7, writers-workbench P3 | BUNDLE | 69 K3 (measure first) |
| x1 | Guard: nothing of ours inside `.mes_text` | rpg-companion P6 | BUNDLE | 69 K5 (report item outside H1–H16) |
| x2 | Receipt-rewrite vs TurnBridge identity test | dynamic-response P4 | BUNDLE | 69 K6 (report item outside H1–H16) |
| x3 | Model-emitted "your move" tag stripped at receipt | dynamic-response P2 | SKIP | deferred in 68: only if derived sources miss hand-backs in a session |
| x4 | Ambient weather/time-of-day layer | rpg-companion P4 | SKIP | value 2, M; presentation only, no session asked |

The four anti-patterns the harvest confirmed (pre-publication private turns, choice-bound "forced outcome" steering, opaque
game-owned state blobs, popup/quiet-generation game bridges) stay rejected; none is planned.

(Counting note: H1–H16k are the 47 counted rows; x1–x4 are report items picked up while writing the plans.)

## v2.4 harvest: not-yet-built ideas

Built ideas are listed in §Built. Each row below was checked in code.

| # | Idea | v2.4 source | Code today | Verdict | Destination / reason |
|---|---|---|---|---|---|
| V1 | Prompt-only regex parity (`stHost/regex.ts`) | T7 | absent; `CLEANED_FORM.promptRegex` false (`src/extraction/windowHygiene.ts:11`) | SKIP | v2.4 04 left it unbuilt; no session shows regex-heavy damage; reopen on one |
| V2 | Append-only manual edit = continue; shrink keeps evidence rows | theme 1 | partial: only real `continue`/`appendFinal` re-fingerprint (`src/runtime/turnBridge.ts:146-150`) | SKIP | the `editReread` spike re-reads the newest edited reply; manual appends are rare |
| V3 | Branch from a chosen checkpoint (picker) | theme 2 | partial: `branchFromOldest` only (`src/runtime/chatIdentity.ts:173`) | SKIP | value 3/M; any ST branch can "continue from here"; restore horizon bounds it |
| V4 | Continue list for solo chats | theme 2 | rows only for groups (`src/runtime/playsIndex.ts`) | SKIP | group chats only (v2.8 rule 6) |
| V5 | Raw-Score and hybrid lore arms | T21 | rounded arm only (`src/judge/loreScore.ts:48`) | SKIP | v2.4 D11 dropped the arms (no nDCG gain); the test already says "rounded Score arm" |
| V6 | "Costs N calls" confirm on bulk judge calibrate | T24 | absent | SKIP | judge cost meter exists (`JudgeSettingsGroup.tsx:60-67`); calibration is harness-driven |
| V7 | NanoGPT/OpenRouter hosts + model-id alias map | T25 | absent (`server-plugin/story-orchestrator-judge/index.mjs:10-14`) | SKIP | narrowed by v2.4 D10; TypeSafe works; local provider is v2.8 14 |
| V8 | Entity canonicalisation + "same character?" card | Next tier | partial: roster `aliases` (`src/engine/schema.ts:329`) | FOLD | 52 addendum (with H16d) |
| V9 | Append-only short-term rotation | Next tier | absent (`src/memory/sceneSummary.ts:88-96`) | SKIP | chapters + compaction cover the window; 69 K1 guards compaction |
| V10 | Interceptor trimming of consumed messages | Next tier | absent | NEW | 63 (stepped window over read coverage) |
| V11 | Witness-filtered transcript per drafted member | Next tier | absent | FOLD | already v2.8 42 option C; no addendum needed |
| V12 | Context-horizon scoring (`lastInContextMessageId`) | theme 7 | absent | SKIP | superseded by 63's explicit cut, which names the horizon |
| V13 | Macro placement suppresses the depth injection | theme 7 | absent | SKIP | value 3, no author asked; would double-inject when both are used |
| V14 | Context-relative tier budgets / compaction trigger | theme 7 | partial (`src/memory/budget.ts` estimates) | SKIP | value 2; scope budget and request budgets are token-based already |
| V15 | Scene-source recall pass | theme 7 | partial (chapter recall) | FOLD | already v2.8 43 (verbatim recall) |
| V16 | Embedding rerank consumer | theme 7 | spike only (`src/memory/e0Pool.ts`) | FOLD | already v2.8 21 E0 (A12) |
| V17 | Jaccard token normalisation | theme 7 | absent (`src/memory/similarity.ts:1-3`) | BUNDLE | 69 K7 |
| V18 | Author ledger row edit | theme 7 | absent | SKIP | locks/decisions cover author control; reopen on a session ask |
| V19 | Presence-filtered ledger injection | theme 7 | per member, not by presence (`src/runtime/memoryInjector.ts:177-181`) | SKIP | covered by v2.8 42 witness record when built |
| V20 | Live drift read of owned effects on `PRESET_CHANGED` | theme 8 | absent | SKIP | the preset is a per-request overlay; nothing installed can drift |
| V21 | Judge-picked authored steering (Choice over snippets) | theme 8 | absent | SKIP | v2.8 49's focus picker owns this shape, gated on SP6 and 48 |
| V22 | Adversity read releases from the complication pool | theme 8 | partial: warden note only (`src/runtime/judgeIdeasWarden.ts:45-46`) | FOLD | already v2.8 49 Phase 3 (pool release on SP6 PASS); no addendum needed |
| V23 | Publish SO boundary events for peers | theme 8 | absent | SKIP | no peer consumer; one user |
| V24 | Narrow player-safe `globalThis` API | theme 8 | absent | SKIP | same; debug handles stay internal |
| V25 | Gate trace / live-path overlay | theme 9 | partial (Studio gate replay built) | SKIP | value 3; gate replay answers the authoring question |
| V26 | Tension/quality timeline chart | theme 9 | absent | SKIP | value 2; author-only nicety |
| V27 | `/cp get`, typed blackboard editors, enum autocomplete | theme 9 | partial (`/cp set` only) | SKIP | value 2–3; Author view shows the values |
| V28 | One-click `/persona-set` Repair | theme 9 | partial (opens player setup, `src/runtime/checksSetup.ts:107-210`) | SKIP | the start step owns persona choice by design (wizard never touches personas) |
| V29 | Transition channel comment\|hud\|off | theme 9 | boolean only (`components/settings/PlayGroups.tsx:45`) | SKIP | announcements are off by default; the HUD shows the checkpoint |
| V30 | First-visit coach marks | theme 9 | absent | SKIP | one user who knows the product |
| V31 | i18n | theme 9 | absent | SKIP | English only (owner rule) |
| V32 | Wizard per-field refine, discuss-only turn, reference cards, macro normalisation, story bundle export | theme 9 | absent (Studio undo/redo exists) | SKIP | Ask mode covers discussion; export is the library JSON; no session asked |
| V33 | Prompt-template fingerprint golden tied to calibration | theme 10 | partial (payload goldens, judge seam golden) | SKIP | payload goldens already pin prompts |
| V34 | Boot-smoke of the bundle against fake host modules | theme 10 | partial (artifact smoke against live ST) | SKIP | the artifact smoke runs the real host |
| V35 | Dedicated ST user account for destructive journeys | theme 10 | absent | SKIP | lanes (copies) replaced it |
| V36 | Theme axis in `so-responsive` | theme 10 | absent | SKIP | value 2–3; one theme in use |
| V37 | Fixture export from flagged reads | theme 10 | absent | FOLD | 67 (optional step, unresolved list) |
| V38 | Live shadow extraction arm / judge-vs-extractor live diff | theme 10 | offline replay only (`src/extraction/shadowReplay.ts`) | SKIP | v2.8 12 chose offline replay (option C) |
| V39 | Doc-contract tests for folder rules | theme 10 | partial (citations check) | SKIP | value 2 |
| V40 | Lore "relevant when" arm | theme 11 | absent | SKIP | dropped with T21's arms (v2.4 D11) |
| V41 | General boundary judge bundle | theme 11 | partial (warden riders) | SKIP | riders already merge the same-state uses that matter |
| V42 | Judge tension read into the pacing EMA + hysteresis | theme 11 | partial (sampled tension, N-of-M notes) | SKIP | v2.8 13 J7 consumers own judge tension; numeric tension grading is weak (Reddit caution) |
| V43 | Pre-reply player-message Choice on the reply path | theme 11 | offline spike only (`src/judge/ideaSpikes.ts`) | SKIP | v2.8 13 J7 measured it offline; reply-path budget |
| V44 | Strip roster/persona names from mirror keys | T14 | absent (`src/runtime/memoryMirror.ts:138`) | SKIP | v2.4 05: rate unmeasurable; the mirror now holds relationship rows only |
| V45 | Mirror WI budget share cap | T14, theme 6 | absent | SKIP | same: relationship rows only, small |
| V46 | Missing interop fixtures: silent `mes` rewrite, out-of-band swipe append, synthetic (Roadway-style) messages | T20 | absent (13 v24 shapes exist) | BUNDLE | 69 K8 |
| V47 | Reasoning strip via the profile's `reasoning-template` | theme 3 | absent | SKIP | leading-block rules stay the authority; thought-leak repair covers replies; value 2 |
| V48 | Rpm spacing for side calls | theme 3 | absent | SKIP | breaker + scheduler cover it; one subscription user |
| V49 | Opt-in constrained decoding (json_schema/GBNF) | theme 3 | absent | SKIP | native tool calls (harness bridge, profile tool bridge) replaced JSON parsing for the wizard; llama.cpp grammar trap |
| V50 | Community generation mutex events | theme 3 | absent | SKIP | no installed peer emits them |
| V51 | Current values of in-scope qualities in the read prompt | theme 4 | partial: running totals only (`src/extraction/contract.ts:48-54`) | SKIP | anchoring risk; needs a live-suite arm first; no session asks |
| V52 | Signed relative values (`+5`) | theme 4 | absent (`src/extraction/parse.ts:6-7`) | SKIP | absolute values + `step_rule` cover it; value 3/M |
| V53 | Negative memory: paraphrase suppression for new facts | theme 4 | partial (exclusions; arcs only) | SKIP | value 3; reopen if discarded facts come back in sessions |
| V54 | Full-restatement read mode spike | theme 4 | absent | SKIP | the read model is capable; value 3/M |
| V55 | Witness-scoped facts | theme 4 | absent | FOLD | already v2.8 42 (witness record) / 21; no addendum needed |
| V56 | Declarative per-generation-kind carry policy on `INJECTION_REGISTRY` | theme 5 | partial: ad-hoc `WITHHOLDING_TYPES` (`src/runtime/generationLifecycle.ts:22`) | BUNDLE | 69 K9 (structural guard after plan 60's B10) |
| V57 | `/trigger` by name in NPC replies (numeric names hit ST's index-first lookup) | theme 5 | `src/runtime/effectSteps.ts:66-69` | BUNDLE | 69 K10 |
| V58 | CC `send_if_empty` guard on our `/trigger` paths | theme 5 | detected only (`src/services/stHost/generation.ts:84-92`) | SKIP | play route is Text Completion; verify on a CC lane first |
| V59 | Generation-replacing extension (Polyceph) probe | theme 5 | absent | SKIP | not installed; Nemo is 69 K2 |
| V60 | Hold reads between group-wrapper start/finish (Presence) | theme 5 | Repair warning only | SKIP | the warning names it; v2.8 42 C changes this area |
| V61 | Foreign scan filter check for Lorebook Ordering | theme 6 | TunnelVision only (`src/runtime/checksExtensions.ts:15-24`) | SKIP | SO never removes scan entries (B19 refuted); low |
| V62 | Ownership marker inside wizard-created books | theme 6 | mirror and curator stamps only | SKIP | the wizard's created-asset ledger owns cleanup |

## Built (v2.4 ideas verified in code, no action)

T1 identity-snapshot delete decode (`src/runtime/messageIdentity.ts:57`); T2 branch follow (`src/runtime/chatIdentity.ts:117-156`);
T3 fingerprints + same-chat reconcile (`src/runtime/fingerprints.ts`); T4 abortable calls + backlog Stop
(`src/services/stHost/modelReply.ts:81-93`, `src/runtime/memorizeBacklog.ts`); T5 breaker, no install-wide pause, dangling
profile (`src/extraction/breaker.ts`); T6 outermost loud generation (`src/runtime/generationLifecycle.ts`); T7 window cleaner
(`src/extraction/windowHygiene.ts:99-115`); T8 settings save evidence + re-wrap (`src/services/stHost/persistence.ts:188-301`);
T9 chunker + whole-scene summaries (`src/extraction/chunker.ts`, `src/memory/sceneSummary.ts:41`); T10 active speaker
(`src/runtime/roster.ts:50-60`); T11 downgrade guard + `minimum_client_version` (`src/runtime/persistence.ts:66-125`,
`manifest.json`); hidden ≠ deleted; mirror reaper (`src/runtime/mirrorReaper.ts`); integrity stamp; Continue list
(`src/components/settings/ContinueList.tsx`); records keyed by chat/group id; re-commit after third-party rewrite (spike
`editReread`); swipe-back cache (spike `swipeBackCache`); T22 agency check and T23 house rules (`src/judge/warden.ts`); T24 usage
+ `measuredOn` (`src/judge/client.ts:60-109`, `src/judge/readiness.ts:27`); T25 token guard (narrowed); PERSONA_CHANGED
re-evaluation (`src/runtime/requirementsWatch.ts`); complication pool (spike `sp6Complications`); story-owned scenario
(`src/runtime/storyScenario.ts`); sampler overlay incl. CC (`src/services/stHost/samplerOverlay.ts`); objective block + AN
diagnostic (`src/engine/agency.ts:64-67`, `src/studio/diagnostics.ts`); seeded chance; next-turn token share
(`src/runtime/nextTurn.ts`); `/chat-jump` provenance (`src/runtime/messageJump.ts`); message inspector + `/story flag`; Studio
gate replay (`src/studio/gateReplay.ts`); per-quality macros (`src/runtime/qualityMacros.ts`); wand menu
(`src/services/stHost/storyWand.ts`); "What could I do?" (`src/runtime/suggestions.ts`); player-visible qualities; judge-off
column; over-steer probe (`scripts/debug/lib/overSteer.mts`); lore contradiction in the warden; `memoryRerank` removed.
T12 WI activation evidence (`src/runtime/worldInfoEvidenceHost.ts:57`); T13 scan-time gating (`src/services/stHost/worldInfoScan.ts:18`,
`src/runtime/scanGatePlan.ts`); T14 event typing, reaper, scene rows no longer mirrored (`src/runtime/memoryMirror.ts:62-66`);
T15 `evidence_from` + `player_attempts_only` (`src/engine/schema.ts:82,100-103`); T16 objective line in the guidance block +
AN-inheritance diagnostic; T17 curator hardening (`src/stagecraft/proposal.ts:67,85`, `src/stagecraft/parse.ts:35,43`, word
diff); T18 per-role routes (`src/runtime/passProfiles.ts`); T19 next-turn tokens, foreign blocks, memory fate, chat-jump; T20
interop corpus (13 `v24-*` scenarios) + event-name guard (`scripts/debug/eventNames.test.mts`); finish-reason truncation,
degenerate-loop detector (`src/extraction/degenerate.ts`), input-proportional `maxTokens` (`src/extraction/callBudget.ts`), CC
sampler payload rule; `step_rule`; deterministic OOC (`src/engine/ooc.ts`); `[intends]`; dry-run skips; tool-call turns; lore
forced from the interceptor (`src/runtime/loreSelectTiming.ts`); per-tier `scannable`; requirements from chat, persona and
character books (`src/services/stHost/selectors.ts:54-77`); `worldInfoCache` eviction.

## Unresolved questions

- 65 needs the owner's call on 51 decision 2 before anything else in it matters.
- 62 stage 2 and 63's window are each gated on a measurement; if the owner prefers to skip the measurements, both plans say
  what would be built.
- Three spikes the v2.4 ideas map to (`swipeBackCache`, `editReread`, `sp6Complications`) are on by default but still labelled
  experimental; promoting or retiring them is outside this triage.
