# Plan 33 — Player loop fixes

**Status: SEEDED 2026-10-07; moved from v2.8 01 §C (W1), v2.9 04 option D (W2), v2.8 13 N1 + N6 (+ J7.2) (W3) and
v2.8 04 C5 (W4); needs user approval; not built.** Overview: `00-overview.md` (scope under review 2026-10-07).
**Gate tiers:** implementation D; acceptance CL and RP per workstream. Real-model rows are allowed in v2.7 by the
2026-10-07 re-scope (an exception to v2.7 rules 5 and 6, as rule 13 is for the image track); RunPod may carry test
volume. Every test, these included, re-runs from zero in v2.7 39 (Phase C).

## Sources

- `docs/plans/v2.8/01-v27-carry-over.md` §C (option A, floors V0–V8), O10 (option C's real re-read leg), §G (over-steer
  session).
- `docs/plans/v2.7/10-sp2-recommit-v2.md` (option C built `e9082dd5`; host facts H1–H6; decisions 1–5).
- `docs/plans/v2.9/04-d6-t22-revisits.md` (option D, T22 floor, decisions 1–6).
- `docs/plans/v2.8/13-j7-judge-ideas.md` §J7.2, §Research N1 + N6, P2, P4, §Spike programme, ship rule (v2.8 rule 9).
- `docs/plans/v2.8/04-story-presence-panels.md` C5; `v2.8/09-wizard-assistant.md` §B (player projection);
  `v2.8/10-briefing-drafting.md` §Model-input spoiler protection.

## Player outcome

A player who never opens Author view gets: edits that count before the next reply (W1); agency, responsiveness and
repetition corrections that actually reach the next prompt instead of waiting for an author (W2, W3); and a "What could
I do?" button that fills the input box with suggestions that fit the scene and spoil nothing (W4).

## W1 — Edit re-read before the next reply (v2.8 01 §C, SP2 option A)

**Problem.** Editing the newest reply rolls back from it; the next request is built from the pre-edit state until a
re-read lands and another boundary commits (v2.7 10 §What it is). Option C only says so ("catching up after your
edit"). v2.6 measured the unawaited re-commit: editor leg 3/3, post-processor (recast-shaped) leg 0/2, R5 2 reads per
edit (`v2.5/09-sp2-spike-report.md:132-133`).

**User decisions (verbatim).** v2.7 10 decision 1: "Yes, i do. This is actually an important feature for me."
Decision 3: "Whatever u recommend" (recommendation taken: loud generations only, 15 s cap, then go ahead and journal
"the edit was not read in time"). Decision 4 (R5′, reads net of displaced reads): "yes". 2026-10-07: "option A is
important"; the user edits replies and uses a post-processor.

**Design — decided** (v2.8 01 §C, unchanged): the spike's three steps (roll back; re-enqueue untouched writes and
commit; one read of the edited text; commit), plus (1) a settle window per message id, so a burst becomes one cycle on
the last text; (2) a hold in the interceptor's `hold` slot that waits for a pending cycle, loud generations only, 15 s
cap, journal on timeout; (3) the cycle takes a `RunOwnership`; (4) re-stage what `GENERATION_STARTED` set (H4);
(5) C12: re-fire the transition only when the edited text still satisfies the gate. Ships behind a dev flag until
V0–V8 pass twice (v2.8 rule 9), then default on; the switch stays one release. While held, the pipeline keeps showing
v2.7 10's `catching-up`.
**Open:** step 0 — which post-processor the user runs, and whether its rewrite lands before or after our boundary
commit (v2.7 10 §Current state "Open"); the settle-window length (proposed 750 ms, measured in step 0); v2.6's 180 s
"no audit" case (`test/measurements/v2.6-03/sp2/`).

