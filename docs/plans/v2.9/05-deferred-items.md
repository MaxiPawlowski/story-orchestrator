# 05 — Deferred items (no plan of their own)

**Status: DEFERRED to v2.9 (user, 2026-10-03).** Parts of plans that moved to v2.7 or v2.8 at the version split, whose
deferred remainder lives here so the parent plan can close. Each entry: context, decision so far, reopen trigger,
source. Old → new numbers: `docs/plans/v2.7/RENUMBER.md`. Overview: `00-overview.md` (this folder).

## 05.1 Layered 2D rig (old v2.7 28 option D)

- **Context.** Real head turns and parallax for sprites: See-through (one image → up to 23 inpainted layers) + an
  auto-rig (Stretchy Studio / Iki / Inochi2D) + a WebGL mesh runtime per actor. Heavy build (12–16 GB VRAM, 2–3 min per
  image), one rig per sprite set, auto-rig robustness on our art not determined. Spine export unusable for a public
  plugin (every end user needs a Spine Editor licence). The user had dropped this route on 2026-09-29.
- **Decision so far.** v2.7 19 talking-sprites builds B (build-time blink/talk frames + animator) + P (procedural idle).
  D: "parked for next version" (user, decision 5).
- **Reopen trigger.** The v2.7 19 playtest asks for real head motion that B + P cannot give, and v2.7 18 sprite
  generation is in place to produce the base images. Start with a spike on 2–3 sets (rig success rate, VRAM, runtime
  cost with N actors on one canvas).
- **Source** (anchors refreshed 2026-10-03, Sol r3 R3-19). `docs/plans/v2.7/19-talking-sprites.md` options table row D
  (`:110`), "Why not D now" (`:224`), §7 decision 5 (`:279-280`), review note "Rig option D" (`:362`).

## 05.2 SP10 tool-call turns, the rest (old v2.7 16d option A)

- **Context.** With Chat Completion function calling, one player turn renders a reply, a tool call and a continuation:
  several boundaries per player turn. v2.5's fold failed its invariant; Q1/Q2 never ran.
- **Decision so far.** v2.7 15 takes B (README note) + C (remove the Q1 probe, `DROPPED_SPIKES` + planted-import control).
  The install has no CC function calling in story chats, so option A (D3: 20 recorded CC tool turns, Q1/Q2 ×2, then a
  possible "fold the work, keep the boundary" spike with its own rollback ≡ replay bar) is deferred.
- **Reopen trigger (any one).** The user or a target player plays story chats with CC + tools; a session finding shows a
  tool chain committing several boundaries in one player turn and pacing or a transition going wrong because of it; a
  tool-bearing extension joins the tested setup. Then option A, starting with D3. Recipe:
  `v2.5/09-sp10-spike-report.md:30-39` (the probe is removed; rebuild from the report).
- **Floor and gates if reopened (canonical here; moved from v2.7 15, Sol r3 R3-21).** D3 first: ≥ 20 recorded CC tool
  turns (a CC profile with tools, `enable_thinking: false` kwargs per `.claude/rules/gotchas.md`; a tool-bearing
  extension or a `/tools-register` dummy). Q1/Q2 on them ×2 consecutive on one lane, run header diff around the batch.
  Any new fold (work-only): conditions restated first; rollback ≡ replay over 4 seeds with a fold-off control at 0
  divergent; then J6 ×2. Tier: D for the fold and rollback cases, CL or RP for the recorded tool turns (named in the
  record).
- **Source.** `docs/plans/v2.7/15-sp10-tool-call-turns.md` §Options, §Proposal "What reopens it", §Review of the answers.

## 05.3 C4 report-only staging panel (old v2.7 09 option E)

- **Context.** After a jump (`/cp activate` or an author advance), the skipped checkpoints' staging (AN, background,
  scenario, cast, World Info) is not applied. E = an author-view panel listing what the skipped checkpoints would have
  applied, with one-click apply per row. Cost S, reads the graph only.
- **Decision so far.** v2.7 11 closes the seed (keep option (c), no re-stage). E: "what u recommend, lets defer to the
  next version" (recommended: only if an author session asks for it).
- **Reopen trigger.** An author session (user or v2.8 01 card) reports a jump left staging wrong and fixing it by hand
  was painful. Lands as a check-registry finding (v2.7 04) with an `action`, not a new panel, unless the list is long.
- **Gates if E is reopened (canonical here; moved from v2.7 11, Sol r3 R3-21).** Runtime/UI tier: `npm run gates` (jest
  for the pure "skipped staging" reader, Storybook play for the panel row or the check row) + live gate (`so-scenario`
  jump on a fixture story, the panel or finding lists the skipped effects; `so-ui assert-player-clean`). Tier D.
- **If a re-stage build (v2.7 11 options (b)/C/D) is ever reopened instead (canonical here).** Predeclared before any
  build. Trigger: at least 2 sessions (user or Claude, player or author) where a jump target played wrongly **because**
  inherited staging was missing, each with a journal line and the checkpoint's missing effect named; harness starts do
  not count (they have `setup.members`). Data first (no model): over the campaign data and `test/fixtures/*.story.json`,
  count checkpoints that author no AN/background/scenario/cast of their own and inherit one from every predecessor
  (needs-inheritance), and how many of those have ≥ 2 predecessor paths that would stage differently (ambiguous). Floor
  for (b)/(D): on that census, the chosen path stages the target identically to the played path in ≥ 95 % of
  needs-inheritance checkpoints reached in recorded sessions; 0 cast writes outside the story's roster. Gates (runtime
  tier): `npm run gates`; jest per effect kind (jump == played path on a linear fixture; ambiguity rule on a branching
  one); `rollback ≡ replay` across a jump; live no-LLM scenario on a group (cast restored after cleanup).
