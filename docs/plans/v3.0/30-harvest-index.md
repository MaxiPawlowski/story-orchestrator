# v3.0 30 — Harvest plans index (2026-10-30)

Owner 2026-10-30: "create plans on 3.0 for the cool things worth taking a look that you've found? is there any other thing
that would be worth trying maybe from a previous review or something we deferred?"

Inputs: `extension-research-2026-10-30/SUMMARY.md` + reports; `v2.8/extension-research-2026-10-21/SUMMARY.md` §2 and
`niches.md` top 10; `v2.8/61-harvest-triage-2026-10-14.md`; `v2.9/01-triage-sol.md` V3.0 rows; `v2.9/00-overview.md`
§Deferred to v3.0; `v2.9/13-close-out.md`. Each candidate re-checked against `src/` on master `29c1267d`.
Review: `30-review-sol.md` (gpt-6.1-sol, read-only); fixes applied to every plan.

## New plans (all PLANNED 2026-10-30, none built), in value/effort order

1. **38** `38-side-pass-hygiene.md`: off-means-unseen goldens per real switch, no empty labels, two extension conflict rows
   first; then JSON repair, bounded retry feedback, nested vector thresholds. S each. (Naming hint dropped.)
2. **35** `35-here-now-and-last-seen.md`: Here now sheet tab (another `sceneView` consumer), story-time spans stamped on
   chapter records. 29 phase 2. S, no prompt change. ("Last seen" parked.)
3. **37** `37-honest-pipeline-and-feature-rows.md`: HUD names what a read waits on, scheduler-safe Retry; feature rows say
   model and writes; rollback chip ends. 29 phase 2. S-M.
4. **33** `33-deferred-threads.md`: a topic the player put off stops being pushed; reversible defer/reopen events, kept in
   suggestions as dormant. M, read change + rating.
5. **31** `31-outward-narration-and-swipe-contrast.md`: narrator voices only what the player could observe; a swipe sees
   the reply it replaces as a negative. Measure first; S build, M rating.
6. **36** `36-author-secret-grid-and-read-health.md`: author-only who-knows grid + on-stage info row; read failures per
   route/model (telemetry first). M, no prompt change.
7. **32** `32-player-skip-ahead.md`: "Skip ahead" control through 19's one-shot direction, time decided in code, due work
   interrupts. M.
8. **34** `34-place-and-time-grounding.md`: fixed time/place notes on scene-break messages, place lore pinned by an authored
   binding, self-contained place descriptions. M, measure first, rated.

Rated slices (31, 32, 33, 34) share one GPU + rating window when the owner allows it.

## Not mine: suspected defects (owned by branch `v3.0-harvest-1030-fixes`)

Regenerate after a trailing system row; story macros dead after an engine flip; chapter-fold IGNORE hole on CC; archive
recall on the reply path; display-only qualities never read; optional held-secret filter defaults. Not planned here.

## Considered, not planned

- Already built or planned: niches top 10 voice sheet (v2.9 02), sifting threads (v2.9 05), grounded suggestions and
  stakes preview (v2.9 06), delayed echoes (v2.9 07), whispers (v2.9 08), remark bank / hot-button tiers / norms (v2.9 04),
  Here now scene card (v2.8 65, extended by 35), "your move" chip (v2.8 68), stepped history (v2.8 63), stopped partial
  reply policy (decided, v2.8 69 K13), slow-burn caps (v2.8 51), outcome tables (v2.8 49 G19), story-time core (v2.8 50;
  display in 35), live-suite interval/no-change fixtures and holdouts (E01/E02 folded into v2.8 35/24; castward P5 only
  confirms), post-generation revision (17 stays off; lattice dropped its own after a day: one line of evidence for 17).
- Dropped after the Sol review: seeded naming hints (no op creates a person; `living/types.ts:35`), a generic idle-chip
  fade (idle shows no chip; the standing chip is rollback status, fixed in 37 S4), a place-description diagnostic
  (landmarks are legitimate), a timed automatic return of deferred threads as a default (owner question in 33).
- Parked after the Sol review: observed "last seen" (35) and learned-at story time (36): boundary logs hold no historical
  present cast and keep 200 entries; reopen with one evidenced sighting/provenance design shared with 34's notes.
