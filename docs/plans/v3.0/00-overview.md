# Implementation Overview — Story Orchestrator v3.0

> **2026-10-21 (owner):** renamed from v2.9 to v3.0; every reference was rewritten. v2.9 is now the 2026-10-21 additions triage (`docs/plans/v2.9/00-overview.md`).

> **2026-10-14 (owner):** 02 and 05.4 moved to v2.8 42 / 43.
>
> **2026-10-07:** 04 option D (agency notes → `auto`) moved to v2.7 33 W2. Decided (recommendations): 01 (SP1 swipe-back cache) and 05.1 (2D rig) dropped.

**Status 2026-10-26: REPLANNED** (§Replan 2026-10-26): tracks A controller/performance, B images, C witness redesign,
D v2.9 follow-ups, E deferred features on their triggers, F test economy. Controller plans 06-09 in build (09 live on the
owner's controller). Feature rows 01-05 still parked on their triggers.

**Was: DEFERRED (created 2026-10-03 at the v2.7 split).** v3.0 = everything the user deferred from the v2.7 plan set
on 2026-10-03, and the deferred remainders of plans that moved to v2.7 or v2.8. **Nothing here is scheduled until v2.8
and v2.9 close.** No plan is approved or built. Old → new numbers: `docs/plans/v2.7/RENUMBER.md`. Review findings applied:
`docs/plans/v2.7/review-2026-10-03.md` (old numbers), per plan in each file's "Review 2026-10-03" section.

## Replan 2026-10-26

Owner: "we would have to replan 3.0 with the new findings and developments." This section supersedes §Order if reopened and
the "nothing is scheduled until v2.8 and v2.9 close" clause of the 2026-10-03 status for the controller and image tracks
(they are in build now); the feature rows keep rule 2 (reopened only on their trigger, re-approved with floors restated).
Older sections stay as history.

### Inputs

- Controller: plans 06-09 (MTP n-max 2 live 2026-10-25; patched b11888 + RAM member cache 4 GiB live 2026-10-26, warm member
  switch 8.55 -> 3.8 s, member turn 14.6 -> 10.5 s, Sol 25 pairs better on every category, thinking floor missed as written
  23/25, owner adopted). In progress on the 09 branch (other agent): chat-first / second-slot bench (floors declared),
  rewound entries + `checkpoint_at`, idle next-speaker prefill (built, aborts on any arrival), async/RAM slot save, story-read
  line reorder, max-memory profile + tray toggle, unlock re-bench, IQ4_XS idea.
- Research: `research/context-chunking-web.md` (ranked shortlist), `research/fable-context-slicing.md` (674 recorded requests:
  side passes 78 %, chat waits 4.8 s p50 behind side passes; top 3 GPU tests ~15 / ~20 / ~10 min), `research/feature-impact-controller.md`
  (10 ranked risks + per-change model-lane regression list), `research/astra-controller-review.md` (bench accounting, RAM
  eviction coordination, partial key isolation).
- Close-out: `docs/plans/v2.9/13-close-out.md` (C1-C11, §Move to v3.0) and `05-deferred-items.md` §From the v2.8/v2.9 close-out.
- Recorded v2.9 misses (each plan's top status line): 06 F4 usefulness +0.0 (floor +0.5); 04 cue effect 0 points (event on
  screen); 02 S6 gain 0 at ceiling on the first set, but 100 points on the harder set (met; repetition score owed); 05 P5
  matcher p95 2.7-8.5 ms (floor 2 ms); C3 promise row = model miss (candidate prompt line in v2.8 47 §C3); J6.8 flaky; sprite
  head-box race fixed on master (`4732bd28`, `0940f561`), GPU verification owed.

### Owner priorities (2026-10-26) as planning rules

1. **Performance first.** Track A and the performance half of B go first.
2. **Blind rating before any output-changing adoption.** A change that can change what the player reads (binary, sampling,
   prompt order, quant, compaction, polish) is adopted only after a predeclared blind rating (Sol, pairs by hash) on real
   prompts; exact changes (token-identical restores, scheduling) need replay equivalence + timings only. Floors predeclared,
   never retuned; a miss is recorded and the owner decides (as with 09 A).
3. **Use VRAM and RAM to the limit**; headroom for other apps is the tray toggle's job (edge case), not the default.
4. **Images are a main feature**: image speed and image quality get their own track (B), not leftovers.
5. **Thinking and inner voice stay on**; any change that would switch them off is raised first.
6. **Private plugin, every built feature on by default**, below its floor too; only the owner switches one off.
7. **The owner's playthrough (v2.9 13 C1) is pending**; it produces flags (slotting below). GPU rule unchanged: no GPU work
   while the owner plays; no controller adoption on the owner's install during the playthrough (it would confound it).

### Tracks

Gate classes as v2.8 rule 7 (D deterministic, CL second-model, RP/LT real Artemis, R replay). GPU estimates are **est.**
(inferred from the named recorded run); "TO ESTIMATE" where nothing comparable was recorded.

**A. Controller and text performance**

- **A0 Prefix-stability gate** (web idea 5). Log the first-divergence token per cache key; payload goldens assert divergence
  at or after the per-turn boundary. Why now: every cache gain in A1 dies silently on one churning macro. Class D (payload
  goldens, no model). Depends: none. GPU 0.
- **A1 Plan 09 remainder** (owned by the 09 branch; not edited here). Order from Fable §10: C2 chat-first / second slot
  (floors declared in 09 §C2; est. ~15 min), rewound entries + `checkpoint_at` (Fable floors: warm p50 <= 3.0 s, state p50
  <= 0.8 GiB, hit rate at 2048 MiB >= 60 %, greedy identity on 4 prompts; est. ~20 min), idle next-speaker prefill (needs a
  send-latency floor from audit risk 4: TO DECIDE in 09), story-read line reorder (output-changing for extraction: gate =
  `so-live-suite` tiers within 0.02 of current goldens + payload golden; est. ~10 min + one live suite), async/RAM slot save.
  Correctness items first, before more speed (Astra, audit risks 5, 6, 8): RAM-mode eviction coordinated with image
  admission (`makeRoom` returns 0 today), native cache occupancy in `/status`, key isolation (unkeyed loads may consume keyed
  entries), erase on aborted requests. Class: exact changes R + timings; the read reorder RP (live suite). Depends: A0.
  GPU: 09 budget <= 90 min (09 §GPU budget) plus the regression list below per adopted change.
- **A2 Max-memory profile + tray headroom toggle** -> `10-max-memory-profile.md` (stub). Why now: owner rule 3; today's Max
  mode leaves reserves sized for other apps and a 4 GiB member cache holds about three ~1.3 GiB states (audit risk 6), so
  groups of 4+ thrash. Depends: A1 eviction coordination (audit risks 3, 5). Class: exact (timings, no-409, no fit spill) +
  image rows. GPU: TO ESTIMATE.
- **A3 Long context** (no stub until started): chunked history compaction near 32K (web idea 3 / Fable idea 6, ~26K tokens
  saved per member turn once full, **output-changing: blind rating at compaction points**), then the moved rows R2/R7
  (B1-PFX/HIST), R12 SP6, R3 K5 at 32K. R5 B1-NARR (>= 48K) stays parked unless A2 makes a 48K text profile fit while images
  idle (question 9). Depends: A1. GPU: TO ESTIMATE.
- **A4 IQ4_XS vs Q4_K_M** (Astra rank 5): only if A2 shows VRAM is what blocks image residency. Output-changing: blind rating;
  download needs the owner's OK and the disk check. GPU: TO ESTIMATE.
- **Per-change regression list**: `research/feature-impact-controller.md` §Cross-feature model-lane regression list runs
  before each adoption (base set + the change's rows). Turned into a named batch list in F3.

**B. Images: speed and quality**

- **B1 Image performance after the unlock** -> `11-image-perf-after-unlock.md` (stub): quiet same-commit unlock re-bench
  (06 baseline SDXL median 7.84 s stock; v2.8 79 saw no gain on one unlocked run vs three stock), ComfyUI flags (attention
  backend, `--cache-ram`, fast paths), and the image <-> text thrash (audit risk 2: with MTP every image swaps text out and
  the reclaim can cold-start ComfyUI each cycle). Class: timings + image quality check where output changes. Depends: A1
  member cache state known (reload cost). GPU: TO ESTIMATE (06 image bench: 2 warm-ups + 6 runs per arm).
- **B2 Head-box follow-up**: GPU verification of the `SpriteBuilder` head-box race fix = the p41 image journey x2 owed by
  v2.9 13 (31/32 on 2026-10-26, frames[Cleo] refused 2/2 before the fix). Lands in the v2.9 freeze, listed here so it is not
  lost. Class RP (journey). GPU: est. ~70 min per run (v2.8 79 showcase run 71 min).
- **B3 Image quality misses left by v2.8 80**: R bust eye width (Ash, Bram) and E bright fringe (Ash, Cleo) recorded misses.
  Reopen only from playtest image flags (faces/eyes/edges) or the owner's 1-5 image score. No plan until then.
- **B4 Motion and avatars (feature rows, owner decision)**: 05.7 image-to-video loops: its trigger is met (v2.8 74 step 2
  NO-GO 2026-10-18); 05.5 per-chat avatars: on-demand look sprites now exist, so its trigger looks met (group-save overwrite
  and swipe rebuild still to measure first). 05.1 layered rig stays parked (74 no-go was the Sol review pass rate, not turns
  or parallax). Questions 6-7.

**C. Memory: witness redesign**

- **C1 Witness redesign** -> `12-witness-redesign.md` (stub). v2.8 42 W4 FAIL 2026-10-25: real exact-set 13/147 (0.088,
  floor 0.9), false inclusion 0.72 (floor 0.02); the read answers all-present; presence null control 0.84. The record stays
  unconsumed. Why now: v2.8 43 verbatim recall and any message-level filter depend on it; why maybe not now: no playtest
  flag has shown a character acting on a scene it missed (question 8). Class: offline scorer (D) over recorded sessions
  first, RP only for a design that clears it. GPU: TO ESTIMATE (W4 real run was 74 reads on lane 45).
- **C2 Promise row (C3)**: the candidate prompt line (v2.8 47 §C3: a promise said to "you" right after a cast member spoke
  is for that member) is a read-prompt change: gate = GS6 `--model judged` GS6.8 + `so-live-suite` tiers. Listed under D4.

**D. v2.9 follow-ups on recorded misses** (each: one change, one re-run, floor unchanged; plan 11 stop rules)

- **D1 06 F4 usefulness** (+0.0 vs +0.5): read the rater's pass-B reasons in the archived LT score first (no GPU); if a cause
  is named, one prompt change, then rerun B2 `lt06` (est. ~60 min + Sol rating, v2.9 13 C5). Else record and close.
- **D2 04 cue effect**: a corpus with the event told only through the cue, cue on/off, frozen before inference (est. 80
  replies; TO ESTIMATE in minutes). Class RP + CL.
- **D3 02 harder-set repetition**: compute `repetitionDownPct` offline from the recorded replies (no GPU, rater only).
- **D4 Promise line** (C2 above): est. ~25 min (v2.9 13 C3 budget).
- **D5 J6.8 flake**: classify from the two recorded runs (no GPU); then either `model: judged` with a stop rule or a property
  assertion; J6 x2 on a model lane.
- **D6 05 P5 matcher p95** (2.7-8.5 ms vs 2 ms): pure, no GPU; profile the stress fixture, fix or record. Performance rule.
- **D7 Real-play rows**: 05 P3 and 07's larger count scored over the owner's playtest transcripts (counts only, campaign
  content never shown to the owner; rater = another model). GPU 0 beyond the playtest itself.
- **D8 08 Studio false positive** (`quality-never-in-scope` on observation-only qualities): D, no GPU.

**E. Deferred features and their reopen conditions** (rule 2 unchanged: none is built because its turn came)

- **01 SP1 swipe-back cache**: auto-drop at the v3.0 freeze unless S4 >= 3 natural swipe-backs per 100 player turns over
  >= 300 turns of the owner's play. The playtest journal can count them (question 12).
- **04 D6/T22**: decision only; the playtest's "a character acted or decided for you" flags are the over-steer evidence it waits for.
- **05.2 SP10, 05.3 C4 panel, 05.5 persona-fit judge and same-Jev hosts, 05.6 Critic**: triggers unchanged; none met today
  (05.6: v2.8 09 built but not accepted, and no session yet shows the critic passing a chain another model rejects).
- **v2.9 03 S2 + S3 polish**: S2 at plan size is ready (`test/measurements/v2.9/03-s2/`, Sol rater, self-rating caveat); S3
  stays blocked on the P0 thought-carry design or the owner's approval of the carry reduction (question 10). Output-changing:
  blind rating per rule 2.
- **v2.8 55-59** (NPC commitments, social permissions, rituals, keepsakes, reconciliation) and the **v2.9 V3.0 triage rows**
  (`05-deferred-items.md`): reopen when a playtest flag names the gap, else stay parked (question 11).

**F. Test economy remainder** (v2.9 11)

- **F1 B3 replay backend** (class R): saves GPU on plumbing reruns; recordings come free with every E/M row from now on.
  Build: no GPU. Why now: Tracks A/B add many model-lane regression rows.
- **F2 B6 `suite:mutation` review**: no GPU.
- **F3 Controller regression batch**: the audit's per-change list as a named `st-lanes batch` list with `model: judged | any |
  none` per row, so `any` rows ride F1 replay once it exists. No GPU to build.

### Recommended order

0. **Close v2.9 first** (v2.9 13): playtest C1 (owner's time), `suite:nomodel` second green run, B2 image journey x2, J6 x2,
   freeze. No controller adoption on the owner's install while the playthrough runs.
1. **No-GPU work in parallel with 0**: A0, A1 correctness items, F3, D3, D5 (diagnosis), D6, D8, F2.
2. **A1** benches in Fable's order (C2 slot, rewound + `checkpoint_at`, idle prefill, read reorder), each adoption with the F3 list.
3. **A2** max-memory profile (after A1's eviction coordination).
4. **B1** image performance (needs the controller state from A1/A2 to be stable; can share a GPU window with A2).
5. **Playtest triage** (as soon as the owner hands the flags over; may pre-empt 2-4 for fix-now flags).
6. **D GPU rows** (D1, D2, D4) batched in one window on the adopted controller, so every number is on the final stack.
7. **C1** witness redesign: offline design + scorer first; GPU only for a design that clears the offline score.
8. **A3** long context, **A4** IQ4_XS, **B4** motion/avatars, **E** rows: each only on its trigger or the owner's go.
9. **F1** replay backend whenever GPU windows get scarce; at the latest before the v3.0 final suite.

GPU total for 2-4 + 6, known parts only: 09 <= 90 min, D1 ~60 min + rating, D4 ~25 min, B2 ~140 min (x2); A2, B1, D2 TO ESTIMATE.

### Dropped or parked, and why

- **Dropped**: v2.8 R8 thinking A/B (owner keeps thinking on); 09 B `-ub` 1024/2048 and C n-max 3 / probabilistic drafting
  (floors missed, 09 §Batch 1/2); ExLlamaV3 (07 spike); 06 stable head and depth-0 layout (blind rating + privacy); 08 disk
  member cache (superseded by 09 RAM mode); CUDA 12.4 vs 13.4 and b11889 (parity, 09 §Batch 1).
- **Parked**: 05.1 layered rig (trigger not met), R5 >= 48K (question 9), web shortlist §8 (`--swa-full`, CacheBlend) and
  Fable idea 8 private-suffix layout (same change class that failed rating; owner's call), Fable idea 9 SWA bridge
  (negative here), vLLM host KV offload (Astra: worth a re-read, ranks low).
- **Unchanged parking** (rule 2): 01, 04, 05.2, 05.3, 05.5, 05.6, v2.8 55-59, v2.9 V3.0 rows.

### Playtest flags: how they are slotted

Each flag from the owner's playthrough (Flag button + end notes) gets one verdict, recorded in v2.9 13 C1:

- **fix-now** (before the v2.9 freeze): a secret leak, a character acting for the player, a broken or covering UI, an empty or
  lost reply, anything that blocks play. Same gates as any change.
- **v3.0 track**: slow waits -> A (or B when an image is involved); image look/fit -> B3/B4; forgetting, contradiction,
  "knew what it never heard" -> C1/C2; cues, suggestions, echoes, voice repetition -> D; a missing feature -> the E row whose
  trigger it meets (or a new row with a trigger); a harness or measurement problem -> F.
- **not a defect**: with the reason.
- Flags never retune a floor. An output-changing fix still goes through rule 2's blind rating. Flags are counted against
  E triggers (01 S4 swipe-backs, 04 over-steer, 05.6 critic) and C1's reopen question.
- Reports to the owner name no campaign character, place or plot (counts only); content review goes to another model.

### Status (replan)

| Track | Plans | State 2026-10-26 |
|---|---|---|
| A | 09 (remainder), 10 (stub), A0, A3, A4 | 09 in build on its branch; 10 stub; A0/A3/A4 not started |
| B | 11 (stub), B2 in v2.9 13, B3/B4 | 11 stub; B2 owed by v2.9 freeze; B3/B4 wait for flags / owner |
| C | 12 (stub) | stub; record unconsumed |
| D | rows D1-D8 (homes: v2.9 02/04/05/06/08, v2.8 47, v2.9 11) | not started |
| E | 01, 04, 05.x, v2.9 03 S2/S3, v2.8 55-59, V3.0 rows | parked on triggers |
| F | v2.9 11 B3, B6 review, F3; 15 end batch | built 2026-10-26 on `v3.0-f-test-economy`, no GPU (v2.9 11 §Build record: B3 + B6 review + F3); first record/replay run owed in the end batch (`15-end-test-batch.md`) |

### Owner decisions 2026-10-26 ("as recommended")

1. Order A -> B -> triage -> D -> C, with B1 images in parallel with A1.
2. No controller changes on the owner's install during a play session.
3. Max memory is the default; the tray toggle frees headroom.
4. Output-changing bar: blind Sol rating on >= 25 real prompts, no category below -0.2, flags <= control + 2; thinking closure "no worse than control", declared before the run.
5. Downloads OK if they fit: a ComfyUI attention backend, an IQ4_XS Artemis file. Image-to-video models only with 6.
6. 05.7 image-to-video: one short trial, after B1.
7. 05.5 per-chat avatars: wait for playtest flags.
8. C1 witness redesign: offline design + scoring now, GPU later.
9. R5 48K context: test once A2 max memory works.
10. v2.9 03 S3: polish stays off; drop S3 for now.
11. v2.8 55-59: stay parked until a playtest flag names the gap.
12. SP1: count swipe-backs from the owner's playthrough; that decides S4.
13. D1 06 usefulness: one prompt change and a rerun.
14. llama.cpp patch: keep the fork for now; decide upstreaming after it is proven in play.

### Added 2026-10-26

- 17 `17-reply-polish-integration-review.md`: reply polish stays OFF; review the integration (thought-carry fix, ratings, route, S3 lane) before it returns (owner).
- 16 `16-twine-twee-spike.md`: Twine / Twee 3 import-export, SPIKE only; triage with Astra before any build (owner).

### Unresolved questions (owner decisions)

1. Track order A -> B -> playtest triage -> D -> C: confirm, or put images (B1) level with A1?
2. During your playthrough: hold every controller adoption on your install until you stop (recommended), or keep adopting between sessions?
3. Max-memory as the **default** mode, with the tray toggle giving headroom only when you use the PC for other things: yes?
4. Blind-rating standard for output-changing changes: reuse 09's floor (every category delta >= -0.2, flags <= control + 2) with
   at least 25 real prompts, and what thinking-closure floor (09 A was adopted at 23/25 vs control 19/25)?
5. Downloads: an attention backend for ComfyUI, an IQ4_XS Artemis file, image-to-video models (05.7): which may I fetch (each with the disk check)?
6. 05.7 image-to-video loops: its trigger is met (v2.8 74 step 2 NO-GO). Spike it (2 characters x 2 poses) or keep parked?
7. 05.5 per-chat avatars: reopen now that on-demand look sprites exist?
8. Witness redesign (C1): spend GPU on it now, or park until a playtest flag shows a character acting on a scene it missed?
9. R5 (>= 48K context): worth testing a 48K text profile under max-memory while images are idle, or drop it?
10. Reply polish: approve the thought-carry reduction for S3, require a preserved-carry design, or drop S3 (S2 then has no consumer)?
11. v2.8 55-59: reopen any before the playtest flags, or only on a flag?
12. SP1 swipe-back cache: count swipe-backs from your playthrough journal as its S4 evidence (needs >= 300 turns), or let it auto-drop at the freeze?
13. 06 F4: one prompt change and a rerun (~60 min + rating), or accept the miss as is?
14. Upstream the llama.cpp patch (`cache_key`, `cache_ckpt_max`, zero-fill) as a public PR from your account, or keep the fork?

## Rules

1. **Inherited.** v2.6, v2.7 (`v2.7/00-overview.md` §Rules) and v2.8 (`v2.8/00-overview.md` §Rules) rules and every
   invariant in `.claude/rules/architecture.md` apply.
2. **A deferred plan is not a backlog item.** Each one names what would reopen it (table below). When v2.8 closes, every
   row is either reopened (its trigger met, re-approved by the user with its floors restated) or dropped. None is built
   because its turn came.
3. **Stories run in group chats only** (v2.7 03). No plan here adds solo support.
4. **Version-qualified references** (review B12): every plan reference names its version ("v2.7 02 C2", "v2.8 21").
5. Gate classes as in v2.8 rule 7 (`v2.8/00-overview.md` §Gate taxonomy, review F15). A reopened plan states its class.

## Deferred items

Reopen state 2026-10-26: §Replan 2026-10-26 tracks E and B4 (05.7's trigger met; 05.5 avatars likely met).

| # | Item | Source (old v2.7 → new home) | Why deferred | What would reopen it | Depends on |
|---|---|---|---|---|---|
| 01 | `01-sp1-swipe-back-cache.md` SP1 swipe-back cache | old 16c (child of the removed 16 index) → v3.0 01 | S4 (≥ 3 natural swipe-backs per 100 player turns) is the deciding bar and only hand play can score it; S3's control made 0 reads; ST cannot swipe a non-last message | S4 ≥ 3 in the user's own play (≥ 300 turns), or a swipe-back left wrong state, or ST allows non-last swipes. **Otherwise auto-drop at the v3.0 freeze** (option (b), no counter; decided by the user 2026-10-03) | v2.8 01 (SP2 option A owns the mutation seam first); user's hand-played sessions |
| 02 | `02-sp9-witness-filter-v2.md` SP9 witness filter v2 (**moved to v2.8 42, owner 2026-10-14**) | old 22 → v3.0 02 (its option A shipped as v2.7 02 C2; K1/K2 fix in v2.7) | no accurate witness source (presence 4/40); host channels (Summarize, Vector Storage) leak regardless; stance change would promise privacy the host does not keep | sessions show characters acting on scenes they missed (not only secrets), and the user makes message-level privacy a goal; then B (extraction witness, offline, W4 ≥ 0.9) before any filter (C) | v2.7 02 C2 + **K1 fixed**; v2.8 21's offline presence-proxy result |
| 03 | `03-new-game-plus.md` New game plus: **moved to v2.8 45 (owner 2026-10-14)** | old 25 → v3.0 03 → v2.8 45 | the epilogue it would consume has never run live (`seal` off, no final chapter reached); nobody asked for it | the Q-M floors pass and `seal` ships (or an author opts in) **and** one live run reaches a `final` chapter; then B (typed outcome carry into a declared sequel) | v2.8 01 Q-M ratings; v2.7 06 plays index; v2.7 06 Continue list (option E) |
| 04 | `04-d6-t22-revisits.md` D6/T22 revisits (decision only) | old 23 → v3.0 04; the over-steer charter card, its completion contract and the sessions → v2.8 01 | D6/T22 defaults were reserved for a player session that has not happened; 1–3 decided (keep), 4 and 6 wait | the v2.8 01 over-steer session(s) (Claude's card + the user's play) hand over their digest; floors already predeclared in the plan | v2.8 01 card + sessions |
| 05.1 | `05-deferred-items.md` layered 2D rig | old 28 option D → v2.7 19 talking-sprites (D → here) | heavy build, auto-rig robustness unknown, Spine licence; user parked it | the v2.7 19 playtest asks for real head motion B + P cannot give | v2.7 18 sprite generation, v2.7 19 |
| 05.2 | SP10 tool-call turns, the rest | old 16d option A → v2.7 15 (B + C there) | nobody plays story chats with CC function calling | CC + tools in story chats, or a session finding on multi-boundary tool turns | v2.7 15 (probe removed; recipe in the v2.5 report) |
| 05.3 | C4 report-only staging panel | old 09 option E → v2.7 11 (close) | no author session asked for it | an author session finds jump staging wrong and painful to fix | v2.7 04 check registry (lands as a finding with an action) |
| 05.4 | Runtime verbatim recall (**moved to v2.8 43, owner 2026-10-14**) | old 29 B/P1/P5 → v2.8 21 (E0 + offline only) | in groups, recall needs a witness filter; unmeasured | E0 picks a winning arm (hit@4 ≥ 0.80), current VR1 and VR2 pass together on a fixture meeting v2.8 21 §6.2's minimums (≥ 20 positives, ≥ 20 nonce exclusions, ≥ 3 members, ≥ 2 secret scenes, ≥ 2 sessions), and a reversible witness record exists (old VR6 retired) | v2.8 21; v3.0 02 option B; v2.8 01 Q-M5 + P3 |
| 05.6 | Optional "Critic" role | v2.7 14 research decision 2 (home decided by the user 2026-10-03) | "after the wizard work" (v2.8 09) | v2.8 09 built, and the critic passes chains a different model rejects | v2.8 09; v2.7 14 role map |
| 05.5 | "Not in v2.7" items inside v2.8 plans (persona-fit judge, per-chat avatars, same-Jev hosts A5) | v2.8 03 / 08 / 14 | written before the split; placed in v3.0 by the user 2026-10-03 | per item, see `05-deferred-items.md` §05.5 | parent v2.8 plan |

## Order if reopened

**Superseded 2026-10-26** by §Replan 2026-10-26 §Recommended order; kept as history.

No build order is set. If several reopen at once, by dependency: 02 B before 05.4; 04 needs only v2.8 01's evidence
(decision, docs or a settings default); 01 and 03 are independent; 05.1 after v2.7 18/19.

## Status

| Plan | State |
|---|---|
| 01, 02, 04 | DEFERRED (user, 2026-10-03); user answers recorded inline; not scheduled before v2.8 closes |
| 03 | moved to v2.8 45 (owner 2026-10-14) |
| 05 | DEFERRED; entries recorded |
| 06 | `06-local-controller-perf.md` local controller performance: MTP n-max 2 ADOPTED 2026-10-25 (decode +35-52 %); depth-0 layout and stable head REJECTED by blind rating + privacy (reverted `cdbfd6a6`); reload timing uses a median |
| 07 | `07-inference-engine-eval.md` engine evaluation (SGLang, vLLM, ExLlamaV3, llama.cpp options): RESEARCH 2026-10-25, SPIKE 2026-10-26: ExLlamaV3 dropped (TTFT, RAM, Sol 3/8); b11888 + gateway member-state cache recommended (warm switch 9-10 s → 4.7-6.0 s) |
| 08 | `08-member-state-cache.md` per-member state cache: disk mode built 2026-10-26 and kept off (disk-bound saves); superseded by 09 RAM mode on the patched server |
| 09 | `09-controller-round-3.md` controller round 3: patched llama.cpp b11888 (`scripts/local/llama-patches/`) + RAM member cache 4 GiB LIVE on the owner controller 2026-10-26 (warm member switch 8.55 → 3.8 s, member turn 14.6 → 10.5 s; Sol 25 pairs better on all categories, thinking floor missed as written 23/25, owner adopted); 409 reserve-refusal fix + ComfyUI reclaim guards; chat-first queue built; max-memory profile, rewound entries + checkpoint_at, read reorder queued. Research: `research/` (web, Fable simulation, feature-impact audit, Astra review) |
| 10 | `10-max-memory-profile.md` max-memory profile + tray headroom toggle: STUB 2026-10-26 (replan track A2), floors TO DECIDE |
| 11 | `11-image-perf-after-unlock.md` image performance after the unlock, ComfyUI flags, image/text thrash: STUB 2026-10-26 (track B1), floors TO DECIDE |
| 15 | `15-end-test-batch.md` end test batch for the current wave (09 r3, A0, D1/D3/D5/D6/D8, C1, B1 prep, v2.9 freeze): DESIGN 2026-10-26, est. ~6 h GPU (up to ~7.2 h with conditionals), no-model and replay lanes in parallel |
| 12 | `12-witness-redesign.md` witness record redesign after v2.8 42 W4 FAIL: STUB 2026-10-26 (track C1), floors TO DECIDE |

## Decisions (user, 2026-10-03: as recommended)

| Question | Decided | Where |
|---|---|---|
| 01 park mechanism: (a) dev counter or (b) auto-drop | (b): no counter; auto-drop at the next freeze via `DROPPED_SPIKES` with a planted-import control, unless S4 data exists | v3.0 01 §Park mechanism |
| 05.5: the three "not in v2.7" items inside v2.8 plans (persona-fit judge, per-chat avatars, same-Jev hosts A5) | v3.0 scope; entries decided; v2.8 03 / 08 / 14 point here | v3.0 05 §05.5 |
| Optional "Critic" role (v2.7 14 decision 2, "after the wizard work") | here, as 05.6 | v3.0 05 §05.6 |

## Review 2026-10-03

Round 3 (Sol): R3-14, R3-15 applied; R3-15's homes decided by the user 2026-10-03.
