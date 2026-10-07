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
   decide → implement, §Sequence): at freeze no cap, default path or dev → prod promotion is still open. Freeze = one
   commit + its prod and dev bundle hashes (`dist/manifest.json` `bundle.sha256`), recorded before C1, with
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
9. **Prod configuration** (finding 12). Rows marked `prod` run the prod build with shipped defaults
   (`withoutDevOnlySettings` applied, v2.7 29 §Release-build dev-only defaults; shipped chapter-seal settings). Lane
   runs on the dev build are labelled `dev-diagnostic` in the manifest. They prove plumbing and never close a `prod`
   row.
10. **Row manifest** (finding 13). `test/phase-c/manifest.json`, written in B0, before the freeze. Each row has: `id`,
    source plan, prerequisites, reset procedure, tier, build (`prod` | `dev-diagnostic`), assertion, floor (verbatim,
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
| B1 | measurements: 35 SP6 K2–K5 and M2 A/B (stub lab copy, v2.7 38); 36 Q1 M1 scope arms + M2 recall; 37 M1 read accuracy + M2 cost; S-17 combined scope budget; v2.8 01 rows B1-C3, B1-C12, B1-C13b, B1-R4 (§B1 rows from v2.8 01) | RP + CL | pod, ≤ 2 model lanes |
| B2 | decision record appended here: SP6 verdict, M2 verdict, `QUEST_SCOPE_CAP`, `REL_AXES_PER_READ`, combined overflow priority, 37 default read path, each dev flag's fate (prod default / off / removed); the branch each verdict takes (§Stage B branches) | — | — |
| B3 | build the B2 branch: 35 Phases 3–4 + encounter pool, or the drop path; 36 `clock` or its removal; 37 caps; promotions final; main-entry bundle and ratchet budgets checked (C1b) | D | worktrees, `npm run gates` |
| C0 | freeze; `so-run-header capture` baseline; payload goldens on the candidate: `node scripts/debug/so-payload-golden.mts capture --label c0 --out test/measurements/v2.7/payload/c0` (cases `test/scenarios/payload/*.json`, no model call), plus the feature contracts and off-path captures (§Payload contracts) | D | lane 1 |
| C1 | `npm run gates` (full, Storybook, main checkout) ×2; `npm run test:release` on prod | D | local |
| C1b | ratchet + budget compare against the fixed predecessor (finding 21): each `test/findings/codeHealth.json` list ⊆ the predecessor's list, each budget ≤ the predecessor's (coordinator **560**, manager 700, file 600), the guard constants equal the file; main entry ≤ 1,250,000 B, with each 35–37 production path's main-entry cost recorded in B3 (1,217,068 B at `1910441b`, 32,932 B headroom; lazy chunk unless parse or the reply path needs it) | D | local |
| C2 | mocked scenario corpus ×2; every plan's live (D) row ×2 (v2.7 16 §Per plan + rows of 29–38); rendered-target checks (finding 20): on the prod build every Help "Show me" target and every "?"/Repair/Studio guide link resolves to a visible control or a rendered guide heading, and the Studio guide link opens the reader while `#so-studio-modal` is open | D | no-model lanes 1–4 in parallel |
| C3 | payload preservation vs the predecessor goldens and repeatability vs C0 (§Payload contracts): `so-payload-golden.mts capture --label c3 --out test/measurements/v2.7/payload/c3`, then `diff test/measurements/v2.7/payload/base test/measurements/v2.7/payload/c3 --declared test/measurements/v2.7/payload/declared.json` and `diff …/c0 …/c3` (exit 1 on an undeclared or stale diff); feature contracts off/on; negative controls | D | no-model lane |
| C4 | journeys J0–J14 `--strict` ×2; J6 again with plan 33 W1 on (V8) | D + RP | model lanes ≤ 2 |
| C5 | real-model acceptance rows per plan: 02 (O3–O8, O13, O13b, O14, C14-b, C4-R6, C4-J8), 03 (O16), 07 (O15), 08–10 (O9–O11), 33 W1–W4 (+ the W2 over-steer session card; W1 V7-live, below), 34, 35 (B1's measurements re-run on the candidate, then Phase 3/4 rows of the B2 branch), 36, 37 (M1, M3), S-15 – S-19, 32 W8 S32-1 ×2, 32 W6 streamed-reply row | RP + CL | pod |
| C6 | image rows: 32's route A/B, S32-2, multi-character sprite rows; 38's asset checks | LI + CL | local ComfyUI, isolated lane |
| C7 | Adolion integration ×2 on `adolion-fresh` (38): every story starts, plays N turns, reopen, rollback, chapter; character-life exercise on the 7-member act (38 §C7) | RP | pod |
| C8 | live smoke on a clean install: v2.7 16 §Live smoke procedure (5 turns, DeepSeek CC, no pod; plumbing only, not acceptance), all features on as shipped | CL | fresh lane |
| C8b | stranger install, guide only (finding 13): prod build, clean settings (empty extension settings, no optional GPU broker, no Adolion assets); follow the installed guide alone to the first real rendered reply in a group story; record each step the guide did not cover | CL | fresh lane, prod |
| C9 | user sessions (optional): play from the guide only; flags filed | human | user's choice |
| Z | close-out: settings reference + README table regenerated from the registry (owner v2.7 29), guide vs UI, What's new 2.7, every gate record final, v2.8 carry-over rewritten; write `docs/release/2.7.0/attestation.json`, THEN `npm run build && SO_ACCEPTANCE=1 npm run test:release` on the candidate: attestation present, its candidate commit = the frozen commit, `bundle.served.sha256` = build = attested (finding 3) | D | — |

C5 order follows dependencies: 33 W2 (agency → auto) before any warden row; 34 persona before 36/37 rows that read
it. 35's measurements already ran in B1; C5 re-runs them on the candidate as acceptance.

### Stage B branches (finding 1)

| B2 verdict | 35 | 36 | 37 | 39 rows |
|---|---|---|---|---|
| SP6 PASS, M2 PASS | Phase 3 + Phase 4 + encounter pool built | `clock` widget reads the release model | an agenda may surface pressure only through an authored pool line (35's enum) | Phase 3 K2 prod ×2; Phase 4 M2 with pressure; K3/K4 over pressure releases; encounter generation golden + contract-drop |
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
| 37-L3 meanwhile proposals | `test/fixtures/meanwhile-proposals.cases.json` (20 cases, floors frozen), offline replay through `globalThis.storyOrchestratorAgendaProposals.propose()` on the CL route, labels by a second model | in-goal ≥ 0.85, 0 narrated player actions, 0 unreached references in the spoiler subset, ×2; below the floor the coordinator stays dev-only | CL (B1/C5) |
| 37-L6-C voice warden | `test/fixtures/judge/spike-voice.json` (floors frozen, **rows not collected**: 20 lab-copy replies owed by v2.7 38) | OOC recall ≥ 0.80, false-note rate ≤ 0.10, 0 rewrite or player-narration notes, fallback ≤ 1 of 20, ×2; below the floor `wardenVoice` stays dev-only | CL (B1) |
| 37-S19 story clock | S-19 with `clock` declared | `time_of_day` moves one step per boundary (code clamp), `story_day` only on a wrap; Continue/swipe/reopen ≡ continuous run; an OOC line ticks no agenda. Not built: an authored checkpoint `set` effect for the clock (no such effect exists) | D + RP |
| 37-M3 player value | as row 37 M3 above | required exercise per run: ≥ 1 axis moved by a read, ≥ 1 agenda step, ≥ 1 schedule drop, ≥ 1 mood re-read | RP + CL (C5) |
| 37-B3 bundle | `npm run build` | main entry 1,171,979 B at the 37 commit (+8,479 B over `fd6529b1`'s 1,163,500 B): validator hook, scope source, private-block lines, talk filter, rating-guard step rule, check and feature copy, warden voice family; the validator, derive, presence and line logic ride the lazy game-layer chunk; the proposal coordinator and its prompt are dev-only | D |

Floors tightened before any run (finding 18): 32 W1 route A minimum render count; 35 M2 window and denominator; 36 Q3
positive narration assertion; 37 M3 behavioural threshold; 38 C7 character-life exercise. The numbers live in those
plans.

### B1 rows from v2.8 01 (split, owner 2026-10-07)

Measurement only, no code. Each is a manifest row (rule 10), ×2 with the rule 11 reset, on the B1 build, same pod as
B1. A result below a floor is recorded as a failed row (finding id, owner v2.8 01, the user's decision; rule 8), never
re-run until green; the fix is built in v2.8 01. Evidence: public summary at `test/phase-c/records/<id>/run-{1,2}.json`,
raw requests and replies in private `so-sessions` (rule 6). Campaign rows report counts only (rule 7).

| Id | Source | Prerequisites | Floor / what is recorded | Tier | Build |
|---|---|---|---|---|---|
| B1-C3 warden + lore-check timeout causes | v2.8 01 §B C3 | TypeSafe key; `wardenEnabled` + `judge.uses.wardenLore` on; adolion-fresh lane playing a lore story with real replies; ≥ 100 warden and ≥ 100 lore-check calls per run; plugin `/status` (`adaptive`, lanes) sampled per call | formal `so-judge timeouts` per run; floor 1 timeout in 50 per use, never retuned (v2.8 01 C3; J2 bar). Recorded per timed-out call: client wait vs the 4000 ms budget, plugin queue wait (lane / account hold, `Retry-After`), provider latency; each timeout attributed to one cause, else counted `unattributed`. Also records R4 latency with `wardenLore` on (v2.6 04 §L7) | CL (judge) + RP (replies) | dev-diagnostic |
| B1-C12 lore-select requests per turn | v2.8 01 §B C12 | same runs as B1-C3 (`lore_select` stories, `judge.uses.loreSelect` on) | count only, no floor: lore-select judge requests per loud turn (p50, p95, max) from `extras.judge.calls`; the "before" number for v2.8 01's batching | CL | dev-diagnostic |
| B1-C13b SP8 digest arm | v2.8 01 §B C13-b | the SP8 digest arm as measured in v2.6 03 (lab path, no product prompt change; the shipped curator prompt stays byte-identical per v2.7 02 C13); curator profile; the lane's campaign world book as padding. Enters the manifest only if the arm runs on the B0 build without code; otherwise B0 records its absence and the row stays in v2.8 01 | `v2.6/03-sp8-restated.md` W4 (b), verbatim: "every role-calibration floor met (validity ≥ 0.9, opShape ≥ 0.85, decision ≥ 0.7) in **both** runs"; ratio ≤ 0.40 (W4 (a)) recorded beside. A PASS lets v2.8 01 build the digest; 2.7 ships none | CL (curator) | dev-diagnostic |
| B1-R4 checkpoint thinking level pairs | v2.8 01 §E (data only) | llama.cpp thinking setup on the pod; dev build with `spikes.reasoningEffect`; 20 climax turns across 2 stories (4 pairs exist, `test/sessions/rating-pack/R4/`) | 16 more blind pairs, arm checkpoint `high` vs control install `medium`; rated blind by Astra (delegated; v2.7 08 decision 6, never the user); recorded: preference share (floor ≥ 60 %) and p95 latency vs control (floor ≤ 2×), `v2.8/01` §E R4 unchanged. The gate lift and Studio control stay in v2.8 01 | RP | dev-diagnostic |

C4's live checks (v2.8 01 §B C4: the separate warden-lore arm, built in v2.6, no code owed) run in C5 as acceptance:
**C4-R6** over-steer after a lore note (v2.5 08 R6 rubric) and **C4-J8** G-L7 J8 on/off, ×2 each, CL + RP, `prod`.
**R4-live** (from v2.8 01 §E "Also owed"): the shipped install-wide reply thinking budget, off/low/medium/high × n ≥ 3
group turns, memory requests carry no budget key, one Chat Completion arm (`v2.6/05-reasoning-control.md` §Live), ×2, RP,
`prod`, ≈0.5 lane-hour. C4's R4 latency leg is recorded in B1-C3. 39 C5 already names C14-b (an acceptance row, not a measurement), so it is
not repeated here. v2.8 01 §A (O-rows) is C5; v2.8 01 §C (option A) is v2.7 33 W1.

### Rows for Sol findings 4–10 (code fixes on `v2.7-fix-sol-review`)

The live and real-model counterparts of the deterministic pins that branch added (jest names cited). Each is a
manifest row (rule 10), run ×2 with the rule 11 reset; the persona rows also restore the persona lock and the default
persona between runs.

| Row | Finding | Setup | Assertion | Tier |
|---|---|---|---|---|
| S-04 refused lock + reload | 4 | a `player` story bound to a fresh group chat with a scripted `new_chat_only` opener; ST's chat lock made to refuse once (in-page wrapper on `setPersonaLockState` that leaves `chat_metadata.persona` unset); pick a persona; reload the page (`st-session.mts reload`); then "Try again"; second pass: refuse again, then "Start without keeping it" | before success or the explicit continue: no opener, `[data-so="player-setup-lock-failed"]` shown, `persona-lock` (blocks) in `#so-setup` and the HUD count, the blob holds `playerSetup {pending: true, lockFailed}` and still does after the reload; Try again: `chat_metadata.persona` is the picked avatar and the opener posts exactly once; continue: opener once, record `locked: false`, journal line "continued without the chat lock" (jest: `playerSetupActivation.test.ts` "Sol finding 4") | D (no-model, `prod`) |
| S-05 chat switch during a persona write | 5 | two bound group chats A and B; on A, delay `loadPersonasModule` and the persona switch in-page, and open B (`st-navigation.mts open-group`) inside the delay | B's `chat_metadata.persona` (read back from the server's chat file) unchanged; no opener in A or B; A's record still pending; `setPersonaLockState` never called while B is open (jest: `personaWrites.test.ts`, `personaHostLive.test.ts`, `playerSetupActivation.test.ts` "Sol finding 5") | D (no-model, `dev-diagnostic`: needs the in-page delay) |
| S-06 persona placement None | 6 | a persona whose description carries the story's canonical role line; Persona Management placement set to None, then In prompt, then the line deleted from the description | `st-payload.mts` capture of the loud request: placement None → the `playerRole` block present exactly once; In prompt with the line → absent and the description carries it; line deleted → the block back on the next request; one real request at each step agrees with the dry run (jest: `playerRoleHost.test.ts` "placement None", `personas.test.ts`) | D (dry run) + RP (one request per step) |
| S-07 suggestions with unnamed checkpoints | 7 | a story whose authored start and a generated beat (expansion on) have no `player_name`; play into the generated beat; ask for suggestions from the presence UI | the captured `pass: "suggestions"` request and the shown suggestions hold no checkpoint `name` or id; the request's scene list skips unnamed scenes and the current scene reads "Current scene", same as the drawer (jest: `playerProjection.test.ts` "a checkpoint without player_name") | CL (`prod`) |
| S-08 held-secret suggestions | 8 | a group with knowledge tracking on; a member's `[hiding]` row (synthetic, planted through the transcript); canon regenerated so the story-so-far prose restates it in other words; ask for suggestions | the suggestion request restates no held secret (the `heldSecrets` word rule over the request text), the rest of the prose is present; negative control: the same chat with the `[hiding]` row retired carries the paraphrase; member requests unchanged (jest: `suggestionsHost.test.ts` "Sol finding 8", `secretMirrorRecall.review.test.ts`) | CL (`prod`) |
| S-09 open-stretch side exit refused | 9 | import a story whose open stretch has a second exit gated on `player_turns_in_checkpoint`, and one on an always-true gate; then import every shipped story with a stretch | both side-exit stories are refused at import, naming the transition ("ends only through arrive_when"), and the Studio diagnostics name it on edit; every shipped stretch story imports clean (counts only for Adolion, rule 7) (jest: `openStretch.review.test.ts` "refuses every exit but arrive_when") | D (no-model, `prod`) |
| S-10 swipe window | 10 | a `lore_select` story with the judge on; a reply whose text names a lore entry the chat has not otherwise mentioned; swipe it | the lore-select request and any scene read taken during the swipe equal those captured for the same chat with that reply deleted (rule 12 compare); the discarded reply's text appears in no judge or memory-model request of the swipe; the new swipe, once landed, is in the next read (jest: `settledWindow.test.ts`, `loreSelect.test.ts` "Sol finding 10") | CL + RP |
| S-11 held-secret canon | 8 (follow-up, `v2.7-fix-canon-secrets`) | a group with knowledge tracking on; a member's `[hiding]` row plus a second member's `[knows]` echo (synthetic, planted through the transcript); a fact row and a resolved arc summary that restate it in other words; regenerate the canon (`storyOrchestratorRuntime.regenerateCanon(true)`); put `{{story_canon}}` in the narrator's card; turn chapters' `storySoFar` on; draft the kept-out member and the narrator | the captured `pass: "canon"` request restates no held secret (the `heldSecrets` word rule) and keeps the plain facts; the stored canon, the drawer Overview "The story so far", `/story recap` and the away recap restate none; the kept-out member's request and the resting (`/impersonate`) request carry neither the secret in `{{story_canon}}` nor in the story-so-far block; then retire the `[hiding]` row: the next canon request carries the paraphrase again (negative control), and a chat with no held secret sends a canon request byte-identical to the pre-fix build (jest: `secretCanon.review.test.ts`) | CL (`prod`) |
| S-12 held-secret chapters, threads and other shared text | 8 (follow-up, `v2.7-fix-shared-secrets`) | S-11's setup, plus a fact, a scene summary, an open arc and a ledger row that restate the secret; chapters on (`seal`, `storySoFar`, `recap`, small `chronicleTokens` so eras merge); put `{{story_so_far}}` and `{{story_previously}}` in the narrator's card; seal a chapter (`/cp seal`), then the final one; play past the seal so the bridge note rides one generation; open the inline timeline at level 1–2; let a pre-generation and a curator pass run | the captured `pass: "chapterSeal"` record, era-merge and saga requests restate no held secret and keep the plain facts; the stored record, era and saga restate none on read either: the story-so-far block (chronicle, `[Open threads]`), `{{story_previously}}`, the "Previously…" popup, the bridge note, `/story chapter`, `/story chapters`, `/story chronicle`, the drawer Overview (Recently, Open threads, Your story, The End) and the threads widget lanes; a returning dossier keeps the secret only for a member who holds it; inline L1/L2 fact and thread chips restate none; the expansion request's facts, the curator's open threads and the warden's facts restate none; retire the `[hiding]` row: the next seal request carries the paraphrase again (negative control); a chat with no held secret sends seal/era/saga/expansion/curator requests byte-identical to the pre-fix build (jest: `secretShared.review.test.ts`, `inlineTimeline.test.ts` "held secrets") | CL (`prod`) |
| S-13 held-secret Memory tab (owner decision 2026-10-07, `v2.7-owner-decisions`, not run) | S-11's setup with fact rows that state the secret, paraphrase it, and mix it with a plain sentence, plus a plain row; open the drawer Memory tab in player mode, then Author view; pin, edit and exclude the trimmed row; retire the `[hiding]` row | player mode shows neither the secret nor its paraphrase, the mixed row trimmed to its plain sentence under its own id, and no count, gap or marker (the tab reads as a chat that never held the secret, `assert-player-clean`); pin/exclude act on the stored row and an edit keeps the withheld sentence in the store; Author view lists every row whole; after retiring the secret the rows show again (negative control) (jest: `secretMemoryTab.review.test.ts`, Storybook `PlayerMemoryHidesAHeldSecret`) | D + CL (`prod`) |

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
| B1 measurements (35 Phase 1 + M2 ≈ 7–9, 36 M1/M2 ≈ 2; 37 M1/M2 and S-17 are CL) | ~9–11 |
| B1 rows from v2.8 01 (B1-C3 + B1-C12 shared play ≈ 2, B1-R4 16 pairs ≈ 2; B1-C13b is CL) | ~4 |
| C4 journeys ×2 | ~6 |
| C5 rows (35 Phase 1 3–5 + M2 ≈4, 32 S32-1 ≈2 + W6 ≈0.5, 33 incl. over-steer ≈4, 34, 36/37 floors, 37 M3, S-19, 02/08–10 O-rows; C4-R6 + C4-J8 ≈ 1.5) | ~20.5–22.5 |
| C7 Adolion ×2 | ~6 |
| C8 smoke, C8b stranger install | 0 (DeepSeek) |
| **Total** | **~45.5–49.5 lane-hours ≈ 24–27 pod-hours** (two lanes share one pod; RTX PRO 4500 ≈ $0.72/h → ≈ $17–19.5; at most the approved ≈ 27 pod-hours / ≈ $20 with a 150% stop; was ~40–44 ≈ 21–24 before the v2.8 01 split added ≈ 5.5 lane-hours) |

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
| 12 | `prod` vs `dev-diagnostic` rows; shipped seal settings | Rule 9 |
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
| after writing | `candidate.commit` is a full hash; `served.sha256` = attested bundle; `dist/manifest.json` is prod, describes `dist/index.js`, bundle = attested, `source.sha256` = attested source; the build commit is the candidate, or descends from it with no change under `src/`, `webpack.config.js`, `postcss.config.js`, `tsconfig.json`, `package.json`, `manifest.json` | same |

Consequence: once Z writes `docs/release/2.7.0/attestation.json`, any later build still at 2.7.0 fails `test:release`
(drift) until the version moves; the next development version bump is the first commit after the release.

**Row manifest** `test/phase-c/manifest.json`: 193 rows, checked by `scripts/release/phaseCManifest.test.mjs` (part of
`npm run test:release`, so of `npm run gates`): every field present, ids unique, stage / tier / build / reset known,
two evidence slots (`null` until a record path lands), floors that can fail (an "or refuse", "or skipped", "≥ 0",
"≤ 100 %", "where possible" floor is refused, finding 18), and parity with this plan both ways: every first cell of a
`Row` / `Id` / `Contract` table here and every O-, S-, S32-, B1-, C4-R6/J8, C14-b and R4-live id mentioned (ranges
expanded) is a manifest row, a row label or a listed absence, and every manifest row is named in §Row manifest index.
Planted controls for each in the same file.

| Stage | Rows | Tiers (rows per tier; a row can carry two) | prod / dev-diagnostic |
|---|---|---|---|
| B0 | 1 | D 1 | 0 / 1 |
| B1 | 17 | CL 12, RP 7, D 1 | 0 / 17 |
| C0 | 2 | D 2 | 1 / 1 |
| C1 | 3 | D 3 | 3 / 0 |
| C1b | 2 | D 2 | 2 / 0 |
| C2 | 51 | D 51 | 15 / 36 |
| C3 | 10 | D 10 | 0 / 10 |
| C4 | 16 | D 16, RP 15 | 0 / 16 |
| C5 | 61 | CL 36, RP 33, D 10, LI 4 | 48 / 13 |
| C6 | 22 | LI 19, CL 6, RP 3, LT 2 | 22 / 0 |
| C7 | 4 | RP 3, D 1 | 4 / 0 |
| C8, C8b | 2 | CL 2 | 2 / 0 |
| Z | 2 | D 2 | 2 / 0 |
| **Total** | **193** | D 99, RP 61, CL 56, LI 23, LT 2 | 99 / 94 |

Conventions. A floor is the plan's text verbatim with a citation; `pass/fail: the assertion holds in both runs` where
the source states a condition and no number; `record only` for counts (B1-C12, 35-M1). A `gap` field marks a row whose
floor is not declared yet: C14-b (owner v2.7 02) and 16-19-S28 (S28 floors to copy from v2.7 19/24, owner v2.7 32);
neither can be green until it is filled. Rows that only one B2 branch builds carry `branch` (35-K3/K4/K5-C5, 35-P3-K2,
35-P4-*, 35-ENC: SP6 PASS; 35-DROP: SP6 FAIL or INCOMPLETE); B2 deletes the rows of the branches not taken, each with
a record line (rule 10). Rows from 16 §Per plan and plans 29–38 take ids `<plan>-<item>`; their jest-only gates run
inside C1-gates. `prod` vs `dev-diagnostic` follows the source where it says so; otherwise a row driven through the
scenario or journey runners is `dev-diagnostic` (they refuse a prod page), a gate, UI drive or acceptance row is `prod`.
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
run against it. Lanes share ST's one extension slot, so no other lane may be serving while the predecessor is staged.

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
npm run build:dev && npm run stage -- --flavor dev
node scripts/debug/st-lanes.mts run 1 -- scripts/debug/st-session.mts reload
git worktree remove C:/dev/so-pred-4238ec2f
```

Check before trusting it: `base/index.json` names a served bundle sha256 equal to
`C:/dev/so-pred-4238ec2f/dist-dev/manifest.json` `bundle.sha256`; the two base captures diff clean with no
declarations; no `capture-failed.json`. Risk: the capture probe is newer than the predecessor's runtime (the tool came
in at `7ddcb292`, after the cut). If a case fails on a missing handle, that is a B0 blocker for 39, never a reason to
move the cut. Record the commit, both hashes and the run headers in `test/measurements/v2.7/payload/base/`.

**Stage B tooling readiness** (checked on disk 2026-10-07; nothing built here):

| B1 measurement | Exists | Missing (B0 blocker, owner) |
|---|---|---|
| 35 SP6 K2–K5 | scorer `scripts/debug/lib/sp6Score.mts` (+ `so-sp6-score.mts`, `sp6Score.test.mts`, K5 pooling); K2 `test/scenarios/live-v25-09-sp6-k2.json`; campaign `lab/complications/sp6-adolion.journey.json`, `sp6-k4-lines.json`, `sp6-k5-stalled.json`; `scripts/check_lab.py` | — (ready; `check_lab.py` green is its prerequisite) |
| 35 M1 | v2.6 session evidence (private `so-sessions`) | an extraction script for stub lengths and stub refusals (small; v2.7 35) |
| 35 M2 | the curve scenario `v27-35-open-stretch-curve.json` (C2 only, not M2) | the stub lab copy (2–3 stubs made open; v2.7 38 A4); the second-model hook labeller and an M2 scorer (window, denominators; v2.7 35) |
| 36 Q1 M1 | `so-live-suite.mts` per-tier scoring | the academy-act lab copy with quest qualities (v2.7 38 A4); an arm runner for 0/5/10/20 extra active qualities (v2.7 36) |
| 36 Q1 M2 | — | 20 labelled completion cases (v2.7 38 A4 + second-model labels); a recall/false-latch scorer (v2.7 36) |
| 37 M1 | `so-judge calibrate` (arm (c) shape) | ~20 labelled relationship windows (v2.7 38 A4); a three-arm runner and scorer (v2.7 37) |
| 37 M2 | — | an axes-per-read cost runner over N ∈ {2, 4, 8, 16} (v2.7 37); the windows above |
| S-17 / 37-S17 | — | a combined-scope runner over a 7-member cast with ≥ 3 quests (v2.7 37, after 36 M1 and 37 M2 tooling) |
| 37 L3 | `test/fixtures/meanwhile-proposals.cases.json`; in-page `storyOrchestratorAgendaProposals.propose()` | a script that replays the 20 cases through the page and scores them (v2.7 37) |
| 37 L6-C | `test/fixtures/judge/spike-voice.json` (floors frozen) | its 20 lab-copy rows (v2.7 38); `so-judge calibrate --use wardenVoice` is not in the tool's use list, so the route is unverified (v2.7 37) |
| B1-C3 | `so-judge timeouts --records` (counts and the close); plugin `/status` `adaptive` | per-call cause attribution (client wait vs 4000 ms, plugin queue / lane / account hold, `Retry-After`, provider latency) and per-call `/status` sampling (v2.8 01 C3 measurement, run by 39 B1) |
| B1-C12 | `extras.judge.calls` in the exported state | a per-loud-turn count (p50 / p95 / max) over the ring: trivial wiring, done at B1 |
| B1-C13b | — | absent (above) |
| B1-R4 | `so-session` `rating-pack --arm/--gate`, `so-model-blind.mts`; 4 pairs in private `so-sessions` `rating-pack/R4/` | — (ready; dev build with `spikes.reasoningEffect`) |

**Other B0 blockers.**

| Blocker | Rows | Owner |
|---|---|---|
| no prod-build drive path: `so-scenario`, `so-journey` and every `storyOrchestratorRuntime` read refuse a prod page, so a `prod` row can only be driven through DOM-level `so-ui` verbs and ST's own controls; that path is not built for most of the 99 `prod` rows | every `prod` row in C2–C8b | v2.7 39 (debug tooling) before C2 |
| C14-b has no predeclared floor | C14-b | v2.7 02 |
| S28 floors not copied into the manifest | 16-19-S28 | v2.7 32 |
| 33 W1 V0 needs the user's post-processor named | 33-W1-V0 | user |
| lab data from v2.7 38 A4 (relationship windows, academy-act quest copy, stub lab copy, spike-voice rows) | 35-M2, 36-Q1-M1/M2, 37-M1/M2, S-17, 37-S17, 37-L6-C | v2.7 38 |
| B0-base not run (needs a lane and ST) | B0-base, C3-preservation, PC-* | v2.7 39 B0-live |

**§B0 gates** (worktree, so Storybook is skipped: the runner finds no stories from a `.claude` worktree path, v2.7 16).
`npm run gates -- --no-storybook`: all green in 303.8 s (typecheck, test, typecheck:test, build, build:dev,
debug:typecheck, lint, test:release 129 tests / 115 pass / 14 skipped, test:plugin, test:debug, test:replay 32 of 32
killed); test-storybook:ci SKIPPED (worktree). `SO_ACCEPTANCE=1 node --test scripts/release/attestation.test.mjs`:
1 fail, as designed (no `docs/release/2.7.0/attestation.json` yet).

## Row manifest index

Every row of `test/phase-c/manifest.json`, one line each (the manifest holds prerequisites, reset, assertion, floor and
evidence). `phaseCManifest.test.mjs` fails when this table and the manifest disagree.

| Id | Stage | Tier | Build | Source |
|---|---|---|---|---|
| B0-base | B0 | D | dev-diagnostic | v2.7 39 §Payload contracts; §B0 record |
| 35-K2 | B1 | RP | dev-diagnostic | v2.7 35 §Gate record, final floor table |
| 35-K3 | B1 | RP + CL | dev-diagnostic | v2.7 35 §Gate record, final floor table |
| 35-K4 | B1 | RP | dev-diagnostic | v2.7 35 §Gate record, final floor table |
| 35-K5 | B1 | RP | dev-diagnostic | v2.7 35 §Gate record, final floor table |
| 35-M1 | B1 | D | dev-diagnostic | v2.7 35 §Phase 2 Floors (M1) |
| 35-M2 | B1 | RP + CL | dev-diagnostic | v2.7 35 §Phase 2 Floors (M2) |
| 36-Q1-M1 | B1 | CL | dev-diagnostic | v2.7 36 §Q1 Floors (M1) |
| 36-Q1-M2 | B1 | CL | dev-diagnostic | v2.7 36 §Q1 Floors (M2) |
| 37-M1 | B1 | CL | dev-diagnostic | v2.7 37 §Measurement M1 |
| 37-M2 | B1 | CL | dev-diagnostic | v2.7 37 §M2 + §Floors (2026-10-07) |
| S-17 | B1 | CL | dev-diagnostic | v2.7 39 §Rows added by the 2026-10-07 review |
| 37-S17 | B1 | CL | dev-diagnostic | v2.7 37 §Combined scope budget |
| 37-L3 | B1 | CL | dev-diagnostic | v2.7 37 §L3 curator proposals gate |
| 37-L6-C | B1 | CL | dev-diagnostic | v2.7 37 §L6 Calibration row L6-C |
| B1-C3 | B1 | CL + RP | dev-diagnostic | v2.8 01 §B C3; 39 §B1 rows from v2.8 01 |
| B1-C12 | B1 | CL | dev-diagnostic | v2.8 01 §B C12; 39 §B1 rows from v2.8 01 |
| B1-R4 | B1 | RP | dev-diagnostic | v2.8 01 §E (data only); 39 §B1 rows from v2.8 01 |
| C0-freeze | C0 | D | prod | v2.7 39 §Sequence C0; rule 2 |
| C0-goldens | C0 | D | dev-diagnostic | v2.7 39 §Sequence C0 |
| C1-gates | C1 | D | prod | v2.7 39 §Sequence C1; v2.7 31 §C |
| C1-release | C1 | D | prod | v2.7 39 §Sequence C1 |
| C1-clean-host | C1 | D | prod | v2.7 32 §W4 |
| C1b-ratchet | C1b | D | prod | v2.7 39 §Sequence C1b |
| 37-B3 | C1b | D | prod | v2.7 37 §Gates Bundle |
| C2-corpus | C2 | D | dev-diagnostic | v2.7 39 §Sequence C2; v2.7 16 §Regression |
| C2-rendered-targets | C2 | D | prod | v2.7 39 §Sequence C2 (finding 20); v2.7 29/30 Review (Sol) finding 20 |
| 16-K1 | C2 | D | dev-diagnostic | v2.7 16 §Step 0 K1 |
| 16-07-A3A8 | C2 | D | dev-diagnostic | v2.7 16 §Step 0 07 A3 + A8 |
| 16-01-in-app-walk | C2 | D | dev-diagnostic | v2.7 16 §Per plan 01; 39 §C2 rows |
| 16-02-C1 | C2 | D | dev-diagnostic | v2.7 16 §Per plan 02 C1 SP5.b |
| 16-02-C2-K1 | C2 | D | dev-diagnostic | v2.7 16 §Per plan 02 C2-K1; 39 §C2 rows |
| 16-02-C11-F1a | C2 | D | dev-diagnostic | v2.7 16 §Per plan 02 C11-F1a; 39 §C2 rows |
| 16-02-C13 | C2 | D | dev-diagnostic | v2.7 16 §Per plan 02 C13; 39 §C2 rows |
| 16-02-C14 | C2 | D | dev-diagnostic | v2.7 16 §Per plan 02 C14 + 14; 39 §C2 rows |
| 16-03-group-only | C2 | D | dev-diagnostic | v2.7 16 §Per plan 03 |
| 16-04-health-center | C2 | D | dev-diagnostic | v2.7 16 §Per plan 04; 39 §C2 rows |
| 16-05-briefing | C2 | D | dev-diagnostic | v2.7 16 §Per plan 05; 39 §C2 rows |
| 16-06-presence | C2 | D | dev-diagnostic | v2.7 16 §Per plan 06; 39 §C2 rows |
| 16-07-A6 | C2 | D | dev-diagnostic | v2.7 16 §Per plan 07 |
| 16-08-thinking | C2 | D | dev-diagnostic | v2.7 16 §Per plan 08; 39 §C2 rows |
| 16-09-commitment | C2 | D | dev-diagnostic | v2.7 16 §Per plan 09; 39 §C2 rows |
| 16-10-catch-up | C2 | D | dev-diagnostic | v2.7 16 §Per plan 10; 39 §C2 rows |
| O2 | C2 | D | prod | v2.8 01 §A O2 |
| 29-D1 | C2 | D | prod | v2.7 29 §Gates (D) |
| 29-D2 | C2 | D | prod | v2.7 29 §Gates (D) |
| 30-D1 | C2 | D | prod | v2.7 30 §Gates (D) Phase C live |
| 30-D2 | C2 | D | prod | v2.7 30 §Gates (D) Phase C live |
| 30-D3 | C2 | D | prod | v2.7 30 §Gates (D) Phase C live |
| 31-G3 | C2 | D | dev-diagnostic | v2.7 31 §Gates (D) |
| 32-W4-scenario | C2 | D | dev-diagnostic | v2.7 32 §Tests added; §Phase C rows owed |
| 33-D-clean | C2 | D | prod | v2.7 33 §W2/W3/W4 Gates |
| 34-L-flow | C2 | D | dev-diagnostic | v2.7 34 §Gates D, Live |
| 34-L-F11 | C2 | D | dev-diagnostic | v2.7 34 §Gates D, Live |
| 34-L-switch | C2 | D | dev-diagnostic | v2.7 34 §Gates D, Live |
| 34-L-reopen | C2 | D | dev-diagnostic | v2.7 34 §Gates D, Live |
| 34-L-restart | C2 | D | dev-diagnostic | v2.7 34 §Gates D, Live |
| 34-L-fixed | C2 | D | dev-diagnostic | v2.7 34 §Gates D, Live |
| 34-L-brief-off | C2 | D | dev-diagnostic | v2.7 34 §Gates D, Live |
| 34-L-solo | C2 | D | dev-diagnostic | v2.7 34 §Gates D, Live |
| 34-L-harness | C2 | D | dev-diagnostic | v2.7 34 §Gates D, Live |
| 34-L-multiuser | C2 | D | dev-diagnostic | v2.7 34 §pane, Multi-user installs |
| S-04 | C2 | D | prod | v2.7 39 §Rows for Sol findings 4–10 |
| S-05 | C2 | D | dev-diagnostic | v2.7 39 §Rows for Sol findings 4–10 |
| S-09 | C2 | D | prod | v2.7 39 §Rows for Sol findings 4–10 |
| 35-P2-curve | C2 | D | dev-diagnostic | v2.7 35 §Phase 2 / Owed |
| 35-P2-clean | C2 | D | prod | v2.7 35 §Owed Phase 2 |
| 36-Q5-scn | C2 | D | dev-diagnostic | v2.7 36 §Q5 Gate |
| 36-P-live | C2 | D | dev-diagnostic | v2.7 36 §P Gate |
| 36-spoiler-sweep | C2 | D | prod | v2.7 36 §Spoiler rules |
| 37-D1 | C2 | D | dev-diagnostic | v2.7 37 §Gates no-LLM group scenario; 39 §Rows owed by v2.7 37 |
| 37-D2 | C2 | D | dev-diagnostic | v2.7 37 §Gates; 39 §Rows owed by v2.7 37 |
| 37-D3 | C2 | D | dev-diagnostic | v2.7 37 §Gates; 39 §Rows owed by v2.7 37 |
| 37-spoiler | C2 | D | prod | v2.7 37 §Gates Spoiler checklist |
| C3-preservation | C3 | D | dev-diagnostic | v2.7 39 §Sequence C3; §Payload contracts |
| C3-repeatability | C3 | D | dev-diagnostic | v2.7 39 §Sequence C3 |
| PC-role-line | C3 | D | dev-diagnostic | v2.7 39 §Payload contracts |
| PC-open-stretch | C3 | D | dev-diagnostic | v2.7 39 §Payload contracts |
| PC-check-outcomes | C3 | D | dev-diagnostic | v2.7 39 §Payload contracts |
| PC-agency-notes | C3 | D | dev-diagnostic | v2.7 39 §Payload contracts |
| PC-quest-scope | C3 | D | dev-diagnostic | v2.7 39 §Payload contracts |
| PC-relationship-scope | C3 | D | dev-diagnostic | v2.7 39 §Payload contracts |
| PC-privacy | C3 | D | dev-diagnostic | v2.7 39 §Payload contracts |
| PC-off-path | C3 | D | dev-diagnostic | v2.7 39 §Payload contracts (off-path requests) |
| J0 | C4 | D | dev-diagnostic | v2.7 39 §Sequence C4 |
| J1 | C4 | D + RP | dev-diagnostic | v2.7 39 §Sequence C4 |
| J2 | C4 | D + RP | dev-diagnostic | v2.7 39 §Sequence C4 |
| J3 | C4 | D + RP | dev-diagnostic | v2.7 39 §Sequence C4 |
| J4 | C4 | D + RP | dev-diagnostic | v2.7 39 §Sequence C4 |
| J5 | C4 | D + RP | dev-diagnostic | v2.7 39 §Sequence C4 |
| J6 | C4 | D + RP | dev-diagnostic | v2.7 39 §Sequence C4 |
| J7 | C4 | D + RP | dev-diagnostic | v2.7 39 §Sequence C4 |
| J8 | C4 | D + RP | dev-diagnostic | v2.7 39 §Sequence C4 |
| J9 | C4 | D + RP | dev-diagnostic | v2.7 39 §Sequence C4 |
| J10 | C4 | D + RP | dev-diagnostic | v2.7 39 §Sequence C4 |
| J11 | C4 | D + RP | dev-diagnostic | v2.7 39 §Sequence C4 |
| J12 | C4 | D + RP | dev-diagnostic | v2.7 39 §Sequence C4 |
| J13 | C4 | D + RP | dev-diagnostic | v2.7 39 §Sequence C4 |
| J14 | C4 | D + RP | dev-diagnostic | v2.7 39 §Sequence C4 |
| J6-W1 | C4 | D + RP | dev-diagnostic | v2.7 33 §W1 Floors V8; 39 C4 |
| O1 | C5 | RP | prod | v2.8 01 §A O1 |
| O3 | C5 | LI + CL | prod | v2.8 01 §A O3 |
| O4 | C5 | LI + RP | prod | v2.8 01 §A O4 |
| O5 | C5 | LI | prod | v2.8 01 §A O5 |
| O6 | C5 | LI | prod | v2.8 01 §A O6 |
| O7 | C5 | CL | prod | v2.8 01 §A O7 |
| O8 | C5 | D | prod | v2.8 01 §A O8 |
| O9 | C5 | RP | prod | v2.8 01 §A O9 |
| O10 | C5 | CL | prod | v2.8 01 §A O10 |
| O11 | C5 | CL | prod | v2.8 01 §A O11 |
| O12 | C5 | D | prod | v2.8 01 §A O12 |
| O13 | C5 | RP | prod | v2.8 01 §A O13 |
| O13b | C5 | CL | prod | v2.8 01 §A O13b |
| O14 | C5 | CL | prod | v2.8 01 §A O14 |
| O15 | C5 | CL | prod | v2.8 01 §A O15 |
| O16 | C5 | CL | prod | v2.8 01 §A O16 |
| C14-b | C5 | CL | prod | v2.8 01 §B C14-b (moved to 39 C5) |
| C4-R6 | C5 | CL + RP | prod | v2.8 01 §B C4; 39 §B1 rows from v2.8 01 |
| C4-J8 | C5 | CL + RP | prod | v2.8 01 §B C4; 39 §B1 rows from v2.8 01 |
| R4-live | C5 | RP | prod | v2.8 01 §E Also owed; 39 §B1 rows from v2.8 01 |
| 33-W1-V0 | C5 | D + RP | dev-diagnostic | v2.7 33 §W1 Floors V0 |
| 33-W1-V3 | C5 | CL + RP | dev-diagnostic | v2.7 33 §W1 Floors V3 |
| 33-W1-V4 | C5 | CL + RP | dev-diagnostic | v2.7 33 §W1 Floors V4 |
| 33-W1-V5 | C5 | CL + RP | dev-diagnostic | v2.7 33 §W1 Floors V5 |
| 33-W1-V7-live | C5 | D + CL | dev-diagnostic | v2.7 39 §Rows added by the 2026-10-07 review |
| 33-W2-oversteer | C5 | RP + CL | prod | v2.7 33 §W2 Floor, Decision 3; v2.8 01 §G |
| 33-W2-J8.10 | C5 | CL | prod | v2.7 33 §W2 Gate |
| 33-W3-N1 | C5 | CL | dev-diagnostic | v2.7 33 §W3 N1 |
| 33-W3-combined | C5 | CL | dev-diagnostic | v2.7 33 §W3 Gate/Floors |
| 33-W3-live | C5 | CL | dev-diagnostic | v2.7 33 §W3 Gate |
| 33-W4-live | C5 | CL | prod | v2.7 33 §W4 Gate |
| 33-W4-spoiler | C5 | CL | prod | v2.7 33 §W4 Floors |
| 33-W4-useful | C5 | CL | prod | v2.7 33 §W4 Floors (Decision 7) |
| 34-RP | C5 | RP + CL | prod | v2.7 34 §Floors (proposed 2026-10-07) |
| 34-copy | C5 | RP | prod | v2.7 34 §Gates, Player-visible surface |
| S-06 | C5 | D + RP | prod | v2.7 39 §Rows for Sol findings 4–10 |
| S-07 | C5 | CL | prod | v2.7 39 §Rows for Sol findings 4–10 |
| S-08 | C5 | CL | prod | v2.7 39 §Rows for Sol findings 4–10 |
| S-10 | C5 | CL + RP | prod | v2.7 39 §Rows for Sol findings 4–10 |
| S-11 | C5 | CL | prod | v2.7 39 §Rows for Sol findings 4–10 |
| S-12 | C5 | CL | prod | v2.7 39 §Rows for Sol findings 4–10 |
| S-15 | C5 | D | dev-diagnostic | v2.7 39 §Rows added by the 2026-10-07 review |
| S-16 | C5 | D | dev-diagnostic | v2.7 39 §Rows added by the 2026-10-07 review |
| S-19 | C5 | D + RP | dev-diagnostic | v2.7 39 §Rows added by the 2026-10-07 review |
| S-19-OOC | C5 | D + RP | dev-diagnostic | v2.7 39 §Rows added by the 2026-10-07 review |
| 37-S19 | C5 | D + RP | dev-diagnostic | v2.7 37 §Story clock Gate; 39 §Rows owed by v2.7 37 |
| 37-M1-C5 | C5 | CL | prod | v2.7 37 §M1; 39 C5 (37 M1, M3) |
| 37-M3 | C5 | RP + CL | prod | v2.7 37 §M3; 39 §Rows added |
| 36-Q3 | C5 | RP + CL | prod | v2.7 36 §Q3 Floor |
| 36-pilot-academy | C5 | RP | prod | v2.7 36 §Order 7 |
| 36-pilot-saga | C5 | RP | prod | v2.7 36 §Order 7 |
| 35-M2-C5 | C5 | RP + CL | prod | v2.7 35 §Phase 2 Floors (M2); 39 C5 |
| 35-K3-C5 | C5 | RP + CL | prod | v2.7 35 §Gate record; 39 C5 (branch: SP6 PASS) |
| 35-K4-C5 | C5 | RP | prod | v2.7 35 §Gate record; 39 C5 (branch: SP6 PASS) |
| 35-K5-C5 | C5 | RP | prod | v2.7 35 §Gate record; 39 C5 (branch: SP6 PASS) |
| 35-P3-K2 | C5 | RP | prod | v2.7 35 §Phase 3 Floor (branch: SP6 PASS) |
| 35-P4-M2 | C5 | RP + CL | prod | v2.7 35 §Phase 4 Floor (branch: SP6 PASS, M2 PASS) |
| 35-P4-K3 | C5 | RP + CL | prod | v2.7 35 §Phase 4 Floor (branch: SP6 PASS, M2 PASS) |
| 35-P4-K4 | C5 | RP | prod | v2.7 35 §Phase 4 Floor (branch: SP6 PASS, M2 PASS) |
| 35-ENC | C2 | D | prod | v2.7 35 §Phase 2 gate (encounter pool); 39 §Stage B branches (branch: SP6 PASS, M2 PASS) |
| 35-DROP | C2 | D | prod | v2.7 35 §Phase 1 drop path; 39 §Stage B branches (branch: SP6 FAIL or INCOMPLETE) |
| 32-W8-S32-1 | C5 | RP | prod | v2.7 32 §W8; 39 C5 |
| 32-W6-stream | C5 | RP | prod | v2.7 32 §W6; 39 C5 |
| 32-W1-A | C6 | LI | prod | v2.7 32 §W1; 39 C6 |
| 32-W1-template | C6 | LI | prod | v2.7 32 §W1 Floor |
| 32-W1-director | C6 | LI + CL | prod | v2.7 32 §W1 Gate |
| 32-W2-B | C6 | LI | prod | v2.7 32 §W2 |
| 32-W3 | C6 | LI + CL | prod | v2.7 32 §W3 |
| 32-W4-nobroker | C6 | LI | prod | v2.7 32 §W4 |
| 32-W5-builder | C6 | LI + CL | prod | v2.7 32 §W5 |
| 32-W5-cancel | C6 | LI | prod | v2.7 32 §W5 |
| 32-W5-cleanup | C6 | LI | prod | v2.7 32 §W5 |
| 32-W5-base | C6 | LI | prod | v2.7 32 §W5 |
| 32-W6-frames | C6 | LI | prod | v2.7 32 §W6 |
| 32-W6-seam | C6 | CL | prod | v2.7 32 §W6, Decision 2 |
| 32-W7-look | C6 | LI + RP | prod | v2.7 32 §W7 |
| S32-2 | C6 | LI + RP | prod | v2.7 32 §W8; 39 C6 |
| S32-2-lifecycle | C6 | LI + RP | prod | v2.7 32 §W8 |
| 32-director-payload | C6 | CL | prod | v2.7 32 §Model input (rule 6) |
| 16-18-refadopt | C6 | LI | prod | v2.7 16 §Per plan 18 + 24 B/C |
| 16-19-S28 | C6 | LI + LT + CL | prod | v2.7 16 §Per plan 19 + 24 D |
| 16-20-local-card | C6 | LT | prod | v2.7 16 §Per plan 20 + 24 E |
| 38-D13b | C6 | LI | prod | v2.7 38 §Steps D13b + §Gates |
| 38-D13c | C6 | LI | prod | v2.7 38 §Steps D13c |
| 38-assets-saga | C6 | LI | prod | v2.7 38 header; v2.7 28 |
| 38-G-campaign | C7 | D | prod | v2.7 38 §Gates |
| 38-C7 | C7 | RP | prod | v2.7 38 §C7 integration criteria |
| 38-C7-life | C7 | RP | prod | v2.7 38 §C7 (finding 18) |
| 38-C7-quest | C7 | RP | prod | v2.7 38 §C7 (finding 18) |
| C8-smoke | C8 | CL | prod | v2.7 16 §Live smoke procedure; 39 C8 |
| C8b-stranger | C8b | CL | prod | v2.7 39 §Sequence C8b |
| Z-docs | Z | D | prod | v2.7 39 §Sequence Z |
| Z-attestation | Z | D | prod | v2.7 39 §Sequence Z; rule 2 |
