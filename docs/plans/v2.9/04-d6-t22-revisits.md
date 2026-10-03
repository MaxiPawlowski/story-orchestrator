# Plan 23 — D6/T22 revisits

**Status: SEED from v2.6, not approved.** Source: `docs/plans/v2.6/v2.7-seeds.md` row "D6/T22 revisits". Overview: `00-overview.md`.

## What it is (plain words, 3–6 lines)

Two agency defaults that every version since v2.4 has said "decide after a player session". Neither has had one played
by the user.
- **D6** (v2.4 decision on item **T15**): can a player's own line prove that something *happened* in the world? Today
  yes, by default (`evidence_from: any`). The two opt-ins are `evidence_from: "world"`/`"party"` per quality, and a
  "the player writes attempts; the world decides" prompt clause (`player_attempts_only`, off).
- **T22** (v2.4 item): a judge check after each reply asking "did this reply write what only the player does, says or
  decides?". If it did, the next prompt carries a one-turn note, delivered through the continuity warden. Never a reroll.
- The revisit asks: should any of these defaults change, now that sessions exist?

Name clash: in v2.4's D6 text, "C4" means v2.3 plan 07's rule "absent agency = the defaults". It is not v2.6's jump
call C4 (plan 14).

## History and evidence

### Origin (v2.4 research)

- **T15** came from the extension research. st-gamemaster rewrites the player's attempt for the main model, which
  backs only the steering half. The evidence rule is "our own derivation". The problem it targets: "a player can
  currently satisfy an outcome gate by declaring it". Sources: `docs/plans/v2.4/extension-research/SUMMARY.md:428-436`,
  open question 5 at `:791`.
- **T22** came from Jeved's "Puppet" rubric, a tested 0–4 scale that separates perception, restating and small reactions
  from player choices. Reddit sensor ideas fed in too. Problem: agency was prompt-only, and nothing measured whether
  replies narrate the player's compliance. Sources: `SUMMARY.md:224, :264, :549-560`, open question 13 at `:799`.
  The research says T22 "overlaps T15's 'player writes attempts' clause … should be decided together" (`:559`).
- The same Jeved line produced **T23 house rules** (`docs/plans/v2.4/07-judge.md` §5). That is a sibling and out of
  this plan's scope.

### Decisions

| When | Decision | Where |
|---|---|---|
| v2.4, 2026-09-24 | **D6: opt-in.** `evidence_from` defaults to `any`. A Studio diagnostic suggests `world` for outcome qualities gating an anchor. The attempts clause is opt-in. "Revisit after a player session, together with T22." Why: a default change silently alters how every existing story's gates fire, and no session has measured the need | `docs/plans/v2.4/00-overview.md:394`, `:205-211` |
| v2.4 X13 | D6 is per **checkpoint** (`AgencyPolicy.player_attempts_only`), not per story | `v2.4/00-overview.md:444` |
| v2.4 X22 | T22 gets its own key `judge.uses.agencyCheck`, off by default, sharing the warden's accept mode (default `review`) | `v2.4/00-overview.md:453` |
| v2.4 plan 07 | "T22 inherits T15 (D6)". A reply that decides the outcome of a stated attempt from the world counts as clean, whether or not the attempts clause is on | `docs/plans/v2.4/07-judge.md:1220-1222` |
| v2.5 C6 | "Keep the defaults and add no player text in 2.5", because no session had measured the need | `docs/plans/v2.5/decisions-sheet.md:75`; waiting list `v2.5/00-overview.md:350, :378`; `v2.5/10-acceptance.md:249` |
| v2.6 rule 5, 2026-09-30 | **Judge uses default on** (user). This flipped `agencyCheck` on. Only `houseRules` stays off | `docs/plans/v2.6/00-overview.md:47`; `src/judge/settings.ts:70` |
| v2.6 plan 10 | D6/T22 are "rule-7 surface decisions … recorded for the user's review with the scores as evidence" | `docs/plans/v2.6/10-acceptance.md:80` |

So **T22's default has already flipped**, through the blanket rule 5 and not through a T22-specific decision. D6's
defaults have not changed.

### As built and measured

- **T15 / D6**, built in v2.4 plan 04: `evidence_from` validation, the screen reason "evidence only in the player's
  line", player lines marked in the prompt only when a `world` quality is in scope (otherwise byte-identical), the judge
  typed path follows the same rule, a storyDiff row, the `quality-outcome-player-evidence` info diagnostic, and the
  Studio select. Sources: `docs/plans/v2.4/04-extraction-input-quality.md:180-240`, §"T15 as built" (`:481`).
