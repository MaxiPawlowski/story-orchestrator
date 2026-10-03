# Plan 01 — v2.7 carry-over: owed acceptance and model-driven carry-in

**Status (2026-10-03): v2.8 plan 01 (new; extracted from v2.7 02, 08, 10, 12/12a and v2.9 04). Items decided by the user
on 2026-10-03; nothing in this plan is built or run yet.** Overview: `00-overview.md`.
**Gate tiers** (00-overview §Gate taxonomy): implementation D (option A, R4 lift, C12 batching, C11 F2/F7); acceptance
RP, CL and LI per row.

## Why

v2.7 builds only work whose gates are deterministic (`v2.7/RENUMBER.md`). Sol's split review (item 2) found that v2.7
code already merged still owes real-model acceptance rows, and that npm gates cannot close them. This plan owns those
rows, the model-consuming carry-in items from v2.7 02, and the decided pieces of v2.7 08, 10 and 12 that need a model.
A row here closes only with its acceptance tier green.

## A. Owed acceptance of merged v2.7 work

Source: each plan's gate record. Tier D rows are owed live checks that need no model. They close in v2.7 when its live
gate runs, and are listed here only so nothing is lost. If v2.7 freezes without them, they become v2.8 rows.

| # | Built in | Owed check | Tier | Source |
|---|---|---|---|---|
| O1 | v2.7 01 docs | fresh install (adolion-fresh lane, our settings cleared) reaches a first real reply using only in-app guidance | RP (or a CL profile, named in the record) | `v2.7/01-docs-and-in-app-guidance.md` §Gates "Live", §Not run |
| O2 | v2.7 01 docs | `assert-player-clean` with Help open, Show-me landings, the settings-header "?", the inline legend | D | same, §Not run |
| O3 | v2.7 02 C6 | one real image cue on a beat with and without `player_name` (no internal checkpoint name in the prompt) | LI + CL (director profile) | `v2.7/02-v26-carry-in.md` §Gate record C6–C10 |
| O4 | v2.7 02 C7 | fired vs unfired `Appearance:` entry: only the fired one reaches the image prompt | LI + RP (lore must fire in real play) | same |
| O5 | v2.7 02 C8 | `illustrate: false` beat produces no automatic cue; a chapter look override applies | LI | same |
| O6 | v2.7 02 C9 | narrator/system member gives no card-description look | LI | same |
| O7 | v2.7 02 C10 | one real curator pass on a story with `stagecraft.exclude`: the excluded entry is never shown or written | CL (curator profile) | same |
| O8 | v2.7 02 C2 | group story with a held `[hiding]` row + Summarize/chat vectors on → row and `#so-hud-setup` in player mode, clear when off. After the K1 fix (v2.7) the player copy must be identical with and without held secrets | D (seeded row) | `v2.7/02-v26-carry-in.md` §Gate record C2; review K1, F34 |
| O9 | v2.7 08 warning | `fix` overlay + harvest on → row, HUD chip and harvest line after 5 real replies, in player and author view; `thinking` overlay → none | RP | `v2.7/08-thinking-per-story.md` §Gate record |
| O10 | v2.7 10 option C | edit the newest reply in a playing chat → pipeline `catching-up` until the re-read audit lands | CL (read role) | `v2.7/10-sp2-recommit-v2.md` §Gate record |
| O11 | v2.7 09 commitment | `so-journal.mts show` on a held commitment row from real play | CL | `v2.7/09-commitment-double-negatives.md` §Gate record |
| O13 | v2.7 02 C1 | the SP5.b story-owned scenario in real replies (the scenario reaches the prompt and the reply follows it), beyond v2.8 16's C1–C5 dry-run plumbing (tier D there); the real-reply acceptance of SP5 (decided by the user 2026-10-03, as recommended) | RP | `v2.7/02-v26-carry-in.md` C1; v2.8 16 |
| O13b | v2.7 02 C1 | wizard/agent model input changed by C1: the guide topic list gains `scenario`, the `experimental-effects` topic text changes, `setCheckpointEffects` tool doc names `scenario`. Acceptance: one agentic-wizard authoring run on a cloud profile proposes a valid `effects.scenario` when asked and never otherwise (W1-style checks, ×2) | CL (authoring profile) | `v2.7/02-v26-carry-in.md` C1 |
| O16 | v2.7 03 (D5) | wizard/agent prompt line changed: every story needs its group, one-member rosters included (`agent/prompt.ts`, `finish.ts`). Acceptance: one agentic authoring run for a one-character story creates/asks for a group with that member (and the narrator when the story has one), ×2 | CL (authoring profile) | `v2.7/03-group-chats-only.md` §Gate record |
| O14 | v2.7 02 C13 | promoted SP8 curator tiers under a real curator pass (C13-b covers prompt changes only) | CL (curator profile) | `v2.7/02-v26-carry-in.md` C13 |
| O12 | every merged v2.7 plan | its own "Live: NOT run" line, as recorded at merge | per row | each gate record |
| O15 | v2.7 07 A7 briefings | independent second-model content review of every story and Saga chapter briefing (spoiler terms beyond `check_player_copy.py`, agreement with the authored player copy); rater named in the record, never the user (rule 11). v2.7 closes A7 on its deterministic checks only | CL (second-model rater) | `v2.7/07-adolion-campaign.md` A7 |