**Reuse.** `TurnBridge.setMutationSeam` (`src/runtime/turnBridge.ts:96`), `onMutation` (`:228`), MESSAGE_EDITED /
MESSAGE_UPDATED (`:81`, `:83`); `RuntimeManager.writes.requeue` (`runtimeManager.ts:471-472`); `rollbackOnEnter`
(`:356`); hold slot `gatedInterceptor` (`src/runtime/loudGenerationGate.ts:36`) and its precedent `holdForChat`
(`src/runtime/wiring/talk.ts:43-48`, `CHAT_SETTLE_TIMEOUT_MS`, `chatSettle.ts`); `rollbackRereadReason`
(`extraction/rereadReason.ts`) + scheduler `rereadReason` + pipeline `catching-up` (v2.7 10 gate record);
`DROPPED_SPIKES` guard (`devOnly.guard.test.ts:30`) must be updated deliberately, not bypassed.

**Model input: yes** — the held request carries the post-edit state (the purpose). Payload invariance: with no edit,
requests byte-identical to today and hold time 0; flag off, byte-identical including after an edit; with an edit, the
only diff is the state the edited text produces (equal to a replay of the edited chat, V1/V7).

**Tier:** D impl; CL (read role) + RP acceptance. **Gate:** `npm run gates`; ownership census row for the new async
writer; fault-matrix row for the new mutation shape; bundle budget (`scripts/release/buildChecks.mjs`
`BUNDLE_BUDGET_BYTES` 1,250,000); live V3/V4 real-LLM on an adolion-fresh lane ×2, J6 ×2, run-header diff around the
batch. Folds in v2.8 01 O10 (option C's real re-read leg).

**Floors** (predeclared, verbatim from v2.8 01 §C):

| # | Condition | Floor |
|---|---|---|
| V0 | step 0 | the "no audit" case explained; the user's post-processor's event order traced |
| V1 | re-commit ≡ replay | 800/800 over 4 seeds × 200 cuts; both negative controls unequal |
| V2 | one cycle per settled burst | R3 (a)–(f) + a burst of 2–5 rewrites = 1 cycle on the last text |
| V3 | post-processor leg live (measured first) | the next request carries the settled text in every burst case, ×2 |
| V4 | editor leg live | 4 of 4, ×2 |
| V5 | cost | R5′: extra reads per settled edit net of displaced reads ≤ 1; hold p95 recorded |
| V6 | hold safety | a hung read releases at the cap; the reply goes out; journal row present |
| V7 | C12 interaction | edit of the gating reply with an onEnter post ends like a replay of the edited chat |
| V8 | rollback journey | J6 green ×2 with the flag on |

## W2 — Agency notes reach players (v2.9 04 option D)

**Problem.** `wardenAcceptMode` defaults to `review` (`src/runtime/settingsModel.ts:180`) and is shared by every warden
family (v2.4 X22). `agencyCheck` is on (v2.6 rule 5), so a player-only install pays for the agency question on every
reply and gets nothing: the note waits for an author who never opens the drawer (`test/sessions/T3/SUMMARY.md:187`). Prerequisite
for every warden-based player feature (W3 N1/N6, v2.7 37 L6).

**User decisions (verbatim, v2.9 04).** 3: "yes" (`agencyCheck` stays on). 4: "lets take notes and reevaluate once we
have some session then". 5: "i'll play it, but add a tesst case so that claude also plays it." 6: "defer". On
2026-10-07 the user pulled option D into v2.7 ahead of the session; 4 and 6 are therefore re-asked below (decision 2).

**Design — decided:** split the accept mode per family: agency `auto`, continuity `review` (v2.9 04 option D, first
form). A note's status is computed per finding (`wardenNoteOps`, `src/stagecraft/warden.ts:73-84`, today one `mode` for
all); a record may then hold an accepted agency op beside a pending continuity op, and `newestCarriedNote` carries only
accepted indices. `wardenAcceptMode: "off"` still stops every family. Existing stored settings keep their value for the
shared key; the new agency key is absent → `auto`.
**Open:** the shape (a new `stagecraft.agencyAcceptMode`, or a per-family map `wardenModes`); lore and house-rule
families (recommend: follow continuity, `review`); player copy in `StagecraftPanel.tsx:174` and `PlayGroups.tsx:79-87`.