- **T22**, built in v2.4 plan 07, ran Phase A on a 51-case fixture (23 writes / 28 clean). Flag at raw Score `> 2.5`.
  Floors: writes recall ≥ 0.85, clean specificity ≥ 0.95. Result: **23/23 and 28/28, pass**. Live J8.10 (auto mode)
  PASS ×2: the note was carried into exactly the next loud prompt. Sources: `07-judge.md:1141, :1288, :1328`.
  Still open there: "the human over-steer rubric rows" and "an agency control arm in which the real model writes the
  player unprompted, since J8.10's only defect is scripted" (`07-judge.md:1433-1436`).
- **T22 English re-measure** (v2.6): 41/41 rows, writes 18/18, clean 23/23, on. Source:
  `docs/plans/v2.6/15-judge-remeasure.md:149`.

### What v2.6's sessions showed (Claude-played, not the user's)

- **`evidence_from: world` cost more than it saved.** The campaign data opts many qualities into `world`. Across
  T0–T2 that rule wrote 120 rejection rows (61 unique). About 70 % were the player moving their own party, and about
  25 % were no-op `false` on latching bools. **None was clearly the player asserting a world outcome**, which is the
  risk D6 guards against. Each landed 0–6 messages later when the narrator echoed it. Fix: a new `evidence_from:
  "party"` value, plus a first-person-move rule for `location`. Source: `docs/plans/v2.6/14-findings.md:352`, `:365`.
- **It stalled play.** T3 sessions stalled 6 turns on one checkpoint, and 3–4 turns on another, because the reader kept
  quoting the player's move line. Fix: one re-ask for a non-player quote (`reaskPlayerOnly`). Source:
  `14-findings.md:432`; `test/sessions/T3/SUMMARY.md:70, :148`.
- **Agency rows scored "works"** in T1 (`test/sessions/T1/SUMMARY.md:37, :158`) and T3 (`T3/SUMMARY.md:131`). T6:
  "Narrator deciding for the player: not seen" (`T6/SUMMARY.md:32`).
- **Near misses:**
  - T1: a narrator time-skip decided what the party did after the player went silent (`T1/SUMMARY.md:130`, MEDIUM).
  - T2: the narrator voiced other members (`T2/SUMMARY.md:51`, LOW). That one is not about the player.
- **Warden/agency notes were not reviewed.** Default accept mode is `review`, and player cards never opened the drawer
  (`T3/SUMMARY.md:187`). Under defaults, an agency note therefore reaches the prompt only if an author accepts it.
- **On the llama-logprob route,** warden + agencyCheck answered 0 of 30 calls under play load. That provider's rows were
  withdrawn (`T6/SUMMARY.md:84, :101`). The default route (TypeSafe) is unaffected.
- **How many agency notes the warden raised** across sessions: **not determined** (not counted in any summary).
- **The user's own sessions:** not played. v2.6 made them optional and later (`v2.6/00-overview.md:54`, W26).

## Why it was deferred

From v2.4 to v2.6 the rule was the same: no default flips and no new player-facing text without a player session (v2.4
rule 7, D6; v2.5 C6). Claude's sessions produced evidence on D6's *cost*. The user's own play is what the decision was
reserved for, and it has not happened.

## Current state in code

| Item | Where | Default |
|---|---|---|
| `Quality.evidence_from: any \| world \| party` | `src/engine/schema.ts:76, :91-94`; validation `src/engine/validate/qualities.ts:73-83` | absent = `any` |
| Screen + re-ask for player-only quotes | `src/extraction/sharedRead.ts` (`screenDeltas`, `reaskPlayerOnly`), `contract.ts` | on when a quality opts in |
| Diagnostic `quality-outcome-player-evidence` (info) | `src/studio/diagnostics.ts:46, :97` | fires on outcome qualities left `any` |
| `AgencyPolicy.player_attempts_only` + `PLAYER_ATTEMPTS_CLAUSE` | `src/engine/agency.ts:6-11, :38, :40-45`; guidance `src/pacing/guidance.ts:29`; validation `src/engine/validate/checkpoints.ts:152-154` | `false` |
| `never_narrate_player_action`, `protect_player_choice` clauses | `src/engine/agency.ts:6-11, :40-45` | `true` (v2.3 plan 07) |
| `judge.uses.agencyCheck` | `src/judge/settings.ts:20, :70, :233-237`; author-only `:285` | **on** (v2.6 rule 5) |
| Warden note delivery | `src/runtime/coordinators/stagecraftCoordinator.ts:361-448`; `wardenAcceptMode` | `review` (`src/runtime/settingsModel.ts:158`) |
| Refusal recovery (separate, detects a refused route) | `src/runtime/agencyRecovery.ts` | on |

## Options

Each is a separate default and can be chosen independently.