The v2.7 close-out walks its gate records and adds any row missing here before v2.7 freezes.

## B. Carry-in from v2.7 02 (model-consuming)

| # | Item | What | Tier | Gate |
|---|---|---|---|---|
| C3 | **Warden and lore-check timeouts** | pooled over the playtest, warden calls timed out 7.2% and lore-check calls 3.9%, both above J2's 1-in-50 bar. Find out whether it is the 4000 ms budget, plugin queueing or provider latency before tuning anything. Runs on the first v2.7 build (decision: v2.6 stays untouched) | CL (TypeSafe) | formal `so-judge timeouts` ×2 (was v2.6's owed R4); the floor stays 1 in 50, never retuned |
| C4 | **Separate-arm live checks** | the warden-lore runtime shipped as a separate call (kept by v2.7 13); R4, R6 and the G-L7 J8 on/off checks were owed to v2.6 plan 15 Part B | CL + RP | as written in `v2.6/04-remaining-builds.md` §L7 (`:536-540`) |
| C12 | **Lore select costs 5 judge requests per turn** | campaign lab finding C11 | CL | measure the per-turn request count on the campaign; then batch the questions into fewer requests (v2.8 13 notes extra questions on an existing call cost almost nothing). Floors: lore-select answers unchanged on the frozen fixture; requests per turn recorded before and after |
| C11-F2 | **`commit_evidence` per value** | today per quality, not per value (campaign F2). Commitment semantics change (Sol split item 3) | D impl; CL acceptance | its own short plan section first (problem, floor, gate); then jest + the live suite's commitment fixtures |
| C11-F7 | **Chain voice ignores `no_repeat`** | model-driven chain behaviour (campaign F7) | D impl; RP acceptance | own plan section first; acceptance in the final suite |
| C11-F1 | **Judge-typed evidence cut to 160 chars** | evidence handling (campaign F1) | assign after its plan | Sol split item 3: its downstream acceptance effects must be stated before it is placed. Display/journal parts go to v2.7 |
| C13-b | **SP8 digest or prompt changes** | exact promotion of the measured tiers/spans is v2.7 02 C13 (deterministic). Any digest or changed curator prompt is here | CL | the SP8 floors from `v2.6/03-sp8-restated.md`, re-run, never retuned |
| C14-b | **Enlarged extraction inputs** | v2.7 02 C14 fixes the 8192 context default with a model-specific context table (deterministic tests). Any extraction input that grows as a result keeps a real-model acceptance row (Sol split item 5) | CL | the live suite tiers at their floors on the enlarged input |

## C. SP2 re-commit after edit, v2 — option A (approved)

From `v2.7/10-sp2-recommit-v2.md` (old 08). The user's answer to its decision 1, verbatim: "Yes, i do. This is actually
an important feature for me." Option C (the "catching up after your edit" status) is built in v2.7 10; A is built here.

- **Design (A).** The spike's three steps (roll back; re-enqueue untouched writes and commit; one read of the edited
  text; commit), plus:
  1. a settle window per message id, so a burst becomes one cycle on the last text;
  2. a hold in the interceptor's `hold` slot that waits for a pending cycle, **loud generations only, 15 s cap**; on
     timeout go ahead and journal "the edit was not read in time" (decision 3: "Whatever u recommend");
  3. the cycle takes a `RunOwnership`;
  4. re-stage what `GENERATION_STARTED` set;
  5. a defined C12 interaction: re-fire the transition only when the edited text still satisfies the gate.
