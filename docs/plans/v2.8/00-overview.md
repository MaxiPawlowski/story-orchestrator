# Implementation Overview — Story Orchestrator v2.8

**Status: PLANNED (opened 2026-10-03 from the v2.7 split).** v2.8 = the rest of the defined plans: everything the user
decided on 2026-10-03 that is not an urgent fix or a quick win with deterministic gates (those are v2.7), and not
deferred (those are v2.9). Old → new numbers: `docs/plans/v2.7/RENUMBER.md`. Review findings applied here:
`docs/plans/v2.7/review-2026-10-03.md` (old numbers). Nothing in v2.8 is built yet; v2.8 01 carries owed acceptance of
work built in v2.7.

## Rules

1. **Inherited.** v2.6 rules, the v2.7 rules (`v2.7/00-overview.md` §Rules) and every invariant in
   `.claude/rules/architecture.md` apply unless a rule below replaces them.
2. **A plan is a candidate until its problem, floor and gate are written** (v2.7 rule 3). Floors are predeclared and
   never retuned after a run (v2.3 plan 10, v2.5 plan 09 rule 1).
3. **Findings cite their source** (v2.7 rule 4): session dir, `v2.6/14-findings.md` row, the review ledger id, or the
   user's report.
4. **Player-visible surfaces need a session or an explicit user decision.** Replaces v2.4 rule 7 ("each needs the
   playtest"). An explicit decision counts: the user decided v2.8 04's nine panels, v2.8 18's visible rolls and the
   v2.7 19 mouth setting on 2026-10-03. Anything else player-visible waits for a session that asks for it.
5. **Every server in the tray.** Any service a plan adds (local judge server, image broker, sprite builder, model
   server) gets an entry in `C:\dev\tray\items\story-orchestrator.json` (format: `C:\dev\tray\README.md`) with
   start/stop and a readiness status, and its gate checks the entry (`C:\dev\tray\status.txt` OK). **Models, weights and
    caches live off `C:`** (an env var or setting names the path; the gate asserts it is not on `C:`).
    **Image-track exception, user 2026-10-03 (confirmed 2026-10-04):** existing image models stay on C: for autoload.
    The image track is now v2.7 17–20 + the v2.7 21 Belle pilot; they copy, move or download no weights and record the
    existing paths instead of enforcing off-C.
6. **Group chats only** (v2.7 03). No plan adds solo-chat behaviour. A solo chat appears in a gate only as a control:
   the runtime stays inactive, a story refuses, cleanup runs.
7. **Gate taxonomy** (below, Sol F15). Each plan states where it is implemented and where it is accepted. Deterministic
   gates (`npm run gates`, no-LLM scenarios, Storybook) never close a real-model acceptance row.
8. **Real-LLM regression is batched** into one final suite at the end of v2.8 (v2.6 rule 13); measurements run when a
   build decision needs them. Adolion runs start from `adolion-fresh` (v2.6 rule 14). Every plan closes with
   `npm run gates` (v2.6 rule 16).
9. **New runtime model uses ship dark.** An unmeasured idea gets a fixture and an offline replay, stays dev-only until
   its floor passes twice, then ships as an off-by-default switch (user decision on old 14, 2026-10-03; review C5).
   v2.6 rule 5 (judge uses on by default) covers only uses that already passed their floors.
10. **Feature-producing plans register** in the v2.7 01 feature registry and Help, with a registry gate (review B10).
    Seed closures and offline measurements need no entry.
11. **Adolion stays unspoiled for the user.** No campaign story content in plans or reports. Labels drawn from session
    evidence get a second-model check, never the user (review B4); the user spot-checks synthetic rows only.
12. **References are version-qualified** ("v2.7 03", "v2.8 18", "v2.6 plan 11"), never a bare number (review B12, F36).

## Gate taxonomy (Sol F15)

| Tier | Code | What runs | Cost / dependency |
|---|---|---|---|
| Deterministic | **D** | `npm run gates`, jest/property tests, no-LLM scenarios, Storybook, scripted messages, `seed_metadata`, dry-run payloads | none |
| Cloud LLM | **CL** | DeepSeek API (read/orchestrator roles, wizard authoring profile), TypeSafe (judge) | metered cloud calls, no pod |
| Local text model | **LT** | a model served on this PC (local systemone, NLI, llama-server on the 3090) | local GPU/CPU; tray entry; weights off `C:` |
| Local image model | **LI** | local ComfyUI (images, sprite edits) through the GPU broker | local GPU; tray entry; shares the GPU with LT |
| RunPod | **RP** | the main reply model (Artemis v1.1 on the pod) and anything measured on it | pod time from the budget (`test/sessions/BUDGET.md`) |

"Implementation" = the tier a plan's code can be built and gated at. "Acceptance" = the tier its owed live rows,
measurements or sessions need. A plan is done only when its acceptance rows are green.

## Build order

Numbered in dependency order: a plan never depends on a higher number except where an integration gate is named.

| # | Plan | Was (v2.7) | What gets built | Implementation | Acceptance |
|---|---|---|---|---|---|
| 01 | `01-v27-carry-over.md` | 02, 06, 08, 10, 23, 29 parts | owed real-model rows of built v2.7 work; 02 C3/C4/C12; model-driven C11; SP2 v2 option A; funded thinking A/B; story/checkpoint thinking level (R4); Q-M5/P3; frozen v2.6 measurements; Claude's over-steer card + session | D (option A code, R4 lift) | RP, CL, LI |
| 02 | `02-adolion-campaign.md` | 05 A4, A5 + new | lab data, playtest fix round, `player` blocks, `render_sprites` paths off `C:`, `--anim` frames, trigger narrowing | D (campaign repo) | LI (renders), RP (lab runs) |
| 03 | `03-player-persona-and-start-setup.md` | 30 | story `player` profile, "Who are you in this story" step, persona lock, mid-story switch finding | D (S30-1 on a lane, scripted opener) | RP (final suite: injected block) |
| 04 | `04-story-presence-panels.md` | 04 §C (C4, C5, C7, C9 a) | Journal panel, "What could I do?" suggestions, stat sheet, public roll chips; in v2.7 06's panel frame and toggles (C1–C3, C6, C9 b moved to v2.7 06, user 2026-10-03) | D | D; CL for C5 suggestions |
| ~~05~~ | _moved_ | 26 | → v2.7 17 self-contained images (2026-10-04) | — | v2.8 01 / final suite |
| ~~06~~ | _moved_ | 26b | → v2.7 18 sprite generation (2026-10-04) | — | v2.8 01 / final suite |
| ~~07~~ | _moved_ | 28 | → v2.7 19 talking sprites (2026-10-04) | — | v2.8 01 / final suite |
| ~~08~~ | _moved_ | 32 | → v2.7 20 living cards (2026-10-04) | — | v2.8 01 / final suite |
| 09 | `09-wizard-assistant.md` | 27 | knowledge base, Ask mode (projected), tutorial; §F native tool-call spike over CC profiles (v2.7 14 decision 3; decided 2026-10-03) | D | CL (DeepSeek CC profile) |
| 10 | `10-briefing-drafting.md` | 03 decision 1 | wizard drafts a briefing (auto on the fly, Premise step) | D | CL |
| 11 | `11-curator-create-op.md` | 12 | curator `create` op, contract B, Lore-creation role | D | CL (frozen fixtures) |
| 12 | `12-j6d-shadow-record.md` | 20 | offline replay judge vs extractor | D (reconstruction) | CL |
| 13 | `13-j7-judge-ideas.md` | 14 | Phase A for every J7 idea + N1–N8 | D | CL (TypeSafe) |
| 14 | `14-open-source-jev.md` | 15 | local judge provider (systemone, then NLI), our own evals | D | LT; RP for the play-load check |
| 15 | `15-cue-scene-read-merge.md` | 21 | A/B on labelled windows | D | CL |
| 16 | `16-sp5-story-scenario.md` | 16a | SP5 live legs in groups (SP5.b itself = v2.7 02 C1) | D | D (C1–C5 dry-run plumbing, no model call); real-reply acceptance = v2.8 01 O13, RP (decided 2026-10-03) |
| 17 | `17-sp6-complication-pool.md` | 16b | SP6 measurement | — | RP |
| 18 | `18-quests-and-game-layer.md` | 19 | quests, visible qualities, checks, milestones, Journal; production complications (Q6) | D | CL (M1/M2 reads) + RP |
| 19 | `19-open-stretches.md` | 17 | open stub mode, pressure, encounter pool | D (engine half) | RP (A/B) |
| 20 | `20-character-life.md` | 18 | relationships, mood, agendas, schedules | D | CL (M1) + RP |
| 21 | `21-smart-context-harvest.md` | 29 | E0 ranking evaluation + offline group witness feasibility | D | CL |
| 22 | `22-living-story-director.md` | 24 | M1 spike; then M1–M3 with UI | D | RP + CL |
| 23 | `23-story-widgets.md` | new (user topic 2026-10-03) | story-declared widgets (board, meters, clock, clues, map) rendered by our components over a player-safe projection; sandboxed author HTML only as a seed | D | D |
| 24 | `24-test-plan.md` | v2.6 10 / 14 as the model | the v2.8 test plan: per-plan acceptance by tier, the one final real-LLM suite (absorbs v2.7's owed rows from 01 §A), sessions, blind rating packs, budget, freeze and attestation | — | all tiers; last |

**Dependencies inside v2.8** (Sol split item 8, review F16, A2):
- 17 → 18 → 19: the SP6 measurement (17) decides whether 18 builds the production complication component (Q6); 19's
  pressure integration uses it. 19's engine half can build earlier; its pressure gate runs after 18 Q6.
- 12 → 13: J7.6 needs 12's reconstruction replay.
- 13 N2 lands on v2.7 17's cue seam (v2.7 17 names it); 13 N8 adds a judge arm to 20 M1. (Image track moved to
  v2.7 17–20 on 2026-10-04.)
- v2.7 17 → 18 → 19 / 20: sprite generation needs the image route; talking frames and look sprites need the builder.
- 04 C4 (quest log), C7 (stat sheet) and C9 (a) public roll chips integrate after 18; C5 builds earlier on v2.7 06's
  panel frame. C1–C3, C6 and C9 (b) (author Activity panel + roll store) are v2.7 06.
- 23 runs last: its final suite needs every other plan frozen.
- 03 → 02 `player` blocks; v2.7 19 S28 → 02 `--anim`; 03 and v2.7 20 share `player.card`.
- 03 builds on v2.7 05's briefing modal and v2.7 04's check registry; 10 builds on v2.7 05's format; 09 on v2.7 01's
  registry and Help.

## Decisions (user, 2026-10-03)

Re-keyed from `v2.7/00-overview.md` §Decisions. The inline answers stay in each plan.

| v2.8 | Was | Decided | Scope change |
|---|---|---|---|
| 01 | 02, 06, 08, 10, 23 | 02: C3/C4 measure on the first v2.7 build (v2.6 untouched). 08: **SP2 v2 option A is important** (the user edits replies and uses a post-processor); held reply loud only, 15 s cap; R5′ net of displaced reads. 10: **fund one thinking A/B** (Cydonia or Skyfall). 06: story + checkpoint level behind R4; Astra rates. 23: the user plays the over-steer session; a test card so Claude plays it too | A moves from parked to built |
| 02 | 05 | do every step; academy act pilots v2.8 18, the 7-member act pilots v2.8 20 | new rows from review D13 |
| 03 | 30 | profile, create-by-click, keep-current default, `requirements.personas` kept, no judge fit check, Adolion `player` blocks | **no persona switching inside a story** (chosen at start, always locked; a switch raises a finding); the ST persona is the base, story changes go through v2.7 20's overlay |
| 04 | 04 | plays index holds checkpoint names; seamless backfill (v2.7 06) | **build all C-items**, draggable panels where it makes sense, each switchable per story; **new C9 "Behind the scenes"**. Split 2026-10-03 (user-approved): C1–C3, C6, C9 (b), the frame and the toggles in v2.7 06; C4, C5, C7, C9 (a) here. C8 is built in v2.7 05 |
| 05 → v2.7 17 | 26 | all recommendations | **moved to v2.7 17 on 2026-10-04**; sprite generation is v2.7 18 (campaign script as the base) |
| 06 → v2.7 18 | 26b | from v2.7 17 decision 6 and the review (F31) | **moved to v2.7 18 on 2026-10-04** |
| 07 → v2.7 19 | 28 | drop Talkinghead; B + P; on by default with reduced-motion off | **moved to v2.7 19 on 2026-10-04**; mouth frames compared (2 vs 3) **and** a "Mouth movement" setting (off/simple/smooth); D (rig) → v2.9 05 |
| 08 → v2.7 20 | 32 | all recommendations | **moved to v2.7 20 on 2026-10-04** |
| 09 | 27 | all recommendations | — |
| 10 | 03 decision 1 | fallback to `player_intro`, and "maybe we can create something on the fly with the wizard, if the player enables auto" | LLM drafting split out of v2.7 05 |
| 11 | 12 | **the user wants the create op**, properly made and tested; contract B, floors kept | its own model selector (cloud model or a harness like opencode); Lore-creation role (old 13 research) |
| 12 | 20 | option C offline replay only; recommendations | — |
| 13 | 14 | Phase A for every J7 idea; all of N1–N8 in order; N4 on the reply path as an author opt-in, off by default | review ST-jeved use cases; every unmeasured idea: fixture, offline replay, dev-only until it passes twice, then an off-by-default switch |
| 14 | 15 | build the local provider, opt-in; our own harness; local systemone (decider-4b, then Plumb) ahead of NLI; local server on 127.0.0.1 started by the user; cloud models offline only; A5 not now | investigate jevbench first; **models off `C:`**, **every server in the tray** |
| 15 | 21 | measure first; triggers first (→ v2.8 02 row C7); J11 contract kept | — |
| 16 | 16a | all recommendations (build SP5.b = v2.7 02 C1; triage the T7 red first) | — |
| 17 | 16b | run SP6 (pod), build in v2.8 18 on PASS, no player copy | — |
| 18 | 19 | all of Q1–Q5; rolls visible; side quests authored + proposed | pilot: academy act, then the Saga |
| 19 | 17 | `open` mode yes; authored curve; encounter pool behind M2; in-fiction onward only; measure stubs first | — |
| 20 | 18 | relationships toward the player and between NPCs; meters author-visible, private for players; agendas authored + curator-proposed | schedules drop members from speaker candidates (no cast change) |
| 21 | 29 | group chats only; offline only | **E0** ranking evaluation (5 arms, predeclared floors) before the spike; runtime verbatim recall → v2.9 05 |
| 22 | 24 | all recommendations; M1 first, then M1–M3 with proper UI | new plan v2.8 09 (wizard assistant) came from its decision 4 |

### Open questions decided (user, 2026-10-03: as recommended)

| Question | Decided | Where |
|---|---|---|
| Persona-fit judge check (03), per-chat avatars (08), measuring other hosts of the Jev model A5 (14) | all three go to v2.9 (`v2.9/05-deferred-items.md` §05.5, now decided); the v2.8 plans point there | v2.8 03 decision 5, v2.7 20 decision 11, v2.8 14 decision 7 |
| Native tool calls over CC profiles (v2.7 14 decision 3) | v2.8 09 §F (decided); rows indexed in v2.8 24 | v2.8 09 §F |
| `/story ask` for players vs rule 4 (09 decision 3) | the user's yes counts as the explicit decision rule 4 needs; player Ask ships dev-only, then off by default (rule 9) | v2.8 09 §E |
| Living director "Save as story" (22) | drops unreached generated checkpoints by default; the player is not asked | v2.8 22 §Spoilers |
| Blind ratings of Adolion excerpts (22 M2 and anywhere else) | a second model rates them; never the user (rule 11) | v2.8 22 M2, v2.8 19 M2, v2.8 24 §Blind rating packs, v2.7 12 |
| SP5 acceptance tiers (16, Sol r3 R3-20) | C1–C5 dry-run plumbing acceptance is D on a lane; real-reply acceptance is v2.8 01 O13 (RP) | v2.8 16, v2.8 01 O13, v2.8 24 row 16 |
| Character life M1 floors (20) | direction accuracy ≥ 0.80, stuck rate ≤ 0.10, hiding the current value costs ≤ 5 points, curator-proposal in-goal ≥ 0.85; frozen before the first run | v2.8 20 §Measurement |
| Agenda effects and cast changes (20) | agenda effects exclude cast changes | v2.8 20 §Agendas |
| Shared origin-tagged rollback (`revertOriginSince`, 18 + 20) | whichever plan builds first builds it; the other reuses it and adds its origin | v2.8 18 §Rewards and rollback, v2.8 20 §Agendas |
| v2.8 RunPod budget (23) | EUR 20 cap, as v2.6; stop and ask the user before exceeding it | v2.8 24 §Cost and budget |
| Earlier minor proposals | stand as written: J7.1 `SCENE_CONFIRM_P` = 0.40 (13); env names `SO_JUDGE_MODELS_DIR`, `SO_JUDGE_LOCAL_URL` and provider `systemone-local` (14) | v2.8 13 J7.1, v2.8 14 |

## Status

| Plan | State |
|---|---|
| 01 | written 2026-10-03 from v2.7 carry-in; items decided; option A, the A/B, R4 and the session not run or built; owed v2.7 live rows open |
| 02 | written; decided (do every step); A4/A5 and new rows not started |
| 03 | written; decided (review of the answers applied); not built; S30-1 not run |
| 04 | written; decided; reduced to C4, C5, C7, C9 (a) on 2026-10-03 (the rest moved to v2.7 06); not built |
| ~~05~~ | moved to v2.7 17 (2026-10-04); see `v2.7/17-self-contained-images.md` |
| ~~06~~ | moved to v2.7 18 (2026-10-04); see `v2.7/18-sprite-generation.md` |
| ~~07~~ | moved to v2.7 19 (2026-10-04); see `v2.7/19-talking-sprites.md` |
| ~~08~~ | moved to v2.7 20 (2026-10-04); see `v2.7/20-living-cards.md` |
| 09 | written; decided; not built |
| 10 | written 2026-10-03 from v2.7 05 decision 1; decided in principle; contract not reviewed by the user; not built |
| 11 | written; decided (build B); not built; fixtures not frozen |
| 12 | written; decided (option C); not built |
| 13 | written; decided; not built; no Phase A run in v2.8 yet |
| 14 | written; decided; not built; jevbench read, our evals not run |
| 15 | written; decided (measure first); not run |
| 16 | written; decided; **SP5.b NOT built** (owned by v2.7 02 C1, no gate record as of `c7967323`; `sp5Scenario` is still a dev flag); live legs not run |
| 17 | written; decided (run on the pod); not run |
| 18 | written (exploration); decided; not built |
| 19 | written (exploration); decided; not built |
| 20 | written (exploration); decided; not built |
| 21 | written (research); decided (E0 first, offline); not run |
| 22 | written (exploration); decided (M1 first); not run |
| 23 | written 2026-10-03 (story widgets); not decided |
| 24 | written 2026-10-03 (test plan); runs last |

## Review 2026-10-03

Applied here: F01 (per-plan status), F15 (gate taxonomy), F16 + A2 + Sol split item 8 (dependency order), A3 (no
public relationship meters), A4 (rows rewritten from decisions), B10 (registry rule), B4 (second-model labels), B12/F36
(qualified references), C6 (DeepSeek reads are CL, not RP). Per-plan findings are listed in each plan's own
"Review 2026-10-03" section.

2026-10-03 (later): the 04 row reflects the user-approved move of C1, C2, C3, C6, C9 (b), the panel frame and the
per-story toggles to v2.7 06; plan 23 (test plan) added as the last row.

Round 3 (Sol): R3-15, R3-20 applied; both decided by the user 2026-10-03 (as recommended, §Decisions).














user additional ideas: 
update and explore tunnelvision extension for pattern harvest. We do have a folder where we clone ST plugin repos to review them.
cleanup and optimize tests and gates. They take too long.
I recently saw that there's a big community arount building gamification over tools like obsidian. What are the most populars or trending ones? shall we plan a big deep dive cloning a bunch of repos and reviewing if there's any pattern we could harvest for out plugin?
integrate gpu brooker into ST plugin
Integrate ST workflows into stories
add civitai api key or hugging face api key to download models