- **Source.** `docs/plans/v2.7/11-c4-option-b-restage.md` options row E (`:65`), decision 2 (`:77`), §Floor, measurement
  and gates if reopened (pointer here).

## 05.4 Runtime verbatim recall (old v2.7 29 options B/P1/P5)

- **Context.** Our tiers cover summarised memory; what is missing is getting an exact past message back ("what exactly
  did X promise"). In a group (stories are group-only, v2.7 03) recall must be filtered by who witnessed the message, or
  it re-opens the leak that per-member privacy closed.
- **Decision so far.** v2.8 21 builds E0 (ranking evaluation, 5 arms, predeclared floors) and the offline group
  evaluation with a scene-presence witness proxy, nothing at runtime. Runtime recall (an index on the reply path, P1
  message index or P2 row → raw range, per-member filter P5) is deferred (review split item 9).
- **Reopen trigger.** All of: v2.8 21's E0 picks a ranking arm that meets hit@4 ≥ 0.80 (a winner, not the diagnostic
  arm); its offline witness evaluation passes **current VR1 and VR2 together, in the same run** (v2.8 21 §6.2: VR1
  witnessed positives, gold in the filtered top 4 ≥ 0.70; VR2 unwitnessed exclusions, nonce text in the filtered top 4
  = 0), on a fixture that meets §6.2's minimums (≥ 20 witnessed positives, ≥ 20 unwitnessed exclusions with nonce
  markers, ≥ 3 asking members, ≥ 2 scenes holding a `[hiding]`/`[unaware]` row, ≥ 2 sessions; a fixture below them is
  refused, not scored) (review F29; Sol r3 R3-14: the old VR6 is retired and no longer exists); and a witness record
  that reverses with the message exists, which is v2.9 02 option B. If the presence proxy passes on its
  own, runtime recall may start from it instead of waiting on 02 B; if not (v2.6 measured 4/40), it waits on 02 B.
- **Dependency.** v2.9 02 (witness source); v2.8 01 Q-M5 with the P3 arm (the archive recall it is compared against).
- **Source.** `docs/plans/v2.8/21-smart-context-harvest.md` §6.2 (VR1–VR5; VR1 + VR2 joint), §Review of the answers;
  v2.8 overview row 21.

## 05.5 Items marked "not in v2.7" inside v2.8 plans (placed in v2.9: user, 2026-10-03)

These were written as "not in v2.7" before the split moved their parent plans to v2.8. **Decided 2026-10-03 (user: as
recommended): all three are v2.9**, deferred with the reopen triggers below; the parent v2.8 plans point here.

| Item | Parent | Decision so far | Reopen trigger | Source |
|---|---|---|---|---|
| Judge "does this persona fit the story" check | v2.8 03 player persona | deferred to v2.9 (2026-10-03); v2.8 03 ships the deterministic fit check (C) only | a calibrated judge use (20-case fixture + provider row) and a session where the deterministic check missed a misfit | `v2.8/03-player-persona-and-start-setup.md` options row C (`:111`), "No judge fit check" (`:167`), decision 5 (`:255`) |
| Per-chat avatars (`force_avatar`) | v2.7 20 living cards | deferred to v2.9 (2026-10-03); revisit with on-demand images | v2.7 20's on-demand look sprites exist (after v2.7 18), so an image per look is available; group-save overwrite (`script.js:6767-6773`) and swipe rebuild measured first | `v2.7/20-living-cards.md` §Avatars (`:180-191`), recommendation "avatars deferred" (`:272`), decision 11 (`:315`) |
| Same-Jev other hosts (A5) | v2.8 14 open-source Jev | deferred to v2.9 (2026-10-03); not measured unless TypeSafe pricing or availability changes | TypeSafe changes price, limits or availability | `v2.8/14-open-source-jev.md` research note 7 (`:260`), options row A5 (`:297`), decision 7 (`:344-348`) |

## 05.6 Optional "Critic" role (v2.7 14 research decision 2; placed here by the user 2026-10-03)

- **Context.** The generation critic inherits the `authoring` role (`generation/critic.ts:105`), so it grades with the
  generator's own model. An optional eighth role would let it run on a different model and reduce self-grading.
- **Decision so far.** v2.7 14 research decision 2: "optional, after the wizard work", answered "sure". The wizard work
  is v2.8 09, so the role cannot land before v2.8 closes; placed here (Sol r3 R3-15; decided by the user 2026-10-03,
  as recommended).
- **Reopen trigger.** v2.8 09 is built and accepted, and an author session or an expansion review shows the critic
  passing chains a different model rejects. First gate: the critic's existing golden on two models (same and
  different from the generator), predeclared floor, CL.
- **Source.** `docs/plans/v2.7/14-b10-cli-judge.md` §Decisions for the user (this research) decision 2, the role-map
  "Critic" rows.

## Review 2026-10-03

Created at the split. Applied from `docs/plans/v2.7/review-2026-10-03.md` (old numbers there): split item 9 (05.4),
**F29** (05.4 reopen trigger), **B12**/**F36** (version-qualified refs). Group-only per v2.7 03.

Round 3 (Sol): R3-14, R3-15 (05.6 Critic; decided by the user 2026-10-03), R3-19, R3-21 applied. 2026-10-03 (user: as
recommended): 05.5 placed in v2.9, 05.6 confirmed.
