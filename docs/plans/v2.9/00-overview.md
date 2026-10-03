# Implementation Overview — Story Orchestrator v2.9

**Status: DEFERRED (created 2026-10-03 at the v2.7 split).** v2.9 = everything the user deferred from the v2.7 plan set
on 2026-10-03, and the deferred remainders of plans that moved to v2.7 or v2.8. **Nothing here is scheduled until v2.8
closes.** No plan is approved or built. Old → new numbers: `docs/plans/v2.7/RENUMBER.md`. Review findings applied:
`docs/plans/v2.7/review-2026-10-03.md` (old numbers), per plan in each file's "Review 2026-10-03" section.

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

| # | Item | Source (old v2.7 → new home) | Why deferred | What would reopen it | Depends on |
|---|---|---|---|---|---|
| 01 | `01-sp1-swipe-back-cache.md` SP1 swipe-back cache | old 16c (child of the removed 16 index) → v2.9 01 | S4 (≥ 3 natural swipe-backs per 100 player turns) is the deciding bar and only hand play can score it; S3's control made 0 reads; ST cannot swipe a non-last message | S4 ≥ 3 in the user's own play (≥ 300 turns), or a swipe-back left wrong state, or ST allows non-last swipes. **Otherwise auto-drop at the v2.9 freeze** (recommended option (b); open for the user) | v2.8 01 (SP2 option A owns the mutation seam first); user's hand-played sessions |
| 02 | `02-sp9-witness-filter-v2.md` SP9 witness filter v2 | old 22 → v2.9 02 (its option A shipped as v2.7 02 C2; K1/K2 fix in v2.7) | no accurate witness source (presence 4/40); host channels (Summarize, Vector Storage) leak regardless; stance change would promise privacy the host does not keep | sessions show characters acting on scenes they missed (not only secrets), and the user makes message-level privacy a goal; then B (extraction witness, offline, W4 ≥ 0.9) before any filter (C) | v2.7 02 C2 + **K1 fixed**; v2.8 21's offline presence-proxy result |
| 03 | `03-new-game-plus.md` New game plus | old 25 → v2.9 03 | the epilogue it would consume has never run live (`seal` off, no final chapter reached); nobody asked for it | the Q-M floors pass and `seal` ships (or an author opts in) **and** one live run reaches a `final` chapter; then B (typed outcome carry into a declared sequel) | v2.8 01 Q-M ratings; v2.7 06 plays index; v2.7 06 Continue list (option E) |
| 04 | `04-d6-t22-revisits.md` D6/T22 revisits (decision only) | old 23 → v2.9 04; the over-steer charter card, its completion contract and the sessions → v2.8 01 | D6/T22 defaults were reserved for a player session that has not happened; 1–3 decided (keep), 4 and 6 wait | the v2.8 01 over-steer session(s) (Claude's card + the user's play) hand over their digest; floors already predeclared in the plan | v2.8 01 card + sessions |
| 05.1 | `05-deferred-items.md` layered 2D rig | old 28 option D → v2.8 07 talking-sprites (D → here) | heavy build, auto-rig robustness unknown, Spine licence; user parked it | the v2.8 07 playtest asks for real head motion B + P cannot give | v2.8 06 sprite generation, v2.8 07 |
| 05.2 | SP10 tool-call turns, the rest | old 16d option A → v2.7 15 (B + C there) | nobody plays story chats with CC function calling | CC + tools in story chats, or a session finding on multi-boundary tool turns | v2.7 15 (probe removed; recipe in the v2.5 report) |
| 05.3 | C4 report-only staging panel | old 09 option E → v2.7 11 (close) | no author session asked for it | an author session finds jump staging wrong and painful to fix | v2.7 04 check registry (lands as a finding with an action) |
| 05.4 | Runtime verbatim recall | old 29 B/P1/P5 → v2.8 21 (E0 + offline only) | in groups, recall needs a witness filter; unmeasured | E0 picks an arm (hit@4 ≥ 0.80), offline VR6 passes, and a reversible witness record exists | v2.8 21; v2.9 02 option B; v2.8 01 Q-M5 + P3 |
| 05.5 | "Not in v2.7" items inside v2.8 plans (persona-fit judge, per-chat avatars, same-Jev hosts A5) | v2.8 03 / 08 / 14 | written before the split; placement not confirmed | per item, see `05-deferred-items.md` §05.5 | parent v2.8 plan |

## Order if reopened

No build order is set. If several reopen at once, by dependency: 02 B before 05.4; 04 needs only v2.8 01's evidence
(decision, docs or a settings default); 01 and 03 are independent; 05.1 after v2.8 06/07.

## Status

| Plan | State |
|---|---|
| 01–04 | DEFERRED (user, 2026-10-03); user answers recorded inline; not scheduled before v2.8 closes |
| 05 | DEFERRED; entries recorded |

## Unresolved questions

- 01: park mechanism (a) dev counter vs (b) auto-drop at the v2.9 freeze? Recommended (b). And decision 2 (do you swipe
  back to earlier versions?): "rarely" drops it now.
- 05.5: are the three "not in v2.7" items inside v2.8 plans v2.8 scope or v2.9?
- Optional "Critic" role (v2.7 14 decision 4, "after the wizard work"): v2.8 09 or here?