**Reuse.** `runWardenPass` / `onGenerationStarted` / `commitNote` (`stagecraftCoordinator.ts:344-460`): note rides the
outermost loud generation, lapses after the player writes again, withdrawn on rollback, author nudge wins;
`wardenFamilies` (`src/runtime/continuity.ts:84-89`, agency stands down where `never_narrate_player_action` is false);
`composeWardenNote` (4-line cap, family order); settings sanitizer (`settingsModel.ts:267-273`).

**Model input: yes** (in a player-only install the agency note now reaches `INJECTION_REGISTRY.continuityNote`, depth 0,
for one loud generation). Payload invariance: `agencyCheck` off or warden off → byte-identical; with a seeded agency
finding the only diff is the continuity-note block on the next loud request; a seeded continuity finding alone →
byte-identical (still `review`).

**Tier:** D impl; CL (judge) + RP acceptance. **Gate:** `npm run gates`; jest on the warden coordinator (agency applied
in `auto` while continuity waits in `review`, same record), settings migration test, Storybook for the two panels,
then live real-LLM `so-journey J8 --only J8.10 --judge-uses agencyCheck --warden-mode auto` ×2 (v2.9 04 §Gates);
`assert-player-clean`; registry entry (rule 9).
**Floor** (verbatim, v2.9 04 §Floor, T22 for D): "at least 1 reply narrating the player's action, decision or words,
caught by the check. Notes rated "helpful or invisible" in at least 80 % of cases, and 0 notes that produced an OOC or
over-corrected reply. Missing either floor means E or keep `review`." Measured on the v2.8 01 §G over-steer session
(Claude's card, ≥ 40 turns, second-model rater) — see decision 3.

## W3 — Responsiveness and repetition (v2.8 13 N1, N6; J7.2 if approved)

**Problem.** A reply that ignores what the player said or asked is the commonest RP complaint after puppeting; nothing
of ours sees it (`agencyRecovery` sees only a refused route). Artemis loops were a live problem; nothing detects them.

**User decisions (verbatim, v2.8 13).** Research 1: "All". 2 (ride the warden call, P2): "yes". 5 (N6 miner, readout
first): "as you recommend". 6 (spikes then `judge.uses.*` off by default): "yes". J7 decision 1: "Lets do A, and also
review https://github.com/mossyfield/ST-jeved/ for any new use case. This is really important for me bcs is cheap,
fast and works well." J7 decision 4 (as recommended): auto-drop below the threshold, draft mode as an author option.

**Design — decided.**
- **N1 attention:** Score 0–2 (refusal and in-character evasion count as a response), flag below a fractional
  threshold; rides the warden's reply call (same state: player, player_message, reply) on the warden route key; its own
  `judge.uses.*`/spike key and readiness row; a note through the warden path (new family `attention`, W2's per-family
  mode). One call, one fate: a timeout (`CONTINUITY_TIMEOUT_MS` 4000) loses every question on it (P2).
- **N6 repetition:** a pure no-model miner (port of the fork's, MIT, English only) over the latest reply + 5 earlier,
  shown in Author view first; the nudge (warden note naming hot phrases, cooldown 6) only after its fixture passes;
  the judge arm only if the miner alone misses the floor (P4).
- **J7.2 canon verification (if kept, decision 4):** one `memoryVerify`-shaped Noul per canon sentence against live
  facts before the canon is stored (`buildVerifyRequest`, as `extractionCoordinator.ts:273-280`, `chapterSeal.ts:224-234`);
  auto-drop below threshold. J7.7 (draft mode) stays in v2.8 13 and reuses this fixture.
- **Ship rule (v2.8 rule 9):** fixture (20 English rows, labelled before any answer is read; Adolion rows second-model
  checked, never shown to the user) → offline replay (`calibrate-node.mts --replay`, P5) → `spikes.judge<Id>` dev-only
  until floor ×2 → a `judge.uses.*` key in `JUDGE_USES_OFF_BY_DEFAULT` (`src/judge/settings.ts:70`).
**Open:** the attention note text; whether N1's family follows agency (`auto`) or continuity (`review`) — recommend
`auto` (decision 5); default-on after floor ×2 (decision 5).
**Out:** J7.3–J7.6, N4 (adds a reply-path wait) and N7 (duplicates v2.8 20 L6) stay in v2.8 13 or are cut; J7.1, J7.7,
N2, N3, N5, N8 stay in v2.8 13.

**Reuse.** `buildWardenRequests` / `readWarden` / `AGENCY_QUESTION` pattern (`src/judge/warden.ts:58, 152-194`);
`WARDEN_NOTE_FAMILIES` (`src/stagecraft/types.ts:47`); readiness rows (`src/judge/readiness.ts`); `wardenCalibration.ts`
for the combined-request re-measure; steering hysteresis (P3) is not needed for N1 (per-reply) or N6 (cooldown only).

**Model input:** N1 yes (note at `continuityNote`; warden judge request gains a question). Invariance: use off →
warden request and main payload byte-identical. N6 readout: no. N6 nudge: yes, same check. J7.2: yes (stored canon
text changes what canon injection carries); off → byte-identical.

**Tier:** D (fixtures, goldens, miner, replay mode); CL (TypeSafe calibration ×2, combined-request re-measure); RP
(the over-steer/session evidence). **Gate:** `npm run gates`; `npm run test:debug` for the replay mode; calibration ×2
(`so-judge calibrate --use … --record`, page reloaded between runs); combined arm records warden p95 and timeout/refusal
rate with and without N1 — if either moves past budget, N1 moves to its own call and is re-measured (P2); live
real-judge checks ×2 in a group chat on a lane; `assert-player-clean`; registry entry.
**Floors** (verbatim, v2.8 13): N1 "ignores recall ≥ 0.85, responds specificity ≥ 0.95 (agency's pair)". N6 "loops
recall ≥ 0.8, fresh specificity ≥ 0.95. The miner alone is the judge-off column." J7.2 "≥ 0.9 unsupported dropped,
≤ 0.1 supported dropped". Warden families inside the combined request: existing continuity, agency and house-rules
fixture rates unchanged (P2). Also bound by v2.8 01 C3's floor: warden timeouts "stays 1 in 50, never retuned".

## W4 — "What could I do?" (v2.8 04 C5)

**Problem.** A player stuck at a checkpoint has no in-world help short of Author view. **User decision (verbatim,
v2.8 04):** "I loved those recommendations, lets build them All, the 8. Make them draggable windowss whenever it makes
sense. Activables on the plugin per story config."

**Design — decided** (v2.8 04 C5): 3–4 suggestions in a movable panel (v2.7 06 `PanelFrame`, built) that **fill the
input box and never send**; off-path call on the memory profile, on demand only; the agency policy in the prompt
(suggest, never decide); the prompt sees only player-safe state. Adds `suggestions` to `STORY_DISPLAY_TOGGLES` (
`src/engine/schema.ts:437`), `shown = story AND install`, defaults on, calls a model only on click. Fill-in checks the
run's ownership token and refuses when the chat changed or the box is no longer empty-or-unchanged.
**Decided here, the one projection module:** `src/runtime/playerProjection.ts`, pure, main entry, built over
`buildNarrativeStatus` (`src/runtime/narrative.ts:141`) — the same composition the drawer Overview renders, so it
inherits its spoiler checklist. `playedProjection(...)`: title, player intro, names (never ids) of checkpoints in
`visitedPath`, current checkpoint player copy, narrative sections (now / recently / threads / canon prose), enabled
cast card names, the visible transcript window. Never: unreached checkpoints, gates, transitions, objectives of
unreached checkpoints, quality keys, epistemic/ledger/held-secret rows, lorebook text. v2.8 09 player Ask uses it in
place of `src/copilot/agent/playerProjection.ts`; v2.8 10's `briefingDraftInput(story)` becomes its
`startProjection(story)`. Both later plans are re-pointed when approved (decision 6).
**Open:** suggestion count fixed at 4 or 3–4; the prompt text; whether a "you decide" line (accept the first) is
offered.

**Reuse.** `PanelFrame.tsx`; `stHost/generation.ts:59` (`#send_textarea` read; a write is a new `stHost` function with a
typed `WriteResult`); `PLAYER_COPY` and section ids (`narrative.ts:9, 208`); `agency.ts` clauses; memory-profile call
seam of `extractionCoordinator`; `assert-player-clean` sweep list.

**Model input:** main reply payload unchanged (nothing injected; the player sends what they choose). New memory-profile
request only. Invariance: no click → main payload byte-identical; the suggestion request carries only `playedProjection`
fields (jest: forbidden fields absent; a story with a secret at a later checkpoint; held-secret rows absent; identical
projection with and without a held secret, K1).

**Tier:** D impl; CL (memory profile, DeepSeek) acceptance; RP optional for volume. **Gate:** `npm run gates`; jest on
the projection and the toggle truth table; Storybook interaction + a11y at 390/768/1440; spoiler checklist row;
`assert-player-clean` with the panel open; registry entry; live CL ×2.
**Floors:** existing (verbatim, v2.8 04): "never sent, fill the input only, no unreached checkpoint name in 10 runs on a
story with a gated route (string check against the story's unreached names)". **Proposed** (usefulness, declared
before any run): over 20 clicks on 2 group stories (one with a gated route), each suggestion rated by a second-model
rater (Adolion: never the user) `fits | generic | off`: ≥ 75 % `fits`; ≥ 90 % of sets hold one suggestion that engages
the current objective or an open thread; 0 suggestions that state an outcome for the player ("you find the key");
0 exact duplicates of the player's last line; p95 click-to-fill ≤ 10 s.

## Order and dependencies

1. W2 first (small, D impl): the per-family mode is what W3's notes ride.
2. W1 step 0 (V0) in parallel; W1 build after step 0.
3. W4 projection module, then the panel (independent of W1–W3).
4. W3 fixtures and replay (D) in parallel with W2; N1 consumer after W2; N6 miner any time; J7.2 after its fixture.
5. Acceptance (CL/RP) rows batch into v2.7 39 Phase C; W2's floor needs the v2.8 01 §G session.

## Decisions for the user

1. **W1 step 0:** name the post-processor you run (and its settings). **Rec:** name it; Recast-shaped bursts stay as
   scripted fixtures either way.
2. **W2:** ship agency `auto` by default now, before the over-steer session (overrides v2.9 04 decisions 4/6 "reevaluate
   once we have some session" / "defer")? **Rec:** build it default-on behind its own key, and treat the T22 floor as
   acceptance: a miss reverts the default to `review` (or E).
3. **W2:** move Claude's over-steer session (v2.8 01 §G) into v2.7 39 Phase C on RunPod? **Rec:** yes; it is W2's only
   acceptance evidence. Your own session stays as you decided (5).
4. **W3:** keep J7.2 canon verification in this plan? **Rec:** yes; it reuses `memoryVerify` and guards player-visible
   canon prose.
5. **W3:** N1 notes in `auto` and its `judge.uses.*` key default on once floor ×2 + the session pass (v2.8 rule 9
   says off until you turn it on)? **Rec:** `auto`; default-on only by your explicit decision after the evidence.
6. **W4:** adopt `src/runtime/playerProjection.ts` as the single projection, re-pointing v2.8 09 and v2.8 10?
   **Rec:** yes (main entry, not the lazy Studio chunk, because W4 runs in player mode).
7. **W4:** accept the proposed usefulness floor? **Rec:** yes, frozen before the first run.

## Links

v2.8 01 §C, O10, C3, §G; v2.7 10 (option C); v2.9 04 (D6/T22; option D now here); v2.8 13 (N1, N6, J7.2 here; rest
stays); v2.8 04 (C5 here; C4, C7, C9 (a) stay); v2.8 09, v2.8 10 (reuse the projection); v2.7 06 (panel frame,
display toggles); v2.7 37 L6 (needs W2); v2.8 20 L6 (why N7 is out); v2.7 39 (Phase C re-run); v2.8 15 (a merged
cue + scene read changes R5′).