- Rejected with evidence in the reports: portrayal-object second call, shared Stop aborting side passes, model-called NPC
  creation tool (CC only), per-place generated backgrounds (20 packs are the authority), persona start sheet, main-API
  fallback, single-pass in-reply tracking, auto-reminder lines in the read prompt, whole-list memory rewrites, percent
  progress meter, removing V03 phrase avoid lists.
- Parked with a trigger: idle timeout for streamed side calls (bb-map P2: reopen when timeouts show tokens still flowing),
  scan-only name variants (bb-map P3: lean skip), raw-offset reasoning mask (tavernos P5: no consumer), per-swipe state on
  `extra` (stat-tab P3: only if SP1 passes S4), on-demand sub-pass over a range (memory-books P2), condensation
  feasibility pre-check (one line in v2.8 69 K1 if K1 gets a size rule), clamp after rounding (fold into 20 resolver tests).
- Dropped: relative-age labels on memory lines (vectfox 10-21 P5): text changes every turn, conflicts with 13 prefix
  stability.
- v2.9 V3.0 rows stay on their triggers (G01 attempts, G10 time-jump interrupt, N09, N10, N16, N19, V06, V07, M04, G05);
  32 S3 takes only the narrow "stop at the first due point" part of G10.
- v2.9 13 close-out misses are track D rows (00 §Replan), not re-planned.

## Owner decisions needed

1. Blind Sol ratings for 31, 32, 33, 34 (each >= 25 real prompts, decision-4 bar): run them in one window when the GPU is
   free?
2. 32 S2: skip spans at most one day part through the existing read (A, recommended), or a new `time_skip` writer (B)?
3. 33: should a deferred thread ever return on its own (timed), or only when the player mentions it (default)?
4. 38 H1/H2: count director/wizard output as player-facing (then blind rating before adoption), or gate on recorded-call
   replay + CL (default)?
5. Story sheet in a real second window (stat-tab P2, BroadcastChannel, player projection only): after 29 IC5, yes/no?
6. New player surfaces from earlier harvests, each on your explicit request only: player-safe character diary at chapter
   seal (M01), player authors their own feelings/thoughts (simulation-blackboard P1, touches 54 inner voice), named player
   inner voices (N23), per-member typography (N26).

## Small harvest items 2026-10-30

Branch `v3.0-small-harvest` (from master `cc86db08`). CPU only: no GPU, lane, ST, model or judge call; nothing staged.

