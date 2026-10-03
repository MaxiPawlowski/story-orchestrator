# Implementation Overview — Story Orchestrator v2.7

**Status: COLLECTING (opened 2026-10-03).** v2.6 is frozen (no more changes) while the user playtests it. This folder
takes topics meanwhile. Nothing here is approved or built. Each topic gets its own plan doc, numbered in build order
(§Build order).

## Rules (draft)

1. v2.6 rules and every invariant in `.claude/rules/architecture.md` are inherited.
2. **v2.6 takes no more changes** (user decision 2026-10-03). Its owed work, the items the seed research marked as v2.6,
   and every playtest finding land in v2.7 (`02-v26-carry-in.md`). v2.6 docs stay as history.
3. A seed is a candidate, not a commitment: a plan names its problem, conditions, floor and gate before it is approved.
4. Playtest findings that become topics cite their source (session dir, `14-findings.md` row, or the user's report).

## Inputs

| Input | What it gives |
|---|---|
| `docs/plans/v2.6/v2.7-seeds.md` | 16 seeds deferred from v2.6 (§Seeds below) |
| v2.6 playtest (plan 14/15 sessions, the user's own sessions) | new topics as they appear |
| User topics | one plan doc each, slotted into §Build order |

## Seeds carried from v2.6

Full rows and sources stay in `docs/plans/v2.6/v2.7-seeds.md`, frozen as history. New findings go to `02-v26-carry-in.md`. Grouped:

| Group | Seeds | Gate before planning |
|---|---|---|
| Spike redesigns | SP2 re-commit v2 (await the re-read), SP9 witness filter v2 (host-channel aware), SP5/SP6/SP1/SP10 defers | the dropped spike's report says why; a new design, not a re-run |
| Judge | J6d shadow record, J7 ideas (scene break, canon verify, epistemic, cast tuning, look-ahead, per-quality floors, canon drafts), B10 CLI-as-judge, open-source Jev alternative (v2.6 plan 12 Phase B) | 20-case English fixture per use; provider calibration row |
| Curator / warden | curator `create` op (none-case floor 0.788 vs 1.00), warden-lore folded into one request (R5 unmeasured) | the floor that stopped it |
| Extraction | cue + scene read merge, commitment double negatives (negation-scope parser) | J11 audit reasons; T0 negation fixture |
| Runtime | C4 option (b) re-stage after jump | session evidence that unstaged jumps hurt |
| Product scope | new game plus, thinking per story (story/checkpoint asks for thinking; Repair warns on harvestReasoning + disabling prefill) | user decision |
| Decided at review | D6/T22 revisits, model choice (Artemis vs v1.2 / Cydonia-24B) | user sessions; blind pack |

## Build order

Plans are numbered in build order (renumbered 2026-10-03; before that they were numbered by arrival).
**Tier 1 and 2 need no RunPod**: their gates are deterministic (`npm run gates`, no-LLM scenarios, Storybook) or call
only the cloud judge (TypeSafe). **Tier 3 needs the RunPod model**: a real-LLM live gate or a measurement on Artemis.
A plan with rows in two tiers is listed where its first buildable part sits; its later rows are named in tier 3.

### Tier 1: no LLM

| # | Plan | What gets built | Kind |
|---|---|---|---|
| 01 | `01-docs-and-in-app-guidance.md` | feature registry first (later features register into it), docs split, Help panel, plain-language pass, triage | user topic |
| 31 | `31-story-health-center.md` | one check registry (Repair becomes its ordering) + one "Story setup" surface while a story is active; later plans add checks, not alert channels (numbered 31: builds right after 01) | user topic |
| 02 | `02-v26-carry-in.md` | **C2** privacy Repair row, **C6–C10** image/curator fixes, **C11** small plans | carry-in |
| 03 | `03-story-briefing.md` | briefing format, modal, Studio editor (the wizard's drafting is optional, later) | user topic |
| 30 | `30-player-persona-and-start-setup.md` | story `player` profile + "Who are you in this story" step inside 03's "Before you start" modal (keep / switch+lock / create by the player's click only); spike S30-1 first (persona switch vs scripted opening); no RunPod, the injected block rides the final real-LLM suite (numbered 30: builds with 03) | user topic |
| 04 | `04-story-presence-ui.md` | plays index, list badges, Continue list, title card, wand entry (C5 suggestions need an LLM: tier 3) | user topic |
| 05 | `05-adolion-campaign.md` | **A1–A3** docs/check/pin, **A7** briefings (A4 lab data and A5/A6 follow later) | campaign |
| 26 | `26-self-contained-images.md` | ST Image Generation route, ComfyUI model discovery, template prompt, broker optional + fail-open, probes/Repair, quiet defaults (numbered 26: arrived after the renumbering; builds here). Sprite generation = 26b after it | user topic |
| 27 | `27-wizard-assistant.md` | shipped knowledge base (plugin + author guide + condensed ST know-how), read-only Ask mode, character-building tutorial (needs plan 01's registry; cloud authoring profile, no RunPod) | user topic |
| 28 | `28-talkinghead-review.md` | Talkinghead is gone (removed from ST in 1.12.13, Extras archived); instead: build-time blink/talk frames via the campaign's ComfyUI edit pipeline + a tiny animator in VnStage; spike S28 first (local ComfyUI, no RunPod) | user topic |
| 29 | `29-smart-context-harvest.md` | Smart Context deprecated, Vector Storage covered; harvest only verbatim quote recall (spike, solo first) after 02 C2 and the Q-M5 measurement (+P3 arm); needs a model for the reply-accuracy floor (tier 3) | user topic |
| 06 | `06-thinking-per-story.md` | the Repair warning (the story/checkpoint level waits on R4: tier 3) | seed |
| 07 | `07-commitment-double-negatives.md` | player line + hold reason in the author journal row | seed |
| 08 | `08-sp2-recommit-v2.md` | option C: "catching up after your edit" status + README | seed |
| 09 | `09-c4-option-b-restage.md` | close; optional author panel of skipped staging | seed |
| 10 | `10-model-choice.md` | decision + switch checklist (doc only) | seed |
| 11 | `11-warden-lore-one-request.md` | close (keep the separate call) | seed |
| 12 | `12-curator-create-op.md` | not built in v2.7 (decision only) | seed |
| 13 | `13-b10-cli-judge.md` | drop as a runtime judge; optional offline labelling | seed |

### Tier 2: cloud judge only (TypeSafe), no RunPod

| # | Plan | What gets built | Kind |
|---|---|---|---|
| 14 | `14-j7-judge-ideas.md` | scene-break confirmation + canon verification fixtures and calibration | seed |
| 15 | `15-open-source-jev.md` | local NLI provider + calibration on CPU (its play-load check is tier 3) | seed |

### Tier 3: needs RunPod

| # | Plan | What gets built | Kind |
|---|---|---|---|
| 16 | `16-spike-defers.md` (index) → `16a-sp5-story-scenario.md`, `16b-sp6-complication-pool.md`, `16c-sp1-swipe-back-cache.md`, `16d-sp10-tool-call-turns.md` | 16a SP5.b (plan 02 **C1**; no model call, could move to tier 1), 16b SP6 measurement (feeds 19), 16c SP1 park + swipe-back counter, 16d SP10 README note + probe removal (plan 02 **C5**); plus plan 02 **C3** judge timeouts, **C4** owed live checks | seed + carry-in |
| 17 | `17-open-stretches.md` | open stub mode (its engine half is pure; the A/B needs the model) | user topic |
| 18 | `18-character-life.md` | relationships, mood (reads); agendas and schedules are pure code but ride on the same measurement | user topic |
| 19 | `19-quests-and-game-layer.md` | quests, visible qualities, checks, milestones, Journal (M1/M2 measure extraction load) | user topic |
| 20 | `20-j6d-shadow-record.md` | offline replay judge vs extractor | seed |
| 21 | `21-cue-scene-read-merge.md` | A/B on labelled windows | seed |
| 22 | `22-sp9-witness-filter-v2.md` | **deferred to the next version** (kept as a candidate; the Repair row ships in 02 C2) | seed |
| 23 | `23-d6-t22-revisits.md` | one session with the warden on `auto` | seed |
| 24 | `24-living-story-director.md` | M1 spike; if it passes, M1–M3 ship with proper UI | user topic |
| 25 | `25-new-game-plus.md` | **deferred to the next version** (user, 2026-10-03) | seed |
| Z | close-out | regenerate settings reference + README feature table, second feature triage for review, guide pages checked against the UI, "What's new" for 2.7 (plan 01's answer to "build docs first or last": both) | process |

Also tier 3: plan 04 C5 (suggestions), plan 05 A4 (lab data runs), plan 06's story/checkpoint level (R4), plan 15's
play-load check.

Cross-plan: plan 04's plays index feeds the Continue list and any cross-chat view; plan 19's `display.public` is how
plan 18's relationship meters become visible; 03, 04, 17, 18, 19 and 24 add spoiler-checklist rows and wait on the
playtest (rule 7). Every plan from 03 on registers its features in plan 01's registry.

## Decisions (user, 2026-10-03, plans 01–15 reviewed)

Answers are written inline in each plan's decisions list; this is the index plus what changed scope.

| Plan | Decided | Scope change |
|---|---|---|
| 01 | all recommendations; **internal records move to the private `so-sessions` repo** | — |
| 02 | build order C2, C1, then C3; v2.6 untouched, so C3/C4 measure on the first v2.7 build | — |
| 03 | all recommendations | **new:** when no briefing is authored and the player has auto/wizard on, the wizard may draft one on the fly; **new:** a different colour/indicator in the group selector for a full saga vs a single act |
| 04 | as recommended | — |
| 05 | **do every step** (A1–A7); pin moves at the start of the v2.7 build; academy act pilots 19, the 7-member act pilots 18 | — |
| 06 | warning, no turning thinking on from a non-thinking setup; story + checkpoint level behind R4; Astra rates | **changed:** the warning must reach players too (a story downloaded from the internet is played without Author view): a general player-safe alert, not only an author Repair row |
| 07 | hold; journal row; B if ever needed | — |
| 08 | **the user edits replies and uses a post-processor: SP2 v2 (option A) is important** plus C now; held reply as recommended (loud only, 15 s cap); R5′ net of displaced reads | A moves from parked to built (tier 3, needs live legs) |
| 09 | keep (c); defer E to the next version | — |
| 10 | keep Artemis v1.1; switch checklist written (`10a-model-switch-checklist.md`); all three triggers | **changed:** the user funds one thinking A/B (Cydonia or Skyfall) in v2.7 — tier 3 |
| 11 | A: keep separate, close | — |
| 12 | **the user wants the create op**, properly made and tested; contract B, floors kept | **new:** its own model selector (cloud model, or a harness like opencode) |
| 13 | not as a runtime judge; labelling aid yes; W27 kept | **new:** the user wants to connect multiple cloud providers for other roles (e.g. the wizard), which ST may not support; explore uses and come back with proposals |
| 14 | Phase A for J7.1, J7.2 (+J7.7); recommendations otherwise | **new:** review `github.com/mossyfield/ST-jeved` for new judge use cases (cheap, fast, works well); build a test set for the unanswered ideas and run them as spikes/POCs behind settings |
| 15 | build the local provider, opt-in, all uses in the first measurement | **new:** investigate `github.com/fstandhartinger/jevbench` first; our own evals for our use cases across options |

### Decisions on 16–26 (user, 2026-10-03)

| Plan | Decided | Scope change |
|---|---|---|
| 13 (research) | Connection Manager profiles per role; Lore-creation role with plan 12 (+ Critic later); test native tool calls over cloud profiles; keep W27; no own provider seam; fix the 8192 context default (carry-in) | the user has Claude and Codex subscriptions and DeepSeek, not OpenRouter |
| 14 (research) | all of N1–N8 in the stated order; N4 on the reply path as an author opt-in, off by default | — |
| 15 (research) | our own harness; local systemone arm (decider-4b, then Plumb) ahead of NLI; local server on 127.0.0.1 started by the user; cloud models offline only; A5 not in v2.7 | **models stored off `C:`**; **every server goes in the system tray** (`C:\dev\tray\items\story-orchestrator.json`, done 2026-10-03: ST, RunPod tunnel, ComfyUI, Unsloth Studio, GPU broker, debug browser, lanes) |
| 16a | all recommendations (build SP5.b, triage the T7 red first) | — |
| 16b | run SP6 (pod), build in 19 on PASS, no player copy | — |
| 16c | — | **deferred to the next version** (drop if still unmeasured at that freeze) |
| 16d | the user does not use CC function calling in story chats | take B + C (README note, remove the probe); defer the rest |
| 17 | not yet answered | — |
| 18 | relationships both toward the player and between NPCs; meters author-visible, private for players; agendas authored + curator-proposed | schedules drop members from speaker candidates (no cast change); answer written in the plan |
| 19 | all of Q1–Q5; rolls visible; side quests authored + proposed | pilot: Adolion academy act, then the Saga |
| 20 | option C offline replay only; recommendations | — |
| 21 | measure first; triggers first; J11 contract kept | — |
| 22 | the Repair row (02 C2) yes; the rest deferred | **deferred to the next version** |
| 23 | D6 defaults kept; agencyCheck stays on; warden mode decided after sessions | **deferred**; the user plays the over-steer session and wants a test card so Claude plays it too |
| 24 | all recommendations; M1 first, then M1–M3 with proper UI | **new plan 27:** the wizard as a docs-aware assistant with a character-building tutorial |
| 25 | — | **deferred to the next version** |
| 26 | all recommendations | sprite generation reviewed in the plan: becomes 26b after 26 (campaign script is the base) |
| 27 | all recommendations | — |
| 31 | all recommendations | the C2/06 build already seeded the check registry (`src/runtime/checks.ts`) |

## Status

| Plan | State |
|---|---|
| 01–25 | written; every plan has decisions open for the user; nothing approved or built |
