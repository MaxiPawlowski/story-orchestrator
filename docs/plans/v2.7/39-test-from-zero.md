# Plan 39 — Phase C: test everything from zero

**Status (2026-10-07): SEEDED from the user (2026-10-07: "then do all test over from 0"; "u can use runpod if there're
many test to be done"); needs user approval; not run.** Overview: `00-overview.md`. Supersedes `16-test-plan.md`'s
close-out (§Close-out checklist) and absorbs the real-model rows v2.7 had moved to `v2.8/01-v27-carry-over.md` §A and
the v2.7-plan rows of `v2.8/24-test-plan.md`. 16's per-plan table stays the deterministic row list for 01–28.
**Split 2026-10-07 (owner):** v2.8 01's measurement-only items run here in B1 (§B1 rows from v2.8 01) and its C4 live
checks in C5; their fixes, the R4 gate lift and the model A/B stay in `v2.8/01-v27-carry-over.md`.

## Rules

1. **Nothing carries over.** Every earlier "green" (v2.7 01–28 gate records, plan 24/26/28 live rows, the 2026-10-06
   rollout) is history, not evidence. Each row below runs on the frozen candidate.
2. **One frozen candidate, frozen last** (review 2026-10-07 finding 1). The freeze comes after stage B (measure →
   decide → implement, §Sequence): at freeze no cap or default path is still open. Freeze = one
   commit + its bundle hash (`dist/manifest.json` `bundle.sha256`), recorded before C1, with
   `package.json` and `manifest.json` `version` already `2.7.0` (B0). A fix during Phase C produces a new candidate;
   rows it can affect re-run (the record says which and why).
3. **Tiers** as in `00-overview.md` §Gate taxonomy. Real-model rows are allowed in v2.7 now (user 2026-10-07):
   **RP** (Artemis on the RunPod pod) for reply-dependent volume, **CL** (DeepSeek roles, TypeSafe judge),
   **LI** (local ComfyUI) for images. Local text (LT) only where a plan needs the local route itself.
4. **×2, consecutive, one lane, run header around the batch** (v2.7 16 rule 2). Floors predeclared in each plan,
   never retuned (rule 3). A below-floor result is a failure, recorded, never a re-run until green.
5. **At most two model lanes at once** (`SO_MAX_LLM_LANES`); no-model lanes run in parallel freely.
6. **Evidence**: summaries and gate records public; anything holding chat text, campaign content or art goes to the
   private `so-sessions` repo (`npm run sessions:archive`; `test/sessions/evidence/`).
7. **Adolion stays unspoiled for the user**: campaign rows report pass/fail and counts only (v2.7 rule 11).
8. **Verdict** (finding 2; same rule as `v2.8/24-test-plan.md` §Freeze and attestation item 5):

   | Verdict | When |
   |---|---|
   | **ACCEPTED** | every manifest row ran and is green ×2 on the frozen candidate; no player-facing failure recorded; every rated row rated |
   | **PARTIAL** | every manifest row ran; at least one failed, each with finding id, owner and the user's decision. Any recorded player-facing failure lands here, never in ACCEPTED |
   | **INCOMPLETE** | at least one manifest row has no evidence pair |

   A missing fixture, an unrated pack, or an unavailable prerequisite (pod, profile, judge, lane, ComfyUI) leaves its
   row without evidence: INCOMPLETE, never a skip, never PARTIAL's "ran".
9. **One build** (finding 12; owner decision 2026-10-07, 00-overview §Decisions). There is one build (`npm run build`),
   and it ships the debug handles, so every row runs on it, driven by the harness, with the shipped defaults (every
   setting the old release build stripped is an ordinary setting, off by default; shipped chapter-seal settings). A
   row that needs a setting on says so in its prerequisites. The `prod` / `dev-diagnostic` split is gone.
10. **Row manifest** (finding 13). `test/phase-c/manifest.json`, written in B0, before the freeze. Each row has: `id`,
    source plan, prerequisites, reset procedure, tier, assertion, floor (verbatim,
    with a citation), `evidence[2]` (record paths). Only manifest rows count. A row added after the freeze needs a
    record line saying why.
11. **Reset between run 1 and run 2** (finding 13). Re-seed the lane (`st-lanes.mts seed <n> --fresh`, or
    `adolion-fresh seed`). Clear persona locks and restore the default persona. Restore model routing: the run-header
    `profiles` diff is 0. Remove assets: `so-assets.mts remove --marker` with the run's baseline, `cleanup.mirrorBooks`
    leaked 0. Restore the global config (`so-journey.mts restore-config`). Reload the page, which clears the judge
    cache. `so-run-header diff` around each run shows declared paths only.
12. **Replay means captured inputs** (finding 18). A rollback / reopen / swipe row compares against a replay that
    applies the run's captured accepted inputs (audits, accepted deltas, typed reads) to the edited chat. A
    regenerated LLM reply is not expected to reproduce identical state.

## Sequence

Stage B runs on the pre-freeze build and decides what is built. Stage C runs the whole inventory on the frozen
candidate (finding 1).

| Step | What | Tier | Where |
|---|---|---|---|
| B0 | release version `2.7.0` in `package.json` + `manifest.json` (finding 3); `attestation.test.mjs` made to FAIL, not log, on current-vs-attested bundle drift (`scripts/release/attestation.test.mjs:55-64`), and to fail, not skip, when `docs/release/<version>/attestation.json` is missing in acceptance mode (`SO_ACCEPTANCE=1`, §B0 record); row manifest (rule 10); pinned predecessor named and its goldens captured (§Payload contracts). Deterministic part done 2026-10-07 (§B0 record); the goldens capture is row B0-base (B0-live, needs a lane) | D | local, lane 1 |
| B1 | measurements: 35 SP6 K2–K5 and M2 A/B (stub lab copy, v2.7 38); 36 Q1 M1 scope arms + M2 recall; 37 M1 read accuracy + M2 cost; S-17 combined scope budget; v2.8 01 rows B1-C3, B1-C12, B1-C13b, B1-R4 (§B1 rows from v2.8 01); first, B1-PAR sizes the pod (`LLM_PARALLEL` 2/4/6 on real load, 39a §Hardware) | RP + CL | pod (one RTX PRO 6000, 39a §Hardware), model lanes = the `LLM_PARALLEL` B1-PAR picks |
| B2 | decision record appended here: SP6 verdict, M2 verdict, `QUEST_SCOPE_CAP`, `REL_AXES_PER_READ`, combined overflow priority, 37 default read path, each experiment flag's fate (default on / off / removed); the branch each verdict takes (§Stage B branches) | — | — |
| B3 | build the B2 branch: 35 Phases 3–4 + encounter pool, or the drop path; 36 `clock` or its removal; 37 caps; promotions final; main-entry bundle and ratchet budgets checked (C1b) | D | worktrees, `npm run gates` |
| C0 | freeze; `so-run-header capture` baseline; payload goldens on the candidate: `node scripts/debug/so-payload-golden.mts capture --label c0 --out test/measurements/v2.7/payload/c0` (cases `test/scenarios/payload/*.json`, no model call), plus the feature contracts and off-path captures (§Payload contracts) | D | lane 1 |
| C1 | `npm run gates` (full, Storybook, main checkout) ×2; `npm run test:release` | D | local |
| C1b | ratchet + budget compare against the fixed predecessor (finding 21): each `test/findings/codeHealth.json` list ⊆ the predecessor's list, each budget ≤ the predecessor's (coordinator **560**, manager 700, file 600), the guard constants equal the file; main entry ≤ 1,250,000 B, with each 35–37 production path's main-entry cost recorded in B3 (1,217,068 B at `1910441b`, 32,932 B headroom; lazy chunk unless parse or the reply path needs it) | D | local |
| C2 | mocked scenario corpus ×2; every plan's live (D) row ×2 (v2.7 16 §Per plan + rows of 29–38); rendered-target checks (finding 20, row `C2-rendered-targets`): on the build every Help "Show me" target (player pass, then Author view) is revealed and hit-tests topmost, every "?"/Repair/Studio guide link shows the rendered page and heading, each Studio tab's "Open in the guide" opens `#so-studio-guide-reader` above `#so-studio-modal` and closes by pointer and Escape with the Studio still open, and the bundled setup screenshot renders; no availability filtering by build (one build), so no planted dev-only feature | D | no-model lanes 1–4 in parallel |
| C3 | payload preservation vs the predecessor goldens and repeatability vs C0 (§Payload contracts): `so-payload-golden.mts capture --label c3 --out test/measurements/v2.7/payload/c3`, then `diff test/measurements/v2.7/payload/base test/measurements/v2.7/payload/c3 --declared test/measurements/v2.7/payload/declared.json` and `diff …/c0 …/c3` (exit 1 on an undeclared or stale diff); feature contracts off/on; negative controls | D | no-model lane |
| C4 | journeys J0–J14 `--strict` ×2; J6 again with plan 33 W1 on (V8) | D + RP | model lanes ≤ 2 |
| C5 | real-model acceptance rows per plan: 02 (O3–O8, O13, O13b, O14, C14-b, C4-R6, C4-J8), 03 (O16), 07 (O15), 08–10 (O9–O11), 33 W1–W4 (+ the W2 over-steer session card; W1 V7-live, below), 34, 35 (B1's measurements re-run on the candidate, then Phase 3/4 rows of the B2 branch), 36, 37 (M1, M3), S-15 – S-19, 32 W8 S32-1 ×2, 32 W6 streamed-reply row | RP + CL | pod |
| C6 | image rows: 32's route A/B, S32-2, multi-character sprite rows; 38's asset checks | LI + CL | local ComfyUI, isolated lane |
| C7 | Adolion integration ×2 on `adolion-fresh` (38): every story starts, plays N turns, reopen, rollback, chapter; character-life exercise on the 7-member act (38 §C7) | RP | pod |
| C8 | live smoke on a clean install: v2.7 16 §Live smoke procedure (5 turns, DeepSeek CC, no pod; plumbing only, not acceptance), all features on as shipped | CL | fresh lane |
| C8b | stranger install, guide only (finding 13): the one build, clean settings (empty extension settings, no optional GPU broker, no Adolion assets); follow the installed guide alone to the first real rendered reply in a group story; record each step the guide did not cover | CL | fresh lane |
| C9 | user sessions (optional): play from the guide only; flags filed | human | user's choice |
| Z | close-out: settings reference + README table regenerated from the registry (owner v2.7 29), guide vs UI, What's new 2.7, every gate record final, v2.8 carry-over rewritten; write `docs/release/2.7.0/attestation.json`, THEN `npm run build && SO_ACCEPTANCE=1 npm run test:release` on the candidate: attestation present, its candidate commit = the frozen commit, `bundle.served.sha256` = build = attested (finding 3) | D | — |

C5 order follows dependencies: 33 W2 (agency → auto) before any warden row; 34 persona before 36/37 rows that read
it. 35's measurements already ran in B1; C5 re-runs them on the candidate as acceptance.

### Stage B branches (finding 1)

| B2 verdict | 35 | 36 | 37 | 39 rows |
|---|---|---|---|---|
| SP6 PASS, M2 PASS | Phase 3 + Phase 4 + encounter pool built | `clock` widget reads the release model | an agenda may surface pressure only through an authored pool line (35's enum) | Phase 3 K2 ×2; Phase 4 M2 with pressure; K3/K4 over pressure releases; encounter generation golden + contract-drop |
| SP6 PASS, M2 FAIL | Phase 3 (escalate) built; Phase 4 and encounters not built (`quiet`/`offer` refused) | `clock` ships (escalate releases only) | as above | Phase 3 rows; M2 recorded failed (open stretches already ship as experimental), so the verdict is PARTIAL unless B2 records the user pulling open stretches from the release |
| SP6 FAIL or INCOMPLETE ×2 | the drop path (35 Phase 1: Phase 3/4 not built, spike module, flag and seam removed, `DROPPED_SPIKES` + planted-import control, validator refuses `pressure`/`trigger`; pools inert, guide marks them unsupported); open stretches ship with pull only if M2 passed, else as the row above | `clock` not shipped: removed from the authored kinds; the validator refuses a `clock` widget with a consequence line; quest deadlines read no release model | no pressure link; agendas unchanged | drop-path guard rows (validator refusal, planted-import control, guide drift); no complication rows |

Phase 5 (N3/N5) is deferred to v2.8 13 in every branch (finding 14; `00-overview.md` §Deferred to v2.8).

### Payload contracts (finding 11)

- **Preservation baseline:** goldens from a pinned predecessor commit, taken before 32's first model-input change
  and named in the manifest (`--label base`). The candidate never serves as its own baseline. C0 ↔ C3 checks
  repeatability only.
- **Off-path requests:** suggestions (`suggestions` pass), shared read / scene / epistemic passes, warden (with the
  attention question) and curator. Each is captured at its request seam (the prompt handed to the Connection
  Manager / judge client) with mocked answers, tier D. The dry-run tool sees only the main generation.

| Contract | Off: byte-identical to base | On: asserted present | Negative control (must fail) |
|---|---|---|---|
| role line (34) | no `player` profile → no role block | role block in the resting prompt and each drafted member's request | delete the block |
| open-stretch pull (35) | no `stretch` | no objective line; no pull before `pull_after`; pull line after it | inject the objective line |
| check outcomes (36 Q3) | no checks | one outcome steering line per attempted check, no roll numbers | drop the outcome line |
| agency notes (33 W2) | agency family `review` | the note at `continuityNote` on the next loud request | strip the note |
| quest scope (36 Q1) | no quests → read prompt byte-identical | scope keys per quest status, cap respected | add an out-of-status key |
| relationship scope (37 L1) | no relationships | axes of present members only, `REL_AXES_PER_READ` respected | add an absent member's axis |
| privacy, every capture above | — | — | a synthetic held secret planted in a private source appears in no shared/off-path request and in no other member's request |

### Rows added by the 2026-10-07 review

| Row | Finding | Setup | Assertion | Tier |
|---|---|---|---|---|
| S-15 mixed-origin rollback | 15 | quest reward, agenda step, complication (if B2 built it) and stagecraft writes interleaved on the same WI target; swipe, edit, delete, reopen, cancellation, failed save, external edit | one chronological undo, newest write first, across all selected origins; origins survive compaction and hydrate; `externally-changed` recorded, never clobbered; host state = replay (rule 12) | D (fake-host jest + no-model scenario) |
| S-16 quest lifecycle | 16 | ignored offer; offer → active; completion gate toggling; done and failed in one boundary; changed reward; story update after a reward | the lifecycle v2.7 36 defines (acceptance transition, terminal persistence, precedence, update reconciliation), handed to 36's builder; 0 host mismatches | D |
| S-17 combined scope budget | 17 | 7-member cast, ≥ 3 active quests, relationships and card pulls in the same reads | 36's M1 token/latency floors and 37's M2 ceiling hold together; overflow priority as B2 decides; fairness: no active quest left out of scope for more than 3 consecutive reads; caps passing separately is not enough | CL |
| S-19 OOC and story clock | 19 | group rounds, Continue, swipe, a marked OOC message, reopen | an OOC message counts no player turn, yields no extraction delta, ticks no agenda (35, 33, 37 rules); `story_day`/`time_of_day` move only by 37's producer; Continue/swipe/reopen ≡ continuous run | D + RP |
| S-19-OOC read and turn rule (built on `v2.7-ooc`, not run) | 19 | a group chat at an open stretch with `player_turns_in_checkpoint` declared; one in-character line, then each of `((…))`, `OOC: …`, `(OOC) …` answered by a group round, a Continue, a swipe, a delete of the OOC line, reopen; a control line "I say (quietly) …"; one cadence read whose window holds only OOC lines | the OOC lines stay in the request ST sends; no read window carries them (audit `outOfCharacter` lists their ids, journal "N out-of-character lines not read"); a read over only OOC lines makes no model call and stores nothing; `player_turns_in_checkpoint`, the refusal streak and a generated beat's "awaits the player" ignore them, the control line counts; the warden sends no `player_message` for a reply to an OOC line; Continue/swipe/delete/reopen ≡ continuous run; a chat without OOC lines sends byte-identical read prompts (jest: `extraction/outOfCharacter.test.ts`, `runtime/stretchTurns.test.ts`, `engine/ooc.test.ts`); main entry 1,174,036 B (+1,193 B over 1,172,843 B) | D + RP |
| S-19-OOC-b warden note and story panel log (owner decisions 2026-10-07, `v2.7-owner-decisions`, not run) | 19 | S-19-OOC's chat with the continuity warden on in `review` and a story with a `log` widget (or the Journal's Log); a reply the warden flags, then each of `((…))`, `OOC: …`, `(OOC) …` answered by a reply, then accept the note; control: an in-character line in the same place | the pending note stays pending through the OOC lines and the next loud generation carries it once; after the control line it lapses (`rejected`, `lapsed`); the story panel's log lists the in-character actions only, never an OOC line (jest: `stagecraftCoordinator.test.ts` "an out-of-character player line is no new turn", `gameProjection.test.ts`) | D + RP |
| 33 W1 V7-live | 14 | a real `onEnter` NPC post and its `/cut` after an edited reply | ends like a replay of the edited chat, gate kept and gate broken | D (scripted) + CL |
| 37 M3 | 18 | 7-member act pilot (37 §Measurement) | 37's M3 floor | RP + CL |

### Rows refined by v2.7 33 W1 step 0 (2026-10-07, `v2.7-33-v0`; V3 not run)

The owner runs no reply post-processor; the reference one is `SO-V3 typographic quotes`
(`test/fixtures/postprocessor/`, driven by `scripts/debug/so-postprocessor.mts`). Trace and defects: v2.7 33 §Gate record
"W1 step 0 (V0)".

| Row | Setup | Assertion | Tier |
|---|---|---|---|
| 33 W1 V0 traced | jest `src/runtime/spikes/editReread.review.test.ts` "V0: the traced post-processor orders" (event-order replay over the real manager) plus the trace table it cites | the Regex placement and an in-round rewrite reach no cycle; a late post-render burst holds the reply until the last text is read and ends like a replay; the v2.6 "no audit" control reproduces (audit erased, "eventless change") | D |
| 33 W1 V3 post-processor | `node scripts/debug/so-scenario.mts run test/scenarios/v27-33-v3-postprocessor.json --sandbox` on a model lane; `requires` pins "Group: Arin, DM Narrator" by name; the fixture switches `spikes.editReread` on and restores it | regex leg: no straight-quoted span in any reply and no edit seen; post-render single, double and late: the rewrite lands after the commit, and the next request carries only the next checkpoint's marker and the settled text, with no hold timeout | CL + RP |

### Rows owed by v2.7 37 (built 2026-10-07 on `v2.7-37-character-life`, none run)

Each is a manifest row, run ×2 with the rule 11 reset. The numbers marked *placeholder* are built into the code and
are decided here, never claimed green before then.

| Row | Setup | Assertion | Tier |
|---|---|---|---|
| 37-D1 character life, no model | `test/scenarios/v27-37-character-life.json` (+ `.story.json`), `requires {lane: "no-model", group: "Group: Arin, DM Narrator", members, judge: "off"}`; `so-scenario.mts run <file> --sandbox --group "Group: Arin, DM Narrator"` | an agenda step lands after two `/cp set` boundaries; an OOC line (`((…))`) neither moves it nor counts; a night schedule puts Arin away; Arin's drafted block carries her own feeling and step, the narrator's does not; player mode shows none of it; `assert-player-clean` with the drawer open | D (no-model) |
| 37-D2 schedule drop live | same lane; `time_of_day` night with the party at the market, then a scripted player line addressed to Arin | the talk decision never names Arin while she is away; `disabled_members` of the toy group unchanged (run header diff) | D (no-model, director mocked) |
| 37-Q1 unread relationship reads as `start` (owner decision 2026-10-07) | a copy of the 37-D1 story with `start: 2` on Arin's `trust` toward the player and a transition gated `rel_arin_player_trust >= 2`; control copy with `start: 1` | the `start: 2` copy leaves its first checkpoint on the first boundary with no read (`so-state current` shows the value at version 0), the control waits for a read; a swipe back past the first read shows `start` again; reopen ≡ continuous run; no code write reaches the key (jest: `engine/life/life.test.ts` "an unread relationship reads as its start") | D (no-model) |
| 37-Q2 `per_chapter` without chapters refused (owner decision 2026-10-07) | import a copy of the 37-D1 story whose agenda paces `per_chapter`, with and without `chapters` | without chapters the import is refused at `roster.0.agenda.0.pace` with the plain message (use `per_n_boundaries` with `every`, or add chapters) and the Studio shows `agenda-pace-no-chapters` consequence first; with chapters it loads (jest: `validate/life.test.ts`, `studio/diagnostics.test.ts`) | D (no-model) |
| 37-Q3 addressed away member (owner decision 2026-10-07) | 37-D2's night at the market; player lines "Arin, are you there?", an alias only Arin carries, an OOC line after the address, then "I look around the market."; controls: the party at the docks, and an alias two members share | the request ST sends after an address carries one `story_orchestrator_away_notice` line at depth 0 naming Arin as not here (resting prompt, not a private block) and the reply does not speak as Arin; after the unaddressed line, the docks control and the shared alias the block is absent and the payload is byte-identical to a chat without schedules (payload golden diff); quiet/impersonate requests never carry it (jest: `runtime/awayNotice.test.ts`) | D (no-model, director mocked) + RP |
| 37-D3 agenda effect + swipe | a copy of the story whose second step carries a `world_info` enable on a test book, a scripted `npc_replies` reply on the first | the entry is on after the landing boundary and off again after a swipe/delete of the reply that landed it; the NPC reply posts once and a swipe rewinds its marker (S-15 host half) | D (no-model) |
| 37-M1 relationship read accuracy | 37 §M1: ~20 labelled lab windows, arms (a) value hidden, (b) value shown, (c) typed judge | direction accuracy ≥ 0.80, stuck rate ≤ 0.10, 0 step-clamp violations, (a) within 5 points of (b); decides the default read path (judge first only if (c) passes) | CL (B1) |
| 37-M2 cost | N relationship axes ∈ {2, 4, 8, 16} per read | the 37 §Floors ceiling (≤ 350 tokens/drafted member p95, ≤ 600 max; extraction prompt ≤ +12 %, p50 latency ≤ +15 %); sets `REL_AXES_PER_READ` (*placeholder 8*) | CL (B1) |
| 37-S17 combined scope budget | S-17 with relationships registered (`relationship` scope source) | as S-17; the cross-source overflow priority (gate keys, active quests, the drafted member's axes, others' axes, card pulls) and fairness are decided in B2 and built in B3: today each source is capped alone, the drafted member's axes and mood come first inside the relationship source, and there is no rotation | CL (B1) |
| 37-L3 meanwhile proposals | `test/fixtures/meanwhile-proposals.cases.json` (20 cases, floors frozen), offline replay through `globalThis.storyOrchestratorAgendaProposals.propose()` on the CL route, labels by a second model | in-goal ≥ 0.85, 0 narrated player actions, 0 unreached references in the spoiler subset, ×2; below the floor the coordinator stays a harness, never wired into play | CL (B1/C5) |
| 37-L6-C voice warden | `test/fixtures/judge/spike-voice.json` (floors frozen, **rows not collected**: 20 lab-copy replies owed by v2.7 38) | OOC recall ≥ 0.80, false-note rate ≤ 0.10, 0 rewrite or player-narration notes, fallback ≤ 1 of 20, ×2; below the floor `wardenVoice` stays off by default | CL (B1) |
| 37-S19 story clock | S-19 with `clock` declared | `time_of_day` moves one step per boundary (code clamp), `story_day` only on a wrap; Continue/swipe/reopen ≡ continuous run; an OOC line ticks no agenda. Not built: an authored checkpoint `set` effect for the clock (no such effect exists) | D + RP |
| 37-M3 player value | as row 37 M3 above | required exercise per run: ≥ 1 axis moved by a read, ≥ 1 agenda step, ≥ 1 schedule drop, ≥ 1 mood re-read | RP + CL (C5) |
| 37-B3 bundle | `npm run build` | main entry 1,171,979 B at the 37 commit (+8,479 B over `fd6529b1`'s 1,163,500 B): validator hook, scope source, private-block lines, talk filter, rating-guard step rule, check and feature copy, warden voice family; the validator, derive, presence and line logic ride the lazy game-layer chunk; the proposal coordinator and its prompt ride a lazy harness chunk | D |

Floors tightened before any run (finding 18): 32 W1 route A minimum render count; 35 M2 window and denominator; 36 Q3
positive narration assertion; 37 M3 behavioural threshold; 38 C7 character-life exercise. The numbers live in those
plans.

### B1 rows from v2.8 01 (split, owner 2026-10-07)

Measurement only, no code. Each is a manifest row (rule 10), ×2 with the rule 11 reset, on the B1 build, same pod as
B1. A result below a floor is recorded as a failed row (finding id, owner v2.8 01, the user's decision; rule 8), never
re-run until green; the fix is built in v2.8 01. Evidence: public summary at `test/phase-c/records/<id>/run-{1,2}.json`,
raw requests and replies in private `so-sessions` (rule 6). Campaign rows report counts only (rule 7).

| Id | Source | Prerequisites | Floor / what is recorded | Tier |
|---|---|---|---|---|
| B1-C3 warden + lore-check timeout causes | v2.8 01 §B C3 | TypeSafe key; `wardenEnabled` + `judge.uses.wardenLore` on; adolion-fresh lane playing a lore story with real replies; ≥ 100 warden and ≥ 100 lore-check calls per run; plugin `/status` (`adaptive`, lanes) sampled per call | formal `so-judge timeouts` per run; floor 1 timeout in 50 per use, never retuned (v2.8 01 C3; J2 bar). Recorded per timed-out call: client wait vs the 4000 ms budget, plugin queue wait (lane / account hold, `Retry-After`), provider latency; each timeout attributed to one cause, else counted `unattributed`. Also records R4 latency with `wardenLore` on (v2.6 04 §L7) | CL (judge) + RP (replies) |
| B1-C12 lore-select requests per turn | v2.8 01 §B C12 | same runs as B1-C3 (`lore_select` stories, `judge.uses.loreSelect` on) | count only, no floor: lore-select judge requests per loud turn (p50, p95, max) from `extras.judge.calls`; the "before" number for v2.8 01's batching | CL |
| B1-C13b SP8 digest arm | v2.8 01 §B C13-b | the SP8 digest arm as measured in v2.6 03 (lab path, no product prompt change; the shipped curator prompt stays byte-identical per v2.7 02 C13); curator profile; the lane's campaign world book as padding. Enters the manifest only if the arm runs on the B0 build without code; otherwise B0 records its absence and the row stays in v2.8 01 | `v2.6/03-sp8-restated.md` W4 (b), verbatim: "every role-calibration floor met (validity ≥ 0.9, opShape ≥ 0.85, decision ≥ 0.7) in **both** runs"; ratio ≤ 0.40 (W4 (a)) recorded beside. A PASS lets v2.8 01 build the digest; 2.7 ships none | CL (curator) |
| B1-R4 checkpoint thinking level pairs | v2.8 01 §E (data only) | llama.cpp thinking setup on the pod; `spikes.reasoningEffect` on; 20 climax turns across 2 stories (4 pairs exist, `test/sessions/rating-pack/R4/`) | 16 more blind pairs, arm checkpoint `high` vs control install `medium`; rated blind by Astra (delegated; v2.7 08 decision 6, never the user); recorded: preference share (floor ≥ 60 %) and p95 latency vs control (floor ≤ 2×), `v2.8/01` §E R4 unchanged. The gate lift and Studio control stay in v2.8 01 | RP |
| B1-PAR LLM_PARALLEL sizing on the B1 pod | v2.7 39a §Hardware (owner decision 2026-10-07) | one RunPod RTX PRO 6000 Blackwell (96 GB, Secure, ~$2.09/h; stock in EU-CZ-1 / EUR-IS-2 / US, not EU-RO-1 where the network volume is, so the 19 GB Artemis GGUF downloads fresh); llama-server restarted per arm with `LLM_PARALLEL` 2, 4, 6; that many adolion-fresh model lanes each playing its first B1 row | runs first, the first ~15 min of B1: per arm, per-stream tok/s, prompt tokens per request (`tokens_evaluated`), turns/hour; picked: the most turns/hour with per-stream ≥ 25 tok/s; lanes = that count. No arm qualifies → fallback 2–3 × RTX PRO 4500 (existing tooling) | RP |
| B1-EMPTY empty visible replies, before and after the recovery | 2026-10-08 B1 run finding (Artemis thinking, reply effort medium: a closed 200–390-token thought and no visible text, 1 in ~60 group turns, 4 in ~25 at prompts ≥ 25K tokens); `runtime/emptyReply.ts` | the B1 pod; adolion-fresh lanes with thinking on and reply effort medium; the harness run with `SO_SWIPE_EMPTY_REPLY` unset so only the product recovers; arm A = the build before `v2.7-empty-reply` (or the recovery seam unwired), arm B = this build; ≥ 200 group turns per arm at prompts ≥ 25K tokens (`tokens_evaluated`), counted from the chat files (a non-user row whose visible text is empty and whose `extra.reasoning` is not) plus `storyOrchestratorSpikes.emptyReply.records()` | floor, predeclared: arm B empty-visible rows left after recovery ≤ 1 per 200 turns at prompts ≥ 25K; every asked-again recovery whose reply was the last message ends with visible text (recovery success 100%); 0 boundaries committed on an empty reply; arm A rate recorded as the baseline. Prevention (a post-thought cue in the prompt) is not built: any arm that changes the prompt needs a declared payload-golden diff and its own row | RP |

C4's live checks (v2.8 01 §B C4: the separate warden-lore arm, built in v2.6, no code owed) run in C5 as acceptance:
**C4-R6** over-steer after a lore note (v2.5 08 R6 rubric) and **C4-J8** G-L7 J8 on/off, ×2 each, CL + RP.
**R4-live** (from v2.8 01 §E "Also owed"): the shipped install-wide reply thinking budget, off/low/medium/high × n ≥ 3
group turns, memory requests carry no budget key, one Chat Completion arm (`v2.6/05-reasoning-control.md` §Live), ×2, RP,
≈0.5 lane-hour. C4's R4 latency leg is recorded in B1-C3. 39 C5 already names C14-b (an acceptance row, not a measurement), so it is
not repeated here. v2.8 01 §A (O-rows) is C5; v2.8 01 §C (option A) is v2.7 33 W1.

### Rows from v2.7 41 (prompt size and cache, 2026-10-08)

B1-PFX and B1-HIST are measurement only, no code (v2.7 41 §5 P1/P2); B1-NARR measures the P3 change (v2.7 41 §7). Each is a manifest row (rule 10), ×2 with the rule 11 reset, on the
B1 pod with one model lane and nothing else on it. A result below a floor is recorded as a failed row (rule 8); the
owner decides the change. Campaign rows report counts only (rule 7).

| Id | Source | Prerequisites | Floor / what is recorded | Tier |
|---|---|---|---|---|
| B1-PFX prefix reuse on the pod | v2.7 41 §5 P2, §6 | llama-server per arm: the B1 args (control) vs `--swa-full`, `LLM_CTX` 98304 total, `LLM_PARALLEL` 2; one lane replaying the 247-message SP6 saga chat with scripted same-speaker and cross-member `/trigger` pairs, 40 per arm; `so-pod` request timings | the `--swa-full` arm reuses ≥ 50 % of prompt tokens on same-speaker pairs (p50 of 1 − tokens_evaluated / prompt tokens), keeps per-stream decode ≥ 25 tok/s p50 and logs 0 OOM, context-full or truncation events; control, cross-member reuse, prefill ms and VRAM peak recorded beside | RP |
| B1-HIST bounded history on the saga | v2.7 41 §5 P1, §6 | the same chat continued 30 real turns per arm: `max_context` 98304 (control) vs 24576; 10 recall probes about events older than the window, written before the run, kept private, rated blind by Astra (delegated) | the 24576 arm keeps every loud request ≤ 24576 prompt tokens, prompt ms p50 ≤ 0.6 × control, ≥ 8 of 10 probes answered consistently with the transcript, and no more established-fact contradictions than control | RP |
| B1-NARR the Narrator's scoped cast holdings on the saga | v2.7 41 §5 P3, §7 | the same chat continued 20 real Narrator turns per arm: the bundle before P3 (control, every cast member's aims) vs the P3 bundle (enabled members never dropped; motive holders, talk speakers and members named in the last 20 messages within about 1,000 tokens); each Narrator reply rated blind by Astra (delegated) | the P3 arm keeps the holdings ≤ the enabled members' own holdings + 1,100 tokens on every Narrator request and its Narrator prompt p50 ≥ 2,500 tokens below control (measured −3,056 on the 256-message capture); preferred or tied on ≥ 50 % of the 20 pairs; invented strangers where a named cast member fits not above control. B1-PFX and B1-HIST run on a bundle that carries P3, so their Narrator requests are about 3.1K–3.7K tokens smaller than the plan 41 §2 numbers | RP |

### Rows added by the sprites review (2026-10-07)

Plugin-side fixes for the talking-sprites review on `v2.7-sprites-fixes` (jest: `sprites/stage.test.ts`, `sprites/faceFrames.test.ts`,
`sprites/sprites.test.ts`, `studio/stageDiagnostics.test.ts`, `runtime/checksRegistry.test.ts`; Storybook `Sprites/VnStage` `PhoneUsesTheStrip`).

| Row | Setup | Assertion | Tier |
|---|---|---|---|
| C6-stage stage correctness (sprites fixes 2026-10-07, `v2.7-sprites-fixes`, not run) | a group story that directs a stage with ≥ 3 members: one pack with anim frames, one pack missing a label a beat asks for, one member with no pack; SillyTavern's Character Expressions on, then off; a 390×844 viewport | the stage matches a replay of the chat after a reply, a swipe, an edit, a delete, a reopen and a chat switch (no expression from another swipe or another text); with Character Expressions on the stage still shows and ST's expression picture is hidden only while it shows; at 390×844 the stage shows as the strip with no /vn hint; a missing frame, label or set leaves the static or fallback sprite and is named by `stage-pack-missing` or the Studio's `stage-sprite-unknown`; the seam/pop floor owed from plan 32 decision 2: seam or pop visible in ≤5% of rated clips | LI + CL |

### Rows for Sol findings 4–10 (code fixes on `v2.7-fix-sol-review`)

The live and real-model counterparts of the deterministic pins that branch added (jest names cited). Each is a
manifest row (rule 10), run ×2 with the rule 11 reset; the persona rows also restore the persona lock and the default
persona between runs.

| Row | Finding | Setup | Assertion | Tier |
|---|---|---|---|---|
| S-04 refused lock + reload | 4 | a `player` story bound to a fresh group chat with a scripted `new_chat_only` opener; ST's chat lock made to refuse once (in-page wrapper on `setPersonaLockState` that leaves `chat_metadata.persona` unset); pick a persona; reload the page (`st-session.mts reload`); then "Try again"; second pass: refuse again, then "Start without keeping it" | before success or the explicit continue: no opener, `[data-so="player-setup-lock-failed"]` shown, `persona-lock` (blocks) in `#so-setup` and the HUD count, the blob holds `playerSetup {pending: true, lockFailed}` and still does after the reload; Try again: `chat_metadata.persona` is the picked avatar and the opener posts exactly once; continue: opener once, record `locked: false`, journal line "continued without the chat lock" (jest: `playerSetupActivation.test.ts` "Sol finding 4") | D (no-model) |
| S-05 chat switch during a persona write | 5 | two bound group chats A and B; on A, delay `loadPersonasModule` and the persona switch in-page, and open B (`st-navigation.mts open-group`) inside the delay | B's `chat_metadata.persona` (read back from the server's chat file) unchanged; no opener in A or B; A's record still pending; `setPersonaLockState` never called while B is open (jest: `personaWrites.test.ts`, `personaHostLive.test.ts`, `playerSetupActivation.test.ts` "Sol finding 5") | D (no-model; needs the in-page delay) |
| S-06 persona placement None | 6 | a persona whose description carries the story's canonical role line; Persona Management placement set to None, then In prompt, then the line deleted from the description | `st-payload.mts` capture of the loud request: placement None → the `playerRole` block present exactly once; In prompt with the line → absent and the description carries it; line deleted → the block back on the next request; one real request at each step agrees with the dry run (jest: `playerRoleHost.test.ts` "placement None", `personas.test.ts`) | D (dry run) + RP (one request per step) |
| S-07 suggestions with unnamed checkpoints | 7 | a story whose authored start and a generated beat (expansion on) have no `player_name`; play into the generated beat; ask for suggestions from the presence UI | the captured `pass: "suggestions"` request and the shown suggestions hold no checkpoint `name` or id; the request's scene list skips unnamed scenes and the current scene reads "Current scene", same as the drawer (jest: `playerProjection.test.ts` "a checkpoint without player_name") | CL |
| S-08 held-secret suggestions | 8 | a group with knowledge tracking on; a member's `[hiding]` row (synthetic, planted through the transcript); canon regenerated so the story-so-far prose restates it in other words; ask for suggestions | the suggestion request restates no held secret (the `heldSecrets` word rule over the request text), the rest of the prose is present; negative control: the same chat with the `[hiding]` row retired carries the paraphrase; member requests unchanged (jest: `suggestionsHost.test.ts` "Sol finding 8", `secretMirrorRecall.review.test.ts`) | CL |
| S-09 open-stretch side exit refused | 9 | import a story whose open stretch has a second exit gated on `player_turns_in_checkpoint`, and one on an always-true gate; then import every shipped story with a stretch | both side-exit stories are refused at import, naming the transition ("ends only through arrive_when"), and the Studio diagnostics name it on edit; every shipped stretch story imports clean (counts only for Adolion, rule 7) (jest: `openStretch.review.test.ts` "refuses every exit but arrive_when") | D (no-model) |
| S-10 swipe window | 10 | a `lore_select` story with the judge on; a reply whose text names a lore entry the chat has not otherwise mentioned; swipe it | the lore-select request and any scene read taken during the swipe equal those captured for the same chat with that reply deleted (rule 12 compare); the discarded reply's text appears in no judge or memory-model request of the swipe; the new swipe, once landed, is in the next read (jest: `settledWindow.test.ts`, `loreSelect.test.ts` "Sol finding 10") | CL + RP |
| S-11 held-secret canon | 8 (follow-up, `v2.7-fix-canon-secrets`) | a group with knowledge tracking on; a member's `[hiding]` row plus a second member's `[knows]` echo (synthetic, planted through the transcript); a fact row and a resolved arc summary that restate it in other words; regenerate the canon (`storyOrchestratorRuntime.regenerateCanon(true)`); put `{{story_canon}}` in the narrator's card; turn chapters' `storySoFar` on; draft the kept-out member and the narrator | the captured `pass: "canon"` request restates no held secret (the `heldSecrets` word rule) and keeps the plain facts; the stored canon, the drawer Overview "The story so far", `/story recap` and the away recap restate none; the kept-out member's request and the resting (`/impersonate`) request carry neither the secret in `{{story_canon}}` nor in the story-so-far block; then retire the `[hiding]` row: the next canon request carries the paraphrase again (negative control), and a chat with no held secret sends a canon request byte-identical to the pre-fix build (jest: `secretCanon.review.test.ts`) | CL |
| S-12 held-secret chapters, threads and other shared text | 8 (follow-up, `v2.7-fix-shared-secrets`) | S-11's setup, plus a fact, a scene summary, an open arc and a ledger row that restate the secret; chapters on (`seal`, `storySoFar`, `recap`, small `chronicleTokens` so eras merge); put `{{story_so_far}}` and `{{story_previously}}` in the narrator's card; seal a chapter (`/cp seal`), then the final one; play past the seal so the bridge note rides one generation; open the inline timeline at level 1–2; let a pre-generation and a curator pass run | the captured `pass: "chapterSeal"` record, era-merge and saga requests restate no held secret and keep the plain facts; the stored record, era and saga restate none on read either: the story-so-far block (chronicle, `[Open threads]`), `{{story_previously}}`, the "Previously…" popup, the bridge note, `/story chapter`, `/story chapters`, `/story chronicle`, the drawer Overview (Recently, Open threads, Your story, The End) and the threads widget lanes; a returning dossier keeps the secret only for a member who holds it; inline L1/L2 fact and thread chips restate none; the expansion request's facts, the curator's open threads and the warden's facts restate none; retire the `[hiding]` row: the next seal request carries the paraphrase again (negative control); a chat with no held secret sends seal/era/saga/expansion/curator requests byte-identical to the pre-fix build (jest: `secretShared.review.test.ts`, `inlineTimeline.test.ts` "held secrets") | CL |
| S-13 held-secret Memory tab (owner decision 2026-10-07, `v2.7-owner-decisions`, not run) | S-11's setup with fact rows that state the secret, paraphrase it, and mix it with a plain sentence, plus a plain row; open the drawer Memory tab in player mode, then Author view; pin, edit and exclude the trimmed row; retire the `[hiding]` row | player mode shows neither the secret nor its paraphrase, the mixed row trimmed to its plain sentence under its own id, and no count, gap or marker (the tab reads as a chat that never held the secret, `assert-player-clean`); pin/exclude act on the stored row and an edit keeps the withheld sentence in the store; Author view lists every row whole; after retiring the secret the rows show again (negative control) (jest: `secretMemoryTab.review.test.ts`, Storybook `PlayerMemoryHidesAHeldSecret`) | D + CL |

## C2 rows: tier-D scenarios for plans 01–10 (2026-10-07)

Written for C2 (`16-test-plan.md` §Per plan live (D) column), **written, not run** (no ST lane in the writing
session). Each declares `requires {lane: "no-model", group: "Group: Arin, DM Narrator" (the sun-ruins toy group, by
name), members, judge: "off"}` and mocks every model call; run each `node scripts/debug/so-scenario.mts run <file>
--sandbox --group "Group: Arin, DM Narrator"` ×2 on a no-model lane. Validated: `validateFixture` + eval compile +
`globalsReadButNeverWritten` (no vocabulary added).

| Row | File (`test/scenarios/`) | State | Not expressed (owner) |
|---|---|---|---|
| 01 in-app walk | `v27-d-01-in-app-walk.json` | written, not run | only the memory model is cleared, not every setting (journey `clearGlobalConfig`); the clean-settings walk is C8b |
| 02 C2-K1 | `v27-d-02-c2-k1.json` | written, not run | Help panel text not compared; both copiers on together, not one at a time (jest `secretLeak.test.ts`) |
| 02 C11-F1a | `v27-d-02-c11-f1a.json` | written, not run | the typed reading is seeded in `typedRead.ts`'s shape (no judge on a no-model lane) |
| 02 C13 | `v27-d-02-c13-curator-tiers.json` | written, not run | payload invariance of the curator prompt (jest pin `curatorTiers.review.test.ts`) |
| 02 C14 + 14 | `v27-d-02-c14-role-picker.json` | written, not run | harness group only recorded, not required; run-header `profiles` diff is the batch's |
| 04 health center | `v27-d-04-health-center.json` | written, not run | one-click fixes (they would edit the shared toy group; castRepair jest, `v27-03-no-group-solo-blob.json`); no `info` check fires on a no-model lane, so "info off the HUD count" is checked only as count = blocks/degrades rows |
| 05 briefing | `v27-d-05-briefing.json` | written, not run | Before you start in the modal, opener payload capture (`briefingActivation.test.ts`) |
| 06 presence | `v27-d-06-presence.json` | written, not run | paging a 10-per-page list, library delete keeps a pinned row (F14 jest), payload invariance on/off |
| 08 thinking | `v27-d-08-thinking-warning.json` | written, not run | — |
| 09 commitment | `v27-d-09-commit-hold.json` | written, not run | — |
| 10 catch-up | `v27-d-10-edit-catch-up.json` | written, not run | holds the read lane with a scheduler job through the manager's private `scheduler` field (no hold hook exists) |

## RunPod budget (estimate, to be approved)

| Block | Lane-hours (est.) |
|---|---|
| B1 measurements (35 Phase 1 + M2 ≈ 7–9; 36 M1/M2, 37 M1/M2 and S-17 are CL: DeepSeek reads on cloud lanes, no pod, reconciled with the manifest 2026-10-07, 39a owner note) | ~7–9 |
| B1 rows from v2.8 01 (B1-C3 + B1-C12 shared play ≈ 2, B1-R4 16 pairs ≈ 2; B1-C13b is CL) | ~4 |
| C4 journeys ×2 | ~6 |
| C5 rows (35 Phase 1 3–5 + M2 ≈4, 32 S32-1 ≈2 + W6 ≈0.5, 33 incl. over-steer ≈4, 34, 36/37 floors, 37 M3, S-19, 02/08–10 O-rows; C4-R6 + C4-J8 ≈ 1.5) | ~20.5–22.5 |
| C7 Adolion ×2 | ~6 |
| C8 smoke, C8b stranger install | 0 (DeepSeek) |
| **Total** | **~43.5–47.5 lane-hours ≈ 23–26 pod-hours** (two lanes share one pod; RTX PRO 4500 ≈ $0.72/h → ≈ $16.5–19; was ~45.5–49.5 ≈ 24–27 while 36 M1/M2 were charged to the pod; at most the approved ≈ 27 pod-hours / ≈ $20 with a 150% stop; was ~40–44 ≈ 21–24 before the v2.8 01 split added ≈ 5.5 lane-hours) |

Pod rules: `v2.6 gotchas` (direct SSH tunnel, `MAX_UPTIME_HOURS`, restart renews the window, record ports); stop the
pod at every pause; `test/sessions/BUDGET.md` updated per block.

## Close-out checklist

- [ ] B0–B3 done before C0: version 2.7.0, manifest written, B2 decision record appended, its branch built.
- [ ] Every manifest row has two evidence records, or is listed as missing (verdict INCOMPLETE, rule 8).
- [ ] Verdict stated as ACCEPTED, PARTIAL or INCOMPLETE (rule 8). Each failed row has a finding id, owner and user
      decision; a recorded player-facing failure is never ACCEPTED.
- [ ] Every v2.7 plan's gate record cites its Phase C rows.
- [ ] Release attestation (`docs/release/2.7.0/attestation.json`) cites archived records only. `npm run test:release`
      ran AFTER it was written and verified candidate commit, build and served hashes; drift fails the check.
- [ ] Overview Status table final; v2.8 overview and `v2.8/01` rewritten for what remains (incl. §Deferred to v2.8).

## Decisions for the user

1. RunPod budget ≈ 27 pod-hours (≈ $20). **Recommended: approve, with a stop at 150%.**
2. C9 user sessions: before or after the freeze? **Recommended: after C8, on the frozen candidate.**

## Links

`16-test-plan.md`, `00-overview.md`, `v2.8/01-v27-carry-over.md`, `v2.8/24-test-plan.md`, `.claude/rules/debug-scripts.md`.

## Decided (user, 2026-10-07)

"Go with the recommendations": every decision in §Decisions above takes its **Recommended** answer. RunPod budget **approved** (about 27 pod-hours, stop at 150%).

## Prerequisites before the freeze (test review 2026-10-07, `40-test-case-review.md`)

The payload-golden tool (C0/C3), `requires` on every scenario (C2), the de-pinned image harness with a ≥ 3-character
test cast (C6), the missing plan 01–10 D scenarios (C2), the guards the review lists (FLUX nodes, `.safetensors`
literals, port/reserve literals, media allowlist, controller status, fail-open without the GPU plugin), and the floors
written in 34, 37 and 38. Built in the 2026-10-07 fix wave; any still missing at freeze is a red C-row, not a skip.

## Review 2026-10-07 (Sol)

Source: `so-lanes/reviews/v27-plans-sol-2026-10-07.report.md` (read-only review at `1910441b`; private lane dir). The
owner approved the recommended changes. Findings 4–10 are code defects fixed by another session (their rows land with
those fixes: §Rows for Sol findings 4–10, S-04..S-10). Finding 22 is void: images run on local ComfyUI by design, and RunPod is only for real-model volume, so
C6 is unchanged.

| Finding | Change | Where |
|---|---|---|
| 1 (blocker) | stage B (measure → decide → implement) before the freeze; SP6/M2 branch table, including complication clocks and dependent features; freeze only once caps, default paths and promotions are final; then the whole inventory ×2 | Rule 2, §Sequence B0–B3, §Stage B branches |
| 2 (blocker) | ACCEPTED / PARTIAL / INCOMPLETE; a player-facing failure blocks ACCEPTED; a missing fixture, unrated evidence or missing prerequisite is never a skip | Rule 8, §Close-out checklist |
| 3 | version 2.7.0 before freeze; attestation required; the release check runs after the attestation is written and verifies commit + served/build hashes; drift fails instead of logging | Rule 2, B0, Z, §Close-out checklist |
| 11 | pinned predecessor baseline; feature off/on contracts; off-path captures; negative controls | C0, C3, §Payload contracts |
| 12 | `prod` vs `dev-diagnostic` rows (superseded 2026-10-07: one build); shipped seal settings | Rule 9 |
| 13 | row manifest (O13b, O15, O16, C14-b included in C5); reset contract; guide-only stranger install | Rules 10–11, C5, C8b |
| 14 | W1 V7-live restored; N6 nudge, J7.2 and N3/N5 consumers + replay tooling deferred to v2.8 13 | §Rows added, §Stage B branches, `00-overview.md` §Deferred to v2.8 |
| 15, 16, 17 | rows S-15, S-16, S-17 | §Rows added |
| 18 | tightened floors listed; replay against captured inputs | §Rows added, Rule 12 |
| 19 | row S-19 (OOC + story clock) | §Rows added |
| 20 | C2 checks rendered targets, including the Studio link with the modal open | C2 |
| 21 | ratchet/budget compare against the fixed predecessor; coordinator 560; main-entry headroom budgeted | C1b |
| 23 | the model-location prerequisite follows v2.7 rule 8 (existing image models stay on `C:`); 38's gate line fixed | v2.7 38 |

## B0 record (2026-10-07, branch `v2.7-39-b0`, deterministic part)

No live run, no lane, no ST, no model. Gates: §B0 gates below.

**Version.** `package.json`, `manifest.json` (ST loader), the `package-lock.json` root and the top CHANGELOG heading
(`## 2.7.0 (candidate, not accepted)`) name `2.7.0`; `versions.test.mjs` (R4) holds the four together. Left alone on
purpose: `docs/release/2.4.0/`, journey and session records, the 2.4.0 test fixtures, and
`UPGRADE_BASELINE = "2.4.0"` in `src/features/registry.ts` (the last released version, which What's new counts from).

**Attestation check** (`scripts/release/acceptanceChecks.mjs`, wired into `attestation.test.mjs`; planted controls in
`acceptanceChecks.test.mjs`):

| Branch | Ordinary `npm run gates` / `test:release` | Acceptance mode (`SO_ACCEPTANCE=1`, or `npm run test:release --acceptance`) |
|---|---|---|
| `docs/release/<version>/attestation.json` missing | attestation checks skip (2.7.0 has none until Z) | **fails** |
| current `dist/index.js` ≠ attested bundle | **fails** (was a log line) | **fails** |
| no `dist/` | build checks skip | **fails** |
| after writing | `candidate.commit` is a full hash; `served.sha256` = attested bundle; `dist/manifest.json` describes `dist/index.js`, bundle = attested, `source.sha256` = attested source; the build commit is the candidate, or descends from it with no change under `src/`, `webpack.config.js`, `postcss.config.js`, `tsconfig.json`, `package.json`, `manifest.json` | same |

Consequence: once Z writes `docs/release/2.7.0/attestation.json`, any later build still at 2.7.0 fails `test:release`
(drift) until the version moves; the next development version bump is the first commit after the release.

**Row manifest** `test/phase-c/manifest.json`: 199 rows, checked by `scripts/release/phaseCManifest.test.mjs` (part of
`npm run test:release`, so of `npm run gates`): every field present, ids unique, stage / tier / build / reset known,
two evidence slots (`null` until a record path lands), floors that can fail (an "or refuse", "or skipped", "≥ 0",
"≤ 100 %", "where possible" floor is refused, finding 18), and parity with this plan both ways: every first cell of a
`Row` / `Id` / `Contract` table here and every O-, S-, S32-, B1-, C4-R6/J8, C14-b and R4-live id mentioned (ranges
expanded) is a manifest row, a row label or a listed absence, and every manifest row is named in §Row manifest index.
Planted controls for each in the same file.

| Stage | Rows | Tiers (rows per tier; a row can carry two) |
|---|---|---|
| B0 | 1 | D 1 |
| B1 | 17 | CL 12, RP 7, D 1 |
| C0 | 2 | D 2 |
| C1 | 3 | D 3 |
| C1b | 2 | D 2 |
| C2 | 53 | D 53 |
| C3 | 10 | D 10 |
| C4 | 16 | D 16, RP 15 |
| C5 | 64 | CL 37, RP 35, D 13, LI 4 |
| C6 | 23 | LI 20, CL 7, RP 3, LT 2 |
| C7 | 4 | RP 3, D 1 |
| C8, C8b | 2 | CL 2 |
| Z | 2 | D 2 |
| **Total** | **199** | D 104, RP 63, CL 58, LI 24, LT 2 |

Conventions. A floor is the plan's text verbatim with a citation; `pass/fail: the assertion holds in both runs` where
the source states a condition and no number; `record only` for counts (B1-C12, 35-M1). A `gap` field marks a row whose
floor is not declared yet: C14-b (owner v2.7 02; no plan states one, so it needs an owner decision, §B1 runners record).
16-19-S28's gap was closed on `v2.7-39-runners`: its floor is now v2.7 24 §Acceptance floors' four S28 rows, verbatim.
A row with a gap cannot be green until it is filled. Rows that only one B2 branch builds carry `branch` (35-K3/K4/K5-C5, 35-P3-K2,
35-P4-*, 35-ENC: SP6 PASS; 35-DROP: SP6 FAIL or INCOMPLETE); B2 deletes the rows of the branches not taken, each with
a record line (rule 10). Rows from 16 §Per plan and plans 29–38 take ids `<plan>-<item>`; their jest-only gates run
inside C1-gates. Every row runs on the one build (rule 9); the manifest carries no `build` field.
Resets (rule 11) are named procedures in the manifest's `resets`: `lane`, `adolion`, `comfy`, `offline`, `local`.

Absent, with the reason in the manifest's `absent`: **B1-C13b** (the SP8 digest arm was removed on 2026-10-01 in
`8017879f` after W4 (b) failed, opShape 0.81 / 0.76 < 0.85; no `--digest-pad`, no `curatorDigest.ts`, no
`spikes.sp8CuratorDigest`, so it cannot run on the B0 build without code and stays in v2.8 01 C13-b) and **S-18**
(finding 18 tightened floors; it has no row of its own). Not manifest rows: C9 (optional by the sequence, and a row
without evidence would make the verdict INCOMPLETE), the 32 W1 cloud source arm (only with the user's approval), 33 W3
N6 nudge and J7.2 and 35 Phase 5 N3/N5 (deferred to v2.8 13), 34 S30-1 (a spike the build already decided).

**Pinned predecessor:** `4238ec2f8967f39074f42a0157ce8297576f615e` ("debug: player-clean sweep covers guide reader
author pages", 2026-10-07). It is the first parent of `8163b0b3` (merge: v2.7 32 images). Plan 32's only branch commit
`fa57a898` carries 32's first model-input change (the director prompt, golden `director-prompt-before-v27-32.json`) and
is not an ancestor of it (merge-base `8a9e06e3`). So it is the latest v2.7 commit before that change. 29–31 are in the
base, and every model-input change from 32 on must be declared in `declared.json`. It is later than the commit before
29 merged (`2a8b0f46`): this section's rule names 32's change as the cut, and an earlier base would charge 29–31's
diffs to C3 too. `package-lock.json` is identical between the two commits, so the main checkout's `node_modules` serves
the predecessor's worktree.

**B0-live (row B0-base, not run):** the predecessor bundle is served, and the candidate's capture tool and payload cases
run against it. The predecessor predates the one-build decision, so it is built with its own `build:dev` and staged with
`--flavor dev`; the candidate is restaged with the one build. Lanes share ST's one extension slot, so no other lane may be serving while the predecessor is staged.

```
git -C C:/dev/story-orchestrator worktree add C:/dev/so-pred-4238ec2f 4238ec2f8967f39074f42a0157ce8297576f615e
New-Item -ItemType Junction -Path C:\dev\so-pred-4238ec2f\node_modules -Target C:\dev\story-orchestrator\node_modules
Copy-Item C:\dev\story-orchestrator\.st-root C:\dev\so-pred-4238ec2f\
cd C:/dev/so-pred-4238ec2f && npm run build:dev && npm run stage -- --flavor dev
cd C:/dev/story-orchestrator
node scripts/debug/st-lanes.mts stop 1; node scripts/debug/st-lanes.mts no-model 1; node scripts/debug/st-lanes.mts start 1
node scripts/debug/st-lanes.mts run 1 -- scripts/debug/st-session.mts reload
node scripts/debug/st-lanes.mts run 1 -- scripts/debug/so-payload-golden.mts capture --label base --out test/measurements/v2.7/payload/base
node scripts/debug/st-lanes.mts run 1 -- scripts/debug/so-payload-golden.mts capture --label base-r2 --out test/measurements/v2.7/payload/base-r2
node scripts/debug/so-payload-golden.mts diff test/measurements/v2.7/payload/base test/measurements/v2.7/payload/base-r2
npm run build && npm run stage
node scripts/debug/st-lanes.mts run 1 -- scripts/debug/st-session.mts reload
git worktree remove C:/dev/so-pred-4238ec2f
```

Check before trusting it: `base/index.json` names a served bundle sha256 equal to
`C:/dev/so-pred-4238ec2f/dist-dev/manifest.json` `bundle.sha256`; the two base captures diff clean with no
declarations; no `capture-failed.json`. Risk: the capture probe is newer than the predecessor's runtime (the tool came
in at `7ddcb292`, after the cut). If a case fails on a missing handle, that is a B0 blocker for 39, never a reason to
move the cut. Record the commit, both hashes and the run headers in `test/measurements/v2.7/payload/base/`.

**Stage B tooling readiness** (checked on disk 2026-10-07; nothing built here). The third column was a B0 blocker list;
the runners it named were built on `v2.7-39-runners` the same day (§B1 runners record), so each cell now says what
resolved it and what is still owed:

| B1 measurement | Exists | Was missing (B0 blocker, owner) → status |
|---|---|---|
| 35 SP6 K2–K5 | scorer `scripts/debug/lib/sp6Score.mts` (+ `so-sp6-score.mts`, `sp6Score.test.mts`, K5 pooling); K2 `test/scenarios/live-v25-09-sp6-k2.json`; campaign `lab/complications/sp6-adolion.journey.json`, `sp6-k4-lines.json`, `sp6-k5-stalled.json`; `scripts/check_lab.py` | — (ready; `check_lab.py` green is its prerequisite) |
| 35 M1 | v2.6 session evidence (private `so-sessions`) | an extraction script for stub lengths and stub refusals (small; v2.7 35) |
| 35 M2 | the curve scenario `v27-35-open-stretch-curve.json` (C2 only, not M2) | the stub lab copy (2–3 stubs made open; v2.7 38 A4); the second-model hook labeller and an M2 scorer (window, denominators; v2.7 35) → **resolved**: `scripts/debug/so-b1-hooks.mts` + `lib/hookScore.mts`; stub lab copy at campaign `lab/stretches/` (v2.7 38) |
| 36 Q1 M1 | `so-live-suite.mts` per-tier scoring | the academy-act lab copy with quest qualities (v2.7 38 A4); an arm runner for 0/5/10/20 extra active qualities (v2.7 36) → **resolved**: `scripts/debug/so-b1-quest-scope.mts m1` + `lib/questScope.mts`; arms at campaign `lab/quests/`. Still owed: the cases state only `{q, v}`, so the facts and rejected tiers the floor names cannot be scored (the runner records INCOMPLETE) |
| 36 Q1 M2 | — | 20 labelled completion cases (v2.7 38 A4 + second-model labels); a recall/false-latch scorer (v2.7 36) → **resolved**: `so-b1-quest-scope.mts m2`; cases at campaign `lab/quests/completion-cases.json` (second-model label check still owed, lab README) |
| 37 M1 | `so-judge calibrate` (arm (c) shape) | ~20 labelled relationship windows (v2.7 38 A4); a three-arm runner and scorer (v2.7 37) → **resolved**: `scripts/debug/so-b1-life-reads.mts m1` + `lib/lifeReads.mts`; windows at campaign `lab/life/` (second-model label check still owed) |
| 37 M2 | — | an axes-per-read cost runner over N ∈ {2, 4, 8, 16} (v2.7 37); the windows above → **resolved**: `so-b1-life-reads.mts m2` |
| S-17 / 37-S17 | — | a combined-scope runner over a 7-member cast with ≥ 3 quests (v2.7 37, after 36 M1 and 37 M2 tooling) → **resolved**: `scripts/debug/so-b1-combined-scope.mts` + `lib/combinedScope.mts` |
| 37 L3 | `test/fixtures/meanwhile-proposals.cases.json`; in-page `storyOrchestratorAgendaProposals.propose()` | a script that replays the 20 cases through the page and scores them (v2.7 37) → **resolved**: `scripts/debug/so-b1-meanwhile.mts` + `lib/meanwhileReplay.mts` (replays propose()'s prompt and parser per case through `storyOrchestratorLiveSuite.runMeanwhileCase`, because propose() reads the open chat) |
| 37 L6-C | `test/fixtures/judge/spike-voice.json` (floors frozen) | its 20 lab-copy rows (v2.7 38); `so-judge calibrate --use wardenVoice` is not in the tool's use list, so the route is unverified (v2.7 37) → **resolved**: `so-judge.mts calibrate --use warden-voice` (alias `wardenVoice`) + `lib/voiceScore.mts`, in-page `storyOrchestratorJudge.calibrateVoice`; rows at campaign `lab/life/voice-rows.json`. The route is built, not live-verified (no model in this session) |
| B1-C3 | `so-judge timeouts --records` (counts and the close); plugin `/status` `adaptive` | per-call cause attribution (client wait vs 4000 ms, plugin queue / lane / account hold, `Retry-After`, provider latency) and per-call `/status` sampling (v2.8 01 C3 measurement, run by 39 B1) → **resolved**: `scripts/debug/so-b1-judge-causes.mts follow` (recorder + `/status` samples) and `score --row B1-C3` + `lib/judgeCauses.mts` |
| B1-C12 | `extras.judge.calls` in the exported state | a per-loud-turn count (p50 / p95 / max) over the ring: trivial wiring, done at B1 → **resolved**: `so-b1-judge-causes.mts score --row B1-C12` |
| B1-C13b | — | absent (above) |
| B1-R4 | `so-session` `rating-pack --arm/--gate`, `so-model-blind.mts`; 4 pairs in private `so-sessions` `rating-pack/R4/` | — (ready; `spikes.reasoningEffect` on) |

**Other B0 blockers.**

| Blocker | Rows | Owner |
|---|---|---|
| C14-b has no predeclared floor: still open. Searched v2.7 02, v2.7 14 and v2.8 01 on `v2.7-39-runners`; none states one (v2.8 01 only moves the row here), so there is no text to quote. **Needs an owner decision** | C14-b | v2.7 02 (owner decision) |
| S28 floors not copied into the manifest → **resolved** on `v2.7-39-runners`: the manifest floor is v2.7 24 §Acceptance floors' four S28 rows, verbatim, cited with v2.7 19 §6 | 16-19-S28 | v2.7 32 |
| ~~33 W1 V0 needs the user's post-processor named~~ resolved 2026-10-07: the user runs none; the reference post-processor stands in (v2.7 33 §Gate record "W1 step 0 (V0)") | 33-W1-V0 | — |
| lab data from v2.7 38 A4 (relationship windows, academy-act quest copy, stub lab copy, spike-voice rows) → present on campaign branch `v2.7-38` (`lab/life`, `lab/quests`, `lab/stretches`); every label there still needs its second-model check (each lab README), and 36-Q1-M1's cases carry no facts / rejected expectations | 35-M2, 36-Q1-M1/M2, 37-M1/M2, S-17, 37-S17, 37-L6-C | v2.7 38 |
| B0-base not run (needs a lane and ST) | B0-base, C3-preservation, PC-* | v2.7 39 B0-live |

Resolved 2026-10-07: the "no prod-build drive path" blocker (every `prod` row in C2–C8b could only be driven through
DOM-level `so-ui` verbs, because the harness refused a prod page) is closed by the one-build decision (00-overview
§Decisions 2026-10-07). There is one build and it ships the handles, so the harness drives every row.

**One-build gates** (2026-10-07, branch `v2.7-one-build`, worktree, so Storybook skipped): `npm run gates --
--no-storybook` all green in 180.4 s (build, typecheck, typecheck:test, test, debug:typecheck, lint, test:release
123 tests / 109 pass / 14 skipped, test:plugin, test:debug, test:replay 32 of 32 killed); main entry 1,191,063 B
(budget 1,250,000 B). No live run. The manifest's `build` field and `builds` list are gone; a row carrying `build` is
refused (planted control in `phaseCManifest.test.mjs`).

**§B0 gates** (worktree, so Storybook is skipped: the runner finds no stories from a `.claude` worktree path, v2.7 16).
`npm run gates -- --no-storybook`: all green in 303.8 s (typecheck, test, typecheck:test, build, build:dev,
debug:typecheck, lint, test:release 129 tests / 115 pass / 14 skipped, test:plugin, test:debug, test:replay 32 of 32
killed); test-storybook:ci SKIPPED (worktree). `SO_ACCEPTANCE=1 node --test scripts/release/attestation.test.mjs`:
1 fail, as designed (no `docs/release/2.7.0/attestation.json` yet).

## B1 runners record (2026-10-07, branch `v2.7-39-runners`, built, not run)

The stage-B1 tooling the B0 record listed as missing. Built against the in-page debug handles (no DOM-only prod path).
No live run, no lane, no ST, no model in this session: every runner is unit-tested (scorer: planted pass and fail data;
runner: a fake page, as `test:debug` does), none has produced a record yet.

| Measured row | Runner (`node scripts/debug/…`) | Scorer (`scripts/debug/lib/…`) |
|---|---|---|
| 35-M2, 35-M2-C5 | `so-b1-hooks.mts label --runs <private runs.json> --labeller <profile> --run <n> [--row 35-M2-C5]` | `hookScore.mts` |
| 36-Q1-M1 | `so-b1-quest-scope.mts m1 --lab <campaign lab/quests> --profile <read profile> --run <n>` | `questScope.mts` |
| 36-Q1-M2 | `so-b1-quest-scope.mts m2 --lab <campaign lab/quests> --profile <read profile> --run <n>` | `questScope.mts` |
| 37-M1, 37-M1-C5 | `so-b1-life-reads.mts m1 --lab <campaign lab/life> --profile <read profile> --run <n> [--row 37-M1-C5]` | `lifeReads.mts` |
| 37-M2 | `so-b1-life-reads.mts m2 --lab <campaign lab/life> --profile <read profile> --run <n>` | `lifeReads.mts` |
| S-17, 37-S17 | `so-b1-combined-scope.mts run --row S-17\|37-S17 --lab <campaign lab/life> --profile <read profile> --run <n> [--values <private values.json>]` | `combinedScope.mts` |
| 37-L3 | `so-b1-meanwhile.mts run --profile <curator profile> --labeller <profile> --run <n>` | `meanwhileReplay.mts` |
| 37-L6-C | `so-judge.mts calibrate --use warden-voice --lab <campaign lab/life> --run <n>` (alias `--use wardenVoice`) | `voiceScore.mts` |
| B1-C3 | `so-b1-judge-causes.mts follow --out <calls.jsonl>` for the whole play, then `score --row B1-C3 --calls <journal-follow.jsonl> --samples <calls.jsonl> --turns <turns.jsonl> --run <n>` | `judgeCauses.mts` |
| B1-C12 | `so-b1-judge-causes.mts score --row B1-C12 --calls <journal-follow.jsonl> --turns <turns.jsonl> --run <n>` | `judgeCauses.mts` |

Conventions, the same for every runner (`scripts/debug/lib/b1Runs.mts`, `lib/b1Registry.mts`):

- **Evidence where the manifest points.** The public summary (counts, rates, verdicts, never chat or campaign text) is
  `test/phase-c/records/<row>/run-<n>.json`; prompts, replies and labels go to `SO_DEBUG_DIR/b1/<row>/run-<n>.raw.json`
  for `npm run sessions:archive` (rule 6). A summary that carries any long private string is refused before anything is
  written. Campaign ids are aliased in summaries (`stub-1`, row indexes): rule 7.
- **Refuse, never skip.** A missing prerequisite (lab file, the page handle, a live read model, the judge plugin with a
  key, a named profile, a second-model labeller) prints `not-runnable: …`, exits 2 and writes no record. `--run` takes
  1 or 2 only. A short denominator, an errored read, an unparsed label or an axis never put in scope is INCOMPLETE,
  never PASS.
- **Lab data by path.** `--lab <dir>` or `SO_ADOLION_LAB` points at the campaign checkout (`C:\dev\adolion-campaign`
  branch `v2.7-38`, `lab/quests`, `lab/life`); a lab or runs path inside this repo is refused. `--values` and the 35-M2
  runs file stay in the private evidence.
- **Second models.** Labels come from `--labeller` (pinned to the synthesis role for the run, restored after), refused
  when it is the profile the measured role or the reply model runs on. The read rows pin `--profile` on the read role and
  restore it.
- **×2 and lanes.** `node scripts/debug/so-b1.mts combine <row>` is PASS only when both records are (RECORDED for a
  record-only row); `so-b1.mts status` lists the runners and which records exist. `st-lanes.mts run <n> -- …so-b1-*.mts`
  is refused like an integration play when more than `SO_MAX_LLM_LANES` lanes with a model are up (offline `score`
  commands are exempt).
- **Floors.** Each scorer carries its manifest floor verbatim and the numbers as constants; nothing is retuned.
  B1-C12 is record only and says so (`RECORDED`).

Product seams added for the runners (measurement surface only; with none of the new fields set the shipped read prompt
is byte-identical, `extraction/fixtureRunArms.test.ts`): `ExtractionFixtureSpec` takes `scopeCaps` (per scope source,
`null` uncaps), `scopeContext` (present / drafted / card cursor) and `showValues` (37 M1 arm (b): a "Current values"
block a shipped read never carries), and returns each source's kept and dropped keys; `storyOrchestratorLiveSuite`
`runFixture` also returns the scope, the per-source reads and the deltas after the rating guard, and gains
`runMeanwhileCase` (37 L3) and `lifeBlock` (37 M2); `storyOrchestratorJudge.calibrateVoice` over `runVoiceCalibration`
(`judge/wardenCalibration.ts`, jest `runtime/voiceCalibration.test.ts`).

Readings the runners make where a plan leaves room (each one is in the runner's usage text; an owner may overrule):

1. 35 M2: one record is the whole 3 stubs × 2 arms × 2 runs set, since the 90 % floor is "6 of 6" over an arm, so ×2 is
   24 sessions. The floors bind the open arm; the expanded arm is recorded beside it. No run reaching `pull_after + 1`
   leaves the hook floor without a denominator: INCOMPLETE. Arrival is read from the turn whose checkpoint leaves the stub
   (the boundary lags one reply). The blind "felt free / felt steered" pairs are not part of this runner.
2. 36 Q1 M1: the quest source is uncapped in every arm so arm n carries n extra keys (checked; a clipped arm is
   INCOMPLETE). The completion cases state only `{q, v}`, so the facts and rejected tiers the floor names cannot be
   measured and the record says INCOMPLETE until the cases carry those expectations (owner v2.7 38 with v2.7 36).
3. 36 Q1 M2: a numeric `done_when` holds at or past its target; a false latch is the expected value written at all
   (the lab's own scoring text).
4. 37 M1: scored on the value that lands after the rating guard (the code step clamp); the raw over-step count is
   recorded. The row is PASS when the arm that decides the default ((c) if it passes, else (a)) meets every floor and
   (a) is within 5 points of (b).
5. 37 M2: every member is present so the 16-axis arm can fill; the block cost is the window holder's private block at
   the window's start value.
6. S-17 / 37-S17: fairness is counted per scope key (stricter than per quest or pair); the overflow order is recorded for
   B2, not judged; "≥ 3 active quests" is checked as ≥ 3 quest-source keys in the first read, with `--values` seeding the
   activations if the lab copy needs them.
7. 37 L3: every parsed proposal is the in-goal denominator; parser refusals for narrating the player are recorded, not
   counted.
8. B1-C3: a timeout's cause comes from the `/status` samples around the matched call: hold (cooling, a local refusal or
   a `Retry-After`), queue (served count unchanged at the budget), provider (served, not answered in 4000 ms), else
   unattributed. The page's own judge gate wait before the request leaves is not observable.

Missing floors (rule: quote the plan text, never invent): **16-19-S28** filled from v2.7 24 §Acceptance floors (four
S28 rows, verbatim). **C14-b**: no plan states a floor, so it needs an owner decision (v2.7 02); the row stays record
only and cannot be green.

Not built here: the 35-M1 extraction script (the campaign's `lab/stretches/measure_stubs.py` and `stub-lengths.json`
exist on `v2.7-38`; whether they close 35-M1 is the 35 owner's call) and the prod-build drive path (being removed with
the prod/dev split by another session).

**Gates** (worktree, Storybook skipped: the runner finds no stories from a `.claude` worktree path).
`npm run gates -- --no-storybook`: all green in 100.1 s (typecheck, typecheck:test, build, build:dev, lint,
debug:typecheck, test 592 suites / 6,922 passed / 1 skipped, test:debug 1,131 pass, test:release 129 tests / 115 pass /
14 skipped, test:plugin 114 / 111 pass / 3 skipped, test:replay 32 of 32 killed); test-storybook:ci SKIPPED (worktree).
The first run was red on the ownership census (the live-suite probe's `applyRatingGrounding` call read as a write after
an await); classified `local` in `test/findings/ownership-sites.json` (pure, the probe writes nothing), then green.

## Row manifest index

Every row of `test/phase-c/manifest.json`, one line each (the manifest holds prerequisites, reset, assertion, floor and
evidence). `phaseCManifest.test.mjs` fails when this table and the manifest disagree.

| Id | Stage | Tier | Source |
|---|---|---|---|
| B0-base | B0 | D | v2.7 39 §Payload contracts; §B0 record |
| 35-K2 | B1 | RP | v2.7 35 §Gate record, final floor table |
| 35-K3 | B1 | RP + CL | v2.7 35 §Gate record, final floor table |
| 35-K4 | B1 | RP | v2.7 35 §Gate record, final floor table |
| 35-K5 | B1 | RP | v2.7 35 §Gate record, final floor table |
| 35-M1 | B1 | D | v2.7 35 §Phase 2 Floors (M1) |
| 35-M2 | B1 | RP + CL | v2.7 35 §Phase 2 Floors (M2) |
| 36-Q1-M1 | B1 | CL | v2.7 36 §Q1 Floors (M1) |
| 36-Q1-M2 | B1 | CL | v2.7 36 §Q1 Floors (M2) |
| 37-M1 | B1 | CL | v2.7 37 §Measurement M1 |
| 37-M2 | B1 | CL | v2.7 37 §M2 + §Floors (2026-10-07) |
| S-17 | B1 | CL | v2.7 39 §Rows added by the 2026-10-07 review |
| 37-S17 | B1 | CL | v2.7 37 §Combined scope budget |
| 37-L3 | B1 | CL | v2.7 37 §L3 curator proposals gate |
| 37-L6-C | B1 | CL | v2.7 37 §L6 Calibration row L6-C |
| B1-C3 | B1 | CL + RP | v2.8 01 §B C3; 39 §B1 rows from v2.8 01 |
| B1-C12 | B1 | CL | v2.8 01 §B C12; 39 §B1 rows from v2.8 01 |
| B1-R4 | B1 | RP | v2.8 01 §E (data only); 39 §B1 rows from v2.8 01 |
| B1-PAR | B1 | RP | v2.7 39a §Hardware (B1 pod); 39 §B1 rows from v2.8 01 |
| B1-PFX | B1 | RP | v2.7 41 §5 P2, §6 Rows |
| B1-HIST | B1 | RP | v2.7 41 §5 P1, §6 Rows |
| B1-NARR | B1 | RP | v2.7 41 §5 P3, §7 P3 as built |
| B1-EMPTY | B1 | RP | 2026-10-08 B1 empty-reply finding; `runtime/emptyReply.ts` |
| C0-freeze | C0 | D | v2.7 39 §Sequence C0; rule 2 |
| C0-goldens | C0 | D | v2.7 39 §Sequence C0 |
| C1-gates | C1 | D | v2.7 39 §Sequence C1; v2.7 31 §C |
| C1-release | C1 | D | v2.7 39 §Sequence C1 |
| C1-clean-host | C1 | D | v2.7 32 §W4 |
| C1b-ratchet | C1b | D | v2.7 39 §Sequence C1b |
| 37-B3 | C1b | D | v2.7 37 §Gates Bundle |
| C2-corpus | C2 | D | v2.7 39 §Sequence C2; v2.7 16 §Regression |
| C2-rendered-targets | C2 | D | v2.7 39 §Sequence C2 (finding 20); v2.7 29/30 Review (Sol) finding 20 |
| 16-K1 | C2 | D | v2.7 16 §Step 0 K1 |
| 16-07-A3A8 | C2 | D | v2.7 16 §Step 0 07 A3 + A8 |
| 16-01-in-app-walk | C2 | D | v2.7 16 §Per plan 01; 39 §C2 rows |
| 16-02-C1 | C2 | D | v2.7 16 §Per plan 02 C1 SP5.b |
| 16-02-C2-K1 | C2 | D | v2.7 16 §Per plan 02 C2-K1; 39 §C2 rows |
| 16-02-C11-F1a | C2 | D | v2.7 16 §Per plan 02 C11-F1a; 39 §C2 rows |
| 16-02-C13 | C2 | D | v2.7 16 §Per plan 02 C13; 39 §C2 rows |
| 16-02-C14 | C2 | D | v2.7 16 §Per plan 02 C14 + 14; 39 §C2 rows |
| 16-03-group-only | C2 | D | v2.7 16 §Per plan 03 |
| 16-04-health-center | C2 | D | v2.7 16 §Per plan 04; 39 §C2 rows |
| 16-05-briefing | C2 | D | v2.7 16 §Per plan 05; 39 §C2 rows |
| 16-06-presence | C2 | D | v2.7 16 §Per plan 06; 39 §C2 rows |
| 16-07-A6 | C2 | D | v2.7 16 §Per plan 07 |
| 16-08-thinking | C2 | D | v2.7 16 §Per plan 08; 39 §C2 rows |
| 16-09-commitment | C2 | D | v2.7 16 §Per plan 09; 39 §C2 rows |
| 16-10-catch-up | C2 | D | v2.7 16 §Per plan 10; 39 §C2 rows |
| O2 | C2 | D | v2.8 01 §A O2 |
| 29-D1 | C2 | D | v2.7 29 §Gates (D) |
| 29-D2 | C2 | D | v2.7 29 §Gates (D) |
| 30-D1 | C2 | D | v2.7 30 §Gates (D) Phase C live |
| 30-D2 | C2 | D | v2.7 30 §Gates (D) Phase C live |
| 30-D3 | C2 | D | v2.7 30 §Gates (D) Phase C live |
| 31-G3 | C2 | D | v2.7 31 §Gates (D) |
| 32-W4-scenario | C2 | D | v2.7 32 §Tests added; §Phase C rows owed |
| 33-D-clean | C2 | D | v2.7 33 §W2/W3/W4 Gates |
| 34-L-flow | C2 | D | v2.7 34 §Gates D, Live |
| 34-L-F11 | C2 | D | v2.7 34 §Gates D, Live |
| 34-L-switch | C2 | D | v2.7 34 §Gates D, Live |
| 34-L-reopen | C2 | D | v2.7 34 §Gates D, Live |
| 34-L-restart | C2 | D | v2.7 34 §Gates D, Live |
| 34-L-fixed | C2 | D | v2.7 34 §Gates D, Live |
| 34-L-brief-off | C2 | D | v2.7 34 §Gates D, Live |
| 34-L-solo | C2 | D | v2.7 34 §Gates D, Live |
| 34-L-harness | C2 | D | v2.7 34 §Gates D, Live |
| 34-L-multiuser | C2 | D | v2.7 34 §pane, Multi-user installs |
| S-04 | C2 | D | v2.7 39 §Rows for Sol findings 4–10 |
| S-05 | C2 | D | v2.7 39 §Rows for Sol findings 4–10 |
| S-09 | C2 | D | v2.7 39 §Rows for Sol findings 4–10 |
| 35-P2-curve | C2 | D | v2.7 35 §Phase 2 / Owed |
| 35-P2-clean | C2 | D | v2.7 35 §Owed Phase 2 |
| 36-Q5-scn | C2 | D | v2.7 36 §Q5 Gate |
| 36-P-live | C2 | D | v2.7 36 §P Gate |
| 36-spoiler-sweep | C2 | D | v2.7 36 §Spoiler rules |
| 37-D1 | C2 | D | v2.7 37 §Gates no-LLM group scenario; 39 §Rows owed by v2.7 37 |
| 37-D2 | C2 | D | v2.7 37 §Gates; 39 §Rows owed by v2.7 37 |
| 37-D3 | C2 | D | v2.7 37 §Gates; 39 §Rows owed by v2.7 37 |
| 37-spoiler | C2 | D | v2.7 37 §Gates Spoiler checklist |
| C3-preservation | C3 | D | v2.7 39 §Sequence C3; §Payload contracts |
| C3-repeatability | C3 | D | v2.7 39 §Sequence C3 |
| PC-role-line | C3 | D | v2.7 39 §Payload contracts |
| PC-open-stretch | C3 | D | v2.7 39 §Payload contracts |
| PC-check-outcomes | C3 | D | v2.7 39 §Payload contracts |
| PC-agency-notes | C3 | D | v2.7 39 §Payload contracts |
| PC-quest-scope | C3 | D | v2.7 39 §Payload contracts |
| PC-relationship-scope | C3 | D | v2.7 39 §Payload contracts |
| PC-privacy | C3 | D | v2.7 39 §Payload contracts |
| PC-off-path | C3 | D | v2.7 39 §Payload contracts (off-path requests) |
| J0 | C4 | D | v2.7 39 §Sequence C4 |
| J1 | C4 | D + RP | v2.7 39 §Sequence C4 |
| J2 | C4 | D + RP | v2.7 39 §Sequence C4 |
| J3 | C4 | D + RP | v2.7 39 §Sequence C4 |
| J4 | C4 | D + RP | v2.7 39 §Sequence C4 |
| J5 | C4 | D + RP | v2.7 39 §Sequence C4 |
| J6 | C4 | D + RP | v2.7 39 §Sequence C4 |
| J7 | C4 | D + RP | v2.7 39 §Sequence C4 |
| J8 | C4 | D + RP | v2.7 39 §Sequence C4 |
| J9 | C4 | D + RP | v2.7 39 §Sequence C4 |
| J10 | C4 | D + RP | v2.7 39 §Sequence C4 |
| J11 | C4 | D + RP | v2.7 39 §Sequence C4 |
| J12 | C4 | D + RP | v2.7 39 §Sequence C4 |
| J13 | C4 | D + RP | v2.7 39 §Sequence C4 |
| J14 | C4 | D + RP | v2.7 39 §Sequence C4 |
| J6-W1 | C4 | D + RP | v2.7 33 §W1 Floors V8; 39 C4 |
| O1 | C5 | RP | v2.8 01 §A O1 |
| O3 | C5 | LI + CL | v2.8 01 §A O3 |
| O4 | C5 | LI + RP | v2.8 01 §A O4 |
| O5 | C5 | LI | v2.8 01 §A O5 |
| O6 | C5 | LI | v2.8 01 §A O6 |
| O7 | C5 | CL | v2.8 01 §A O7 |
| O8 | C5 | D | v2.8 01 §A O8 |
| O9 | C5 | RP | v2.8 01 §A O9 |
| O10 | C5 | CL | v2.8 01 §A O10 |
| O11 | C5 | CL | v2.8 01 §A O11 |
| O12 | C5 | D | v2.8 01 §A O12 |
| O13 | C5 | RP | v2.8 01 §A O13 |
| O13b | C5 | CL | v2.8 01 §A O13b |
| O14 | C5 | CL | v2.8 01 §A O14 |
| O15 | C5 | CL | v2.8 01 §A O15 |
| O16 | C5 | CL | v2.8 01 §A O16 |
| C14-b | C5 | CL | v2.8 01 §B C14-b (moved to 39 C5) |
| C4-R6 | C5 | CL + RP | v2.8 01 §B C4; 39 §B1 rows from v2.8 01 |
| C4-J8 | C5 | CL + RP | v2.8 01 §B C4; 39 §B1 rows from v2.8 01 |
| R4-live | C5 | RP | v2.8 01 §E Also owed; 39 §B1 rows from v2.8 01 |
| 33-W1-V0 | C5 | D | v2.7 33 §W1 Floors V0 |
| 33-W1-V3 | C5 | CL + RP | v2.7 33 §W1 Floors V3 |
| 33-W1-V4 | C5 | CL + RP | v2.7 33 §W1 Floors V4 |
| 33-W1-V5 | C5 | CL + RP | v2.7 33 §W1 Floors V5 |
| 33-W1-V7-live | C5 | D + CL | v2.7 39 §Rows added by the 2026-10-07 review |
| 33-W2-oversteer | C5 | RP + CL | v2.7 33 §W2 Floor, Decision 3; v2.8 01 §G |
| 33-W2-J8.10 | C5 | CL | v2.7 33 §W2 Gate |
| 33-W3-N1 | C5 | CL | v2.7 33 §W3 N1 |
| 33-W3-combined | C5 | CL | v2.7 33 §W3 Gate/Floors |
| 33-W3-live | C5 | CL | v2.7 33 §W3 Gate |
| 33-W4-live | C5 | CL | v2.7 33 §W4 Gate |
| 33-W4-spoiler | C5 | CL | v2.7 33 §W4 Floors |
| 33-W4-useful | C5 | CL | v2.7 33 §W4 Floors (Decision 7) |
| 34-RP | C5 | RP + CL | v2.7 34 §Floors (proposed 2026-10-07) |
| 34-copy | C5 | RP | v2.7 34 §Gates, Player-visible surface |
| S-06 | C5 | D + RP | v2.7 39 §Rows for Sol findings 4–10 |
| S-07 | C5 | CL | v2.7 39 §Rows for Sol findings 4–10 |
| S-08 | C5 | CL | v2.7 39 §Rows for Sol findings 4–10 |
| S-10 | C5 | CL + RP | v2.7 39 §Rows for Sol findings 4–10 |
| S-11 | C5 | CL | v2.7 39 §Rows for Sol findings 4–10 |
| S-12 | C5 | CL | v2.7 39 §Rows for Sol findings 4–10 |
| S-15 | C5 | D | v2.7 39 §Rows added by the 2026-10-07 review |
| S-16 | C5 | D | v2.7 39 §Rows added by the 2026-10-07 review |
| S-19 | C5 | D + RP | v2.7 39 §Rows added by the 2026-10-07 review |
| S-19-OOC | C5 | D + RP | v2.7 39 §Rows added by the 2026-10-07 review |
| S-19-OOC-b | C5 | D + RP | v2.7 39 §Rows added by the 2026-10-07 review |
| 37-Q1 | C2 | D | v2.7 39 §Rows owed by v2.7 37 |
| 37-Q2 | C2 | D | v2.7 39 §Rows owed by v2.7 37 |
| 37-Q3 | C5 | D + RP | v2.7 39 §Rows owed by v2.7 37 |
| S-13 | C5 | D + CL | v2.7 39 §Rows for Sol findings 4–10 |
| 37-S19 | C5 | D + RP | v2.7 37 §Story clock Gate; 39 §Rows owed by v2.7 37 |
| 37-M1-C5 | C5 | CL | v2.7 37 §M1; 39 C5 (37 M1, M3) |
| 37-M3 | C5 | RP + CL | v2.7 37 §M3; 39 §Rows added |
| 36-Q3 | C5 | RP + CL | v2.7 36 §Q3 Floor |
| 36-pilot-academy | C5 | RP | v2.7 36 §Order 7 |
| 36-pilot-saga | C5 | RP | v2.7 36 §Order 7 |
| 35-M2-C5 | C5 | RP + CL | v2.7 35 §Phase 2 Floors (M2); 39 C5 |
| 35-K3-C5 | C5 | RP + CL | v2.7 35 §Gate record; 39 C5 (branch: SP6 PASS) |
| 35-K4-C5 | C5 | RP | v2.7 35 §Gate record; 39 C5 (branch: SP6 PASS) |
| 35-K5-C5 | C5 | RP | v2.7 35 §Gate record; 39 C5 (branch: SP6 PASS) |
| 35-P3-K2 | C5 | RP | v2.7 35 §Phase 3 Floor (branch: SP6 PASS) |
| 35-P4-M2 | C5 | RP + CL | v2.7 35 §Phase 4 Floor (branch: SP6 PASS, M2 PASS) |
| 35-P4-K3 | C5 | RP + CL | v2.7 35 §Phase 4 Floor (branch: SP6 PASS, M2 PASS) |
| 35-P4-K4 | C5 | RP | v2.7 35 §Phase 4 Floor (branch: SP6 PASS, M2 PASS) |
| 35-ENC | C2 | D | v2.7 35 §Phase 2 gate (encounter pool); 39 §Stage B branches (branch: SP6 PASS, M2 PASS) |
| 35-DROP | C2 | D | v2.7 35 §Phase 1 drop path; 39 §Stage B branches (branch: SP6 FAIL or INCOMPLETE) |
| 32-W8-S32-1 | C5 | RP | v2.7 32 §W8; 39 C5 |
| 32-W6-stream | C5 | RP | v2.7 32 §W6; 39 C5 |
| 32-W1-A | C6 | LI | v2.7 32 §W1; 39 C6 |
| 32-W1-template | C6 | LI | v2.7 32 §W1 Floor |
| 32-W1-director | C6 | LI + CL | v2.7 32 §W1 Gate |
| 32-W2-B | C6 | LI | v2.7 32 §W2 |
| 32-W3 | C6 | LI + CL | v2.7 32 §W3 |
| 32-W4-nobroker | C6 | LI | v2.7 32 §W4 |
| 32-W5-builder | C6 | LI + CL | v2.7 32 §W5 |
| 32-W5-cancel | C6 | LI | v2.7 32 §W5 |
| 32-W5-cleanup | C6 | LI | v2.7 32 §W5 |
| 32-W5-base | C6 | LI | v2.7 32 §W5 |
| 32-W6-frames | C6 | LI | v2.7 32 §W6 |
| 32-W6-seam | C6 | CL | v2.7 32 §W6, Decision 2 |
| 32-W7-look | C6 | LI + RP | v2.7 32 §W7 |
| S32-2 | C6 | LI + RP | v2.7 32 §W8; 39 C6 |
| S32-2-lifecycle | C6 | LI + RP | v2.7 32 §W8 |
| 32-director-payload | C6 | CL | v2.7 32 §Model input (rule 6) |
| 16-18-refadopt | C6 | LI | v2.7 16 §Per plan 18 + 24 B/C |
| 16-19-S28 | C6 | LI + LT + CL | v2.7 16 §Per plan 19 + 24 D |
| 16-20-local-card | C6 | LT | v2.7 16 §Per plan 20 + 24 E |
| 38-D13b | C6 | LI | v2.7 38 §Steps D13b + §Gates |
| 38-D13c | C6 | LI | v2.7 38 §Steps D13c |
| 38-assets-saga | C6 | LI | v2.7 38 header; v2.7 28 |
| C6-stage | C6 | LI + CL | v2.7 39 §Rows added by the sprites review (2026-10-07); v2.7 32 Decision 2 |
| 38-G-campaign | C7 | D | v2.7 38 §Gates |
| 38-C7 | C7 | RP | v2.7 38 §C7 integration criteria |
| 38-C7-life | C7 | RP | v2.7 38 §C7 (finding 18) |
| 38-C7-quest | C7 | RP | v2.7 38 §C7 (finding 18) |
| C8-smoke | C8 | CL | v2.7 16 §Live smoke procedure; 39 C8 |
| C8b-stranger | C8b | CL | v2.7 39 §Sequence C8b |
| Z-docs | Z | D | v2.7 39 §Sequence Z |
| Z-attestation | Z | D | v2.7 39 §Sequence Z; rule 2 |

## B0-live record (2026-10-07/08, branch `v2.7-39-b0-live-fixes`, local no-model shakedown)

Pre-freeze shakedown, not Phase C evidence (rule 1): the evidence slots this record wrote into the manifest are
labelled `so-sessions:evidence/phase-c/b0-live-2026-10-07/…` and must be replaced on the frozen candidate.

**Setup.** Served build = the staged slot, bundle `09556eb3d579…` (`dist/manifest.json` source = `2fa2e13c`, no `src/`
change to master `f3466549`); not restaged. Harness ran from the side-branch worktree. Two lanes (1, 2), both
**offline** (`SO_LANE_OFFLINE=1 st-lanes seed --fresh`, `83848762` + `15882d96`): every loopback URL in the lane copy
(local model servers incl. the 3090 controller, ComfyUI, textgen `server_urls`) points at the closed port 18079, model
keys removed, judge / images / sprites / ST Image Generation off, no default persona (`user-default.png`), and the lane
server starts without server plugins (the GPU plugin's shared config forwards to the controller, the media plugin to
ComfyUI). Verified in each lane's server log: no request to 18888, 18080 or 8188 after the switch; lane 0 and :8000
untouched. RAM gate `SO_MIN_FREE_RAM_GIB=8` (`c57211e3`): one pause, 60 s (lane 1, `e2-failed-pass-player-clean` run 1,
6.82 GiB free). Run headers: one per lane before the first batch, one per item before each re-seeded pair
(`<lane>/debug/run-header-*.json`, archived).

**Runs.** C2-corpus = 88 no-model scenarios + J0, `st-lanes batch --lanes 1,2 --repeat 2 --strict` (batch
`2026-10-07T20-42-09-161Z`), then every non-green item again ×2 on a freshly re-seeded lane (three passes; the batch
shares one install across rows, rule 11's per-row reset is not in `st-lanes batch`). Final pair per item:
`so-sessions:evidence/phase-c/b0-live-2026-10-07/local/b0-live-final.json`.

| Result ×2 | Items |
|---|---|
| green ×2 | 70 of 89 (J0 and 69 scenarios, among them every v27 row fixture below marked green) |
| red ×2 | 17: `effects-story-scenario`, `plan02-runtime`, `plan06-convergence`, `v27-03-no-group-solo-blob`, `v27-34-lock-refused`, `v27-34-persona-switch`, `v27-34-player-setup`, `v27-35-open-stretch-curve`, `v27-36-quest-rewards`, `v27-36-quests`, `v27-37-agenda-effect`, `v27-37-character-life`, `v27-d-01-in-app-walk`, `v27-d-02-c13-curator-tiers`, `v27-d-02-c2-k1`, `v27-d-10-edit-catch-up`, `v27-s12d-held-secret-chapters` |
| green then red | 1: `plan07-memory` (run 2: scheduler never drains, queue 2 + heavy 1) |
| not runnable | 1: `v27-card-rollback` (needs group "SOIMG Test cast", not on this install) |
| deferred to B1 (needs a model) | 14: `plan03a-llm-npc-reply`, `plan08-hygiene`, `v24-acc-A-reload-blocks(-control)`, `v24-acc-I3`, `v24-pf-AE04-lore-cancel`, `v24-pf-AE04-scene-refused`, `v24-pf-curator-same-chat`, `v24-pf-curator-switch`, `v27-33-v3-postprocessor`, `v27-c6-test-cast`, `v27-card-art-base`, `v27-existing-expression-reference`, `v27-local-card-reply` |

Payload goldens (B0-base item): `so-payload-golden capture` ×2 against the **candidate** (served `09556eb3…`), all four
cases (`group-opening`, `group-memory`, `group-away-notice`, `group-relationships`), no `capture-failed.json`; diff
run 1 → run 2: identical. Raw captures private (`lane-1/debug/payload/b0-live-cand-r1|r2`).

**Manifest rows with `tier: ["D"]` (81).**

| Manifest row | Runner | Run 1 / run 2 |
|---|---|---|
| J0, 16-02-C11-F1a, 16-02-C14, 16-04-health-center, 16-05-briefing, 16-06-presence, 16-08-thinking, 16-09-commitment, 32-W4-scenario, 34-L-fixed, 34-L-solo, S-05, S-09, S-16, 37-D2, 37-Q1 | scenario / journey | green / green (16-04 with ST's Summarize extension enabled on the lane, its prerequisite; 16-02-C14 ran with no server plugins, so no harness route was listed) |
| 37-Q2, 33-W1-V0, 38-G-campaign | jest; campaign `check_all.sh --fast` at the pin (ignored inputs copied from the campaign checkout) | green / green |
| C2-corpus | batch above | red (17 red ×2, 1 red on run 2) |
| 16-01-in-app-walk, 16-02-C1, 16-02-C2-K1, 16-02-C13, 16-03-group-only, 16-10-catch-up, 34-L-flow, 34-L-F11, 34-L-brief-off, 34-L-switch, 34-L-reopen, 34-L-restart, S-04, 35-P2-curve, 36-Q5-scn, 37-D1, 37-D3 | scenario | red / red (findings below) |
| S-15 | jest half (`agendaEffects`, `questRewards`, `effectRestore` review tests, green ×2) + scenario half `v27-37-agenda-effect` | red / red |
| 16-07-A3A8 | `adolion-fresh seed 2` | red (run 1 failed at the sprite upload; run 2 not attempted) |
| B0-base | needs the predecessor staged, which this task forbids (`npm run stage` writes the slot every lane and the owner's ST serve) | not run as defined; candidate capture ×2 identical as above |
| C1b-ratchet | `codeHealth.json` vs the predecessor's | ratchet holds (every list ⊆, no budget up); the B3 cost part has no B3 yet: incomplete |
| 37-B3 | the staged `dist/` | main entry 1,190,252 B ≤ 1,250,000 B; the meanwhile proposal prompt only in lazy chunks; one measurement: incomplete |
| C1-gates, C1-release | `npm run gates -- --no-storybook` on the side branch (below) | not the frozen candidate, Storybook skipped: incomplete |
| 16-07-A6 | needs the A3A8 lane | not runnable |
| C2-rendered-targets, 16-K1, O2, O8, 29-D1, 29-D2, 30-D1, 30-D2, 30-D3, 31-G3, 33-D-clean, 34-L-harness, 34-L-multiuser, 35-P2-clean, 36-P-live, 36-spoiler-sweep, 37-spoiler | none: no fixture or script drives the assertion (34-L-harness's scenario half is in `v27-34-player-setup`) | not runnable (missing runner) |
| 35-M1, O12 | offline evidence walk / gate-record walk, no script | not run |
| 35-ENC, 35-DROP | branch rows (B2 not decided) | not runnable |
| C0-freeze, C0-goldens, C1-clean-host, C3-preservation, C3-repeatability, PC-role-line, PC-open-stretch, PC-check-outcomes, PC-agency-notes, PC-quest-scope, PC-relationship-scope, PC-privacy, PC-off-path, Z-docs, Z-attestation | frozen candidate / B0-base goldens | not runnable before the freeze |

**Findings** (39a §Findings during a run; Adolion rows report counts only).

| # | Finding | Bucket | Status |
|---|---|---|---|
| F1 | A plain no-model lane copy still reached the owner's local servers: profiles and textgen `server_urls` name the 3090 controller (the memory-model profile included), and the shared GPU plugin forwards `/status` to it. Earlier "no-model" lane results on this install may have used the owner's model | harness | fixed `83848762` (offline seed) |
| F2 | On a no-model lane the memory-model check blocks, so every fresh story start opens the blocks-only "Before you start" dialog and its modal swallowed the next click (red on run 2 only) | harness | fixed `fa5fdf0a` (closed for fixtures that do not drive the briefing, recorded) |
| F3 | A cold lane's first page lists 0 characters / 0 groups; every row after it was NOT RUNNABLE | harness | fixed `b46b5e1d` (start waits, reloads; one reload measured) |
| F4 | The install's stored `announceTransitions=true` (default off since W11) posted a note as the newest message under fixtures that read the last reply | harness | fixed `869d260e` |
| F5 | The install's default persona is auto-selected (and locked by the auto-skip) in each sandbox chat: persona requirements unmet, identity fixtures locked before any choice | harness | fixed `15882d96` |
| F6 | Stale fixtures against shipped behaviour: transition note text is `player_text` since T0; a generated beat gated on a value already held is refused since T1-6; sun-ruins cp1 disables Luke; story versions removed 2026-10-07; a context read once never sees a new group | fixture | fixed `1d3d83a7`, `e347600c` (supersedes `a2c90d92`), `8aac7b60`, `86a3ae7f`, `41a96bfd`; each re-run green ×2 except `41a96bfd` (see F10) |
| F7 | An empty "Before you start" dialog stays open after its blocks clear (no blocks, briefing or identity step, only Close) and holds every pointer action: red cause of `v27-d-02-c2-k1` and `v27-36-quests` | product, small | fixed `3be94ddd` + jest `briefingHost.test.ts`; **not live-tested: needs a restage** |
| F8 | The start dialog's Close button renders one letter per line (both screenshots) | product, cosmetic | open |
| F9 | 16-02-C1 asserts that removing the story restores the pre-story scenario; `removeStory` only deletes the library record, a playing chat keeps its pinned copy (by design, the delete popup says so) and there is no chat-level exit path at all | product / plan | open: owner decision (an exit path, or the row's trigger) |
| F10 | `v27-03` fixture cleanup deletes the adopted made-group while the page is on it; the sandbox guard then reads an escape. All 11 steps pass. A return-to-sandbox attempt did not land within 20 s and was reverted | harness | open |
| F11 | Batch rows share one install: `plan07-memory`, `v24-02-hide-consumed`, T10 rows and others were red in the batch and green after a re-seed; `plan07-memory` still fails on the second consecutive run (scheduler queue never drains) | harness / product, undetermined | open |
| F12 | Identity step: clicking Keep records `choice: skip` (`v27-34-player-setup`, `v27-34-persona-switch`, both ×2); `v27-34-lock-refused` ends with the record still pending after "continue unlocked" | undetermined (possibly player-facing) | open: needs triage before B1 |
| F13 | Undetermined reds ×2: `plan02-runtime` opener neither held nor posted on a fresh lane (green ×3 on a reused one); `plan06-convergence` lands on the generated beat, not the anchor; `v27-35-open-stretch-curve` swipe does not move to the existing alternative; `v27-36-quest-rewards` no quest-origin world_info ledger row; `v27-37-agenda-effect` no agenda world_info row; `v27-37-character-life` an OOC boundary still advances the agenda wait; `v27-d-01` Repair Show me never lands on `#so-extraction-profile`; `v27-d-02-c13` the swipe does not roll the story back; `v27-d-10` HUD reads "stepped back", not catching-up; `v27-s12d` a seal-path model call has no mock (ModelCallError on a no-model lane) | fixture or product, undetermined | open |
| F14 | `adolion-fresh seed` cannot seed from the install as it is now: the install holds the campaign's cards under other avatars (main-install rollout), the strip keeps them, and the sprite upload refuses the name clash | harness | open (blocks 16-07-A3A8, 16-07-A6) |
| F15 | 17 D rows have no runner (table above) and cannot produce evidence | plan | open (39 owner) |
| F16 | 23 batch row folders are INCOMPLETE (no `record.json`): the 20-row tail of the first batch on lane 1 after a page wedge (a `/api/chats/save` 400 during `v27-34-solo` run 2), two rows from an interrupted re-run loop, one `v27-03` run 2. Every affected item was re-run on a re-seeded lane | — | `so-evidence check` exit 1 (352 rows checked); archived with `--allow-incomplete` (verdict in `ARCHIVE.json`) |

**Evidence.** `node scripts/debug/so-evidence.mts archive --label b0-live-2026-10-07 --lanes 1,2 --since
2026-10-07T20:20:00Z --allow-incomplete` (main checkout): 4,233 files, 970.7 MB into the private work tree
`test/sessions/evidence/phase-c/b0-live-2026-10-07/` (ignored by the public repo), `verify` ok; local logs (jest, campaign
check, Adolion seed, batch and loop logs) added under `local/`. `npm run sessions:archive` not run.

**Fixes** (side branch, not merged, not pushed): harness `83848762`, `c57211e3`, `fa5fdf0a`, `869d260e`, `15882d96`,
`b46b5e1d`; fixtures `1d3d83a7`, `a2c90d92` → `e347600c`, `8aac7b60`, `d50bd353`, `41a96bfd`, `86a3ae7f`; product
`3be94ddd` (needs a restage to test live).

**Blocks B1.** F12 (identity Keep → skip) and F13 need triage on a restaged build before model rows rely on those
surfaces; F7 needs a restage to verify; F14 blocks every Adolion lane seed from the current install; F1 means past
no-model lane results on this install are suspect (they could reach the owner's model).

**Gates** (side-branch worktree, `node_modules` junctioned, Storybook skipped: the runner finds no stories from a
worktree). `ST_ROOT=C:/dev/SillyTavern-MainBranch npm run gates -- --no-storybook`: all green in 162.1 s (typecheck,
typecheck:test, debug:typecheck, lint, build, test 600 suites / 6,966 passed / 1 skipped, test:debug 1,202 / 1,202,
test:release 128 / 114 pass / 14 skipped, test:plugin 114 / 111 pass / 3 skipped, test:replay 32 of 32 killed);
test-storybook:ci SKIPPED. Lanes 1 and 2 stopped at the end.

## B0-live round 2 record (2026-10-07/08, branch `v2.7-39-b0-live-r2`, local no-model shakedown)

Pre-freeze shakedown, not Phase C evidence (rule 1). Evidence: `so-sessions:evidence/phase-c/b0-live-r2-2026-10-07/`.

**Setup.** Side-branch worktree `C:\dev\so-b0-r2` off master `5f3e9ee6`, `node_modules` junctioned. Two lanes (1, 2), every
seed offline (`SO_LANE_OFFLINE=1`, round 1's F1 seed), RAM gate `SO_MIN_FREE_RAM_GIB=8` (no pause needed; 14 GiB free at
start). No ComfyUI, 3090 controller or model call: every lane server log after a seed shows only the closed port 18079.
Served build: master's staged slot (bundle `09556eb3…`) for the Adolion rows; then the side branch's own build, staged
twice because the branch changes product code (first `79f96b98`, then `39d0c593`: every product fix below; later commits
are harness and fixtures only). Master's build is staged back at the end. Per-row pairs ran on a freshly re-seeded lane
per item (`stop; seed --fresh; start; run-header capture; st-lanes batch --lanes <n> --repeat 2 --strict <item>`).

**Pin bump.** `adolion-fresh.pin.json` -> campaign master `3bc72e3` (`a1bfaccd`); `so-session index` rebuilt
`adolion-stories.json` + `14-cards.md`; `charters.json`, `runs.json` pins moved; the pin drift tests green (58 node / 52 jest).

**Rows ×2** (run 1 / run 2; every pair on one install).

| Manifest row | Runner | Result |
|---|---|---|
| 16-07-A3A8 | `adolion-fresh seed 2` + `check 2` (pin `3bc72e3`) | green / green (seed: 147 cards, 16 books, 201 sprite folders / 2,889 files, 9 groups, no problems; check drift 0; run 2 `sameAsPrevious: true`) |
| 16-07-A6 | new `adolion-fresh badges 2` (counts only) | green / green (9 bound, 9 listed, 9 badges: 1 saga, 8 story) |
| 16-02-C2-K1 | `v27-d-02-c2-k1` (Summarize enabled on the lane, its prerequisite) | green / green (F7 verified on the staged build) |
| 36-Q5-scn | `v27-36-quests` | green / green |
| 34-L-flow, 34-L-F11, 34-L-brief-off | `v27-34-player-setup` | green / green |
| 34-L-switch, 34-L-reopen, 34-L-restart | `v27-34-persona-switch` | green / green |
| S-04 | `v27-34-lock-refused` | green / green |
| 34-L-fixed | `v27-34-fixed-name` | green / green |
| 34-L-solo | `v27-34-solo` | green / green (after the solo_chat fix) |
| 16-02-C1 | `effects-story-scenario` (assertion reworded, F9) | green / green |
| 16-01-in-app-walk | `v27-d-01-in-app-walk` | green / green |
| 16-02-C13 | `v27-d-02-c13-curator-tiers` | green / green |
| 16-03-group-only | `v27-03-no-group-solo-blob` | green / green |
| 16-10-catch-up | `v27-d-10-edit-catch-up` | green / green |
| 35-P2-curve | `v27-35-open-stretch-curve` | green / green |
| 37-D1 | `v27-37-character-life` | green / green |
| 37-D3, S-15 scenario half | `v27-37-agenda-effect` | green / green |
| 36-Q5-scn-b | `v27-36-quest-rewards` | green / green |
| 16-04-health-center | `v27-d-04-health-center` (Summarize enabled) | green / green |
| C2-corpus | `st-lanes batch --lanes 1,2 --repeat 2 --strict`, the 87 batchable items of round 1's 89 (C2-K1 and 16-04 need Summarize on the lane and ran as their own pairs above), batch `2026-10-08T01-52-26-610Z`, fresh offline seeds | 84 green ×2; `v27-card-rollback` not runnable; `v27-s12d` red ×2 (R10) and `v27-d-10` red / green (R11), both fixed and green ×2 after (s12d batched behind `v27-ooc-read` ×2 on one install, the order that broke it). An earlier full batch this round (`2026-10-08T00-36-33-172Z`, before R9) is superseded: its lane-2 tail of 20 rows never ran |

Round 1's other undetermined reds, green ×2 per row on a re-seeded lane: `plan02-runtime`, `plan06-convergence`,
`plan07-memory`, `v27-s12d-held-secret-chapters`, `v24-02-persona-change`.

**Findings** (round 1's F1–F16 carried forward; new ones R1–R11).

| # | Finding | Bucket | Status |
|---|---|---|---|
| F7 | Empty "Before you start" dialog held the page | product, small | fixed `3be94ddd` (round 1), verified live on the staged build: C2-K1 and 36-Q5-scn green ×2 |
| F8 | Start-dialog buttons broke one letter per line: ST's `.menu_button { width: min-content }` under the panel's `overflow-wrap: anywhere` | product, cosmetic | fixed `cd28c5aa` (`#so-briefing .menu_button` fit-content + break-word), story guard `CloseButtonOnOneLine` (applies the host rule; not run: Storybook does not run from a worktree), live: Close 50 × 28 px on one line (screenshot) |
| F9 | 16-02-C1 expected removal to restore the pre-story scenario | fixture (by design) | fixed `79f96b98`: the running chat keeps its pinned copy after the library record goes, and a jump still swaps the scenario; manifest assertion and 16-test-plan line reworded |
| F10 | v27-03 cleanup deleted the made group while the page was on it | harness | fixed `c84f3568` (cleanup returns to the sandbox chat first) |
| F11 | Rows leaked state across one install | harness | root causes fixed: an unmocked short-term pass opened the in-page memory-model breaker, which held the next run's reads (`bdc5e182` mock, `8d19e1ec` cleanup closes and names a breaker a fixture left open); an unrecorded solo chat wedged every later row on its lane (`e344fc32`, `3020ed7e`, R9) |
| F12 | Keep recorded as skip; continue unlocked left the record pending | product, small | fixed `967937ce`: the start page's Close read a stale (pre-render) pending record and sent `skip`/`retry`, which re-recorded the settled step; a skip or retry on a settled record is now refused (`ALREADY_SETTLED`), jest ×3 (two fail without the fix); live: all 34-L rows and S-04 green ×2 |
| F13 | Ten undetermined reds | split | see R1–R8 |
| F14 | `adolion-fresh seed` sprite upload refused every card | harness | fixed `833b5d03`: round 1's reading (cards under other avatars) was wrong, 0 such cards on the install; the sprite installer runs from the LFS worktree and read that worktree's own empty ledger, so every card the export installer had just installed counted as "unrelated". The seed now hands it the export's ledger and takes it back. 16-07-A3A8 + A6 green ×2 |
| F16 | Incomplete row folders | harness | `so-evidence check --lanes 1,2` exit 0 (300 rows); round 1's batch folders (archived in round 1) moved to `debug/batch-pre-r2`, the first corpus batch of this round (its lane-2 tail wedged by R9) to `debug/batch-superseded-r2`, both copied under `local/` |
| R1 | Lane copies kept ST swipes off (the install's setting), so ST refused every scenario swipe (`v27-35`, `v27-d-02-c13`) | harness | fixed `0112bb76` (`st-lanes seed` switches swipes on, as adolion-fresh did) |
| R2 | HUD read "stepped back" while the edit's re-read was pending; the guide says the edit chip shows then | product, small | fixed `a22f44d8` (`hudChipLabel`: catching-up outranks stepped back), jest |
| R3 | `plan02-runtime` required persona "Max", unrelated to its opener check, never ready on a fresh lane | fixture | fixed `34f278f1` (+ `live-plan02-runtime` `8291dec6`) |
| R4 | `v27-36-quests`: the journal panel stayed open over the drawer tabs and its persisted open state shut it on run 2 | fixture | fixed `27eccdb1` |
| R5 | quest-rewards / agenda-effect expected world_info ledger rows; plan 36: world info is never ledgered | fixture | fixed `1499dc17` |
| R6 | character-life: OOC wait literal 0 could never hold; d-10: audit slice by count; c13: lastRollback cleared by the swipe's own re-commit (ef5394a2); d-01: scripted click into a closed Extensions drawer; plan06: generated beats wait for the player (T2-1) and the background job validated chain 2 first; s12d: the seal closes the scene first (unmocked scene summary); persona-change: name1 vs a fresh lane's default persona | fixture | fixed `39d0c593`, `c35c8c30`, `961640bc`, `716cea8b`, `3a07c279`, `a22f44d8` (s12d), `18f9e3fe` -> `7643c028` |
| R7 | `so-assets remove` called `getCharacters()` with nothing deleted, which in a group chat moved the page to the stale `this_chid`'s solo chat (player-setup cleanup escape) | harness | fixed `7d96c46e` |
| R8 | plan07-memory green then red | harness (= F11) | fixed, green ×2 on one install |
| R9 | `solo_chat`: the group's debounced save ran after `/go` and posted the group's integrity slug under the solo chat (400), the integrity wait then timed out `/newchat` on every second run, the solo chat went unrecorded and the lane wedged | harness | fixed `e344fc32` + `3020ed7e` (save settled before `/go`, return target recorded first, a late `/go` error no longer aborts) |
| R10 | Closing a left-open breaker pumped the held jobs, whose failures re-opened it for the next row (s12d red only behind `v27-ooc-read`) | harness | fixed `0dc5bcc8` (close after the run's chats are gone, re-check until it stays closed) |
| R11 | d-10 read the HUD chip a render before it updated | fixture | fixed `0eb3699e` |
| F15 | 17 D rows have no runner | plan | open, except 16-07-A6 (runner added) |
| — | `v27-card-rollback` needs group "SOIMG Test cast", not on this install | — | not runnable (unchanged) |

**Evidence.** `node scripts/debug/so-evidence.mts archive --label b0-live-r2-2026-10-07 --lanes 1,2 --since
2026-10-07T23:20:00Z` (no `--allow-incomplete`): 3,502 files, 618 MB, `problems: []`, `verify` ok; `local/` adds the seed,
check, badge, per-row, corpus and gates logs and the superseded first corpus batch. `npm run sessions:archive` not run.

**What remains.** F15 (16 D rows without a runner), B0-base and every frozen-candidate row (not runnable before the
freeze), the 14 model rows deferred to B1, `v27-card-rollback` (not runnable here). Storybook did not run (worktree), so
the F8 story guard is unexercised until the main-checkout gates.

**Gates** (worktree, Storybook skipped: the runner finds no stories from a worktree).
`ST_ROOT=C:/dev/SillyTavern-MainBranch npm run gates -- --no-storybook` on `0eb3699e`: all green in 81.5 s (typecheck,
typecheck:test, debug:typecheck, lint, build, test 600 suites / 6,970 passed / 1 skipped, test:debug 1,203 / 1,203, test:release
128 / 114 pass / 14 skipped, test:plugin 114 / 111 pass / 3 skipped, test:replay 32 of 32 killed); test-storybook:ci SKIPPED.
Manifest evidence slots of the rows above now name this round's archive (`phaseCManifest.test.mjs` green). Lanes 1 and 2 stopped;
ST serves master's staged build again (`5f3e9ee6`, bundle `09556eb3…`).

**Blocks B1.** Nothing from the no-model side: every row round 1 left red is green ×2 or fixed by design (F9), and the
fixes are on this branch, unmerged. Merging needs the owner, then a restage, then B1 starts on that build.

## B1 record, attempt 2 (2026-10-08, branch `v2.7-39-b1b-fixes`, RunPod)

Pre-freeze stage B1 (rule 1: not Phase C evidence). Served build: the staged slot, bundle `dba22d29a860…` (`dist/manifest.json` and
the ST slot verified, never restaged). Harness ran from the side-branch worktree `C:\dev\so-b1b` (master `ff4025d9` + the commits
below). Evidence (private): `so-sessions:evidence/phase-c/b1b-2026-10-08/` (1,713 files, plus `local/`: run notes, drivers, empties
table, superseded runs). Adolion rows report counts only (rule 7).

**Hardware and cost.** Three RTX PRO 4500 Blackwell pods (Secure, EU-RO-1, $0.72/h, CUDA 13.0, network volume `x9gi6f1rig` mounted
on all three at once, 22/tcp only, SSH tunnels 18081–18083, `so-pod up` per pod): pod 1 `bkpbz5eed8fnah` and pod 2
`mstr665uv64phw` 07:36–13:30Z (~5.9 h each), pod 3 `ez6ipgmi7dpcyh` 12:13–13:30Z (~1.3 h, owner-approved third pod). llama b11046,
`LLM_PARALLEL=2`, ctx 196,608, KV q8_0, `--kv-unified --log-timestamps --log-prefix --cache-ram 16384 --ctx-checkpoints 32
--checkpoint-min-step 1024` (pods 1/2: llama-server restarted in the pod to add `-cms`, never `update-pod`; their in-pod watchdogs
were replaced in place to move the 12 h cap, no container restart). All three released (`so-pod release`; pod 2 needed a second
full pull, H10) and **terminated**; teardown-check ok ×3. Cost ≈ 13.1 pod-h ≈ **$9.4** for this attempt (billed $11.09 for the day
at 13:35Z with billing lag; ≈ $13.3 expected including attempt 1's $3.84), under the $29 stop.

Per-stream speed (llama `predicted_per_second`, before 12:55Z): pod 1 p50 **21.4** tok/s (two SP6 lanes, prompt p50 14.9K / p95
26.8K), pod 2 p50 28.5 (prompt p95 34.3K), pod 3 p50 30.1 (one lane). Pod 1 sat under 39a's 25 tok/s floor with two long SP6
chats. Prompt-cache reuse stayed ~0 with the cache flags (`promptEvalTokens` = `promptTokens` on 932 of 1,035 pod-1/2 requests):
the P2 gotcha is a prompt-structure fact, and `--cache-ram`/`--ctx-checkpoints`/`-cms 1024` do not change it.

**Deviations (owner, 2026-10-08, via main).** (1) 35-K3's `samePod` relaxed to "same pod type + same llama build and flags": each
K3 cell (judge on/off × release/control) runs ×2 consecutively on ONE lane, with cells on lanes of different pods (lane + pod
recorded per run, for a pod-effect check); applies to 39a §Slicing S4 for this B1 only. (2) `SO_SWIPE_EMPTY_REPLY=1`: an expected
reply whose visible text is empty is logged (EMPTY-REPLY) and swiped, as a player would, up to 4 times; each swipe is counted.

**Rows** (manifest B1 + the model scenarios B0-live deferred).

| B1 item | Result ×2 | Detail |
|---|---|---|
| B1-PAR | done in attempt 1 | not re-run |
| 35-K2 | **GREEN ×2** | `live-v25-09-sp6-k2`, lane 4 |
| 35-K3 | **INCOMPLETE** | no valid run. Before the flags, runs died on empty-visible replies (5 runs) and one 300 s turn timeout; the flagged restarts ran into the DeepSeek outage (F-B1b-2) and were stopped at 13:25Z. Lanes 4/6's control runs "finished" 98/98 but 75 of 98 turns were no-ops after the outage (and only 11 release points, < 20): invalid |
| 35-K4, 35-K5 | **INCOMPLETE** | scored from 35-K3's runs |
| B1-C3, B1-C12 | **INCOMPLETE** | run 1 (all before the outage, 08:19–10:13Z) ended at turn 69 on an empty reply; scored for context only: warden 114 calls, 7 timeouts (> 1 per 50; causes queue 3, provider 1, unattributed 3; provider p50 1,231 ms / p95 2,752 ms); lore-select requests per loud turn p50 7, p95 14, max 15. Its flagged restart was stopped by the outage |
| 36-Q1-M1 | **red** (PASS, FAIL) | run 1 PASS, `QUEST_SCOPE_CAP` = 5; run 2 FAIL (arm 5 facts drop 0.0667); arms 10/20 fail tokens (+15.7 %, +31 % > 15 %) |
| 36-Q1-M2 | **FAIL ×2** | recall 0.4615 (6 of 13) < 0.80; false latches 0/20 (run 1 in attempt 1) |
| 37-M1 | **FAIL ×2** | direction arm (a) 0.70 / 0.75, (b) 0.90 / 0.95, (c) 0.70 / 0.80; stuck (a) 0.375 / 0.31; anchoring gap 0.20 > 0.05; no default path decided |
| 37-M2 | **PASS ×2** | `REL_AXES_PER_READ` = 4 (8 axes: +14.4 % tokens > 12 %); life block p95/max 129 tokens |
| S-17 | **FAIL ×2** | tokens +17.1 % (> 15 % / 12 %); latency, block (129) and quest fairness ok; needed `--values` (private) seeding 3 active quests |
| 37-S17 | **FAIL ×2** | as S-17, plus relationship pair fairness fails |
| 37-L3 | **PASS ×2** | in-goal 20/20, narrated 0, unreached 0 (after H4); caveat: the 20-case fixture has no out-of-goal or narrating case, so the labeller has no negative control |
| 37-L6-C | FAIL ×2 (attempt 1) | not re-run |
| B1-R4 | not runnable | placeholders (rating pairs, rater) |
| 35-M2 | not runnable | no driver |
| 35-M1 | not run | offline evidence walk, no script |
| deferred model scenarios | **GREEN ×2** (10) | `v24-acc-A-reload-blocks` (+ `-control`), `plan03a-llm-npc-reply`, `v24-pf-AE04-scene-refused`, `v24-acc-I3`, `v27-33-v3-postprocessor`, `v24-pf-AE04-lore-cancel`, `v24-pf-curator-same-chat`, `v24-pf-curator-switch`, `plan08-hygiene` (after the fixture fixes) |
| deferred, not runnable | — | `v27-c6-test-cast`, `v27-card-art-base`, `v27-existing-expression-reference` (ComfyUI + SOIMG cast), `v27-local-card-reply` (SOIMG group, local route) |

**Empty-visible replies** (owner ask; the player-facing problem to fix next). 16 replies over 14 turns had empty visible text: the
whole output was inside the thought block and ST shows a finished, empty message. 4 came before the flag (each failed a 98-turn
run; evidence lost with the chat), 11 were logged with the flag, and one second swipe came back empty again and failed the run
(Belle, 12:24Z). Every flagged one ran with reply thinking "medium" (install-wide) applied: 787–1,667 reasoning chars, 205–387
predicted tokens (under the 400-token budget, so the model closed the turn itself), prompts 19K–28K tokens. Only the two long chats
hit them (lane 2 K3 off-release: 6; lane 3 C3: 5) once their prompts passed ~19K tokens; lanes on early turns had none. One swipe
recovered 9 of the 11 flagged. Table: `local/empties.md` and `local/empties.js`.

**Findings.**

| # | Finding | Bucket | Status |
|---|---|---|---|
| F-B1b-1 | Empty-visible replies (above), rising with chat length; a player sees an empty message and has to swipe | product, player-facing | open (next fix) |
| F-B1b-2 | DeepSeek account out of credit at ~12:55Z (`402 Insufficient Balance` on every lane): every CL role failed over to the pod "Memory RunPod" profile | external | owner tops up; rows after 12:55Z invalid |
| F-B1b-3 | During that outage the blocks-only "Before you start" pane (`#so-briefing`: "The story will not advance on its own until this is fixed", Close) reopened mid-session on a chat 45 messages in, over `#send_but`, and every send then hit the dialog. Lane 2, 13:21Z: `elementFromPoint` at the send button = `so-briefing`, `briefing.pending: true`, pipeline detail "Memory model unreachable, using Story Orchestrator Memory RunPod" | product, player-facing | fixed on `v2.7-setup-pane-midsession`: root cause `briefing.seen` never set when nothing was due at activation, plus a role outage counted as `blocks`; the pane now opens on its own only before the story's first committed reply, and a `not-answering`/`quota` role is the `degrades` check `model-role-outage`. Lane 9 repro (fake llama-server, read role 402s from turn 4): master pane over `#send_but` at boundary 10, sends stopped; fix x2 no pane, sends kept landing, HUD "check setup (1)", fresh-chat control pane opens and closes |
| F-B1b-4 | Pod 1 below the 25 tok/s floor with two long SP6 lanes (21.4 p50) | measurement | recorded; one long-chat lane per pod, or re-size |
| F-B1b-5 | Prompt-cache reuse ~0 with the cache flags | measurement | recorded (P2) |
| H1–H9 | harness: pod retarget echoes (H1 `9fb49f09`); journey closes a start dialog left open (H2 `eeb49c1f`); null-expected lab windows (H3 `0066c4c6`); labeller echoed its "yes or no" template (H4 `af500876`); generation state reads `dataset.generating` and an unfinished empty reply (H5 `e20559ee`, H5b in `1917c237`); batch reloads between repeats (H6 `050b1e20`, 10 s settle H6b `fd844b8f`); empty-reply swipe (H7 `1917c237`, limit H7b `8602918f`, default 4 H7c `748872c7`); send timeout floor (H8 `ca52148d`); a reply needs the chat to grow (H9 `e70b7671`, the 3 s no-op turns) | harness | fixed, each with a test |
| H-ev | row evidence check: a provider outage (401/402/403, Insufficient Balance) in the row's server-log slice makes the row INCOMPLETE (`4ce5f2da`) | harness | fixed, test |
| H10 | `so-pod` incremental log copy: same size, different sha (pod 2) | harness | open; a full `pull` repairs it |
| FX | fixtures: curator entries carry `{{// so:auto}}` (C13 tiers, `95879e4a`); `plan08-hygiene` requires judge off (memoryVerify drops unsupported seeds, `f6880cd7`) and asserts the duplicate is stored once (insert dedupe, `10c639bd`) | fixture | fixed |
| O | orchestration slips (mine): kills that matched their own command line, overlapping lane-1 relaunches; every affected run superseded, none counted | — | — |

No `src/` change on the branch.

**Evidence.** `node scripts/debug/so-evidence.mts check --lanes 1,2,3,4,5,6 --pods 1,2,3`: exit 0 (332 rows, 0 incomplete, 3 pods
released). `archive --label b1b-2026-10-08 --since 2026-10-08T07:25:00Z`: 1,713 files, 1.2 GB, `problems: []`. `npm run
sessions:archive` not run.

**What remains.** 35-K3/K4/K5 and B1-C3/C12 from scratch (needs DeepSeek credit; ~7–8 h on 3 pods, ~$15; one long-chat lane per pod,
or accept pod 1's rate; the flags and floors above on); 36-Q1-M1 re-decided by its owner (one PASS, one FAIL); the B2 decisions the
reds above feed (36 Q1 M2, 37 M1, S-17/37-S17 token growth); fixes for F-B1b-1 and F-B1b-3; the 35-M2 driver; B1-R4 pairs.

## B1 record, batch 3 (2026-10-08, branch `v2.7-39-b1c-fixes`, RunPod + local 3090)

Pre-freeze stage B1 (rule 1: not Phase C evidence). Served build: CANDIDATE master `2e9ae27b`, bundle `a52734d6326e…`, staged only into a
private ST code copy (`C:\dev\so-lanes\agent-st-b1c-cand`, data junctioned read-only to the real install for seeds); the real ST slot,
lane 0 and :8000 were never touched. Private copies were also built for PRE-EMPTY `57c9401f` (= `bf1e0c77^1`, bundle `cf8cf5847f75`)
and PRE-P3 `d33a75a8` (= `2e9ae27b^1`, differs only by P3, bundle `8a71ef276e84`); neither was used (their rows did not run). The next
round's candidate also carries master `43a16f4a` (lore select no longer delays the player's line). Evidence (private):
`so-sessions:evidence/phase-c/b1c-2026-10-08/` (1,834 files, 1.38 GB, plus `local/`: notes, drivers, run logs, superseded runs).
Adolion rows report counts only (rule 7).

**Scope as run (main, during the batch).** Planned: 35-K3/K4/K5 and B1-C3/C12 ×2, then B1-EMPTY, B1-NARR, B1-HIST, B1-PFX. DeepSeek
balance was $4.99 at the start; main moved every memory role to a dedicated Artemis memory pod. RTX PRO 4500 stock ran out in EU-RO-1
(pods 3/4 refused 15:41–15:51Z and 17:35Z). At 17:42Z the RunPod account balance turned out to be about $5 (the $35 was an approval,
not credit): clean shutdown at 18:00Z; then the owner topped up $15 and main cut the scope to **run 1 only** of the four K3 cells and
C3, and moved C3 to the local 3090 as a diagnostic. Every row below is a single-run read: **provisional for B2, no ×2 verdict**.

**Hardware and cost.** Pods (Secure, EU-RO-1, RTX PRO 4500, $0.72/h, volume `x9gi6f1rig`, 22/tcp only, `so-pod up` tunnels):
pod 1 `cewhps2kvv3rzj` 15:31–23:17Z and pod 2 `074pfv5qwoxtgf` 15:31–23:22Z (reply pods, `LLM_PARALLEL` 2, ctx 196,608), pod 5
`zvlobugbmesfz5` 15:52–23:22Z (memory pod, `LLM_PARALLEL` 4, ctx 98,304), pod 3 `p5pk5ong1gvldz` 17:06–18:04Z (C3, ended by the
balance shutdown). Flags as attempt 2 (`--kv-unified --log-timestamps --log-prefix --cache-ram 16384 --ctx-checkpoints 32
--checkpoint-min-step 1024`, q8_0, `LLM_DEBUG_LOG=1`); no llama restart, no `update-pod`. All four released (pull + teardown-check
ok) and **terminated**. ≈ 24.1 pod-h ≈ **$17.4** (billed $15.43 at 23:25Z with an hour of lag). The memory pod saturated (about 10
tok/s per stream, about 50 s per memory read) while the reply pods ran 25–31 tok/s mostly idle; it set the turn time.

**Rows.**

| B1 item | Run 1 (provisional) | Detail |
|---|---|---|
| 35-K3 | **PASS (run 1 only)** | agency flags: release judge-on 0 ≤ control mean 0 + 1. Releases: on/release 25, off/release 21, on/control 24, off/control **12** (< 20: the control arm's own size check failed). The journey check "the release arm carried the block on every release" read 15/25 and 18/21, a measurement artifact rather than a product red: the check reads only the turn's last payload capture, and a release inside a multi-voice chain carries the block on a mid-chain voice. off/release: exactly the 3 releases inside multi-voice chains (2, 2 and 4 boundaries in that turn) are the 3 not carried. on/release: 15 of 25 releases sat in multi-voice turns and 15 carried, at least the 10 single-voice ones, consistent with the artifact but not provable per release from the saved data. Recorded harness-INCOMPLETE; lab fix owed: a release counts as carried when ANY loud generation since the send held the block |
| 35-K4 | **PASS (run 1 only)** | 0 restatements in 46 measured release replies |
| 35-K5 | **INCOMPLETE** | pooled measured releases 7 (release) / 8 (control), below the ≥ 20 pooled denominator; as read: release 1/7 (14 %, floor ≥ 60 %), control 3/8 (37.5 %, floor ≤ 30 %) |
| B1-C3, B1-C12 | **INCOMPLETE** (owed to the next pod round) | pod run 1 killed at turn 30 by the balance shutdown. Local-variant diagnostic, not evidence (3090 controller `fast`, 32K, 1 slot; GGUF `Artemis-31B-v1m-Q4_K_M` 18,687,063,072 B vs the pod's v1.1 19,598,490,016 B; ST `max_context` 32768 vs 98304), 80 of 98 turns: warden 118 calls / **7 timeouts** (> 1 per 50; queue 1, unattributed 6; provider p50 1,086 / p95 2,454 ms), wardenLore 114 / 2 (≤ 1 per 50); C12 lore-select requests per loud turn p50 7, p95 16, max 18; 13 judge-plugin 429s 18:39–18:41Z |
| B1-EMPTY, B1-NARR | **NOT RUN** | balance and scope cut; saga driver built and dry-checked |
| B1-HIST, B1-PFX | **NOT RUN** | budget after adding the memory pod (main) |

Per-run turn data (98 turns each; `local/logs/agg-at-stop.jsonl` has the killed runs): on/release turn p50 75 s, p95 137 s; off/release
88 / 131 s; on/control 83 / 154 s; off/control 78 / 153 s. The product's empty-reply recovery fired 3, 3, 1 and 7 times; the harness
saw 2 empty replies left after it (off/control, swiped). Send-to-line latency (H15b, the two re-runs): p50 60 / 57 ms, p95 361 / 358 ms,
max 4,536 / 1,638 ms, every line taken; by turn decile (p50/p95 ms) on/release 32/40, 42/77, 39/46, 47/53, 61/75, 60/89, 63/460,
70/4536, 70/73, 81/361; off/control 30/37, 40/533, 43/49, 48/286, 50/1638, 57/272, 64/75, 74/363, 286/358, 79/1512 (rises with chat
length; feeds v2.8 01 H).

**Runs that do not count.** 15:43Z starts failed at import (a git-excluded story file was missing in the new worktree). At 16:30Z
off/release timed out on a 300 s `schedulerIdle` wait with the memory queue still working (H13); all four restarted. The 18:00Z
balance shutdown killed four K3 runs at turns 32–39 and C3 at 30. Two pre-H15 run-1s failed with SEND-NOT-POSTED at turns 64–66 (lane
4 at 20:15Z, lane 1 at 20:24Z): the line reached the chat after the idle window. Recorded INCOMPLETE (harness, pre-H15) and re-run with
H15/H15b.

**Findings.**

| # | Finding | Bucket | Status |
|---|---|---|---|
| F-B1c-1 | The player's line can reach the chat seconds after Send (up to 4.5 s measured on the pods, longer on the 1-slot 3090), growing with chat length | product, player-facing | master `43a16f4a` (lore select no longer delays the line); latency series above |
| F-B1c-2 | Warden judge timeouts above the floor again (7 in 118 on the 3090 diagnostic; 7 in 114 in attempt 2), mostly unattributed | product / judge plugin | open, for B1-C3 on a pod |
| F-B1c-3 | The SP6 "carried" check reads only the last capture of a turn | lab journey (harness) | fixed 2026-10-09 (§B2 record): any loud generation since the send counts; campaign `c5f513bf`, pin bumped |
| F-B1c-4 | A dedicated 4-slot memory pod for 4–5 SP6 lanes saturates and sets the turn time | measurement | 39a §Run plan default after B1 batch 3 |
| F-B1c-5 | K3 off/control had 12 release points (< 20), like attempt 2's 11 | measurement | B2 (35 owner): control-arm size |
| H11–H15b | harness: saga driver `so-b1-saga.mts` (H11 `d6432e89`); memory pod port through the lane firewall (H12 `f5f2dcb3`); `SO_WAIT_TIMEOUT_FLOOR_MS` floors a `schedulerIdle` wait (H13 `2492025e`); `st-lanes start --allow-local` reaches :18888, opt-in per start (H14 `df1fdd60`); a send waits up to 120 s for the host to take the line (H15 `f672de96`) and logs `SEND-TAKEN` (H15b `a20bc11f`) | harness | fixed, each with a test |
| O | orchestration slips (mine): the first seeds resolved the lanes root to `so-lanes/so-lanes` (ST_ROOT = the private copy, SO_LANES_ROOT unset; deleted, real lanes untouched); two `Stop-Process` patterns matched my own shells | — | nothing counted |

No `src/` change on the branch.

**Evidence.** `node scripts/debug/so-evidence.mts check --lanes 1,2,3,4,5,6,10 --pods 1,2,3,5`: exit 0 (332 rows, 0 incomplete, 4
pods released). `archive --label b1c-2026-10-08 --since 2026-10-08T15:20:00Z`: 1,834 files, 1.38 GB, `problems: []`. `npm run
sessions:archive` not run.

**What remains.** 35-K3/K4/K5 run 2 (and run 1 again under the fixed carried check) and B1-C3/C12 ×2 on a pod; B1-EMPTY, B1-NARR,
B1-HIST, B1-PFX; the next round follows 39a's new default (memory on each reply pod at `LLM_PARALLEL` 4, the 3090 for light rows,
the balance checked first).

## B2 record (2026-10-09, branch `v2.8-k3-s17`)

**S-17 / 37-S17 combined overflow priority: decided 2026-10-09 (owner: features on; priority per plan order).** Quests,
relationships and card pulls stay on. One read carries at most `SCOPE_EXTRA_BUDGET` = **5** keys beyond what its card pulls
alone would cost (`src/extraction/scopeBudget.ts`, pure; applied by `readScopeSources` in `scopeSources.ts`, used by the shared
read and the live-suite fixture runner). Slots are filled in the plans' order: gate, snapshot and built-in keys (free, never cut;
a sourced key that is also one of them costs nothing), active quest keys, the drafted member's axes and mood, other present
members' axes and moods, then card pulls with whatever is left. Size: the S-17 raw reads (run 1, 20 windows) cost about 57
prompt tokens per added scope key over a 2,761-token baseline mean, so 5 keys is about +10 %, inside 37 M2's +12 % and 36 M1's
+15 %; 6 would be about +12.4 %. Per-source caps stay (`QUEST_SCOPE_CAP` 5 ≤ the budget, so the budget never cuts a quest key the
quest source kept; `REL_AXES_PER_READ` unchanged at 8, its B2 value from 37-M2 is a separate record). Fairness: active quest keys
rotate inside the quest cap when more are active than it holds, and other members' axes rotate inside what is left, by the engine
boundary (`ScopeSourceContext.rotation`, so a rollback replays the same scope); the drafted member's own axes are not rotated. A
story with no quests and no relationships reads exactly what it read before. Gate: `scopeBudget.test.ts` (7-member cast, 4 active
quests, relationships and card pulls in one read; at most +5 keys over the baseline arm with a per-source-caps control that
overruns it; no active quest left out; 8 active quests rotate with every key read within 3 reads; others' axes within 3 reads).
Not re-measured: S-17 and 37-S17 stay FAIL until a CL re-run on this build; card pulls lose slots in a crowded read (the jest
fixture keeps 1 of 7), which the re-run should report.

**Addendum 2026-10-09 (v2.8 31 F3, branch `v2.8-small-fixes`).** Card pulls keep `CARD_MIN_SHARE` = **1** rotating slot, paid
right after the quest source and before the relationship tiers (`scopeSources.ts`), so the fixture's 7 card fields are each read
within 7 reads instead of `hair_m1` alone forever. It comes out of the same slots, so the budget (and the S-17 token cost) is
unchanged; it takes no slot from others' axes in the S-17 fixture (12 slots: 4 quests, 1 card, 2 drafted, 5 others). The author
overflow checks now read the budgeted scope (`scope.ts` `scopeOverflow`, with the read's own present/drafted/rotation), so a key
the budget left out is named, not only one a source cap cut. **`REL_AXES_PER_READ` stays 8.** 37-M2's 4 was measured with no shared
budget (8 axes alone +14.4 %); under the budget a read adds at most 5 keys whatever the cap (5 × ~57 tokens ≈ +10.3 % over the
2,761-token baseline, under 37 M2's +12 %), so the cap no longer sets the cost. At 4 the drafted member's three keys leave one slot
for everyone else's axes, and the 18 other pairs of the S-17 fixture wait far past the 3-read fairness bar (`scopeBudget.test.ts`
fails at 4: the order and others'-axes fairness cases). Still owed: the CL re-run of S-17 / 37-S17 on this build.

**F-B1c-3 (SP6 carried check) fixed.** The per-turn eval in both journeys (`test/journeys/spikes/sp6-complications.journey.json`
and the campaign lab journey, `adolion-campaign` `c5f513bf`, pinned in `adolion-fresh.pin.json`) read `captures[length - 1]`,
which is the OLDEST capture of the newest-first ring of 5, not the turn's last. It now takes every capture whose `messageId` is past
the previous turn's chat length, counts each held release boundary once (a release on a chain's last voice is carried by the next
turn's first voice and counted there), and reports `generations`, `holding` and `ringFull` per turn. Run 1 of 35-K3 is owed again
under the fixed check.

**F-B1c-5 (K3 control-arm size) is not a harness window.** Both arms derive release points the same way (`view.releases` over the
whole boundary log; logs held 139 to 156 boundaries, under the 200 cap, so the `spent` map never applied). The floor is reachable at
98 turns: on/release 25, off/release 21 and on/control 24 cleared it; the pool total is 29. Off/control's 12 came from five of its
ten segments (critical targets included) never holding two consecutive `escalate` boundaries: its quiet turns did not read quiet
enough. That is the measurement's variance, not a shorter window. No floor retuned; the 35 owner decides in B2 whether the
control-arm size stays a per-run INCOMPLETE condition. Note for that decision: the lab check simulates one boundary per turn, and
these runs had 1.4 to 1.6 (multi-voice turns), which moves every streak.
