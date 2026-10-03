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
   v2.8 07 mouth setting on 2026-10-03. Anything else player-visible waits for a session that asks for it.
5. **Every server in the tray.** Any service a plan adds (local judge server, image broker, sprite builder, model
   server) gets an entry in `C:\dev\tray\items\story-orchestrator.json` (format: `C:\dev\tray\README.md`) with
   start/stop and a readiness status, and its gate checks the entry (`C:\dev\tray\status.txt` OK). **Models, weights and
   caches live off `C:`** (an env var or setting names the path; the gate asserts it is not on `C:`).
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
| 05 | `05-self-contained-images.md` | 26 | ST Image Generation route, ComfyUI discovery, broker optional, probes | D | LI + CL (director profile) |
| 06 | `06-sprite-generation.md` | 26b (new) | in-plugin sprite builder contract | D | LI |
| 07 | `07-talking-sprites.md` | 28 | blink/talk frames, animator, mouth setting | D + LI (spike S28) | LI + a streamed reply on a named backend (RP or CL) |
| 08 | `08-living-cards.md` | 32 | per-chat card/persona overlay, look sprites | D | RP (S32-1), LI (looks) |
| 09 | `09-wizard-assistant.md` | 27 | knowledge base, Ask mode (projected), tutorial | D | CL (DeepSeek CC profile) |
| 10 | `10-briefing-drafting.md` | 03 decision 1 | wizard drafts a briefing (auto on the fly, Premise step) | D | CL |
| 11 | `11-curator-create-op.md` | 12 | curator `create` op, contract B, Lore-creation role | D | CL (frozen fixtures) |
| 12 | `12-j6d-shadow-record.md` | 20 | offline replay judge vs extractor | D (reconstruction) | CL |
| 13 | `13-j7-judge-ideas.md` | 14 | Phase A for every J7 idea + N1–N8 | D | CL (TypeSafe) |
| 14 | `14-open-source-jev.md` | 15 | local judge provider (systemone, then NLI), our own evals | D | LT; RP for the play-load check |
| 15 | `15-cue-scene-read-merge.md` | 21 | A/B on labelled windows | D | CL |
| 16 | `16-sp5-story-scenario.md` | 16a | SP5 live legs in groups (SP5.b itself = v2.7 02 C1) | D | RP |
| 17 | `17-sp6-complication-pool.md` | 16b | SP6 measurement | — | RP |
| 18 | `18-quests-and-game-layer.md` | 19 | quests, visible qualities, checks, milestones, Journal; production complications (Q6) | D | CL (M1/M2 reads) + RP |
| 19 | `19-open-stretches.md` | 17 | open stub mode, pressure, encounter pool | D (engine half) | RP (A/B) |
| 20 | `20-character-life.md` | 18 | relationships, mood, agendas, schedules | D | CL (M1) + RP |
| 21 | `21-smart-context-harvest.md` | 29 | E0 ranking evaluation + offline group witness feasibility | D | CL |
| 22 | `22-living-story-director.md` | 24 | M1 spike; then M1–M3 with UI | D | RP + CL |
| 23 | `23-test-plan.md` | v2.6 10 / 14 as the model | the v2.8 test plan: per-plan acceptance by tier, the one final real-LLM suite (absorbs v2.7's owed rows from 01 §A), sessions, blind rating packs, budget, freeze and attestation | — | all tiers; last |

**Dependencies inside v2.8** (Sol split item 8, review F16, A2):
- 17 → 18 → 19: the SP6 measurement (17) decides whether 18 builds the production complication component (Q6); 19's
  pressure integration uses it. 19's engine half can build earlier; its pressure gate runs after 18 Q6.
- 12 → 13: J7.6 needs 12's reconstruction replay.
- 13 N2 lands on 05's cue seam (05 names it); 13 N8 adds a judge arm to 20 M1.
- 05 → 06 → 07 / 08: sprite generation needs the image route; talking frames and look sprites need the builder.
- 04 C4 (quest log), C7 (stat sheet) and C9 (a) public roll chips integrate after 18; C5 builds earlier on v2.7 06's
  panel frame. C1–C3, C6 and C9 (b) (author Activity panel + roll store) are v2.7 06.
- 23 runs last: its final suite needs every other plan frozen.
- 03 → 02 `player` blocks; 07 S28 → 02 `--anim`; 03 and 08 share `player.card`.
- 03 builds on v2.7 05's briefing modal and v2.7 04's check registry; 10 builds on v2.7 05's format; 09 on v2.7 01's
  registry and Help.

## Decisions (user, 2026-10-03)

Re-keyed from `v2.7/00-overview.md` §Decisions. The inline answers stay in each plan.

| v2.8 | Was | Decided | Scope change |
|---|---|---|---|
| 01 | 02, 06, 08, 10, 23 | 02: C3/C4 measure on the first v2.7 build (v2.6 untouched). 08: **SP2 v2 option A is important** (the user edits replies and uses a post-processor); held reply loud only, 15 s cap; R5′ net of displaced reads. 10: **fund one thinking A/B** (Cydonia or Skyfall). 06: story + checkpoint level behind R4; Astra rates. 23: the user plays the over-steer session; a test card so Claude plays it too | A moves from parked to built |
| 02 | 05 | do every step; academy act pilots v2.8 18, the 7-member act pilots v2.8 20 | new rows from review D13 |
| 03 | 30 | profile, create-by-click, keep-current default, `requirements.personas` kept, no judge fit check, Adolion `player` blocks | **no persona switching inside a story** (chosen at start, always locked; a switch raises a finding); the ST persona is the base, story changes go through v2.8 08's overlay |
| 04 | 04 | plays index holds checkpoint names; seamless backfill (v2.7 06) | **build all C-items**, draggable panels where it makes sense, each switchable per story; **new C9 "Behind the scenes"**. Split 2026-10-03 (user-approved): C1–C3, C6, C9 (b), the frame and the toggles in v2.7 06; C4, C5, C7, C9 (a) here. C8 is built in v2.7 05 |
| 05 | 26 | all recommendations | sprite generation becomes v2.8 06 (campaign script as the base) |
| 06 | 26b | from 05 decision 6 and the review (F31) | new plan |
| 07 | 28 | drop Talkinghead; B + P; on by default with reduced-motion off | mouth frames compared (2 vs 3) **and** a "Mouth movement" setting (off/simple/smooth); D (rig) → v2.9 05 |
| 08 | 32 | all recommendations | — |
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

## Status

| Plan | State |
|---|---|
| 01 | written 2026-10-03 from v2.7 carry-in; items decided; option A, the A/B, R4 and the session not run or built; owed v2.7 live rows open |
| 02 | written; decided (do every step); A4/A5 and new rows not started |
| 03 | written; decided (review of the answers applied); not built; S30-1 not run |
| 04 | written; decided; reduced to C4, C5, C7, C9 (a) on 2026-10-03 (the rest moved to v2.7 06); not built |
| 05 | written; decided; not built |
| 06 | written 2026-10-03 (contract only); not decided in detail; not built |
| 07 | written; decided; not built; S28 not run |
| 08 | written; decided; not built; S32-1 not run |
| 09 | written; decided; not built |
| 10 | written 2026-10-03 from v2.7 05 decision 1; decided in principle; contract not reviewed by the user; not built |
| 11 | written; decided (build B); not built; fixtures not frozen |
| 12 | written; decided (option C); not built |
| 13 | written; decided; not built; no Phase A run in v2.8 yet |
| 14 | written; decided; not built; jevbench read, our evals not run |
| 15 | written; decided (measure first); not run |
| 16 | written; decided; SP5.b built in v2.7 02 C1 (check its gate record); live legs not run |
| 17 | written; decided (run on the pod); not run |
| 18 | written (exploration); decided; not built |
| 19 | written (exploration); decided; not built |
| 20 | written (exploration); decided; not built |
| 21 | written (research); decided (E0 first, offline); not run |
| 22 | written (exploration); decided (M1 first); not run |
| 23 | written 2026-10-03 (test plan); runs last |

## Review 2026-10-03

Applied here: F01 (per-plan status), F15 (gate taxonomy), F16 + A2 + Sol split item 8 (dependency order), A3 (no
public relationship meters), A4 (rows rewritten from decisions), B10 (registry rule), B4 (second-model labels), B12/F36
(qualified references), C6 (DeepSeek reads are CL, not RP). Per-plan findings are listed in each plan's own
"Review 2026-10-03" section.

2026-10-03 (later): the 04 row reflects the user-approved move of C1, C2, C3, C6, C9 (b), the panel frame and the
per-story toggles to v2.7 06; plan 23 (test plan) added as the last row.