| Option | Design | Cost | Risk | Needs |
|---|---|---|---|---|
| **A. Keep every default; close the seed** | `evidence_from` absent = `any`; attempts clause off; `agencyCheck` on; warden `review` | 0 | a player line can still settle an outcome quality, though no session saw it happen; in player-only installs, agency notes wait for an author who never comes, so calls are spent with no effect | — |
| **B. Default `evidence_from` to `world`/`party` for outcome qualities gating an anchor** | absent → inferred `world` (or `party` for move-shaped keys) | S code, L behaviour | every existing story's gates change silently; v2.6 measured 120 rejection rows and multi-turn stalls with `world` opted in, and the re-ask is unmeasured live | v2.4 C4 says absent = defaults, so this needs a story-format note |
| **C. Turn the attempts clause on by default** | `player_attempts_only` default `true` | S | one more clause in every prompt; may over-steer toward failure; unmeasured | a session with it on/off |
| **D. Agency note to `auto`** | split the accept mode per warden family (agency `auto`, continuity `review`), or set the warden to `auto` | S–M (the mode is shared today, X22) | over-steer and OOC notes (Reddit's R9 complaint); unmeasured with real model-written player actions | the over-steer rubric rows (`07-judge.md:1433`) |
| **E. `agencyCheck` back off by default** | revert the rule-5 flip for this key only | S | loses the only agency measurement; nothing applies in `review` anyway | — |

## Recommendation

**A for D6 (keep `any`, keep the attempts clause off). For T22, keep `agencyCheck` on and play the user's session with
the warden in `auto` before choosing between D and E.**

- D6: v2.6's evidence points away from B. The guarded failure ("a declared outcome counts as done") was not seen once
  in 120 rejections, while the guard's cost was seen repeatedly.
- T22: under `review`, a player-only install pays for every call and gets nothing. Either the note reaches play (D) or
  the call should stop (E). Only a session with real, unprompted player-narration can tell which, and that was T22's
  own open item.

## Decisions for the user

1. D6: keep `evidence_from` absent = `any`? **Recommended: yes.**yes
2. D6: keep `player_attempts_only` default `false`? **Recommended: yes**, unless your session shows replies granting
   whatever you attempt. tes
3. T22: confirm `agencyCheck` stays on. It was flipped by rule 5, not by a T22 decision. **Recommended: yes, for now.** yes
4. T22: should agency notes reach a player who never opens author view? Options: D (`auto` for the agency family) or E
   (off). **Recommended: decide after one session played with the warden on `auto`.** lets take notes and reevaluate once we have some session then
5. Do you want to play that session yourself, or should Claude play it with a rubric for you to check (W26 style)?
   **Recommended: you play it.** The over-steer judgement is taste, and it is the reason this was reserved. i'll play it, but add a tesst case so that claude also plays it. 
6. Close the seed if 1–3 are "yes" and 4 is decided? **Recommended: yes.** defer

## Floor and measurement before building

What the user session must show. Predeclared, one player session of 40 turns or more on a story with outcome
qualities left at `any`, warden on `auto`:
- **D6 trigger for B or C:** at least 2 turns where a reply or extraction treated a player's declaration as a world
  outcome the player did not earn (e.g. "I find the key" counted as found). Fewer means keep A.
- **T22 for D (auto):** at least 1 reply narrating the player's action, decision or words, caught by the check. Notes
  rated "helpful or invisible" in at least 80 % of cases, and 0 notes that produced an OOC or over-corrected reply. Missing
  either floor means E or keep `review`.
- **Data to collect (no model):** count of agency notes raised and accepted per 100 turns across T0–T7 journals
  (`kind: "stagecraft"`, curator `warden`, agency family). This is not determined today.

## Gates (per repo CLAUDE.md tiers)

- A: none (docs only).
- D (per-family accept mode) or E (one default): runtime tier. `npm run gates`, jest on the warden coordinator (the agency
  note applied in `auto` while continuity waits in `review`), settings migration test, then live real-LLM `so-journey
  J8 --only J8.10 --judge-uses agencyCheck --warden-mode auto` ×2.
- B/C: runtime + extraction tier. `npm run gates`, the live suite re-run (cleaning changes evidence), the 22 fixtures'
  prompt byte-identity re-asserted or re-recorded, plus a storyDiff row for the default change.

## Links

04 story presence/plays index · 19 quests/game layer · 18 character life · 25 new game plus · 08 SP2 · 22 SP9 · 16 spike
defers · 20 J6d shadow record · 14 J7 judge ideas · 13 B10 CLI judge · 12 curator create op · 11 warden-lore one request
(same warden request) · 21 cue+scene read merge · 09 C4 option b (agency alternates are jumps) · 07 commitment double
negatives (player-line evidence) · **23 this** · 10 model choice · 06 thinking per story · 15 open-source Jev alternative