1. **Local JSON repair before a living-director retry** (lattice P3).
   - `src/utils/jsonRepair.ts` `repairJsonObject` (pure, own module so it rides the living lazy chunk): drops text before
     and after the first object (string-aware, so prose holding braces is cut), trailing commas, raw control characters in
     strings, and closes unclosed final brackets. Refuses anything needing content: unclosed string, dangling key or
     colon, mismatched bracket, unquoted keys.
   - `living/parse.ts` tries the existing slice parse first, then the repair; a repaired draft carries
     `JSON syntax repaired locally: <fixes>` in `draft.repaired` (already journaled by `livingCoordinator`). The draft still
     goes through `buildDirectorOps`, `checkDirectorOps` and `guardDraft` unchanged. Reused `normalizeJsonText` and
     `stripReasoningBlocks`; no other JSON-extract helper existed (`generation/parse.ts`, `copilot/parse.ts` not touched).
   - Tests: `src/utils/jsonRepair.test.ts` (good, prose, commas, unclosed, control chars, 6 refusals);
     `living.test.ts` "repairs JSON syntax locally before spending a retry, and still retries an unrepairable answer"
     (repairable = 1 model call; truncated = 2 calls with the parse issue named; repaired draft refused by the guard = retry).
   - Owed: how often recorded runs refuse at stage `parse` (lattice's precondition) was not measured; the remote director
     route was not run.
2. **Off means unseen** (dooms P3). `src/runtime/offMeansUnseen.test.ts`, settings from `sanitizeGlobalSettings(undefined)`
   and with each switch stored explicitly off:
   - `extraction.readLayout` + `promiseAddressee`: read prompt and contract hash equal `test/goldens/read-prompt/classic.json`
     (junk values too).
   - `memory.deferredOutOfPrompt`: a put-off thread's story-so-far block equals the same arcs without deferral history.
   - `memory.historyNotes`: ST's prompt copy is byte-identical on normal/swipe/regenerate/continue.
   - `memory.outwardNarration`: narrator and member blocks equal the pre-feature render.
   - `talk.swipeContrast`: no set and no clear on any generation type or clearing event (no empty block).
   - `memory.chapters.compact`: no row ignored, no marker, no journal row, `compactedTo` unset.
   - `talk.skipAhead`: feature resolves off, `view()` null, `/story skip` refuses with `SKIP_COPY.off`, no direction armed,
     the host untouched.
   - Each case has a planted on-control. No payload fixture added: no case needs ST's dry-run. Owed: the wiring guards that
     read the same settings (`wiring/talk.ts` `noteHistory`, `armSwipeContrast`; `memoryInjector` outward flag) are not unit
     reached; a lane `so-payload-golden capture` with defaults vs master would cover them (not run).
3. **Host facts into docs** (SUMMARY §Host facts), every file:line re-read in `C:\dev\SillyTavern-MainBranch` (read only):
   - `gotchas.md` §SillyTavern host: stop button events (`script.js:3532-3538`, `:5607-5619`, Castward), swipe prompt view
     (`:4496-4498`, `:4564`, `:6670-6676`), `extra` across swipes (`:6680-6684`, `:3686-3688`, `:3705-3712`, `:6789-6797`),
     Connection Manager accumulated streams and status-less errors (`custom-request.js:165-187`, `:506-529`, `:129-131`,
     `:472-475`), PromptManager DOM drag order (`PromptManager.js:1918-1931`).
   - `debug-scripts.md` Generation state: forced-visible Stop and per-swipe `extra` lines.
   - `ui-dom-selectors.md`: `textarea#curEditTextarea` in the message tree + an edit lifecycle bullet (`script.js:8262-8280`,
     `:11862`, `:12330`).

Gates: `npm run gates:quick` green in 246.9 s (typecheck, typecheck:test, lint, jest related, defect replay 32/32 killed).
`npm run build`: main `dist/index.js` 1,290,908 B (budget 1,300,000); the repair lands in lazy chunk `1381.index.js` only.
Full `npm run gates` not run (parent runs it). Not merged, not staged.

Full gates 2026-10-31 on `v3.0-small-harvest` (master `ad7074f8` merged in):
- Run 1 RED at `test` (942.3 s): `errorCopy.guard` + `codeHealth` S4 flagged the repair (unlisted catch, nesting). Fixed: `stringStep`
  helper, inventory rows `parse.ts#sliced` and `jsonRepair.ts#repairJsonObject`. `gates:quick` does not run these guards.
- Run 2 RED at `test-storybook:ci` (416.6 s): `Studio/CharacterTutorial ReviewBlocksATakenName` axe color-contrast, 1 node; no
  Studio file on this branch, green in runs 1 and 3: flaky (reported to the plan 29 session).
- Run 3 `npm run gates -- --serial` (no --resume): all green in 907.3 s, Storybook included.
## Defect check live rows 2026-10-30 (GPU G1, lane 41)

Scenarios `test/scenarios/v30-hf-regen.json`, `v30-hf-fold.json`, each run twice with `so-scenario run … --sandbox --group
"Group: Arin, DM Narrator"` on lane 41.

- **HF-REGEN: reproduced** (18/18 twice). After a real turn and the `/comment` transition note (an `is_system` row), ST's
  Regenerate deletes nothing: the old replies stay, the note stays at its index, a new group round lands directly under it
  (2 replies) and TurnBridge commits a new boundary (4 -> 6). Host behaviour (group-chats.js `regenerateGroup`); the owner
  decides: intercept, move the note, or accept.
- **HF-FOLD: fixed behaviour confirmed, dry check, NOT green as a real-model gate** (24/24 twice). Route: Terra
  (`openai/gpt-6.1-terra`) requested by the owner; none available (the harness plugin serves no OpenAI-compatible endpoint), so
  ST's Chat Completion assembly ran against the local server (custom source `http://127.0.0.1:18888/v1`) with the CC send
  blocked: no model call. Seal records ch1 0-7, ch2 8-15, keep_tail 2: one folded block 0-13, holes none, kept 14-19 once each
  and in order, 16 CC messages, no folded marker in the prompt. Lane 41's main API restored to its Text Completion profile.