- **Step 0 (review A12, refined).** Identify the post-processor the user actually runs, and trace its event order
  against our boundary (does its rewrite land before or after our commit?). Recast-shaped bursts stay as regression
  fixtures (scripted emitter); Recast itself need not be installed. Also explain v2.6's 180 s "no audit" case from
  `test/measurements/v2.6-03/sp2/`.
- **Floors** (predeclared, unchanged from v2.7 10 §Floor; R5′ approved in decision 4):

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

- **Gates.** `npm run gates`; ownership census row for the new async writer; fault-matrix row for the new mutation
  shape; bundle budget: `scripts/release/buildChecks.mjs` `BUNDLE_BUDGET_BYTES` = 1,250,000; prod bundle `dae0b664a5f8`
  (2026-10-03) is 1,115,323 B, headroom 134,677 B (review A15). Live: V3/V4 real-LLM on an adolion-fresh lane ×2, J6 ×2,
  run-header diff around the batch. Tier: D impl, RP + CL (read role) acceptance.
- Ships behind a dev flag until V0–V8 pass twice (rule 9), then default on (it is a correctness fix the user asked
  for; the switch stays for one release).

## D. Funded thinking A/B (one candidate)

From `v2.7/12-model-choice.md` decision 4 (answer "yes") and `v2.7/12a-model-switch-checklist.md` §2 (review F04).
Keep Artemis v1.1 unless the candidate wins.

- **Candidate:** Cydonia 24B v4.3 or Skyfall 31B v4.2 (one; chosen at step 1 of 12a, recorded with GGUF source and
  sha256).
