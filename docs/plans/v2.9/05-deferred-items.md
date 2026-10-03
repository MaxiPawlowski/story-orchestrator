# 05 — Deferred items (no plan of their own)

**Status: DEFERRED to v2.9 (user, 2026-10-03).** Parts of plans that moved to v2.7 or v2.8 at the version split, whose
deferred remainder lives here so the parent plan can close. Each entry: context, decision so far, reopen trigger,
source. Old → new numbers: `docs/plans/v2.7/RENUMBER.md`. Overview: `00-overview.md` (this folder).

## 05.1 Layered 2D rig (old v2.7 28 option D)

- **Context.** Real head turns and parallax for sprites: See-through (one image → up to 23 inpainted layers) + an
  auto-rig (Stretchy Studio / Iki / Inochi2D) + a WebGL mesh runtime per actor. Heavy build (12–16 GB VRAM, 2–3 min per
  image), one rig per sprite set, auto-rig robustness on our art not determined. Spine export unusable for a public
  plugin (every end user needs a Spine Editor licence). The user had dropped this route on 2026-09-29.
- **Decision so far.** v2.8 07 talking-sprites builds B (build-time blink/talk frames + animator) + P (procedural idle).
  D: "parked for next version" (user, decision 5).
- **Reopen trigger.** The v2.8 07 playtest asks for real head motion that B + P cannot give, and v2.8 06 sprite
  generation is in place to produce the base images. Start with a spike on 2–3 sets (rig success rate, VRAM, runtime
  cost with N actors on one canvas).
- **Source.** `docs/plans/v2.8/07-talking-sprites.md` options table row D (`:100`), "Why not D now" (`:184`), decision 5
  (`:235-236`), review note (`:276`).

## 05.2 SP10 tool-call turns, the rest (old v2.7 16d option A)

- **Context.** With Chat Completion function calling, one player turn renders a reply, a tool call and a continuation:
  several boundaries per player turn. v2.5's fold failed its invariant; Q1/Q2 never ran.
- **Decision so far.** v2.7 15 takes B (README note) + C (remove the Q1 probe, `DROPPED_SPIKES` + planted-import control).
  The install has no CC function calling in story chats, so option A (D3: 20 recorded CC tool turns, Q1/Q2 ×2, then a
  possible "fold the work, keep the boundary" spike with its own rollback ≡ replay bar) is deferred.
- **Reopen trigger.** The user or a target player plays story chats with CC + tools; a session finding shows a tool chain
  committing several boundaries in one player turn and pacing or a transition going wrong; a tool-bearing extension
  joins the tested setup. Recipe: `v2.5/09-sp10-spike-report.md:30-39` (the probe is removed; rebuild from the report).
- **Source.** `docs/plans/v2.7/15-sp10-tool-call-turns.md` §Options, §Proposal "What reopens it", §Review of the answers.

## 05.3 C4 report-only staging panel (old v2.7 09 option E)

- **Context.** After a jump (`/cp activate` or an author advance), the skipped checkpoints' staging (AN, background,
  scenario, cast, World Info) is not applied. E = an author-view panel listing what the skipped checkpoints would have
  applied, with one-click apply per row. Cost S, reads the graph only.
- **Decision so far.** v2.7 11 closes the seed (keep option (c), no re-stage). E: "what u recommend, lets defer to the
  next version" (recommended: only if an author session asks for it).
- **Reopen trigger.** An author session (user or v2.8 01 card) reports a jump left staging wrong and fixing it by hand
  was painful. Lands as a check-registry finding (v2.7 04) with an `action`, not a new panel, unless the list is long.
- **Source.** `docs/plans/v2.7/11-c4-option-b-restage.md` options row E (`:62`), decision 2 (`:74`).

## 05.4 Runtime verbatim recall (old v2.7 29 options B/P1/P5)

- **Context.** Our tiers cover summarised memory; what is missing is getting an exact past message back ("what exactly
  did X promise"). In a group (stories are group-only, v2.7 03) recall must be filtered by who witnessed the message, or
  it re-opens the leak that per-member privacy closed.
- **Decision so far.** v2.8 21 builds E0 (ranking evaluation, 5 arms, predeclared floors) and the offline group
  evaluation with a scene-presence witness proxy, nothing at runtime. Runtime recall (an index on the reply path, P1
  message index or P2 row → raw range, per-member filter P5) is deferred (review split item 9).
- **Reopen trigger.** All of: v2.8 21's E0 picks a ranking arm that meets hit@4 ≥ 0.80; its offline witness evaluation
  passes "no unwitnessed text" (VR6, witnessed-positive plus unwitnessed-exclusion in one fixture, review F29); and a
  witness record that reverses with the message exists, which is v2.9 02 option B. If the presence proxy passes on its
  own, runtime recall may start from it instead of waiting on 02 B; if not (v2.6 measured 4/40), it waits on 02 B.
- **Dependency.** v2.9 02 (witness source); v2.8 01 Q-M5 with the P3 arm (the archive recall it is compared against).
- **Source.** `docs/plans/v2.8/21-smart-context-harvest.md` §6 (VR1–VR6), §Review of the answers; v2.8 overview row 21.

## 05.5 Items marked "not in v2.7" inside v2.8 plans (placement not confirmed)

These were written as "not in v2.7" before the split moved their parent plans to v2.8. None says "next version", so
whether each is v2.8 scope or v2.9 is open (question for the user). Listed here so they are not lost.

| Item | Parent | Decision so far | Reopen trigger | Source |
|---|---|---|---|---|
| Judge "does this persona fit the story" check | v2.8 03 player persona | "not in v2.7": no calibrated use; deterministic fit check (C) only | a calibrated judge use (20-case fixture + provider row) and a session where the deterministic check missed a misfit | `v2.8/03-player-persona-and-start-setup.md:107`, decision 5 `:193` |
| Per-chat avatars (`force_avatar`) | v2.8 08 living cards | "not in v2.7"; revisit with on-demand images | v2.8 08's on-demand look sprites exist (after v2.8 06), so an image per look is available; group-save overwrite (`script.js:6767-6773`) and swipe rebuild measured first | `v2.8/08-living-cards.md:128-139`, decision 11 `:240`, `:274` |
| Same-Jev other hosts (A5) | v2.8 14 open-source Jev | "not in v2.7" unless TypeSafe pricing or availability changes | TypeSafe changes price, limits or availability | `v2.8/14-open-source-jev.md:250`, decision 7 `:293-297` |

## Not placed here

- **Optional "Critic" role** (v2.7 14 decision 4: "optional, after the wizard work", answered "sure"). Not deferred by
  the user; it has no home after the split (v2.7 14 builds the role picker; the wizard work is v2.8 09). Question for
  the user.

## Review 2026-10-03

Created at the split. Applied from `docs/plans/v2.7/review-2026-10-03.md` (old numbers there): split item 9 (05.4),
**F29** (05.4 reopen trigger), **B12**/**F36** (version-qualified refs). Group-only per v2.7 03.