- **Kit:** `C:\dev\so-lanes\artemis-think\`, the existing 20 blind turns and A/B bodies.
- **Floors** (`v2.7/12-model-choice.md` §Floor): damage and loops ≤ the incumbent's on the same bodies and seeds
  (0/20, 0/20); with thinking, empty replies ≤ 2/20 and wrong speaker 0 in group bodies; blind preference ≥ 60 %
  (rater: Astra, delegated); then T0/T1/T3 subset ×1.
- **Budget:** about 2–3 pod-hours, recorded in `test/sessions/BUDGET.md` before the run.
- If it wins: 12a §3 in order. If not: record the numbers and close. Tier: RP.

## E. Story and checkpoint thinking level (R4)

From `v2.7/08-thinking-per-story.md` option B (decisions 1 and 3: yes; 6: Astra rates). The warning (option A) is built
in v2.7 08; option C (turning thinking on from a non-thinking setup) is refused (decision 2).

- **Mechanism:** story `reasoning` default → checkpoint `effects.reasoning` → install `extraction.replyEffort`, through
  the existing `armFor`; lift the `__SO_DEV__ && spikes.reasoningEffect` gate in `replyEffortLive.ts` only after R4
  passes. It sets a level within a setup that thinks; never opens a thought.
- **Studio:** a story-level control; a warning on `low` where talk control drafts a group (budget 128 broke form 4/40).
- **Floor (R4, unchanged):** blind A/B on 20 climax turns across 2 stories, arm preferred ≥ 60 %, p95 latency ≤ 2× the
  control; arm = checkpoint `high`, control = install `medium`. Data: 16 more pairs (4 of 20 exist,
  `test/sessions/rating-pack/R4/status.json`).
- **Also owed:** the reply-effort ST live gate (off/low/medium/high × n ≥ 3 group turns, memory requests carry no
  budget key, a CC arm), `v2.6/05-reasoning-control.md` §Live.
- Gates: `npm run gates`; live per CLAUDE.md runtime tier; guide topic + registry entry (rule 10). Tier: D impl, RP
  acceptance.

## F. Frozen v2.6 measurements (owner: this plan)

v2.6 is frozen; its unmeasured floors are owned here (review F17, C3, D10). Each runs on the current build, with the
floor exactly as v2.6 declared it.

| # | Measurement | Floor source | Data today | Unblocks | Tier |
|---|---|---|---|---|---|
| M1 | **Q-M5** archive recall, with **P3** (query by recent messages) as an arm | `v2.6/07-chapters-and-saga-memory.md:502` (+0.10 needle recall, no rise in wrong answers) | Q-M pack 1/20 pairs | D10 default; v2.8 21 E0/spike order | CL + RP |
| M2 | **Inner voice B2** (reasoning harvest) floors: intent precision ≥ 0.80, meta-commentary rejected ≥ 0.95; the live-suite `intents` tier (scorer not built) | `v2.6/06-inner-voice.md:63-67,271` | none found | harvest default; v2.8 20 L5 | RP |
| M3 | **Inner voice C** (inner beat) pack | `v2.6/06-inner-voice.md` §C | C3 pack 1/30 | beat default; v2.8 20 L5 | RP |
| M4 | **W6** wizard pack | v2.6 plan 11 | 1/10 | — | CL |
| M5 | the other Part B measurements still unrated (03 spikes, 05 R3, 07 Q-M1..Q-M7, 12 B/C) | `v2.6/00-overview.md` status row | see each pack's `status.json` | per plan | per row |

Ratings of Adolion content go to Astra (delegated) or a second model, never the user (rule 11). The `intents` tier
scorer is built first (D) so M2 can count.

## G. Claude's over-steer session (from v2.9 04)

The D6/T22 decision stays deferred in `v2.9/04-d6-t22-revisits.md` (decision 6: "defer"). The user's answer to its
decision 5, verbatim: "i'll play it, but add a tesst case so that claude also plays it." This plan owns Claude's half
(review C9, refined: the session floors already exist in v2.9 04; the card and its completion contract were missing).

- **Charter card** in `test/sessions/charters.json` (validated, `14-cards.md` regenerated): one session of ≥ 40 turns
  on a story whose outcome qualities stay at `evidence_from: any`, warden accept mode `auto`, `agencyCheck` on.
  Claude plays a player who sometimes declares outcomes and sometimes goes silent (the two near-miss shapes from v2.6
  T1). Runs on an adolion-fresh lane with the overview's baseline settings.
- **Completion contract** (the full v2.9 04 hand-off, Sol r3 R3-08): the session is VALID (so-session stop exit 0);
  the digest counts agency notes **raised, accepted and applied** per 100 turns, every reply the check flagged, replies
  that narrated the player, and declarations counted as world outcomes; **every applied note** (the eligible set for
  the T22 80 % / zero floors) carries one rating, `helpful | invisible | OOC | over-corrected`, from a second-model
  rater named in the record (Adolion content: never the user, rule 11); the T0–T7 journal count v2.9 04 asks for is
  attached. A note without a rating leaves the session **incomplete**, not scored. Each counted case is quoted in the
  session dir (private `so-sessions`, not the public repo). The v2.9 04 floors are then scored against this session
  and, separately, against the user's.
- It does not decide D6/T22. It produces the evidence v2.9 04 decides on. Tier: RP (replies) + CL (judge).

## Gates (plan close)

- Every row in §A–§G carries its own gate above; the plan closes when every row is green or explicitly re-assigned
  with the user's agreement.
- `npm run gates` for every code change (C, E, C12, C11-F2/F7, the `intents` scorer).
- Real-LLM rows ride the v2.8 final suite where they are regression, and run on their own where a decision waits on
  them (rule 8).

## Links

v2.7 01, 02, 08, 09, 10, 12, 12a (sources); v2.9 04 D6/T22 (the decision this session feeds); v2.8 13 (C12 batching
shares the judge request shape); v2.8 15 (R5′ changes if the cue and scene reads merge); v2.8 20 (inner voice L5 needs
M2/M3); v2.8 21 (Q-M5 before its spike).

## Review 2026-10-03

Applied: F02 (option A scheduled, §C), F04 (funded A/B, §D), F17 + D10 (owner for Q-M5/P3 and the frozen v2.6
measurements, §F), C3 (inner-voice promotion owner, §F), C9 refined (Claude's card + completion contract, §G), A12
refined (actual post-processor, Recast-shaped fixtures, §C step 0), A15 refined (`buildChecks.mjs` + named build, §C),
Sol split items 2, 3, 4, 5 (§A, §B), F15 (tiers per row). Not placed here: K1/K2/K3 and C14's picker (v2.7).

Round 3 (Sol): R3-02 (O15), R3-08, R3-20 (O13; decided by the user 2026-10-03, as recommended) applied.
